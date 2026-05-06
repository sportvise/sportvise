# Informativa sulla privacy — SPORTVISE

**Versione 1.0 — In vigore dal [DATE_LAUNCH]**
**Ultima modifica: [DATE_LAUNCH]**

> ⚠️ BOZZA v1 — In attesa di convalida da parte di un giurista tech svizzero prima del big launch.

---

## 1. Preambolo

La presente informativa sulla privacy (di seguito «Informativa») descrive come SPORTVISE raccoglie, utilizza e protegge i Suoi dati personali nell'ambito dell'utilizzo della piattaforma accessibile all'indirizzo [https://sportvise.ch](https://sportvise.ch) (di seguito «il Servizio»).

La presente Informativa si applica a chiunque acceda al Servizio, sia titolare di un account o semplice visitatore.

Ci conformiamo alla **Legge federale svizzera sulla protezione dei dati (LPD / nLPD)** entrata in vigore il 1° settembre 2023, nonché al **Regolamento generale sulla protezione dei dati (RGPD, UE 2016/679)** per gli utenti residenti nell'Unione Europea.

## 2. Titolare del trattamento

Il titolare del trattamento dei Suoi dati personali è:

**Thomas Castella** (ditta individuale)
Gantrischweg 9
3186 Düdingen (Guin)
Cantone di Friburgo, Svizzera

**Contatto per qualsiasi domanda relativa ai Suoi dati:**
[info@sportvise.ch](mailto:info@sportvise.ch)

Tenuto conto della dimensione della struttura (impresa individuale solo), nessun responsabile della protezione dei dati (DPO) è stato formalmente designato. Tutte le richieste sono trattate direttamente dal titolare.

## 3. Dati personali raccolti

Raccogliamo le seguenti categorie di dati:

### 3.1 Dati forniti direttamente dall'utente

- **Dati dell'account**: nome, cognome, indirizzo e-mail, password (cifrata), lingua preferita
- **Dati del profilo sportivo**: sport praticato, livello, club, cantone di residenza, obiettivi sportivi
- **Diario quotidiano**: umore (1-10), energia (1-10), qualità del sonno (1-5), zone di dolore segnalate, stato fisico, note libere
- **Calendario degli eventi**: partite, competizioni, allenamenti (titolo, data, ora, luogo, durata, intensità prevista, note)
- **Riepiloghi post-evento**: nota di performance (1-10), RPE — sforzo percepito (1-10), stato fisico percepito, umore, qualità del sonno la sera prima, alimentazione pre-evento, segnalazione di dolori o infortuni, punti di forza, punti da migliorare, note libere
- **Scambi con gli agenti IA**: contenuto dei messaggi inviati e ricevuti con gli agenti virtuali (Lucas, David, Clara, Emma, Nora, Julie, Alex, Marc, Léa, Sophie, Pierre)
- **Pagamenti**: informazioni di fatturazione trattate esclusivamente da Stripe (non memorizziamo mai i numeri della Sua carta)
- **Allegati**: immagini condivise nelle conversazioni con gli agenti (se del caso)

### 3.2 Dati raccolti automaticamente

- Indirizzo IP, tipo di browser, sistema operativo (log tecnici di hosting)
- Dati di utilizzo del Servizio (pagine visitate, funzionalità utilizzate, marca temporale delle azioni)
- Identificativi di sessione (solo cookie essenziali)

### 3.3 Dati sanitari — categoria sensibile

Alcuni dati raccolti sopra rientrano nella **categoria dei dati sensibili** ai sensi dell'art. 5 cpv. 3 lett. c nLPD e dell'art. 9 RGPD:
- Stato fisico, dolori, infortuni
- Qualità del sonno
- Umore e stato emotivo
- Sforzo fisico percepito (RPE)

Questi dati sono oggetto di **misure di protezione rafforzate** dettagliate nella sezione 8.

## 4. Finalità del trattamento

I Suoi dati sono raccolti e trattati per le seguenti finalità:

1. **Fornire il servizio di coaching sportivo IA**: consentire agli agenti virtuali di personalizzare i loro consigli in base al Suo profilo, calendario, diario e riepiloghi.
2. **Autenticazione e protezione del Suo account**: connessione, gestione della password, prevenzione degli accessi non autorizzati.
3. **Gestione del Suo abbonamento**: fatturazione, incasso, gestione delle disdette (tramite Stripe).
4. **Comunicazione transazionale**: invio di e-mail di benvenuto, conferma di pagamento, promemoria relativi all'account.
5. **Miglioramento del Servizio**: analisi statistica anonimizzata degli usi per migliorare le funzionalità.
6. **Rispetto dei nostri obblighi legali**: conservazione contabile, trattamento delle richieste delle autorità se applicabile.

## 5. Basi giuridiche del trattamento (RGPD)

Per gli utenti residenti nell'Unione Europea, le basi giuridiche sono:

| Finalità | Base giuridica RGPD |
|---|---|
| Creazione dell'account, funzionamento del servizio | Esecuzione del contratto (art. 6.1.b) |
| Dati sanitari (diario, riepilogo) | Consenso esplicito (art. 9.2.a) |
| Comunicazioni transazionali | Esecuzione del contratto (art. 6.1.b) |
| Miglioramento del Servizio (statistiche anonimizzate) | Interesse legittimo (art. 6.1.f) |
| Conservazione contabile | Obbligo legale (art. 6.1.c) |

Per gli utenti residenti in Svizzera, il trattamento si basa sui principi della nLPD: finalità riconoscibile, proporzionalità, consenso informato per i dati sensibili.

## 6. Destinatari e responsabili del trattamento

Non vendiamo né noleggiamo mai i Suoi dati a terzi. Ricorriamo a responsabili del trattamento tecnici («processori») per fornire il Servizio:

| Responsabile del trattamento | Ruolo | Localizzazione dei dati |
|---|---|---|
| **Supabase Inc.** | Banca dati (PostgreSQL) | Stati Uniti (DPA disponibile) |
| **Netlify Inc.** | Hosting frontend | Stati Uniti (DPA standard) |
| **Anthropic PBC** | API Claude (agenti IA) | Stati Uniti (DPA + DPF) |
| **Resend Inc.** | Invio di e-mail transazionali | Stati Uniti (SCC) |
| **Stripe Payments Europe Ltd.** | Trattamento dei pagamenti | Irlanda (UE) + Stati Uniti |
| **Strava Inc.** | Sincronizzazione delle attività sportive (opt-in utente) | Stati Uniti (SCC) |
| **API-Sports** | Dati sportivi in tempo reale (risultati, classifiche) | Francia (UE) |

Ciascun responsabile del trattamento è legato a SPORTVISE da un contratto di responsabile del trattamento (DPA) che garantisce un livello di protezione conforme alla LPD e al RGPD.

## 7. Trasferimenti internazionali di dati

Poiché diversi nostri responsabili del trattamento sono stabiliti negli Stati Uniti, alcuni dei Suoi dati vi sono trasferiti. Questi trasferimenti sono inquadrati da:

1. **Clausole Contrattuali Tipo (SCC)** approvate dalla Commissione europea per il RGPD;
2. **Data Privacy Framework (DPF)** per i responsabili del trattamento aderenti (Anthropic, Stripe);
3. **Decisione di adeguatezza** Svizzera–Stati Uniti per gli utenti svizzeri (Swiss-US Data Privacy Framework, in vigore dal 2024).

I Suoi dati sensibili (sanitari) sono trasmessi ad Anthropic solo in forma contestuale necessaria al coaching IA. Non inviamo mai ad Anthropic più dati di quanti ne servano per rispondere al Suo messaggio.

### 7bis. Impegno di minimizzazione e di non-accesso umano ai dati sanitari

**Thomas Castella, titolare del trattamento, si impegna formalmente a non accedere mai individualmente ai dati sanitari degli utenti** (umore, energia, qualità del sonno, dolori, infortuni, RPE — sforzo percepito, stato fisico, performance, percezioni post-evento).

Questi dati sensibili sono trattati esclusivamente:
- in modo **automatizzato**, dagli agenti IA, e unicamente per personalizzare i consigli visualizzati nell'interfaccia dell'utente che li ha inseriti;
- in **sola lettura macchina**, per il calcolo di statistiche anonimizzate e aggregate sull'insieme degli utenti (per esempio: RPE mediano per sport, frequenza di infortuni per disciplina) — senza mai identificare un utente individuale.

Nessuna estrazione manuale, nessuna analisi umana, nessun export per fini di prospezione commerciale, nessuna trasmissione a terzi (al di fuori dei responsabili del trattamento tecnici elencati nella sezione 6) sono effettuati.

Questo impegno è contrattuale e opponibile. Qualsiasi violazione può essere segnalata all'Incaricato federale della protezione dei dati e della trasparenza (IFPDT) o all'autorità di controllo del Suo paese UE.

## 8. Misure di sicurezza

Implementiamo le seguenti misure per proteggere i Suoi dati:

- **Cifratura in transito**: tutte le comunicazioni con sportvise.ch utilizzano HTTPS/TLS 1.3
- **Cifratura a riposo**: la banca dati Supabase cifra i dati a livello di disco
- **Password**: hashate con bcrypt (mai memorizzate in chiaro)
- **Autenticazione**: gestione tramite Supabase Auth (standard OAuth 2.0 / JWT)
- **Controllo d'accesso**: Row-Level Security (RLS) PostgreSQL — ciascun utente può accedere solo ai propri dati
- **Backup**: backup automatici quotidiani da parte di Supabase (conservazione 7 giorni nel piano standard)
- **Log di audit**: conservazione dei log di connessione ed errori per 90 giorni
- **Limitazione d'accesso**: solo Thomas Castella (titolare) ha accesso alla produzione in lettura/scrittura

In caso di violazione di dati che possa comportare un rischio per i Suoi diritti, ci impegniamo a notificarLa entro **72 ore** dalla scoperta, conformemente all'art. 24 nLPD e all'art. 33 RGPD.

## 9. Durata di conservazione

| Categoria | Durata |
|---|---|
| Dati dell'account (profilo, e-mail) | Finché l'account è attivo + 30 giorni dopo l'eliminazione |
| Diario, calendario, riepiloghi | Finché l'account è attivo + 30 giorni dopo l'eliminazione |
| Cronologia delle conversazioni con gli agenti | Finché l'account è attivo + 30 giorni dopo l'eliminazione |
| Dati di fatturazione | 10 anni (obbligo contabile svizzero, art. 958f CO) |
| Log tecnici | 90 giorni |
| Dati anonimizzati (statistiche) | Indefinitamente (anonimi) |

Alla scadenza del termine, i dati sono eliminati in modo sicuro e irreversibile dalle banche dati di produzione. I backup includono automaticamente le eliminazioni al ciclo di rotazione successivo.

### 9bis. Eliminazione dell'account e diritto all'oblio

Può eliminare il Suo account in qualsiasi momento dal Suo dashboard (Profilo → sezione «Zona pericolosa» → «Elimina il mio account»). L'eliminazione è **definitiva e irreversibile**: nessun recupero è possibile una volta che la conferma è validata.

#### Effetto immediato

Al momento della conferma:

- Tutti i Suoi dati personali memorizzati presso SPORTVISE e presso Supabase (il nostro fornitore di banca dati) sono cancellati definitivamente dalla produzione: profilo, obiettivi, diario quotidiano, calendario, riepiloghi post-evento, conversazioni con gli agenti IA, preferiti, valutazioni, fitness score.
- Il Suo account di autenticazione è eliminato.
- Se aveva un abbonamento a pagamento attivo, è annullato automaticamente (nessun rimborso pro-rata).
- Una e-mail di conferma viene inviata al Suo indirizzo.

L'operazione è atomica lato banca dati: se una fase fallisce, l'insieme dell'eliminazione viene annullato per evitare di lasciare dati orfani.

#### Conservazione residua presso i nostri responsabili del trattamento tecnici

Per ragioni tecniche o normative, alcuni dati possono persistere temporaneamente presso i nostri responsabili del trattamento al di là dell'eliminazione effettuata da noi:

| Responsabile del trattamento | Dati interessati | Durata di conservazione residua |
|---|---|---|
| Anthropic (Claude API) | Log delle conversazioni IA passate | ~30 giorni |
| Resend | Log delle e-mail inviate | ~30 giorni |
| Netlify | Log server (IP, user-agent) | ~7 giorni |
| Supabase | Backup automatici quotidiani | 7 giorni poi cancellazione |
| Strava | Token OAuth + metadati delle attività importate | Revocabile in qualsiasi momento dal Suo dashboard; disconnessione = arresto immediato dell'importazione. Il token resta revocabile lato Strava (strava.com → Impostazioni → Le mie app) fino a che non lo rimuove. |
| Stripe | Dati di transazione (fatture) | 10 anni (obbligo contabile svizzero, art. 958f CO) |

Al di là di questi periodi, i Suoi dati sono definitivamente cancellati presso tutti i nostri responsabili del trattamento, ad eccezione delle transazioni Stripe che sono conservate per la durata legale dell'obbligo contabile.

#### Impegno del titolare del trattamento

**Thomas Castella, titolare del trattamento, non accede mai individualmente ai dati sanitari degli utenti (umore, dolori, infortuni, sonno, RPE).** Questi dati sono trattati solo dagli agenti IA in modo automatizzato per personalizzare i consigli nell'interfaccia dell'utente che li ha inseriti. Nessuna estrazione, nessuna analisi manuale, nessuna comunicazione a terzi al di fuori dei responsabili del trattamento tecnici sopra elencati è effettuata. Questo impegno è formalizzato alla sezione 7bis.

## 10. I Suoi diritti

Indipendentemente dal Suo luogo di residenza, dispone dei seguenti diritti sui Suoi dati personali:

- **Diritto di accesso**: ottenere la conferma che i Suoi dati sono trattati e ottenerne una copia
- **Diritto di rettifica**: correggere dati inesatti o incompleti
- **Diritto alla cancellazione** («diritto all'oblio»): chiedere l'eliminazione del Suo account e dei Suoi dati
- **Diritto di limitazione**: chiedere la sospensione temporanea del trattamento
- **Diritto alla portabilità**: ricevere i Suoi dati in un formato strutturato (JSON)
- **Diritto di opposizione**: opporsi a un trattamento basato sull'interesse legittimo
- **Diritto di revocare il consenso**: in qualsiasi momento, senza pregiudicare la liceità del trattamento precedente
- **Diritto di proporre reclamo**: presso l'Incaricato federale della protezione dei dati e della trasparenza (IFPDT — [edoeb.admin.ch](https://www.edoeb.admin.ch)) o presso l'autorità di controllo del Suo paese UE

### Come esercitare i Suoi diritti

Invii la Sua richiesta a [info@sportvise.ch](mailto:info@sportvise.ch) precisando l'oggetto («Richiesta RGPD/LPD») e il diritto che desidera esercitare. Rispondiamo entro un termine massimo di **30 giorni**.

Per l'eliminazione del Suo account, può anche utilizzare il pulsante «Elimina il mio account» disponibile nelle impostazioni del Suo dashboard (in fase di distribuzione).

## 11. Cookie

SPORTVISE utilizza un numero minimo di cookie, tutti **strettamente necessari al funzionamento del Servizio**:

| Cookie | Fornitore | Finalità | Durata |
|---|---|---|---|
| `sb-access-token` | Supabase | Mantenimento della sessione autenticata | Sessione |
| `sb-refresh-token` | Supabase | Rinnovo automatico del token | 7 giorni |
| `__stripe_*` | Stripe | Sicurezza pagamento (solo sulla pagina di pagamento) | 30 minuti a 1 anno secondo cookie |

Questi cookie essenziali non richiedono un banner di consenso ai sensi della LPD, del RGPD o delle direttive ePrivacy.

**SPORTVISE non utilizza cookie analitici né pubblicitari** (no Google Analytics, Facebook Pixel o equivalente).

## 12. Minori

L'utilizzo di SPORTVISE è riservato alle persone di età pari o superiore a **16 anni**. Per gli utenti di età compresa tra 16 e 17 anni, è richiesto il **consenso scritto del rappresentante legale** (genitore o tutore) e può essere domandato in qualsiasi momento.

Se veniamo a conoscenza che un utente ha meno di 16 anni, il suo account è eliminato senza indugio e tutti i suoi dati cancellati.

I genitori o tutori possono contattare [info@sportvise.ch](mailto:info@sportvise.ch) per richiedere l'eliminazione dell'account di un minore di cui hanno la custodia.

## 13. Decisioni automatizzate e profilazione

Gli agenti IA di SPORTVISE generano consigli personalizzati sulla base dei Suoi dati (profilo, diario, riepiloghi). Questi consigli **non costituiscono decisioni automatizzate che producono effetti giuridici** ai sensi dell'art. 22 RGPD.

Mantiene in qualsiasi momento:
- Il controllo totale sulle azioni da intraprendere a seguito delle raccomandazioni
- La possibilità di richiedere l'intervento umano (Thomas Castella) tramite [info@sportvise.ch](mailto:info@sportvise.ch)
- Il diritto di contestare qualsiasi raccomandazione che Le sembri inappropriata

**Importante: i consigli degli agenti IA non sostituiscono mai un parere medico, giuridico, fiscale o finanziario qualificato.** Per qualsiasi domanda relativa a questi ambiti, consulti un professionista certificato.

## 14. Modifiche dell'Informativa

Ci riserviamo il diritto di modificare la presente Informativa per riflettere evoluzioni legali, tecniche o funzionali. Qualsiasi modifica sostanziale Le sarà notificata per e-mail almeno 30 giorni prima dell'entrata in vigore. La data dell'ultima modifica è indicata in cima al presente documento.

L'utilizzo continuo del Servizio dopo la notifica vale come accettazione della nuova Informativa.

## 15. Diritto applicabile e foro competente

La presente Informativa è disciplinata dal **diritto svizzero**. Qualsiasi controversia relativa alla sua interpretazione o esecuzione sarà sottoposta alla **competenza esclusiva dei tribunali ordinari del Cantone di Friburgo**, salvo ricorso al Tribunale federale svizzero.

Gli utenti residenti nell'Unione Europea conservano il diritto di proporre reclamo presso l'autorità di controllo del loro paese di residenza.

## 16. Contatto

Per qualsiasi domanda, richiesta o reclamo relativo alla presente Informativa:

**Thomas Castella**
[info@sportvise.ch](mailto:info@sportvise.ch)
SPORTVISE — [https://sportvise.ch](https://sportvise.ch)

---

*Informativa sulla privacy v1.0 — Redatta il 29 aprile 2026 — In attesa di convalida da parte di un giurista tech svizzero prima della pubblicazione.*
