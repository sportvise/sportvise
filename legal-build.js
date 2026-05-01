#!/usr/bin/env node
/**
 * SPORTVISE — Legal HTML Generator
 *
 * Convertit les drafts Markdown (PRIVACY_POLICY_*.md, TERMS_OF_SERVICE_*.md, LEGAL_NOTICE_*.md)
 * × 4 langues (fr, de, en, it) en pages HTML statiques stylées.
 *
 * Sortie : 12 fichiers HTML dans Code/src/ :
 *   privacy_{fr,de,en,it}.html
 *   terms_{fr,de,en,it}.html
 *   legal_{fr,de,en,it}.html
 *
 * Usage : node legal-build.js
 *
 * Note : `[DATE_LAUNCH]` reste un placeholder visible — à search/replace au push prod
 * (ex. `sed -i '' 's/\[DATE_LAUNCH\]/15 juin 2026/g' src/*.html`).
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..'); // Documents/SPORTVISE/
const SRC_DIR = path.join(__dirname, 'src');     // Documents/SPORTVISE/Code/src/

const LANGS = ['fr', 'de', 'en', 'it'];

const SECTIONS = [
  { slug: 'privacy', mdPrefix: 'PRIVACY_POLICY' },
  { slug: 'terms',   mdPrefix: 'TERMS_OF_SERVICE' },
  { slug: 'legal',   mdPrefix: 'LEGAL_NOTICE' }
];

// ── i18n des éléments du chrome (header, switcher, footer) ──────
const I18N = {
  fr: {
    htmlLang: 'fr',
    backHome: '← Retour à l\'accueil',
    siteTagline: '🇨🇭 Management Sportif IA · Suisse',
    pageTitles: { privacy: 'Politique de confidentialité', terms: 'Conditions d\'utilisation', legal: 'Mentions légales' },
    metaDesc:   { privacy: 'Politique de confidentialité SPORTVISE — conformité nLPD / RGPD.', terms: 'Conditions d\'utilisation SPORTVISE.', legal: 'Mentions légales SPORTVISE.' },
    relatedTitle: 'Voir aussi',
    footerCopy: '© 2026 SPORTVISE · Suisse 🇨🇭',
    contact: 'Une question ? Écrivez-nous à info@sportvise.ch'
  },
  de: {
    htmlLang: 'de',
    backHome: '← Zurück zur Startseite',
    siteTagline: '🇨🇭 KI-Sportmanagement · Schweiz',
    pageTitles: { privacy: 'Datenschutzerklärung', terms: 'Nutzungsbedingungen', legal: 'Impressum' },
    metaDesc:   { privacy: 'SPORTVISE Datenschutzerklärung — nDSG / DSGVO.', terms: 'SPORTVISE Nutzungsbedingungen.', legal: 'SPORTVISE Impressum.' },
    relatedTitle: 'Siehe auch',
    footerCopy: '© 2026 SPORTVISE · Schweiz 🇨🇭',
    contact: 'Fragen? Schreiben Sie uns an info@sportvise.ch'
  },
  en: {
    htmlLang: 'en',
    backHome: '← Back to home',
    siteTagline: '🇨🇭 AI Sports Management · Switzerland',
    pageTitles: { privacy: 'Privacy Policy', terms: 'Terms of Service', legal: 'Legal Notice' },
    metaDesc:   { privacy: 'SPORTVISE Privacy Policy — nFADP / GDPR compliant.', terms: 'SPORTVISE Terms of Service.', legal: 'SPORTVISE Legal Notice.' },
    relatedTitle: 'See also',
    footerCopy: '© 2026 SPORTVISE · Switzerland 🇨🇭',
    contact: 'Questions? Reach us at info@sportvise.ch'
  },
  it: {
    htmlLang: 'it',
    backHome: '← Torna alla home',
    siteTagline: '🇨🇭 Sport Management IA · Svizzera',
    pageTitles: { privacy: 'Informativa sulla privacy', terms: 'Condizioni d\'uso', legal: 'Note legali' },
    metaDesc:   { privacy: 'Informativa sulla privacy SPORTVISE — nLPD / GDPR.', terms: 'Condizioni d\'uso SPORTVISE.', legal: 'Note legali SPORTVISE.' },
    relatedTitle: 'Vedi anche',
    footerCopy: '© 2026 SPORTVISE · Svizzera 🇨🇭',
    contact: 'Domande? Scriveteci a info@sportvise.ch'
  }
};

// ─────────────────────────────────────────────────────────────────
// Mini-parseur Markdown ad-hoc — dépendance zéro, suffit pour ces drafts
// ─────────────────────────────────────────────────────────────────

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function parseInline(text) {
  // Échapper en premier
  let out = escapeHtml(text);
  // Code inline : `…` (avant les autres pour protéger le contenu)
  out = out.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  // Liens : [label](url)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const safeUrl = url.replace(/"/g, '&quot;');
    const isExternal = /^https?:/i.test(url);
    const isMailto = /^mailto:/i.test(url);
    const target = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${safeUrl}"${target}>${label}</a>`;
  });
  // Bold : **…** (avant italic pour ne pas casser **)
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic : *…*
  out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  return out;
}

function isTableSeparator(line) {
  // ex : `|---|---|` ou `| --- | --- |`
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function splitTableRow(line) {
  let l = line.trim();
  if (l.startsWith('|')) l = l.slice(1);
  if (l.endsWith('|')) l = l.slice(0, -1);
  return l.split('|').map(c => c.trim());
}

function mdToHtml(md) {
  // Pré-filtrage : retirer les warnings DRAFT (cf. handoff 30/04 — décision pas de revue juriste)
  // Lignes blockquote qui contiennent "DRAFT" ou "validation par juriste" ou similaire
  const draftLineRe = /(DRAFT|validation\s+par\s+juriste|En\s+attente\s+de\s+validation|awaiting\s+legal\s+review|in\s+attesa\s+di\s+revisione|Rechtspr.fung)/i;

  // Retirer les lignes blockquote draft + le footnote italique de fin
  let cleaned = md
    .split('\n')
    .filter(line => !(line.trim().startsWith('>') && draftLineRe.test(line)))
    .filter(line => !(line.trim().startsWith('*') && line.trim().endsWith('*') && draftLineRe.test(line)))
    .join('\n');

  const lines = cleaned.split('\n');
  const html = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Ligne vide → skip
    if (line.trim() === '') { i++; continue; }

    // HR : ---
    if (/^---+\s*$/.test(line)) {
      html.push('<hr/>');
      i++;
      continue;
    }

    // Headers
    const hMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (hMatch) {
      const level = hMatch[1].length;
      const text = parseInline(hMatch[2]);
      html.push(`<h${level}>${text}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote : > … (multi-line)
    if (line.trim().startsWith('>')) {
      const bq = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        bq.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      html.push(`<blockquote>${parseInline(bq.join(' '))}</blockquote>`);
      continue;
    }

    // Table : ligne avec | suivie d'une ligne séparateur
    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headerCells = splitTableRow(line);
      i += 2; // skip header + separator
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      const thead = '<thead><tr>' + headerCells.map(c => `<th>${parseInline(c)}</th>`).join('') + '</tr></thead>';
      const tbody = '<tbody>' + rows.map(r => '<tr>' + r.map(c => `<td>${parseInline(c)}</td>`).join('') + '</tr>').join('') + '</tbody>';
      html.push(`<div class="table-wrap"><table>${thead}${tbody}</table></div>`);
      continue;
    }

    // Liste à puces : - …  (multi-ligne)
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(parseInline(lines[i].replace(/^\s*[-*]\s+/, '')));
        i++;
      }
      html.push('<ul>' + items.map(it => `<li>${it}</li>`).join('') + '</ul>');
      continue;
    }

    // Liste numérotée : 1. … (multi-ligne)
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(parseInline(lines[i].replace(/^\s*\d+\.\s+/, '')));
        i++;
      }
      html.push('<ol>' + items.map(it => `<li>${it}</li>`).join('') + '</ol>');
      continue;
    }

    // Sinon : paragraphe (jusqu'à ligne vide ou block special)
    const pBuf = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^#{1,6}\s+/.test(lines[i]) &&
      !/^---+\s*$/.test(lines[i]) &&
      !lines[i].trim().startsWith('>') &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !(lines[i].includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
    ) {
      pBuf.push(lines[i]);
      i++;
    }
    if (pBuf.length > 0) {
      // Soft breaks intra-paragraphe → <br/> (GFM-style hard line breaks).
      // Important pour conserver les adresses postales, listes plates non puces, etc.
      html.push(`<p>${pBuf.map(l => parseInline(l)).join('<br/>')}</p>`);
    }
  }

  return html.join('\n');
}

// ─────────────────────────────────────────────────────────────────
// Template HTML
// ─────────────────────────────────────────────────────────────────

function renderPage({ section, lang, contentHtml }) {
  const t = I18N[lang];
  const title = t.pageTitles[section];
  const desc = t.metaDesc[section];

  // Cross-links pour le switcher de langue (même section, autre lang)
  const langSwitchLinks = LANGS.map(l => {
    const flag = { fr: '🇫🇷', de: '🇩🇪', en: '🇬🇧', it: '🇮🇹' }[l];
    const labelTitle = { fr: 'Français', de: 'Deutsch', en: 'English', it: 'Italiano' }[l];
    const href = `${section}_${l}.html`;
    const isActive = l === lang;
    return `<a href="${href}" title="${labelTitle}" class="lang-flag${isActive ? ' active' : ''}" aria-current="${isActive ? 'page' : 'false'}">${flag}</a>`;
  }).join('');

  // Liens "Voir aussi" vers les 2 autres sections dans la même lang
  const relatedLinks = SECTIONS
    .filter(s => s.slug !== section)
    .map(s => `<a href="${s.slug}_${lang}.html">${t.pageTitles[s.slug]}</a>`)
    .join(' · ');

  return `<!DOCTYPE html>
<html lang="${t.htmlLang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SPORTVISE — ${title}</title>
  <meta name="description" content="${desc}" />
  <meta name="robots" content="index, follow" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #07091a; --bg2: #0d1127; --bg3: #111827;
      --border: #1e2d47; --gold: #f59e0b; --gold-soft: #fbbf24;
      --green: #10b981; --red: #ef4444;
      --text: #f1f5f9; --text-soft: #cbd5e1; --muted: #94a3b8; --muted-2: #64748b;
    }
    html, body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; }
    body {
      min-height: 100vh; display: flex; flex-direction: column;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }
    body::before {
      content: ''; position: fixed; top: 0; left: 50%; transform: translateX(-50%);
      width: 600px; height: 500px;
      background: radial-gradient(ellipse, #f59e0b0a 0%, transparent 70%);
      pointer-events: none; z-index: 0;
    }
    /* Header */
    header.legal-header {
      position: relative; z-index: 1;
      max-width: 880px; margin: 0 auto; width: 100%;
      padding: 28px 24px 8px;
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px;
    }
    .logo-wrap { display: flex; flex-direction: column; }
    .logo {
      font-size: 22px; font-weight: 900; letter-spacing: 3px;
      background: linear-gradient(135deg, var(--gold), var(--gold-soft));
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      text-decoration: none;
    }
    .tagline { font-size: 11px; color: var(--muted); margin-top: 2px; letter-spacing: 0.4px; }
    .lang-switch { display: inline-flex; gap: 4px; }
    .lang-flag {
      display: inline-block; padding: 4px 8px; border-radius: 6px;
      font-size: 18px; line-height: 1; text-decoration: none;
      opacity: 0.45; transition: opacity 0.2s, background 0.2s;
    }
    .lang-flag:hover { opacity: 1; background: var(--bg2); }
    .lang-flag.active { opacity: 1; background: var(--bg2); }
    .back-link {
      display: inline-block; margin: 8px 0 0;
      font-size: 13px; color: var(--muted); text-decoration: none;
      transition: color 0.2s;
    }
    .back-link:hover { color: var(--gold); }
    /* Content */
    main.legal-content {
      position: relative; z-index: 1;
      max-width: 760px; margin: 24px auto 64px; width: 100%;
      padding: 32px 24px;
      background: var(--bg2);
      border: 1px solid var(--border);
      border-radius: 16px;
    }
    main.legal-content h1 {
      font-size: 28px; font-weight: 900; line-height: 1.25;
      margin-bottom: 24px; padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
      color: var(--text);
    }
    main.legal-content h2 {
      font-size: 19px; font-weight: 800; margin-top: 36px; margin-bottom: 12px;
      color: var(--gold);
    }
    main.legal-content h3 {
      font-size: 16px; font-weight: 700; margin-top: 24px; margin-bottom: 10px;
      color: var(--text);
    }
    main.legal-content h4 {
      font-size: 14px; font-weight: 700; margin-top: 18px; margin-bottom: 8px;
      color: var(--text-soft);
      text-transform: uppercase; letter-spacing: 0.5px;
    }
    main.legal-content p {
      font-size: 15px; color: var(--text-soft); margin-bottom: 14px;
    }
    main.legal-content strong { color: var(--text); font-weight: 700; }
    main.legal-content em { color: var(--text-soft); font-style: italic; }
    main.legal-content a {
      color: var(--gold); text-decoration: underline; text-decoration-color: rgba(245, 158, 11, 0.4);
      text-underline-offset: 2px; transition: text-decoration-color 0.2s;
    }
    main.legal-content a:hover { text-decoration-color: var(--gold); }
    main.legal-content ul, main.legal-content ol {
      margin: 0 0 16px 0; padding-left: 22px;
    }
    main.legal-content li { font-size: 15px; color: var(--text-soft); margin-bottom: 6px; }
    main.legal-content blockquote {
      border-left: 3px solid var(--gold);
      background: var(--bg3);
      padding: 12px 16px; margin: 16px 0;
      border-radius: 0 8px 8px 0;
      font-size: 14px; color: var(--text-soft);
    }
    main.legal-content code {
      font-family: 'SF Mono', Monaco, Consolas, monospace;
      font-size: 13px; background: var(--bg3); padding: 1px 6px;
      border-radius: 4px; color: var(--gold-soft);
    }
    main.legal-content hr {
      margin: 32px 0; border: 0;
      border-top: 1px solid var(--border);
    }
    /* Tables */
    .table-wrap { overflow-x: auto; margin: 16px 0 22px; border-radius: 10px; border: 1px solid var(--border); }
    main.legal-content table {
      width: 100%; border-collapse: collapse; font-size: 13.5px;
      background: var(--bg3);
    }
    main.legal-content th {
      text-align: left; font-weight: 700; color: var(--text);
      padding: 10px 14px; background: rgba(245, 158, 11, 0.08);
      border-bottom: 1px solid var(--border);
    }
    main.legal-content td {
      padding: 10px 14px; color: var(--text-soft);
      border-bottom: 1px solid rgba(30, 45, 71, 0.6);
      vertical-align: top;
    }
    main.legal-content tr:last-child td { border-bottom: 0; }
    main.legal-content tr:hover td { background: rgba(245, 158, 11, 0.03); }
    /* Footer */
    footer.legal-footer {
      position: relative; z-index: 1;
      max-width: 880px; margin: 0 auto 32px; width: 100%;
      padding: 22px 24px;
      border-top: 1px solid var(--border);
      display: flex; flex-direction: column; gap: 12px; align-items: center;
      font-size: 12px; color: var(--muted);
      text-align: center;
    }
    footer.legal-footer .related { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; }
    footer.legal-footer a { color: var(--muted); text-decoration: none; transition: color 0.2s; }
    footer.legal-footer a:hover { color: var(--gold); }
    footer.legal-footer .related-title { font-weight: 700; color: var(--text-soft); margin-right: 8px; }
    footer.legal-footer .contact { font-size: 11px; }
    footer.legal-footer .copy { font-size: 11px; color: var(--muted-2); }
    /* Responsive */
    @media (max-width: 600px) {
      header.legal-header { padding: 20px 16px 4px; }
      main.legal-content { padding: 22px 18px; margin: 16px 12px 40px; border-radius: 12px; }
      main.legal-content h1 { font-size: 22px; }
      main.legal-content h2 { font-size: 17px; }
      main.legal-content table { font-size: 12.5px; }
      main.legal-content th, main.legal-content td { padding: 8px 10px; }
    }
    /* Print */
    @media print {
      body { background: white; color: black; }
      body::before { display: none; }
      header.legal-header, footer.legal-footer { display: none; }
      main.legal-content {
        background: white; border: none; max-width: 100%; margin: 0; padding: 0;
        color: black;
      }
      main.legal-content h1, main.legal-content h3, main.legal-content h4 { color: black; }
      main.legal-content h2 { color: #b45309; }
      main.legal-content p, main.legal-content li, main.legal-content td { color: #1e293b; }
      main.legal-content a { color: #b45309; text-decoration: underline; }
      .table-wrap, main.legal-content table { background: white; border-color: #cbd5e1; }
      main.legal-content th { background: #fef3c7; }
    }
  </style>
</head>
<body>
  <header class="legal-header">
    <div class="logo-wrap">
      <a href="index.html" class="logo">SPORTVISE</a>
      <div class="tagline">${t.siteTagline}</div>
      <a href="index.html" class="back-link">${t.backHome}</a>
    </div>
    <div class="lang-switch" role="navigation" aria-label="Language">${langSwitchLinks}</div>
  </header>

  <main class="legal-content">
${contentHtml}
  </main>

  <footer class="legal-footer">
    <div class="related"><span class="related-title">${t.relatedTitle} :</span>${relatedLinks}</div>
    <div class="contact">${t.contact}</div>
    <div class="copy">${t.footerCopy}</div>
  </footer>

  <script>
    // Persiste la langue choisie via le switcher (cohérent avec localStorage 'sv_lang' du reste de l'app)
    (function () {
      try {
        document.querySelectorAll('.lang-switch a.lang-flag').forEach(function (a) {
          a.addEventListener('click', function () {
            var match = a.getAttribute('href').match(/_(fr|de|en|it)\\.html$/);
            if (match) localStorage.setItem('sv_lang', match[1]);
          });
        });
      } catch (e) { /* localStorage may be unavailable */ }
    })();
  </script>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────
// Build
// ─────────────────────────────────────────────────────────────────

function build() {
  console.log('🔨 SPORTVISE legal pages — generation starting\n');
  let count = 0;

  for (const section of SECTIONS) {
    for (const lang of LANGS) {
      const mdPath = path.join(REPO_ROOT, `${section.mdPrefix}_${lang}.md`);
      if (!fs.existsSync(mdPath)) {
        console.warn(`  ⚠️  MD missing: ${mdPath}`);
        continue;
      }
      const md = fs.readFileSync(mdPath, 'utf8');
      const contentHtml = mdToHtml(md);
      const fullHtml = renderPage({ section: section.slug, lang, contentHtml });
      const outPath = path.join(SRC_DIR, `${section.slug}_${lang}.html`);
      fs.writeFileSync(outPath, fullHtml);
      count++;
      const sizeKb = Math.round(fullHtml.length / 1024);
      console.log(`  ✅ ${section.slug}_${lang}.html  (${sizeKb}KB)`);
    }
  }

  console.log(`\n📦 ${count} legal pages written to ${SRC_DIR}`);
  console.log('\n🚀 Don\'t forget to: search/replace [DATE_LAUNCH] before pushing prod.');
}

if (require.main === module) build();

module.exports = { build, mdToHtml, renderPage };
