/* Translations for Self Use, the auth doors and the legal module — strings added after the legal pass.
   Keys are the English source strings (see i18n/index.tsx). Merged after the
   base dictionaries, so a key here wins over the same key elsewhere. */

export const IT_SELFUSE_EXTRA: Record<string, string> = {
  /* ---- the pathways: what each is for, the week focus lines, the when ---- */
  '4 weeks': '4 settimane',
  '6 weeks': '6 settimane',
  '4–6 weeks': '4–6 settimane',
  'For anyone who has to perform under pressure: a crowded mind, trouble concentrating, nerves before you go on, putting things off as a deadline closes in.':
    'Per chi deve rendere sotto pressione: la mente affollata, la fatica a concentrarsi, il nervosismo prima di entrare in scena, il rimandare mentre una scadenza si avvicina.',
  'A progressive series for the moments of a working day: first calm is recovered, then demands are reorganised, then boundaries are protected, and finally confidence is consolidated.':
    'Una serie progressiva per i momenti di una giornata di lavoro: prima si ritrova la calma, poi si riorganizzano le richieste, poi si proteggono i confini e infine si consolida la fiducia.',
  'The first session of rest. It does not ask you to do anything — its whole job is to let you stop.':
    'La prima sessione di riposo. Non ti chiede di fare nulla: il suo unico compito è lasciarti fermare.',
  'For the part of rest that comes after stopping. Quiet, restful, and deliberately slow.':
    'Per la parte del riposo che viene dopo essersi fermati. Quieta, distensiva e volutamente lenta.',
  'Recovering alert calm': 'Ritrovare una calma vigile',
  'Handling situational pressure': 'Gestire la pressione del momento',
  'Centring and presence': 'Centratura e presenza',
  'Turning calm into action': 'Trasformare la calma in azione',
  'Recovering a state of calm': 'Ritrovare uno stato di calma',
  'Reorganising the load': 'Riorganizzare il carico',
  'Building boundaries': 'Costruire confini',
  'Confidence and anchoring': 'Fiducia e radicamento',
  'Consolidation': 'Consolidamento',
  'Consolidation and resilience': 'Consolidamento e resilienza',
  'Keeping it going': 'Mantenere il ritmo',
  'The right to recover': 'Il diritto di recuperare',
  'Deep regeneration': 'Rigenerazione profonda',
  'Recharging motivation': 'Ricaricare la motivazione',
  'Psychological detachment': 'Staccare con la mente',
  'Relational and organisational boundaries': 'Confini nelle relazioni e nel lavoro',
  'Reconnecting with yourself': 'Ritrovare il contatto con te',
  'Realigning with what matters': 'Riallinearsi a ciò che conta',
  'Sustainability and resources': 'Sostenibilità e risorse',
  'Inner strength': 'Forza interiore',
  'Openness to change': 'Apertura al cambiamento',
  'Transforming difficulty': 'Trasformare le difficoltà',
  'Relationships that support you': 'Relazioni che ti sostengono',
  'Integration and consolidation': 'Integrazione e consolidamento',
  'The longer view': 'Uno sguardo più lungo',
  'before a meeting': 'prima di una riunione',
  'at the start of the day': 'all’inizio della giornata',
  'at the weekend': 'nel fine settimana',
  'to close the day': 'per chiudere la giornata',
  'when it gets too much': 'quando diventa troppo',

  /* ---- the demo therapists (profile copy, shown in the Therapist tab) ---- */
  'Specializing in stress management and burnout prevention. 12 years of clinical experience.':
    'Si occupa di gestione dello stress e prevenzione del burnout. 12 anni di esperienza clinica.',
  'Focused on anxiety and resilience building with an integrative, evidence-based approach.':
    'Lavora su ansia e resilienza con un approccio integrato e basato sulle evidenze.',
  'Works with stress, balance and sustainable working habits.':
    'Lavora su stress, equilibrio e abitudini di lavoro sostenibili.',
  'Work-life balance': 'Equilibrio vita-lavoro',
  'English': 'Inglese',
  'Portuguese': 'Portoghese',
  'Spanish': 'Spagnolo',
  'Italian': 'Italiano',
  'Reduce anticipatory anxiety before meetings': 'Ridurre l’ansia anticipatoria prima delle riunioni',
  'Re-establish an evening wind-down routine': 'Ristabilire una routine serale per staccare',

  /* ---- the tutorial and Profile → How Good Loop works ---- */
  'Good Loop uses stereo audio. Always use wired stereo headphones for the full experience.':
    'Good Loop usa l’audio stereo. Usa sempre cuffie stereo con filo per l’esperienza completa.',

  /* ---- the before/after faces (their spoken names) ---- */
  'Very distressed': 'Molto in difficoltà',
  'Somewhat distressed': 'Un po’ in difficoltà',
  'Very good': 'Molto bene',

  /* ---- Privacy: what the sponsor supplied (SET-7) ---- */
  'company code': 'codice aziendale',

  /* ---- the crisis sheet's seed numbers (labels; configured rows are as typed) ---- */
  'Emergency': 'Emergenza',
  'Police': 'Polizia',
  '24h · free': '24h · gratuito',

  /* ---- the professional's consent form: the eight item headings ---- */
  'The nature and purpose of the sessions': 'La natura e lo scopo delle sedute',
  'Working at a distance, and what that means': 'Il lavoro a distanza e cosa comporta',
  'The limits of the medium and what happens if the connection fails': 'I limiti del mezzo e cosa succede se la connessione cade',
  'Confidentiality and its limits': 'La riservatezza e i suoi limiti',
  'How records are kept, where, for how long and who may access them': 'Come sono conservate le annotazioni, dove, per quanto tempo e chi può accedervi',
  'What happens if you are at risk': 'Cosa succede se sei a rischio',
  'What happens if the person is at risk': 'Cosa succede se la persona è a rischio',
  'Fees and cancellation': 'Compensi e disdetta',
  'The alternatives to working at a distance': 'Le alternative al lavoro a distanza',

  /* ---- the progress reports (PDF) ---- */
  'Personal wellbeing summary': 'Riepilogo personale di benessere',
  'Monthly summary': 'Riepilogo mensile',
  'Your Good Loop summary  ·  {label}  ·  page {page} of {total}': 'Il tuo riepilogo Good Loop  ·  {label}  ·  pagina {page} di {total}',
  'Generated {date}': 'Creato il {date}',
  'This is your own record of what you did and how you rated your weeks. It is a wellbeing summary, not a clinical assessment, and no one else receives it.':
    'È il tuo registro di cosa hai fatto e di come hai valutato le tue settimane. È un riepilogo di benessere, non una valutazione clinica, e nessun altro lo riceve.',
  'Sessions completed': 'Sessioni completate',
  'Total minutes': 'Minuti totali',
  'Current streak': 'Serie attuale',
  '{n} day(s)': '{n} giorni',
  'Pathway': 'Percorso',
  'No sessions this month.': 'Nessuna sessione questo mese.',
  'No check-in completed this month.': 'Nessun check-in completato questo mese.',
  'Dimension': 'Dimensione',
  'Latest': 'Ultimo',
  'Direction': 'Andamento',
  'Daily mood': 'Umore del giorno',
  'No mood entries this month.': 'Nessun umore registrato questo mese.',
  'How the day felt': 'Com’è andata la giornata',
  'Days': 'Giorni',
  'Days recorded': 'Giorni registrati',
  'Therapy summary': 'Riepilogo delle sedute',
  'Therapy summary  ·  {person}  ·  {therapist}  ·  page {page} of {total}': 'Riepilogo delle sedute  ·  {person}  ·  {therapist}  ·  pagina {page} di {total}',
  'With {name} · generated {date}': 'Con {name} · creato il {date}',
  'This summary is yours. The before-and-after check is your own, one tap either side of a session. The clinical scales were administered by your therapist - they are clinical measures and are best read together with them, not alone.':
    'Questo riepilogo è tuo. Il controllo prima e dopo è il tuo, un tocco prima e uno dopo ogni seduta. Le scale cliniche sono state somministrate dal tuo terapeuta: sono misure cliniche e vanno lette insieme a lui o a lei, non da soli.',
  'Weeks in therapy': 'Settimane di percorso',
  'No sessions recorded yet.': 'Ancora nessuna seduta registrata.',
  'How you felt, before and after': 'Come ti sentivi, prima e dopo',
  'Not recorded.': 'Non registrato.',
  'Change': 'Variazione',
  'One tap before each session and one after, on a five-point scale. A positive change means you finished the session feeling better than you started it. Your therapist sees the same figures.':
    'Un tocco prima di ogni seduta e uno dopo, su una scala a cinque punti. Una variazione positiva vuol dire che hai finito la seduta sentendoti meglio di come l’avevi iniziata. Il tuo terapeuta vede gli stessi numeri.',
  'Clinical scales': 'Scale cliniche',
  'None administered yet.': 'Nessuna ancora somministrata.',
  'Instrument': 'Strumento',
  'First': 'Primo',
  'Measured': 'Rilevato',
  'Clinical scales are administered under your therapist’s supervision. A number on its own is not a diagnosis, and the change over time is what they look at with you.':
    'Le scale cliniche sono somministrate sotto la supervisione del tuo terapeuta. Un numero da solo non è una diagnosi: è il cambiamento nel tempo che guardate insieme.',
  'No goals set.': 'Nessun obiettivo impostato.',
  'achieved': 'raggiunto',
  'in progress': 'in corso',
}

export const PT_SELFUSE_EXTRA: Record<string, string> = {
  /* ---- the weekly check-in: questions, scale ends and trends ---- */
  'How has your energy been this week?': 'Como esteve sua energia esta semana?',
  'How well have you been sleeping?': 'Como você tem dormido?',
  'How easy has it been to concentrate?': 'Quão fácil tem sido se concentrar?',
  'How motivated have you felt?': 'Quão motivado(a) você tem se sentido?',
  'How balanced has your week felt?': 'Quão equilibrada foi a sua semana?',
  'Very low': 'Muito baixa',
  'Very high': 'Muito alta',
  'Very poorly': 'Muito mal',
  'Very easy': 'Muito fácil',
  'Very hard': 'Muito difícil',
  'Not at all': 'Nada',
  'Very balanced': 'Muito equilibrada',
  'No change': 'Sem mudança',
  'Stable': 'Estável',
  'Trending up': 'Em alta',
  'Trending down': 'Em baixa',
  'Over the last two weeks…': 'Nas últimas duas semanas…',

  /* ---- the pathway finder ---- */
  "I'm not sure yet": 'Ainda não sei',
  "What's your main challenge right now?": 'Qual é o seu principal desafio agora?',
  "We've suggested this as a great starting point. You can explore other pathways anytime.":
    'Sugerimos este como um bom ponto de partida. Você pode explorar outros percursos quando quiser.',

  /* ---- the pathways: what each is for, the week focus lines, the when ---- */
  'Week by week': 'Semana a semana',
  "This week's sessions are done. Anything more is a bonus.": 'As sessões desta semana estão feitas. O que vier a mais é bônus.',
  '4 weeks': '4 semanas',
  '6 weeks': '6 semanas',
  '4–6 weeks': '4–6 semanas',
  'For anyone who has to perform under pressure: a crowded mind, trouble concentrating, nerves before you go on, putting things off as a deadline closes in.':
    'Para quem precisa render sob pressão: a mente cheia, a dificuldade de se concentrar, o nervosismo antes de entrar em cena, o adiar enquanto um prazo se aproxima.',
  'A progressive series for the moments of a working day: first calm is recovered, then demands are reorganised, then boundaries are protected, and finally confidence is consolidated.':
    'Uma série progressiva para os momentos de um dia de trabalho: primeiro recupera-se a calma, depois reorganizam-se as demandas, depois protegem-se os limites e, por fim, consolida-se a confiança.',
  'The first session of rest. It does not ask you to do anything — its whole job is to let you stop.':
    'A primeira sessão de descanso. Ela não pede que você faça nada — seu único trabalho é deixar você parar.',
  'For the part of rest that comes after stopping. Quiet, restful, and deliberately slow.':
    'Para a parte do descanso que vem depois de parar. Quieta, repousante e deliberadamente lenta.',
  'Recovering alert calm': 'Recuperar uma calma atenta',
  'Handling situational pressure': 'Lidar com a pressão do momento',
  'Centring and presence': 'Centramento e presença',
  'Turning calm into action': 'Transformar a calma em ação',
  'Recovering a state of calm': 'Recuperar um estado de calma',
  'Reorganising the load': 'Reorganizar a carga',
  'Building boundaries': 'Construir limites',
  'Confidence and anchoring': 'Confiança e ancoragem',
  'Consolidation': 'Consolidação',
  'Consolidation and resilience': 'Consolidação e resiliência',
  'Keeping it going': 'Manter o ritmo',
  'The right to recover': 'O direito de se recuperar',
  'Deep regeneration': 'Regeneração profunda',
  'Recharging motivation': 'Recarregar a motivação',
  'Psychological detachment': 'Desligar a mente do trabalho',
  'Relational and organisational boundaries': 'Limites nas relações e no trabalho',
  'Reconnecting with yourself': 'Reconectar-se consigo',
  'Realigning with what matters': 'Realinhar-se com o que importa',
  'Sustainability and resources': 'Sustentabilidade e recursos',
  'Inner strength': 'Força interior',
  'Openness to change': 'Abertura à mudança',
  'Transforming difficulty': 'Transformar as dificuldades',
  'Relationships that support you': 'Relações que apoiam você',
  'Integration and consolidation': 'Integração e consolidação',
  'The longer view': 'Um olhar mais longo',
  'before a meeting': 'antes de uma reunião',
  'at the start of the day': 'no início do dia',
  'at the weekend': 'no fim de semana',
  'to close the day': 'para fechar o dia',
  'when it gets too much': 'quando fica demais',

  /* ---- the session flow ---- */
  "Let's check your headphones": 'Vamos verificar seus fones',
  "End session early? Your progress won't be saved.": 'Encerrar a sessão antes? Seu progresso não será salvo.',

  /* ---- support ---- */
  "We're here to help you find support": 'Estamos aqui para ajudar você a encontrar apoio',
  "If you're going through a difficult moment, you don't have to face it alone. These resources can help right now.":
    'Se você está passando por um momento difícil, não precisa enfrentá-lo sozinho(a). Estes recursos podem ajudar agora.',
  'Free, confidential support line': 'Linha de apoio gratuita e confidencial',

  /* ---- the Therapist tab ---- */
  "Good Loop also offers guided sessions with licensed professionals, available through your company's extended plan.":
    'O Good Loop também oferece sessões guiadas com profissionais habilitados, disponíveis pelo plano estendido da sua empresa.',
  'Pick a time above': 'Escolha um horário acima',
  "You'll receive a notification when your therapist confirms.": 'Você receberá uma notificação quando seu terapeuta confirmar.',
  "You're all set.": 'Tudo pronto.',
  'Clinical Psychologist': 'Psicólogo(a) clínico(a)',
  'Specializing in stress management and burnout prevention. 12 years of clinical experience.':
    'Especialista em manejo do estresse e prevenção do burnout. 12 anos de experiência clínica.',
  'Focused on anxiety and resilience building with an integrative, evidence-based approach.':
    'Trabalha com ansiedade e construção de resiliência, com uma abordagem integrativa e baseada em evidências.',
  'Works with stress, balance and sustainable working habits.':
    'Trabalha com estresse, equilíbrio e hábitos de trabalho sustentáveis.',
  'Work-life balance': 'Equilíbrio entre vida e trabalho',
  'English': 'Inglês',
  'Portuguese': 'Português',
  'Spanish': 'Espanhol',
  'Italian': 'Italiano',
  'Reduce anticipatory anxiety before meetings': 'Reduzir a ansiedade antecipatória antes de reuniões',
  'Re-establish an evening wind-down routine': 'Restabelecer uma rotina noturna para desacelerar',

  /* ---- the plan names ---- */
  'Self Use': 'Uso autônomo',
  'Self Use + Professional Support': 'Uso autônomo + Apoio profissional',

  /* ---- Profile ---- */
  'High': 'Alta',
  'Good Loop uses stereo audio. Always use wired stereo headphones for the full experience.':
    'O Good Loop usa áudio estéreo. Use sempre fones estéreo com fio para a experiência completa.',

  /* ---- the before/after faces (their spoken names) ---- */
  'Very distressed': 'Muito mal',
  'Somewhat distressed': 'Um pouco mal',
  'Very good': 'Muito bem',

  /* ---- Privacy: what the sponsor supplied (SET-7) ---- */
  'company code': 'código da empresa',

  /* ---- the crisis sheet's seed numbers (labels; configured rows are as typed) ---- */
  'Emergency': 'Emergência',
  'Police': 'Polícia',
  '24h · free': '24h · gratuito',

  /* ---- the professional's consent form: the eight item headings ---- */
  'The nature and purpose of the sessions': 'A natureza e a finalidade das sessões',
  'Working at a distance, and what that means': 'O atendimento a distância e o que isso significa',
  'The limits of the medium and what happens if the connection fails': 'Os limites do meio e o que acontece se a conexão cair',
  'Confidentiality and its limits': 'O sigilo e os seus limites',
  'How records are kept, where, for how long and who may access them': 'Como os registros são guardados, onde, por quanto tempo e quem pode acessá-los',
  'What happens if you are at risk': 'O que acontece se você estiver em risco',
  'What happens if the person is at risk': 'O que acontece se a pessoa estiver em risco',
  'Fees and cancellation': 'Honorários e cancelamento',
  'The alternatives to working at a distance': 'As alternativas ao atendimento a distância',

  /* ---- the progress reports (PDF) ---- */
  'Personal wellbeing summary': 'Resumo pessoal de bem-estar',
  'Monthly summary': 'Resumo mensal',
  'Your Good Loop summary  ·  {label}  ·  page {page} of {total}': 'Seu resumo Good Loop  ·  {label}  ·  página {page} de {total}',
  'Generated {date}': 'Gerado em {date}',
  'This is your own record of what you did and how you rated your weeks. It is a wellbeing summary, not a clinical assessment, and no one else receives it.':
    'Este é o seu próprio registro do que você fez e de como avaliou suas semanas. É um resumo de bem-estar, não uma avaliação clínica, e ninguém mais o recebe.',
  'Sessions completed': 'Sessões concluídas',
  'Total minutes': 'Minutos no total',
  'Current streak': 'Sequência atual',
  '{n} day(s)': '{n} dia(s)',
  'Pathway': 'Percurso',
  'No sessions this month.': 'Nenhuma sessão este mês.',
  'No check-in completed this month.': 'Nenhum check-in concluído este mês.',
  'Dimension': 'Dimensão',
  'Latest': 'Último',
  'Direction': 'Tendência',
  'Daily mood': 'Humor do dia',
  'No mood entries this month.': 'Nenhum registro de humor este mês.',
  'How the day felt': 'Como foi o dia',
  'Days': 'Dias',
  'Days recorded': 'Dias registrados',
  'Therapy summary': 'Resumo das sessões',
  'Therapy summary  ·  {person}  ·  {therapist}  ·  page {page} of {total}': 'Resumo das sessões  ·  {person}  ·  {therapist}  ·  página {page} de {total}',
  'With {name} · generated {date}': 'Com {name} · gerado em {date}',
  'This summary is yours. The before-and-after check is your own, one tap either side of a session. The clinical scales were administered by your therapist - they are clinical measures and are best read together with them, not alone.':
    'Este resumo é seu. A verificação de antes e depois é sua, um toque antes e outro depois de cada sessão. As escalas clínicas foram aplicadas pelo seu terapeuta — são medidas clínicas e devem ser lidas junto com ele ou ela, não sozinho(a).',
  'Weeks in therapy': 'Semanas de acompanhamento',
  'No sessions recorded yet.': 'Nenhuma sessão registrada ainda.',
  'How you felt, before and after': 'Como você se sentiu, antes e depois',
  'Not recorded.': 'Não registrado.',
  'Change': 'Variação',
  'One tap before each session and one after, on a five-point scale. A positive change means you finished the session feeling better than you started it. Your therapist sees the same figures.':
    'Um toque antes de cada sessão e outro depois, numa escala de cinco pontos. Uma variação positiva significa que você terminou a sessão se sentindo melhor do que começou. Seu terapeuta vê os mesmos números.',
  'Clinical scales': 'Escalas clínicas',
  'None administered yet.': 'Nenhuma aplicada ainda.',
  'Instrument': 'Instrumento',
  'First': 'Primeiro',
  'Measured': 'Medido em',
  'Clinical scales are administered under your therapist’s supervision. A number on its own is not a diagnosis, and the change over time is what they look at with you.':
    'As escalas clínicas são aplicadas sob a supervisão do seu terapeuta. Um número sozinho não é um diagnóstico: é a mudança ao longo do tempo que vocês olham juntos.',
  'No goals set.': 'Nenhum objetivo definido.',
  'achieved': 'alcançado',
  'in progress': 'em andamento',
}
