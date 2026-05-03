// SPORTVISE — Stripe Webhook Handler (TEST MODE)
// =================================================================
// v61.5 — Endpoint dédié au mode test Stripe pour la checklist E2E.
// Copie de stripe-webhook.js avec 3 modifs ciblées (RUNBOOK section 2) :
//   1) Lit STRIPE_SECRET_KEY_TEST + STRIPE_WEBHOOK_SECRET_TEST
//      (les vars _TEST sont configurées en parallèle des vars prod dans Netlify).
//   2) Allowlist email : refuse silencieusement (200) tout event dont l'email
//      ne commence pas par "test+" — filet de sécurité au cas où Stripe enverrait
//      par erreur un event prod sur cet endpoint.
//   3) Sentry tag component='stripe-webhook-test' pour distinguer dans le dashboard
//      Sentry des events serveur prod.
//
// Le webhook prod (stripe-webhook.js) reste STRICTEMENT INTOUCHÉ → zéro risque
// de régression sur la prod. Une fois la checklist 15/15 verte, ce fichier
// est SUPPRIMÉ (RUNBOOK section 4) et l'endpoint test désactivé côté Stripe.
// =================================================================

const crypto = require('crypto');
const https = require('https');
const { initSentry, captureError, captureMessage } = require('./_sentry');

// v61.5 — observability serveur, tagué 'stripe-webhook-test' pour isoler des events prod.
initSentry({ component: 'stripe-webhook-test', release: process.env.SPORTVISE_APP_V || 'v61.5' });

// Supabase config
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ckikyvokurpehavjlkbc.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
// v61.5 — Modif #1 : env vars TEST (vs STRIPE_WEBHOOK_SECRET / STRIPE_SECRET_KEY en prod)
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET_TEST;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY_TEST;

// ── ALLOWLIST EMAIL TEST (v61.5 modif #2) ───────────
// Filet de sécurité : refuse tout email qui ne commence pas par "test+".
// Si Stripe envoyait par erreur un event prod sur cet endpoint test, on
// renverrait 200 sans toucher la DB ni envoyer d'email — Stripe stoppera
// les retries et rien ne se passera côté user.
function isTestEmail(email) {
  return typeof email === 'string' && email.toLowerCase().startsWith('test+');
}

// ── HELPERS ─────────────────────────────────────────

function httpsRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, data: data }); }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function stripeApiGet(path) {
  return httpsRequest({
    hostname: 'api.stripe.com',
    path: path,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  }).then(r => r.data);
}

// ── PLAN DETECTION ──────────────────────────────────

async function getPlanFromSession(session) {
  // Try from amount_total first
  if (session.amount_total) {
    const amount = session.amount_total;
    if (amount === 1200) return 'plus';
    if (amount === 2900) return 'pro';
  }

  // Fallback: fetch line items from Stripe API
  try {
    const lineItems = await stripeApiGet(`/v1/checkout/sessions/${session.id}/line_items`);
    if (lineItems && lineItems.data) {
      for (const item of lineItems.data) {
        const unitAmount = item.price?.unit_amount;
        if (unitAmount === 1200) return 'plus';
        if (unitAmount === 2900) return 'pro';

        const productName = item.description || '';
        if (productName.toLowerCase().includes('plus')) return 'plus';
        if (productName.toLowerCase().includes('pro')) return 'pro';
      }
    }
  } catch (e) {
    console.error('Error fetching line items:', e);
  }

  return 'pro'; // default fallback
}

// ── STRIPE SIGNATURE VERIFICATION ───────────────────

function verifySignature(payload, sigHeader) {
  const parts = sigHeader.split(',').reduce((acc, part) => {
    const [key, value] = part.split('=');
    acc[key] = value;
    return acc;
  }, {});

  const timestamp = parts['t'];
  const signature = parts['v1'];

  const signedPayload = `${timestamp}.${payload}`;
  const expectedSignature = crypto
    .createHmac('sha256', STRIPE_WEBHOOK_SECRET)
    .update(signedPayload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// ── FIND USER ID BY EMAIL ───────────────────────────
// Strategy 1: Look in profiles table (if email column exists)
// Strategy 2: Use Supabase Auth Admin API to find user by email

// v61.4 — Récupère la langue préférée de l'user depuis profiles.lang.
// Utilisé pour les events Stripe portal (subscription.updated/deleted, invoice.payment_failed)
// qui n'ont pas de channel client_reference_id. Avant : fallback hardcoded 'fr'.
// Maintenant : email → user_id → profiles.lang. Fallback 'fr' si introuvable ou erreur DB.
async function getUserLangByEmail(email) {
  const userId = await findUserIdByEmail(email);
  if (!userId) return 'fr';
  const supabaseHostName = SUPABASE_URL.replace('https://', '');
  try {
    const res = await httpsRequest({
      hostname: supabaseHostName,
      path: `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=lang`,
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    if (res.status === 200 && Array.isArray(res.data) && res.data.length > 0) {
      const lang = String(res.data[0]?.lang || 'fr').toLowerCase();
      return ['fr','de','en','it'].includes(lang) ? lang : 'fr';
    }
  } catch (e) {
    console.warn('[STRIPE-WEBHOOK-TEST] getUserLangByEmail error:', e.message);
  }
  return 'fr';
}

async function findUserIdByEmail(email) {
  const supabaseHost = SUPABASE_URL.replace('https://', '');

  // Strategy 1: Check profiles table for email
  try {
    const profileRes = await httpsRequest({
      hostname: supabaseHost,
      path: `/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id`,
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (profileRes.status === 200 && Array.isArray(profileRes.data) && profileRes.data.length > 0) {
      console.log(`✅ Found user by profiles.email: ${profileRes.data[0].id}`);
      return profileRes.data[0].id;
    }
  } catch (e) {
    console.log('⚠️ profiles email lookup failed:', e.message);
  }

  // Strategy 2: Use Auth Admin API
  try {
    const authRes = await httpsRequest({
      hostname: supabaseHost,
      path: `/auth/v1/admin/users?page=1&per_page=50`,
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      }
    });

    if (authRes.status === 200 && authRes.data?.users) {
      const user = authRes.data.users.find(u => u.email === email);
      if (user) {
        console.log(`✅ Found user by auth admin API: ${user.id}`);
        return user.id;
      }
    }
  } catch (e) {
    console.log('⚠️ Auth admin lookup failed:', e.message);
  }

  return null;
}

// ── UPDATE USER PLAN ────────────────────────────────

async function updateUserPlan(email, plan) {
  const userId = await findUserIdByEmail(email);

  if (!userId) {
    console.error(`❌ No user found for email: ${email}`);
    throw new Error(`User not found for email: ${email}`);
  }

  const supabaseHost = SUPABASE_URL.replace('https://', '');
  const body = JSON.stringify({ plan: plan });

  const response = await httpsRequest({
    hostname: supabaseHost,
    path: `/rest/v1/profiles?id=eq.${userId}`,
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      'Content-Length': Buffer.byteLength(body)
    }
  }, body);

  if (response.status >= 300) {
    throw new Error(`Supabase update failed: ${response.status} ${JSON.stringify(response.data)}`);
  }

  // Verify the update worked
  if (Array.isArray(response.data) && response.data.length > 0) {
    console.log(`✅ Updated plan for ${email} (${userId}) → ${plan}`);
  } else {
    console.log(`⚠️ PATCH returned OK but no rows updated for ${email} (${userId})`);
  }

  return true;
}

// ── SEND PLAN CHANGE EMAIL (i18n FR/DE/EN/IT, v49) ──
//
// Pattern: same architecture as send-welcome.js (v46). EMAIL_TEMPLATES per
// language holds all strings, renderPlanChangeHtml() is the single template
// renderer. Lang is resolved from session.client_reference_id ('lang_de',
// 'lang_en', etc.) on checkout.session.completed; fallback to 'fr' otherwise
// (e.g. cancellation events from the Stripe billing portal where we have no
// client_reference_id channel — acceptable since the user is leaving the
// platform anyway).

const RESEND_API_KEY = process.env.RESEND_API_KEY;

// Plan metadata is brand-level / language-agnostic.
const PLAN_NAMES  = { free: 'Free', plus: 'Plus', pro: 'Pro' };
const PLAN_COLORS = { free: '#10b981', plus: '#06b6d4', pro: '#f59e0b' };

// Per-language templates. Registre formel : DE = Sie/Ihr, IT = Lei/Suo,
// EN = neutre, FR inchangé (cohérent avec send-welcome.js).
const EMAIL_TEMPLATES = {
  fr: {
    htmlLang: 'fr',
    tagline: 'Management Sportif IA · Suisse 🇨🇭',
    subjectUpgrade: (planName) => `SPORTVISE — Bienvenue sur le plan ${planName} ! 🎉`,
    subjectDowngrade: 'SPORTVISE — Votre abonnement a été résilié',
    titleUpgrade: (planName) => `Plan ${planName} activé !`,
    titleDowngrade: 'Abonnement résilié',
    introUpgrade: 'Votre plan a été mis à jour avec succès !',
    downgradeBody1: `Votre abonnement a été résilié. Vous êtes désormais sur le plan <strong style="color:#10b981">Free</strong>. Vous gardez l'accès à 3 agents IA (Lucas, Emma, Clara) avec 10 messages par jour.`,
    downgradeBody2: 'Vous pouvez passer à un plan supérieur à tout moment depuis votre dashboard.',
    planLabel: (planName, price) => `Plan ${planName} — ${price}`,
    planSubLabel: (agents) => `${agents} · Messages illimités`,
    planPrices: { free: 'CHF 0', plus: 'CHF 12/mois', pro: 'CHF 29/mois' },
    planAgents: { free: '3 agents IA', plus: '6 agents performance', pro: '11 agents IA (complet)' },
    ctaButton: 'Accéder à mon dashboard →',
    footerCountry: 'Suisse',
    footerQuestions: 'Des questions ?',
    // v61.2 — payment failed
    subjectFailed: 'SPORTVISE — Échec du paiement de votre abonnement',
    titleFailed: 'Paiement en échec',
    introFailed1: 'La dernière tentative de paiement de votre abonnement SPORTVISE a échoué.',
    introFailed2: 'Cela peut être dû à une carte expirée, des fonds insuffisants, ou une opposition bancaire.',
    ctaFailed: 'Mettre à jour ma carte →',
    helpFailed: 'Stripe va automatiquement réessayer dans les prochains jours. Si aucune mise à jour n\'est faite, votre plan reviendra automatiquement à Free dans environ 2 semaines. Vous gardez tout votre historique.'
  },

  de: {
    htmlLang: 'de',
    tagline: 'KI-Sportmanagement · Schweiz 🇨🇭',
    subjectUpgrade: (planName) => `SPORTVISE — Willkommen im ${planName}-Plan! 🎉`,
    subjectDowngrade: 'SPORTVISE — Ihr Abonnement wurde gekündigt',
    titleUpgrade: (planName) => `${planName}-Plan aktiviert!`,
    titleDowngrade: 'Abonnement gekündigt',
    introUpgrade: 'Ihr Plan wurde erfolgreich aktualisiert!',
    downgradeBody1: `Ihr Abonnement wurde gekündigt. Sie befinden sich nun im <strong style="color:#10b981">Free</strong>-Plan. Sie behalten Zugriff auf 3 KI-Agenten (Lucas, Emma, Clara) mit 10 Nachrichten pro Tag.`,
    downgradeBody2: 'Sie können jederzeit über Ihr Dashboard zu einem höheren Plan wechseln.',
    planLabel: (planName, price) => `${planName}-Plan — ${price}`,
    planSubLabel: (agents) => `${agents} · Unbegrenzte Nachrichten`,
    planPrices: { free: 'CHF 0', plus: 'CHF 12/Monat', pro: 'CHF 29/Monat' },
    planAgents: { free: '3 KI-Agenten', plus: '6 Performance-Agenten', pro: '11 KI-Agenten (komplett)' },
    ctaButton: 'Zum Dashboard →',
    footerCountry: 'Schweiz',
    footerQuestions: 'Fragen?',
    // v61.2 — payment failed
    subjectFailed: 'SPORTVISE — Zahlung Ihres Abonnements fehlgeschlagen',
    titleFailed: 'Zahlung fehlgeschlagen',
    introFailed1: 'Der letzte Zahlungsversuch für Ihr SPORTVISE-Abonnement ist fehlgeschlagen.',
    introFailed2: 'Mögliche Gründe: abgelaufene Karte, unzureichende Mittel oder eine Bankrückbuchung.',
    ctaFailed: 'Karte aktualisieren →',
    helpFailed: 'Stripe wird in den nächsten Tagen automatisch erneut versuchen. Erfolgt keine Aktualisierung, wird Ihr Plan in etwa 2 Wochen automatisch auf Free zurückgesetzt. Ihr Verlauf bleibt erhalten.'
  },

  en: {
    htmlLang: 'en',
    tagline: 'AI Sports Management · Switzerland 🇨🇭',
    subjectUpgrade: (planName) => `SPORTVISE — Welcome to the ${planName} plan! 🎉`,
    subjectDowngrade: 'SPORTVISE — Your subscription has been cancelled',
    titleUpgrade: (planName) => `${planName} plan activated!`,
    titleDowngrade: 'Subscription cancelled',
    introUpgrade: 'Your plan has been updated successfully!',
    downgradeBody1: `Your subscription has been cancelled. You are now on the <strong style="color:#10b981">Free</strong> plan. You keep access to 3 AI agents (Lucas, Emma, Clara) with 10 messages per day.`,
    downgradeBody2: 'You can upgrade to a higher plan anytime from your dashboard.',
    planLabel: (planName, price) => `${planName} plan — ${price}`,
    planSubLabel: (agents) => `${agents} · Unlimited messages`,
    planPrices: { free: 'CHF 0', plus: 'CHF 12/month', pro: 'CHF 29/month' },
    planAgents: { free: '3 AI agents', plus: '6 performance agents', pro: '11 AI agents (complete)' },
    ctaButton: 'Go to my dashboard →',
    footerCountry: 'Switzerland',
    footerQuestions: 'Questions?',
    // v61.2 — payment failed
    subjectFailed: 'SPORTVISE — Subscription payment failed',
    titleFailed: 'Payment failed',
    introFailed1: 'The latest payment attempt for your SPORTVISE subscription failed.',
    introFailed2: 'This may be due to an expired card, insufficient funds, or a bank objection.',
    ctaFailed: 'Update my card →',
    helpFailed: 'Stripe will automatically retry in the next few days. If no update is made, your plan will automatically revert to Free in about 2 weeks. You keep your entire history.'
  },

  it: {
    htmlLang: 'it',
    tagline: 'Gestione Sportiva IA · Svizzera 🇨🇭',
    subjectUpgrade: (planName) => `SPORTVISE — Benvenuto nel piano ${planName}! 🎉`,
    subjectDowngrade: 'SPORTVISE — Il Suo abbonamento è stato annullato',
    titleUpgrade: (planName) => `Piano ${planName} attivato!`,
    titleDowngrade: 'Abbonamento annullato',
    introUpgrade: 'Il Suo piano è stato aggiornato con successo!',
    downgradeBody1: `Il Suo abbonamento è stato annullato. Si trova ora nel piano <strong style="color:#10b981">Free</strong>. Mantiene l'accesso a 3 agenti IA (Lucas, Emma, Clara) con 10 messaggi al giorno.`,
    downgradeBody2: 'Può passare a un piano superiore in qualsiasi momento dalla Sua dashboard.',
    planLabel: (planName, price) => `Piano ${planName} — ${price}`,
    planSubLabel: (agents) => `${agents} · Messaggi illimitati`,
    planPrices: { free: 'CHF 0', plus: 'CHF 12/mese', pro: 'CHF 29/mese' },
    planAgents: { free: '3 agenti IA', plus: '6 agenti performance', pro: '11 agenti IA (completo)' },
    ctaButton: 'Vai alla mia dashboard →',
    footerCountry: 'Svizzera',
    footerQuestions: 'Domande?',
    // v61.2 — payment failed
    subjectFailed: 'SPORTVISE — Pagamento dell\'abbonamento fallito',
    titleFailed: 'Pagamento fallito',
    introFailed1: 'L\'ultimo tentativo di pagamento del Suo abbonamento SPORTVISE è fallito.',
    introFailed2: 'Possibili cause: carta scaduta, fondi insufficienti o un\'opposizione bancaria.',
    ctaFailed: 'Aggiornare la carta →',
    helpFailed: 'Stripe riproverà automaticamente nei prossimi giorni. Se non viene effettuato alcun aggiornamento, il Suo piano tornerà automaticamente a Free in circa 2 settimane. Il Suo storico viene preservato.'
  }
};

// Parse the lang from session.client_reference_id (we send 'lang_de' from
// dashboard.html upgrade buttons). Tolerant: accepts 'lang_de', 'lang_de_…'
// or null/undefined. Returns one of fr/de/en/it, fallback 'fr'.
function parseLang(clientReferenceId) {
  if (!clientReferenceId || typeof clientReferenceId !== 'string') return 'fr';
  const match = clientReferenceId.match(/^lang_(fr|de|en|it)(?:_|$)/i);
  return match ? match[1].toLowerCase() : 'fr';
}

// Single HTML template — only strings change per language, structure stays.
function renderPlanChangeHtml(t, newPlan, isDowngrade) {
  const planName = PLAN_NAMES[newPlan] || newPlan;
  const color = PLAN_COLORS[newPlan] || '#f59e0b';
  const price = t.planPrices[newPlan] || '';
  const agents = t.planAgents[newPlan] || '';
  const ctaTextColor = newPlan === 'pro' ? '#07091a' : '#fff';

  return `<!DOCTYPE html>
<html lang="${t.htmlLang}">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f5f7fb;font-family:'Segoe UI',Arial,sans-serif">
  <div style="max-width:580px;margin:0 auto;padding:32px 20px">
    <div style="text-align:center;margin-bottom:32px">
      <div style="font-size:28px;font-weight:900;letter-spacing:3px;background:linear-gradient(135deg,#f59e0b,#fbbf24);-webkit-background-clip:text;-webkit-text-fill-color:transparent;display:inline-block">SPORTVISE</div>
      <div style="color:#64748b;font-size:12px;margin-top:4px">${t.tagline}</div>
    </div>
    <div style="background:#0d1127;border:1px solid #1e2d47;border-radius:16px;padding:36px;margin-bottom:24px">
      <div style="font-size:32px;margin-bottom:16px">${isDowngrade ? '👋' : '🎉'}</div>
      <h1 style="color:#f1f5f9;font-size:22px;font-weight:800;margin:0 0 12px">
        ${isDowngrade ? t.titleDowngrade : t.titleUpgrade(planName)}
      </h1>
      ${isDowngrade ? `
      <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 20px">
        ${t.downgradeBody1}
      </p>
      <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 20px">
        ${t.downgradeBody2}
      </p>` : `
      <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 20px">
        ${t.introUpgrade}
      </p>
      <div style="background:${color}15;border:1px solid ${color}30;border-radius:12px;padding:18px;margin-bottom:20px">
        <div style="color:${color};font-size:16px;font-weight:800;margin-bottom:6px">${t.planLabel(planName, price)}</div>
        <div style="color:#94a3b8;font-size:13px">${t.planSubLabel(agents)}</div>
      </div>`}
      <div style="text-align:center;margin-top:24px">
        <a href="https://sportvise.ch/app/dashboard.html" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,${color},${color}cc);color:${ctaTextColor};font-size:15px;font-weight:800;text-decoration:none;border-radius:10px">
          ${t.ctaButton}
        </a>
      </div>
    </div>
    <div style="text-align:center;color:#475569;font-size:11px;line-height:1.7">
      <div>© 2026 SPORTVISE · ${t.footerCountry} 🇨🇭</div>
      <div>${t.footerQuestions} <a href="mailto:info@sportvise.ch" style="color:#f59e0b;text-decoration:none">info@sportvise.ch</a></div>
    </div>
  </div>
</body>
</html>`;
}

async function sendPlanChangeEmail(email, newPlan, previousPlan, lang) {
  if (!RESEND_API_KEY) {
    console.log('⚠️ RESEND_API_KEY not set, skipping email');
    return;
  }

  // Pick template — fallback to FR for unknown / missing lang
  const t = EMAIL_TEMPLATES[lang] || EMAIL_TEMPLATES.fr;
  const planName = PLAN_NAMES[newPlan] || newPlan;
  const isDowngrade = (newPlan === 'free');
  const subject = isDowngrade ? t.subjectDowngrade : t.subjectUpgrade(planName);
  const html = renderPlanChangeHtml(t, newPlan, isDowngrade);

  try {
    const emailBody = JSON.stringify({
      from: 'SPORTVISE <info@sportvise.ch>',
      to: [email],
      subject: subject,
      html: html
    });

    const res = await httpsRequest({
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Length': Buffer.byteLength(emailBody)
      }
    }, emailBody);

    if (res.status < 300) {
      console.log(`[STRIPE-WEBHOOK-TEST] sent lang=${t.htmlLang} to=${email} plan=${newPlan} (was=${previousPlan})`);
    } else {
      console.error(`⚠️ Email send failed: ${res.status} lang=${t.htmlLang}`, res.data);
    }
  } catch (e) {
    console.error('⚠️ Email send error:', e.message);
  }
}

// ── PAYMENT FAILED EMAIL (v61.2) ────────────────────
// Envoyé sur invoice.payment_failed (CB expirée, fonds insuffisants, opposition).
// Stripe retry 3-4 fois sur ~2 semaines puis envoie subscription.deleted (déjà géré).
// Cet email donne au user une chance de mettre à jour sa carte AVANT le downgrade auto.
// Couleur rouge/orange pour signaler urgence sans alarmer.

function renderPaymentFailedHtml(t) {
  return `<!DOCTYPE html>
<html lang="${t.htmlLang}">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f5f7fb;font-family:'Segoe UI',Arial,sans-serif">
  <div style="max-width:580px;margin:0 auto;padding:32px 20px">
    <div style="text-align:center;margin-bottom:32px">
      <div style="font-size:28px;font-weight:900;letter-spacing:3px;background:linear-gradient(135deg,#f59e0b,#fbbf24);-webkit-background-clip:text;-webkit-text-fill-color:transparent;display:inline-block">SPORTVISE</div>
      <div style="color:#64748b;font-size:12px;margin-top:4px">${t.tagline}</div>
    </div>
    <div style="background:#0d1127;border:1px solid #1e2d47;border-radius:16px;padding:36px;margin-bottom:24px">
      <div style="font-size:32px;margin-bottom:16px">⚠️</div>
      <h1 style="color:#f1f5f9;font-size:22px;font-weight:800;margin:0 0 12px">${t.titleFailed}</h1>
      <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 12px">${t.introFailed1}</p>
      <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 20px">${t.introFailed2}</p>
      <div style="text-align:center;margin-top:24px">
        <a href="https://sportvise.ch/app/dashboard.html#abonnement" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;font-size:15px;font-weight:800;text-decoration:none;border-radius:10px">
          ${t.ctaFailed}
        </a>
      </div>
      <div style="background:#f59e0b10;border:1px solid #f59e0b30;border-radius:10px;padding:14px 16px;margin-top:24px">
        <p style="color:#f59e0b;font-size:12px;line-height:1.6;margin:0">${t.helpFailed}</p>
      </div>
    </div>
    <div style="text-align:center;color:#475569;font-size:11px;line-height:1.7">
      <div>© 2026 SPORTVISE · ${t.footerCountry} 🇨🇭</div>
      <div>${t.footerQuestions} <a href="mailto:info@sportvise.ch" style="color:#f59e0b;text-decoration:none">info@sportvise.ch</a></div>
    </div>
  </div>
</body>
</html>`;
}

async function sendPaymentFailedEmail(email, lang) {
  if (!RESEND_API_KEY) {
    console.log('⚠️ RESEND_API_KEY not set, skipping payment_failed email');
    return;
  }
  const t = EMAIL_TEMPLATES[lang] || EMAIL_TEMPLATES.fr;
  try {
    const emailBody = JSON.stringify({
      from: 'SPORTVISE <info@sportvise.ch>',
      to: [email],
      subject: t.subjectFailed,
      html: renderPaymentFailedHtml(t)
    });
    const res = await httpsRequest({
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Length': Buffer.byteLength(emailBody)
      }
    }, emailBody);
    if (res.status < 300) {
      console.log(`[STRIPE-WEBHOOK-TEST] payment_failed email sent lang=${t.htmlLang} to=${email}`);
    } else {
      console.error(`⚠️ Payment_failed email send failed: ${res.status} lang=${t.htmlLang}`, res.data);
    }
  } catch (e) {
    console.error('⚠️ Payment_failed email send error:', e.message);
  }
}

// ── CONFIRM REFERRAL ────────────────────────────────
// When a user subscribes to a paid plan, check if they were referred
// If so, update the referral status to 'confirmed'

async function confirmReferral(email) {
  const supabaseHost = SUPABASE_URL.replace('https://', '');

  try {
    // Find pending referral for this email
    const refRes = await httpsRequest({
      hostname: supabaseHost,
      path: `/rest/v1/referrals?referred_email=eq.${encodeURIComponent(email)}&status=eq.pending&select=id,referrer_id`,
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (refRes.status === 200 && Array.isArray(refRes.data) && refRes.data.length > 0) {
      const referral = refRes.data[0];

      // Update referral status to confirmed
      const updateBody = JSON.stringify({ status: 'confirmed', confirmed_at: new Date().toISOString() });
      await httpsRequest({
        hostname: supabaseHost,
        path: `/rest/v1/referrals?id=eq.${referral.id}`,
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(updateBody)
        }
      }, updateBody);

      console.log(`🎁 Referral confirmed for ${email} (referrer: ${referral.referrer_id})`);
      return referral.referrer_id;
    }
  } catch (e) {
    console.log('⚠️ Referral confirmation error:', e.message);
  }
  return null;
}

// ── MAIN HANDLER ────────────────────────────────────

exports.handler = async (event) => {
  // Only accept POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  // Check env vars
  if (!SUPABASE_SERVICE_KEY || !STRIPE_WEBHOOK_SECRET) {
    console.error('❌ Missing environment variables (TEST mode requires STRIPE_WEBHOOK_SECRET_TEST + STRIPE_SECRET_KEY_TEST)');
    return { statusCode: 500, body: 'Server configuration error' };
  }

  // Verify webhook signature
  const sigHeader = event.headers['stripe-signature'];
  if (!sigHeader) {
    return { statusCode: 400, body: 'Missing stripe-signature header' };
  }

  try {
    const isValid = verifySignature(event.body, sigHeader);
    if (!isValid) {
      console.error('❌ Invalid Stripe signature');
      return { statusCode: 400, body: 'Invalid signature' };
    }
  } catch (err) {
    console.error('❌ Signature verification error:', err);
    return { statusCode: 400, body: 'Signature verification failed' };
  }

  // Parse the event
  const stripeEvent = JSON.parse(event.body);
  console.log(`📨 [STRIPE-WEBHOOK-TEST] Stripe event: ${stripeEvent.type}`);

  // v61.1 — Idempotence : si Stripe redelivere un event qu'on a déjà traité (timeout
  // de notre 200, ou retry après 5xx transient), on évite de re-traiter (sinon double
  // email "Plan Plus activé" + double confirmReferral). On INSERT dans processed_stripe_events
  // avec Prefer:resolution=ignore-duplicates,return=representation. Si la row existe déjà
  // (PK conflict sur event_id), PostgREST retourne body=[] (array vide). Sinon body=[{...}].
  try {
    const supabaseHostName = SUPABASE_URL.replace('https://', '');
    const idempotencyRes = await httpsRequest({
      hostname: supabaseHostName,
      path: '/rest/v1/processed_stripe_events',
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=ignore-duplicates,return=representation'
      }
    }, JSON.stringify({ event_id: stripeEvent.id, event_type: stripeEvent.type }));

    const wasNew = Array.isArray(idempotencyRes.data) && idempotencyRes.data.length > 0;
    if (!wasNew && idempotencyRes.status < 300) {
      // Already processed — return 200 sans re-traiter (Stripe stoppera les retries).
      console.log(`[STRIPE-WEBHOOK-TEST] event ${stripeEvent.id} (${stripeEvent.type}) already processed, skipping`);
      return { statusCode: 200, body: JSON.stringify({ received: true, idempotent: true }) };
    }
    if (idempotencyRes.status >= 300) {
      // L'idempotency check a foiré (DB transient ?). Fail-open : on laisse passer
      // pour ne pas bloquer le webhook. Sentry capture pour qu'on remarque si fréquent.
      console.warn(`[STRIPE-WEBHOOK-TEST] idempotency insert failed status=${idempotencyRes.status} — proceeding (fail-open)`);
      captureError(new Error(`Idempotency insert failed: ${idempotencyRes.status} ${JSON.stringify(idempotencyRes.data)}`), {
        context: { event_id: stripeEvent.id, event_type: stripeEvent.type, status: idempotencyRes.status },
        level: 'warning'
      });
    }
  } catch (idempErr) {
    // Network/parse error sur l'idempotency check. Fail-open + log Sentry.
    console.warn('[STRIPE-WEBHOOK-TEST] idempotency check error:', idempErr.message, '— proceeding (fail-open)');
    captureError(idempErr, { context: { event_id: stripeEvent.id, event_type: stripeEvent.type, phase: 'idempotency_check' }, level: 'warning' });
  }

  try {
    switch (stripeEvent.type) {

      // New subscription via Payment Link
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object;
        const customerEmail = session.customer_details?.email || session.customer_email;

        if (!customerEmail) {
          console.error('❌ No customer email in checkout session');
          break;
        }

        // v61.5 — Modif #2 : allowlist email. Refuse silencieusement (200) si non-test.
        if (!isTestEmail(customerEmail)) {
          console.warn(`[STRIPE-WEBHOOK-TEST] Refused non-test email: ${customerEmail}`);
          return { statusCode: 200, body: JSON.stringify({ received: true, ignored: 'non-test email' }) };
        }

        // Lang is passed via Payment Link URL param ?client_reference_id=lang_xx
        // Set in dashboard.html upgrade buttons (v49). Fallback to 'fr'.
        const lang = parseLang(session.client_reference_id);
        const plan = await getPlanFromSession(session);
        await updateUserPlan(customerEmail, plan);
        await sendPlanChangeEmail(customerEmail, plan, 'free', lang);

        // Confirm referral if this user was referred
        const referrerId = await confirmReferral(customerEmail);
        if (referrerId) {
          console.log(`🎁 Referral bonus: referrer ${referrerId} earned 1 month for referring ${customerEmail}`);
        }

        console.log(`✅ [STRIPE-WEBHOOK-TEST] Checkout completed: ${customerEmail} → ${plan} (lang=${lang})`);
        break;
      }

      // Subscription updated (upgrade/downgrade)
      case 'customer.subscription.updated': {
        const subscription = stripeEvent.data.object;

        const customer = await stripeApiGet(`/v1/customers/${subscription.customer}`);
        const email = customer?.email;

        if (!email) {
          console.error('❌ No email for customer:', subscription.customer);
          break;
        }

        // v61.5 — Modif #2 : allowlist email.
        if (!isTestEmail(email)) {
          console.warn(`[STRIPE-WEBHOOK-TEST] Refused non-test email: ${email}`);
          return { statusCode: 200, body: JSON.stringify({ received: true, ignored: 'non-test email' }) };
        }

        if (subscription.status === 'active') {
          const priceAmount = subscription.items?.data?.[0]?.price?.unit_amount;
          let plan = 'free';
          if (priceAmount === 1200) plan = 'plus';
          else if (priceAmount === 2900) plan = 'pro';

          // v61.4 — Lookup profiles.lang pour envoyer l'email dans la bonne langue
          // (avant : fallback 'fr' hardcoded sur tous les events portail).
          const lang = await getUserLangByEmail(email);
          await updateUserPlan(email, plan);
          await sendPlanChangeEmail(email, plan, 'unknown', lang);
          console.log(`✅ [STRIPE-WEBHOOK-TEST] Subscription updated: ${email} → ${plan} (lang=${lang})`);
        } else if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
          const lang = await getUserLangByEmail(email);
          await updateUserPlan(email, 'free');
          await sendPlanChangeEmail(email, 'free', 'unknown', lang);
          console.log(`✅ [STRIPE-WEBHOOK-TEST] Subscription ended: ${email} → free (lang=${lang})`);
        }
        break;
      }

      // v61.2 — Payment failed (CB expirée, fonds insuffisants, opposition).
      // Stripe va retry 3-4 fois sur ~2 semaines puis envoie subscription.deleted.
      // On envoie un email d'alerte mais on NE downgrade PAS le plan (laisse le retry agir).
      case 'invoice.payment_failed': {
        const invoice = stripeEvent.data.object;
        // L'invoice a customer_email pour les factures one-shot, ou il faut fetch le customer
        let email = invoice.customer_email;
        if (!email && invoice.customer) {
          const customer = await stripeApiGet(`/v1/customers/${invoice.customer}`);
          email = customer?.email;
        }
        if (!email) {
          console.error('❌ No email for invoice.payment_failed:', invoice.id);
          break;
        }

        // v61.5 — Modif #2 : allowlist email.
        if (!isTestEmail(email)) {
          console.warn(`[STRIPE-WEBHOOK-TEST] Refused non-test email: ${email}`);
          return { statusCode: 200, body: JSON.stringify({ received: true, ignored: 'non-test email' }) };
        }

        // v61.4 — Lookup profiles.lang pour envoyer l'email d'alerte dans la bonne langue
        const lang = await getUserLangByEmail(email);
        await sendPaymentFailedEmail(email, lang);
        // Sentry warning pour tracker la fréquence des échecs en prod
        captureMessage(`payment_failed for ${email}`, {
          context: { invoice_id: invoice.id, customer_id: invoice.customer, attempt_count: invoice.attempt_count, amount_due: invoice.amount_due },
          level: 'warning'
        });
        console.log(`⚠️ [STRIPE-WEBHOOK-TEST] Payment failed: ${email} invoice=${invoice.id} attempt=${invoice.attempt_count}`);
        break;
      }

      // Subscription cancelled
      case 'customer.subscription.deleted': {
        const subscription = stripeEvent.data.object;

        const customer = await stripeApiGet(`/v1/customers/${subscription.customer}`);
        const email = customer?.email;

        if (email) {
          // v61.5 — Modif #2 : allowlist email.
          if (!isTestEmail(email)) {
            console.warn(`[STRIPE-WEBHOOK-TEST] Refused non-test email: ${email}`);
            return { statusCode: 200, body: JSON.stringify({ received: true, ignored: 'non-test email' }) };
          }

          // v61.4 — Lookup profiles.lang pour l'email de fin d'abonnement
          const lang = await getUserLangByEmail(email);
          await updateUserPlan(email, 'free');
          await sendPlanChangeEmail(email, 'free', 'unknown', lang);
          console.log(`✅ [STRIPE-WEBHOOK-TEST] Subscription deleted: ${email} → free (lang=${lang})`);
        }
        break;
      }

      default:
        console.log(`ℹ️ [STRIPE-WEBHOOK-TEST] Unhandled event type: ${stripeEvent.type}`);
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };

  } catch (err) {
    console.error('❌ [STRIPE-WEBHOOK-TEST] Webhook handler error:', err);
    captureError(err, { context: { event_type: stripeEvent?.type, event_id: stripeEvent?.id }, level: 'error' });
    return { statusCode: 500, body: `Webhook error: ${err.message}` };
  }
};
