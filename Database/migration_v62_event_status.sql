-- v62.6 — Statut des événements (planned / cancelled / postponed)
--
-- BUT : permettre à l'utilisateur de marquer un event comme "annulé" sans le supprimer.
-- Cas d'usage : match reporté pour cause de météo, l'historique est préservé MAIS l'agent IA
-- ne demande plus de récap RPE pour cet event.
--
-- IMPACT MIGRATION : ZÉRO (default 'planned' → tous les events existants restent "planifiés").
-- À exécuter dans Supabase SQL Editor avant push v62.6.
--
-- Pas de modif RLS nécessaire : la policy existante user_id = auth.uid() couvre déjà.

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS event_status TEXT DEFAULT 'planned'
    CHECK (event_status IN ('planned', 'cancelled', 'postponed'));

-- Index partiel pour les queries d'exclusion (checkPendingRecaps filtre status != 'cancelled')
CREATE INDEX IF NOT EXISTS idx_calendar_events_status
  ON public.calendar_events (event_status)
  WHERE event_status != 'planned';

COMMENT ON COLUMN public.calendar_events.event_status IS
  'v62.6 — Statut de l''événement. ''planned'' (default) = à venir/passé normal. ''cancelled'' = annulé (pas de récap RPE demandé, rendu barré). ''postponed'' = reporté (à reprogrammer, pas de récap demandé). Permet de préserver l''historique tout en évitant les fausses demandes de récap.';

-- ─────────────────────────────────────────────────────────────────────────────
-- VÉRIFICATION (à runner après pour confirmer)
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT column_name, data_type, column_default FROM information_schema.columns
--  WHERE table_name='calendar_events' AND column_name='event_status';
-- SELECT event_status, COUNT(*) FROM calendar_events GROUP BY event_status;
-- Attendu : tous les events existants en 'planned'
