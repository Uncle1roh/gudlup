/* Proof for the phase-4 bug: "a song that repeats itself on a single clip".

   A music clip drew ONE file and the renderer looped it to fill the window, so
   a clip longer than the song was heard as the song starting again. A clip now
   holds an ordered PLAYLIST; the renderer plays it in sequence, crossfaded, and
   cuts the last entry at the end of the clip.

   Soundscapes must keep looping — they are seamless textures and repeating one
   is the intent. That distinction is the thing most likely to be broken by a
   later edit, so it is asserted here.

   Run: npx esbuild tools/test-music-playlist.ts --bundle --platform=node \
          --format=esm --outfile=<tmp>/mp.mjs && node <tmp>/mp.mjs           */

import {
  sampleSlots, sampleLoops, MAX_SAMPLE_SLOTS,
  type SampleParams,
} from '../src/studio/multitrack'
import { drawMusicPlaylist, estimateAssetSeconds, newDrawLedger, mulberry32 } from '../src/admin/assetPools'
import type { AudioAsset } from '../src/admin/assets'
import type { AssetPools } from '../src/admin/assetPools'

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else console.log(`ok  : ${msg}`)
}

/* ---------------------------------------------------- the params resolver */

const single: SampleParams = { url: 'u1', label: 'One' }
assert(sampleSlots(single).length === 1, 'a legacy single-url clip still resolves to one slot')
assert(sampleSlots({ url: '', label: '' }).length === 0, 'an empty clip resolves to no slots')
const list: SampleParams = {
  url: 'a', label: 'A → B',
  slots: [{ url: 'a', label: 'A' }, { url: 'b', label: 'B' }],
}
assert(sampleSlots(list).map((s) => s.url).join(',') === 'a,b', 'a playlist resolves in order')
assert(sampleSlots({ ...list, slots: [{ url: 'a', label: 'A' }, { url: '', label: 'gap' }] }).length === 1,
  'empty slots are dropped rather than rendering silence')

/* loop policy: the whole point of the fix */
assert(sampleLoops({ url: 'u', label: 'texture', drawTag: 'wind' }) === true,
  'a soundscape loops — it is a texture and repeating it is the intent')
assert(sampleLoops({ url: 'u', label: 'song', drawPhase: 4 }) === false,
  'MUSIC does not loop — a song restarting inside a clip is the phase-4 bug')
assert(sampleLoops({ url: 'u', label: 'legacy' }) === true,
  'a clip with no draw intent keeps the old looping behaviour')
assert(sampleLoops({ url: 'u', label: 'x', drawPhase: 4, loop: true }) === true,
  'an explicit loop flag wins over the inference')

/* ---------------------------------------------------------- the drawing */

function asset(name: string, sizeBytes: number): AudioAsset {
  return { path: `assets/music/f4/${name}`, name, kind: 'music', phase: 'f4', publicUrl: `https://x/${name}`, sizeBytes }
}
/** 4 MB at 192 kbps ≈ 167 s */
const FOUR_MB = 4_000_000
const pools = {
  soundscapes: [],
  heartbeat: [],
  musicByPhase: { f4: [asset('one.mp3', FOUR_MB), asset('two.mp3', FOUR_MB), asset('three.mp3', FOUR_MB), asset('four.mp3', FOUR_MB)] },
} as unknown as AssetPools

const est = estimateAssetSeconds(asset('x', FOUR_MB))
assert(est > 120 && est < 220, `a 4 MB file estimates as a ~3 minute song (${est.toFixed(0)}s)`)
assert(estimateAssetSeconds({ ...asset('n', 0), sizeBytes: undefined }) > 0, 'a file with no size still gets a usable estimate')

/* the phase-4 case: an 8-minute window, ~3-minute songs */
const EIGHT_MIN = 8 * 60
const drawn = drawMusicPlaylist(pools, 4, EIGHT_MIN, MAX_SAMPLE_SLOTS, mulberry32(7), newDrawLedger())!
assert(drawn.assets.length >= 3, `an 8-minute clip draws enough songs to cover it (${drawn.assets.length})`)
assert(new Set(drawn.assets.map((a) => a.path)).size === drawn.assets.length,
  'every song in the playlist is DIFFERENT — the bug was hearing the same one twice')
assert(drawn.estimatedSec >= EIGHT_MIN || drawn.assets.length === 4,
  'it keeps drawing until the window is covered or the pool runs out')
assert(!drawn.short, 'with four songs available the 8-minute window is covered')

/* a short clip must not hoard the pool */
const shortDraw = drawMusicPlaylist(pools, 4, 60, MAX_SAMPLE_SLOTS, mulberry32(7), newDrawLedger())!
assert(shortDraw.assets.length === 1, 'a 1-minute clip draws a single song')

/* the cap is honoured */
const bigPool = {
  ...pools,
  musicByPhase: { f4: Array.from({ length: 20 }, (_, i) => asset(`s${i}.mp3`, 1_000_000)) },
} as unknown as AssetPools
const capped = drawMusicPlaylist(bigPool, 4, 60 * 60, MAX_SAMPLE_SLOTS, mulberry32(3), newDrawLedger())!
assert(capped.assets.length === MAX_SAMPLE_SLOTS, `never more than ${MAX_SAMPLE_SLOTS} songs per clip (got ${capped.assets.length})`)
assert(capped.short, 'and it SAYS the window is not covered rather than hiding it')

/* a pool smaller than the need must not queue the same file twice */
const tinyPool = { ...pools, musicByPhase: { f4: [asset('only.mp3', 1_000_000)] } } as unknown as AssetPools
const tiny = drawMusicPlaylist(tinyPool, 4, EIGHT_MIN, MAX_SAMPLE_SLOTS, mulberry32(1), newDrawLedger())!
assert(tiny.assets.length === 1, 'a one-file pool yields one entry, not the same file five times')
assert(tiny.short, 'and reports the shortfall so a song gets added to the pool')

/* an empty pool is not a crash */
const emptyPool = { ...pools, musicByPhase: {} } as unknown as AssetPools
assert(drawMusicPlaylist(emptyPool, 4, 60, MAX_SAMPLE_SLOTS, mulberry32(1), newDrawLedger()) === null,
  'an empty phase pool returns null (the clip stays silent and is reported)')

/* ---- the ledger keeps playlists distinct ACROSS clips of one protocol ---- */
const ledger = newDrawLedger()
const rnd = mulberry32(11)
const a1 = drawMusicPlaylist(pools, 4, 200, MAX_SAMPLE_SLOTS, rnd, ledger)!
const a2 = drawMusicPlaylist(pools, 4, 200, MAX_SAMPLE_SLOTS, rnd, ledger)!
assert(a1.assets[0].path !== a2.assets[0].path,
  'two music clips in the same protocol do not both start with the same song')
