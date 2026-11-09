/* ============================================================================
   Two things the console got wrong, asserted so they stay fixed

   1 · THE SECOND TAKE IS NEARLY FREE. Publishing a protocol in both forms
       renders the male script and then the female one, and the two differ by
       a handful of gendered words. The render caches synthesized voice on
       `voiceId|lang|text`, so a line whose words are identical in both
       scripts is spoken once.

       That is only true if the VOICE does not depend on the form. It does
       not — `plainStudio.ts` says so: the voice follows the archetype and the
       spoken language, who is TALKING, while the form is who is being talked
       TO — but the whole saving rests on it, so it is asserted here rather
       than believed.

   2 · THE THEME FOLLOWS THE CODE. Every protocol published from a workbook
       arrived in the library tagged "Calma", because the theme was read only
       from `library.category`, which nothing in the import pipeline writes.

       npx esbuild tools/test-both-forms.ts --bundle --platform=node \
         --format=cjs --define:import.meta.env={} --outfile=<tmp>/bf.cjs \
         && node <tmp>/bf.cjs
   ============================================================================ */

import { plainToStudioTracks } from '../src/admin/plainStudio'
import { themeOf } from '../src/data/liveCatalog'
import { variantKey } from '../src/tts/voiceLang'
import type { PlainClip, PlainTimeline, PlainVersion } from '../src/admin/plainTimeline'
import type { VoiceParams } from '../src/compose/types'

let pass = 0
const fails: string[] = []
function assert(cond: unknown, what: string): void {
  if (cond) { pass += 1; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

/* ------------------------------------------------------------- fixtures --- */

function clip(over: Partial<PlainClip> & Pick<PlainClip, 'clipId' | 'traccia' | 'tipo' | 'startS' | 'endS'>): PlainClip {
  return {
    row: 2, faseRaw: '1', faseFrom: 1, faseTo: 1,
    durataS: over.endS - over.startS,
    volumeDb: null, volumeLufs: null, fadeInS: 0, fadeOutS: 0, crossfadePrecS: null,
    ...over,
  }
}

function timelineOf(clips: PlainClip[]): { t: PlainTimeline; v: PlainVersion } {
  const v: PlainVersion = {
    sheet: 'Deep', versionKey: 'deep', levelMode: 'offset',
    durationS: 1440, durationMin: 24, clips,
    tracks: [], phases: [], declaredTotal: null, declaredDurationS: null,
  }
  return { t: { code: 'GL-CALM 1.1', title: 'Test', versions: [v], affirmations: [], issues: [] }, v }
}

/** The cache key the render uses, built from a seeded clip exactly as
    `renderPlainWav` builds it. */
function cacheKeyOf(seedClip: { text?: string; params: unknown }, lang: string): string {
  const vp = seedClip.params as VoiceParams
  return `${vp.voiceId ?? '(default)'}|${lang}|${(seedClip.text ?? '').trim()}`
}

/* Two voice lines. The first says the same thing to anybody; the second
   inflects. This is the real shape of a protocol: most lines are neutral. */
const SAME = 'Respire fundo e solte o ar devagar.'
const HIS = 'Agora você está pronto.'
const HERS = 'Agora você está pronta.'

const { t, v } = timelineOf([
  clip({
    clipId: 'VC-01', traccia: 'VOX_A', tipo: 'voce', startS: 0, endS: 8,
    testoByLang: { it: SAME, 'it:f': SAME },
  } as Partial<PlainClip> & Pick<PlainClip, 'clipId' | 'traccia' | 'tipo' | 'startS' | 'endS'>),
  clip({
    clipId: 'VC-02', traccia: 'VOX_A', tipo: 'voce', startS: 10, endS: 18,
    testoByLang: { it: HIS, 'it:f': HERS },
  } as Partial<PlainClip> & Pick<PlainClip, 'clipId' | 'traccia' | 'tipo' | 'startS' | 'endS'>),
])

const asHim = plainToStudioTracks(t, v, { lang: 'it', to: 'm' })
const asHer = plainToStudioTracks(t, v, { lang: 'it', to: 'f' })

const himClips = asHim.tracks.flatMap((x) => x.clips)
const herClips = asHer.tracks.flatMap((x) => x.clips)

console.log('\n--- the sheet seeds both forms ---')
assert(himClips.length === 2 && herClips.length === 2, 'both forms seed the same two voice clips')
assert(himClips[0].text === SAME && herClips[0].text === SAME, 'the neutral line is the same in both')
assert(himClips[1].text === HIS && herClips[1].text === HERS, 'the inflected line is not')

console.log('\n--- the voice is who is TALKING, not who is talked to ---')
for (let i = 0; i < himClips.length; i += 1) {
  const a = (himClips[i].params as VoiceParams).voiceId
  const b = (herClips[i].params as VoiceParams).voiceId
  assert(!!a && a === b, `clip ${i + 1} is spoken by the same voice in both forms`)
}

console.log('\n--- so the cache reuses exactly the lines that did not change ---')
const himKeys = himClips.map((c) => cacheKeyOf(c, 'it'))
const herKeys = herClips.map((c) => cacheKeyOf(c, 'it'))
assert(himKeys[0] === herKeys[0], 'the neutral line has ONE key: the second render reuses it')
assert(himKeys[1] !== herKeys[1], 'the inflected line has two: the engine speaks it again')

/* What the render would actually do, counted the way `VoiceCache` counts. */
const cache = new Set<string>()
let synthesized = 0
let reused = 0
for (const k of [...himKeys, ...herKeys]) {
  if (cache.has(k)) reused += 1
  else { cache.add(k); synthesized += 1 }
}
assert(synthesized === 3 && reused === 1,
  'two takes of a two-line sheet cost three syntheses, not four')

console.log('\n--- …and a sheet with nothing gendered costs nothing twice ---')
{
  const neutral = timelineOf([
    clip({
      clipId: 'VC-01', traccia: 'VOX_A', tipo: 'voce', startS: 0, endS: 8,
      testoByLang: { it: SAME, 'it:f': SAME },
    } as Partial<PlainClip> & Pick<PlainClip, 'clipId' | 'traccia' | 'tipo' | 'startS' | 'endS'>),
  ])
  const m = plainToStudioTracks(neutral.t, neutral.v, { lang: 'it', to: 'm' }).tracks.flatMap((x) => x.clips)
  const f = plainToStudioTracks(neutral.t, neutral.v, { lang: 'it', to: 'f' }).tracks.flatMap((x) => x.clips)
  assert(cacheKeyOf(m[0], 'it') === cacheKeyOf(f[0], 'it'),
    'the female take of a neutral sheet synthesizes nothing at all')
}

console.log('\n--- the form is still a real distinction, not a key collision ---')
assert(variantKey('it', 'm') === 'it' && variantKey('it', 'f') === 'it:f',
  'the two scripts are stored under different keys (the male one bare)')

/* ----------------------------------------------- the theme in the library --- */

console.log('\n--- the theme follows the code when no category is set ---')
const row = (code: string, category?: string) =>
  ({ code, library: category ? { category } : undefined })

assert(themeOf(row('GL-CALM 1.1')) === 'calm', 'GL-CALM → calm')
assert(themeOf(row('GL-FOCUS 1.2')) === 'focus', 'GL-FOCUS → focus')
assert(themeOf(row('GL-ENER 2.1')) === 'energy', 'GL-ENER → energy')
assert(themeOf(row('GL-GROW 1.1')) === 'growth', 'GL-GROW → growth')
assert(themeOf(row('GL-VIT 1.1')) === 'balance', 'GL-VIT (Vitality) → balance')
assert(themeOf(row('GL-INTRO 1.1')) === 'calm', 'GL-INTRO (First steps) → calm')

console.log('\n--- an explicit category still wins ---')
assert(themeOf(row('GL-CALM 1.1', 'focus')) === 'focus',
  'a PO who chose a category in the editor is not overruled by the code')
assert(themeOf(row('GL-FOCUS 1.1', 'energy')) === 'energy', 'and the other way round')

console.log('\n--- and only a row that says nothing at all falls back ---')
assert(themeOf(row('WHATEVER 9')) === 'calm', 'an unknown prefix with no category is calm')
assert(themeOf({ code: null }) === 'calm', 'so is a row with no code')
assert(themeOf(row('GL-FOCUS 1.1', 'nonsense')) === 'focus',
  'a category nobody recognises falls through to the code, not past it')

console.log(`\n${pass} passed, ${fails.length} failed`)
if (fails.length) { for (const f of fails) console.log('  -', f); process.exit(1) }
