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
//   Free : 30 req/min, 10/jour
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
const { SPORTS_SUISSE, CALENDRIERS_SUISSE, AGENTS } = require("./agents-data");

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
    return { id: res.data.id, email: res.data.email };
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
// Rate limit thresholds per plan
// ─────────────────────────────────────────────────────────────
const LIMITS = {
  free: { perMinute: 30, perDay: 10 },
  plus: { perMinute: 30, perDay: 500 },
  pro:  { perMinute: 60, perDay: 1000 },
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
// v45 — Per-model configuration for Haiku (default) / Sonnet (opt-in beta).
// Beta opt-in is driven by env var AI_MODEL_BETA_USERS (comma-separated emails).
// Model IDs are env-overridable so we can swap without redeploying code.
// ─────────────────────────────────────────────────────────────
const MODEL_CONFIG = {
  haiku: {
    id: process.env.AI_MODEL_DEFAULT || 'claude-haiku-4-5-20251001',
    maxTokens: 1200,
    temperature: 1.0,
    systemPrefix: ''
  },
  sonnet: {
    id: process.env.AI_MODEL_BETA || 'claude-sonnet-4-6',
    maxTokens: 800,
    temperature: 0.4,
    systemPrefix: `[CONSIGNES DE STYLE STRICTES — À RESPECTER POUR CHAQUE RÉPONSE]
- Réponds en 2 à 3 paragraphes courts maximum (pas plus).
- Tutoie systématiquement l'athlète (jamais de "vous").
- Termine par UNE seule question OU UN seul appel à l'action concret — pas les deux.
- Pas de listes à puces ni de listes numérotées, SAUF si la réponse en a vraiment besoin (ex : étapes ordonnées d'un protocole). Privilégie des phrases fluides en prose.
- N'invente JAMAIS d'URL, de lien, de site web, de marque ni de produit que tu n'es pas certain d'avoir vu apparaître dans le contexte fourni. Si tu ne connais pas un lien précis, dis "cherche sur Google" ou "demande à ta fédération".
- Ton conversationnel et concret, pas académique.

`
  }
};

function pickModel(userEmail) {
  const betaUsersRaw = process.env.AI_MODEL_BETA_USERS || '';
  if (!userEmail || !betaUsersRaw) return 'haiku';
  const betaSet = new Set(
    betaUsersRaw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  );
  return betaSet.has(String(userEmail).trim().toLowerCase()) ? 'sonnet' : 'haiku';
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
  const { agentId, message, history, lang, profile, otherAgents, calendar, style, goals, dailyLog, smartContext, image, imageType, userEmail } = parsed;

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

  // ─── v60 — Rate limit check ───
  const plan = await getUserPlan(user.id);
  const limits = LIMITS[plan] || LIMITS.free;

  const now = Date.now();
  const oneMinuteAgoIso = new Date(now - 60 * 1000).toISOString();
  const oneDayAgoIso = new Date(now - 24 * 3600 * 1000).toISOString();

  const [minuteCount, dayCount] = await Promise.all([
    countUsageSince(user.id, oneMinuteAgoIso),
    countUsageSince(user.id, oneDayAgoIso),
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
        limit: limits.perMinute,
        retry_after: 60,
        message: "Trop de messages d'un coup. Réessaie dans une minute."
      }),
    };
  }

  if (dayCount >= limits.perDay) {
    await logUsage({ userId: user.id, agentId, success: false, errorCode: 'rate_limit_day' });
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({
        error: 'rate_limit',
        scope: 'day',
        plan,
        limit: limits.perDay,
        message: plan === 'free'
          ? `Tu as utilisé tes ${limits.perDay} messages gratuits aujourd'hui. Repasse demain ou passe au plan Plus.`
          : `Tu as atteint ta limite quotidienne (${limits.perDay} messages). Réessaie demain.`
      }),
    };
  }

  // ─── Existing logic (Claude API call) ───
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    await logUsage({ userId: user.id, agentId, success: false, errorCode: 'api_key_missing' });
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  // v45 — pick Haiku or Sonnet (use email from JWT first, fallback to body for compat)
  const effectiveEmail = user.email || userEmail;
  const modelKey = pickModel(effectiveEmail);
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
  let systemWithLang = (modelConfig.systemPrefix || '') + agent.system + '\n\n' + langInstruction + '\n\n' + dateInstruction;

  if (profile) {
    systemWithLang += `\n\n[PROFIL ATHLÈTE - utilise ces infos pour personnaliser chaque réponse]\n${profile}`;
  }
  if (otherAgents) {
    systemWithLang += `\n\n[CONTEXTE INTER-AGENTS - sujets récents discutés avec d'autres agents SPORTVISE. Utilise ces infos si pertinent pour enrichir ta réponse, faire des liens entre les domaines, ou suggérer de consulter un autre agent.]\n${otherAgents}`;
  }
  if (calendar) {
    systemWithLang += `\n\n[CALENDRIER SPORTIF - événements à venir de l'athlète. UTILISE ACTIVEMENT ces informations pour :\n- Adapter tes conseils au timing (ex: "tu as un match demain, voici ce que je recommande...")\n- Planifier la préparation en fonction des échéances\n- Alerter sur les priorités imminentes\n- Proposer un programme adapté au calendrier de compétition\nÉvénements :\n${calendar}]`;
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
Les données ci-dessous (classements, résultats, tendances, calendrier) sont ACTUELLES et FIABLES — utilise-les dans tes réponses.
Ne dis JAMAIS que tu n'as pas accès à des données live ou à Internet — SPORTVISE te fournit ces données automatiquement.
Les ALERTES sont prioritaires : adapte TOUJOURS ta réponse en conséquence.
Les TENDANCES t'indiquent l'évolution sur 7 jours : utilise-les pour anticiper et personnaliser.
Si tu détectes qu'un autre domaine est concerné, recommande l'agent approprié naturellement.
${smartContext}`;
  }
  if (style) {
    systemWithLang += `\n\n[STYLE DE COMMUNICATION]\n${style}`;
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
    await logUsage({ userId: user.id, agentId, model: modelConfig.id, latencyMs, success: false, errorCode: 'claude_network_error' });
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Claude API unreachable' }) };
  }

  if (!response.ok) {
    const err = await response.text();
    const latencyMs = Date.now() - startTs;
    console.error(`[CHAT] model=${modelKey} (${modelConfig.id}) status=${response.status} err=`, err);
    await logUsage({ userId: user.id, agentId, model: modelConfig.id, latencyMs, success: false, errorCode: `claude_api_${response.status}` });
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Claude API error' }) };
  }

  const data = await response.json();
  const latencyMs = Date.now() - startTs;
  const inputTokens = data.usage?.input_tokens ?? null;
  const outputTokens = data.usage?.output_tokens ?? null;

  console.log(`[CHAT] model=${modelKey} id=${modelConfig.id} agent=${agentId} email=${effectiveEmail || 'anon'} input=${inputTokens} output=${outputTokens} latency=${latencyMs}ms plan=${plan} day=${dayCount + 1}/${limits.perDay}`);

  // Log usage (non-blocking, fire-and-await for consistency)
  await logUsage({
    userId: user.id, agentId, model: modelConfig.id,
    inputTokens, outputTokens, latencyMs, success: true
  });

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      reply: data.content[0].text,
      agent: agent.name,
      model: modelKey,
      modelId: modelConfig.id,
      inputTokens,
      outputTokens,
      latencyMs
    })
  };
};
