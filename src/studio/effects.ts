/* ============================================================================
   Good Loop — Studio track effects
   The PO effect list made real, as a per-track chain:

     · HARMONIZER (the "Coral/Multiple voice") — layers pitch-shifted copies
       of the audio around the original so one voice reads as a small chorus.
       Pitch shifting reuses the WSOLA time-stretch: resample by the shift
       ratio (pitch × f, duration ÷ f), then stretch back to the original
       length (duration ×, pitch preserved) — net effect: pitch shifted,
       length identical. Applied OFFLINE per clip (cached), because real-time
       granular pitch shift isn't worth its artifacts here.
     · EMOTIONAL ECHO — the activatable echo: delay + feedback with a warm
       low-pass on the repeats.
     · REVERB — convolution with a generated exponential-decay impulse.
     · SATURATION — soft tanh waveshaping ("warmth" at low drive, audible
       distortion at high drive).
     · FILTER — low-pass / high-pass tone shaping.

   Echo/reverb/saturation/filter are plain WebAudio nodes, so ONE builder
   (`buildEffectsChain`) serves both the realtime transport and the offline
   mixdown — what is heard while editing is what exports.

   Chain order per track: [harmonized clips] → saturation → filter → echo →
   reverb → track gain → track pan → master.
   ============================================================================ */

import { SAMPLE_RATE } from './multitrack'
import { timeStretch } from './timestretch'

export type EffectKind = 'harmonizer' | 'echo' | 'reverb' | 'saturation' | 'filter'

export interface TrackEffect {
  kind: EffectKind
  enabled: boolean
  params: Record<string, number>
}

/* ---------------------------------------------------- param metadata (UI) */

export interface EffectParamMeta {
  key: string
  label: string
  min: number
  max: number
  step: number
  fmt: (v: number) => string
}

export interface EffectMeta {
  kind: EffectKind
  label: string
  icon: string
  blurb: string
  params: EffectParamMeta[]
}

const pct = (v: number) => `${Math.round(v * 100)}%`

export const EFFECTS_META: EffectMeta[] = [
  {
    kind: 'harmonizer', label: 'Harmonizer (Coral)', icon: '👥',
    blurb: 'Layers detuned copies — one voice becomes a small chorus. Processed per clip (a moment of "processing…" after changes).',
    params: [
      { key: 'voices', label: 'Voices', min: 2, max: 5, step: 1, fmt: (v) => `${v}` },
      { key: 'spreadCents', label: 'Spread', min: 8, max: 50, step: 1, fmt: (v) => `±${v}¢` },
      { key: 'octave', label: 'Octave layer', min: 0, max: 1, step: 1, fmt: (v) => (v ? 'on' : 'off') },
      { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.05, fmt: pct },
    ],
  },
  {
    kind: 'echo', label: 'Emotional Echo', icon: '🔁',
    blurb: 'The activatable echo — warm repeats trailing the voice.',
    params: [
      { key: 'delaySec', label: 'Delay', min: 0.15, max: 2, step: 0.05, fmt: (v) => `${v.toFixed(2)} s` },
      { key: 'feedback', label: 'Repeats', min: 0, max: 0.7, step: 0.05, fmt: pct },
      { key: 'tone', label: 'Warmth', min: 800, max: 6000, step: 100, fmt: (v) => `${Math.round(v)} Hz` },
      { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.05, fmt: pct },
    ],
  },
  {
    kind: 'reverb', label: 'Reverb', icon: '🏛️',
    blurb: 'Space around the sound — from a room to a cathedral.',
    params: [
      { key: 'decaySec', label: 'Decay', min: 0.8, max: 8, step: 0.1, fmt: (v) => `${v.toFixed(1)} s` },
      { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.05, fmt: pct },
    ],
  },
  {
    kind: 'saturation', label: 'Saturation', icon: '🔥',
    blurb: 'Soft warmth at low drive, audible distortion at high drive.',
    params: [
      { key: 'drive', label: 'Drive', min: 1, max: 12, step: 0.5, fmt: (v) => `×${v.toFixed(1)}` },
      { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.05, fmt: pct },
    ],
  },
  {
    kind: 'filter', label: 'Filter', icon: '🎚️',
    blurb: 'Tone shaping — darken (low-pass) or thin out (high-pass).',
    params: [
      { key: 'mode', label: 'Mode', min: 0, max: 1, step: 1, fmt: (v) => (v ? 'high-pass' : 'low-pass') },
      { key: 'cutoff', label: 'Cutoff', min: 80, max: 12000, step: 20, fmt: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${Math.round(v)} Hz`) },
    ],
  },
]

export function defaultEffect(kind: EffectKind): TrackEffect {
  switch (kind) {
    case 'harmonizer': return { kind, enabled: false, params: { voices: 3, spreadCents: 22, octave: 0, mix: 0.5 } }
    case 'echo': return { kind, enabled: false, params: { delaySec: 0.6, feedback: 0.35, tone: 2500, mix: 0.3 } }
    case 'reverb': return { kind, enabled: false, params: { decaySec: 2.6, mix: 0.25 } }
    case 'saturation': return { kind, enabled: false, params: { drive: 3, mix: 0.5 } }
    case 'filter': return { kind, enabled: false, params: { mode: 0, cutoff: 8000 } }
  }
}

export function defaultEffects(): TrackEffect[] {
  return EFFECTS_META.map((m) => defaultEffect(m.kind))
}

/** Stable key for cache/signature purposes. */
export function effectsKey(effects: TrackEffect[] | undefined): string {
  if (!effects) return ''
  return effects.filter((e) => e.enabled).map((e) => `${e.kind}:${Object.entries(e.params).map(([k, v]) => `${k}=${v}`).join(',')}`).join('|')
}

/* -------------------------------------------------- bus chain (RT + offline) */

const irCache = new Map<string, AudioBuffer>()

/** Generated stereo impulse response: exponential-decay noise, 20 ms pre-delay. */
function impulseResponse(ctx: BaseAudioContext, decaySec: number): AudioBuffer {
  const key = `${Math.round(decaySec * 10)}@${ctx.sampleRate}`
  let ir = irCache.get(key)
  if (ir) return ir
  const len = Math.ceil(ctx.sampleRate * (decaySec + 0.05))
  const pre = Math.floor(ctx.sampleRate * 0.02)
  ir = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate: ctx.sampleRate })
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch)
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / ctx.sampleRate
      d[i] = (Math.random() * 2 - 1) * Math.exp((-3 * t) / decaySec)
    }
  }
  irCache.set(key, ir)
  return ir
}

function saturationCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 1024
  const c = new Float32Array(new ArrayBuffer(n * 4))
  const norm = Math.tanh(drive)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    c[i] = Math.tanh(drive * x) / norm
  }
  return c
}

/** Wire one dry/wet stage: src → [wet path] + [dry] → out. */
function dryWet(ctx: BaseAudioContext, wetTail: AudioNode, wetHead: AudioNode, mix: number): { input: AudioNode; output: AudioNode } {
  const input = ctx.createGain()
  const output = ctx.createGain()
  const dry = ctx.createGain()
  const wet = ctx.createGain()
  dry.gain.value = 1 - mix * 0.6 // keep the source present even at full mix
  wet.gain.value = mix
  input.connect(dry).connect(output)
  input.connect(wetHead)
  wetTail.connect(wet).connect(output)
  return { input, output }
}

/** Build the enabled bus effects (everything except the harmonizer, which is
    clip-level) as a chain usable in BOTH the realtime player and the offline
    mixdown. Returns input==output when nothing is enabled. */
export function buildEffectsChain(ctx: BaseAudioContext, effects: TrackEffect[] | undefined): { input: AudioNode; output: AudioNode } {
  const g = ctx.createGain()
  let head: AudioNode = g
  let tail: AudioNode = g
  const on = (effects ?? []).filter((e) => e.enabled && e.kind !== 'harmonizer')
  // fixed musical order: saturation → filter → echo → reverb
  const order: EffectKind[] = ['saturation', 'filter', 'echo', 'reverb']
  for (const kind of order) {
    const fx = on.find((e) => e.kind === kind)
    if (!fx) continue
    if (kind === 'saturation') {
      const shaper = ctx.createWaveShaper()
      shaper.curve = saturationCurve(fx.params.drive ?? 3)
      shaper.oversample = '2x'
      const st = dryWet(ctx, shaper, shaper, fx.params.mix ?? 0.5)
      tail.connect(st.input); tail = st.output
    } else if (kind === 'filter') {
      const biq = ctx.createBiquadFilter()
      biq.type = (fx.params.mode ?? 0) >= 0.5 ? 'highpass' : 'lowpass'
      biq.frequency.value = fx.params.cutoff ?? 8000
      biq.Q.value = 0.7
      tail.connect(biq); tail = biq
    } else if (kind === 'echo') {
      const delay = ctx.createDelay(2.5)
      delay.delayTime.value = fx.params.delaySec ?? 0.6
      const fb = ctx.createGain()
      fb.gain.value = fx.params.feedback ?? 0.35
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = fx.params.tone ?? 2500
      delay.connect(lp).connect(fb).connect(delay) // warm feedback loop
      const st = dryWet(ctx, lp, delay, fx.params.mix ?? 0.3)
      tail.connect(st.input); tail = st.output
    } else if (kind === 'reverb') {
      const conv = ctx.createConvolver()
      conv.buffer = impulseResponse(ctx, fx.params.decaySec ?? 2.6)
      const st = dryWet(ctx, conv, conv, fx.params.mix ?? 0.25)
      tail.connect(st.input); tail = st.output
    }
  }
  return { input: head, output: tail }
}

/* -------------------------------------------------- harmonizer (clip-level) */

/** Pitch shift with duration preserved: resample by f (pitch×f, dur÷f), then
    WSOLA-stretch back (dur×f → original, pitch untouched). */
async function pitchShiftBuffer(buf: AudioBuffer, semitones: number): Promise<AudioBuffer> {
  const f = Math.pow(2, semitones / 12)
  if (Math.abs(f - 1) < 0.0005) return buf
  const outLen = Math.max(64, Math.ceil(buf.length / f))
  const ctx = new OfflineAudioContext(2, outLen, SAMPLE_RATE)
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.playbackRate.value = f
  src.connect(ctx.destination)
  src.start(0)
  const resampled = await ctx.startRendering()
  return timeStretch(resampled, 1 / f)
}

const harmonizerCache = new WeakMap<AudioBuffer, Map<string, Promise<AudioBuffer>>>()

/** One voice in → a small chorus out (same length). Cached per source+params. */
export function harmonizeBuffer(source: AudioBuffer, params: Record<string, number>): Promise<AudioBuffer> {
  const key = `v${params.voices ?? 3}s${params.spreadCents ?? 22}o${params.octave ?? 0}m${params.mix ?? 0.5}`
  let byKey = harmonizerCache.get(source)
  if (!byKey) { byKey = new Map(); harmonizerCache.set(source, byKey) }
  let p = byKey.get(key)
  if (!p) {
    p = (async () => {
      const voices = Math.max(2, Math.min(5, Math.round(params.voices ?? 3)))
      const spread = (params.spreadCents ?? 22) / 100 // cents → semitones
      const mix = Math.max(0, Math.min(1, params.mix ?? 0.5))
      const copies: { buf: AudioBuffer; gain: number; pan: number; delayMs: number }[] = []
      for (let i = 0; i < voices; i++) {
        const t = voices === 1 ? 0 : i / (voices - 1) // 0..1
        const cents = -spread + t * 2 * spread
        copies.push({
          buf: await pitchShiftBuffer(source, cents),
          gain: mix / voices,
          pan: (t - 0.5) * 0.7, // spread the chorus across the image
          delayMs: 8 + i * 7,
        })
      }
      if ((params.octave ?? 0) >= 0.5) {
        copies.push({ buf: await pitchShiftBuffer(source, -12), gain: mix * 0.35, pan: 0, delayMs: 12 })
      }
      const len = source.length + Math.ceil(0.06 * SAMPLE_RATE)
      const ctx = new OfflineAudioContext(2, len, SAMPLE_RATE)
      const master = ctx.createGain()
      master.connect(ctx.destination)
      const dry = ctx.createBufferSource()
      dry.buffer = source
      const dg = ctx.createGain()
      dg.gain.value = 1 - mix * 0.35 // the original stays in front
      dry.connect(dg).connect(master)
      dry.start(0)
      for (const c of copies) {
        const src = ctx.createBufferSource()
        src.buffer = c.buf
        const g = ctx.createGain()
        g.gain.value = c.gain
        const pan = ctx.createStereoPanner()
        pan.pan.value = c.pan
        src.connect(g).connect(pan).connect(master)
        src.start(c.delayMs / 1000)
      }
      return ctx.startRendering()
    })()
    p.catch(() => byKey!.delete(key))
    byKey.set(key, p)
  }
  return p
}
