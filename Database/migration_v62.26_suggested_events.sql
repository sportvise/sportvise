-- ─────────────────────────────────────────────────────────────────────────
-- v62.26 — Suggested events flag (Quick Win #2 onboarding)
-- Date : 07/05/2026
-- Spec : Quick Win #2 du HANDOFF_QUICKWINS_ONBOARDING.md (pre-fill calendrier semaine type)
--
-- BUT : différencier les events insérés automatiquement post-onboarding
-- (semaine type pré-remplie selon le sport) des events créés manuellement
-- par l'user. Permet de :
--   - Afficher un badge visuel "Suggéré" tant que pas confirmé
--   - Bouton 1-clic "Confirmer" qui passe is_suggested = false (devient permanent)
--   - Idempotence côté hook : skip si déjà des events is_suggested=true pour cet user
--   - Possibilité de cleanup futur (DELETE WHERE is_suggested=true AND created_at < X)
--
-- IMPACT MIGRATION : ZÉRO (default false → tous events existants restent
-- non-suggérés, comportement actuel inchangé).
--
-- Pas de modif RLS nécessaire : la policy existante user_id = auth.uid() couvre déjà.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS is_suggested BOOLEAN NOT NULL DEFAULT false;

-- Index partiel pour les queries d'idempotence (check si user a déjà des suggested)
-- et pour le cleanup futur.
CREATE INDEX IF NOT EXISTS idx_calendar_events_suggested
  ON public.calendar_events (user_id, is_suggested)
  WHERE is_suggested = true;

-- Index UNIQUE partiel anti race condition : si finishOnboarding est appelé 2× en parallèle
-- (double-tap, network retry), le 2ème INSERT échouera proprement au lieu de créer 6 rows.
-- La logique JS catch silently et continue.
CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_events_suggested_unique
  ON public.calendar_events (user_id, event_date, event_time)
  WHERE is_suggested = true;

COMMENT ON COLUMN public.calendar_events.is_suggested IS
  'v62.26 — TRUE si l''event a été inséré automatiquement post-onboarding (semaine type pré-remplie selon le sport). Affiché avec un badge "Suggéré" + bouton 1-clic Confirmer dans l''UI. Passe à FALSE quand l''user clique Confirmer (devient un event normal). Reste TRUE tant que non-confirmé.';

-- ─────────────────────────────────────────────────────────────────────────
-- VÉRIFICATION (à runner après pour confirmer)
-- ─────────────────────────────────────────────────────────────────────────
-- SELECT column_name, data_type, column_default FROM information_schema.columns
--  WHERE table_name='calendar_events' AND column_name='is_suggested';
-- Attendu : 1 ligne (is_suggested / boolean / false)
-- SELECT is_suggested, COUNT(*) FROM calendar_events GROUP BY is_suggested;
-- Attendu : tous existants en is_suggested=false
