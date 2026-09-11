/* ============================================================================
   Italian — Self Use app (2026-08 wireframe spec).

   Kept in its own module rather than folded into it.ts: this is one surface's
   worth of copy, it was written against one spec, and it will be revised as a
   unit when the POs review it. Merged into the Italian dictionary in
   i18n/index.tsx, where a later key wins — so a string that also exists in
   it.ts keeps the wording chosen here for the Self Use screens.

   The two PROFESSIONAL desktop surfaces (Therapist Workspace, Corporate
   Dashboard) deliberately stay on their English source strings for now: their
   copy is clinical and HR vocabulary that needs a specialist pass, and a rough
   machine-register translation of "adherence", "VAS delta" or "k-anonymity
   suppression" would be worse than the English a professional already reads.
   The i18n fallback prints the English key, so both surfaces are fully usable.

   Register: "tu", never "lei". A pathway is a PERCORSO, a session a SESSIONE.
   Nothing here names a condition, a diagnosis or a treatment, and no line
   implies obligation — the copy invites, it never chases.
   ============================================================================ */

export const IT_SELF_USE: Record<string, string> = {
  /* ---- onboarding ---- */
  'Your personal space for wellbeing': 'Il tuo spazio personale per il benessere',
  'Guided audio sessions to help you find calm, focus, energy, and balance in your day.':
    'Sessioni audio guidate per ritrovare calma, concentrazione, energia ed equilibrio nella tua giornata.',
  'Get Started': 'Iniziamo',
  'Create your account': 'Crea il tuo account',
  'Continue with Google': 'Continua con Google',
  'Continue with Apple': 'Continua con Apple',
  'Sign up with email': 'Registrati con email',
  'Create Account': 'Crea account',
  'Do you have a company code?': 'Hai un codice aziendale?',
  'Links you to your company plan. Optional.': 'Ti collega al piano della tua azienda. Facoltativo.',
  "Skip — I don't have one": 'Salta — non ce l’ho',
  'This code is not valid. Check with your HR team.': 'Questo codice non è valido. Verifica con il tuo ufficio HR.',
  'Already have an account?': 'Hai già un account?',
  'Log in': 'Accedi',
  'Step 1 of 2': 'Passo 1 di 2',
  'Step 2 of 2': 'Passo 2 di 2',
  'Before we begin': 'Prima di iniziare',
  'We need your consent to personalize your experience.': 'Ci serve il tuo consenso per personalizzare la tua esperienza.',
  'App usage & session data': 'Uso dell’app e dati delle sessioni',
  'Used to remember your preferences and suggest the right sessions.':
    'Servono a ricordare le tue preferenze e a proporti le sessioni giuste.',
  'REQUIRED': 'OBBLIGATORIO',
  'Wellbeing check-ins': 'Check-in di benessere',
  'Used to track your progress over time.': 'Servono a seguire i tuoi progressi nel tempo.',
  'REQUIRED FOR MEASUREMENT': 'NECESSARIO PER LE MISURAZIONI',
  'Read full privacy policy': 'Leggi l’informativa completa',
  'Accept & Continue': 'Accetta e continua',
  'A few quick questions': 'Qualche domanda veloce',
  "What's your main challenge right now?": 'Qual è la tua difficoltà principale in questo momento?',
  'Difficulty concentrating': 'Fatico a concentrarmi',
  'Feeling overwhelmed by demands': 'Mi sento sommerso dalle richieste',
  'Low energy, feeling drained': 'Poca energia, mi sento svuotato',
  'Trouble disconnecting from work': 'Faccio fatica a staccare dal lavoro',
  'Want to grow and build resilience': 'Voglio crescere e costruire resilienza',
  "I'm not sure yet": 'Non lo so ancora',
  'How much time can you dedicate to yourself?': 'Quanto tempo puoi dedicare a te?',
  '{n} minutes': '{n} minuti',
  'When would you prefer your session?': 'Quando preferisci fare la tua sessione?',
  'Morning': 'Mattina',
  'Lunch break': 'Pausa pranzo',
  'End of workday': 'Fine giornata',
  'Evening': 'Sera',
  'What matters most to you right now?': 'Che cosa conta di più per te adesso?',
  'Feeling calmer': 'Sentirmi più calmo',
  'Being more productive': 'Essere più produttivo',
  'Recovering my energy': 'Recuperare energia',
  'Finding balance': 'Ritrovare equilibrio',
  'Recommended for you': 'Consigliato per te',
  '{len}, {per} sessions per week.': '{len}, {per} sessioni a settimana.',
  '~{n} min per session': '~{n} min per sessione',
  "We've suggested this as a great starting point. You can explore other pathways anytime.":
    'Te lo proponiamo come un ottimo punto di partenza. Puoi esplorare gli altri percorsi quando vuoi.',
  'Start this pathway': 'Inizia questo percorso',
  'See all pathways': 'Vedi tutti i percorsi',
  'Ready for your first session?': 'Pronto per la tua prima sessione?',
  "Your first session is just 6 minutes. Find a quiet place, put on your headphones, and let's begin.":
    'La tua prima sessione dura solo 6 minuti. Trova un posto tranquillo, metti le cuffie e cominciamo.',
  'Headphones recommended for best experience': 'Consigliamo le cuffie per l’esperienza migliore',
  'Start now': 'Inizia adesso',
  'Later': 'Più tardi',
  'Almost done': 'Ci siamo quasi',
  'Anonymous data for aggregate company reports': 'Dati anonimi per i report aggregati aziendali',
  'Your company receives anonymous, aggregate wellbeing statistics. Your individual data is never shared.':
    'La tua azienda riceve statistiche di benessere anonime e aggregate. I tuoi dati individuali non vengono mai condivisi.',
  'DEFAULT: OFF': 'PREDEFINITO: DISATTIVO',
  'Push notifications & reminders': 'Notifiche e promemoria',
  "We'll remind you of your sessions and check-ins.": 'Ti ricorderemo le sessioni e i check-in.',
  'DEFAULT: ON': 'PREDEFINITO: ATTIVO',
  'Full legal text': 'Testo legale completo',
  'Each consent has an independent, per-item timestamp. Refusing has zero impact on app features.':
    'Ogni consenso ha una sua data e ora indipendente. Rifiutare non toglie nulla alle funzioni dell’app.',
  'Aggregated statistics are computed across all participating employees and suppressed below a minimum of five responses, so no individual can be identified or reconstructed. You can withdraw this consent at any time in Profile → Privacy & Data.':
    'Le statistiche aggregate sono calcolate su tutte le persone che partecipano e vengono nascoste sotto le cinque risposte, così nessuno può essere identificato o ricostruito. Puoi revocare questo consenso quando vuoi in Profilo → Privacy e dati.',
  'Reminders are sent at the time you chose and can be switched off individually in Profile → Notifications. They never contain health information.':
    'I promemoria arrivano all’orario che hai scelto e puoi disattivarli singolarmente in Profilo → Notifiche. Non contengono mai informazioni sulla salute.',

  /* ---- tabs ---- */
  'Home': 'Home',
  'Explore': 'Esplora',
  'Therapist': 'Terapeuta',
  'Progress': 'Progressi',
  'Profile': 'Profilo',

  /* ---- home ---- */
  'Good morning': 'Buongiorno',
  'Good afternoon': 'Buon pomeriggio',
  'Good evening': 'Buonasera',
  'Your pathway': 'Il tuo percorso',
  'Week {n} of {total}': 'Settimana {n} di {total}',
  "Today's session": 'La sessione di oggi',
  "Start Today's Session": 'Inizia la sessione di oggi',
  '{done} of {total} sessions this week': '{done} di {total} sessioni questa settimana',
  'Completed': 'Completata',
  'Great job today.': 'Bel lavoro oggi.',
  'Do an extra session?': 'Vuoi fare una sessione in più?',
  'Choose your pathway': 'Scegli il tuo percorso',
  'Start a structured journey tailored to what you need most.':
    'Inizia un percorso strutturato su ciò di cui hai più bisogno.',
  'Explore pathways': 'Esplora i percorsi',
  "You've completed {name}!": 'Hai completato {name}!',
  'That is a real piece of work. What comes next is up to you.':
    'È un risultato vero. Il prossimo passo lo scegli tu.',
  'Start a new pathway': 'Inizia un nuovo percorso',
  'Continue with free sessions': 'Continua con le sessioni libere',
  'Quick session': 'Sessione rapida',
  'How are you feeling right now?': 'Come ti senti adesso?',
  'Tense, agitated': 'Teso, agitato',
  'Mind racing': 'La testa corre',
  'Exhausted': 'Esausto',
  'Overwhelmed by tasks': 'Sommerso dalle cose da fare',
  'Unmotivated': 'Senza motivazione',
  'Nervous before a meeting': 'Teso prima di una riunione',
  'Need to disconnect': 'Ho bisogno di staccare',
  'Want to feel stronger': 'Voglio sentirmi più forte',
  'All 5 pathways': 'Tutti i 5 percorsi',
  'Structured journeys': 'Percorsi strutturati',
  'Full session library': 'Tutta la libreria',
  '19 sessions': '19 sessioni',
  'Your session history': 'Le tue sessioni',
  '{n} completed': '{n} completate',
  'Duration': 'Durata',
  'Quick': 'Breve',
  'Standard': 'Standard',
  'Deep': 'Profonda',
  '{n} min': '{n} min',
  'Put on headphones. Find a quiet spot.': 'Metti le cuffie. Trova un posto tranquillo.',
  'Start session': 'Inizia la sessione',
  'Choose a different session': 'Scegli un’altra sessione',
  'Notifications': 'Notifiche',

  /* ---- explore ---- */
  'Pathways': 'Percorsi',
  'All Sessions': 'Tutte le sessioni',
  'ACTIVE': 'IN CORSO',
  'COMPLETED': 'COMPLETATO',
  'Start Pathway': 'Inizia il percorso',
  'Continue': 'Continua',
  'Restart': 'Ricomincia',
  '{per}/wk': '{per}/sett.',
  '{per} sessions/wk': '{per} sessioni/sett.',
  'All': 'Tutte',
  'Focus': 'Concentrazione',
  'Calm': 'Calma',
  'Energy': 'Energia',
  'Balance': 'Equilibrio',
  'Growth': 'Crescita',
  'Theme': 'Tema',
  'No sessions match.': 'Nessuna sessione corrisponde.',
  'Clear filters': 'Azzera i filtri',
  'Part of:': 'Fa parte di:',
  'Part of pathway:': 'Fa parte del percorso:',
  'Week {n}': 'Settimana {n}',
  '{n} sessions': '{n} sessioni',
  'This week': 'Questa settimana',
  'Done': 'Fatta',
  'TODAY': 'OGGI',
  'Rest': 'Riposo',
  'Start {day} session': 'Inizia la sessione di {day}',
  "This week's sessions are done. Anything more is a bonus.":
    'Le sessioni di questa settimana sono fatte. Tutto il resto è un extra.',
  'What to expect': 'Che cosa aspettarti',
  'Start Session': 'Inizia la sessione',
  'Mon': 'Lun',
  'Tue': 'Mar',
  'Wed': 'Mer',
  'Thu': 'Gio',
  'Fri': 'Ven',
  'Sat': 'Sab',
  'Sun': 'Dom',

  /* ---- session ---- */
  'Find a quiet place.': 'Trova un posto tranquillo.',
  'Put on your headphones.': 'Metti le cuffie.',
  'Get comfortable.': 'Mettiti comodo.',
  'Headphones recommended': 'Cuffie consigliate',
  'Begin Session': 'Inizia la sessione',
  "Let's check your headphones": 'Controlliamo le cuffie',
  'Which ear hears the tone?': 'Da quale orecchio senti il suono?',
  'Left': 'Sinistro',
  'Right': 'Destro',
  'Play the tone again': 'Riproduci di nuovo il suono',
  'Play the tone': 'Riproduci il suono',
  'See pathway': 'Vedi il percorso',
  'Help me choose': 'Aiutami a scegliere',
  'Book a session': 'Prenota una seduta',
  'Change the time': 'Cambia orario',
  'Forgot your password?': 'Password dimenticata?',
  'Enter your email address first.': 'Inserisci prima il tuo indirizzo email.',
  'We could not send the link just now. Try again in a moment.':
    'Non siamo riusciti a inviare il link. Riprova tra poco.',
  'If that address has an account, a reset link is on its way. Check your inbox.':
    'Se a quell’indirizzo corrisponde un account, il link è in arrivo. Controlla la posta.',
  'See this pathway': 'Vedi questo percorso',
  'Change my answers': 'Cambia le risposte',
  'Show me a pathway': 'Mostrami un percorso',
  'Just suggest something': 'Suggerisci tu',
  'Four questions, and we will point you at a pathway. Skip any of them.':
    'Quattro domande e ti indichiamo un percorso. Puoi saltarne quante vuoi.',
  'Choose a length to begin': 'Scegli una durata per iniziare',
  'Several weeks, one theme': 'Più settimane, un tema',
  'Categories': 'Categorie',
  '{n} weeks': '{n} settimane',
  'Lets the app measure how you are doing over time. You can turn this off later.':
    'Permette all’app di misurare come stai nel tempo. Puoi disattivarlo più tardi.',
  'This session is not available': 'Questa sessione non è disponibile',
  'It is no longer in the catalog. If your therapist prescribed it, they can prescribe it again.':
    'Non è più nel catalogo. Se te l’ha prescritta la tua terapeuta, può prescriverla di nuovo.',
  'The protocol behind it is no longer in the catalog. Your therapist can prescribe it again once it is republished.':
    'Il protocollo che la genera non è più nel catalogo. La tua terapeuta potrà prescriverla di nuovo quando sarà ripubblicato.',
  'Put your headphones on. We will play a short tone in one ear.':
    'Indossa le cuffie. Riprodurremo un breve suono in un orecchio solo.',
  'We recommend wired stereo headphones. Continue anyway?':
    'Consigliamo cuffie stereo con filo. Vuoi continuare lo stesso?',
  'Go back': 'Torna indietro',
  "Find a comfortable position. Close your eyes when you're ready.":
    'Mettiti in una posizione comoda. Chiudi gli occhi quando te la senti.',
  'Begin': 'Inizia',
  'Placeholder ambient audio — the recorded voice is produced separately.':
    'Audio ambientale provvisorio — la voce registrata viene prodotta a parte.',
  'Breathe in…': 'Inspira…',
  'Phase {n}': 'Fase {n}',
  'Volume down': 'Abbassa il volume',
  'Volume up': 'Alza il volume',
  "End session early? Your progress won't be saved.":
    'Vuoi terminare prima? I progressi di questa sessione non verranno salvati.',
  'Keep listening': 'Continua ad ascoltare',
  'End session': 'Termina la sessione',
  'Well done': 'Ben fatto',
  'Take a moment before moving on.': 'Prenditi un momento prima di ripartire.',
  'How are you feeling?': 'Come ti senti?',
  'Optional': 'Facoltativo',
  'Relaxed': 'Rilassato',
  'Neutral': 'Neutro',
  'Restless': 'Agitato',
  'Need support': 'Ho bisogno di aiuto',
  'Thanks for sharing.': 'Grazie per averlo condiviso.',
  '{done} of {total} this week.': '{done} di {total} questa settimana.',
  'Back to Home': 'Torna alla Home',

  /* ---- measurement ---- */
  'Weekly check-in': 'Check-in settimanale',
  'How has your energy been this week?': 'Com’è stata la tua energia questa settimana?',
  'How easy has it been to concentrate?': 'Quanto è stato facile concentrarti?',
  'How well have you been sleeping?': 'Come hai dormito?',
  'How balanced has your week felt?': 'Quanto ti è sembrata equilibrata la settimana?',
  'How motivated have you felt?': 'Quanto ti sei sentito motivato?',
  'Very low': 'Molto bassa',
  'Very high': 'Molto alta',
  'Very hard': 'Molto difficile',
  'Very easy': 'Molto facile',
  'Very poorly': 'Molto male',
  'Very well': 'Molto bene',
  'Not at all': 'Per niente',
  'Very balanced': 'Molto equilibrata',
  'Sleep': 'Sonno',
  'Motivation': 'Motivazione',
  '{n} of {total}': '{n} di {total}',
  'Next': 'Avanti',
  'Finish': 'Fine',
  'Thanks! Saved.': 'Grazie! Salvato.',
  'Average {n} · {label}': 'Media {n} · {label}',
  'Monthly wellbeing': 'Benessere mensile',
  'Over the last two weeks…': 'Nelle ultime due settimane…',
  'All of the time': 'Sempre',
  'Most of the time': 'Quasi sempre',
  'More than half the time': 'Più della metà del tempo',
  'Less than half the time': 'Meno della metà del tempo',
  'Some of the time': 'Qualche volta',
  'At no time': 'Mai',
  'Wellbeing snapshot saved.': 'Istantanea del benessere salvata.',
  'Scale 0–100': 'Scala 0–100',
  'Mood calendar': 'Calendario dell’umore',
  'How was your day?': 'Com’è andata la giornata?',
  'Tough': 'Dura',
  'So-so': 'Così così',
  'Normal': 'Normale',
  'Good': 'Buona',
  'Great': 'Ottima',
  'Add a note (optional)': 'Aggiungi una nota (facoltativa)',
  'Trending up': 'In aumento',
  'Trending down': 'In calo',
  'Stable': 'Stabile',
  'No change': 'Nessuna variazione',

  /* ---- progress ---- */
  'Self Use': 'In autonomia',
  'Therapist Guided': 'Con il terapeuta',
  'sessions · {n} min': 'sessioni · {n} min',
  'of': 'di',
  'Your weekly check-in': 'Il tuo check-in settimanale',
  'This week vs. last': 'Questa settimana rispetto alla scorsa',
  'Average': 'Media',
  'scale 1–5': 'scala 1–5',
  'No check-in yet.': 'Ancora nessun check-in.',
  'Complete your weekly check-in': 'Completa il check-in settimanale',
  'No wellbeing snapshot yet.': 'Ancora nessuna istantanea del benessere.',
  'Take the monthly snapshot': 'Fai l’istantanea mensile',
  'Track your daily mood — it takes 1 second.': 'Registra il tuo umore — basta un secondo.',
  'Your practice': 'La tua pratica',
  'day streak': 'giorni di fila',
  'minutes total': 'minuti in tutto',
  'sessions completed': 'sessioni completate',
  'Start a new session.': 'Inizia una nuova sessione.',
  'Pathway progress': 'Avanzamento del percorso',
  '{n} sessions done': '{n} sessioni fatte',
  'No active pathway.': 'Nessun percorso attivo.',
  'Monthly report': 'Report mensile',
  'A summary of your sessions and check-ins for this month.':
    'Un riepilogo delle tue sessioni e dei check-in di questo mese.',
  'View your {month} report': 'Vedi il report di {month}',
  'Complete your first session.': 'Completa la tua prima sessione.',
  'Your weekly summary and check-in trends appear here once you begin.':
    'Il riepilogo settimanale e gli andamenti dei check-in appariranno qui appena inizi.',
  'No guided sessions yet': 'Ancora nessuna sessione guidata',
  'Connect with a therapist to see your guided session progress here.':
    'Collegati a un terapeuta per vedere qui i progressi delle sessioni guidate.',
  'Go to Therapist tab': 'Vai alla scheda Terapeuta',
  'Therapy overview': 'Quadro della terapia',
  'weeks in therapy': 'settimane di terapia',
  'next session': 'prossima seduta',
  'Session chronology': 'Cronologia delle sedute',
  'Video session': 'Seduta in video',
  'notes shared': 'note condivise',
    'Clinical assessment trends': 'Andamento delle valutazioni cliniche',
  'Latest VAS': 'Ultimo VAS',
  'Clinical scales are used in Therapist Guided only, administered under therapist supervision.':
    'Le scale cliniche si usano solo nel percorso con il terapeuta, sotto la sua supervisione.',
  'Prescription adherence': 'Aderenza alle sessioni assegnate',
  'Therapy goals': 'Obiettivi della terapia',
  'Goals are set with your therapist and are read-only here.':
    'Gli obiettivi si definiscono con il terapeuta e qui sono in sola lettura.',
  'Export therapy report': 'Esporta il report della terapia',
  'sessions': 'sedute',
  'In progress': 'In corso',
  'Achieved': 'Raggiunto',

  /* ---- therapist tab ---- */
  'Professional support': 'Supporto professionale',
  "Good Loop also offers guided sessions with licensed professionals, available through your company's extended plan.":
    'Good Loop offre anche sedute guidate con professionisti abilitati, disponibili con il piano esteso della tua azienda.',
  'In the meantime, your Self Use sessions are always here for you.':
    'Nel frattempo, le sessioni in autonomia restano sempre a tua disposizione.',
  'Go to Self Use': 'Vai alle sessioni in autonomia',
  'Questions? Contact your HR team or our support.':
    'Domande? Scrivi al tuo ufficio HR o alla nostra assistenza.',
  'Professional support, when you need it': 'Supporto professionale, quando ti serve',
  'Connect with a licensed professional for guided sessions tailored to your needs.':
    'Collegati a un professionista abilitato per sedute guidate su misura per te.',
  'Find a therapist': 'Trova un terapeuta',
  'or': 'oppure',
  'Have a connection code?': 'Hai un codice di collegamento?',
  'Enter code': 'Inserisci il codice',
  'Request pending': 'Richiesta in attesa',
  'Requested': 'Richiesta per',
  'Waiting for confirmation': 'In attesa di conferma',
  'Cancel request': 'Annulla la richiesta',
  "You'll receive a notification when your therapist confirms.":
    'Riceverai una notifica quando il terapeuta confermerà.',
  'Find a Therapist': 'Trova un terapeuta',
  'Professionals available through your company': 'Professionisti disponibili tramite la tua azienda',
  'Next:': 'Prossimo:',
  'View Profile': 'Vedi il profilo',
  'Clinical Psychologist': 'Psicologo clinico',
  'Areas:': 'Aree:',
  'Languages:': 'Lingue:',
  'Available slots': 'Orari disponibili',
  'Request Session': 'Richiedi una seduta',
  'Booking shares only your name, the slot and your company. No health data is sent.':
    'La prenotazione condivide solo il tuo nome, l’orario e la tua azienda. Nessun dato sanitario viene inviato.',
  'Enter your connection code': 'Inserisci il codice di collegamento',
  'Your therapist will give you a unique code to connect your accounts.':
    'Il tuo terapeuta ti darà un codice unico per collegare gli account.',
  'This code is not valid.': 'Questo codice non è valido.',
  'This code has expired. Ask your therapist for a new one.':
    'Questo codice è scaduto. Chiedine uno nuovo al tuo terapeuta.',
  'Connect': 'Collega',
  'Step 1 of 3': 'Passo 1 di 3',
  'Step 2 of 3': 'Passo 2 di 3',
  'Step 3 of 3': 'Passo 3 di 3',
  'About you': 'Qualcosa su di te',
  'Reason for consultation': 'Motivo della consultazione',
  'Tell your therapist what brings you here…': 'Racconta al tuo terapeuta che cosa ti porta qui…',
  'Active conditions': 'Condizioni in corso',
  'Current medications': 'Farmaci in corso',
  'Consent': 'Consensi',
  'Clinical data processing': 'Trattamento dei dati clinici',
  'Session notes': 'Note delle sedute',
  'Share Self Use history with therapist': 'Condividi con il terapeuta la cronologia in autonomia',
  'Share your Self Use history and check-ins. You can revoke this at any time.':
    'Condividi la cronologia delle sessioni in autonomia e i check-in. Puoi revocarlo quando vuoi.',
  'OPTIONAL · DEFAULT OFF': 'FACOLTATIVO · PREDEFINITO DISATTIVO',
  "You're all set.": 'È tutto pronto.',
  'Connected with {name}.': 'Collegato con {name}.',
  'First session: To be scheduled': 'Prima seduta: da fissare',
  'Next session:': 'Prossima seduta:',
  'Join Session': 'Entra nella seduta',
  'Opens 15 minutes before your session starts.': 'Si attiva 15 minuti prima dell’inizio della seduta.',
  'Prescriptions': 'Sessioni assegnate',
  'No prescriptions yet.': 'Nessuna sessione assegnata.',
  '{n}× {name} this week': '{n}× {name} questa settimana',
  '{done} of {total} done': '{done} di {total} fatte',
  'Session history': 'Cronologia delle sedute',
  'Messages': 'Messaggi',
  'End-to-end encrypted': 'Cifratura end-to-end',
  'No messages yet.': 'Ancora nessun messaggio.',
  'Write a message…': 'Scrivi un messaggio…',
  'Send': 'Invia',

  /* ---- videocall (patient side) ---- */
  'Your session with': 'La tua seduta con',
  'starts at {time}': 'inizia alle {time}',
  'Self-view camera preview': 'Anteprima della tua videocamera',
  'Mic': 'Microfono',
  'Camera': 'Videocamera',
  'ON': 'ATTIVO',
  'OFF': 'DISATTIVO',
  'Mute': 'Disattiva microfono',
  'Unmute': 'Attiva microfono',
  'Camera off': 'Spegni la videocamera',
  'Camera on': 'Accendi la videocamera',
  'Stereo headphones are required for this session': 'Per questa seduta servono cuffie stereo',
  'Active when your therapist opens the room': 'Si attiva quando il terapeuta apre la stanza',
  'Leave': 'Esci',
  'Therapist video feed': 'Video del terapeuta',
  'Self view': 'La tua immagine',
  'End': 'Termina',
  'Therapist starts the Good Loop protocol': 'Il terapeuta avvia il protocollo Good Loop',
  'Debrief with your therapist': 'Debriefing con il tuo terapeuta',
  'Leave the session? This ends the call with your therapist.':
    'Vuoi uscire dalla seduta? La chiamata con il tuo terapeuta si chiuderà.',
  'Stay': 'Resta',
  'Your therapist is starting your session': 'Il tuo terapeuta sta avviando la seduta',
  'Put on your headphones, close your eyes, and get comfortable.':
    'Metti le cuffie, chiudi gli occhi e mettiti comodo.',
  'Starting in': 'Si comincia tra',
  'Leaving now ends your session with your therapist. Are you sure?':
    'Uscendo adesso chiudi la seduta con il tuo terapeuta. Vuoi davvero uscire?',
  'Session ended': 'Seduta terminata',

  /* ---- safety gateway ---- */
  "We're here to help you find support": 'Siamo qui per aiutarti a trovare supporto',
  "If you're going through a difficult moment, you don't have to face it alone. These resources can help right now.":
    'Se stai attraversando un momento difficile, non devi affrontarlo da solo. Queste risorse possono aiutarti subito.',
  'Your company support (EAP)': 'Il supporto della tua azienda (EAP)',
  'Crisis helpline': 'Linea di ascolto',
  'Free, confidential support line': 'Linea di supporto gratuita e riservata',
  'Checking in — how are you doing?': 'Un momento — come stai?',
  "We've noticed things have felt heavier lately. That's completely okay. If it would help, support is here whenever you're ready.":
    'Abbiamo notato che nelle ultime settimane è stato più pesante. È del tutto normale. Se può servirti, il supporto è qui quando te la senti.',
  'Not now': 'Non adesso',
  'Good Loop is a personal wellbeing and development program. It does not replace professional mental health support. If you need specialized assistance, talk to your doctor or your company’s support service.':
    'Good Loop è un programma personale di benessere e sviluppo. Non sostituisce il supporto professionale per la salute mentale. Se ti serve un’assistenza specialistica, parlane con il tuo medico o con il servizio di supporto della tua azienda.',

  /* ---- the door: which account, and which app it opens ---- */
  'What is this account for?': 'A che cosa serve questo account?',
  'For me': 'Per me',
  'Sessions to listen to on my own': 'Sessioni da ascoltare per conto mio',
  'I am a therapist': 'Sono un terapeuta',
  'I see people through Good Loop': 'Seguo persone con Good Loop',
  'Create the account for your company': 'Crea l’account della tua azienda',
  'Company code (required)': 'Codice azienda (obbligatorio)',
  'Taking you to your app': 'Ti porto nella tua app',
  'This account belongs to {surface}.': 'Questo account appartiene a {surface}.',
  'Sign in with another account': 'Accedi con un altro account',
  'This account is not set up yet': 'Questo account non è ancora configurato',
  'It has no profile, so it has no app to open. Ask the Good Loop team to finish setting it up.':
    'Non ha un profilo, quindi non ha un’app da aprire. Chiedi al team Good Loop di completarne la configurazione.',

  /* ---- the company code, at registration ---- */
  'A company code looks like ACME-2026-K7. Check it with whoever gave it to you.':
    'Un codice aziendale ha questa forma: ACME-2026-K7. Verificalo con chi te l’ha dato.',
  'We do not know this code yet. You can create your account without it and add it later.':
    'Questo codice non ci risulta ancora. Puoi creare l’account senza e aggiungerlo più avanti.',
  /* The plan a registered code opens, printed under the field. 'Self Use' on
     its own is already translated above as the way you work, in autonomia. */
  'Self Use + Professional Support': 'Self Use + Supporto professionale',

  /* ---- the first run: three cards, once, before the library ---- */
  'Start listening': 'Inizia ad ascoltare',
  'Step {n} of {total}': 'Passo {n} di {total}',
  'Press play and listen': 'Premi play e ascolta',
  'Good Loop is a library of short guided audio sessions. Put your headphones on, choose one, and listen — a voice and the sound around it do the work. Nothing to read, nothing to answer.':
    'Good Loop è una libreria di brevi sessioni audio guidate. Metti le cuffie, scegline una e ascolta: la voce e il suono intorno fanno il lavoro. Niente da leggere, niente a cui rispondere.',
  'Six, twelve or twenty-four minutes': 'Sei, dodici o ventiquattro minuti',
  'Every session is built in phases: it settles you, it does its work, and it brings you back. Pick the length that fits the day you are having — the short one is a whole session, not a taste of one.':
    'Ogni sessione è costruita in fasi: ti fa posare, lavora e ti riporta indietro. Scegli la durata che sta nella giornata che hai — quella breve è una sessione intera, non un assaggio.',
  'A little, often': 'Poco, spesso',
  'A few minutes on most days does more than one long session now and then. You can note how you feel before and after and watch it move. Good Loop supports your wellbeing — it is not medical or psychological care and does not replace it.':
    'Pochi minuti quasi ogni giorno fanno più di una sessione lunga ogni tanto. Puoi annotare come stai prima e dopo e vedere come cambia. Good Loop sostiene il tuo benessere: non è una cura medica o psicologica e non la sostituisce.',

  /* ---- profile ---- */
  'Account Settings': 'Impostazioni dell’account',
  'Session Preferences': 'Preferenze delle sessioni',
  'Privacy & Data': 'Privacy e dati',
  'How Good Loop Works': 'Come funziona Good Loop',
  'Help & Support': 'Aiuto e assistenza',
  'About Good Loop': 'Informazioni su Good Loop',
  'Log Out': 'Esci',
  'Linked company': 'Azienda collegata',
  'Not linked': 'Nessuna azienda',
  'Self Use reminders': 'Promemoria delle sessioni',
  'Reminder time': 'Orario del promemoria',
  'Weekly check-in reminder': 'Promemoria del check-in settimanale',
  'Monthly wellbeing reminder': 'Promemoria del benessere mensile',
  'Motivational nudges': 'Piccoli incoraggiamenti',
  'Therapist session reminders': 'Promemoria delle sedute',
  'Therapist messages': 'Messaggi del terapeuta',
  'Prescription reminders': 'Promemoria delle sessioni assegnate',
  'Each setting is independent. Reminders never contain health information.':
    'Ogni impostazione è indipendente. I promemoria non contengono mai informazioni sulla salute.',
  'Default duration': 'Durata predefinita',
  'Preferred time': 'Orario preferito',
  'Audio quality': 'Qualità audio',
  'High': 'Alta',
  'Consents': 'Consensi',
  'Updated {date}': 'Aggiornato il {date}',
  'Not set': 'Non impostato',
  'Aggregate company reports': 'Report aggregati aziendali',
  'Off · never shared individually': 'Disattivo · mai condiviso individualmente',
  'Share Self Use data with therapist': 'Condividi con il terapeuta i dati delle sessioni in autonomia',
  'Revocable anytime': 'Revocabile in qualsiasi momento',
  'Export my data': 'Esporta i miei dati',
  'Delete my account': 'Elimina il mio account',
  'Delete your account?': 'Vuoi eliminare il tuo account?',
  'This permanently removes your account, sessions, and check-in history. This cannot be undone. Consider exporting your data first.':
    'Questo elimina definitivamente il tuo account, le sessioni e la cronologia dei check-in. L’operazione non è reversibile. Valuta di esportare prima i tuoi dati.',
  'Type DELETE to confirm': 'Scrivi DELETE per confermare',
  'Delete account': 'Elimina l’account',
  'Skip': 'Salta',
  'Why headphones matter': 'Perché le cuffie contano',
  'Good Loop uses stereo audio technology. Always use wired stereo headphones for the full experience.':
    'Good Loop usa una tecnologia audio stereo. Usa sempre cuffie stereo con filo per l’esperienza completa.',
  'What happens during a session': 'Che cosa succede durante una sessione',
  'The screen goes dark by design. Close your eyes, listen, and let the audio do the work.':
    'Lo schermo si oscura di proposito. Chiudi gli occhi, ascolta e lascia lavorare l’audio.',
  'A pathway is a multi-week journey — the sessions build on each other. No pressure: go at your own speed.':
    'Un percorso dura più settimane e le sessioni si costruiscono una sull’altra. Nessuna fretta: vai al tuo ritmo.',
  'Check-ins': 'Check-in',
  'Weekly and monthly check-ins live in the Progress tab. Less than a minute, and completely optional.':
    'I check-in settimanali e mensili sono nella scheda Progressi. Meno di un minuto, e del tutto facoltativi.',
  'Connect with a therapist for guided sessions. They lead the experience while you listen. Your therapist can also prescribe sessions for you to do on your own.':
    'Collegati a un terapeuta per le sedute guidate: le conduce lui mentre tu ascolti. Il tuo terapeuta può anche assegnarti sessioni da fare in autonomia.',
  'Frequently asked questions': 'Domande frequenti',
  'Contact support': 'Contatta l’assistenza',
  'Report a problem': 'Segnala un problema',
  'Version': 'Versione',
  'Good Loop combines guided voice, stereo sound design and structured session phases into short audio practices you can fit into a working day.':
    'Good Loop unisce voce guidata, progettazione sonora stereo e fasi strutturate in pratiche audio brevi, da inserire in una giornata di lavoro.',
  /* --- Therapist tab: scheduling, questionnaires, messages --------------- */
  'No session is scheduled yet.': 'Nessuna seduta in programma.',
  'Your therapist will propose a time.': 'Sarà il tuo terapeuta a proporti un orario.',
  'Notes shared': 'Note condivise',
  'Questionnaires': 'Questionari',
  'Start': 'Inizia',
  'Sent': 'Inviato',
  '{name} asked you to fill this in. Take it when you have a quiet few minutes.':
    '{name} ti ha chiesto di compilarlo. Fallo quando hai qualche minuto di tranquillità.',
  'Your therapist reads these between sessions. For anything urgent, use the emergency numbers in your profile.':
    'Il tuo terapeuta legge i messaggi tra una seduta e l’altra. Per le urgenze usa i numeri di emergenza che trovi nel profilo.',
  'No messages yet. Write to {name} whenever something is worth saying between sessions.':
    'Ancora nessun messaggio. Scrivi a {name} quando c’è qualcosa da dire tra una seduta e l’altra.',
  '{n} characters left': '{n} caratteri rimasti',

  /* --- Assessment runner ------------------------------------------------- */
  'Close': 'Chiudi',
  'This measure is recorded by your therapist during your session.':
    'Questa misura viene registrata dal tuo terapeuta durante la seduta.',
  'Your answers have been sent to {name}.': 'Le tue risposte sono state inviate a {name}.',
  'Your answers have been sent to your therapist.': 'Le tue risposte sono state inviate al tuo terapeuta.',
  'Questionnaires like this one are read alongside everything else your therapist knows about you. You will go through the results together.':
    'Un questionario come questo si legge insieme a tutto il resto che il tuo terapeuta sa di te. Ne parlerete insieme.',
  '{n} questions still to answer.': 'Mancano ancora {n} domande.',

  /* --- Booking and availability errors ----------------------------------- */
  'Could not load the list. Please try again.': 'Non è stato possibile caricare l’elenco. Riprova.',
  'No therapist is available through your company yet.':
    'Nessun terapeuta è ancora disponibile tramite la tua azienda.',
  'Your HR team can invite professionals to your convention.':
    'Il tuo ufficio HR può invitare dei professionisti alla convenzione.',
  'Could not load available times.': 'Non è stato possibile caricare gli orari disponibili.',
  'That time was just taken. Please choose another.': 'Quell’orario è appena stato preso. Scegline un altro.',
  'No free times in the next three weeks. Try again later.':
    'Nessun orario libero nelle prossime tre settimane. Riprova più avanti.',
  'Requesting…': 'Invio in corso…',

  /* --- Player fallbacks --------------------------------------------------- */
  'No recorded voice is published for this length yet — this plays an ambient bed.':
    'Per questa durata non è ancora pubblicata una voce registrata: senti un tappeto sonoro.',
  'The recorded audio could not be played, so this is the ambient bed.':
    'Non è stato possibile riprodurre l’audio registrato: senti il tappeto sonoro.',
  'The check you tap before and after each session is shared with your therapist.':
    'Il check che tocchi prima e dopo ogni sessione viene condiviso con il tuo terapeuta.',
  'This session is not available at the moment. Your therapist or the Good Loop team can restore it.':
    'Questa sessione non è disponibile al momento. Il tuo terapeuta o il team Good Loop possono ripristinarla.',

  /* ---- the library's own words ------------------------------------------

     The 19 editorial sessions, the five pathways and the labels that group
     them. Their English source lives in `src/data/selfuse.ts`, and every
     screen already printed them through `t()` — the dictionary simply had
     nothing to answer with, so an app switched to Italian kept an English
     library inside it.

     A PO who publishes a protocol with a translated name overrides these:
     see `i18n` on the catalog entry (src/types/domain.ts). This is what a
     person reads until then. */
  'Focus & Clarity': 'Focus e chiarezza',
  'Sharpen attention and think clearly under pressure.':
    'Affina l’attenzione e pensa con lucidità anche sotto pressione.',
  'A short reset for a scattered mind. It settles the body first, then narrows attention to one thing at a time, so you can go back to what you were doing without the noise.':
    'Un reset breve per una mente dispersa. Prima fa posare il corpo, poi restringe l’attenzione a una cosa per volta, così puoi tornare a quello che stavi facendo senza il rumore.',
  'A few slow breaths to settle': 'Qualche respiro lento per posarsi',
  'Guided attention, one thing at a time': 'Attenzione guidata, una cosa per volta',
  'A clear, unhurried close': 'Una chiusura chiara, senza fretta',
  'Demand Management': 'Gestire le richieste',
  'Reorganize competing tasks without feeling swamped.':
    'Rimetti in ordine le richieste che si accavallano senza sentirti sommerso.',
  'For the days when everything is urgent. It separates what is actually yours to carry from what only feels that way, and gives the pile an order you can work with.':
    'Per i giorni in cui tutto è urgente. Separa ciò che davvero tocca a te da ciò che solo sembra tuo, e dà alla pila un ordine con cui si può lavorare.',
  'Naming what is on your plate': 'Dare un nome a ciò che hai davanti',
  'Letting the pile settle into an order': 'Lasciare che la pila trovi un ordine',
  'One next step, not ten': 'Un passo successivo, non dieci',
  'Personal Balance': 'Equilibrio personale',
  'Find the line between what you give and what you keep.':
    'Trova la linea tra ciò che dai e ciò che tieni per te.',
  'A session about proportion. It looks at where your time and energy actually go, and gently returns some of it to you.':
    'Una sessione sulla proporzione. Guarda dove vanno davvero il tuo tempo e la tua energia, e con calma te ne restituisce un po’.',
  'A slow body scan': 'Una lenta scansione del corpo',
  'Noticing where your energy goes': 'Notare dove va la tua energia',
  'Reclaiming a little of it': 'Riprenderne un po’',
  'Inner Strength': 'Forza interiore',
  'Steady yourself when the demands keep coming.': 'Tieni il passo quando le richieste non si fermano.',
  'Built for stretches that do not let up. It works with steadiness rather than push — the kind of strength that lasts a whole week, not one afternoon.':
    'Pensata per i periodi che non mollano. Lavora sulla stabilità più che sulla spinta: il tipo di forza che regge una settimana intera, non un pomeriggio.',
  'Grounding through the body': 'Radicarsi attraverso il corpo',
  'Working with steadiness, not push': 'Lavorare sulla stabilità, non sulla spinta',
  'A settled, durable close': 'Una chiusura posata e duratura',
  'Action & Decision': 'Azione e decisione',
  'Move from turning it over to actually choosing.': 'Passa dal rimuginare allo scegliere davvero.',
  'For when a decision has been going round for too long. It quiets the loop and makes room for a choice you can stand behind.':
    'Per quando una decisione gira da troppo tempo. Abbassa il rumore del giro e fa spazio a una scelta su cui puoi stare.',
  'Quieting the loop': 'Far tacere il giro',
  'Making room for one choice': 'Fare spazio a una scelta',
  'Leaving with a first step': 'Uscire con un primo passo',
  'Calm & Safety': 'Calma e sicurezza',
  'Find calm before high-pressure situations.': 'Ritrova la calma prima delle situazioni ad alta pressione.',
  'The one to reach for when the pressure is already here. It brings an activated body down to a slower, safer baseline.':
    'Quella da cercare quando la pressione è già arrivata. Riporta un corpo attivato a un ritmo più lento e più sicuro.',
  'Slowing the breath': 'Rallentare il respiro',
  'Settling an activated body': 'Far posare un corpo attivato',
  'A steady, safe close': 'Una chiusura stabile e sicura',
  'Breathing & Presence': 'Respiro e presenza',
  'Come back to the room and to your own breath.': 'Torna alla stanza e al tuo respiro.',
  'The simplest session in the library. Breath, body, room — nothing else asked of you.':
    'La sessione più semplice della libreria. Respiro, corpo, stanza: nient’altro ti viene chiesto.',
  'A guided breath pattern': 'Uno schema di respiro guidato',
  'Contact with the room around you': 'Il contatto con la stanza intorno a te',
  'Nothing else asked of you': 'Nient’altro ti viene chiesto',
  'Confidence in the Moment': 'Sicurezza nel momento',
  'Walk into the next ten minutes as yourself.': 'Entra nei prossimi dieci minuti restando te stesso.',
  'For just before something that matters. It puts the future back at a workable distance so you can be present for what is actually happening.':
    'Per il momento appena prima di qualcosa che conta. Rimette il futuro a una distanza gestibile, così puoi essere presente a ciò che sta davvero accadendo.',
  'Settling the anticipation': 'Calmare l’attesa',
  'Returning to the present': 'Tornare al presente',
  'Walking in as yourself': 'Entrare restando te stesso',
  'Permission to Pause': 'Il permesso di fermarti',
  'Stop, without having to earn it first.': 'Fermarti senza doverlo prima meritare.',
  'The first session of recovery. It does not ask you to do anything — its whole job is to let you stop.':
    'La prima sessione del recupero. Non ti chiede di fare nulla: il suo unico compito è lasciarti fermare.',
  'Permission to put it down': 'Il permesso di posare tutto',
  'A long, unhurried settle': 'Un lungo posarsi, senza fretta',
  'No task at the end': 'Nessun compito alla fine',
  'Healthy Boundaries': 'Confini sani',
  'Protect the time and energy that are yours.': 'Proteggi il tempo e l’energia che sono tuoi.',
  'About the edges of your day. It rehearses the small, ordinary act of keeping something for yourself.':
    'Parla dei bordi della tua giornata. Fa provare il gesto piccolo e ordinario di tenere qualcosa per te.',
  'Finding the edges of your day': 'Trovare i bordi della giornata',
  'Rehearsing keeping something back': 'Provare a tenere qualcosa per sé',
  'A firmer, kinder close': 'Una chiusura più ferma e più gentile',
  'Energy Renewal': 'Rinnovare l’energia',
  'Rebuild after a long stretch of giving.': 'Ricostruisci dopo un lungo periodo speso a dare.',
  'For the part of recovery that comes after stopping. Quiet, restorative, and deliberately slow.':
    'Per la parte del recupero che viene dopo essersi fermati. Silenziosa, ristoratrice e volutamente lenta.',
  'A deeply slow pace': 'Un ritmo profondamente lento',
  'Restoration rather than effort': 'Ristoro, non sforzo',
  'Warmth at the close': 'Calore nella chiusura',
  'Conscious Priorities': 'Priorità consapevoli',
  'Decide what deserves you, and what does not.': 'Decidi che cosa ti merita e che cosa no.',
  'A session about choosing. It sorts what actually matters from what is only loud.':
    'Una sessione sullo scegliere. Separa ciò che conta davvero da ciò che fa solo rumore.',
  'Sorting loud from important': 'Distinguere il rumoroso dall’importante',
  'Choosing on purpose': 'Scegliere con intenzione',
  'Leaving lighter': 'Uscire più leggero',
  'Professional Authenticity': 'Autenticità professionale',
  'Work in a way that still sounds like you.': 'Lavorare in un modo che ti somigli ancora.',
  'For when the role has drifted away from the person. It reconnects what you do with who you are.':
    'Per quando il ruolo si è allontanato dalla persona. Ricollega quello che fai a chi sei.',
  'Reconnecting role and person': 'Ricollegare ruolo e persona',
  'Naming what you want to keep': 'Dare un nome a ciò che vuoi tenere',
  'A grounded, honest close': 'Una chiusura radicata e onesta',
  'Flexibility & Adaptation': 'Flessibilità e adattamento',
  'Bend with what changes instead of bracing against it.':
    'Piegati con ciò che cambia invece di irrigidirti contro.',
  'For periods where the ground keeps moving. It practises adapting without losing your footing.':
    'Per i periodi in cui il terreno continua a muoversi. Allena l’adattarsi senza perdere l’appoggio.',
  'Grounding first': 'Prima radicarsi',
  'Practising give rather than brace': 'Allenare la cedevolezza, non la rigidità',
  'A steady, mobile close': 'Una chiusura stabile e mobile',
  'Overcoming Challenges': 'Superare le sfide',
  'Meet a hard thing with more than dread.': 'Affronta una cosa difficile con qualcosa in più del timore.',
  'It takes something difficult that is coming and rehearses meeting it — not avoiding it, and not pretending it is small.':
    'Prende una cosa difficile che sta arrivando e ne prova l’incontro: senza evitarla e senza far finta che sia piccola.',
  'Settling before the hard thing': 'Posarsi prima della cosa difficile',
  'Rehearsing meeting it': 'Provare l’incontro',
  'Leaving with your footing': 'Uscire con l’appoggio ritrovato',
  'Self-Confidence & Efficacy': 'Fiducia in sé ed efficacia',
  'Remember what you are actually able to do.': 'Ricorda che cosa sei davvero in grado di fare.',
  'A session that works with evidence rather than encouragement — the things you have already handled.':
    'Una sessione che lavora con le prove più che con l’incoraggiamento: le cose che hai già affrontato.',
  'Recalling what you have handled': 'Richiamare ciò che hai già affrontato',
  'Letting it register in the body': 'Lasciare che il corpo lo registri',
  'A quietly confident close': 'Una chiusura fiduciosa e silenziosa',
  'Supportive Connections': 'Legami che sostengono',
  'Feel the people who are on your side.': 'Senti le persone che stanno dalla tua parte.',
  'About not doing it alone. It brings the people who steady you back into the room.':
    'Parla del non farcela da soli. Riporta nella stanza le persone che ti tengono in piedi.',
  'Bringing support to mind': 'Richiamare alla mente chi ti sostiene',
  'Letting it be felt, not just thought': 'Lasciarlo sentire, non solo pensare',
  'A warmer close': 'Una chiusura più calda',
  'Vision & Growth': 'Visione e crescita',
  'Look further out than this week.': 'Guarda più in là di questa settimana.',
  'The longest view in the library. It lifts your attention past the immediate and asks where you are actually going.':
    'Lo sguardo più lungo della libreria. Solleva l’attenzione oltre l’immediato e chiede dove stai andando davvero.',
  'Widening the view': 'Allargare lo sguardo',
  'Naming a direction': 'Dare un nome a una direzione',
  'A clear, open close': 'Una chiusura chiara e aperta',
  'Vitality & Motivation': 'Vitalità e motivazione',
  'A gentle way back into movement.': 'Un modo gentile per rimetterti in movimento.',
  'For the flat days. It does not push — it makes a small amount of momentum available again.':
    'Per i giorni piatti. Non spinge: rimette a disposizione un po’ di slancio.',
  'A soft, low-demand start': 'Un avvio morbido, che chiede poco',
  'A little momentum, gently': 'Un po’ di slancio, con delicatezza',
  'No pressure at the end': 'Nessuna pressione alla fine',
  'Focus & Performance': 'Focus e prestazione',
  'For anyone who has to perform under pressure: a crowded mind, trouble concentrating, performance anxiety, putting things off as a deadline closes in.':
    'Per chi deve rendere sotto pressione: mente affollata, difficoltà a concentrarsi, ansia da prestazione, rimandare mentre la scadenza si avvicina.',
  'Stress Management': 'Gestione dello stress',
  'A progressive journey for the structured management of everyday working stress: first calm is recovered, then demands are reorganised, then boundaries are protected, and finally confidence is consolidated.':
    'Un percorso progressivo per gestire in modo strutturato lo stress lavorativo di ogni giorno: prima si ritrova la calma, poi si riordinano le richieste, poi si proteggono i confini e infine si consolida la fiducia.',
  'Energy & Recovery': 'Energia e recupero',
  'For anyone who feels emptied out, exhausted, chronically in energy debt. Progressive regeneration: from allowing yourself to stop, through to a deeper recharge.':
    'Per chi si sente svuotato, esausto, cronicamente in debito di energia. Una rigenerazione progressiva: dal permettersi di fermarsi fino a una ricarica più profonda.',
  'Balance & Boundaries': 'Equilibrio e confini',
  'For anyone who struggles to switch off from work, whose line between professional and personal life has blurred, who is over-connected and relationally overloaded.':
    'Per chi fatica a staccare dal lavoro, per chi ha visto sfumare la linea tra vita professionale e personale, per chi è iperconnesso e sovraccarico nelle relazioni.',
  'Growth & Resilience': 'Crescita e resilienza',
  'The longest and deepest journey, oriented towards personal and professional development. For anyone looking for growth, flexibility and a longer view.':
    'Il percorso più lungo e più profondo, orientato allo sviluppo personale e professionale. Per chi cerca crescita, flessibilità e uno sguardo più lungo.',
  'Focus & Management': 'Focus e gestione',
  'Calm & Presence': 'Calma e presenza',
  'Standalone': 'Singole',

  /* ---- the library's own words ------------------------------------------

     The 19 editorial sessions, the five pathways and the labels that group
     them. Their English source lives in `src/data/selfuse.ts`, and every
     screen already printed them through `t()` — the dictionary simply had
     nothing to answer with, so an app switched to Italian kept an English
     library inside it.

     A PO who publishes a protocol with a translated name overrides these:
     see `i18n` on the catalog entry (src/types/domain.ts). This is what a
     person reads until then. */
  'For when your mind is scattered and you need clarity under pressure.':
    'Per quando la mente è dispersa e ti serve lucidità sotto pressione.',
  'Regain calm, reorganize demands, and build healthy boundaries.':
    'Ritrovare la calma, riordinare le richieste, costruire confini sani.',
  'From exhaustion to renewed vitality. Permission to pause, then rebuild.':
    'Dall’esaurimento a una vitalità nuova. Prima il permesso di fermarti, poi la ricostruzione.',
  'Protect your time, set limits, reconnect with what matters.':
    'Proteggere il tuo tempo, mettere limiti, ricollegarti a ciò che conta.',
  'Long-term development: flexibility, strength, vision.':
    'Sviluppo a lungo termine: flessibilità, forza, visione.',
}
