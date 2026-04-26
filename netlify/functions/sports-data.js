// SPORTVISE — Netlify Function : Sports Data API
// Fetches live data from API-Sports (football, hockey, etc.)
// Free tier: 100 requests/day

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'GET only' }) };

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
      default:
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action. Use: standings, fixtures, results, team, player' }) };
    }

    const response = await fetch(url, {
      headers: { 'x-apisports-key': apiKey }
    });

    if (!response.ok) {
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
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal error' }) };
  }
};
