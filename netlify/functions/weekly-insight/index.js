// SPORTVISE — Netlify Function : Weekly insight generator (Idée 3 STRATEGIE)
// v62.28 — Coach insight hebdomadaire signé par un agent en rotation
//
// Génère une analyse hebdomadaire personnalisée basée sur les daily_log + events
// des 7 derniers jours. Régénéré chaque lundi (changement de semaine ISO).
//
// Modèle primaire : claude-sonnet-4-6 (qualité prime, données chiffrées)
// Fallback A : claude-haiku-4-5 si Sonnet timeout/error
// Fallback B : insight pédagogique hardcodé multi-langues si data insuffisante
//             OU si les 2 modèles échouent (avec _fallback: true)
//
// Spec : SPEC_v62.28_weekly_insight.md
// Pattern : aligné sur welcome-analysis (v62.25)
//
// Auth : Bearer JWT Supabase (pattern verifyUser réutilisé)
// Idempotence : si profiles.weekly_insight_iso_week === current ISO week ET
//               !_fallback → return cached. Si _fallback → cooldown 24h.
// Rate limit naturel : 1 appel par user par semaine (idempotence DB).

const https = require('https');
const { initSentry, captureError } = require('../_sentry');

initSentry({ component: 'weekly-insight', release: process.env.SPORTVISE_APP_V || 'v62.28' });

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ckikyvokurpehavjlkbc.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const MODEL_PRIMARY  = process.env.AI_MODEL_BETA    || 'claude-sonnet-4-6';
const MODEL_FALLBACK = process.env.AI_MODEL_DEFAULT || 'claude-haiku-4-5-20251001';
const MAX_TOKENS_OUT = 800;
const TEMPERATURE    = 0.5; // un peu plus bas que welcome (qui était 0.6) car on
                            // veut des chiffres exacts, moins de créativité.
const TIMEOUT_PRIMARY_MS  = 6000;
const TIMEOUT_FALLBACK_MS = 4000;
const REGEN_COOLDOWN_HOURS = 24; // si _fallback=true, retry max 1×/jour

// Pool de 7 agents pour la rotation hebdo (cf. SPEC §3.2)
// Exclut Sophie/Pierre/Marc/Léa (aspirationnels, pas pertinents pour insight data-driven).
const AGENT_POOL = [
  { id: 'physique',     name: 'David',  emoji: '🏋️' },
  { id: 'mental',       name: 'Emma',   emoji: '🧠' },
  { id: 'sommeil',      name: 'Nora',   emoji: '😴' },
  { id: 'recuperation', name: 'Julie',  emoji: '♻️' },
  { id: 'nutrition',    name: 'Clara',  emoji: '🥗' },
  { id: 'equipe',       name: 'Lucas',  emoji: '💼' },
  { id: 'marketing',    name: 'Alex',   emoji: '🎯' }
];

// P0-2 fix code review : filtrer le pool selon le plan user pour éviter
// qu'un user Free reçoive un insight signé par David/Nora/Julie/Alex (verrouillés)
// → CTA "Parler à {agent}" mènerait à un mur paywall. Doit matcher la logique
// FREE_AGENTS / PLUS_AGENTS du dashboard.html.
function effectiveAgentPool(userPlan) {
  const plan = (userPlan || 'free').toLowerCase();
  if (plan === 'pro') return AGENT_POOL; // tous les 7
  if (plan === 'plus') {
    // Plus : equipe, mental, nutrition, physique, sommeil, recuperation (pas Alex)
    return AGENT_POOL.filter(a => a.id !== 'marketing');
  }
  // Free : equipe, mental, nutrition seulement
  return AGENT_POOL.filter(a => ['equipe', 'mental', 'nutrition'].includes(a.id));
}

// ─────────────────────────────────────────────────────────────
// HTTP helper (vanilla node https)
// ─────────────────────────────────────────────────────────────
function httpRequest({ hostname, path, method, headers, body, timeoutMs }) {
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
    if (timeoutMs) {
      req.setTimeout(timeoutMs, () => { req.destroy(new Error('request_timeout')); });
    }
    if (body) req.write(body);
    req.end();
  });
}

function supabaseHost() {
  return SUPABASE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

// ─────────────────────────────────────────────────────────────
// ISO week number (Monday-Sunday, ISO 8601)
// ─────────────────────────────────────────────────────────────
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Thursday-pivot : ISO weeks are determined by which Thursday falls in them
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// ─────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────
async function verifyUser(accessToken) {
  if (!accessToken) return null;
  try {
    const res = await httpRequest({
      hostname: supabaseHost(),
      path: '/auth/v1/user',
      method: 'GET',
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${accessToken}` },
    });
    if (res.status !== 200 || !res.data?.id) return null;
    return { id: res.data.id, email: res.data.email, created_at: res.data.created_at };
  } catch (e) {
    console.warn('[WEEKLY-INSIGHT] verifyUser error:', e.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Fetch profile state
// ─────────────────────────────────────────────────────────────
async function getProfile(userId) {
  try {
    const res = await httpRequest({
      hostname: supabaseHost(),
      path: `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=lang,sport,level,weekly_insight_json,weekly_insight_generated_at,weekly_insight_iso_week,weekly_insight_dismissed_at`,
      method: 'GET',
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    if (res.status !== 200 || !Array.isArray(res.data) || res.data.length === 0) return null;
    return res.data[0];
  } catch (e) {
    console.warn('[WEEKLY-INSIGHT] getProfile error:', e.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Fetch user context (last 7 days daily_log + events past + future)
// ─────────────────────────────────────────────────────────────
async function fetchUserContext(userId) {
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
  const sevenDaysAhead = new Date(now);
  sevenDaysAhead.setUTCDate(sevenDaysAhead.getUTCDate() + 7);

  const fmt = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  const fromDate = fmt(sevenDaysAgo);
  const toDate = fmt(sevenDaysAhead);
  const todayDate = fmt(now);

  const ctx = { logs: [], pastEvents: [], futureEvents: [] };

  // P1-7 fix : Promise.allSettled + timeout 3s sur chaque requête (parallélisation
  // des 3 endpoints Supabase indépendants). Si l'un timeout, les autres continuent.
  // Économise ~200-400ms vs séquentiel et évite blocage 30s+ Node default.
  const sbHeaders = { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` };
  const requests = [
    httpRequest({
      hostname: supabaseHost(),
      path: `/rest/v1/daily_log?user_id=eq.${encodeURIComponent(userId)}&log_date=gte.${fromDate}&log_date=lte.${todayDate}&select=log_date,mood,energy,pain_level,sleep_quality,motivation,nutrition_quality,training_done,is_quick&order=log_date.desc`,
      method: 'GET', headers: sbHeaders, timeoutMs: 3000
    }),
    httpRequest({
      hostname: supabaseHost(),
      path: `/rest/v1/calendar_events?user_id=eq.${encodeURIComponent(userId)}&event_date=gte.${fromDate}&event_date=lt.${todayDate}&select=event_date,event_type,intensity,status,recap,duration_minutes&order=event_date.desc`,
      method: 'GET', headers: sbHeaders, timeoutMs: 3000
    }),
    httpRequest({
      hostname: supabaseHost(),
      path: `/rest/v1/calendar_events?user_id=eq.${encodeURIComponent(userId)}&event_date=gte.${todayDate}&event_date=lte.${toDate}&select=event_date,event_type,intensity,duration_minutes&order=event_date.asc`,
      method: 'GET', headers: sbHeaders, timeoutMs: 3000
    })
  ];
  const results = await Promise.allSettled(requests);
  const [logsR, pastR, futR] = results;
  if (logsR.status === 'fulfilled' && logsR.value.status === 200 && Array.isArray(logsR.value.data)) ctx.logs = logsR.value.data;
  if (pastR.status === 'fulfilled' && pastR.value.status === 200 && Array.isArray(pastR.value.data)) ctx.pastEvents = pastR.value.data;
  if (futR.status === 'fulfilled' && futR.value.status === 200 && Array.isArray(futR.value.data)) ctx.futureEvents = futR.value.data;
  if (logsR.status === 'rejected' || pastR.status === 'rejected' || futR.status === 'rejected') {
    console.warn('[WEEKLY-INSIGHT] fetchUserContext partial fail:',
      results.map(r => r.status === 'rejected' ? r.reason?.message : 'ok').join(' / '));
  }

  return ctx;
}

// ─────────────────────────────────────────────────────────────
// Compute focus angle based on saliency (cf. SPEC §3.3)
// ─────────────────────────────────────────────────────────────
function computeAngle(ctx) {
  const logs = ctx.logs || [];
  const events = ctx.pastEvents || [];
  if (logs.length < 2 && events.length < 1) return 'pedagogic';

  // Pain trending up?
  const painVals = logs.filter(l => l.pain_level != null).map(l => l.pain_level);
  const avgPain = painVals.length ? painVals.reduce((a,b)=>a+b,0)/painVals.length : 0;
  if (avgPain >= 3) return 'recovery';

  // Sleep trending down?
  const sleepVals = logs.filter(l => l.sleep_quality != null).map(l => l.sleep_quality);
  const avgSleep = sleepVals.length ? sleepVals.reduce((a,b)=>a+b,0)/sleepVals.length : 0;
  if (sleepVals.length >= 3 && avgSleep <= 2.5) return 'sleep';

  // Mood low?
  const moodVals = logs.filter(l => l.mood != null).map(l => l.mood);
  const avgMood = moodVals.length ? moodVals.reduce((a,b)=>a+b,0)/moodVals.length : 0;
  if (moodVals.length >= 3 && avgMood <= 3) return 'mental';

  // Volume saillant ?
  if (events.length >= 3) return 'volume';

  // Default : sleep si peu de signal (sleep est l'angle le plus universel)
  return 'sleep';
}

// ─────────────────────────────────────────────────────────────
// Select agent for the week (rotation deterministe + anti-repeat immédiat)
// ─────────────────────────────────────────────────────────────
function selectAgent(userId, isoWeek, prevAgentId, angle, userPlan) {
  // P0-2 fix : utilise le pool filtré selon le plan user.
  const pool = effectiveAgentPool(userPlan);
  if (pool.length === 0) return AGENT_POOL[1]; // ultime fallback : Emma (mental, free)

  // Hash (très basique) pour stabilité par user+week
  let hash = 0;
  const s = `${userId}-${isoWeek}`;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  let idx = Math.abs(hash) % pool.length;

  // Bias selon angle : si focus pertinent ET dispo dans le pool, on essaie d'aligner
  const angleAgentMap = {
    recovery: 'recuperation',
    sleep: 'sommeil',
    mental: 'mental',
    volume: 'physique',
    pedagogic: null
  };
  const preferredId = angleAgentMap[angle];
  if (preferredId) {
    const preferredIdx = pool.findIndex(a => a.id === preferredId);
    if (preferredIdx >= 0 && preferredIdx !== idx) {
      // 60% chance de prendre l'aligned agent (pour ne pas être 100% prédictible)
      if (Math.abs(hash) % 10 < 6) idx = preferredIdx;
    }
  }

  // Anti-repeat immédiat : si même que la semaine d'avant ET pool > 1, shift +1
  if (prevAgentId && pool[idx].id === prevAgentId && pool.length > 1) {
    idx = (idx + 1) % pool.length;
  }

  return pool[idx];
}

// ─────────────────────────────────────────────────────────────
// Persist insight to DB
// ─────────────────────────────────────────────────────────────
async function saveInsight(userId, json, isoWeek, resetDismiss) {
  try {
    // P0-1 fix : ne reset dismissed_at que sur changement de iso_week (nouvelle
    // semaine = nouvelle carte = nouveau dismiss potentiel). Si on régénère pour
    // la MÊME semaine (cas cooldown fallback ou force), garder dismissed_at en
    // place pour ne pas faire revenir une carte déjà fermée par l'user.
    const patch = {
      weekly_insight_json: json,
      weekly_insight_generated_at: new Date().toISOString(),
      weekly_insight_iso_week: isoWeek
    };
    if (resetDismiss) patch.weekly_insight_dismissed_at = null;
    const body = JSON.stringify(patch);
    const res = await httpRequest({
      hostname: supabaseHost(),
      path: `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body
    });
    return res.status >= 200 && res.status < 300;
  } catch (e) {
    console.warn('[WEEKLY-INSIGHT] saveInsight error:', e.message);
    return false;
  }
}

function shouldRegenerateFromFallback(profile) {
  if (!profile?.weekly_insight_generated_at) return true;
  const last = new Date(profile.weekly_insight_generated_at).getTime();
  if (isNaN(last)) return true;
  const ageHours = (Date.now() - last) / 36e5;
  return ageHours >= REGEN_COOLDOWN_HOURS;
}

// ─────────────────────────────────────────────────────────────
// Build system prompt
// ─────────────────────────────────────────────────────────────
function buildSystemPrompt({ profile, ctx, agent, angle, lang }) {
  const sport = (profile?.sport || '').slice(0, 80);
  const level = (profile?.level || '').slice(0, 40);
  const L = ['fr','de','en','it'].includes(lang) ? lang : 'fr';

  // Sérialise le contexte pour le prompt (compact)
  const logsStr = (ctx.logs || []).slice(0, 7).map(l => {
    const parts = [`${l.log_date}`];
    if (l.energy != null) parts.push(`énergie=${l.energy}/5`);
    if (l.mood != null) parts.push(`humeur=${l.mood}/5`);
    if (l.pain_level != null) parts.push(`douleur=${l.pain_level}/5`);
    if (l.sleep_quality != null) parts.push(`sommeil=${l.sleep_quality}/5`);
    if (l.motivation != null) parts.push(`motivation=${l.motivation}/5`);
    if (l.is_quick) parts.push('(check-in 30s)');
    return parts.join(', ');
  }).join('\n');

  const pastStr = (ctx.pastEvents || []).slice(0, 10).map(e =>
    `${e.event_date} : ${e.event_type || '?'}, intensité=${e.intensity || '?'}, statut=${e.status || '?'}` + (e.recap ? `, récap="${(e.recap || '').slice(0, 80)}"` : '')
  ).join('\n');

  const futStr = (ctx.futureEvents || []).slice(0, 7).map(e =>
    `${e.event_date} : ${e.event_type || '?'}, intensité=${e.intensity || '?'}`
  ).join('\n');

  return `Tu es ${agent.name}, agent SPORTVISE spécialisé. Tu produis l'insight hebdomadaire personnalisé pour un athlète suisse, basé STRICTEMENT sur les données de sa semaine écoulée. Format : carte concise et actionable, 30 secondes de lecture.

PROFIL UTILISATEUR :
- Sport : ${sport || '(non précisé)'}
- Niveau : ${level || '(non précisé)'}
- Langue : ${L}

DONNÉES DES 7 DERNIERS JOURS — DAILY LOGS (1 ligne par jour rempli) :
${logsStr || '(aucun journal sur la période)'}

ÉVÉNEMENTS PASSÉS (7 derniers jours) :
${pastStr || '(aucun événement)'}

ÉVÉNEMENTS PRÉVUS (7 prochains jours) :
${futStr || '(aucun événement prévu)'}

ANGLE D'ANALYSE PRESCRIT POUR CETTE SEMAINE : ${angle}
- volume : commenter charge d'entraînement, fréquence, intensité
- recovery : commenter douleurs, récupération, signal de fatigue
- mental : commenter humeur, motivation, gestion psychologique
- sleep : commenter qualité sommeil, impact sur récup
- pedagogic : pas assez de data — expliquer comment maximiser l'utilité de l'app

RÈGLES STRICTES — ANTI-HALLUCINATION :
1. NE CITE QUE des chiffres présents dans les données ci-dessus. Pas d'invention.
2. Si les données sont insuffisantes, DIS-LE OUVERTEMENT. Pas de pseudo-précision.
3. Pas d'extrapolation au-delà des signaux fournis (ne pas deviner sa fatigue cardiaque depuis ses RPE).
4. Pas de promesses de transformation ("en 4 semaines tu seras...").
5. Ton CH : direct, factuel, pas de flatterie creuse, pas d'emojis dans les textes.
6. Tutoiement systématique en français (FR), Du-form en allemand (DE), casual en anglais (EN), tu informel en italien (IT).
7. Réponds en ${L}.

STRUCTURE JSON DE SORTIE — respecter EXACTEMENT ce schéma :
{
  "headline": "string ≤ 160 chars : phrase 1 ligne qui résume le signal saillant de la semaine",
  "observations": ["string ≤ 130", "string ≤ 130", "string ≤ 130"],
  "recommendation": "string ≤ 280 chars : 1 conseil concret pour la semaine prochaine"
}

CONTRAINTES :
- 2 ou 3 observations chiffrées (utilise les vrais chiffres des données)
- Recommendation : actionnable, mesurable, simple
- Pas de bloc markdown \`\`\`, pas de préambule, JSON strict valide uniquement.

Si data insuffisante (angle = pedagogic), produis un insight pédagogique honnête : "Je n'ai pas encore assez de signal cette semaine. Voici comment maximiser l'utilité de tes check-ins...".`;
}

// ─────────────────────────────────────────────────────────────
// Call Anthropic API
// ─────────────────────────────────────────────────────────────
async function callAnthropic(model, systemPrompt, userInstruction, timeoutMs) {
  const body = JSON.stringify({
    model,
    max_tokens: MAX_TOKENS_OUT,
    temperature: TEMPERATURE,
    system: systemPrompt,
    messages: [{ role: 'user', content: userInstruction }]
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || TIMEOUT_PRIMARY_MS);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body,
      signal: ctrl.signal
    });
    clearTimeout(timer);
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[WEEKLY-INSIGHT] ${model} HTTP ${res.status}:`, errText.slice(0, 300));
      return null;
    }
    const data = await res.json();
    return data?.content?.[0]?.text || null;
  } catch (e) {
    clearTimeout(timer);
    console.warn(`[WEEKLY-INSIGHT] ${model} fetch error:`, e.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Parse + validate
// ─────────────────────────────────────────────────────────────
function parseAndValidate(text) {
  if (!text) return null;
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();
  }
  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch (_) { return null; }

  if (!parsed || typeof parsed.headline !== 'string') return null;
  if (!Array.isArray(parsed.observations) || parsed.observations.length < 1) return null;
  if (typeof parsed.recommendation !== 'string') return null;

  parsed.headline = String(parsed.headline).slice(0, 200);
  parsed.observations = parsed.observations.slice(0, 3).map(o => String(o).slice(0, 180));
  parsed.recommendation = String(parsed.recommendation).slice(0, 320);

  return parsed;
}

// ─────────────────────────────────────────────────────────────
// Hardcoded pedagogic fallback per language
// ─────────────────────────────────────────────────────────────
function buildFallbackInsight(lang, agent) {
  const L = ['fr','de','en','it'].includes(lang) ? lang : 'fr';
  const headlines = {
    fr: 'Pas assez de signal cette semaine — voici comment activer le moteur',
    de: 'Diese Woche zu wenig Signal — so aktivierst du den Motor',
    en: "Not enough signal this week — here's how to activate the engine",
    it: 'Non c\'è abbastanza segnale questa settimana — ecco come attivare il motore'
  };
  const observations = {
    fr: [
      'Le check-in 30 secondes (3 sliders) suffit pour que je puisse t\'aider concrètement',
      'Les événements dans le calendrier me donnent le contexte de ta charge',
      'Pas besoin d\'écrire un journal long — le minimum suffit'
    ],
    de: [
      'Der 30-Sekunden-Check-in (3 Slider) reicht, damit ich dir konkret helfen kann',
      'Termine im Kalender geben mir den Kontext deiner Belastung',
      'Kein langes Tagebuch nötig — das Minimum reicht'
    ],
    en: [
      'The 30-second check-in (3 sliders) is enough for me to actually help you',
      'Events in the calendar give me the context of your load',
      "No need for a long journal — the minimum is enough"
    ],
    it: [
      'Il check-in di 30 secondi (3 cursori) basta per aiutarti concretamente',
      'Gli eventi nel calendario mi danno il contesto del tuo carico',
      'Non serve un diario lungo — il minimo basta'
    ]
  };
  const recommendations = {
    fr: 'Cette semaine, 1 objectif unique : un check-in par jour, même rapide. Lundi prochain je te ferai une vraie analyse chiffrée.',
    de: 'Diese Woche ein einziges Ziel: ein Check-in pro Tag, auch wenn schnell. Nächsten Montag mache ich dir eine echte Analyse mit Zahlen.',
    en: "This week, one goal: one check-in per day, even quick. Next Monday I'll give you a real data-driven analysis.",
    it: 'Questa settimana, un solo obiettivo: un check-in al giorno, anche veloce. Lunedì prossimo ti darò una vera analisi con i numeri.'
  };
  return {
    agent_id: agent.id,
    agent_name: agent.name,
    agent_emoji: agent.emoji,
    headline: headlines[L],
    observations: observations[L],
    recommendation: recommendations[L],
    _fallback: true
  };
}

// ─────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Auth
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const user = await verifyUser(token);
  if (!user) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'auth_invalid' }) };
  }

  if (!ANTHROPIC_API_KEY) {
    console.error('[WEEKLY-INSIGHT] ANTHROPIC_API_KEY missing');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  let payload = {};
  try { payload = JSON.parse(event.body || '{}'); }
  catch (_) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid_body' }) }; }

  const profile = await getProfile(user.id);
  const lang = (payload.lang && ['fr','de','en','it'].includes(payload.lang))
    ? payload.lang
    : (profile?.lang || 'fr');

  const now = new Date();
  const currentIsoWeek = getISOWeek(now);
  const force = !!payload.force;

  // Cache check
  if (!force && profile?.weekly_insight_json && profile.weekly_insight_iso_week === currentIsoWeek) {
    if (!profile.weekly_insight_json._fallback) {
      // Cache hit non-fallback
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ insight: profile.weekly_insight_json, cached: true })
      };
    }
    // Cache hit fallback : check cooldown
    if (!shouldRegenerateFromFallback(profile)) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ insight: profile.weekly_insight_json, cached: true })
      };
    }
  }

  // ─── Generate ───
  const ctx = await fetchUserContext(user.id);
  const angle = computeAngle(ctx);
  const prevAgentId = profile?.weekly_insight_json?.agent_id || null;
  // P0-2 : userPlan transmis par le client pour filtrer le pool d'agents.
  const userPlan = (payload.userPlan || 'free').toLowerCase();
  const agent = selectAgent(user.id, currentIsoWeek, prevAgentId, angle, userPlan);

  // Si data insuffisante (angle pedagogic), on saute Anthropic et on utilise direct le fallback
  let insight = null;
  let modelUsed = 'fallback';

  if (angle !== 'pedagogic') {
    const systemPrompt = buildSystemPrompt({ profile, ctx, agent, angle, lang });
    const userInstruction = `Génère l'insight hebdomadaire en JSON strict, en ${lang}.`;

    let modelText = await callAnthropic(MODEL_PRIMARY, systemPrompt, userInstruction, TIMEOUT_PRIMARY_MS);
    insight = parseAndValidate(modelText);
    modelUsed = MODEL_PRIMARY;

    if (!insight) {
      console.warn('[WEEKLY-INSIGHT] Sonnet failed, trying Haiku');
      modelText = await callAnthropic(MODEL_FALLBACK, systemPrompt, userInstruction, TIMEOUT_FALLBACK_MS);
      insight = parseAndValidate(modelText);
      modelUsed = MODEL_FALLBACK;
    }

    if (insight) {
      // Inject metadata agent (le model ne renvoie que headline/observations/recommendation)
      insight.agent_id = agent.id;
      insight.agent_name = agent.name;
      insight.agent_emoji = agent.emoji;
      insight._iso_week = currentIsoWeek;
      insight._generated_at = now.toISOString();
      insight._fallback = false;
    }
  }

  if (!insight) {
    if (angle !== 'pedagogic') {
      console.warn('[WEEKLY-INSIGHT] Both models failed for user=' + user.id);
      captureError(new Error('weekly-insight: both models failed'), {
        context: { user_id: user.id, lang, angle, agent: agent.id },
        level: 'warning'
      });
    }
    insight = buildFallbackInsight(lang, agent);
    insight._iso_week = currentIsoWeek;
    insight._generated_at = now.toISOString();
    modelUsed = 'fallback';
  }

  // Persist (best-effort). resetDismiss = true seulement si la semaine ISO a
  // changé depuis le dernier insight (nouvelle semaine → on autorise la carte
  // à réapparaître même si la précédente avait été dismissed).
  const resetDismiss = !profile || profile.weekly_insight_iso_week !== currentIsoWeek;
  await saveInsight(user.id, insight, currentIsoWeek, resetDismiss);

  console.log(`[WEEKLY-INSIGHT] generated user=${user.id} model=${modelUsed} lang=${lang} week=${currentIsoWeek} agent=${agent.id} angle=${angle} fallback=${!!insight._fallback}`);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ insight, cached: false, _model: modelUsed, _angle: angle })
  };
};
