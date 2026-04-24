// SPORTVISE — Netlify Function : Strava Activity Sync
// Fetches recent activities from Strava API and returns enriched data

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { access_token, after, per_page } = JSON.parse(event.body);
    if (!access_token) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing access_token' }) };

    // Default: last 14 days of activities
    const afterTimestamp = after || Math.floor((Date.now() - 14 * 86400000) / 1000);
    const limit = Math.min(per_page || 30, 50);

    // Fetch activities from Strava
    const activitiesRes = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?after=${afterTimestamp}&per_page=${limit}`,
      { headers: { 'Authorization': `Bearer ${access_token}` } }
    );

    if (!activitiesRes.ok) {
      const status = activitiesRes.status;
      if (status === 401) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token expired', code: 'TOKEN_EXPIRED' }) };
      const err = await activitiesRes.text();
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Strava API error', details: err }) };
    }

    const rawActivities = await activitiesRes.json();

    // Enrich and normalize activities for SPORTVISE
    const activities = rawActivities.map(a => ({
      strava_id: a.id,
      name: a.name,
      type: a.type,                           // Run, Ride, Swim, Workout, etc.
      sport_type: a.sport_type,               // More specific sport type
      date: a.start_date_local?.split('T')[0],
      start_time: a.start_date_local?.split('T')[1]?.slice(0,5),
      duration_min: Math.round((a.moving_time || 0) / 60),
      distance_km: a.distance ? (a.distance / 1000).toFixed(2) : null,
      elevation_m: a.total_elevation_gain ? Math.round(a.total_elevation_gain) : null,
      avg_speed_kmh: a.average_speed ? (a.average_speed * 3.6).toFixed(1) : null,
      max_speed_kmh: a.max_speed ? (a.max_speed * 3.6).toFixed(1) : null,
      avg_heartrate: a.average_heartrate ? Math.round(a.average_heartrate) : null,
      max_heartrate: a.max_heartrate ? Math.round(a.max_heartrate) : null,
      calories: a.kilojoules ? Math.round(a.kilojoules * 0.239) : (a.calories || null),
      suffer_score: a.suffer_score || null,    // Strava's effort score
      avg_watts: a.average_watts ? Math.round(a.average_watts) : null,
      kudos: a.kudos_count || 0,
      achievement_count: a.achievement_count || 0,
      pr_count: a.pr_count || 0,
      // SPORTVISE-specific mappings
      intensity: mapIntensity(a),
      sportvise_type: mapToSportvisType(a.type),
      summary: buildActivitySummary(a)
    }));

    // Compute weekly stats
    const weekStats = computeWeekStats(activities);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        activities,
        count: activities.length,
        weekStats,
        synced_at: new Date().toISOString()
      })
    };
  } catch(e) {
    console.error('Strava sync error:', e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};

// Map Strava activity type to SPORTVISE event type
function mapToSportvisType(stravaType) {
  const map = {
    'Run': 'entrainement', 'Ride': 'entrainement', 'Swim': 'entrainement',
    'Walk': 'entrainement', 'Hike': 'entrainement', 'Workout': 'entrainement',
    'WeightTraining': 'entrainement', 'Yoga': 'entrainement', 'CrossFit': 'entrainement',
    'Soccer': 'match', 'IceHockey': 'match', 'Tennis': 'match',
    'Badminton': 'match', 'Squash': 'match', 'TableTennis': 'match',
    'AlpineSki': 'entrainement', 'NordicSki': 'entrainement', 'Snowboard': 'entrainement',
    'RockClimbing': 'entrainement', 'Rowing': 'entrainement', 'Kayaking': 'entrainement'
  };
  return map[stravaType] || 'entrainement';
}

// Map to SPORTVISE intensity level based on effort metrics
function mapIntensity(activity) {
  // Use suffer score if available (Strava's built-in effort metric)
  if (activity.suffer_score) {
    if (activity.suffer_score >= 150) return 'high';
    if (activity.suffer_score >= 60) return 'medium';
    return 'light';
  }
  // Use heart rate as fallback
  if (activity.average_heartrate) {
    if (activity.average_heartrate >= 165) return 'high';
    if (activity.average_heartrate >= 135) return 'medium';
    return 'light';
  }
  // Use duration as last resort
  const mins = (activity.moving_time || 0) / 60;
  if (mins >= 90) return 'high';
  if (mins >= 45) return 'medium';
  return 'light';
}

// Build a human-readable summary for agent context
function buildActivitySummary(a) {
  const parts = [];
  parts.push(a.name || a.type);
  if (a.distance) parts.push((a.distance/1000).toFixed(1) + 'km');
  if (a.moving_time) parts.push(Math.round(a.moving_time/60) + 'min');
  if (a.average_heartrate) parts.push('FC moy.' + Math.round(a.average_heartrate) + 'bpm');
  if (a.total_elevation_gain > 50) parts.push('D+' + Math.round(a.total_elevation_gain) + 'm');
  return parts.join(' · ');
}

// Compute weekly training stats
function computeWeekStats(activities) {
  if (!activities.length) return null;
  const totalDuration = activities.reduce((s,a) => s + (a.duration_min || 0), 0);
  const totalDistance = activities.reduce((s,a) => s + (parseFloat(a.distance_km) || 0), 0);
  const totalCalories = activities.reduce((s,a) => s + (a.calories || 0), 0);
  const avgHeartrate = activities.filter(a=>a.avg_heartrate).length
    ? Math.round(activities.filter(a=>a.avg_heartrate).reduce((s,a)=>s+a.avg_heartrate,0) / activities.filter(a=>a.avg_heartrate).length)
    : null;
  const types = {};
  activities.forEach(a => { types[a.type] = (types[a.type]||0) + 1; });

  return {
    total_activities: activities.length,
    total_duration_min: totalDuration,
    total_distance_km: totalDistance.toFixed(1),
    total_calories: totalCalories,
    avg_heartrate: avgHeartrate,
    activity_types: types,
    intensity_breakdown: {
      high: activities.filter(a=>a.intensity==='high').length,
      medium: activities.filter(a=>a.intensity==='medium').length,
      light: activities.filter(a=>a.intensity==='light').length
    }
  };
}
