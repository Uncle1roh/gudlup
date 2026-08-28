/* ============================================================================
   Import → Publish → reopen → edit in the Studio

   The loop the POs actually work in, run end to end against the real data
   layer. One Excel per time signature: import the 12-minute workbook, publish
   it, and that time signature must be editable in the Studio immediately —
   without disturbing the 6- and 24-minute versions already published, their
   timelines, or the audio attached to them.

   Everything here is the shipping code path: `entryForPublish` is what the
   Publish button writes, `plainFor` is what the catalog row reopens through,
   and `plainToStudioTracks` is what the Studio is seeded with.

       npx esbuild tools/test-publish-plain.ts --bundle --platform=node \
         --format=esm --outfile=<tmp>/pp.mjs && node <tmp>/pp.mjs
   ============================================================================ */

import { entryForPublish, entryForStudioSave } from '../src/admin/publishPlain'
import { plainToStudioTracks } from '../src/admin/plainStudio'
import { mergedPlain, plainFor, plainDurations, type CatalogProtocol } from '../src/data/catalog'
import type { PlainClip, PlainTimeline, PlainVersion } from '../src/admin/plainTimeline'
import type { Duration } from '../src/types/domain'

let pass = 0
const fails: string[] = []
function assert(cond: boolean, what: string): void {
  if (cond) { pass += 1; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

const T = 1_700_000_000_000

/** A workbook for ONE time signature, the way the POs export them. */
function workbook(durationMin: number): PlainTimeline {
  const durationS = durationMin * 60
  const clips: PlainClip[] = [
    {
      clipId: `C1-${durationMin}`, traccia: 'Soundscape', tipo: 'soundscape',
      startS: 0, endS: durationS, fadeInS: 2, fadeOutS: 3,
      ambiente: 'lago calmo', volumeDb: -24,
    } as PlainClip,
    {
      clipId: `C2-${durationMin}`, traccia: 'Voce', tipo: 'voice',
      startS: 10, endS: 30, fadeInS: 0, fadeOutS: 0,
      testo: `Affermazione ${durationMin}`, volumeDb: -6,
    } as PlainClip,
  ]
  const version: PlainVersion = {
    sheet: `Timeline_${durationMin}min`,
    durationMin,
    durationS,
    levelMode: 'absolute',
    clips,
    phases: [1, 2, 3, 4, 5, 6].map((fase, i) => ({
      fase, label: `F${fase}`,
      startS: (durationS / 6) * i,
      endS: (durationS / 6) * (i + 1),
    })),
  } as PlainVersion
  return {
    code: 'GL-ANX 1.1',
    title: 'Safety and Calm',
    versions: [version],
    affirmations: [],
    issues: [],
  }
}

/* ------------------------------------------------- one signature at a time */
console.log('\n--- publishing one time signature at a time ---')

/* 12 first: the workbook a PO happens to finish first, on a protocol the
   catalog has never seen. */
let row: CatalogProtocol | undefined
row = entryForPublish({ timeline: workbook(12), existing: row, selected: 12, now: T })

assert(plainDurations(row).join() === '12', 'after the first publish the catalog holds exactly that duration')
assert(!!plainFor(row, 12), 'and the 12-minute timeline reads back')
assert(row.versions.some((v) => v.duration === 12), 'the catalog version list carries it')
assert(row.enabled, 'a published protocol is enabled')
assert(row.source === 'imported', 'and marked imported, not seed')

/* THE point of the exercise: that time signature is editable in the Studio
   straight away, from what the CATALOG holds — not from the import screen's
   in-memory copy. */
const reopened12 = plainFor(row, 12)!
const seed12 = plainToStudioTracks(reopened12, reopened12.versions[0])
assert(seed12.tracks.length > 0, 'the Studio can be seeded from the published 12-minute timeline')
assert(
  seed12.tracks.some((t) => t.type === 'sample') && seed12.tracks.some((t) => t.type === 'voice'),
  'with the soundscape and the voice the workbook described',
)
assert(
  seed12.tracks.flatMap((t) => t.clips).every((c) => c.durationSec > 0),
  'and every clip has a real length',
)

/* -------------------------------------------- adding the other signatures */
console.log('\n--- adding 6, then 24 ---')

row = entryForPublish({ timeline: workbook(6), existing: row, selected: 6, now: T + 1000 })
assert(plainDurations(row).join() === '6,12', 'publishing 6 ADDS to 12, it does not replace it')
assert(plainFor(row, 12)?.versions[0].sheet === 'Timeline_12min', 'and 12 is byte-for-byte the sheet published before')

row = entryForPublish({ timeline: workbook(24), existing: row, selected: 24, now: T + 2000 })
assert(plainDurations(row).join() === '6,12,24', 'all three time signatures coexist')
assert(row.versions.map((v) => v.duration).join() === '6,12,24', 'and all three appear in the catalog version list')

for (const d of [6, 12, 24] as Duration[]) {
  const tl = plainFor(row, d)
  assert(!!tl, `${d}m reads back from the catalog`)
  assert(tl!.versions.length === 1, `${d}m holds exactly its own sheet, not the others`)
  assert(tl!.versions[0].durationMin === d, `${d}m holds the right sheet`)
  const seed = plainToStudioTracks(tl!, tl!.versions[0])
  assert(seed.tracks.length > 0, `${d}m can be opened in the Studio`)
}

/* The chips on the workscreen come from this. */
const merged = mergedPlain(row)!
assert(merged.versions.length === 3, 'the workscreen sees three selectable time signatures')
assert(
  merged.versions.map((v) => v.durationMin).join() === '6,12,24',
  'in ascending order, one per signature',
)

/* ----------------------------------------- republishing must not disturb -- */
console.log('\n--- republishing one signature ---')

/* CLAUDE.md, non-negotiable: publishing ONE time signature must never disturb
   the others — their timeline, their Studio session or their attached audio. */
const withAudio: CatalogProtocol = {
  ...row,
  versions: row.versions.map((v) => (v.duration === 24 ? { ...v, audioUrl: { 'pt-BR': 'https://x/24.mp3' } } : v)),
  studioByDuration: { 6: { name: 'six', tracks: [] } as never },
  assetMap: { music: {}, soundscape: {} } as never,
}

const after = entryForPublish({ timeline: workbook(12), existing: withAudio, selected: 12, now: T + 3000 })

assert(
  after.versions.find((v) => v.duration === 24)?.audioUrl?.['pt-BR'] === 'https://x/24.mp3',
  'the 24-minute audio survives a 12-minute republish',
)
assert(!!after.studioByDuration?.[6], 'the 6-minute Studio session survives it')
assert(!!after.assetMap, 'and so does the asset mapping')
assert(plainDurations(after).join() === '6,12,24', 'all three timelines are still there')
assert(plainFor(after, 6)?.versions[0].sheet === 'Timeline_6min', 'the 6-minute sheet is untouched')

/* ------------------------------------------------------ the legacy row --- */
console.log('\n--- a row written before per-duration storage existed ---')

/* `plain` alone, no `plainByDuration` — what the oldest imports left behind.
   The next publish must carry it forward instead of dropping it. */
const legacy: CatalogProtocol = {
  code: 'GL-ANX 1.2', family: 'GL-ANX', title: 'Grounded Calm', blurb: '',
  phases: [], versions: [{ duration: 6 }], enabled: true, source: 'imported',
  tenants: 'all', audioReady: false, updatedAt: T,
  plain: workbook(6),
} as CatalogProtocol

assert(plainDurations(legacy).join() === '6', 'a legacy row still reports its duration')
assert(!!plainFor(legacy, 6), 'and still reads back, through the legacy field')

const upgraded = entryForPublish({ timeline: { ...workbook(24), code: 'GL-ANX 1.2' }, existing: legacy, selected: 24, now: T })
assert(plainDurations(upgraded).join() === '6,24', 'publishing 24 onto a legacy row keeps the legacy 6')
assert(!!upgraded.plainByDuration?.[6], 'and promotes it into per-duration storage on the way')

/* ----------------------------------------------------------- refusals ---- */
console.log('\n--- what publish refuses ---')

let threw = false
try {
  entryForPublish({ timeline: { ...workbook(12), code: null }, existing: undefined, now: T })
} catch { threw = true }
assert(threw, 'a workbook with no GL code cannot be published — there would be nothing to file it under')

/* --------------------------------------------- saving before publishing -- */
console.log('\n--- a Studio session saved before anything is published ---')

/* The PO builds the mix before the workbook is final. Saving files the protocol
   in the catalog so it can be found and worked on again — as a DRAFT. */
const draft = entryForStudioSave({
  code: 'GL-ANX 9.9',
  duration: 12,
  existing: undefined,
  projectName: 'Nuovo protocollo',
  now: T,
})

assert(draft.code === 'GL-ANX 9.9', 'saving creates the catalog entry')
assert(draft.family === 'GL-ANX', 'with the family read off the code')
assert(draft.versions.map((v) => v.duration).join() === '12', 'declaring the time signature being worked on')
assert(draft.enabled === false, 'and it is NOT active — nothing has been published for it')
assert(!draft.audioReady, 'no audio is claimed')
assert(!mergedPlain(draft), 'and there is no timeline behind it yet')

/* It has to survive being reopened and saved again — that is the whole point
   of filing it. */
const draftAgain = entryForStudioSave({
  code: 'GL-ANX 9.9', duration: 12, existing: draft, projectName: 'ignored', now: T + 1000,
})
assert(draftAgain.enabled === false, 'saving a draft again leaves it a draft')
assert(draftAgain.title === draft.title, 'and does not rename it from the project name')

/* A second time signature can be built before either is published. */
const twoDrafts = entryForStudioSave({
  code: 'GL-ANX 9.9', duration: 24, existing: draft, projectName: 'x', now: T + 2000,
})
assert(twoDrafts.versions.map((v) => v.duration).join() === '12,24', 'a second signature is added, not swapped in')

/* -------------------------------------------- publishing is what activates */
console.log('\n--- publishing the draft ---')

const activated = entryForPublish({
  timeline: { ...workbook(12), code: 'GL-ANX 9.9' },
  existing: draft,
  selected: 12,
  now: T + 3000,
})
assert(activated.enabled === true, 'publishing a duration activates the protocol')
assert(!!plainFor(activated, 12), 'and the timeline is there to reopen')

/* ------------------------------------- a save must never change live state */
console.log('\n--- saving onto a protocol that is already live ---')

const live: CatalogProtocol = { ...activated, enabled: true }
const afterSave = entryForStudioSave({
  code: live.code, duration: 24, existing: live, projectName: 'x', now: T + 4000,
})
assert(afterSave.enabled === true, 'saving a session never takes a live protocol off the air')
assert(!!plainFor(afterSave, 12), 'and never drops the published timeline')

const switchedOff: CatalogProtocol = { ...activated, enabled: false }
const afterSaveOff = entryForStudioSave({
  code: switchedOff.code, duration: 12, existing: switchedOff, projectName: 'x', now: T + 5000,
})
assert(
  afterSaveOff.enabled === false,
  'and never silently switches back on one an admin deliberately disabled',
)

console.log(`\n${pass} assertions passed.`)
if (fails.length) {
  console.log(`${fails.length} FAILED:`)
  for (const f of fails) console.log('  -', f)
  process.exit(1)
}
