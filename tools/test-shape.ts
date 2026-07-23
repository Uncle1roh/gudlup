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
assert(close(d[5 * sr], g), `mid-sample = −6 dB linear (${d[5 * sr].toFixed(3)} vs ${g.toFixed(3)})`)
assert(close(d[1 * sr], g * 0.5), `1 s in (half of 2 s fade) = 0.5 × gain`)
assert(close(d[8 * sr], g * 0.5), `8 s (half of 4 s fade-out) = 0.5 × gain`)
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
