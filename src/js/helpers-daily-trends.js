// ═══════════════════════════════════════════════════════════════════
// SPORTVISE — DAILY LOG TRENDS (7 days) FOR SMART AGENTS
// ═══════════════════════════════════════════════════════════════════
// Module concaténé au build via build.js section §1.5 (PAS chargé via <script src>).
// Refactor v62.37 (Phase 2) — extrait de dashboard.html.
//
// Calcule moyennes et tendances 7 jours (humeur, énergie, sommeil, motivation,
// douleurs, nutrition, fitness score) et lève des alertes binaires utilisées
// par les agents et les cartes UX (welcome / weekly insight).
// Dépend des globals : sb, currentUser, dateToStr() (helpers-date.js),
//                      computeFitnessScore() (helpers-fitness-score.js).
// ═══════════════════════════════════════════════════════════════════

async function getDailyLogTrends() {
  try {
    const today = new Date();
    const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000);
    const { data: logs } = await sb.from('daily_log')
      .select('*')
      .eq('user_id', currentUser.id)
      .gte('log_date', dateToStr(sevenDaysAgo))
      .order('log_date', { ascending: true });

    if (!logs || logs.length < 2) return null;

    const avg = (arr) => arr.length ? (arr.reduce((a,b) => a+b, 0) / arr.length).toFixed(1) : null;
    const trend = (arr) => {
      if (arr.length < 2) return 'stable';
      const recent = arr.slice(-3);
      const older = arr.slice(0, Math.max(1, arr.length - 3));
      const avgRecent = recent.reduce((a,b)=>a+b,0) / recent.length;
      const avgOlder = older.reduce((a,b)=>a+b,0) / older.length;
      const diff = avgRecent - avgOlder;
      return diff > 0.5 ? 'hausse' : diff < -0.5 ? 'baisse' : 'stable';
    };

    const moods = logs.map(l => l.mood).filter(Boolean);
    const energies = logs.map(l => l.energy).filter(Boolean);
    const sleeps = logs.map(l => l.sleep_quality).filter(Boolean);
    const motivations = logs.map(l => l.motivation).filter(Boolean);
    const pains = logs.map(l => l.pain_level).filter(v => v !== null && v !== undefined);
    const nutritions = logs.map(l => l.nutrition_quality).filter(Boolean);
    const trainingDays = logs.filter(l => l.training_done).length;

    // Compute fitness scores for each day
    const fitnessScores = logs.map(l => computeFitnessScore(l)).filter(Boolean);

    // Detect alerts
    const alerts = [];
    if (sleeps.length && sleeps[sleeps.length - 1] <= 2) alerts.push('ALERTE_SOMMEIL');
    if (pains.length && pains[pains.length - 1] >= 4) alerts.push('ALERTE_DOULEUR');
    if (moods.length && moods[moods.length - 1] <= 2) alerts.push('ALERTE_MORAL');
    if (energies.length && energies[energies.length - 1] <= 2) alerts.push('ALERTE_ENERGIE');
    if (trend(moods) === 'baisse') alerts.push('TENDANCE_MORAL_BAISSE');
    if (trend(sleeps) === 'baisse') alerts.push('TENDANCE_SOMMEIL_BAISSE');
    if (trend(energies) === 'baisse') alerts.push('TENDANCE_ENERGIE_BAISSE');
    if (trainingDays === 0 && logs.length >= 3) alerts.push('AUCUN_ENTRAINEMENT');

    return {
      nbJours: logs.length,
      humeur: { moy: avg(moods), tendance: trend(moods) },
      energie: { moy: avg(energies), tendance: trend(energies) },
      sommeil: { moy: avg(sleeps), tendance: trend(sleeps) },
      motivation: { moy: avg(motivations), tendance: trend(motivations) },
      douleurs: { moy: avg(pains), tendance: trend(pains), derniere: pains[pains.length-1] },
      nutrition: { moy: avg(nutritions), tendance: trend(nutritions) },
      entrainements: trainingDays,
      fitnessScore: { moy: avg(fitnessScores), tendance: trend(fitnessScores) },
      alertes: alerts
    };
  } catch(e) {
    console.warn('Daily log trends error:', e);
    return null;
  }
}
