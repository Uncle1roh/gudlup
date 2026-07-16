/* ============================================================================
   Good Loop — pitch-preserving time stretch (WSOLA)
   Changes the SPEED of speech without changing its PITCH — unlike
   playbackRate, which shifts both like slowing a tape.

   Waveform-Similarity Overlap-Add: the signal is rebuilt from ~40 ms Hann-
   windowed frames laid down at a fixed output hop (50% overlap, so the window
   sum is exactly 1 and amplitude is preserved). Each frame is taken from the
   input near its time-scaled position, but the exact grab point is chosen by
   cross-correlating candidates against the natural continuation of the
   previous frame — so consecutive frames stay waveform-aligned and the voice
   stays phase-coherent instead of doubling or fluttering.

   Tuned for speech at the studio's 0.7×–1.4× range. Stereo channels use the
   SAME alignment offsets (computed on the mono mix) so the image never drifts.
   ============================================================================ */

const FRAME = 1764 // 40 ms @ 44.1 kHz
const HOP = FRAME >> 1 // 50% overlap → periodic-Hann sum ≡ 1
const OVERLAP = 600 // correlation window (~13.6 ms)
const TOLERANCE = 441 // alignment search radius (±10 ms)

/** Periodic Hann (w[n] + w[n+HOP] = 1 at 50% overlap). */
function hann(n: number): Float32Array {
  const w = new Float32Array(n)
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / n))
  return w
}

function correlate(mono: Float32Array, a: number, b: number, len: number): number {
  let s = 0
  for (let i = 0; i < len; i++) s += mono[a + i] * mono[b + i]
  return s
}

/** Coarse-then-fine search for the best-aligned grab point around `ideal`. */
function bestOffset(mono: Float32Array, ideal: number, target: number, inLen: number): number {
  const lo = Math.max(0, ideal - TOLERANCE)
  const hi = Math.min(inLen - FRAME - 1, ideal + TOLERANCE)
  if (hi <= lo || target + OVERLAP >= inLen) return Math.max(0, Math.min(inLen - FRAME - 1, ideal))
  let best = lo
  let bestScore = -Infinity
  for (let p = lo; p <= hi; p += 4) {
    const s = correlate(mono, p, target, OVERLAP)
    if (s > bestScore) { bestScore = s; best = p }
  }
  for (let p = Math.max(lo, best - 3); p <= Math.min(hi, best + 3); p++) {
    const s = correlate(mono, p, target, OVERLAP)
    if (s > bestScore) { bestScore = s; best = p }
  }
  return best
}

/** Stretch `buffer` by `rate` with pitch preserved.
    rate 1.2 → 20% faster (shorter) · rate 0.8 → 20% slower (longer).
    Falls back to the original for negligible rates or too-short input. */
export function timeStretch(buffer: AudioBuffer, rate: number): AudioBuffer {
  const r = Math.max(0.5, Math.min(2, rate || 1))
  const inLen = buffer.length
  if (Math.abs(r - 1) < 0.005 || inLen < FRAME * 3) return buffer

  const channels = Math.min(2, buffer.numberOfChannels)
  const chans: Float32Array[] = []
  for (let c = 0; c < channels; c++) chans.push(buffer.getChannelData(c))
  // alignment is computed once, on the mono mix, and applied to all channels
  const mono = channels === 1 ? chans[0] : (() => {
    const m = new Float32Array(inLen)
    for (let i = 0; i < inLen; i++) m[i] = (chans[0][i] + chans[1][i]) * 0.5
    return m
  })()

  const outLen = Math.max(FRAME, Math.floor(inLen / r))
  const pad = outLen + FRAME
  const outs = chans.map(() => new Float32Array(pad))
  const w = hann(FRAME)

  let prevIn = 0
  for (let outPos = 0; outPos < outLen; outPos += HOP) {
    const ideal = Math.round(outPos * r)
    const start = outPos === 0
      ? Math.max(0, Math.min(inLen - FRAME - 1, ideal))
      : bestOffset(mono, ideal, prevIn + HOP, inLen)
    for (let c = 0; c < channels; c++) {
      const src = chans[c]
      const dst = outs[c]
      for (let i = 0; i < FRAME; i++) dst[outPos + i] += w[i] * src[start + i]
    }
    prevIn = start
  }

  const out = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: outLen, sampleRate: buffer.sampleRate })
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    out.copyToChannel(outs[Math.min(c, channels - 1)].subarray(0, outLen), c)
  }
  return out
}
