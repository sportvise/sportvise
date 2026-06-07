// ═══════════════════════════════════════════════════════════════════
// SPORTVISE — DAILY LOG CONTEXT FOR AGENTS
// ═══════════════════════════════════════════════════════════════════
// Module concaténé au build via build.js section §1.5 (PAS chargé via <script src>).
// Refactor v62.37 (Phase 2) — extrait de dashboard.html.
//
// Construit la phrase de contexte "Journal du jour" injectée aux agents.
// Une seule entrée daily_log par user/date. Renvoie '' si pas de log aujourd'hui.
// Dépend des globals : sb, currentUser, dateToStr() (helpers-date.js).
// ═══════════════════════════════════════════════════════════════════

async function getDailyLogContext() {
  try {
    const today = dateToStr();
    const { data: log } = await sb.from('daily_log')
      .select('*')
      .eq('user_id', currentUser.id)
      .eq('log_date', today)
      .single();

    if (!log) return '';

    const parts = [];
    if (log.mood        != null) parts.push(`Humeur ${log.mood}/5`);
    if (log.energy      != null) parts.push(`Énergie ${log.energy}/5`);
    if (log.motivation  != null) parts.push(`Motivation ${log.motivation}/5`);
    if (log.stress_level != null) parts.push(`Stress ${log.stress_level}/5`);

    // Sommeil : qualité + durée réelle si renseignée
    if (log.sleep_quality != null) {
      const slp = `Sommeil ${log.sleep_quality}/5${log.sleep_hours ? ' (' + log.sleep_hours + 'h)' : ''}`;
      parts.push(slp);
    }

    if (log.pain_level != null) {
      const pain = `Douleurs ${log.pain_level}/5${log.pain_location ? ' — localisation: ' + log.pain_location : ''}`;
      parts.push(pain);
    }

    if (log.nutrition_quality != null) parts.push(`Nutrition ${log.nutrition_quality}/5`);

    // Entraînement
    if (log.training_done) {
      const tStatus = log.train_status ? log.train_status : 'effectué';
      const tIntens  = log.training_intensity ? ` (intensité: ${log.training_intensity})` : '';
      parts.push(`Entraînement: ${tStatus}${tIntens}`);
    }

    // Notes libres de l'athlète — information qualitative précieuse
    if (log.notes && log.notes.trim()) {
      parts.push(`Notes athlète: "${log.notes.trim()}"`);
    }

    return parts.length ? `Journal du jour: ${parts.join(', ')}` : '';
  } catch(e) {
    console.warn('Daily log context error:', e);
    return '';
  }
}
