/* Node proof for the §9 mastering pass (LUFS + true-peak limiter), using a
   minimal AudioBuffer polyfill. Reference: a full-scale 997 Hz sine measures
   ≈ −3.0 LUFS under BS.1770 (K-weighting ≈ 0 dB at 1 kHz; sine RMS −3 dBFS).
   Run: esbuild tools/test-mastering.ts --bundle --platform=node → node.
*/
class FakeAB {
  numberOfChannels: number; length: number; sampleRate: number; private ch: Float32Array[]
  constructor(opts: { numberOfChannels: number; length: number; sampleRate: number }) {
    this.numberOfChannels = opts.numberOfChannels; this.length = opts.length; this.sampleRate = opts.sampleRate
    this.ch = Array.from({ length: opts.numberOfChannels }, () => new Float32Array(opts.length))
  }
  get duration() { return this.length / this.sampleRate }
  getChannelData(i: number) { return this.ch[i] }
}
;(globalThis as unknown as { AudioBuffer: unknown }).AudioBuffer = FakeAB

import { measureLufs, measureTruePeakDb, masterizeBuffer, SESSION_TARGET_LUFS } from '../src/studio/mastering'

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else console.log(`ok  : ${msg}`)
}
const close = (a: number, b: number, eps: number) => Math.abs(a - b) <= eps

const SR = 44100
function sine(amp: number, seconds: number, hz = 997): InstanceType<typeof FakeAB> {
  const buf = new FakeAB({ numberOfChannels: 2, length: Math.round(seconds * SR), sampleRate: SR })
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < d.length; i++) d[i] = amp * Math.sin((2 * Math.PI * hz * i) / SR)
  }
  return buf
}

/* --- LUFS reference points --- */
// stereo full-scale 997 Hz: each channel MS = 0.5 → summed 1.0 → LUFS ≈ −0.691… 
// per BS.1770 the STEREO sum reads ~+3 LU over mono; the mono canonical −3.01
// check uses ONE channel:
{
  const mono = new FakeAB({ numberOfChannels: 1, length: 10 * SR, sampleRate: SR })
  const d = mono.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.sin((2 * Math.PI * 997 * i) / SR)
  const l = measureLufs(mono as unknown as AudioBuffer)
  assert(close(l, -3.0, 0.35), `mono FS 997 Hz sine ≈ −3.0 LUFS (got ${l.toFixed(2)})`)
}
{
  const l = measureLufs(sine(0.1, 10) as unknown as AudioBuffer)
  // stereo: −20 dB from each channel, +3 dB channel sum vs mono ⇒ ≈ −20.0
  assert(close(l, -20.0, 0.4), `stereo 0.1-amp sine ≈ −20 LUFS (got ${l.toFixed(2)})`)
}
{
  const l = measureLufs(sine(0, 5) as unknown as AudioBuffer)
  assert(l === -Infinity, `silence → −∞ LUFS`)
}
// K-weighting shape: 100 Hz reads LOWER than 997 Hz at equal amplitude (RLB
// high-pass), high band reads HIGHER (pre-shelf)
{
  const a = measureLufs(sine(0.1, 10, 100) as unknown as AudioBuffer)
  const b = measureLufs(sine(0.1, 10, 997) as unknown as AudioBuffer)
  const c = measureLufs(sine(0.1, 10, 8000) as unknown as AudioBuffer)
  assert(a < b - 0.5, `100 Hz reads lower than 1 kHz (${a.toFixed(1)} < ${b.toFixed(1)})`)
  assert(c > b + 2, `8 kHz reads ~+4 LU over 1 kHz (${c.toFixed(1)} > ${b.toFixed(1)})`)
}

/* --- true peak --- */
{
  const tp = measureTruePeakDb(sine(0.5, 1) as unknown as AudioBuffer)
  assert(close(tp, -6.02, 0.3), `0.5-amp sine true peak ≈ −6 dBTP (got ${tp.toFixed(2)})`)
}

/* --- masterize: quiet session comes UP to target --- */
{
  const buf = sine(0.02, 30) as unknown as AudioBuffer // ≈ −34 LUFS stereo
  const m = masterizeBuffer(buf)
  assert(m.gainDb > 10, `quiet session lifted (+${m.gainDb.toFixed(1)} dB)`)
  assert(close(m.postLufs, SESSION_TARGET_LUFS, 0.6), `post ≈ ${SESSION_TARGET_LUFS} LUFS (got ${m.postLufs.toFixed(2)})`)
  assert(m.truePeakDb <= -0.8, `true peak under the −1 dBTP ceiling (got ${m.truePeakDb.toFixed(2)})`)
}

/* --- masterize: hot session comes DOWN, limiter caps the ceiling --- */
{
  const buf = sine(0.9, 30) as unknown as AudioBuffer // ≈ −1.6 LUFS stereo — way hot
  const m = masterizeBuffer(buf)
  assert(m.gainDb < -5, `hot session pulled down (${m.gainDb.toFixed(1)} dB)`)
  assert(close(m.postLufs, SESSION_TARGET_LUFS, 0.8), `post ≈ target (got ${m.postLufs.toFixed(2)})`)
  assert(m.truePeakDb <= -0.8, `ceiling respected (${m.truePeakDb.toFixed(2)} dBTP)`)
}

/* --- limiter engages on peaks without wrecking the loudness --- */
{
  const buf = sine(0.02, 30) as unknown as AudioBuffer
  // inject a short spike burst that WOULD clip after the big makeup gain
  const d0 = (buf as unknown as InstanceType<typeof FakeAB>).getChannelData(0)
  for (let i = 15 * SR; i < 15 * SR + 400; i++) d0[i] = 0.9
  const m = masterizeBuffer(buf)
  assert(m.limiterDb < -0.5, `limiter engaged on the spike (${m.limiterDb.toFixed(1)} dB reduction)`)
  assert(m.truePeakDb <= -0.8, `spike capped at the ceiling (${m.truePeakDb.toFixed(2)} dBTP)`)
}

if (process.exitCode) { console.error('\nTEST FAILED'); process.exit(1) }
console.log('\nALL PASS')
