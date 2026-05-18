# Diff résumé — Mise à jour agents SPORTVISE — 2026-05-05

**Statut :** ✅ APPLIQUÉ le 2026-05-05 (commit manuel via workflow `Edit` séquentiel — `git revert` non utilisé).

## Récapitulatif

| # | Agent (clé JS) | Titre de la mise à jour | Lignes ajoutées (env.) |
|---|---|---|---|
| 1 | `physique` (David) | VBT & individualisation du VLT | ~5 |
| 2 | `mental` (Emma) | ACT consolidé chez les jeunes & ACPT pour disciplines de précision | ~5 |
| 3 | `nutrition` (Clara) | IOC REDs CAT2 + chrono-nutrition + microbiome | ~7 |
| 4 | `sommeil` (Nora) | Extension de sommeil 45-120 min & jeunes athlètes | ~5 |
| 5 | `recuperation` (Julie) | CWI selon finalité & BFR autorégulé | ~6 |
| 6 | `finance` (Sophie) | Rachat 3a rétroactif & nouveaux plafonds | ~6 |
| 7 | `comptabilite` (Pierre) | TOU & seuil TVA pour créateurs de contenu sportifs | ~4 |
| 8 | `marketing` (Alex) | Algorithmes IG/TT 2026 & bascule Oracle | ~7 |
| 9 | `sponsors` (Marc) | Hyperréalité, athlète-podcasteur & Brack Super League | ~7 |
| 10 | `contrats` (Léa) | Liste WADA 2026 & TAS / Host City Contracts | ~9 |
| 11 | `equipe` (Lucas) | Fribourg-Gottéron champion & Brack Super League | ~7 |

## Métriques d'impact

- Agents touchés : **11 / 11**
- Bytes ajoutés : **+11 040** (756 535 → 767 575, soit +1.46 % du fichier total)
- Lignes existantes modifiées ou supprimées : **0** (append-only)
- Validation syntaxe JS de `agentSystemPrompts` : **OK** (`new Function(...)` parse sans erreur)
- Garde-fou taille +20 % de `agentSystemPrompts` : non déclenché (~5 % du bloc)

## Comment appliquer

(Ce patch est déjà appliqué. Conservé comme référence et patron pour les semaines suivantes.)

> Format standard pour les semaines suivantes : ouvre une nouvelle session Cowork et dis *« applique le patch SPORTVISE du [DATE] »*. Claude lira `SPORTVISE_Patch_[DATE].json`, te montrera ce diff résumé, et appliquera après ton OK avec un commit git `chore(agents): MAJ hebdo [DATE] — N agents`.
