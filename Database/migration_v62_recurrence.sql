-- v62 — Récurrence des événements
--
-- BUT : permettre la création d'un event récurrent (entraînement hebdo, etc.) en un seul
-- geste. À la création, on génère N rows en bulk insert, partageant un même
-- recurrence_group_id UUID. Pas d'expansion virtuelle au render — chaque occurrence
-- reste indépendante (RPE, recap_done, performance_note, etc.).
--
-- IMPACT MIGRATION : ZÉRO (events existants ont recurrence_group_id NULL = single event).
-- À exécuter dans Supabase SQL Editor avant push v62.
--
-- Pas de modif RLS nécessaire : la policy existante user_id = auth.uid() couvre déjà
-- toutes les rows de la série (chaque row a son user_id depuis la création).
--
-- Cap sécuritaire côté client : 365 occurrences max par série (empêche l'explosion DB).

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS recurrence_group_id UUID;

-- Index partiel pour les queries d'édition de série :
-- UPDATE/DELETE WHERE recurrence_group_id = X AND event_date >= ...
-- Le WHERE clause partiel évite d'indexer les NULL (majorité des rows).
CREATE INDEX IF NOT EXISTS idx_calendar_events_recurrence_group
  ON public.calendar_events (recurrence_group_id)
  WHERE recurrence_group_id IS NOT NULL;

COMMENT ON COLUMN public.calendar_events.recurrence_group_id IS
  'v62 — UUID partagé entre toutes les occurrences d''une série récurrente. NULL pour les events one-shot. Permet UPDATE/DELETE en bulk sur la série via WHERE recurrence_group_id = X AND event_date >= current_date.';

-- ─────────────────────────────────────────────────────────────────────────────
-- VÉRIFICATION (à runner après pour confirmer)
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT 'Column' AS check, column_name, data_type
--   FROM information_schema.columns
--  WHERE table_name='calendar_events' AND column_name='recurrence_group_id';
-- SELECT 'Index' AS check, indexname FROM pg_indexes
--  WHERE tablename='calendar_events' AND indexname='idx_calendar_events_recurrence_group';
-- SELECT COUNT(*) AS total_events,
--        COUNT(recurrence_group_id) AS recurring_events,
--        COUNT(DISTINCT recurrence_group_id) AS distinct_series
--   FROM calendar_events;
