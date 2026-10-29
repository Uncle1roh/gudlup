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

import { planPlainImport, describeImportPlan } from '../src/admin/publishPlain'
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
}

function voice(id: string, startS: number, testo: string, volumeDb = -6): PlainClip {
  return {
    clipId: id, traccia: 'Voce Guida', tipo: 'voice',
    startS, endS: startS + 8, fadeInS: 0, fadeOutS: 0,
    testo, testoByLang: { it: testo }, volumeDb,
  } as PlainClip
}

function sheet(k: Knobs = {}): PlainTimeline {
  const clips: PlainClip[] = [
    {
      clipId: 'SS-001', traccia: 'Soundscape', tipo: 'soundscape',
      startS: 0, endS: 720, fadeInS: k.fadeInS ?? 4, fadeOutS: 3,
      ambiente: 'bosco', volumeDb: k.volumeDb ?? -24,
    } as PlainClip,
    voice('VC-001', 20, k.testo ?? 'Benvenuto. Questo è il tuo momento di pace.'),
    voice('VC-002', 300, 'Lascia andare il respiro.'),
    ...(k.extra ?? []),
  ]
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

function saved(t: PlainTimeline): CatalogProtocol {
  return {
    code: 'GL-ANX 1.1', family: 'GL-ANX', title: 'Standard', blurb: '', phases: [],
    versions: [{ duration: 12 }],
    enabled: true, source: 'imported', tenants: 'all', audioReady: false,
    plainByDuration: { 12: t } as never,
    updatedAt: 1_700_000_000_000,
  } as unknown as CatalogProtocol
}

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
  assert(says(describeImportPlan(p, 12), 'tempi o parametri cambiati in 1 voce'),
    'reported as the parameter change it is')
}

/* ---- the sentence, wherever it appears ---------------------------------- */
console.log('\n--- the word itself ---')
{
  for (const [what, file] of [
    ['a volume', sheet({ volumeDb: -27 })],
    ['a fade', sheet({ fadeInS: 9 })],
    ['a phase', sheet({ phaseEnd: 300 })],
    ['a new row', sheet({ extra: [voice('VC-003', 500, 'Ancora.')] })],
  ] as [string, PlainTimeline][]) {
    const lines = describeImportPlan(textPlan(file), 12)
    assert(!lines.some((l) => l.includes('identico')),
      `"identico" is never printed for a file where ${what} changed`)
  }
}

console.log(`\n${pass} checks, ${fails.length} failed`)
if (fails.length) process.exit(1)
