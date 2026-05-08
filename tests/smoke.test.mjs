#!/usr/bin/env node
/**
 * SPORTVISE — Smoke test prod
 * ────────────────────────────────────────────────────────────────────────
 * Tests automatisés sur https://sportvise.ch.
 *
 * Usage :
 *   node tests/smoke.test.mjs              → teste prod (https://sportvise.ch)
 *   BASE=https://staging.sportvise.ch node tests/smoke.test.mjs   → teste autre URL
 *
 * Quand l'utiliser :
 *   - Avant chaque push GitHub (smoke check post-build local)
 *   - Après chaque déploiement Netlify (vérifier que rien n'est cassé en prod)
 *   - Lundi matin pour vérifier que le déploiement weekend tient
 *
 * Sortie :
 *   ✓ assertion OK
 *   ✗ assertion FAIL (exit code 1)
 *   ⚠ warning non-bloquant
 *
 * Aucune dépendance externe — utilise fetch natif Node 18+.
 * Créé en v62.33 (audit complet 2026-05-08, risque 2.2 #2).
 */

const BASE = process.env.BASE || 'https://sportvise.ch';
const TIMEOUT_MS = 15000;

let passes = 0;
let fails = 0;
let warnings = 0;

const ok = (msg) => { passes++; console.log(`  \x1b[32m✓\x1b[0m ${msg}`); };
const fail = (msg) => { fails++; console.log(`  \x1b[31m✗\x1b[0m ${msg}`); process.exitCode = 1; };
const warn = (msg) => { warnings++; console.log(`  \x1b[33m⚠\x1b[0m ${msg}`); };
const section = (title) => console.log(`\n\x1b[1m\x1b[36m── ${title} ───────────\x1b[0m`);

async function getResponse(path, opts = {}) {
  const url = BASE + path;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: ac.signal });
    const text = await res.text();
    return { status: res.status, headers: res.headers, text, url };
  } catch (e) {
    return { error: e.message, url };
  } finally {
    clearTimeout(t);
  }
}

function expectStatus(res, expected, label) {
  if (res.error) return fail(`${label} : crash → ${res.error}`);
  if (res.status === expected) ok(`${label} → ${expected}`);
  else fail(`${label} → ${res.status} (attendu ${expected})`);
}

function expectHeader(res, header, expectedRegex, label) {
  if (res.error) return; // déjà reporté
  const value = res.headers.get(header);
  if (!value) return fail(`${label} : header ${header} absent`);
  if (expectedRegex.test(value)) ok(`${label} : ${header} = ${value}`);
  else fail(`${label} : ${header} = "${value}" (attendu match ${expectedRegex})`);
}

function expectContains(res, pattern, label) {
  if (res.error) return;
  if (typeof pattern === 'string' ? res.text.includes(pattern) : pattern.test(res.text)) {
    ok(`${label}`);
  } else {
    fail(`${label} : pattern absent`);
  }
}

// ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n\x1b[1mSPORTVISE smoke-test\x1b[0m`);
  console.log(`Cible : ${BASE}`);
  console.log(`Date  : ${new Date().toISOString()}`);

  // ── 1. version.json ──
  section('Version & cache');
  const vJson = await getResponse('/version.json');
  expectStatus(vJson, 200, 'GET /version.json');
  if (!vJson.error) {
    try {
      const v = JSON.parse(vJson.text);
      if (/^\d+\.\d+/.test(v.version)) ok(`version.json valide → v${v.version} (${v.date})`);
      else fail(`version.json : champ "version" invalide → ${v.version}`);
    } catch (e) {
      fail(`version.json : JSON invalide → ${e.message}`);
    }
    expectHeader(vJson, 'cache-control', /no-cache|no-store|max-age=0/i, 'version.json no-cache');
  }

  // ── 2. SEO files (v62.32) ──
  section('SEO base (v62.32)');
  const robots = await getResponse('/robots.txt');
  expectStatus(robots, 200, 'GET /robots.txt');
  expectContains(robots, 'User-agent', '/robots.txt contient User-agent');
  expectContains(robots, 'Sitemap:', '/robots.txt pointe vers sitemap');

  const sitemap = await getResponse('/sitemap.xml');
  expectStatus(sitemap, 200, 'GET /sitemap.xml');
  expectContains(sitemap, '<urlset', '/sitemap.xml contient <urlset>');
  expectContains(sitemap, 'https://sportvise.ch/', '/sitemap.xml contient URL canonique');

  const ogImg = await getResponse('/og-image.png');
  expectStatus(ogImg, 200, 'GET /og-image.png');
  if (!ogImg.error) {
    const ct = ogImg.headers.get('content-type') || '';
    if (ct.includes('image/png')) ok(`/og-image.png content-type → ${ct}`);
    else fail(`/og-image.png content-type → "${ct}" (attendu image/png)`);
  }

  // ── 3. Pages publiques ──
  section('Pages publiques');
  const landing = await getResponse('/');
  expectStatus(landing, 200, 'GET / (landing)');
  expectContains(landing, '<title>', '/ contient <title>');
  expectContains(landing, 'og:title', '/ contient OG tags');
  expectContains(landing, 'application/ld+json', '/ contient JSON-LD');
  expectContains(landing, 'rel="canonical"', '/ contient canonical');
  expectContains(landing, 'hreflang=', '/ contient hreflang');

  const login = await getResponse('/login.html');
  expectStatus(login, 200, 'GET /login.html');

  const dashboard = await getResponse('/dashboard.html');
  expectStatus(dashboard, 200, 'GET /dashboard.html');
  expectContains(dashboard, 'app-version', '/dashboard.html contient meta app-version');

  // ── 4. Pages légales (4 langues) ──
  section('Pages légales');
  for (const lang of ['fr', 'de', 'en', 'it']) {
    const privacy = await getResponse(`/privacy_${lang}.html`);
    expectStatus(privacy, 200, `GET /privacy_${lang}.html`);
    const terms = await getResponse(`/terms_${lang}.html`);
    expectStatus(terms, 200, `GET /terms_${lang}.html`);
  }

  // ── 4.5 Pages localisées séparées /de/ /en/ /it/ (v62.34) ──
  section('Pages localisées (v62.34)');
  const langExpect = {
    de: { lang: 'de-CH', titleHas: 'KI-Sportmanagement', canonicalHas: '/de/' },
    en: { lang: 'en',    titleHas: 'AI Sports Management', canonicalHas: '/en/' },
    it: { lang: 'it-CH', titleHas: 'Sport Management IA',  canonicalHas: '/it/' }
  };
  for (const [lang, exp] of Object.entries(langExpect)) {
    const variant = await getResponse(`/${lang}/`);
    expectStatus(variant, 200, `GET /${lang}/`);
    if (!variant.error) {
      const langMatch = variant.text.match(/<html lang="([^"]+)"/);
      if (langMatch && langMatch[1] === exp.lang) ok(`/${lang}/ html lang → ${exp.lang}`);
      else fail(`/${lang}/ html lang → ${langMatch ? langMatch[1] : 'MISSING'} (attendu ${exp.lang})`);

      if (variant.text.includes(exp.titleHas)) ok(`/${lang}/ title contient "${exp.titleHas}"`);
      else fail(`/${lang}/ title ne contient pas "${exp.titleHas}"`);

      if (variant.text.includes(`href="https://sportvise.ch${exp.canonicalHas}"`)) ok(`/${lang}/ canonical → ${exp.canonicalHas}`);
      else fail(`/${lang}/ canonical incorrecte (attendu ${exp.canonicalHas})`);

      if (variant.text.includes(`window.__svInitialLang='${lang}'`)) ok(`/${lang}/ __svInitialLang injecté`);
      else fail(`/${lang}/ __svInitialLang absent`);
    }
  }

  // ── 5. Headers de sécurité ──
  section('Headers sécurité (netlify.toml)');
  expectHeader(landing, 'x-frame-options', /^DENY$/i, '/ X-Frame-Options DENY');
  expectHeader(landing, 'x-content-type-options', /^nosniff$/i, '/ X-Content-Type-Options nosniff');
  expectHeader(dashboard, 'x-frame-options', /^DENY$/i, '/dashboard X-Frame-Options DENY');

  // ── 6. Caching policy ──
  section('Cache headers');
  expectHeader(landing, 'cache-control', /no-cache|no-store|max-age=0/i, '/ HTML no-cache');
  expectHeader(dashboard, 'cache-control', /no-cache|no-store|max-age=0/i, '/dashboard.html no-cache');

  // ── 7. Endpoints API (sans auth → doit échouer) ──
  section('API auth (sans token = doit refuser)');
  const chatNoAuth = await getResponse('/.netlify/functions/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'test' })
  });
  if (chatNoAuth.error) {
    fail(`/chat sans auth : crash → ${chatNoAuth.error}`);
  } else if (chatNoAuth.status >= 400 && chatNoAuth.status < 500) {
    ok(`/chat sans auth → ${chatNoAuth.status} (refus correct)`);
  } else {
    fail(`/chat sans auth → ${chatNoAuth.status} (attendu 4xx)`);
  }

  // ── 8. Bots IA whitelistés dans robots.txt ──
  section('Robots.txt — bots IA');
  if (!robots.error) {
    for (const bot of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended']) {
      if (robots.text.includes(bot)) ok(`robots.txt mentionne ${bot}`);
      else warn(`robots.txt ne mentionne pas ${bot}`);
    }
  }

  // ── 9. Disallow admin/nuke dans robots.txt ──
  if (!robots.error) {
    for (const path of ['/admin', '/nuke', '/dashboard.html']) {
      if (robots.text.includes(`Disallow: ${path}`)) ok(`robots.txt disallow ${path}`);
      else warn(`robots.txt ne disallow pas ${path}`);
    }
  }

  // ── Récap ──
  console.log(`\n\x1b[1m── Récap ───────────\x1b[0m`);
  console.log(`  Passes  : \x1b[32m${passes}\x1b[0m`);
  console.log(`  Fails   : ${fails > 0 ? '\x1b[31m' : ''}${fails}\x1b[0m`);
  console.log(`  Warnings: ${warnings > 0 ? '\x1b[33m' : ''}${warnings}\x1b[0m`);

  if (fails === 0) {
    console.log(`\n\x1b[32m\x1b[1m✓ Smoke-test OK — prod en bonne santé\x1b[0m\n`);
  } else {
    console.log(`\n\x1b[31m\x1b[1m✗ Smoke-test FAIL — ${fails} assertion(s) en erreur\x1b[0m\n`);
  }
}

main().catch((e) => {
  console.error(`\n\x1b[31m\x1b[1m✗ Smoke-test crashed\x1b[0m : ${e.message}`);
  console.error(e.stack);
  process.exit(2);
});
