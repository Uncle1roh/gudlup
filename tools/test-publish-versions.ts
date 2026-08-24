/* Node proof for the PUBLISH bug and the two features that came with it:

     §1 TIME SIGNATURES — publishing one duration of a protocol must leave the
        others exactly as they were. This is the reported bug: the 6-, 12- and
        24-minute versions of GL-ANX 1.1 overwrote each other, taking their
        attached audio with them.
     §2 NAMING — a non-therapeutic public name alongside the clinical title,
        with the clinical one untouched and used as the fallback.
     §3 TAGS — normalization, the AND filter, the duration pseudo-tags.

   Run:
     node_modules/.bin/esbuild tools/test-publish-versions.ts --bundle \
       --platform=node --outfile=$TEMP/tpv.cjs && node $TEMP/tpv.cjs
*/
import {
  CATALOG_DURATIONS,
  catalogDuration,
  mergeVersions,
  mergedPlain,
  narrowTimeline,
  plainDurations,
  plainFor,
  studioFor,
  timelinesByDuration,
  type CatalogProtocol,
} from '../src/data/catalog'
import { patientBlurb, patientTitle, type Duration, type ProtocolVersion } from '../src/types/domain'
import {
  DURATION_TAG_IDS,
  MAX_TAGS,
  filterByTags,
  normalizeTags,
  tagLabel,
  tagSlug,
  tagsInUse,
} from '../src/data/tags'
import { applyCardDraft, cardDraftFrom } from '../src/admin/ProtocolCard'
import type { PlainTimeline, PlainVersion } from '../src/admin/plainTimeline'

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else console.log(`ok  : ${msg}`)
}

/* ---------------------------------------------------------------- fixtures */

function version(sheet: string, durationMin: number, clips: number): PlainVersion {
  return {
    sheet,
    versionKey: durationMin === 6 ? 'quick' : durationMin === 12 ? 'standard' : 'deep',
    levelMode: 'lufs',
    durationS: durationMin * 60,
    durationMin,
    clips: Array.from({ length: clips }, (_, i) => ({ clipId: `${sheet}-${i}` })) as PlainVersion['clips'],
    tracks: [],
    phases: [],
    declaredTotal: clips,
    declaredDurationS: durationMin * 60,
  }
}

/** A workbook carrying ONE sheet — how the POs actually ship each duration. */
function workbook(durationMin: number, clips: number): PlainTimeline {
  return {
    code: 'GL-ANX 1.1',
    title: 'Calm and Inner Security',
    versions: [version(`Timeline`, durationMin, clips)],
    affirmations: [],
    issues: [{ level: 'info', sheet: 'Timeline', message: `${durationMin}m note` }],
  }
}

/** The publish merge, exactly as PlainImport.publishToCatalog performs it. */
function publish(existing: CatalogProtocol | undefined, t: PlainTimeline): CatalogProtocol {
  const incoming: Partial<Record<Duration, PlainTimeline>> = {}
  for (const v of t.versions) {
    const d = catalogDuration(v.durationMin)
    if (d) incoming[d] = narrowTimeline(t, v)
  }
  const durations = CATALOG_DURATIONS.filter((d) => !!incoming[d])
  return {
    ...(existing ?? {}),
    code: t.code as string,
    family: 'GL-ANX',
    title: t.title as string,
    blurb: existing?.blurb ?? '',
    phases: existing?.phases ?? [],
    versions: mergeVersions(existing?.versions, durations.length ? durations : [12]),
    enabled: true,
    source: 'imported',
    tenants: 'all',
    audioReady: existing?.audioReady ?? false,
    plain: incoming[durations[0] ?? 12] ?? t,
    plainByDuration: { ...timelinesByDuration(existing), ...incoming },
    updatedAt: 1,
  }
}

/** attachRenderedAudio's effect: bind a URL onto ONE version. */
function attach(p: CatalogProtocol, d: Duration, url: string): CatalogProtocol {
  return {
    ...p,
    versions: p.versions.map((v) => (v.duration === d ? { ...v, audioUrl: { 'pt-BR': url } } : v)),
    audioReady: true,
  }
}

const urlOf = (p: CatalogProtocol, d: Duration): string | undefined =>
  p.versions.find((v) => v.duration === d)?.audioUrl?.['pt-BR']

/* ========================================================================== *
   §1 the reported bug: 6 / 12 / 24 must not overwrite each other
 * ========================================================================== */

console.log('\n--- §1 time signatures ---')

// the POs' real sequence: publish 24, attach its audio, then publish 12, then 6
let cat = publish(undefined, workbook(24, 109))
cat = attach(cat, 24, 'https://cdn/GL-ANX_1.1/24min-ptBR.mp3')
assert(urlOf(cat, 24) === 'https://cdn/GL-ANX_1.1/24min-ptBR.mp3', '24m publishes and attaches')

cat = publish(cat, workbook(12, 71))
assert(
  urlOf(cat, 24) === 'https://cdn/GL-ANX_1.1/24min-ptBR.mp3',
  'THE BUG: publishing 12m keeps the 24m audio (was: silently detached)',
)
assert(cat.versions.map((v) => v.duration).join(',') === '12,24', 'both durations are in versions')
cat = attach(cat, 12, 'https://cdn/GL-ANX_1.1/12min-ptBR.mp3')

cat = publish(cat, workbook(6, 34))
assert(cat.versions.map((v) => v.duration).join(',') === '6,12,24', 'all three durations survive, ascending')
assert(urlOf(cat, 24) === 'https://cdn/GL-ANX_1.1/24min-ptBR.mp3', '24m audio still attached after two more publishes')
assert(urlOf(cat, 12) === 'https://cdn/GL-ANX_1.1/12min-ptBR.mp3', '12m audio still attached')
assert(urlOf(cat, 6) === undefined, '6m has no audio yet — publishing a timeline does not invent one')

// each duration kept its OWN material
assert(plainDurations(cat).join(',') === '6,12,24', 'a timeline is stored per duration')
assert(plainFor(cat, 24)?.versions[0].clips.length === 109, '24m timeline is the 24m workbook (109 clips)')
assert(plainFor(cat, 12)?.versions[0].clips.length === 71, '12m timeline is the 12m workbook (71 clips)')
assert(plainFor(cat, 6)?.versions[0].clips.length === 34, '6m timeline is the 6m workbook (34 clips)')

// re-publishing one duration replaces ONLY that one
const revised = publish(cat, workbook(12, 80))
assert(plainFor(revised, 12)?.versions[0].clips.length === 80, 're-importing 12m replaces the 12m timeline')
assert(plainFor(revised, 24)?.versions[0].clips.length === 109, '…and leaves 24m alone')
assert(plainFor(revised, 6)?.versions[0].clips.length === 34, '…and leaves 6m alone')
assert(urlOf(revised, 12) === 'https://cdn/GL-ANX_1.1/12min-ptBR.mp3', '…and keeps 12m audio until it is re-attached')

// the workscreen sees all three, with distinct sheet keys (the chip selector)
const merged = mergedPlain(revised) as PlainTimeline
assert(merged.versions.length === 3, 'the workscreen opens one timeline with three versions')
assert(merged.versions.map((v) => v.durationMin).join(',') === '6,12,24', 'chips are ordered 6 · 12 · 24')
assert(new Set(merged.versions.map((v) => v.sheet)).size === 3, 'sheet keys are unique — every chip selects a different version')
assert(merged.versions.every((v) => v.clips.length === ({ 6: 34, 12: 80, 24: 109 } as Record<number, number>)[v.durationMin]), 'each chip carries its own clips')

// a sheet whose issues were renamed still points at a real sheet
assert(
  merged.issues.every((i) => !i.sheet || merged.versions.some((v) => v.sheet === i.sheet)),
  'every issue still names a sheet that exists after the merge',
)

/* --- migration: a row written BEFORE the split ---------------------------- */

const legacy: CatalogProtocol = {
  code: 'GL-ANX 1.2', family: 'GL-ANX', title: 'Managing Anxious Emotions', blurb: '',
  phases: [], versions: [{ duration: 24, audioUrl: { 'pt-BR': 'https://cdn/old.mp3' } }],
  enabled: true, source: 'imported', tenants: 'all', audioReady: true, updatedAt: 0,
  plain: workbook(24, 60), // the old single field, no plainByDuration
}
assert(plainFor(legacy, 24)?.versions[0].clips.length === 60, 'a legacy row still resolves its timeline')
assert(plainDurations(legacy).join(',') === '24', 'a legacy row reports the duration it holds')
const migrated = publish(legacy, workbook(6, 20))
assert(plainDurations(migrated).join(',') === '6,24', 'publishing a second duration onto a legacy row keeps the first')
assert(urlOf(migrated, 24) === 'https://cdn/old.mp3', 'the legacy row keeps its attached audio')

/* --- a workbook carrying several sheets ---------------------------------- */

const multi: PlainTimeline = { ...workbook(24, 109), versions: [version('Quick', 6, 30), version('Deep', 24, 109)] }
const both = publish(undefined, multi)
assert(both.versions.map((v) => v.duration).join(',') === '6,24', 'a two-sheet workbook publishes both durations')
assert(plainFor(both, 6)?.versions.length === 1, 'each stored slot holds exactly its own sheet')
assert(plainFor(both, 24)?.versions[0].sheet === 'Deep', '…and it is the right sheet')

/* --- a duration that is not a catalog slot -------------------------------- */

assert(catalogDuration(15) === null, '15 min is not a catalog duration')
assert(catalogDuration(12) === 12, '12 min is')
const odd = publish(undefined, workbook(15, 40))
assert(odd.versions.map((v) => v.duration).join(',') === '12', 'a 15-min workbook falls back to the 12-min slot, as before')

/* --- mergeVersions on its own --------------------------------------------- */

const withAudio: ProtocolVersion[] = [
  { duration: 6, audioUrl: { 'pt-BR': 'a' } },
  { duration: 24, audioUrl: { 'pt-BR': 'b' } },
]
const mergedV = mergeVersions(withAudio, [12])
assert(mergedV.map((v) => v.duration).join(',') === '6,12,24', 'mergeVersions adds without removing')
assert(mergedV[0].audioUrl?.['pt-BR'] === 'a' && mergedV[2].audioUrl?.['pt-BR'] === 'b', 'existing audioUrls survive')
assert(mergeVersions(withAudio, [6])[0].audioUrl?.['pt-BR'] === 'a', 'an incoming duration never blanks an existing one')
assert(mergeVersions(undefined, [12]).length === 1, 'a brand-new protocol gets just its own duration')

/* --- Studio sessions are per duration too --------------------------------- */

const withSessions: CatalogProtocol = {
  ...cat,
  studioByDuration: {
    6: { name: 'six', tracks: [], lengthSec: 360 } as never,
    24: { name: 'twentyfour', tracks: [], lengthSec: 1440 } as never,
  },
}
assert((studioFor(withSessions, 6) as { name: string }).name === 'six', 'the 6m session is the 6m session')
assert((studioFor(withSessions, 24) as { name: string }).name === 'twentyfour', 'the 24m session is the 24m session')
assert(studioFor(withSessions, 12) === undefined, 'a duration with no saved session reports none')

// a session saved before the split is offered to the duration it matches only
const legacySession: CatalogProtocol = { ...cat, studio: { name: 'old', tracks: [], lengthSec: 1445 } as never }
assert((studioFor(legacySession, 24) as { name: string }).name === 'old', 'a legacy 24-min session resolves for 24m')
assert(studioFor(legacySession, 6) === undefined, '…and is NOT handed to the 6m version')

/* ========================================================================== *
   §2 the two names
 * ========================================================================== */

console.log('\n--- §2 clinical title vs public name ---')

const clinical = { title: 'Calm and Inner Security', blurb: 'Settle a racing mind.' }
assert(patientTitle(clinical) === 'Calm and Inner Security', 'with no public name the clinical title is shown — unchanged behavior')
assert(patientBlurb(clinical) === 'Settle a racing mind.', '…and the clinical blurb')

const named = { ...clinical, publicTitle: 'Un respiro prima di dormire', publicBlurb: 'Da far partire già a letto.' }
assert(patientTitle(named) === 'Un respiro prima di dormire', 'the public name is what a person reads')
assert(patientBlurb(named) === 'Da far partire già a letto.', '…with its own one-liner')
assert(named.title === 'Calm and Inner Security', 'the CLINICAL title is untouched')

assert(patientTitle({ ...clinical, publicTitle: '   ' }) === 'Calm and Inner Security', 'a blank public name falls back, it does not blank the card')
assert(patientBlurb({ ...clinical, publicBlurb: '' }) === 'Settle a racing mind.', 'a public title without a public blurb keeps the clinical blurb')

// the card editor owns naming and tags and NOTHING else
const before: CatalogProtocol = { ...cat, tags: ['sera'] }
const after = applyCardDraft(
  { ...cardDraftFrom(before), publicTitle: 'Prima di dormire', publicBlurb: 'A letto, luci spente.', tags: ['Sera', 'a-letto', 'sera'] },
  before,
)
assert(after.publicTitle === 'Prima di dormire' && after.title === before.title, 'saving the card sets the public name and leaves the clinical one')
assert(after.tags?.join(',') === 'sera,a-letto', 'tags are slugged and de-duplicated on save')
assert(JSON.stringify(after.versions) === JSON.stringify(before.versions), 'the card never touches versions')
assert(JSON.stringify(after.plainByDuration) === JSON.stringify(before.plainByDuration), 'the card never touches the timelines')
assert(after.code === before.code && after.family === before.family, 'the card never touches the code or the family')

const cleared = applyCardDraft({ ...cardDraftFrom(after), publicTitle: '', publicBlurb: '' }, after)
assert(cleared.publicTitle === undefined && cleared.publicBlurb === undefined, 'clearing the public name restores the clinical title')

/* ========================================================================== *
   §3 tags
 * ========================================================================== */

console.log('\n--- §3 tags ---')

assert(tagSlug('Voce Guidata') === 'voce-guidata', 'labels slug to ids')
assert(tagSlug('  Però!  ') === 'pero', 'accents fold and punctuation drops')
assert(tagSlug('---') === '', 'a slug of nothing is empty, not a dash')
assert(normalizeTags(['sera', 'Sera', ' SERA ']).join(',') === 'sera', 'duplicates collapse however they were typed')
assert(normalizeTags(['b', 'a']).join(',') === 'b,a', 'order is preserved — the POs choose it')
assert(normalizeTags(Array.from({ length: 40 }, (_, i) => `t${i}`)).length === MAX_TAGS, `at most ${MAX_TAGS} tags are stored`)
assert(normalizeTags(undefined).length === 0, 'a row with no tags reads as an empty list')
assert(tagLabel('sera') === 'Sera', 'a curated id renders its Italian label')
assert(tagLabel('respiro-lento') === 'respiro lento', 'an invented id renders readably instead of vanishing')

const shelf = [
  { code: 'a', tags: ['sera', 'cuffie'], versions: [{ duration: 24 as Duration }] },
  { code: 'b', tags: ['sera'], versions: [{ duration: 6 as Duration }, { duration: 24 as Duration }] },
  { code: 'c', tags: [], versions: [{ duration: 12 as Duration }] },
]
assert(filterByTags(shelf, []).length === 3, 'no filter shows everything')
assert(filterByTags(shelf, ['sera']).map((p) => p.code).join(',') === 'a,b', 'one tag filters')
assert(filterByTags(shelf, ['sera', 'cuffie']).map((p) => p.code).join(',') === 'a', 'two tags narrow (AND, not OR)')
assert(filterByTags(shelf, [DURATION_TAG_IDS[6]]).map((p) => p.code).join(',') === 'b', 'a duration chip filters on the real versions')
assert(filterByTags(shelf, ['sera', DURATION_TAG_IDS[6]]).map((p) => p.code).join(',') === 'b', 'a tag and a duration combine')
assert(filterByTags(shelf, ['mai-usato']).length === 0, 'a tag nobody carries returns nothing, it does not throw')
assert(tagsInUse(shelf).map((t) => `${t.id}:${t.count}`).join(',') === 'sera:2,cuffie:1', 'the filter row offers used tags, most-used first')

console.log('\ndone.')
