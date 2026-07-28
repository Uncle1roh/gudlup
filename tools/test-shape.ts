/* Numeric proof of applyClipShape (per-clip gain + fades baked into buffers).
   Uses a minimal AudioBuffer polyfill so it runs in node. */
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

import { applyClipShape } from '../src/studio/multitrack'

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else console.log(`ok  : ${msg}`)
}
const close = (a: number, b: number, eps = 1e-3) => Math.abs(a - b) <= eps

const sr = 1000
const buf = new (globalThis as any).AudioBuffer({ numberOfChannels: 2, length: 10 * sr, sampleRate: sr })
for (let ch = 0; ch < 2; ch++) buf.getChannelData(ch).fill(1)

// −6 dB gain, 2 s fade in, 4 s fade out
const out = applyClipShape(buf as any, -6, 2, 4) as any
const g = Math.pow(10, -6 / 20)
const d = out.getChannelData(0)
const EP = Math.SQRT1_2 // equal-power midpoint sin(π/4)
assert(close(d[5 * sr], g), `mid-sample = −6 dB linear (${d[5 * sr].toFixed(3)} vs ${g.toFixed(3)})`)
assert(close(d[1 * sr], g * EP), `1 s in (half of 2 s fade) = 0.707 × gain (equal-power)`)
assert(close(d[8 * sr], g * EP), `8 s (half of 4 s fade-out) = 0.707 × gain (equal-power)`)
assert(d[0] === 0 && close(d[out.length - 1], 0, 5e-3), `edges at ~0`)
assert(close(out.getChannelData(1)[5 * sr], g), `both channels shaped`)

// no-op passthrough returns the SAME buffer (no copy churn)
const same = applyClipShape(buf as any, 0, 0, 0)
assert(same === buf, `no-op returns the original buffer`)

// gain only, no fades
const gOnly = applyClipShape(buf as any, -14, 0, 0) as any
assert(close(gOnly.getChannelData(0)[0], Math.pow(10, -14 / 20)), `gain-only: first sample scaled, no fade`)

if (process.exitCode) { console.error('\nTEST FAILED'); process.exit(1) }
console.log('\nALL PASS')

/* --- LUFS input normalization (PO pipeline steps 2+3) --- */
import { gatedRms, calibrateBufferToDb, shapeClipBuffer, ANCHOR_LUFS } from '../src/studio/multitrack'
import { measureLufs } from '../src/studio/mastering'
const SRX = 44100
const tone = (amp: number, hz: number, seconds = 8) => {
  const b = new (globalThis as any).AudioBuffer({ numberOfChannels: 2, length: Math.round(seconds * SRX), sampleRate: SRX })
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = amp * Math.sin((2 * Math.PI * hz * i) / SRX) }
  return b
}
{
  // a "hot synth" (0.7 amp ≈ −0.4 LUFS stereo) normalized to anchor −9
  const b = tone(0.7, 997)
  calibrateBufferToDb(b as any, -9)
  const got = measureLufs(b as any)
  assert(close(got, ANCHOR_LUFS - 9, 0.5), `hot synth lands at ${(ANCHOR_LUFS - 9)} LUFS (got ${got.toFixed(1)})`)
}
{
  // a quiet source comes UP to anchor −18
  const b = tone(0.005, 997)
  const g = calibrateBufferToDb(b as any, -18)
  assert(g > 1, `quiet source boosted (×${g.toFixed(2)})`)
  const got = measureLufs(b as any)
  assert(close(got, ANCHOR_LUFS - 18, 0.5), `lands at ${(ANCHOR_LUFS - 18)} LUFS (got ${got.toFixed(1)})`)
}
{
  // two sources with wildly different intrinsic loudness end 12 LU apart —
  // the sheet's relationship, whatever the files measured before
  const hot = tone(0.9, 997); const quiet = tone(0.02, 997)
  calibrateBufferToDb(hot as any, -6)
  calibrateBufferToDb(quiet as any, -18)
  const diff = measureLufs(hot as any) - measureLufs(quiet as any)
  assert(close(diff, 12, 0.6), `−6 vs −18 offsets → exactly 12 LU apart (got ${diff.toFixed(1)})`)
}
{
  // gated RMS ignores silence: half-signal half-silence measures the SIGNAL
  const sr2 = 1000
  const full = new (globalThis as any).AudioBuffer({ numberOfChannels: 1, length: 10 * sr2, sampleRate: sr2 })
  const half = new (globalThis as any).AudioBuffer({ numberOfChannels: 1, length: 10 * sr2, sampleRate: sr2 })
  const df = full.getChannelData(0); const dh = half.getChannelData(0)
  for (let i = 0; i < df.length; i++) df[i] = 0.3 * Math.sin((2 * Math.PI * 50 * i) / sr2)
  for (let i = 0; i < dh.length / 2; i++) dh[i] = 0.3 * Math.sin((2 * Math.PI * 50 * i) / sr2)
  assert(close(gatedRms(full as any), gatedRms(half as any), 0.01), `gated RMS is silence-proof (voice pauses don't cause over-boost)`)
}
{
  // shapeClipBuffer = calibration THEN fades
  const sr2 = 1000
  const b = new (globalThis as any).AudioBuffer({ numberOfChannels: 1, length: 10 * sr2, sampleRate: sr2 })
  const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = 0.5 * Math.sin((2 * Math.PI * 50 * i) / sr2)
  const out = shapeClipBuffer(b as any, { calibrateDb: 0, fadeInSec: 2, fadeOutSec: 0 }) as any
  const mid = Math.abs(out.getChannelData(0)[5 * sr2 + 5])
  assert(mid > 0.05 && Math.abs(out.getChannelData(0)[10]) < mid / 5, `calibrate + fade compose (mid ${mid.toFixed(3)}, head faded)`)
}
console.log('calibration checks done')

/* --- clip EQ (RBJ biquads, offline) --- */
import { defaultClipEq, applyEqToBuffer, eqMagnitudeDb, eqIsTransparent } from '../src/studio/multitrack'
{
  const flat = defaultClipEq()
  assert(eqIsTransparent(flat), `default EQ is transparent (0 dB everywhere)`)

  // +12 dB bell at 1 kHz boosts a 1 kHz tone by ≈12 dB and leaves 100 Hz alone
  const eq = defaultClipEq()
  eq.bands[2] = { type: 'peaking', enabled: true, freqHz: 1000, gainDb: 12, q: 1.4 }
  const sr3 = 44100
  const mk = (hz: number) => {
    const b = new (globalThis as any).AudioBuffer({ numberOfChannels: 1, length: 2 * sr3, sampleRate: sr3 })
    const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = 0.1 * Math.sin((2 * Math.PI * hz * i) / sr3)
    return b
  }
  const t1k = mk(1000); const t100 = mk(100)
  const pre1k = gatedRms(t1k as any); const pre100 = gatedRms(t100 as any)
  applyEqToBuffer(t1k as any, eq); applyEqToBuffer(t100 as any, eq)
  const d1k = 20 * Math.log10(gatedRms(t1k as any) / pre1k)
  const d100 = 20 * Math.log10(gatedRms(t100 as any) / pre100)
  assert(close(d1k, 12, 0.6), `+12 dB bell @1 kHz boosts a 1 kHz tone by ${d1k.toFixed(1)} dB`)
  assert(Math.abs(d100) < 1, `…and leaves 100 Hz nearly untouched (${d100.toFixed(2)} dB)`)

  // low cut at 200 Hz kills an 50 Hz tone, spares 2 kHz
  const eq2 = defaultClipEq()
  eq2.bands[0] = { type: 'highpass', enabled: true, freqHz: 200, gainDb: 0, q: 0.71 }
  const t50 = mk(50); const t2k = mk(2000)
  const p50 = gatedRms(t50 as any); const p2k = gatedRms(t2k as any)
  applyEqToBuffer(t50 as any, eq2); applyEqToBuffer(t2k as any, eq2)
  const cut = 20 * Math.log10(Math.max(1e-6, gatedRms(t50 as any)) / p50)
  const keep = 20 * Math.log10(gatedRms(t2k as any) / p2k)
  assert(cut < -18, `200 Hz low cut drops a 50 Hz tone by ${cut.toFixed(0)} dB`)
  assert(Math.abs(keep) < 0.5, `…and passes 2 kHz (${keep.toFixed(2)} dB)`)

  // response-curve math agrees with the actual processing
  const [mag1k] = eqMagnitudeDb(eq, [1000], sr3)
  assert(close(mag1k, 12, 0.5), `eqMagnitudeDb @1 kHz reads ${mag1k.toFixed(1)} dB (curve = audio)`)

  // shapeClipBuffer order: EQ then calibration — layer level survives the boost
  const t = mk(1000)
  const out2 = shapeClipBuffer(t as any, { eq, calibrateDb: -9 }) as any
  const want2 = VOICE_REF_RMS * Math.pow(10, -9 / 20)
  assert(close(gatedRms(out2), want2, want2 * 0.03), `EQ'd clip still lands at −9 dB layer level (calibration after EQ)`)
}
console.log('eq checks done')
