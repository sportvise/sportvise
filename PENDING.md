# PENDING — Fichiers en attente de push
> Mettre à jour après chaque session de dev. Lancer `node tests/smoke.test.mjs` avant de pousher.

---

## En attente

| Fichier | Changement | Depuis |
|---|---|---|
| `tests/smoke.test.mjs` | Section 11 : lit `src/data/clubs.json` directement (plus `_SV_CLUBS` placeholder dans dashboard.html) | 2026-06-09 |
| `src/data/clubs.json` | NOUVEAU : source de vérité unique pour les clubs | 2026-06-09 |
| `build.js` | Injection de clubs.json dans dashboard.html au build | 2026-06-09 |
| `src/dashboard.html` | Phase 1 #5 : bannière J+2 calendrier vide (sessionStorage, dismissible, pre-fill chatInput) | 2026-06-09 |
| `src/dashboard.html` | Phase 1 #6 : Chart.js progression charts (CDN dynamique, line chart par métrique ≥2 logs) | 2026-06-09 |
| `src/version.json` | Bump v63.42.0 | 2026-06-09 |

---

## Dernier push

**v63.41.0** — 2026-06-09
- `src/index.html` — Preview mockup landing
- `src/dashboard.html` — `_SV_CLUBS` saison 2026-27
- `src/version.json` — v63.41.0
- `netlify/functions/chat/index.js` — Message bienvenue onboarding
- `netlify/functions/chat/agents-data.js` — GARDE_FOUS tutoiement
- `netlify/functions/sports-data.js` — Tier 3/3b hyphen-stripping
- `tests/smoke.test.mjs` — Sections 11-14

---

## Règle

Avant chaque push :
1. `cd Code && node tests/smoke.test.mjs` → doit être 0 ✗
2. Bumper `src/version.json` (patch = bug fix, minor = feature)
3. Vider ce fichier et remplir "Dernier push"
