/* ============================================================================
   Good Loop — legal and safety message catalogue

   Every legal or safety string the product shows lives HERE, keyed by the
   Message ID of the Messages_by_Screen sheet in
   GoodLoop_MVP_Legal_Feature_Register_v5_PathA.xlsx (the build master for all
   in-product legal wording). Requirement ADM-09; prohibition MN-26 ("no legal
   or safety copy hard-coded outside the message catalogue").

   Why a catalogue by ID and not plain t() keys: a regulator, counsel or a QA
   reading a screen must be able to trace a sentence back to the register row
   that required it, its tier and its word budget. The ID is that trace. The
   texts are otherwise resolved exactly like t(): by the interface locale, with
   the English baseline as the fallback.

   The pt-BR and Italian texts are the FIRST DRAFTS carried by the register
   (column L/M). They are the governing versions in their markets and still
   have to be confirmed by counsel — see Part VI.4 of the Terms deliverable.
   Where the register leaves a language blank (the string is not used in that
   market), a draft in the same register is kept so a person who has switched
   the interface language never meets an English sentence at the moment it
   matters; those are marked "draft — not in register".

   Tiers (Disclosure_Model sheet):
     A  one-time, requires an action        (no hard limit)
     B  persistent but tiny                 (≤ 12 words)
     B* safety repeat                       (≤ 12 words) — the driving note only
     C  first occurrence only               (≤ 30 words)
     D  built into ordinary interface       (≤ 15 words)
     E  pull only                           (n/a)
   [Brackets] in the register are runtime variables; here they are {vars}
   interpolated the same way t() does, so a string reads identically wherever
   it is printed.
   ============================================================================ */

import type { Locale } from '../i18n'

/** Where a person lives, for legal purposes. Drives crisis numbers, the
    withdrawal period (7 days BR / 14 days EU), the governing annex and the
    supervisory authority (ONB-04). Never a hard-coded branch in a screen. */
export type Market = 'BR' | 'EU'

export type Tier = 'A' | 'B' | 'B*' | 'C' | 'D' | 'E' | 'on-demand'

export interface LegalMessage {
  tier: Tier
  /** Market the string is used in. Absent = both. */
  market?: Market
  en: string
  'pt-BR': string
  it: string
}

export const LEGAL_MESSAGES = {
  /* ---- website ---------------------------------------------------------- */
  'WEB-1': { tier: 'B', market: 'BR',
    en: 'In crisis? Call 188 (CVV) or 192 (SAMU).',
    'pt-BR': 'Em crise? Ligue 188 (CVV) ou 192 (SAMU).',
    it: 'In crisi? Chiama 188 (CVV) o 192 (SAMU).' }, // draft — not in register
  'WEB-1-EU': { tier: 'B', market: 'EU',
    en: 'In crisis? Call 112.',
    'pt-BR': 'Em crise? Ligue 112.', // draft — not in register
    it: 'In crisi? Chiama il 112.' },
  'WEB-3': { tier: 'A',
    en: 'Relaxation sessions for everyday moments. Good Loop is a wellbeing app — not a medical device and not treatment.',
    'pt-BR': 'Sessões de relaxamento para os momentos do dia a dia. O Good Loop é um aplicativo de bem-estar — não é dispositivo médico nem tratamento.',
    it: 'Sessioni di rilassamento per i momenti di ogni giorno. Good Loop è un\'app di benessere — non è un dispositivo medico né un trattamento.' },

  /* ---- onboarding ------------------------------------------------------- */
  'ONB-1.1': { tier: 'A',
    en: 'Good Loop is for adults. What\'s your date of birth?',
    'pt-BR': 'O Good Loop é para adultos. Qual é a sua data de nascimento?',
    it: 'Good Loop è per adulti. Qual è la tua data di nascita?' },
  'ONB-1.2': { tier: 'A',
    en: 'Where do you live? This sets your emergency numbers, language and legal terms.',
    'pt-BR': 'Onde você mora? Isso define os seus números de emergência, o idioma e os termos legais.',
    it: 'Dove vivi? Questo imposta i tuoi numeri di emergenza, la lingua e i termini legali.' },
  'ONB-1.3': { tier: 'A',
    en: 'Sorry — Good Loop is only for people aged 18 and over.',
    'pt-BR': 'O Good Loop é apenas para maiores de 18 anos.',
    it: 'Good Loop è riservato ai maggiori di 18 anni.' },
  'ONB-1.4': { tier: 'A',
    en: 'Good Loop isn\'t available in your country yet.',
    'pt-BR': 'O Good Loop ainda não está disponível no seu país.',
    it: 'Good Loop non è ancora disponibile nel tuo Paese.' },
  'ONB-2.1': { tier: 'A',
    en: 'There are two ways to use Good Loop. On your own, it\'s for relaxation — not treatment or therapy. With a licensed professional, they provide your care and Good Loop is where it happens.',
    'pt-BR': 'Há duas formas de usar o Good Loop. Sozinho, ele serve para relaxar — não é tratamento nem terapia. Com um profissional habilitado, é ele quem cuida de você, e o Good Loop é o lugar onde isso acontece.',
    it: 'Ci sono due modi di usare Good Loop. Da solo, serve per rilassarti — non è un trattamento né una terapia. Con un professionista abilitato, è lui che si occupa di te e Good Loop è il luogo in cui questo avviene.' },
  'ONB-2.2': { tier: 'A',
    en: 'I understand Good Loop isn\'t for emergencies. If I\'m at risk, I\'ll use Help now or call emergency services.',
    'pt-BR': 'Entendo que o Good Loop não é para emergências. Se eu estiver em risco, vou usar o Ajuda agora ou ligar para os serviços de emergência.',
    it: 'Capisco che Good Loop non è per le emergenze. Se sono a rischio, userò Aiuto subito o chiamerò i servizi di emergenza.' },
  'ONB-2.3': { tier: 'A',
    en: 'Help now is always in the menu. One tap shows emergency numbers.',
    'pt-BR': 'O Ajuda agora fica sempre no menu. Um toque mostra os números de emergência.',
    it: 'Aiuto subito è sempre nel menu. Un tocco mostra i numeri di emergenza.' },
  'ONB-3.1': { tier: 'A',
    en: 'I accept the Terms and the notices that form part of them.',
    'pt-BR': 'Aceito os Termos e os avisos que fazem parte deles.',
    it: 'Accetto i Termini e le informative che ne fanno parte.' },
  'ONB-3.2': { tier: 'A',
    en: 'See how we handle your data in our Privacy Notice.',
    'pt-BR': 'Veja como tratamos os seus dados no nosso Aviso de Privacidade.',
    it: 'Scopri come trattiamo i tuoi dati nella nostra Informativa sulla privacy.' },
  'ONB-3.3': { tier: 'A',
    en: 'Optional. Saying no doesn\'t change anything about the service. You can change this anytime in Settings.',
    'pt-BR': 'Opcional. Recusar não muda nada no serviço. Você pode alterar quando quiser em Configurações.',
    it: 'Facoltativo. Rifiutare non cambia nulla nel servizio. Puoi modificarlo quando vuoi nelle Impostazioni.' },
  'ONB-4.1': { tier: 'A',
    en: '{sponsor} pays for your access. They never see whether you use Good Loop, when, or what you do — only programme totals for groups of 25 or more.',
    'pt-BR': 'A {sponsor} paga o seu acesso. Ela nunca vê se você usa o Good Loop, quando ou o que você faz — apenas totais do programa, para grupos de 25 pessoas ou mais.',
    it: '{sponsor} paga il tuo accesso. Non vede mai se usi Good Loop, quando o che cosa fai — solo totali del programma per gruppi di 25 persone o più.' },
  'ONB-4.2': { tier: 'A',
    en: 'On a work phone or computer, your employer may be able to see the app is installed. A personal device keeps it private.',
    'pt-BR': 'Em um celular ou computador do trabalho, o seu empregador pode ver que o aplicativo está instalado. Um aparelho pessoal mantém tudo privado.',
    it: 'Su un telefono o un computer di lavoro, il tuo datore di lavoro può vedere che l\'app è installata. Un dispositivo personale mantiene tutto privato.' },
  'ONB-4.3': { tier: 'A',
    en: 'Add a personal email so we never write to your work address.',
    'pt-BR': 'Informe um e-mail pessoal para nunca escrevermos para o seu e-mail de trabalho.',
    it: 'Aggiungi un\'email personale così non scriveremo mai al tuo indirizzo di lavoro.' },

  /* ---- global navigation ------------------------------------------------ */
  'NAV-1': { tier: 'B',
    en: 'Help now',
    'pt-BR': 'Ajuda agora',
    it: 'Aiuto subito' },
  'NAV-2': { tier: 'on-demand', market: 'BR',
    en: 'CVV 188 (24h, free) · SAMU 192 · Police 190 — or go to the nearest emergency department. Good Loop can\'t respond to emergencies.',
    'pt-BR': 'CVV 188 (24h, gratuito) · SAMU 192 · Polícia 190 — ou vá ao pronto-socorro mais próximo. O Good Loop não atende emergências.',
    it: 'CVV 188 (24h, gratuito) · SAMU 192 · Polizia 190 — oppure vai al pronto soccorso più vicino. Good Loop non risponde alle emergenze.' }, // draft — not in register
  'NAV-3': { tier: 'on-demand', market: 'EU',
    en: 'Emergency 112 · {supportLine} — or go to the nearest emergency department. Good Loop can\'t respond to emergencies.',
    'pt-BR': 'Emergência 112 · {supportLine} — ou vá ao pronto-socorro mais próximo. O Good Loop não atende emergências.', // draft — not in register
    it: 'Emergenze 112 · {supportLine} — oppure vai al pronto soccorso più vicino. Good Loop non risponde alle emergenze.' },

  /* ---- library (self-guided) ------------------------------------------- */
  'LIB-1': { tier: 'B',
    en: 'Sessions for relaxation, grouped by moment — not treatment.',
    'pt-BR': 'Sessões de relaxamento, organizadas por momento — não é tratamento.',
    it: 'Sessioni di rilassamento, organizzate per momento — non è un trattamento.' },
  'LIB-2': { tier: 'D',
    en: 'Want to talk to someone? Find a professional →',
    'pt-BR': 'Quer conversar com alguém? Encontre um profissional →',
    it: 'Vuoi parlare con qualcuno? Trova un professionista →' },
  'LIB-3': { tier: 'D',
    en: 'Want to talk to someone? How to find a professional →',
    'pt-BR': 'Quer conversar com alguém? Como encontrar um profissional →',
    it: 'Vuoi parlare con qualcuno? Come trovare un professionista →' },
  'LIB-4': { tier: 'D',
    en: 'Nothing found. Try a moment, like \'before a flight\' or \'end of day\'.',
    'pt-BR': 'Nada encontrado. Tente um momento, como \'antes de um voo\' ou \'fim do dia\'.',
    it: 'Nessun risultato. Prova un momento, come \'prima di un volo\' o \'fine giornata\'.' },

  /* ---- category first-visit notes -------------------------------------- */
  'CAT-1': { tier: 'C',
    en: 'For moments in your working day. Relaxation, not treatment.',
    'pt-BR': 'Para momentos do seu dia de trabalho. Relaxamento, não tratamento.',
    it: 'Per i momenti della tua giornata di lavoro. Rilassamento, non trattamento.' },
  'CAT-2': { tier: 'C',
    en: 'For moments in your working day. Relaxation, not treatment — and your employer can\'t see what you use.',
    'pt-BR': 'Para momentos do seu dia de trabalho. Relaxamento, não tratamento — e o seu empregador não vê o que você usa.',
    it: 'Per i momenti della tua giornata di lavoro. Rilassamento, non trattamento — e il tuo datore di lavoro non vede che cosa usi.' },
  'CAT-3': { tier: 'C',
    en: 'For the time around a journey. If travel is something you avoid, a professional can help.',
    'pt-BR': 'Para o tempo ao redor de uma viagem. Se você evita viajar, um profissional pode ajudar.',
    it: 'Per il tempo intorno a un viaggio. Se eviti di viaggiare, un professionista può aiutarti.' },
  'CAT-4': { tier: 'C',
    en: 'For winding down. Regularly not sleeping? It\'s worth raising with a doctor.',
    'pt-BR': 'Para desacelerar no fim do dia. Não está dormindo bem com frequência? Vale conversar com um médico.',
    it: 'Per rallentare a fine giornata. Non dormi bene spesso? Vale la pena parlarne con un medico.' },
  'CAT-5': { tier: 'C',
    en: 'For the moments before and after. If this is holding you back, a professional can help.',
    'pt-BR': 'Para os momentos antes e depois. Se isso está te limitando, um profissional pode ajudar.',
    it: 'Per i momenti prima e dopo. Se questo ti limita, un professionista può aiutarti.' },
  'CAT-6': { tier: 'C',
    en: 'Made for this moment. Relaxation, not treatment.',
    'pt-BR': 'Feito para este momento. Relaxamento, não tratamento.',
    it: 'Pensato per questo momento. Rilassamento, non trattamento.' },

  /* ---- player ----------------------------------------------------------- */
  'PLY-1': { tier: 'C',
    en: 'Listen seated or lying down — never while driving. Keep the volume comfortable and stop if you feel unwell.',
    'pt-BR': 'Ouça sentado ou deitado — nunca dirigindo. Mantenha o volume confortável e pare se não se sentir bem.',
    it: 'Ascolta seduto o sdraiato — mai alla guida. Tieni il volume moderato e fermati se non ti senti bene.' },
  'PLY-2': { tier: 'B*',
    en: 'Never listen while driving. Before or after only.',
    'pt-BR': 'Nunca ouça dirigindo. Apenas antes ou depois.',
    it: 'Mai alla guida. Solo prima o dopo.' },
  'PLY-3': { tier: 'D',
    en: 'How settled do you feel? 0 to 10 — optional.',
    'pt-BR': 'Quão tranquilo você se sente agora? De 0 a 10 — opcional.',
    it: 'Quanto ti senti disteso ora? Da 0 a 10 — facoltativo.' },
  'PLY-4': { tier: 'D',
    en: 'Need more than relaxation? Talk to a professional →',
    'pt-BR': 'Precisa de mais do que relaxamento? Fale com um profissional →',
    it: 'Ti serve più del rilassamento? Parla con un professionista →' },

  /* ---- journal ---------------------------------------------------------- */
  'JRN-1': { tier: 'D',
    en: 'Private — no one reads this, not even us.',
    'pt-BR': 'Privado — ninguém lê isto, nem nós.',
    it: 'Privato — nessuno legge queste note, nemmeno noi.' },

  /* ---- professional profile (patient side) ----------------------------- */
  'PRF-1': { tier: 'B', market: 'BR',
    en: 'Independent psychologist · CRP {registration} · verified {date}',
    'pt-BR': 'Psicólogo(a) independente · CRP {registration} · verificado em {date}',
    it: 'Psicologo/a indipendente · CRP {registration} · verificato il {date}' }, // draft — not in register
  'PRF-1-IT': { tier: 'B', market: 'EU',
    en: 'Independent psychologist · Ordine {region} n. {registration} · verified {date}',
    'pt-BR': 'Psicólogo(a) independente · Ordine {region} n. {registration} · verificado em {date}', // draft — not in register
    it: 'Psicologo/a indipendente · Ordine {region} n. {registration} · verificato il {date}' },
  'PRF-2': { tier: 'D',
    en: 'Concern about a professional? Contact {council} →',
    'pt-BR': 'Dúvida sobre um profissional? Fale com o {council} →',
    it: 'Un dubbio su un professionista? Contatta l\'{council} →' },

  /* ---- booking ---------------------------------------------------------- */
  'BKG-1': { tier: 'A',
    en: '{name} provides your sessions and is responsible for your care, and decides what is used and when. Good Loop provides the audio content, the tools and the platform, and checks registration — not clinical skill.',
    'pt-BR': '{name} realiza as suas sessões, decide como elas funcionam e é responsável pelo seu cuidado. O Good Loop oferece o conteúdo em áudio e as ferramentas, e verifica o registro profissional — não a competência clínica.',
    it: '{name} conduce le tue sessioni, decide come si svolgono ed è responsabile della tua cura. Good Loop fornisce i contenuti audio e gli strumenti, e verifica l\'iscrizione all\'albo — non la competenza clinica.' },
  'BKG-2': { tier: 'D',
    en: 'Free to cancel or move up to {hours} before. The same rule applies to {name}.',
    'pt-BR': 'Cancelamento ou remarcação sem custo até {hours} antes. A mesma regra vale para {name}.',
    it: 'Puoi annullare o spostare gratuitamente fino a {hours} prima. La stessa regola vale per {name}.' },
  'CNS-1': { tier: 'A',
    en: 'Before your first session, {name} asks you to read and accept their consent form. It\'s an agreement between you and them.',
    'pt-BR': 'Antes da primeira sessão, {name} pede que você leia e aceite o termo de consentimento dele(a). É um acordo entre você e ele(a).',
    it: 'Prima della prima sessione, {name} ti chiede di leggere e accettare il suo modulo di consenso informato. È un accordo tra te e lui/lei.' },

  /* ---- session (professionally guided) --------------------------------- */
  'LOB-1': { tier: 'A',
    en: 'Find a private place. Confirm where you are now, so {name} can get help to you in an emergency.',
    'pt-BR': 'Procure um lugar reservado. Confirme onde você está agora, para que {name} possa pedir ajuda em uma emergência.',
    it: 'Trova un luogo riservato. Conferma dove ti trovi ora, così {name} può far arrivare aiuto in caso di emergenza.' },
  'SES-1': { tier: 'B',
    en: 'Not recorded',
    'pt-BR': 'Não está sendo gravado',
    it: 'Non è registrata' },
  'SES-1b': { tier: 'on-demand',
    en: 'Neither of you may record this session without your separate written consent.',
    'pt-BR': 'Nenhum de vocês pode gravar esta sessão sem o seu consentimento por escrito, dado separadamente.',
    it: 'Nessuno dei due può registrare questa sessione senza il tuo consenso scritto, dato separatamente.' },
  'SES-2': { tier: 'D',
    en: 'Part of your session · kept in {name}\'s confidential record',
    'pt-BR': 'Faz parte da sua sessão · guardado por {name} no seu prontuário confidencial',
    it: 'Fa parte della tua sessione · conservato da {name} nella tua cartella riservata' },
  'SES-3': { tier: 'D',
    en: 'Chat opens when your session starts.',
    'pt-BR': 'O chat abre quando a sua sessão começa.',
    it: 'La chat si apre quando inizia la tua sessione.' },
  'SES-4': { tier: 'D',
    en: 'Reconnecting… You can keep chatting while video comes back.',
    'pt-BR': 'Reconectando… Você pode continuar no chat enquanto o vídeo volta.',
    it: 'Riconnessione… Puoi continuare in chat mentre torna il video.' },
  'SES-5': { tier: 'D',
    en: 'Next session: {date}. Need help before then? Use Help now.',
    'pt-BR': 'Próxima sessão: {date}. Precisa de ajuda antes disso? Use o Ajuda agora.',
    it: 'Prossima sessione: {date}. Ti serve aiuto prima? Usa Aiuto subito.' },
  'SES-6': { tier: 'D',
    en: 'Selected by {name}',
    'pt-BR': 'Escolhido por {name}',
    it: 'Scelto da {name}' },

  /* ---- checkout --------------------------------------------------------- */
  'CHK-1': { tier: 'A',
    en: '{plan} — {price} per {period}. Renews automatically at {price} until you cancel. Cancel anytime in Settings.',
    'pt-BR': '{plan} — {price} por {period}. Renova automaticamente por {price} até você cancelar. Cancele quando quiser em Configurações.',
    it: '{plan} — {price} per {period}. Si rinnova automaticamente a {price} finché non disdici. Puoi disdire quando vuoi nelle Impostazioni.' },
  'CHK-2': { tier: 'A',
    en: 'I agree that my plan renews automatically.',
    'pt-BR': 'Concordo que o meu plano seja renovado automaticamente.',
    it: 'Accetto che il mio piano si rinnovi automaticamente.' },
  'CHK-3': { tier: 'A', market: 'BR',
    en: 'Changed your mind? Full refund within 7 days.',
    'pt-BR': 'Mudou de ideia? Devolução integral em até 7 dias.',
    it: 'Hai cambiato idea? Rimborso integrale entro 7 giorni.' }, // draft — not in register
  'CHK-4': { tier: 'A', market: 'EU',
    en: 'You can withdraw within 14 days — even if you\'ve started using Good Loop.',
    'pt-BR': 'Você pode desistir em até 14 dias — mesmo que já tenha começado a usar o Good Loop.', // draft — not in register
    it: 'Puoi recedere entro 14 giorni — anche se hai già iniziato a usare Good Loop.' },

  /* ---- settings --------------------------------------------------------- */
  'SET-1': { tier: 'D',
    en: 'Cancelled. You keep access until {date}.',
    'pt-BR': 'Cancelado. Você mantém o acesso até {date}.',
    it: 'Disdetto. Mantieni l\'accesso fino al {date}.' },
  'SET-2': { tier: 'D',
    en: 'Withdraw and get a refund',
    'pt-BR': 'Desistir e receber reembolso',
    it: 'Recedi e ottieni il rimborso' },
  'SET-3': { tier: 'D',
    en: 'Your choices. Change them anytime — the service stays the same.',
    'pt-BR': 'As suas escolhas. Mude quando quiser — o serviço continua o mesmo.',
    it: 'Le tue scelte. Modificale quando vuoi — il servizio resta lo stesso.' },
  'SET-4': { tier: 'D',
    en: 'Download your data — ready within 15 days.',
    'pt-BR': 'Baixe os seus dados — prontos em até 15 dias.',
    it: 'Scarica i tuoi dati — pronti entro 15 giorni.' },
  'SET-5': { tier: 'A',
    en: 'Before you go: download everything you created, free.',
    'pt-BR': 'Antes de sair: baixe gratuitamente tudo o que você criou.',
    it: 'Prima di andare: scarica gratuitamente tutto ciò che hai creato.' },
  'SET-6': { tier: 'A',
    en: 'We\'ll delete your account. We keep only what the law requires — such as billing records and any professional\'s clinical notes.',
    'pt-BR': 'Vamos excluir a sua conta. Guardamos apenas o que a lei exige — como registros de pagamento e as anotações clínicas do profissional.',
    it: 'Elimineremo il tuo account. Conserviamo solo ciò che la legge richiede — come i documenti di pagamento e le note cliniche del professionista.' },
  'SET-7': { tier: 'D',
    en: 'Access provided by {sponsor}. They gave us: {fields}. They see nothing else.',
    'pt-BR': 'Acesso oferecido por {sponsor}. Eles nos informaram: {fields}.',
    it: 'Accesso offerto da {sponsor}. Ci hanno fornito: {fields}.' },
  'SET-8': { tier: 'D',
    en: 'Want a different professional? Change →',
    'pt-BR': 'Quer outro profissional? Trocar →',
    it: 'Vuoi un altro professionista? Cambia →' },

  /* ---- notifications ---------------------------------------------------- */
  'NOT-1': { tier: 'D',
    en: 'You have a Good Loop appointment at {time}.',
    'pt-BR': 'Você tem um compromisso no Good Loop às {time}.',
    it: 'Hai un appuntamento Good Loop alle {time}.' },
  'NOT-2': { tier: 'A',
    en: 'Your Good Loop plan renews on {date} at {price}. Manage or cancel in Settings.',
    'pt-BR': 'O seu plano Good Loop renova em {date} por {price}. Gerencie ou cancele em Configurações.',
    it: 'Il tuo piano Good Loop si rinnova il {date} a {price}. Gestisci o disdici nelle Impostazioni.' },
  'NOT-3': { tier: 'A',
    en: 'Your price changes on {date} to {price}. You can cancel before then.',
    'pt-BR': 'O seu preço muda em {date} para {price}. Você pode cancelar antes disso.',
    it: 'Il tuo prezzo cambia il {date} in {price}. Puoi disdire prima di allora.' },

  /* ---- lifecycle -------------------------------------------------------- */
  'LIFE-1': { tier: 'A',
    en: 'Our Terms change on {date}. See what\'s changing. Don\'t agree? Cancel before then for a refund of unused time.',
    'pt-BR': 'Os nossos Termos mudam em {date}. Veja o que muda. Não concorda? Cancele antes e receba de volta o período não usado.',
    it: 'I nostri Termini cambiano il {date}. Guarda che cosa cambia. Non sei d\'accordo? Disdici prima e ti rimborsiamo il periodo non utilizzato.' },
  'LIFE-2': { tier: 'A',
    en: 'Your access through {sponsor} ends on {date}. See your options and download your data →',
    'pt-BR': 'O seu acesso pela {sponsor} termina em {date}. Veja as suas opções e baixe os seus dados →',
    it: 'Il tuo accesso tramite {sponsor} termina il {date}. Vedi le opzioni e scarica i tuoi dati →' },
  'LIFE-3': { tier: 'A',
    en: 'Your sessions with {name} will end on {date}. Here\'s how to continue or be referred →',
    'pt-BR': 'As suas sessões com {name} terminam em {date}. Veja como continuar ou ser encaminhado →',
    it: 'Le tue sessioni con {name} termineranno il {date}. Ecco come continuare o essere indirizzato altrove →' },

  /* ---- legal page ------------------------------------------------------- */
  'LEG-P1': { tier: 'E',
    en: 'Everything in full: our Terms, notices, privacy and previous versions.',
    'pt-BR': 'Tudo na íntegra: os nossos Termos, avisos, privacidade e versões anteriores.',
    it: 'Tutto per esteso: i nostri Termini, le informative, la privacy e le versioni precedenti.' },

  /* ---- sponsor console -------------------------------------------------- */
  'SPC-1': { tier: 'A',
    en: 'Good Loop supports your people\'s wellbeing. It doesn\'t assess workplace risk or meet any legal obligation for you.',
    'pt-BR': 'O Good Loop apoia o bem-estar das suas pessoas. Ele não avalia riscos do trabalho nem cumpre qualquer obrigação legal da sua empresa.',
    it: 'Good Loop sostiene il benessere delle tue persone. Non valuta i rischi sul lavoro e non assolve alcun obbligo di legge della tua azienda.' },
  'SPC-2': { tier: 'D',
    en: 'Figures for groups under 25 people are hidden to protect privacy.',
    'pt-BR': 'Números de grupos com menos de 25 pessoas ficam ocultos.',
    it: 'I dati di gruppi con meno di 25 persone sono nascosti.' },

  /* ---- professional dashboard ------------------------------------------ */
  /* PRO-1's register string read "Risk protocol" / "Protocolo de risco" /
     "Protocollo di rischio", but the Path A taxonomy bans "protocol" as a noun
     on professional screens. "Procedure" is a working substitute: COUNSEL TO
     CONFIRM the wording before release. */
  'PRO-1': { tier: 'B',
    en: 'Risk procedure',
    'pt-BR': 'Procedimento de risco',
    it: 'Procedura di rischio' },
  'PRO-2': { tier: 'D',
    en: '{patient} asked for their record. Please respond by {date}.',
    'pt-BR': '{patient} solicitou o seu prontuário. Responda até {date}.',
    it: '{patient} ha richiesto la sua cartella. Rispondi entro il {date}.' },
  'PRO-3': { tier: 'D',
    en: 'Your registration check is due by {date}.',
    'pt-BR': 'A verificação do seu registro vence em {date}.',
    it: 'La verifica della tua iscrizione scade il {date}.' },
  'PRO-4': { tier: 'B',
    en: 'You choose. Good Loop doesn\'t recommend content or plan care.',
    'pt-BR': 'Você escolhe. O Good Loop não recomenda conteúdo nem planeja cuidado.',
    it: 'Scegli tu. Good Loop non consiglia contenuti né pianifica la cura.' },
} as const satisfies Record<string, LegalMessage>

export type LegalMessageId = keyof typeof LEGAL_MESSAGES

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s
  let out = s
  for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v))
  return out
}

/** One catalogue string in the interface language, English when the locale
    has no text. Used by `useLegal()`; call it directly only outside React. */
export function legalMsg(id: LegalMessageId, locale: Locale, vars?: Record<string, string | number>): string {
  const m: LegalMessage = LEGAL_MESSAGES[id]
  const text = (locale === 'en' ? m.en : m[locale]) || m.en
  return interpolate(text, vars)
}

/** The market-specific variant of a string that has one. */
export function crisisSheetId(market: Market): LegalMessageId {
  return market === 'BR' ? 'NAV-2' : 'NAV-3'
}
export function webFooterId(market: Market): LegalMessageId {
  return market === 'BR' ? 'WEB-1' : 'WEB-1-EU'
}
export function withdrawalLineId(market: Market): LegalMessageId {
  return market === 'BR' ? 'CHK-3' : 'CHK-4'
}
export function registrationLineId(market: Market): LegalMessageId {
  return market === 'BR' ? 'PRF-1' : 'PRF-1-IT'
}

/** The statutory withdrawal period, in days, per market (PAY-05). */
export function withdrawalDays(market: Market): 7 | 14 {
  return market === 'BR' ? 7 : 14
}
