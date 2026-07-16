/* ============================================================================
   Good Loop — Multitrack engine
   The Sound Studio is a small DAW over the Good Loop layer synths. Each TRACK is
   one layer type (binaural / soundscape / breath / voice); each CLIP is a
   time-bounded region of that synth. A clip is rendered once to a stereo
   AudioBuffer — that single buffer drives the waveform, realtime playback and
   the WAV mixdown, so the synthesis logic lives in exactly one place.

   Binaural stays STEREO from synth → buffer → track gain → master → output.
   Nothing here ever sums to mono, so the L/R beat survives playback and export.
   ============================================================================ */

import { audioBufferToWav } from '../lib/wav'
import { timeStretch } from './timestretch'

export type TrackType = 'soundscape' | 'binaural' | 'breath' | 'voice' | 'music' | 'bilateral' | 'sample'
export type Texture = 'lake' | 'air' | 'deep'

export interface BinauralParams { carrierHz: number; beatHz: number }
export interface SoundscapeParams { texture: Texture; warmth: number }
export interface BreathParams { breathsPerMin: number; toneHz: number }
export interface VoiceParams { pan: number; pulseHz: number; toneHz: number; speed?: number; voiceId?: string }
export type Chord = 'c' | 'g' | 'am' | 'f' | 'dm' | 'em'
export interface MusicParams { chord: Chord }
export interface BilateralParams { toneHz: number; blipMs: number; everySec: number }
/** A real audio file (PO library stem / soundscape texture), looped to fill
    the clip with equal-power seams. `url` is a public URL (Supabase Storage). */
export interface SampleParams { url: string; label: string }
export type ClipParams = BinauralParams | SoundscapeParams | BreathParams | VoiceParams | MusicParams | BilateralParams | SampleParams

export const SAMPLE_RATE = 44100

export const TRACK_META: Record<TrackType, { label: string; icon: string; color: string; blurb: string }> = {
  soundscape: { label: 'Soundscape', icon: '🌊', color: '#2FA98C', blurb: 'Ambient bed' },
  binaural: { label: 'Binaural', icon: '🧠', color: '#9B7BC4', blurb: 'L/R carrier beat' },
  breath: { label: 'Breathing', icon: '🌬️', color: '#4F86C6', blurb: 'Paced swelling tone' },
  voice: { label: 'Voice', icon: '🗣️', color: '#E0995E', blurb: 'Guided affirmation (TTS or placeholder)' },
  music: { label: 'Music', icon: '🎹', color: '#C88FB0', blurb: 'Warm chord pad' },
  bilateral: { label: 'Bilateral', icon: '↔️', color: '#7BA8C4', blurb: 'Alternating L/R blips (PAT-05)' },
  sample: { label: 'Audio file', icon: '📼', color: '#8FA86B', blurb: 'Real library asset (looped to clip length)' },
}

export function defaultParams(type: TrackType): ClipParams {
  switch (type) {
    case 'binaural': return { carrierHz: 180, beatHz: 6 }
    case 'soundscape': return { texture: 'lake', warmth: 640 }
    case 'breath': return { breathsPerMin: 5.5, toneHz: 300 }
    case 'voice': return { pan: 0, pulseHz: 0.2, toneHz: 420 }
    case 'music': return { chord: 'c' }
    case 'bilateral': return { toneHz: 400, blipMs: 120, everySec: 4 }
    case 'sample': return { url: '', label: 'No file — set via the datasheet importer' }
  }
}

/** Triads (root position, ~C3 register) for the musical pad. */
export const CHORD_TRIADS: Record<Chord, number[]> = {
  c: [130.81, 164.81, 196.0],
  g: [98.0, 123.47, 146.83],
  am: [110.0, 130.81, 164.81],
  f: [87.31, 110.0, 130.81],
  dm: [73.42, 87.31, 110.0],
  em: [82.41, 98.0, 123.47],
}

/* ---- synthesis (ported from the v1 engine, one layer at a time) ----------- */

function makeNoiseBuffer(ctx: BaseAudioContext, seconds = 2): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  return buf
}

function buildTexture(ctx: BaseAudioContext, texture: Texture, dest: AudioNode, dur: number): void {
  if (texture === 'deep') {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 70; o.connect(dest); o.start(0); o.stop(dur)
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 110; o2.detune.value = -6
    const g2 = ctx.createGain(); g2.gain.value = 0.5
    o2.connect(g2).connect(dest); o2.start(0); o2.stop(dur)
  } else if (texture === 'air') {
    const noise = ctx.createBufferSource(); noise.buffer = makeNoiseBuffer(ctx); noise.loop = true
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = 0.4
    const g = ctx.createGain(); g.gain.value = 0.5
    noise.connect(bp).connect(g).connect(dest); noise.start(0); noise.stop(dur)
  } else {
    const partials = [{ f: 196, g: 0.5 }, { f: 294, g: 0.32 }, { f: 392, g: 0.18 }]
    partials.forEach((p, i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = p.f; o.detune.value = (i - 1) * 4
      const g = ctx.createGain(); g.gain.value = p.g
      o.connect(g).connect(dest); o.start(0); o.stop(dur)
    })
    const noise = ctx.createBufferSource(); noise.buffer = makeNoiseBuffer(ctx); noise.loop = true
    const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 1200
    const ng = ctx.createGain(); ng.gain.value = 0.04
    noise.connect(nf).connect(ng).connect(dest); noise.start(0); noise.stop(dur)
  }
}

function buildLayer(ctx: BaseAudioContext, type: TrackType, params: ClipParams, dest: AudioNode, dur: number): void {
  if (type === 'binaural') {
    const p = params as BinauralParams
    const g = ctx.createGain(); g.gain.value = 0.5; g.connect(dest)
    const half = p.beatHz / 2
    const oscL = ctx.createOscillator(); oscL.type = 'sine'; oscL.frequency.value = p.carrierHz - half
    const oscR = ctx.createOscillator(); oscR.type = 'sine'; oscR.frequency.value = p.carrierHz + half
    const panL = ctx.createStereoPanner(); panL.pan.value = -1
    const panR = ctx.createStereoPanner(); panR.pan.value = 1
    oscL.connect(panL).connect(g); oscR.connect(panR).connect(g)
    oscL.start(0); oscR.start(0); oscL.stop(dur); oscR.stop(dur)
  } else if (type === 'soundscape') {
    const p = params as SoundscapeParams
    const g = ctx.createGain(); g.gain.value = 0.9
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = p.warmth; lp.Q.value = 0.5
    lp.connect(g).connect(dest)
    buildTexture(ctx, p.texture, lp, dur)
  } else if (type === 'breath') {
    const p = params as BreathParams
    const toneGain = ctx.createGain(); toneGain.gain.value = 0.28
    const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = p.toneHz
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900
    osc.connect(lp).connect(toneGain).connect(dest)
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = p.breathsPerMin / 60
    const depth = ctx.createGain(); depth.gain.value = 0.28
    lfo.connect(depth).connect(toneGain.gain)
    osc.start(0); lfo.start(0); osc.stop(dur); lfo.stop(dur)
  } else if (type === 'music') {
    const p = params as MusicParams
    const g = ctx.createGain(); g.gain.value = 0.5; g.connect(dest)
    for (const f of CHORD_TRIADS[p.chord] ?? CHORD_TRIADS.c) {
      for (const det of [0, 0.7]) {
        const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f + det
        const og = ctx.createGain(); og.gain.value = 1 / 6
        o.connect(og).connect(g); o.start(0); o.stop(dur)
      }
    }
  } else if (type === 'bilateral') {
    const p = params as BilateralParams
    const blip = Math.max(0.03, p.blipMs / 1000)
    let side = -1
    for (let t = 0.05; t < dur - blip; t += Math.max(0.5, p.everySec)) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = p.toneHz
      const g = ctx.createGain()
      const pan = ctx.createStereoPanner(); pan.pan.value = 0.8 * side
      side = -side
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(1, t + 0.01)
      g.gain.setValueAtTime(1, t + Math.max(0.02, blip - 0.03))
      g.gain.linearRampToValueAtTime(0, t + blip)
      o.connect(g).connect(pan).connect(dest)
      o.start(t); o.stop(t + blip + 0.05)
    }
  } else {
    const p = params as VoiceParams
    const panner = ctx.createStereoPanner(); panner.pan.value = p.pan
    const g = ctx.createGain(); g.gain.value = 0.35
    const osc = ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.value = p.toneHz
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = p.toneHz; bp.Q.value = 1.2
    osc.connect(bp).connect(g).connect(panner).connect(dest)
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = p.pulseHz
    const depth = ctx.createGain(); depth.gain.value = 0.35
    lfo.connect(depth).connect(g.gain)
    osc.start(0); lfo.start(0); osc.stop(dur); lfo.stop(dur)
  }
}

/* ---- sample clips: fetch + decode the real file once per URL ---- */
const sampleCache = new Map<string, Promise<AudioBuffer>>()

function fetchSampleBuffer(url: string): Promise<AudioBuffer> {
  let p = sampleCache.get(url)
  if (!p) {
    p = (async () => {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Audio file HTTP ${res.status}`)
      const bytes = await res.arrayBuffer()
      const dec = new OfflineAudioContext(2, 1, SAMPLE_RATE)
      return await dec.decodeAudioData(bytes)
    })()
    p.catch(() => sampleCache.delete(url))
    sampleCache.set(url, p)
  }
  return p
}

/** Loop `source` into a clip of `dur` seconds with equal-power seam fades. */
function buildSampleLayer(ctx: OfflineAudioContext, source: AudioBuffer, dest: AudioNode, dur: number): void {
  const bufDur = source.duration
  const seam = Math.min(1.5, bufDur / 4)
  let t = 0
  while (t < dur - 0.01) {
    const src = ctx.createBufferSource()
    src.buffer = source
    const g = ctx.createGain()
    g.gain.value = 0
    const stopAt = Math.min(t + bufDur, dur)
    const isFirst = t === 0
    const isLast = t + bufDur >= dur - seam
    const gIn = isFirst ? 0.03 : seam
    const gOut = isLast ? 0.03 : seam
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(1, t + gIn)
    g.gain.setValueAtTime(1, Math.max(t + gIn, stopAt - gOut))
    g.gain.linearRampToValueAtTime(0, stopAt)
    src.connect(g).connect(dest)
    src.start(t)
    src.stop(stopAt + 0.05)
    t = t + bufDur - (isLast ? 0 : seam)
  }
}

/** Render one clip to a stereo buffer (with short edge fades to avoid clicks). */
export async function renderClipBuffer(type: TrackType, params: ClipParams, durationSec: number): Promise<AudioBuffer> {
  const dur = Math.max(0.1, durationSec)
  const frames = Math.max(1, Math.ceil(SAMPLE_RATE * dur))
  // real-file clip: fetch/decode BEFORE opening the offline graph
  let sampleSource: AudioBuffer | null = null
  if (type === 'sample') {
    const p = params as SampleParams
    if (!p.url) return new OfflineAudioContext(2, frames, SAMPLE_RATE).startRendering() // silent clip
    sampleSource = await fetchSampleBuffer(p.url)
  }
  const ctx = new OfflineAudioContext(2, frames, SAMPLE_RATE)
  const env = ctx.createGain()
  const fade = Math.min(0.12, dur / 4)
  env.gain.setValueAtTime(0, 0)
  env.gain.linearRampToValueAtTime(1, fade)
  env.gain.setValueAtTime(1, Math.max(fade, dur - fade))
  env.gain.linearRampToValueAtTime(0, dur)
  env.connect(ctx.destination)
  if (type === 'sample' && sampleSource) buildSampleLayer(ctx, sampleSource, env, dur)
  else buildLayer(ctx, type, params, env, dur)
  return ctx.startRendering()
}

/** Turn decoded voice audio (from a TTS API) into a stereo clip buffer:
    resample to the studio rate, equal-power pan, and short edge fades. The
    result drives the waveform, playback and mixdown exactly like a synth clip. */
export async function bakeVoiceBuffer(decoded: AudioBuffer, pan: number, maxDurationSec: number, speed = 1): Promise<AudioBuffer> {
  const rate = Math.max(0.5, Math.min(2, speed || 1))
  // pitch-preserving: WSOLA time stretch, not playbackRate (which would also
  // shift the pitch like slowing a tape)
  const stretched = timeStretch(decoded, rate)
  const fullLen = Math.ceil(stretched.duration * SAMPLE_RATE)
  const len = Math.min(fullLen, Math.max(1, Math.floor(maxDurationSec * SAMPLE_RATE)))
  const dur = len / SAMPLE_RATE
  const ctx = new OfflineAudioContext(2, len, SAMPLE_RATE)
  const src = ctx.createBufferSource()
  src.buffer = stretched
  const panner = ctx.createStereoPanner()
  panner.pan.value = Math.max(-1, Math.min(1, pan))
  const env = ctx.createGain()
  const fade = Math.min(0.08, dur / 6)
  env.gain.setValueAtTime(0, 0)
  env.gain.linearRampToValueAtTime(1, fade)
  env.gain.setValueAtTime(1, Math.max(fade, dur - fade))
  env.gain.linearRampToValueAtTime(0, dur)
  src.connect(panner).connect(env).connect(ctx.destination)
  src.start(0)
  return ctx.startRendering()
}

/** Copy a time slice [fromSec, toSec) of a buffer (clamped to its length). */
export function sliceBuffer(buf: AudioBuffer, fromSec: number, toSec: number): AudioBuffer {
  const s = Math.max(0, Math.min(buf.length, Math.floor(fromSec * buf.sampleRate)))
  const e = Math.max(s + 1, Math.min(buf.length, Math.ceil(toSec * buf.sampleRate)))
  const out = new AudioBuffer({ numberOfChannels: 2, length: e - s, sampleRate: buf.sampleRate })
  for (let ch = 0; ch < 2; ch++) {
    const srcCh = buf.getChannelData(Math.min(ch, buf.numberOfChannels - 1))
    out.copyToChannel(srcCh.subarray(s, e), ch)
  }
  return out
}

/** Join two buffers with `gapSec` of silence between them (for GLUE). */
export function concatBuffers(a: AudioBuffer, b: AudioBuffer, gapSec: number): AudioBuffer {
  const gap = Math.max(0, Math.floor(gapSec * SAMPLE_RATE))
  const out = new AudioBuffer({ numberOfChannels: 2, length: a.length + gap + b.length, sampleRate: SAMPLE_RATE })
  for (let ch = 0; ch < 2; ch++) {
    out.copyToChannel(a.getChannelData(Math.min(ch, a.numberOfChannels - 1)), ch, 0)
    out.copyToChannel(b.getChannelData(Math.min(ch, b.numberOfChannels - 1)), ch, a.length + gap)
  }
  return out
}

/** Down-sample a buffer to [min,max] pairs for waveform drawing. */
export function computePeaks(buf: AudioBuffer, buckets: number): Float32Array {
  const a = buf.getChannelData(0)
  const b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : a
  const n = buf.length
  const per = n / buckets
  const out = new Float32Array(buckets * 2)
  for (let i = 0; i < buckets; i++) {
    let mn = 1, mx = -1
    const s = Math.floor(i * per)
    const e = Math.min(n, Math.floor((i + 1) * per))
    for (let j = s; j < e; j++) {
      const v = (a[j] + b[j]) * 0.5
      if (v < mn) mn = v
      if (v > mx) mx = v
    }
    if (e <= s) { mn = 0; mx = 0 }
    out[i * 2] = mn
    out[i * 2 + 1] = mx
  }
  return out
}

export function peakBuckets(durationSec: number): number {
  return Math.min(6000, Math.max(160, Math.round(durationSec * 120)))
}

/* ---- realtime transport --------------------------------------------------- */

export interface SchedClip { startSec: number; durationSec: number; buffer: AudioBuffer | null }
export interface SchedTrack { id: string; clips: SchedClip[] }

function makeContext(): AudioContext {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  return new AC()
}

export class MultitrackPlayer {
  private ctx: AudioContext
  private master: GainNode
  private trackGains = new Map<string, GainNode>()
  private trackPans = new Map<string, StereoPannerNode>()
  private sources: AudioBufferSourceNode[] = []
  private startCtxTime = 0
  private startOffset = 0
  playing = false

  constructor(masterGain = 0.85) {
    this.ctx = makeContext()
    this.master = this.ctx.createGain()
    this.master.gain.value = masterGain
    this.master.connect(this.ctx.destination)
  }

  setMasterGain(v: number): void {
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02)
  }

  setTrackGain(id: string, v: number): void {
    this.trackGains.get(id)?.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02)
  }

  /** Whole-track stereo position (−1 left · 0 center · +1 right). */
  setTrackPan(id: string, v: number): void {
    this.trackPans.get(id)?.pan.setTargetAtTime(Math.max(-1, Math.min(1, v)), this.ctx.currentTime, 0.02)
  }

  async play(tracks: SchedTrack[], fromSec: number, gainFor: (id: string) => number, panFor?: (id: string) => number): Promise<void> {
    if (this.ctx.state === 'suspended') await this.ctx.resume()
    this.stopSources()
    this.trackGains.clear()
    this.trackPans.clear()
    this.startCtxTime = this.ctx.currentTime + 0.04
    this.startOffset = fromSec
    for (const t of tracks) {
      const g = this.ctx.createGain()
      g.gain.value = gainFor(t.id)
      const pan = this.ctx.createStereoPanner()
      pan.pan.value = Math.max(-1, Math.min(1, panFor?.(t.id) ?? 0))
      g.connect(pan).connect(this.master)
      this.trackGains.set(t.id, g)
      this.trackPans.set(t.id, pan)
      for (const c of t.clips) {
        if (!c.buffer) continue
        const end = c.startSec + c.durationSec
        if (end <= fromSec) continue
        const offset = Math.max(0, fromSec - c.startSec)
        const when = this.startCtxTime + Math.max(0, c.startSec - fromSec)
        const src = this.ctx.createBufferSource()
        src.buffer = c.buffer
        src.connect(g)
        // duration argument: a clip never plays past its timeline length,
        // even when its buffer is longer (cut pieces, trimmed clips)
        src.start(when, offset, Math.max(0.01, c.durationSec - offset))
        this.sources.push(src)
      }
    }
    this.playing = true
  }

  currentTime(): number {
    return this.playing ? this.startOffset + (this.ctx.currentTime - this.startCtxTime) : this.startOffset
  }

  pause(): void {
    this.startOffset = this.currentTime()
    this.stopSources()
    this.playing = false
  }

  stop(): void {
    this.stopSources()
    this.playing = false
    this.startOffset = 0
  }

  setPlayhead(sec: number): void {
    if (!this.playing) this.startOffset = sec
  }

  private stopSources(): void {
    this.sources.forEach((s) => { try { s.stop() } catch { /* already stopped */ } })
    this.sources = []
  }

  async close(): Promise<void> {
    this.stopSources()
    try { await this.ctx.close() } catch { /* already closed */ }
  }

  /** Decode encoded audio bytes (mp3/wav from a TTS API) into an AudioBuffer. */
  async decode(bytes: ArrayBuffer): Promise<AudioBuffer> {
    return this.ctx.decodeAudioData(bytes.slice(0))
  }
}

/* ---- offline mixdown → WAV ------------------------------------------------- */

export interface MixTrack { gain: number; pan?: number; clips: { startSec: number; durationSec?: number; buffer: AudioBuffer | null }[] }

export async function renderMixdownBuffer(tracks: MixTrack[], lengthSec: number, masterGain: number): Promise<AudioBuffer> {
  const frames = Math.max(1, Math.ceil(SAMPLE_RATE * lengthSec))
  const ctx = new OfflineAudioContext(2, frames, SAMPLE_RATE)
  const master = ctx.createGain()
  master.gain.value = masterGain
  master.connect(ctx.destination)
  for (const t of tracks) {
    const g = ctx.createGain()
    g.gain.value = t.gain
    const pan = ctx.createStereoPanner()
    pan.pan.value = Math.max(-1, Math.min(1, t.pan ?? 0))
    g.connect(pan).connect(master)
    for (const c of t.clips) {
      if (!c.buffer) continue
      const src = ctx.createBufferSource()
      src.buffer = c.buffer
      src.connect(g)
      src.start(c.startSec, 0, Math.max(0.01, c.durationSec ?? c.buffer.duration))
    }
  }
  master.gain.setValueAtTime(masterGain, Math.max(0, lengthSec - 0.4))
  master.gain.linearRampToValueAtTime(0, lengthSec)
  return ctx.startRendering()
}

export async function renderMixdown(tracks: MixTrack[], lengthSec: number, masterGain: number): Promise<Blob> {
  return audioBufferToWav(await renderMixdownBuffer(tracks, lengthSec, masterGain))
}
