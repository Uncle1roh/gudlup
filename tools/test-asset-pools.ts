/* ============================================================================
   Heartbeat and singing bowl — the two PO deliverables

   The POs uploaded both files and could not use either one. Three separate
   breaks between Storage and the Studio, each of which alone was enough:

   1. `buildAssetPools` had no branch for `kind: 'bowl'`. Every bowl file was
      dropped between listing and drawing — visible in the Asset Library,
      absent from every pool.
   2. `drawSoundscape` returned null when the dedicated heartbeat folder was
      empty instead of falling through, so a heartbeat filed under
      `assets/soundscape/heartbeat/` produced a silent clip and a note blaming
      the PO for not delivering it.
   3. A clip asking for a bowl scored zero against the texture tags and was
      then handed a lake or a wind from the last-resort pool — the wrong sound,
      silently.

       npx esbuild tools/test-asset-pools.ts --bundle --platform=node \
         --format=esm --outfile=<tmp>/ap.mjs && node <tmp>/ap.mjs
   ============================================================================ */

import { buildAssetPools, drawSoundscape, normalizeTags, mulberry32, newDrawLedger } from '../src/admin/assetPools'
import { libraryGroups, type AudioAsset } from '../src/admin/assets'

let pass = 0
const fails: string[] = []
function assert(cond: boolean, what: string): void {
  if (cond) { pass += 1; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

function asset(path: string, kind: AudioAsset['kind'], extra: Partial<AudioAsset> = {}): AudioAsset {
  const name = path.split('/').pop() as string
  return { path, name, kind, publicUrl: `https://x/${path}`, ...extra } as AudioAsset
}

const rnd = () => mulberry32(7)()

const BOWL = asset('assets/bowl/tibetan-01.mp3', 'bowl')
const HEART = asset('assets/heartbeat/hb-60.mp3', 'heartbeat')
const LAKE = asset('assets/soundscape/lake/lake-01.mp3', 'soundscape', { texture: 'lake' })
const WIND = asset('assets/soundscape/wind/wind-01.mp3', 'soundscape', { texture: 'wind' })

/* ------------------------------------------------------------- the tags -- */
console.log('\n--- what the PO writes in the ambiente column ---')

assert(normalizeTags('campana tibetana').includes('bowl'), '"campana tibetana" is a bowl')
assert(normalizeTags('singing bowl').includes('bowl'), 'and so is "singing bowl"')
assert(normalizeTags('gong').includes('bowl'), 'and a gong — the same kind of accent')
assert(normalizeTags('battito cardiaco 60 bpm').includes('heartbeat'), '"battito cardiaco" is a heartbeat')
assert(!normalizeTags('lago calmo').includes('bowl'), 'a lake is not')

/* ------------------------------------------------------------- the pool -- */
console.log('\n--- the bowl pool exists at all ---')

const pools = buildAssetPools([BOWL, HEART, LAKE, WIND], [])
assert(pools.bowl.length === 1, 'a file under assets/bowl reaches a pool')
assert(pools.heartbeat.length === 1, 'and so does one under assets/heartbeat')
assert(pools.soundscapes.length === 2, 'neither one joins the general soundscape pool')
assert(
  ![...pools.soundscapeByTag.values()].flat().some((a) => a.kind === 'bowl' || a.kind === 'heartbeat'),
  'so a draw for "lago" can never hand back a bowl',
)

/* -------------------------------------------------------------- the draw -- */
console.log('\n--- drawing one ---')

const bowlDraw = drawSoundscape(pools, 'campana tibetana', rnd, newDrawLedger())
assert(bowlDraw?.asset.path === BOWL.path, 'a clip asking for a bowl gets the bowl')
assert(/bowl pool/.test(bowlDraw?.how ?? ''), 'and the note says where it came from')

const heartDraw = drawSoundscape(pools, 'heartbeat 60 bpm', rnd, newDrawLedger())
assert(heartDraw?.asset.path === HEART.path, 'a clip asking for a heartbeat gets the heartbeat')

const lakeDraw = drawSoundscape(pools, 'lago calmo', rnd, newDrawLedger())
assert(lakeDraw?.asset.path === LAKE.path, 'and an ordinary texture still draws by tag')

/* ---------------------------------------------------- the other folder --- */
console.log('\n--- filed under soundscape/ instead ---')

/* Both readings of the folder convention are defensible, so both work. */
const filedAsScape = buildAssetPools(
  [
    asset('assets/soundscape/heartbeat/hb.mp3', 'soundscape', { texture: 'heartbeat' }),
    asset('assets/soundscape/campana/bowl.mp3', 'soundscape', { texture: 'campana' }),
    LAKE,
  ],
  [],
)
assert(filedAsScape.heartbeat.length === 0, 'the dedicated folder is empty in this arrangement')
const hb2 = drawSoundscape(filedAsScape, 'heartbeat', rnd, newDrawLedger())
assert(hb2?.asset.name === 'hb.mp3', 'and the heartbeat is found anyway, rather than reported missing')
const bw2 = drawSoundscape(filedAsScape, 'campana tibetana', rnd, newDrawLedger())
assert(bw2?.asset.name === 'bowl.mp3', 'same for the bowl')

/* -------------------------------------------- never the wrong sound ------ */
console.log('\n--- what happens when the file really is absent ---')

const noSpecials = buildAssetPools([LAKE, WIND], [])
assert(
  drawSoundscape(noSpecials, 'campana tibetana', rnd, newDrawLedger()) === null,
  'a missing bowl draws NOTHING — it must never fall back to a lake',
)
assert(
  drawSoundscape(noSpecials, 'heartbeat', rnd, newDrawLedger()) === null,
  'and a missing heartbeat draws nothing either',
)
assert(
  drawSoundscape(noSpecials, 'fabbrica rumorosa', rnd, newDrawLedger()) !== null,
  'while an ordinary tag with no match still falls back to any soundscape — a texture is a texture',
)

/* -------------------------------------------------- the Studio picker ---- */
console.log('\n--- what the Studio dropdown offers ---')

const shelf = [BOWL, HEART, LAKE, WIND, asset('assets/music/f1/dawn.mp3', 'music', { phase: 'f1' })]
const groups = libraryGroups(shelf)
const listed = new Set(groups.flatMap((g) => g.items.map((a) => a.path)))

assert(listed.has(BOWL.path), 'the singing bowl is pickable for a clip')
assert(listed.has(HEART.path), 'and so is the heartbeat')
assert(listed.size === shelf.length, 'nothing in the library is unreachable from the picker')

/* The regression this guards: the picker used to enumerate kinds by hand, so a
   kind could be — and was — left out by omission. */
const kinds = new Set(shelf.map((a) => a.kind))
for (const k of kinds) {
  assert(
    groups.some((g) => g.items.some((a) => a.kind === k)),
    `every "${k}" file reaches a group`,
  )
}
assert(groups.every((g) => g.items.length > 0), 'and no empty group is offered')

console.log(`\n${pass} assertions passed.`)
if (fails.length) {
  console.log(`${fails.length} FAILED:`)
  for (const f of fails) console.log('  -', f)
  process.exit(1)
}
