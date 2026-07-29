/* Node proof for the volume_lufs encoding (PO rev. 3, absolute targets):
   parse the real GL-ANX 1.1 LUFS workbook and assert the mode, targets and
   the neutral-fader seed. Run:
     esbuild tools/test-plain-lufs.ts --bundle --platform=node → node <file>
*/
import { readFileSync } from 'node:fs'
import { parsePlainTimeline } from '../src/admin/plainTimeline'
import { plainToStudioTracks } from '../src/admin/plainStudio'
import { ANCHOR_LUFS } from '../src/studio/multitrack'

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else console.log(`ok  : ${msg}`)
}
const close = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps
/** engine offset that lands a clip at the given absolute LUFS */
const off = (lufs: number) => +(lufs - ANCHOR_LUFS).toFixed(2)

async function main() {
  const buf = readFileSync(process.argv[2])
  const res = await parsePlainTimeline(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
  if (res.error || !res.timeline) { console.error('PARSE ERROR:', res.error); process.exit(1) }
  const t = res.timeline
  const v = t.versions[0]

  assert(t.code === 'GL-ANX 1.1' && v.sheet === 'Standard', `identity: ${t.code} · ${v.sheet}`)
  assert(v.levelMode === 'lufs', `level mode = lufs (volume_lufs column detected)`)
  assert(v.clips.length === 71 && v.declaredTotal === 71, `71 clips (declared 71)`)
  assert(t.issues.filter((i) => i.level === 'error').length === 0, `0 validation errors`)

  const vc = v.clips.find((c) => c.clipId === 'VC-001')!
  assert(vc.volumeLufs === -16 && vc.volumeDb === null, `VC-001 target −16 LUFS (anchor voice)`)
  const mu = v.clips.find((c) => c.clipId === 'MU-001')!
  assert(mu.volumeLufs === -34, `MU-001 target −34 LUFS`)

  const seed = plainToStudioTracks(t, v)

  // LUFS mode: every fader neutral — the sheet IS the mix
  assert(seed.tracks.every((x) => close(x.volume, 1.0, 0.002)), `every fader at neutral 0.0 dB (gain 1.0)`)

  const guide = seed.tracks.find((x) => x.name === 'VOX-C Materna')!
  assert(guide.clips.filter((c) => c.text).every((c) => close(c.calibrateDb!, off(-16))), `VOX-C clips normalized to −16 LUFS (offset ${off(-16)})`)

  const right = seed.tracks.find((x) => x.name === 'VOX-R Paterna DX')!
  assert(right.clips.every((c) => close(c.calibrateDb!, off(-22))), `VOX-R sussurrata at −22 LUFS`)

  const mus = seed.tracks.find((x) => x.name === 'MUS-1 Musica')!
  const musTargets = mus.clips.map((c) => +(ANCHOR_LUFS + (c.calibrateDb ?? 0)).toFixed(0)).sort((a, b) => a - b)
  assert(musTargets.filter((x) => x === -34).length === 2 && musTargets.filter((x) => x === -22).length === 4, `MUS-1: −34 LUFS ×2 (F1–F2, under the bed) + −22 ×4 (F3–F6 foreground)`)

  const ss1 = seed.tracks.find((x) => x.name === 'SS-1 Lago')!
  const ssT = ss1.clips.map((c) => +(ANCHOR_LUFS + (c.calibrateDb ?? 0)).toFixed(0)).sort((a, b) => a - b)
  assert(ssT[0] === -36 && ssT[1] === -22 && ssT[2] === -22, `SS-1: −22/−22 + the −36 coda`)

  const bin = seed.tracks.find((x) => x.name === 'BIN-1 Binaurale')!
  const binT = bin.clips.map((c) => +(ANCHOR_LUFS + (c.calibrateDb ?? 0)).toFixed(0))
  assert(binT[0] === -25 && binT[1] === -34, `BIN-1: −25 solo, −34 with other layers`)

  // loop lane: −16 LUFS base, cycle attenuation folds in (1 cycle here → all −16)
  const loop = seed.tracks.find((x) => x.name.startsWith('VOX-C Materna · loop'))!
  assert(loop.clips.length === 12 && loop.clips.every((c) => close(c.calibrateDb!, off(-16))), `loop: 12 clips at −16 LUFS`)

  // LUFS faders: every lane carries its authored baseLufs so the Studio
  // fader reads the protocol's language (voice −16, music −22, …)
  assert(close(guide.baseLufs ?? 0, -16, 0.01), `VOX-C fader reads −16.0 LUFS at neutral`)
  assert(close(mus.baseLufs ?? 0, -22, 0.01), `MUS-1 fader reads −22.0 LUFS (its loudest clip)`)
  assert(close(ss1.baseLufs ?? 0, -22, 0.01) && close(bin.baseLufs ?? 0, -25, 0.01), `SS-1 −22 · BIN-1 −25 on the faders`)

  // fades/crossfades/ducking survive the encoding switch
  const ss1Sorted = [...ss1.clips].sort((a, b) => a.startSec - b.startSec)
  assert(ss1Sorted[1].fadeInSec === 6 && (ss1Sorted[0].fadeOutSec ?? 0) >= 6, `crossfades still applied`)
  assert(ss1.duck === 'soundscape' && mus.duck === 'music', `duck families intact`)

  console.log('\nnotes:')
  for (const n of seed.notes.filter((x) => /normalized to/.test(x))) console.log('  ·', n)

  if (process.exitCode) { console.error('\nTEST FAILED'); process.exit(1) }
  console.log('\nALL PASS')
}

void main()
