/* Proof for the Asset Library's add and remove.

   Neither operation is a plain storage call, and both can damage things
   silently:

   · A file's PATH is its classification — `assets/music/f4/x.mp3` IS a
     phase-4 music track, and nothing else records that. So an upload has to
     build the path from the chosen target, and the filename has to be
     sanitised because it becomes part of a URL. A stray space or accent gives
     a file that lists fine and 404s when the renderer fetches it.

   · Deleting a file that a protocol's AssetMap still points at leaves the
     renderer resolving a missing path at render time, long after anyone could
     connect the two events. So a delete has to scrub every reference, and
     `withoutAsset` has to remove exactly the right ones and nothing else.

   Run: npx esbuild tools/test-asset-library.ts --bundle --platform=node \
          --format=esm --define:import.meta.env={} \
          --outfile=.tmp-test/assets.mjs && node .tmp-test/assets.mjs        */

import {
  assetMapReferences,
  checkUpload,
  emptyAssetMap,
  sanitizeFileName,
  sanitizeTexture,
  targetPath,
  withoutAsset,
  MAX_ASSET_BYTES,
  type AssetMap,
} from '../src/admin/assets'

let passed = 0
function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else { passed += 1; console.log(`ok  : ${msg}`) }
}

/* ------------------------------------------------------------- naming --- */
console.log('\n--- filenames become URLs ---')

assert(sanitizeFileName('Dawn Pad.mp3') === 'dawn-pad.mp3', 'spaces become hyphens')
assert(sanitizeFileName('Città Notturna.MP3') === 'citta-notturna.mp3', 'accents are folded and the extension lowercased')
assert(sanitizeFileName('  leading and trailing  .wav') === 'leading-and-trailing.wav', 'edges are trimmed, not left as hyphens')
assert(sanitizeFileName('a//b\\c.mp3') === 'a-b-c.mp3', 'path separators cannot survive into a filename')
assert(sanitizeFileName('..%2f..%2fetc.mp3').indexOf('/') === -1, 'a traversal attempt cannot produce a slash')
assert(sanitizeFileName('.mp3') === 'audio.mp3', 'a name that sanitises to nothing still gets one')
assert(sanitizeFileName('track#1 (final).mp3') === 'track-1-final.mp3', 'punctuation is dropped rather than escaped')

assert(sanitizeTexture('Lago di Notte') === 'lago-di-notte', 'a texture folder is sanitised the same way')
assert(sanitizeTexture('///') === '', 'a texture of only separators comes back empty, so the caller can default')

/* --------------------------------------------------------------- paths -- */
console.log('\n--- the path IS the classification ---')

assert(
  targetPath({ kind: 'music', phase: 'f4' }, 'Dawn Pad.mp3') === 'assets/music/f4/dawn-pad.mp3',
  'a music upload lands in its phase folder',
)
assert(
  targetPath({ kind: 'soundscape', texture: 'Lago' }, 'calm 01.mp3') === 'assets/soundscape/lago/calm-01.mp3',
  'a soundscape lands in its texture folder',
)
assert(
  targetPath({ kind: 'soundscape', texture: '' }, 'x.mp3') === 'assets/soundscape/other/x.mp3',
  'a soundscape with no texture lands in "other" rather than at the folder root',
)
assert(targetPath({ kind: 'heartbeat' }, 'HB 60.wav') === 'assets/heartbeat/hb-60.wav', 'heartbeat has its own folder')
assert(targetPath({ kind: 'bowl' }, 'Bowl.wav') === 'assets/bowl/bowl.wav', 'bowl has its own folder')

/* The classifier in listAssets() reads these paths back, so a round trip has
   to land in the folder the file was filed under. */
for (const phase of ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'] as const) {
  assert(
    targetPath({ kind: 'music', phase }, 'x.mp3') === `assets/music/${phase}/x.mp3`,
    `${phase} round-trips to its own folder`,
  )
}

/* ------------------------------------------------------------ validation - */
console.log('\n--- what is refused before anything is uploaded ---')

const file = (name: string, size: number): File =>
  ({ name, size, type: 'audio/mpeg' }) as File

assert(checkUpload(file('a.mp3', 1024)).ok, 'an mp3 is accepted')
assert(checkUpload(file('a.wav', 1024)).ok, 'a wav is accepted')
assert(checkUpload(file('a.flac', 1024)).ok, 'a flac is accepted')
assert(!checkUpload(file('a.pdf', 1024)).ok, 'a pdf is refused')
assert(!checkUpload(file('a.mp3.exe', 1024)).ok, 'an executable wearing an audio name is refused')
assert(!checkUpload(file('a.mp3', 0)).ok, 'an empty file is refused')
assert(!checkUpload(file('a.mp3', MAX_ASSET_BYTES + 1)).ok, 'a file over the ceiling is refused')
assert(checkUpload(file('a.mp3', MAX_ASSET_BYTES)).ok, 'a file exactly at the ceiling is accepted')
assert(
  (checkUpload(file('a.pdf', 10)).reason ?? '').includes('a.pdf'),
  'the refusal names the file, so a multi-file upload says which one',
)

/* ------------------------------------------------------- reference scrub - */
console.log('\n--- deleting scrubs every reference and nothing else ---')

const TARGET = 'assets/music/f4/gone.mp3'
const KEEP = 'assets/music/f4/stays.mp3'

const map: AssetMap = {
  music: { f1: KEEP, f4: TARGET, f5: TARGET },
  soundscape: { f2: TARGET, f3: KEEP },
  heartbeat: TARGET,
  bowl: KEEP,
}

const refs = assetMapReferences(map, TARGET)
assert(refs.length === 4, 'every slot pointing at the file is reported')
assert(refs.includes('music F4') && refs.includes('music F5'), 'music references are named by phase')
assert(refs.includes('soundscape F2'), 'soundscape references are named by phase')
assert(refs.includes('heartbeat'), 'the heartbeat slot is reported')
assert(!refs.includes('bowl'), 'a slot pointing elsewhere is NOT reported')
assert(assetMapReferences(map, 'assets/music/f4/absent.mp3').length === 0, 'a file nothing points at has no references')
assert(assetMapReferences(undefined, TARGET).length === 0, 'a protocol with no map has no references')

const scrubbed = withoutAsset(map, TARGET) as AssetMap
assert(scrubbed.music.f4 === undefined, 'the music slot is cleared')
assert(scrubbed.music.f5 === undefined, 'every music slot is cleared, not just the first')
assert(scrubbed.soundscape.f2 === undefined, 'the soundscape slot is cleared')
assert(scrubbed.heartbeat === undefined, 'the heartbeat slot is cleared')
assert(scrubbed.music.f1 === KEEP, 'a music slot pointing elsewhere is untouched')
assert(scrubbed.soundscape.f3 === KEEP, 'a soundscape slot pointing elsewhere is untouched')
assert(scrubbed.bowl === KEEP, 'the bowl slot pointing elsewhere is untouched')
assert(assetMapReferences(scrubbed, TARGET).length === 0, 'nothing points at the file afterwards')

/* Not mutating the original matters: the screen holds catalog entries in
   state and writes them back, so an in-place edit would make a failed save
   look like it had succeeded. */
assert(map.music.f4 === TARGET, 'the original map is not mutated')

assert(
  withoutAsset(map, 'assets/music/f4/absent.mp3') === map,
  'a map with nothing to remove is returned as-is, so the caller can skip a pointless write',
)
assert(withoutAsset(undefined, TARGET) === undefined, 'a protocol with no map needs no write either')

const empty = emptyAssetMap()
assert(assetMapReferences(empty, TARGET).length === 0, 'an empty map references nothing')
assert(withoutAsset(empty, TARGET) === empty, 'an empty map is returned as-is')

console.log(`\n${passed} assertions passed.`)
