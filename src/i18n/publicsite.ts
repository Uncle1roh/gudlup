/* ============================================================================
   The public site: the landing, the three pages it leads to, and the door

   These are the only strings in the product that a STRANGER reads. Nobody
   has signed in, nothing is known about them, and the page is the first
   thing anybody sees of Good Loop — so the rules are, if anything, tighter
   here than inside the app.

   TWO of them shaped the copy below.

   · NO GENDER IS ASSUMED. Portuguese and Italian inflect adjectives, and
     nothing on a public page has asked who is reading. The brief's own text
     for the first phase of a session read "Você é recebido do jeito que
     está" / "Vieni accolto così come sei" — both masculine, addressed to a
     visitor whose gender the page has no way of knowing and no reason to
     ask. Rewritten so the SESSION is the subject and the sentence inflects
     for nothing: "A sessão recebe você do jeito que você está". Same
     meaning, no assumption. This is noted in the round's report.

   · GOOD LOOP MITIGATES, IT DOES NOT ASSESS. "Para empresas" may say that
     the sessions support a company's wellbeing work in the context of
     NR-1; it may not suggest psychosocial risk assessment, a risk register
     or anything that would stand in for the PGR. The page carries a card
     that says so in as many words, and the disclaimer at the foot of two
     pages says what none of it replaces.

   Both locales for every key, always: there is no English locale, so a key
   missing from one dictionary prints English at the reader.

   Keys that already exist elsewhere are REUSED rather than redefined here —
   'Sign in', 'Password' and 'How it works' are already in `it.ts`, `pt.ts`
   and `gamification.ts` with exactly these translations, and this sheet is
   merged last, so redefining them would silently rewrite them for every
   other screen that calls them.
   ============================================================================ */

export const IT_PUBLIC: Record<string, string> = {
  /* ---------------------------------------------------------- the header --- */
  'For companies': 'Per le aziende',
  'The method': 'Il metodo',
  'Open menu': 'Apri il menu',
  'Close menu': 'Chiudi il menu',
  'goodloop — home': 'goodloop — home',

  /* --------------------------------------------------------- the landing --- */
  'Calm in the middle': 'Calma nel mezzo',
  'of everything.': 'di tutto.',
  'Guided audio sessions, with voice, music, nature and breath in layers, for your people to listen to whenever they need them.':
    'Sessioni audio guidate, con voce, musica, natura e respiro a strati, da ascoltare quando i tuoi collaboratori ne hanno bisogno.',
  'Guided audio sessions, with voice, music, nature and breath in layers.':
    'Sessioni audio guidate, con voce, musica, natura e respiro a strati.',

  /* ------------------------------------------------------------ the door --- */
  'Good to have you here': 'Che bello averti qui',
  'Sign in to carry on with your pauses.': 'Accedi per continuare le tue pause.',
  'E-mail': 'E-mail',
  'name@company.com': 'nome@azienda.it',
  'Your password': 'La tua password',
  'I forgot my password': 'Password dimenticata?',
  'First time here?': 'Primo accesso?',
  'Use your company code': 'Usa il codice della tua azienda',

  /* ------------------------------------------------------- how it works --- */
  'Three steps.': 'Tre passi.',
  'One real pause.': 'Una vera pausa.',
  'No complicated sign-up, no targets to hit. You choose, put your headphones on and listen.':
    'Nessuna registrazione complicata, nessun obiettivo da raggiungere. Scegli, metti le cuffie e ascolta.',
  'Choose your moment': 'Scegli il tuo momento',
  'Before a meeting, mid-afternoon, at the end of the day. Choose by theme: focus, calm, energy, balance or growth.':
    'Prima di una riunione, a metà pomeriggio, a fine giornata. Scegli per tema: focus, calma, energia, equilibrio o crescita.',
  'Put your headphones on': 'Metti le cuffie',
  'The sessions use stereo sound: some sounds move from one ear to the other. With headphones the experience is complete.':
    'Le sessioni usano il suono stereo: alcuni suoni passano da un orecchio all’altro. Con le cuffie l’esperienza è completa.',
  'Listen for 6, 12 or 24 minutes': 'Ascolta per 6, 12 o 24 minuti',
  'Short for a breath, standard for every day, deep when you have more time.':
    'Breve per un respiro, standard per ogni giorno, profonda quando hai più tempo.',
  'What happens in a session': 'Cosa succede in una sessione',
  /* 'Breathing', 'Exploration', 'Processing', 'Integration' and 'Binaural
     beats' are NOT defined in this sheet. They already exist in `it.ts`,
     `pt.ts` and `studio-editor.ts`, and this sheet is merged last — defining
     them here would rewrite them for the Studio and the app as well. The
     first four carry the same words this page wanted anyway; the fifth does
     not, and the product's own "batimentos binaurais" / "battimenti
     binaurali" outranks the brief's "batidas" for the sake of saying one
     thing in one way. */
  'Welcome in': 'Accoglienza',
  /* Deliberately not "Vieni accolto": see the note at the top of this file. */
  'The session takes you exactly as you are.': 'La sessione ti accoglie così come sei.',
  'The body slows down and finds a safe base.': 'Il corpo rallenta e trova una base sicura.',
  'You go into the theme of the session.': 'Entri nel tema della sessione.',
  'The heart of the session, with the layers of sound at their most present.':
    'Il cuore della sessione, con gli strati sonori più presenti.',
  'What you have just lived finds its place.': 'Ciò che hai vissuto trova il suo posto.',
  'Return': 'Ritorno',
  'You come back, little by little, to your day.': 'Torni, poco a poco, alla tua giornata.',
  'In the short version, some phases are combined.': 'Nella versione breve alcune fasi sono unite.',
  'Listen to a piece of a session': 'Ascolta un estratto di una sessione',
  'Use headphones to hear the layers.': 'Usa le cuffie per percepire gli strati.',
  'Play the sample extract': 'Ascolta l’estratto di esempio',
  'Wellbeing content. It does not replace psychological or medical care.':
    'Contenuto di benessere. Non sostituisce un percorso psicologico o medico.',

  /* ------------------------------------------------------ for companies --- */
  'Pauses that find room': 'Pause che trovano spazio',
  'in your team’s routine.': 'nella routine del tuo team.',
  'Good Loop gives your people guided audio sessions, and supports your company’s wellbeing work in the context of NR-1.':
    'Good Loop offre sessioni audio guidate ai tuoi collaboratori e sostiene le iniziative di benessere della tua azienda.',
  'Book a demo': 'Prenota una demo',
  'For the people using it': 'Per chi le usa',
  'Audio sessions of 6, 12 or 24 minutes, to listen to whenever and wherever they like.':
    'Sessioni audio di 6, 12 o 24 minuti, da ascoltare quando e dove si vuole.',
  'For HR': 'Per le risorse umane',
  'Simple to switch on, invitations by company code, and participation followed in aggregate numbers.':
    'Attivazione semplice, invito con codice aziendale e monitoraggio della partecipazione con dati aggregati.',
  'For the company': 'Per l’azienda',
  'A concrete act of care for mental health, which can form part of the wellbeing measures in your programme.':
    'Un’azione concreta di cura della salute mentale, che può far parte delle misure di benessere del tuo programma.',
  'How the rollout works': 'Come funziona l’attivazione',
  'First conversation': 'Primo colloquio',
  'We get to know your team and what the programme is for.': 'Conosciamo il tuo team e gli obiettivi del programma.',
  'Invitation by code': 'Invito con codice',
  'Everyone signs in with the company code — no account created by hand in HR.':
    'Ogni collaboratore accede con il codice aziendale, senza registrazioni manuali da parte delle risorse umane.',
  'Launch': 'Lancio',
  'Internal communication material, and guided first steps inside the app.':
    'Materiali di comunicazione interna e onboarding guidato nell’app.',
  'Follow-up': 'Monitoraggio',
  'Regular reports, with anonymous and aggregate data only.': 'Report periodici solo con dati anonimi e aggregati.',
  'What Good Loop does not do': 'Cosa Good Loop non fa',
  'Good Loop does not assess psychosocial risk and does not replace the PGR, nor psychological or medical care. It is a tool for care that complements that work.':
    'Good Loop non effettua la valutazione dei rischi psicosociali e non sostituisce il DVR né un percorso psicologico o medico. È uno strumento di cura che integra queste azioni.',

  /* -------------------------------------------------------- the method --- */
  'Many layers.': 'Tanti strati.',
  'One single experience.': 'Un’unica esperienza.',
  'Every session layers voice, music, nature and breath, following a structured method drawn from approaches with a scientific basis.':
    'Ogni sessione combina voce, musica, natura e respiro a strati, seguendo un metodo strutturato e ispirato ad approcci con basi scientifiche.',
  'A waterfall of many threads of water, each one standing for a layer of sound':
    'Cascata con molti fili d’acqua, ognuno dei quali rappresenta uno strato sonoro',
  'Guide voice': 'Voce guida',
  'Music and nature': 'Musica e natura',
  'Bilateral stimulation': 'Stimolazione bilaterale',
  'Breath cues': 'Segnali di respiro',
  'Word echo': 'Eco di parole',
  'Background whisper': 'Sussurro di sottofondo',
  'Anchor phrase': 'Frase àncora',
  'Hear the layers': 'Ascolta gli strati',
  'approaches with a scientific basis': 'approcci con basi scientifiche',
  'audio tools': 'strumenti audio',
  'techniques': 'tecniche',
  'up to 8': 'fino a 8',
  'layers of sound at the same time': 'strati sonori contemporaneamente',
  'phases per session': 'fasi per sessione',
  'Inspired by approaches such as': 'Ispirato ad approcci come',
  'Mindfulness, polyvagal theory, EMDR, NLP, DBT, imagery therapy and meditation, brought together in an audio experience structured in 6 phases.':
    'Mindfulness, teoria polivagale, EMDR, PNL, DBT, terapia immaginativa e meditazione, riunite in un’esperienza audio strutturata in 6 fasi.',
}

export const PT_PUBLIC: Record<string, string> = {
  /* ---------------------------------------------------------- the header --- */
  'For companies': 'Para empresas',
  'The method': 'O método',
  'Open menu': 'Abrir menu',
  'Close menu': 'Fechar menu',
  'goodloop — home': 'goodloop — início',

  /* --------------------------------------------------------- the landing --- */
  'Calm in the middle': 'Calma no meio',
  'of everything.': 'de tudo.',
  'Guided audio sessions, with voice, music, nature and breath in layers, for your people to listen to whenever they need them.':
    'Sessões de áudio guiadas, com voz, música, natureza e respiração em camadas, para seus colaboradores ouvirem quando precisarem.',
  'Guided audio sessions, with voice, music, nature and breath in layers.':
    'Sessões de áudio guiadas, com voz, música, natureza e respiração em camadas.',

  /* ------------------------------------------------------------ the door --- */
  'Good to have you here': 'Que bom ter você aqui',
  'Sign in to carry on with your pauses.': 'Entre para continuar suas pausas.',
  'E-mail': 'E-mail',
  'name@company.com': 'nome@empresa.com.br',
  'Your password': 'Sua senha',
  'I forgot my password': 'Esqueci minha senha',
  'First time here?': 'Primeiro acesso?',
  'Use your company code': 'Use o código da sua empresa',

  /* ------------------------------------------------------- how it works --- */
  'Three steps.': 'Três passos.',
  'One real pause.': 'Uma pausa de verdade.',
  'No complicated sign-up, no targets to hit. You choose, put your headphones on and listen.':
    'Sem cadastro complicado, sem metas para bater. Você escolhe, coloca os fones e ouve.',
  'Choose your moment': 'Escolha o seu momento',
  'Before a meeting, mid-afternoon, at the end of the day. Choose by theme: focus, calm, energy, balance or growth.':
    'Antes de uma reunião, no meio da tarde, no fim do dia. Escolha pelo tema: foco, calma, energia, equilíbrio ou crescimento.',
  'Put your headphones on': 'Coloque os fones',
  'The sessions use stereo sound: some sounds move from one ear to the other. With headphones the experience is complete.':
    'As sessões usam som estéreo: alguns sons passam de um ouvido para o outro. Com fones, a experiência fica completa.',
  'Listen for 6, 12 or 24 minutes': 'Ouça por 6, 12 ou 24 minutos',
  'Short for a breath, standard for every day, deep when you have more time.':
    'Rápida para um respiro, padrão para o dia a dia, profunda quando você tiver mais tempo.',
  'What happens in a session': 'O que acontece numa sessão',
  'Welcome in': 'Acolhimento',
  /* Deliberately not "Você é recebido": see the note at the top of this file. */
  'The session takes you exactly as you are.': 'A sessão recebe você do jeito que você está.',
  'The body slows down and finds a safe base.': 'O corpo desacelera e encontra uma base segura.',
  'You go into the theme of the session.': 'Você entra no tema da sessão.',
  'The heart of the session, with the layers of sound at their most present.':
    'O coração da sessão, com as camadas de som mais presentes.',
  'What you have just lived finds its place.': 'O que foi vivido se organiza.',
  'Return': 'Retorno',
  'You come back, little by little, to your day.': 'Você volta, aos poucos, para o seu dia.',
  'In the short version, some phases are combined.': 'Na versão rápida, algumas fases são combinadas.',
  'Listen to a piece of a session': 'Ouça um trecho de uma sessão',
  'Use headphones to hear the layers.': 'Use fones de ouvido para perceber as camadas.',
  'Play the sample extract': 'Ouvir trecho de exemplo',
  'Wellbeing content. It does not replace psychological or medical care.':
    'Conteúdo de bem-estar. Não substitui acompanhamento psicológico ou médico.',

  /* ------------------------------------------------------ for companies --- */
  'Pauses that find room': 'Pausas que cabem',
  'in your team’s routine.': 'na rotina da sua equipe.',
  'Good Loop gives your people guided audio sessions, and supports your company’s wellbeing work in the context of NR-1.':
    'A Good Loop oferece sessões de áudio guiadas para seus colaboradores e apoia as ações de bem-estar da sua empresa no contexto da NR-1.',
  'Book a demo': 'Agendar demonstração',
  'For the people using it': 'Para quem usa',
  'Audio sessions of 6, 12 or 24 minutes, to listen to whenever and wherever they like.':
    'Sessões de áudio em português do Brasil, de 6, 12 ou 24 minutos, para ouvir quando e onde quiser.',
  'For HR': 'Para o RH',
  'Simple to switch on, invitations by company code, and participation followed in aggregate numbers.':
    'Implantação simples, convite por código da empresa e acompanhamento da participação em números agregados.',
  'For the company': 'Para a empresa',
  'A concrete act of care for mental health, which can form part of the wellbeing measures in your programme.':
    'Uma ação concreta de cuidado com a saúde mental, que pode fazer parte das medidas de bem-estar do seu programa.',
  'How the rollout works': 'Como é a implantação',
  'First conversation': 'Conversa inicial',
  'We get to know your team and what the programme is for.': 'Entendemos a sua equipe e os objetivos do programa.',
  'Invitation by code': 'Convite por código',
  'Everyone signs in with the company code — no account created by hand in HR.':
    'Cada colaborador entra com o código da empresa, sem cadastro manual pelo RH.',
  'Launch': 'Lançamento',
  'Internal communication material, and guided first steps inside the app.':
    'Materiais de comunicação interna e onboarding guiado no app.',
  'Follow-up': 'Acompanhamento',
  'Regular reports, with anonymous and aggregate data only.': 'Relatórios periódicos só com dados anônimos e agregados.',
  'What Good Loop does not do': 'O que a Good Loop não faz',
  'Good Loop does not assess psychosocial risk and does not replace the PGR, nor psychological or medical care. It is a tool for care that complements that work.':
    'A Good Loop não faz avaliação de riscos psicossociais e não substitui o PGR, nem acompanhamento psicológico ou médico. Ela é uma ferramenta de cuidado que complementa essas ações.',

  /* -------------------------------------------------------- the method --- */
  'Many layers.': 'Muitas camadas.',
  'One single experience.': 'Uma só experiência.',
  'Every session layers voice, music, nature and breath, following a structured method drawn from approaches with a scientific basis.':
    'Cada sessão combina voz, música, natureza e respiração em camadas, seguindo um método estruturado e inspirado em abordagens com base científica.',
  'A waterfall of many threads of water, each one standing for a layer of sound':
    'Cachoeira com muitos fios de água, cada um representando uma camada de som',
  'Guide voice': 'Voz guia',
  'Music and nature': 'Música e natureza',
  'Bilateral stimulation': 'Estímulo bilateral',
  'Breath cues': 'Sinais de respiração',
  'Word echo': 'Eco de palavras',
  'Background whisper': 'Sussurro de fundo',
  'Anchor phrase': 'Frase-âncora',
  'Hear the layers': 'Ouvir as camadas',
  'approaches with a scientific basis': 'abordagens com base científica',
  'audio tools': 'ferramentas de áudio',
  'techniques': 'técnicas',
  'up to 8': 'até 8',
  'layers of sound at the same time': 'camadas de som ao mesmo tempo',
  'phases per session': 'fases por sessão',
  'Inspired by approaches such as': 'Inspirado em abordagens como',
  'Mindfulness, polyvagal theory, EMDR, NLP, DBT, imagery therapy and meditation, brought together in an audio experience structured in 6 phases.':
    'Mindfulness, teoria polivagal, EMDR, PNL, DBT, terapia de imagens mentais e meditação, reunidas numa experiência de áudio estruturada em 6 fases.',
}
