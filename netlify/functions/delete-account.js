// SPORTVISE — Netlify Function : Suppression de compte (right to be forgotten)
// v54 — LPD CH (art. 32) + RGPD UE (art. 17)
//
// Flow :
//   1. Vérifier le JWT user via Supabase Auth (GET /auth/v1/user)
//   2. Récupérer stripe_subscription_id depuis profiles (si abonnement actif)
//   3. Annuler la subscription Stripe (non-bloquant si erreur)
//   4. Cascade DELETE atomique via RPC delete_user_data() (Postgres function)
//   5. Supprimer le compte auth.users via Admin API
//   6. Envoyer email de confirmation via Resend (non-bloquant si erreur)
//
// Env vars requises :
//   SUPABASE_SERVICE_KEY (already in use elsewhere in this repo — see admin-stats.js, stripe-webhook.js, etc.)
//   STRIPE_SECRET_KEY, RESEND_API_KEY
//   SUPABASE_URL is optional (fallback to public project URL like other functions in this repo).
//
// Le SUPABASE_SERVICE_KEY ne DOIT JAMAIS être exposé côté client.

const https = require('https');
const { initSentry, captureError } = require('./_sentry');

// v61.3 — observability serveur. No-op gracieux si SENTRY_DSN_SERVER absent.
initSentry({ component: 'delete-account', release: process.env.SPORTVISE_APP_V || 'v62.5' });

// Fallback URL is the public Supabase project URL (already exposed in dashboard.html / login.html / admin.html).
// Aligns with the convention in admin-stats.js / sports-data.js / stripe-webhook.js.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ckikyvokurpehavjlkbc.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// ---------------------------------------------------------------------------
// HTTP helper (small, no SDK dependency)
// ---------------------------------------------------------------------------
function httpRequest({ hostname, path, method, headers, body }) {
  return new Promise((resolve, reject) => {
    const opts = { hostname, path, method, headers: { ...headers } };
    if (body && !opts.headers['Content-Length']) {
      opts.headers['Content-Length'] = Buffer.byteLength(body);
    }
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed = data;
        try { parsed = data ? JSON.parse(data) : null; } catch (_) { /* keep raw */ }
        resolve({ status: res.statusCode, data: parsed, raw: data });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function supabaseHost() {
  // SUPABASE_URL is like "https://xyz.supabase.co"
  return SUPABASE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

// ---------------------------------------------------------------------------
// Email templates (4 langues, registre formel — Sie/Lei pour DE/IT)
// ---------------------------------------------------------------------------
const EMAIL_SUBJECTS = {
  fr: 'Votre compte SPORTVISE a été supprimé',
  de: 'Ihr SPORTVISE-Konto wurde gelöscht',
  en: 'Your SPORTVISE account has been deleted',
  it: 'Il Suo account SPORTVISE è stato eliminato',
};

const EMAIL_BODIES = {
  fr: `Bonjour,

Votre compte SPORTVISE a été supprimé avec succès. Toutes vos données personnelles (profil, objectifs, journal quotidien, calendrier, récapitulatifs, conversations avec les agents IA) ont été effacées définitivement de nos systèmes.

Certains logs techniques peuvent persister temporairement chez nos sous-traitants (Anthropic ~30 jours, Resend ~30 jours, Netlify ~7 jours, sauvegardes Supabase ~7 jours puis purge). Les transactions Stripe sont conservées 10 ans (obligation comptable suisse, art. 958f CO).

Si vous aviez un abonnement payant, il a été annulé automatiquement.

Merci d'avoir essayé SPORTVISE. Si un jour vous changez d'avis, vous serez le/la bienvenu(e).

— Thomas Castella
SPORTVISE — Management Sportif IA · Suisse`,

  de: `Hallo,

Ihr SPORTVISE-Konto wurde erfolgreich gelöscht. Alle Ihre persönlichen Daten (Profil, Ziele, Tagebuch, Kalender, Zusammenfassungen, Konversationen mit den KI-Agenten) wurden endgültig aus unseren Systemen entfernt.

Einige technische Protokolle können vorübergehend bei unseren Unterauftragnehmern verbleiben (Anthropic ~30 Tage, Resend ~30 Tage, Netlify ~7 Tage, Supabase-Backups ~7 Tage, dann Löschung). Stripe-Transaktionen werden 10 Jahre aufbewahrt (Schweizer Buchhaltungspflicht, Art. 958f OR).

Falls Sie ein bezahltes Abonnement hatten, wurde es automatisch gekündigt.

Vielen Dank, dass Sie SPORTVISE ausprobiert haben.

— Thomas Castella
SPORTVISE — KI-Sportmanagement · Schweiz`,

  en: `Hello,

Your SPORTVISE account has been successfully deleted. All your personal data (profile, goals, daily journal, calendar, recaps, conversations with AI agents) has been permanently removed from our systems.

Some technical logs may persist temporarily with our subcontractors (Anthropic ~30 days, Resend ~30 days, Netlify ~7 days, Supabase backups ~7 days then purge). Stripe transactions are kept for 10 years (Swiss accounting obligation, art. 958f CO).

If you had a paid subscription, it has been cancelled automatically.

Thank you for trying SPORTVISE.

— Thomas Castella
SPORTVISE — AI Sport Management · Switzerland`,

  it: `Buongiorno,

Il Suo account SPORTVISE è stato eliminato con successo. Tutti i Suoi dati personali (profilo, obiettivi, diario quotidiano, calendario, riepiloghi, conversazioni con gli agenti IA) sono stati rimossi definitivamente dai nostri sistemi.

Alcuni log tecnici possono persistere temporaneamente presso i nostri subappaltatori (Anthropic ~30 giorni, Resend ~30 giorni, Netlify ~7 giorni, backup Supabase ~7 giorni poi cancellazione). Le transazioni Stripe sono conservate per 10 anni (obbligo contabile svizzero, art. 958f CO).

Se aveva un abbonamento a pagamento, è stato annullato automaticamente.

Grazie per aver provato SPORTVISE.

— Thomas Castella
SPORTVISE — Gestione Sportiva IA · Svizzera`,
};

// ---------------------------------------------------------------------------
// Step helpers
// ---------------------------------------------------------------------------

// Verify user JWT and return { id, email, lang } — or null if invalid
async function verifyUser(accessToken) {
  const res = await httpRequest({
    hostname: supabaseHost(),
    path: '/auth/v1/user',
    method: 'GET',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (res.status !== 200 || !res.data?.id) return null;
  return {
    id: res.data.id,
    email: res.data.email,
    lang: res.data.user_metadata?.lang || 'fr',
  };
}

// Lookup stripe_subscription_id from profiles (returns null if no sub)
async function getStripeSubId(userId) {
  const res = await httpRequest({
    hostname: supabaseHost(),
    path: `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=stripe_subscription_id`,
    method: 'GET',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  if (res.status !== 200 || !Array.isArray(res.data) || res.data.length === 0) return null;
  return res.data[0]?.stripe_subscription_id || null;
}

// Cancel Stripe subscription (non-blocking)
async function cancelStripeSubscription(subId) {
  if (!subId || !STRIPE_SECRET_KEY) return { ok: false, skipped: true };
  const res = await httpRequest({
    hostname: 'api.stripe.com',
    path: `/v1/subscriptions/${encodeURIComponent(subId)}`,
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
  return { ok: res.status >= 200 && res.status < 300, status: res.status, data: res.data };
}

// Atomic cascade DELETE via Postgres RPC
async function rpcDeleteUserData(userId) {
  const body = JSON.stringify({ p_user_id: userId });
  const res = await httpRequest({
    hostname: supabaseHost(),
    path: '/rest/v1/rpc/delete_user_data',
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`RPC delete_user_data failed: ${res.status} ${res.raw}`);
  }
  return res.data; // { messages: n, calendar_events: n, ... }
}

// Delete the auth user (irreversible)
async function deleteAuthUser(userId) {
  const res = await httpRequest({
    hostname: supabaseHost(),
    path: `/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    method: 'DELETE',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Auth admin deleteUser failed: ${res.status} ${res.raw}`);
  }
  return true;
}

// Send confirmation email (non-blocking)
async function sendConfirmationEmail(email, lang) {
  if (!RESEND_API_KEY || !email) return { ok: false, skipped: true };
  const subject = EMAIL_SUBJECTS[lang] || EMAIL_SUBJECTS.fr;
  const text = EMAIL_BODIES[lang] || EMAIL_BODIES.fr;
  const body = JSON.stringify({
    from: 'SPORTVISE <info@sportvise.ch>',
    to: email,
    subject,
    text,
  });
  const res = await httpRequest({
    hostname: 'api.resend.com',
    path: '/emails',
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body,
  });
  return { ok: res.status >= 200 && res.status < 300, status: res.status };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
exports.handler = async (event) => {
  const allowedOrigins = ['https://sportvise.ch', 'https://www.sportvise.ch'];
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  const headers = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Validate env vars
  if (!SUPABASE_SERVICE_KEY) {
    console.error('[DELETE_ACCOUNT] missing SUPABASE_SERVICE_KEY');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }

  // Extract user JWT
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!accessToken) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Missing auth' }) };
  }

  // 1. Verify user
  const user = await verifyUser(accessToken);
  if (!user) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid auth' }) };
  }
  const { id: userId, email: userEmail, lang: userLang } = user;
  console.log(`[DELETE_ACCOUNT] start userId=${userId} email=${userEmail} lang=${userLang}`);

  try {
    // 2. Lookup Stripe subscription
    const stripeSubId = await getStripeSubId(userId);
    console.log(`[DELETE_ACCOUNT] stripe_subscription_id=${stripeSubId || 'none'}`);

    // 3. Cancel Stripe sub (non-blocking)
    if (stripeSubId) {
      const stripeRes = await cancelStripeSubscription(stripeSubId).catch((e) => ({ ok: false, error: e.message }));
      if (stripeRes.ok) {
        console.log(`[DELETE_ACCOUNT] stripe sub cancelled: ${stripeSubId}`);
      } else {
        console.warn(`[DELETE_ACCOUNT] stripe cancel failed (non-blocking): ${JSON.stringify(stripeRes)}`);
      }
    }

    // 4. Cascade DELETE all user data (atomic transaction in Postgres)
    const deletedCounts = await rpcDeleteUserData(userId);
    console.log(`[DELETE_ACCOUNT] cascade DELETE: ${JSON.stringify(deletedCounts)}`);

    // 5. Delete the auth user (irreversible)
    await deleteAuthUser(userId);
    console.log(`[DELETE_ACCOUNT] auth user deleted: ${userId}`);

    // 6. Send confirmation email (non-blocking)
    const emailRes = await sendConfirmationEmail(userEmail, userLang).catch((e) => ({ ok: false, error: e.message }));
    if (emailRes.ok) {
      console.log(`[DELETE_ACCOUNT] confirmation email sent to ${userEmail} (${userLang})`);
    } else {
      console.warn(`[DELETE_ACCOUNT] email failed (non-blocking): ${JSON.stringify(emailRes)}`);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, deletedCounts }),
    };

  } catch (error) {
    console.error(`[DELETE_ACCOUNT] error for user ${userId}:`, error.message, error.stack);
    captureError(error, { context: { user_id: userId }, level: 'error' });
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Deletion failed. Please contact info@sportvise.ch' }),
    };
  }
};
