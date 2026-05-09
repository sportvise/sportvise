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

    let ctx = `Journal du jour: Humeur ${log.mood}/5, Énergie ${log.energy}/5, Motivation ${log.motivation}/5, `;
    ctx += `Sommeil ${log.sleep_quality}/5, Douleurs ${log.pain_level}/5`;
    if (log.training_done) ctx += `, Entraînement: oui`;
    return ctx;
  } catch(e) {
    console.warn('Daily log context error:', e);
    return '';
  }
}
