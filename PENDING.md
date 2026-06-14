# PENDING — Fichiers en attente de push
> Mettre à jour après chaque session de dev. Lancer `node tests/smoke.test.mjs` avant de pousher.

---

## En attente

**Chantier images + PDF dans le chat (14/06 soir, PAS POUSSÉ) — `src/dashboard.html` + `netlify/functions/chat/index.js` + 4 i18n :**
- Cause confirmée du bug "Une erreur de connexion" (repro 20:52) : image envoyée en base64 brut depuis un fichier jusqu'à 20MB → dépasse la limite payload synchrone Netlify (~6MB), crash avant le log `[CHAT]`.
- Fix images : nouvelle fonction `_svResizeImageFile()` — redimensionne via canvas (max 1568px, recommandation Claude vision) et compresse en JPEG avec réduction de qualité itérative jusqu'à ~2.5MB de base64. `handleFileSelect` appelle cette fonction pour tout fichier `image/*` avant stockage dans `attachedFile`.
- Nouveau : support PDF — `_svLoadPdfJs()` charge pdf.js depuis cdnjs en lazy (même pattern que `_svInitPerfCharts`/Chart.js), `_svExtractPdfText()` extrait le texte (30 pages max, 12000 caractères max). `handleFileSelect` extrait le texte à la sélection et affiche un état "Lecture du PDF…" puis "{pages} pages lues" ou erreur dans `updateFilePreview`. Support aussi `text/plain` (lecture directe).
- `sendMsg` : nouvelles variables `attachedDocText`/`attachedDocName`, ajoutées au `requestBody` comme `documentText`/`documentName` quand un PDF/TXT a été lu avec succès.
- Backend `chat/index.js` : destructuration de `documentText`/`documentName` (ligne ~303) + injection d'un bloc `[DOCUMENT JOINT PAR L'ATHLÈTE — "..."]` dans `systemWithLang` (après le bloc `[STYLE DE COMMUNICATION]`) contenant le texte extrait, avec instruction de signaler si le texte semble tronqué/illisible.
- Le support image (vision) côté backend existait déjà (content block `image` + `imageType`) — inchangé, seul le payload côté front est maintenant sous la limite.
- i18n 4L : `filePdfExtracting`, `filePdfReady` (placeholder `{pages}`), `filePdfError` (FR/EN/DE/IT).
- DOC/DOCX : toujours pas lus par l'agent (juste mentionnés en pièce jointe, comme avant) — pas dans le scope ce soir.
- Smoke test : 86/86 ✅. `node --check` sur `chat/index.js`, les 4 i18n, et les 11 blocs `<script>` de `dashboard.html` : OK.
- ⚠️ PAS TESTÉ EN VRAI (pas de test manuel envoi image/PDF à un agent ce soir, juste vérif syntaxe + smoke test). À tester avant de pousser : (1) envoyer une photo depuis le téléphone à un agent, vérifier que la réponse décrit l'image et qu'il n'y a plus d'erreur de connexion ; (2) envoyer un PDF (planning d'entraînement par ex.), vérifier que l'agent répond en s'appuyant sur le contenu.
- ⚠️ NE PAS POUSSER avant ce test manuel (consigne explicite Thomas 14/06 soir).

**Récap post-entraînement — durée réelle + charge de séance (13/06) — `src/dashboard.html` + 4 i18n :**
- Modal récap réorganisé : RPE en 1ère question, puis "Durée réelle (min)" (NOUVEAU, pré-remplie depuis la durée planifiée, corrigible), puis état physique — tout le reste (perf/10, humeur, points forts/faibles, notes) passe dans un bloc "Plus de détails (optionnel)" replié par défaut (déplié auto si des détails existent déjà en édition).
- `saveRecap()` met à jour `duration_minutes` avec la valeur corrigée + sauvegarde enfin `recap_notes` (champ qui existait en DB/i18n mais n'était jamais rendu/saved auparavant).
- Nouvelle fonction `sessionLoad(e)` = RPE × durée réelle (méthode Foster, "session-RPE", en AU) — calculée à la volée, pas de nouvelle colonne DB.
- `buildEventTrendsBlock()` : nouvelle ligne "Charge de séance (RPE×durée)" sur 7j (total + moyenne), en plus du RPE moyen — donne à Marc/David/Emma un vrai signal de charge au lieu du RPE brut seul.
- i18n FR/DE/EN/IT : `recapDurationLabel`, `recapDurationHint`, `recapDetailsToggle`.
- Smoke test : 86/86 ✅. `node --check` sur les 7 blocs `<script>` : OK.
- ⚠️ Pas encore testé en prod (UI à vérifier : toggle détails, pré-remplissage durée, calcul charge dans le brief).

**Landing page — nouveau hero (13/06) :**
- `src/index.html` — headline remplacé : "Des agents IA qui se souviennent de chaque entraînement" (jugé cliché IA) → "Toujours savoir où tu vas — avec Sportvise" (4 langues FR/DE/EN/IT, heroTitle1/2/3 + heroDesc) ; meta og:description et twitter:description alignées. Sous-texte recentré tutoiement + sport suisse (canton non mis en avant, réservé aux questions admin).
- Smoke test : OK.
- ⚠️ Vérifié en prod 13/06 : le serveur sert bien la nouvelle version (curl OK), mais le navigateur de Thomas affichait encore l'ancien texte même après vidage cache + désinscription Service Worker. À reconfirmer après un peu de propagation CDN / nouveau device.

**Bug fix carte "Ton journal du jour" qui clignote (13/06) — `src/dashboard.html` :**
- Cause : `injectCheckinCard()` est appelée ~350ms après le rendu initial du dashboard (le temps de vérifier en DB si le journal du jour est rempli), et était insérée avec `opacity:0` + transition 0.4s avant de fade-in. Résultat visuel : la carte apparaît brutalement ~350-750ms après le chargement, en décalant le contenu — donne une impression d'app qui bug/clignote.
- Fix : suppression de l'animation fade-in/translateY (la carte s'affiche directement, sans transition).
- Smoke test : OK.

**Bug fix essai→free (13/06) — `src/dashboard.html` :**
- Audit transition essai 14j → Plan Free : badge (✅ correct, devient "🆓 Plan Free" dynamiquement), agents/features verrouillés (✅ correct via `isAgentLocked`/`isFeatureLocked`, `!svTrialActive`).
- 🐛 Bug trouvé et corrigé : la limite de 30 messages/30j (`FREE_MSG_LIMIT`) et son compteur s'appliquaient aussi PENDANT l'essai (`userPlan==='free'` vrai dès l'inscription), alors que l'essai doit être "accès complet" (backend autorise 20 msg/jour en essai). Ajout de `&& !svTrialActive` aux deux checks (ligne envoi message + incrément compteur). Maintenant : essai = pas de cap frontend (backend cap 20/jour) ; post-essai = cap 30/30j appliqué correctement.
- Smoke test : OK.

**Consolidation agents 09/06 — appliquée 13/06, à pousser via GitHub web :**
- `src/dashboard.html` — `agentSystemPrompts` : 16 fusions/suppressions (consolidation `/Code/agent-updates/2026-06-09-consolidation/`). Blocs MISE À JOUR de David, Clara, Nora, Julie, Sophie, Alex, Léa, Lucas fusionnés dans le core ou supprimés (redondants) ; Emma, Pierre, Marc gardent leur bloc MAJ. Bloc total agents : 64 625 → 60 699 octets (sous le seuil bloquant 60 KB, encore au-dessus de la cible 55 KB — sponsors/Marc 6588 et equipe/Lucas 6840 restent les plus gros).
- Pas de smoke test impacté (prompts internes uniquement, pas de string user-visible).

**v63.45.1 — à pousser via GitHub web (correctifs test mobile iPhone 11/06, CSS + 2 inputs) :**
- `src/login.html` — switcher de langue en flux statique centré sous 920px (chevauchait le logo SPORTVISE).
- `src/dashboard.html` — media query 768px : `.content::before { left:0 }` (seam vertical de fond, le gradient gardait le décalage sidebar 240px) ; `#versionBadge { display:none }` (badge version gênant sur mobile, debug desktop only) ; topbar mobile : titre ellipsé 1 ligne + contrôles droite flex-shrink:0 (un titre long poussait les drapeaux hors écran) + badge "Agent actif" masqué (redondant avec "En ligne" du bandeau chat). Journal : inputs durée sommeil h/min uniformisés (16px, appearance:none — iOS rendait le select minutes plus gras que l'input heures + chevrons système).
- `src/dashboard.html` (suite, fixes profil iPhone 11/06 soir) — champ Club : le `<datalist>` (invisible sur iOS Safari) remplacé par un dropdown custom (liste complète au focus, filtrage à la saisie, tap = remplit le champ) ; bloc "💬 Conversations avec tes agents" retiré de la page profil (compteur jugé inutile, données toujours en DB).
- `src/data/clubs.json` — clubs hockey SL + basket SBL corrigés (vérifiés web 11/06) : Swiss League → GDT Bellinzona Snakes remplace "SC Rapperswil-Jona Lakers II" (club inexistant, erreur v63.40.9) ; SBL → Spinelli Massagno, Lugano Tigers, BBC Nyon, Pully Lausanne Foxes, BBC Monthey-Chablais entrent ; Jubilee Basket Berne + Swiss Central Basket sortent (pas en SBL).
- `netlify/functions/chat/agents-data.js` — mêmes corrections dans SPORTS_SUISSE (Swiss League 2026-27, SBL 2026-27, + Bellinzona dans clubs par canton TI).
- `tests/smoke.test.mjs` — assertions clubs mises à jour (+ contrôles négatifs Lakers II / Jubilee / Swiss Central).
- `src/version.json` — v63.45.1.
- Smoke test : 86/86 ✅.

**QA post-push v63.45.1 (sur iPhone) :**
1. Page login → drapeaux centrés AU-DESSUS du logo, plus de chevauchement
2. Dashboard → fond uniforme, plus de bande verticale plus claire à droite
3. Dashboard → plus de badge v63.x en bas à droite (vérifier qu'il reste visible sur desktop)
4. Chat agent (titre long) → topbar sur 1 ligne, titre coupé par "…", drapeaux entiers
5. Journal → "7 h 00 min" : même graisse et même taille pour les deux champs, plus de chevrons
6. Profil → Modifier → tap dans "Club actuel" → liste des clubs s'ouvre (sport football), filtrage en tapant, tap sélectionne
7. Page profil → plus de bloc "Conversations avec tes agents"

**v63.45.0 — ✅ POUSSÉ et vérifié LIVE le 11/06** (QA complète déroulée en prod avec le compte +test80 : svParseTs OK, badge Essai · J-14 OK, greetings tutoiement OK, présélection sport OK, pas de modal brief sur compte vide OK, 0 erreur console).

**QA post-push v63.44.0 à dérouler (5 min) :**
1. Dashboard → cards agents du swiper SANS chip "🔴 Action requise / 2 clubs SFL…" → ✅ vérifié au test 11/06
2. Calendrier → ajouter un événement avec une année hors borne → alert d'erreur, pas d'insert
3. Supprimer un événement → vérifier qu'il a bien disparu après F5
4. Progression → graphe "Derniers 30 jours" affiche les points des jours remplis
5. Réunion d'équipe → le gras s'affiche sans astérisques `**`

**Reste à faire avant le lancement du 14/06 :**
- ~~Parcours complet : signup → onboarding → 1er message agent~~ ✅ testé 11/06 (compte +test80, Chrome) — parcours fluide, fix P0 statusNotes confirmé, 0 erreur console. Restent : paiement Stripe + test mobile réel
- Remettre le context chip de Thomas sur son profil réel (football / FC Lausanne gardien) — encore sur le profil banc "nageur Genève Natation"

**Bugs trouvés au test signup/onboarding 11/06 (compte +test80) — tous corrigés en v63.45.0 (en attente de push) :**
1. ~~P1 Timestamps~~ ✅ svParseTs() (le "07:14" était en fait correct — ordi de Thomas en Grèce UTC+3 ; seul le temps relatif était cassé)
2. ~~P1 Plan incohérent~~ ✅ badge "🎁 Essai · J-X" pendant svTrialActive
3. ~~P2 Vouvoiement greetings~~ ✅ 11 greetings au tutoiement (NB : greetings encore FR-only → dette i18n ci-dessous)
4. ~~P2 Sport demandé 2×~~ ✅ présélection étape 1/3
5. ~~P2 Modal brief matinal~~ ✅ conditionnée à ≥1 donnée réelle

**Reste à faire après lancement :**
- Rejouer M3 (Marc) et D1 (David) en session rapide pour valider la régression v63.43.0
- Corriger le protocole du banc avant le 16/06 (comptes test dédiés A/B/C)
- Vue "Journal des séances" (historique RPE) — nouvelle section dans Progression, liste des events `recap_done=true` (date, type, RPE, durée, charge `sessionLoad()`, perf/10), requête existante ligne ~5508 réutilisable. Pas de migration DB. Estimation : 1-2h version liste simple, +demi-journée pour graphe charge/ACWR. i18n 4L ~10-15 clés.

**Dette notée (post-launch, pas bloquant) :**
- **Chat mobile — espace dévoré par les bandeaux** (test iPhone 11/06, décision Thomas : reporté). Avant le 1er message : topbar + bandeau agent (2 lignes + Exporter PDF) + chip contexte (3 lignes) + disclaimer IA (2 lignes) ≈ 45% de l'écran. Piste retenue à creuser : mode compact mobile (bandeau agent replié par défaut — le toggle ^ existe, chip contexte 1 ligne tap-to-expand, disclaimer 1 ligne, Exporter PDF masqué) ou refonte "tout dans un bandeau repliable". Le bouton ^ actuel n'est pas intuitif.
- Greetings des 11 agents (const AGENTS, dashboard.html) FR-only → fuite i18n en UI DE/EN/IT (préexistant, le tutoiement v63.45 n'a pas changé ça)
- Réponses canned getResponse() des AGENTS encore en vouvoiement (fallback hors-ligne, normalement jamais affiché depuis v63.10.1)
- Bloc "Corrélations détectées" de Progression entièrement FR-hardcodé (labels Sommeil/Énergie/…, "Forte/Modérée/Faible", phrases insight) → fuite i18n en UI DE/EN/IT
- "Aucune donnée disponible" hardcodé dans Tendance humeur
- Openers formulaïques "En complément de ce que X te dira…" en réunion d'équipe
- confirm() natif pour la suppression d'événement (remplacer par modal stylé)
- **Bug "Une erreur de connexion" sur envoi d'image lourde au chat** (repro 14/06 20:52, agent David/Physique) — logs Netlify function `chat` : requête `fbcce7ab` dure 1002.97ms mais SANS la ligne `[CHAT] model=... agent=...` (présente sur la requête précédente d8a6dc0d). Donc crash avant l'init/log, probablement payload trop lourd (image base64) rejeté tôt (limite payload fonction Netlify ~6MB en synchrone, ou parsing JSON qui throw avant le try/catch logué). Piste : (1) limiter taille image côté front avant envoi + message clair si trop lourd, (2) wrapper try/catch plus large côté `netlify/functions/chat` pour logger même les erreurs précoces. Pas P0 (upload PDF/image pas un flow officiellement supporté par les agents), mais message d'erreur générique = mauvaise UX si ça arrive à un vrai user le jour du lancement.

---

## Dernier push

**v63.46.4** — 2026-06-14 — LIVE vérifié en prod (confirmé via curl sportvise.ch/version.json)
- HOTFIX P0 LAUNCH DAY — `src/dashboard.html` : faux écran de crash "Oups, quelque chose a bugué" au retour au premier plan sur iPhone Safari, causé par une extension navigateur tierce (cashback/coupons) dont la rejection non gérée bubble dans notre `unhandledrejection` global. Nouvelle fonction `_svIsExternalError()` filtre ces erreurs externes (extensions, "Script error.", erreurs sans source/stack/ligne) dans window.onerror + unhandledrejection — loggées en console, écran de crash non affiché. Voir mémoire hotfix_faux_crash_extension_v63_46_4.
- v63.46.3 — `src/index.html` : bouton "Commencer →" navbar mobile passait sur 2 lignes → `white-space:nowrap`.
- v63.46.2 — `src/dashboard.html` + 4 i18n : placeholders événement anonymisés/neutres (eventTitlePlaceholder, eventLocationPlaceholder) ; champ minutes sommeil converti en `<input type=number>` (uniformisé avec heures).
- v63.46.1 — `src/dashboard.html` + 4 i18n : bouton "📝 Récap complet (durée, détails…)" (recapFillFullBtn) sous le mini-formulaire RPE pour séances passées.
- Smoke test : 86/86 ✅.

**v63.44.0** — 2026-06-10 (inclut v63.43.0) — LIVE vérifié en prod
- `src/dashboard.html` — v63.43.0 : règles ANTI-FABRICATION (Marc) + NON-BLOCAGE (David) dans agentSystemPrompts. v63.44.0 : chip status/statusNote fictif du swiper agents retiré du rendu (anti-fiction P0) ; garde-fou date [-1 an, +2 ans] dans saveEvent() + updateEvent() avec alert i18n ; min/max sur les 2 inputs #evDate ; filet anti-date-aberrante dans renderPrepaMatch() (fix "J-21914550") ; deleteEvent() vérifie error + count:'exact' (fix suppression silencieuse) ; graphe Progression 30j calculé depuis daily_log via computeFitnessScore (la table fitness_score n'est alimentée nulle part) ; élision FR corrélations ; bouton empty state Prépa stylé gold.
- `src/js/team-meeting.js` — gras markdown `**…**` parsé en `<strong>` après escapeHtml (réponses agents + synthèse).
- `src/js/i18n-fr.js / i18n-de.js / i18n-en.js / i18n-it.js` — clés eventDateInvalid + eventDeleteFailed (4 langues).
- `src/version.json` — v63.44.0 + fusion de la clé "changes" dupliquée.
- Smoke test : 81/81 ✅ · `node --check` bundle OK · build vérifié.

---

## Règle

Avant chaque push :
1. `cd Code && node tests/smoke.test.mjs` → doit être 0 ✗
2. Bumper `src/version.json` (patch = bug fix, minor = feature)
3. Vider ce fichier et remplir "Dernier push"
