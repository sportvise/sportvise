#!/usr/bin/env node
/**
 * SPORTVISE Build Script
 *
 * Extracts CSS and JS from dashboard.html into separate hashed files.
 * This solves the browser cache problem: each build produces unique filenames.
 *
 * Usage: node build.js
 * Output: dist/ folder ready for Netlify deployment
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SRC = path.join(__dirname, 'src');
const DIST = path.join(__dirname, 'dist');

// Clean dist
if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true });
fs.mkdirSync(DIST, { recursive: true });
fs.mkdirSync(path.join(DIST, 'assets'), { recursive: true });
fs.mkdirSync(path.join(DIST, 'icons'), { recursive: true });

// Generate short hash from content
function hash(content) {
  return crypto.createHash('md5').update(content).digest('hex').slice(0, 8);
}

console.log('🔨 SPORTVISE Build starting...\n');

// ── 0. Sync APP_V with version.json ─────────────────
// Évite la boucle de reload si on bumpe version.json sans toucher APP_V dans dashboard.html.
let appVersion = null;
try {
  appVersion = JSON.parse(fs.readFileSync(path.join(SRC, 'version.json'), 'utf8')).version;
  console.log(`  📌 version.json → v${appVersion}`);
} catch (e) {
  console.warn('  ⚠️  Could not read version.json:', e.message);
}

// ── 1. Process dashboard.html ──────────────────────
let dashboardRaw = fs.readFileSync(path.join(SRC, 'dashboard.html'), 'utf8');

// Inject APP_V from version.json (overrides the hardcoded value in source)
if (appVersion) {
  const appVRegex = /const APP_V\s*=\s*['"][^'"]*['"]\s*;/;
  if (appVRegex.test(dashboardRaw)) {
    dashboardRaw = dashboardRaw.replace(appVRegex, `const APP_V = '${appVersion}';`);
    console.log(`  ✅ APP_V synced → '${appVersion}'`);
  } else {
    console.warn('  ⚠️  Could not find APP_V declaration to sync');
  }
  // Also sync <meta name="app-version" content="..."> — used by Sentry release tag (v58)
  const metaVRegex = /<meta\s+name=["']app-version["']\s+content=["'][^"']*["']\s*\/?>/i;
  if (metaVRegex.test(dashboardRaw)) {
    dashboardRaw = dashboardRaw.replace(metaVRegex, `<meta name="app-version" content="${appVersion}" />`);
    console.log(`  ✅ <meta app-version> synced → '${appVersion}'`);
  }
}

// Extract the main <style> block (the big one after the initial scripts)
const styleMatch = dashboardRaw.match(/<style>([\s\S]*?)<\/style>/);
let cssContent = '';
let dashboardWithoutCSS = dashboardRaw;

if (styleMatch) {
  cssContent = styleMatch[1].trim();
  const cssHash = hash(cssContent);
  const cssFilename = `style.${cssHash}.css`;
  fs.writeFileSync(path.join(DIST, 'assets', cssFilename), cssContent);
  console.log(`  ✅ CSS extracted → assets/${cssFilename} (${Math.round(cssContent.length/1024)}KB)`);

  // Replace <style>...</style> with <link> to hashed CSS
  dashboardWithoutCSS = dashboardWithoutCSS.replace(
    /<style>[\s\S]*?<\/style>/,
    `<link rel="stylesheet" href="/assets/${cssFilename}" />`
  );
}

// Extract the main app script (the big <script> block at the end, after </style> replacement)
// We need to find the last big script block — it's the one after the closing </style> or after the body
// Strategy: find the script block that contains "async function init()" — that's the main app script
const scriptRegex = /<script>([\s\S]*?)<\/script>/g;
let mainScriptContent = '';
let mainScriptMatch = null;
let match;
let allMatches = [];

const tempHTML = dashboardWithoutCSS;
while ((match = scriptRegex.exec(tempHTML)) !== null) {
  allMatches.push({ full: match[0], content: match[1], index: match.index });
}

// The main app script is the LONGEST one (contains all the functions)
allMatches.sort((a, b) => b.content.length - a.content.length);
if (allMatches.length > 0) {
  mainScriptMatch = allMatches[0];
  mainScriptContent = mainScriptMatch.content.trim();

  // ── v63.0 refactor — concatenate src/js/*.js modules at the start of the bundle ──
  // The dashboard.html source references global vars (T_FR, T_DE, …) declared in module
  // files. Those must be defined BEFORE the main script body runs, hence we prepend
  // them. Single bundle hash preserved (cache strategy unchanged), only source code
  // is now organized in separate files.
  const modulesDir = path.join(SRC, 'js');
  let modulesContent = '';
  if (fs.existsSync(modulesDir)) {
    // Sort alphabetically for deterministic order. If interdependencies arise later,
    // switch to an explicit ordered list here.
    const moduleFiles = fs.readdirSync(modulesDir)
      .filter(f => f.endsWith('.js'))
      .sort();
    moduleFiles.forEach(f => {
      const src = fs.readFileSync(path.join(modulesDir, f), 'utf8');
      modulesContent += `\n// ═══════════════════════════════════════\n`;
      modulesContent += `// MODULE INJECTED BY BUILD.JS : src/js/${f}\n`;
      modulesContent += `// ═══════════════════════════════════════\n`;
      modulesContent += src.trim() + '\n';
    });
    if (moduleFiles.length > 0) {
      console.log(`  ✅ Modules concatenated → ${moduleFiles.length} files (${Math.round(modulesContent.length/1024)}KB)`);
      moduleFiles.forEach(f => console.log(`     • ${f}`));
    }
  }
  const finalScriptContent = modulesContent + '\n' + mainScriptContent;

  const jsHash = hash(finalScriptContent);
  const jsFilename = `app.${jsHash}.js`;
  fs.writeFileSync(path.join(DIST, 'assets', jsFilename), finalScriptContent);
  console.log(`  ✅ JS extracted  → assets/${jsFilename} (${Math.round(finalScriptContent.length/1024)}KB)`);

  // Replace the big script block with an external reference
  dashboardWithoutCSS = dashboardWithoutCSS.replace(
    mainScriptMatch.full,
    `<script src="/assets/${jsFilename}"></script>`
  );
}

// Write the processed dashboard.html
fs.writeFileSync(path.join(DIST, 'dashboard.html'), dashboardWithoutCSS);
console.log(`  ✅ dashboard.html → dist/ (${Math.round(dashboardWithoutCSS.length/1024)}KB, slim)`);

// ── 2. Copy other files as-is ──────────────────────
// Whitelist for non-html static files; HTML files are auto-globbed below
// (so freshly-generated legal pages — privacy_*.html, terms_*.html, legal_*.html — ship without
//  needing a build.js change every time a language is added).
// v62.32 SEO base : robots.txt, sitemap.xml, og-image.png ajoutés.
const copyStatic = ['sw.js', 'manifest.json', 'version.json', 'robots.txt', 'sitemap.xml', 'og-image.png'];
copyStatic.forEach(f => {
  const src = path.join(SRC, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(DIST, f));
  }
});

// Auto-glob all *.html except dashboard.html (which has its own CSS/JS extraction pass above)
const htmlFiles = fs.readdirSync(SRC)
  .filter(f => f.endsWith('.html') && f !== 'dashboard.html');
htmlFiles.forEach(f => {
  fs.copyFileSync(path.join(SRC, f), path.join(DIST, f));
});
console.log(`  ✅ ${copyStatic.length} static files + ${htmlFiles.length} HTML pages copied`);

// Copy icons
const iconsDir = path.join(SRC, 'icons');
if (fs.existsSync(iconsDir)) {
  fs.readdirSync(iconsDir).forEach(f => {
    fs.copyFileSync(path.join(iconsDir, f), path.join(DIST, 'icons', f));
  });
  console.log('  ✅ Icons copied');
}

// ── 2.5. Generate localized landing variants /de/ /en/ /it/ (v62.34) ─────
// Audit risque 2.2 #6 : Google indexait /index.html (FR) pour toutes les
// langues. En générant des URLs canoniques distinctes par langue avec
// meta tags traduits, Google indexe 4 langues séparément = surface SEO ×4.
//
// Stratégie : on lit le dist/index.html déjà processé (CSS/JS hashés),
// on remplace les meta + canonical + lang attribute pour chaque variante,
// et on injecte un <script>window.__svInitialLang='xx';</script> qui
// déclenche setLangPage() au boot pour pré-régler la langue côté client.
//
const LANG_VARIANTS = {
  de: {
    htmlLang: 'de-CH',
    title: 'SPORTVISE — KI-Sportmanagement · Schweiz · 11 Experten-Agenten',
    description: 'KI-Sportmanagement für die Schweiz — 11 Experten-Agenten (Physis, Mental, Finanzen, Sponsoren, Verträge), kontextualisierte Ratschläge zu Kalender und Tagebuch. Ab CHF 0/Monat.',
    keywords: 'KI-Coach Schweiz, Sportmanagement Schweiz, KI-Agent Athlet, Online-Konditionstraining, Sportsponsoring Schweiz, Sportlerbesteuerung Schweiz, Sportvertrag Schweiz',
    ogTitle: 'SPORTVISE — 11 KI-Agenten für den Schweizer Athleten',
    ogDescription: 'KI-Sportmanagement, gedacht für die Schweiz. Physis, Mental, Finanzen, Sponsoren, Verträge — 11 Experten-Agenten, die sich an jedes Training erinnern. Ab CHF 0/Monat.',
    ogLocale: 'de_CH',
    canonicalUrl: 'https://sportvise.ch/de/',
    canonicalPath: '/de/'
  },
  en: {
    htmlLang: 'en',
    title: 'SPORTVISE — AI Sports Management · Switzerland · 11 Expert Agents',
    description: 'AI sports management designed for Switzerland — 11 expert agents (physical, mental, finance, sponsors, contracts), advice contextualized to your calendar and journal. From CHF 0/month.',
    keywords: 'AI coach Switzerland, sports management Switzerland, AI agent athlete, online physical preparation, sports sponsors Switzerland, athlete tax Switzerland, sports contract Switzerland',
    ogTitle: 'SPORTVISE — 11 AI agents for the Swiss athlete',
    ogDescription: 'AI sports management designed for Switzerland. Physical, mental, finance, sponsors, contracts — 11 expert agents who remember every training session. From CHF 0/month.',
    ogLocale: 'en_US',
    canonicalUrl: 'https://sportvise.ch/en/',
    canonicalPath: '/en/'
  },
  it: {
    htmlLang: 'it-CH',
    title: 'SPORTVISE — Sport Management IA · Svizzera · 11 agenti esperti',
    description: 'Sport management IA pensato per la Svizzera — 11 agenti esperti (fisico, mentale, finanza, sponsor, contratti), consigli contestualizzati al tuo calendario e diario. Da CHF 0/mese.',
    keywords: 'coach IA Svizzera, sport management Svizzera, agente IA atleta, preparazione fisica online, sponsor sportivi Svizzera, fiscalità atleta Svizzera, contratto sportivo Svizzera',
    ogTitle: 'SPORTVISE — 11 agenti IA per l\'atleta svizzero',
    ogDescription: 'Sport management IA pensato per la Svizzera. Fisico, mentale, finanza, sponsor, contratti — 11 agenti esperti che si ricordano di ogni allenamento. Da CHF 0/mese.',
    ogLocale: 'it_CH',
    canonicalUrl: 'https://sportvise.ch/it/',
    canonicalPath: '/it/'
  }
};

// Re-read the freshly written dist/index.html (FR default, already has hashed CSS/JS refs)
const baseLanding = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');

Object.entries(LANG_VARIANTS).forEach(([lang, cfg]) => {
  let v = baseLanding;

  // 1. <html lang="fr"> → <html lang="xx-CH">
  v = v.replace(/<html lang="[^"]*">/, `<html lang="${cfg.htmlLang}">`);

  // 2. <title>...</title>
  v = v.replace(/<title>[^<]*<\/title>/, `<title>${cfg.title}</title>`);

  // 3. <meta name="description">
  v = v.replace(
    /<meta name="description" content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${cfg.description}" />`
  );

  // 4. <meta name="keywords">
  v = v.replace(
    /<meta name="keywords" content="[^"]*"\s*\/?>/,
    `<meta name="keywords" content="${cfg.keywords}" />`
  );

  // 5. <link rel="canonical">
  v = v.replace(
    /<link rel="canonical" href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${cfg.canonicalUrl}" />`
  );

  // 6. og:title / og:description / og:url / og:locale
  v = v.replace(
    /<meta property="og:title" content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${cfg.ogTitle}" />`
  );
  v = v.replace(
    /<meta property="og:description" content="[^"]*"\s*\/?>/,
    `<meta property="og:description" content="${cfg.ogDescription}" />`
  );
  v = v.replace(
    /<meta property="og:url" content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${cfg.canonicalUrl}" />`
  );
  v = v.replace(
    /<meta property="og:locale" content="[^"]*"\s*\/?>/,
    `<meta property="og:locale" content="${cfg.ogLocale}" />`
  );

  // 7. twitter:title / twitter:description
  v = v.replace(
    /<meta name="twitter:title" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:title" content="${cfg.ogTitle}" />`
  );
  v = v.replace(
    /<meta name="twitter:description" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:description" content="${cfg.ogDescription}" />`
  );

  // 8. Inject window.__svInitialLang BEFORE the i18n script (so setLangPage applies at boot)
  // We inject it just before the closing </head> tag.
  v = v.replace(
    /<\/head>/,
    `<script>window.__svInitialLang='${lang}';</script>\n</head>`
  );

  // Write to dist/{lang}/index.html
  const langDir = path.join(DIST, lang);
  fs.mkdirSync(langDir, { recursive: true });
  fs.writeFileSync(path.join(langDir, 'index.html'), v);
  console.log(`  ✅ /${lang}/index.html generated (${Math.round(v.length / 1024)}KB)`);
});

// ── 3. Summary ──────────────────────────────────────
const distFiles = [];
function listFiles(dir, prefix = '') {
  fs.readdirSync(dir).forEach(f => {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      listFiles(full, prefix + f + '/');
    } else {
      distFiles.push(prefix + f);
    }
  });
}
listFiles(DIST);

console.log(`\n📦 Build complete: ${distFiles.length} files in dist/`);
console.log('   Key files:');
distFiles.filter(f => f.includes('assets/')).forEach(f => console.log(`   → ${f}`));
console.log('\n🚀 Ready for Netlify deployment!');
