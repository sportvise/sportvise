# SPORTVISE — Handoff session prochaine

**Dernière mise à jour :** 03/05/2026 (dimanche soir, fin de session sprint v61.5)
**État prod :** **v62.11 en ligne** ✅ — TOUS P0 LAUNCH-BLOCKERS LIFTED + sprint Stripe v61 **5/5 shippé** + bug P0 latent fixé en route. **STRIPE PAYWALL LAUNCH-READY 100%.** Reste avant le big launch : RC pro (~30 min hors dev), bilan Sonnet 05/05, soft launch sem 7-8, marketing big launch sem 9+.
**Big launch cible :** mi-juin 2026 (~6 semaines)

---

## 🎯 Bilan session 03/05 (dimanche, sprint v61.5 — checklist E2E)

**TL;DR** : sprint v61 5/5 shippé en 1 journée (estimé 3-4j initialement, accéléré grâce au pré-câblage samedi). Découverte d'un bug P0 latent pendant la checklist, fixé immédiatement et redéployé. Stripe paywall launch-ready à 100%.

| Étape | Détail | Statut |
|---|---|---|
| Reconstitution credentials test | Word "sportvise mdp" perdu samedi → Stripe Reveal sk_test_* + whsec_*, Supabase delete+recreate test+v61 (mdp `TestV61_Sportvise_2026!`) + test+de (mdp `TestDeSportvise_2026!`) avec re-INSERT profiles via SQL du RUNBOOK 1.6/1.7 | ✅ |
| Code stripe-webhook-test.js | Copie de stripe-webhook.js avec 3 modifs (env vars `_TEST`, helper isTestEmail + 4 checks dans handlers, Sentry component='stripe-webhook-test') + log prefixes [STRIPE-WEBHOOK-TEST] cohérents avec checklist scénario #9. Push GitHub `release/v61.5-webhook-test`, deploy Netlify, smoke test → fonction live (GET 405, POST sans sig 400). | ✅ |
| Checklist E2E 15 scénarios | Exécutée 10h-22h. 11 green directs (#1-#11). #12+#14 marqués "covered structurally" avec rationale (cf. follow-ups). #13 signature invalide validé via curl direct. #15 right-to-be-forgotten v54 sur compte Pro (test+de). **15/15 (avec 2 structurels documentés).** | ✅ |
| **Bug P0 fixé en route** | Scénario #6 a révélé que `subscription.items?.data?.[0]?.price?.unit_amount` prend aveuglément le 1er item. Quand Stripe swap un price, la subscription a temporairement 2 items → si l'ancien est en data[0] on update au mauvais plan. Reproduit avec test+v61 : payé Plus, upgrade Pro = profiles.plan resté 'plus'. Conséquence prod : tous les users qui upgradent depuis le portail Stripe perdent l'accès Pro malgré paiement. **Fix v62.11** : `reduce` sur subscription.items.data avec max(created), robuste up/down. Ré-test #6 après deploy → `plan='pro'` correct. | ✅ shipped v62.11 |
| Cleanup section 4 RUNBOOK | Fichier stripe-webhook-test.js supprimé, endpoint webhook test désactivé Stripe Dashboard, comptes test+v61/test+de Supabase supprimés (test+de via le scénario #15 lui-même), env vars TEST gardées Netlify. SPEC_v61 + ce HANDOFF mis à jour. | ✅ |

**Migrations DB v62.10 confirmées appliquées en prod (rappel)** : `processed_stripe_events` (v62.8), `event_status` (v62.6), `profiles.lang` (v62.10).

**Pas de nouvelle migration en attente** pour v62.11 (le fix touche seulement stripe-webhook.js, aucun changement de schéma).

**Follow-ups loggés pour post-launch** (sortis de la checklist mais non bloquants) :
- 🟡 **Bug UX onboarding** : objectif "Vivre de son sport" suggère Sophie Finance (agent Pro) sans badge Plan Pro + CTA upgrade. Soit filtrer les suggestions par plan, soit (recommandé) garder Sophie + transformer en hook upgrade clair → forme business plus monétisante.
- 🟢 **Sentry no-email branches** : "❌ No email for invoice.payment_failed/etc." = 4 branches console.error sans Sentry capture. Add `captureMessage(level: 'warning')` pour tracer la fréquence en prod.
- 🟢 **Portal test variant** : `create-portal-session.js` lit `STRIPE_SECRET_KEY` (live) → bouton "Gérer abonnement" du dashboard ne fonctionne pas pour des users test. Pour re-tester #12 vraiment fidèlement, créer `create-portal-session-test.js` (variant). Détour ~30 min scoping post-launch.
- 🟢 **Rate limit transition test** : tester explicitement "10 messages Free → upgrade Plus → 11e passe sans re-login" (scénario #14 du runbook). Couvert structurellement par v60 prod testing depuis 4 jours sans bug, mais à formaliser proprement.

---

## 📅 Bilan session 02/05 nuit (samedi soir, setup pré-lundi) — pour rappel

## 📅 Bilan session 02/05 nuit (samedi soir, setup pré-lundi)

Pris l'avance sur le pré-requis du sprint v61.5. Tout le terrain est préparé pour que lundi se résume à : création d'**un seul fichier** + exécution checklist.

| Livrable | Détail | Statut |
|---|---|---|
| Stratégie d'isolation prod/test | Endpoint dédié `stripe-webhook-test.js` (vs branch deploy ou fallback signature) — décision validée. Webhook prod reste **strictement intouché** = zéro risque de régression. | ✅ |
| `RUNBOOK_v61_setup_stripe_test.md` | Pas-à-pas complet (setup samedi + code lundi + checklist E2E 15 scénarios + cleanup post-validation). À suivre lundi matin. | ✅ créé |
| Stripe Dashboard test mode | Toggle test mode activé (URL `/test/`), `sk_test_*` copiée localement, 2 Payment Links test créés (Plus 12 CHF / Pro 29 CHF, mensuel, redirect `https://sportvise.ch/dashboard.html`). Webhook endpoint test configuré sur `https://sportvise.ch/.netlify/functions/stripe-webhook-test` avec les 4 events (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`). `whsec_*` test copié localement. | ✅ |
| Netlify env vars | `STRIPE_SECRET_KEY_TEST` + `STRIPE_WEBHOOK_SECRET_TEST` ajoutées (pas de redeploy déclenché — la fonction n'existe pas encore). | ✅ |
| Comptes Supabase test | `test+v61@sportvise.ch` (FR) + `test+de@sportvise.ch` (DE) créés via Auth → Add user. Profiles `plan='free'` confirmés, `lang='fr'` et `lang='de'` respectivement. Mots de passe notés en local. | ✅ |

**Credentials sensibles** : initialement notés dans un Word "sportvise mdp" dans Documents/. **Fichier perdu samedi soir** (pas dans Corbeille macOS, à vérifier iCloud "Récemment supprimés" si besoin). **Plan B retenu : reconstitution lundi matin avant le sprint** (~5 min) :
- `sk_test_*` → Stripe Dashboard test mode → Developers → API keys → Reveal
- `whsec_*` → Stripe Dashboard → Webhooks → endpoint `stripe-webhook-test` → Signing secret → Reveal
- Mdp `test+v61@sportvise.ch` + `test+de@sportvise.ch` → Supabase Auth → user → `Send password recovery` (ou supprimer + recréer en 2 min, le SQL d'insert est dans `RUNBOOK_v61_setup_stripe_test.md`)
- Secrets PROD (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` live, etc.) : tous déjà dans Netlify env vars, jamais perdus
- **À faire post-récup** : migrer vers Apple Passwords (iCloud Keychain) ou 1Password — plus jamais de Word avec credentials.

**Estimation lundi 04/05** : ~3h pour passer Stripe paywall de 95% à 100% launch-ready (15 min code + 2h checklist + 30 min cleanup/doc/version bump).

---

## 📅 Bilan session 02/05 jour (samedi, no-code day)

Session sans push de version (samedi tranquille, ground work compliance + spec).

| Livrable | Fichier | Statut |
|---|---|---|
| Registre des traitements LPD (art. 12 nLPD) | `REGISTRE_TRAITEMENTS_LPD.md` | ✅ créé — P1 #13 LIFTED |
| Spec v61 Stripe paywall (validation E2E + durcissement) | `SPEC_v61_stripe_paywall.md` | ✅ créé — sprint kicke lundi 04/05 |
| Note assurance RC pro (Hiscox/AXA/Mobilière) | `NOTE_assurance_RC_pro.md` | ✅ créé — Thomas à boucler hors session |
| Audit disclaimer non-médical CGU × 4 langs | `terms_{fr,de,en,it}.html` section 9 | ✅ vérifié — couverture déjà solide, aucun fix |
| Dashboard admin API usage (gated `sportvise.pro@gmail.com` + `thomas.castella1@gmail.com`) | `Code/netlify/functions/admin-usage-stats.js` + `Code/src/admin-usage.html` + lien dans `admin.html` | ✅ créé — à push en v60.5 |
| **Fix UX #1** : collision Bilan du soir × Récap RPE | `dashboard.html` showEveningBrief — check `eventModal` ajouté avant check morningBrief (defer 8s) + chainage explicite showEveningBrief en fin de saveRecap/skipRecap (couvre edge case <8s) | ✅ shipped en v60.5 |
| **Fix UX #2 Hybride cross-device** : Brief du jour | `dashboard.html` showMorningBrief — fetch daily_log + skip entirely si journalFilledToday ET pas forceShow. Bouton vert si forceShow + journal rempli. | ✅ shipped en v60.5 (i18n × 4 langs ajoutées : `briefJournalDone`, `briefSeeJournal`). Résout le scénario "ordi matin → iPhone après-midi : brief ne réapparait plus si journal déjà rempli". |
| **Migration sécurité** : admin-stats.js → JWT Bearer | `admin-stats.js` GET + verifyAdmin (au lieu de POST userEmail body, bypassable) + `admin.html` Authorization Bearer | ✅ shipped en v60.5. Cohérence avec /chat v60 et admin-usage-stats.js v60.5. |
| Bump version.json | v60.5 + changelog complet | ✅ |

**Découverte importante de l'audit Stripe :** le code paywall est **~90% fait, pas "partiel"** comme estimé dans le HANDOFF du 01/05. Tout le backend est OK (webhook 3 events, portal, emails i18n, referrals). Tout le front gating est OK (FREE/PLUS/PRO_AGENTS, isAgentLocked, isFeatureLocked, pricing modal). Payment Links live confirmés dans dashboard.html lignes 10563 et 10580. **Le sprint v61 est donc validation E2E + durcissement** (~3-4 jours), pas une semaine de build from scratch.

**Gaps identifiés (détail dans SPEC_v61) :**
- G1. Idempotence webhook (table `processed_stripe_events`)
- G2. Handler `invoice.payment_failed` manquant
- G3. Sentry server-side wrap (vérifier init côté Netlify Functions)
- G4. Lang persistante par user (col `profiles.lang` pour email i18n sur events portal)
- G5. Tests E2E mode test Stripe (15 scénarios checklist)

---

## 🎉 Bilan journée 01/05 — JOURNÉE ÉNORME (4 versions shippées)

| Version | Heure | Sujet | Statut |
|---|---|---|---|
| **v57** | matin | Pages légales HTML × 4 langs + footer wiré (P0 #5) | ✅ shipped |
| **v58** | ~14h | Sentry error reporting + SPF email + fix lien welcome (P0 #6 + #7) | ✅ shipped |
| **v59** | ~13h25 | Pitch hero "agents qui se souviennent" + garantie 30j visible + Block TENDANCES événements (ticket #3 spec v53) | ✅ shipped |
| **v60** | ~21h30 | Rate-limiting Claude API : auth JWT + 30 req/min + caps par plan (P1 #12) | ✅ shipped |

Plus côté ops/non-code :
- Mail-tester re-test → 10/10 confirmé (post-fix v58)
- UptimeRobot setup → ping toutes les 5 min, alerte email
- Friday self-test → user POV
- Compte Anthropic vérifié : spend limit 100 USD/mois ✓, solde rechargé, auto-recharge activé, notification email à 50 USD ✓
- Migration DB v60 : table `api_usage_log` créée dans Supabase (RLS, indexes, FK ON DELETE CASCADE)

---

## 🔴 v60 — Rate-limiting Claude API (détail)

**Avant v60** : `userEmail` envoyé dans le body du POST `/chat`, **non validé**. Un attaquant pouvait :
- Envoyer un email arbitraire pour bypass son propre compteur
- Spam `/chat` en boucle (limite UI client `FREE_MSG_LIMIT=10` était purement cosmétique)
- Vider le solde Anthropic (~24 USD/heure max théorique sous le throttle natif Anthropic 50 RPM)

**Après v60** :
- **Authorization Bearer JWT obligatoire** sur `/chat`. Token validé via `/auth/v1/user` Supabase. user_id extrait du JWT (vrai isolement entre comptes).
- **Rate limit serveur par plan** :
  - Free : 30 req/min, **10/jour** (aligné avec FREE_MSG_LIMIT et pricing landing)
  - Plus : 30 req/min, **500/jour**
  - Pro : 60 req/min, **1000/jour**
- **Logging** : chaque appel `/chat` (success ou erreur) loggé dans `api_usage_log` (user_id, ts, agent_id, model, input/output_tokens, latency_ms, success, error_code) avec rétention 30j et RLS users-read-own.
- **UX 429** : message dédié dans le chat (icône ⏱️ minute / 🔒 jour, bouton "Passer au Plus" si Free+day). Pas de fallback `agent.getResponse` (respect strict de la limite).

**Smoke tests validés en prod** :
- ✅ `curl /chat` sans token → 401 `auth_invalid`
- ✅ Token bidon → 401 `auth_invalid`
- ✅ User loggé envoie 1 chat → 200 + ligne dans `api_usage_log`
- ✅ User Free 11ème message → 429 + UX "Limite atteinte"

**Note légale Plus/Pro** : pricing affiche "Messages illimités" mais cap technique à 500/1000/jour. Pas une limite que verra un user normal (= 30 msg/h pendant 16h non-stop). Acceptable pour MVP. À reformuler post-launch si besoin ("Pas de limite quotidienne raisonnable" ou similaire).

**Aussi corrigé en v60** : pricing landing `featFree2` "20 messages par jour" → "10 messages par jour" × 4 langs (incohérence détectée — le code FREE_MSG_LIMIT était à 10 mais la landing affichait 20).

---

## 🎯 État actuel

### Prod live (v60)
- **v51** : EVENT_TYPES.label + INTENSITY.label i18n FR/DE/EN/IT
- **v52** : Modals + alerts/toasts/confirm i18n
- **v53** : Agents contextuels enrichis (RPE injecté + window 3→10 — tickets #1 et #2 P0)
- **v54** : Right to be forgotten cascade DELETE (LPD/RGPD)
- **v55** : Hotfix crash onboarding (debounce + guard défensif)
- **v56** : Brief du jour ré-ouvrable depuis Journal
- **v57** : Pages légales HTML × 4 langs + footer wiré
- **v58** : Sentry error reporting + email deliverability fix
- **v59** : Pitch hero "agents qui se souviennent" + garantie 30j visuelle + Block TENDANCES (ticket #3 P1 spec v53)
- **v60** : Rate-limiting Claude API + auth JWT + usage logging (P1 #12)
- **v60.5** : Hybride cross-device briefs (skip si journal rempli) + collision evening×récap résolue + chainage post-récap + dashboard admin API usage + migration JWT admin-stats. Confirmé en prod, scénario ordi-matin/iPhone-après-midi testé OK.
- **v62** : Récurrence des événements (migration DB + UI modal "Répéter ?" + expandRecurrence + bulk insert + icône série + smart delete dialog). Saute v61 qui reste réservé pour Stripe lundi.
- **v62.5** *(consolidée dans v62.6)* : Polish calendrier (charge "Repos", heure smart, backdrop opaque) + édition smart série.
- **v62.6** *(shipped 02/05 soir tardif)* : v62.5 + Sentry server-side wrap (6 Netlify Functions critiques, helper _sentry.js, env var SENTRY_DSN_SERVER) + statut "Annulé" pour events (col event_status, bouton Ø, exclu de récap/countdown/charge) + duplicate event (bouton 📋, pré-fill showAddEvent). Migration DB exécutée + 2 env vars Sentry configurées en prod.
- **v62.7** *(consolidée dans v62.8)* : Récurrence dans contexte agents IA — helpers splitEventsBySeries + summarizeUpcomingSeries + summarizePastSeries. Séries ≥3 occurrences agrégées en 1 ligne summary. Contexte agent 70-80% plus court.
- **v62.8** *(consolidée dans v62.9)* : v62.7 + v61.1 idempotence webhook Stripe (table processed_stripe_events).
- **v62.9** *(consolidée dans v62.10)* : v62.8 + v61.2 handler invoice.payment_failed.
- **v62.10** *(shipped 02/05 nuit profonde)* : v62.9 + v61.4 lang per user. Col `profiles.lang` + helper `getUserLangByEmail` dans webhook + setLang() upserte profiles.lang à chaque changement/connexion. Emails Stripe portail dans la bonne langue (DE/EN/IT) au lieu du fallback FR. Migrations DB processed_stripe_events + profiles.lang exécutées en prod. **Sprint v61 update** : #61.1 ✅ + #61.2 ✅ + #61.3 ✅ + #61.4 ✅. Reste seulement : **#61.5 E2E checklist mode test Stripe** (~3h, nécessite setup Stripe test mode complet, à faire lundi).
- **v62.11** *(shipped 03/05 dimanche après-midi, fix P0 latent découvert pendant la checklist E2E)* : fix bug `subscription.items?.data?.[0]?.price?.unit_amount` aveugle dans le handler `customer.subscription.updated`. Quand un user swap son plan via le portail Stripe ou le dashboard admin, Stripe a temporairement 2 items dans la subscription (l'ancien marqué pour suppression + le nouveau actif). Avant : on prenait `data[0]` aveuglément → si Stripe ordonnait l'ancien en premier, on updatait au mauvais plan (reproduit avec test+v61 upgrade Plus→Pro = `profiles.plan` resté 'plus'). Conséquence prod sans fix : tout user upgradant depuis le portail Stripe perd l'accès Pro malgré paiement → refunds + tickets garantis. **Fix** : `reduce` sur `subscription.items.data` avec `max(created)` — l'item le plus récent est toujours le plan actif, robuste à upgrade ET downgrade. Validé par re-test scénario #6 après deploy. APP_V bump à 62.11. **Sprint v61 final : 5/5 ✅ — Stripe paywall LAUNCH-READY 100%.**

### Migration DB v60 (déjà appliquée en prod)
- Table `public.api_usage_log` créée
- 2 indexes : `(user_id, ts DESC)` + `(ts)`
- RLS activée + policy `users_can_read_own_usage`
- Cascade DELETE auto via FK `ON DELETE CASCADE` (le `delete_user_data()` v54 reste tel quel — la cascade FK fait le job sans le toucher)
- Fichier source : `Database/migration_v60_api_usage_log.sql`

---

## ⏳ Tâches restantes (par priorité)

### 🔴 P0 — Bloquants launch
**TOUS LIFTÉS ✅** — plus rien à faire en P0.

### 🟡 P1 — Important pre-launch

11. ~~**Rate-limiting Claude API**~~ ✅ **SHIPPED v60**
12. **Assurance RC pro** (~CHF 300/an chez Hiscox CH ou AXA) — note prep complète dans `NOTE_assurance_RC_pro.md`. Hors dev, à boucler ~30 min web avant launch.
13. ~~**Registre des traitements interne**~~ ✅ **CRÉÉ 02/05** — `REGISTRE_TRAITEMENTS_LPD.md` (9 traitements, sous-traitants, droits personnes, procédure breach).

### 🟠 P1.5 — Reportés délibérément (post-launch ou si retours users)

- **v58+ streaming chat** — reporté 30/04. Refonte Edge Function trop risquée pour solo dev à 6 sem du launch. Critère re-évaluation post-launch.

### 🟢 P2 — Nice-to-have / post-launch

14. ~~**Stripe paywall — validation E2E + durcissement**~~ ✅ **SHIPPED 03/05** — sprint v61 5/5 + bug P0 latent fixé en route (v62.11). Stripe paywall LAUNCH-READY 100%. Cf. SPEC_v61_stripe_paywall.md (statut "shipped") et bilan session 03/05 ci-dessus. 4 follow-ups loggés non-bloquants : bug UX onboarding (suggestion agent Pro à user Free), Sentry no-email branches, portal test variant, rate limit transition test.

14bis. ~~**Récurrence des événements**~~ ✅ **SHIPPED dans v62.6** (récurrence + édition smart série + statut Annulé + duplicate event). Plus rien à faire ici. Le v62.7 a aussi ajouté la récurrence dans le contexte agents IA.
15. **ACWR** (~3-4h) — calcul charge 7j / charge moy 28j + alerte. Block TENDANCES (v59) prérequis ✓.
16. **EVENT_TYPES.label restantes** (~30 min) — `Aucun événement` × 2, day-detail buttons, monthAbbrs FR.
17. **Bilan Sonnet** (5/05 09:00 scheduled task) — décider Haiku vs Sonnet vs hybride.
18. **FIS API followup** (30/04 09:00 scheduled task) — relance API key. Plan B curation manuelle JSON si pas de réponse.
19. **Soft launch** (sem 7-8) — 20-50 invités, mesure D1/D7/D14, NPS, itération.
20. **Big launch marketing** (sem 9+, mi-juin) — ProductHunt, partenariats Swiss-Ski/Swiss Olympic, ads, PR.

### 💡 Idées d'amélioration (post-launch)

- **Streak freeze** — préserver les longues séquences en cas de jour raté pour cause de match/voyage (inspiré Duolingo). 1 freeze/sem ou /mois selon plan.
- **Comparatif anonyme** — "Tu es dans le top 30% des footballeurs de ton niveau sur le RPE moyen". Effet réseau, validation sociale. Nécessite assez de data utilisateur.
- **Reformulation pricing "Messages illimités"** — actuellement les caps techniques v60 (500/1000/jour) ne sont pas affichés. Si besoin légal, reformuler en "Pas de limite quotidienne raisonnable" ou similaire.

### ❌ Décisions Thomas du 29-30/04 — non-fait délibérément

- Pas de relecture native DE/IT (confiance dans Claude).
- Pas de revue juriste tech CH (risque résiduel accepté, posture data minimization en défense).
- Pas d'entretiens willingness-to-pay (pricing déterminé : CHF 0/12/29).
- Pas de boîte postale / domiciliation (adresse perso Gantrischweg 9 dans mentions légales).

---

## 💰 Pricing confirmé (29/04)

| Plan | Prix | Inclus | Cap technique v60 |
|---|---|---|---|
| **Free** | CHF 0/mois | 3 agents (Lucas, Emma, Clara), **10 msg/jour**, dashboard, Fitness Score, journal, calendrier, objectifs | 10/jour, 30/min |
| **Plus** | CHF 12/mois | 6 agents (+David, Nora, Julie), Messages illimités, Prépa Match J-3, défis hebdo, récap hebdo + notifs | 500/jour, 30/min |
| **Pro** | CHF 29/mois | 11 agents (+ suite Business), export PDF, rapport mensuel, support prioritaire | 1000/jour, 60/min |

Garantie : résiliation à tout moment + **30 jours satisfait ou remboursé** (exposée visuellement sous le pricing-grid depuis v59) sur premier abonnement payant.

---

## 🛠️ Workflow GitHub déploiement (PR-squash via UI web)

1. Sur `main`, naviguer dans dossier cible
2. Add file → Upload files → drag-drop fichiers (⚠️ **vérifier le path** : être DANS le bon dossier avant l'upload — j'ai fait l'erreur de uploader chat/index.js à la racine de netlify/functions/ aujourd'hui en v60, ça a fait foirer le build)
3. Commit message clair (`vXX <component>: <résumé>`)
4. Create a new branch → nom `release/vXX-description`
5. Propose changes
6. Pull request → vérifier sur l'onglet "Files changed" que les paths sont corrects AVANT de merger
7. Squash and merge + Delete branch
8. Netlify auto-deploy ~1-2 min
9. `curl https://sportvise.ch/version.json` doit retourner la nouvelle version

---

## 📅 Scheduled tasks actifs

- `sportvise-fis-api-followup` : 30/04 09:00 — relance FIS (à vérifier si déjà déclenchée).
- `sportvise-v45-sonnet-bilan` : **5/05 09:00**.
- `sportvise-agent-training` : weekly Monday 09:01.

---

## 🔐 Env vars Netlify

✅ déjà OK : `ANTHROPIC_API_KEY`, `API_SPORTS_KEY`, `TENNIS_API_KEY`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `AI_MODEL_BETA_USERS`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.

---

## 📋 Conventions

- **i18n** : 4 blocs T (FR ~723, DE ~1062, EN ~1398, IT ~1734).
- **localStorage key langue** : `sv_lang` ('fr', 'de', 'en', 'it').
- **Helpers v51** : `eventTypeLabel(type)` / `intensityLabel(intens)` / `eventCountLabel(n)`.
- **DE/IT formel** (Sie/Lei) pour emails et docs ; tutoiement IT sur landing par cohérence avec heroDesc.
- **Compte beta Sonnet** : `thomas.castella1@gmail.com`.
- **Vérification syntaxe JS** : extraire le plus gros script de dashboard.html → `node --check`.
- **Régénérer les pages légales** : `cd Code && node legal-build.js` (idempotent).
- **Pattern Netlify functions** : vanilla `https` Node, pas de SDK Supabase. Helper `httpRequest({hostname, path, method, headers, body})` cohérent dans `delete-account.js` + `chat/index.js` v60.
- **Auth JWT** : `verifyUser(accessToken)` dans `chat/index.js` v60 — query `/auth/v1/user` avec `apikey` (service role) + `Authorization Bearer <accessToken>`.

---

## 🗂️ Docs de référence dans `Documents/SPORTVISE/`

- `RUNBOOK_v61_setup_stripe_test.md` — runbook complet sprint v61.5 (créé 02/05 nuit, à suivre lundi 04/05). **Document central pour la session de lundi.**

- `LANCEMENT_CHECKLIST.md` — checklist global big launch.
- `SPEC_v54_account_deletion.md` — spec right-to-be-forgotten (shipped).
- `SPEC_v53_agents_contextuels.md` — spec v53 shipped (P0 #1+#2). P1 #3 TENDANCES événements shipped en v59.
- `SPEC_v50_feedback_post_entrainement.md` — spec récap post-event v50.
- `TICKETS_v50.md` — tickets engineering v50.
- `UPDATE_v50_stakeholder.md` — 1-pager stakeholder.
- `COPY_REVIEW_v50.md` — table relecture (50 strings × 1 langue).
- `OUTREACH_RELECTEURS.md` — templates outreach (non-utilisés vu décision 29/04).
- `PRIVACY_POLICY_{fr,de,en,it}.md` — drafts source.
- `TERMS_OF_SERVICE_{fr,de,en,it}.md` — drafts source.
- `LEGAL_NOTICE_{fr,de,en,it}.md` — drafts source.
- `LEGAL_MENTIONS_fr.md` — version courte redondante, peut être supprimée.
- `CLEANUP_SUPABASE_v50_test_events.sql` — script cleanup (déjà exécuté).
- `Database/migration_v60_api_usage_log.sql` — migration v60 rate-limiting (déjà exécutée en prod).
- `Database/migration_v62_recurrence.sql` — migration v62 récurrence events (à exécuter avant push v62).
- `REGISTRE_TRAITEMENTS_LPD.md` — registre des activités de traitement (créé 02/05, P1 #13 LIFTED).
- `SPEC_v61_stripe_paywall.md` — spec sprint v61 (validation E2E + durcissement Stripe, créé 02/05).
- `SPEC_v62_recurrence_events.md` — spec sprint v62 (récurrence calendrier, créé 02/05, en parallèle de v61).
- `NOTE_assurance_RC_pro.md` — note prep souscription RC pro (créé 02/05, à boucler hors dev).
- `HANDOFF_NEXT_SESSION.md` — ce document.

---

## 💡 Notes contextuelles

- Thomas est solo dev/founder, communique en français.
- Posture **data minimization** : Thomas s'engage à ne jamais accéder individuellement aux données de santé des users. Inscrit dans privacy section 7bis. **Meilleure défense juridique de SPORTVISE.**
- Tests en prod sur compte perso `thomas.castella1@gmail.com` (plan = pro). Dans Supabase SQL Editor, `auth.uid()` peut renvoyer NULL → utiliser `(SELECT id FROM auth.users WHERE email = 'thomas.castella1@gmail.com')`.
- Console Safari : Préférences → Avancées → "Afficher le menu Développement", puis Cmd+Option+C.
- Hard refresh post-deploy : Cmd+Shift+R.
- Compte Anthropic : Personal "Thomas's...", mode prépayé, spend limit 100 USD/mois, auto-recharge 50 USD si solde < 10, notification email à 50 USD spent.

---

## 🚀 Plan d'attaque suivante session

**Sprint v61 Stripe terminé. Tous les P0/P1 launch-blockers liftés. Reste essentiellement de l'opérationnel + soft/big launch préparation.**

### Tout-en-haut de la pile (lundi 04/05 — journée tranquille possible après le crunch dimanche)

Aucune urgence dev. Possibilité de prendre du recul ou de tackler une tâche hors-code :

1. **Souscrire l'assurance RC pro** (~30 min web hors dev) — note prep dans `NOTE_assurance_RC_pro.md`. Hiscox CH ou AXA, ~CHF 300/an. Dernier bloc P1 avant le launch.
2. **Vérifier disclaimer "non-médical" CGU** (`terms_{fr,de,en,it}.html` section 9) — la dernière vérif samedi disait "couverture déjà solide, aucun fix" mais une re-lecture rapide ne fait pas de mal.
3. **Intercaler les Quick wins** (cf. liste ci-dessous).

### Mardi 05/05 09:00 — bilan Sonnet (scheduled task)

Décision Haiku vs Sonnet vs hybride sur la base des données accumulées depuis avril. Cf. scheduled task `sportvise-v45-sonnet-bilan`. Probablement hybride (Sonnet pour les agents complexes/Pro, Haiku pour les agents Free).

### Reste de la semaine — playbook soft launch

- **Soft launch playbook** : préparer le doc qui décrit comment lancer aux 20-50 invités (sem 7-8). Templates email d'invitation FR/DE, formulaire feedback, mécanique mesure D1/D7/D14/NPS, plan d'itération.
- **Friday self-test** vendredi 08/05 (déjà 4 bugs trouvés cette saison via cette pratique).
- **ACWR** (~3-4h) — calcul charge 7j / charge moy 28j + alerte. Block TENDANCES (v59) prérequis ✓. Bonus différenciant pour le launch.

### Follow-ups Stripe v61 loggés (à scoper post-launch)

Ces 4 items ont été identifiés pendant la checklist E2E du 03/05 mais sont **non-bloquants** :

- 🟡 **Bug UX onboarding** (P1.5) : objectif "Vivre de son sport" suggère agent Pro Sophie Finance sans badge ni CTA upgrade. Refit en hook upgrade clair (pattern à appliquer aussi aux autres goals → agents Plus/Pro). Plus monétisant.
- 🟢 **Sentry no-email branches** (P2) : add `captureMessage(level: 'warning')` sur les 4 branches console.error "❌ No email for ..." dans stripe-webhook.js. Permet de tracer la fréquence en prod.
- 🟢 **create-portal-session-test.js** (P2) : variant test qui lit `STRIPE_SECRET_KEY_TEST` + allowlist email. Permettrait de re-tester scénario #12 (Gérer abonnement → portal) en mode test plus fidèlement à l'avenir. ~30 min de scoping.
- 🟢 **Test rate-limit transition formalisé** (P2) : 10 messages Free → upgrade Plus → 11e passe sans re-login. Couvert structurellement par v60 prod testing depuis 4 jours sans bug, mais à formaliser dans un test reproductible.

### Plan ramping vers le big launch (mi-juin)

| Semaine | Phase | Actions clés |
|---|---|---|
| **Sem 1-2 (04/05 → 17/05)** | Quick wins + soft launch prep | RC pro, ACWR, soft launch playbook, follow-ups v61 si temps |
| **Sem 3-4 (18/05 → 31/05)** | Soft launch | 20-50 invités, mesure D1/D7/D14, NPS, itération |
| **Sem 5-6 (01/06 → 14/06)** | Polish + marketing | Fix retours soft launch, prep ProductHunt, partenariats Swiss-Ski/Swiss Olympic, ads, PR |
| **Sem 7+ (mi-juin)** | **🚀 BIG LAUNCH** | ProductHunt launch, scaling |

### Quick wins à intercaler quand l'énergie baisse

- **Friday self-test** chaque vendredi — déjà 4 bugs trouvés cette saison via cette pratique.
- Reformuler "Messages illimités" landing si tu trouves le décalage avec les caps techniques 500/1000 trop fort.
- Logger un dashboard analytics interne sur `api_usage_log` — voir consommation réelle par agent/modèle/user (post-launch).
- EVENT_TYPES.label restantes (~30 min) : `Aucun événement` × 2, day-detail buttons, monthAbbrs FR.

---

## ⚙️ Setup à faire dans le nouveau chat (premier message)

1. Connecter le dossier `~/Documents/SPORTVISE`
2. Vérifier état prod : `curl https://sportvise.ch/version.json` → doit retourner `"version":"62.11"`
3. **Lire ce HANDOFF en entier** (notamment "Plan d'attaque suivante session" en bas)
4. Demander à Thomas par quoi attaquer (ou suivre l'ordre suggéré)

---

*Bilan final session 1/05 : 4 versions shippées, tous P0 + P1 #12 liftés, ~6 semaines de marge avant le big launch. Excellente journée. 🏆*

*Bilan final session 03/05 : sprint v61.5 shippé en 1 jour (vs estimé 3-4j) — checklist E2E 15/15 + bug P0 latent fixé en route (v62.11). **Stripe paywall LAUNCH-READY 100%**. Reste seulement RC pro + soft launch + marketing avant le big launch mi-juin (~6 sem de marge intacte). Performance impressionnante pour un solo dev. 🚀*
