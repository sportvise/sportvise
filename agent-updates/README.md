# SPORTVISE — Mises à jour hebdomadaires des agents IA

Ce dossier contient les mises à jour hebdomadaires des prompts système des 11 agents IA de SPORTVISE, produites chaque lundi par la tâche planifiée `sportvise-agent-training`.

## Structure

```
agent-updates/
├── README.md  ← ce fichier
└── YYYY-MM-DD/
    ├── SPORTVISE_Agent_Update_YYYY-MM-DD.md  ← rapport humain (recherche + sources)
    ├── DIFF_RESUME_YYYY-MM-DD.md             ← résumé court pour validation
    └── SPORTVISE_Patch_YYYY-MM-DD.json       ← patch prêt-à-appliquer
```

## Workflow hebdomadaire

1. **Lundi 9h01** — la tâche `sportvise-agent-training` tourne automatiquement, fait sa veille (PubMed, Frontiers, BJSM, WADA, AFC, etc.) et écrit les 3 fichiers ci-dessus dans `agent-updates/[DATE]/`. Une notification est envoyée à la fin du run.
2. **Plus tard dans la journée (ou la semaine)** — tu ouvres une nouvelle session Cowork et tu dis simplement :

   > **« applique le patch SPORTVISE du YYYY-MM-DD »**

3. Claude lit le `SPORTVISE_Patch_[DATE].json`, te montre le `DIFF_RESUME` formaté, attend ton OK.
4. Sur ton OK, Claude applique les `Edit` séquentiels sur `src/dashboard.html`, vérifie la syntaxe JS, et fait un commit git :

   ```
   chore(agents): MAJ hebdo YYYY-MM-DD — N agents
   ```

5. **Rollback** : `git revert HEAD` dans `/Users/thomas/Documents/SPORTVISE/Code/`.

## Garde-fous

- **Validation humaine obligatoire** : aucune modification de `dashboard.html` sans ton OK explicite.
- **Garde-fou taille** : si le patch dépasse +20 % de la taille du bloc `agentSystemPrompts`, la tâche refuse l'auto-application et demande une revue manuelle.
- **Validation syntaxique** : le patch JSON est validé avant écriture, et chaque `anchor` est vérifié unique dans le fichier cible.
- **Append-only** : les `MISE À JOUR [MOIS YYYY]` sont AJOUTÉES à la fin de chaque prompt, jamais en remplacement. Aucune ligne existante n'est modifiée.

## Format du patch JSON

```json
{
  "date": "2026-05-05",
  "target_file": "/Users/thomas/Documents/SPORTVISE/Code/src/dashboard.html",
  "edits": [
    {
      "agent_key": "physique",
      "agent_name": "David",
      "anchor": "<dernière phrase exacte et unique du prompt actuel>",
      "append": "\n\nMISE À JOUR [MOIS YYYY] — <titre> :\n<corps 3-8 lignes>",
      "summary": "<1 ligne pour le diff résumé>"
    }
  ]
}
```

L'instruction `Edit` exécutée par Claude est :
- `old_string` = `anchor`
- `new_string` = `anchor + append`

## Historique

| Date | Agents touchés | Notes |
|---|---|---|
| 2026-05-05 | 11 / 11 | Premier patch appliqué via ce workflow (manuel — ce système n'existait pas encore). Patch de référence sauvegardé dans `2026-05-05/`. |
