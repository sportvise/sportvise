# Politique de confidentialité — SPORTVISE

**Version 1.0 — En vigueur depuis le [DATE_LAUNCH]**
**Dernière modification : [DATE_LAUNCH]**

> ⚠️ DRAFT v1 — En attente de validation par juriste tech CH avant le big launch.

---

## 1. Préambule

La présente politique de confidentialité (ci-après « Politique ») décrit comment SPORTVISE collecte, utilise et protège vos données personnelles dans le cadre de l'utilisation de la plateforme accessible à l'adresse [https://sportvise.ch](https://sportvise.ch) (ci-après « le Service »).

Cette Politique s'applique à toute personne accédant au Service, qu'elle soit titulaire d'un compte ou simple visiteur.

Nous nous conformons à la **Loi fédérale suisse sur la protection des données (nLPD)** entrée en vigueur le 1er septembre 2023, ainsi qu'au **Règlement général sur la protection des données (RGPD, UE 2016/679)** pour les utilisateurs résidant dans l'Union européenne.

## 2. Responsable du traitement

Le responsable du traitement de vos données personnelles est :

**Thomas Castella** (raison individuelle)
Gantrischweg 9
3186 Düdingen (Guin)
Canton de Fribourg, Suisse

**Contact pour toute question relative à vos données :**
[info@sportvise.ch](mailto:info@sportvise.ch)

Compte tenu de la taille de la structure (entreprise individuelle solo), aucun délégué à la protection des données (DPO) n'a été formellement désigné. Toutes les demandes sont traitées directement par le responsable.

## 3. Données personnelles collectées

Nous collectons les catégories de données suivantes :

### 3.1 Données fournies directement par l'utilisateur

- **Données de compte** : prénom, nom, adresse e-mail, mot de passe (chiffré), langue préférée
- **Données de profil sportif** : sport pratiqué, niveau, club, canton de résidence, objectifs sportifs
- **Journal de bord quotidien** : humeur (1-10), énergie (1-10), qualité du sommeil (1-5), zones de douleur signalées, état physique, notes libres
- **Calendrier des événements** : matchs, compétitions, entraînements (titre, date, heure, lieu, durée, intensité prévue, notes)
- **Récapitulatifs post-événement** : note de performance (1-10), RPE — effort perçu (1-10), état physique ressenti, humeur, qualité du sommeil la veille, nutrition pré-événement, signalement de douleurs ou blessures, points forts, points à améliorer, notes libres
- **Échanges avec les agents IA** : contenu des messages envoyés et reçus avec les agents virtuels (Lucas, David, Clara, Emma, Nora, Julie, Alex, Marc, Léa, Sophie, Pierre)
- **Paiements** : informations de facturation traitées exclusivement par Stripe (nous ne stockons jamais vos numéros de carte)
- **Pièces jointes** : images partagées dans les conversations avec les agents (le cas échéant)

### 3.2 Données collectées automatiquement

- Adresse IP, type de navigateur, système d'exploitation (logs techniques d'hébergement)
- Données d'utilisation du Service (pages visitées, fonctionnalités utilisées, horodatage des actions)
- Identifiants de session (cookies essentiels uniquement)

### 3.3 Données de santé — catégorie sensible

Certaines données collectées ci-dessus relèvent de la **catégorie des données sensibles** au sens de l'art. 5 al. 3 let. c nLPD et de l'art. 9 RGPD :
- État physique, douleurs, blessures
- Qualité du sommeil
- Humeur et état émotionnel
- Effort physique perçu (RPE)

Ces données font l'objet de **mesures de protection renforcées** détaillées en section 8.

## 4. Finalités du traitement

Vos données sont collectées et traitées pour les finalités suivantes :

1. **Fournir le service de coaching sportif IA** : permettre aux agents virtuels de personnaliser leurs conseils en fonction de votre profil, calendrier, journal, et récapitulatifs.
2. **Authentification et sécurisation de votre compte** : connexion, gestion du mot de passe, prévention des accès non autorisés.
3. **Gestion de votre abonnement** : facturation, encaissement, gestion des résiliations (via Stripe).
4. **Communication transactionnelle** : envoi d'e-mails de bienvenue, confirmation de paiement, rappels relatifs au compte.
5. **Amélioration du Service** : analyse statistique anonymisée des usages pour améliorer les fonctionnalités.
6. **Respect de nos obligations légales** : conservation comptable, traitement des demandes des autorités si applicable.

## 5. Bases légales du traitement (RGPD)

Pour les utilisateurs résidant dans l'Union européenne, les bases légales sont :

| Finalité | Base légale RGPD |
|---|---|
| Création de compte, fonctionnement du service | Exécution du contrat (art. 6.1.b) |
| Données de santé (journal, récap) | Consentement explicite (art. 9.2.a) |
| Communications transactionnelles | Exécution du contrat (art. 6.1.b) |
| Amélioration du Service (statistiques anonymisées) | Intérêt légitime (art. 6.1.f) |
| Conservation comptable | Obligation légale (art. 6.1.c) |

Pour les utilisateurs résidant en Suisse, le traitement repose sur les principes de la nLPD : finalité reconnaissable, proportionnalité, consentement éclairé pour les données sensibles.

## 6. Destinataires et sous-traitants

Nous ne vendons ni ne louons jamais vos données à des tiers. Nous faisons appel à des sous-traitants techniques (« processeurs ») pour fournir le Service :

| Sous-traitant | Rôle | Localisation des données |
|---|---|---|
| **Supabase Inc.** | Base de données (PostgreSQL) | États-Unis (DPA disponible) |
| **Netlify Inc.** | Hébergement frontend | États-Unis (DPA standard) |
| **Anthropic PBC** | API Claude (agents IA) | États-Unis (DPA + DPF) |
| **Resend Inc.** | Envoi d'e-mails transactionnels | États-Unis (SCC) |
| **Stripe Payments Europe Ltd.** | Traitement des paiements | Irlande (UE) + États-Unis |
| **Strava Inc.** | Synchronisation des activités sportives (opt-in utilisateur) | États-Unis (SCC) |
| **API-Sports** | Données sportives temps réel (résultats, classements) | France (UE) |

Chaque sous-traitant est lié à SPORTVISE par un contrat de sous-traitance (DPA) garantissant un niveau de protection conforme à la LPD et au RGPD.

## 7. Transferts internationaux de données

Plusieurs de nos sous-traitants étant établis aux États-Unis, certaines de vos données y sont transférées. Ces transferts sont encadrés par :

1. **Clauses Contractuelles Types (SCC)** approuvées par la Commission européenne pour le RGPD ;
2. **Data Privacy Framework (DPF)** pour les sous-traitants y adhérant (Anthropic, Stripe) ;
3. **Décision d'adéquation** Suisse–États-Unis pour les utilisateurs suisses (Swiss-US Data Privacy Framework, en vigueur depuis 2024).

Vos données sensibles (santé) ne sont transmises à Anthropic que sous forme contextuelle nécessaire au coaching IA. Nous n'envoyons jamais à Anthropic davantage de données qu'il n'en faut pour répondre à votre message.

### 7bis. Engagement de minimisation et de non-accès humain aux données de santé

**Thomas Castella, responsable du traitement, s'engage formellement à ne jamais accéder individuellement aux données de santé des utilisateurs** (humeur, énergie, qualité du sommeil, douleurs, blessures, RPE — effort perçu, état physique, performance, ressentis post-événement).

Ces données sensibles ne sont traitées que :
- de manière **automatisée**, par les agents IA, et uniquement pour personnaliser les conseils affichés dans l'interface de l'utilisateur qui les a saisies ;
- en **lecture machine seule**, pour le calcul de statistiques anonymisées et agrégées sur l'ensemble des utilisateurs (par exemple : RPE médian par sport, fréquence des blessures par discipline) — sans jamais identifier un utilisateur individuel.

Aucune extraction manuelle, aucune analyse humaine, aucun export à des fins de prospection commerciale, aucune transmission à des tiers (en dehors des sous-traitants techniques listés en section 6) ne sont effectués.

Cet engagement est contractuel et opposable. Toute violation peut être signalée au Préposé fédéral à la protection des données (PFPDT) ou à l'autorité de contrôle de votre pays UE.

## 8. Mesures de sécurité

Nous mettons en œuvre les mesures suivantes pour protéger vos données :

- **Chiffrement en transit** : toutes les communications avec sportvise.ch utilisent HTTPS/TLS 1.3
- **Chiffrement au repos** : la base de données Supabase chiffre les données au niveau du disque
- **Mots de passe** : hachés avec bcrypt (jamais stockés en clair)
- **Authentification** : gestion via Supabase Auth (standards OAuth 2.0 / JWT)
- **Contrôle d'accès** : Row-Level Security (RLS) PostgreSQL — chaque utilisateur ne peut accéder qu'à ses propres données
- **Sauvegardes** : sauvegardes automatiques quotidiennes par Supabase (rétention 7 jours en plan standard)
- **Logs d'audit** : conservation des logs de connexion et d'erreurs pour 90 jours
- **Limitation d'accès** : seul Thomas Castella (responsable) a accès à la production en lecture/écriture

En cas de violation de données pouvant entraîner un risque pour vos droits, nous nous engageons à vous notifier dans les **72 heures** suivant la découverte, conformément à l'art. 24 nLPD et à l'art. 33 RGPD.

## 9. Durée de conservation

| Catégorie | Durée |
|---|---|
| Données de compte (profil, email) | Tant que le compte est actif + 30 jours après suppression |
| Journal, calendrier, récapitulatifs | Tant que le compte est actif + 30 jours après suppression |
| Historique des conversations agents | Tant que le compte est actif + 30 jours après suppression |
| Données de facturation | 10 ans (obligation comptable suisse, art. 958f CO) |
| Logs techniques | 90 jours |
| Données anonymisées (statistiques) | Indéfiniment (anonymes) |

À l'expiration du délai, les données sont supprimées de manière sécurisée et irréversible des bases de production. Les sauvegardes incluent automatiquement les suppressions au cycle de rotation suivant.

### 9bis. Suppression de compte et droit à l'oubli

Vous pouvez supprimer votre compte à tout moment depuis votre tableau de bord (Profil → section « Zone dangereuse » → « Supprimer mon compte »). La suppression est **définitive et irréversible** : aucune récupération n'est possible une fois la confirmation validée.

#### Effet immédiat

Au moment de la confirmation :

- Toutes vos données personnelles stockées chez SPORTVISE et chez Supabase (notre prestataire de base de données) sont effacées définitivement de la production : profil, objectifs, journal quotidien, calendrier, récapitulatifs post-événement, conversations avec les agents IA, favoris, ratings, scores fitness.
- Votre compte d'authentification est supprimé.
- Si vous aviez un abonnement payant actif, il est annulé automatiquement (aucun remboursement prorata).
- Un email de confirmation est envoyé à votre adresse.

L'opération est atomique côté base de données : si une étape échoue, l'ensemble de la suppression est annulée pour éviter de laisser des données orphelines.

#### Rétention résiduelle chez nos sous-traitants techniques

Pour des raisons techniques ou réglementaires, certaines données peuvent persister temporairement chez nos sous-traitants au-delà de la suppression effectuée chez nous :

| Sous-traitant | Données concernées | Durée de rétention résiduelle |
|---|---|---|
| Anthropic (Claude API) | Logs des conversations IA passées | ~30 jours |
| Resend | Logs des emails envoyés | ~30 jours |
| Netlify | Logs serveur (IP, user-agent) | ~7 jours |
| Supabase | Sauvegardes automatiques quotidiennes | 7 jours puis purge |
| Strava | Token OAuth + métadonnées d'activités importées | Révocable à tout moment depuis votre dashboard ; déconnexion = arrêt immédiat de l'import. Le token reste révocable côté Strava (strava.com → Paramètres → Mes Apps) jusqu'à ce que vous l'y retiriez. |
| Stripe | Données de transaction (factures) | 10 ans (obligation comptable suisse, art. 958f CO) |

Au-delà de ces périodes, vos données sont définitivement effacées chez tous nos sous-traitants, à l'exception des transactions Stripe qui sont conservées pour la durée légale de l'obligation comptable.

#### Engagement du responsable du traitement

**Thomas Castella, responsable du traitement, n'accède jamais individuellement aux données de santé des utilisateurs (humeur, douleurs, blessures, sommeil, RPE).** Ces données ne sont traitées que par les agents IA de manière automatisée pour personnaliser les conseils dans l'interface de l'utilisateur qui les a saisies. Aucune extraction, aucune analyse manuelle, aucune communication à des tiers en dehors des sous-traitants techniques listés ci-dessus n'est effectuée. Cet engagement est formalisé à la section 7bis.

## 10. Vos droits

Quel que soit votre lieu de résidence, vous disposez des droits suivants sur vos données personnelles :

- **Droit d'accès** : obtenir la confirmation que vos données sont traitées et en obtenir une copie
- **Droit de rectification** : corriger des données inexactes ou incomplètes
- **Droit à l'effacement** (« droit à l'oubli ») : demander la suppression de votre compte et de vos données
- **Droit à la limitation** : demander la suspension temporaire du traitement
- **Droit à la portabilité** : recevoir vos données dans un format structuré (JSON)
- **Droit d'opposition** : vous opposer à un traitement basé sur l'intérêt légitime
- **Droit de retirer votre consentement** : à tout moment, sans affecter la licéité du traitement antérieur
- **Droit d'introduire une réclamation** : auprès du Préposé fédéral à la protection des données (PFPDT — [edoeb.admin.ch](https://www.edoeb.admin.ch)) ou de l'autorité de contrôle de votre pays UE

### Comment exercer vos droits

Envoyez votre demande à [info@sportvise.ch](mailto:info@sportvise.ch) en précisant l'objet (« Demande RGPD/LPD ») et le droit que vous souhaitez exercer. Nous répondons dans un délai maximum de **30 jours**.

Pour la suppression de votre compte, vous pouvez aussi utiliser le bouton « Supprimer mon compte » disponible dans les paramètres de votre tableau de bord (en cours de déploiement).

## 11. Cookies

SPORTVISE utilise un nombre minimal de cookies, tous **strictement nécessaires au fonctionnement du Service** :

| Cookie | Fournisseur | Finalité | Durée |
|---|---|---|---|
| `sb-access-token` | Supabase | Maintien de la session authentifiée | Session |
| `sb-refresh-token` | Supabase | Renouvellement automatique du token | 7 jours |
| `__stripe_*` | Stripe | Sécurité paiement (uniquement sur la page de paiement) | 30 minutes à 1 an selon cookie |

Ces cookies essentiels n'exigent pas de bandeau de consentement sous LPD ou RGPD, conformément aux directives ePrivacy.

**SPORTVISE n'utilise pas de cookies analytiques ni publicitaires** (pas de Google Analytics, Facebook Pixel, ou équivalent).

## 12. Mineurs

L'utilisation de SPORTVISE est réservée aux personnes âgées de **16 ans et plus**. Pour les utilisateurs âgés de 16 à 17 ans, le **consentement écrit du représentant légal** (parent ou tuteur) est requis et peut être demandé à tout moment.

Si nous apprenons qu'un utilisateur est âgé de moins de 16 ans, son compte est supprimé sans délai et toutes ses données effacées.

Les parents ou tuteurs peuvent contacter [info@sportvise.ch](mailto:info@sportvise.ch) pour demander la suppression du compte d'un mineur dont ils ont la charge.

## 13. Décisions automatisées et profilage

Les agents IA de SPORTVISE génèrent des conseils personnalisés sur la base de vos données (profil, journal, récapitulatifs). Ces conseils ne constituent **pas de décisions automatisées produisant des effets juridiques** au sens de l'art. 22 RGPD.

Vous gardez à tout moment :
- Le contrôle total sur les actions à entreprendre suite aux recommandations
- La possibilité de demander l'intervention humaine (Thomas Castella) via [info@sportvise.ch](mailto:info@sportvise.ch)
- Le droit de contester toute recommandation qui vous semblerait inappropriée

**Important : les conseils des agents IA ne se substituent jamais à un avis médical, juridique, fiscal ou financier qualifié.** Pour toute question relevant de ces domaines, consultez un professionnel certifié.

## 14. Modifications de la politique

Nous nous réservons le droit de modifier cette Politique pour refléter des évolutions légales, techniques ou fonctionnelles. Toute modification substantielle vous sera notifiée par e-mail au moins 30 jours avant l'entrée en vigueur. La date de dernière modification est indiquée en haut de ce document.

L'utilisation continue du Service après notification vaut acceptation de la nouvelle Politique.

## 15. Droit applicable et juridiction

Cette Politique est régie par le **droit suisse**. Tout litige relatif à son interprétation ou à son exécution sera soumis à la compétence exclusive des **tribunaux ordinaires du canton de Fribourg**, sous réserve de recours auprès du Tribunal fédéral suisse.

Les utilisateurs résidant dans l'Union européenne conservent le droit d'introduire une réclamation auprès de l'autorité de contrôle de leur pays de résidence.

## 16. Contact

Pour toute question, demande, ou réclamation relative à cette Politique :

**Thomas Castella**
[info@sportvise.ch](mailto:info@sportvise.ch)
SPORTVISE — [https://sportvise.ch](https://sportvise.ch)

---

*Politique de confidentialité v1.0 — Rédigée le 29 avril 2026 — En attente de validation par juriste tech CH avant publication.*
