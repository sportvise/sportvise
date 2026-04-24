// SPORTVISE — Admin Dashboard Function
// Utilise la clé service_role pour accéder à toutes les données

const ADMIN_EMAIL = 'sportvise.pro@gmail.com';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: '' };

  try {
    const { userEmail } = JSON.parse(event.body || '{}');

    // Vérification admin
    if (userEmail !== ADMIN_EMAIL) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Accès refusé' }) };
    }

    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ckikyvokurpehavjlkbc.supabase.co';
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

    if (!SERVICE_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Service key manquante' }) };
    }

    const fetchSB = async (path) => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
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
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
