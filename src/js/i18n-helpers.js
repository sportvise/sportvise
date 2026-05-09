// ═══════════════════════════════════════════════════════════════════
// SPORTVISE — i18n HELPERS
// ═══════════════════════════════════════════════════════════════════
// Module concaténé au build via build.js section §1.5 (PAS chargé via <script src>).
// Refactor v62.38 (Phase 3) — extrait de dashboard.html.
//
// Soft-lookup helpers : accept either a canonical key or a legacy FR label,
// return the catalog item / its localized label / its canonical key.
//
// Dépend de : SPORTS_CATALOG, LEVELS_CATALOG, CANTONS_CATALOG, GOALS_CATALOG
// (déclarés dans i18n-catalogs.js — ordre alphabétique de build.js garantit
// que catalogs charge avant helpers) et de currentLang (let global déclaré
// dans dashboard.html, lu lazily à chaque appel).
// ═══════════════════════════════════════════════════════════════════

function _catalogFind(catalog, value) {
  if (!value) return null;
  return catalog.find(it => it.key === value) || catalog.find(it => (it.legacy||[]).includes(value)) || null;
}
function _label(catalog, value, lang) {
  const it = _catalogFind(catalog, value);
  if (!it) return value || '';
  return it.labels[lang] || it.labels.fr || value;
}
function _key(catalog, value) {
  const it = _catalogFind(catalog, value);
  return it ? it.key : (value || '');
}

function sportLabel(value, lang)  { return _label(SPORTS_CATALOG,  value, lang || currentLang); }
function sportKey(value)          { return _key(SPORTS_CATALOG,    value); }
function sportIcon(value)         { const it = _catalogFind(SPORTS_CATALOG, value); return it ? it.icon : '🏆'; }
function levelLabel(value, lang)  { return _label(LEVELS_CATALOG,  value, lang || currentLang); }
function levelKey(value)          { return _key(LEVELS_CATALOG,    value); }
function levelIcon(value)         { const it = _catalogFind(LEVELS_CATALOG, value); return it ? it.icon : ''; }
function cantonLabel(value, lang) { return _label(CANTONS_CATALOG, value, lang || currentLang); }
function cantonKey(value)         { return _key(CANTONS_CATALOG,   value); }
function goalLabel(value, lang)   { return _label(GOALS_CATALOG,   value, lang || currentLang); }
function goalKey(value)           { return _key(GOALS_CATALOG,     value); }
function goalDomain(value)        { const it = _catalogFind(GOALS_CATALOG, value); return it ? it.domain : 'carriere'; }
