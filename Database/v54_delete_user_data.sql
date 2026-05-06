-- v54 — Fonction Postgres atomique pour cascade DELETE des données utilisateur
-- À exécuter dans Supabase SQL Editor APRÈS avoir validé l'audit (v54_audit_user_id_tables.sql).
-- Appelée par la Netlify function delete-account.js via supabaseAdmin.rpc('delete_user_data', { p_user_id }).
--
-- SECURITY DEFINER : la fonction s'exécute avec les droits du créateur (donc capable de bypasser RLS).
-- Le contrôle d'accès se fait côté Netlify function : seul le service_role JWT peut l'appeler,
-- et la function vérifie d'abord que p_user_id == JWT.user.id.
--
-- TRANSACTION : PL/pgSQL fonction = transaction implicite. Si un DELETE échoue, tout rollback —
-- pas de données orphelines.

CREATE OR REPLACE FUNCTION public.delete_user_data(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_counts jsonb := '{}'::jsonb;
  cnt int;
BEGIN
  -- Garde-fou : refuser un user_id NULL (sécurité)
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id cannot be NULL';
  END IF;

  -- Ordre : enfants → parents (au cas où une FK manquerait l'ON DELETE CASCADE)

  DELETE FROM messages WHERE user_id = p_user_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted_counts := jsonb_set(deleted_counts, '{messages}', to_jsonb(cnt));

  DELETE FROM calendar_events WHERE user_id = p_user_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted_counts := jsonb_set(deleted_counts, '{calendar_events}', to_jsonb(cnt));

  DELETE FROM daily_log WHERE user_id = p_user_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted_counts := jsonb_set(deleted_counts, '{daily_log}', to_jsonb(cnt));

  DELETE FROM goals WHERE user_id = p_user_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted_counts := jsonb_set(deleted_counts, '{goals}', to_jsonb(cnt));

  DELETE FROM favorites WHERE user_id = p_user_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted_counts := jsonb_set(deleted_counts, '{favorites}', to_jsonb(cnt));

  DELETE FROM ratings WHERE user_id = p_user_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted_counts := jsonb_set(deleted_counts, '{ratings}', to_jsonb(cnt));

  DELETE FROM fitness_score WHERE user_id = p_user_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted_counts := jsonb_set(deleted_counts, '{fitness_score}', to_jsonb(cnt));

  -- referrals : 2 colonnes possibles (referrer_id ou referred_id selon le sens)
  DELETE FROM referrals WHERE referrer_id = p_user_id OR referred_id = p_user_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted_counts := jsonb_set(deleted_counts, '{referrals}', to_jsonb(cnt));

  -- profiles en dernier (parent logique côté app)
  DELETE FROM profiles WHERE id = p_user_id;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  deleted_counts := jsonb_set(deleted_counts, '{profiles}', to_jsonb(cnt));

  RETURN deleted_counts;
END;
$$;

-- Restreindre l'exécution : seul le service_role peut appeler la fonction
-- (les anon/authenticated users ne doivent JAMAIS pouvoir l'invoquer directement)
REVOKE ALL ON FUNCTION public.delete_user_data(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_user_data(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.delete_user_data(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_data(uuid) TO service_role;

COMMENT ON FUNCTION public.delete_user_data(uuid) IS
  'v54 — Cascade DELETE atomique pour right-to-be-forgotten (LPD/RGPD). Appelée par la Netlify function delete-account.js. Retourne {table: row_count} en jsonb.';
