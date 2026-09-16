/* ============================================================================
   Removing material from a protocol — and only the material asked for

       npx esbuild tools/test-protocol-removal.ts --bundle --platform=node \
         --format=esm --outfile=<tmp>/pr.mjs && node <tmp>/pr.mjs
   ============================================================================ */

import { entryForPublish } from '../src/admin/publishPlain'
import { clearAuthoredMaterial, hasAuthoredMaterial, hasDurationMaterial, removeDurationMaterial } from '../src/admin/protocolRemoval'
import { durationState, mergedPlain, plainDurations, plainFor, studioFor, type CatalogProtocol } from '../src/data/catalog'
import type { StudioProject } from '../src/compose/types'
import type { PlainTimeline, PlainVersion } from '../src/admin/plainTimeline'

let pass = 0
const fails: string[] = []
function assert(cond: boolean, what: string): void {
  if (cond) { pass += 1; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

const T = 1_700_000_000_000

function workbook(durationMin: number, code: string | null = 'GL-ANX 1.4', title: string | null = 'Fiducia nel presente'): PlainTimeline {
  const durationS = durationMin * 60
  const version = {
    sheet: `Timeline_${durationMin}min`, durationMin, durationS, levelMode: 'absolute',
    clips: [], phases: [],
  } as unknown as PlainVersion
  return { code, title, versions: [version], affirmations: [], issues: [] }
}
function session(lengthSec: number, name: string): StudioProject {
  return { name, lengthSec, tracks: [] } as unknown as StudioProject
}
function base(): CatalogProtocol {
  return {
    code: 'GL-ANX 1.4', family: 'anxiety', title: 'Fiducia nel presente', blurb: '',
    phases: [], versions: [
      { duration: 6, audioUrl: { 'pt-BR': 'https://x/6.mp3' } },
      { duration: 12 },
      { duration: 24 },
    ],
    enabled: true, source: 'imported', tenants: 'all', audioReady: true,
    publicTitle: 'Un momento di calma', tags: ['calma'], updatedAt: T,
  } as unknown as CatalogProtocol
}

/* ------------------------------------------------ one duration, per-slot row */
console.log('\n--- removing one time signature (per-duration storage) ---')
let row = base()
row = { ...row, plainByDuration: { 6: workbook(6), 12: workbook(12), 24: workbook(24) },
  studioByDuration: { 6: session(360, 's6'), 12: session(720, 's12'), 24: session(1440, 's24') } }

const minus12 = removeDurationMaterial(row, 12, T + 1)
assert(plainDurations(minus12).join() === '6,24', '12 is gone, 6 and 24 remain')
assert(plainFor(minus12, 6) === row.plainByDuration![6] && plainFor(minus12, 24) === row.plainByDuration![24], 'the remaining timelines are the same objects, untouched')
assert(!studioFor(minus12, 12), 'the 12-minute Studio session is gone')
assert(studioFor(minus12, 6)?.name === 's6' && studioFor(minus12, 24)?.name === 's24', 'the other sessions remain')
assert(minus12.code === row.code && minus12.title === row.title && minus12.publicTitle === row.publicTitle, 'code and titles unchanged')
assert(JSON.stringify(minus12.tags) === JSON.stringify(row.tags), 'tags unchanged')
assert(minus12.versions === row.versions && minus12.versions[0].audioUrl?.['pt-BR'] === 'https://x/6.mp3', 'published audio unchanged')
assert(minus12.enabled === row.enabled, 'on/off state unchanged')
assert(durationState(minus12, 12) === 'empty', 'the 12-minute pill reads empty')
assert(!hasDurationMaterial(minus12, 12) && hasDurationMaterial(minus12, 6), 'hasDurationMaterial agrees')
assert(removeDurationMaterial(minus12, 12, T + 2).plainByDuration !== undefined, 'removing an already-empty duration is harmless')

const minusAll = removeDurationMaterial(removeDurationMaterial(minus12, 6), 24)
assert(minusAll.plainByDuration === undefined && minusAll.studioByDuration === undefined, 'removing the last one leaves no empty slots behind')
assert(mergedPlain(minusAll) === undefined, 'and the workscreen sees no timeline')

/* ------------------------------------------------ one duration, legacy row */
console.log('\n--- removing one time signature from a row written before per-duration storage ---')
const legacyPlain: PlainTimeline = { ...workbook(6), versions: [...workbook(6).versions, ...workbook(24).versions] }
let legacy: CatalogProtocol = { ...base(), plain: legacyPlain, studio: session(1440, 'legacy24') }
const legacyMinus6 = removeDurationMaterial(legacy, 6)
assert(plainDurations(legacyMinus6).join() === '24', 'a legacy workbook holding 6 and 24 keeps 24 when 6 is removed')
assert(plainFor(legacyMinus6, 24)?.versions[0].sheet === 'Timeline_24min', 'and it is the 24-minute sheet')
assert(legacyMinus6.plain === undefined, 'the legacy field is retired, so 6 cannot come back through it')
assert(studioFor(legacyMinus6, 24)?.name === 'legacy24', 'the legacy 24-minute session is kept for 24')
legacy = removeDurationMaterial(legacyMinus6, 24)
assert(plainDurations(legacy).length === 0 && !studioFor(legacy, 24), 'removing 24 next empties it')

/* ------------------------------------------------ everything */
console.log('\n--- emptying all authored material ---')
const full = { ...row, datasheet: {} as never, spec: {} as never, assetMap: {} as never, plain: workbook(6) }
const cleared = clearAuthoredMaterial(full, T + 5)
assert(!hasAuthoredMaterial(cleared) && hasAuthoredMaterial(full), 'nothing authored remains')
assert(cleared.title === row.title && cleared.versions === row.versions && cleared.publicTitle === row.publicTitle, 'identity and audio remain')

/* ------------------------------------------------ importing / publishing */
console.log('\n--- the workbook never renames or re-files the protocol ---')
const existing = base()
const noCode = entryForPublish({ timeline: { ...workbook(12, null, 'CATALOGO'), code: existing.code }, existing, selected: 12, keepDraft: true, intoExisting: true })
assert(noCode.code === 'GL-ANX 1.4', 'a README with no code is filed under the protocol it was imported into')
assert(plainFor(noCode, 12)?.code === 'GL-ANX 1.4', 'and the stored timeline carries that code')
assert(noCode.title === 'Fiducia nel presente', 'the README first line does not replace the clinical title on import')
const published = entryForPublish({ timeline: { ...workbook(12, null, 'CATALOGO'), code: existing.code }, existing, selected: 12, intoExisting: true })
assert(published.title === 'Fiducia nel presente', 'nor on Publish')

console.log(`\n${pass} passed, ${fails.length} failed`)
if (fails.length) { for (const f of fails) console.log('  -', f); throw new Error('protocol removal tests failed') }
