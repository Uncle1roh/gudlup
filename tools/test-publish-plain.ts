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
import { newProtocolEntry, newProtocolError } from '../src/admin/CatalogAdmin'
import { plainToStudioTracks } from '../src/admin/plainStudio'
import { CATALOG_DURATIONS, durationState, mergedPlain, plainFor, plainDurations, studioFor, type CatalogProtocol } from '../src/data/catalog'
import type { SeedClip, StudioProject } from '../src/compose/types'
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

/* ------------------------------------------ reopening what was saved ----- */
console.log('\n--- close the browser, come back, press Modifica ---')

/* The reported bug: save a session at 12 minutes on a protocol that also
   declares 24, close the browser, press Modifica — and the 24-minute version
   opens from its timeline. The work looked lost. It was sitting untouched in
   the 12-minute slot; the wrong slot was being asked for. */
function pickDuration(p: CatalogProtocol, want?: Duration): Duration | undefined {
  const declared = CATALOG_DURATIONS.filter((d) => p.versions.some((v) => v.duration === d))
  const withSession = declared.filter((d) => studioFor(p, d))
  return (want != null && p.versions.some((v) => v.duration === want) ? want : undefined)
    ?? withSession[0]
    ?? (p.versions.find((v) => v.duration === 24) ?? p.versions[0])?.duration
}

const session: StudioProject = { name: 'twelve', lengthSec: 720, masterGain: 0.8, tracks: [], savedAt: T }
const savedAt12: CatalogProtocol = {
  ...row,
  versions: [{ duration: 6 }, { duration: 12 }, { duration: 24 }],
  studioByDuration: { 12: session },
}

assert(pickDuration(savedAt12) === 12, 'Modifica opens the signature that HAS a saved session, not 24')
assert(studioFor(savedAt12, 12)?.name === 'twelve', 'and that session is the one that comes back')
assert(!studioFor(savedAt12, 24), 'the 24-minute slot is genuinely empty — nothing was overwritten')

/* An explicit request still wins: clicking the 24m pill opens 24. */
assert(pickDuration(savedAt12, 24) === 24, 'asking for a specific signature overrides the preference')

/* With no session anywhere, the old behaviour stands. */
const noSessions: CatalogProtocol = { ...row, versions: [{ duration: 6 }, { duration: 24 }] }
assert(pickDuration(noSessions) === 24, 'with nothing saved it still opens the longest version')

/* Two saved sessions: the shortest comes first, deterministically, rather than
   depending on object key order. */
const savedTwice: CatalogProtocol = {
  ...savedAt12,
  studioByDuration: { 24: { ...session, name: 'twentyfour' }, 6: { ...session, name: 'six' } },
}
assert(pickDuration(savedTwice) === 6, 'the first declared signature with a session wins, in ascending order')

/* --------------------------------------- a save must round-trip in full -- */
console.log('\n--- what a saved clip carries back ---')

/* `toStudioProject` writes these and `seedTrackToTrack` reads them. Both lists
   have to agree or an edit is written and never restored — which is how the
   per-clip EQ was being lost, silently, on every reopen. */
const SAVED_CLIP_FIELDS = [
  'startSec', 'durationSec', 'params', 'text', 'gainDb',
  'fadeInSec', 'fadeOutSec', 'calibrateDb', 'eq', 'ttsPath', 'ttsText',
]
const roundTrip: SeedClip = {
  startSec: 10, durationSec: 20, params: { pan: 0 } as never, text: 'ciao',
  gainDb: -3, fadeInSec: 1, fadeOutSec: 2, calibrateDb: -18,
  eq: { lowGainDb: 1 } as never, ttsPath: 'tts/v/abc.mp3', ttsText: 'ciao',
}
for (const f of SAVED_CLIP_FIELDS) {
  assert(f in roundTrip, `a saved clip can carry "${f}"`)
}
assert(roundTrip.ttsPath === 'tts/v/abc.mp3', 'including where its synthesized voice is stored')
assert(roundTrip.ttsText === roundTrip.text, 'and the text that voice was spoken from')

/* ------------------------------------------------ creating from nothing -- */
console.log('\n--- Crea nuovo ---')

/* A protocol starts with a name, not with a spreadsheet. */
const card = { code: 'gl-anx 3.7', title: 'Calma e sicurezza', publicTitle: 'Un respiro', publicBlurb: 'A letto, luci spente.', tags: ['sera'] }
assert(newProtocolError(card, []) === null, 'a code and a clinical title are all it takes')
assert(newProtocolError({ ...card, code: '' }, []) !== null, 'a protocol with no code is refused')
assert(newProtocolError({ ...card, code: 'ANX 1.1' }, []) !== null, 'and so is one whose code is not a GL code')
assert(newProtocolError({ ...card, title: '  ' }, []) !== null, 'the clinical title cannot be blank')
assert(newProtocolError(card, ['GL-ANX 3.7']) !== null, 'a code already in the catalog is refused')

const created = newProtocolEntry(card, T)
assert(created.code === 'GL-ANX 3.7', 'the code is upper-cased and trimmed')
assert(created.family === 'GL-ANX', 'the family is read off it')
assert(created.title === 'Calma e sicurezza', 'the clinical title is kept')
assert(created.publicTitle === 'Un respiro', 'and the public one')
assert(created.tags?.join() === 'sera', 'and the tags')
assert(created.versions.length === 0, 'it declares no time signature yet')
assert(created.enabled === false, 'and it is NOT active — nothing has been published for it')
assert(!mergedPlain(created) && !created.datasheet && !created.spec, 'it carries no material at all, which is the point')

/* Importing the workbook onto it is the next step, and it stays a draft. */
const withWorkbook = entryForPublish({
  timeline: { ...workbook(12), code: 'GL-ANX 3.7' },
  existing: created,
  selected: 12,
  keepDraft: true,
  now: T + 1000,
})
assert(!!plainFor(withWorkbook, 12), 'the imported Excel is on the protocol')
assert(withWorkbook.enabled === false, 'and importing it does NOT put the protocol on the air')
assert(withWorkbook.title === 'Safety and Calm', 'the workbook names the protocol once it has one')
assert(withWorkbook.publicTitle === 'Un respiro', 'and the Scheda written at creation survives the import')
assert(withWorkbook.tags?.join() === 'sera', 'tags included')

/* Publishing that duration is what activates it — the only thing that does. */
const onAir = entryForPublish({
  timeline: { ...workbook(12), code: 'GL-ANX 3.7' },
  existing: withWorkbook,
  selected: 12,
  now: T + 2000,
})
assert(onAir.enabled === true, 'publishing is what activates a protocol')

/* A protocol an admin switched off stays off when a workbook is attached. */
const off = entryForPublish({
  timeline: { ...workbook(24), code: 'GL-ANX 3.7' },
  existing: { ...onAir, enabled: false },
  selected: 24,
  keepDraft: true,
  now: T + 3000,
})
assert(off.enabled === false, 'attaching a workbook never switches a disabled protocol back on')
assert(!!plainFor(off, 12) && !!plainFor(off, 24), 'and it keeps both time signatures')

/* ------------------------------------------- what colour a duration is --- */
console.log('\n--- grey, red, green ---')

/* All three time signatures are always shown; this is what each one says. */
const blank = newProtocolEntry({ code: 'GL-ANX 4.1', title: 'Nuovo', publicTitle: '', publicBlurb: '', tags: [] }, T)
for (const d of CATALOG_DURATIONS) {
  assert(durationState(blank, d) === 'empty', `a brand new protocol is grey at ${d}m — no Excel imported`)
}

const six = entryForPublish({ timeline: { ...workbook(6), code: 'GL-ANX 4.1' }, existing: blank, selected: 6, keepDraft: true, intoExisting: true, now: T })
assert(durationState(six, 6) === 'saved', 'importing the 6-minute Excel turns 6 red — saved, not on the air')
assert(durationState(six, 12) === 'empty', 'and leaves 12 grey')
assert(durationState(six, 24) === 'empty', 'and 24 grey')

/* Red until BOTH things are true: the protocol is on, and this duration has a
   file. Either alone is not something a person can play. */
const audioOnly: CatalogProtocol = { ...six, versions: [{ duration: 6, audioUrl: { 'pt-BR': 'https://x/6.mp3' } }] }
assert(durationState(audioOnly, 6) === 'saved', 'audio on a disabled protocol is still red — nobody can hear it')
const enabledNoAudio: CatalogProtocol = { ...six, enabled: true }
assert(durationState(enabledNoAudio, 6) === 'saved', 'and an enabled protocol with no file for that duration is red too')

const onAirSix: CatalogProtocol = { ...six, enabled: true, versions: [{ duration: 6, audioUrl: { 'pt-BR': 'https://x/6.mp3' } }] }
assert(durationState(onAirSix, 6) === 'published', 'enabled AND rendered is green')
assert(durationState(onAirSix, 12) === 'empty', 'while the durations with nothing in them stay grey')

/* A Studio session with no workbook still counts as saved — work exists. */
const studioOnly: CatalogProtocol = { ...blank, studioByDuration: { 24: { name: 's', lengthSec: 1440, masterGain: 0.8, tracks: [], savedAt: T } } }
assert(durationState(studioOnly, 24) === 'saved', 'a saved Studio session alone turns its duration red')

/* --------------------------------------- importing INTO an open protocol -- */
console.log('\n--- the workbook does not get to rename the protocol ---')

/* The code and the title are set by hand at creation. A workbook imported into
   an existing protocol supplies the TIMELINE and nothing else — otherwise the
   spreadsheet renames the thing it was imported into, and a README naming a
   different protocol files the timeline under a code nobody asked for. */
const named = newProtocolEntry({ code: 'GL-ANX 4.2', title: 'Il mio titolo', publicTitle: 'Pubblico', publicBlurb: '', tags: ['sera'] }, T)
const intoNamed = entryForPublish({
  timeline: workbook(12),                 // its README says GL-ANX 1.1 / "Safety and Calm"
  existing: named,
  selected: 12,
  keepDraft: true,
  intoExisting: true,
  now: T + 1000,
})
assert(intoNamed.code === 'GL-ANX 4.2', 'the protocol keeps its own code, not the workbook\'s')
assert(intoNamed.title === 'Il mio titolo', 'and its own clinical title')
assert(intoNamed.publicTitle === 'Pubblico', 'and the public name')
assert(intoNamed.tags?.join() === 'sera', 'and the tags')
assert(!!plainFor(intoNamed, 12), 'while the timeline the workbook carried is filed under 12m')
assert(durationState(intoNamed, 12) === 'saved', 'which turns 12 red')

/* Importing a SECOND workbook adds a duration and still changes nothing else. */
const both = entryForPublish({
  timeline: workbook(24), existing: intoNamed, selected: 24, keepDraft: true, intoExisting: true, now: T + 2000,
})
assert(plainDurations(both).join() === '12,24', 'the second import adds its duration')
assert(both.title === 'Il mio titolo', 'and still does not rename anything')
assert(durationState(both, 6) === 'empty', 'the one never imported stays grey')

/* Publishing outside a protocol context still takes the workbook's identity —
   that is the standalone import path, where there is nothing else to go on. */
const standalone = entryForPublish({ timeline: workbook(12), existing: undefined, selected: 12, now: T })
assert(standalone.code === 'GL-ANX 1.1', 'a standalone import is still named by its workbook')
assert(standalone.title === 'Safety and Calm', 'title included')

console.log(`\n${pass} assertions passed.`)
if (fails.length) {
  console.log(`${fails.length} FAILED:`)
  for (const f of fails) console.log('  -', f)
  process.exit(1)
}
