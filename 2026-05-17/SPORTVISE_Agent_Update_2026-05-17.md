# Mise à jour hebdomadaire SPORTVISE — Agents IA

**Date :** dimanche 17 mai 2026
**Périmètre :** 11/11 agents couverts
**Statut patch :** PRODUIT, NON APPLIQUÉ. Volumineux — validation explicite Thomas requise avant application (voir §Garde-fou).

---

## Synthèse exécutive

Cette semaine concentre **deux actualités fortes pour l'écosystème SPORTVISE :**

1. **FC THUN champion de Brack Super League 2025/26** — premier titre en 128 ans d'histoire, à 3 journées de la fin. Trophée remis le 14 mai 2026. Conséquences directes pour les agents Lucas (manager sportif) et Marc (sponsoring local Berne/Oberland).
2. **CORRECTION fiscalité 3a** — la formulation antérieure « rachat rétroactif sur 10 ans » est trompeuse : seules les lacunes apparues à partir de 2025 sont rattrapables. En 2026, seule l'année fiscale 2025 est éligible. Le « rétroactif 10 ans » sera théoriquement effectif en 2035. Cette précision protège Sophie et Pierre d'un conseil potentiellement faux.

**Autres points saillants :**

- *Physique (David)* — Nouvelle méta-analyse VBT vs PBT 2026 (17 études, 348 sujets) : avantage seulement sur saut et changements de direction, pas sur force max ni sprint. Méthode APRE classée n°1 en autorégulation (SUCRA 93,0 %).
- *Mental (Emma)* — Méta-analyse 2025 : interventions ONLINE significativement plus efficaces que présentielles pour réduire le burnout d'élite.
- *Nutrition (Clara)* — Cadre 4Ps (Performance Nutrition / Springer 2026) ; cibles protéiques endurance révisées à la hausse 1,6-2,1 g/kg/jour.
- *Sommeil (Nora)* — Dose minimale efficace ~55 min d'extension par nuit pour gains SWS/REM.
- *Récupération (Julie)* — Protocole CWI 10-15 min à 5-10 °C confirmé en network meta-analysis ; gap recherche sur athlètes féminines à signaler.
- *Marketing (Alex)* — TikTok seuil viralité 70 % completion (vs 50 % en 2024) ; Instagram bascule keywords > hashtags ; watermark pénalisé 30-50 %.
- *Sponsors (Marc)* — Marché Europe 29,77 Mrd USD 2026 ; clauses ESG standard ; Infront CH levier dominant ski/hockey.
- *Contrats (Léa)* — FIFA Legal Handbook 2025 renforce protection joueuses ; 3 checks systématiques sur licence agent.
- *Comptabilité (Pierre)* — Exemption TVA confirmée sur montants Swiss Olympic / Aide Sportive (hors calcul seuil 100k).
- *Équipe (Lucas)* — FC Thun champion (voir ci-dessus).

---

## ⚠️ Garde-fou taille — Patch volumineux

**Total append : 12 210 octets soit 23,7 % du bloc `agentSystemPrompts` actuel (51 483 octets).**
**Seuil 20 % = 10 296 octets — DÉPASSEMENT de 1 914 octets (≈ 3,7 points).**

→ **Refuse l'auto-application** et demande validation explicite à Thomas. Le patch JSON est sauvegardé pour référence et peut être appliqué après revue. Trois options pour repasser sous le seuil :

- **Option A — appliquer tel quel** (volume justifié, contenu dense et utile).
- **Option B — trimmer 2-3 agents** (Lucas, Sponsors et Finance sont les plus longs).
- **Option C — appliquer partiellement** (par exemple 8/11 agents cette semaine, garder les 3 plus longs pour la semaine prochaine).

Décision recommandée : **Option A**. Les 11 mises à jour sont indépendamment justifiées et le dépassement reste marginal (3,7 pts).

---

## Détail par agent

### 1. David — préparation physique

**Sujet :** Méta-analyse VBT vs PBT 2026 & méthodes autorégulées.

**Recommandation de prompt (résumé) :**
- Nuancer l'avantage de la VBT : effet faible mais significatif sur saut et changements de direction, équivalent à la PBT sur force maximale et sprint (méta-analyse 17 études).
- Introduire la méthode APRE (Autoregulating Progressive Resistance Exercise) en tête des classements 2025 (SUCRA 93,0 %) — alternative crédible à la VBT en phase hypertrophie.
- Recommandation pratique : APRE/RPE en hypertrophie, VBT en puissance/explosivité.

**Sources :**
- [BMC Sports Sci Med Rehabil — VBT vs PBT meta-analysis 2026](https://link.springer.com/article/10.1186/s13102-025-01504-9)
- [ScienceDirect — Autoregulated resistance training network meta-analysis](https://www.sciencedirect.com/science/article/pii/S1728869X25000590)
- [PMC9914552 — VLT dose-response meta-analysis](https://pmc.ncbi.nlm.nih.gov/articles/PMC9914552/)

---

### 2. Emma — psychologie du sport

**Sujet :** Burnout d'élite & supériorité des interventions online.

**Recommandation de prompt (résumé) :**
- Mettre en avant l'efficacité supérieure des interventions ONLINE (TCC, mindfulness) sur le burnout par rapport au présentiel (méta-analyse Sports Medicine 2025).
- Sensibilisation : les coachs identifient mieux la dépression que le burnout (étude 02/2026) — sensibiliser staff et entourage.
- Prévalence à mémoriser : 1-5 % des athlètes d'élite présentent des symptômes sévères.
- Cible d'intervention validée : psychological capital (PsyCap) malléable.

**Sources :**
- [PMC12011916 — Psychological Interventions Elite Athlete Mental Wellbeing](https://pmc.ncbi.nlm.nih.gov/articles/PMC12011916/)
- [J. Applied Sport Psychology — Mental health literacy in elite coaches (02/2026)](https://www.tandfonline.com/doi/full/10.1080/10413200.2025.2589723)
- [PMC11756217 — PsyCap and athlete burnout](https://pmc.ncbi.nlm.nih.gov/articles/PMC11756217/)

---

### 3. Clara — nutrition sportive

**Sujet :** Cadre 4Ps & cibles protéiques endurance.

**Recommandation de prompt (résumé) :**
- Introduire le cadre 4Ps publié dans Performance Nutrition (Springer 2026) : Personalise, Periodise, Prefuel (6-10 g/kg/j glucides), Prepare.
- Réviser à la hausse la cible protéique pour les athlètes d'endurance : 1,6-2,1 g/kg/jour (vs ISSN 1,4-2,0 pour la force/hypertrophie), pouvant dépasser 2,0 g/kg/j en phases low-CHO / low-EA.

**Sources :**
- [Springer Performance Nutrition — 4Ps framework](https://link.springer.com/article/10.1186/s44410-026-00022-0)
- [PMC12152099 — Protein Nutrition for Endurance Athletes](https://pmc.ncbi.nlm.nih.gov/articles/PMC12152099/)

---

### 4. Nora — sommeil & chronobiologie

**Sujet :** Dose minimale efficace ~55 min & architecture SWS/REM.

**Recommandation de prompt (résumé) :**
- Préciser la dose plancher efficace à environ 55 min d'extension par nuit (vs la fourchette 45-120 min antérieure).
- Lien direct GH/testostérone ↔ sommeil lent profond : <7h → taux mesurablement plus bas → impact sur adaptation & récupération de blessure.
- Bénéfice maximal sur efforts complexes/soutenus + fonctions cognitives.

**Sources :**
- [MDPI Life 15/8/1178 — Single-Night Sleep Extension RCT](https://www.mdpi.com/2075-1729/15/8/1178)
- [MDPI JCM 14/21/7606 — Sleep and Athletic Performance multidimensional review](https://www.mdpi.com/2077-0383/14/21/7606)
- [Sports-Today — Sleep Science 2026](https://sports-today.top/article/sleep-science-athlete-recovery-2026-evidence-optimising-rest)

---

### 5. Julie — récupération

**Sujet :** CWI confirmée 10-15 min / 5-10 °C en network meta-analysis 2026 + gap athlètes féminines.

**Recommandation de prompt (résumé) :**
- Confirmer le protocole optimal CWI 10-15 min à 5-10 °C pour CMJ et CK (network meta-analysis Frontiers Physiology).
- Méta-analyse soccer 2026 : CWI accélère récupération force, CMJ, CK et réduit DOMS post-match.
- Signaler le GAP de recherche sur athlètes féminines (aucune étude exclusivement féminine).

**Sources :**
- [PMC11897523 — CWI dose meta-analysis Frontiers Physiology](https://pmc.ncbi.nlm.nih.gov/articles/PMC11897523/)
- [PMC12767754 — CWI post-match soccer meta-analysis 2026 Scand J Med Sci Sports](https://pmc.ncbi.nlm.nih.gov/articles/PMC12767754/)
- [Frontiers Sports Active Living 2026 — body region meta-analysis](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2026.1738075/full)

---

### 6. Sophie — finance (carrière sportive)

**Sujet :** ⚠️ CORRECTION CRITIQUE rachat 3a rétroactif — lacunes 2025+ uniquement.

**Recommandation de prompt (résumé) :**
- Corriger la formulation antérieure « 10 dernières années rétroactivement » : seules les lacunes apparues à partir de 2025 sont rattrapables. Les années antérieures (2024 et avant) sont définitivement perdues.
- En 2026, seul le rachat pour l'année fiscale 2025 est possible — plafonné à la petite cotisation (CHF 7 258).
- Le « rétroactif 10 ans » deviendra effectif en 2035 (rachat 2025-2034).
- 4 conditions cumulatives : revenu AVS l'année concernée, activité lucrative au moment du rachat, cotisation max année courante déjà versée, aucun retrait anticipé depuis 01.01.2025.

**Sources :**
- [RTS info — Nouveauté 2026 rattrapage 3e pilier (01/2026)](https://www.rts.ch/info/suisse/2025/article/nouveaute-2026-rattrapage-des-cotisations-manquees-au-3e-pilier-possible-29100501.html)
- [UBS Suisse — Versements 3a rétroactifs](https://www.ubs.com/ch/fr/services/guide/pension/articles/retroactive-contributions.html)
- [Zurich Suisse — Versements rétroactifs pilier 3a 2026](https://www.zurich.ch/fr/services/savoir/prevoyance-et-placement/erachats-ulterieurs-pilier-3a)
- [CA next bank — Rachat 2026 pilier 3a](https://www.ca-nextbank.ch/en/about-us/news/from-2026-retroactive-buyback-of-your-pillar-3a-gaps)
- [troisiemepilier.ch — Plafonds 2026](https://www.troisiemepilier.ch/combien-peut-on-verser-sur-le-3eme-pilier-en-2026/)

---

### 7. Pierre — comptabilité

**Sujet :** Exemption TVA Swiss Olympic & Fondation Aide Sportive + précision sportifs étrangers.

**Recommandation de prompt (résumé) :**
- Confirmer que les montants alloués par Swiss Olympic et la Fondation Aide Sportive ne sont PAS soumis à la TVA et ne comptent PAS dans le seuil de 100 000 CHF.
- Rappeler la règle pour sportifs domiciliés à l'étranger : assujettissement TVA suisse si manifestation en CH + CA mondial ≥ 100k CHF/an sur prestations imposables.
- Distinguer comptablement : sponsoring/pub/image (imposables) vs allocations Swiss Olympic / Aide Sportive (exonérées).
- Aligner sur la correction rachat 3a (cf. Sophie).

**Sources :**
- [ESTV / AFC — Feuille d'info MWST sportifs domiciliés à l'étranger](https://www.estv.admin.ch/dam/estv/fr/dokumente/mwst/mwst-mbi24-sport-info1-fr.pdf.download.pdf/mwst-mbi24-sport-info1-fr.pdf)
- [tva-suisse.ch — Sport et montants alloués aux athlètes](https://www.tva-suisse.ch/actu-tva/actu-tva-n-61-juillet-2021/sport-montants-alloues-aux-athletes/)
- [entreprendre.ch — TVA 2026](https://entreprendre.ch/fiches-pratiques/fiscalite/tva-suisse-taxe-valeur-ajoutee/)

---

### 8. Alex — marketing & personal branding

**Sujet :** TikTok 70 % completion + Instagram keywords > hashtags + watermark pénalisé.

**Recommandation de prompt (résumé) :**
- Mettre à jour le seuil de viralité TikTok 2026 à 70 % de completion rate (vs 50 % en 2024) → calibrer les durées ≤ 15 s.
- Acter la bascule Instagram : mots-clés > hashtags pour la découverte (les hashtags ne supportent plus les follows).
- Signaler la pénalité algorithmique sur watermark visible Instagram (30-50 % de down-rank).
- Cadence pratique : IG = 3-5 Feed + 4 Reels + Stories quotidiennes ; TikTok = 1-3 posts/jour.

**Sources :**
- [Buffer — Instagram Algorithm 2026](https://buffer.com/resources/instagram-algorithms/)
- [Socialync — TikTok Algorithm Changes 2026 (Updated May)](https://www.socialync.io/blog/tiktok-algorithm-2026-what-works-now)
- [Truescho — Instagram & TikTok 2026 consistency](https://truescho.com/en/blog/instagram-tiktok-algorithm-consistency-2026)
- [Metricool — TikTok Trends 2026](https://metricool.com/tiktok-trends/)

---

### 9. Marc — sponsoring

**Sujet :** Marché Europe 2026 + clauses ESG standard + Infront CH levier ski/hockey.

**Recommandation de prompt (résumé) :**
- Mettre à jour les chiffres marché Europe : 27,80 Mrd USD (2025) → 29,77 Mrd USD (2026).
- Caractériser 2026 par le « volume sans inflation » (plus de deals, moins de méga-deals, acheteurs plus sélectifs).
- Intégrer les clauses ESG / green clauses comme standard contractuel (+15 % perception de marque).
- Signaler Infront Sports & Media (Zoug, CH) comme levier pour les athlètes ski (FIS) et hockey (IIHF).
- Tendance « business-backed » : intégration B2B (cloud, cybersécurité, perf tech).

**Sources :**
- [Business Research Company — Sports Sponsorship Global Market Report 2026](https://www.thebusinessresearchcompany.com/report/sports-sponsorship-global-market-report)
- [Market Data Forecast — Europe Sports Sponsorship Market](https://www.marketdataforecast.com/market-reports/europe-sports-sponsorship-market)
- [The Sponsor — Sponsorship Outlook 2026](https://www.thesponsor.com/sponsorship-outlook-2026-the-trends-and-market-forces-shaping-the-year-ahead/)
- [SponsorUnited — Business-Backed Sponsorship Trends 2026](https://www.sponsorunited.com/insights/breakout-plays-the-trends-winning-sports-sponsorship-in-2026---business-backed-sponsorships)
- [VML — Future 100 Sports + Sponsorship 2026](https://www.vml.com/insight/the-future-100-2026-sports-sponsorship-trends)

---

### 10. Léa — droit du sport

**Sujet :** FIFA Legal Handbook 2025 + due-diligence licence agent.

**Recommandation de prompt (résumé) :**
- Intégrer le FIFA Legal Handbook 2025 : renforcement protection joueuses/entraîneurs féminines (maternité, retour), ajustements transferts internationaux.
- Rappeler la régulation FIFA Football Agents : licence obligatoire, prohibition représentation multiple, plafond commission, mécanisme Agents Chamber.
- Recommander 3 checks systématiques avant signature mandat : licence FIFA active, absence de représentation multiple, juridiction Agents Chamber.

**Sources :**
- [FIFA — inside.fifa.com transfer-system agents](https://inside.fifa.com/transfer-system/agents)
- [SportsAgent Institute — FIFA 2025 Legal Handbook](https://fifa.sportsagentinstitute.com/en/blog/fifa-legal-handbook)
- [FIFA Football Agent Regulations PDF](https://digitalhub.fifa.com/m/1e7b741fa0fae779/original/FIFA-Football-Agent-Regulations.pdf)

---

### 11. Lucas — manager sportif

**Sujet :** 🏆 FC THUN champion de Brack Super League 2025/26 (1er titre en 128 ans).

**Recommandation de prompt (résumé) :**
- Mettre à jour la donnée championne : FC Thun premier titre dans les 128 ans d'histoire du club, acquis le 14 mai 2026 après la défaite 0-3 du FC St-Gall face au FC Sion.
- Trophée remis le 14 mai 2026 après derby Thun-YB (défaite 3-8 sans impact).
- FC Thun remonté en Super League il y a un an, l'un des plus petits budgets — comparaison médiatique Leicester 2016.
- Implications carrière : Thun = destination crédible pour jeunes talents suisses ; revalorisation agents/joueurs du club ; opportunités sponsoring Berne/Oberland ; UEFA Champions League qualifiers garantie.
- Saison 2026/27 démarre fin juillet sous format Brack Super League établi.

**Sources :**
- [SFL — Classement Brack Super League](https://sfl.ch/superleague-classement)
- [OneFootball — FC Thun first Swiss title](https://onefootball.com/en/news/fc-thun-win-swiss-title-for-the-first-time-in-their-history-42809087)
- [Outlook India Sports — FC Thun first title 128 years](https://www.outlookindia.com/sports/football/swiss-super-league-2025-26-fc-thun-first-title-128-year-club-history-st-gallen-runners-up-in-pics)
- [Blick.ch — Super League Thun-YB 14/05/2026](https://www.blick.ch/sport/fussball/superleague/super-league-fc-thun-bsc-young-boys-14-05-2026-id21931524.html)

---

## Annexe transverse

### Tendances communes à surveiller la semaine prochaine

- **Préparation JO Milano-Cortina 2026** (février 2026 — déjà couvert en mai 2026 chez Léa via Host City Contracts). Anticiper le bilan post-JO pour les agents Lucas, Marc, Alex (visibilité des athlètes ski).
- **Brack Super League — fin de saison 2025/26 le 17 mai 2026** (aujourd'hui). Surveiller les transferts d'été qui s'ouvrent au 1er juillet : Thun (champion) et St-Gall (vice-champion) auront des mouvements à anticiper côté agents.
- **WADA 2026 — premier semestre d'application** : surveiller les premiers cas / clarifications sur le monoxyde de carbone et le seuil glissant salmétérol 100 μg/8h.
- **TikTok bascule Oracle US** : impact sur les athlètes suisses ciblant le marché US.

### Cohérence avec la vision SPORTVISE

Les 11 mises à jour respectent la boussole produit (mémoire `vision_agents_experts.md`) : enrichir la qualité conseiller des agents experts, pas les features périphériques. Trois mises à jour ont une valeur conseil particulièrement haute : (1) la correction rachat 3a chez Sophie, (2) le passage TikTok 70 % chez Alex, (3) l'actualisation FC Thun chez Lucas.

---

## Comment appliquer ces mises à jour

> **Pour appliquer ces mises à jour :** ouvre une nouvelle session Cowork et dis simplement *« applique le patch SPORTVISE du 2026-05-17 »*. Claude lira `/Users/thomas/Documents/SPORTVISE/Code/agent-updates/2026-05-17/SPORTVISE_Patch_2026-05-17.json`, te montrera le diff résumé, et appliquera après ton OK avec un commit git `chore(agents): MAJ hebdo 2026-05-17 — 11 agents`. Pour rollback : `git revert HEAD` dans `/Users/thomas/Documents/SPORTVISE/Code/`.

⚠️ **Note importante :** ce patch dépasse le seuil 20 % (à 23,7 %). Le scheduled task a refusé l'auto-application. Tu peux soit (a) appliquer tel quel après revue manuelle, soit (b) demander à Claude de trimmer les 2-3 agents les plus longs (Lucas, Marc, Sophie) avant application.

---

*Rapport généré par le scheduled task `sportvise-agent-training` le 2026-05-17.*
