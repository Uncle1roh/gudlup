/* Strings the redesigned surface adds (docs/ui-redesign). Registered last in
   index.tsx, so a key defined here wins over the same key in an older sheet.

   Both locales for every key, always: there is no English locale, so a key
   missing from one dictionary prints English to the person reading it. */

export const IT_UI2: Record<string, string> = {
  /* the shell */
  'Main navigation': 'Navigazione principale',
  'My path': 'Il mio percorso',
  'My journey': 'Il mio viaggio',

  /* the library */
  'Hello, {name}.': 'Ciao, {name}.',
  '{n} Loops': '{n} Loops',
  'Featured this week': 'In evidenza questa settimana',
  'Listen now': 'Ascolta ora',
  'About this session': 'Su questa sessione',
  'Search the library': 'Cerca nella libreria',
  'Search by feeling, goal or session': 'Cerca per sensazione, obiettivo o sessione',
  'Results for “{q}”': 'Risultati per “{q}”',
  'Add to My List': 'Aggiungi alla mia lista',

  /* the check-in */
  'Emotional check-in': 'Check-in emotivo',
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
  'Employee': 'Dipendente',
  'Confidential: your company does not see your sessions or what you talk about.':
    'Riservato: la tua azienda non vede le tue sedute né di cosa parli.',
  'When': 'Quando',
  'Not scheduled yet': 'Non ancora fissata',
  'about {n} min': 'circa {n} min',
  'Wired stereo headphones are required': 'Sono necessarie cuffie stereo con filo',
  'Enter the waiting room': 'Entra nella sala d’attesa',
  'Booked': 'In agenda',
  'Nothing booked yet.': 'Niente in agenda per ora.',
  'Confirmed': 'Confermata',
  'Your sessions appear here afterwards.': 'Le tue sedute compaiono qui dopo.',
  'before {a} → after {b}': 'prima {a} → dopo {b}',
  'Book a new session': 'Prenota una nuova seduta',
  'No open times in the next three weeks.': 'Nessun orario libero nelle prossime tre settimane.',
  'Time': 'Orario',
  'Choose a time': 'Scegli un orario',
  'Confirm · {when}': 'Conferma · {when}',
  'See other professionals': 'Vedi altri professionisti',

  /* the waiting room */
  'Waiting room': 'Sala d’attesa',
  '{name} joins in about {n} minutes. Meanwhile, let us check your audio.':
    '{name} entra tra circa {n} minuti. Intanto controlliamo il tuo audio.',
  '{name} will open the room. Meanwhile, let us check your audio.':
    '{name} aprirà la stanza. Intanto controlliamo il tuo audio.',
  'Your camera': 'La tua videocamera',
  'Headphone test': 'Prova delle cuffie',
  'Play a sound': 'Riproduci un suono',
  'Play again': 'Riproduci di nuovo',
  'A session moves sound between your ears. One tap tells you whether yours are working.':
    'Una seduta muove il suono da un orecchio all’altro. Un tocco ti dice se le tue funzionano.',
  'Which ear did you hear the sound in?': 'In quale orecchio hai sentito il suono?',
  'Perfect: stereo audio is working.': 'Perfetto: l’audio stereo funziona.',
  'That was the other side. Your headphones may be reversed, or only one ear is connected — try again.':
    'Era l’altro lato. Le cuffie potrebbero essere invertite, o un solo lato è collegato — riprova.',
  'Wired headphones connected': 'Cuffie con filo collegate',
  'Camera and microphone allowed': 'Videocamera e microfono autorizzati',
  'A quiet, comfortable place': 'Un posto tranquillo e comodo',
  'Enter the call': 'Entra nella chiamata',
  'Back to Therapy': 'Torna a Terapia',

  /* the call */
  'How the session goes': 'Com’è la seduta',
  'You talk about how you are.': 'Parlate di come stai.',
  'Treatment': 'Trattamento',
  'Guided audio, with your eyes closed.': 'Audio guidato, a occhi chiusi.',
  'Final conversation': 'Conversazione finale',
  'You talk about what you felt.': 'Parlate di quello che hai sentito.',
  'Your therapist will start the treatment shortly. Keep your headphones on.':
    'La psicologa inizierà il trattamento a breve. Tieni le cuffie nelle orecchie.',
  'The treatment is over. Talk about what you felt, in your own words.':
    'Il trattamento è finito. Racconta cosa hai sentito, con parole tue.',

  /* the treatment */
  'Treatment · guided by {name}': 'Trattamento · guidato da {name}',
  'Close your eyes and just listen.': 'Chiudi gli occhi e ascolta soltanto.',
  'The screen dims by itself.': 'Lo schermo si scurisce da solo.',
  'live': 'in diretta',
}

export const PT_UI2: Record<string, string> = {
  /* the shell */
  'Main navigation': 'Navegação principal',
  'My path': 'Percurso',
  'My journey': 'Minha jornada',

  /* the library */
  'Hello, {name}.': 'Olá, {name}.',
  '{n} Loops': '{n} Loops',
  'Featured this week': 'Em destaque esta semana',
  'Listen now': 'Ouvir agora',
  'About this session': 'Sobre esta sessão',
  'Search the library': 'Buscar na biblioteca',
  'Search by feeling, goal or session': 'Buscar por sentimento, objetivo ou sessão',
  'Results for “{q}”': 'Resultados para “{q}”',
  'Add to My List': 'Adicionar à minha lista',

  /* the check-in */
  'Emotional check-in': 'Check-in emocional',
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
  'Employee': 'Colaborador(a)',
  'Confidential: your company does not see your sessions or what you talk about.':
    'Sigiloso: sua empresa não vê suas sessões nem o que você conversa.',
  'When': 'Quando',
  'Not scheduled yet': 'Ainda não agendada',
  'about {n} min': 'cerca de {n} min',
  'Wired stereo headphones are required': 'Fones estéreo com fio são obrigatórios',
  'Enter the waiting room': 'Entrar na sala de espera',
  'Booked': 'Agendadas',
  'Nothing booked yet.': 'Nada agendado ainda.',
  'Confirmed': 'Confirmada',
  'Your sessions appear here afterwards.': 'Suas sessões aparecem aqui depois.',
  'before {a} → after {b}': 'antes {a} → depois {b}',
  'Book a new session': 'Agendar nova sessão',
  'No open times in the next three weeks.': 'Nenhum horário livre nas próximas três semanas.',
  'Time': 'Horário',
  'Choose a time': 'Escolha um horário',
  'Confirm · {when}': 'Confirmar · {when}',
  'See other professionals': 'Ver outros profissionais',

  /* the waiting room */
  'Waiting room': 'Sala de espera',
  '{name} joins in about {n} minutes. Meanwhile, let us check your audio.':
    '{name} entra em cerca de {n} minutos. Enquanto isso, vamos conferir seu áudio.',
  '{name} will open the room. Meanwhile, let us check your audio.':
    '{name} vai abrir a sala. Enquanto isso, vamos conferir seu áudio.',
  'Your camera': 'Sua câmera',
  'Headphone test': 'Teste de fones',
  'Play a sound': 'Tocar som',
  'Play again': 'Tocar de novo',
  'A session moves sound between your ears. One tap tells you whether yours are working.':
    'Uma sessão move o som entre seus ouvidos. Um toque diz se os seus estão funcionando.',
  'Which ear did you hear the sound in?': 'Em qual ouvido você escutou o som?',
  'Perfect: stereo audio is working.': 'Perfeito: áudio estéreo funcionando.',
  'That was the other side. Your headphones may be reversed, or only one ear is connected — try again.':
    'Era o outro lado. Seus fones podem estar invertidos, ou só um lado está conectado — tente de novo.',
  'Wired headphones connected': 'Fones com fio conectados',
  'Camera and microphone allowed': 'Câmera e microfone liberados',
  'A quiet, comfortable place': 'Lugar tranquilo e confortável',
  'Enter the call': 'Entrar na chamada',
  'Back to Therapy': 'Voltar para Terapia',

  /* the call */
  'How the session goes': 'Como é a sessão',
  'You talk about how you are.': 'Vocês conversam sobre como você está.',
  'Treatment': 'Tratamento',
  'Guided audio, with your eyes closed.': 'Áudio guiado, de olhos fechados.',
  'Final conversation': 'Conversa final',
  'You talk about what you felt.': 'Vocês falam sobre o que você sentiu.',
  'Your therapist will start the treatment shortly. Keep your headphones on.':
    'A psicóloga vai iniciar o tratamento em breve. Deixe os fones no ouvido.',
  'The treatment is over. Talk about what you felt, in your own words.':
    'O tratamento terminou. Fale do que você sentiu, com suas palavras.',

  /* the treatment */
  'Treatment · guided by {name}': 'Tratamento · guiado por {name}',
  'Close your eyes and just listen.': 'Feche os olhos e apenas escute.',
  'The screen dims by itself.': 'A tela vai escurecendo aos poucos.',
  'live': 'ao vivo',
}
