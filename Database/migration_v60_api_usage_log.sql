-- v60 — Table api_usage_log pour rate limiting + observabilité Claude API
--
-- BUT : tracer chaque appel à la Netlify function /chat (un row par appel, succès ou erreur)
-- pour (1) appliquer des limites par user/plan côté serveur (anti-bypass UI),
-- (2) observer la consommation de tokens et la latence par agent/modèle.
--
-- À exécuter dans Supabase SQL Editor.
--
-- LPD CH (art. 6 minimisation) : on ne stocke QUE les données techniques (user_id, ts,
-- agent_id, model, counts de tokens, latency, success). Aucun contenu de message.
-- Aucun email. Le user_id est un UUID opaque référençant auth.users.
--
-- Rétention : 30 jours (purge manuelle ou cron à mettre en place plus tard).
-- Cascade DELETE sur suppression de compte garantie par FK ON DELETE CASCADE
-- (le delete_user_data() RPC v54 n'a PAS besoin d'être modifié — la cascade FK
-- s'occupe automatiquement de cleaner les rows quand un user est supprimé).

CREATE TABLE IF NOT EXISTS public.api_usage_log (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ts            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  endpoint      TEXT         NOT NULL DEFAULT 'chat',
  agent_id      TEXT,
  model         TEXT,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  latency_ms    INTEGER,
  success       BOOLEAN      NOT NULL DEFAULT true,
  error_code    TEXT
);

-- Hot-path indexes pour les queries de rate-limit (dernière minute, dernières 24h par user)
CREATE INDEX IF NOT EXISTS idx_api_usage_log_user_ts ON public.api_usage_log (user_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_log_ts      ON public.api_usage_log (ts);

-- Row Level Security
ALTER TABLE public.api_usage_log ENABLE ROW LEVEL SECURITY;

-- Users peuvent lire uniquement leurs propres lignes (utile si on affiche un compteur de
-- consommation côté profil plus tard ; pour l'instant le UI lit dailyMsgCount localement).
DROP POLICY IF EXISTS "users_can_read_own_usage" ON public.api_usage_log;
CREATE POLICY "users_can_read_own_usage"
  ON public.api_usage_log FOR SELECT
  USING (user_id = auth.uid());

-- Inserts uniquement via service_role (Netlify function chat/index.js).
-- Pas de policy INSERT pour anon/authenticated → bypass impossible côté client.

COMMENT ON TABLE public.api_usage_log IS
  'v60 — Log des appels à la Netlify function /chat. Utilisé pour rate-limiting et observabilité. Rétention 30j. Cascade DELETE via FK ON DELETE CASCADE.';
COMMENT ON COLUMN public.api_usage_log.error_code IS
  'NULL si success=true. Sinon : rate_limit_minute, rate_limit_day, claude_api_*, claude_network_error, auth_invalid, unknown_agent, message_too_long, invalid_payload, api_key_missing.';

-- ─────────────────────────────────────────────────────────────────────────────
-- VÉRIFICATION (à runner après pour confirmer)
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT 'Table' AS check, COUNT(*) AS rows FROM api_usage_log;
-- SELECT 'Indexes' AS check, indexname FROM pg_indexes WHERE tablename = 'api_usage_log';
-- SELECT 'RLS' AS check, relrowsecurity AS enabled FROM pg_class WHERE relname = 'api_usage_log';
-- SELECT 'Policy' AS check, polname FROM pg_policy WHERE polrelid = 'public.api_usage_log'::regclass;
