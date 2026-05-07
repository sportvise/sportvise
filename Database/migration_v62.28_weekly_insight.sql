-- ─────────────────────────────────────────────────────────────────────────
-- v62.28 — Coach insight hebdomadaire (Idée 3 STRATEGIE_INDISPENSABLE)
-- Date : 07/05/2026
-- Spec : SPEC_v62.28_weekly_insight.md
--
-- BUT : stocker l'insight hebdomadaire généré par Sonnet/Haiku (pattern v62.25
-- welcome card). Régénéré chaque lundi (changement de semaine ISO). Affiché en
-- carte purple dans le dashboard, signé par un agent en rotation (pool 7).
--
-- Schéma JSON attendu dans weekly_insight_json :
-- {
--   agent_id: 'physique'|'mental'|'sommeil'|'recuperation'|'nutrition'|'equipe'|'marketing',
--   agent_name: 'David'|...,
--   agent_emoji: '🏋️'|...,
--   headline: string (1 ligne),
--   observations: string[] (2-3 items),
--   recommendation: string (1 paragraphe court),
--   _fallback?: boolean,
--   _iso_week: number (1-53),
--   _generated_at: ISO timestamp
-- }
--
-- IMPACT MIGRATION : ZÉRO (toutes colonnes nullable). Comportement actuel inchangé.
-- RLS profiles existante (auth.uid() = id) couvre déjà ces colonnes.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS weekly_insight_json JSONB,
  ADD COLUMN IF NOT EXISTS weekly_insight_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS weekly_insight_iso_week INTEGER,
  ADD COLUMN IF NOT EXISTS weekly_insight_dismissed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.weekly_insight_json IS
  'v62.28 — Insight hebdomadaire JSON généré par Sonnet (fallback Haiku, fallback hardcoded). Schéma : {agent_id, agent_name, agent_emoji, headline, observations[], recommendation, _fallback?, _iso_week, _generated_at}.';

COMMENT ON COLUMN public.profiles.weekly_insight_iso_week IS
  'v62.28 — Numéro de semaine ISO (1-53) pour laquelle l''insight a été généré. Comparé à la semaine courante côté backend pour décider si regen.';

COMMENT ON COLUMN public.profiles.weekly_insight_dismissed_at IS
  'v62.28 — Timestamp où l''user a cliqué × pour fermer l''insight. Reset à chaque nouvelle semaine ISO (regen). Permet de masquer la carte sans la supprimer.';

-- ─────────────────────────────────────────────────────────────────────────
-- VÉRIFICATION (à runner après pour confirmer)
-- ─────────────────────────────────────────────────────────────────────────
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_name='profiles' AND column_name LIKE 'weekly_insight_%';
-- Attendu : 4 lignes (json/jsonb, generated_at/timestamptz, iso_week/integer, dismissed_at/timestamptz)
