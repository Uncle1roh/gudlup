/* Node proof for slice 2: parse the real GL-ANX 1.1 PLAIN workbook, seed the
   Studio project, and assert the 1:1 structure, gains, voices, FX and loop
   expansion. Run:
     node_modules/.bin/esbuild tools/test-plain-studio.ts --bundle --platform=node \
       --outfile=/tmp/tps.cjs && node /tmp/tps.cjs <file>
*/
import { readFileSync } from 'node:fs'
import { parsePlainTimeline } from '../src/admin/plainTimeline'
import { plainToStudioTracks, resolvePlainVoice } from '../src/admin/plainStudio'
import type { VoiceParams, BilateralParams, BinauralParams } from '../src/studio/multitrack'

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 }
  else console.log(`ok  : ${msg}`)
}
const close = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps

async function main() {
  const buf = readFileSync(process.argv[2])
  const res = await parsePlainTimeline(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
  if (res.error || !res.timeline) { console.error('PARSE ERROR:', res.error); process.exit(1) }
  const t = res.timeline
  const v = t.versions[0]
  const seed = plainToStudioTracks(t, v)

  assert(seed.name === 'GL-ANX 1.1 · Standard' && seed.totalSec === 720, `seed name/length: ${seed.name} · ${seed.totalSec}s`)

  const names = seed.tracks.map((x) => x.name)
  console.log('tracks:', names.join(' | '))
  assert(seed.tracks.length === 13, `13 tracks (11 tracce + loop lane + eco lane) — got ${seed.tracks.length}`)

  // 1:1 accounting: 70 non-loop rows → 70 clips; 1 loop row → 12 clips
  const totalClips = seed.tracks.reduce((n, x) => n + x.clips.length, 0)
  assert(totalClips === 82, `82 clips total (70 rows + 12 loop expansions) — got ${totalClips}`)

  // sample lanes silent until slice 3
  const ss1 = seed.tracks.find((x) => x.name === 'SS-1 Lago')!
  assert(ss1.type === 'sample' && ss1.clips.length === 3, `SS-1 Lago: sample × 3 clips`)
  assert(ss1.clips.every((c) => (c.params as { url: string }).url === ''), `SS-1 clips have no URL yet (slice 3 draw)`)
  // the Excel ladder ON the fader: SS-1 base −6 dB → gain 0.501; clips are
  // calibrated to lane offsets (0/0/−14 for the −20 dB coda)
  assert(close(ss1.volume, 0.501, 0.002), `SS-1 fader −6 dB (0.501) — got ${ss1.volume}`)
  assert(ss1.clips.filter((c) => c.calibrateDb === 0).length === 2 && ss1.clips.some((c) => c.calibrateDb === -14), `SS-1 clip offsets 0/0/−14`)
  // crossfade_prec_s became REAL overlaps: clip 2 starts 6 s early with a
  // 6 s equal-power fade-in; clip 1 got the matching 6 s fade-out
  const ss1Sorted = [...ss1.clips].sort((a, b) => a.startSec - b.startSec)
  assert(ss1Sorted[1].fadeInSec === 6 && (ss1Sorted[0].fadeOutSec ?? 0) >= 6, `SS-1 crossfade: 6 s fade-in on clip 2 + 6 s fade-out on clip 1`)
  assert(ss1Sorted[1].startSec + 6 - Math.round(ss1Sorted[1].startSec + 6) === 0 && ss1Sorted[0].startSec + ss1Sorted[0].durationSec - ss1Sorted[1].startSec >= 5.99, `SS-1 clips now OVERLAP by the crossfade`)

  const mus = seed.tracks.find((x) => x.name === 'MUS-1 Musica')!
  assert(mus.clips.length === 6, `MUS-1: 6 clips (one per phase)`)
  // MUS-1 base −6 → fader 0.501; F1–F2 clips at offset −12, F3–F6 at 0
  assert(close(mus.volume, 0.501, 0.002) && mus.clips.filter((c) => c.calibrateDb === -12).length === 2 && mus.clips.filter((c) => c.calibrateDb === 0).length === 4, `MUS-1 fader −6 dB, offsets −12×2 + 0×4`)
  const musSorted = [...mus.clips].sort((a, b) => a.startSec - b.startSec)
  assert(musSorted.slice(1).every((c, i) => musSorted[i].startSec + musSorted[i].durationSec > c.startSec), `MUS-1: every phase boundary crossfades (real overlaps)`)

  // binaural: BI-001 carriers 200/210 → carrier 205, beat 10; BI-002 −18 vs −9 base
  const bin = seed.tracks.find((x) => x.name === 'BIN-1 Binaurale')!
  const bp = bin.clips[0].params as BinauralParams
  assert(bin.type === 'binaural' && close(bp.carrierHz, 205) && close(bp.beatHz, 10), `BIN-1 clip 1: carrier 205 / beat 10`)
  assert(close(bin.volume, 0.355, 0.002) && bin.clips[0].calibrateDb === 0 && bin.clips[1].calibrateDb === -9, `BIN-1 fader −9 dB, clip offsets 0 / −9`)

  // solfeggio → binaural beat 0 @ 432
  const sol = seed.tracks.find((x) => x.name === 'SOL-1 Solfeggio')!
  const sp = sol.clips[0].params as BinauralParams
  assert(sol.type === 'binaural' && sp.beatHz === 0 && sp.carrierHz === 432, `SOL-1: pure 432 Hz tone (beat 0)`)

  // bilateral: 400 Hz / 4 s / panAmp 1.0
  const bil = seed.tracks.find((x) => x.name === 'BIL-1 Bilaterale')!
  const blp = bil.clips[0].params as BilateralParams
  assert(bil.type === 'bilateral' && blp.toneHz === 400 && blp.everySec === 4 && close(blp.panAmp ?? 0.8, 1), `BIL-1: 400 Hz · 4 s · panAmp 1.0`)

  // voice lanes
  const guide = seed.tracks.find((x) => x.name === 'VOX-C Materna')!
  assert(guide.type === 'voice' && guide.clips.length === 33 && guide.channel === 'C', `VOX-C Materna: 33 linea clips, channel C`)
  assert(close(guide.volume, 1.0, 0.002) && guide.clips.every((c) => c.calibrateDb === 0), `VOX-C fader 0.0 dB (gain 1.0), clips at offset 0 — the guide anchor`)
  const rv = guide.effects?.find((e) => e.kind === 'reverb')
  assert(!!rv?.enabled && close(rv!.params.mix, 0.3), `VOX-C Reverb 30% enabled (riverbero_pct)`)
  assert(guide.clips.every((c) => (c.params as VoiceParams).voiceId === 'DrXMEEZ3ZiRzhi81CK7I'), `VOX-C clips carry Valeria's voiceId`)

  const loop = seed.tracks.find((x) => x.name.startsWith('VOX-C Materna · loop'))!
  assert(loop.clips.length === 12, `Loop lane: 12 affirmation clips — got ${loop.clips.length}`)
  assert(loop.clips[0].startSec === 330 && loop.clips[11].startSec === 330 + 11 * 20, `Loop timing: 5:30 start, every 20 s`)
  assert(loop.clips[0].text?.startsWith('Sono al sicuro'), `Loop clip 1 text = CSI-01`)
  assert(loop.clips.every((c) => c.fadeInSec === 1 && c.fadeOutSec === 2), `Loop clips carry the 1s/2s default envelope`)
  const loopEcho = loop.effects?.find((e) => e.kind === 'echo')
  assert(!!loopEcho?.enabled && close(loopEcho!.params.delaySec, 2) && close(loopEcho!.params.mix, Math.pow(10, -8 / 20), 0.01), `Loop lane Emotional Echo: +2 s, −8 dB mix`)
  const loopRv = loop.effects?.find((e) => e.kind === 'reverb')
  assert(!!loopRv?.enabled, `Loop lane inherits Reverb 30%`)

  const left = seed.tracks.find((x) => x.name === 'VOX-L Materna SX')!
  assert(left.channel === 'L' && left.clips.length === 10 && left.clips.every((c) => (c.params as VoiceParams).pan === 0), `VOX-L: channel L, 10 clips, clip pan 0 (track positions the side)`)

  const right = seed.tracks.find((x) => x.name === 'VOX-R Paterna DX')!
  assert(right.channel === 'R' && right.clips.length === 8, `VOX-R main: channel R, 8 clips (2 moved to the eco lane)`)
  assert(close(right.volume, 0.501, 0.002) && right.clips.every((c) => c.calibrateDb === 0), `VOX-R fader −6 dB, clips at offset 0`)
  // sussurrato Paterna → same-gender Whisper voice (Thomas, M)
  const rvoice = (right.clips[0].params as VoiceParams).voiceId
  assert(rvoice === 'crip8a67H5HFGlukcx1h', `VOX-R sussurrato Paterna → Thomas (M · Whisper) — got ${rvoice}`)

  const eco = seed.tracks.find((x) => x.name === 'VOX-R Paterna DX · eco')!
  assert(eco.clips.length === 2 && eco.channel === 'R', `Eco lane: VR-009/VR-010, channel R`)
  const ecoFx = eco.effects?.find((e) => e.kind === 'echo')
  assert(!!ecoFx?.enabled && close(ecoFx!.params.delaySec, 2), `Eco lane Emotional Echo +2 s enabled`)

  // voice resolution unit checks (Dec. 6)
  assert(resolvePlainVoice('Materna', 'normale').voice.name === 'Valeria', `Materna → Valeria`)
  assert(resolvePlainVoice('Paterna', 'normale').voice.name === 'Marco Trox', `Paterna → Marco Trox`)
  assert(resolvePlainVoice('Materna', 'sussurrato').voice.name === 'Emily', `Materna sussurrata → Emily (F · Whisper)`)
  assert(resolvePlainVoice(undefined, undefined).voice.name === 'Valeria', `no archetipo → default Valeria`)

  // every clip inside the session and fades carried from the Excel
  assert(seed.tracks.every((x) => x.clips.every((c) => c.startSec >= 0 && c.startSec + c.durationSec <= 720.01)), `all clips inside 0..720 s`)
  const vc001 = guide.clips[0]
  assert(close(vc001.startSec, 3) && close(vc001.fadeInSec ?? 0, 0.3) && close(vc001.fadeOutSec ?? 0, 0.5), `VC-001 fades 0.3/0.5 s carried`)

  console.log(`\nSeeding notes (${seed.notes.length}):`)
  for (const n of seed.notes) console.log('  ·', n)

  if (process.exitCode) { console.error('\nTEST FAILED'); process.exit(1) }
  console.log('\nALL PASS')
}

void main()
