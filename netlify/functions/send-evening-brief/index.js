// SPORTVISE — Netlify Function : Send Evening Brief
// ═══════════════════════════════════════════════════════════════════
// Déclenchée à 20h30 CEST (18:30 UTC) par le scheduler natif de Netlify.
// Itère sur les users opt-in qui n'ont PAS encore rempli leur daily_log
// du jour (mood absent) et leur envoie un push Web Push 🌙.
//
// Différences vs send-morning-brief :
//   - Pas de construction de brief contextualisé — message fixe court (4L)
//   - Check daily_log du JOUR (non d'hier) : si mood renseigné → skip
//   - Auth : triggered par Netlify scheduler (pas de token HTTP) OU
//     POST manuel avec X-Trigger-Token (tests)
//
// Env vars requises : mêmes que send-morning-brief
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
//   SUPABASE_URL, SUPABASE_SERVICE_KEY
//   BRIEF_TRIGGER_TOKEN (optionnel — pour test manuel uniquement)
// ═══════════════════════════════════════════════════════════════════

const https   = require('https');
const webpush = require('web-push');
const { initSentry, captureError } = require('../_sentry');

initSentry({ component: 'evening-brief', release: process.env.SPORTVISE_APP_V || 'v63.40' });

const SUPABASE_URL        = process.env.SUPABASE_URL || 'https://ckikyvokurpehavjlkbc.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BRIEF_TRIGGER_TOKEN  = process.env.BRIEF_TRIGGER_TOKEN;
const MAX_USERS_PER_RUN    = 50;

// ─────────────────────────────────────────────────────────────
// HTTP helper (identique send-morning-brief)
// ─────────────────────────────────────────────────────────────
function httpRequest({ hostname, path, method, headers, body, timeoutMs = 8000 }) {
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
        resolve({ status: res.statusCode, data: parsed, raw: data });
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`httpRequest timeout after ${timeoutMs}ms`));
    });
    if (body) req.write(body);
    req.end();
  });
}

function supabaseHost() {
  return SUPABASE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

// ─────────────────────────────────────────────────────────────
// VAPID setup
// ─────────────────────────────────────────────────────────────
function setupWebPush() {
  const pub     = process.env.VAPID_PUBLIC_KEY;
  const priv    = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:thomas.castella1@gmail.com';
  if (!pub || !priv) { console.error('[EVE] VAPID keys missing'); return false; }
  webpush.setVapidDetails(subject, pub, priv);
  return true;
}

// ─────────────────────────────────────────────────────────────
// Récupère les users opt-in avec leur subscription.
// Identique à send-morning-brief (2 queries séparées — FK cross-schema).
// ─────────────────────────────────────────────────────────────
async function fetchOptedInUsers(limit) {
  const profilesRes = await httpRequest({
    hostname: supabaseHost(),
    path: `/rest/v1/profiles?morning_brief_optin=eq.on&select=id,full_name,lang&limit=${limit}`,
    method: 'GET',
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
  });
  if (profilesRes.status !== 200 || !Array.isArray(profilesRes.data) || profilesRes.data.length === 0) {
    console.warn('[EVE] profiles fetch failed or empty:', profilesRes.status);
    return [];
  }

  const userIds  = profilesRes.data.map(p => p.id);
  const inFilter = `(${userIds.join(',')})`;
  const subsRes  = await httpRequest({
    hostname: supabaseHost(),
    path: `/rest/v1/push_subscriptions?user_id=in.${encodeURIComponent(inFilter)}&select=user_id,endpoint,p256dh,auth&fail_count=lt.5`,
    method: 'GET',
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
  });
  if (subsRes.status !== 200 || !Array.isArray(subsRes.data)) {
    console.warn('[EVE] subscriptions fetch failed:', subsRes.status);
    return [];
  }

  const subsByUser = {};
  subsRes.data.forEach(s => {
    if (!subsByUser[s.user_id]) subsByUser[s.user_id] = [];
    subsByUser[s.user_id].push(s);
  });

  return profilesRes.data
    .map(p => ({ ...p, push_subscriptions: subsByUser[p.id] || [] }))
    .filter(p => p.push_subscriptions.length > 0);
}

// ─────────────────────────────────────────────────────────────
// Vérifie si le daily_log du JOUR contient déjà une humeur.
// Si oui → skip (brief déjà rempli).
// ─────────────────────────────────────────────────────────────
async function hasTodayLog(userId, todayStr) {
  const res = await httpRequest({
    hostname: supabaseHost(),
    path: `/rest/v1/daily_log?user_id=eq.${userId}&log_date=eq.${todayStr}&select=mood&limit=1`,
    method: 'GET',
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
  });
  if (res.status !== 200 || !Array.isArray(res.data) || res.data.length === 0) return false;
  return res.data[0].mood != null;
}

// ─────────────────────────────────────────────────────────────
// Construit le payload push du soir (court, 4 langues).
// ─────────────────────────────────────────────────────────────
function buildEveningPayload(profile, todayStr) {
  const lang      = (profile.lang || 'fr').toLowerCase();
  const firstName = (profile.full_name || '').split(' ')[0] || '';

  const MSGS = {
    fr: {
      title: 'SPORTVISE 🌙',
      body:  firstName
        ? `${firstName}, 30 secondes pour nourrir tes coachs IA — bilan du soir 👇`
        : `30 secondes pour nourrir tes coachs IA — bilan du soir 👇`,
    },
    de: {
      title: 'SPORTVISE 🌙',
      body:  firstName
        ? `${firstName}, 30 Sekunden für deinen Abend-Check-in — deine KI-Coaches warten 👇`
        : `30 Sekunden für deinen Abend-Check-in — deine KI-Coaches warten 👇`,
    },
    en: {
      title: 'SPORTVISE 🌙',
      body:  firstName
        ? `${firstName}, 30 seconds to fuel your AI coaches — evening check-in 👇`
        : `30 seconds to fuel your AI coaches — evening check-in 👇`,
    },
    it: {
      title: 'SPORTVISE 🌙',
      body:  firstName
        ? `${firstName}, 30 secondi per i tuoi coach IA — riepilogo serale 👇`
        : `30 secondi per i tuoi coach IA — riepilogo serale 👇`,
    },
  };

  const m = MSGS[lang] || MSGS.fr;
  return {
    title: m.title,
    body:  m.body.slice(0, 200),
    url:   '/dashboard.html',
    tag:   `evening-brief-${todayStr}`,
  };
}

// ─────────────────────────────────────────────────────────────
// Envoi web-push (identique send-morning-brief)
// ─────────────────────────────────────────────────────────────
async function sendToSubscription(sub, payloadJson) {
  try {
    const sendPromise = webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payloadJson,
      { TTL: 4 * 3600 } // 4h — brief du soir périme vite
    );
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('webpush timeout 8s')), 8000)
    );
    await Promise.race([sendPromise, timeoutPromise]);
    return { ok: true };
  } catch (err) {
    const status = err && err.statusCode;
    console.error('[EVE] webpush error: status=', status, 'message=', err && err.message);
    if (status === 410 || status === 404 || status === 401) {
      try {
        await httpRequest({
          hostname: supabaseHost(),
          path: `/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`,
          method: 'DELETE',
          headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
        });
      } catch (_) {}
      return { ok: false, reason: 'gone', cleaned: true, status };
    }
    return { ok: false, reason: 'send_error', status };
  }
}

// ─────────────────────────────────────────────────────────────
// Log usage
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
        user_id:  null,
        endpoint: 'evening_brief',
        agent_id: `users=${stats.totalUsers},sent=${stats.sent},skipped=${stats.skipped},failed=${stats.failed}`,
        success:  stats.failed === 0,
        latency_ms: stats.latencyMs,
      }),
    });
  } catch (e) {
    console.warn('[EVE] logRun error:', e.message);
  }
}

// ─────────────────────────────────────────────────────────────
// Handler principal
// ─────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const startTs = Date.now();

  // Auth : Netlify scheduler (pas de header) OU test manuel avec token
  const tokenHeader  = event.headers?.['x-trigger-token'] || event.headers?.['X-Trigger-Token'];
  const isScheduled  = !tokenHeader;                               // invocation scheduler
  const isManual     = tokenHeader === BRIEF_TRIGGER_TOKEN;        // test manuel
  if (!isScheduled && !isManual) {
    console.warn('[EVE] auth failure');
    return { statusCode: 401, body: JSON.stringify({ error: 'unauthorized' }) };
  }

  if (!setupWebPush()) {
    return { statusCode: 500, body: JSON.stringify({ error: 'VAPID not configured' }) };
  }

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Zurich' });
  console.log(`[EVE] starting — todayStr=${todayStr}`);

  const users = await fetchOptedInUsers(MAX_USERS_PER_RUN);
  console.log(`[EVE] opted-in users with subs: ${users.length}`);

  const stats = { totalUsers: users.length, sent: 0, skipped: 0, failed: 0, cleaned: 0 };

  for (const user of users) {
    try {
      // Skip if daily_log already has mood for today
      const alreadyFilled = await hasTodayLog(user.id, todayStr);
      if (alreadyFilled) {
        console.log(`[EVE] user=${user.id} already filled — skip`);
        stats.skipped++;
        continue;
      }

      const payload    = buildEveningPayload(user, todayStr);
      const payloadStr = JSON.stringify(payload);

      for (const sub of user.push_subscriptions) {
        const result = await sendToSubscription(sub, payloadStr);
        if (result.ok)              stats.sent++;
        else if (result.cleaned)    stats.cleaned++;
        else                        stats.failed++;
      }
    } catch (e) {
      console.warn(`[EVE] user=${user.id} error:`, e.message);
      stats.failed++;
    }
  }

  stats.latencyMs = Date.now() - startTs;
  console.log(`[EVE] done:`, JSON.stringify(stats));
  await logRun(stats);

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, ...stats }),
  };
};
