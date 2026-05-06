-- v54 — Audit final tables avec user_id (à exécuter AVANT delete_user_data())
-- Objectif : confirmer la liste exhaustive des tables qui doivent être inclues dans la cascade DELETE.
-- Si une table avec user_id est omise, elle créera des données orphelines au DELETE compte.

-- 1) Toutes les colonnes nommées user_id dans le schéma public
SELECT table_schema, table_name, column_name, data_type
FROM information_schema.columns
WHERE column_name = 'user_id'
  AND table_schema = 'public'
ORDER BY table_name;

-- 2) Cas spéciaux : la table profiles utilise 'id' (pas 'user_id') — vérifier qu'elle existe
SELECT table_schema, table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name = 'id';

-- 3) Cas spécial referrals : peut avoir referrer_id et/ou referred_id
SELECT table_schema, table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'referrals'
ORDER BY ordinal_position;

-- 4) Toutes les FK qui pointent vers auth.users (pour ne rien rater)
SELECT
  tc.table_schema,
  tc.table_name,
  kcu.column_name,
  ccu.table_schema AS foreign_table_schema,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_schema = 'auth'
  AND ccu.table_name = 'users'
ORDER BY tc.table_schema, tc.table_name;

-- Liste attendue (selon spec v54) :
--   profiles (id), goals, daily_log, calendar_events, messages,
--   favorites, ratings, referrals (referrer_id + referred_id), fitness_score
-- Si la query #1 ou #4 révèle une table non listée → l'AJOUTER au delete_user_data() AVANT push.
