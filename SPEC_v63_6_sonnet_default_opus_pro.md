# SPEC v63.6 — Upgrade qualité agents : Sonnet pour tous les plans

**Statut :** Code modifié en local, pas encore pushé (bundle avec d'autres modifs)
**Date décision :** 2026-05-17 (révisé le même jour — voir §1.1)
**Issu de :** Test amis du 13/05 (« wrapper dégrade Claude »), pivot stratégique vers la qualité des 11 agents experts comme moat principal.
**Renverse :** SPEC_v63_sonnet_pro_paywall.md (05/05) qui concluait l'inverse.

---

## 1. Décision

| Plan | Avant (v45–v63.5) | Après (v63.6) |
|---|---|---|
| Free | Haiku 4.5 | **Sonnet 4.6** |
| Plus | Haiku 4.5 | **Sonnet 4.6** |
| Pro | Haiku 4.5 | **Sonnet 4.6** |
| `AI_MODEL_BETA_USERS` (override interne) | Sonnet | **Opus** (pour comparer la qualité) |

### 1.1 Pourquoi pas Opus pour Pro (révision intra-journée)

Première version de cette spec : Free+Plus → Sonnet, Pro → Opus. Révisé le même jour à *tout le monde sur Sonnet* parce que :

- Le segment cible Pro **n'est pas encore validé** (mémoires `test_amis_13_05_pivot_strategique` et `conversation_0_thomas_self_interview_16_05`). Tant que les 4 conversations terrain restantes n'ont pas confirmé qui paie 14.50 CHF/mois et pourquoi, on n'augmente pas le coût IA Pro à l'aveugle.
- Opus = 5× Sonnet = 15× Haiku. Sur un Pro actif, un mauvais calibrage peut faire monter le coût rapidement sans gain de conversion prouvé.
- La config Opus reste dormante dans `MODEL_CONFIG` — réactivable pour le plan Pro en 1 ligne dans `pickModel` si les conversations découverte valident le différenciateur paywall.
- Le beta override (`AI_MODEL_BETA_USERS`) continue de pointer Opus → permet à Thomas de tester la qualité premium depuis son compte avant de la promettre aux Pro.

### 1.2 Pourquoi le revirement vs la spec du 05/05 ?

La spec du 05/05 concluait *"le gain qualité est trop subtil pour justifier ×4 le coût"*. Cette conclusion a été invalidée par le test amis du 13/05 : les amis testeurs ont jugé que **le wrapper dégradait Claude** par rapport à utiliser claude.ai directement. Or le moat SPORTVISE = qualité conseil des 11 agents experts contextualisés (mémoire `vision_agents_experts.md`). Si la qualité IA sous le wrapper est inférieure à ce qu'ils obtiennent gratuitement sur claude.ai, **il n'y a pas de produit**.

Décision : on accepte le surcoût Sonnet (~3.9× Haiku) pour ramener la qualité au niveau minimum acceptable.

---

## 2. Implémentation (faite)

### 2.1 `Code/netlify/functions/chat/index.js`

- Ajout d'une entrée `opus` dans `MODEL_CONFIG` (dormante mais prête) :
  - `id: process.env.AI_MODEL_PREMIUM || 'claude-opus-4-6'`
  - `maxTokens: 800`, `temperature: 0.4`
  - `systemPrefix` identique à Sonnet + une ligne sur la spécificité haut de gamme
- `pickModel(userEmail, plan)` :
  1. Si email dans `AI_MODEL_BETA_USERS` → `'opus'` (override interne QA)
  2. Sinon → `'sonnet'` (tous les plans : Free, Plus, Pro)
- Le paramètre `plan` est conservé dans la signature pour réactivation rapide d'Opus pour le plan Pro (1 ligne à ajouter).
- Call site mis à jour pour passer `plan` (déjà calculé via `getUserPlan(user.id)` en amont).
- Entrée `haiku` conservée dans `MODEL_CONFIG` pour fallback éventuel mais n'est plus jamais sélectionnée automatiquement.

### 2.2 `Code/netlify/functions/meeting/index.js`

- Même logique. `maxTokens` Opus = 500 (comme Sonnet) car meeting = 3 calls parallèles donc coût ×3 par session, on garde la concision.

### 2.3 Autres endpoints — pas touchés

- `welcome-analysis/index.js` → déjà sur Sonnet primary / Haiku fallback ✅
- `weekly-insight/index.js` → déjà sur Sonnet primary / Haiku fallback ✅

---

## 3. Impact coût estimé

Référence pricing (USD per MTok, mai 2026) :
- Haiku 4.5 : $1.00 in / $5.00 out
- Sonnet 4.6 : $3.00 in / $15.00 out (≈3× Haiku)
- Opus 4.6 : $15.00 in / $75.00 out (≈5× Sonnet, ≈15× Haiku)

Bilan v45 (05/05) chiffrait Sonnet à ~$0.050 par appel chat moyen (vs ~$0.013 Haiku).

**Projection v63.6 (mensuel, hypothèses larges) :**
- Tous les chats users actuels passent à Sonnet → si volume reste à ~100 chats/mois ce mois-ci, surcoût ~$4/mois.
- Opus utilisé uniquement par le compte beta de Thomas pour tests → négligeable.

**Verdict coût :** acceptable au volume actuel (pre-launch décalé). À monitorer via `admin-usage-stats` après quelques jours d'usage réel.

---

## 4. Latence

Bilan v45 (05/05) : Sonnet ≈ +1.5–2s vs Haiku. Acceptable.

---

## 5. To do avant push

- [ ] Bundle avec autres modifs en cours (économie quota Netlify, mémoire `credit_netlify_economie.md`)
- [ ] Test manuel post-deploy : ouvrir un chat sur compte test Free → vérifier dans les logs Netlify que `model=sonnet id=claude-sonnet-4-6`
- [ ] Test optionnel : activer `AI_MODEL_BETA_USERS=thomas.castella1@gmail.com` dans Netlify env, ouvrir un chat → vérifier `model=opus id=claude-opus-4-6` pour comparer subjectivement la qualité.

---

## 6. Rollback

Si problème (latence inacceptable, coût qui explose, erreurs API) :
- Override env vars Netlify : `AI_MODEL_BETA = claude-haiku-4-5-20251001` (force Sonnet → Haiku).
- Pas besoin de redeploy code.

Rollback brutal : revert le commit, 1 deploy.

---

## 7. Réactivation Opus pour Pro (si conversations découverte valident)

Quand les 4 conversations terrain restantes auront validé que les Pro paient pour une qualité supérieure :

```js
// Dans pickModel, ajouter avant le return 'sonnet' :
if (plan === 'pro') return 'opus';
```

C'est tout. La config Opus est déjà en place dans `MODEL_CONFIG`. Bumper la version (v63.7 ?), tester, push.
