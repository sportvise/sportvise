// SPORTVISE — Netlify Function : Send Morning Brief (Killer Feature #1, Phase B)
// ═══════════════════════════════════════════════════════════════════
// Déclenchée chaque matin à 7h CET par cron-job.org via POST avec header
// X-Trigger-Token. Itère sur les users opt-in avec subscription valide,
// construit un brief court contextualisé, envoie via Web Push (VAPID).
//
// Sans cette fonction, pas de "habit-loop quotidien" donc pas
// d'indispensabilité (cf. audit P1 #9 + STRATEGIE Idée 1, levier #1).
//
// Format du brief (~150 chars max pour rester sous la limite payload Web Push) :
//   "Bonjour {prénom} ! Aujourd'hui : {événement}. {Alerte journal si applicable}"
//
// Env vars requises :
//   VAPID_PUBLIC_KEY       (publique, aussi exposée côté frontend via build.js)
//   VAPID_PRIVATE_KEY      (privée, jamais exposée)
//   VAPID_SUBJECT          (mailto:thomas.castella1@gmail.com)
//   BRIEF_TRIGGER_TOKEN    (header X-Trigger-Token attendu)
//   SUPABASE_SERVICE_KEY   (déjà existant)
//   SUPABASE_URL           (déjà existant, fallback hardcodé)
//
// Cf. RUNBOOK_v63_brief_matinal_setup.md pour la setup manuelle Thomas.
// ═══════════════════════════════════════════════════════════════════

const https = require('https');
const webpush = require('web-push');
const { initSentry, captureError } = require('../_sentry');

initSentry({ component: 'morning-brief', release: process.env.SPORTVISE_APP_V || 'v63.3' });

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ckikyvokurpehavjlkbc.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BRIEF_TRIGGER_TOKEN = process.env.BRIEF_TRIGGER_TOKEN;

// Limite de users traités par invocation (timeout Netlify 25s, web-push ~50-200ms par envoi)
const MAX_USERS_PER_RUN = 50;

// ─────────────────────────────────────────────────────────────
// HTTP helper (réutilisé pattern chat/meeting)
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
        try { parsed = data ? JSON.parse(data) : null; } catch (_) {}
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
// Configuration web-push (VAPID)
// ─────────────────────────────────────────────────────────────
function setupWebPush() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:thomas.castella1@gmail.com';
  if (!pub || !priv) {
    console.error('[BRIEF] VAPID keys missing');
    return false;
  }
  webpush.setVapidDetails(subject, pub, priv);
  return true;
}

// ─────────────────────────────────────────────────────────────
// Récupère les users opt-in avec leur subscription.
// v63.3.3 — Fix : on fait 2 queries séparées au lieu d'un embed PostgREST,
// parce que push_subscriptions.user_id pointe vers auth.users(id), pas vers
// public.profiles(id). Sans FK directe entre les 2 tables PostgREST-accessible,
// l'embed `profiles?select=...,push_subscriptions(...)` retourne null pour
// chaque sub → 0 users matched.
// Format retourné : [{id, full_name, sport, canton, lang, push_subscriptions: [...]}, ...]
// ─────────────────────────────────────────────────────────────
async function fetchOptedInUsers(limit) {
  // Step 1 : profiles avec morning_brief_optin = 'on'
  const profilesPath = `/rest/v1/profiles?morning_brief_optin=eq.on&select=id,full_name,sport,canton,lang&limit=${limit}`;
  const profilesRes = await httpRequest({
    hostname: supabaseHost(),
    path: profilesPath,
    method: 'GET',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  if (profilesRes.status !== 200 || !Array.isArray(profilesRes.data)) {
    console.warn('[BRIEF] fetchOptedInUsers profiles status=', profilesRes.status, 'data=', JSON.stringify(profilesRes.data).slice(0, 300));
    return [];
  }
  if (profilesRes.data.length === 0) return [];

  // Step 2 : push_subscriptions pour ces users
  const userIds = profilesRes.data.map(p => p.id);
  const inFilter = `(${userIds.map(id => `"${id}"`).join(',')})`;
  const subsPath = `/rest/v1/push_subscriptions?user_id=in.${encodeURIComponent(inFilter)}&select=user_id,endpoint,p256dh,auth,lang,fail_count`;
  const subsRes = await httpRequest({
    hostname: supabaseHost(),
    path: subsPath,
    method: 'GET',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  if (subsRes.status !== 200 || !Array.isArray(subsRes.data)) {
    console.warn('[BRIEF] fetchOptedInUsers subs status=', subsRes.status, 'data=', JSON.stringify(subsRes.data).slice(0, 300));
    return [];
  }

  // Step 3 : merger profiles + subscriptions (group by user_id)
  const subsByUser = {};
  subsRes.data.forEach(s => {
    if (!subsByUser[s.user_id]) subsByUser[s.user_id] = [];
    subsByUser[s.user_id].push(s);
  });

  // Retourne les users qui ont au moins 1 subscription
  return profilesRes.data
    .map(p => ({ ...p, push_subscriptions: subsByUser[p.id] || [] }))
    .filter(p => p.push_subscriptions.length > 0);
}

// ─────────────────────────────────────────────────────────────
// Pour chaque user, récupère le contexte du jour : prochain événement +
// dernière entrée daily_log (pour adapter le ton si fatigue/douleurs)
// ─────────────────────────────────────────────────────────────
async function fetchUserContext(userId) {
  const today = new Date();
  const todayStr = today.toLocaleDateString('en-CA', { timeZone: 'Europe/Zurich' });
  const yesterdayStr = new Date(today.getTime() - 86400000).toLocaleDateString('en-CA', { timeZone: 'Europe/Zurich' });

  // Prochain événement aujourd'hui ou demain (max 2j ahead pour "Aujourd'hui : X")
  const dayAfterStr = new Date(today.getTime() + 86400000).toLocaleDateString('en-CA', { timeZone: 'Europe/Zurich' });

  const [eventsRes, logRes] = await Promise.all([
    httpRequest({
      hostname: supabaseHost(),
      path: `/rest/v1/calendar_events?user_id=eq.${userId}&event_date=gte.${todayStr}&event_date=lte.${dayAfterStr}&select=title,event_type,event_date,event_time,location&order=event_date.asc,event_time.asc&limit=1`,
      method: 'GET',
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    }),
    httpRequest({
      hostname: supabaseHost(),
      path: `/rest/v1/daily_log?user_id=eq.${userId}&log_date=eq.${yesterdayStr}&select=mood,energy,sleep_quality,pain_level,training_done&limit=1`,
      method: 'GET',
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    }),
  ]);

  return {
    todayStr,
    nextEvent: (eventsRes.data && eventsRes.data[0]) || null,
    yesterdayLog: (logRes.data && logRes.data[0]) || null,
  };
}

// ─────────────────────────────────────────────────────────────
// Construit le texte du brief matinal pour un user.
// Garde court : <200 chars. i18n basique selon profile.lang.
// ─────────────────────────────────────────────────────────────
function buildBriefPayload(profile, ctx) {
  const lang = (profile.lang || 'fr').toLowerCase();
  const firstName = (profile.full_name || '').split(' ')[0] || '';

  const TEMPLATES = {
    fr: {
      hello: firstName ? `Bonjour ${firstName} !` : 'Bonjour !',
      eventToday: (e) => `Aujourd'hui : ${e.title}${e.event_time ? ' à ' + e.event_time.slice(0,5) : ''}.`,
      eventTomorrow: (e) => `Demain : ${e.title}${e.event_time ? ' à ' + e.event_time.slice(0,5) : ''}.`,
      noEvent: `Pas d'événement aujourd'hui.`,
      lowSleep: `Sommeil moyen → privilégie une journée light.`,
      highPain: `Douleurs hier → écoute ton corps, repos actif recommandé.`,
      lowEnergy: `Énergie basse hier → hydrate-toi bien et mange équilibré.`,
      goodForm: `Forme top hier → tu peux pousser aujourd'hui !`,
      askJournal: `N'oublie pas ton journal du jour.`,
    },
    de: {
      hello: firstName ? `Guten Morgen, ${firstName}!` : 'Guten Morgen!',
      eventToday: (e) => `Heute: ${e.title}${e.event_time ? ' um ' + e.event_time.slice(0,5) : ''}.`,
      eventTomorrow: (e) => `Morgen: ${e.title}${e.event_time ? ' um ' + e.event_time.slice(0,5) : ''}.`,
      noEvent: `Kein Termin heute.`,
      lowSleep: `Mittelmäßiger Schlaf → eher leichter Tag.`,
      highPain: `Schmerzen gestern → hör auf deinen Körper, aktive Ruhe empfohlen.`,
      lowEnergy: `Wenig Energie gestern → hydrieren und ausgewogen essen.`,
      goodForm: `Top-Form gestern → du kannst heute pushen!`,
      askJournal: `Vergiss dein Tagebuch nicht.`,
    },
    en: {
      hello: firstName ? `Good morning, ${firstName}!` : 'Good morning!',
      eventToday: (e) => `Today: ${e.title}${e.event_time ? ' at ' + e.event_time.slice(0,5) : ''}.`,
      eventTomorrow: (e) => `Tomorrow: ${e.title}${e.event_time ? ' at ' + e.event_time.slice(0,5) : ''}.`,
      noEvent: `No event today.`,
      lowSleep: `Average sleep → take it easy today.`,
      highPain: `Pain yesterday → listen to your body, active rest recommended.`,
      lowEnergy: `Low energy yesterday → stay hydrated and eat balanced.`,
      goodForm: `Top form yesterday → you can push today!`,
      askJournal: `Don't forget your daily journal.`,
    },
    it: {
      hello: firstName ? `Buongiorno, ${firstName}!` : 'Buongiorno!',
      eventToday: (e) => `Oggi: ${e.title}${e.event_time ? ' alle ' + e.event_time.slice(0,5) : ''}.`,
      eventTomorrow: (e) => `Domani: ${e.title}${e.event_time ? ' alle ' + e.event_time.slice(0,5) : ''}.`,
      noEvent: `Nessun evento oggi.`,
      lowSleep: `Sonno medio → giornata leggera.`,
      highPain: `Dolore ieri → ascolta il tuo corpo, riposo attivo consigliato.`,
      lowEnergy: `Energia bassa ieri → idratati e mangia equilibrato.`,
      goodForm: `Top forma ieri → puoi spingere oggi!`,
      askJournal: `Non dimenticare il tuo diario.`,
    },
  };
  const t = TEMPLATES[lang] || TEMPLATES.fr;

  // Body construction
  let parts = [];

  // 1. Event line (today preferred, tomorrow fallback)
  if (ctx.nextEvent) {
    if (ctx.nextEvent.event_date === ctx.todayStr) {
      parts.push(t.eventToday(ctx.nextEvent));
    } else {
      parts.push(t.eventTomorrow(ctx.nextEvent));
    }
  } else {
    parts.push(t.noEvent);
  }

  // 2. Tip from yesterday's daily_log (priority: pain > sleep > energy > positive)
  if (ctx.yesterdayLog) {
    const log = ctx.yesterdayLog;
    if (log.pain_level >= 4) parts.push(t.highPain);
    else if (log.sleep_quality && log.sleep_quality <= 2) parts.push(t.lowSleep);
    else if (log.energy && log.energy <= 2) parts.push(t.lowEnergy);
    else if (log.sleep_quality >= 4 && log.energy >= 4 && log.pain_level <= 1) parts.push(t.goodForm);
  } else {
    // Pas de log hier → rappel doux
    parts.push(t.askJournal);
  }

  const body = parts.join(' ');

  return {
    title: `SPORTVISE ☀️ ${t.hello.replace(/\bSPORTVISE\b/g, '').trim()}`.trim() || 'SPORTVISE',
    body: body.slice(0, 200),
    url: '/dashboard.html',
    tag: `morning-brief-${ctx.todayStr}`,
  };
}

// ─────────────────────────────────────────────────────────────
// Envoie le push à une subscription (avec gestion des erreurs typiques)
// ─────────────────────────────────────────────────────────────
async function sendToSubscription(sub, payloadJson) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payloadJson,
      { TTL: 24 * 3600 } // expire dans 24h si pas livré
    );
    return { ok: true };
  } catch (err) {
    // 410 Gone / 404 Not Found → subscription expirée, à supprimer
    const status = err && err.statusCode;
    if (status === 410 || status === 404) {
      try {
        await httpRequest({
          hostname: supabaseHost(),
          path: `/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`,
          method: 'DELETE',
          headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          },
        });
      } catch (_) {}
      return { ok: false, reason: 'gone', cleaned: true };
    }
    return { ok: false, reason: 'send_error', status, message: err.message };
  }
}

// ─────────────────────────────────────────────────────────────
// Log usage (pattern existant — endpoint='morning_brief')
// ─────────────────────────────────────────────────────────────
async function logRun(stats) {
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
      body: JSON.stringify({
        user_id: null,
        endpoint: 'morning_brief',
        agent_id: `users=${stats.totalUsers},sent=${stats.sent},failed=${stats.failed},cleaned=${stats.cleaned}`,
        success: stats.failed === 0,
        latency_ms: stats.latencyMs,
      }),
    });
  } catch (e) {
    console.warn('[BRIEF] logRun error:', e.message);
  }
}

// ─────────────────────────────────────────────────────────────
// Handler principal
// ─────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const startTs = Date.now();

  // 1. Auth via X-Trigger-Token (cron-job.org)
  const tokenHeader = event.headers?.['x-trigger-token'] || event.headers?.['X-Trigger-Token'];
  if (!BRIEF_TRIGGER_TOKEN || tokenHeader !== BRIEF_TRIGGER_TOKEN) {
    console.warn('[BRIEF] auth failure : token header missing or mismatch');
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'unauthorized' })
    };
  }

  // 2. Setup VAPID
  if (!setupWebPush()) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'vapid_misconfigured' })
    };
  }

  // 3. Fetch les users opt-in
  let users;
  try {
    users = await fetchOptedInUsers(MAX_USERS_PER_RUN);
  } catch (e) {
    captureError(e, { context: { error_code: 'fetch_users_error' }, level: 'error' });
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'fetch_users_error', message: e.message })
    };
  }

  console.log(`[BRIEF] processing ${users.length} opted-in user(s)`);

  // 4. Pour chaque user, fetch contexte + send push
  let sent = 0, failed = 0, cleaned = 0;
  for (const user of users) {
    let ctx;
    try {
      ctx = await fetchUserContext(user.id);
    } catch (e) {
      console.warn(`[BRIEF] user=${user.id} fetchContext error:`, e.message);
      failed++;
      continue;
    }

    const payload = buildBriefPayload(user, ctx);
    const payloadJson = JSON.stringify(payload);

    // Envoie à toutes les subscriptions du user (multi-device)
    for (const sub of (user.push_subscriptions || [])) {
      const result = await sendToSubscription(sub, payloadJson);
      if (result.ok) {
        sent++;
      } else {
        failed++;
        if (result.cleaned) cleaned++;
      }
    }
  }

  const latencyMs = Date.now() - startTs;
  const stats = { totalUsers: users.length, sent, failed, cleaned, latencyMs };
  console.log(`[BRIEF] done : ${JSON.stringify(stats)}`);

  await logRun(stats);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(stats)
  };
};
