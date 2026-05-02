// SPORTVISE — Admin Dashboard Function (stats users)
// Utilise la clé service_role pour accéder à toutes les données.
//
// v60.5 — MIGRATION SÉCURITÉ : JWT Bearer Auth obligatoire (pattern aligné avec
// /chat v60 et admin-usage-stats.js v60.5). Avant : POST avec userEmail dans
// body, bypassable en envoyant `{userEmail:"sportvise.pro@gmail.com"}` à
// l'endpoint. Maintenant : Authorization Bearer <access_token> obligatoire,
// validé via /auth/v1/user, email du JWT vérifié contre ADMIN_EMAILS.

const https = require('https');
const { initSentry, captureError } = require('./_sentry');

// v61.3 — observability serveur. No-op gracieux si SENTRY_DSN_SERVER absent.
initSentry({ component: 'admin-stats', release: process.env.SPORTVISE_APP_V || 'v62.5' });

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ckikyvokurpehavjlkbc.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const ADMIN_EMAILS = ['thomas.castella1@gmail.com', 'sportvise.pro@gmail.com'];

// ─────────────────────────────────────────────────────────────
// HTTP helper (vanilla node https — cohérent avec le reste des Netlify Functions)
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
    console.warn('[ADMIN-STATS] verifyAdmin error:', e.message);
    return null;
  }
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Service key manquante' }) };
  }

  // Extract Bearer token + verify admin
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const admin = await verifyAdmin(accessToken);
  if (!admin) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'forbidden' }) };
  }

  try {
    const fetchSB = async (path) => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      return res.json();
    };

    // Requêtes parallèles
    const [profiles, messages, ratings, authUsers] = await Promise.all([
      fetchSB('profiles?select=*&order=updated_at.desc'),
      fetchSB('messages?select=agent_id,role,created_at&order=created_at.desc&limit=500'),
      fetchSB('ratings?select=agent_id,rating,created_at'),
      fetchSB('auth/users?select=id,email,created_at,last_sign_in_at&limit=100')
        .catch(() => []) // fallback si pas accessible
    ]);

    // ── STATS GÉNÉRALES ──────────────────────────────
    const totalAthletes = profiles.length;
    const now = new Date();
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const newThisWeek = profiles.filter(p =>
      p.updated_at && new Date(p.updated_at) > weekAgo
    ).length;
    const newThisMonth = profiles.filter(p =>
      p.updated_at && new Date(p.updated_at) > monthAgo
    ).length;

    // ── RÉPARTITION SPORTS ───────────────────────────
    const sportCounts = profiles.reduce((acc, p) => {
      const sport = p.sport || 'Non renseigné';
      acc[sport] = (acc[sport] || 0) + 1;
      return acc;
    }, {});
    const topSports = Object.entries(sportCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    // ── RÉPARTITION NIVEAUX ──────────────────────────
    const levelCounts = profiles.reduce((acc, p) => {
      const level = p.level || 'Non renseigné';
      acc[level] = (acc[level] || 0) + 1;
      return acc;
    }, {});

    // ── AGENTS LES PLUS UTILISÉS ─────────────────────
    const agentMsgs = messages.filter(m => m.role === 'user').reduce((acc, m) => {
      acc[m.agent_id] = (acc[m.agent_id] || 0) + 1;
      return acc;
    }, {});
    const topAgents = Object.entries(agentMsgs)
      .sort((a, b) => b[1] - a[1]);

    // ── NOTES PAR AGENT ──────────────────────────────
    const agentRatings = ratings.reduce((acc, r) => {
      if (!acc[r.agent_id]) acc[r.agent_id] = { up: 0, down: 0 };
      acc[r.agent_id][r.rating]++;
      return acc;
    }, {});

    // ── MESSAGES PAR JOUR (7 derniers jours) ─────────
    const msgsByDay = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000);
      const key = d.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit' });
      msgsByDay[key] = 0;
    }
    messages.forEach(m => {
      if (new Date(m.created_at) > weekAgo) {
        const key = new Date(m.created_at).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit' });
        if (msgsByDay[key] !== undefined) msgsByDay[key]++;
      }
    });

    // ── CANTONS ──────────────────────────────────────
    const cantonCounts = profiles.reduce((acc, p) => {
      if (p.canton) acc[p.canton] = (acc[p.canton] || 0) + 1;
      return acc;
    }, {});
    const topCantons = Object.entries(cantonCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // ── DERNIERS ATHLÈTES ────────────────────────────
    const recentAthletes = profiles.slice(0, 10).map(p => ({
      name: p.full_name || 'Anonyme',
      sport: p.sport || '—',
      level: p.level || '—',
      club: p.club || '—',
      canton: p.canton || '—',
      updated_at: p.updated_at
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        totalAthletes,
        newThisWeek,
        newThisMonth,
        totalMessages: messages.length,
        totalRatings: ratings.length,
        topSports,
        levelCounts,
        topAgents,
        agentRatings,
        msgsByDay,
        topCantons,
        recentAthletes
      })
    };

  } catch (error) {
    console.error('Admin stats error:', error);
    captureError(error, { context: { admin_email: admin.email }, level: 'error' });
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
