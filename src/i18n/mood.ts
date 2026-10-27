/* The emotional check-in (src/mood). Keys are the English source strings.

   The WORDS a person chooses are NOT here — they live in
   src/mood/moodColor.ts, per locale, because naming an emotion only works
   in the person's own language and that table is the spec's, verbatim.
   Everything in this file is the furniture around them.

   Copy rule (spec § "O que podemos afirmar"): nothing here says the colour
   improves anything. It mirrors a state and makes it nameable, and the
   wording stays on that side of the line in both languages. */

export const IT_MOOD: Record<string, string> = {
  'Emotional check-in': 'Check-in emotivo',
  'How are you right now?': 'Come stai adesso?',
  'about 10 seconds': 'circa 10 secondi',
  'Which word fits best?': 'Quale parola ti descrive meglio?',
  'Today you feel: {word}': 'Oggi ti senti: {word}',
  'Noted. No word this time.': 'Segnato. Nessuna parola, stavolta.',
  'Check-in done · tap to change': 'Check-in fatto · tocca per cambiarlo',
  'And now?': 'E adesso?',
  'Before and after': 'Prima e dopo',
  'no word': 'nessuna parola',

  /* the two axes */
  'agitated': 'agitato',
  'calm': 'calmo',
  'pleasant': 'piacevole',
  'unpleasant': 'spiacevole',
  'Where are you? Left is unpleasant, right is pleasant, down is calm, up is agitated. Use the arrow keys.':
    'Dove sei? A sinistra spiacevole, a destra piacevole, in basso calmo, in alto agitato. Usa le frecce.',
  '{pleasantness}, {energy}': '{pleasantness}, {energy}',
  'rather pleasant': 'piuttosto piacevole',
  'rather unpleasant': 'piuttosto spiacevole',
  'rather agitated': 'piuttosto agitato',
  'rather calm': 'piuttosto calmo',

  'This stays on your device: you have not switched on saving your wellbeing check-ins.':
    'Resta su questo dispositivo: non hai attivato il salvataggio dei tuoi check-in di benessere.',

  /* ---- Home, redesigned (the billboard, the search, the chips) ---- */
  'Featured this week': 'In evidenza questa settimana',
  'Listen now': 'Ascolta ora',
  'About this session': 'Su questa sessione',
  'Search the library': 'Cerca nella biblioteca',
  'Search by feeling, goal or session': 'Cerca per sensazione, obiettivo o sessione',
  'All': 'Tutti',

  /* ---- phase 4: the rest of the surface ---- */
  'Your check-ins': 'I tuoi check-in',
  'A check-in takes about ten seconds: where you are, and a word for it. It is yours — nobody else sees it.': 'Un check-in dura una decina di secondi: dove sei e una parola per dirlo. È tuo: nessun altro lo vede.',
  'Your last session, before and after': 'La tua ultima sessione, prima e dopo',
  'Check in now': 'Fai un check-in',
  'Session with {name} · today {time}': 'Seduta con {name} · oggi alle {time}',
  'Confidential: your employer does not see your sessions.': 'Riservato: la tua azienda non vede le tue sedute.',
  'Enter': 'Entra',
  'Before you go in': 'Prima di entrare',
  'Camera and microphone': 'Fotocamera e microfono',
  'working': 'funzionano',
  'not ready': 'non pronti',
  'Wired stereo headphones': 'Cuffie stereo con filo',
  'Test left and right': 'Prova destra e sinistra',
  'A quiet place where you will not be interrupted': 'Un posto tranquillo dove nessuno ti interrompe',
  'My journey': 'Il mio percorso',
  'Talk to a psychologist': 'Parla con uno psicologo',
  'Sessions by video with a licensed professional.': 'Sedute in videochiamata con un professionista abilitato.',
}

export const PT_MOOD: Record<string, string> = {
  'Emotional check-in': 'Check-in emocional',
  'How are you right now?': 'Como você está agora?',
  'about 10 seconds': 'cerca de 10 segundos',
  'Which word fits best?': 'Qual palavra descreve melhor?',
  'Today you feel: {word}': 'Hoje você se sente: {word}',
  'Noted. No word this time.': 'Anotado. Sem palavra desta vez.',
  'Check-in done · tap to change': 'Check-in feito · toque para mudar',
  'And now?': 'E agora?',
  'Before and after': 'Antes e depois',
  'no word': 'sem palavra',

  'agitated': 'agitado',
  'calm': 'calmo',
  'pleasant': 'agradável',
  'unpleasant': 'desagradável',
  'Where are you? Left is unpleasant, right is pleasant, down is calm, up is agitated. Use the arrow keys.':
    'Onde você está? À esquerda desagradável, à direita agradável, embaixo calmo, em cima agitado. Use as setas.',
  '{pleasantness}, {energy}': '{pleasantness}, {energy}',
  'rather pleasant': 'mais para agradável',
  'rather unpleasant': 'mais para desagradável',
  'rather agitated': 'mais para agitado',
  'rather calm': 'mais para calmo',

  'This stays on your device: you have not switched on saving your wellbeing check-ins.':
    'Isto fica no seu aparelho: você não ativou o salvamento dos seus check-ins de bem-estar.',

  /* ---- Home, redesigned (the billboard, the search, the chips) ---- */
  'Featured this week': 'Em destaque esta semana',
  'Listen now': 'Ouvir agora',
  'About this session': 'Sobre esta sessão',
  'Search the library': 'Buscar na biblioteca',
  'Search by feeling, goal or session': 'Buscar por sentimento, objetivo ou protocolo',
  'All': 'Todos',

  /* ---- phase 4: the rest of the surface ---- */
  'Your check-ins': 'Seus check-ins',
  'A check-in takes about ten seconds: where you are, and a word for it. It is yours — nobody else sees it.': 'Um check-in leva uns dez segundos: onde você está e uma palavra para isso. É seu — mais ninguém vê.',
  'Your last session, before and after': 'Sua última sessão, antes e depois',
  'Check in now': 'Fazer um check-in',
  'Session with {name} · today {time}': 'Sessão com {name} · hoje às {time}',
  'Confidential: your employer does not see your sessions.': 'Sigiloso: sua empresa não vê suas sessões.',
  'Enter': 'Entrar',
  'Before you go in': 'Antes de entrar',
  'Camera and microphone': 'Câmera e microfone',
  'working': 'funcionando',
  'not ready': 'não estão prontos',
  'Wired stereo headphones': 'Fones estéreo com fio',
  'Test left and right': 'Testar direita e esquerda',
  'A quiet place where you will not be interrupted': 'Um lugar tranquilo, sem interrupções',
  'My journey': 'Minha jornada',
  'Talk to a psychologist': 'Falar com um psicólogo',
  'Sessions by video with a licensed professional.': 'Sessões por videochamada com um profissional registrado.',
}
