// ═══════════════════════════════════════════════════════════════════
// SPORTVISE — DATE HELPERS (timezone-safe, local time)
// ═══════════════════════════════════════════════════════════════════
// Module concaténé au build via build.js section §1.5 (PAS chargé via <script src>).
// Refactor v62.37 (Phase 2) — extrait de dashboard.html.
//
// Toujours utiliser ces helpers au lieu de toISOString().split('T')[0]
// pour éviter les décalages UTC qui produisent des dates "d'hier".
// dateToStr() sans argument = date locale d'aujourd'hui au format YYYY-MM-DD.
// ═══════════════════════════════════════════════════════════════════

function dateToStr(d) {
  const x = d ? new Date(d) : new Date();
  return x.getFullYear() + '-' +
         String(x.getMonth() + 1).padStart(2, '0') + '-' +
         String(x.getDate()).padStart(2, '0');
}
function startOfLocalDay(d) {
  const x = d ? new Date(d) : new Date();
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
}
// Parse "YYYY-MM-DD" venant de Supabase comme date LOCALE (et non UTC).
function parseEventDate(s) {
  if (!s) return null;
  const [y, mo, da] = String(s).split('-').map(Number);
  return new Date(y, mo - 1, da);
}
// Reload automatiquement le dashboard au passage de minuit local
// pour que la date affichée et tous les countdowns restent corrects
// si l'onglet reste ouvert plusieurs jours.
(function scheduleMidnightRefresh() {
  const now = new Date();
  const nextMidnight = new Date(
    now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 30
  );
  setTimeout(() => location.reload(), nextMidnight - now);
})();
