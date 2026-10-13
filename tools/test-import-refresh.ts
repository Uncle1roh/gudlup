/* ============================================================================
   Re-importing a corrected Excel

   Both halves of what a PO hit on CALM 1.4 Deep (24 min). The Eco track in
   phase 4 was short a repeat, so the sheet was corrected — rows added, a file
   renamed — and re-imported. Neither route worked:

     "solo i testi"  → "Identico: niente da importare", though the file
                       carried rows the saved timeline had never seen;
     "tutto il file" → the import went through and the STUDIO still showed
                       the old configuration.

   The only thing that worked was deleting the 24-minute version and importing
   it again, which is the clue: that is the one path that also drops the saved
   Studio session.

       npx esbuild tools/test-import-refresh.ts --bundle --platform=node \
         --format=cjs --define:import.meta.env={} --outfile=<tmp>/ir.cjs \
         && node <tmp>/ir.cjs
   ============================================================================ */

import { entryForPublish, planPlainImport } from '../src/admin/publishPlain'
import { plainFor, studioFor, type CatalogProtocol } from '../src/data/catalog'
import type { StudioProject } from '../src/compose/types'
import type { PlainClip, PlainTimeline, PlainVersion } from '../src/admin/plainTimeline'

let pass = 0
const fails: string[] = []
function assert(cond: boolean, what: string): void {
  if (cond) { pass += 1; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

const T = 1_700_000_000_000

function voice(id: string, startS: number, testo: string): PlainClip {
  return {
    clipId: id, traccia: 'Eco', tipo: 'voice',
    startS, endS: startS + 8, fadeInS: 0, fadeOutS: 0,
    testo, testoByLang: { it: testo }, volumeDb: -6,
  } as PlainClip
}

/** A 24-minute sheet. `extra` is the repeat the PO had to add. */
function sheet24(extra: PlainClip[] = [], renamed = false): PlainTimeline {
  const clips: PlainClip[] = [
    {
      clipId: 'S1', traccia: 'Soundscape', tipo: 'soundscape',
      startS: 0, endS: 1440, fadeInS: 2, fadeOutS: 3,
      ambiente: renamed ? 'eco-qui-ora-v2' : 'eco-qui-ora', volumeDb: -24,
    } as PlainClip,
    voice('V1', 100, 'qui … ora …'),
    ...extra,
  ]
  const version: PlainVersion = {
    sheet: 'Timeline_24min', durationMin: 24, durationS: 1440,
    levelMode: 'absolute', clips,
    phases: [1, 2, 3, 4, 5, 6].map((fase, i) => ({
      fase, label: `F${fase}`, startS: 240 * i, endS: 240 * (i + 1),
    })),
  } as PlainVersion
  return { code: 'GL-CALM 1.4', title: 'Deep', versions: [version], affirmations: [], issues: [] }
}

/* ---------------------------------------------------------------------- */
console.log('\n--- "solo i testi", on a file that adds rows ---')

const stored = sheet24()
const corrected = sheet24([voice('V2', 400, 'qui … ora …')])

/** The protocol as the catalog holds it, with the 24-minute sheet saved. */
function saved(t: PlainTimeline): CatalogProtocol {
  return {
    code: 'GL-CALM 1.4', family: 'CALM', title: 'Deep', blurb: '', phases: [],
    versions: [{ duration: 24 }],
    enabled: true, source: 'imported', tenants: 'all', audioReady: false,
    plainByDuration: { 24: t } as never,
    updatedAt: T,
  }
}

const textPlan = planPlainImport({ timeline: corrected, existing: saved(stored), selected: 24, mode: 'text' })
/* Nothing is wrong with ignoring the new row — "solo i testi" says it edits
   words and leaves structure alone. What is wrong is calling that identical. */
assert(
  textPlan.ignored.length === 1 && textPlan.ignored[0] === 'V2',
  'the row the saved timeline has never seen is reported as ignored',
)
assert(
  !textPlan.nothing,
  'and the plan does NOT claim the file is identical — there is something to tell the operator',
)

const sameAgain = planPlainImport({ timeline: sheet24(), existing: saved(stored), selected: 24, mode: 'text' })
assert(sameAgain.nothing, 'a file that really is identical still says so')
assert(!sameAgain.ignored.length, 'with nothing ignored')

/* ---------------------------------------------------------------------- */
console.log('\n--- "tutto il file", with a Studio session already saved ---')

const oldSession: StudioProject = { name: 'deep-24', lengthSec: 1440, masterGain: 0.8, tracks: [], savedAt: T }
const sixSession: StudioProject = { name: 'deep-6', lengthSec: 360, masterGain: 0.8, tracks: [], savedAt: T }

const published: CatalogProtocol = {
  code: 'GL-CALM 1.4', family: 'CALM', title: 'Deep', blurb: '', phases: [],
  versions: [{ duration: 6 }, { duration: 24 }],
  enabled: true, source: 'imported', tenants: 'all', audioReady: false,
  plainByDuration: { 6: sheet24(), 24: stored } as never,
  studioByDuration: { 6: sixSession, 24: oldSession } as never,
  updatedAt: T,
}

const reimported = entryForPublish({
  timeline: sheet24([voice('V2', 400, 'qui … ora …')], true),
  existing: published, selected: 24, mode: 'import', now: T + 1000,
})

assert(
  plainFor(reimported, 24)?.versions[0].clips.some((c) => c.clipId === 'V2'),
  'the corrected timeline is stored',
)
assert(
  plainFor(reimported, 24)?.versions[0].clips.find((c) => c.clipId === 'S1')?.ambiente === 'eco-qui-ora-v2',
  'including the renamed file',
)
/* The bug. The session was built from the clips that have just been replaced,
   and `studioFor` prefers it over the sheet, so the Studio reopened on the old
   configuration and no amount of re-importing could shift it. */
assert(
  !studioFor(reimported, 24),
  'the Studio session built from the REPLACED timeline is dropped, so the Studio reopens on the new sheet',
)
/* …and the rule that matters more: one time signature never disturbs another. */
assert(
  studioFor(reimported, 6) === sixSession,
  'the 6-minute Studio session is untouched',
)
assert(
  !!plainFor(reimported, 6),
  'and so is its timeline',
)

/* A text-only import changes words, not structure, so the session it was built
   from is still the right one — this is the M/F and pt-BR path the PO was
   worried about, and it must NOT cost anyone their Studio work. */
const textImported = entryForPublish({
  timeline: sheet24(),
  existing: published, selected: 24, mode: 'text', now: T + 2000,
})
assert(
  studioFor(textImported, 24) === oldSession,
  'a texts-only import keeps the Studio session — translations cost no Studio work',
)

console.log(`\n${pass} assertions passed.`)
if (fails.length) {
  console.log(`${fails.length} FAILED:`)
  for (const f of fails) console.log('  -', f)
  process.exit(1)
}
