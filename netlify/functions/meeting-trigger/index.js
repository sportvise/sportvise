// SPORTVISE — Netlify Function : Meeting Trigger (cron H-72)
// ═══════════════════════════════════════════════════════════════════
// Lancée quotidiennement (07h00 CH) via scheduled task Netlify.
// Scanne calendar_events de tous les users actifs : compétitions dans
// 48–96h → upsert meeting_triggers → dashboard affiche la card.
//
// Aucune notification push/email : juste un flag DB lu au chargement.
// Types d'events déclencheurs : competition, match (pas entrainement/repos).
// Agents suggérés selon le type : physique + mental + nutrition par défaut.
// ═══════════════════════════════════════════════════════════════════

const https = require('https');
const { initSentry, captureError } = require('../_sentry');

initSentry({ component: 'meeting-trigger', release: process.env.SPORTVISE_APP_V || 'v63' });

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ckikyvokurpehavjlkbc.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Types d'events qui déclenchent une réunion
const TRIGGER_EVENT_TYPES = new Set(['competition', 'match']);

// Agents suggérés par type d'event (2-4 agents, ordre = priorité d'affichage)
const SUGGESTED_AGENTS = {
  competition: ['physique', 'mental', 'nutrition', 'recuperation'],
  match:       ['physique', 'mental', 'nutrition', 'recuperation'],
  default:     ['physique', 'mental', 'nutrition']
};

// Fenêtre de déclenchement : 48h → 96h avant l'event
const TRIGGER_WINDOW_MIN_H = 48;
const TRIGGER_WINDOW_MAX_H = 96;

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

// Fetch upcoming competition/match events for ALL users in the trigger window
async function fetchUpcomingTriggerEvents() {
  const now = new Date();
  const minDate = new Date(now.getTime() + TRIGGER_WINDOW_MIN_H * 3600 * 1000);
  const maxDate = new Date(now.getTime() + TRIGGER_WINDOW_MAX_H * 3600 * 1000);

  const minStr = minDate.toISOString().slice(0, 10);
  const maxStr = maxDate.toISOString().slice(0, 10);

  // event_type=in.(competition,match) & event_date between min and max
  const path = `/rest/v1/calendar_events?event_type=in.(competition,match)&event_date=gte.${minStr}&event_date=lte.${maxStr}&select=id,user_id,title,event_type,event_date,event_time`;

  try {
    const res = await httpRequest({
      hostname: supabaseHost(),
      path,
      method: 'GET',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`
      }
    });
    if (res.status !== 200 || !Array.isArray(res.data)) {
      console.warn('[MEETING-TRIGGER] fetchUpcomingTriggerEvents status:', res.status);
      return [];
    }
    return res.data;
  } catch (e) {
    console.warn('[MEETING-TRIGGER] fetchUpcomingTriggerEvents error:', e.message);
    return [];
  }
}

// Upsert triggers for each event (idempotent : user_id + calendar_event_id = clé unique)
async function upsertTriggers(events) {
  if (!events.length) return 0;

  let upserted = 0;
  for (const evt of events) {
    const suggested = SUGGESTED_AGENTS[evt.event_type] || SUGGESTED_AGENTS.default;
    const payload = {
      user_id: evt.user_id,
      calendar_event_id: evt.id,
      event_title: evt.title || '',
      event_date: evt.event_date,
      event_time: evt.event_time || null,
      event_type: evt.event_type,
      suggested_agents: suggested,
      triggered_at: new Date().toISOString(),
      shown: false,
      dismissed: false
    };

    try {
      const res = await httpRequest({
        hostname: supabaseHost(),
        path: '/rest/v1/meeting_triggers',
        method: 'POST',
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=ignore-duplicates,return=minimal'
        },
        body: JSON.stringify(payload)
      });
      if (res.status === 201 || res.status === 200) upserted++;
    } catch (e) {
      console.warn('[MEETING-TRIGGER] upsertTrigger error for event', evt.id, ':', e.message);
    }
  }
  return upserted;
}

// Clean up triggers for events already past (évite l'accumulation de vieux triggers)
async function cleanPastTriggers() {
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  try {
    await httpRequest({
      hostname: supabaseHost(),
      path: `/rest/v1/meeting_triggers?event_date=lt.${yesterday}`,
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`
      }
    });
  } catch (e) {
    console.warn('[MEETING-TRIGGER] cleanPastTriggers error (non-blocking):', e.message);
  }
}

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' };

  // Sécurité : cette function est appelée uniquement par le scheduler Netlify.
  // En HTTP direct, on vérifie un secret simple pour éviter les appels non-autorisés.
  if (event.httpMethod === 'GET' || event.httpMethod === 'POST') {
    const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
    const expectedSecret = process.env.CRON_SECRET || '';
    if (expectedSecret && !authHeader.includes(expectedSecret)) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'unauthorized' }) };
    }
  }

  console.log('[MEETING-TRIGGER] Starting scan...');
  const startTs = Date.now();

  try {
    // 1. Clean old triggers first (non-bloquant, on continue même si fail)
    await cleanPastTriggers();

    // 2. Fetch upcoming events in the trigger window
    const events = await fetchUpcomingTriggerEvents();
    console.log(`[MEETING-TRIGGER] Found ${events.length} upcoming events`);

    // 3. Upsert triggers
    const upserted = await upsertTriggers(events);
    const latencyMs = Date.now() - startTs;

    console.log(`[MEETING-TRIGGER] Done. events=${events.length} upserted=${upserted} latency=${latencyMs}ms`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, eventsFound: events.length, triggersUpserted: upserted, latencyMs })
    };
  } catch (err) {
    console.error('[MEETING-TRIGGER] Unexpected error:', err);
    captureError(err, { context: { error_code: 'meeting_trigger_crash' }, level: 'error' });
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'internal_error' }) };
  }
};
