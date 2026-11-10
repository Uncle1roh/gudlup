/* Strings the redesigned surface adds (docs/ui-redesign). Registered last in
   index.tsx, so a key defined here wins over the same key in an older sheet.

   Both locales for every key, always: there is no English locale, so a key
   missing from one dictionary prints English to the person reading it. */

export const IT_UI2: Record<string, string> = {
  'Previous month': 'Mese precedente',
  'Next month': 'Mese successivo',
  /* The glasses beside the Loops pill. Not "the mood calendar" any more
     (POs, 2026-11-06): the colour on them IS the colour the day is being
     seen through, and the words say so. Neither sentence inflects for
     gender — nothing has asked. */
  'This is how you see the world today': 'È così che vedi il mondo oggi',
  'This is how you have been seeing the world': 'È così che hai visto il mondo in questi giorni',
  /* the library's own line, over the legal one under it */
  'Guided pauses for every moment of your day': 'Pause guidate per ogni momento della tua giornata',

  /* writing to us: the address, said out loud */
  'Send a suggestion': 'Manda un suggerimento',
  'Write to us and tell us what is happening. We answer within two working days.':
    'Scrivici e raccontaci che cosa succede. Rispondiamo entro due giorni lavorativi.',
  'Tell us what would make Good Loop better for you. We read everything, and it is not a support request — nothing is broken on your side.':
    'Raccontaci che cosa renderebbe Good Loop migliore per te. Leggiamo tutto, e non è una richiesta di assistenza — non c’è niente di rotto da parte tua.',
  'Copy the address': 'Copia l’indirizzo',
  'Open my e-mail program': 'Apri il mio programma di posta',
  'If something is not working, use “Report a problem” instead — that one reaches us with a case number.':
    'Se qualcosa non funziona, usa «Segnala un problema»: quello ci arriva con un numero di pratica.',
  'Support': 'Assistenza',
  'A suggestion': 'Un suggerimento',

  /* the month's report, on screen before it is kept */
  'Your {month} report': 'Il tuo resoconto di {month}',
  'Nothing has been saved to your device. Download it if you want to keep it.':
    'Non è stato salvato niente sul tuo dispositivo. Scaricalo se vuoi conservarlo.',
  'The report could not be prepared just now. Try again in a moment.':
    'Non è stato possibile preparare il resoconto adesso. Riprova tra un momento.',

  /* the shell */
  'Main navigation': 'Navigazione principale',
  /* "Percurso" / "Percorso" read as a second journey beside "Minha jornada",
     and neither said who is behind it. This tab is the material a
     professional chose for this person. */
  'Guided care': 'Percorso seguito',
  'My journey': 'Il mio viaggio',

  /* the library */
  '{n} Loops': '{n} Loops',
  'Results for “{q}”': 'Risultati per “{q}”',
  'Add to My List': 'Aggiungi alla mia lista',

  /* the check-in */
  'Emotional check-in': 'Check-in emotivo',
  /* the check-in: two sliders, a word, and the glasses */
  /* ---- the two sliders, at the two ends of a session ---- */
  'How are you right now? — optional.': 'Come stai in questo momento? — facoltativo.',
  'Low': 'Bassa',
  'Medium': 'Media',
  'Each square is how you answered at the end of a session.':
    'Ogni quadrato è come hai risposto alla fine di una sessione.',
  'Finish a session and tell us how you are: the day fills itself in.':
    'Completa una sessione e dicci come stai: la giornata si riempie da sé.',
  'Energy': 'Energia',
  'Mood': 'Umore',
  'This is how you are seeing the world right now.': 'È così che stai vedendo il mondo adesso.',
  'The colour of your check-in.': 'Il colore del tuo check-in.',
  'about ten seconds': 'circa dieci secondi',
  'Which word fits best?': 'Quale parola descrive meglio?',
  'Today you feel: {word}': 'Oggi ti senti: {word}',
  'Check-in done · tap to change': 'Check-in fatto · tocca per cambiare',
  'This stays on your screen. It is not saved and nobody else sees it.':
    'Resta sul tuo schermo. Non viene salvato e nessun altro lo vede.',
  'Touch where you are: left (unpleasant) to right (pleasant), bottom (calm) to top (agitated)':
    'Tocca dove ti trovi: da sinistra (spiacevole) a destra (piacevole), dal basso (calmo) in alto (agitato)',
  'agitated': 'agitato',
  'calm': 'calmo',
  'pleasant': 'piacevole',
  'unpleasant': 'spiacevole',

  /* therapy */
  'Confidential: your company does not see your sessions or what you talk about.':
    'Riservato: la tua azienda non vede le tue sedute né di cosa parli.',
  'Booked': 'In agenda',
  'Nothing booked yet.': 'Niente in agenda per ora.',
  'Confirmed': 'Confermata',
  'before {a} → after {b}': 'prima {a} → dopo {b}',
  'Time': 'Orario',

  /* the waiting room */
  'Waiting room': 'Sala d’attesa',
  '{name} joins in about {n} minutes. Meanwhile, let us check your audio.':
    '{name} entra tra circa {n} minuti. Intanto controlliamo il tuo audio.',
  '{name} will open the room. Meanwhile, let us check your audio.':
    '{name} aprirà la stanza. Intanto controlliamo il tuo audio.',
  'Headphone test': 'Prova delle cuffie',
  'Perfect: stereo audio is working.': 'Perfetto: l’audio stereo funziona.',
  'That was the other side. Your headphones may be reversed, or only one ear is connected — try again.':
    'Era l’altro lato. Le cuffie potrebbero essere invertite, o un solo lato è collegato — riprova.',
  'Wired headphones connected': 'Cuffie con filo collegate',
  'Camera and microphone allowed': 'Videocamera e microfono autorizzati',
  'A quiet, comfortable place': 'Un posto tranquillo e comodo',

  /* the call */
  'How the session goes': 'Com’è la seduta',
  'You talk about how you are.': 'Parlate di come stai.',
  'Treatment': 'Trattamento',
  'Guided audio, with your eyes closed.': 'Audio guidato, a occhi chiusi.',
  'Final conversation': 'Conversazione finale',
  'You talk about what you felt.': 'Parlate di quello che hai sentito.',

  /* the treatment */
  'Treatment · guided by {name}': 'Trattamento · guidato da {name}',
  'The screen dims by itself.': 'Lo schermo si scurisce da solo.',
  'live': 'in diretta',

  /* percurso */
  '{n}× this week': '{n}× questa settimana',
  'Paths are trails designed to go alongside your therapy. Talk to your HR team and try Good Loop for companies, with professional support.':
    'Il percorso è fatto di tracciati pensati per accompagnare la tua terapia. Parlane con le Risorse Umane della tua azienda e prova Good Loop per le aziende, con il supporto professionale.',

  /* perfil — the unit under each figure, where the number is drawn apart */
  'sessions': 'sedute',
  'minutes': 'minuti',
  'days in a row': 'giorni di fila',

  /* minha jornada */
  'of {n} weeks': 'di {n} settimane',
  'The {n} weeks': 'Le {n} settimane',
  'Now': 'Adesso',
  'How you felt': 'Come ti sei sentito',
  'Before and after each session (1–5)': 'Prima e dopo ogni seduta (1–5)',
  'Done for this week.': 'Fatto per questa settimana.',
  /* ---- a tela Loops: quattro porte, e che cosa è un Loop ---- */
  /* `LOOPS_EXPLAINER` (gamification/copy.ts): lo stesso testo per il popup
     della pastiglia e per il sottotitolo della schermata. Niente genere:
     non è stato chiesto niente al riguardo. */
  'What are Loops?': 'Che cosa sono i Loops?',
  'A Loop is a minute of care for your mind: when you finish a protocol, every minute you listened becomes one Loop. They exist for your health and nothing else — never for the time you spend on a screen — and they can never be bought.':
    'Un Loop è un minuto di cura per la tua mente: quando porti a termine un protocollo, ogni minuto che hai ascoltato diventa un Loop. Esistono per la tua salute e per nient’altro — mai per il tempo che passi davanti a uno schermo — e non si possono acquistare.',
  'Prizes': 'Premi',
  'Care that comes back to you.': 'La cura che torna a te.',
  'What stays once it is reached: the time you have given yourself, the lengths you have tried, the pathways you have walked.':
    'Quello che resta una volta raggiunto: il tempo che hai dedicato a te, le durate che hai provato, i percorsi che hai completato.',
  'Something to take part in for a few days or a month — on your own, with your city, or with your company.':
    'Qualcosa a cui partecipare per qualche giorno o per un mese — per conto tuo, con la tua città o con la tua azienda.',
  'How your city, your state and your region are taking care of themselves. Places only — never people, never names.':
    'Come la tua città, il tuo stato e la tua regione si prendono cura di sé. Solo luoghi — mai persone, mai nomi.',
  'Care that comes back to you: exchange your Loops for something that looks after your body or your mind.':
    'La cura che torna a te: scambia i tuoi Loops con qualcosa che si prende cura del tuo corpo o della tua mente.',
  /* ---- la pastiglia dell'umore, e l'avviso quando si esce ---- */
  'No reading yet today': 'Oggi non hai ancora risposto',
  'Each square is how you answered at the end of a session. A day you answered twice wears both.':
    'Ogni quadrato è come hai risposto alla fine di una seduta. Un giorno con due risposte le porta entrambe.',
  'If you stop now, this session earns no Loops — they are for the ones you go all the way through.':
    'Se ti fermi adesso, questa seduta non dà Loops: sono per quelle che porti fino in fondo.',
  'And the last minutes are the ones that bring you back gently. Stay with it if you can.':
    'E gli ultimi minuti sono quelli che ti riportano qui con calma. Resta, se puoi.',

  /* ---- una sola porta: la terza scheda ---- */
  'You have given {time} to yourself so far': 'Finora hai dedicato {time} a te',
  'For my company': 'Per la mia azienda',
  'I manage Good Loop where I work': 'Gestisco Good Loop dove lavoro',
}

export const PT_UI2: Record<string, string> = {
  'Previous month': 'Mês anterior',
  'Next month': 'Próximo mês',
  /* The glasses beside the Loops pill. Not "the mood calendar" any more
     (POs, 2026-11-06): the colour on them IS the colour the day is being
     seen through, and the words say so. Neither sentence inflects for
     gender — nothing has asked. */
  'This is how you see the world today': 'É assim que você vê o mundo hoje',
  'This is how you have been seeing the world': 'É assim que você vem vendo o mundo nesses dias',
  /* the library's own line, over the legal one under it */
  'Guided pauses for every moment of your day': 'Pausas guiadas para cada momento do seu dia',

  /* writing to us: the address, said out loud */
  'Send a suggestion': 'Uma sugestão',
  'Write to us and tell us what is happening. We answer within two working days.':
    'Escreva para nós e conte o que está acontecendo. Respondemos em até dois dias úteis.',
  'Tell us what would make Good Loop better for you. We read everything, and it is not a support request — nothing is broken on your side.':
    'Conte o que deixaria a Good Loop melhor para você. A gente lê tudo — e não é um chamado de suporte, nada está quebrado do seu lado.',
  'Copy the address': 'Copiar o endereço',
  'Open my e-mail program': 'Abrir meu programa de e-mail',
  'If something is not working, use “Report a problem” instead — that one reaches us with a case number.':
    'Se alguma coisa não estiver funcionando, use «Relatar um problema»: esse chega até nós com um número de protocolo.',
  'Support': 'Suporte',
  'A suggestion': 'Uma sugestão',

  /* the month's report, on screen before it is kept */
  'Your {month} report': 'Seu relatório de {month}',
  'Nothing has been saved to your device. Download it if you want to keep it.':
    'Nada foi salvo no seu aparelho. Baixe se quiser guardar.',
  'The report could not be prepared just now. Try again in a moment.':
    'Não foi possível preparar o relatório agora. Tente de novo em um instante.',

  /* the shell */
  'Main navigation': 'Navegação principal',
  'Guided care': 'Acompanhamento',
  'My journey': 'Minha jornada',

  /* the library */
  '{n} Loops': '{n} Loops',
  'Results for “{q}”': 'Resultados para “{q}”',
  'Add to My List': 'Adicionar à minha lista',

  /* the check-in */
  'Emotional check-in': 'Check-in emocional',
  /* the check-in: two sliders, a word, and the glasses */
  /* ---- os dois sliders, nas duas pontas de uma sessão ---- */
  'How are you right now? — optional.': 'Como você está agora? — opcional.',
  'Low': 'Baixa',
  'Medium': 'Média',
  'Each square is how you answered at the end of a session.':
    'Cada quadrado é como você respondeu no fim de uma sessão.',
  'Finish a session and tell us how you are: the day fills itself in.':
    'Termine uma sessão e diga como você está: o dia se preenche sozinho.',
  'Energy': 'Energia',
  'Mood': 'Humor',
  'This is how you are seeing the world right now.': 'É assim que você está vendo o mundo agora.',
  'The colour of your check-in.': 'A cor do seu check-in.',
  'about ten seconds': 'cerca de 10 segundos',
  'Which word fits best?': 'Qual palavra descreve melhor?',
  'Today you feel: {word}': 'Hoje você se sente: {word}',
  'Check-in done · tap to change': 'Check-in feito · toque para mudar',
  'This stays on your screen. It is not saved and nobody else sees it.':
    'Isto fica na sua tela. Não é salvo e ninguém mais vê.',
  'Touch where you are: left (unpleasant) to right (pleasant), bottom (calm) to top (agitated)':
    'Toque onde você está: da esquerda (desagradável) para a direita (agradável), de baixo (calmo) para cima (agitado)',
  'agitated': 'agitado',
  'calm': 'calmo',
  'pleasant': 'agradável',
  'unpleasant': 'desagradável',

  /* therapy */
  'Confidential: your company does not see your sessions or what you talk about.':
    'Sigiloso: sua empresa não vê suas sessões nem o que você conversa.',
  'Booked': 'Agendadas',
  'Nothing booked yet.': 'Nada agendado ainda.',
  'Confirmed': 'Confirmada',
  'before {a} → after {b}': 'antes {a} → depois {b}',
  'Time': 'Horário',

  /* the waiting room */
  'Waiting room': 'Sala de espera',
  '{name} joins in about {n} minutes. Meanwhile, let us check your audio.':
    '{name} entra em cerca de {n} minutos. Enquanto isso, vamos conferir seu áudio.',
  '{name} will open the room. Meanwhile, let us check your audio.':
    '{name} vai abrir a sala. Enquanto isso, vamos conferir seu áudio.',
  'Headphone test': 'Teste de fones',
  'Perfect: stereo audio is working.': 'Perfeito: áudio estéreo funcionando.',
  'That was the other side. Your headphones may be reversed, or only one ear is connected — try again.':
    'Era o outro lado. Seus fones podem estar invertidos, ou só um lado está conectado — tente de novo.',
  'Wired headphones connected': 'Fones com fio conectados',
  'Camera and microphone allowed': 'Câmera e microfone liberados',
  'A quiet, comfortable place': 'Lugar tranquilo e confortável',

  /* the call */
  'How the session goes': 'Como é a sessão',
  'You talk about how you are.': 'Vocês conversam sobre como você está.',
  'Treatment': 'Tratamento',
  'Guided audio, with your eyes closed.': 'Áudio guiado, de olhos fechados.',
  'Final conversation': 'Conversa final',
  'You talk about what you felt.': 'Vocês falam sobre o que você sentiu.',

  /* the treatment */
  'Treatment · guided by {name}': 'Tratamento · guiado por {name}',
  'The screen dims by itself.': 'A tela vai escurecendo aos poucos.',
  'live': 'ao vivo',

  /* percurso */
  '{n}× this week': '{n}× esta semana',
  'Paths are trails designed to go alongside your therapy. Talk to your HR team and try Good Loop for companies, with professional support.':
    'O acompanhamento são trilhas desenhadas para andar junto com a sua terapia. Fale com o RH da sua empresa e experimente a Good Loop para empresas, com o apoio profissional.',

  /* perfil — the unit under each figure, where the number is drawn apart */
  'sessions': 'sessões',
  'minutes': 'minutos',
  'days in a row': 'dias seguidos',

  /* minha jornada */
  'of {n} weeks': 'de {n} semanas',
  'The {n} weeks': 'As {n} semanas',
  'Now': 'Agora',
  'How you felt': 'Como você se sentiu',
  'Before and after each session (1–5)': 'Antes e depois de cada sessão (1–5)',
  'Done for this week.': 'Feito nesta semana.',
  /* ---- a tela Loops: quatro portas, e o que é um Loop ---- */
  /* `LOOPS_EXPLAINER` (gamification/copy.ts): o mesmo texto no popup da
     pastilha e no subtítulo da tela — uma definição só. Sem gênero em
     nenhuma frase: nada foi perguntado sobre isso. */
  'What are Loops?': 'O que são os Loops?',
  'A Loop is a minute of care for your mind: when you finish a protocol, every minute you listened becomes one Loop. They exist for your health and nothing else — never for the time you spend on a screen — and they can never be bought.':
    'Um Loop é um minuto de cuidado com a sua mente: quando você termina um protocolo, cada minuto que ouviu vira um Loop. Eles existem pela sua saúde e por nada mais — nunca pelo tempo que você passa numa tela — e nunca podem ser adquiridos.',
  'Prizes': 'Prêmios',
  'Care that comes back to you.': 'O cuidado que volta para você.',
  'What stays once it is reached: the time you have given yourself, the lengths you have tried, the pathways you have walked.':
    'O que fica depois de conquistado: o tempo que você se deu, as durações que experimentou, as trilhas que percorreu.',
  'Something to take part in for a few days or a month — on your own, with your city, or with your company.':
    'Algo de que participar por alguns dias ou por um mês — por conta própria, com a sua cidade ou com a sua empresa.',
  'How your city, your state and your region are taking care of themselves. Places only — never people, never names.':
    'Como a sua cidade, o seu estado e a sua região estão cuidando de si. Só lugares — nunca pessoas, nunca nomes.',
  'Care that comes back to you: exchange your Loops for something that looks after your body or your mind.':
    'O cuidado que volta para você: troque seus Loops por algo que cuide do seu corpo ou da sua mente.',
  /* ---- a pastilha do humor, e o aviso ao sair ---- */
  'No reading yet today': 'Hoje você ainda não respondeu',
  'Each square is how you answered at the end of a session. A day you answered twice wears both.':
    'Cada quadrado é como você respondeu no fim de uma sessão. Um dia com duas respostas carrega as duas.',
  'If you stop now, this session earns no Loops — they are for the ones you go all the way through.':
    'Se você parar agora, esta sessão não dá Loops: eles são para as que você leva até o fim.',
  'And the last minutes are the ones that bring you back gently. Stay with it if you can.':
    'E os últimos minutos são os que trazem você de volta com calma. Fique, se puder.',

  /* ---- uma porta só: o terceiro card ---- */
  'You have given {time} to yourself so far': 'Até agora você dedicou {time} a você',
  'For my company': 'Para a minha empresa',
  'I manage Good Loop where I work': 'Eu cuido da Good Loop onde trabalho',
}
