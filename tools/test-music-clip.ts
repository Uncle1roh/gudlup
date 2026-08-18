/* Proof for the phase-4 report: "a song that repeats itself on a single clip".

   The rule is now simply that a song NEVER repeats. One file per sample clip:
   a soundscape is a seamless texture and is looped to fill its window, a song
   plays once and the clip ends in silence if it is longer. Filling a long music
   window is a Timeline Excel decision — several music rows, one song each.

   The soundscape/music distinction is the thing most likely to be broken by a
   later edit, so it is asserted here, along with the draw staying distinct
   across the clips of one protocol.

   Run: npx esbuild tools/test-music-clip.ts --bundle --platform=node \
          --format=esm --outfile=<tmp>/mc.mjs && node <tmp>/mc.mjs           */

import { sampleLoops } from '../src/studio/multitrack'
import { drawMusic, estimateAssetSeconds, newDrawLedger, mulberry32 } from '../src/admin/assetPools'
import type { AudioAsset } from '../src/admin/assets'
import type { AssetPools } from '../src/admin/assetPools'

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else console.log(`ok  : ${msg}`)
}

/* ---- loop policy: the whole point of the fix -------------------------- */

assert(sampleLoops({ url: 'u', label: 'texture', drawTag: 'wind' }) === true,
  'a soundscape loops — it is a texture and repeating it is the intent')
assert(sampleLoops({ url: 'u', label: 'song', drawPhase: 4 }) === false,
  'MUSIC does not loop — a song restarting inside a clip is the phase-4 bug')
assert(sampleLoops({ url: 'u', label: 'legacy' }) === true,
  'a clip with no draw intent keeps the old looping behaviour')
assert(sampleLoops({ url: 'u', label: 'x', drawPhase: 4, loop: true }) === true,
  'an explicit loop flag wins over the inference')
assert(sampleLoops({ url: 'u', label: 'x', drawTag: 'wind', loop: false }) === false,
  'and an explicit false wins too — a one-shot texture is allowed')

/* ---- the length estimate that drives the shortfall warning ------------- */

function asset(name: string, sizeBytes: number): AudioAsset {
  return { path: `assets/music/f4/${name}`, name, kind: 'music', phase: 'f4', publicUrl: `https://x/${name}`, sizeBytes }
}
/** 4 MB at 192 kbps ≈ 167 s */
const FOUR_MB = 4_000_000

const est = estimateAssetSeconds(asset('x', FOUR_MB))
assert(est > 120 && est < 220, `a 4 MB file estimates as a ~3 minute song (${est.toFixed(0)}s)`)
assert(estimateAssetSeconds({ ...asset('n', 0), sizeBytes: undefined }) > 0,
  'a file with no size still gets a usable estimate rather than 0')
assert(estimateAssetSeconds(asset('big', 500_000_000)) <= 900,
  'a huge file is clamped — a bogus estimate must not silence the warning')

/* the phase-4 case: an 8-minute window against a ~3-minute song. The engine
   does NOT stretch to fill it, so the import must SAY so. */
const EIGHT_MIN = 8 * 60
assert(estimateAssetSeconds(asset('one.mp3', FOUR_MB)) < EIGHT_MIN - 15,
  'an 8-minute music clip is detectably longer than its song, so the import warns')

/* ---- the draw: one song, distinct across the protocol ------------------ */

const pools = {
  soundscapes: [],
  heartbeat: [],
  musicByPhase: { f4: [asset('one.mp3', FOUR_MB), asset('two.mp3', FOUR_MB), asset('three.mp3', FOUR_MB), asset('four.mp3', FOUR_MB)] },
} as unknown as AssetPools

const ledger = newDrawLedger()
const rnd = mulberry32(11)
const picks = [drawMusic(pools, 4, rnd, ledger)!, drawMusic(pools, 4, rnd, ledger)!, drawMusic(pools, 4, rnd, ledger)!, drawMusic(pools, 4, rnd, ledger)!]
assert(picks.every(Boolean), 'four music clips all get a file from a four-file pool')
assert(new Set(picks.map((p) => p.asset.path)).size === 4,
  'the four clips of one protocol draw four DIFFERENT songs — no repeat across the session either')

/* a fifth clip has to reuse, and must say so rather than pretending */
const fifth = drawMusic(pools, 4, rnd, ledger)!
assert(!!fifth, 'a fifth clip still gets a file when the pool is exhausted')
assert(/reuse|riuso|again|\d+ files?/i.test(fifth.how), `the reuse is reported to the PO (${fifth.how})`)

/* a one-file pool is the degenerate case: the same song in every music clip */
const tinyPool = { ...pools, musicByPhase: { f4: [asset('only.mp3', 1_000_000)] } } as unknown as AssetPools
const t1 = drawMusic(tinyPool, 4, mulberry32(1), newDrawLedger())!
assert(t1.asset.name === 'only.mp3', 'a one-file pool draws that file')

/* an empty pool is not a crash */
const emptyPool = { ...pools, musicByPhase: {} } as unknown as AssetPools
assert(drawMusic(emptyPool, 4, mulberry32(1), newDrawLedger()) === null,
  'an empty phase pool returns null (the clip stays silent and is reported)')
