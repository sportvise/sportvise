// ═══════════════════════════════════════════════════════════════════
// SPORTVISE — i18n CATALOGS (Phase 1.5, v42)
// ═══════════════════════════════════════════════════════════════════
// Module concaténé au build via build.js section §1.5 (PAS chargé via <script src>).
// Refactor v62.38 (Phase 3) — extrait de dashboard.html.
//
// Decouples DB-stored keys from displayed labels. Storage uses {key},
// display uses labels[currentLang]. Each catalog item also has a `legacy`
// array — historical FR strings stored before the migration. Helpers
// (i18n-helpers.js) normalize legacy values to the canonical key on the
// fly so old DB rows still work even si la SQL migration n'a pas été
// run yet (forward-compat / soft cutover).
//
// Ordre de chargement : i18n-catalogs.js (ce fichier) vient avant
// i18n-helpers.js dans l'ordre alphabétique de build.js, donc les const
// SPORTS_CATALOG/LEVELS_CATALOG/CANTONS_CATALOG/GOALS_CATALOG/GOAL_SUGGESTIONS
// sont initialisés avant que les helpers ne tentent de les lire.
// ═══════════════════════════════════════════════════════════════════

const SPORTS_CATALOG = [
  { key:'football',      icon:'⚽',  labels:{fr:'Football',         de:'Fußball',           en:'Football',          it:'Calcio'},                legacy:['Football'] },
  { key:'hockey',        icon:'🏒',  labels:{fr:'Hockey sur glace', de:'Eishockey',         en:'Ice Hockey',        it:'Hockey su ghiaccio'},    legacy:['Hockey sur glace','Hockey'] },
  { key:'skiing',        icon:'⛷️',  labels:{fr:'Ski alpin',        de:'Ski alpin',         en:'Alpine skiing',     it:'Sci alpino'},            legacy:['Ski alpin','Ski'] },
  { key:'tennis',        icon:'🎾',  labels:{fr:'Tennis',           de:'Tennis',            en:'Tennis',            it:'Tennis'},                legacy:['Tennis'] },
  { key:'padel',         icon:'🥎',  labels:{fr:'Padel',            de:'Padel',             en:'Padel',             it:'Padel'},                 legacy:['Padel'] },
  { key:'cycling',       icon:'🚴',  labels:{fr:'Cyclisme',         de:'Radsport',          en:'Cycling',           it:'Ciclismo'},              legacy:['Cyclisme'] },
  { key:'swimming',      icon:'🏊',  labels:{fr:'Natation',         de:'Schwimmen',         en:'Swimming',          it:'Nuoto'},                 legacy:['Natation'] },
  { key:'athletics',     icon:'🏃',  labels:{fr:'Athlétisme',       de:'Leichtathletik',    en:'Athletics',         it:'Atletica'},              legacy:['Athlétisme'] },
  { key:'basketball',    icon:'🏀',  labels:{fr:'Basketball',       de:'Basketball',        en:'Basketball',        it:'Pallacanestro'},         legacy:['Basketball'] },
  { key:'volleyball',    icon:'🏐',  labels:{fr:'Volleyball',       de:'Volleyball',        en:'Volleyball',        it:'Pallavolo'},             legacy:['Volleyball'] },
  { key:'floorball',     icon:'🏑',  labels:{fr:'Unihockey',        de:'Unihockey',         en:'Floorball',         it:'Unihockey'},             legacy:['Unihockey'] },
  { key:'handball',      icon:'🤾',  labels:{fr:'Handball',         de:'Handball',          en:'Handball',          it:'Pallamano'},             legacy:['Handball'] },
  { key:'gymnastics',    icon:'🤸',  labels:{fr:'Gymnastique',      de:'Turnen',            en:'Gymnastics',        it:'Ginnastica'},            legacy:['Gymnastique','Gymnastics'] },
  { key:'rugby',         icon:'🏉',  labels:{fr:'Rugby',            de:'Rugby',             en:'Rugby',             it:'Rugby'},                 legacy:['Rugby'] },
  { key:'golf',          icon:'⛳',  labels:{fr:'Golf',             de:'Golf',              en:'Golf',              it:'Golf'},                  legacy:['Golf'] },
  { key:'triathlon',     icon:'🏊‍♂️',labels:{fr:'Triathlon',        de:'Triathlon',         en:'Triathlon',         it:'Triathlon'},             legacy:['Triathlon'] },
  { key:'boxing',        icon:'🥊',  labels:{fr:'Boxe',             de:'Boxen',             en:'Boxing',            it:'Pugilato'},              legacy:['Boxe'] },
  { key:'martial-arts',  icon:'🥋',  labels:{fr:'Arts martiaux',    de:'Kampfsport',        en:'Martial arts',      it:'Arti marziali'},         legacy:['Arts martiaux'] },
  { key:'dance',         icon:'💃',  labels:{fr:'Danse',            de:'Tanz',              en:'Dance',             it:'Danza'},                 legacy:['Danse'] },
  { key:'climbing',      icon:'🧗',  labels:{fr:'Escalade',         de:'Klettern',          en:'Climbing',          it:'Arrampicata'},           legacy:['Escalade'] },
  { key:'trail-running', icon:'🏞️',  labels:{fr:'Trail / Running',  de:'Trail / Running',   en:'Trail / Running',   it:'Trail / Running'},       legacy:['Trail / Running'] },
  { key:'other',         icon:'🏆',  labels:{fr:'Autre',             de:'Andere',            en:'Other',             it:'Altro'},                 legacy:['Autre'] },
];

// Subsets for the 2 different selectors (onboarding 16 / profile 18 — kept divergent to match existing UX)
const ONBOARDING_SPORT_KEYS = ['football','tennis','basketball','swimming','athletics','volleyball','hockey','skiing','cycling','martial-arts','gymnastics','handball','rugby','dance','climbing','trail-running'];
const PROFILE_SPORT_KEYS    = ['football','hockey','skiing','tennis','padel','cycling','swimming','athletics','basketball','volleyball','floorball','handball','gymnastics','rugby','golf','triathlon','boxing','other'];

const LEVELS_CATALOG = [
  { key:'beginner',     icon:'🌱', labels:{fr:'Débutant',     de:'Anfänger',  en:'Beginner',     it:'Principiante'},     legacy:['Débutant'] },
  { key:'amateur',      icon:'⚽', labels:{fr:'Amateur',      de:'Amateur',   en:'Amateur',      it:'Amatoriale'},       legacy:['Amateur'] },
  { key:'competition',  icon:'🏆', labels:{fr:'Compétition',  de:'Wettkampf', en:'Competition',  it:'Competizione'},     legacy:['Compétition'] },
  { key:'semipro',      icon:'🏅', labels:{fr:'Semi-pro',     de:'Semi-Pro',  en:'Semi-pro',     it:'Semi-pro'},         legacy:['Semi-pro','Semi-Pro'] },
  { key:'professional', icon:'💼', labels:{fr:'Professionnel',de:'Profi',     en:'Professional', it:'Professionista'},   legacy:['Professionnel'] },
  { key:'elite',        icon:'🌟', labels:{fr:'Elite',        de:'Elite',     en:'Elite',        it:'Élite'},            legacy:['Elite'] },
];
const ONBOARDING_LEVEL_KEYS = ['beginner','amateur','competition','semipro','professional'];
const PROFILE_LEVEL_KEYS    = ['beginner','amateur','semipro','professional','elite'];

const CANTONS_CATALOG = [
  { key:'VD',    labels:{fr:'Vaud',      de:'Waadt',      en:'Vaud',      it:'Vaud'},      legacy:['Vaud'] },
  { key:'GE',    labels:{fr:'Genève',    de:'Genf',       en:'Geneva',    it:'Ginevra'},   legacy:['Genève'] },
  { key:'ZH',    labels:{fr:'Zurich',    de:'Zürich',     en:'Zurich',    it:'Zurigo'},    legacy:['Zurich'] },
  { key:'BE',    labels:{fr:'Berne',     de:'Bern',       en:'Berne',     it:'Berna'},     legacy:['Berne'] },
  { key:'VS',    labels:{fr:'Valais',    de:'Wallis',     en:'Valais',    it:'Vallese'},   legacy:['Valais'] },
  { key:'FR',    labels:{fr:'Fribourg',  de:'Freiburg',   en:'Fribourg',  it:'Friburgo'},  legacy:['Fribourg'] },
  { key:'NE',    labels:{fr:'Neuchâtel', de:'Neuenburg',  en:'Neuchâtel', it:'Neuchâtel'}, legacy:['Neuchâtel'] },
  { key:'JU',    labels:{fr:'Jura',      de:'Jura',       en:'Jura',      it:'Giura'},     legacy:['Jura'] },
  { key:'LU',    labels:{fr:'Lucerne',   de:'Luzern',     en:'Lucerne',   it:'Lucerna'},   legacy:['Lucerne'] },
  { key:'BS',    labels:{fr:'Bâle',      de:'Basel',      en:'Basel',     it:'Basilea'},   legacy:['Bâle'] },
  { key:'SG',    labels:{fr:'St-Gall',   de:'St. Gallen', en:'St Gallen', it:'San Gallo'}, legacy:['St-Gallen','St-Gall'] },
  { key:'AG',    labels:{fr:'Argovie',   de:'Aargau',     en:'Aargau',    it:'Argovia'},   legacy:['Argovie'] },
  { key:'other', labels:{fr:'Autre',     de:'Andere',     en:'Other',     it:'Altro'},     legacy:['Autre'] },
];

const GOALS_CATALOG = [
  { key:'physical-progress', icon:'💪', domain:'physique',  labels:{fr:'Progresser physiquement',   de:'Körperlich Fortschritte machen', en:'Improve physically',   it:'Progredire fisicamente'},   legacy:['Progresser physiquement'] },
  { key:'win-competitions',  icon:'🏆', domain:'carriere',  labels:{fr:'Gagner des compétitions',   de:'Wettkämpfe gewinnen',           en:'Win competitions',     it:'Vincere competizioni'},     legacy:['Gagner des compétitions'] },
  { key:'live-from-sport',   icon:'💰', domain:'financier', labels:{fr:'Vivre de mon sport',        de:'Vom Sport leben',                en:'Live from my sport',   it:'Vivere del mio sport'},     legacy:['Vivre de mon sport'] },
  { key:'mental-strength',   icon:'🧠', domain:'mental',    labels:{fr:'Améliorer mon mental',      de:'Mental stärker werden',          en:'Improve my mental',    it:'Migliorare il mio mentale'},legacy:['Améliorer mon mental'] },
  { key:'manage-career',     icon:'📈', domain:'carriere',  labels:{fr:'Gérer ma carrière',         de:'Karriere managen',               en:'Manage my career',     it:'Gestire la mia carriera'},  legacy:['Gérer ma carrière'] },
];

// v62.16 — Architecture hybride : 4 macro-domaines (DB inchangée) + suggestions par sous-thème.
// Les sous-thèmes ne sont PAS stockés en DB (pour ne pas casser le data model existant), ils
// servent uniquement à enrichir l'UI de la modal "Ajouter un objectif" via des chips de
// suggestions cliquables qui pré-remplissent (titre + domaine). L'utilisateur peut toujours
// taper un titre libre + choisir manuellement un domain s'il préfère. Décision Thomas 04/05.
const GOAL_SUGGESTIONS = [
  // Physique
  { domain:'physique', icon:'💪', label:{fr:'Gagner en force',          de:'Kraft aufbauen',           en:'Build strength',        it:'Aumentare la forza'} },
  { domain:'physique', icon:'🏃', label:{fr:'Améliorer mon endurance',  de:'Ausdauer verbessern',      en:'Improve endurance',     it:'Migliorare la resistenza'} },
  { domain:'physique', icon:'⚡', label:{fr:'Gagner en vitesse',         de:'Schneller werden',          en:'Get faster',            it:'Aumentare la velocità'} },
  { domain:'physique', icon:'🥗', label:{fr:'Améliorer mon alimentation',de:'Ernährung optimieren',     en:'Improve nutrition',     it:'Migliorare la nutrizione'} },
  { domain:'physique', icon:'😴', label:{fr:'Mieux dormir',              de:'Besser schlafen',          en:'Sleep better',          it:'Dormire meglio'} },
  { domain:'physique', icon:'♻️', label:{fr:'Optimiser ma récupération', de:'Erholung optimieren',      en:'Optimize recovery',     it:'Ottimizzare il recupero'} },
  // Mental
  { domain:'mental',   icon:'🎯', label:{fr:'Gérer mieux le stress',     de:'Stress besser bewältigen', en:'Manage stress better',  it:'Gestire meglio lo stress'} },
  { domain:'mental',   icon:'💪', label:{fr:'Renforcer ma confiance',    de:'Selbstvertrauen stärken',  en:'Build confidence',      it:'Rafforzare la fiducia'} },
  { domain:'mental',   icon:'🧘', label:{fr:'Améliorer ma concentration',de:'Konzentration verbessern', en:'Improve focus',         it:'Migliorare la concentrazione'} },
  // Financier
  { domain:'financier',icon:'🇨🇭', label:{fr:'Optimiser mes impôts',     de:'Steuern optimieren',       en:'Optimize my taxes',     it:'Ottimizzare le imposte'} },
  { domain:'financier',icon:'🏦', label:{fr:'Ouvrir un pilier 3a',       de:'Säule 3a eröffnen',         en:'Open a pillar 3a',      it:'Aprire un pilastro 3a'} },
  { domain:'financier',icon:'💼', label:{fr:'Gérer mon budget',          de:'Budget managen',           en:'Manage my budget',      it:'Gestire il mio budget'} },
  // Carrière (sous-thèmes : sponsors, contrats, marketing, transferts)
  { domain:'carriere', icon:'🤝', label:{fr:'Trouver des sponsors',      de:'Sponsoren finden',         en:'Find sponsors',         it:'Trovare sponsor'} },
  { domain:'carriere', icon:'⚖️', label:{fr:'Négocier mon contrat',      de:'Vertrag verhandeln',       en:'Negotiate my contract', it:'Negoziare il mio contratto'} },
  { domain:'carriere', icon:'🎯', label:{fr:'Booster ma visibilité',     de:'Sichtbarkeit erhöhen',     en:'Boost my visibility',   it:'Aumentare la visibilità'} },
  { domain:'carriere', icon:'🔄', label:{fr:'Préparer un transfert',     de:'Transfer vorbereiten',     en:'Prepare a transfer',    it:'Preparare un trasferimento'} },
];
