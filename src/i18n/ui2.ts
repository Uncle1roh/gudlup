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
}
