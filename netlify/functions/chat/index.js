// SPORTVISE — Netlify Function : Proxy Claude AI
// v60 — Auth JWT + rate limiting + usage logging
//
// Changes vs v59 :
//   • Authorization header obligatoire (Bearer JWT Supabase).
//     Avant : userEmail dans body, non validé → bypass possible.
//     Maintenant : token validé via /auth/v1/user, user_id extrait du JWT.
//   • Rate limit par user/plan : per-minute (anti-burst) et per-day (cap).
//     Compteurs via PostgREST count=exact sur public.api_usage_log.
//   • Chaque appel est loggé dans api_usage_log (success ou error).
//
// Limites par plan (alignées avec le pricing landing) :
//   Free : 30 req/min, 5/jour      (v63.5 : passé de 10 → 5 msg/jour)
//   Plus : 30 req/min, 500/jour
//   Pro  : 60 req/min, 1000/jour
//
// Compatibilité :
//   • Le 2e site fetch /chat dans dashboard.html (rapport hebdo, ligne 9926)
//     n'envoie PAS d'Authorization header et utilise un format incompatible
//     (agent au lieu de agentId). Il échoue déjà actuellement (400) et a un
//     fallback local. v60 le fait échouer en 401 (auth_invalid) → même fallback.
//
// Env vars utilisées :
//   ANTHROPIC_API_KEY        (existant)
//   SUPABASE_URL             (déjà utilisé par delete-account.js, fallback hardcodé)
//   SUPABASE_SERVICE_KEY     (déjà utilisé par delete-account.js)
//   AI_MODEL_DEFAULT, AI_MODEL_BETA, AI_MODEL_BETA_USERS (existants)

const https = require('https');
const { SPORTS_SUISSE, CALENDRIERS_SUISSE, AGENTS, GARDE_FOUS_GLOBAUX } = require("./agents-data");
const { initSentry, captureError } = require('../_sentry');

// v61.3 — observability serveur. No-op gracieux si SENTRY_DSN_SERVER absent.
initSentry({ component: 'chat', release: process.env.SPORTVISE_APP_V || 'v62.5' });

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ckikyvokurpehavjlkbc.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// ─────────────────────────────────────────────────────────────
// HTTP helper (vanilla node https — cohérent avec delete-account.js)
// Returns { status, data, raw, headers }
// ─────────────────────────────────────────────────────────────
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
        resolve({ status: res.statusCode, data: parsed, raw: data, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function supabaseHost() {
  return SUPABASE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

// ─────────────────────────────────────────────────────────────
// Auth: verify JWT and extract user info
// ─────────────────────────────────────────────────────────────
async function verifyUser(accessToken) {
  if (!accessToken) return null;
  try {
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
    return { id: res.data.id, email: res.data.email, createdAt: res.data.created_at };
  } catch (e) {
    console.warn('[CHAT] verifyUser error:', e.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Get user plan from profiles (defaults to 'free' if missing or not plus/pro)
// ─────────────────────────────────────────────────────────────
async function getUserPlan(userId) {
  try {
    const res = await httpRequest({
      hostname: supabaseHost(),
      path: `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=plan`,
      method: 'GET',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    });
    if (res.status !== 200 || !Array.isArray(res.data) || res.data.length === 0) return 'free';
    const plan = String(res.data[0]?.plan || 'free').toLowerCase();
    return (plan === 'plus' || plan === 'pro') ? plan : 'free';
  } catch (e) {
    console.warn('[CHAT] getUserPlan error:', e.message);
    return 'free';
  }
}

// ─────────────────────────────────────────────────────────────
// Rate limit thresholds per plan/tier
// v63.8 — Refonte free plan (essai 14j + free permanent mensuel) :
//   Essai 14 jours : tout compte free récent → tier 'trial' (20 msg/jour, 11 agents).
//   Free permanent : après l'essai → 30 msg / 30 jours glissants (au lieu de 5/jour).
//   Kill switch SV_TRIAL_ENABLED : false = pas d'overlay essai, tout compte free
//   passe direct au free permanent (le cap mensuel free reste, lui, inconditionnel).
// ─────────────────────────────────────────────────────────────
const SV_TRIAL_ENABLED = true;   // kill switch — false = désactive l'overlay essai
const TRIAL_DAYS = 14;
const LIMITS = {
  free:  { perMinute: 30, perMonth: 30 },  // free permanent (post-essai) — 30 msg / 30j glissants
  trial: { perMinute: 30, perDay: 20 },    // essai 14 jours — accès complet
  plus:  { perMinute: 30, perDay: 500 },
  pro:   { perMinute: 60, perDay: 1000 },
};

// Count chat usage for a user since a given ISO timestamp.
// Uses PostgREST `Prefer: count=exact` + `Range: 0-0` to get the count via the
// `Content-Range` header (format "0-0/N"), which is way cheaper than fetching
// all rows and counting client-side.
async function countUsageSince(userId, sinceIso) {
  try {
    const path = `/rest/v1/api_usage_log?user_id=eq.${encodeURIComponent(userId)}&endpoint=eq.chat&ts=gte.${encodeURIComponent(sinceIso)}&select=id`;
    const res = await httpRequest({
      hostname: supabaseHost(),
      path,
      method: 'GET',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        Prefer: 'count=exact',
        Range: '0-0',
      },
    });
    // Content-Range looks like "0-0/12" or "*/0" if empty
    const cr = res.headers?.['content-range'] || '';
    const m = /\/(\d+)$/.exec(cr);
    return m ? parseInt(m[1], 10) : 0;
  } catch (e) {
    console.warn('[CHAT] countUsageSince error:', e.message);
    // Fail-open: don't block legitimate users on a transient DB error.
    // The Anthropic per-key rate limit (50 RPM) remains as a hard cap.
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────
// Log a single chat call (success or error) into api_usage_log.
// Non-blocking: errors are warned, never thrown.
// ─────────────────────────────────────────────────────────────
async function logUsage({ userId, agentId, model, inputTokens, outputTokens, latencyMs, success, errorCode }) {
  if (!userId) return;
  const body = JSON.stringify({
    user_id: userId,
    endpoint: 'chat',
    agent_id: agentId || null,
    model: model || null,
    input_tokens: inputTokens ?? null,
    output_tokens: outputTokens ?? null,
    latency_ms: latencyMs ?? null,
    success: !!success,
    error_code: errorCode || null,
  });
  try {
    await httpRequest({
      hostname: supabaseHost(),
      path: '/rest/v1/api_usage_log',
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body,
    });
  } catch (e) {
    console.warn('[CHAT] logUsage failed (non-blocking):', e.message);
  }
}

// ─────────────────────────────────────────────────────────────
// v63.6 — Upgrade qualité agents experts (post test amis 13/05) :
//   TOUS les plans (Free + Plus + Pro) → Sonnet 4.6 (était Haiku)
//   AI_MODEL_BETA_USERS → Opus (override interne QA, permet de comparer)
// Haiku reste configuré pour fallback éventuel mais n'est plus sélectionné automatiquement.
// Opus reste configuré (dormant) — réactivable en 1 ligne dans pickModel si Thomas
// décide plus tard d'en faire un différenciateur Pro (cf. SPEC_v63_6).
// Coût impact : Sonnet ~3.9× Haiku. Acceptable car le moat SPORTVISE = qualité conseil
// des 11 agents experts (mémoire vision_agents_experts), et le test amis du 13/05 a
// montré que Haiku dégradait l'expérience vs claude.ai direct.
// Model IDs env-overridable pour swap sans redeploy si Anthropic publie un nouvel alias.
// ─────────────────────────────────────────────────────────────
const MODEL_CONFIG = {
  haiku: {
    id: process.env.AI_MODEL_DEFAULT || 'claude-haiku-4-5-20251001',
    maxTokens: 2000,
    temperature: 1.0,
    systemPrefix: ''
  },
  sonnet: {
    id: process.env.AI_MODEL_BETA || 'claude-sonnet-4-6',
    maxTokens: 3500,
    temperature: 0.4,
    systemPrefix: `[CONSIGNES DE STYLE STRICTES — À RESPECTER POUR CHAQUE RÉPONSE]
- Pour les réponses conversationnelles : 2 à 3 paragraphes courts maximum.
- EXCEPTION PLANS : si tu génères un plan d'entraînement ou de nutrition sur plusieurs jours, ignore la limite de paragraphes. Découpe en parties de 5 jours maximum. À la fin de chaque partie, demande explicitement : "Veux-tu que je te donne la suite ?" Ne laisse JAMAIS un plan se couper au milieu d'une journée.
- Tutoie systématiquement l'athlète (jamais de "vous").
- Termine par UNE seule question OU UN seul appel à l'action concret — pas les deux.
- Pas de listes à puces ni de listes numérotées, SAUF si la réponse en a vraiment besoin (ex : étapes ordonnées d'un protocole, plan journalier). Privilégie des phrases fluides en prose.
- N'invente JAMAIS d'URL, de lien, de site web, de marque ni de produit que tu n'es pas certain d'avoir vu apparaître dans le contexte fourni. Si tu ne connais pas un lien précis, dis "cherche sur Google" ou "demande à ta fédération".
- Ton conversationnel et concret, pas académique.

`
  },
  opus: {
    id: process.env.AI_MODEL_PREMIUM || 'claude-opus-4-6',
    maxTokens: 3500,
    temperature: 0.4,
    systemPrefix: `[CONSIGNES DE STYLE STRICTES — À RESPECTER POUR CHAQUE RÉPONSE]
- Pour les réponses conversationnelles : 2 à 3 paragraphes courts maximum.
- EXCEPTION PLANS : si tu génères un plan d'entraînement ou de nutrition sur plusieurs jours, ignore la limite de paragraphes. Découpe en parties de 5 jours maximum. À la fin de chaque partie, demande explicitement : "Veux-tu que je te donne la suite ?" Ne laisse JAMAIS un plan se couper au milieu d'une journée.
- Tutoie systématiquement l'athlète (jamais de "vous").
- Termine par UNE seule question OU UN seul appel à l'action concret — pas les deux.
- Pas de listes à puces ni de listes numérotées, SAUF si la réponse en a vraiment besoin (ex : étapes ordonnées d'un protocole, plan journalier). Privilégie des phrases fluides en prose.
- N'invente JAMAIS d'URL, de lien, de site web, de marque ni de produit que tu n'es pas certain d'avoir vu apparaître dans le contexte fourni. Si tu ne connais pas un lien précis, dis "cherche sur Google" ou "demande à ta fédération".
- Ton conversationnel et concret, pas académique.
- Tu es l'expert haut de gamme du plan Pro : appuie-toi sur ta capacité de raisonnement pour aller plus loin dans la spécificité (chiffres précis, références aux particularités du sport pratiqué, anticipation de la prochaine question de l'athlète).

`
  }
};

function pickModel(userEmail, plan) {
  // 1. Override interne (QA / beta testing) — permet de forcer Opus pour comparer
  //    la qualité premium depuis un compte connu (toi). Sinon, personne ne touche Opus.
  const betaUsersRaw = process.env.AI_MODEL_BETA_USERS || '';
  if (userEmail && betaUsersRaw) {
    const betaSet = new Set(
      betaUsersRaw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
    );
    if (betaSet.has(String(userEmail).trim().toLowerCase())) return 'opus';
  }
  // 2. Tous les plans (Free, Plus, Pro) → Sonnet.
  //    NB : la config 'opus' reste dormante dans MODEL_CONFIG ci-dessus, prête à être
  //    réactivée pour le plan Pro si Thomas valide le différenciateur paywall plus tard.
  //    Pour l'instant (17/05) : on n'augmente pas le coût Pro tant que les conversations
  //    découverte (mémoire test_amis_13_05) n'ont pas validé le segment cible.
  //    Le paramètre `plan` reste dans la signature pour réactivation rapide (1 ligne).
  return 'sonnet';
}

// ─────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  // CORS
  const allowedOrigins = ['https://sportvise.ch', 'https://www.sportvise.ch', 'https://prismatic-lebkuchen-48a8ee.netlify.app', 'https://stately-hummingbird-2ce1c2.netlify.app'];
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  const headers = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  // ─── v60 — Auth: Bearer JWT mandatory ───
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const user = await verifyUser(accessToken);
  if (!user) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'auth_invalid', message: 'Authentication required' })
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(event.body || '{}');
  } catch (_) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid_body' }) };
  }
  const { agentId, message, history, lang, profile, otherAgents, calendar, style, goals, dailyLog, smartContext, image, imageType, userEmail, calendarEmpty, agentExchangeCount } = parsed;

  if (!agentId || !message) {
    await logUsage({ userId: user.id, agentId, success: false, errorCode: 'invalid_payload' });
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing agentId or message' }) };
  }

  if (message.length > 5000) {
    await logUsage({ userId: user.id, agentId, success: false, errorCode: 'message_too_long' });
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Message too long (max 5000 chars)' }) };
  }

  const agent = AGENTS[agentId];
  if (!agent) {
    await logUsage({ userId: user.id, agentId, success: false, errorCode: 'unknown_agent' });
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown agent' }) };
  }

  // ─── v60 — Rate limit check (v63.8 — tier essai + cap mensuel free) ───
  let plan = await getUserPlan(user.id);

  // ─── ADMIN_EMAILS override (chantier #2 v63.11.3) ───
  // Les emails admin (env var ADMIN_EMAILS, séparés par virgule) sont toujours
  // traités comme plan 'pro' côté backend, indépendamment de la valeur en DB.
  // Permet de supprimer le hack frontend fragile (dashboard.html ~ligne 1496).
  const _adminEmailsRaw = process.env.ADMIN_EMAILS || '';
  if (_adminEmailsRaw && user.email) {
    const _adminSet = new Set(
      _adminEmailsRaw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
    );
    if (_adminSet.has(String(user.email).trim().toLowerCase())) plan = 'pro';
  }

  // Tier effectif : overlay 'trial' sur le plan free pour les comptes récents
  // (< TRIAL_DAYS jours). Date d'inscription = createdAt de l'objet auth user.
  let tier = plan;
  if (plan === 'free' && SV_TRIAL_ENABLED && user.createdAt) {
    const ageMs = Date.now() - new Date(user.createdAt).getTime();
    if (ageMs >= 0 && ageMs < TRIAL_DAYS * 24 * 3600 * 1000) tier = 'trial';
  }
  const limits = LIMITS[tier] || LIMITS.free;

  const now = Date.now();
  const oneMinuteAgoIso = new Date(now - 60 * 1000).toISOString();

  // Fenêtre du cap de volume : mensuelle (30j glissants) pour le free permanent,
  // sinon journalière (essai / Plus / Pro).
  const monthly = limits.perMonth != null;
  const volumeLimit = monthly ? limits.perMonth : limits.perDay;
  const volumeWindowMs = monthly ? 30 * 24 * 3600 * 1000 : 24 * 3600 * 1000;
  const volumeSinceIso = new Date(now - volumeWindowMs).toISOString();

  const [minuteCount, volumeCount] = await Promise.all([
    countUsageSince(user.id, oneMinuteAgoIso),
    countUsageSince(user.id, volumeSinceIso),
  ]);

  if (minuteCount >= limits.perMinute) {
    await logUsage({ userId: user.id, agentId, success: false, errorCode: 'rate_limit_minute' });
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({
        error: 'rate_limit',
        scope: 'minute',
        plan,
        tier,
        limit: limits.perMinute,
        retry_after: 60,
        message: "Trop de messages d'un coup. Réessaie dans une minute."
      }),
    };
  }

  if (volumeCount >= volumeLimit) {
    await logUsage({ userId: user.id, agentId, success: false, errorCode: monthly ? 'rate_limit_month' : 'rate_limit_day' });
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({
        error: 'rate_limit',
        scope: monthly ? 'month' : 'day',
        plan,
        tier,
        limit: volumeLimit,
        message: monthly
          ? `Tu as utilisé tes ${volumeLimit} messages gratuits du mois. Passe au plan Plus pour continuer sans limite.`
          : (tier === 'trial'
              ? `Tu as utilisé tes ${volumeLimit} messages du jour. Reviens demain — ton essai reste actif.`
              : `Tu as atteint ta limite quotidienne (${volumeLimit} messages). Réessaie demain.`)
      }),
    };
  }

  // ─── Existing logic (Claude API call) ───
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    await logUsage({ userId: user.id, agentId, success: false, errorCode: 'api_key_missing' });
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  // v63.6 — pick Sonnet (default) / Opus (Pro plan or beta override).
  // Email from JWT first, fallback to body for compat. Plan déjà calculé ci-dessus.
  const effectiveEmail = user.email || userEmail;
  const modelKey = pickModel(effectiveEmail, plan);
  const modelConfig = MODEL_CONFIG[modelKey];

  // Language instruction
  const langInstructions = {
    fr: 'Réponds toujours en français.',
    de: 'Antworte immer auf Deutsch (Schweizerdeutsch-freundlich, aber Standard-Deutsch).',
    en: 'Always respond in English.',
    it: 'Rispondi sempre in italiano.'
  };
  const langInstruction = langInstructions[lang] || langInstructions.fr;

  // Inject today's date so agents reason on the correct timeframe (Europe/Zurich anchor)
  const todayLabel = new Date().toLocaleDateString('fr-CH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'Europe/Zurich'
  });
  const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Zurich' });
  const dateInstruction = `[DATE DU JOUR : ${todayLabel} (${todayIso}). Utilise cette date pour TOUS tes raisonnements temporels (J-1, demain, semaine prochaine, etc.). Ne te fie jamais à ta date d'entraînement.]`;

  // Build enriched system prompt with athlete memory.
  // v62.29.5 (Phase 0 audit) : GARDE_FOUS_GLOBAUX appliqués à chaque agent
  // (posture conseiller expert, garde-fous santé/juridique/financier, ton CH).
  let systemWithLang = (modelConfig.systemPrefix || '') + agent.system + (GARDE_FOUS_GLOBAUX || '') + '\n\n' + langInstruction + '\n\n' + dateInstruction;

  if (profile) {
    systemWithLang += `\n\n[PROFIL ATHLÈTE - utilise ces infos pour personnaliser chaque réponse]\n${profile}`;
  }
  if (otherAgents) {
    systemWithLang += `\n\n[CONTEXTE INTER-AGENTS - sujets récents discutés avec d'autres agents SPORTVISE. Utilise ces infos si pertinent pour enrichir ta réponse, faire des liens entre les domaines, ou suggérer de consulter un autre agent.]\n${otherAgents}`;
  }
  if (calendar) {
    systemWithLang += `\n\n[CALENDRIER SPORTIF - événements à venir de l'athlète. UTILISE ACTIVEMENT ces informations pour :\n- Adapter tes conseils au timing (ex: "tu as un match demain, voici ce que je recommande...")\n- Planifier la préparation en fonction des échéances\n- Alerter sur les priorités imminentes\n- Proposer un programme adapté au calendrier de compétition\n\nGARDE-FOU IMPÉRATIF (v63.7.1) :\n- Si le contexte ci-dessous contient "CALENDRIER VIDE", "CALENDRIER NON CONFIRMÉ" ou "AUCUN ÉVÉNEMENT À VENIR RENSEIGNÉ", tu NE DOIS JAMAIS inventer, supposer ou citer d'échéances (pas de "ton match dans X jours", pas de "ton entraînement demain", pas de "ta compétition de samedi"). Tu invites alors l'athlète à compléter son agenda dans l'onglet Calendrier avant de prescrire quoi que ce soit qui dépend du timing.\n- Tu ne dois JAMAIS citer un événement qui n'apparaît pas EXPLICITEMENT dans la liste ci-dessous. Inventer un match, une compétition ou un entraînement = perte de crédibilité immédiate. Si tu n'as pas l'info, tu demandes, tu ne supposes pas.\n\nÉvénements :\n${calendar}]`;
  }
  if (goals) {
    systemWithLang += `\n\n[OBJECTIFS DE L'ATHLÈTE - utilise ces objectifs pour orienter tes conseils. Aide l'athlète à progresser vers ses objectifs, propose des actions concrètes, et félicite les progrès.]\n${goals}`;
  }
  if (dailyLog) {
    systemWithLang += `\n\n[ÉTAT DU JOUR - journal de bord de l'athlète aujourd'hui. Adapte tes conseils à son état actuel (fatigue, douleurs, humeur). Si l'athlète va mal, sois bienveillant et adapte l'intensité de tes recommandations.]\n${dailyLog}`;
  }
  if (smartContext) {
    systemWithLang += `\n\n[INTELLIGENCE CONTEXTUELLE — INSTRUCTIONS PRIORITAIRES]
IMPORTANT: Tu as accès à des DONNÉES EN TEMPS RÉEL fournies par la plateforme SPORTVISE.
Les données ci-dessous (classements, résultats, tendances, calendrier, Strava) sont ACTUELLES et FIABLES — utilise-les dans tes réponses.
Ne dis JAMAIS que tu n'as pas accès à des données live ou à Internet — SPORTVISE te fournit ces données automatiquement.
Les ALERTES sont prioritaires : adapte TOUJOURS ta réponse en conséquence.
Les TENDANCES t'indiquent l'évolution sur 7 jours : utilise-les pour anticiper et personnaliser.
INTÉGRATION STRAVA : si tu vois un bloc commençant par [STRAVA CONNECTÉ] ou [DONNÉES STRAVA], c'est une source d'information sportive officielle provenant du compte Strava connecté de l'athlète. Tu DOIS la mentionner et l'utiliser activement (entraînements récents, distances, FC, intensité). Si le bloc indique "0 activité enregistrée dans les 30 derniers jours", la sync est déjà terminée — n'invente JAMAIS de délai technique d'attente, demande directement les détails à l'athlète.
Si tu détectes qu'un autre domaine est concerné, recommande l'agent approprié naturellement.
${smartContext}`;
  }
  if (style) {
    systemWithLang += `\n\n[STYLE DE COMMUNICATION]\n${style}`;
  }

  // v63.7 — Session 1 protocol (Phase 0 anti-cold-projection)
  // Quand l'athlète parle pour la 1ère fois à cet agent, on impose un cadrage
  // explicite avant toute prescription. Évite que les agents projettent des
  // chiffres / plans génériques sans contexte vérifié (problème remonté par
  // test amis 17/05/2026 sur Lucas en particulier — 1ère réponse incohérente
  // ou hors contexte car le modèle tente d'être utile à tout prix).
  const isFirstMessageWithAgent = !history || history.length === 0;
  if (isFirstMessageWithAgent) {
    systemWithLang += `\n\n[SESSION 1 — DÉBUT DE RELATION AVEC L'ATHLÈTE — v63.11.3]
C'est ta première interaction avec cet athlète sur ton domaine d'expertise.

Regarde le profil disponible dans ce contexte (sport, niveau, club, objectif) :

→ SI le profil contient sport + niveau (même partiels) :
  1. Présente-toi en 1 phrase (nom, rôle SPORTVISE).
  2. Réponds directement et utilement à la question posée — avec des éléments concrets adaptés au profil disponible.
  3. Termine par UNE seule question pour affiner le contexte manquant le plus utile.

→ SI le profil est vide ou quasi-vide :
  1. Présente-toi en 1 phrase (nom, rôle SPORTVISE).
  2. Donne quand même une réponse de valeur à la question (une réponse vraie et utile existe même sans profil complet).
  3. Termine par UNE seule question — la plus importante pour personnaliser tes prochaines réponses.

RÈGLE ABSOLUE : tu donnes TOUJOURS du contenu utile dès la première réponse. Bloquer tout conseil sous prétexte que le profil est incomplet = athlète qui repart sans valeur = échec.

INTERDIT en session 1 :
- Poser 3-4 questions d'un coup (surcharge qui décourage)
- Projeter des chiffres non vérifiés si profil vide (salaires, doses, charges spécifiques)
- Inventer un contexte que l'athlète n'a pas confirmé

Format : 8-15 lignes max, tutoiement, ton chaleureux et professionnel, pas d'emoji décoratif.`;
  }

  // ─── Chantier #12 — Calendar capture via chat (v63.12.1) ──────────────────
  // Actif dès le 2e échange (agentExchangeCount >= 1), calendrier vide ou non.
  // Session 1 exclue volontairement (l'agent se présente déjà dans ce contexte).
  // La condition calendarEmpty et la limite de 5 échanges ont été levées.
  const _excCount = typeof agentExchangeCount === 'number' ? agentExchangeCount : 0;
  if (_excCount >= 1) {
    systemWithLang += `\n\n[CALENDRIER — CAPTURE AUTOMATIQUE]
Si dans SON MESSAGE l'athlète mentionne explicitement une date + un événement sportif (match, entraînement, compétition, repos, blessure), tu dois :
1. Confirmer brièvement dans ta réponse que tu l'as ajouté à son calendrier ("Noté, je l'ajoute à ton calendrier.").
2. Ajouter à la TOUTE FIN de ta réponse, sur une ligne seule, ce tag :
[CAL_EVENT:type=entrainement|date=2026-06-15|title=Entraînement|time=10:00]

Types valides : match, competition, entrainement, repos, blessure
Date : YYYY-MM-DD obligatoire — si l'athlète dit "samedi" ou "dans 3 jours", calcule depuis la date du jour fournie dans le contexte
Time : HH:MM — inclus uniquement si mentionné, sinon omets le champ time
Title : nom de l'événement tel que l'athlète l'a nommé (max 60 chars)

RÈGLE STRICTE : n'inclus le tag QUE si l'athlète mentionne explicitement une date ET un événement dans son message. Ne force jamais la question calendrier si le sujet n'est pas abordé.`;
  }

  // Build conversation with more history for better memory
  const messages = [];
  if (history && history.length > 0) {
    history.slice(-28).forEach(msg => {
      if (msg.from === 'user') messages.push({ role: 'user', content: msg.text });
      else if (msg.from === 'agent' && msg.text !== agent.greeting) messages.push({ role: 'assistant', content: msg.text });
    });
  }
  // Build user content — with vision support if image is attached
  let userContent;
  if (image && imageType) {
    userContent = [
      { type: 'image', source: { type: 'base64', media_type: imageType, data: image } },
      { type: 'text', text: message + "\n\n[L'utilisateur a joint cette image. Décris ce que tu vois et réponds en fonction de ton rôle d'agent spécialisé.]" }
    ];
  } else {
    userContent = message;
  }
  messages.push({ role: 'user', content: userContent });

  const startTs = Date.now();
  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: modelConfig.id,
        max_tokens: modelConfig.maxTokens,
        temperature: modelConfig.temperature,
        system: systemWithLang,
        messages
      })
    });
  } catch (fetchErr) {
    const latencyMs = Date.now() - startTs;
    console.error('[CHAT] fetch error:', fetchErr.message);
    captureError(fetchErr, { context: { user_id: user.id, agent_id: agentId, model: modelConfig.id, error_code: 'claude_network_error' }, level: 'error' });
    await logUsage({ userId: user.id, agentId, model: modelConfig.id, latencyMs, success: false, errorCode: 'claude_network_error' });
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Claude API unreachable' }) };
  }

  if (!response.ok) {
    const err = await response.text();
    const latencyMs = Date.now() - startTs;
    console.error(`[CHAT] model=${modelKey} (${modelConfig.id}) status=${response.status} err=`, err);
    captureError(new Error(`Claude API ${response.status}: ${err.slice(0, 500)}`), { context: { user_id: user.id, agent_id: agentId, model: modelConfig.id, status: response.status, error_code: `claude_api_${response.status}` }, level: response.status >= 500 ? 'error' : 'warning' });
    await logUsage({ userId: user.id, agentId, model: modelConfig.id, latencyMs, success: false, errorCode: `claude_api_${response.status}` });
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Claude API error' }) };
  }

  const data = await response.json();
  const latencyMs = Date.now() - startTs;
  const inputTokens = data.usage?.input_tokens ?? null;
  const outputTokens = data.usage?.output_tokens ?? null;

  console.log(`[CHAT] model=${modelKey} id=${modelConfig.id} agent=${agentId} email=${effectiveEmail || 'anon'} input=${inputTokens} output=${outputTokens} latency=${latencyMs}ms plan=${plan} tier=${tier} usage=${volumeCount + 1}/${volumeLimit}`);

  // Log usage (non-blocking, fire-and-await for consistency)
  await logUsage({
    userId: user.id, agentId, model: modelConfig.id,
    inputTokens, outputTokens, latencyMs, success: true
  });

  // ─── Chantier #5 + v63.12.5 fix — Parse TOUS les [CAL_EVENT:...] d'une réponse ─
  // Correction critique : .match() sans flag 'g' ne capturait que le 1er tag → les
  // programmes multi-séances (David) n'inséraient qu'1 événement sur N.
  // Fix : .matchAll() + loop → tous les tags sont parsés, tous les tags sont supprimés
  // du texte affiché. Insert séquentiel pour éviter les doublons sur rate-limit Supabase.
  let replyText = data.content[0].text;
  const calEventMatches = [...replyText.matchAll(/\[CAL_EVENT:([^\]]+)\]/g)];
  // Supprimer TOUS les tags de la réponse visible (même si l'insert échoue)
  replyText = replyText.replace(/\[CAL_EVENT:[^\]]+\]/g, '').replace(/\n{3,}/g, '\n\n').trim();

  const calendarCreatedList = [];
  const validTypes = ['match', 'competition', 'entrainement', 'repos', 'blessure'];

  for (const match of calEventMatches) {
    const fields = {};
    // v63.18 — Extract description first (must be last field; may contain | if user includes pipes)
    // Everything after "description=" until end of tag content is the description.
    let rawTag = match[1];
    const descIdx = rawTag.indexOf('description=');
    let descValue = null;
    if (descIdx !== -1) {
      descValue = rawTag.slice(descIdx + 'description='.length).trim();
      rawTag = rawTag.slice(0, descIdx);
    }
    rawTag.split('|').forEach(part => {
      const eqIdx = part.indexOf('=');
      if (eqIdx > 0) fields[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim();
    });
    if (descValue) fields.description = descValue;

    const eventType = validTypes.includes(fields.type) ? fields.type : 'entrainement';
    const eventDate = fields.date || null;
    if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) continue;

    const eventPayload = {
      user_id: user.id,
      title: (fields.title || 'Événement sportif').slice(0, 100),
      event_type: eventType,
      event_date: eventDate,
      event_time: (fields.time && /^\d{2}:\d{2}$/.test(fields.time)) ? fields.time : null,
      duration_minutes: fields.duration ? Math.min(parseInt(fields.duration) || 90, 480) : 90,
      notes: fields.description ? fields.description.slice(0, 1000) : 'Ajouté via SPORTVISE'
    };
    try {
      await httpRequest({
        hostname: supabaseHost(),
        path: '/rest/v1/calendar_events',
        method: 'POST',
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify(eventPayload)
      });
      calendarCreatedList.push({ title: eventPayload.title, date: eventDate, type: eventType });
    } catch (e) {
      console.warn('[CHAT] calendar insert failed (non-blocking):', eventDate, e.message);
    }
  }

  // calendarCreated : null | objet unique | tableau (frontend gère les 3 cas)
  const calendarCreated = calendarCreatedList.length === 0 ? null
    : calendarCreatedList.length === 1 ? calendarCreatedList[0]
    : calendarCreatedList;
  if (calendarCreatedList.length > 0) {
    console.log(`[CHAT] ${calendarCreatedList.length} calendar event(s) created via chat`);
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      reply: replyText,
      agent: agent.name,
      model: modelKey,
      modelId: modelConfig.id,
      inputTokens,
      outputTokens,
      latencyMs,
      ...(calendarCreated ? { calendarCreated } : {})
    })
  };
};
