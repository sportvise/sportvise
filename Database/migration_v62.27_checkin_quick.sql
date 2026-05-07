-- ─────────────────────────────────────────────────────────────────────────
-- v62.27 — Check-in 30s (Quick Win #3)
-- Date : 07/05/2026
-- Spec : SPEC_v62.27_checkin_30s.md (Quick Win #3, single-bet pré-launch)
--
-- BUT : différencier les saisies via le check-in rapide (3 sliders : energy /
-- mood / pain_level) du journal long (qui couvre plus de champs : sleep_quality,
-- motivation, nutrition_quality, training_done, notes…). Le pipeline agents IA
-- lit toutes les colonnes indifféremment — `is_quick` est uniquement un flag
-- analytique pour mesurer l'adoption du check-in et pour l'UI (carte dashboard
-- masquée si log_date du jour existe déjà, peu importe la source).
--
-- IMPACT MIGRATION : ZÉRO (default false → tous les logs existants restent
-- non-quick, comportement actuel inchangé).
--
-- Pas de modif RLS nécessaire : la policy existante user_id = auth.uid() couvre
-- déjà toute la table daily_log.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.daily_log
  ADD COLUMN IF NOT EXISTS is_quick BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.daily_log.is_quick IS
  'v62.27 — TRUE si la saisie est venue du check-in 30s (3 sliders : energy / mood / pain_level). FALSE si journal long ou saisie historique. Flag analytique uniquement (le pipeline agents lit toutes les colonnes indépendamment).';

-- ─────────────────────────────────────────────────────────────────────────
-- VÉRIFICATION (à runner après pour confirmer)
-- ─────────────────────────────────────────────────────────────────────────
-- SELECT column_name, data_type, column_default FROM information_schema.columns
--  WHERE table_name='daily_log' AND column_name='is_quick';
-- Attendu : 1 ligne (is_quick / boolean / false)
-- SELECT is_quick, COUNT(*) FROM daily_log GROUP BY is_quick;
-- Attendu : tous existants en is_quick=false
