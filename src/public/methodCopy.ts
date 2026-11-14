/* ============================================================================
   The methodology page's long body, in the POs' three languages

   v19 ships this section three times over — one <div class="mlang m-en"> per
   language, two of them hidden by a CSS rule keyed on the document's `lang`.
   It is one layout with three sets of words, so the port keeps one layout
   (`SiteMethod.tsx`) and three sets of words (here), lifted out of that file
   key for key.

   The nine icons are not here: they are the same nine drawings in all three
   languages, and they live beside the layout, where a drawing belongs.

   Everything here is a sentence a stranger meets on a marketing page, and
   one of them is load-bearing under the project's own rules — `evFine`,
   which says in plain words that the audio is not EMDR, DBT or any other
   named clinical modality. It is not decoration and it is not optional.
   See CLAUDE.md.
   ============================================================================ */

import type { SiteLang } from './copy'

export interface MethodBody {
  intro: { eyebrow: string; h2: string; sub: string; panelLead: string; panelRest: string }
  toolsEyebrow: string
  toolsH2: string
  tools: { h: string; t: string }[]
  stepsEyebrow: string
  stepsH2: string
  steps: { no: string; h: string; q: string; t: string }[]
  lensEyebrow: string
  lensH2: string
  lens: { tt: string; mn: string; t: string }[]
  evEyebrow: string
  evH2: string
  evLead: string
  evRest: string
  evFine: string
  thField: string
  thSays: string
  rows: { field: string; says: string }[]
  whyEyebrow: string
  whyH2: string
  why: { lead: string; rest: string }[]
  big: string
  ctaH2: string
  ctaModules: string
  ctaEnter: string
}

export const METHOD_BODY: Record<SiteLang, MethodBody> = {
  "en": {
    "intro": {
      "eyebrow": "the methodology",
      "h2": "Innovative methodology for Mental Health",
      "sub": "<b>goodloop</b>'s innovative methodology draws on decades of research in fields such as mindfulness, polyvagal theory, NLP, imagery techniques, and meditative practice — combined into a single, structured, reproducible audio experience, built on 30+ years of clinical practice and refined through 15+ years of real-world application.",
      "panelLead": "Where the innovation lives:",
      "panelRest": "not in new theory, but in the precision of how proven techniques are combined, sequenced, and delivered — so results are more reliable, more repeatable, and accessible without years of practice."
    },
    "toolsEyebrow": "the 9 tools",
    "toolsH2": "Each instrument has its role.",
    "tools": [
      {
        "h": "Dichotic Listening",
        "t": "Different sound in each ear alternately activates both brain hemispheres, drawing on bilateral-stimulation principles studied in the neuroscience literature."
      },
      {
        "h": "Imagery Rehearsal",
        "t": "Reliving an experience in a safe, guided context to rewrite its emotional meaning."
      },
      {
        "h": "Binaural Beats",
        "t": "Calibrated frequencies that guide the brain toward relaxation, focus, or emotional openness."
      },
      {
        "h": "Voice Morphing",
        "t": "The guiding voice shifts register — each archetype reaching a different layer of attention."
      },
      {
        "h": "Music & Ambient Sound",
        "t": "A soundscape of nature, texture and calibrated silence builds the safe inner space for deep work."
      },
      {
        "h": "Dual Hypnotic Induction",
        "t": "Two simultaneous voices, one per ear — opening a direct path to the unconscious."
      },
      {
        "h": "Rhythmic Loop",
        "t": "Repeating phrases and rhythms create an anchoring effect as the message settles in."
      },
      {
        "h": "Guided Breathing",
        "t": "Specific breathing patterns signal the parasympathetic system: you are safe, you can let go."
      },
      {
        "h": "Sensory Stimulation",
        "t": "Attention returns to the body, integrating the experience back into the present moment."
      }
    ],
    "stepsEyebrow": "the process",
    "stepsH2": "Six phases. One narrative arc — departure, exploration, return.",
    "steps": [
      {
        "no": "01",
        "h": "Intro + Validation",
        "q": "\"What you feel is real.\"",
        "t": "The nervous system is welcomed before it's asked to open up."
      },
      {
        "no": "02",
        "h": "Breath + Body Scan",
        "q": "\"Notice without changing.\"",
        "t": "Attention descends into the body, building the safe base."
      },
      {
        "no": "03",
        "h": "Exploration",
        "q": "\"Let emerge what wants to show itself.\"",
        "t": "With bilateral stimulation active, sensations are free to surface."
      },
      {
        "no": "04",
        "h": "Processing",
        "q": "\"Stay with this. Let it move.\"",
        "t": "Rhythmic loop and bilateral stimulation work together."
      },
      {
        "no": "05",
        "h": "Integration",
        "q": "\"What is different now?\"",
        "t": "Insight settles into a new relationship with what was blocked."
      },
      {
        "no": "06",
        "h": "Closing + Grounding",
        "q": "\"Come back here.\"",
        "t": "A gradual return to presence, carrying forward what was resolved."
      }
    ],
    "lensEyebrow": "session lengths",
    "lensH2": "Choose the time you have.",
    "lens": [
      {
        "tt": "Quick",
        "mn": "6 min",
        "t": "A short reset when time is tight."
      },
      {
        "tt": "Standard",
        "mn": "12 min",
        "t": "A full guided session."
      },
      {
        "tt": "Deep",
        "mn": "24 min",
        "t": "Room to go further, without hurry."
      }
    ],
    "evEyebrow": "the evidence",
    "evH2": "Built on clinical research.",
    "evLead": "15+ years of development and real-world application",
    "evRest": "— the GL Methodology was developed and refined directly with patients, not designed in the abstract.",
    "evFine": "<b>goodloop</b>’s audio content is inspired by principles found in this research. It is not EMDR, DBT, or any other named clinical modality, and listening to it is not equivalent to receiving those therapies from a trained clinician.",
    "thField": "Field of research",
    "thSays": "What the evidence shows",
    "rows": [
      {
        "field": "EMDR",
        "says": "Recognized by the WHO for trauma treatment; bilateral stimulation facilitates reprocessing."
      },
      {
        "field": "Mindfulness",
        "says": "Extensively studied effects on stress, anxiety regulation, and brain plasticity."
      },
      {
        "field": "Polyvagal Theory",
        "says": "Explains how the autonomic nervous system regulates responses to safety and threat."
      },
      {
        "field": "NLP",
        "says": "Anchoring and restructuring techniques used for decades in coaching and brief therapy."
      },
      {
        "field": "DBT",
        "says": "A standard reference for emotional regulation and stress tolerance."
      },
      {
        "field": "Imagery Therapy",
        "says": "Guided imagery engages the same brain areas as real experience."
      },
      {
        "field": "Meditation",
        "says": "Long-standing practice, increasingly confirmed by neuroscience."
      }
    ],
    "whyEyebrow": "why it works",
    "whyH2": "It respects how the nervous system actually operates.",
    "why": [
      {
        "lead": "Doesn't force",
        "rest": "— it invites."
      },
      {
        "lead": "Doesn't explain",
        "rest": "— it lets you experience."
      },
      {
        "lead": "Doesn't bypass defenses",
        "rest": "— it makes them temporarily unnecessary."
      },
      {
        "lead": "Doesn't work only on the mind",
        "rest": "— it speaks to the body."
      }
    ],
    "big": "The change isn't cognitive. It's somatic, emotional, deep — that's why it lasts.",
    "ctaH2": "See the methodology in practice.",
    "ctaModules": "See the modules",
    "ctaEnter": "Enter the platform →"
  },
  "it": {
    "intro": {
      "eyebrow": "la metodologia",
      "h2": "Metodologia innovativa per la Salute Mentale",
      "sub": "La metodologia innovativa di <b>goodloop</b> attinge a decenni di ricerca in ambiti come la mindfulness, la teoria polivagale, la PNL, le tecniche immaginative e la pratica meditativa — combinati in un'unica esperienza audio strutturata e riproducibile, costruita su oltre 30 anni di pratica clinica e perfezionata in oltre 15 anni di applicazione reale.",
      "panelLead": "Dove risiede l'innovazione:",
      "panelRest": "non in una nuova teoria, ma nella precisione con cui tecniche comprovate vengono combinate, sequenziate ed erogate — così i risultati sono più affidabili, più ripetibili e accessibili senza anni di pratica."
    },
    "toolsEyebrow": "i 9 strumenti",
    "toolsH2": "Ogni strumento ha il suo ruolo.",
    "tools": [
      {
        "h": "Ascolto Dicotico",
        "t": "Un suono diverso in ciascun orecchio attiva alternativamente entrambi gli emisferi cerebrali, ispirandosi ai principi di stimolazione bilaterale studiati nella letteratura neuroscientifica."
      },
      {
        "h": "Prova Immaginativa",
        "t": "Rivivere un'esperienza in un contesto sicuro e guidato per riscriverne il significato emotivo."
      },
      {
        "h": "Battiti Binaurali",
        "t": "Frequenze calibrate che guidano il cervello verso il rilassamento, la concentrazione o l'apertura emotiva."
      },
      {
        "h": "Modulazione Vocale",
        "t": "La voce guida cambia registro — ogni archetipo raggiunge un diverso livello di attenzione."
      },
      {
        "h": "Musica e Suoni Ambientali",
        "t": "Un paesaggio sonoro fatto di natura, texture e silenzi calibrati costruisce lo spazio interiore sicuro per il lavoro profondo."
      },
      {
        "h": "Induzione Ipnotica Duale",
        "t": "Due voci simultanee, una per orecchio — che aprono un accesso diretto all'inconscio."
      },
      {
        "h": "Loop Ritmico",
        "t": "Frasi e ritmi ripetuti creano un effetto di ancoraggio mentre il messaggio si consolida."
      },
      {
        "h": "Respirazione Guidata",
        "t": "Schemi respiratori specifici segnalano al sistema parasimpatico: sei al sicuro, puoi lasciare andare."
      },
      {
        "h": "Stimolazione Sensoriale",
        "t": "L'attenzione torna al corpo, integrando l'esperienza nel momento presente."
      }
    ],
    "stepsEyebrow": "il processo",
    "stepsH2": "Sei fasi. Un unico arco narrativo — partenza, esplorazione, ritorno.",
    "steps": [
      {
        "no": "01",
        "h": "Introduzione + Convalida",
        "q": "\"Quello che provi è reale.\"",
        "t": "Il sistema nervoso viene accolto prima che gli venga chiesto di aprirsi."
      },
      {
        "no": "02",
        "h": "Respiro + Scansione Corporea",
        "q": "\"Osserva senza cambiare.\"",
        "t": "L'attenzione scende nel corpo, costruendo la base sicura."
      },
      {
        "no": "03",
        "h": "Esplorazione",
        "q": "\"Lascia emergere ciò che vuole mostrarsi.\"",
        "t": "Con la stimolazione bilaterale attiva, le sensazioni sono libere di emergere."
      },
      {
        "no": "04",
        "h": "Elaborazione",
        "q": "\"Resta con questo. Lascialo muovere.\"",
        "t": "Il loop ritmico e la stimolazione bilaterale lavorano insieme."
      },
      {
        "no": "05",
        "h": "Integrazione",
        "q": "\"Cosa è diverso ora?\"",
        "t": "L'insight si consolida in una nuova relazione con ciò che era bloccato."
      },
      {
        "no": "06",
        "h": "Chiusura + Grounding",
        "q": "\"Torna qui.\"",
        "t": "Un ritorno graduale alla presenza, portando con sé ciò che è stato risolto."
      }
    ],
    "lensEyebrow": "durata delle sessioni",
    "lensH2": "Scegli il tempo che hai.",
    "lens": [
      {
        "tt": "Breve",
        "mn": "6 min",
        "t": "Una pausa rapida quando il tempo è poco."
      },
      {
        "tt": "Standard",
        "mn": "12 min",
        "t": "Una sessione guidata completa."
      },
      {
        "tt": "Profonda",
        "mn": "24 min",
        "t": "Spazio per andare più a fondo, senza fretta."
      }
    ],
    "evEyebrow": "le evidenze",
    "evH2": "Fondato sulla ricerca clinica.",
    "evLead": "Oltre 15 anni di sviluppo e applicazione reale",
    "evRest": "— il Metodo GL è stato sviluppato e perfezionato direttamente con i pazienti, non concepito in astratto.",
    "evFine": "I contenuti audio di <b>goodloop</b> si ispirano ai principi emersi da questa ricerca. Non sono EMDR, DBT né altre modalità cliniche specifiche, e il loro ascolto non equivale a ricevere tali terapie da un clinico formato.",
    "thField": "Ambito di ricerca",
    "thSays": "Cosa mostra l'evidenza",
    "rows": [
      {
        "field": "EMDR",
        "says": "Riconosciuto dall'OMS per il trattamento del trauma; la stimolazione bilaterale facilita la rielaborazione."
      },
      {
        "field": "Mindfulness",
        "says": "Effetti ampiamente studiati su stress, regolazione dell'ansia e plasticità cerebrale."
      },
      {
        "field": "Teoria Polivagale",
        "says": "Spiega come il sistema nervoso autonomo regola le risposte a sicurezza e minaccia."
      },
      {
        "field": "PNL",
        "says": "Tecniche di ancoraggio e ristrutturazione utilizzate da decenni nel coaching e nella terapia breve."
      },
      {
        "field": "DBT",
        "says": "Un riferimento consolidato per la regolazione emotiva e la tolleranza allo stress."
      },
      {
        "field": "Terapia Immaginativa",
        "says": "L'immaginazione guidata coinvolge le stesse aree cerebrali dell'esperienza reale."
      },
      {
        "field": "Meditazione",
        "says": "Pratica millenaria, sempre più confermata dalle neuroscienze."
      }
    ],
    "whyEyebrow": "perché funziona",
    "whyH2": "Rispetta il modo in cui il sistema nervoso funziona realmente.",
    "why": [
      {
        "lead": "Non forza",
        "rest": "— invita."
      },
      {
        "lead": "Non spiega",
        "rest": "— fa vivere l'esperienza."
      },
      {
        "lead": "Non aggira le difese",
        "rest": "— le rende temporaneamente superflue."
      },
      {
        "lead": "Non agisce solo sulla mente",
        "rest": "— parla al corpo."
      }
    ],
    "big": "Il cambiamento non è cognitivo. È somatico, emotivo, profondo — per questo dura nel tempo.",
    "ctaH2": "Scopri la metodologia in pratica.",
    "ctaModules": "Scopri i moduli",
    "ctaEnter": "Entra nella piattaforma →"
  },
  "pt": {
    "intro": {
      "eyebrow": "a metodologia",
      "h2": "Metodologia inovadora para a Saúde Mental",
      "sub": "A metodologia inovadora do <b>goodloop</b> se baseia em décadas de pesquisa em áreas como mindfulness, teoria polivagal, PNL, técnicas de imagens guiadas e prática meditativa — combinadas em uma única experiência de áudio estruturada e reproduzível, construída sobre mais de 30 anos de prática clínica e refinada ao longo de mais de 15 anos de aplicação real.",
      "panelLead": "Onde está a inovação:",
      "panelRest": "não em uma nova teoria, mas na precisão de como técnicas comprovadas são combinadas, sequenciadas e entregues — tornando os resultados mais confiáveis, mais repetíveis e acessíveis sem anos de prática."
    },
    "toolsEyebrow": "as 9 ferramentas",
    "toolsH2": "Cada instrumento tem seu papel.",
    "tools": [
      {
        "h": "Escuta Dicótica",
        "t": "Um som diferente em cada ouvido ativa alternadamente os dois hemisférios cerebrais, inspirado nos princípios de estimulação bilateral estudados na literatura neurocientífica."
      },
      {
        "h": "Ensaio de Imagens",
        "t": "Reviver uma experiência em um contexto seguro e guiado para reescrever seu significado emocional."
      },
      {
        "h": "Batidas Binaurais",
        "t": "Frequências calibradas que guiam o cérebro para o relaxamento, o foco ou a abertura emocional."
      },
      {
        "h": "Modulação de Voz",
        "t": "A voz condutora muda de registro — cada arquétipo alcança uma camada diferente de atenção."
      },
      {
        "h": "Música e Sons Ambientes",
        "t": "Uma paisagem sonora de natureza, texturas e silêncios calibrados constrói o espaço interno seguro para o trabalho profundo."
      },
      {
        "h": "Indução Hipnótica Dupla",
        "t": "Duas vozes simultâneas, uma por ouvido — abrindo um caminho direto ao inconsciente."
      },
      {
        "h": "Loop Rítmico",
        "t": "Frases e ritmos repetidos criam um efeito de ancoragem à medida que a mensagem se consolida."
      },
      {
        "h": "Respiração Guiada",
        "t": "Padrões respiratórios específicos sinalizam ao sistema nervoso parassimpático: você está seguro, pode deixar ir."
      },
      {
        "h": "Estimulação Sensorial",
        "t": "A atenção retorna ao corpo, integrando a experiência de volta ao momento presente."
      }
    ],
    "stepsEyebrow": "o processo",
    "stepsH2": "Seis fases. Um único arco narrativo — partida, exploração, retorno.",
    "steps": [
      {
        "no": "01",
        "h": "Introdução + Validação",
        "q": "\"O que você sente é real.\"",
        "t": "O sistema nervoso é acolhido antes de ser convidado a se abrir."
      },
      {
        "no": "02",
        "h": "Respiração + Escaneamento Corporal",
        "q": "\"Perceba sem mudar.\"",
        "t": "A atenção desce ao corpo, construindo a base segura."
      },
      {
        "no": "03",
        "h": "Exploração",
        "q": "\"Deixe emergir o que quer se mostrar.\"",
        "t": "Com a estimulação bilateral ativa, as sensações têm liberdade para emergir."
      },
      {
        "no": "04",
        "h": "Processamento",
        "q": "\"Fique com isso. Deixe se mover.\"",
        "t": "O loop rítmico e a estimulação bilateral atuam juntos."
      },
      {
        "no": "05",
        "h": "Integração",
        "q": "\"O que é diferente agora?\"",
        "t": "O insight se consolida em uma nova relação com o que estava bloqueado."
      },
      {
        "no": "06",
        "h": "Fechamento + Grounding",
        "q": "\"Volte para aqui.\"",
        "t": "Um retorno gradual à presença, levando adiante o que foi resolvido."
      }
    ],
    "lensEyebrow": "duração das sessões",
    "lensH2": "Escolha o tempo que você tem.",
    "lens": [
      {
        "tt": "Breve",
        "mn": "6 min",
        "t": "Uma pausa rápida quando o tempo é curto."
      },
      {
        "tt": "Padrão",
        "mn": "12 min",
        "t": "Uma sessão guiada completa."
      },
      {
        "tt": "Profunda",
        "mn": "24 min",
        "t": "Espaço para ir mais fundo, sem pressa."
      }
    ],
    "evEyebrow": "as evidências",
    "evH2": "Fundamentado em pesquisa clínica.",
    "evLead": "Mais de 15 anos de desenvolvimento e aplicação real",
    "evRest": "— a Metodologia GL foi desenvolvida e refinada diretamente com pacientes, não concebida de forma abstrata.",
    "evFine": "O conteúdo em áudio do <b>goodloop</b> é inspirado em princípios encontrados nessa pesquisa. Não é EMDR, DBT ou qualquer outra modalidade clínica específica, e ouvi-lo não equivale a receber essas terapias de um clínico treinado.",
    "thField": "Área de pesquisa",
    "thSays": "O que a evidência mostra",
    "rows": [
      {
        "field": "EMDR",
        "says": "Reconhecido pela OMS para o tratamento de trauma; a estimulação bilateral facilita o reprocessamento."
      },
      {
        "field": "Mindfulness",
        "says": "Efeitos amplamente estudados sobre estresse, regulação da ansiedade e plasticidade cerebral."
      },
      {
        "field": "Teoria Polivagal",
        "says": "Explica como o sistema nervoso autônomo regula as respostas de segurança e ameaça."
      },
      {
        "field": "PNL",
        "says": "Técnicas de ancoragem e reestruturação usadas há décadas em coaching e terapia breve."
      },
      {
        "field": "DBT",
        "says": "Uma referência consolidada para regulação emocional e tolerância ao estresse."
      },
      {
        "field": "Terapia de Imagens Guiadas",
        "says": "A imaginação guiada envolve as mesmas áreas cerebrais da experiência real."
      },
      {
        "field": "Meditação",
        "says": "Prática milenar, cada vez mais confirmada pela neurociência."
      }
    ],
    "whyEyebrow": "por que funciona",
    "whyH2": "Respeita como o sistema nervoso realmente funciona.",
    "why": [
      {
        "lead": "Não força",
        "rest": "— convida."
      },
      {
        "lead": "Não explica",
        "rest": "— permite vivenciar."
      },
      {
        "lead": "Não contorna as defesas",
        "rest": "— as torna temporariamente desnecessárias."
      },
      {
        "lead": "Não atua apenas na mente",
        "rest": "— fala ao corpo."
      }
    ],
    "big": "A mudança não é cognitiva. É somática, emocional, profunda — por isso dura.",
    "ctaH2": "Veja a metodologia na prática.",
    "ctaModules": "Conheça os módulos",
    "ctaEnter": "Entrar na plataforma →"
  }
}
