# Privacy Policy — SPORTVISE

**Version 1.0 — In effect since [DATE_LAUNCH]**
**Last modified: [DATE_LAUNCH]**

> ⚠️ DRAFT v1 — Awaiting validation by a Swiss tech lawyer before the big launch.

---

## 1. Preamble

This privacy policy (hereinafter "Policy") describes how SPORTVISE collects, uses and protects your personal data in the context of the use of the platform accessible at [https://sportvise.ch](https://sportvise.ch) (hereinafter "the Service").

This Policy applies to any person accessing the Service, whether they hold an account or are a simple visitor.

We comply with the **Swiss Federal Act on Data Protection (FADP / nFADP)** which entered into force on 1 September 2023, as well as with the **General Data Protection Regulation (GDPR, EU 2016/679)** for users residing in the European Union.

## 2. Data controller

The controller of your personal data is:

**Thomas Castella** (sole proprietorship)
Gantrischweg 9
3186 Düdingen (Guin)
Canton of Fribourg, Switzerland

**Contact for any question regarding your data:**
[info@sportvise.ch](mailto:info@sportvise.ch)

Given the size of the structure (solo individual business), no Data Protection Officer (DPO) has been formally designated. All requests are handled directly by the controller.

## 3. Personal data collected

We collect the following categories of data:

### 3.1 Data provided directly by the user

- **Account data**: first name, last name, email address, password (encrypted), preferred language
- **Sport profile data**: sport practiced, level, club, canton of residence, sporting goals
- **Daily journal**: mood (1-10), energy (1-10), sleep quality (1-5), reported pain areas, physical state, free notes
- **Event calendar**: matches, competitions, training sessions (title, date, time, location, duration, planned intensity, notes)
- **Post-event recaps**: performance rating (1-10), RPE — perceived effort (1-10), physical state perceived, mood, sleep quality the night before, pre-event nutrition, reporting of pain or injuries, strong points, areas to improve, free notes
- **Exchanges with AI agents**: content of messages sent and received with the virtual agents (Lucas, David, Clara, Emma, Nora, Julie, Alex, Marc, Léa, Sophie, Pierre)
- **Payments**: billing information processed exclusively by Stripe (we never store your card numbers)
- **Attachments**: images shared in conversations with the agents (where applicable)

### 3.2 Data collected automatically

- IP address, browser type, operating system (technical hosting logs)
- Service usage data (pages visited, features used, action timestamps)
- Session identifiers (essential cookies only)

### 3.3 Health data — sensitive category

Some of the data collected above falls within the **category of sensitive data** within the meaning of art. 5 para. 3 let. c nFADP and art. 9 GDPR:
- Physical state, pain, injuries
- Sleep quality
- Mood and emotional state
- Perceived physical effort (RPE)

This data is subject to **enhanced protection measures** detailed in section 8.

## 4. Purposes of processing

Your data is collected and processed for the following purposes:

1. **Providing the AI sports coaching service**: enabling the virtual agents to personalize their advice based on your profile, calendar, journal, and recaps.
2. **Authentication and securing of your account**: login, password management, prevention of unauthorized access.
3. **Management of your subscription**: billing, collection, cancellation management (via Stripe).
4. **Transactional communication**: sending welcome emails, payment confirmations, reminders relating to the account.
5. **Improvement of the Service**: anonymized statistical analysis of usage to improve features.
6. **Compliance with our legal obligations**: accounting retention, processing of authority requests if applicable.

## 5. Legal bases for processing (GDPR)

For users residing in the European Union, the legal bases are:

| Purpose | GDPR legal basis |
|---|---|
| Account creation, operation of the service | Performance of the contract (art. 6.1.b) |
| Health data (journal, recap) | Explicit consent (art. 9.2.a) |
| Transactional communications | Performance of the contract (art. 6.1.b) |
| Improvement of the Service (anonymized statistics) | Legitimate interest (art. 6.1.f) |
| Accounting retention | Legal obligation (art. 6.1.c) |

For users residing in Switzerland, processing is based on the principles of the nFADP: recognizable purpose, proportionality, informed consent for sensitive data.

## 6. Recipients and processors

We never sell or rent your data to third parties. We use technical processors to provide the Service:

| Processor | Role | Data location |
|---|---|---|
| **Supabase Inc.** | Database (PostgreSQL) | United States (DPA available) |
| **Netlify Inc.** | Frontend hosting | United States (standard DPA) |
| **Anthropic PBC** | Claude API (AI agents) | United States (DPA + DPF) |
| **Resend Inc.** | Sending of transactional emails | United States (SCC) |
| **Stripe Payments Europe Ltd.** | Payment processing | Ireland (EU) + United States |
| **Strava Inc.** | Sports activity synchronization (user opt-in) | United States (SCC) |
| **API-Sports** | Real-time sports data (results, rankings) | France (EU) |

Each processor is bound to SPORTVISE by a data processing agreement (DPA) guaranteeing a level of protection compliant with the FADP and the GDPR.

## 7. International data transfers

Several of our processors being established in the United States, some of your data is transferred there. These transfers are governed by:

1. **Standard Contractual Clauses (SCC)** approved by the European Commission for the GDPR;
2. **Data Privacy Framework (DPF)** for participating processors (Anthropic, Stripe);
3. **Adequacy decision** Switzerland–United States for Swiss users (Swiss-US Data Privacy Framework, in force since 2024).

Your sensitive data (health) is transmitted to Anthropic only in the contextual form necessary for AI coaching. We never send Anthropic more data than is needed to respond to your message.

### 7bis. Commitment to minimization and to non-human access to health data

**Thomas Castella, controller, formally undertakes never to access individually the health data of users** (mood, energy, sleep quality, pain, injuries, RPE — perceived effort, physical state, performance, post-event perceptions).

This sensitive data is processed only:
- in an **automated manner** by the AI agents, and only to personalize the advice displayed in the interface of the user who entered it;
- in **machine-read only** form, for the calculation of anonymized and aggregated statistics over all users (for example: median RPE per sport, frequency of injuries per discipline) — without ever identifying an individual user.

No manual extraction, no human analysis, no export for commercial prospecting purposes, no transmission to third parties (outside the technical processors listed in section 6) is carried out.

This commitment is contractual and enforceable. Any violation may be reported to the Federal Data Protection and Information Commissioner (FDPIC) or to the supervisory authority of your EU country.

## 8. Security measures

We implement the following measures to protect your data:

- **Encryption in transit**: all communications with sportvise.ch use HTTPS/TLS 1.3
- **Encryption at rest**: the Supabase database encrypts data at the disk level
- **Passwords**: hashed with bcrypt (never stored in clear)
- **Authentication**: managed via Supabase Auth (OAuth 2.0 / JWT standards)
- **Access control**: Row-Level Security (RLS) PostgreSQL — each user can only access their own data
- **Backups**: daily automatic backups by Supabase (7-day retention on standard plan)
- **Audit logs**: retention of login and error logs for 90 days
- **Access limitation**: only Thomas Castella (controller) has read/write access to production

In case of a data breach likely to entail a risk for your rights, we undertake to notify you within **72 hours** of discovery, in accordance with art. 24 nFADP and art. 33 GDPR.

## 9. Retention period

| Category | Duration |
|---|---|
| Account data (profile, email) | As long as the account is active + 30 days after deletion |
| Journal, calendar, recaps | As long as the account is active + 30 days after deletion |
| Conversation history with agents | As long as the account is active + 30 days after deletion |
| Billing data | 10 years (Swiss accounting obligation, art. 958f CO) |
| Technical logs | 90 days |
| Anonymized data (statistics) | Indefinitely (anonymous) |

Upon expiry of the period, the data is deleted in a secure and irreversible manner from the production databases. Backups automatically include the deletions on the next rotation cycle.

### 9bis. Account deletion and right to be forgotten

You may delete your account at any time from your dashboard (Profile → "Danger zone" section → "Delete my account"). Deletion is **definitive and irreversible**: no recovery is possible once confirmation is validated.

#### Immediate effect

At the moment of confirmation:

- All your personal data stored at SPORTVISE and at Supabase (our database provider) is permanently erased from production: profile, goals, daily journal, calendar, post-event recaps, conversations with AI agents, favorites, ratings, fitness scores.
- Your authentication account is deleted.
- If you had an active paid subscription, it is automatically cancelled (no pro-rata refund).
- A confirmation email is sent to your address.

The operation is atomic on the database side: if a step fails, the entire deletion is rolled back to avoid leaving orphan data.

#### Residual retention with our technical processors

For technical or regulatory reasons, certain data may persist temporarily with our processors beyond the deletion carried out on our side:

| Processor | Data concerned | Residual retention period |
|---|---|---|
| Anthropic (Claude API) | Logs of past AI conversations | ~30 days |
| Resend | Logs of sent emails | ~30 days |
| Netlify | Server logs (IP, user-agent) | ~7 days |
| Supabase | Daily automatic backups | 7 days then purge |
| Strava | OAuth token + imported activity metadata | Revocable at any time from your dashboard; disconnection = immediate stop of import. The token remains Strava-side revocable (strava.com → Settings → My Apps) until you remove it there. |
| Stripe | Transaction data (invoices) | 10 years (Swiss accounting obligation, art. 958f CO) |

Beyond these periods, your data is permanently erased with all our processors, with the exception of Stripe transactions which are kept for the legal duration of the accounting obligation.

#### Controller's commitment

**Thomas Castella, controller, never accesses individually the health data of users (mood, pain, injuries, sleep, RPE).** This data is processed only by the AI agents in an automated manner to personalize the advice in the interface of the user who entered it. No extraction, no manual analysis, no transmission to third parties outside the technical processors listed above is carried out. This commitment is formalized in section 7bis.

## 10. Your rights

Whatever your place of residence, you have the following rights over your personal data:

- **Right of access**: obtain confirmation that your data is being processed and obtain a copy of it
- **Right of rectification**: correct inaccurate or incomplete data
- **Right to erasure** ("right to be forgotten"): request the deletion of your account and your data
- **Right to restriction**: request the temporary suspension of processing
- **Right to portability**: receive your data in a structured format (JSON)
- **Right to object**: object to processing based on legitimate interest
- **Right to withdraw consent**: at any time, without affecting the lawfulness of prior processing
- **Right to lodge a complaint**: with the Federal Data Protection and Information Commissioner (FDPIC — [edoeb.admin.ch](https://www.edoeb.admin.ch)) or with the supervisory authority of your EU country

### How to exercise your rights

Send your request to [info@sportvise.ch](mailto:info@sportvise.ch) specifying the subject ("GDPR/FADP request") and the right you wish to exercise. We respond within a maximum period of **30 days**.

For the deletion of your account, you may also use the "Delete my account" button available in the settings of your dashboard (currently being deployed).

## 11. Cookies

SPORTVISE uses a minimal number of cookies, all **strictly necessary for the operation of the Service**:

| Cookie | Provider | Purpose | Duration |
|---|---|---|---|
| `sb-access-token` | Supabase | Maintenance of authenticated session | Session |
| `sb-refresh-token` | Supabase | Automatic token renewal | 7 days |
| `__stripe_*` | Stripe | Payment security (only on the payment page) | 30 minutes to 1 year depending on cookie |

These essential cookies do not require a consent banner under FADP, GDPR, or ePrivacy guidelines.

**SPORTVISE does not use analytical or advertising cookies** (no Google Analytics, Facebook Pixel, or equivalent).

## 12. Minors

The use of SPORTVISE is reserved for persons aged **16 years and older**. For users aged 16 to 17, the **written consent of the legal representative** (parent or guardian) is required and may be requested at any time.

If we learn that a user is under 16 years of age, their account is deleted without delay and all their data erased.

Parents or guardians may contact [info@sportvise.ch](mailto:info@sportvise.ch) to request the deletion of the account of a minor in their charge.

## 13. Automated decisions and profiling

SPORTVISE's AI agents generate personalized advice based on your data (profile, journal, recaps). This advice **does not constitute automated decisions producing legal effects** within the meaning of art. 22 GDPR.

You retain at all times:
- Full control over the actions to be taken following the recommendations
- The possibility to request human intervention (Thomas Castella) via [info@sportvise.ch](mailto:info@sportvise.ch)
- The right to contest any recommendation that seems inappropriate to you

**Important: the advice of the AI agents never substitutes for qualified medical, legal, tax or financial advice.** For any question in these areas, consult a certified professional.

## 14. Modifications of the Policy

We reserve the right to modify this Policy to reflect legal, technical or functional changes. Any substantial modification will be notified to you by email at least 30 days before entry into force. The date of the last modification is indicated at the top of this document.

Continued use of the Service after notification constitutes acceptance of the new Policy.

## 15. Applicable law and jurisdiction

This Policy is governed by **Swiss law**. Any dispute relating to its interpretation or its execution shall be subject to the **exclusive jurisdiction of the ordinary courts of the Canton of Fribourg**, subject to appeal to the Swiss Federal Supreme Court.

Users residing in the European Union retain the right to lodge a complaint with the supervisory authority of their country of residence.

## 16. Contact

For any question, request, or complaint relating to this Policy:

**Thomas Castella**
[info@sportvise.ch](mailto:info@sportvise.ch)
SPORTVISE — [https://sportvise.ch](https://sportvise.ch)

---

*Privacy Policy v1.0 — Drafted on 29 April 2026 — Awaiting validation by a Swiss tech lawyer before publication.*
