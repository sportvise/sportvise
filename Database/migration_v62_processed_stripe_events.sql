-- v62.8 / sprint v61 ticket #61.1 — Idempotence du webhook Stripe
--
-- BUT : empêcher le double-traitement si Stripe redelivere un event (timeout, retry sur 5xx).
-- Stripe redelivere automatiquement les events qui n'ont pas reçu un 2xx en 30s.
-- Sans cette table : double email "Plan Plus activé" + double confirmReferral + double
-- update de plan dans profiles (idempotent côté DB mais émissions doublées).
--
-- IMPACT MIGRATION : ZÉRO (nouvelle table autonome, aucune row existante affectée).
-- À exécuter dans Supabase SQL Editor avant push v62.8.
--
-- Pas de RLS nécessaire : la table est écrite/lue uniquement par le service_role de la
-- Netlify Function stripe-webhook.js. RLS activée sans policy = secure by default
-- (anon/authenticated bloqués, service_role bypasse).

CREATE TABLE IF NOT EXISTS public.processed_stripe_events (
  event_id      TEXT PRIMARY KEY,
  event_type    TEXT,
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PK auto-indexe event_id, donc pas besoin d'index supplémentaire pour les lookups.
-- Index sur processed_at utile pour le cleanup périodique éventuel (rétention 30j).
CREATE INDEX IF NOT EXISTS idx_processed_stripe_events_processed_at
  ON public.processed_stripe_events (processed_at);

-- RLS activée sans policy → lecture/écriture bloquée pour anon/authenticated.
-- Le service_role (Netlify Function) bypasse RLS de toute façon.
ALTER TABLE public.processed_stripe_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.processed_stripe_events IS
  'v61.1 — Tracking des events Stripe webhook déjà traités (idempotence). PK = event_id (Stripe UUID). Insert via PostgREST avec Prefer:resolution=ignore-duplicates depuis stripe-webhook.js. Si l''insert revient avec body vide → event déjà traité → return 200 sans re-traiter. Rétention recommandée : 30 jours (Stripe ne redelivrera pas au-delà). Cleanup à mettre en place via cron ou job périodique post-launch.';

-- ─────────────────────────────────────────────────────────────────────────────
-- VÉRIFICATION (à runner après pour confirmer)
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT 'Table' AS check, COUNT(*) AS rows FROM processed_stripe_events;
-- Attendu : 0 (table vide, premier insert au prochain webhook).
--
-- SELECT 'Indexes' AS check, indexname FROM pg_indexes WHERE tablename = 'processed_stripe_events';
-- Attendu : 2 rows (PK auto + idx_processed_stripe_events_processed_at).
--
-- SELECT 'RLS' AS check, relrowsecurity FROM pg_class WHERE relname = 'processed_stripe_events';
-- Attendu : true.

-- ─────────────────────────────────────────────────────────────────────────────
-- CLEANUP PÉRIODIQUE (optionnel — à mettre en place post-launch via pg_cron)
-- ─────────────────────────────────────────────────────────────────────────────
-- DELETE FROM processed_stripe_events WHERE processed_at < NOW() - INTERVAL '30 days';
