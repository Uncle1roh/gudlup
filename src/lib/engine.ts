/* ============================================================================
   Good Loop — Sound Engine (v1)
   A session is composed from independent, parameterized layers. The same graph
   builder runs on a realtime AudioContext (live preview) and on an
   OfflineAudioContext (render to a .wav file). This is the foundation the full
   9-pattern / 8-layer engine grows from.

   Layers in v1:
     - Binaural carrier  : two tones, one per ear, offset to create a beat.
     - Soundscape        : an ambient bed (Calm Lake / Warm Air / Deep).
     - Breathing pace    : a soft tone that swells at a set breaths-per-minute.
     - Affirmation       : a placeholder pulsed tone you can place between the
                           ears (dichotic). Real guided voice (TTS) is the next
                           audio module — this layer reserves its place in the mix.
   ============================================================================ */

import { audioBufferToWav } from './wav'

export type Texture = 'lake' | 'air' | 'deep'

export interface LayerState { enabled: boolean; gain: number } // gain 0..1
export interface BinauralState extends LayerState { carrierHz: number; beatHz: number }
export interface SoundscapeState extends LayerState { texture: Texture; warmth: number } // warmth = lowpass cutoff (Hz)
export interface BreathState extends LayerState { breathsPerMin: number; toneHz: number }
export interface AffirmationState extends LayerState { pan: number; pulseHz: number; toneHz: number }

export interface SessionConfig {
  name: string
  lengthSeconds: number
  masterGain: number // 0..1
  binaural: BinauralState
  soundscape: SoundscapeState
  breath: BreathState
  affirmation: AffirmationState
}

export const DEFAULT_CONFIG: SessionConfig = {
  name: 'Untitled session',
  lengthSeconds: 120,
  masterGain: 0.8,
  binaural: { enabled: true, gain: 0.24, carrierHz: 200, beatHz: 7 },
  soundscape: { enabled: true, gain: 0.5, texture: 'lake', warmth: 700 },
  breath: { enabled: true, gain: 0.3, breathsPerMin: 6, toneHz: 320 },
  affirmation: { enabled: false, gain: 0.35, pan: 0, pulseHz: 0.25, toneHz: 440 },
}

/** A starting point seeded from the one fully-specified protocol. */
export const ANX_1_1_PRESET: SessionConfig = {
  name: 'GL-ANX 1.1 — Calm and Inner Safety',
  lengthSeconds: 120,
  masterGain: 0.8,
  binaural: { enabled: true, gain: 0.22, carrierHz: 180, beatHz: 6 }, // ~theta, settling
  soundscape: { enabled: true, gain: 0.55, texture: 'lake', warmth: 640 },
  breath: { enabled: true, gain: 0.32, breathsPerMin: 5.5, toneHz: 300 }, // coherent breathing
  affirmation: { enabled: true, gain: 0.18, pan: -0.5, pulseHz: 0.2, toneHz: 420 },
}

/* -------------------------------------------------------------------------- */

interface GraphHandles {
  master: GainNode
  oscL?: OscillatorNode
  oscR?: OscillatorNode
  binauralGain?: GainNode
  soundscapeGain?: GainNode
  soundscapeFilter?: BiquadFilterNode
  breathGain?: GainNode
  breathLfo?: OscillatorNode
  breathDepth?: GainNode
  affirmGain?: GainNode
  affirmPanner?: StereoPannerNode
  affirmLfo?: OscillatorNode
  affirmDepth?: GainNode
  sources: AudioScheduledSourceNode[]
}

function makeNoiseBuffer(ctx: BaseAudioContext, seconds = 2): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  return buf
}

function buildTexture(
  ctx: BaseAudioContext,
  texture: Texture,
  dest: AudioNode,
  sources: AudioScheduledSourceNode[],
  now: number,
): void {
  if (texture === 'deep') {
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = 70
    o.connect(dest)
    o.start(now)
    sources.push(o)
    const o2 = ctx.createOscillator()
    o2.type = 'sine'
    o2.frequency.value = 110
    o2.detune.value = -6
    const g2 = ctx.createGain()
    g2.gain.value = 0.5
    o2.connect(g2).connect(dest)
    o2.start(now)
    sources.push(o2)
  } else if (texture === 'air') {
    const noise = ctx.createBufferSource()
    noise.buffer = makeNoiseBuffer(ctx)
    noise.loop = true
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 600
    bp.Q.value = 0.4
    const g = ctx.createGain()
    g.gain.value = 0.5
    noise.connect(bp).connect(g).connect(dest)
    noise.start(now)
    sources.push(noise)
  } else {
    // lake: warm detuned partials + faint shimmer
    const partials = [
      { f: 196, g: 0.5 },
      { f: 294, g: 0.32 },
      { f: 392, g: 0.18 },
    ]
    partials.forEach((p, i) => {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = p.f
      o.detune.value = (i - 1) * 4
      const g = ctx.createGain()
      g.gain.value = p.g
      o.connect(g).connect(dest)
      o.start(now)
      sources.push(o)
    })
    const noise = ctx.createBufferSource()
    noise.buffer = makeNoiseBuffer(ctx)
    noise.loop = true
    const nf = ctx.createBiquadFilter()
    nf.type = 'lowpass'
    nf.frequency.value = 1200
    const ng = ctx.createGain()
    ng.gain.value = 0.04
    noise.connect(nf).connect(ng).connect(dest)
    noise.start(now)
    sources.push(noise)
  }
}

function buildGraph(ctx: BaseAudioContext, cfg: SessionConfig): GraphHandles {
  const now = ctx.currentTime
  const sources: AudioScheduledSourceNode[] = []

  const master = ctx.createGain()
  master.gain.setValueAtTime(0, now)
  master.gain.linearRampToValueAtTime(cfg.masterGain, now + 0.4) // fade-in, no click
  master.connect(ctx.destination)

  const h: GraphHandles = { master, sources }

  // --- Binaural carrier ---
  {
    const g = ctx.createGain()
    g.gain.value = cfg.binaural.enabled ? cfg.binaural.gain : 0
    g.connect(master)
    const half = cfg.binaural.beatHz / 2
    const oscL = ctx.createOscillator()
    oscL.type = 'sine'
    oscL.frequency.value = cfg.binaural.carrierHz - half
    const oscR = ctx.createOscillator()
    oscR.type = 'sine'
    oscR.frequency.value = cfg.binaural.carrierHz + half
    const panL = ctx.createStereoPanner()
    panL.pan.value = -1
    const panR = ctx.createStereoPanner()
    panR.pan.value = 1
    oscL.connect(panL).connect(g)
    oscR.connect(panR).connect(g)
    oscL.start(now)
    oscR.start(now)
    sources.push(oscL, oscR)
    h.oscL = oscL
    h.oscR = oscR
    h.binauralGain = g
  }

  // --- Soundscape ---
  {
    const g = ctx.createGain()
    g.gain.value = cfg.soundscape.enabled ? cfg.soundscape.gain : 0
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = cfg.soundscape.warmth
    lp.Q.value = 0.5
    lp.connect(g).connect(master)
    buildTexture(ctx, cfg.soundscape.texture, lp, sources, now)
    h.soundscapeGain = g
    h.soundscapeFilter = lp
  }

  // --- Breathing pace (swelling tone) ---
  {
    const base = cfg.breath.enabled ? cfg.breath.gain : 0
    const toneGain = ctx.createGain()
    toneGain.gain.value = base * 0.5 // intrinsic level; LFO adds the swell
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = cfg.breath.toneHz
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 900
    osc.connect(lp).connect(toneGain).connect(master)
    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = cfg.breath.breathsPerMin / 60
    const depth = ctx.createGain()
    depth.gain.value = base * 0.5
    lfo.connect(depth).connect(toneGain.gain)
    osc.start(now)
    lfo.start(now)
    sources.push(osc, lfo)
    h.breathGain = toneGain
    h.breathLfo = lfo
    h.breathDepth = depth
  }

  // --- Affirmation placeholder (pulsed, pannable) ---
  {
    const base = cfg.affirmation.enabled ? cfg.affirmation.gain : 0
    const panner = ctx.createStereoPanner()
    panner.pan.value = cfg.affirmation.pan
    const g = ctx.createGain()
    g.gain.value = base * 0.5
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = cfg.affirmation.toneHz
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = cfg.affirmation.toneHz
    bp.Q.value = 1.2
    osc.connect(bp).connect(g).connect(panner).connect(master)
    const lfo = ctx.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = cfg.affirmation.pulseHz
    const depth = ctx.createGain()
    depth.gain.value = base * 0.5
    lfo.connect(depth).connect(g.gain)
    osc.start(now)
    lfo.start(now)
    sources.push(osc, lfo)
    h.affirmGain = g
    h.affirmPanner = panner
    h.affirmLfo = lfo
    h.affirmDepth = depth
  }

  return h
}

/* -------------------------------------------------------------------------- */

function makeContext(): AudioContext {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  return new AC()
}

/** Real-time preview with live parameter updates. */
export class LiveSession {
  private ctx: AudioContext
  private h: GraphHandles | null = null
  private cfg: SessionConfig
  playing = false

  constructor(cfg: SessionConfig) {
    this.cfg = cfg
    this.ctx = makeContext()
  }

  async start(): Promise<void> {
    if (this.h) return
    if (this.ctx.state === 'suspended') await this.ctx.resume()
    this.h = buildGraph(this.ctx, this.cfg)
    this.playing = true
  }

  stop(): void {
    if (!this.h) return
    const now = this.ctx.currentTime
    this.h.master.gain.cancelScheduledValues(now)
    this.h.master.gain.setValueAtTime(this.h.master.gain.value, now)
    this.h.master.gain.linearRampToValueAtTime(0, now + 0.15)
    const sources = this.h.sources
    window.setTimeout(() => sources.forEach((s) => { try { s.stop() } catch { /* already stopped */ } }), 200)
    this.h = null
    this.playing = false
  }

  async close(): Promise<void> {
    this.stop()
    try { await this.ctx.close() } catch { /* already closed */ }
  }

  private t() { return this.ctx.currentTime }

  setMaster(v: number): void {
    this.cfg.masterGain = v
    this.h?.master.gain.setTargetAtTime(v, this.t(), 0.02)
  }

  setBinaural(p: Partial<BinauralState>): void {
    Object.assign(this.cfg.binaural, p)
    if (!this.h) return
    const b = this.cfg.binaural
    const half = b.beatHz / 2
    this.h.oscL?.frequency.setTargetAtTime(b.carrierHz - half, this.t(), 0.02)
    this.h.oscR?.frequency.setTargetAtTime(b.carrierHz + half, this.t(), 0.02)
    this.h.binauralGain?.gain.setTargetAtTime(b.enabled ? b.gain : 0, this.t(), 0.03)
  }

  setSoundscape(p: Partial<SoundscapeState>): void {
    const prevTexture = this.cfg.soundscape.texture
    Object.assign(this.cfg.soundscape, p)
    if (!this.h) return
    if (p.texture && p.texture !== prevTexture) { this.rebuild(); return }
    const s = this.cfg.soundscape
    this.h.soundscapeGain?.gain.setTargetAtTime(s.enabled ? s.gain : 0, this.t(), 0.03)
    this.h.soundscapeFilter?.frequency.setTargetAtTime(s.warmth, this.t(), 0.05)
  }

  setBreath(p: Partial<BreathState>): void {
    Object.assign(this.cfg.breath, p)
    if (!this.h) return
    const b = this.cfg.breath
    const base = b.enabled ? b.gain : 0
    this.h.breathLfo?.frequency.setTargetAtTime(b.breathsPerMin / 60, this.t(), 0.05)
    this.h.breathDepth?.gain.setTargetAtTime(base * 0.5, this.t(), 0.05)
    this.h.breathGain?.gain.setTargetAtTime(base * 0.5, this.t(), 0.05)
  }

  setAffirmation(p: Partial<AffirmationState>): void {
    Object.assign(this.cfg.affirmation, p)
    if (!this.h) return
    const a = this.cfg.affirmation
    const base = a.enabled ? a.gain : 0
    this.h.affirmPanner?.pan.setTargetAtTime(a.pan, this.t(), 0.03)
    this.h.affirmLfo?.frequency.setTargetAtTime(a.pulseHz, this.t(), 0.05)
    this.h.affirmDepth?.gain.setTargetAtTime(base * 0.5, this.t(), 0.05)
    this.h.affirmGain?.gain.setTargetAtTime(base * 0.5, this.t(), 0.05)
  }

  private rebuild(): void {
    const cfg = this.cfg
    this.stop()
    this.h = buildGraph(this.ctx, cfg)
    this.playing = true
  }
}

/** Render the configured session to a downloadable WAV (offline, faster than realtime). */
export async function renderToWav(cfg: SessionConfig, lengthSeconds = cfg.lengthSeconds): Promise<Blob> {
  const sampleRate = 44100
  const frames = Math.ceil(sampleRate * lengthSeconds)
  const offline = new OfflineAudioContext(2, frames, sampleRate)
  const h = buildGraph(offline, cfg)
  // tail fade-out to avoid an end click
  h.master.gain.setValueAtTime(cfg.masterGain, Math.max(0.5, lengthSeconds - 0.6))
  h.master.gain.linearRampToValueAtTime(0, Math.max(0.55, lengthSeconds - 0.05))
  const rendered = await offline.startRendering()
  return audioBufferToWav(rendered)
}
