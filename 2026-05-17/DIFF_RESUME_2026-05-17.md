# DIFF résumé — Patch SPORTVISE 2026-05-17

**Patch :** `/Users/thomas/Documents/SPORTVISE/Code/agent-updates/2026-05-17/SPORTVISE_Patch_2026-05-17.json`
**Cible :** `/Users/thomas/Documents/SPORTVISE/Code/src/dashboard.html`
**Couverture :** 11/11 agents.

## ⚠️ Garde-fou taille — DÉPASSEMENT

| Mesure | Valeur |
|---|---|
| Total des `append` | 12 210 octets |
| Bloc `agentSystemPrompts` actuel | 51 483 octets |
| Ratio | **23,7 %** |
| Seuil de sécurité | 20 % (10 296 octets) |
| Statut | **DÉPASSEMENT — refuse l'auto-application, validation Thomas requise.** |

## Tableau des modifications

| # | Agent (clé JS) | Agent (nom) | Résumé du diff |
|---|---|---|---|
| 1 | `physique` | David | Méta-analyse VBT vs PBT 2026 : avantage léger saut/COD seulement + APRE en tête des méthodes autorégulées (SUCRA 93) |
| 2 | `mental` | Emma | Burnout d'élite : interventions ONLINE > présentielles (méta-analyse 2025) + coachs détectent mieux dépression que burnout |
| 3 | `nutrition` | Clara | Cadre 4Ps (Personalise/Periodise/Prefuel/Prepare) + protéines endurance révisées 1,6-2,1 g/kg/j |
| 4 | `sommeil` | Nora | Dose minimale efficace ~55 min/nuit pour gains SWS/REM + lien GH/testo dépendant du SWS |
| 5 | `recuperation` | Julie | CWI 10-15 min / 5-10 °C confirmée en network meta-analysis + méta-analyse soccer 2026 + gap recherche athlètes féminines |
| 6 | `finance` | Sophie | **CORRECTION** — rachat 3a rétroactif possible UNIQUEMENT pour lacunes 2025+ (2024 et avant non rattrapables) |
| 7 | `comptabilite` | Pierre | Exemption TVA Swiss Olympic + Aide Sportive (hors calcul seuil 100k) + précision sportifs étrangers |
| 8 | `marketing` | Alex | TikTok seuil viralité 70 % completion + Instagram keywords > hashtags + watermark pénalisé 30-50 % |
| 9 | `sponsors` | Marc | Marché Europe 29,77 Mrd USD 2026 + clauses ESG standard (+15 % perception) + Infront CH levier ski/hockey |
| 10 | `contrats` | Léa | FIFA Legal Handbook 2025 + protection joueuses + due-diligence licence agent (3 checks systématiques) |
| 11 | `equipe` | Lucas | **FC THUN CHAMPION 2025/26** (1er titre en 128 ans, équivalent Leicester 2016) — repositionne le club comme destination CH crédible |

## Validation technique

| Check | Statut |
|---|---|
| JSON valide (`node JSON.parse`) | ✅ OK |
| Chaque anchor trouvé exactement 1× dans dashboard.html | ✅ 11/11 OK |
| Aucun backtick brut (`) dans les `append` | ✅ OK |
| Aucun `${...}` (interpolation template literal) | ✅ OK |
| Volume sous seuil 20 % du bloc | ❌ DÉPASSEMENT 23,7 % |

## Comment appliquer

> Ouvre une nouvelle session Cowork et dis : *« applique le patch SPORTVISE du 2026-05-17 »*. Claude lira `SPORTVISE_Patch_2026-05-17.json`, affichera le diff agent par agent, et appliquera après ton OK avec un commit git :
> ```
> chore(agents): MAJ hebdo 2026-05-17 — 11 agents
> ```
> **Rollback :** `git revert HEAD` dans `/Users/thomas/Documents/SPORTVISE/Code/`.

**Options recommandées vu le dépassement 20 % :**

- **A — Appliquer tel quel (recommandée).** Le dépassement de 3,7 points reste marginal et les 11 mises à jour sont indépendamment justifiées.
- **B — Trimmer 2-3 agents.** Lucas (FC Thun), Marc (sponsors) et Sophie (rachat 3a) sont les plus longs.
- **C — Appliquer partiellement.** Garder 8/11 agents cette semaine, reporter les 3 plus longs à la semaine prochaine.

## Points d'attention pour Thomas

1. **Sophie / Pierre (rachat 3a)** — Cette semaine corrige une formulation antérieure potentiellement trompeuse. C'est la mise à jour la plus *protectrice* du patch : à appliquer en priorité même si tu choisis d'en trimmer d'autres.
2. **Lucas (FC Thun)** — Mise à jour temporelle forte (titre acquis aujourd'hui même, 17/05/2026). Pertinente immédiatement pour les conversations agents Lucas en début de semaine.
3. **Alex (TikTok 70 %)** — Seuil important pour quiconque crée du contenu sportif. À pousser dans la roadmap Alex.

---

*Généré par le scheduled task `sportvise-agent-training` le 2026-05-17.*
