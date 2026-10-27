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
}
