// SPORTVISE — Netlify Function : Admin usage stats sur api_usage_log
// v60.5 — Page admin perso pour observer la consommation Claude par
// user/agent/modèle/jour, calcul coût USD approx, détection abus.
//
// Complément de admin-stats.js (qui fait stats sur les profils users).
// Cette fonction-ci se concentre sur api_usage_log (créée en v60).
//
// SÉCURITÉ :
//   • Authorization: Bearer JWT obligatoire (Supabase access_token)
//   • Email du JWT validé contre ADMIN_EMAILS (whitelist en dur)
//   • Pattern aligné avec /chat v60 (vrai isolement, pas de bypass via body)
//   • Sinon 403, pas de leak.
//
// AGRÉGATS retournés :
//   • summary    : counts (success/error), tokens (in/out), coût USD approx
//   • byDay      : conso par jour sur N jours
//   • byUser     : top 20 users sur la période (user_id anonymisé en prefix 8 chars)
//   • byAgent    : conso par agent
//   • byModel    : conso par modèle
//   • byError    : count par error_code (pour debug)
//   • avgLatency : latence moyenne par agent
//
// PRICING Claude (mai 2026, à confirmer périodiquement) — USD per MTok :
//   claude-haiku-4-5    : 1.00 / 5.00
//   claude-sonnet-4-6   : 3.00 / 15.00
//   claude-opus-4-6     : 15.00 / 75.00
// Fallback inconnu : sonnet rate (cas le plus fréquent).

const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ckikyvokurpehavjlkbc.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const ADMIN_EMAILS = ['thomas.castella1@gmail.com', 'sportvise.pro@gmail.com'];

const PRICING_USD_PER_MTOK = {
  'claude-haiku-4-5':          { in: 1.00,  out: 5.00 },
  'claude-haiku-4-5-20251001': { in: 1.00,  out: 5.00 },
  'claude-sonnet-4-6':         { in: 3.00,  out: 15.00 },
  'claude-opus-4-6':           { in: 15.00, out: 75.00 },
};
const FALLBACK_PRICING = { in: 3.00, out: 15.00 }; // sonnet par défaut

// ─────────────────────────────────────────────────────────────
// HTTP helper (vanilla node https — cohérent avec chat/index.js et delete-account.js)
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
        resolve({ status: res.statusCode, data: parsed, raw: data });
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
// Auth: verify JWT + check ADMIN_EMAILS
// ─────────────────────────────────────────────────────────────
async function verifyAdmin(accessToken) {
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
    if (res.status !== 200 || !res.data?.email) return null;
    const email = String(res.data.email).toLowerCase();
    if (!ADMIN_EMAILS.includes(email)) return null;
    return { id: res.data.id, email };
  } catch (e) {
    console.warn('[ADMIN-USAGE] verifyAdmin error:', e.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// PostgREST GET helper
// ─────────────────────────────────────────────────────────────
async function pgQuery(path) {
  const res = await httpRequest({
    hostname: supabaseHost(),
    path,
    method: 'GET',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      Accept: 'application/json',
    },
  });
  if (res.status >= 300) {
    throw new Error(`PostgREST ${res.status}: ${res.raw}`);
  }
  return res.data;
}

// ─────────────────────────────────────────────────────────────
// Cost calculation — USD per call given model + tokens
// ─────────────────────────────────────────────────────────────
function costUsd(model, inTok, outTok) {
  const p = PRICING_USD_PER_MTOK[model] || FALLBACK_PRICING;
  return ((inTok || 0) * p.in + (outTok || 0) * p.out) / 1_000_000;
}

// ─────────────────────────────────────────────────────────────
// Aggregations (in-memory, single fetch)
// ─────────────────────────────────────────────────────────────
function aggregate(rows) {
  const byDayMap   = new Map();
  const byUserMap  = new Map();
  const byAgentMap = new Map();
  const byModelMap = new Map();
  const byErrorMap = new Map();
  const latencyMap = new Map();

  let totalCalls = 0, totalSuccess = 0, totalErrors = 0;
  let totalIn = 0, totalOut = 0, totalCost = 0;

  for (const r of rows) {
    const day   = (r.ts || '').slice(0, 10);
    const user  = r.user_id || 'unknown';
    const agent = r.agent_id || '—';
    const model = r.model || '—';
    const inT   = r.input_tokens || 0;
    const outT  = r.output_tokens || 0;
    const cost  = costUsd(model, inT, outT);
    const ok    = r.success === true || r.success === 'true';

    totalCalls++;
    totalIn += inT;
    totalOut += outT;
    totalCost += cost;
    if (ok) totalSuccess++; else totalErrors++;

    const bump = (m, k) => {
      const e = m.get(k) || { calls: 0, success: 0, errors: 0, inTok: 0, outTok: 0, costUsd: 0 };
      e.calls++;
      if (ok) e.success++; else e.errors++;
      e.inTok += inT;
      e.outTok += outT;
      e.costUsd += cost;
      m.set(k, e);
    };

    bump(byDayMap,   day);
    bump(byUserMap,  user);
    bump(byAgentMap, agent);
    bump(byModelMap, model);

    if (!ok && r.error_code) {
      byErrorMap.set(r.error_code, (byErrorMap.get(r.error_code) || 0) + 1);
    }

    if (r.latency_ms != null) {
      const e = latencyMap.get(agent) || { sum: 0, count: 0 };
      e.sum += r.latency_ms;
      e.count += 1;
      latencyMap.set(agent, e);
    }
  }

  const round = (v) => Number(v.toFixed(4));
  const mapToArr = (m, keyName) =>
    Array.from(m.entries()).map(([k, v]) => ({ [keyName]: k, ...v, costUsd: round(v.costUsd) }));

  const byDay   = mapToArr(byDayMap, 'day').sort((a, b) => a.day.localeCompare(b.day));
  const byUser  = mapToArr(byUserMap, 'userId')
                    .sort((a, b) => b.calls - a.calls)
                    .slice(0, 20)
                    .map(u => ({ ...u, userId: u.userId.slice(0, 8) + '…' })); // anonymise (privacy)
  const byAgent = mapToArr(byAgentMap, 'agentId').sort((a, b) => b.calls - a.calls);
  const byModel = mapToArr(byModelMap, 'model').sort((a, b) => b.calls - a.calls);
  const byError = Array.from(byErrorMap.entries())
                    .map(([code, count]) => ({ code, count }))
                    .sort((a, b) => b.count - a.count);
  const avgLatency = Array.from(latencyMap.entries())
                       .map(([agentId, v]) => ({ agentId, avgMs: Math.round(v.sum / v.count), n: v.count }))
                       .sort((a, b) => b.avgMs - a.avgMs);

  return {
    summary: {
      totalCalls,
      totalSuccess,
      totalErrors,
      successRate: totalCalls ? Number((totalSuccess / totalCalls).toFixed(4)) : 0,
      totalInputTokens: totalIn,
      totalOutputTokens: totalOut,
      totalCostUsd: round(totalCost),
    },
    byDay,
    byUser,
    byAgent,
    byModel,
    byError,
    avgLatency,
  };
}

// ─────────────────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server config error' }) };
  }

  // Extract Bearer token
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  const admin = await verifyAdmin(accessToken);
  if (!admin) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'forbidden' }) };
  }

  // Range : last 7 days by default, override via ?days=N (capped 1-30)
  const daysParam = parseInt((event.queryStringParameters || {}).days || '7', 10);
  const days = Math.max(1, Math.min(30, isNaN(daysParam) ? 7 : daysParam));
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    // Fetch all rows since `sinceIso`. PostgREST default limit = 1000, on étend à 10000
    // (~30j à 300 calls/jour = 9000 rows max — large marge avant le launch).
    const path = `/rest/v1/api_usage_log?ts=gte.${encodeURIComponent(sinceIso)}&select=ts,user_id,agent_id,model,input_tokens,output_tokens,latency_ms,success,error_code&order=ts.desc&limit=10000`;
    const rows = await pgQuery(path);

    if (!Array.isArray(rows)) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'unexpected_response' }) };
    }

    const result = aggregate(rows);
    result.range = { days, sinceIso, rowsFetched: rows.length };
    result.adminEmail = admin.email;
    result.generatedAt = new Date().toISOString();

    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch (err) {
    console.error('[ADMIN-USAGE] error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'query_failed', detail: err.message }) };
  }
};
