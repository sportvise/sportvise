// ═══════════════════════════════════════════════════════════════════
// SPORTVISE — PREDICTIVE INTELLIGENCE
// ═══════════════════════════════════════════════════════════════════
// Module concaténé au build via build.js section §1.5 (PAS chargé via <script src>).
// Refactor v62.37 (Phase 2) — extrait de dashboard.html.
//
// Analyse 14-30 jours de journal pour prédire 3 scores (0-100) :
//   - injuryRisk (douleurs, sommeil, fréquence entraînement)
//   - burnoutRisk (motivation, humeur, énergie, surentrainement)
//   - peakForm (sommeil + humeur + énergie + faibles douleurs)
// Génère alertes (high/medium/positive) + tips contextuels (lien vers agent
// recuperation/mental/sommeil). Minimum 5 jours de données pour fonctionner.
// Dépend des globals : sb, currentUser, dateToStr() (helpers-date.js).
// ═══════════════════════════════════════════════════════════════════

async function getPredictions() {
  try {
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400000);
    const { data: logs } = await sb.from('daily_log')
      .select('*').eq('user_id', currentUser.id)
      .gte('log_date', dateToStr(thirtyDaysAgo))
      .order('log_date', { ascending: true });

    if (!logs || logs.length < 5) return null; // Need minimum 5 days of data

    const predictions = { injuryRisk: 0, burnoutRisk: 0, peakForm: 0, alerts: [], tips: [] };

    // --- INJURY RISK (0-100) ---
    // Factors: pain trend rising, high training + low sleep, low recovery
    const recentPains = logs.slice(-7).map(l => l.pain_level || 0).filter(v => v > 0);
    const olderPains = logs.slice(0, -7).map(l => l.pain_level || 0);
    const avgRecentPain = recentPains.length ? recentPains.reduce((a,b)=>a+b,0)/recentPains.length : 0;
    const avgOlderPain = olderPains.length ? olderPains.reduce((a,b)=>a+b,0)/olderPains.length : 0;
    const painTrend = avgRecentPain - avgOlderPain;

    const recentSleep = logs.slice(-7).map(l => l.sleep_quality || 3);
    const avgRecentSleep = recentSleep.reduce((a,b)=>a+b,0)/recentSleep.length;
    const recentTraining = logs.slice(-7).filter(l => l.training_done).length;

    // High training + low sleep + rising pain = high injury risk
    let injRisk = 0;
    injRisk += Math.min(30, avgRecentPain * 8); // pain contributes up to 30
    injRisk += Math.min(25, painTrend > 0 ? painTrend * 15 : 0); // rising pain up to 25
    injRisk += Math.min(25, recentTraining >= 5 && avgRecentSleep <= 3 ? 25 : recentTraining >= 5 ? 12 : 0); // overtraining + bad sleep
    injRisk += Math.min(20, avgRecentSleep <= 2 ? 20 : avgRecentSleep <= 3 ? 10 : 0); // poor sleep
    predictions.injuryRisk = Math.min(100, Math.round(injRisk));

    // --- BURNOUT RISK (0-100) ---
    // Factors: declining motivation, declining mood, high training frequency, declining energy
    const recentMotivation = logs.slice(-7).map(l => l.motivation || 3);
    const olderMotivation = logs.slice(0, -7).map(l => l.motivation || 3);
    const avgRecentMotiv = recentMotivation.reduce((a,b)=>a+b,0)/recentMotivation.length;
    const avgOlderMotiv = olderMotivation.length ? olderMotivation.reduce((a,b)=>a+b,0)/olderMotivation.length : 3;
    const motivTrend = avgRecentMotiv - avgOlderMotiv;

    const recentMood = logs.slice(-7).map(l => l.mood || 3);
    const avgRecentMood = recentMood.reduce((a,b)=>a+b,0)/recentMood.length;
    const recentEnergy = logs.slice(-7).map(l => l.energy || 3);
    const avgRecentEnergy = recentEnergy.reduce((a,b)=>a+b,0)/recentEnergy.length;

    let burnRisk = 0;
    burnRisk += Math.min(30, motivTrend < -0.5 ? Math.abs(motivTrend) * 20 : 0); // declining motivation
    burnRisk += Math.min(25, avgRecentMood <= 2 ? 25 : avgRecentMood <= 3 ? 12 : 0); // low mood
    burnRisk += Math.min(25, avgRecentEnergy <= 2 ? 25 : avgRecentEnergy <= 3 ? 10 : 0); // low energy
    burnRisk += Math.min(20, recentTraining >= 6 ? 20 : recentTraining >= 5 ? 10 : 0); // overtraining
    predictions.burnoutRisk = Math.min(100, Math.round(burnRisk));

    // --- PEAK FORM SCORE (0-100) ---
    // High when: good sleep + good mood + good energy + moderate training + low pain
    let peak = 0;
    peak += Math.min(25, avgRecentSleep >= 4 ? 25 : avgRecentSleep >= 3 ? 15 : 5);
    peak += Math.min(25, avgRecentMood >= 4 ? 25 : avgRecentMood >= 3 ? 15 : 5);
    peak += Math.min(25, avgRecentEnergy >= 4 ? 25 : avgRecentEnergy >= 3 ? 15 : 5);
    peak += Math.min(25, avgRecentPain <= 1 ? 25 : avgRecentPain <= 2 ? 15 : 5);
    predictions.peakForm = Math.min(100, Math.round(peak));

    // --- GENERATE ALERTS & TIPS ---
    if (predictions.injuryRisk >= 60) {
      predictions.alerts.push({ type: 'injury', level: 'high', text: 'Risque de blessure élevé (' + predictions.injuryRisk + '%). Réduis l\'intensité.' });
      predictions.tips.push({ agent: 'recuperation', text: 'Consulte Julie pour un protocole de récupération adapté' });
    } else if (predictions.injuryRisk >= 35) {
      predictions.alerts.push({ type: 'injury', level: 'medium', text: 'Risque de blessure modéré (' + predictions.injuryRisk + '%). Surveille tes douleurs.' });
    }

    if (predictions.burnoutRisk >= 60) {
      predictions.alerts.push({ type: 'burnout', level: 'high', text: 'Risque de burnout élevé (' + predictions.burnoutRisk + '%). Prends du repos.' });
      predictions.tips.push({ agent: 'mental', text: 'Parle à Emma de ta motivation et ton état mental' });
    } else if (predictions.burnoutRisk >= 35) {
      predictions.alerts.push({ type: 'burnout', level: 'medium', text: 'Fatigue mentale détectée (' + predictions.burnoutRisk + '%). Varie tes entraînements.' });
    }

    if (predictions.peakForm >= 75) {
      predictions.alerts.push({ type: 'peak', level: 'positive', text: 'Tu es en grande forme (' + predictions.peakForm + '%) ! C\'est le moment de performer.' });
    }

    if (avgRecentSleep <= 2.5 && recentTraining >= 4) {
      predictions.tips.push({ agent: 'sommeil', text: 'Tu t\'entraînes beaucoup mais tu dors mal — Nora peut t\'aider' });
    }

    return predictions;
  } catch(e) {
    console.warn('Predictions error:', e);
    return null;
  }
}
