// ═══════════════════════════════════════════════════════════════════
// SPORTVISE — FITNESS SCORE CALCULATION
// ═══════════════════════════════════════════════════════════════════
// Module concaténé au build via build.js section §1.5 (PAS chargé via <script src>).
// Refactor v62.37 (Phase 2) — extrait de dashboard.html.
//
// Score de forme 0-100 calculé à partir d'un daily_log.
// Pondération : 30% physique + 25% mental + 20% nutrition + 25% récupération.
// Fonction pure : aucune dépendance globale ou réseau.
// Utilisée par helpers-daily-trends.js (computeFitnessScore() est hoistée).
// ═══════════════════════════════════════════════════════════════════

function computeFitnessScore(log) {
  if (!log) return null;
  const physical = (log.energy * 15) + (log.training_done ? 25 : 0);
  const mental = (log.mood * 10) + (log.motivation * 10);
  const nutrition = (log.nutrition_quality || 0) * 20;
  const recovery = (log.sleep_quality * 15) + ((5 - (log.pain_level || 0)) * 5);
  const overall = (physical * 0.3 + mental * 0.25 + nutrition * 0.2 + recovery * 0.25);
  return Math.round(overall);
}
