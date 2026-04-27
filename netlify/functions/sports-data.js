// SPORTVISE — Netlify Function : Sports Data API
// Fetches live data from API-Sports (football, hockey, etc.)
// Free tier: 100 requests/day
//
// USAGE LOGGING (optional but recommended):
// Logs each call to a Supabase `api_usage_log` table for quota visibility.
// Required Supabase schema:
//   create table api_usage_log (
//     id uuid primary key default gen_random_uuid(),
//     created_at timestamptz not null default now(),
//     sport text,
//     action text,
//     league text,
//     status_code int,
//     latency_ms int,
//     ok boolean,
//     api_calls int default 1  -- some actions like team-fixtures use 2 upstream calls
//   );
// Required env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY (already in use elsewhere).
// If env vars are missing, logging is silently skipped — never blocks the response.
async function logApiUsage(payload) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return; // logging disabled
  try {
    // Fire-and-forget — no await on the response so we never delay the user.
    fetch(`${url}/rest/v1/api_usage_log`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload)
    }).catch(() => { /* swallow */ });
  } catch (_) { /* swallow */ }
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'GET only' }) };

  const startTime = Date.now();
  const apiKey = process.env.API_SPORTS_KEY;
  if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'API_SPORTS_KEY not configured' }) };

  const params = event.queryStringParameters || {};
  const sport = params.sport || 'football';
  const action = params.action || 'standings';
  const league = params.league;
  // Swiss football season runs Aug-May, so current season = current year if Aug+, else previous year
  const now = new Date();
  const defaultSeason = now.getMonth() >= 6 ? String(now.getFullYear()) : String(now.getFullYear() - 1);
  const season = params.season || defaultSeason;

  // API-Sports base URLs per sport
  const baseUrls = {
    football: 'https://v3.football.api-sports.io',
    hockey: 'https://v1.hockey.api-sports.io',
    basketball: 'https://v1.basketball.api-sports.io'
  };

  const baseUrl = baseUrls[sport] || baseUrls.football;

  // Swiss league IDs (API-Sports)
  const swissLeagues = {
    football: {
      super_league: 207,       // Swiss Super League
      challenge_league: 208,    // Swiss Challenge League
      cup: 209                  // Swiss Cup
    },
    hockey: {
      national_league: 38       // Swiss National League
    }
  };

  try {
    let url = '';
    const leagueId = league || (sport === 'football' ? swissLeagues.football.super_league : swissLeagues.hockey?.national_league);

    switch (action) {
      case 'standings':
        url = `${baseUrl}/standings?league=${leagueId}&season=${season}`;
        break;
      case 'fixtures':
        // Next 10 upcoming fixtures
        url = `${baseUrl}/fixtures?league=${leagueId}&season=${season}&next=10`;
        break;
      case 'results':
        // Last 10 results
        url = `${baseUrl}/fixtures?league=${leagueId}&season=${season}&last=10`;
        break;
      case 'team':
        // Team info
        if (!params.team) return { statusCode: 400, headers, body: JSON.stringify({ error: 'team parameter required' }) };
        url = `${baseUrl}/teams?id=${params.team}`;
        break;
      case 'player':
        // Player stats
        if (!params.player) return { statusCode: 400, headers, body: JSON.stringify({ error: 'player parameter required' }) };
        url = `${baseUrl}/players?id=${params.player}&season=${season}`;
        break;
      case 'team-fixtures':
        // 2-step lookup: search team by club name, then fetch its next 5 fixtures.
        // Used when the athlete has filled in their club — gives way more actionable
        // data than a league-wide fixture list.
        if (!params.club) return { statusCode: 400, headers, body: JSON.stringify({ error: 'club parameter required' }) };
        try {
          const searchUrl = `${baseUrl}/teams?search=${encodeURIComponent(params.club)}` + (leagueId ? `&league=${leagueId}&season=${season}` : '');
          const searchRes = await fetch(searchUrl, { headers: { 'x-apisports-key': apiKey } });
          if (!searchRes.ok) {
            return { statusCode: searchRes.status, headers, body: JSON.stringify({ error: 'API-Sports search error', status: searchRes.status }) };
          }
          const searchData = await searchRes.json();
          if (!searchData.response || searchData.response.length === 0) {
            logApiUsage({ sport, action, league: String(leagueId||''), status_code: 200, latency_ms: Date.now()-startTime, ok: true, api_calls: 1 });
            // Team not found — return empty fixtures so the client can degrade gracefully
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({
                sport, action, data: { teamFound: false, fixtures: [] },
                searchTerm: params.club,
                timestamp: new Date().toISOString()
              })
            };
          }
          const team = searchData.response[0].team;
          const fxUrl = `${baseUrl}/fixtures?team=${team.id}&season=${season}&next=5`;
          const fxRes = await fetch(fxUrl, { headers: { 'x-apisports-key': apiKey } });
          if (!fxRes.ok) {
            logApiUsage({ sport, action, league: String(leagueId||''), status_code: fxRes.status, latency_ms: Date.now()-startTime, ok: false, api_calls: 2 });
            return { statusCode: fxRes.status, headers, body: JSON.stringify({ error: 'API-Sports fixtures error', status: fxRes.status }) };
          }
          const fxData = await fxRes.json();
          const formatted = {
            teamFound: true,
            teamId: team.id,
            teamName: team.name,
            fixtures: (fxData.response || []).map(f => ({
              date: f.fixture.date,
              status: f.fixture.status?.long,
              home: f.teams.home.name,
              away: f.teams.away.name,
              isHome: f.teams.home.id === team.id,
              league: f.league?.name,
              round: f.league?.round,
              venue: f.fixture.venue?.name
            }))
          };
          logApiUsage({ sport, action, league: String(leagueId||''), status_code: 200, latency_ms: Date.now()-startTime, ok: true, api_calls: 2 });
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              sport, action, data: formatted,
              remaining: (fxData.results ?? 0) + (searchData.results ?? 0),
              timestamp: new Date().toISOString()
            })
          };
        } catch (innerErr) {
          console.error('team-fixtures error:', innerErr);
          logApiUsage({ sport, action, league: String(leagueId||''), status_code: 500, latency_ms: Date.now()-startTime, ok: false, api_calls: 1 });
          return { statusCode: 500, headers, body: JSON.stringify({ error: 'team-fixtures internal error' }) };
        }
      default:
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action. Use: standings, fixtures, results, team, player, team-fixtures' }) };
    }

    const response = await fetch(url, {
      headers: { 'x-apisports-key': apiKey }
    });

    if (!response.ok) {
      logApiUsage({ sport, action, league: String(leagueId||''), status_code: response.status, latency_ms: Date.now()-startTime, ok: false, api_calls: 1 });
      return { statusCode: response.status, headers, body: JSON.stringify({ error: 'API-Sports error', status: response.status }) };
    }

    const data = await response.json();

    // Format response for SPORTVISE agents
    let formatted = {};

    if (action === 'standings' && data.response?.[0]?.league?.standings) {
      const standings = data.response[0].league.standings[0];
      formatted = {
        league: data.response[0].league.name,
        season: data.response[0].league.season,
        standings: standings.map(t => ({
          rank: t.rank,
          team: t.team.name,
          points: t.points,
          played: t.all.played,
          win: t.all.win,
          draw: t.all.draw,
          lose: t.all.lose,
          goalsFor: t.all.goals.for,
          goalsAgainst: t.all.goals.against,
          goalDiff: t.goalsDiff,
          form: t.form
        }))
      };
    } else if ((action === 'fixtures' || action === 'results') && data.response) {
      formatted = {
        fixtures: data.response.map(f => ({
          date: f.fixture.date,
          status: f.fixture.status.long,
          home: f.teams.home.name,
          away: f.teams.away.name,
          scoreHome: f.goals.home,
          scoreAway: f.goals.away,
          venue: f.fixture.venue?.name
        }))
      };
    } else {
      formatted = data.response;
    }

    logApiUsage({ sport, action, league: String(leagueId||''), status_code: 200, latency_ms: Date.now()-startTime, ok: true, api_calls: 1 });
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        sport,
        action,
        data: formatted,
        remaining: data.results,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Sports data error:', error);
    // We can't always know sport/action here, so log a minimal entry
    logApiUsage({ sport: 'unknown', action: 'unknown', status_code: 500, latency_ms: Date.now()-startTime, ok: false, api_calls: 0 });
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal error' }) };
  }
};
