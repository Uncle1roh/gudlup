/* ============================================================================
   Good Loop — session mastering (Rules doc §9: safety ceiling + loudness)
   The final app-side pass on a rendered session:

     1. Integrated loudness measured per ITU-R BS.1770-4 (K-weighting —
        pre-shelf + RLB high-pass biquads computed for the actual sample
        rate; 400 ms blocks, 75 % overlap; −70 LUFS absolute and −10 LU
        relative gating).
     2. Normalization to the session target (−16 LUFS integrated — the
        streaming-standard comfortable level; two different protocols come
        out at the SAME perceived volume).
     3. True-peak limiter at −1.0 dBTP (4× oversampled sinc peak detection,
        5 ms lookahead attack, 200 ms release) so no inter-sample peak can
        clip a DAC or an MP3 encode.

   The §9 "<70 dB SPL at the ear" ceiling cannot be enforced from inside a
   file (SPL depends on the listener's device + volume setting); a session
   normalized to −16 LUFS sits comfortably under it at normal phone/headset
   settings, and the render note documents the chain for the clinical file.
   ============================================================================ */

/* ------------------------------------------------- K-weighting (BS.1770) */

interface Biquad { b0: number; b1: number; b2: number; a1: number; a2: number }

/** High-shelf pre-filter (+~4 dB above ~1.68 kHz), coefficients derived for
    an arbitrary sample rate (De Man, "Evaluation of implementations of the
    ITU-R BS.1770 loudness algorithm"). */
function preShelf(fs: number): Biquad {
  const db = 3.999843853973347
  const f0 = 1681.974450955533
  const Q = 0.7071752369554196
  const K = Math.tan(Math.PI * f0 / fs)
  const Vh = Math.pow(10, db / 20)
  const Vb = Math.pow(Vh, 0.4996667741545416)
  const a0 = 1 + K / Q + K * K
  return {
    b0: (Vh + Vb * K / Q + K * K) / a0,
    b1: 2 * (K * K - Vh) / a0,
    b2: (Vh - Vb * K / Q + K * K) / a0,
    a1: 2 * (K * K - 1) / a0,
    a2: (1 - K / Q + K * K) / a0,
  }
}

/** RLB high-pass (~38 Hz). */
function rlbHighpass(fs: number): Biquad {
  const f0 = 38.13547087602444
  const Q = 0.5003270373238773
  const K = Math.tan(Math.PI * f0 / fs)
  const a0 = 1 + K / Q + K * K
  return {
    b0: 1 / a0,
    b1: -2 / a0,
    b2: 1 / a0,
    a1: 2 * (K * K - 1) / a0,
    a2: (1 - K / Q + K * K) / a0,
  }
}

function runBiquad(x: Float32Array, c: Biquad): Float32Array {
  const y = new Float32Array(x.length)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < x.length; i++) {
    const v = c.b0 * x[i] + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v
    y[i] = v
  }
  return y
}

/** Integrated loudness (LUFS) per BS.1770-4 with the standard two-stage
    gating. Returns −Infinity for silence. */
export function measureLufs(buf: AudioBuffer): number {
  const fs = buf.sampleRate
  const shelf = preShelf(fs)
  const hp = rlbHighpass(fs)
  const chans: Float32Array[] = []
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    chans.push(runBiquad(runBiquad(buf.getChannelData(ch), shelf), hp))
  }
  const block = Math.round(0.4 * fs)
  const hop = Math.round(0.1 * fs) // 75 % overlap
  if (buf.length < block) return -Infinity
  const blocks: number[] = [] // mean-square per block, channel-summed
  for (let start = 0; start + block <= buf.length; start += hop) {
    let sum = 0
    for (const data of chans) {
      let s = 0
      for (let i = start; i < start + block; i++) s += data[i] * data[i]
      sum += s / block // channel weights are 1 for L/R
    }
    blocks.push(sum)
  }
  const loud = (ms: number) => -0.691 + 10 * Math.log10(Math.max(ms, 1e-12))
  // stage 1: absolute gate −70 LUFS
  const abs = blocks.filter((ms) => loud(ms) > -70)
  if (!abs.length) return -Infinity
  const mean1 = abs.reduce((a, b) => a + b, 0) / abs.length
  // stage 2: relative gate −10 LU under the stage-1 loudness
  const rel = loud(mean1) - 10
  const gated = abs.filter((ms) => loud(ms) > rel)
  if (!gated.length) return loud(mean1)
  return loud(gated.reduce((a, b) => a + b, 0) / gated.length)
}

/* -------------------------------------------------------------- true peak */

const TP_TAPS = 24
const TP_HALF = TP_TAPS / 2

/** The 3 fractional phases (1/4, 2/4, 3/4) of a 24-tap Hann-windowed sinc
    interpolator. Phase 0 is the sample itself. Built once. */
const TP_PHASES: Float32Array[] = (() => {
  const out: Float32Array[] = []
  for (let p = 1; p < 4; p++) {
    const frac = p / 4
    const h = new Float32Array(TP_TAPS)
    for (let i = 0; i < TP_TAPS; i++) {
      const t = i - (TP_HALF - 1) - frac
      const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t)
      const win = 0.5 * (1 + Math.cos((Math.PI * (i - (TP_HALF - 0.5))) / TP_HALF))
      h[i] = sinc * win
    }
    out.push(h)
  }
  return out
})()

/** Largest L1 norm across the phases. An interpolated sample is a weighted sum
    of TP_TAPS neighbours, so |interpolated| ≤ L1 × (largest neighbour). That
    bound is what makes the screening below exact rather than a heuristic. */
const TP_L1 = Math.max(...TP_PHASES.map((h) => h.reduce((a, v) => a + Math.abs(v), 0)))

/** Block maxima of |x| over non-overlapping TP_TAPS-sample blocks. Two adjacent
    blocks always cover any single interpolation window, so screening on
    max(block[b], block[b+1]) can never skip a window that mattered. */
function blockMaxima(x: Float32Array): Float32Array {
  const blocks = Math.ceil(x.length / TP_TAPS)
  const m = new Float32Array(blocks)
  for (let b = 0; b < blocks; b++) {
    const s = b * TP_TAPS
    const e = Math.min(x.length, s + TP_TAPS)
    let mx = 0
    for (let i = s; i < e; i++) { const a = Math.abs(x[i]); if (a > mx) mx = a }
    m[b] = mx
  }
  return m
}

/** Interpolated magnitude at position `i`, phase `h`. */
function interpAt(x: Float32Array, i: number, h: Float32Array): number {
  let acc = 0
  const base = i - (TP_HALF - 1)
  for (let k = 0; k < TP_TAPS; k++) {
    const idx = base + k
    if (idx >= 0 && idx < x.length) acc += x[idx] * h[k]
  }
  return Math.abs(acc)
}

/** 4× oversampled peak estimate (dBTP), BS.1770 Annex 2 approximation.
    Only windows that could possibly beat the running peak are interpolated —
    the L1 bound above makes that exact, and it turns a 24-minute session from
    ~9 billion multiply-adds into a few million. */
export function measureTruePeakDb(buf: AudioBuffer): number {
  let peak = 0
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const x = buf.getChannelData(ch)
    for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > peak) peak = a }
  }
  if (peak <= 0) return -Infinity
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const x = buf.getChannelData(ch)
    const bm = blockMaxima(x)
    for (let b = 0; b < bm.length; b++) {
      // can anything in this window reach the current peak at all?
      const local = Math.max(bm[b], b + 1 < bm.length ? bm[b + 1] : 0)
      if (local * TP_L1 <= peak) continue
      const s = b * TP_TAPS
      const e = Math.min(x.length, s + TP_TAPS)
      for (let i = s; i < e; i++) {
        for (const h of TP_PHASES) {
          const a = interpAt(x, i, h)
          if (a > peak) peak = a
        }
      }
    }
  }
  return 20 * Math.log10(peak)
}

/** Per-sample TRUE-peak envelope (max across channels and interpolation
    phases), so the limiter can act on inter-sample peaks instead of only the
    sample peaks it can see. Windows provably under `floorLinear` are left at
    their sample magnitude — they are never the ones being limited. */
function truePeakEnvelope(buf: AudioBuffer, floorLinear: number): Float32Array {
  const n = buf.length
  const env = new Float32Array(n)
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const x = buf.getChannelData(ch)
    for (let i = 0; i < n; i++) { const a = Math.abs(x[i]); if (a > env[i]) env[i] = a }
  }
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const x = buf.getChannelData(ch)
    const bm = blockMaxima(x)
    for (let b = 0; b < bm.length; b++) {
      const local = Math.max(bm[b], b + 1 < bm.length ? bm[b + 1] : 0)
      if (local * TP_L1 <= floorLinear) continue
      const s = b * TP_TAPS
      const e = Math.min(n, s + TP_TAPS)
      for (let i = s; i < e; i++) {
        for (const h of TP_PHASES) {
          const a = interpAt(x, i, h)
          if (a > env[i]) env[i] = a
        }
      }
    }
  }
  return env
}

/* ---------------------------------------------------------------- limiter */

/** Look-ahead peak limiter: gain-reduction envelope from the true peak, 5 ms
    lookahead attack, 200 ms release. Applied in place. `peakEnv` is the
    per-sample true-peak envelope; without it the sample peaks are used (which
    leaves inter-sample overshoot behind). */
function limitBuffer(buf: AudioBuffer, ceilingLinear: number, peakEnv?: Float32Array): number {
  const fs = buf.sampleRate
  const look = Math.round(0.005 * fs)
  const relCoef = Math.exp(-1 / (0.2 * fs))
  const n = buf.length
  const peak = peakEnv ?? (() => {
    const p = new Float32Array(n)
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const x = buf.getChannelData(ch)
      for (let i = 0; i < n; i++) { const a = Math.abs(x[i]); if (a > p[i]) p[i] = a }
    }
    return p
  })()
  // needed gain per sample, spread backwards over the lookahead (attack)
  const need = new Float32Array(n).fill(1)
  for (let i = 0; i < n; i++) {
    if (peak[i] > ceilingLinear) {
      const g = ceilingLinear / peak[i]
      const from = Math.max(0, i - look)
      for (let j = from; j <= i; j++) if (g < need[j]) need[j] = g
    }
  }
  // smoothed release
  let gr = 1
  let maxReduction = 1
  const env = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    gr = need[i] < gr ? need[i] : need[i] + (gr - need[i]) * relCoef
    env[i] = gr
    if (gr < maxReduction) maxReduction = gr
  }
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const x = buf.getChannelData(ch)
    for (let i = 0; i < n; i++) x[i] *= env[i]
  }
  return maxReduction
}

/* -------------------------------------------------------------- masterize */

export interface MasterizeResult {
  preLufs: number
  gainDb: number
  postLufs: number
  truePeakDb: number
  /** Deepest limiter gain reduction, in dB (0 = untouched). */
  limiterDb: number
}

export const SESSION_TARGET_LUFS = -16
export const SESSION_CEILING_DBTP = -1

/** Normalize a rendered session to the target integrated loudness and cap
    true peaks at the ceiling. Mutates `buf` in place; returns the report.

    ORDERING MATTERS, and it used to be wrong. The old pass normalized to the
    target, limited against the SAMPLE peaks, then — because inter-sample peaks
    were still over — turned the whole session down by up to 3 dB to satisfy the
    ceiling. The ceiling therefore decided the loudness: the GL-ANX 1.1 mix,
    whose voice the POs deliberately set at −6 LUFS, landed at −18.5 LUFS,
    2.5 LU under its own target, with the peaks paid for by everybody.

    Now the limiter is given the TRUE-peak envelope, so it reduces gain only
    where a peak actually is, and the loudness lost to that is added back and
    re-limited. The output converges on both numbers instead of trading one
    away, and a peaky mix keeps its level. */
export function masterizeBuffer(
  buf: AudioBuffer,
  targetLufs: number = SESSION_TARGET_LUFS,
  ceilingDbTp: number = SESSION_CEILING_DBTP,
): MasterizeResult {
  const preLufs = measureLufs(buf)
  let gainDb = 0

  const applyGain = (db: number): void => {
    if (!Number.isFinite(db) || Math.abs(db) < 0.005) return
    const g = Math.pow(10, db / 20)
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const x = buf.getChannelData(ch)
      for (let i = 0; i < x.length; i++) x[i] *= g
    }
  }

  if (Number.isFinite(preLufs)) {
    gainDb = Math.max(-24, Math.min(24, targetLufs - preLufs))
    applyGain(gainDb)
  }

  const ceilingLinear = Math.pow(10, ceilingDbTp / 20)
  let deepest = 1

  /** One limiting pass driven by the true-peak envelope, then verify. Returns
      the measured true peak; repeats with a tighter internal ceiling if the
      interpolator still finds an overshoot (rare, and always small). */
  const limitToCeiling = (): number => {
    let ceil = ceilingLinear
    let tp = -Infinity
    for (let pass = 0; pass < 3; pass++) {
      // screen at a little under the ceiling: anything provably quieter than
      // that can never be the sample being limited
      const env = truePeakEnvelope(buf, ceil * 0.7)
      const red = limitBuffer(buf, ceil, env)
      if (red < deepest) deepest = red
      tp = measureTruePeakDb(buf)
      if (tp <= ceilingDbTp + 0.02) break
      ceil *= Math.pow(10, (ceilingDbTp - tp) / 20)
    }
    return tp
  }

  let truePeakDb = limitToCeiling()

  /* Limiting costs loudness. Give back what the ceiling allows and re-limit,
     so the result lands on the target rather than wherever the peaks left it.
     Bounded: each round can only ask for what is still missing, and heavy
     limiting makes loudness saturate, so this converges in two or three. */
  for (let round = 0; round < 3; round++) {
    const now = measureLufs(buf)
    if (!Number.isFinite(now)) break
    const missing = targetLufs - now
    if (missing <= 0.1) break
    const makeup = Math.min(3, missing)
    applyGain(makeup)
    gainDb += makeup
    truePeakDb = limitToCeiling()
  }

  return {
    preLufs,
    gainDb,
    postLufs: measureLufs(buf),
    truePeakDb,
    limiterDb: deepest >= 1 ? 0 : 20 * Math.log10(deepest),
  }
}
