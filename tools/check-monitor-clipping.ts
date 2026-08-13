/* The male-voice distortion, and the proof that the monitor bus fixes it.

   The POs set the voice lane to −6 LUFS by ear. Measured on their own voices,
   a clip calibrated to that level peaks between +5 and +10 dBFS: speech has
   9–13 dB of crest factor, so −6 LUFS integrated means peaks above 0 dBFS for
   ANY voice. That is fine inside the engine (float buffers, and §9 brings the
   exported file back under −1 dBTP), but the realtime monitor sent those
   buffers to ctx.destination, which hard-clips at ±1.

   Why it showed up on the male voices: clipped bass buzzes. Paternal carries
   92 % of its energy below 160 Hz; the child male voice carries 12 %, so its
   clipping lands on sparse transients nobody notices — "the child male voice is
   fine, all other male voices distort", exactly as reported. That last step is
   psychoacoustic and this file does NOT assert it; what it asserts is that the
   old monitor path clipped and the new one cannot.

   Run: npx esbuild tools/check-monitor-clipping.ts --bundle --platform=node \
          --format=esm --outfile=<tmp>/mc.mjs && node <tmp>/mc.mjs             */

class FakeAB {
  numberOfChannels: number; length: number; sampleRate: number; private ch: Float32Array[]
  constructor(o: { numberOfChannels: number; length: number; sampleRate: number }) {
    this.numberOfChannels = o.numberOfChannels; this.length = o.length; this.sampleRate = o.sampleRate
    this.ch = Array.from({ length: o.numberOfChannels }, () => new Float32Array(o.length))
  }
  get duration() { return this.length / this.sampleRate }
  getChannelData(i: number) { return this.ch[i] }
  copyToChannel(src: Float32Array, ch: number, start = 0) { this.ch[ch].set(src, start) }
}
;(globalThis as unknown as { AudioBuffer: unknown }).AudioBuffer = FakeAB

import { calibrateBufferToDb, ANCHOR_LUFS, bufferPeakDb, softClipCurve, SOFT_CLIP_CEILING, SOFT_CLIP_KNEE } from '../src/studio/multitrack'
import { measureLufs } from '../src/studio/mastering'

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else console.log(`ok  : ${msg}`)
}

const SR = 24000
const db = (v: number) => (v <= 1e-12 ? -240 : 20 * Math.log10(v))
const rms = (x: Float32Array) => { let a = 0; for (let i = 0; i < x.length; i++) a += x[i] * x[i]; return Math.sqrt(a / x.length) }

/** Voice-like signal: f0 + harmonics, syllabic envelope, plosive bursts. */
function voiceLike(f0: number, lowTilt: number): Float32Array {
  const n = SR * 5
  const out = new Float32Array(n)
  const partials: { f: number; a: number }[] = []
  for (let h = 1; h * f0 < 9000; h++) partials.push({ f: f0 * h, a: Math.pow(h, -lowTilt) })
  const norm = partials.reduce((s, p) => s + p.a, 0)
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const env = 0.5 + 0.4 * Math.sin(2 * Math.PI * 3.5 * t)
    const burst = (t % 1.3) < 0.05 ? 1.8 : 1
    let s = 0
    for (const p of partials) s += p.a * Math.sin(2 * Math.PI * p.f * t)
    out[i] = (s / norm) * env * burst
  }
  return out
}
/** what ctx.destination does: hard clip at ±1 */
function hardClip(x: Float32Array): Float32Array {
  const y = new Float32Array(x.length)
  for (let i = 0; i < x.length; i++) y[i] = Math.max(-1, Math.min(1, x[i]))
  return y
}
/** Stage 1 of the monitor bus: the compressor, threshold −6 dBFS, ratio 10.
    Modelled with the same attack/release the player configures — including the
    fact that a fast transient gets through before the gain has moved. */
function monitorCompress(x: Float32Array): Float32Array {
  const thr = Math.pow(10, -6 / 20)
  const ratio = 10
  const attack = Math.exp(-1 / (0.002 * SR))
  const release = Math.exp(-1 / (0.2 * SR))
  const y = new Float32Array(x.length)
  let env = 0
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i])
    env = a > env ? attack * env + (1 - attack) * a : release * env + (1 - release) * a
    let g = 1
    if (env > thr) {
      const over = db(env) - db(thr)
      g = Math.pow(10, (db(thr) + over / ratio - db(env)) / 20)
    }
    y[i] = x[i] * g
  }
  return y
}
/** Stage 2: the WaveShaper. Input is clamped to −1…+1 and mapped through the
    curve, so the curve's endpoint IS the ceiling — that is the guarantee the
    compressor alone cannot give. */
function monitorSoftClip(x: Float32Array): Float32Array {
  const curve = softClipCurve()
  const n = curve.length
  const y = new Float32Array(x.length)
  for (let i = 0; i < x.length; i++) {
    const xi = Math.max(-1, Math.min(1, x[i]))
    const pos = ((xi + 1) / 2) * (n - 1)
    const lo = Math.floor(pos)
    const hi = Math.min(n - 1, lo + 1)
    const f = pos - lo
    y[i] = curve[lo] * (1 - f) + curve[hi] * f
  }
  return y
}
/** residue that is NOT explainable as a pure gain change, in dB */
function damageDb(ref: Float32Array, out: Float32Array): number {
  let num = 0, den = 0
  for (let i = 0; i < ref.length; i++) { num += ref[i] * out[i]; den += ref[i] * ref[i] }
  const g = den > 0 ? num / den : 1
  const err = new Float32Array(ref.length)
  const scaled = new Float32Array(ref.length)
  for (let i = 0; i < ref.length; i++) { scaled[i] = g * ref[i]; err[i] = out[i] - scaled[i] }
  return db(rms(err) / Math.max(1e-12, rms(scaled)))
}
function railCount(x: Float32Array): number {
  let n = 0
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) >= 0.99999) n++
  return n
}

/* Two voices standing in for the PO's control experiment: a deep one whose
   energy sits low (Paternal, 92 % below 160 Hz) and a high one (child, 12 %). */
const CASES: [string, number, number][] = [
  ['deep male   f0=110 Hz', 110, 1.35],
  ['child male  f0=250 Hz', 250, 0.55],
]

console.log('Voice lane calibrated to -6 LUFS, then through the monitor path.\n')
console.log('voice                  peak@-6   OLD: samples   NEW: samples   residue OLD/NEW')
console.log('                        dBFS      at the rail    at the rail        dB')
const results: { label: string; oldRail: number; newRail: number }[] = []
for (const [label, f0, tilt] of CASES) {
  const mono = voiceLike(f0, tilt)
  const b = new FakeAB({ numberOfChannels: 2, length: mono.length, sampleRate: SR })
  b.copyToChannel(mono, 0); b.copyToChannel(mono, 1)
  calibrateBufferToDb(b as unknown as AudioBuffer, -6 - ANCHOR_LUFS)
  const hot = Float32Array.from(b.getChannelData(0))
  const peak = bufferPeakDb(b as unknown as AudioBuffer)
  // the monitor also applies the master gain before the destination
  const MASTER = 0.82
  const scaled = new Float32Array(hot.length)
  for (let i = 0; i < hot.length; i++) scaled[i] = hot[i] * MASTER
  const oldOut = hardClip(scaled)
  // compressor -> soft clipper -> the DAC's own clamp (which must find nothing to do)
  const newOut = hardClip(monitorSoftClip(monitorCompress(scaled)))
  results.push({ label, oldRail: railCount(oldOut), newRail: railCount(newOut) })
  console.log(`${label}   ${peak.toFixed(1).padStart(6)}    ${String(railCount(oldOut)).padStart(11)}    ${String(railCount(newOut)).padStart(11)}      ${damageDb(scaled, oldOut).toFixed(1)} / ${damageDb(scaled, newOut).toFixed(1)}`)
}
console.log('')

for (const r of results) {
  assert(r.oldRail > 100, `${r.label}: the OLD monitor hard-clipped ${r.oldRail} samples at the rail`)
  assert(r.newRail === 0, `${r.label}: the new monitor bus clips ${r.newRail} samples (must be 0)`)
}

/* the curve itself carries the guarantee — check it, not just this signal */
const curve = softClipCurve()
let curveMax = 0
for (let i = 0; i < curve.length; i++) curveMax = Math.max(curveMax, Math.abs(curve[i]))
assert(curveMax < 1, `the soft-clip curve never reaches full scale (max ${curveMax.toFixed(4)})`)
assert(curveMax <= SOFT_CLIP_CEILING + 1e-6, `it stays at or under the declared ${SOFT_CLIP_CEILING} ceiling`)
assert(Math.abs(curve[0] + curve[curve.length - 1]) < 1e-6, 'the curve is symmetric — no DC offset introduced')

/* and it must be EXACTLY transparent where ordinary material lives */
const at = (x: number) => {
  const pos = ((x + 1) / 2) * (curve.length - 1)
  const lo = Math.floor(pos), hi = Math.min(curve.length - 1, lo + 1), f = pos - lo
  return curve[lo] * (1 - f) + curve[hi] * f
}
for (const lvl of [0.05, 0.1, 0.25, 0.45]) {
  const err = Math.abs(20 * Math.log10(Math.abs(at(lvl) / lvl)))
  assert(err < 0.02, `unity at ${(20 * Math.log10(lvl)).toFixed(0)} dBFS (${err.toFixed(3)} dB from unity) — monitoring untouched below the knee`)
}
assert(at(1) < SOFT_CLIP_CEILING, `full-scale input maps to ${at(1).toFixed(3)}, under the ceiling`)
assert(at(1) > SOFT_CLIP_KNEE, 'and above the knee — it compresses rather than gating')

/* the level itself is unreachable, whatever the voice — that is the real lesson */
console.log('')
for (const [label, f0, tilt] of CASES) {
  const mono = voiceLike(f0, tilt)
  const b = new FakeAB({ numberOfChannels: 2, length: mono.length, sampleRate: SR })
  b.copyToChannel(mono, 0); b.copyToChannel(mono, 1)
  calibrateBufferToDb(b as unknown as AudioBuffer, -6 - ANCHOR_LUFS)
  const l = measureLufs(b as unknown as AudioBuffer)
  const pk = bufferPeakDb(b as unknown as AudioBuffer)
  assert(pk > 0, `${label}: -6 LUFS forces the clip past full scale (+${pk.toFixed(1)} dBFS at ${l.toFixed(1)} LUFS) — no voice can hold that level`)
}
