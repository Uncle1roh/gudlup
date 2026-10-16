/* Translations for the Sound Studio and the app hub (src/studio, src/hub),
   and for the app shell around every surface: the admin preview bar and the
   error screen. Keys are the English source strings (see i18n/index.tsx).
   Merged after the base dictionaries, so a key here wins over the same key
   elsewhere — add only keys that are this lane's, or whose wording is right
   for every surface that uses them. The Studio editor's own strings live in
   studio-editor.ts. */

import { IT_STUDIO_EDITOR, PT_STUDIO_EDITOR } from './studio-editor'

const IT_SHELL: Record<string, string> = {
  // ---- hub (#hub) ----
  'One platform, every surface': 'Una piattaforma, ogni superficie',
  'Self Use app': 'App Self Use',
  'Onboarding, pathways, the 19 sessions, the immersive player, the Therapist tab, progress and check-ins. Create your own account with any email and password; enter ACME-2026 as a company code to unlock Professional Support, or NOVA-2026 for a Self-Use-only convention.':
    'Onboarding, percorsi, le 19 sessioni, il player immersivo, la scheda Terapeuta, i progressi e i check-in. Crea un account con qualsiasi email e password; inserisci ACME-2026 come codice aziendale per sbloccare il Supporto professionale, oppure NOVA-2026 per una convenzione solo Self Use.',
  'Therapist Workspace': 'Area del terapeuta',
  'Patient roster, patient card, calendar, the live session workspace with the content library the professional selects from, session reports and the sandbox.':
    'Elenco dei pazienti, scheda paziente, calendario, l’area della seduta dal vivo con la libreria di contenuti da cui sceglie il professionista, i resoconti delle sedute e la sandbox.',
  'Sponsor console': 'Console dello sponsor',
  'Setup wizard, programme totals, therapists and settings. Totals only, hidden below 25 people; no categories, no individuals.':
    'Configurazione guidata, totali del programma, terapeuti e impostazioni. Solo totali, nascosti sotto le 25 persone; nessuna categoria, nessun individuo.',
  'Content catalogue, companies, users, therapist credential approvals, data requests, reports and legal texts. Always in Italian.':
    'Catalogo dei contenuti, aziende, utenti, approvazione delle credenziali dei terapeuti, richieste dei dati, segnalazioni e testi legali. Sempre in italiano.',
  'Internal audio-authoring tool for the team and clinicians. Desktop only.':
    'Strumento interno di produzione audio per il team e i clinici. Solo da computer.',
  'Terms, notices, privacy, professional terms and previous versions — public, no login.':
    'Termini, informative, privacy, termini per i professionisti e versioni precedenti — pubblico, senza accesso.',

  // ---- admin preview bar ----
  'Admin preview': 'Anteprima amministratore',
  'demo data — nothing real is read or written': 'dati dimostrativi — niente di reale viene letto o scritto',
  'Company': 'Azienda',
  'Exit preview': 'Esci dall’anteprima',

  // ---- environment banner ----
  'Environment': 'Ambiente',
  'The database this deployment is pointed at': 'Il database a cui punta questo deployment',
  'STAGING': 'STAGING',
  'DEMO': 'DEMO',
  'LOCAL': 'LOCALE',
  'PRODUCTION': 'PRODUZIONE',

  // ---- an area switched off from the console ----
  'Temporarily unavailable': 'Temporaneamente non disponibile',
  'Please try again later.': 'Riprova più tardi.',
  'Sessions are temporarily unavailable while we fix something. Nothing you have done is lost.':
    'Le sessioni sono temporaneamente non disponibili mentre sistemiamo una cosa. Niente di quello che hai fatto è andato perso.',
  'Booking is temporarily unavailable while we fix something. Appointments you already have are unaffected.':
    'Le prenotazioni sono temporaneamente non disponibili mentre sistemiamo una cosa. Gli appuntamenti che hai già non cambiano.',
  'Video calls are temporarily unavailable while we fix something. Your appointment is still booked — your therapist will be in touch.':
    'Le videochiamate sono temporaneamente non disponibili mentre sistemiamo una cosa. Il tuo appuntamento resta prenotato — il tuo terapeuta ti contatterà.',
  'ENVIRONMENT NOT DECLARED': 'AMBIENTE NON DICHIARATO',
  'Test environment. Nothing here is real and everything can be wiped.':
    'Ambiente di test. Niente qui è reale e tutto può essere cancellato.',
  'Demonstration environment with fictional data. Not a real company.':
    'Ambiente dimostrativo con dati fittizi. Non è un’azienda reale.',
  'No database connected — this is mock data that resets when the page reloads.':
    'Nessun database collegato — sono dati finti che si azzerano al ricaricamento della pagina.',
  'VITE_APP_ENV is not set on this deployment. Treat the data as real until someone says otherwise.':
    'VITE_APP_ENV non è impostata su questo deployment. Tratta i dati come reali finché qualcuno non dice il contrario.',

  // ---- error screen ----
  'Something was interrupted': 'Qualcosa si è interrotto',
  'This screen could not load. No data has been lost: you can try again, and if that does not work, reload the page.':
    'Questa schermata non è riuscita a caricarsi. Nessun dato è andato perso: puoi riprovare, e se non funziona ricarica la pagina.',
  'Reload': 'Ricarica',
  'Back to the start': 'Torna all’inizio',
  'Technical details': 'Dettagli tecnici',
}

const PT_SHELL: Record<string, string> = {
  // ---- hub (#hub) ----
  'One platform, every surface': 'Uma plataforma, todas as superfícies',
  'Self Use app': 'App Self Use',
  'Onboarding, pathways, the 19 sessions, the immersive player, the Therapist tab, progress and check-ins. Create your own account with any email and password; enter ACME-2026 as a company code to unlock Professional Support, or NOVA-2026 for a Self-Use-only convention.':
    'Onboarding, trilhas, as 19 sessões, o player imersivo, a aba Terapeuta, progresso e check-ins. Crie sua conta com qualquer e-mail e senha; digite ACME-2026 como código da empresa para liberar o Apoio profissional, ou NOVA-2026 para um convênio só de Self Use.',
  'Therapist Workspace': 'Área do terapeuta',
  'Patient roster, patient card, calendar, the live session workspace with the content library the professional selects from, session reports and the sandbox.':
    'Lista de pacientes, ficha do paciente, agenda, a área da sessão ao vivo com a biblioteca de conteúdos que o profissional escolhe, relatórios das sessões e a sandbox.',
  'Sponsor console': 'Console do patrocinador',
  'Setup wizard, programme totals, therapists and settings. Totals only, hidden below 25 people; no categories, no individuals.':
    'Configuração guiada, totais do programa, terapeutas e ajustes. Só totais, ocultos abaixo de 25 pessoas; sem categorias, sem indivíduos.',
  'Content catalogue, companies, users, therapist credential approvals, data requests, reports and legal texts. Always in Italian.':
    'Catálogo de conteúdos, empresas, usuários, aprovação de credenciais de terapeutas, solicitações de dados, denúncias e textos legais. Sempre em italiano.',
  'Internal audio-authoring tool for the team and clinicians. Desktop only.':
    'Ferramenta interna de produção de áudio para a equipe e os clínicos. Só no computador.',
  'Terms, notices, privacy, professional terms and previous versions — public, no login.':
    'Termos, avisos, privacidade, termos para profissionais e versões anteriores — público, sem login.',

  // ---- admin preview bar ----
  'Admin preview': 'Prévia do administrador',
  'demo data — nothing real is read or written': 'dados de demonstração — nada real é lido ou gravado',
  'Company': 'Empresa',
  'Exit preview': 'Sair da prévia',

  // ---- environment banner ----
  'Environment': 'Ambiente',
  'The database this deployment is pointed at': 'O banco de dados ao qual este deployment aponta',
  'STAGING': 'STAGING',
  'DEMO': 'DEMO',
  'LOCAL': 'LOCAL',
  'PRODUCTION': 'PRODUÇÃO',

  // ---- an area switched off from the console ----
  'Temporarily unavailable': 'Temporariamente indisponível',
  'Please try again later.': 'Tente novamente mais tarde.',
  'Sessions are temporarily unavailable while we fix something. Nothing you have done is lost.':
    'As sessões estão temporariamente indisponíveis enquanto corrigimos algo. Nada do que você fez foi perdido.',
  'Booking is temporarily unavailable while we fix something. Appointments you already have are unaffected.':
    'O agendamento está temporariamente indisponível enquanto corrigimos algo. Os agendamentos que você já tem não mudam.',
  'Video calls are temporarily unavailable while we fix something. Your appointment is still booked — your therapist will be in touch.':
    'As videochamadas estão temporariamente indisponíveis enquanto corrigimos algo. Seu agendamento continua marcado — seu terapeuta entrará em contato.',
  'ENVIRONMENT NOT DECLARED': 'AMBIENTE NÃO DECLARADO',
  'Test environment. Nothing here is real and everything can be wiped.':
    'Ambiente de teste. Nada aqui é real e tudo pode ser apagado.',
  'Demonstration environment with fictional data. Not a real company.':
    'Ambiente de demonstração com dados fictícios. Não é uma empresa real.',
  'No database connected — this is mock data that resets when the page reloads.':
    'Nenhum banco de dados conectado — são dados fictícios que se apagam ao recarregar a página.',
  'VITE_APP_ENV is not set on this deployment. Treat the data as real until someone says otherwise.':
    'VITE_APP_ENV não está definida neste deployment. Trate os dados como reais até alguém dizer o contrário.',

  // ---- error screen ----
  'Something was interrupted': 'Algo foi interrompido',
  'This screen could not load. No data has been lost: you can try again, and if that does not work, reload the page.':
    'Esta tela não conseguiu carregar. Nenhum dado foi perdido: você pode tentar de novo e, se não funcionar, recarregar a página.',
  'Reload': 'Recarregar',
  'Back to the start': 'Voltar ao início',
  'Technical details': 'Detalhes técnicos',
}

export const IT_STUDIO: Record<string, string> = {
  ...IT_STUDIO_EDITOR,
  ...IT_SHELL,
}

export const PT_STUDIO: Record<string, string> = {
  ...PT_STUDIO_EDITOR,
  ...PT_SHELL,
}
