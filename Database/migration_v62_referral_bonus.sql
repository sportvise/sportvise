-- v62.18 — Attribution automatique du mois bonus parrainage via Stripe customer_balance
--
-- BUT : permettre au stripe-webhook (Code/netlify/functions/stripe-webhook.js, handler
-- checkout.session.completed) de tracker l'attribution effective du mois bonus, à la fois
-- pour le parrain (referrer) et le filleul (referred). Idempotence garantie par les
-- timestamps : si bonus_applied_at != NULL, le webhook skip pour éviter une double-attribution
-- en cas de re-fire Stripe (retry réseau, replay).
--
-- LOGIQUE :
--   1. Filleul prend un plan payant → checkout.session.completed
--   2. confirmReferral(email) trouve la row referrals où referred_email=email AND status='pending'
--   3. Update status='confirmed', confirmed_at=now()
--   4. applyReferralBonus pour le filleul → POST /v1/customers/{id}/balance_transactions amount=-priceCents
--      → Update referred_bonus_applied_at=now() (idempotence)
--   5. Lookup parrain via profiles.email → Stripe customers?email=... → apply bonus pareil
--      → Update referrer_bonus_applied_at=now()
--   6. Si parrain est Free (pas de Stripe customer) : log + Sentry warning, attribution manuelle
--      (Thomas check 1× par sem post-launch)
--
-- À EXÉCUTER dans Supabase SQL Editor.

-- Si une de ces colonnes existe déjà (notamment confirmed_at qui est déjà utilisé par
-- confirmReferral() v54), IF NOT EXISTS rend la migration idempotente.

ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS confirmed_at                 TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS referrer_bonus_applied_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS referred_bonus_applied_at    TIMESTAMPTZ;

-- Index pour accélérer le lookup confirmReferral (filtrage referred_email + status=pending)
CREATE INDEX IF NOT EXISTS idx_referrals_pending_email
  ON public.referrals (referred_email)
  WHERE status = 'pending';

COMMENT ON COLUMN public.referrals.confirmed_at IS
  'v62.18 — set par stripe-webhook (confirmReferral) quand le filleul prend un plan payant';
COMMENT ON COLUMN public.referrals.referrer_bonus_applied_at IS
  'v62.18 — idempotence : set après création réussie du balance_transaction Stripe pour le parrain';
COMMENT ON COLUMN public.referrals.referred_bonus_applied_at IS
  'v62.18 — idempotence : set après création réussie du balance_transaction Stripe pour le filleul';

-- ─────────────────────────────────────────────────────────────────────────────
-- VÉRIFICATION (à runner après pour confirmer)
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='referrals' ORDER BY ordinal_position;
-- Expected new rows: confirmed_at, referrer_bonus_applied_at, referred_bonus_applied_at (timestamptz, nullable)

-- SELECT indexname FROM pg_indexes WHERE tablename='referrals';
-- Expected new row: idx_referrals_pending_email
