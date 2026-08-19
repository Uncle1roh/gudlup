/* Proof for "a song repeats itself on a single clip", and then for its sequel,
   "the music plays only one song instead of filling the phase".

   A music clip draws a PLAYLIST of distinct songs; the renderer plays them in
   sequence, crossfaded, and cuts the last at the clip end. A song is never
   looped. Soundscapes still loop — they are seamless textures and repeating
   one is the intent.

   The second bug lived entirely in estimateAssetSeconds(). It decides how many
   songs to queue, and it assumed 192 kbps while the PO library is ripped albums
   at 256-320 kbps — so it computed durations ~1.7x too LONG, one song "covered"
   a whole phase, the draw stopped at one, and the rest of the window fell
   silent. The sizes below are the REAL byte counts from assets/music, so this
   file fails if that assumption drifts back.

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

/* loop policy: a song must never repeat */
assert(sampleLoops({ url: 'u', label: 'texture', drawTag: 'wind' }) === true,
  'a soundscape loops — it is a texture and repeating it is the intent')
assert(sampleLoops({ url: 'u', label: 'song', drawPhase: 4 }) === false,
  'MUSIC does not loop — a song restarting inside a clip is the phase-4 bug')
assert(sampleLoops({ url: 'u', label: 'legacy' }) === true,
  'a clip with no draw intent keeps the old looping behaviour')
assert(sampleLoops({ url: 'u', label: 'x', drawPhase: 4, loop: true }) === true,
  'an explicit loop flag wins over the inference')

/* ------------------------------------------- the estimate that starved it */

function asset(name: string, sizeBytes: number): AudioAsset {
  return { path: `assets/music/f4/${name}`, name, kind: 'music', phase: 'f4', publicUrl: `https://x/${name}`, sizeBytes }
}

/* REAL files and byte counts from the PO library. The right-hand numbers are
   what they actually play for, near enough; the old 192 kbps assumption is
   shown for contrast because it is what queued a single song. */
const REAL: [string, number, number, number][] = [
  // name                              bytes         old(192)   plausible real
  ['1-02 Coming Home.mp3',             19_006_041,   792,       475],
  ['Essence of Kryon.mp3',             21_865_621,   900,       547],
  ['01 Retreat to Calm.mp3',           15_647_246,   652,       391],
  ['04 Rebecca.mp3',                    2_929_353,   122,        73],
]
for (const [name, bytes, old, real] of REAL) {
  const est = estimateAssetSeconds(asset(name, bytes))
  assert(Math.abs(est - real) < real * 0.15,
    `"${name}" estimates ~${Math.round(est)}s, not the old ${old}s`)
  assert(est < old,
    `the estimate is SHORTER than the old one — short over-draws (harmless), long starves the clip`)
}

/* uncompressed is arithmetic, not a bitrate guess: the one WAV in the library
   is ~4.5 min, and the old code called it 15 */
const wav = estimateAssetSeconds({ ...asset('Zen Atmosphere.wav', 47_909_960), name: 'Zen Atmosphere.wav' })
assert(wav > 240 && wav < 300, `a 48 MB WAV estimates as ~4.5 min (${Math.round(wav)}s), not the clamped 900`)

assert(estimateAssetSeconds({ ...asset('n', 0), sizeBytes: undefined }) > 0,
  'a file with no size still gets a usable estimate')
assert(estimateAssetSeconds(asset('huge.mp3', 500_000_000)) <= 900, 'a bogus size is clamped')

/* ---- THE REGRESSION: an 8-minute phase must not queue a single song ---- */

const EIGHT_MIN = 8 * 60
/* the four longest real f4 files — the worst case for under-drawing */
const longPool = {
  soundscapes: [], heartbeat: [],
  musicByPhase: {
    f4: [
      asset('Essence of Kryon.mp3', 21_865_621),
      asset('1-02 Coming Home.mp3', 19_006_041),
      asset('1-07 Beyond Infinity.mp3', 18_787_670),
      asset('1-04 Infinite Beauty.mp3', 16_445_009),
    ],
  },
} as unknown as AssetPools

for (const seed of [1, 7, 13, 42]) {
  const d = drawMusicPlaylist(longPool, 4, EIGHT_MIN, MAX_SAMPLE_SLOTS, mulberry32(seed), newDrawLedger())!
  assert(d.assets.length >= 2,
    `seed ${seed}: an 8-minute phase queues ${d.assets.length} songs, never just one`)
  assert(new Set(d.assets.map((a) => a.path)).size === d.assets.length,
    `seed ${seed}: every queued song is DIFFERENT`)
  assert(d.estimatedSec >= EIGHT_MIN,
    `seed ${seed}: the queue covers the window (~${Math.round(d.estimatedSec)}s of ${EIGHT_MIN}s)`)
}

/* short songs, long window: it keeps going until the window is covered */
const shortPool = {
  soundscapes: [], heartbeat: [],
  musicByPhase: { f4: Array.from({ length: 12 }, (_, i) => asset(`short-${i}.mp3`, 2_929_353)) },
} as unknown as AssetPools
const many = drawMusicPlaylist(shortPool, 4, EIGHT_MIN, MAX_SAMPLE_SLOTS, mulberry32(5), newDrawLedger())!
assert(many.assets.length === MAX_SAMPLE_SLOTS, `73-second songs fill an 8-minute window up to the cap (${many.assets.length})`)
assert(many.short, 'and it SAYS the cap left the window uncovered rather than hiding it')

/* a short clip must not hoard the pool */
const oneMin = drawMusicPlaylist(longPool, 4, 60, MAX_SAMPLE_SLOTS, mulberry32(7), newDrawLedger())!
assert(oneMin.assets.length === 1, 'a 1-minute clip still draws a single song')

/* a pool smaller than the need must not queue the same file twice */
const tinyPool = { ...longPool, musicByPhase: { f4: [asset('only.mp3', 2_929_353)] } } as unknown as AssetPools
const tiny = drawMusicPlaylist(tinyPool, 4, EIGHT_MIN, MAX_SAMPLE_SLOTS, mulberry32(1), newDrawLedger())!
assert(tiny.assets.length === 1, 'a one-file pool yields one entry, not the same file five times')
assert(tiny.short, 'and reports the shortfall so a song gets added to the pool')

/* an empty pool is not a crash */
const emptyPool = { ...longPool, musicByPhase: {} } as unknown as AssetPools
assert(drawMusicPlaylist(emptyPool, 4, 60, MAX_SAMPLE_SLOTS, mulberry32(1), newDrawLedger()) === null,
  'an empty phase pool returns null (the clip stays silent and is reported)')

/* ---- the ledger keeps playlists distinct ACROSS clips of one protocol ---- */
const ledger = newDrawLedger()
const rnd = mulberry32(11)
const a1 = drawMusicPlaylist(longPool, 4, 200, MAX_SAMPLE_SLOTS, rnd, ledger)!
const a2 = drawMusicPlaylist(longPool, 4, 200, MAX_SAMPLE_SLOTS, rnd, ledger)!
assert(a1.assets[0].path !== a2.assets[0].path,
  'two music clips in the same protocol do not both start with the same song')
