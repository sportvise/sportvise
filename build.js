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

  const jsHash = hash(mainScriptContent);
  const jsFilename = `app.${jsHash}.js`;
  fs.writeFileSync(path.join(DIST, 'assets', jsFilename), mainScriptContent);
  console.log(`  ✅ JS extracted  → assets/${jsFilename} (${Math.round(mainScriptContent.length/1024)}KB)`);

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
const copyStatic = ['sw.js', 'manifest.json', 'version.json'];
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
