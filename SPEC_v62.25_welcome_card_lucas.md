# SPEC v62.25 — Carte de bienvenue post-onboarding (Quick Win #1)

**Statut :** 📝 Spec rédigée 06/05/2026 PM, à valider avant impl
**Sprint estimé :** 4-6h dev en focus (1 séance)
**Issu de :** Brainstorm produit 06/05 PM — `HANDOFF_QUICKWINS_ONBOARDING.md` Quick Win #1
**Dépendances :** Pattern v62.17 carte enrichie ✅, fonction `chat/index.js` (auth JWT, rate limiting) ✅, `userProfile.lang` colonne (migration v62) ✅
**Versions parallèles :** Push v62.24 doit être effectué avant ce sprint (Strava sub-processor + sidebar rename)
**Bundle possible :** v62.25 peut intégrer Quick Win #2 (pre-fill calendrier) si temps disponible — décision en fin de spec

---

## 1. Problème & Objectif

### Le problème en 1 phrase
La promesse SPORTVISE ("11 agents IA qui se souviennent et personnalisent") ne se délivre qu'après 7-14 jours de saisie de journal. Mais 99% des users ProductHunt ne traversent pas ce gouffre — ils churn entre la minute 3 et la minute 5.

### L'hypothèse
**Règle des 3 minutes** — un nouveau user doit recevoir, dans les 3 minutes après le signup, une preuve concrète et personnalisée que SPORTVISE comprend ce dont il a besoin. Pas une promesse, pas une présentation, une *preuve*.

### L'objectif de v62.25
Transformer le "drop dans dashboard vide" post-onboarding en "drop dans dashboard avec une analyse personnalisée fraîchement générée par IA". Démonstration d'intelligence en 30 secondes au lieu de 7 jours.

### Non-objectifs (pour rester scope-contrôlé)
- ❌ Pas de tour guidé multi-étapes (Quick Win #3, reporté)
- ❌ Pas de personnalisation profonde basée sur historique (l'historique n'existe pas encore au signup)
- ❌ Pas de bouton "Refresh / Régénérer" (overkill v1, pas validé user)
- ❌ Pas de chat live avec un agent injecté dans la carte (UX trop dense)
- ❌ Pas de gating premium (la carte est offerte à 100% des nouveaux users — c'est un signal d'intelligence, pas un produit)

---

## 2. Décisions architecturales (verrouillées 06/05 PM)

| Décision | Choix | Raison courte |
|---|---|---|
| **Trigger d'appel** | Async background, déclenché à `finishOnboarding()` | User voit dashboard immédiatement, carte fade-in 2-4s plus tard. Pas de loader anxiogène. |
| **Persistance** | Colonne JSON dans `profiles` (migration v62.25) | Robuste, survit logout/cross-device, query analytics facile. |
| **Format UI** | Insert non-bloquant en haut du dashboard, dismissible | Cohérence avec carte v62.17 (DRY), respect garde-fou "empty state d'abord". |
| **Trigger d'affichage** | Tant que pas dismissed, max 7 jours post-signup | Permet retry si user rate la carte ou regen si 1ère gen a fallback. Handoff clean avec carte post-journal. |
| **Modèle IA** | Sonnet 4.6 primary, Haiku 4.5 fallback | Carte vue 1 fois, qualité prime. Coût 0.012-0.015 USD/signup. |
| **Agent signataire** | Aucun (orchestrateur système, pas Lucas) | Lucas dans `agents-data.js` est carrière/recrutement — pas orchestrale. La carte teaser plusieurs agents sans en être signée. |

---

## 3. Architecture technique

### 3.1 Migration DB

**Fichier :** `Database/migration_v62.25_welcome_card.sql`

```sql
-- v62.25 — Carte de bienvenue générée à la fin de l'onboarding.
-- Stocke le JSON produit par Sonnet (4 langues) + timestamps pour gérer affichage/dismiss.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS welcome_card_json         JSONB,
  ADD COLUMN IF NOT EXISTS welcome_card_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS welcome_card_dismissed_at TIMESTAMPTZ;

-- Pas d'index nécessaire : on ne query que par profiles.id (PK déjà indexée).
```

**Idempotence** :
- Si `welcome_card_json` est déjà rempli ET non-fallback (`_fallback != true`), on n'appelle pas Sonnet à nouveau.
- Si `_fallback: true`, on retente la génération au prochain login (max 1 retry/jour pour éviter le spam d'API si Anthropic est down).

**RGPD/LPD** :
- Le JSON contient uniquement le `headline`, `key_points`, `weekly_action`, `agents_teaser` — pas de données médicales/sensibles.
- Pas de modification du `REGISTRE_TRAITEMENTS_LPD.md` requise (la finalité "personnalisation expérience" est déjà couverte par les sections existantes du registre).

### 3.2 Nouvelle Netlify Function

**Fichier :** `Code/netlify/functions/welcome-analysis/index.js`

Fonction dédiée pour 3 raisons :
1. **Séparation des préoccupations** — pas un agent qui répond à un message ; c'est une analyse one-shot avec un prompt système distinct.
2. **Rate limiting indépendant** — l'appel se fait au signup donc 1× par user. Pas besoin de partager le bucket de rate limit du chat.
3. **Pattern de réponse différent** — JSON structuré strict, pas du markdown libre.

**Comportement endpoint :**

| Méthode | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/.netlify/functions/welcome-analysis` | Bearer JWT Supabase | Génère ou retourne la carte de bienvenue de l'user |

**Body (request) :**
```json
{
  "sport_key": "football",
  "sport_label": "Football",
  "sport_raw": "",
  "level_key": "semipro",
  "level_label": "Semi-pro",
  "goal_key": "win-competitions",
  "goal_label": "Gagner des compétitions",
  "goal_domain": "carriere",
  "lang": "fr",
  "first_name": "Marc"
}
```

**Logique :**

1. Auth via `verifyUser(token)` — pattern réutilisé de `chat/index.js`.
2. Lookup `profiles` pour récupérer `welcome_card_json`. Si non-null et `!_fallback` → retourner directement (cache).
3. Sinon, build le system prompt (cf. `SPEC_v62.25_welcome_card_prompt.md`) et appeler Anthropic API.
4. Modèle : Sonnet 4.6. `max_tokens: 600`, `temperature: 0.6`.
5. Parse la réponse JSON. Si invalide → retry avec Haiku 4.5 (fallback A).
6. Si Haiku échoue aussi → produire la carte fallback hardcodée (fallback B), avec `_fallback: true`.
7. UPSERT dans `profiles.welcome_card_json` + `welcome_card_generated_at`.
8. Retour 200 avec le JSON complet.

**Code helpers réutilisés depuis `chat/index.js` :**
- `httpRequest()` — HTTP helper vanilla node https
- `verifyUser(accessToken)` — validation JWT Supabase
- `supabaseHost()` — extraction hostname
- Pattern de log Sentry via `_sentry.js`

**Code spécifique à `welcome-analysis` :**
- `buildWelcomeSystemPrompt(data)` — interpolation des variables dans le template (cf. SPEC_prompt)
- `parseWelcomeResponse(text)` — parse JSON strict, validate keys, fallback gracieux
- `buildFallbackCard(lang)` — la carte minimale si tout échoue (cf. SPEC_prompt)

**Estimation taille fichier :** ~250 lignes JS (la moitié reprise de `chat/index.js`).

### 3.3 Modifications front-end `dashboard.html`

#### 3.3.1 Hook dans `finishOnboarding()` (ligne ~2720)

Juste avant le `setTimeout` qui fait `overlay.remove() + renderDashboard()`, déclencher l'appel async :

```javascript
// v62.25 — Generate welcome card in background. Don't await — user gets dashboard
// immediately, card appears 2-4s later via fade-in. Errors are silent (fallback handled
// server-side, refresh on next login if anything went wrong).
try {
  const sportKeyVal = sportKey(data.sport) || data.sport;
  const levelKeyVal = levelKey(data.level);
  const goalKeyVal = data.goal;
  generateWelcomeCardAsync({
    sport_key: sportKeyVal,
    sport_label: sportLabel(data.sport),
    sport_raw: sportKeyVal === 'other' ? (data.sport || '') : '',
    level_key: levelKeyVal,
    level_label: levelLabel(data.level),
    goal_key: goalKeyVal,
    goal_label: goalLabel(data.goal),
    goal_domain: goalDomain(data.goal),
    lang: currentLang,
    first_name: (currentUser?.user_metadata?.full_name || '').split(' ')[0]
  });
} catch(e) { console.warn('[WELCOME-CARD] generate trigger error:', e); }
```

#### 3.3.2 Nouvelle fonction `generateWelcomeCardAsync(payload)`

```javascript
// v62.25 — Trigger l'appel /welcome-analysis sans bloquer l'UI.
// On stocke aussi en localStorage pour cohérence si l'user revient au dashboard
// avant que la DB ait fini d'écrire (course condition Safari nav privée).
async function generateWelcomeCardAsync(payload) {
  try {
    const session = await sb.auth.getSession();
    const token = session?.data?.session?.access_token;
    if (!token) return;
    const res = await fetch('/.netlify/functions/welcome-analysis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      console.warn('[WELCOME-CARD] API error:', res.status);
      return;
    }
    const card = await res.json();
    // Cache local pour éviter race condition au prochain renderDashboard
    try { localStorage.setItem(`sv_welcome_card_${currentUser.id}`, JSON.stringify(card)); } catch(_) {}
    // Si on est déjà sur le dashboard, inject la carte tout de suite (fade-in)
    if (document.getElementById('mainContent') && !document.getElementById('welcomeCard')) {
      injectWelcomeCard(card);
    }
  } catch(e) {
    console.warn('[WELCOME-CARD] generate error:', e);
  }
}
```

#### 3.3.3 Hook dans `renderDashboard()` (ligne ~4269)

Au début de `renderDashboard()`, après le `const t = T[currentLang]`, on lit la carte si elle existe et qu'elle est en fenêtre 7j. **CRITIQUE :** ce hook gère aussi le retry rétroactif si la 1ère génération a échoué (cf. défaut détecté en relecture — le hook `finishOnboarding` ne se déclenche qu'une fois, donc si le 1er appel API a foiré, on a besoin que `renderDashboard` rattrape).

```javascript
// v62.25 — Welcome card display + retroactive retry logic
// 1. Si carte existe en DB (et pas dismissed, et user < 7j) → affichée.
// 2. Si user < 7j ET carte absente/fallback → trigger generateWelcomeCardAsync (rattrape les
//    générations échouées au signup, ex: réseau down au moment de finishOnboarding).
//    Le call est idempotent côté backend (cache si déjà OK).
const _welcomeCard = await loadWelcomeCardForDisplay();
// loadWelcomeCardForDisplay() :
//   1. lit profiles.welcome_card_json + dismissed_at + currentUser.created_at
//   2. fallback localStorage si DB lente
//   3. retourne {card, shouldRegenerate, isWithinWindow} où :
//      - card = JSON ou null
//      - shouldRegenerate = true si (created_at < 7j) ET (card === null OU card._fallback === true)
//      - isWithinWindow = (created_at < 7j) ET (dismissed_at === null)

if (_welcomeCard.shouldRegenerate && userProfile?.sport && userProfile?.level) {
  // Fire-and-forget : on rebuild le payload depuis userProfile + 1er goal de la liste
  const firstGoal = (await sb.from('goals').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: true }).limit(1)).data?.[0];
  generateWelcomeCardAsync({
    sport_key: sportKey(userProfile.sport),
    sport_label: sportLabel(userProfile.sport),
    sport_raw: '', // not retrievable retroactively, accept this
    level_key: levelKey(userProfile.level),
    level_label: levelLabel(userProfile.level),
    goal_key: firstGoal ? goalKey(firstGoal.title) : '',
    goal_label: firstGoal?.title || '',
    goal_domain: firstGoal?.domain || '',
    lang: currentLang,
    first_name: (currentUser?.user_metadata?.full_name || '').split(' ')[0]
  });
}
```

Puis à la fin du `innerHTML = ...` du dashboard, juste après le rendu, on inject (carte fallback affichée aussi — vaut mieux quelque chose de générique que rien) :

```javascript
if (_welcomeCard.card && _welcomeCard.isWithinWindow) {
  injectWelcomeCard(_welcomeCard.card);
}
```

#### 3.3.4 Helper `escapeHtml` (à ajouter — n'existe pas dans dashboard.html actuellement)

**Sécurité critique** : sans escape, un retour Sonnet contenant `<script>` ou un `sport_raw` malicieux pourrait XSS-er. Défense en profondeur même si Sonnet n'est pas censé retourner ça.

```javascript
// v62.25 — Helper sécurité XSS pour les contenus IA-generated et user-input.
// À ajouter en section helpers globaux du dashboard.html (proche des autres _helpers).
function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

Note : à utiliser aussi rétroactivement sur la carte v62.17 si on découvre qu'elle ne le fait pas (audit security à prévoir P2).

#### 3.3.5 Fonction `renderWelcomeCardHTML(card, t)`

Reprend exactement le pattern de `renderEnrichedBriefCardHTML` (carte v62.17) :

```javascript
function renderWelcomeCardHTML(card, t) {
  if (!card || !card.headline) return '';
  const teasersHTML = (card.agents_teaser || []).map(a => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#f59e0b08;border-radius:10px;margin-bottom:6px">
      <div style="font-size:11px;font-weight:700;color:var(--text)">${a.name}</div>
      <div style="font-size:11px;color:var(--muted);flex:1">${a.tease}</div>
    </div>
  `).join('');
  const wa = card.weekly_action || {};
  return `
    <div id="welcomeCard" style="background:linear-gradient(135deg,#f59e0b15,#d9770615);border:1px solid #f59e0b50;border-radius:14px;padding:18px;margin-bottom:16px;position:relative;opacity:0;transform:translateY(-8px);transition:opacity 0.4s ease, transform 0.4s ease">
      <button onclick="dismissWelcomeCard()" aria-label="${t.welcomeCardDismiss || 'Fermer'}" style="position:absolute;top:10px;right:10px;background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer;padding:4px 8px;line-height:1">×</button>
      <div style="font-size:11px;font-weight:800;color:#f59e0b;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:8px">
        ✨ ${t.welcomeCardTitle || 'Ton analyse de bienvenue'}
      </div>
      <div style="font-size:14px;color:var(--text);line-height:1.5;margin-bottom:14px;font-weight:600">${escapeHtml(card.headline)}</div>
      <div style="margin-bottom:14px">
        ${(card.key_points || []).map(p => `<div style="display:flex;gap:8px;font-size:12px;color:var(--text);line-height:1.5;margin-bottom:4px"><span style="color:#f59e0b">•</span><span>${escapeHtml(p)}</span></div>`).join('')}
      </div>
      ${wa.text ? `
      <button onclick="welcomeActionGo('${wa.agent_id || 'dashboard'}')" style="display:block;width:100%;padding:12px 14px;border-radius:10px;border:1px solid #f59e0b40;background:#f59e0b15;color:var(--text);font-size:12px;font-weight:600;cursor:pointer;text-align:left;font-family:'Inter',sans-serif;margin-bottom:14px">
        <span style="color:#f59e0b;font-weight:700">${t.welcomeCardAction || 'Cette semaine'} →</span> ${escapeHtml(wa.text)}
      </button>
      ` : ''}
      ${teasersHTML ? `
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">${t.welcomeCardComingUp || 'À venir'}</div>
      ${teasersHTML}
      ` : ''}
    </div>
  `;
}
```

L'animation fade-in est appliquée via :
```javascript
function injectWelcomeCard(card) {
  const t = T[currentLang] || T.fr;
  const wrapper = document.querySelector('#mainContent > div') || document.getElementById('mainContent');
  if (!wrapper) return;
  wrapper.insertAdjacentHTML('afterbegin', renderWelcomeCardHTML(card, t));
  // Trigger fade-in next tick
  requestAnimationFrame(() => {
    const el = document.getElementById('welcomeCard');
    if (el) { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; }
  });
}
```

#### 3.3.6 Actions `dismissWelcomeCard()` et `welcomeActionGo()`

```javascript
async function dismissWelcomeCard() {
  const el = document.getElementById('welcomeCard');
  if (el) { el.style.opacity = '0'; el.style.transform = 'translateY(-8px)'; setTimeout(() => el.remove(), 400); }
  try { localStorage.setItem(`sv_welcome_card_dismissed_${currentUser.id}`, '1'); } catch(_) {}
  try {
    await sb.from('profiles').update({ welcome_card_dismissed_at: new Date().toISOString() }).eq('id', currentUser.id);
  } catch(e) { console.warn('[WELCOME-CARD] dismiss DB error:', e); }
}

function welcomeActionGo(agentId) {
  // Special targets
  if (agentId === 'journal') return showPage('journal', null);
  if (agentId === 'calendar' || agentId === 'agenda') return showPage('agenda', null);
  if (agentId === 'dashboard' || !agentId) return; // no-op
  // Otherwise route to the agent page (must match AGENTS keys)
  if (AGENTS[agentId]) return showPage(agentId, null);
  // Fallback: dashboard
}
```

### 3.4 i18n

**Strings à ajouter dans les 4 blocs T (`T.fr`, `T.de`, `T.en`, `T.it`) :**

| Clé | FR | DE | EN | IT |
|---|---|---|---|---|
| `welcomeCardTitle` | Ton analyse de bienvenue | Deine Begrüssungsanalyse | Your welcome analysis | La tua analisi di benvenuto |
| `welcomeCardDismiss` | Fermer | Schliessen | Close | Chiudi |
| `welcomeCardAction` | Cette semaine | Diese Woche | This week | Questa settimana |
| `welcomeCardComingUp` | À venir | Kommt bald | Coming up | Prossimamente |

Le contenu de la carte (headline, key_points, etc.) est généré directement par Sonnet dans la langue de l'user — pas besoin d'i18n côté front pour ces champs.

---

## 4. Empty states & error handling

| Scénario | Comportement |
|---|---|
| Sonnet timeout >5s | Retry Haiku 4.5 |
| Haiku timeout >5s | Carte fallback hardcodée + `_fallback: true` en DB |
| `welcome_card_json._fallback === true` au prochain login | Retry génération (max 1×/jour) |
| User signe up, ne fait jamais l'onboarding | Pas de carte (logique reste : trigger uniquement à `finishOnboarding`) |
| User dismiss puis change d'avis | Pas de "annuler dismiss" en v1 (la carte post-journal v62.17 prend le relais) |
| User a `sport=other` avec freeform "Tir à l'arc" | Le prompt envoie `sport_raw="Tir à l'arc"`, Sonnet interprète prudemment |
| User a `goal_key` vide (skipOnboarding ?) | Le hook ne devrait pas se déclencher (skipOnboarding ne passe pas par finishOnboarding). Si data.goal vide en finishOnboarding, le prompt gère gracieusement. |
| Error 401/403 (token expiré) | Silent fail, retry au prochain login via `loadWelcomeCardForDisplay` qui voit DB vide |
| Anthropic 5xx persistant | Carte fallback affichée, l'user voit quelque chose plutôt que rien |

---

## 5. Plan d'implémentation (séquencé)

### Phase 1 — Backend (~1.5h)
1. Créer `Database/migration_v62.25_welcome_card.sql` + run sur Supabase
2. Créer `Code/netlify/functions/welcome-analysis/index.js` avec :
   - Auth JWT (copier pattern chat/index.js)
   - Build prompt système (interpolation template)
   - Appel Sonnet + parsing JSON + retry Haiku
   - UPSERT profiles
3. Test local via `netlify dev` ou direct curl avec un token de test

### Phase 2 — Front-end intégration (~1.5h)
4. Ajouter `escapeHtml` (helper sécurité XSS, manquant) dans la zone des helpers globaux
5. Ajouter `loadWelcomeCardForDisplay`, `generateWelcomeCardAsync`, `injectWelcomeCard`, `renderWelcomeCardHTML`, `dismissWelcomeCard`, `welcomeActionGo` dans `dashboard.html`
6. Hook dans `finishOnboarding()` (ligne ~2720)
7. Hook dans `renderDashboard()` (ligne ~4269) — inclut la logique de retry rétroactif
8. Ajouter les 4 strings i18n × 4 langues

### Phase 3 — Polish & edge cases (~1h)
9. Tester fade-in en local (devtools throttling 3G pour simuler latence)
10. Tester scénarios : sport=other, goal absent, Sonnet timeout simulé, regen rétroactive
11. Vérifier accessibilité bouton dismiss (aria-label, focus visible)
12. APP_V bump → 62.25, version.json updaté avec changelog complet

### Phase 4 — Smoke test prod (~30 min, post-deploy)
13. `node --check` sur le main script (cohérent avec convention)
14. Self-test bout-en-bout en nav privée :
    - Signup nouveau user de test
    - Onboarding (sport/level/goal)
    - Vérifier que la carte apparaît dans 2-4s
    - Vérifier que le bouton action route vers le bon agent
    - Refresh la page → carte toujours là (DB persistance)
    - Click X → carte disparaît
    - Login différent device → carte non re-affichée (dismiss persistant)
    - Test **regen rétroactif** : forcer une carte fallback via DB SQL, refresh dashboard, vérifier qu'une nouvelle génération Sonnet se déclenche en background
15. Vérifier coût Anthropic console (~0.015 USD pour 1 appel Sonnet)
16. Vérifier pas de regression sur la carte v62.17 (post-journal)

### Phase 5 — Friday self-test étendu (vendredi 08/05 ou suivant)
17. Si v62.25 shippée avant les 3 amis → ils en bénéficient au signup
18. Question follow-up lundi 11/05 : *"As-tu vu une carte d'analyse de bienvenue après ton onboarding ? Qu'as-tu pensé du contenu ?"*

---

## 6. Métriques de succès

À tracker (manuellement Supabase pour les 3 amis, automatique post-launch via `api_usage_log`) :

| Métrique | Cible v0 | Cible launch ProductHunt |
|---|---|---|
| Taux de génération réussie (Sonnet ou Haiku, pas fallback) | ≥ 90% | ≥ 95% |
| Latence P95 génération | ≤ 4 s | ≤ 4 s |
| Taux de dismiss dans les 5 min | < 30% (signal positif si l'user lit) | < 25% |
| Click sur le bouton `weekly_action` | ≥ 40% des users qui voient la carte | ≥ 40% |
| Retours qualitatifs amis 11/05 | "j'ai trouvé ça pertinent" pour ≥ 2/3 | n/a |

Si dismiss > 50% ou retours négatifs sur la pertinence, c'est un signal fort que le prompt doit être retravaillé avant le launch.

---

## 7. Décision Bundle vs Solo Push

**Option A — Push v62.25 solo (welcome card seule)**
- Avantage : changement isolé, plus facile à mesurer (signal pur)
- Inconvénient : on conserve l'option de Quick Win #2 pour v62.26 → 2 push proches alors que la règle est "max 1/sem"

**Option B — Bundle v62.25 = Quick Win #1 + Quick Win #2 (pre-fill calendrier)**
- Avantage : 1 seul push, plus efficient temps-à-launch
- Inconvénient : 2 features ensemble compliquent le diagnostic si quelque chose dégrade les métriques

**Recommandation :** **Option A solo en première itération.** La welcome card est la feature la plus "gravitas-loaded" du sprint — elle mérite une mesure propre. Quick Win #2 (pre-fill calendrier) peut entrer dans v62.26 la semaine suivante après les retours des 3 amis (lundi 11/05 → impl Quick Win #2 mardi 12/05 → push v62.26 vendredi 15/05). Ça respecte le garde-fou "code mérite de respirer" du handoff.

---

## 8. Risques identifiés & mitigations

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Sonnet hallucine un fait sur le sport | Moyenne | Moyen | Garde-fous prompt (règle anti-hallu #1-3) + monitoring qualitatif sur 3 amis |
| Async fade-in décalé sur Safari mobile | Faible | Faible | Tester sur iOS Safari pendant phase 3 (Friday self-test inclura mobile) |
| User clique "Parler à David" depuis onboarding ET la carte appelle aussi un agent → double-spawn d'overlay | Faible | Moyen | La carte n'est PAS un overlay, c'est un insert dashboard. Pas de conflit. |
| Anthropic API down au moment du signup d'un user critique (journaliste, beta tester) | Faible | Élevé | Fallback hardcodé + retry au prochain login + log Sentry pour suivi manuel |
| Coût Anthropic explose si bot signups | Moyenne | Faible | Rate limit per-user déjà en place (`profiles` 1× welcome card max) ; fallback côté CAPTCHA Supabase si besoin |
| User signe up sans compléter onboarding (skip) | Élevée | Faible | Pas de carte générée, comportement actuel inchangé. Pas un risque, juste un cas. |

---

## 9. Conformité aux garde-fous handoff

| Garde-fou | Respect |
|---|---|
| Règle des 3 minutes | ✅ Carte fade-in ~3s post-onboarding, contenu personnalisé |
| Max 1 push/sem sauf bug | ✅ Push v62.25 solo, prochain v62.26 après 1 sem minimum |
| Friday self-test maintenu | ✅ Inclus dans plan d'impl phase 4 |
| Empty state d'abord | ✅ Fallback hardcodé designed avant happy path |
| Data minimization | ✅ Aucune donnée sensible dans la carte. Pas de modif registre LPD requise. |
| Posture qualité (24h respiration) | ✅ Tester en self-test avant invitations 3 amis |

---

## 10. Décisions ouvertes (pour début de session impl)

1. **Lecture profile dans `welcome-analysis`** : la fonction doit-elle re-lire le `profiles` row (sécurité, source de vérité) ou se contenter du payload front ? → Recommandation : re-lire pour `lang` et `created_at`, pas pour sport/level/goal qui sont passés explicitement. Pattern : front passe le payload (faster), backend valide cohérence avec DB.
2. **Persistance localStorage en plus de DB** : utile ou redondance ? → Recommandation : oui, gérer race condition Safari nav privée (la DB peut prendre 200-500ms post-finishOnboarding, le `renderDashboard` peut s'exécuter avant). LocalStorage = read sync.
3. **Bouton agent dans la carte** : si `weekly_action.agent_id="physique"` mais l'agent David est locké (plan free) → comportement ? → Recommandation : router vers l'agent quand même (la page locked s'affichera avec le paywall, c'est OK). Cohérent avec UX existante.
4. **Tracking analytics** : est-ce qu'on logge `welcome_card_displayed`, `welcome_card_dismissed`, `welcome_card_action_clicked` dans `api_usage_log` ou ailleurs ? → Recommandation : pas en v1. Ajouter une table `welcome_card_events` plus tard si on veut data-driven.

---

*Spec v62.25 rédigée 06/05/2026 PM. Prête à exécution sur 4-6h dev focus en 1 séance. Validation Thomas requise sur les 4 décisions ouvertes ci-dessus avant de commencer.*
