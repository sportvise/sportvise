# SPORTVISE — Setup Stripe Dashboard pour v63.5

**Cible :** créer 3 nouveaux Payment Links Stripe pour livrer Phase 1 pricing v63.5.
**Durée estimée :** 15-20 min de manipulation Dashboard Stripe.
**Pré-requis :** accès au Dashboard Stripe en mode `live` (et idéalement aussi `test` pour smoke-test avant push).

---

## Vue d'ensemble — ce qui change

| Plan | Prix avant v63.5 | Prix v63.5 | Stripe Payment Link |
|---|---|---|---|
| Plus mensuel | 12 CHF/mo | **12 CHF/mo** (inchangé) | ✓ Garde l'URL existante |
| Plus annuel | – | **120 CHF/an** | 🆕 **À CRÉER** |
| Pro mensuel | 29 CHF/mo | **19 CHF/mo** (descend) | 🆕 **À CRÉER** (le 29 → archivé) |
| Pro annuel | – | **190 CHF/an** | 🆕 **À CRÉER** |

⚠️ **Important** : Stripe ne permet PAS de modifier le prix d'un Payment Link existant. Pour Pro mensuel 29 → 19 CHF, il faut créer un NOUVEAU Payment Link et désactiver l'ancien.

---

## Étape 1 — Créer le Price Pro mensuel à 19 CHF

1. Aller sur [https://dashboard.stripe.com/products](https://dashboard.stripe.com/products)
2. Trouver le produit **"SPORTVISE Pro"** (ou le créer si inexistant)
3. Cliquer **"Add another price"** dans la section Pricing du produit
4. Configuration :
   - **Pricing model** : Standard pricing
   - **Price** : `19.00` CHF
   - **Billing period** : Monthly
   - **Currency** : CHF (Swiss Franc)
   - **Tax behavior** : `inclusive` (TVA incluse, comme l'existant)
5. Cliquer **"Add price"**
6. Noter le **Price ID** affiché (commence par `price_…`)

---

## Étape 2 — Créer le Price Plus annuel à 120 CHF

1. Sur le produit **"SPORTVISE Plus"**, cliquer **"Add another price"**
2. Configuration :
   - **Price** : `120.00` CHF
   - **Billing period** : Yearly (Annual)
   - **Currency** : CHF
   - **Tax behavior** : `inclusive`
3. Cliquer **"Add price"**
4. Noter le **Price ID**

---

## Étape 3 — Créer le Price Pro annuel à 190 CHF

1. Sur le produit **"SPORTVISE Pro"**, cliquer **"Add another price"**
2. Configuration :
   - **Price** : `190.00` CHF
   - **Billing period** : Yearly (Annual)
   - **Currency** : CHF
   - **Tax behavior** : `inclusive`
3. Cliquer **"Add price"**
4. Noter le **Price ID**

---

## Étape 4 — Créer 3 Payment Links

Pour chaque nouveau Price (Pro 19 mensuel, Plus 120 annuel, Pro 190 annuel), créer un Payment Link :

1. Aller sur [https://dashboard.stripe.com/payment-links](https://dashboard.stripe.com/payment-links)
2. Cliquer **"Create payment link"**
3. Configuration :
   - **Type** : Subscription
   - **Product** : sélectionner le bon (Plus ou Pro)
   - **Price** : sélectionner le Price ID créé à l'étape précédente
   - **Quantity** : 1, customer cannot adjust
   - **After payment** : "Don't show confirmation page" → redirect to `https://sportvise.ch/dashboard.html?upgraded=1`
   - **Collect customer information** : email (déjà collecté via Supabase auth)
   - **Apply promotion codes** : ON (utile pour coupon SOFTLAUNCH2026 si encore actif)
4. Save → noter le **Payment Link URL** (format `https://buy.stripe.com/xxxxxxxxxx`)

**Répéter pour les 3 nouveaux liens.**

---

## Étape 5 — Désactiver l'ancien Payment Link Pro 29 CHF

L'URL `https://buy.stripe.com/28E00ldbHayf99lbzW6AM01` (Pro 29 CHF/mois) ne doit plus apparaître nulle part dans le code, mais il vaut mieux la désactiver côté Stripe pour empêcher tout achat résiduel via un lien partagé.

1. Aller sur [https://dashboard.stripe.com/payment-links](https://dashboard.stripe.com/payment-links)
2. Trouver le Payment Link Pro 29 CHF
3. Cliquer le menu `⋯` → **"Deactivate"**
4. Confirmer

⚠️ **Garder le Price 29 CHF actif côté produit** — les utilisateurs Pro existants à 29 CHF gardent leur abonnement à 29 CHF jusqu'à résiliation. Stripe ne migrate pas automatiquement.

---

## Étape 6 — (Optionnel) Migrer les Pro existants à 29 → 19 CHF

Si tu as des utilisateurs Pro existants à 29 CHF/mo (probablement 0-5 personnes pre-launch), tu peux leur faire un geste commercial :

**Option A — Migration manuelle utilisateur par utilisateur**
Pour chaque user Pro existant :
1. Stripe Dashboard → Customers → trouver le user
2. Subscription active → "Update subscription" → changer le Price vers le nouveau Price 19 CHF/mo
3. Choisir "Update at period end" (le user finit son cycle actuel à 29 CHF, puis bascule à 19)

**Option B — Email annonce + rien faire**
Envoyer un email aux users Pro existants : "Tu bénéficies désormais de 19 CHF/mo au lieu de 29 CHF dès ton prochain cycle. Aucune action de ta part requise."
→ Faire la migration manuelle ou laisser le système Stripe gérer si tu as configuré une migration auto.

**Recommandé** : Option A si <10 users Pro, sinon Option B avec batch.

---

## Étape 7 — Coller les nouvelles URLs dans le code

Une fois les 3 Payment Links créés, coller leurs URLs dans `Code/src/dashboard.html` (recherche les placeholders) :

```js
// Code/src/dashboard.html, lignes ~10812 (constante STRIPE_LINKS dans renderAbonnement)
const STRIPE_LINKS = {
  plus_monthly: 'https://buy.stripe.com/00w14p3B721JetFavS6AM00',                  // ✓ Existant
  plus_annual:  'https://buy.stripe.com/PLACEHOLDER_PLUS_ANNUAL_120CHF',           // 🔴 REMPLACER
  pro_monthly:  'https://buy.stripe.com/PLACEHOLDER_PRO_MONTHLY_19CHF',            // 🔴 REMPLACER
  pro_annual:   'https://buy.stripe.com/PLACEHOLDER_PRO_ANNUAL_190CHF',            // 🔴 REMPLACER
};
```

---

## Étape 8 — Tester en mode `test` Stripe avant push prod

1. Bascule Stripe Dashboard en mode `test` (toggle top-right)
2. Refais les étapes 1-4 en mode test
3. Coller les URLs test dans le code TEMPORAIREMENT (variable `STRIPE_LINKS`)
4. Build local + tester le flow complet :
   - Login compte test → Page Abonnement
   - Toggle annuel → URL change
   - Click "Choisir Plus annuel" → arrive sur Stripe checkout test
   - Payer avec carte test `4242 4242 4242 4242`
   - Vérifier webhook reçu + `profiles.plan` mis à jour à 'plus' dans Supabase
5. Si OK, remettre les URLs `live` dans le code et push v63.5

---

## Étape 9 — Vérifier le webhook stripe-webhook.js

Le webhook actuel doit déjà gérer correctement les subscriptions annuelles (Stripe envoie le même event `customer.subscription.created` quel que soit l'interval). Mais vérifier que :

1. `webhook secret` dans Netlify env var est cohérent avec celui du Dashboard Stripe
2. Le mapping `priceId → plan` dans le webhook gère bien les 4 nouveaux Price IDs (à mettre à jour si le webhook utilise un mapping hardcodé)

⚠️ **Si le webhook utilise un mapping hardcodé `price_xxx → 'plus'`**, il faudra ajouter les 3 nouveaux Price IDs dans ce mapping.

Voir l'inspection séparée du webhook dans la session de dev.

---

## Récap — checklist finale Thomas

- [ ] Étape 1 : Price Pro 19 CHF mensuel créé (noter Price ID)
- [ ] Étape 2 : Price Plus 120 CHF annuel créé (noter Price ID)
- [ ] Étape 3 : Price Pro 190 CHF annuel créé (noter Price ID)
- [ ] Étape 4 : 3 Payment Links créés (noter URLs)
- [ ] Étape 5 : Ancien Pro 29 CHF Payment Link désactivé
- [ ] Étape 6 : Migration users existants (si applicable)
- [ ] Étape 7 : URLs collées dans `dashboard.html` (placeholders remplacés)
- [ ] Étape 8 : Test mode Stripe validé (cycle complet checkout → webhook → profiles)
- [ ] Étape 9 : Webhook validé pour les 3 nouveaux Price IDs

Une fois les 9 étapes faites, push v63.5 prod.
