# SPORTVISE — Registre des activités de traitement (LPD art. 12)

**Responsable du traitement :** Thomas Castella (entreprise individuelle), Gantrischweg 9, Suisse
**Contact :** info@sportvise.ch
**Date de dernière mise à jour :** 06/05/2026
**Cadre légal :** nLPD (CH, en vigueur depuis 01/09/2023), art. 12 (registre obligatoire) ; RGPD (UE) art. 30 par cohérence pour les utilisateurs UE.
**Posture générale :** *data minimization*. Thomas s'engage à ne jamais accéder individuellement aux données de santé (privacy section 7bis). Aucune sous-traitance hors UE/CH/US à fournisseurs Privacy Shield / Adequacy Decision-compliant.

---

## 1. Données de compte utilisateur

| Item | Détail |
|---|---|
| **Finalité** | Création de compte, authentification, communication transactionnelle |
| **Catégories de données** | Email, mot de passe (haché par Supabase), prénom, langue préférée, plan d'abonnement |
| **Catégories de personnes** | Utilisateurs inscrits (sportifs amateurs/semi-pro CH/UE majoritairement) |
| **Base légale** | Exécution du contrat (art. 31 nLPD / art. 6.1.b RGPD) |
| **Destinataires** | Supabase (sous-traitant infra, EU region — Frankfurt) |
| **Transferts hors CH/UE** | Aucun (Supabase EU) |
| **Durée de conservation** | Tant que le compte est actif. Suppression sous 30 jours après demande user via "Supprimer mon compte" (cascade DELETE `delete_user_data()` v54) |
| **Mesures de sécurité** | RLS Supabase, JWT auth, HTTPS, mot de passe haché bcrypt |

## 2. Conversations avec agents IA (Chat)

| Item | Détail |
|---|---|
| **Finalité** | Coaching sportif personnalisé via 11 agents IA (Lucas, Emma, Clara, etc.) |
| **Catégories de données** | Messages utilisateur (texte libre, peut contenir données de santé : RPE, sommeil, blessures, état mental) ; réponses agents ; contexte injecté (TENDANCES événements, événements récents) |
| **Catégories de personnes** | Utilisateurs Free/Plus/Pro |
| **Base légale** | Consentement (art. 31 nLPD / art. 9.2.a RGPD pour données de santé) — case obligatoire à l'inscription |
| **Destinataires** | Anthropic (sous-traitant LLM, US — Privacy Shield successor / SCC) ; Supabase (stockage messages/contexte, EU) |
| **Transferts hors CH/UE** | Anthropic US — couvert par Standard Contractual Clauses + DPA Anthropic standard |
| **Durée de conservation** | Messages stockés indéfiniment dans Supabase tant que compte actif. Logs API (`api_usage_log`) : **30 jours** rolling (rétention v60). Suppression auto à la suppression de compte (cascade FK) |
| **Mesures de sécurité** | RLS Supabase (user lit seulement ses propres data), JWT auth obligatoire sur `/chat` (v60), rate limiting par plan |

## 3. Journal d'événements sportifs

| Item | Détail |
|---|---|
| **Finalité** | Suivi quotidien charge d'entraînement, sommeil, RPE, blessures, état dominant — base du Fitness Score et du contexte agents |
| **Catégories de données** | Événements (type, date, durée, intensité, RPE 1-10), notes texte libre, sommeil (heures), blessures (description, zone corporelle), état mental |
| **Catégories de personnes** | Utilisateurs inscrits |
| **Base légale** | Consentement explicite (données de santé sensibles — art. 6 nLPD / art. 9 RGPD) |
| **Destinataires** | Supabase (EU) uniquement |
| **Transferts hors CH/UE** | Aucun |
| **Durée de conservation** | Indéfinie tant que compte actif. Suppression cascade à la suppression de compte |
| **Mesures de sécurité** | RLS Supabase user_id-based, HTTPS, accès admin verrouillé |

## 4. Calendrier & objectifs

| Item | Détail |
|---|---|
| **Finalité** | Planification entraînements, matchs, objectifs SMART |
| **Catégories de données** | Événements futurs (titre, date, type, lieu optionnel), objectifs (titre, deadline, métrique) |
| **Catégories de personnes** | Utilisateurs inscrits |
| **Base légale** | Exécution du contrat |
| **Destinataires** | Supabase (EU) |
| **Transferts hors CH/UE** | Aucun |
| **Durée de conservation** | Indéfinie tant que compte actif ; suppression cascade |
| **Mesures de sécurité** | RLS Supabase, HTTPS |

## 5. Paiement & abonnement (Stripe)

| Item | Détail |
|---|---|
| **Finalité** | Gestion de l'abonnement payant Plus (CHF 12/mois) et Pro (CHF 29/mois), facturation, gestion du portail client |
| **Catégories de données** | Email facturation, ID client Stripe, statut abonnement, historique paiements (Stripe-side uniquement). **Aucune donnée bancaire stockée par SPORTVISE** — Stripe Hosted Payment Links uniquement. |
| **Catégories de personnes** | Utilisateurs Plus/Pro |
| **Base légale** | Exécution du contrat |
| **Destinataires** | Stripe Inc. (US — Privacy Shield successor / SCC) — sous-traitant paiement PCI-DSS Level 1 |
| **Transferts hors CH/UE** | Stripe US — couvert SCC + DPA Stripe standard |
| **Durée de conservation** | Données de facturation : 10 ans (obligation comptable CH — Code des obligations art. 958f). Côté SPORTVISE, seule la colonne `profiles.plan` est stockée. |
| **Mesures de sécurité** | Webhook Stripe signé HMAC-SHA256, env vars verrouillées Netlify, jamais de carte stockée |

## 6. Email transactionnel (Resend)

| Item | Détail |
|---|---|
| **Finalité** | Email de bienvenue, changement de plan, suppression de compte, notifications (rapport hebdo Pro) |
| **Catégories de données** | Email, prénom, plan, langue, contenu email (généré côté serveur) |
| **Catégories de personnes** | Utilisateurs inscrits |
| **Base légale** | Exécution du contrat (transactionnel) |
| **Destinataires** | Resend Inc. (US — SCC) — sous-traitant email |
| **Transferts hors CH/UE** | Resend US — couvert SCC + DPA Resend |
| **Durée de conservation** | Logs Resend : 30 jours (config par défaut) |
| **Mesures de sécurité** | SPF/DKIM/DMARC configurés (v58, mail-tester 10/10), API key Netlify env var |

## 7. Error reporting (Sentry)

| Item | Détail |
|---|---|
| **Finalité** | Détection et debug des erreurs front/back en production |
| **Catégories de données** | Stack traces JavaScript, URL, user agent, **user_id Supabase** (pour reproduction). Pas de PII directe (pas d'email, pas de message chat capturé). |
| **Catégories de personnes** | Utilisateurs ayant déclenché une erreur |
| **Base légale** | Intérêt légitime (sécurité et stabilité du service — art. 31 al. 2 let. b nLPD / art. 6.1.f RGPD) |
| **Destinataires** | Sentry GmbH (région DE — Frankfurt, choisi explicitement v58) |
| **Transferts hors CH/UE** | Aucun (Sentry EU/DE region) |
| **Durée de conservation** | 90 jours (config par défaut Sentry, plan free) |
| **Mesures de sécurité** | scrubbing PII Sentry activé, sample rate ajusté, env var DSN |

## 8. Synchronisation Strava (optionnelle, opt-in utilisateur)

| Item | Détail |
|---|---|
| **Finalité** | Import automatique des activités Strava dans le journal SPORTVISE |
| **Catégories de données** | OAuth token Strava (access + refresh), métadonnées activités (distance, durée, type d'activité, date, sport — fenêtre glissante 30 jours) |
| **Catégories de personnes** | Utilisateurs ayant connecté Strava (opt-in explicite) |
| **Base légale** | Consentement explicite (OAuth flow) |
| **Destinataires** | Strava Inc. (US — SCC) ; Supabase (EU) pour stockage des activités importées |
| **Transferts hors CH/UE** | Strava US — couvert SCC |
| **Durée de conservation** | Tant que la connexion Strava est active. Token révocable depuis dashboard SPORTVISE et/ou strava.com → Paramètres → Mes Apps. |
| **Mesures de sécurité** | OAuth 2.0, refresh token, déconnexion utilisateur à tout moment depuis dashboard SPORTVISE. Tokens stockés actuellement côté navigateur (localStorage) — migration Supabase prévue P1 (HANDOFF item #3). |
| **Statut** | **Live depuis v62.19** (mai 2026). UI Connexions activée, bouton OAuth Strava fonctionnel toutes langues. Bundle complet shippé v62.23 (UX fenêtre 30j + anti-hallucination + intégration prompt agents). |

## 9. Logs API (interne — v60)

| Item | Détail |
|---|---|
| **Finalité** | Rate-limiting, détection abus, monitoring coût API Anthropic |
| **Catégories de données** | user_id, timestamp, agent_id, model, input_tokens, output_tokens, latency_ms, success/error_code |
| **Catégories de personnes** | Utilisateurs ayant utilisé `/chat` |
| **Base légale** | Intérêt légitime (sécurité, prévention abus — art. 31 al. 2 let. b nLPD) |
| **Destinataires** | Supabase (EU) — table `api_usage_log` |
| **Transferts hors CH/UE** | Aucun |
| **Durée de conservation** | **30 jours rolling** (purge auto via job interne ou TTL) |
| **Mesures de sécurité** | RLS `users_can_read_own_usage`, FK ON DELETE CASCADE (suppression auto à suppression compte) |

---

## Sous-traitants (récapitulatif)

| Sous-traitant | Rôle | Pays / Région | Cadre transfert | DPA signé |
|---|---|---|---|---|
| Supabase | Auth + DB + RLS | EU (Frankfurt, DE) | N/A (EU) | DPA standard Supabase |
| Anthropic | LLM Claude API | US | SCC + DPA Anthropic | À vérifier (Console → Account → Data Processing Addendum) |
| Stripe | Paiement | US | SCC + DPA Stripe | DPA standard Stripe (auto-accepté à l'inscription) |
| Resend | Email transactionnel | US | SCC + DPA Resend | DPA Resend |
| Sentry | Error reporting | EU (Frankfurt, DE) | N/A (EU) | DPA Sentry |
| Strava | Sync activités (opt-in) | US | SCC + Strava ToS acceptés au flux OAuth | OAuth user-driven — pas de DPA bilatéral signé (relation contractuelle = Strava ToS + grant OAuth utilisateur) |
| Netlify | Hosting + Functions | US (multi-région) | SCC + DPA Netlify | DPA Netlify |

---

## Droits des personnes concernées

Conformément à la nLPD (art. 25-32) et au RGPD (art. 15-22), tout utilisateur peut :

- **Accéder à ses données** : export JSON depuis dashboard (à implémenter post-launch — actuellement sur demande à info@sportvise.ch)
- **Rectifier ses données** : édition directe depuis le profil
- **Supprimer son compte** : bouton "Supprimer mon compte" dans paramètres → cascade DELETE `delete_user_data()` v54 (LPD art. 32 / RGPD art. 17)
- **Limiter le traitement** : désactivation Strava sync, opt-out emails non-transactionnels (à implémenter)
- **Portabilité** : export JSON sur demande
- **S'opposer** : email à info@sportvise.ch
- **Réclamation** : Préposé fédéral à la protection des données et à la transparence (PFPDT, CH) — https://www.edoeb.admin.ch/

Délai de réponse : 30 jours maximum (LPD art. 25 al. 7 / RGPD art. 12.3).

---

## Mesures de sécurité organisationnelles

- Mots de passe développeur protégés (1Password)
- Console Supabase : auth 2FA activée
- Console Stripe : auth 2FA activée + spend limit configurés
- Console Anthropic : auth 2FA activée + spend limit 100 USD/mois + auto-recharge 50 USD + notification email à 50 USD
- Env vars Netlify : non-versionnées, accès restreint au compte owner
- Backup Supabase : automatique quotidien (rétention 7j sur plan free, à upgrader si critique)
- Aucun accès individuel développeur aux données utilisateur (posture *data minimization* — privacy section 7bis)

---

## Procédure en cas de violation de données (data breach)

Conformément à l'art. 24 nLPD et art. 33 RGPD :

1. **Détection** (Sentry + monitoring UptimeRobot + webhooks Supabase Auth)
2. **Évaluation du risque** sous 24h (gravité, nombre d'utilisateurs touchés, type de données exposées)
3. **Notification PFPDT** sous 72h si risque élevé pour les droits/libertés
4. **Notification utilisateurs** sous 72h si risque élevé pour eux personnellement (email Resend en masse)
5. **Documentation interne** dans ce registre (annexe "Incidents")

Aucun incident à ce jour.

---

## Annexe : Incidents & révisions

| Date | Type | Description | Action |
|---|---|---|---|
| — | — | Aucun incident depuis lancement beta | — |

**Prochaine révision prévue :** lors du big launch mi-juin 2026, puis tous les 6 mois.
