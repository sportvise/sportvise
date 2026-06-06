// SPORTVISE — Netlify Function : Multi-agent Meeting (Idée 7 STRATEGIE / audit 4.3)
// ═══════════════════════════════════════════════════════════════════
// "Demande à ton équipe" — orchestrateur multi-agents.
// Réutilise les patterns de chat/index.js (verifyUser, httpRequest, logUsage,
// agents-data, GARDE_FOUS_GLOBAUX) mais en lance 3 en parallèle sur une seule
// question, retournant les 3 réponses pour affichage en dialogue structuré.
//
// Killer feature ProductHunt : aucun concurrent ne peut afficher 3 conseillers
// experts qui répondent en parallèle, contextualisés au profil athlète. Cf.
// audit section 4.3 : "Imagine le screenshot. Aucun concurrent ne peut faire ça."
//
// Quotas par plan (3× le coût Claude API d'un chat simple, donc rationnés) :
//   Free : pas d'accès → 403 paywall
//   Plus : 2 meetings/mois
//   Pro  : illimité (limite per-day héritée de chat = garde-fou abus)
//
// Coût estimé Claude (Haiku) : ~$0.005 × 3 calls = $0.015 par meeting.
// ═══════════════════════════════════════════════════════════════════

const https = require('https');
const { AGENTS, GARDE_FOUS_GLOBAUX } = require("../chat/agents-data");
const { initSentry, captureError } = require('../_sentry');

initSentry({ component: 'meeting', release: process.env.SPORTVISE_APP_V || 'v63' });

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ckikyvokurpehavjlkbc.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// ─────────────────────────────────────────────────────────────
// HTTP helper (vanilla node https — cohérent avec chat/index.js)
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
// Auth: verify JWT and extract user info (copied from chat/index.js)
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
    if (res.status !== 200) return null;
    return res.data || null;
  } catch (e) {
    console.warn('[MEETING] verifyUser error:', e.message);
    return null;
  }
}

async function getUserPlan(userId) {
  if (!userId) return 'free';
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
    console.warn('[MEETING] getUserPlan error:', e.message);
    return 'free';
  }
}

// ─────────────────────────────────────────────────────────────
// Quotas par plan/tier (meetings/mois). Free = 0 = paywall complet.
// v63.8 — Refonte free plan : tier 'trial' (compte free < TRIAL_DAYS jours)
// = essai 14 jours avec accès aux réunions (2/mois, comme Plus). Kill switch
// SV_TRIAL_ENABLED : false = pas d'overlay essai (free reste paywallé à 0).
// ─────────────────────────────────────────────────────────────
const SV_TRIAL_ENABLED = true;   // kill switch — false = désactive l'overlay essai
const TRIAL_DAYS = 14;
const MEETING_QUOTAS = {
  free:  { perMonth: 0 },         // pas d'accès
  trial: { perMonth: 2 },         // essai 14 jours — réunions incluses
  plus:  { perMonth: 2 },         // 2 meetings par mois calendaire
  pro:   { perMonth: 9999 },      // de facto illimité
};

// Count meeting usage for a user since the start of the current calendar month.
// v63.1.0 — On compte UNIQUEMENT les 1ers tours d'une réunion (1 meeting = 1 thread).
// Les follow-ups (tours 2-5) sont loggés avec agent_id suffixé ":turn{N}" et exclus
// du compte via filter agent_id=not.like.%25:turn%25.
async function countMeetingsThisMonth(userId) {
  try {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
    const sinceIso = monthStart.toISOString();
    // success=true (vraies réussites) + agent_id PAS de suffixe :turn (donc 1ers tours seulement).
    // %25 = URL-encoded '%' (wildcard SQL).
    const path = `/rest/v1/api_usage_log?user_id=eq.${encodeURIComponent(userId)}&endpoint=eq.meeting&success=eq.true&agent_id=not.like.%25%3Aturn%25&ts=gte.${encodeURIComponent(sinceIso)}&select=id`;
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
    const cr = res.headers?.['content-range'] || '';
    const m = /\/(\d+)$/.exec(cr);
    return m ? parseInt(m[1], 10) : 0;
  } catch (e) {
    console.warn('[MEETING] countMeetingsThisMonth error:', e.message);
    // Fail-open : on ne bloque pas un user payant sur un transient DB error.
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────
// Log a single meeting call (success or error) into api_usage_log.
// ─────────────────────────────────────────────────────────────
async function logUsage({ userId, agentIds, model, inputTokens, outputTokens, latencyMs, success, errorCode }) {
  if (!userId) return;
  // agent_id field stocke le triplet sous forme "a,b,c" pour debug ; le compte
  // pour quotas se fait par count(*) où endpoint='meeting'.
  const body = JSON.stringify({
    user_id: userId,
    endpoint: 'meeting',
    agent_id: Array.isArray(agentIds) ? agentIds.join(',') : (agentIds || null),
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
    console.warn('[MEETING] logUsage failed (non-blocking):', e.message);
  }
}

// ─────────────────────────────────────────────────────────────
// Model config (v63.6) — TOUS les plans → Sonnet 4.6. Opus dormant (réactivable pour Pro
// en 1 ligne dans pickModel). Beta override → Opus pour comparer la qualité depuis le
// compte interne. Le meeting déclenche 3 calls en parallèle donc le coût est ×3 par
// session — c'est pourquoi on garde maxTokens plus serré qu'en chat 1-1.
// ─────────────────────────────────────────────────────────────
const MODEL_CONFIG = {
  haiku: {
    id: process.env.AI_MODEL_DEFAULT || 'claude-haiku-4-5-20251001',
    maxTokens: 600,            // plus court qu'un chat (3× le call → 3× max_tokens cumulés)
    temperature: 1.0,
    systemPrefix: ''
  },
  sonnet: {
    id: process.env.AI_MODEL_BETA || 'claude-sonnet-4-6',
    maxTokens: 500,
    temperature: 0.4,
    systemPrefix: `[CONSIGNES MEETING — RESPECTE STRICTEMENT]
- Réponds en 2 paragraphes courts maximum (le user va lire 3 réponses, sois concis).
- Tutoie systématiquement.
- Pas de listes à puces sauf nécessité absolue.
- Reste dans TON domaine d'expertise — ne déborde pas sur les autres agents qui répondent en parallèle à la même question.
- Termine par UNE seule recommandation actionnable.

`
  },
  opus: {
    id: process.env.AI_MODEL_PREMIUM || 'claude-opus-4-6',
    maxTokens: 500,
    temperature: 0.4,
    systemPrefix: `[CONSIGNES MEETING — RESPECTE STRICTEMENT]
- Réponds en 2 paragraphes courts maximum (le user va lire 3 réponses, sois concis).
- Tutoie systématiquement.
- Pas de listes à puces sauf nécessité absolue.
- Reste dans TON domaine d'expertise — ne déborde pas sur les autres agents qui répondent en parallèle à la même question.
- Termine par UNE seule recommandation actionnable.
- Tu es l'expert haut de gamme du plan Pro : pousse la spécificité (chiffres, références au sport pratiqué, anticipation) tout en restant dans ton domaine.

`
  }
};

function pickModel(userEmail, plan) {
  // 1. Override interne (QA / beta testing) — permet de forcer Opus pour comparer.
  const betaUsersRaw = process.env.AI_MODEL_BETA_USERS || '';
  if (userEmail && betaUsersRaw) {
    const betaSet = new Set(
      betaUsersRaw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
    );
    if (betaSet.has(String(userEmail).trim().toLowerCase())) return 'opus';
  }
  // 2. Tous les plans → Sonnet. Opus dormant dans MODEL_CONFIG, réactivable plus tard
  //    pour le plan Pro si on valide le différenciateur paywall. Pour l'instant on
  //    n'augmente pas le coût Pro tant que le segment cible n'est pas validé (mémoire
  //    test_amis_13_05). Le paramètre `plan` reste dans la signature pour réactivation.
  return 'sonnet';
}

// ─────────────────────────────────────────────────────────────
// Constantes threading (v63.1.0)
// ─────────────────────────────────────────────────────────────
const MAX_TURNS_PER_MEETING = 5;

// ─────────────────────────────────────────────────────────────
// Build system prompt for one agent in meeting context.
// Marque explicitement à l'agent qu'il est en RÉUNION avec d'autres agents,
// pour qu'il reste dans son domaine et complète au lieu de tout couvrir.
//
// v63.1.0 : ajoute optionnellement un bloc "ce que les autres agents ont dit
// aux tours précédents" pour permettre à l'agent de référencer/compléter
// les contributions des collègues sans répéter.
// ─────────────────────────────────────────────────────────────
function buildHistoryContextBlock(history, agentId) {
  if (!Array.isArray(history) || history.length === 0) return '';
  let h = '\n\n[CONTEXTE DE LA RÉUNION — ce que les AUTRES agents ont dit aux tours précédents]';
  history.forEach((turn, idx) => {
    h += `\n\nTour ${idx + 1} — Question athlète : "${(turn.question || '').slice(0, 500)}"`;
    (turn.responses || []).forEach(r => {
      if (r && r.agentId && r.agentId !== agentId && r.reply) {
        // Tronque chaque reply à 600 chars pour limiter le coût input tokens.
        const snippet = String(r.reply).slice(0, 600);
        h += `\n- ${r.agent_name || r.agentId} : ${snippet}`;
      }
    });
  });
  h += '\n\nUtilise ce contexte pour compléter ou affiner — ne répète pas ce que les autres ont déjà dit.';
  return h;
}

function buildMeetingSystem(agent, otherAgentNames, lang, profile, calendar, dailyLog, modelConfig, history, agentId) {
  // v63.34 — instruction langue renforcée et déplacée à la fin du prompt (recency effect)
  const langInstructions = {
    fr: '[LANGUE OBLIGATOIRE — INSTRUCTION FINALE] Tu dois IMPÉRATIVEMENT répondre en français, quelle que soit la langue des instructions précédentes, du profil ou des exemples.',
    de: '[PFLICHTSPRACHE — ABSCHLIESSENDE ANWEISUNG] Du musst ZWINGEND auf Deutsch antworten, unabhängig von der Sprache der vorherigen Anweisungen.',
    en: '[MANDATORY LANGUAGE — FINAL INSTRUCTION] You MUST respond in English, regardless of the language of any previous instructions, profile, or examples.',
    it: '[LINGUA OBBLIGATORIA — ISTRUZIONE FINALE] Devi rispondere OBBLIGATORIAMENTE in italiano, indipendentemente dalla lingua delle istruzioni precedenti.'
  };
  const langInstruction = langInstructions[lang] || langInstructions.fr;

  const todayLabel = new Date().toLocaleDateString('fr-CH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'Europe/Zurich'
  });
  const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Zurich' });
  const dateInstruction = `[DATE DU JOUR : ${todayLabel} (${todayIso}). Utilise cette date pour tout raisonnement temporel.]`;

  // v63.32 — Inter-agent dialogue flag : 1er tour vs follow-up
  const isFollowupTurn = Array.isArray(history) && history.length > 0;
  const firstOtherName = otherAgentNames[0]?.split(' ')[0] || 'un autre expert';

  // Marqueur MEETING : bloc spécifique qui explique à l'agent qu'il fait partie
  // d'une réunion d'équipe et qu'il doit rester dans son domaine.
  // v63.32 — ajout directive DIALOGUE INTER-AGENTS obligatoire (moat cross-agent)
  const meetingContext = `[MODE RÉUNION D'ÉQUIPE — IMPORTANT]
Tu participes à une réunion d'équipe avec d'autres agents SPORTVISE qui répondent en parallèle à la même question de l'athlète.
Les autres agents présents : ${otherAgentNames.join(', ')}.

Règles spécifiques au mode réunion :
- Réponds UNIQUEMENT depuis ton domaine d'expertise (${agent.name} = ${agent.title || 'spécialiste'}).
- Sois concis : 2-3 paragraphes max, ~150 mots. L'athlète lira ${otherAgentNames.length + 1} réponses en parallèle.
- Termine par UNE recommandation concrète et actionnable de TON domaine.
- Si la question dépasse complètement ton domaine, dis-le brièvement et renvoie vers l'agent approprié.

DIALOGUE INTER-AGENTS (OBLIGATOIRE — c'est ce qui rend cette réunion unique vs un simple chat) :
${!isFollowupTurn
  ? `- 1er tour : Mentionne en 1 phrase ce qu'UN autre expert de la réunion va apporter sur SON domaine ("En complément de ce que ${firstOtherName} te dira sur [...], de mon côté..."), puis développe TON angle. Ne laisse pas ta réponse exister dans le vide — elle fait partie d'un dialogue.`
  : `- Tour de suivi : Réagis EXPLICITEMENT à ce qu'au moins UN autre agent a dit au tour précédent ("En complément de ce que [prénom agent] a suggéré sur [...], de mon côté..." / "Là où [prénom agent] insiste sur [...], j'ajoute..."). Ne répète pas leur contenu — complémente, nuance ou renforce depuis TON domaine.`
}
- La référence croisée = max 2 phrases. Le reste = ton expertise.`;

  // v63.34 — langInstruction déplacée à la FIN (recency effect maximal, écrase tout le contexte précédent)
  let sys = (modelConfig.systemPrefix || '') + agent.system + (GARDE_FOUS_GLOBAUX || '') +
            '\n\n' + dateInstruction + '\n\n' + meetingContext;

  if (profile) {
    sys += `\n\n[PROFIL ATHLÈTE]\n${profile}`;
  }
  if (calendar) {
    sys += `\n\n[CALENDRIER SPORTIF — événements à venir]\n${calendar}`;
  }
  if (dailyLog) {
    sys += `\n\n[ÉTAT DU JOUR — journal de bord]\n${dailyLog}`;
  }
  // v63.1.0 — contexte des autres agents aux tours précédents (threading)
  sys += buildHistoryContextBlock(history, agentId);
  // Langue en dernier — instruction finale, priorité maximale
  sys += '\n\n' + langInstruction;
  return sys;
}

// ─────────────────────────────────────────────────────────────
// Single Claude API call for one agent.
// Returns { reply, agent_name, agentId, inputTokens, outputTokens, latencyMs, error? }
// ─────────────────────────────────────────────────────────────
async function callOneAgent({ agentId, question, history, otherAgentNames, lang, profile, calendar, dailyLog, modelConfig, apiKey }) {
  const agent = AGENTS[agentId];
  if (!agent) {
    return { agentId, error: 'unknown_agent' };
  }

  const systemPrompt = buildMeetingSystem(agent, otherAgentNames, lang, profile, calendar, dailyLog, modelConfig, history, agentId);

  // v63.1.0 — Build messages avec history threading.
  // Pour chaque turn de l'historique : user (question) + assistant (la réponse
  // de CET agent à ce tour). Final message : la nouvelle question.
  // Si l'agent n'avait pas réussi à répondre à un tour passé, on injecte un
  // placeholder pour préserver l'alternance user/assistant attendue par Claude.
  const messages = [];
  if (Array.isArray(history) && history.length > 0) {
    history.forEach(turn => {
      if (!turn || !turn.question) return;
      messages.push({ role: 'user', content: String(turn.question).slice(0, 2000) });
      const myReply = (turn.responses || []).find(r => r && r.agentId === agentId);
      if (myReply && myReply.reply) {
        messages.push({ role: 'assistant', content: String(myReply.reply) });
      } else {
        messages.push({ role: 'assistant', content: '[Je n\'ai pas pu répondre à ce tour, désolé.]' });
      }
    });
  }
  messages.push({ role: 'user', content: question });

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
        system: systemPrompt,
        messages
      })
    });
  } catch (fetchErr) {
    const latencyMs = Date.now() - startTs;
    console.error(`[MEETING] fetch error agent=${agentId}:`, fetchErr.message);
    return { agentId, agent_name: agent.name, error: 'claude_network_error', latencyMs };
  }

  const latencyMs = Date.now() - startTs;
  if (!response.ok) {
    const err = await response.text();
    console.error(`[MEETING] agent=${agentId} status=${response.status} err=`, err.slice(0, 200));
    return { agentId, agent_name: agent.name, error: `claude_api_${response.status}`, latencyMs };
  }

  const data = await response.json();
  return {
    agentId,
    agent_name: agent.name,
    agent_title: agent.title || '',
    reply: data.content[0].text,
    inputTokens: data.usage?.input_tokens ?? null,
    outputTokens: data.usage?.output_tokens ?? null,
    latencyMs,
  };
}

// ─────────────────────────────────────────────────────────────
// Synthesis : 4e appel Sonnet (facilitateur) après Promise.all.
// Génère 3 bullets "Décision de l'équipe" depuis les réponses agents.
// Modèle : Sonnet (même que les agents) — max 200 tokens (très court).
// ─────────────────────────────────────────────────────────────
function buildSynthesisSystem(lang) {
  // v63.34 — langue EN PREMIER (priorité maximale, évite confusion avec contenus mixtes)
  const langLabels = {
    fr: 'FRANÇAIS',
    de: 'DEUTSCH',
    en: 'ENGLISH',
    it: 'ITALIANO'
  };
  const langLabel = langLabels[lang] || langLabels.fr;
  const langOpening = `[LANGUE OBLIGATOIRE : ${langLabel}. Toute ta réponse doit être dans cette langue.]\n\n`;

  return langOpening + `Tu es le facilitateur de la réunion d'équipe SPORTVISE.
Ton rôle : synthétiser les conseils des experts (qui peuvent être dans des langues variées) en 3 points d'action concrets pour l'athlète.

RÈGLES STRICTES :
- Exactement 3 bullets, chacun ≤ 18 mots.
- Commence chaque bullet par un verbe à l'impératif (tutoie l'athlète).
- Ne cite pas les experts par nom.
- Aucune intro, aucune conclusion, aucun titre — seulement les 3 bullets.
- Chaque bullet = une action concrète et immédiatement actionnable.
- Format exact : "• [action]" × 3 lignes, rien d'autre.
- Ignore les différences de langue dans les réponses des experts — synthétise le contenu.`;
}

async function callSynthesis({ question, responses, lang, modelConfig, apiKey }) {
  const successes = responses.filter(r => !r.error && r.reply);
  if (successes.length < 2) return null;

  const responsesText = successes.map(r =>
    `${r.agent_name} (${r.agent_title || 'expert'}) :\n${String(r.reply).slice(0, 600)}`
  ).join('\n\n');

  const userContent = `Question de l'athlète : "${String(question).slice(0, 500)}"\n\nRéponses des experts :\n${responsesText}`;

  const startTs = Date.now();
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: modelConfig.id,
        max_tokens: 200,
        temperature: 0.2,
        system: buildSynthesisSystem(lang),
        messages: [{ role: 'user', content: userContent }]
      })
    });
    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      console.warn('[MEETING] synthesis non-ok status:', response.status, errBody.slice(0, 200));
      return null;
    }
    const data = await response.json();
    const rawText = data.content?.[0]?.text;
    const text = (typeof rawText === 'string' && rawText.trim().length > 0) ? rawText.trim() : null;
    if (!text) {
      console.warn('[MEETING] synthesis empty text — stop_reason:', data.stop_reason, 'content_length:', data.content?.length, 'raw:', JSON.stringify(rawText).slice(0, 100));
      return null;
    }
    console.log(`[MEETING] synthesis done latency=${Date.now() - startTs}ms input=${data.usage?.input_tokens} output=${data.usage?.output_tokens}`);
    return { text, inputTokens: data.usage?.input_tokens ?? null, outputTokens: data.usage?.output_tokens ?? null };
  } catch (e) {
    console.warn('[MEETING] callSynthesis error (non-blocking):', e.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Persistance : save/update le thread dans meeting_threads Supabase.
// Si threadId fourni → upsert (update du thread existant).
// Sinon → insert et retourner l'id généré.
// Non-bloquant : les erreurs DB n'empêchent pas la réponse à l'user.
// ─────────────────────────────────────────────────────────────
async function saveMeetingThread({ userId, threadId, agentIds, turns, synthesis, calendarEventId }) {
  if (!userId) return threadId || null;
  try {
    const payload = {
      user_id: userId,
      agent_ids: agentIds,
      turns: turns,
      synthesis: synthesis || null,
      calendar_event_id: calendarEventId || null,
      updated_at: new Date().toISOString()
    };
    if (threadId) payload.id = threadId;

    const res = await httpRequest({
      hostname: supabaseHost(),
      path: '/rest/v1/meeting_threads',
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify(payload)
    });

    if (res.status === 201 || res.status === 200) {
      const saved = Array.isArray(res.data) ? res.data[0] : res.data;
      return saved?.id || threadId;
    }
    console.warn('[MEETING] saveMeetingThread unexpected status:', res.status);
    return threadId || null;
  } catch (e) {
    console.warn('[MEETING] saveMeetingThread error (non-blocking):', e.message);
    return threadId || null;
  }
}

// ─────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  // CORS — même whitelist que chat
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

  // ─── Auth: Bearer JWT mandatory ───
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
  const { question, agentIds, history, lang, profile, calendar, dailyLog, userEmail,
          threadId, calendarEventId } = parsed;

  // Validation payload
  if (!question || typeof question !== 'string') {
    await logUsage({ userId: user.id, agentIds, success: false, errorCode: 'invalid_payload' });
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing question' }) };
  }
  if (question.length > 2000) {
    await logUsage({ userId: user.id, agentIds, success: false, errorCode: 'question_too_long' });
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Question too long (max 2000 chars)' }) };
  }
  if (!Array.isArray(agentIds) || agentIds.length < 2 || agentIds.length > 4) {
    await logUsage({ userId: user.id, agentIds, success: false, errorCode: 'invalid_agent_count' });
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'agentIds must be array of 2 to 4' }) };
  }
  // v63.1.0 — Validation threading : history optionnel, max MAX_TURNS_PER_MEETING tours
  const safeHistory = Array.isArray(history) ? history : [];
  if (safeHistory.length >= MAX_TURNS_PER_MEETING) {
    await logUsage({ userId: user.id, agentIds, success: false, errorCode: 'max_turns_reached' });
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({
        error: 'max_turns_reached',
        message: `Cette réunion a atteint sa limite de ${MAX_TURNS_PER_MEETING} tours. Démarre une nouvelle réunion.`,
        maxTurns: MAX_TURNS_PER_MEETING
      })
    };
  }
  // Sanity-check : chaque entry de history doit avoir question + responses[]
  for (const t of safeHistory) {
    if (!t || typeof t.question !== 'string' || !Array.isArray(t.responses)) {
      await logUsage({ userId: user.id, agentIds, success: false, errorCode: 'invalid_history' });
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid history shape' }) };
    }
  }
  // Si on est en follow-up, on flag le tour pour les logs analytics
  const isFollowup = safeHistory.length > 0;
  const turnNum = safeHistory.length + 1;
  // Dédoublonnage des agents (au cas où le frontend envoie 2× le même)
  const uniqueAgentIds = [...new Set(agentIds)];
  if (uniqueAgentIds.length !== agentIds.length) {
    await logUsage({ userId: user.id, agentIds, success: false, errorCode: 'duplicate_agents' });
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Duplicate agents in agentIds' }) };
  }
  // Vérifier que tous les agents existent
  for (const aid of uniqueAgentIds) {
    if (!AGENTS[aid]) {
      await logUsage({ userId: user.id, agentIds, success: false, errorCode: 'unknown_agent' });
      return { statusCode: 400, headers, body: JSON.stringify({ error: `Unknown agent: ${aid}` }) };
    }
  }

  // ─── Plan + quotas check (v63.8 — overlay essai) ───
  let plan = await getUserPlan(user.id);

  // ─── ADMIN_EMAILS override (chantier #2 v63.11.3) ───
  const _adminEmailsRaw = process.env.ADMIN_EMAILS || '';
  if (_adminEmailsRaw && user.email) {
    const _adminSet = new Set(
      _adminEmailsRaw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
    );
    if (_adminSet.has(String(user.email).trim().toLowerCase())) plan = 'pro';
  }

  // Tier effectif : compte free récent (< TRIAL_DAYS jours) → 'trial'.
  let tier = plan;
  if (plan === 'free' && SV_TRIAL_ENABLED && user.created_at) {
    const ageMs = Date.now() - new Date(user.created_at).getTime();
    if (ageMs >= 0 && ageMs < TRIAL_DAYS * 24 * 3600 * 1000) tier = 'trial';
  }
  const quota = MEETING_QUOTAS[tier] || MEETING_QUOTAS.free;

  if (quota.perMonth === 0) {
    await logUsage({ userId: user.id, agentIds, success: false, errorCode: 'plan_required' });
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({
        error: 'plan_required',
        message: 'La réunion d\'équipe est réservée aux plans Plus et Pro.',
        upgrade_to: 'plus'
      })
    };
  }

  // v63.1.0 — Quota mensuel checké UNIQUEMENT au 1er tour (history vide).
  // Les follow-ups (tours 2-5) d'un thread déjà lancé ne consomment rien.
  // Logique : 1 meeting = 1 thread, peut contenir jusqu'à 5 tours.
  let monthCount = 0;
  if (!isFollowup) {
    monthCount = await countMeetingsThisMonth(user.id);
    if (monthCount >= quota.perMonth) {
      await logUsage({ userId: user.id, agentIds, success: false, errorCode: 'quota_exceeded' });
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({
          error: 'quota_exceeded',
          message: plan === 'plus'
            ? `Tu as utilisé tes ${quota.perMonth} réunions Plus ce mois. Passe en Pro pour des réunions illimitées.`
            : `Tu as atteint ta limite de ${quota.perMonth} réunions ce mois.`,
          used: monthCount,
          limit: quota.perMonth,
          upgrade_to: plan === 'plus' ? 'pro' : null
        })
      };
    }
  }

  // ─── Claude API key ───
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    await logUsage({ userId: user.id, agentIds, success: false, errorCode: 'api_key_missing' });
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  // ─── Pick model (Haiku par défaut, Sonnet beta) ───
  const effectiveEmail = user.email || userEmail;
  const modelKey = pickModel(effectiveEmail, plan);
  const modelConfig = MODEL_CONFIG[modelKey];

  // ─── Build other-agent-names map for meeting context ───
  // Pour chaque agent, on lui passe les noms des AUTRES agents présents.
  // Permet à l'agent de respecter son périmètre (ne pas empiéter).
  const allNames = uniqueAgentIds.map(aid => {
    const a = AGENTS[aid];
    return `${a.name} (${a.title || 'spécialiste'})`;
  });

  // ─── Lance les 3 (ou 2) appels Claude EN PARALLÈLE ───
  const startTs = Date.now();
  const calls = uniqueAgentIds.map((aid, idx) => {
    const otherNames = allNames.filter((_, i) => i !== idx);
    return callOneAgent({
      agentId: aid,
      question,
      history: safeHistory,           // v63.1.0 — threading
      otherAgentNames: otherNames,
      lang,
      profile,
      calendar,
      dailyLog,
      modelConfig,
      apiKey
    });
  });

  let results;
  try {
    results = await Promise.all(calls);
  } catch (err) {
    console.error('[MEETING] Promise.all unexpected error:', err);
    captureError(err, { context: { user_id: user.id, agent_ids: uniqueAgentIds, error_code: 'meeting_orchestration' }, level: 'error' });
    await logUsage({ userId: user.id, agentIds, success: false, errorCode: 'meeting_orchestration' });
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Meeting orchestration error' }) };
  }
  const totalLatencyMs = Date.now() - startTs;

  // ─── Vérifier qu'au moins 1 agent a réussi ; sinon échec global ───
  const successes = results.filter(r => !r.error);
  const failures = results.filter(r => r.error);

  if (successes.length === 0) {
    console.error('[MEETING] all agents failed:', failures.map(f => f.error));
    await logUsage({ userId: user.id, agentIds, success: false, errorCode: 'all_agents_failed' });
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'All agents failed' }) };
  }

  // Aggregate token usage pour le log et le retour
  const totalInputTokens = successes.reduce((s, r) => s + (r.inputTokens || 0), 0);
  const totalOutputTokens = successes.reduce((s, r) => s + (r.outputTokens || 0), 0);

  // ─── Synthèse (4e call Sonnet — facilitateur) ───
  // Non-bloquant : si ça fail, on renvoie quand même les réponses agents.
  let synthesisResult = null;
  if (successes.length >= 2) {
    synthesisResult = await callSynthesis({
      question, responses: results, lang, modelConfig, apiKey
    });
  }

  // ─── Persistance thread ───
  const updatedTurns = [...safeHistory, { question, responses: results }];
  const savedThreadId = await saveMeetingThread({
    userId: user.id,
    threadId: threadId || null,
    agentIds: uniqueAgentIds,
    turns: updatedTurns,
    synthesis: synthesisResult?.text || null,
    calendarEventId: calendarEventId || null
  });

  console.log(`[MEETING] model=${modelKey} agents=${uniqueAgentIds.join(',')} turn=${turnNum}/${MAX_TURNS_PER_MEETING} email=${effectiveEmail || 'anon'} input=${totalInputTokens} output=${totalOutputTokens} latency=${totalLatencyMs}ms plan=${plan} month=${monthCount + (isFollowup ? 0 : 1)}/${quota.perMonth} successes=${successes.length}/${uniqueAgentIds.length} synthesis=${synthesisResult ? 'ok' : 'skip'} threadId=${savedThreadId || 'none'}`);

  // v63.1.0 — Log avec suffixe ":turn{N}" sur agent_id pour les follow-ups.
  // countMeetingsThisMonth les exclut via filter agent_id=not.like.%:turn%.
  // success=true partout (sémantiquement correct : un follow-up qui marche est un succès).
  const agentIdsForLog = isFollowup
    ? uniqueAgentIds.join(',') + `:turn${turnNum}`
    : uniqueAgentIds.join(',');
  await logUsage({
    userId: user.id, agentIds: agentIdsForLog,
    model: modelConfig.id,
    inputTokens: totalInputTokens, outputTokens: totalOutputTokens,
    latencyMs: totalLatencyMs,
    success: true
  });

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      responses: results,    // contient successes + failures (frontend gère affichage)
      synthesis: synthesisResult?.text || null,   // v63.31 — bloc "Décision de l'équipe"
      threadId: savedThreadId || null,             // v63.31 — persistance thread
      meta: {
        plan,
        monthUsed: isFollowup ? monthCount : monthCount + 1,
        monthLimit: quota.perMonth,
        turn: turnNum,
        maxTurns: MAX_TURNS_PER_MEETING,
        isFollowup,
        model: modelKey,
        totalLatencyMs,
        totalInputTokens,
        totalOutputTokens,
        successCount: successes.length,
        failureCount: failures.length,
        hasSynthesis: !!synthesisResult
      }
    })
  };
};
