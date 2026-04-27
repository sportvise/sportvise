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
  // v40 — fallback SUPABASE_URL (admin-stats.js does the same). Without this,
  // logging was silently disabled when SUPABASE_URL wasn't set as an env var
  // (only SUPABASE_SERVICE_KEY was), and the api_usage_log table stayed empty.
  const url = process.env.SUPABASE_URL || 'https://ckikyvokurpehavjlkbc.supabase.co';
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) {
    console.warn('[logApiUsage] SUPABASE_SERVICE_KEY missing — skipping log');
    return;
  }
  try {
    // We DO await here briefly, just to log the response status into Netlify
    // function logs. The await is wrapped in a Promise.race with a 500ms timeout
    // so it never delays the user noticeably.
    const logFetch = fetch(`${url}/rest/v1/api_usage_log`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload)
    }).then(r => {
      if (!r.ok) {
        // Read body once so we know WHY (RLS denial, missing column, etc.)
        return r.text().then(t => console.warn('[logApiUsage] insert failed:', r.status, t));
      }
    }).catch(err => console.warn('[logApiUsage] fetch error:', err.message));

    // Race against a 2500ms timeout so we never block the user response on logging.
    // v43 — bumped from 500ms because action='fixtures' had ~25% loss rate when
    // Supabase write latency variance pushed total handler time past the cutoff
    // (the /fixtures?next=10 endpoint returns a heavier payload than standings/results,
    // which combined with cold-start Supabase writes occasionally exceeded 500ms).
    // 2500ms covers worst-case Supabase free-tier latency while staying well under
    // Netlify's default 10s function timeout.
    await Promise.race([
      logFetch,
      new Promise(resolve => setTimeout(resolve, 2500))
    ]);
  } catch (err) {
    console.warn('[logApiUsage] outer error:', err.message);
  }
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
  const params = event.queryStringParameters || {};
  const sport = params.sport || 'football';
  const action = params.action || 'standings';
  const league = params.league;

  // v44 — Tennis uses Matchstat API (RapidAPI) with a different auth model and athlete-centric
  // endpoints. Branch early to keep the team-sports flow (API-Sports) clean and isolated.
  if (sport === 'tennis') {
    return await handleTennis({ action, params, headers, startTime });
  }

  const apiKey = process.env.API_SPORTS_KEY;
  if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'API_SPORTS_KEY not configured' }) };
  // v44 — Sport-aware config: base URL, default Swiss league ID, and season format.
  // Football/hockey use API-Sports "year" format ("2025" = season starting Aug 2025).
  // Basketball uses "split" format ("2025-2026"). Ski/tennis (upcoming versions) will likely
  // follow the "split" pattern too, so this structure is forward-compatible.
  // Other Swiss league IDs for reference (not currently exposed):
  //   football challenge_league=208, football cup=209, basketball SB League W (women)=101.
  const sportConfigs = {
    football: {
      baseUrl: 'https://v3.football.api-sports.io',
      defaultLeagueId: 207,    // Swiss Super League
      seasonFormat: 'year'     // "2025"
    },
    hockey: {
      baseUrl: 'https://v1.hockey.api-sports.io',
      defaultLeagueId: 38,     // Swiss National League
      seasonFormat: 'year'     // "2025"
    },
    basketball: {
      baseUrl: 'https://v1.basketball.api-sports.io',
      defaultLeagueId: 100,    // SB League (men's top division)
      seasonFormat: 'split'    // "2025-2026"
    }
  };

  const cfg = sportConfigs[sport] || sportConfigs.football;
  const baseUrl = cfg.baseUrl;

  // Swiss seasons run autumn → spring, so current season started this calendar year
  // if month >= July (zero-indexed 6), otherwise it started the previous calendar year.
  const now = new Date();
  const seasonStartYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const defaultSeason = cfg.seasonFormat === 'split'
    ? `${seasonStartYear}-${seasonStartYear + 1}`
    : String(seasonStartYear);
  const season = params.season || defaultSeason;

  try {
    let url = '';
    const leagueId = league || cfg.defaultLeagueId;

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
        //
        // v38 — Two-tier search to be permissive on club naming:
        //   Tier 1: search with the full name, NO league/season filter (those filter
        //           the search endpoint too aggressively and miss valid teams).
        //   Tier 2: if Tier 1 finds nothing, retry with a simplified name (strip
        //           common league prefixes/suffixes like "FC", "HC", "BSC", year
        //           suffixes like "1893"). e.g. "FC Bâle 1893" -> "Bâle".
        // Each tier costs 1 API call; we cap at 2 search attempts max.
        if (!params.club) return { statusCode: 400, headers, body: JSON.stringify({ error: 'club parameter required' }) };
        try {
          let team = null;
          let apiCalls = 0;
          const trySearch = async (term) => {
            apiCalls++;
            const u = `${baseUrl}/teams?search=${encodeURIComponent(term)}`;
            const r = await fetch(u, { headers: { 'x-apisports-key': apiKey } });
            if (!r.ok) return { ok: false, status: r.status, team: null };
            const d = await r.json();
            return { ok: true, team: (d.response && d.response.length > 0) ? d.response[0].team : null };
          };

          // Tier 1: full name
          const r1 = await trySearch(params.club);
          if (!r1.ok) {
            logApiUsage({ sport, action, league: String(leagueId||''), status_code: r1.status, latency_ms: Date.now()-startTime, ok: false, api_calls: apiCalls });
            return { statusCode: r1.status, headers, body: JSON.stringify({ error: 'API-Sports search error', status: r1.status }) };
          }
          team = r1.team;

          // Tier 2: simplified name fallback
          if (!team) {
            const simplified = params.club
              .replace(/^(FC|HC|SC|FCC|BC|BSC|EHC|SCB)\s+/i, '')
              .replace(/\s+(FC|HC|SC|FCC|BC|BSC|EHC|SCB)$/i, '')
              .replace(/\s+\d{4}$/, '')
              .trim();
            if (simplified && simplified.length >= 3 && simplified.toLowerCase() !== params.club.toLowerCase()) {
              const r2 = await trySearch(simplified);
              if (r2.ok && r2.team) team = r2.team;
            }
          }

          if (!team) {
            logApiUsage({ sport, action, league: String(leagueId||''), status_code: 200, latency_ms: Date.now()-startTime, ok: true, api_calls: apiCalls });
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
          const fxUrl = `${baseUrl}/fixtures?team=${team.id}&season=${season}&next=5`;
          const fxRes = await fetch(fxUrl, { headers: { 'x-apisports-key': apiKey } });
          apiCalls++;
          if (!fxRes.ok) {
            logApiUsage({ sport, action, league: String(leagueId||''), status_code: fxRes.status, latency_ms: Date.now()-startTime, ok: false, api_calls: apiCalls });
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
          logApiUsage({ sport, action, league: String(leagueId||''), status_code: 200, latency_ms: Date.now()-startTime, ok: true, api_calls: apiCalls });
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              sport, action, data: formatted,
              remaining: fxData.results ?? 0,
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

// ── TENNIS HANDLER (v44 tennis-lite) ──────────────────────────────────
// Matchstat Tennis API (Tennis API ATP WTA ITF) via RapidAPI.
// Different auth model (X-RapidAPI-Key + X-RapidAPI-Host headers) and an entirely different
// response shape from API-Sports — hence its own dedicated handler. Athlete-centric pattern:
// returns the top 20 singles rankings for the tour, with Swiss flag detection
// (countryAcr === 'SUI'). This will likely also serve as the template for ski FIS (v45)
// and other individual-athlete sports that don't fit the league/team-fixtures model.
async function handleTennis({ action, params, headers, startTime }) {
  const tennisApiKey = process.env.TENNIS_API_KEY;
  if (!tennisApiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'TENNIS_API_KEY not configured' })
    };
  }

  const baseUrl = 'https://tennis-api-atp-wta-itf.p.rapidapi.com';
  const apiHeaders = {
    'X-RapidAPI-Key': tennisApiKey,
    'X-RapidAPI-Host': 'tennis-api-atp-wta-itf.p.rapidapi.com'
  };

  let url = '';
  let tour = '';
  switch (action) {
    case 'atp-rankings':
      url = `${baseUrl}/tennis/v2/atp/ranking/singles?pageSize=20`;
      tour = 'ATP';
      break;
    case 'wta-rankings':
      url = `${baseUrl}/tennis/v2/wta/ranking/singles?pageSize=20`;
      tour = 'WTA';
      break;
    default:
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Unknown tennis action. Use: atp-rankings, wta-rankings' })
      };
  }

  try {
    const response = await fetch(url, { headers: apiHeaders });

    if (!response.ok) {
      const errBody = await response.text();
      logApiUsage({
        sport: 'tennis', action, league: '',
        status_code: response.status, latency_ms: Date.now() - startTime,
        ok: false, api_calls: 1
      });
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({
          error: 'Tennis API error',
          status: response.status,
          detail: errBody.slice(0, 200)
        })
      };
    }

    const data = await response.json();

    // Matchstat returns either a bare array of player objects or wraps them in
    // { data: [...] } / { response: [...] } depending on the endpoint version.
    // Be permissive on the shape. Player schema per docs:
    //   { id, name, countryAcr, currentRank, points, progress, hardPoints }
    const rawPlayers = Array.isArray(data) ? data : (data?.data || data?.response || []);
    const players = rawPlayers.slice(0, 20).map(p => ({
      rank: p.currentRank,
      name: p.name,
      country: p.countryAcr,
      points: p.points,
      isSwiss: p.countryAcr === 'SUI'
    }));

    logApiUsage({
      sport: 'tennis', action, league: '',
      status_code: 200, latency_ms: Date.now() - startTime,
      ok: true, api_calls: 1
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        sport: 'tennis',
        action,
        data: { tour, players },
        timestamp: new Date().toISOString()
      })
    };
  } catch (err) {
    console.error('Tennis API error:', err);
    logApiUsage({
      sport: 'tennis', action, league: '',
      status_code: 0, latency_ms: Date.now() - startTime,
      ok: false, api_calls: 1
    });
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Tennis fetch error', detail: err.message })
    };
  }
}
