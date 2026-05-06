-- ════════════════════════════════════════════════════════════════════
-- SPORTVISE — Migration v42 : refactor key→label
-- ════════════════════════════════════════════════════════════════════
-- Convertit les valeurs FR canoniques stockées en DB vers des keys
-- canoniques (e.g. 'Football' → 'football', 'Débutant' → 'beginner').
--
-- ⚠️ AVANT d'exécuter :
--   1. Code v42 déployé en prod (le code est tolérant aux 2 formats donc
--      pas de downtime, mais déploie d'abord pour activer les helpers
--      qui afficheront correctement les nouvelles keys).
--   2. Backup explicite (la 1ère commande crée une table backup).
--
-- Comment exécuter (tuto pas à pas) :
--   1. Va sur https://supabase.com/dashboard/project/<TON-PROJECT-ID>/sql/new
--      (ou : Supabase Dashboard → ton projet SPORTVISE → SQL Editor → New query)
--   2. Copie-colle TOUT ce fichier dans l'éditeur
--   3. Clique "Run" (en bas à droite, ou Cmd+Enter)
--   4. Lis les résultats : la 1ère ligne crée le backup, les 4 UPDATE
--      affichent le nombre de lignes modifiées, le SELECT final affiche
--      la distribution post-migration pour vérification.
--   5. Si tout te semble OK : tu peux DROP la backup table dans 1-2 semaines
--      avec : DROP TABLE profiles_backup_v42_pre_keylabel;
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. BACKUP (irréversible sans cette étape) ──────────────────────
CREATE TABLE IF NOT EXISTS profiles_backup_v42_pre_keylabel AS
SELECT *, NOW() AS backup_at FROM profiles;

-- ─── 2. SPORT (FR labels → canonical keys) ──────────────────────────
UPDATE profiles SET sport = CASE
  WHEN sport ILIKE 'football'                                   THEN 'football'
  WHEN sport ILIKE 'hockey%'                                    THEN 'hockey'         -- Hockey, Hockey sur glace
  WHEN sport ILIKE 'ski%'                                       THEN 'skiing'         -- Ski, Ski alpin
  WHEN sport ILIKE 'tennis'                                     THEN 'tennis'
  WHEN sport ILIKE 'padel'                                      THEN 'padel'
  WHEN sport ILIKE 'cyclisme'                                   THEN 'cycling'
  WHEN sport ILIKE 'natation'                                   THEN 'swimming'
  WHEN sport ILIKE 'athl%tisme'                                 THEN 'athletics'      -- Athlétisme avec ou sans accent
  WHEN sport ILIKE 'basketball'                                 THEN 'basketball'
  WHEN sport ILIKE 'volleyball'                                 THEN 'volleyball'
  WHEN sport ILIKE 'unihockey' OR sport ILIKE 'floorball'       THEN 'floorball'
  WHEN sport ILIKE 'handball'                                   THEN 'handball'
  WHEN sport ILIKE 'gymnastique' OR sport ILIKE 'gymnastics'    THEN 'gymnastics'
  WHEN sport ILIKE 'rugby'                                      THEN 'rugby'
  WHEN sport ILIKE 'golf'                                       THEN 'golf'
  WHEN sport ILIKE 'triathlon'                                  THEN 'triathlon'
  WHEN sport ILIKE 'boxe' OR sport ILIKE 'boxing'               THEN 'boxing'
  WHEN sport ILIKE 'arts martiaux' OR sport ILIKE 'martial%'    THEN 'martial-arts'
  WHEN sport ILIKE 'danse' OR sport ILIKE 'dance'               THEN 'dance'
  WHEN sport ILIKE 'escalade' OR sport ILIKE 'climbing'         THEN 'climbing'
  WHEN sport ILIKE 'trail%' OR sport ILIKE '%running%'          THEN 'trail-running'
  WHEN sport ILIKE 'autre' OR sport ILIKE 'other'               THEN 'other'
  WHEN sport IS NULL OR sport = ''                              THEN sport             -- garde NULL/empty
  ELSE 'other'                                                                         -- valeurs custom non-mappées → 'other'
END
WHERE sport IS NOT NULL AND sport <> '';

-- ─── 3. LEVEL (FR labels → canonical keys) ──────────────────────────
UPDATE profiles SET level = CASE LOWER(level)
  WHEN 'débutant'      THEN 'beginner'
  WHEN 'debutant'      THEN 'beginner'
  WHEN 'amateur'       THEN 'amateur'
  WHEN 'compétition'   THEN 'competition'
  WHEN 'competition'   THEN 'competition'
  WHEN 'semi-pro'      THEN 'semipro'
  WHEN 'semipro'       THEN 'semipro'
  WHEN 'professionnel' THEN 'professional'
  WHEN 'professional'  THEN 'professional'
  WHEN 'elite'         THEN 'elite'
  WHEN 'élite'         THEN 'elite'
  ELSE level                                                                          -- garde la valeur si non reconnue
END
WHERE level IS NOT NULL AND level <> '';

-- ─── 4. CANTON (FR labels → ISO codes suisses) ──────────────────────
UPDATE profiles SET canton = CASE
  WHEN canton ILIKE 'vaud'        THEN 'VD'
  WHEN canton ILIKE 'gen%ve'      THEN 'GE'
  WHEN canton ILIKE 'zurich' OR canton ILIKE 'z%rich' THEN 'ZH'
  WHEN canton ILIKE 'berne' OR canton ILIKE 'bern'    THEN 'BE'
  WHEN canton ILIKE 'valais' OR canton ILIKE 'wallis' THEN 'VS'
  WHEN canton ILIKE 'fribourg' OR canton ILIKE 'freiburg' THEN 'FR'
  WHEN canton ILIKE 'neuch%tel'   THEN 'NE'
  WHEN canton ILIKE 'jura'        THEN 'JU'
  WHEN canton ILIKE 'lucerne' OR canton ILIKE 'luzern' THEN 'LU'
  WHEN canton ILIKE 'b%le' OR canton ILIKE 'basel'    THEN 'BS'
  WHEN canton ILIKE 'st-gallen' OR canton ILIKE 'st-gall' OR canton ILIKE 'st. gallen' THEN 'SG'
  WHEN canton ILIKE 'argovie' OR canton ILIKE 'aargau' THEN 'AG'
  WHEN canton ILIKE 'autre' OR canton ILIKE 'other'    THEN 'other'
  WHEN canton IS NULL OR canton = ''                   THEN canton
  ELSE 'other'
END
WHERE canton IS NOT NULL AND canton <> '';

-- ─── 5. GOALS (les goals créés via onboarding ont des FR titles) ────
-- Note: on ne touche PAS aux titles (laissés tels quels = label localisé au moment
-- de la création). On harmonise juste le `domain` au cas où.
UPDATE goals SET domain = CASE LOWER(domain)
  WHEN 'physique'  THEN 'physique'
  WHEN 'mental'    THEN 'mental'
  WHEN 'financier' THEN 'financier'
  WHEN 'carriere'  THEN 'carriere'
  WHEN 'carrière'  THEN 'carriere'
  ELSE 'carriere'
END
WHERE domain IS NOT NULL;

-- ─── 6. VÉRIFICATION (à lire dans les résultats Supabase) ───────────
-- Doit afficher uniquement les keys canoniques (football, hockey, beginner, VD, etc.)
-- Si tu vois encore 'Football' ou 'Débutant', c'est qu'une row n'a pas été migrée.
SELECT 'sport' AS field, sport AS value, COUNT(*) AS n FROM profiles
WHERE sport IS NOT NULL GROUP BY sport
UNION ALL
SELECT 'level', level, COUNT(*) FROM profiles
WHERE level IS NOT NULL GROUP BY level
UNION ALL
SELECT 'canton', canton, COUNT(*) FROM profiles
WHERE canton IS NOT NULL GROUP BY canton
UNION ALL
SELECT 'goal_domain', domain, COUNT(*) FROM goals
WHERE domain IS NOT NULL GROUP BY domain
ORDER BY field, n DESC;

-- ─── 7. ROLLBACK (si tout casse) ────────────────────────────────────
-- Décommente et exécute SEULEMENT si tu veux annuler la migration.
-- DELETE FROM profiles;
-- INSERT INTO profiles SELECT * EXCEPT (backup_at) FROM profiles_backup_v42_pre_keylabel;
