// SPORTVISE — Netlify Function : Email de bienvenue (multilingue v46)
// Envoyé automatiquement à chaque nouvel athlète inscrit.
// Le payload accepte un champ `lang` ('fr'|'de'|'en'|'it'), fallback 'fr'.
// Le HTML structurel reste unique (DRY) ; seuls les textes varient via EMAIL_TEMPLATES.

// ----------------------------------------------------------------------------
// Templates de texte par langue. Registre formel (vouvoiement) pour mirror le FR.
// DE = Sie/Ihr, IT = Lei/Suo, EN = neutre, FR inchangé.
// ----------------------------------------------------------------------------
const EMAIL_TEMPLATES = {
  fr: {
    htmlLang: 'fr',
    athleteFallback: 'Athlète',
    subject: (firstName) => `Bienvenue sur SPORTVISE, ${firstName} ! 🏆`,
    tagline: '🇨🇭 Management Sportif IA · Suisse',
    greeting: (firstName) => `Bienvenue, ${firstName} !`,
    intro: `Votre compte SPORTVISE est actif. Vous avez accès à <strong style="color:#10b981">3 agents IA</strong> sur le plan Free. Passez au plan Plus ou Pro pour débloquer jusqu'à <strong style="color:#f59e0b">11 agents spécialisés</strong> et révolutionner votre carrière sportive en Suisse.`,
    sportLabel: (sport) => `⚽ Sport détecté : ${sport}`,
    sportSubLabel: 'Vos agents sont déjà adaptés à votre sport !',
    agentsTitle: 'Vos 11 agents disponibles',
    agentRoles: [
      'Manager Sportif',
      'Préparation Mentale',
      'Nutrition Sportive',
      'Préparation Physique',
      'Spécialiste du Sommeil',
      'Récupération & Régénération',
      'Marketing & Personal Branding',
      'Gestion des Sponsors',
      'Conseil Financier Suisse',
      'Négociation de Contrats',
      'Comptabilité & Facturation'
    ],
    ctaButton: 'Accéder à mon dashboard →',
    tipsTitle: '💡 Par où commencer ?',
    tips: [
      ['Complétez votre profil', 'Sport, niveau, club, canton — pour des conseils ultra-personnalisés'],
      ['Parlez à Emma', 'Votre coach mental vous aide à gérer le stress et la performance'],
      ['Consultez Clara', 'Recevez un plan nutrition adapté à votre sport']
    ],
    footerCountry: 'Suisse',
    footerFounded: 'Fondé en Suisse Romande',
    footerQuestions: 'Des questions ?'
  },

  de: {
    htmlLang: 'de',
    athleteFallback: 'Athlet',
    subject: (firstName) => `Willkommen bei SPORTVISE, ${firstName}! 🏆`,
    tagline: '🇨🇭 KI-Sportmanagement · Schweiz',
    greeting: (firstName) => `Willkommen, ${firstName}!`,
    intro: `Ihr SPORTVISE-Konto ist aktiv. Sie haben Zugriff auf <strong style="color:#10b981">3 KI-Agenten</strong> im Free-Plan. Wechseln Sie zu Plus oder Pro, um bis zu <strong style="color:#f59e0b">11 spezialisierte Agenten</strong> freizuschalten und Ihre Sportkarriere in der Schweiz zu revolutionieren.`,
    sportLabel: (sport) => `⚽ Erkannte Sportart: ${sport}`,
    sportSubLabel: 'Ihre Agenten sind bereits auf Ihre Sportart abgestimmt!',
    agentsTitle: 'Ihre 11 verfügbaren Agenten',
    agentRoles: [
      'Sportmanager',
      'Mentaltraining',
      'Sporternährung',
      'Konditionstraining',
      'Schlafspezialistin',
      'Erholung & Regeneration',
      'Marketing & Personal Branding',
      'Sponsoren-Management',
      'Schweizer Finanzberatung',
      'Vertragsverhandlung',
      'Buchhaltung & Rechnungsstellung'
    ],
    ctaButton: 'Zum Dashboard →',
    tipsTitle: '💡 Wo soll ich anfangen?',
    tips: [
      ['Vervollständigen Sie Ihr Profil', 'Sportart, Niveau, Verein, Kanton — für massgeschneiderte Beratung'],
      ['Sprechen Sie mit Emma', 'Ihre Mentaltrainerin hilft Ihnen, Stress und Leistung zu managen'],
      ['Wenden Sie sich an Clara', 'Erhalten Sie einen Ernährungsplan, der zu Ihrer Sportart passt']
    ],
    footerCountry: 'Schweiz',
    footerFounded: 'Gegründet in der Westschweiz',
    footerQuestions: 'Fragen?'
  },

  en: {
    htmlLang: 'en',
    athleteFallback: 'Athlete',
    subject: (firstName) => `Welcome to SPORTVISE, ${firstName}! 🏆`,
    tagline: '🇨🇭 AI Sports Management · Switzerland',
    greeting: (firstName) => `Welcome, ${firstName}!`,
    intro: `Your SPORTVISE account is active. You have access to <strong style="color:#10b981">3 AI agents</strong> on the Free plan. Upgrade to Plus or Pro to unlock up to <strong style="color:#f59e0b">11 specialised agents</strong> and revolutionise your sports career in Switzerland.`,
    sportLabel: (sport) => `⚽ Sport detected: ${sport}`,
    sportSubLabel: 'Your agents are already tailored to your sport!',
    agentsTitle: 'Your 11 available agents',
    agentRoles: [
      'Sports Manager',
      'Mental Coaching',
      'Sports Nutrition',
      'Physical Conditioning',
      'Sleep Specialist',
      'Recovery & Regeneration',
      'Marketing & Personal Branding',
      'Sponsor Management',
      'Swiss Financial Advice',
      'Contract Negotiation',
      'Accounting & Invoicing'
    ],
    ctaButton: 'Go to my dashboard →',
    tipsTitle: '💡 Where to start?',
    tips: [
      ['Complete your profile', 'Sport, level, club, canton — for ultra-personalised advice'],
      ['Talk to Emma', 'Your mental coach helps you manage stress and performance'],
      ['Check in with Clara', 'Get a nutrition plan tailored to your sport']
    ],
    footerCountry: 'Switzerland',
    footerFounded: 'Founded in French-speaking Switzerland',
    footerQuestions: 'Questions?'
  },

  it: {
    htmlLang: 'it',
    athleteFallback: 'Atleta',
    subject: (firstName) => `Benvenuto su SPORTVISE, ${firstName}! 🏆`,
    tagline: '🇨🇭 Gestione Sportiva IA · Svizzera',
    greeting: (firstName) => `Benvenuto, ${firstName}!`,
    intro: `Il Suo account SPORTVISE è attivo. Ha accesso a <strong style="color:#10b981">3 agenti IA</strong> nel piano Free. Passi al piano Plus o Pro per sbloccare fino a <strong style="color:#f59e0b">11 agenti specializzati</strong> e rivoluzionare la Sua carriera sportiva in Svizzera.`,
    sportLabel: (sport) => `⚽ Sport rilevato: ${sport}`,
    sportSubLabel: 'I Suoi agenti sono già adattati al Suo sport!',
    agentsTitle: 'I Suoi 11 agenti disponibili',
    agentRoles: [
      'Manager Sportivo',
      'Preparazione Mentale',
      'Nutrizione Sportiva',
      'Preparazione Fisica',
      'Specialista del Sonno',
      'Recupero & Rigenerazione',
      'Marketing & Personal Branding',
      'Gestione Sponsor',
      'Consulenza Finanziaria Svizzera',
      'Negoziazione Contratti',
      'Contabilità & Fatturazione'
    ],
    ctaButton: 'Vai alla mia dashboard →',
    tipsTitle: '💡 Da dove iniziare?',
    tips: [
      ['Completi il Suo profilo', 'Sport, livello, club, cantone — per consigli ultra-personalizzati'],
      ['Parli con Emma', 'La Sua coach mentale La aiuta a gestire stress e performance'],
      ['Consulti Clara', 'Riceva un piano nutrizionale adatto al Suo sport']
    ],
    footerCountry: 'Svizzera',
    footerFounded: 'Fondato nella Svizzera Romanda',
    footerQuestions: 'Domande?'
  }
};

// Agent emojis, names and plan labels are language-agnostic (product brand).
// Order MUST match agentRoles[] arrays above (index = role).
const AGENTS_BASE = [
  ['💼', 'Lucas',  '🟢 Free'],
  ['🧠', 'Emma',   '🟢 Free'],
  ['🥗', 'Clara',  '🟢 Free'],
  ['🏋️', 'David',  '💎 Plus'],
  ['😴', 'Nora',   '💎 Plus'],
  ['♻️', 'Julie',  '💎 Plus'],
  ['🎯', 'Alex',   '⚡ Pro'],
  ['🤝', 'Marc',   '⚡ Pro'],
  ['💶', 'Sophie', '⚡ Pro'],
  ['⚖️', 'Léa',    '⚡ Pro'],
  ['📊', 'Pierre', '⚡ Pro']
];

// ----------------------------------------------------------------------------
// HTML renderer — single template, only the strings change per language.
// ----------------------------------------------------------------------------
function renderEmailHtml(t, firstName, sport) {
  return `
<!DOCTYPE html>
<html lang="${t.htmlLang}">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#07091a;font-family:'Segoe UI',Arial,sans-serif">
  <div style="max-width:580px;margin:0 auto;padding:32px 20px">

    <!-- HEADER -->
    <div style="text-align:center;margin-bottom:32px">
      <div style="font-size:28px;font-weight:900;letter-spacing:3px;background:linear-gradient(135deg,#f59e0b,#fbbf24);-webkit-background-clip:text;-webkit-text-fill-color:transparent;display:inline-block">
        SPORTVISE
      </div>
      <div style="color:#64748b;font-size:12px;margin-top:4px">${t.tagline}</div>
    </div>

    <!-- CARD -->
    <div style="background:#0d1127;border:1px solid #1e2d47;border-radius:16px;padding:36px;margin-bottom:24px">
      <div style="font-size:32px;margin-bottom:16px">🏆</div>
      <h1 style="color:#f1f5f9;font-size:24px;font-weight:800;margin:0 0 8px">
        ${t.greeting(firstName)}
      </h1>
      <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0 0 24px">
        ${t.intro}
      </p>

      ${sport ? `
      <div style="background:#f59e0b15;border:1px solid #f59e0b30;border-radius:10px;padding:14px 18px;margin-bottom:24px">
        <div style="color:#f59e0b;font-size:13px;font-weight:700">${t.sportLabel(sport)}</div>
        <div style="color:#94a3b8;font-size:12px;margin-top:3px">${t.sportSubLabel}</div>
      </div>
      ` : ''}

      <!-- AGENTS PREVIEW -->
      <div style="margin-bottom:24px">
        <div style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">${t.agentsTitle}</div>
        <div style="display:grid;gap:8px">
          ${AGENTS_BASE.map(([emoji, name, plan], idx) => `
            <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:#111827;border-radius:8px;border:1px solid #1e2d47">
              <span style="font-size:18px">${emoji}</span>
              <div style="flex:1">
                <div style="color:#f1f5f9;font-size:13px;font-weight:700">${name}</div>
                <div style="color:#64748b;font-size:11px">${t.agentRoles[idx]}</div>
              </div>
              <div style="font-size:9px;color:#64748b;white-space:nowrap">${plan}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- CTA -->
      <div style="text-align:center">
        <a href="https://sportvise.ch/app/login.html" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#07091a;font-size:15px;font-weight:800;text-decoration:none;border-radius:10px;letter-spacing:0.3px">
          ${t.ctaButton}
        </a>
      </div>
    </div>

    <!-- TIPS -->
    <div style="background:#0d1127;border:1px solid #1e2d47;border-radius:16px;padding:24px;margin-bottom:24px">
      <div style="color:#f59e0b;font-size:13px;font-weight:700;margin-bottom:14px">${t.tipsTitle}</div>
      ${t.tips.map(([title, desc], i) => `
        <div style="display:flex;gap:12px;margin-bottom:12px">
          <span style="font-size:18px;flex-shrink:0">${['1️⃣','2️⃣','3️⃣'][i]}</span>
          <div>
            <div style="color:#f1f5f9;font-size:13px;font-weight:700">${title}</div>
            <div style="color:#64748b;font-size:12px;margin-top:2px">${desc}</div>
          </div>
        </div>
      `).join('')}
    </div>

    <!-- FOOTER -->
    <div style="text-align:center;color:#475569;font-size:11px;line-height:1.7">
      <div>© 2026 SPORTVISE · ${t.footerCountry} 🇨🇭</div>
      <div>${t.footerFounded} · <a href="https://sportvise.ch" style="color:#f59e0b;text-decoration:none">sportvise.ch</a></div>
      <div style="margin-top:6px">${t.footerQuestions} <a href="mailto:hello@sportvise.ch" style="color:#f59e0b;text-decoration:none">hello@sportvise.ch</a></div>
    </div>
  </div>
</body>
</html>`;
}

// ----------------------------------------------------------------------------
// Handler
// ----------------------------------------------------------------------------
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: '' };

  try {
    const { name, email, sport, lang } = JSON.parse(event.body);
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Resend API key missing' }) };

    // Pick template — fallback to FR for unknown / missing lang
    const t = EMAIL_TEMPLATES[lang] || EMAIL_TEMPLATES.fr;
    const firstName = ((name || t.athleteFallback).split(' ')[0]) || t.athleteFallback;
    const html = renderEmailHtml(t, firstName, sport);

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from: 'SPORTVISE <hello@sportvise.ch>',
        to: [email],
        subject: t.subject(firstName),
        html
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`[WELCOME] lang=${t.htmlLang} status=${response.status} err=`, err);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Email send failed' }) };
    }

    console.log(`[WELCOME] sent lang=${t.htmlLang} to=${email}`);
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, lang: t.htmlLang }) };

  } catch (error) {
    console.error('Function error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
