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
  '{n} Loops': '{n} Loops',
  'Results for “{q}”': 'Risultati per “{q}”',
  'Add to My List': 'Aggiungi alla mia lista',

  /* the check-in */
  'Emotional check-in': 'Check-in emotivo',
  /* the check-in: two sliders, a word, and the glasses */
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
}

export const PT_UI2: Record<string, string> = {
  /* the shell */
  'Main navigation': 'Navegação principal',
  'My path': 'Percurso',
  'My journey': 'Minha jornada',

  /* the library */
  '{n} Loops': '{n} Loops',
  'Results for “{q}”': 'Resultados para “{q}”',
  'Add to My List': 'Adicionar à minha lista',

  /* the check-in */
  'Emotional check-in': 'Check-in emocional',
  /* the check-in: two sliders, a word, and the glasses */
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
    'Percurso são trilhas desenhadas para acompanhar sua terapia. Fale com o RH da sua empresa e experimente o Good Loop para empresas, com o apoio profissional.',

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
}
