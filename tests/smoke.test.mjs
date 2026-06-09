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

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const BASE = process.env.BASE || 'https://sportvise.ch';
const TIMEOUT_MS = 15000;

// Lecture locale du source dashboard.html (le prod slim n'embarque pas _SV_CLUBS)
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
let srcDashboard = null;
try { srcDashboard = readFileSync(join(__dirname, '../src/dashboard.html'), 'utf8'); } catch(e) { srcDashboard = null; }

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

  // ── 10. Auth flow réel (opt-in via env vars) — v62.36 ──
  // Teste que l'app métier marche : login Supabase → JWT → /chat avec auth → 200 + JSON.
  // OPT-IN car (a) consomme 1 appel Anthropic ≈ $0.005-0.01 par run, (b) nécessite credentials.
  //
  // Activation : exporter avant la commande
  //   export SV_TEST_EMAIL=thomas.castella1@gmail.com
  //   export SV_TEST_PASSWORD='ton_mot_de_passe_test'
  //   node tests/smoke.test.mjs
  //
  // Si les 2 vars sont absentes, on skip avec un warning explicatif.
  section('Auth flow réel (opt-in via env vars)');
  const testEmail = process.env.SV_TEST_EMAIL;
  const testPassword = process.env.SV_TEST_PASSWORD;
  if (!testEmail || !testPassword) {
    warn('SV_TEST_EMAIL ou SV_TEST_PASSWORD absents → flow auth skippé');
    warn('Pour activer : export SV_TEST_EMAIL=… SV_TEST_PASSWORD=… puis relancer');
  } else {
    const SUPABASE_URL = 'https://ckikyvokurpehavjlkbc.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNraWt5dm9rdXJwZWhhdmpsa2JjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMjE2MzgsImV4cCI6MjA5MTY5NzYzOH0.nbvRqNly8KnqlaInY62C9YOA5-32YxrFSavXyreCOYY';

    // Step 10a: Supabase password grant
    let accessToken = null;
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
      const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ email: testEmail, password: testPassword }),
        signal: ac.signal
      });
      clearTimeout(t);
      const authBody = await authRes.json();
      if (authRes.status === 200 && authBody.access_token) {
        accessToken = authBody.access_token;
        ok(`Supabase login → 200 (token ${accessToken.slice(0, 12)}…, user ${authBody.user?.email || '?'})`);
      } else {
        fail(`Supabase login → ${authRes.status} ${authBody.error_description || authBody.msg || JSON.stringify(authBody).slice(0, 80)}`);
      }
    } catch (e) {
      fail(`Supabase login : crash → ${e.message}`);
    }

    // Step 10b: /chat avec JWT — endpoint critique métier
    if (accessToken) {
      try {
        const ac2 = new AbortController();
        const t2 = setTimeout(() => ac2.abort(), TIMEOUT_MS * 2); // 30s pour Claude API
        const chatRes = await fetch(`${BASE}/.netlify/functions/chat`, {
          method: 'POST',
          headers: {
            'authorization': `Bearer ${accessToken}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            agentId: 'physique',
            message: 'ping smoke test (réponds juste "ok" pour minimiser les tokens)',
            lang: 'fr'
          }),
          signal: ac2.signal
        });
        clearTimeout(t2);
        const chatText = await chatRes.text();
        if (chatRes.status === 200) {
          try {
            const chatBody = JSON.parse(chatText);
            const reply = chatBody.reply || chatBody.message || chatBody.content || '';
            if (reply.length > 0) {
              ok(`/chat avec JWT → 200, reply ${reply.length} chars (preview: "${reply.slice(0, 40)}…")`);
            } else {
              fail(`/chat → 200 mais reply vide ou champ inattendu (keys: ${Object.keys(chatBody).join(',')})`);
            }
          } catch (e) {
            fail(`/chat → 200 mais JSON invalide : ${e.message}`);
          }
        } else if (chatRes.status === 429) {
          warn(`/chat → 429 rate-limited (compte test a atteint son quota — OK, l'auth marche)`);
        } else {
          fail(`/chat → ${chatRes.status} (attendu 200 ou 429), body : ${chatText.slice(0, 120)}`);
        }
      } catch (e) {
        fail(`/chat avec JWT : crash → ${e.message}`);
      }
    }

    // Step 10c: /weekly-insight avec JWT (read-only, pas d'effet de bord)
    if (accessToken) {
      try {
        const ac3 = new AbortController();
        const t3 = setTimeout(() => ac3.abort(), TIMEOUT_MS * 2);
        const wiRes = await fetch(`${BASE}/.netlify/functions/weekly-insight`, {
          method: 'POST',
          headers: {
            'authorization': `Bearer ${accessToken}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify({ lang: 'fr' }),
          signal: ac3.signal
        });
        clearTimeout(t3);
        if (wiRes.status === 200 || wiRes.status === 429 || wiRes.status === 204) {
          ok(`/weekly-insight avec JWT → ${wiRes.status} (200/204/429 acceptables)`);
        } else if (wiRes.status === 400) {
          warn(`/weekly-insight → 400 (probablement payload incomplet — endpoint vivant)`);
        } else {
          fail(`/weekly-insight → ${wiRes.status} (attendu 200/204/429)`);
        }
      } catch (e) {
        fail(`/weekly-insight avec JWT : crash → ${e.message}`);
      }
    }
  }

  // ── 11. Clubs list sanity (static — no API cost) ──────────────────────
  // SOURCE DE VÉRITÉ : src/data/clubs.json (depuis v63.42.0 — build.js injecte dans dashboard.html).
  // Le bloc _SV_CLUBS dans dashboard.html est désormais un placeholder → on lit clubs.json directement.
  section('Clubs list sanity (src/data/clubs.json)');
  let clubsJson = null;
  try { clubsJson = JSON.parse(readFileSync(join(__dirname, '../src/data/clubs.json'), 'utf8')); } catch(e) { clubsJson = null; }
  if (clubsJson) {
    const slClubs  = clubsJson?.football?.['Super League'] || [];
    const clClubs  = clubsJson?.football?.['Challenge League'] || [];
    const hlClubs  = clubsJson?.hockey?.['Swiss League'] || [];
    const sblClubs = clubsJson?.basketball?.['SB League'] || [];

    // Football Super League — clubs attendus 2026-27
    const slMustHave    = ['FC Lausanne-Sport', 'FC Vaduz', 'FC Thun', 'Grasshopper Club', 'BSC Young Boys'];
    const slMustNotHave = ['FC Winterthur']; // relégué en CL
    for (const c of slMustHave) {
      if (slClubs.includes(c)) ok(`SL 2026-27 contient "${c}"`);
      else if (clClubs.includes(c)) fail(`"${c}" présent en CL mais pas en SL (mauvaise division)`);
      else fail(`SL 2026-27 manque "${c}"`);
    }
    for (const c of slMustNotHave) {
      if (slClubs.includes(c)) fail(`"${c}" toujours en Super League (devrait être en CL)`);
      else ok(`SL 2026-27 ne contient plus "${c}" (relégué correct)`);
    }

    // Football Challenge League — FC Winterthur doit y être
    if (clClubs.includes('FC Winterthur')) ok('CL 2026-27 contient "FC Winterthur" (relégué SL)');
    else fail('CL 2026-27 manque "FC Winterthur"');
    if (clClubs.includes('FC Vaduz')) fail('"FC Vaduz" encore en CL (devrait être en SL)');
    else ok('"FC Vaduz" absent de la CL (promu SL correct)');
    for (const c of ['SC Brühl', 'FC Schaffhausen']) {
      if (clClubs.includes(c)) fail(`CL contient "${c}" (club de 1ère Ligue, à retirer)`);
      else ok(`CL ne contient plus "${c}" (niveau incorrect retiré)`);
    }

    // Hockey Swiss League — doit avoir 11 clubs
    const swissLeagueClubs = ['EHC Arosa','HC Thurgau','HC Chur','HC Winterthur','EHC Olten','EHC Visp','HC Sierre','GCK Lions','EHC Basel','HC La Chaux-de-Fonds'];
    for (const c of swissLeagueClubs) {
      if (hlClubs.includes(c)) ok(`Swiss League contient "${c}"`);
      else fail(`Swiss League manque "${c}"`);
    }

    // Basket — clubs vérifiés agents-data
    const basketMust = ['Fribourg Olympic','Lions de Genève','Jubilee Basket Berne','Nyon Basket','Swiss Central Basket'];
    for (const c of basketMust) {
      if (sblClubs.includes(c)) ok(`SBL contient "${c}"`);
      else fail(`SBL manque "${c}"`);
    }
  } else {
    warn('src/data/clubs.json non lisible localement — clubs sanity skippé');
  }

  // ── 12. Calendar import — sports-data FC Lausanne-Sport (opt-in) ──────
  // Vérifie que le Tier 3 hyphen-stripping résout bien le bug "Club non trouvé".
  // Opt-in car coûte 1-2 appels API-Sports (quota limité).
  section('Calendar import sports-data (opt-in — set SV_TEST_SPORTS_DATA=1)');
  if (!process.env.SV_TEST_SPORTS_DATA) {
    warn('SV_TEST_SPORTS_DATA absent → sports-data skippé (export SV_TEST_SPORTS_DATA=1 pour activer)');
  } else {
    const clubsToCheck = [
      { club: 'FC Lausanne-Sport', sport: 'football', league: 207 },
      { club: 'BSC Young Boys',    sport: 'football', league: 207 },
      { club: 'SC Bern',           sport: 'hockey',   league: 38  },
    ];
    for (const { club, sport, league } of clubsToCheck) {
      const sdRes = await getResponse(
        `/.netlify/functions/sports-data?sport=${sport}&action=team-fixtures&league=${league}&club=${encodeURIComponent(club)}`
      );
      if (sdRes.error) { fail(`sports-data "${club}" : crash → ${sdRes.error}`); continue; }
      if (sdRes.status !== 200) { fail(`sports-data "${club}" → ${sdRes.status}`); continue; }
      try {
        const body = JSON.parse(sdRes.text);
        if (body?.data?.teamFound === true) ok(`sports-data "${club}" → teamFound: true ✓`);
        else if (body?.data?.teamFound === false) fail(`sports-data "${club}" → teamFound: false (club non trouvé dans l'API)`);
        else fail(`sports-data "${club}" → structure inattendue : ${JSON.stringify(body).slice(0, 80)}`);
      } catch (e) {
        fail(`sports-data "${club}" → JSON invalide : ${e.message}`);
      }
    }
  }

  // ── 13. Qualité agents — tutoiement & longueur (opt-in avec auth) ─────
  // Vérifie que les agents ne vouvoient pas l'athlète et que bypassSession1
  // produit un message court (< 1400 chars ≈ 350 tokens).
  // Requiert SV_TEST_EMAIL + SV_TEST_PASSWORD (réutilise la session section 10).
  // Coût : ~1 appel Haiku (~$0.001) par run.
  section('Qualité agents — tutoiement & bypassSession1 (opt-in)');
  const testEmailQ = process.env.SV_TEST_EMAIL;
  const testPasswordQ = process.env.SV_TEST_PASSWORD;
  if (!testEmailQ || !testPasswordQ) {
    warn('SV_TEST_EMAIL/PASSWORD absents → qualité agents skippée');
  } else {
    // Re-login (section 10 peut avoir expiré ou pas tourné)
    let qToken = null;
    try {
      const SUPABASE_URL = 'https://ckikyvokurpehavjlkbc.supabase.co';
      const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNraWt5dm9rdXJwZWhhdmpsa2JjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMjE2MzgsImV4cCI6MjA5MTY5NzYzOH0.nbvRqNly8KnqlaInY62C9YOA5-32YxrFSavXyreCOYY';
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
      const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ email: testEmailQ, password: testPasswordQ }),
        signal: ac.signal
      });
      clearTimeout(t);
      const authBody = await authRes.json();
      if (authRes.status === 200 && authBody.access_token) qToken = authBody.access_token;
    } catch (e) { warn(`Re-login échoué : ${e.message}`); }

    if (qToken) {
      // 13a. bypassSession1 — message de bienvenue court, pas de vouvoiement
      try {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 30000);
        const ahaRes = await fetch(`${BASE}/.netlify/functions/chat`, {
          method: 'POST',
          headers: { 'authorization': `Bearer ${qToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            agentId: 'equipe',
            message: 'Première analyse d\'onboarding. Voici mon profil : Sport: Football, Niveau: Professionnel, Objectif principal: Progresser. Donne-moi ta première analyse personnalisée.',
            history: [],
            lang: 'fr',
            bypassSession1: true
          }),
          signal: ac.signal
        });
        clearTimeout(t);
        if (ahaRes.status === 200) {
          const body = JSON.parse(await ahaRes.text());
          const reply = body.reply || body.message || body.content || '';
          // Longueur : bienvenue = court (< 1400 chars)
          if (reply.length === 0) {
            fail('bypassSession1 → reply vide');
          } else if (reply.length > 1400) {
            fail(`bypassSession1 → réponse trop longue : ${reply.length} chars (max 1400 — trop lent pour une bienvenue)`);
          } else {
            ok(`bypassSession1 → longueur OK : ${reply.length} chars`);
          }
          // Tutoiement : détecter "vous" / "votre" / "vos" singuliers
          // Heuristique : chercher " vous " / " votre " / " vos " comme mots isolés
          const vouvoiement = reply.match(/\b(vous|votre|vos)\b/gi) || [];
          if (vouvoiement.length > 0) {
            fail(`bypassSession1 → VOUVOIEMENT détecté : "${vouvoiement.join('", "')}" dans la réponse`);
          } else {
            ok(`bypassSession1 → pas de vouvoiement singulier ✓`);
          }
        } else if (ahaRes.status === 429) {
          warn('bypassSession1 → 429 rate-limited (quota atteint — OK)');
        } else {
          fail(`bypassSession1 → ${ahaRes.status}`);
        }
      } catch (e) {
        fail(`bypassSession1 : crash → ${e.message}`);
      }

      // 13b. Message normal agent — tutoiement
      try {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 30000);
        const normRes = await fetch(`${BASE}/.netlify/functions/chat`, {
          method: 'POST',
          headers: { 'authorization': `Bearer ${qToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            agentId: 'physique',
            message: 'Donne-moi un conseil court pour récupérer après un match.',
            history: [],
            lang: 'fr'
          }),
          signal: ac.signal
        });
        clearTimeout(t);
        if (normRes.status === 200) {
          const body = JSON.parse(await normRes.text());
          const reply = body.reply || body.message || body.content || '';
          const vouvoiement = reply.match(/\b(vous|votre|vos)\b/gi) || [];
          if (vouvoiement.length > 0) fail(`Agent physique → VOUVOIEMENT : "${vouvoiement.join('", "')}" (règle tutoiement violée)`);
          else ok(`Agent physique → tutoiement OK (preview: "${reply.slice(0,60)}…")`);
        } else if (normRes.status === 429) {
          warn('Agent physique → 429 rate-limited');
        } else {
          fail(`Agent physique → ${normRes.status}`);
        }
      } catch (e) {
        fail(`Agent physique : crash → ${e.message}`);
      }
    } else {
      warn('Pas de token → tests qualité agents skippés');
    }
  }

  // ── 14. Briefs push — endpoints accessibles (opt-in trigger token) ─────
  section('Briefs push — endpoints (opt-in — set BRIEF_TRIGGER_TOKEN=…)');
  const triggerToken = process.env.BRIEF_TRIGGER_TOKEN;
  if (!triggerToken) {
    warn('BRIEF_TRIGGER_TOKEN absent → briefs push skippés (export BRIEF_TRIGGER_TOKEN=… pour activer)');
  } else {
    for (const fnName of ['send-morning-brief', 'send-evening-brief']) {
      const briefRes = await getResponse(`/.netlify/functions/${fnName}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-trigger-token': triggerToken },
        body: JSON.stringify({})
      });
      if (briefRes.error) { fail(`${fnName} : crash → ${briefRes.error}`); continue; }
      if (briefRes.status === 200) {
        try {
          const b = JSON.parse(briefRes.text);
          if (b.ok === true) ok(`${fnName} → 200 ok:true (totalUsers: ${b.totalUsers ?? '?'}, sent: ${b.sent ?? '?'})`);
          else fail(`${fnName} → 200 mais ok:false — ${JSON.stringify(b).slice(0,80)}`);
        } catch (e) { fail(`${fnName} → 200 mais JSON invalide`); }
      } else if (briefRes.status === 401) {
        fail(`${fnName} → 401 (token invalide ou absent)`);
      } else {
        fail(`${fnName} → ${briefRes.status}`);
      }
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
