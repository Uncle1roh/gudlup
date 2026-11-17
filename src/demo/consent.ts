/* ============================================================================
   The demo clinician's own informed-consent form, in three languages

   WHAT THIS IS. Before a first video session the person reads and accepts
   the PROFESSIONAL's own consent form — their words, not the product's
   (M2P-04). A real account starts with none and cannot open a call until
   one is published; the demo's clinician has written hers, so the gate can
   be shown from the patient's side, which is one of the better minutes of
   any walkthrough.

   WHY IT IS TRANSLATED when nothing else a professional writes is. Because
   this one was not written by a professional: it was written here, for a
   demo, and the demo is given in the prospect's language. It was Italian —
   eight paragraphs of it — and a Brazilian prospect tapping "ler e aceitar
   o termo de consentimento" got all eight in Italian, in the middle of an
   otherwise Portuguese app. The product has no bug here and the demo had a
   bad one.

   It is NOT in `i18n/`: these strings are data in a fixture, not interface,
   and putting them through `t()` would mean a real clinician's form could
   one day collide with a dictionary entry and be silently rewritten.
   ============================================================================ */

import { currentLocale, type Locale } from '../i18n'

export interface ConsentItems {
  nature: string
  remote: string
  medium: string
  confidentiality: string
  records: string
  risk: string
  fees: string
  alternatives: string
}

const EN: ConsentItems = {
  nature: 'Remote psychological support sessions, working on the goals we agree together at our first meeting.',
  remote: 'We meet by video call: you choose a quiet, private place, and I do the same from my practice.',
  medium: 'If the connection drops, I call you back within five minutes; if we cannot resume, we make up the time at another appointment.',
  confidentiality: 'What we say to each other stays between us. The exceptions are the ones set out in law and in the professional code, and I explain them if they arise.',
  records: 'I keep essential clinical notes in goodloop’s protected area for as long as the law requires; only I can see them, and you can ask for a copy.',
  risk: 'If you are in danger, I ask where you are at the start of each session so I can call help in your area, and I give you the emergency numbers.',
  fees: 'The fee for a session is agreed before we start. You can cancel free of charge up to 24 hours beforehand.',
  alternatives: 'If working remotely is not right for you, we can consider meeting in person or referring you to another professional.',
}

const IT: ConsentItems = {
  nature: 'Colloqui di supporto psicologico a distanza, per lavorare sugli obiettivi che definiamo insieme nel primo incontro.',
  remote: 'Ci vediamo in videochiamata: tu scegli un luogo tranquillo e riservato, io faccio lo stesso dal mio studio.',
  medium: 'Se la connessione cade, ti richiamo entro cinque minuti; se non riusciamo a riprendere, recuperiamo il tempo perso in un altro appuntamento.',
  confidentiality: 'Quello che ci diciamo resta riservato. Le eccezioni sono quelle previste dalla legge e dal codice deontologico, e te le spiego se si presentano.',
  records: 'Tengo note cliniche essenziali nell’area riservata di goodloop per la durata prevista dalla legge; le vedo solo io, e puoi chiederne una copia.',
  risk: 'Se ti trovi in pericolo, ti chiedo dove sei all’inizio di ogni seduta per poter attivare i soccorsi della tua zona, e ti indico i numeri di emergenza.',
  fees: 'Il costo della seduta è concordato prima di iniziare. Puoi disdire gratuitamente fino a 24 ore prima.',
  alternatives: 'Se il lavoro a distanza non fa per te, possiamo valutare incontri in presenza o indirizzarti a un altro professionista.',
}

const PT: ConsentItems = {
  nature: 'Conversas de apoio psicológico a distância, para trabalhar os objetivos que definimos juntos no primeiro encontro.',
  remote: 'A gente se vê por videochamada: você escolhe um lugar tranquilo e reservado, e eu faço o mesmo do meu consultório.',
  medium: 'Se a conexão cair, eu ligo de volta em até cinco minutos; se não der para retomar, reponho o tempo em outro horário.',
  confidentiality: 'O que conversamos fica entre nós. As exceções são as previstas em lei e no código de ética, e eu explico caso alguma apareça.',
  records: 'Guardo anotações clínicas essenciais na área reservada da goodloop pelo prazo previsto em lei; só eu as vejo, e você pode pedir uma cópia.',
  risk: 'Se você estiver em perigo, pergunto onde você está no início de cada sessão para poder acionar o socorro da sua região, e indico os telefones de emergência.',
  fees: 'O valor da sessão é combinado antes de começar. Você pode desmarcar sem custo até 24 horas antes.',
  alternatives: 'Se o atendimento a distância não for para você, podemos avaliar encontros presenciais ou encaminhar você para outro profissional.',
}

/** The form in the language the demo is being given in. */
export function demoConsentItems(locale: Locale = currentLocale()): ConsentItems {
  if (locale === 'it') return { ...IT }
  if (locale === 'pt-BR') return { ...PT }
  return { ...EN }
}
