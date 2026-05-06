-- v62.10 / sprint v61 ticket #61.4 — Lang per user
--
-- BUT : stocker la langue préférée de chaque user en DB pour que les emails
-- transactionnels arrivent dans la bonne langue, même quand le contexte n'a pas de
-- channel pour la passer (events Stripe portal : subscription.updated/deleted,
-- invoice.payment_failed n'ont pas de client_reference_id).
--
-- Avant cette migration : sendPlanChangeEmail/sendPaymentFailedEmail sur ces events
-- fallback à 'fr' hardcodé → user DE/EN/IT reçoit l'email en français quand il
-- gère son abonnement depuis le portail Stripe.
--
-- Après : stripe-webhook.js fetch profiles.lang via email lookup, utilise cette lang.
--
-- IMPACT MIGRATION : ZÉRO (default 'fr', tous les profiles existants restent en fr —
-- même comportement qu'avant la migration tant que dashboard.html n'a pas push update).
-- Quand v62.10 sera live, dashboard.html upserte profiles.lang à chaque connexion (et
-- à chaque changement de langue), donc les profils existants seront naturellement
-- mis à jour à leur prochaine session.
--
-- Pas de modif RLS : la policy existante user_id = auth.uid() couvre déjà.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS lang TEXT DEFAULT 'fr'
    CHECK (lang IN ('fr', 'de', 'en', 'it'));

COMMENT ON COLUMN public.profiles.lang IS
  'v61.4 — Langue préférée de l''utilisateur (fr/de/en/it). Persistée par dashboard.html à chaque connexion (sv_lang localStorage → upsert). Utilisée par stripe-webhook.js pour envoyer les emails transactionnels (plan change, payment failed, downgrade) dans la bonne langue, même sur les events portal Stripe qui n''ont pas de client_reference_id channel.';

-- ─────────────────────────────────────────────────────────────────────────────
-- VÉRIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT column_name, data_type, column_default FROM information_schema.columns
--  WHERE table_name='profiles' AND column_name='lang';
-- Attendu : 1 row, data_type='text', column_default=''fr''
--
-- SELECT lang, COUNT(*) FROM profiles GROUP BY lang;
-- Attendu : tous tes users existants en 'fr' (ils basculeront vers leur vraie langue
-- à leur prochaine session quand le code v62.10 sera live).
