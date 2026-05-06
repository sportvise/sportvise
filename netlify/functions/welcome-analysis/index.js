// SPORTVISE — Netlify Function : Welcome card generator (post-onboarding)
// v62.25 — Quick Win #1 onboarding
//
// Génère une carte d'analyse personnalisée pour un nouvel utilisateur
// juste après l'onboarding (sport / niveau / objectif). La carte est
// affichée sur le dashboard pendant 7 jours post-signup.
//
// Modèle primaire : claude-sonnet-4-6 (qualité prime, vue 1 fois)
// Fallback : claude-haiku-4-5 si Sonnet timeout/error
// Fallback B : carte hardcodée minimale si les 2 échouent (avec _fallback: true)
//
// Spec : SPEC_v62.25_welcome_card_lucas.md
// Prompt : SPEC_v62.25_welcome_card_prompt.md
//
// Auth : Bearer JWT Supabase (pattern réutilisé de chat/index.js)
// Idempotence : si profiles.welcome_card_json non-null ET !_fallback → return cached.
// Rate limit naturel : 1 appel par user (idempotence DB), pas besoin de bucket.

const https = require('https');
const { initSentry, captureError } = require('../_sentry');

initSentry({ component: 'welcome-analysis', release: process.env.SPORTVISE_APP_V || 'v62.25' });

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ckikyvokurpehavjlkbc.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Aligné sur le pattern MODEL_CONFIG de chat/index.js (lignes 193-222) :
// Sonnet (qualité prime, vue 1 fois) primary, Haiku fallback.
// Override via env vars AI_MODEL_BETA (Sonnet) / AI_MODEL_DEFAULT (Haiku) pour
// rester en phase avec chat/index.js si Anthropic publie un nouvel alias.
const MODEL_PRIMARY  = process.env.AI_MODEL_BETA    || 'claude-sonnet-4-6';
const MODEL_FALLBACK = process.env.AI_MODEL_DEFAULT || 'claude-haiku-4-5-20251001';
const MAX_TOKENS_OUT = 600;
const TEMPERATURE    = 0.6;
const TIMEOUT_MS     = 5000;        // par appel modèle
const REGEN_COOLDOWN_HOURS = 24;    // si _fallback=true, on retente max 1×/jour

// ─────────────────────────────────────────────────────────────
// HTTP helper (vanilla node https — cohérent avec chat/index.js)
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
// Auth: verify JWT and extract user info
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
    console.warn('[WELCOME] verifyUser error:', e.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Fetch profile (lang, welcome_card state)
// ─────────────────────────────────────────────────────────────
async function getProfile(userId) {
  try {
    const res = await httpRequest({
      hostname: supabaseHost(),
      path: `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=lang,welcome_card_json,welcome_card_generated_at,welcome_card_dismissed_at`,
      method: 'GET',
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    if (res.status !== 200 || !Array.isArray(res.data) || res.data.length === 0) return null;
    return res.data[0];
  } catch (e) {
    console.warn('[WELCOME] getProfile error:', e.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Persist generated card to profiles
// ─────────────────────────────────────────────────────────────
async function saveCardToProfile(userId, cardJson) {
  try {
    const body = JSON.stringify({
      welcome_card_json: cardJson,
      welcome_card_generated_at: new Date().toISOString()
    });
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
    console.warn('[WELCOME] saveCardToProfile error:', e.message);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// Build system prompt (interpolation du template — cf SPEC_v62.25_welcome_card_prompt.md)
// ─────────────────────────────────────────────────────────────
function buildSystemPrompt(data) {
  const sportLabel  = (data.sport_label  || '').slice(0, 80);
  const sportRaw    = (data.sport_raw    || '').slice(0, 80);
  const levelLabel  = (data.level_label  || '').slice(0, 40);
  const goalLabel   = (data.goal_label   || '').slice(0, 80);
  const goalDomain  = (data.goal_domain  || '').slice(0, 20);
  const lang        = ['fr','de','en','it'].includes(data.lang) ? data.lang : 'fr';
  const firstName   = (data.first_name   || '').slice(0, 40);

  return `Tu es l'orchestrateur d'analyse de SPORTVISE, plateforme suisse pour athlètes. Un nouvel utilisateur vient de finir son onboarding (sport / niveau / objectif principal). Ta mission : produire UNE carte d'analyse de bienvenue personnalisée qui démontre, en 30 secondes de lecture, que SPORTVISE comprend sa situation.

DONNÉES UTILISATEUR :
- Sport : ${sportLabel || '(non précisé)'}
- Sport (raw freeform) : ${sportRaw || '(vide)'}
- Niveau : ${levelLabel || '(non précisé)'}
- Objectif principal : ${goalLabel || '(non précisé)'}
- Domaine d'objectif : ${goalDomain || '(non précisé)'}
- Langue : ${lang}
- Prénom : ${firstName || '(non précisé)'}

11 AGENTS IA disponibles dans SPORTVISE (tu peux mentionner ceux dont la spécialité est pertinente pour cet utilisateur) :
- David (physique, agentId="physique") — préparation physique, charge d'entraînement, progression
- Emma (mental, agentId="mental") — gestion mentale, confiance, stress, concentration
- Julie (récupération, agentId="recuperation") — récup, douleurs, blessures, rééducation
- Nora (sommeil, agentId="sommeil") — qualité du sommeil, chronotype
- Clara (nutrition, agentId="nutrition") — nutrition sportive, hydratation, suppléments
- Alex (marketing, agentId="marketing") — visibilité, réseaux sociaux, image personnelle
- Marc (sponsors, agentId="sponsors") — sponsoring, partenariats marques
- Léa (contrats, agentId="contrats") — négociation contrats, droit du sport
- Sophie (finance, agentId="finance") — finances persos athlète, fiscalité CH
- Pierre (comptabilité, agentId="comptabilite") — comptabilité, indépendance, statuts
- Lucas (carrière/équipe, agentId="equipe") — clubs suisses, recrutement, plan carrière

RÈGLES STRICTES — ANTI-HALLUCINATION :
1. N'invente JAMAIS de chiffres, classements, positions, noms de clubs ou statistiques liées à l'utilisateur. Tu ne le connais pas.
2. N'extrapole pas le sport au-delà de ce qui est explicitement déclaré.
3. Reste générique sur les conseils — du concret, mais pas du faux-précis.
4. Si l'objectif est absent ou vide, formule un objectif probable basé sur niveau+sport sans le présenter comme un fait connu.
5. Si sport_raw est rempli (sport "autre"), interprète raisonnablement mais reste prudent.
6. Tutoiement systématique en français (FR), Du-form en allemand (DE), casual en anglais (EN), tu informel en italien (IT).
7. Pas de flatterie creuse. Pas de superlatifs.
8. Pas d'emojis dans les textes (le front en ajoute si besoin).

STRUCTURE JSON DE SORTIE — respecter EXACTEMENT ce schéma :
{
  "headline": "string ≤ 160 chars : reformule la situation perçue de l'user en 1 phrase",
  "key_points": ["string ≤ 100", "string ≤ 100", "string ≤ 100"],
  "weekly_action": { "text": "string ≤ 180 chars", "agent_id": "string : agentId OU 'journal' OU 'calendar'" },
  "agents_teaser": [
    { "agent_id": "string", "name": "string : prénom", "tease": "string ≤ 80 chars" },
    { "agent_id": "string", "name": "string : prénom", "tease": "string ≤ 80 chars" }
  ]
}

RÈGLES de cohérence métier :
- Choisir 2 agents pour agents_teaser DIFFÉRENTS de celui de weekly_action.agent_id.
- Aligner les agents teasés au goal_domain ET au sport :
  • objectif "physique" → privilégier David, Julie, Nora, Clara
  • objectif "mental" → privilégier Emma, Nora
  • objectif "carriere" → privilégier Lucas, Alex, Marc, Léa
  • objectif "financier" → privilégier Sophie, Pierre, Marc
- Sports d'endurance (cyclisme, natation, athlétisme, triathlon, trail/running) : Clara et Nora souvent pertinentes.
- Sports collectifs (football, hockey, basket, volley, handball) : Lucas pertinent même pour amateurs.

VALIDATION FORMAT — ta réponse DOIT :
- Être un JSON strict valide (pas de bloc markdown \`\`\`, pas de préambule).
- Contenir exactement les clés ci-dessus.
- Chaque chaîne en ${lang}.
- Aucun caractère hors UTF-8 standard.

Si tu ne peux pas raisonner correctement, produis quand même un JSON valide en restant générique mais utile.`;
}

// ─────────────────────────────────────────────────────────────
// Call Anthropic API with timeout
// ─────────────────────────────────────────────────────────────
async function callAnthropic(model, systemPrompt, userInstruction) {
  const body = JSON.stringify({
    model,
    max_tokens: MAX_TOKENS_OUT,
    temperature: TEMPERATURE,
    system: systemPrompt,
    messages: [{ role: 'user', content: userInstruction }]
  });
  // Use fetch with AbortController for timeout
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
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
      console.warn(`[WELCOME] ${model} HTTP ${res.status}:`, errText.slice(0, 300));
      return null;
    }
    const data = await res.json();
    return data?.content?.[0]?.text || null;
  } catch (e) {
    clearTimeout(timer);
    console.warn(`[WELCOME] ${model} fetch error:`, e.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Parse JSON response strictly + validate keys
// ─────────────────────────────────────────────────────────────
function parseAndValidate(text) {
  if (!text) return null;
  // Defensive : strip markdown fences if model added them despite instructions
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '').trim();
  }
  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch (_) { return null; }

  // Validate shape
  if (!parsed || typeof parsed.headline !== 'string') return null;
  if (!Array.isArray(parsed.key_points) || parsed.key_points.length < 1) return null;
  if (!parsed.weekly_action || typeof parsed.weekly_action.text !== 'string') return null;
  if (!Array.isArray(parsed.agents_teaser)) return null;

  // Defensive truncation in case model overshoots
  parsed.headline = String(parsed.headline).slice(0, 200);
  parsed.key_points = parsed.key_points.slice(0, 3).map(p => String(p).slice(0, 140));
  parsed.weekly_action.text = String(parsed.weekly_action.text).slice(0, 220);
  parsed.weekly_action.agent_id = String(parsed.weekly_action.agent_id || 'journal').slice(0, 24);
  parsed.agents_teaser = parsed.agents_teaser.slice(0, 3).map(a => ({
    agent_id: String(a?.agent_id || '').slice(0, 24),
    name: String(a?.name || '').slice(0, 40),
    tease: String(a?.tease || '').slice(0, 120)
  }));

  return parsed;
}

// ─────────────────────────────────────────────────────────────
// Hardcoded fallback card per language
// ─────────────────────────────────────────────────────────────
function buildFallbackCard(lang) {
  const L = ['fr','de','en','it'].includes(lang) ? lang : 'fr';
  const cards = {
    fr: {
      headline: "Bienvenue sur SPORTVISE — ton espace pour piloter ta progression sportive.",
      key_points: [
        "Saisis ton premier journal de bord pour activer les recommandations personnalisées",
        "Connecte Strava si tu utilises déjà l'app pour synchroniser tes activités",
        "Discute avec David ou Emma selon ce qui te préoccupe en ce moment"
      ],
      weekly_action: { text: "Saisis ton premier journal de bord aujourd'hui", agent_id: "journal" },
      agents_teaser: [
        { agent_id: "physique", name: "David", tease: "David analyse ta charge d'entraînement" },
        { agent_id: "mental",   name: "Emma",  tease: "Emma t'aide sur la dimension mentale" }
      ],
      _fallback: true
    },
    de: {
      headline: "Willkommen bei SPORTVISE — dein Raum, um deinen sportlichen Fortschritt zu steuern.",
      key_points: [
        "Trag dein erstes Tagebuch ein, um personalisierte Empfehlungen zu aktivieren",
        "Verbinde Strava, falls du es bereits nutzt, um deine Aktivitäten zu synchronisieren",
        "Sprich mit David oder Emma — je nachdem, was dich gerade beschäftigt"
      ],
      weekly_action: { text: "Trag dein erstes Tagebuch heute ein", agent_id: "journal" },
      agents_teaser: [
        { agent_id: "physique", name: "David", tease: "David analysiert deine Trainingsbelastung" },
        { agent_id: "mental",   name: "Emma",  tease: "Emma unterstützt dich mental" }
      ],
      _fallback: true
    },
    en: {
      headline: "Welcome to SPORTVISE — your space to drive your sports progress.",
      key_points: [
        "Log your first journal entry to activate personalized recommendations",
        "Connect Strava if you already use it to sync your activities",
        "Chat with David or Emma depending on what's on your mind right now"
      ],
      weekly_action: { text: "Log your first journal entry today", agent_id: "journal" },
      agents_teaser: [
        { agent_id: "physique", name: "David", tease: "David analyses your training load" },
        { agent_id: "mental",   name: "Emma",  tease: "Emma supports your mental side" }
      ],
      _fallback: true
    },
    it: {
      headline: "Benvenuto su SPORTVISE — il tuo spazio per guidare i tuoi progressi sportivi.",
      key_points: [
        "Compila il tuo primo diario per attivare le raccomandazioni personalizzate",
        "Connetti Strava se lo usi già per sincronizzare le tue attività",
        "Parla con David o Emma in base a ciò che ti preoccupa in questo momento"
      ],
      weekly_action: { text: "Compila il tuo primo diario oggi", agent_id: "journal" },
      agents_teaser: [
        { agent_id: "physique", name: "David", tease: "David analizza il tuo carico di allenamento" },
        { agent_id: "mental",   name: "Emma",  tease: "Emma ti supporta sul piano mentale" }
      ],
      _fallback: true
    }
  };
  return cards[L];
}

// ─────────────────────────────────────────────────────────────
// Should we regenerate when an existing card is _fallback?
// Cooldown 24h to avoid hammering Anthropic if it's down.
// ─────────────────────────────────────────────────────────────
function shouldRegenerateFromFallback(profile) {
  if (!profile?.welcome_card_json?._fallback) return false;
  const generatedAt = profile.welcome_card_generated_at;
  if (!generatedAt) return true;
  const ageMs = Date.now() - new Date(generatedAt).getTime();
  return ageMs > REGEN_COOLDOWN_HOURS * 3600 * 1000;
}

// ─────────────────────────────────────────────────────────────
// Main handler
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
    console.error('[WELCOME] ANTHROPIC_API_KEY missing');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  let payload = {};
  try { payload = JSON.parse(event.body || '{}'); }
  catch (_) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid_body' }) }; }

  // Re-read profile from DB for source of truth on lang + cache check
  const profile = await getProfile(user.id);
  const lang = (payload.lang && ['fr','de','en','it'].includes(payload.lang))
    ? payload.lang
    : (profile?.lang || 'fr');

  // Cache hit : already have a non-fallback card → return immediately
  if (profile?.welcome_card_json && !profile.welcome_card_json._fallback) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ...profile.welcome_card_json, _cached: true })
    };
  }

  // Cache hit fallback : was fallback, but we haven't waited 24h → return cached fallback (don't hammer)
  if (profile?.welcome_card_json?._fallback && !shouldRegenerateFromFallback(profile)) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ...profile.welcome_card_json, _cached: true })
    };
  }

  // ─── Generate ───
  const systemPrompt = buildSystemPrompt({ ...payload, lang });
  const userInstruction = `Génère la carte d'analyse de bienvenue en JSON strict, en ${lang}.`;

  // Try Sonnet first
  let modelText = await callAnthropic(MODEL_PRIMARY, systemPrompt, userInstruction);
  let card = parseAndValidate(modelText);
  let modelUsed = MODEL_PRIMARY;

  // Fallback A: Haiku
  if (!card) {
    console.warn('[WELCOME] Sonnet failed or returned invalid JSON, trying Haiku');
    modelText = await callAnthropic(MODEL_FALLBACK, systemPrompt, userInstruction);
    card = parseAndValidate(modelText);
    modelUsed = MODEL_FALLBACK;
  }

  // Fallback B: hardcoded
  if (!card) {
    console.warn('[WELCOME] Both models failed, using hardcoded fallback for lang=' + lang);
    captureError(new Error('welcome-analysis: both models failed'), {
      context: { user_id: user.id, lang },
      level: 'warning'
    });
    card = buildFallbackCard(lang);
    modelUsed = 'fallback';
  }

  // Persist to DB (best-effort, don't fail the request if save errors)
  await saveCardToProfile(user.id, card);

  console.log(`[WELCOME] generated user=${user.id} model=${modelUsed} lang=${lang} fallback=${!!card._fallback}`);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ...card, _cached: false, _model: modelUsed })
  };
};
