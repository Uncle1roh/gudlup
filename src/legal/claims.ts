/* ============================================================================
   Good Loop — the claims gate and the application tier (ADM-02, ADM-03,
   Part VII.4 / VII.6 of the Terms deliverable)

   Every catalogue row carries two things before it can be enabled:

   · its TIER — green (no close diagnostic analogue), amber (a recognised
     condition sits close to the situation; the naming is where the exposure
     lies), red (the situation is a care pathway or the state is itself
     diagnosable). Red never ships to the self-guided library; the database
     trigger refuses it too.

   · the FOUR-QUESTION SIGN-OFF — population, claim, selection, setting —
     each answered "no", with the name of the person who approved and the
     date. Any "yes" means reframe, move to professionally guided use, or do
     not ship. The record is what makes the gate a control: an approvals log
     is the evidence the wellness positioning was maintained deliberately.

   `publishBlockers` is the one function the console asks before enabling a
   row (M1-14): the lexicon (ADM-01), the sign-off (ADM-02) and the tier rule
   (ADM-03), in that order.
   ============================================================================ */

import type { CatalogProtocol } from '../data/catalog'
import { audienceOf } from '../data/catalog'
import { PROTOCOL_TAGS } from '../data/tags'
import { lintFields, type LexiconHit } from './lexicon'

export type ContentTier = 'green' | 'amber' | 'red'

export const TIERS: { id: ContentTier; label: string; hint: string }[] = [
  { id: 'green', label: 'Verde', hint: 'Nessun analogo diagnostico vicino. Pubblicabile a uso autonomo con la nota di prima visita.' },
  { id: 'amber', label: 'Ambra', hint: 'Una condizione riconosciuta è vicina alla situazione: il contenuto è sicuro, il nome no. A uso autonomo solo con il lessico prescritto e una firma.' },
  { id: 'red', label: 'Rosso', hint: 'La situazione è un percorso di cura o lo stato è diagnosticabile. Mai a uso autonomo: solo nella libreria per professionisti.' },
]

export const GATE_QUESTIONS = [
  { id: 'population', label: 'Popolazione', text: 'Il titolo, la descrizione, la categoria, i tag o il testo di marketing fanno riferimento a una condizione diagnosticabile, a un sintomo, a una popolazione clinica o a uno stato di malattia — in una qualsiasi lingua di pubblicazione?' },
  { id: 'claim', label: 'Affermazione', text: 'Afferma o lascia intendere un cambiamento in un esito di salute — riduzione, sollievo, miglioramento, gestione, prevenzione, guarigione — anziché nella qualità o profondità del rilassamento?' },
  { id: 'selection', label: 'Selezione', text: 'Il contenuto viene proposto, ordinato, programmato, consigliato o messo in evidenza alla persona sulla base di qualcosa che il software ha dedotto sulla sua salute, il suo umore o il suo stato?' },
  { id: 'setting', label: 'Contesto', text: 'Viene erogato dentro, accanto o in sincronia con un percorso di cura clinico, o presentato come preparazione a, o recupero da, un intervento medico?' },
] as const
export type GateQuestionId = typeof GATE_QUESTIONS[number]['id']

export interface ClaimsGate {
  /** "no" is the only answer that lets a row ship. */
  answers: Partial<Record<GateQuestionId, 'yes' | 'no'>>
  approvedBy: string
  approvedAt: number | null
  /** The substantiation file reference, where an efficiency claim is made. */
  substantiation?: string
}

export function emptyGate(): ClaimsGate {
  return { answers: {}, approvedBy: '', approvedAt: null }
}

export function gateComplete(g: ClaimsGate | null | undefined): boolean {
  if (!g) return false
  return GATE_QUESTIONS.every((q) => g.answers[q.id] === 'no') && g.approvedBy.trim().length > 0 && !!g.approvedAt
}

export interface PublishBlocker {
  kind: 'lexicon' | 'gate' | 'tier'
  message: string
  hits?: { field: string; hits: LexiconHit[] }[]
}

/** Everything a person could read about this row, in every language it is
    written in — the lexicon runs over all of it (ADM-01). */
export function readableFields(p: CatalogProtocol): Record<string, string | string[] | undefined> {
  const out: Record<string, string | string[] | undefined> = {
    'titolo pubblico': p.publicTitle,
    'descrizione pubblica': p.publicBlurb,
    tag: (p.tags ?? []).map((id) => PROTOCOL_TAGS.find((t) => t.id === id)?.label ?? id),
  }
  /* The clinical title is read by the professional only (two-door model);
     it is linted for the library shelf, where it IS what the person reads
     when no public name is set. */
  if (audienceOf(p) === 'library' || !p.publicTitle) out['titolo'] = p.title
  if (audienceOf(p) === 'library') out['descrizione'] = p.blurb
  for (const [loc, text] of Object.entries(p.i18n ?? {})) {
    if (!text) continue
    if (text.publicTitle) out[`titolo pubblico (${loc})`] = text.publicTitle
    if (text.publicBlurb) out[`descrizione pubblica (${loc})`] = text.publicBlurb
    if (audienceOf(p) === 'library' && text.title) out[`titolo (${loc})`] = text.title
  }
  return out
}

export function publishBlockers(p: CatalogProtocol): PublishBlocker[] {
  const out: PublishBlocker[] = []
  const hits = lintFields(readableFields(p))
  if (hits.length) {
    out.push({
      kind: 'lexicon',
      hits,
      message: 'Lessico non ammesso: ' + hits.map((h) => `${h.field} — ${h.hits.map((x) => `“${x.term}”`).join(', ')}`).join('; '),
    })
  }
  if (!gateComplete(p.claimsGate)) {
    out.push({ kind: 'gate', message: 'Manca la revisione delle affermazioni: le quattro domande con risposta “no”, il nome di chi approva e la data (scheda → Revisione).' })
  }
  if ((p.tier ?? 'green') === 'red' && audienceOf(p) === 'library') {
    out.push({ kind: 'tier', message: 'Contenuto di livello rosso: non può essere pubblicato nella libreria a uso autonomo. Solo per professionisti.' })
  }
  return out
}
