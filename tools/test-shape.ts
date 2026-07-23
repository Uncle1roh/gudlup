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

/* --- loudness calibration (the PLAIN layer selector) --- */
import { gatedRms, calibrateBufferToDb, shapeClipBuffer, VOICE_REF_RMS } from '../src/studio/multitrack'
{
  // a "hot synth" at amplitude 0.7 (sine RMS ≈ 0.495) calibrated to −9 dB
  const sr2 = 1000
  const b = new (globalThis as any).AudioBuffer({ numberOfChannels: 2, length: 10 * sr2, sampleRate: sr2 })
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = 0.7 * Math.sin((2 * Math.PI * 50 * i) / sr2) }
  calibrateBufferToDb(b as any, -9)
  const want = VOICE_REF_RMS * Math.pow(10, -9 / 20)
  const got = gatedRms(b as any)
  assert(close(got, want, want * 0.03), `hot synth calibrated to −9 dB vs voice ref (rms ${got.toFixed(4)} ≈ ${want.toFixed(4)})`)
}
{
  // a quiet source comes UP to its ladder position (−18 dB)
  const sr2 = 1000
  const b = new (globalThis as any).AudioBuffer({ numberOfChannels: 2, length: 10 * sr2, sampleRate: sr2 })
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = 0.01 * Math.sin((2 * Math.PI * 50 * i) / sr2) }
  const g = calibrateBufferToDb(b as any, -18)
  assert(g > 1, `quiet source boosted (×${g.toFixed(2)})`)
  const want = VOICE_REF_RMS * Math.pow(10, -18 / 20)
  assert(close(gatedRms(b as any), want, want * 0.03), `lands exactly at −18 dB`)
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
