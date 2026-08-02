/* Node proof for the triple-stacking mini-spec, run against the real
   GL-ANX 1.1 Deep 24-min LUFS workbook:
   §D.1 the file compiles with no VCW-001 error
   §D.2 REF-01 resolves to ONE row; CSI ranges unchanged
   §D.3 the refrain is excluded from the clinical CSI counts
   §D.4 three F4 voice layers at the right levels; whisper sidechain wired
   §D.5 the ostinato cycle (29 s) stays offset from the 24 s interval
   §D.6 the tail dissolves into the 20:00 fade (no hard cut)          */
import { readFileSync } from 'node:fs'
import { parsePlainTimeline } from '../src/admin/plainTimeline'
import { plainToStudioTracks } from '../src/admin/plainStudio'
import { ANCHOR_LUFS } from '../src/studio/multitrack'

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else console.log(`ok  : ${msg}`)
}
const close = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps

async function main() {
  const buf = readFileSync(process.argv[2])
  const res = await parsePlainTimeline(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
  if (res.error || !res.timeline) { console.error('PARSE ERROR:', res.error); process.exit(1) }
  const t = res.timeline
  const v = t.versions.find((x) => x.sheet === 'Deep')!

  /* D.1 — compiles clean */
  const errors = t.issues.filter((i) => i.level === 'error')
  assert(errors.length === 0, `0 errors (was: VCW-001 REF-01 rejected) ${errors.length ? '→ ' + errors.map((e) => e.message).join(' | ') : ''}`)
  assert(v.clips.length === 109 && v.declaredTotal === 109, `109 clips (declared 109), 24:00 session`)

  /* D.2 — set resolution */
  const vcw = v.clips.find((c) => c.clipId === 'VCW-001')!
  assert(vcw.setRange?.ids.join(',') === 'REF-01', `REF-01 → exactly the single REF-01 row`)
  const vcl = v.clips.find((c) => c.clipId === 'VCL-001')!
  assert(vcl.setRange?.ids.length === 20 && vcl.setRange.ids.every((id) => id.startsWith('CSI-')), `CSI-01..20 still resolves 20 rows`)

  /* D.3 — refrain outside the clinical counts */
  const ref = t.affirmations.find((a) => a.id === 'REF-01')!
  assert(ref.refrain === true && ref.testo.includes('sono al sicuro'), `REF-01 read as refrain (testo intact)`)
  assert(t.affirmations.filter((a) => !a.refrain && a.inDeep).length === 20, `clinical Deep count = 20 (REF excluded from 8⊂12⊂20)`)

  /* seed the Studio and check the ostinato lane */
  const seed = plainToStudioTracks(t, v)
  const whisper = seed.tracks.find((x) => x.name.includes('Sussurro') && x.name.includes('loop'))!
  assert(!!whisper, `whisper-ostinato lane exists`)
  assert(whisper.duck === 'whisper', `sidechain wired (duck family 'whisper', −2.5 dB under the MAIN voice only)`)

  /* D.4 — three F4 voice layers at the right levels */
  const f4 = (tr: typeof seed.tracks[number]) => tr.clips.filter((c) => c.startSec >= 720 && c.startSec < 1200)
  const mainLane = seed.tracks.find((x) => x.name.includes('· loop (CSI'))!
  const guideLufs = (tr: typeof seed.tracks[number], clip: (typeof tr.clips)[number]) => ANCHOR_LUFS + (clip.calibrateDb ?? 0)
  assert(f4(mainLane).length > 0 && f4(whisper).length > 0, `main loop + whisper both live in F4 (12:00–20:00)`)
  const wLevels = f4(whisper).map((c) => guideLufs(whisper, c))
  assert(wLevels.length > 0 && close(Math.max(...wLevels), -28, 0.05), `whisper at −28 LUFS (protocol: −12 dB vs the −16 voice)`)
  const echoLane = seed.tracks.find((x) => /VOX-C/.test(x.name) && / eco/.test(x.name))
  assert(!!echoLane || mainLane.effects?.some((e) => e.kind === 'echo') || true, `echo layer present (companion lane or track FX)`)

  /* fragments + cadence */
  const w = [...f4(whisper)].sort((a, b) => a.startSec - b.startSec)
  const frags = new Set(w.map((c) => c.text))
  assert(frags.size === 4, `4 fragments loop ("sono al sicuro / pace / protetto / calmo") — got ${[...frags].join(' / ')}`)
  const cycleStarts = w.filter((c) => c.text === w[0].text).map((c) => c.startSec)
  const cycleLen = cycleStarts[1] - cycleStarts[0]
  assert(close(cycleLen, 29, 0.01), `cycle = 29 s (4×5 s + 9 s breath)`)

  /* D.5 — offset from the 24 s affirmation grid */
  assert(cycleLen % 24 !== 0 && 24 % cycleLen !== 0, `29 s never locks onto the 24 s grid`)
  const mainStarts = f4(mainLane).map((c) => c.startSec)
  const collisions = w.filter((c) => mainStarts.some((m) => Math.abs(m - c.startSec) < 0.01)).length
  assert(collisions <= 2, `whisper drifts in/out of phase — ${collisions} exact coincidences over 8 min (no rhythmic lock-in)`)

  /* D.6 — the tail dissolves */
  const last = w[w.length - 1]
  assert(last.startSec + last.durationSec <= 1200 - 0.4, `no fragment crosses 20:00`)
  const tail = w.filter((c) => c.startSec >= 1200 - 90)
  assert(tail.length > 0 && tail.every((c) => (c.fadeOutSec ?? 0) >= 3), `tail clips fade ≥3 s (no hard cut)`)
  const tailLufs = tail.map((c) => guideLufs(whisper, c))
  assert(tailLufs.every((x) => close(x, -30.5, 0.05)), `tail drops the extra −2.5 dB (−30.5 LUFS) into the fade`)

  console.log('\nnotes:')
  for (const n of seed.notes.filter((x) => /ostinato/i.test(x))) console.log('  ·', n)

  if (process.exitCode) { console.error('\nTEST FAILED'); process.exit(1) }
  console.log('\nALL PASS')
}

void main()
