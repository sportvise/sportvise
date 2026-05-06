-- ─────────────────────────────────────────────────────────────────────────
-- v62.25 — Welcome card post-onboarding (Quick Win #1)
-- Date : 06/05/2026
-- Spec : SPEC_v62.25_welcome_card_lucas.md
--
-- Stocke la carte de bienvenue générée par Sonnet juste après l'onboarding.
-- Le JSON contient {headline, key_points[], weekly_action{text, agent_id}, agents_teaser[],
-- _fallback?}. Affichée sur le dashboard pendant 7 jours post-signup, dismissible.
--
-- Idempotence : si welcome_card_json est non-null ET _fallback != true, l'API ne regénère pas.
-- Si _fallback === true, l'API regénère au prochain login (max 1×/jour, géré côté backend).
--
-- RGPD/LPD : aucune donnée sensible stockée (pas de modif registre LPD requise).
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS welcome_card_json         JSONB,
  ADD COLUMN IF NOT EXISTS welcome_card_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS welcome_card_dismissed_at TIMESTAMPTZ;

-- Pas d'index nécessaire : on ne query que par profiles.id (PK déjà indexée).
-- Pas de RLS update nécessaire : profiles est déjà protégée par les RLS existantes
-- (read/update sur own row pour authenticated users).

-- ─── Vérification ───
-- Run après migration pour confirmer :
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'profiles'
--   AND column_name LIKE 'welcome_card%';
-- Attendu : 3 lignes (welcome_card_json/jsonb, welcome_card_generated_at/timestamptz,
-- welcome_card_dismissed_at/timestamptz)
