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

/** 4× oversampled peak estimate (dBTP) via a 24-tap Hann-windowed sinc
    interpolator per phase (BS.1770 Annex 2 approximation). */
export function measureTruePeakDb(buf: AudioBuffer): number {
  const TAPS = 24
  const HALF = TAPS / 2
  // 3 fractional phases (1/4, 2/4, 3/4) — phase 0 is the sample itself
  const phases: Float32Array[] = []
  for (let p = 1; p < 4; p++) {
    const frac = p / 4
    const h = new Float32Array(TAPS)
    for (let i = 0; i < TAPS; i++) {
      const t = i - (HALF - 1) - frac
      const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t)
      const win = 0.5 * (1 + Math.cos((Math.PI * (i - (HALF - 0.5))) / HALF))
      h[i] = sinc * win
    }
    phases.push(h)
  }
  let peak = 0
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const x = buf.getChannelData(ch)
    for (let i = 0; i < x.length; i++) {
      const a = Math.abs(x[i])
      if (a > peak) peak = a
    }
    // oversampled phases (strided for speed on long sessions: every sample
    // near local maxima matters, but a full pass is still fast enough)
    for (const h of phases) {
      for (let i = 0; i < x.length; i++) {
        let acc = 0
        for (let k = 0; k < TAPS; k++) {
          const idx = i + k - (HALF - 1)
          if (idx >= 0 && idx < x.length) acc += x[idx] * h[k]
        }
        const a = Math.abs(acc)
        if (a > peak) peak = a
      }
    }
  }
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity
}

/* ---------------------------------------------------------------- limiter */

/** Look-ahead peak limiter: gain-reduction envelope from the (approximate)
    true peak, 5 ms lookahead attack, 200 ms release. Applied in place. */
function limitBuffer(buf: AudioBuffer, ceilingLinear: number): number {
  const fs = buf.sampleRate
  const look = Math.round(0.005 * fs)
  const relCoef = Math.exp(-1 / (0.2 * fs))
  const n = buf.length
  // per-sample max across channels, with a small safety for inter-sample
  // peaks (the final measure/verify step catches the residue)
  const peak = new Float32Array(n)
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const x = buf.getChannelData(ch)
    for (let i = 0; i < n; i++) {
      const a = Math.abs(x[i])
      if (a > peak[i]) peak[i] = a
    }
  }
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
    true peaks at the ceiling. Mutates `buf` in place; returns the report. */
export function masterizeBuffer(
  buf: AudioBuffer,
  targetLufs: number = SESSION_TARGET_LUFS,
  ceilingDbTp: number = SESSION_CEILING_DBTP,
): MasterizeResult {
  const preLufs = measureLufs(buf)
  let gainDb = 0
  if (Number.isFinite(preLufs)) {
    gainDb = Math.max(-24, Math.min(24, targetLufs - preLufs))
    const g = Math.pow(10, gainDb / 20)
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const x = buf.getChannelData(ch)
      for (let i = 0; i < x.length; i++) x[i] *= g
    }
  }
  // limit against the ceiling with a small margin for inter-sample overshoot
  const ceilingLinear = Math.pow(10, ceilingDbTp / 20) * 0.985
  const maxRed = limitBuffer(buf, ceilingLinear)
  // verification: pathological transients (hard steps) can still overshoot
  // between samples after limiting — measure the REAL true peak and trim the
  // residue globally (fractions of a dB; inaudible, deterministic ceiling)
  let tp = measureTruePeakDb(buf)
  let trimDb = 0
  if (tp > ceilingDbTp) {
    trimDb = Math.max(-3, ceilingDbTp - tp)
    const tg = Math.pow(10, trimDb / 20)
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const x = buf.getChannelData(ch)
      for (let i = 0; i < x.length; i++) x[i] *= tg
    }
    tp = measureTruePeakDb(buf)
  }
  const postLufs = measureLufs(buf)
  return {
    preLufs,
    gainDb,
    postLufs,
    truePeakDb: tp,
    limiterDb: (maxRed >= 1 ? 0 : 20 * Math.log10(maxRed)) + trimDb,
  }
}
