# SPORTVISE — Runbook setup brief matinal v63.3.0

**À exécuter par Thomas** AVANT le push v63.3.0 (ou immédiatement après — les fonctions backend échoueront silencieusement tant que les env vars ne sont pas en place, mais aucun bug client).

3 actions manuelles à faire dans l'ordre. Total ~15-20 min.

---

## 1. Génération des clés VAPID (~3 min)

Les clés VAPID identifient ton serveur auprès des navigateurs pour envoyer des push notifications.

**Méthode A — Via web-push CLI (Node) :**
```bash
npx web-push generate-vapid-keys
```
Output :
```
Public Key:
BPXYz...long string base64url
Private Key:
ABC...short string base64url
```

**Méthode B — Via vapidkeys.com :**
1. Aller sur https://vapidkeys.com/
2. Cliquer "Generate VAPID Keys"
3. Copier les 2 clés affichées

**Stocker les 3 env vars dans Netlify :**
1. Aller sur https://app.netlify.com/sites/sportvise/settings/env (ou ton site)
2. Ajouter les 3 variables :
   - `VAPID_PUBLIC_KEY` = la clé publique (utilisée côté frontend pour `subscribe()`)
   - `VAPID_PRIVATE_KEY` = la clé privée (utilisée côté Netlify Function pour signer les pushs)
   - `VAPID_SUBJECT` = `mailto:thomas.castella1@gmail.com` (URL de contact obligatoire VAPID)
3. Sauvegarder. **Pas besoin de redéployer** : les env vars sont chargées à chaque invocation de Function.

---

## 2. Migration SQL Supabase (~5 min)

Aller sur https://supabase.com/dashboard/project/ckikyvokurpehavjlkbc/sql/new

Coller et exécuter le SQL suivant :

```sql
-- v63.3.0 — Brief matinal push : table subscriptions + colonne profile.morning_brief_optin
-- Cf. RUNBOOK_v63_brief_matinal_setup.md

-- 1. Table push_subscriptions
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  lang        TEXT DEFAULT 'fr',
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_pushed_at TIMESTAMPTZ,
  fail_count  INTEGER DEFAULT 0,
  UNIQUE (user_id, endpoint)
);

-- Index pour le scheduler (récupération rapide des subscriptions actives par user)
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON public.push_subscriptions(user_id);

-- RLS : un user ne peut voir/insérer/supprimer que SES propres subscriptions
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own push subscriptions"
  ON public.push_subscriptions;
CREATE POLICY "Users can manage their own push subscriptions"
  ON public.push_subscriptions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Le service_role (Netlify Functions) bypasse RLS automatiquement, donc le scheduler
-- send-morning-brief peut lire toutes les subscriptions sans changement.

-- 2. Colonne profiles.morning_brief_optin
-- Valeurs : 'on' (souscrit), 'later' (déclic à plus tard), 'off' (refusé), NULL (pas demandé)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS morning_brief_optin TEXT DEFAULT NULL;

-- Index pour le scheduler (filtre rapide des users opt-in)
CREATE INDEX IF NOT EXISTS idx_profiles_morning_brief_optin
  ON public.profiles(morning_brief_optin)
  WHERE morning_brief_optin = 'on';
```

**Vérification :**
```sql
-- Doit afficher la nouvelle table
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'push_subscriptions';

-- Doit afficher la nouvelle colonne
SELECT column_name FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'morning_brief_optin';
```

---

## 3. Configuration scheduler externe cron-job.org (~7 min)

Netlify ne propose pas de cron natif sur le free tier (Scheduled Functions = beta + payant). On utilise **cron-job.org** (gratuit, illimité, 1 cron / minute) pour hit notre endpoint chaque matin à 7h.

**Étapes :**

1. **Créer un compte gratuit sur https://cron-job.org/**
   - Email + password
   - Confirmer email

2. **Générer un token de sécurité** côté Netlify (env var) :
   - Aller dans Netlify → Site settings → Environment variables
   - Ajouter : `BRIEF_TRIGGER_TOKEN` = un random string long (ex: `9f3a8c2e7d1b4f6a8e2c5d9b3a1f4e7c8d2b5a9f3e1c6d8b2a4f7e9c1d3b5a8`)
   - Tu peux générer un token via : `openssl rand -hex 32`

3. **Créer le cron sur cron-job.org** :
   - Dashboard → "Create cronjob"
   - **Title** : `SPORTVISE — Brief matinal 7h CET`
   - **URL** : `https://sportvise.ch/.netlify/functions/send-morning-brief`
   - **Method** : `POST`
   - **Headers** (onglet Advanced) :
     - `X-Trigger-Token: <ton token random ci-dessus>`
     - `Content-Type: application/json`
   - **Schedule** :
     - Runtime: `Daily`
     - Time: `07:00` (heure suisse — cron-job.org est en UTC, donc 06:00 UTC en hiver, 05:00 UTC en été. **À ajuster manuellement aux changements d'heure** ou utiliser une expression cron qui gère ça via TZ)
     - **Recommandation** : utiliser cron expression `0 5 * * *` en été (CEST = UTC+2) et `0 6 * * *` en hiver (CET = UTC+1). À noter dans le calendrier perso pour ajuster fin octobre / fin mars.
   - **Save**

4. **Test manuel** :
   - cron-job.org propose un bouton "Execute now" pour tester immédiatement.
   - Vérifier dans Netlify Functions logs que `send-morning-brief` a été appelé avec le bon header.
   - Si retour 401 = token mismatch. Si 200 = OK même si aucun user opt-in encore.

**Alternative gratuite si cron-job.org ne convient pas :**
- **easycron.com** (free tier 1 cron / 5 min minimum)
- **uptime-kuma** auto-hébergé (mais besoin d'un VPS, complexe)
- **Netlify Scheduled Functions** (passer Pro $19/mois)

Pour MVP, cron-job.org gratuit suffit largement.

---

## 4. Vérification end-to-end (~3 min, AFTER push v63.3.0)

Une fois tout déployé + les 3 actions ci-dessus faites :

1. Sur ton compte test, ouvrir le dashboard et accepter le prompt push opt-in (modal qui apparaîtra au boot).
2. Vérifier que la subscription est bien créée : SQL Supabase
   ```sql
   SELECT user_id, endpoint, created_at FROM push_subscriptions
   WHERE user_id = (SELECT id FROM auth.users WHERE email = 'thomas.castella1@gmail.com');
   ```
3. Forcer un trigger manuel via cron-job.org "Execute now" → tu devrais recevoir une notification push même si l'app est fermée.
4. Vérifier les logs Netlify Functions `send-morning-brief` pour debug si pas de réception.

---

## ⚠️ Points d'attention

- **iOS Safari** : les push notifications ne marchent que si l'app est **installée comme PWA** (Ajouter à l'écran d'accueil). Pas de push possible depuis un onglet Safari standard sur iOS. Pour les amis testeurs, leur recommander d'ajouter SPORTVISE à l'écran d'accueil. Sur iOS 16.4+ et macOS Ventura+ uniquement.
- **Privacy/CH** : les push notifications nécessitent du consentement explicite (browser permission + notre opt-in modal). Cohérent avec nLPD CH.
- **Coût opérationnel** : 0$ pour 1k users. web-push est gratuit côté Netlify (pas de service externe payant). VAPID sécurise les pushs sans Firebase.
- **Si cron-job.org down** : on rate 1 jour de push. Pas critique. Implémenter monitoring Sentry sur la Function `send-morning-brief` (déjà fait via `_sentry.js`).
