// SPORTVISE — Netlify Function : Strava OAuth2 Authentication
// Handles the OAuth callback from Strava and exchanges code for access token

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID;
  const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  // ── GET: Redirect user to Strava OAuth page ────────
  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};

    // Step 1: If no code, redirect to Strava authorization
    if (!params.code) {
      const redirectUri = params.redirect_uri || `${event.headers.origin || 'https://sportvise.ch'}/.netlify/functions/strava-auth`;
      const scope = 'read,activity:read_all,profile:read_all';
      const stravaUrl = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&approval_prompt=auto`;

      return {
        statusCode: 302,
        headers: { ...headers, 'Location': stravaUrl },
        body: ''
      };
    }

    // Step 2: Exchange code for token
    try {
      const tokenRes = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: STRAVA_CLIENT_ID,
          client_secret: STRAVA_CLIENT_SECRET,
          code: params.code,
          grant_type: 'authorization_code'
        })
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        console.error('Strava token error:', err);
        return redirectWithError('Token exchange failed');
      }

      const tokenData = await tokenRes.json();

      // Return HTML that posts the token back to the dashboard
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html' },
        body: `<!DOCTYPE html>
<html><head><title>SPORTVISE — Connexion Strava</title></head>
<body style="background:#07091a;color:#f1f5f9;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center">
  <div style="font-size:48px;margin-bottom:16px">✅</div>
  <h2 style="color:#f59e0b">Strava connecté !</h2>
  <p style="color:#94a3b8">Retour au dashboard...</p>
</div>
<script>
  // Send token data back to opener window
  const data = ${JSON.stringify({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: tokenData.expires_at,
    athlete: tokenData.athlete ? {
      id: tokenData.athlete.id,
      firstname: tokenData.athlete.firstname,
      lastname: tokenData.athlete.lastname,
      profile: tokenData.athlete.profile,
      city: tokenData.athlete.city,
      country: tokenData.athlete.country
    } : null
  })};

  if (window.opener) {
    window.opener.postMessage({ type: 'strava_auth', data }, '*');
    setTimeout(() => window.close(), 1500);
  } else {
    // Fallback: store in localStorage and redirect
    localStorage.setItem('sv_strava_token', JSON.stringify(data));
    setTimeout(() => window.location.href = '/app/dashboard.html', 1500);
  }
</script>
</body></html>`
      };
    } catch(e) {
      console.error('Strava auth error:', e);
      return redirectWithError(e.message);
    }
  }

  // ── POST: Refresh an expired token ─────────────────
  if (event.httpMethod === 'POST') {
    try {
      const { refresh_token } = JSON.parse(event.body);
      if (!refresh_token) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing refresh_token' }) };

      const tokenRes = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: STRAVA_CLIENT_ID,
          client_secret: STRAVA_CLIENT_SECRET,
          refresh_token,
          grant_type: 'refresh_token'
        })
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Refresh failed', details: err }) };
      }

      const tokenData = await tokenRes.json();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_at: tokenData.expires_at
        })
      };
    } catch(e) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
    }
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
};

function redirectWithError(msg) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: `<!DOCTYPE html>
<html><head><title>Erreur Strava</title></head>
<body style="background:#07091a;color:#f1f5f9;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center">
  <div style="font-size:48px;margin-bottom:16px">❌</div>
  <h2 style="color:#ef4444">Erreur de connexion</h2>
  <p style="color:#94a3b8">${msg}</p>
  <p style="color:#64748b;margin-top:16px">Ferme cette fenêtre et réessaie.</p>
</div></body></html>`
  };
}
