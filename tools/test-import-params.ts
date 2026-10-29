/* ============================================================================
   A workbook whose edited cells were not words

   The report: "I import an Excel into a protocol that already has one, this
   new Excel has modifications in some cells, and the software says it is
   identical. It is not."

   It was not the parser this time, and not the columns. It was the sentence.
   A protocol that already has that time signature opens the panel in "solo i
   testi" — the safe default, because a full import rebuilds the Studio
   session somebody may have spent a day on. That mode overlays the words
   onto the SAVED timeline and nothing else, and the comparison was made
   against the result: stored vs stored-with-new-words. Edit a volume, a
   fade, a phase, an fx, an echo — anything that is not a word — and the
   comparison had nothing to find.

       "12 min: identico a quello salvato — niente da importare."

   The file was not identical. The operator had just changed those cells, and
   that sentence sends them back to the spreadsheet to look for a mistake
   they did not make. (Proven on the real 12-minute GL-ANX workbook: a single
   `volume_lufs` cell, −22 → −25, and the panel called the file identical.)

   The mode is still right to leave structure alone. What is asserted here is
   that it SAYS SO: the file is compared a second time the way a full import
   would read it, everything outside the words is named with its clip id, and
   the word "identico" is reserved for a file nothing was dropped from.

       npx esbuild tools/test-import-params.ts --bundle --platform=node \
         --format=cjs --define:import.meta.env={} --outfile=<tmp>/ip.cjs \
         && node <tmp>/ip.cjs
   ============================================================================ */

import { planPlainImport, describeImportPlan, entryForPublish } from '../src/admin/publishPlain'
import type { CatalogProtocol } from '../src/data/catalog'
import type { PlainClip, PlainTimeline, PlainVersion } from '../src/admin/plainTimeline'

let pass = 0
const fails: string[] = []
function assert(cond: boolean, what: string): void {
  if (cond) { pass += 1; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

/* ---- one 12-minute sheet, with dials worth turning ---------------------- */

interface Knobs {
  volumeDb?: number
  fadeInS?: number
  testo?: string
  phaseEnd?: number
  extra?: PlainClip[]
  /** The comment column, and the raw `fase` cell: both read by nobody. */
  note?: string
  faseRaw?: string
  /** A workbook whose text columns are empty, or absent altogether. */
  noText?: boolean
  /** Renumbered clip ids: a file that matches nothing saved. */
  idSuffix?: string
}

function voice(id: string, startS: number, testo: string, volumeDb = -6): PlainClip {
  return {
    clipId: id, traccia: 'Voce Guida', tipo: 'voice',
    startS, endS: startS + 8, fadeInS: 0, fadeOutS: 0,
    testo, testoByLang: { it: testo }, volumeDb,
  } as PlainClip
}
/** The same row with its text columns empty. */
function mute(c: PlainClip): PlainClip {
  const { testo: _t, testoByLang: _b, ...rest } = c as PlainClip & Record<string, unknown>
  return rest as PlainClip
}

function sheet(k: Knobs = {}): PlainTimeline {
  const clips: PlainClip[] = [
    {
      clipId: 'SS-001', traccia: 'Soundscape', tipo: 'soundscape',
      startS: 0, endS: 720, fadeInS: k.fadeInS ?? 4, fadeOutS: 3,
      ambiente: 'bosco', volumeDb: k.volumeDb ?? -24,
      faseRaw: k.faseRaw ?? '1', faseFrom: 1, faseTo: 1,
      note: k.note ?? 'Soundscape primario (acqua).',
    } as PlainClip,
    voice('VC-001', 20, k.testo ?? 'Benvenuto. Questo è il tuo momento di pace.'),
    voice('VC-002', 300, 'Lascia andare il respiro.'),
    ...(k.extra ?? []),
  ].map((c) => (k.noText ? mute(c) : c))
    .map((c) => (k.idSuffix ? { ...c, clipId: `${c.clipId}${k.idSuffix}` } : c))
  const version: PlainVersion = {
    sheet: 'Standard', durationMin: 12, durationS: 720,
    levelMode: 'absolute', clips,
    phases: [
      { fase: 1, label: 'Ingresso', startS: 0, endS: k.phaseEnd ?? 240 },
      { fase: 2, label: 'Centro', startS: k.phaseEnd ?? 240, endS: 720 },
    ],
  } as PlainVersion
  return { code: 'GL-ANX 1.1', title: 'Standard', versions: [version], affirmations: [], issues: [] }
}

const stored = sheet()

function saved(t: PlainTimeline, session?: unknown): CatalogProtocol {
  return {
    code: 'GL-ANX 1.1', family: 'GL-ANX', title: 'Standard', blurb: '', phases: [],
    versions: [{ duration: 12 }],
    enabled: true, source: 'imported', tenants: 'all', audioReady: false,
    plainByDuration: { 12: t } as never,
    studioByDuration: session ? { 12: session } : undefined,
    updatedAt: 1_700_000_000_000,
  } as unknown as CatalogProtocol
}

/** A Studio session with its own copy of the words, as one is actually saved:
    `text` is the Italian, and every render is named by what it says. */
const IT_ONE = 'Benvenuto. Questo \u00e8 il tuo momento di pace.'
function session(): { tracks: { clips: SeedLike[] }[] } {
  const clip = (sourceId: string | undefined, it: string, pt: string): SeedLike => ({
    startSec: 20, durationSec: 8, params: { kind: 'voice', voiceId: 'v1' },
    sourceId, text: it, textByLang: { it, 'pt-BR': pt },
    ttsPath: 'tts/old.mp3', ttsText: it,
  })
  return {
    name: 'GL-ANX 1.1 \u2014 Standard', lengthSec: 720, masterGain: 1, savedAt: 1_700_000_000_000,
    tracks: [{
      type: 'voice', name: 'Voce Guida', volume: 1,
      clips: [
        clip('clip:VC-001', IT_ONE, 'Bem-vindo. Este \u00e9 o seu momento.'),
        clip('clip:ZZ-999', 'Una clip che il foglio non ha.', 'Um clipe que a planilha n\u00e3o tem.'),
        clip(undefined, 'Una clip senza sourceId.', 'Um clipe sem sourceId.'),
      ],
    }],
  } as unknown as { tracks: { clips: SeedLike[] }[] }
}
interface SeedLike {
  startSec?: number
  durationSec?: number
  params?: unknown
  sourceId?: string
  text?: string
  textByLang?: Record<string, string>
  ttsPath?: string
  ttsText?: string
}
const clipsOf = (p: CatalogProtocol, d = 12): SeedLike[] =>
  (p as unknown as { studioByDuration: Record<number, { tracks: { clips: SeedLike[] }[] }> }).studioByDuration[d].tracks[0].clips

/** "solo i testi", which is what the panel picks for a duration already saved. */
function textPlan(file: PlainTimeline) {
  return planPlainImport({ timeline: file, existing: saved(stored), selected: 12, mode: 'text' })
}
const says = (lines: string[], needle: string) => lines.some((l) => l.includes(needle))

/* ---- the file really is the same one ------------------------------------ */
console.log('\n--- a file that genuinely has not changed ---')
{
  const p = textPlan(sheet())
  assert(p.nothing, 'nothing to write')
  assert(!p.dropped.length, 'and nothing was dropped from it')
  assert(says(describeImportPlan(p, 12), 'identico a quello salvato'),
    'so the panel is allowed to say "identico"')
}

/* ---- one cell, and it is not a word ------------------------------------- */
console.log('\n--- a volume cell edited (the report) ---')
{
  const p = textPlan(sheet({ volumeDb: -27 }))
  const lines = describeImportPlan(p, 12)
  assert(p.dropped.length === 1, 'the change outside the words is caught')
  assert(p.dropped[0].paramChanged.includes('SS-001'), '…and it names the clip')
  assert(!says(lines, 'identico a quello salvato'),
    'the panel does NOT call the file identical')
  assert(says(lines, '⚠') && says(lines, 'SS-001') && says(lines, 'Tutto il file'),
    'it names the row, warns, and points at the mode that would import it')
  assert(says(lines, 'i testi sono già quelli salvati'),
    'and it still says what IS the same: the words')
}

/* ---- the same, for the other dials -------------------------------------- */
console.log('\n--- a fade, and a phase boundary ---')
{
  const fade = textPlan(sheet({ fadeInS: 9 }))
  assert(fade.dropped[0]?.paramChanged.includes('SS-001'), 'a fade is a change')
  const phase = textPlan(sheet({ phaseEnd: 300 }))
  assert(phase.dropped[0]?.paramChanged.includes('fasi'), 'so is a phase boundary')
  assert(!says(describeImportPlan(phase, 12), 'identico a quello salvato'),
    '…and neither is called identical')
}

/* ---- words AND dials in the same file ----------------------------------- */
console.log('\n--- a file that changes both ---')
{
  const p = textPlan(sheet({ testo: 'Benvenuta. Questo è il tuo momento.', volumeDb: -30 }))
  const lines = describeImportPlan(p, 12)
  assert(!p.nothing, 'there is something to write: the words')
  assert(says(lines, 'testo italiano cambiato in 1 riga'), 'the text change is reported')
  assert(p.dropped.length === 1 && says(lines, '⚠'),
    'and the volume the mode will not import is reported beside it')
}

/* ---- a row the saved timeline has never seen ---------------------------- */
console.log('\n--- a file with a new row ---')
{
  const p = textPlan(sheet({ extra: [voice('VC-003', 500, 'Ancora un respiro.')] }))
  const lines = describeImportPlan(p, 12)
  assert(p.ignored.includes('VC-003'), 'the unmatched row is still reported as ignored')
  assert(!p.nothing, 'and the plan does not claim the file is identical')
  assert(!says(lines, 'identico a quello salvato'), '…in the lines either')
}

/* ---- the full import has nothing to drop -------------------------------- */
console.log('\n--- "tutto il file", where everything is imported ---')
{
  const p = planPlainImport({ timeline: sheet({ volumeDb: -27 }), existing: saved(stored), selected: 12, mode: 'import' })
  assert(!p.dropped.length, 'nothing is dropped — the mode takes the whole file')
  assert(!p.nothing, 'and the change is written')
  assert(says(describeImportPlan(p, 12), 'tempi o parametri cambiati in 1 riga'),
    'reported as the parameter change it is')
}

/* ---- the cells nobody plays ---------------------------------------------

   The fix above held, and then the panel found a second way to say the same
   wrong thing. A workbook arriving with nothing but a filled `testo_pt`
   column was announced as changing "timings or parameters in 5 rows" and the
   operator was pointed at «Tutto il file» — because the PO had also rewritten
   the `note` cells beside the text, and a comment was being compared as a
   parameter. Same for `fase` written `1-1` where the sheet had said `1`: the
   span is already parsed into faseFrom/faseTo, and only the raw echo moved.

   Both are still reported — a changed note is not nothing — but quietly, and
   never as a reason to rebuild somebody's Studio session.
   ------------------------------------------------------------------------ */
console.log('\n--- a note rewritten beside the words ---')
{
  const p = textPlan(sheet({ note: 'Rivisto con Giampiero il 28/10.' }))
  const lines = describeImportPlan(p, 12)
  assert(!p.dropped.length, 'a comment is not a parameter')
  assert(p.annotated.length === 1 && p.annotated[0].annotated.includes('SS-001'),
    '…it is an annotation, and the row is named')
  assert(!says(lines, '⚠'), 'no warning')
  assert(!says(lines, 'Tutto il file'), '…and nobody is sent to the full import')
  assert(!says(lines, 'identico a quello salvato'), 'but the file is not called identical either')
  assert(says(lines, 'solo note o commenti'), 'it says what moved')
}

console.log('\n--- the same, for a respaced fase cell ---')
{
  const p = textPlan(sheet({ faseRaw: '1-1' }))
  assert(!p.dropped.length && p.annotated.length === 1, 'the raw cell is not the phase')
  assert(!says(describeImportPlan(p, 12), '⚠'), '…and raises nothing')
}

console.log('\n--- a note, with new words beside it ---')
{
  const p = textPlan(sheet({ note: 'Da rivedere.', testo: 'Benvenuta. Questo è il tuo momento.' }))
  const lines = describeImportPlan(p, 12)
  assert(!p.nothing && !p.dropped.length, 'the words are imported and nothing is blocked')
  assert(says(lines, 'testo italiano cambiato in 1 riga'), 'the text change is still reported')
}

console.log('\n--- "tutto il file" still writes the note ---')
{
  const p = planPlainImport({ timeline: sheet({ note: 'Rivisto.' }), existing: saved(stored), selected: 12, mode: 'import' })
  const lines = describeImportPlan(p, 12)
  assert(!p.nothing, 'a file with a new comment is not nothing to import')
  assert(says(lines, 'note o commenti cambiati in 1 riga'), '…and the summary says which')
  assert(!says(lines, 'tempi o parametri'), 'without claiming a parameter moved')
}

/* ---- the sentence, wherever it appears ---------------------------------- */
/* ---- why there is nothing to write -------------------------------------

   The third round of the same report: "it still tells him to look at the
   whole file". The panel was right that the words were already saved and
   right that the rest of the file was not — what it never said is HOW it
   knew, and an operator who had just corrected a column read "nessun testo
   nuovo nel file" as a broken import rather than as a statement about the
   file in his hands. Three situations, three sentences.
   ------------------------------------------------------------------------ */
console.log('\n--- the file really does carry the saved words ---')
{
  const lines = describeImportPlan(textPlan(sheet()), 12)
  assert(says(lines, 'identici, parola per parola'),
    'the panel says the columns were read and matched')
  assert(says(lines, 'righe confrontate'), '…and how many rows it compared')
}

console.log('\n--- a workbook with no readable text column ---')
{
  const lines = describeImportPlan(textPlan(sheet({ noText: true })), 12)
  assert(says(lines, 'nessuna colonna di testo leggibile'),
    'an empty column is not the same news as an identical one')
  assert(says(lines, 'testo_pt_m'), '…and the spellings it does read are listed')
  assert(!says(lines, 'identici, parola per parola'), 'nothing is claimed to match')
}

console.log('\n--- a workbook whose ids match nothing saved ---')
{
  const p = textPlan(sheet({ idSuffix: '-bis' }))
  const lines = describeImportPlan(p, 12)
  assert(p.ignored.length > 0, 'the rows are reported as ignored')
  assert(says(lines, 'nessuna delle sue righe corrisponde'),
    '…and the text line says no text was compared at all')
}

/* ---- the room where the words are actually spoken -----------------------

   "Now I can import only the text, but when I enter the Studio - the most
   important part - the texts are still the old ones."

   They were. A saved Studio session holds its own copy of every clip's text
   in every language, and it has to: it is what the rack, the draws and the
   renders hang off, and `studioFor` reads it INSTEAD of the sheet.
   `loadLang` fills a clip's words from the workbook only where the session
   has none of its own, so a corrected translation landed in the catalogue
   and stopped at the door of the one screen that speaks it.

   The import carries the words in. Nothing else of the session moves, and
   the renders stay put with their old `ttsText`, which is what makes an
   updated line show as needing a new take instead of passing the old one
   off as current.
   ------------------------------------------------------------------------ */
console.log('\n--- the Studio session gets the new words ---')
{
  const entry = entryForPublish({
    timeline: sheet({ testo: 'Benvenuta. Sei nel tuo momento.' }),
    existing: saved(stored, session()), selected: 12, keepDraft: true, intoExisting: true, mode: 'text',
  })
  const [matched, absent, loose] = clipsOf(entry)
  assert(matched.textByLang?.it === 'Benvenuta. Sei nel tuo momento.',
    'the matched clip speaks the imported words')
  assert(matched.text === 'Benvenuta. Sei nel tuo momento.',
    'the live field follows, because a stored session is canonically Italian')
  assert(matched.ttsPath === 'tts/old.mp3' && matched.ttsText === IT_ONE,
    'the render is left alone, still naming what it actually says')
  assert(matched.textByLang?.['pt-BR'] === 'Bem-vindo. Este \u00e9 o seu momento.',
    'a language the file does not carry keeps what the session had')
  assert(absent.text === 'Una clip che il foglio non ha.', 'a clip the sheet has no row for is untouched')
  assert(loose.text === 'Una clip senza sourceId.', 'and so is one with nothing to match on')
}

console.log('\n--- a full import leaves the session to the stamp ---')
{
  const entry = entryForPublish({
    timeline: sheet({ testo: 'Benvenuta. Sei nel tuo momento.' }),
    existing: saved(stored, session()), selected: 12, keepDraft: true, intoExisting: true, mode: 'import', now: 1_800_000_000_000,
  })
  assert(clipsOf(entry)[0].text === IT_ONE,
    'the words are not pushed in: the session no longer describes these clips')
  assert(entry.plainImportedAt?.[12] === 1_800_000_000_000,
    'it is stamped instead, and the Studio reads the sheet')
}

console.log('\n--- nothing to carry, nothing rewritten ---')
{
  const before = session()
  const entry = entryForPublish({
    timeline: sheet(), existing: saved(stored, before), selected: 12, keepDraft: true, intoExisting: true, mode: 'text',
  })
  assert(JSON.stringify(clipsOf(entry)) === JSON.stringify(before.tracks[0].clips),
    'an identical file leaves the session byte for byte')
}

console.log('\n--- the word itself ---')
{
  for (const [what, file] of [
    ['a volume', sheet({ volumeDb: -27 })],
    ['a fade', sheet({ fadeInS: 9 })],
    ['a phase', sheet({ phaseEnd: 300 })],
    ['a new row', sheet({ extra: [voice('VC-003', 500, 'Ancora.')] })],
    ['a note', sheet({ note: 'Rivisto.' })],
  ] as [string, PlainTimeline][]) {
    const lines = describeImportPlan(textPlan(file), 12)
    assert(!lines.some((l) => l.includes('identico')),
      `"identico" is never printed for a file where ${what} changed`)
  }
}

console.log(`\n${pass} checks, ${fails.length} failed`)
if (fails.length) process.exit(1)
