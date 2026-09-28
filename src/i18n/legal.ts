/* ============================================================================
   Good Loop — the strings the legal framework added (v5, Path A)

   Every t() key introduced by the legal work, in Italian and Brazilian
   Portuguese, kept in one file so counsel in each market can review the
   product wording that sits AROUND the legal texts in one place (the texts
   themselves are in src/legal/legal-it.ts and legal-pt.ts; the register's
   in-product strings are in src/legal/messages.ts, keyed by Message ID).

   Merged last into each dictionary (src/i18n/index.tsx), so where a key
   already existed with an older wording this file's wording wins.

   Register: "tu" on the person's surfaces, "lei"-free professional wording
   on the workspace. Vocabulary follows Lexicon_Use / Lexicon_Notes: sessione
   never seduta, serie never percorso, contenuto never protocollo, audio never
   trattamento on any surface.
   ============================================================================ */

export const IT_LEGAL: Record<string, string> = {
  /* ---- the door ---- */
  'Choose your country': 'Scegli il tuo Paese',
  'Legal information': 'Informazioni legali',
  'Brazil': 'Brasile',
  'Italy': 'Italia',
  'Italy / European Union': 'Italia / Unione europea',
  'Where you live': 'Dove vivi',

  /* ---- first run ---- */
  'How Good Loop works': 'Come funziona Good Loop',
  'Your terms and your choices': 'I tuoi termini e le tue scelte',
  'Terms': 'Termini',
  'Notices': 'Informative',
  'Nature of the service': 'Natura del servizio',
  'Self-guided use': 'Uso autonomo',
  'Professionally guided use': 'Uso guidato da un professionista',
  'Automated features': 'Funzioni automatizzate',
  'Confidentiality and data': 'Riservatezza e dati',
  'Intellectual property': 'Proprietà intellettuale',
  'Wellbeing check-ins': 'Check-in di benessere',
  'A short weekly self-report you can see back as your own history. Never scored, never compared to anything.':
    'Una breve autovalutazione settimanale che rivedi come tua cronologia. Mai un punteggio, mai un confronto con nulla.',
  'Aggregate programme figures': 'Totali aggregati del programma',
  'Counted in totals for groups of 25 or more. Never shared individually.':
    'Conteggiato nei totali di gruppi di almeno 25 persone. Mai condiviso individualmente.',
  'Reminders on this device': 'Promemoria su questo dispositivo',
  'Reminders never contain health information.': 'I promemoria non contengono mai informazioni sulla salute.',
  'News from Good Loop': 'Novità da Good Loop',
  'Occasional product news by e-mail.': 'Novità sul prodotto via email, di tanto in tanto.',
  'Research on the methodology': 'Ricerca sulla metodologia',
  'De-identified use, only in research about how the sessions work.':
    'Uso senza dati identificativi, solo in ricerche su come funzionano le sessioni.',
  'Testimonials': 'Testimonianze',
  'An account of your experience may be published, with your name only if you say so.':
    'Un racconto della tua esperienza può essere pubblicato, con il tuo nome solo se lo dici tu.',
  'Share Self Use history with your therapist': 'Condividi con il tuo professionista la cronologia in autonomia',
  'Your linked professional may see which sessions you listened to. Revocable anytime.':
    'Il professionista collegato può vedere quali sessioni hai ascoltato. Revocabile in qualsiasi momento.',
  'What your employer will never see': 'Che cosa il tuo datore di lavoro non vedrà mai',
  'Your employer': 'Il tuo datore di lavoro',
  'name@example.com': 'nome@esempio.it',
  'Read the full notice': 'Leggi l’informativa completa',
  'One library, two ways to use it': 'Una libreria, due modi di usarla',
  'Most days you open Good Loop on your own. Where your plan includes it, a licensed professional can also work with you — and may use the same sessions in the care they provide.':
    'Quasi sempre apri Good Loop da solo. Dove il tuo piano lo prevede, anche un professionista abilitato può lavorare con te — e può usare le stesse sessioni nella cura che offre.',
  'Short audio sessions for the moment you are in — 6, 12 or 24 minutes, whenever you want them, with nobody to ask.':
    'Brevi sessioni audio per il momento in cui sei — 6, 12 o 24 minuti, quando vuoi, senza chiedere a nessuno.',
  'Included in your plan: sessions with a licensed psychologist, booked and held inside the app. They decide what is used and when.':
    'Incluso nel tuo piano: sessioni con uno psicologo abilitato, prenotate e svolte dentro l’app. Decide lui che cosa usare e quando.',
  'Built as sound': 'Costruito come suono',
  'Each session is six segments of pre-recorded audio, developed by our clinical team and designed for relaxation that works in the time you have.':
    'Ogni sessione è fatta di sei segmenti di audio preregistrato, sviluppati dal nostro team clinico e pensati per un rilassamento che funziona nel tempo che hai.',
  'Alternating audio': 'Audio alternato',
  'sound that moves between the left and right ear at a set interval': 'un suono che si sposta tra orecchio sinistro e destro a intervalli regolari',
  'Binaural audio': 'Audio binaurale',
  'calibrated frequencies, one per ear': 'frequenze calibrate, una per orecchio',
  'Structured breathing cues': 'Indicazioni di respirazione strutturata',
  'a rhythm to breathe with': 'un ritmo con cui respirare',
  'Guided imagery': 'Immaginazione guidata',
  'a scene to picture in detail': 'una scena da immaginare nel dettaglio',
  'Ambient soundscape': 'Paesaggio sonoro',
  'the ground the voice sits on': 'il terreno su cui poggia la voce',
  'Voice-guided sequence': 'Sequenza guidata dalla voce',
  'one voice, one thread': 'una voce, un filo',

  /* ---- Help now, crisis, legal page ---- */
  'Or go to the nearest emergency department. Good Loop can’t respond to emergencies.':
    'Oppure vai al pronto soccorso più vicino. Good Loop non risponde alle emergenze.',
  'Close': 'Chiudi',
  'All legal information': 'Tutte le informazioni legali',
  'Version {v}. These texts are a working draft pending review by counsel in Brazil and Italy; the Portuguese and Italian versions will be the governing ones in their markets once reviewed.':
    'Versione {v}. Questi testi sono una bozza di lavoro in attesa della revisione dei legali in Brasile e in Italia; le versioni portoghese e italiana faranno fede nei rispettivi mercati una volta riviste.',
  'Terms and privacy': 'Termini e privacy',
  'The notices form part of the Terms. The Intended Purpose Statement is the second one.':
    'Le informative fanno parte dei Termini. La Dichiarazione di destinazione d’uso è la seconda.',
  'For professionals': 'Per i professionisti',
  'Who to contact': 'A chi rivolgersi',
  'Controller: [full corporate name], [registered address]. Data protection officer: [email]. Brazil — encarregado pela proteção de dados: [name], [email]. Support and complaints: [email].':
    'Titolare: [denominazione sociale completa], [sede legale]. Responsabile della protezione dei dati: [email]. Brasile — encarregado pela proteção de dados: [nome], [email]. Assistenza e reclami: [email].',
  'Supervisory authority': 'Autorità di controllo',
  'Professional council': 'Ordine professionale',
  'Consumer routes': 'Tutela del consumatore',
  'Previous versions': 'Versioni precedenti',
  'No earlier version. Each version is listed here with the dates it was in force.':
    'Nessuna versione precedente. Ogni versione compare qui con le date in cui è stata in vigore.',
  'in force': 'in vigore',
  'Version {v}': 'Versione {v}',
  'Open on the legal information page': 'Apri nella pagina delle informazioni legali',
  'Language': 'Lingua',
  'Learn more': 'Scopri di più',
  'OK': 'OK',

  /* ---- the situational names that replaced condition-shaped ones ---- */
  'Too Much To Do': 'Troppe cose da fare',
  'Facing a Challenge': 'Davanti a una sfida',

  /* ---- player ---- */
  'How settled do you feel? — optional.': 'Quanto ti senti disteso? — facoltativo.',
  'Part {n} of {total}': 'Parte {n} di {total}',

  /* ---- profile ---- */
  'Personal email': 'Email personale',
  'sign-in address': 'indirizzo di accesso',
  'locked': 'bloccato',
  'Save changes': 'Salva le modifiche',
  'Saving…': 'Salvataggio…',
  'Saved.': 'Salvato.',
  'Could not save just now. Try again in a moment.': 'Impossibile salvare adesso. Riprova tra un momento.',
  'Reminders for sessions your therapist selected': 'Promemoria per le sessioni scelte dal tuo professionista',
  'Your choices': 'Le tue scelte',
  'What we hold on the contract': 'Ciò che conserviamo per il contratto',
  'Your account, the sessions you play and your own notes are needed to provide the service; they are not a consent and cannot be switched off without closing the account.':
    'Il tuo account, le sessioni che ascolti e le tue note servono a fornire il servizio: non sono un consenso e non si possono disattivare senza chiudere l’account.',
  'Everything we hold about you, in a machine-readable copy with a note on each category. A request is logged and answered within fifteen days, in every country.':
    'Tutto ciò che conserviamo su di te, in una copia leggibile da una macchina con una nota per ogni categoria. La richiesta viene registrata e ha risposta entro quindici giorni, in ogni Paese.',
  'Your copy is downloading. The request has been logged with the date it was received.':
    'La tua copia si sta scaricando. La richiesta è stata registrata con la data di ricezione.',
  'Your acceptances': 'Le tue accettazioni',
  'none recorded on this account yet': 'nessuna registrata su questo account',
  'Privacy Notice': 'Informativa sulla privacy',
  'Close account': 'Chiudi l’account',
  'Close your account?': 'Chiudere il tuo account?',
  'Download': 'Scarica',
  'What we keep, and why': 'Che cosa conserviamo, e perché',
  'Report a problem': 'Segnala un problema',
  'A complaint': 'Un reclamo',
  'Content that should not be here': 'Un contenuto che non dovrebbe esserci',
  'What is this about?': 'Di che cosa si tratta?',
  'What is it about?': 'Di che cosa si tratta?',
  'Where is it? (a session name, a screen)': 'Dove si trova? (il nome di una sessione, una schermata)',
  'Tell us what happened': 'Raccontaci che cosa è successo',
  'Could not send just now. Try again in a moment.': 'Impossibile inviare adesso. Riprova tra un momento.',
  'Sending…': 'Invio…',
  'Send': 'Invia',
  'Thank you': 'Grazie',
  'We assess every report. Where it is well founded we remove or restrict the content and tell you what we did.':
    'Valutiamo ogni segnalazione. Se è fondata rimuoviamo o limitiamo il contenuto e ti diciamo che cosa abbiamo fatto.',
  'We will confirm within two working days and reply within ten, telling you what we found and what we propose to do.':
    'Confermeremo la ricezione entro due giorni lavorativi e risponderemo entro dieci, dicendoti che cosa abbiamo accertato e che cosa proponiamo.',
  'Done': 'Fatto',
  'Your series': 'La tua serie',
  'A series is a few weeks of sessions that follow on from each other. No pressure: go at your own speed.':
    'Una serie sono alcune settimane di sessioni che si seguono l’una con l’altra. Nessuna fretta: vai al tuo ritmo.',
  'A weekly check-in lives in the Progress tab. Less than a minute, and completely optional.':
    'Il check-in settimanale è nella scheda Progressi. Meno di un minuto, e del tutto facoltativo.',
  'Where your plan includes it, a licensed professional can work with you in a video session and may select sessions for you to listen to on your own. They decide what is used and when; Good Loop provides the content and the tools.':
    'Dove il tuo piano lo prevede, un professionista abilitato può lavorare con te in una sessione video e può scegliere sessioni da ascoltare da solo. Decide lui che cosa usare e quando; Good Loop fornisce i contenuti e gli strumenti.',
  'In an emergency, Help now is always in the menu:': 'In un’emergenza, Aiuto subito è sempre nel menu:',
  'Legal texts': 'Testi legali',
  'Good Loop combines guided voice, stereo sound design and structured audio segments into short relaxation sessions you can fit into a working day.':
    'Good Loop unisce voce guidata, sound design stereo e segmenti audio strutturati in brevi sessioni di rilassamento che stanno in una giornata di lavoro.',
  'Terms and Conditions': 'Termini e condizioni',
  'All notices and previous versions': 'Tutte le informative e le versioni precedenti',
  'The Good Loop platform, its content and the GL Methodology are protected by copyright and other intellectual property rights.':
    'La piattaforma Good Loop, i suoi contenuti e la Metodologia GL sono protetti dal diritto d’autore e da altri diritti di proprietà intellettuale.',
  'Good Loop is a wellbeing service. It is not treatment and does not replace professional mental health support. If you need specialised help, talk to your doctor or your company’s support service.':
    'Good Loop è un servizio di benessere. Non è un trattamento e non sostituisce il supporto professionale per la salute mentale. Se ti serve un aiuto specialistico, parla con il tuo medico o con il servizio di supporto della tua azienda.',
  'Good Loop can’t respond to emergencies. Good Loop is a wellbeing service and does not replace professional care.':
    'Good Loop non risponde alle emergenze. Good Loop è un servizio di benessere e non sostituisce le cure di un professionista.',
  'Emergency and support lines': 'Linee di emergenza e di ascolto',

  /* ---- therapist tab, video ---- */
  'Nothing selected yet.': 'Ancora nulla di scelto.',
  'Read and accept the consent form': 'Leggi e accetta il modulo di consenso',
  'Consent form': 'Modulo di consenso',
  'Consent form — {name}': 'Modulo di consenso — {name}',
  'I have read this form and I accept it. It is an agreement between me and {name}.':
    'Ho letto questo modulo e lo accetto. È un accordo tra me e {name}.',
  'Accept': 'Accetta',
  'Goals': 'Obiettivi',
  'pending': 'in attesa',
  'Location confirmed': 'Posizione confermata',
  'Where you are now (address or place)': 'Dove sei adesso (indirizzo o luogo)',
  'Where you are now': 'Dove sei adesso',
  'Confirm': 'Conferma',
  'Not recorded': 'Non registrata',

  /* ---- workspace ---- */
  'Selected content': 'Contenuti scelti',
  'Content': 'Contenuto',
  'Nothing selected.': 'Nulla di scelto.',
  'Selected on': 'Scelto il',
  'Listened': 'Ascolti',
  'Select content': 'Scegli un contenuto',
  'Select content for {name}': 'Scegli un contenuto per {name}',
  'Select': 'Scegli',
  'Choose…': 'Scegli…',
  'published self-guided content, grouped by family': 'contenuti a uso autonomo pubblicati, per famiglia',
  'Nothing to select yet': 'Ancora nulla da scegliere',
  'No self-guided content is published and enabled right now, so there is nothing to select for listening between sessions.':
    'Al momento nessun contenuto a uso autonomo è pubblicato e attivo, quindi non c’è nulla da scegliere per l’ascolto tra una sessione e l’altra.',
  'Patient will see:': 'La persona vedrà:',
  'you': 'te',
  'This content has no rendered audio yet. The patient will hear the placeholder bed until a mixdown is published.':
    'Questo contenuto non ha ancora un audio renderizzato. La persona sentirà la base provvisoria finché non viene pubblicato un mixdown.',
  'Therapist only · encrypted in transit and at rest': 'Solo per te · cifrato in transito e a riposo',
  'Numbers only — never a diagnostic label, never a change the platform computed.':
    'Solo i numeri — mai un’etichetta diagnostica, mai una variazione calcolata dalla piattaforma.',
  'Which instrument, and when, is your decision. Good Loop proposes nothing.':
    'Quale strumento, e quando, lo decidi tu. Good Loop non propone nulla.',
  'Content between sessions': 'Contenuti tra una sessione e l’altra',
  'Current: {code} — {done} of {total} done.': 'Attuale: {code} — {done} di {total} ascolti.',
  'Nothing this time': 'Niente per ora',
  'Questionnaire': 'Questionario',
  'Send one if you decide it is useful. Which, and when, is yours to choose.':
    'Invialo se decidi che è utile. Quale, e quando, lo scegli tu.',
  'Send a questionnaire': 'Invia un questionario',
  'Not now': 'Non ora',
  'When you and {name} decide. Open the calendar to pick a time.': 'Quando lo decidete tu e {name}. Apri il calendario per scegliere un orario.',
  'Open the calendar': 'Apri il calendario',
  'Good Loop audio': 'Audio Good Loop',
  'VAS post': 'VAS post',
  'VAS you recorded · pre → post': 'VAS che hai registrato · pre → post',
  'Play Good Loop audio': 'Riproduci un audio Good Loop',
  'Choose content to play during this call.': 'Scegli un contenuto da riprodurre durante questa chiamata.',
  'Choose content': 'Scegli un contenuto',
  'No content is published and enabled yet.': 'Nessun contenuto è ancora pubblicato e attivo.',
  'Choose content first.': 'Scegli prima un contenuto.',
  'This content has no published time signature yet.': 'Questo contenuto non ha ancora una durata pubblicata.',
  'Everything published is available inside a live session. Items marked clinical-only cannot be selected for listening between sessions.':
    'Tutto ciò che è pubblicato è disponibile in una sessione dal vivo. I contenuti segnati come solo clinici non possono essere scelti per l’ascolto tra una sessione e l’altra.',
  'Stereo output detected': 'Uscita stereo rilevata',
  'Mono or no output — audio blocked': 'Mono o nessuna uscita — audio bloccato',
  'Consent on record': 'Consenso registrato',
  'Missing — audio blocked': 'Mancante — audio bloccato',
  'Start audio': 'Avvia l’audio',
  'Audio completed': 'Audio completato',
  'Notes during the audio': 'Note durante l’audio',
  'The panel returned to Notes for the debrief. Everything from the audio is included in the session report.':
    'Il pannello è tornato alle Note per il confronto finale. Tutto ciò che riguarda l’audio è nel report della sessione.',
  'Resume audio': 'Riprendi l’audio',
  'Intervene': 'Intervieni',
  'End the audio now?': 'Terminare l’audio adesso?',
  'End audio': 'Termina l’audio',
  'Notes auto-save and are stored encrypted, under your account only. The VAS is recorded from the patient’s spoken answer — the patient never sees a VAS control.':
    'Le note si salvano da sole e sono conservate cifrate, solo sotto il tuo account. La VAS si registra dalla risposta a voce della persona — la persona non vede mai un controllo VAS.',
  'from': 'da',
  'to': 'a',
  'this session': 'questa sessione',
  'week': 'settimana',
  'Frequency': 'Frequenza',
  'Freq.': 'Freq.',
  'Period': 'Periodo',
  'Patient': 'Persona',
  'Status': 'Stato',
  'Date': 'Data',
  'Type': 'Tipo',
  'Dur.': 'Durata',
  'Notes': 'Note',
  'Report': 'Report',
  'Yes': 'Sì',
  'No': 'No',
  'Registration': 'Iscrizione',
  'read-only': 'sola lettura',
  'Verified {date} · next check by {due}': 'Verificata il {date} · prossimo controllo entro il {due}',
  'Verification pending': 'Verifica in attesa',
  'insurance to {date}': 'assicurazione fino al {date}',
  'Informed consent form': 'Modulo di consenso informato',
  'Your form, in your words. Every person accepts it before their first session with you, and a copy of what they accepted is kept. It cannot be published until all eight items are written (P3.2).':
    'Il tuo modulo, con le tue parole. Ogni persona lo accetta prima della prima sessione con te, e una copia di ciò che ha accettato viene conservata. Non può essere pubblicato finché tutti gli otto punti non sono scritti (P3.2).',
  'Published version {v} · {date}': 'Versione pubblicata {v} · {date}',
  'Publishing…': 'Pubblicazione…',
  'Publish new version': 'Pubblica una nuova versione',
  'Publish': 'Pubblica',
  'All eight items are required.': 'Tutti gli otto punti sono obbligatori.',
  'Published.': 'Pubblicato.',
  'Could not publish just now.': 'Impossibile pubblicare adesso.',
  'Request logged': 'Richiesta registrata',
  'Try again': 'Riprova',
  'Request account closure': 'Richiedi la chiusura dell’account',
  'Closing a professional account is a request we log and confirm within two working days, so that anyone you are working with gets an orderly handover first (Professional Terms P3.5).':
    'La chiusura di un account professionale è una richiesta che registriamo e confermiamo entro due giorni lavorativi, così che le persone con cui lavori abbiano prima un passaggio ordinato (Termini per i professionisti, P3.5).',
  'Encryption in transit and at rest, access limited to your own account, and every access logged — built so you can meet your own duty of confidentiality. Good Loop holds no certification or clearance for this and claims none: the duty is yours, and these are the tools for it.':
    'Cifratura in transito e a riposo, accesso limitato al tuo account e ogni accesso registrato — costruiti perché tu possa adempiere al tuo dovere di riservatezza. Good Loop non ha per questo alcuna certificazione o autorizzazione e non ne rivendica: il dovere è tuo, e questi sono gli strumenti per assolverlo.',
  'Two-factor sign-in for professional accounts is enabled by the Good Loop team in the authentication service; ask support if it is not yet active on yours.':
    'L’accesso a due fattori per gli account professionali viene attivato dal team Good Loop nel servizio di autenticazione; chiedi all’assistenza se sul tuo non è ancora attivo.',
  'Professional body': 'Ordine professionale',
  'CRP — Conselho Regional de Psicologia (Brazil)': 'CRP — Conselho Regional de Psicologia (Brasile)',
  'Ordine degli Psicologi (Italy)': 'Ordine degli Psicologi (Italia)',
  'CRP registration number': 'Numero di iscrizione CRP',
  'Albo registration number': 'Numero di iscrizione all’Albo',
  'CRP region': 'Regione CRP',
  'Ordine region': 'Ordine regionale',
  'Where you practise from': 'Da dove eserciti',
  'the territory your registration authorises (D-12)': 'il territorio che la tua iscrizione autorizza (D-12)',
  'Professional indemnity insurance': 'Assicurazione di responsabilità professionale',
  'expiry date and policy reference': 'data di scadenza e riferimento della polizza',
  'insurer · policy number': 'assicuratore · numero di polizza',
  'I confirm that I am registered and authorised to practise in the territory above, that I practise from it, and that no disciplinary proceedings are outstanding against me (P2.1, P2.3).':
    'Confermo di essere iscritto e autorizzato a esercitare nel territorio indicato, di esercitare da lì, e che nessun procedimento disciplinare è pendente a mio carico (P2.1, P2.3).',
  'Professional Terms': 'Termini per i professionisti',
  'I,': 'Io,',
  'accept the Professional Terms.': 'accetto i Termini per i professionisti.',
  'I have read and accept the Professional Terms': 'Ho letto e accetto i Termini per i professionisti',
  'Sign and continue': 'Firma e continua',
  'Try choosing content and playing it, with a virtual patient': 'Prova a scegliere un contenuto e a riprodurlo, con una persona virtuale',
  'Save to notes': 'Salva nelle note',
  'Action record': 'Registro dell’azione',
  'What you observed, what you did, who was contacted…': 'Che cosa hai osservato, che cosa hai fatto, chi è stato contattato…',
  'Emergency numbers': 'Numeri di emergenza',
  'Stay on the call. Do not leave the person alone on the line.': 'Resta in chiamata. Non lasciare la persona da sola in linea.',
  'Confirm where they are right now — the address they gave in the lobby, or ask again.':
    'Conferma dove si trova adesso — l’indirizzo dato all’ingresso, oppure chiedilo di nuovo.',
  'If there is a serious and imminent risk, call the emergency services for their location and stay connected until help arrives.':
    'Se c’è un rischio grave e imminente, chiama i servizi di emergenza per il luogo in cui si trova e resta collegato finché non arrivano i soccorsi.',
  'Involve a trusted person nearby where the person agrees, or where their safety requires it.':
    'Coinvolgi una persona di fiducia vicina, se la persona è d’accordo o se la sua sicurezza lo richiede.',
  'Record what you observed and what you did, below. It goes into your session notes with the time.':
    'Annota qui sotto che cosa hai osservato e che cosa hai fatto. Va nelle note della sessione con l’orario.',

  /* ---- sponsor console ---- */
  'Before you begin': 'Prima di iniziare',
  'I understand, on behalf of {company}.': 'Ho capito, per conto di {company}.',
  'Continue': 'Continua',
  'Not enough data': 'Dati insufficienti',
  'Individual employee data is never visible in this dashboard — not use, not attendance, not what anyone listened to.':
    'I dati dei singoli dipendenti non sono mai visibili in questo pannello — né l’uso, né la presenza, né che cosa qualcuno ha ascoltato.',
  'Every figure is a programme total; any figure derived from fewer than 25 people is hidden, not rounded.':
    'Ogni numero è un totale del programma; qualsiasi dato derivato da meno di 25 persone viene nascosto, non arrotondato.',
  'No breakdown by category or theme is ever shown, and nothing about sessions with a professional — not even a count.':
    'Non viene mai mostrata alcuna suddivisione per categoria o tema, e nulla sulle sessioni con un professionista — nemmeno un conteggio.',
  'Employees choose whether to be counted in aggregate figures, with no consequence either way.':
    'I dipendenti scelgono se essere conteggiati nei totali aggregati, senza alcuna conseguenza in un senso o nell’altro.',
  'What your people’s employer never sees': 'Che cosa il datore di lavoro non vede mai',
  'Good Loop and your obligations as an employer': 'Good Loop e i tuoi obblighi come datore di lavoro',
}

export const PT_LEGAL: Record<string, string> = {
  /* ---- the door ---- */
  'Choose your country': 'Escolha o seu país',
  'Legal information': 'Informações legais',
  'Brazil': 'Brasil',
  'Italy': 'Itália',
  'Italy / European Union': 'Itália / União Europeia',
  'Where you live': 'Onde você mora',

  /* ---- first run ---- */
  'How Good Loop works': 'Como o Good Loop funciona',
  'Your terms and your choices': 'Os seus termos e as suas escolhas',
  'Terms': 'Termos',
  'Notices': 'Avisos',
  'Nature of the service': 'Natureza do serviço',
  'Self-guided use': 'Uso por conta própria',
  'Professionally guided use': 'Uso guiado por profissional',
  'Automated features': 'Recursos automatizados',
  'Confidentiality and data': 'Confidencialidade e dados',
  'Intellectual property': 'Propriedade intelectual',
  'Wellbeing check-ins': 'Check-ins de bem-estar',
  'A short weekly self-report you can see back as your own history. Never scored, never compared to anything.':
    'Um breve autorrelato semanal que você revê como o seu próprio histórico. Nunca pontuado, nunca comparado a nada.',
  'Aggregate programme figures': 'Totais agregados do programa',
  'Counted in totals for groups of 25 or more. Never shared individually.':
    'Contado em totais de grupos de 25 pessoas ou mais. Nunca compartilhado individualmente.',
  'Reminders on this device': 'Lembretes neste aparelho',
  'Reminders never contain health information.': 'Os lembretes nunca contêm informações de saúde.',
  'News from Good Loop': 'Novidades do Good Loop',
  'Occasional product news by e-mail.': 'Novidades sobre o produto por e-mail, de vez em quando.',
  'Research on the methodology': 'Pesquisa sobre a metodologia',
  'De-identified use, only in research about how the sessions work.':
    'Uso sem dados identificáveis, apenas em pesquisas sobre como as sessões funcionam.',
  'Testimonials': 'Depoimentos',
  'An account of your experience may be published, with your name only if you say so.':
    'Um relato da sua experiência pode ser publicado, com o seu nome só se você quiser.',
  'Share Self Use history with your therapist': 'Compartilhar com o seu profissional o histórico de uso por conta própria',
  'Your linked professional may see which sessions you listened to. Revocable anytime.':
    'O profissional vinculado pode ver quais sessões você ouviu. Revogável a qualquer momento.',
  'What your employer will never see': 'O que o seu empregador nunca verá',
  'Your employer': 'O seu empregador',
  'name@example.com': 'nome@exemplo.com.br',
  'Read the full notice': 'Ler o aviso completo',
  'One library, two ways to use it': 'Uma biblioteca, duas formas de usar',
  'Most days you open Good Loop on your own. Where your plan includes it, a licensed professional can also work with you — and may use the same sessions in the care they provide.':
    'Na maioria dos dias você abre o Good Loop por conta própria. Onde o seu plano incluir, um profissional habilitado também pode trabalhar com você — e pode usar as mesmas sessões no cuidado que presta.',
  'Short audio sessions for the moment you are in — 6, 12 or 24 minutes, whenever you want them, with nobody to ask.':
    'Sessões de áudio curtas para o momento em que você está — 6, 12 ou 24 minutos, quando quiser, sem precisar pedir a ninguém.',
  'Included in your plan: sessions with a licensed psychologist, booked and held inside the app. They decide what is used and when.':
    'Incluído no seu plano: sessões com um psicólogo habilitado, agendadas e realizadas dentro do aplicativo. É ele quem decide o que é usado e quando.',
  'Built as sound': 'Feito de som',
  'Each session is six segments of pre-recorded audio, developed by our clinical team and designed for relaxation that works in the time you have.':
    'Cada sessão são seis segmentos de áudio pré-gravado, desenvolvidos pela nossa equipe clínica e pensados para um relaxamento que funciona no tempo que você tem.',
  'Alternating audio': 'Áudio alternado',
  'sound that moves between the left and right ear at a set interval': 'um som que se move entre o ouvido esquerdo e o direito em intervalos regulares',
  'Binaural audio': 'Áudio binaural',
  'calibrated frequencies, one per ear': 'frequências calibradas, uma por ouvido',
  'Structured breathing cues': 'Orientações de respiração estruturada',
  'a rhythm to breathe with': 'um ritmo para respirar junto',
  'Guided imagery': 'Imagética guiada',
  'a scene to picture in detail': 'uma cena para imaginar em detalhe',
  'Ambient soundscape': 'Paisagem sonora',
  'the ground the voice sits on': 'o chão sobre o qual a voz se apoia',
  'Voice-guided sequence': 'Sequência guiada por voz',
  'one voice, one thread': 'uma voz, um fio',

  /* ---- Help now, crisis, legal page ---- */
  'Or go to the nearest emergency department. Good Loop can’t respond to emergencies.':
    'Ou vá ao pronto-socorro mais próximo. O Good Loop não atende emergências.',
  'Close': 'Fechar',
  'All legal information': 'Todas as informações legais',
  'Version {v}. These texts are a working draft pending review by counsel in Brazil and Italy; the Portuguese and Italian versions will be the governing ones in their markets once reviewed.':
    'Versão {v}. Estes textos são uma minuta de trabalho pendente de revisão por advogados no Brasil e na Itália; as versões em português e em italiano serão as que regem nos seus mercados depois de revisadas.',
  'Terms and privacy': 'Termos e privacidade',
  'The notices form part of the Terms. The Intended Purpose Statement is the second one.':
    'Os avisos fazem parte dos Termos. A Declaração de finalidade de uso é o segundo.',
  'For professionals': 'Para profissionais',
  'Who to contact': 'Quem contatar',
  'Controller: [full corporate name], [registered address]. Data protection officer: [email]. Brazil — encarregado pela proteção de dados: [name], [email]. Support and complaints: [email].':
    'Controlador: [razão social completa], [sede]. Encarregado pela proteção de dados: [nome], [email]. União Europeia — responsável pela proteção de dados: [email]. Suporte e reclamações: [email].',
  'Supervisory authority': 'Autoridade de controle',
  'Professional council': 'Conselho profissional',
  'Consumer routes': 'Defesa do consumidor',
  'Previous versions': 'Versões anteriores',
  'No earlier version. Each version is listed here with the dates it was in force.':
    'Nenhuma versão anterior. Cada versão aparece aqui com as datas em que esteve em vigor.',
  'in force': 'em vigor',
  'Version {v}': 'Versão {v}',
  'Open on the legal information page': 'Abrir na página de informações legais',
  'Language': 'Idioma',
  'Learn more': 'Saiba mais',
  'OK': 'OK',

  /* ---- the situational names that replaced condition-shaped ones ---- */
  'Too Much To Do': 'Coisa demais para fazer',
  'Facing a Challenge': 'Diante de um desafio',

  /* ---- player ---- */
  'How settled do you feel? — optional.': 'Quão tranquilo você se sente? — opcional.',
  'Part {n} of {total}': 'Parte {n} de {total}',

  /* ---- profile ---- */
  'Personal email': 'E-mail pessoal',
  'sign-in address': 'endereço de acesso',
  'locked': 'bloqueado',
  'Save changes': 'Salvar alterações',
  'Saving…': 'Salvando…',
  'Saved.': 'Salvo.',
  'Could not save just now. Try again in a moment.': 'Não foi possível salvar agora. Tente de novo em instantes.',
  'Reminders for sessions your therapist selected': 'Lembretes das sessões escolhidas pelo seu profissional',
  'Your choices': 'As suas escolhas',
  'What we hold on the contract': 'O que mantemos pelo contrato',
  'Your account, the sessions you play and your own notes are needed to provide the service; they are not a consent and cannot be switched off without closing the account.':
    'A sua conta, as sessões que você ouve e as suas anotações são necessárias para prestar o serviço: não são um consentimento e não podem ser desligadas sem encerrar a conta.',
  'Everything we hold about you, in a machine-readable copy with a note on each category. A request is logged and answered within fifteen days, in every country.':
    'Tudo o que mantemos sobre você, em uma cópia legível por máquina com uma nota em cada categoria. A solicitação é registrada e respondida em até quinze dias, em todo país.',
  'Your copy is downloading. The request has been logged with the date it was received.':
    'A sua cópia está sendo baixada. A solicitação foi registrada com a data de recebimento.',
  'Your acceptances': 'As suas aceitações',
  'none recorded on this account yet': 'nenhuma registrada nesta conta ainda',
  'Privacy Notice': 'Aviso de Privacidade',
  'Close account': 'Encerrar conta',
  'Close your account?': 'Encerrar a sua conta?',
  'Download': 'Baixar',
  'What we keep, and why': 'O que mantemos, e por quê',
  'Report a problem': 'Relatar um problema',
  'A complaint': 'Uma reclamação',
  'Content that should not be here': 'Um conteúdo que não deveria estar aqui',
  'What is this about?': 'Sobre o que é?',
  'What is it about?': 'Sobre o que é?',
  'Where is it? (a session name, a screen)': 'Onde está? (o nome de uma sessão, uma tela)',
  'Tell us what happened': 'Conte o que aconteceu',
  'Could not send just now. Try again in a moment.': 'Não foi possível enviar agora. Tente de novo em instantes.',
  'Sending…': 'Enviando…',
  'Send': 'Enviar',
  'Thank you': 'Obrigado',
  'We assess every report. Where it is well founded we remove or restrict the content and tell you what we did.':
    'Avaliamos toda denúncia. Quando é fundamentada, removemos ou restringimos o conteúdo e contamos o que fizemos.',
  'We will confirm within two working days and reply within ten, telling you what we found and what we propose to do.':
    'Confirmaremos o recebimento em até dois dias úteis e responderemos em até dez, dizendo o que apuramos e o que propomos fazer.',
  'Done': 'Concluído',
  'Your series': 'A sua série',
  'A series is a few weeks of sessions that follow on from each other. No pressure: go at your own speed.':
    'Uma série são algumas semanas de sessões que se seguem umas às outras. Sem pressa: vá no seu ritmo.',
  'A weekly check-in lives in the Progress tab. Less than a minute, and completely optional.':
    'O check-in semanal fica na aba Progresso. Menos de um minuto, e totalmente opcional.',
  'Where your plan includes it, a licensed professional can work with you in a video session and may select sessions for you to listen to on your own. They decide what is used and when; Good Loop provides the content and the tools.':
    'Onde o seu plano incluir, um profissional habilitado pode trabalhar com você em uma sessão por vídeo e pode escolher sessões para você ouvir por conta própria. É ele quem decide o que é usado e quando; o Good Loop fornece o conteúdo e as ferramentas.',
  'In an emergency, Help now is always in the menu:': 'Em uma emergência, o Ajuda agora está sempre no menu:',
  'Legal texts': 'Textos legais',
  'Good Loop combines guided voice, stereo sound design and structured audio segments into short relaxation sessions you can fit into a working day.':
    'O Good Loop combina voz guiada, design de som estéreo e segmentos de áudio estruturados em sessões curtas de relaxamento que cabem em um dia de trabalho.',
  'Terms and Conditions': 'Termos e condições',
  'All notices and previous versions': 'Todos os avisos e versões anteriores',
  'The Good Loop platform, its content and the GL Methodology are protected by copyright and other intellectual property rights.':
    'A plataforma Good Loop, o seu conteúdo e a Metodologia GL são protegidos por direitos autorais e outros direitos de propriedade intelectual.',
  'Good Loop is a wellbeing service. It is not treatment and does not replace professional mental health support. If you need specialised help, talk to your doctor or your company’s support service.':
    'O Good Loop é um serviço de bem-estar. Não é tratamento e não substitui o apoio profissional em saúde mental. Se você precisa de ajuda especializada, fale com o seu médico ou com o serviço de apoio da sua empresa.',
  'Good Loop can’t respond to emergencies. Good Loop is a wellbeing service and does not replace professional care.':
    'O Good Loop não atende emergências. O Good Loop é um serviço de bem-estar e não substitui o cuidado profissional.',
  'Emergency and support lines': 'Linhas de emergência e apoio',

  /* ---- therapist tab, video ---- */
  'Nothing selected yet.': 'Nada escolhido ainda.',
  'Read and accept the consent form': 'Ler e aceitar o termo de consentimento',
  'Consent form': 'Termo de consentimento',
  'Consent form — {name}': 'Termo de consentimento — {name}',
  'I have read this form and I accept it. It is an agreement between me and {name}.':
    'Li este termo e o aceito. É um acordo entre mim e {name}.',
  'Accept': 'Aceitar',
  'Goals': 'Objetivos',
  'pending': 'pendente',
  'Location confirmed': 'Localização confirmada',
  'Where you are now (address or place)': 'Onde você está agora (endereço ou lugar)',
  'Where you are now': 'Onde você está agora',
  'Confirm': 'Confirmar',
  'Not recorded': 'Não está sendo gravado',

  /* ---- workspace ---- */
  'Selected content': 'Conteúdo escolhido',
  'Content': 'Conteúdo',
  'Nothing selected.': 'Nada escolhido.',
  'Selected on': 'Escolhido em',
  'Listened': 'Ouvidos',
  'Select content': 'Escolher conteúdo',
  'Select content for {name}': 'Escolher conteúdo para {name}',
  'Select': 'Escolher',
  'Choose…': 'Escolha…',
  'published self-guided content, grouped by family': 'conteúdo de uso por conta própria publicado, por família',
  'Nothing to select yet': 'Nada para escolher ainda',
  'No self-guided content is published and enabled right now, so there is nothing to select for listening between sessions.':
    'Nenhum conteúdo de uso por conta própria está publicado e ativo agora, então não há nada para escolher para ouvir entre as sessões.',
  'Patient will see:': 'A pessoa verá:',
  'you': 'você',
  'This content has no rendered audio yet. The patient will hear the placeholder bed until a mixdown is published.':
    'Este conteúdo ainda não tem áudio renderizado. A pessoa ouvirá a base provisória até que um mixdown seja publicado.',
  'Therapist only · encrypted in transit and at rest': 'Só para você · criptografado em trânsito e em repouso',
  'Numbers only — never a diagnostic label, never a change the platform computed.':
    'Só os números — nunca um rótulo diagnóstico, nunca uma variação calculada pela plataforma.',
  'Which instrument, and when, is your decision. Good Loop proposes nothing.':
    'Qual instrumento, e quando, é decisão sua. O Good Loop não propõe nada.',
  'Content between sessions': 'Conteúdo entre sessões',
  'Current: {code} — {done} of {total} done.': 'Atual: {code} — {done} de {total} ouvidos.',
  'Nothing this time': 'Nada desta vez',
  'Questionnaire': 'Questionário',
  'Send one if you decide it is useful. Which, and when, is yours to choose.':
    'Envie um se decidir que é útil. Qual, e quando, é escolha sua.',
  'Send a questionnaire': 'Enviar um questionário',
  'Not now': 'Agora não',
  'When you and {name} decide. Open the calendar to pick a time.': 'Quando você e {name} decidirem. Abra a agenda para escolher um horário.',
  'Open the calendar': 'Abrir a agenda',
  'Good Loop audio': 'Áudio Good Loop',
  'VAS post': 'VAS pós',
  'VAS you recorded · pre → post': 'VAS que você registrou · pré → pós',
  'Play Good Loop audio': 'Tocar um áudio Good Loop',
  'Choose content to play during this call.': 'Escolha um conteúdo para tocar durante esta chamada.',
  'Choose content': 'Escolher conteúdo',
  'No content is published and enabled yet.': 'Nenhum conteúdo está publicado e ativo ainda.',
  'Choose content first.': 'Escolha um conteúdo primeiro.',
  'This content has no published time signature yet.': 'Este conteúdo ainda não tem uma duração publicada.',
  'Everything published is available inside a live session. Items marked clinical-only cannot be selected for listening between sessions.':
    'Tudo o que está publicado está disponível em uma sessão ao vivo. Os itens marcados como apenas clínicos não podem ser escolhidos para ouvir entre as sessões.',
  'Stereo output detected': 'Saída estéreo detectada',
  'Mono or no output — audio blocked': 'Mono ou sem saída — áudio bloqueado',
  'Consent on record': 'Consentimento registrado',
  'Missing — audio blocked': 'Ausente — áudio bloqueado',
  'Start audio': 'Iniciar áudio',
  'Audio completed': 'Áudio concluído',
  'Notes during the audio': 'Anotações durante o áudio',
  'The panel returned to Notes for the debrief. Everything from the audio is included in the session report.':
    'O painel voltou para Anotações para a conversa final. Tudo o que diz respeito ao áudio está no relatório da sessão.',
  'Resume audio': 'Retomar áudio',
  'Intervene': 'Intervir',
  'End the audio now?': 'Encerrar o áudio agora?',
  'End audio': 'Encerrar áudio',
  'Notes auto-save and are stored encrypted, under your account only. The VAS is recorded from the patient’s spoken answer — the patient never sees a VAS control.':
    'As anotações são salvas automaticamente e armazenadas criptografadas, só na sua conta. A VAS é registrada a partir da resposta falada da pessoa — a pessoa nunca vê um controle de VAS.',
  'from': 'de',
  'to': 'para',
  'this session': 'esta sessão',
  'week': 'semana',
  'Frequency': 'Frequência',
  'Freq.': 'Freq.',
  'Period': 'Período',
  'Patient': 'Pessoa',
  'Status': 'Status',
  'Date': 'Data',
  'Type': 'Tipo',
  'Dur.': 'Duração',
  'Notes': 'Anotações',
  'Report': 'Relatório',
  'Yes': 'Sim',
  'No': 'Não',
  'Registration': 'Registro',
  'read-only': 'somente leitura',
  'Verified {date} · next check by {due}': 'Verificado em {date} · próxima verificação até {due}',
  'Verification pending': 'Verificação pendente',
  'insurance to {date}': 'seguro até {date}',
  'Informed consent form': 'Termo de consentimento informado',
  'Your form, in your words. Every person accepts it before their first session with you, and a copy of what they accepted is kept. It cannot be published until all eight items are written (P3.2).':
    'O seu termo, com as suas palavras. Cada pessoa o aceita antes da primeira sessão com você, e uma cópia do que aceitou é guardada. Não pode ser publicado até que os oito itens estejam escritos (P3.2).',
  'Published version {v} · {date}': 'Versão publicada {v} · {date}',
  'Publishing…': 'Publicando…',
  'Publish new version': 'Publicar nova versão',
  'Publish': 'Publicar',
  'All eight items are required.': 'Os oito itens são obrigatórios.',
  'Published.': 'Publicado.',
  'Could not publish just now.': 'Não foi possível publicar agora.',
  'Request logged': 'Solicitação registrada',
  'Try again': 'Tentar de novo',
  'Request account closure': 'Solicitar o encerramento da conta',
  'Closing a professional account is a request we log and confirm within two working days, so that anyone you are working with gets an orderly handover first (Professional Terms P3.5).':
    'O encerramento de uma conta profissional é uma solicitação que registramos e confirmamos em até dois dias úteis, para que as pessoas com quem você trabalha tenham antes uma transição ordenada (Termos para profissionais, P3.5).',
  'Encryption in transit and at rest, access limited to your own account, and every access logged — built so you can meet your own duty of confidentiality. Good Loop holds no certification or clearance for this and claims none: the duty is yours, and these are the tools for it.':
    'Criptografia em trânsito e em repouso, acesso limitado à sua própria conta e todo acesso registrado — construídos para que você cumpra o seu próprio dever de confidencialidade. O Good Loop não possui certificação ou autorização para isso e não a alega: o dever é seu, e estas são as ferramentas para cumpri-lo.',
  'Two-factor sign-in for professional accounts is enabled by the Good Loop team in the authentication service; ask support if it is not yet active on yours.':
    'O acesso em duas etapas para contas profissionais é ativado pela equipe Good Loop no serviço de autenticação; fale com o suporte se ainda não estiver ativo na sua.',
  'Professional body': 'Conselho profissional',
  'CRP — Conselho Regional de Psicologia (Brazil)': 'CRP — Conselho Regional de Psicologia (Brasil)',
  'Ordine degli Psicologi (Italy)': 'Ordine degli Psicologi (Itália)',
  'CRP registration number': 'Número de registro no CRP',
  'Albo registration number': 'Número de registro no Albo',
  'CRP region': 'Região do CRP',
  'Ordine region': 'Ordine regional',
  'Where you practise from': 'De onde você exerce',
  'the territory your registration authorises (D-12)': 'o território que o seu registro autoriza (D-12)',
  'Professional indemnity insurance': 'Seguro de responsabilidade profissional',
  'expiry date and policy reference': 'data de vencimento e referência da apólice',
  'insurer · policy number': 'seguradora · número da apólice',
  'I confirm that I am registered and authorised to practise in the territory above, that I practise from it, and that no disciplinary proceedings are outstanding against me (P2.1, P2.3).':
    'Confirmo que estou registrado e autorizado a exercer no território acima, que exerço a partir dele, e que não há processo disciplinar pendente contra mim (P2.1, P2.3).',
  'Professional Terms': 'Termos para profissionais',
  'I,': 'Eu,',
  'accept the Professional Terms.': 'aceito os Termos para profissionais.',
  'I have read and accept the Professional Terms': 'Li e aceito os Termos para profissionais',
  'Sign and continue': 'Assinar e continuar',
  'Try choosing content and playing it, with a virtual patient': 'Experimente escolher um conteúdo e tocá-lo, com uma pessoa virtual',
  'Save to notes': 'Salvar nas anotações',
  'Action record': 'Registro da ação',
  'What you observed, what you did, who was contacted…': 'O que você observou, o que fez, quem foi contatado…',
  'Emergency numbers': 'Números de emergência',
  'Stay on the call. Do not leave the person alone on the line.': 'Permaneça na chamada. Não deixe a pessoa sozinha na linha.',
  'Confirm where they are right now — the address they gave in the lobby, or ask again.':
    'Confirme onde a pessoa está agora — o endereço dado na sala de espera, ou pergunte de novo.',
  'If there is a serious and imminent risk, call the emergency services for their location and stay connected until help arrives.':
    'Se houver risco grave e iminente, chame os serviços de emergência para o local onde a pessoa está e permaneça conectado até a ajuda chegar.',
  'Involve a trusted person nearby where the person agrees, or where their safety requires it.':
    'Envolva uma pessoa de confiança que esteja perto, se a pessoa concordar ou se a sua segurança exigir.',
  'Record what you observed and what you did, below. It goes into your session notes with the time.':
    'Registre abaixo o que você observou e o que fez. Vai para as anotações da sessão com o horário.',

  /* ---- sponsor console ---- */
  'Before you begin': 'Antes de começar',
  'I understand, on behalf of {company}.': 'Entendi, em nome de {company}.',
  'Continue': 'Continuar',
  'Not enough data': 'Dados insuficientes',
  'Individual employee data is never visible in this dashboard — not use, not attendance, not what anyone listened to.':
    'Dados individuais de colaboradores nunca são visíveis neste painel — nem uso, nem presença, nem o que alguém ouviu.',
  'Every figure is a programme total; any figure derived from fewer than 25 people is hidden, not rounded.':
    'Todo número é um total do programa; qualquer número derivado de menos de 25 pessoas é ocultado, não arredondado.',
  'No breakdown by category or theme is ever shown, and nothing about sessions with a professional — not even a count.':
    'Nunca é mostrada uma divisão por categoria ou tema, e nada sobre sessões com um profissional — nem mesmo uma contagem.',
  'Employees choose whether to be counted in aggregate figures, with no consequence either way.':
    'Os colaboradores escolhem se querem ser contados nos totais agregados, sem consequência em nenhum dos casos.',
  'What your people’s employer never sees': 'O que o empregador nunca vê',
  'Good Loop and your obligations as an employer': 'O Good Loop e as suas obrigações como empregador',
}
