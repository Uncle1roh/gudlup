/* ============================================================================
   Good Loop — the legal corpus, resolved

   One place that answers "what does document X say, in language Y, for a
   person in market Z". The English master is the fallback for a language
   that has no draft yet; market-tagged blocks (the annex text that replaces
   clauses 12.2, 16 and 20) are kept or dropped here so no screen has to know
   the Terms have annexes.
   ============================================================================ */

import type { Locale } from '../i18n'
import type { Market } from './messages'
import { LEGAL_EN } from './legal-en'
import { LEGAL_IT } from './legal-it'
import { LEGAL_PT } from './legal-pt'
import type { LegalBlock, LegalDocId, LegalDocText } from './types'

const BY_LOCALE: Record<Locale, Record<string, LegalDocText>> = { en: LEGAL_EN, it: LEGAL_IT, 'pt-BR': LEGAL_PT }

export function legalDoc(id: LegalDocId | string, locale: Locale): LegalDocText | null {
  return BY_LOCALE[locale]?.[id] ?? LEGAL_EN[id] ?? null
}

/** The blocks that apply in one market: untagged ones and the market's own. */
export function blocksFor(doc: LegalDocText, market: Market): LegalBlock[] {
  return doc.blocks.filter((b) => !b.market || b.market === market)
}

/** The index of the legal page (LEG-06), in reading order. Every id here has
    a title in every language, so the index itself needs no dictionary. */
export const LEGAL_INDEX: { id: LegalDocId; group: 'terms' | 'notices' | 'professional' }[] = [
  { id: 'terms', group: 'terms' },
  { id: 'supplement', group: 'terms' },
  { id: 'privacy', group: 'terms' },
  { id: 'D-01', group: 'notices' }, { id: 'D-02', group: 'notices' }, { id: 'D-03-BR', group: 'notices' }, { id: 'D-03-EU', group: 'notices' },
  { id: 'D-04', group: 'notices' }, { id: 'D-05', group: 'notices' }, { id: 'D-06', group: 'notices' }, { id: 'D-07', group: 'notices' },
  { id: 'D-08', group: 'notices' }, { id: 'D-09', group: 'notices' }, { id: 'D-10', group: 'notices' }, { id: 'D-11', group: 'notices' },
  { id: 'D-12', group: 'notices' }, { id: 'D-13', group: 'notices' }, { id: 'D-14', group: 'notices' }, { id: 'D-15', group: 'notices' },
  { id: 'D-16', group: 'notices' }, { id: 'D-17', group: 'notices' },
  { id: 'professional', group: 'professional' },
]

/**
 * The Privacy Notice is NOT drafted in the deliverable ("architecture set
 * out — Part VI.1; full text to be drafted with the DPO"). What the product
 * can publish honestly today is that architecture: who the controller is,
 * how to reach the DPO / encarregado (LEG-13), the data domains and their
 * retention periods from the DSR specification (Part III), the rights list
 * and the supervisory authority. It is rendered from this skeleton, marked
 * as awaiting the DPO's text, rather than invented.
 */
export function privacySkeleton(locale: Locale): LegalDocText {
  const t = PRIVACY_SKELETON[locale] ?? PRIVACY_SKELETON.en
  return { id: 'privacy', title: t.title, blocks: t.blocks }
}

const PRIVACY_SKELETON: Record<Locale, LegalDocText> = {
  en: {
    id: 'privacy', title: 'Privacy Notice', blocks: [
      { kind: 'p', text: 'The full Privacy Notice is being drafted with our data protection officer. Until it is published, this page sets out the information we are required to give you now: who is responsible for your data, how to reach them, what we hold and for how long, and the rights you have.' },
      { kind: 'h', text: 'Who is responsible' },
      { kind: 'p', text: 'The controller is [full corporate name], [registration number], [registered address]. Our data protection officer can be contacted at [email]. For Brazil, our encarregado pela proteção de dados is [name], contactable at [email].' },
      { kind: 'h', text: 'What we hold, and for how long' },
      { kind: 'li', text: 'Identity and account — name, e-mail, date of birth or age confirmation, language, country, account status. Life of the account plus the statutory period.' },
      { kind: 'li', text: 'Consent and acceptance records — every version of the Terms you accepted, every consent given or withdrawn, each with its timestamp. Life of the account plus the limitation period.' },
      { kind: 'li', text: 'Subscription, billing and payment — never your full card details. The statutory tax and accounting period.' },
      { kind: 'li', text: 'Usage records — which sessions you opened, when, for how long, and any settledness rating you chose to give. Where a professional selected content for you, that it was selected by that named professional. [24] months.' },
      { kind: 'li', text: 'Content you created — notes and journal entries, in full. Life of the account.' },
      { kind: 'li', text: 'Communications with us — support and complaint threads. [36] months.' },
      { kind: 'li', text: 'Technical and log data — device, application version, login history. [12] months.' },
      { kind: 'li', text: 'Sponsorship and eligibility — where an organisation pays for your access: the fields it supplied (typically a company code) and the dates. Life of the sponsorship plus [12] months.' },
      { kind: 'li', text: 'Booking and scheduling with a professional — dates, times, attendance. Session content is not here: the clinical record is kept by the professional under their own rules.' },
      { kind: 'li', text: 'Automated features — none. We hold no score, rating, severity level, risk classification or clinical assessment about you.' },
      { kind: 'h', text: 'Sensitive information' },
      { kind: 'p', text: 'Information relating to psychological wellbeing is sensitive personal data. We process your account and usage data to perform our contract with you. Where a professional works with you, clinical processing is carried out by that professional, bound by professional secrecy, for the protection of health — not on the basis of consent, and never on the basis of consent in an employment context.' },
      { kind: 'h', text: 'Your rights' },
      { kind: 'p', text: 'You may ask us at any time to confirm whether we process your data; give you access to it; correct anything incomplete, inaccurate or out of date; anonymise, block or delete data that is unnecessary, excessive or processed contrary to the law; port your data to another provider; delete data processed on the basis of your consent; tell you with whom we have shared it; tell you the consequences of refusing consent; and withdraw any consent you have given. We answer within fifteen days, for every person in every country. Use the "Download your data" and "Close account" controls in Settings, or write to [email].' },
      { kind: 'h', text: 'If you are unhappy' },
      { kind: 'p', text: 'Tell us first at [email]. You may also complain to the supervisory authority: in Brazil the Autoridade Nacional de Proteção de Dados (ANPD); in Italy the Garante per la protezione dei dati personali.' },
    ],
  },
  it: {
    id: 'privacy', title: 'Informativa sulla privacy', blocks: [
      { kind: 'p', text: 'L’Informativa sulla privacy completa è in preparazione con il nostro responsabile della protezione dei dati. Finché non sarà pubblicata, questa pagina riporta le informazioni che siamo tenuti a darti già ora: chi è responsabile dei tuoi dati, come contattarlo, che cosa conserviamo e per quanto tempo, e i diritti che hai.' },
      { kind: 'h', text: 'Chi è responsabile' },
      { kind: 'p', text: 'Il titolare del trattamento è [denominazione sociale completa], [numero di registrazione], [sede legale]. Il nostro responsabile della protezione dei dati è raggiungibile a [email]. Per il Brasile, il nostro encarregado pela proteção de dados è [nome], raggiungibile a [email].' },
      { kind: 'h', text: 'Che cosa conserviamo, e per quanto tempo' },
      { kind: 'li', text: 'Identità e account — nome, email, data di nascita o conferma dell’età, lingua, Paese, stato dell’account. Per la durata dell’account più il periodo previsto dalla legge.' },
      { kind: 'li', text: 'Registrazioni di accettazioni e consensi — ogni versione dei Termini che hai accettato, ogni consenso dato o revocato, ciascuno con la sua data e ora. Per la durata dell’account più il termine di prescrizione.' },
      { kind: 'li', text: 'Abbonamento, fatturazione e pagamento — mai i dati completi della tua carta. Per il periodo fiscale e contabile previsto dalla legge.' },
      { kind: 'li', text: 'Registrazioni d’uso — quali sessioni hai aperto, quando, per quanto tempo, e l’eventuale valutazione di quanto ti senti disteso che hai scelto di dare. Quando un professionista ha scelto un contenuto per te, che è stato scelto da quel professionista. [24] mesi.' },
      { kind: 'li', text: 'Contenuti che hai creato — note e diario, per intero. Per la durata dell’account.' },
      { kind: 'li', text: 'Comunicazioni con noi — richieste di assistenza e reclami. [36] mesi.' },
      { kind: 'li', text: 'Dati tecnici e di registro — dispositivo, versione dell’app, cronologia degli accessi. [12] mesi.' },
      { kind: 'li', text: 'Sponsorizzazione e idoneità — quando un’organizzazione paga il tuo accesso: i campi che ha fornito (di norma un codice azienda) e le date. Per la durata della sponsorizzazione più [12] mesi.' },
      { kind: 'li', text: 'Prenotazioni con un professionista — date, orari, presenza. Il contenuto delle sessioni non è qui: la documentazione clinica è tenuta dal professionista secondo le sue regole.' },
      { kind: 'li', text: 'Funzioni automatizzate — nessuna. Non conserviamo alcun punteggio, valutazione, livello di gravità, classificazione di rischio o valutazione clinica su di te.' },
      { kind: 'h', text: 'Informazioni sensibili' },
      { kind: 'p', text: 'Le informazioni relative al benessere psicologico sono dati personali sensibili. Trattiamo i dati del tuo account e del tuo uso per eseguire il contratto con te. Quando un professionista lavora con te, il trattamento clinico è svolto da quel professionista, vincolato dal segreto professionale, per la tutela della salute — non sulla base del consenso, e mai sulla base del consenso in un contesto di lavoro.' },
      { kind: 'h', text: 'I tuoi diritti' },
      { kind: 'p', text: 'Puoi chiederci in qualsiasi momento di confermare se trattiamo i tuoi dati; di dartene accesso; di correggere ciò che è incompleto, inesatto o non aggiornato; di anonimizzare, bloccare o cancellare dati non necessari, eccessivi o trattati in violazione della legge; di trasferire i tuoi dati a un altro fornitore; di cancellare i dati trattati sulla base del tuo consenso; di dirti con chi li abbiamo condivisi; di dirti le conseguenze del rifiuto del consenso; e di revocare qualsiasi consenso dato. Rispondiamo entro quindici giorni, a ogni persona in ogni Paese. Usa i comandi «Scarica i tuoi dati» e «Chiudi l’account» nelle Impostazioni, oppure scrivi a [email].' },
      { kind: 'h', text: 'Se non sei soddisfatto' },
      { kind: 'p', text: 'Diccelo prima a [email]. Puoi anche rivolgerti all’autorità di controllo: in Brasile la Autoridade Nacional de Proteção de Dados (ANPD); in Italia il Garante per la protezione dei dati personali.' },
    ],
  },
  'pt-BR': {
    id: 'privacy', title: 'Aviso de Privacidade', blocks: [
      { kind: 'p', text: 'O Aviso de Privacidade completo está sendo elaborado com o nosso encarregado pela proteção de dados. Até a sua publicação, esta página traz as informações que somos obrigados a dar a você desde já: quem é responsável pelos seus dados, como contatá-lo, o que mantemos e por quanto tempo, e os direitos que você tem.' },
      { kind: 'h', text: 'Quem é responsável' },
      { kind: 'p', text: 'O controlador é [razão social completa], [número de registro], [sede]. O nosso encarregado pela proteção de dados é [nome], contatável em [email]. Para a União Europeia, o nosso responsável pela proteção de dados pode ser contatado em [email].' },
      { kind: 'h', text: 'O que mantemos, e por quanto tempo' },
      { kind: 'li', text: 'Identidade e conta — nome, e-mail, data de nascimento ou confirmação de idade, idioma, país, status da conta. Vida da conta mais o prazo legal.' },
      { kind: 'li', text: 'Registros de aceitação e consentimento — cada versão dos Termos que você aceitou, cada consentimento dado ou retirado, com data e hora. Vida da conta mais o prazo prescricional.' },
      { kind: 'li', text: 'Assinatura, cobrança e pagamento — nunca os dados completos do seu cartão. O prazo fiscal e contábil legal.' },
      { kind: 'li', text: 'Registros de uso — quais sessões você abriu, quando, por quanto tempo, e a avaliação de quão tranquilo se sente que você escolheu dar. Quando um profissional escolheu um conteúdo para você, que foi escolhido por esse profissional. [24] meses.' },
      { kind: 'li', text: 'Conteúdo que você criou — anotações e diário, na íntegra. Vida da conta.' },
      { kind: 'li', text: 'Comunicações conosco — atendimentos de suporte e reclamações. [36] meses.' },
      { kind: 'li', text: 'Dados técnicos e de registro — dispositivo, versão do aplicativo, histórico de acessos. [12] meses.' },
      { kind: 'li', text: 'Patrocínio e elegibilidade — quando uma organização paga o seu acesso: os campos que ela forneceu (normalmente um código da empresa) e as datas. Vida do patrocínio mais [12] meses.' },
      { kind: 'li', text: 'Agendamentos com um profissional — datas, horários, comparecimento. O conteúdo das sessões não está aqui: o registro clínico é mantido pelo profissional sob as suas próprias normas.' },
      { kind: 'li', text: 'Recursos automatizados — nenhum. Não mantemos nenhuma pontuação, avaliação, nível de gravidade, classificação de risco ou avaliação clínica sobre você.' },
      { kind: 'h', text: 'Informações sensíveis' },
      { kind: 'p', text: 'As informações relacionadas ao bem-estar psicológico são dados pessoais sensíveis. Tratamos os dados da sua conta e do seu uso para executar o contrato com você. Quando um profissional trabalha com você, o tratamento clínico é realizado por esse profissional, sujeito ao sigilo profissional, para a tutela da saúde — não com base em consentimento, e nunca com base em consentimento no contexto de trabalho.' },
      { kind: 'h', text: 'Os seus direitos' },
      { kind: 'p', text: 'Você pode nos pedir a qualquer momento para confirmar se tratamos os seus dados; dar acesso a eles; corrigir o que estiver incompleto, inexato ou desatualizado; anonimizar, bloquear ou eliminar dados desnecessários, excessivos ou tratados em desconformidade com a lei; portar os seus dados a outro fornecedor; eliminar dados tratados com base no seu consentimento; informar com quem os compartilhamos; informar as consequências de não dar consentimento; e revogar qualquer consentimento dado. Respondemos em até quinze dias, a toda pessoa em todo país. Use os comandos «Baixe os seus dados» e «Encerrar conta» em Configurações, ou escreva para [email].' },
      { kind: 'h', text: 'Se você não ficar satisfeito' },
      { kind: 'p', text: 'Fale conosco primeiro em [email]. Você também pode reclamar à autoridade de controle: no Brasil, a Autoridade Nacional de Proteção de Dados (ANPD); na Itália, o Garante per la protezione dei dati personali.' },
    ],
  },
}
