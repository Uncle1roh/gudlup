/* ============================================================================
   Good Loop — the LIBRARY (audio catalog for people using the app on their own)

   The app is consumed in two ways, and they are deliberately kept apart:

     1. PERCORSO — the therapist writes a three-month plan in the first session
        and the person follows it. It is supervised, so those entries keep their
        clinical identity (code, family, protocol title).

     2. LIBRERIA — a browsable catalog of general wellbeing audios named after
        the MOMENT they serve ("20 minuti prima di un volo"), never after a
        condition or a treatment. No clinical code, no family, no protocol
        number is ever shown here, and nothing in this catalog is presented as
        therapy: it is what a person picks by themselves, unsupervised.

   The separation is a legal boundary, not a cosmetic one — `audience` on the
   catalog entry is what enforces it, and the two lists never mix in a query.
   Sessions from BOTH still reach the therapist's record: what changes is how
   the audio is named and offered, not whether the practice is followed.
   ============================================================================ */

import type { Duration, Protocol, SessionPhase } from '../types/domain'

/** A row of the browse screen. */
export type LibraryCategory = 'before' | 'calm' | 'reset' | 'sleep' | 'focus' | 'energy'

export const LIBRARY_CATEGORIES: { id: LibraryCategory; label: string; blurb: string }[] = [
  { id: 'before', label: 'Prima di un momento importante', blurb: 'Da ascoltare poco prima' },
  { id: 'calm', label: 'Ritrovare la calma', blurb: 'Quando serve rallentare' },
  { id: 'reset', label: 'Staccare la spina', blurb: 'Chiudere e lasciare andare' },
  { id: 'sleep', label: 'Riposo e notte', blurb: 'Per la sera e i risvegli' },
  { id: 'focus', label: 'Concentrazione', blurb: 'Per rientrare in quello che stai facendo' },
  { id: 'energy', label: 'Rimettersi in moto', blurb: 'Quando la spinta manca' },
]

/** What the "scegli tu per me" button matches against. These mirror the
    check-in's clusters so the wizard can route into the library without ever
    naming a clinical protocol. */
export type LibraryTag = 'anxiety' | 'stress' | 'depression' | 'burnout' | 'resilience' | 'maintenance'

export interface LibraryMeta {
  category: LibraryCategory
  /** Cover glyph for the card. */
  emoji: string
  /** Which check-in answers this audio fits. */
  tags: LibraryTag[]
  /** Sort order inside its row (lower first). */
  order?: number
}

/** Neutral, non-clinical phase names — the player prints them, and a library
    audio must never show a treatment vocabulary ("Processing", "Integration"). */
export const LIBRARY_PHASES: SessionPhase[] = [
  { id: 1, name: 'Ci sistemiamo', fraction: 0.15 },
  { id: 2, name: 'Respiro', fraction: 0.2, showOrb: true },
  { id: 3, name: 'Ascolto', fraction: 0.35 },
  { id: 4, name: 'Si scioglie', fraction: 0.2 },
  { id: 5, name: 'Rientro', fraction: 0.1 },
]

export const LIBRARY_PREFIX = 'GL-LIB'

/** True for a catalog code that belongs to the library. Used wherever a code
    arrives without its catalog entry (session history, therapist reports). */
export function isLibraryCode(code: string): boolean {
  return code.startsWith(LIBRARY_PREFIX)
}

/* ------------------------------------------------------------ starter set --

   Seeded so the browse screen is navigable from day one and the POs have
   concrete examples of the naming register to work from. Every one of them is
   a DRAFT: no rendered audio yet (the player falls back to its synthesized
   bed, exactly as for the seeded protocols), and the POs replace each with a
   real mixdown produced in the Studio. Titles say the moment, never the
   condition. */
export interface LibrarySeed {
  slug: string
  title: string
  blurb: string
  duration: Duration
  meta: LibraryMeta
}

export const LIBRARY_SEEDS: LibrarySeed[] = [
  { slug: 'volo', title: '20 minuti prima di un volo', blurb: 'Da mettere in cuffia in sala d’imbarco.', duration: 24, meta: { category: 'before', emoji: '🛫', tags: ['anxiety'], order: 1 } },
  { slug: 'riunione', title: 'Prepariamoci a una riunione difficile', blurb: 'Dieci minuti per arrivarci con la testa sgombra.', duration: 12, meta: { category: 'before', emoji: '💼', tags: ['stress', 'anxiety'], order: 2 } },
  { slug: 'colloquio', title: 'Poco prima di un colloquio', blurb: 'Per presentarti come sei, senza il nodo allo stomaco.', duration: 12, meta: { category: 'before', emoji: '🤝', tags: ['anxiety', 'resilience'], order: 3 } },
  { slug: 'esame', title: 'La mezz’ora prima di un esame', blurb: 'Il ripasso è finito: adesso serve calma.', duration: 24, meta: { category: 'before', emoji: '📚', tags: ['stress', 'anxiety'], order: 4 } },
  { slug: 'conversazione', title: 'Prima di una conversazione difficile', blurb: 'Sei minuti per dire quello che vuoi dire.', duration: 6, meta: { category: 'before', emoji: '💬', tags: ['stress', 'resilience'], order: 5 } },

  { slug: 'respiro', title: 'Tornare al respiro', blurb: 'Il più breve: quando serve adesso.', duration: 6, meta: { category: 'calm', emoji: '🫁', tags: ['anxiety'], order: 1 } },
  { slug: 'radicamento', title: 'Ritrovare terra sotto i piedi', blurb: 'Per quando tutto sembra muoversi troppo.', duration: 12, meta: { category: 'calm', emoji: '🌳', tags: ['anxiety', 'resilience'], order: 2 } },
  { slug: 'onda', title: 'Lasciar passare l’onda', blurb: 'Non spingerla via: guardarla arrivare e andarsene.', duration: 12, meta: { category: 'calm', emoji: '🌊', tags: ['anxiety'], order: 3 } },

  { slug: 'pausa', title: 'Una pausa vera, in sei minuti', blurb: 'Più utile del terzo caffè.', duration: 6, meta: { category: 'reset', emoji: '☕', tags: ['stress', 'maintenance'], order: 1 } },
  { slug: 'finelavoro', title: 'Chiudere la giornata di lavoro', blurb: 'Il confine fra il lavoro e il resto della sera.', duration: 12, meta: { category: 'reset', emoji: '🌇', tags: ['burnout', 'stress'], order: 2 } },
  { slug: 'testapiena', title: 'Quando la testa è troppo piena', blurb: 'Mettere giù qualche pensiero prima di riprenderli.', duration: 12, meta: { category: 'reset', emoji: '🧩', tags: ['stress'], order: 3 } },

  { slug: 'sonno', title: 'Prepararsi al sonno', blurb: 'Da far partire già a letto, luci spente.', duration: 24, meta: { category: 'sleep', emoji: '🌙', tags: ['maintenance', 'anxiety'], order: 1 } },
  { slug: 'nottesveglia', title: 'Sveglio nel cuore della notte', blurb: 'Per le tre di notte, senza accendere niente.', duration: 12, meta: { category: 'sleep', emoji: '🌌', tags: ['anxiety'], order: 2 } },

  { slug: 'concentrazione', title: 'Mezz’ora di concentrazione', blurb: 'Un sottofondo per lavorare, non per addormentarsi.', duration: 24, meta: { category: 'focus', emoji: '🎯', tags: ['stress'], order: 1 } },
  { slug: 'mattina', title: 'Iniziare la giornata con calma', blurb: 'Sei minuti prima che parta tutto il resto.', duration: 6, meta: { category: 'focus', emoji: '🌅', tags: ['maintenance'], order: 2 } },

  { slug: 'ricarica', title: 'Ricaricare le batterie', blurb: 'Il più lungo: da fare quando puoi non essere disturbato.', duration: 24, meta: { category: 'energy', emoji: '🔋', tags: ['burnout', 'depression'], order: 1 } },
  { slug: 'movimento', title: 'Rimettersi in movimento', blurb: 'Per i giorni in cui anche alzarsi pesa.', duration: 12, meta: { category: 'energy', emoji: '🌱', tags: ['depression'], order: 2 } },
  { slug: 'fiducia', title: 'Un po’ più di fiducia', blurb: 'Per quando non ti senti all’altezza.', duration: 12, meta: { category: 'energy', emoji: '🔥', tags: ['resilience', 'depression'], order: 3 } },
]

export function librarySeedCode(slug: string): string {
  return `${LIBRARY_PREFIX} ${slug}`
}

/** The seeded library as domain protocols (the catalog lifts these). */
export function libraryProtocols(): (Protocol & { library: LibraryMeta })[] {
  return LIBRARY_SEEDS.map((s) => ({
    code: librarySeedCode(s.slug),
    family: 'GL-LIB' as const,
    title: s.title,
    blurb: s.blurb,
    phases: LIBRARY_PHASES,
    versions: [{ duration: s.duration }],
    library: s.meta,
  }))
}

/* --------------------------------------------------------------- matching --

   "Scegli tu per me": the check-in answers a cluster and a length, and the
   library answers with an audio. Preference order — a tagged audio of exactly
   the requested length, then a tagged audio of any length, then anything at
   that length. The pick is randomized among equals so the button doesn't
   always return the same track. */
export interface LibraryPick<T> { item: T; why: string }

export function pickFromLibrary<T extends { versions: { duration: Duration }[]; library?: LibraryMeta }>(
  items: T[],
  tag: LibraryTag,
  duration: Duration,
  rnd: () => number = Math.random,
): LibraryPick<T> | null {
  if (!items.length) return null
  const has = (i: T) => !!i.library?.tags.includes(tag)
  const fits = (i: T) => i.versions.some((v) => v.duration === duration)
  const tiers: { list: T[]; why: string }[] = [
    { list: items.filter((i) => has(i) && fits(i)), why: 'per come ti senti e per il tempo che hai' },
    { list: items.filter(has), why: 'per come ti senti' },
    { list: items.filter(fits), why: 'per il tempo che hai' },
    { list: items, why: 'dalla libreria' },
  ]
  for (const t of tiers) {
    if (t.list.length) return { item: t.list[Math.floor(rnd() * t.list.length) % t.list.length], why: t.why }
  }
  return null
}
