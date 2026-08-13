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
import { buildEffectsChain, type TrackEffect } from './effects'
import { measureLufs } from './mastering'

export type TrackType = 'soundscape' | 'binaural' | 'breath' | 'voice' | 'music' | 'bilateral' | 'sample'
export type Texture = 'lake' | 'air' | 'deep'

export interface BinauralParams { carrierHz: number; beatHz: number }
export interface SoundscapeParams { texture: Texture; warmth: number }
export interface BreathParams { breathsPerMin: number; toneHz: number }
export interface VoiceParams { pan: number; pulseHz: number; toneHz: number; speed?: number; voiceId?: string }
export type Chord = 'c' | 'g' | 'am' | 'f' | 'dm' | 'em'
export interface MusicParams { chord: Chord }
/* ---- bilateral pulse sounds (PO library) --------------------------------
   Each alternating hit plays one of the files the POs chose, shipped with the
   app under public/bilateral/ so a render sounds the same everywhere and needs
   no Storage round-trip. The synthesized timbres this replaced (sine blip,
   modelled gong/bowl/woodblock/chime/drum) are gone: the POs judge the sound,
   and a recorded instrument is not something to approximate with oscillators.
   Timing, L/R alternation and pan extent are identical for every sound. */
export type BilateralSoundId =
  | 'zen-deep' | 'zen-mid' | 'zen-high'
  | 'gong' | 'temple-bell' | 'bong' | 'bowl-gong' | 'bowl-low'
  | 'whoosh-1' | 'whoosh-2' | 'swoosh' | 'deep-swoosh'

export type BilateralFamily = 'tone' | 'bell' | 'whoosh'

export interface BilateralSound {
  id: BilateralSoundId
  label: string
  blurb: string
  family: BilateralFamily
  /** File name under public/bilateral/ (kept verbatim — it carries the credit). */
  file: string
  /** Full length of the file in seconds; a hit is trimmed to fit its interval. */
  naturalSec: number
}

export const BILATERAL_SOUNDS: BilateralSound[] = [
  { id: 'zen-deep', label: 'Tono zen grave', blurb: 'Tono puro e caldo — il segnale bilaterale più discreto', family: 'tone', file: 'alex_jauk-zen-tone-deep-202555.mp3', naturalSec: 3.19 },
  { id: 'zen-mid', label: 'Tono zen medio', blurb: 'Tono zen centrale, buon equilibrio fra presenza e morbidezza', family: 'tone', file: 'alex_jauk-zen-tone-mid-202556.mp3', naturalSec: 3.02 },
  { id: 'zen-high', label: 'Tono zen medio-alto', blurb: 'Tono zen più brillante — si stacca meglio su un tappeto denso', family: 'tone', file: 'alex_jauk-zen-tone-mid-high-202557.mp3', naturalSec: 3.02 },
  { id: 'gong', label: 'Gong', blurb: 'Colpo di gong con coda metallica — la richiesta originale dei PO', family: 'bell', file: 'freesound_community-gong1-94016.mp3', naturalSec: 7.3 },
  { id: 'temple-bell', label: 'Campana da tempio', blurb: 'Rintocco profondo, attacco netto e lunga risonanza', family: 'bell', file: 'kalsstockmedia-church-temple-bell-gong-dong-sound-effect-3-241681.mp3', naturalSec: 8.1 },
  { id: 'bong', label: 'Bong', blurb: 'Percussione intonata breve — la più asciutta del gruppo', family: 'bell', file: 'freesound_community-bong-105459.mp3', naturalSec: 5.62 },
  { id: 'bowl-gong', label: 'Campana tibetana', blurb: 'Campana cantante percossa, timbro cristallino', family: 'bell', file: 'freesound_community-singing-bowl-gong-69238.mp3', naturalSec: 19.44 },
  { id: 'bowl-low', label: 'Campana tibetana grave', blurb: 'Campana grande e piena — coda molto lunga, meglio con intervalli larghi', family: 'bell', file: 'freesound_community-singing-bowl-low-and-loud-76401.mp3', naturalSec: 59.69 },
  { id: 'whoosh-1', label: 'Whoosh 1', blurb: 'Passaggio d’aria — segnale senza altezza, non interferisce col binaurale', family: 'whoosh', file: 'dragon-studio-whoosh-06-410874.mp3', naturalSec: 1.92 },
  { id: 'whoosh-2', label: 'Whoosh 2', blurb: 'Passaggio d’aria, timbro leggermente più chiuso', family: 'whoosh', file: 'dragon-studio-whoosh-07-410877.mp3', naturalSec: 1.92 },
  { id: 'swoosh', label: 'Swoosh breve', blurb: 'Soffio corto e rapido — il più discreto dei passaggi d’aria', family: 'whoosh', file: 'u_2ttqv1v1rq-17_swoosh2-473890.mp3', naturalSec: 1.34 },
  { id: 'deep-swoosh', label: 'Swoosh profondo', blurb: 'Soffio grave e ampio, buono per le fasi lente', family: 'whoosh', file: 'universfield-deep-swoosh-383771.mp3', naturalSec: 2.14 },
]

export const BILATERAL_FAMILY_LABEL: Record<BilateralFamily, string> = {
  tone: 'Toni zen',
  bell: 'Gong e campane',
  whoosh: 'Passaggi d’aria',
}

/** The PO default: a gong, which is what they asked for in place of the beep. */
export const DEFAULT_BILATERAL_SOUND: BilateralSoundId = 'gong'

/** Saved protocols from the synth era name a timbre, not a file. Nearest PO
    sound per old timbre, so those projects keep opening and rendering. */
const LEGACY_TIMBRE: Record<string, BilateralSoundId> = {
  blip: 'zen-mid',
  gong: 'gong',
  bowl: 'bowl-gong',
  chime: 'zen-high',
  woodblock: 'bong',
  drum: 'temple-bell',
}

export function bilateralSoundById(id: string | undefined): BilateralSound | undefined {
  return BILATERAL_SOUNDS.find((s) => s.id === id)
}

/** The sound a clip really plays: its own, else the migrated legacy timbre,
    else the default. Never throws on old data. */
export function resolveBilateralSound(p: Partial<BilateralParams> & { timbre?: string }): BilateralSound {
  return bilateralSoundById(p.sound)
    ?? bilateralSoundById(p.timbre ? LEGACY_TIMBRE[p.timbre] : undefined)
    ?? bilateralSoundById(DEFAULT_BILATERAL_SOUND)!
}

/** Where the app serves the file from (public/ ships verbatim to the site). */
export function bilateralSoundUrl(s: BilateralSound): string {
  return `${import.meta.env.BASE_URL}bilateral/${s.file}`
}

export interface BilateralParams {
  /** Which PO file each pulse plays. */
  sound: BilateralSoundId
  /** Seconds between one side's hit and the other's. */
  everySec: number
  /** Symmetric pan extent 0..1 (PLAIN pan_ampiezza/100). Default 0.8. */
  panAmp?: number
  /** Hit length in seconds — the file is trimmed and faded to this so a long
      bell can't smear across the next hit. Absent = fit the interval. */
  holdSec?: number
}
/** A real audio file (PO library stem / soundscape texture), looped to fill
    the clip with equal-power seams. `url` is a public URL (Supabase Storage). */
export interface SampleParams {
  url: string
  label: string
  /** PLAIN draw intent (soundscape `ambiente` tag) — lets the Studio (re)draw
      a file from the tag pool after seeding, e.g. when the library wasn't
      reachable at import time. */
  drawTag?: string
  /** PLAIN draw intent (music phase 1–6) — same, from the global phase pool. */
  drawPhase?: number
}
export type ClipParams = BinauralParams | SoundscapeParams | BreathParams | VoiceParams | MusicParams | BilateralParams | SampleParams

export const SAMPLE_RATE = 44100

export const TRACK_META: Record<TrackType, { label: string; icon: string; color: string; blurb: string }> = {
  soundscape: { label: 'Paesaggio sonoro', icon: '🌊', color: '#2FA98C', blurb: 'Tappeto ambientale' },
  binaural: { label: 'Binaurale', icon: '🧠', color: '#9B7BC4', blurb: 'Battimento portante L/R' },
  breath: { label: 'Respiro', icon: '🌬️', color: '#4F86C6', blurb: 'Tono pulsante cadenzato' },
  voice: { label: 'Voce', icon: '🗣️', color: '#E0995E', blurb: 'Affermazione guidata (TTS o provvisoria)' },
  music: { label: 'Musica', icon: '🎹', color: '#C88FB0', blurb: 'Pad armonico caldo' },
  bilateral: { label: 'Bilaterale', icon: '↔️', color: '#7BA8C4', blurb: 'Impulsi alternati L/R (PAT-05)' },
  sample: { label: 'File audio', icon: '📼', color: '#8FA86B', blurb: 'Asset reale della libreria (in loop sulla durata della clip)' },
}

export function defaultParams(type: TrackType): ClipParams {
  switch (type) {
    case 'binaural': return { carrierHz: 180, beatHz: 6 }
    case 'soundscape': return { texture: 'lake', warmth: 640 }
    case 'breath': return { breathsPerMin: 5.5, toneHz: 300 }
    case 'voice': return { pan: 0, pulseHz: 0.2, toneHz: 420 }
    case 'music': return { chord: 'c' }
    case 'bilateral': return { sound: DEFAULT_BILATERAL_SOUND, everySec: 4 }
    case 'sample': return { url: '', label: 'Nessun file — si imposta dall’importazione' }
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

/* ---- bilateral pulse ---------------------------------------------------
   One hit of the chosen PO file, panned by the caller. The file is trimmed to
   `hold` seconds with a short attack and a proportional release, so a 60 s
   singing bowl every 4 s does not smear over the next hit while a 1.3 s swoosh
   plays out whole. Nothing is synthesized any more. */
function buildBilateralHit(
  ctx: BaseAudioContext, hit: AudioBuffer, at: number, hold: number, dest: AudioNode,
): void {
  const len = Math.min(hit.duration, Math.max(0.08, hold))
  const src = ctx.createBufferSource()
  src.buffer = hit
  const g = ctx.createGain()
  const attack = Math.min(0.008, len / 8)
  // the release is a quarter of the hit (max 0.6 s) — enough to hide the cut
  // without eating the instrument's own decay
  const release = Math.min(0.6, len / 4)
  g.gain.setValueAtTime(0, at)
  g.gain.linearRampToValueAtTime(1, at + attack)
  g.gain.setValueAtTime(1, at + Math.max(attack, len - release))
  g.gain.linearRampToValueAtTime(0, at + len)
  src.connect(g).connect(dest)
  src.start(at)
  src.stop(at + len + 0.02)
}

function buildLayer(ctx: BaseAudioContext, type: TrackType, params: ClipParams, dest: AudioNode, dur: number, bilateralHit?: AudioBuffer | null): void {
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
    // no file decoded (offline / fetch failed) → the lane stays silent rather
    // than falling back to a beep the POs did not choose
    if (!bilateralHit) return
    const p = params as BilateralParams
    const every = Math.max(0.5, p.everySec)
    // default hold: the file, but never long enough to smear into the next hit
    const hold = Math.max(0.08, p.holdSec ?? Math.min(bilateralHit.duration, every * 0.9))
    let side = -1
    for (let t = 0.05; t < dur - 0.08; t += every) {
      const pan = ctx.createStereoPanner(); pan.pan.value = (p.panAmp ?? 0.8) * side
      pan.connect(dest)
      side = -side
      buildBilateralHit(ctx, bilateralHit, t, Math.min(hold, dur - t), pan)
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

/* ---- bilateral hits: one peak-normalized copy per file ------------------
   The PO files were mastered by different people at different levels — a
   singing bowl recorded hot next to a soft zen tone. Peak-normalizing every
   hit to the same ceiling means changing the pulse sound changes the TIMBRE
   and nothing else; the track fader (and the protocol's calibrateDb) still
   decide how loud the layer sits. */
const HIT_PEAK = 0.9
const hitCache = new Map<string, Promise<AudioBuffer>>()

function fetchBilateralHit(url: string): Promise<AudioBuffer> {
  let p = hitCache.get(url)
  if (!p) {
    p = (async () => {
      const raw = await fetchSampleBuffer(url)
      let peak = 0
      for (let c = 0; c < raw.numberOfChannels; c++) {
        const d = raw.getChannelData(c)
        for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v }
      }
      if (peak < 1e-6) return raw
      const gain = HIT_PEAK / peak
      const out = new AudioBuffer({ numberOfChannels: raw.numberOfChannels, length: raw.length, sampleRate: raw.sampleRate })
      const scaled = new Float32Array(raw.length)
      for (let c = 0; c < raw.numberOfChannels; c++) {
        const d = raw.getChannelData(c)
        for (let i = 0; i < d.length; i++) scaled[i] = d[i] * gain
        out.copyToChannel(scaled, c)
      }
      return out
    })()
    p.catch(() => hitCache.delete(url))
    hitCache.set(url, p)
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
  // the bilateral pulse is a PO file too — same rule, decode it up front
  let bilateralHit: AudioBuffer | null = null
  if (type === 'bilateral') {
    bilateralHit = await fetchBilateralHit(bilateralSoundUrl(resolveBilateralSound(params as BilateralParams)))
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
  else buildLayer(ctx, type, params, env, dur, bilateralHit)
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

/* ------------------------------------------------------------ clip EQ ---- */

/** Per-clip parametric equalizer (the standard studio 6-band layout: low
    cut · low shelf · two mid bells · high shelf · high cut). Applied OFFLINE
    to the clip's rendered buffer BEFORE loudness calibration — so shaping
    the spectrum never moves the clip off its protocol layer level. */
export type EqBandType = 'highpass' | 'lowshelf' | 'peaking' | 'highshelf' | 'lowpass'
export interface EqBand { type: EqBandType; enabled: boolean; freqHz: number; gainDb: number; q: number }
export interface ClipEq { enabled: boolean; bands: EqBand[] }

export function defaultClipEq(): ClipEq {
  return {
    enabled: true,
    bands: [
      { type: 'highpass', enabled: false, freqHz: 80, gainDb: 0, q: 0.71 },
      { type: 'lowshelf', enabled: true, freqHz: 200, gainDb: 0, q: 0.71 },
      { type: 'peaking', enabled: true, freqHz: 700, gainDb: 0, q: 1.0 },
      { type: 'peaking', enabled: true, freqHz: 2500, gainDb: 0, q: 1.0 },
      { type: 'highshelf', enabled: true, freqHz: 8000, gainDb: 0, q: 0.71 },
      { type: 'lowpass', enabled: false, freqHz: 12000, gainDb: 0, q: 0.71 },
    ],
  }
}

/** True when the EQ would not audibly change the signal (skip processing). */
export function eqIsTransparent(eq: ClipEq | undefined): boolean {
  if (!eq || !eq.enabled) return true
  return eq.bands.every((b) => !b.enabled || (b.type !== 'highpass' && b.type !== 'lowpass' && Math.abs(b.gainDb) < 0.1))
}

interface BiquadCoef { b0: number; b1: number; b2: number; a1: number; a2: number }

/** RBJ audio-EQ-cookbook biquad coefficients. */
function eqBandCoef(band: EqBand, fs: number): BiquadCoef {
  const f0 = Math.min(fs * 0.45, Math.max(10, band.freqHz))
  const w0 = 2 * Math.PI * (f0 / fs)
  const cw = Math.cos(w0)
  const sw = Math.sin(w0)
  const Q = Math.max(0.1, band.q)
  const A = Math.pow(10, band.gainDb / 40)
  const alpha = sw / (2 * Q)
  let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0
  switch (band.type) {
    case 'highpass':
      b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2
      a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha
      break
    case 'lowpass':
      b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2
      a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha
      break
    case 'peaking':
      b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A
      a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A
      break
    case 'lowshelf': {
      const s = 2 * Math.sqrt(A) * alpha
      b0 = A * ((A + 1) - (A - 1) * cw + s)
      b1 = 2 * A * ((A - 1) - (A + 1) * cw)
      b2 = A * ((A + 1) - (A - 1) * cw - s)
      a0 = (A + 1) + (A - 1) * cw + s
      a1 = -2 * ((A - 1) + (A + 1) * cw)
      a2 = (A + 1) + (A - 1) * cw - s
      break
    }
    case 'highshelf': {
      const s = 2 * Math.sqrt(A) * alpha
      b0 = A * ((A + 1) + (A - 1) * cw + s)
      b1 = -2 * A * ((A - 1) + (A + 1) * cw)
      b2 = A * ((A + 1) + (A - 1) * cw - s)
      a0 = (A + 1) - (A - 1) * cw + s
      a1 = 2 * ((A - 1) - (A + 1) * cw)
      a2 = (A + 1) - (A - 1) * cw - s
      break
    }
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 }
}

/** Apply the EQ chain to a buffer in place. */
export function applyEqToBuffer(buf: AudioBuffer, eq: ClipEq): void {
  if (eqIsTransparent(eq)) return
  const coefs = eq.bands
    .filter((b) => b.enabled && (b.type === 'highpass' || b.type === 'lowpass' || Math.abs(b.gainDb) >= 0.1))
    .map((b) => eqBandCoef(b, buf.sampleRate))
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch)
    for (const c of coefs) {
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0
      for (let i = 0; i < d.length; i++) {
        const x0 = d[i]
        const y0 = c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2
        x2 = x1; x1 = x0; y2 = y1; y1 = y0
        d[i] = y0
      }
    }
  }
}

/** Combined EQ magnitude (dB) at the given frequencies — for the response
    curve in the Inspector. */
export function eqMagnitudeDb(eq: ClipEq, freqs: number[], fs = SAMPLE_RATE): number[] {
  const coefs = eq.enabled
    ? eq.bands.filter((b) => b.enabled && (b.type === 'highpass' || b.type === 'lowpass' || Math.abs(b.gainDb) >= 0.05)).map((b) => eqBandCoef(b, fs))
    : []
  return freqs.map((f) => {
    const w = 2 * Math.PI * (f / fs)
    const cos1 = Math.cos(w), sin1 = Math.sin(w)
    const cos2 = Math.cos(2 * w), sin2 = Math.sin(2 * w)
    let db = 0
    for (const c of coefs) {
      const nr = c.b0 + c.b1 * cos1 + c.b2 * cos2
      const ni = -(c.b1 * sin1 + c.b2 * sin2)
      const dr = 1 + c.a1 * cos1 + c.a2 * cos2
      const di = -(c.a1 * sin1 + c.a2 * sin2)
      const mag = Math.sqrt((nr * nr + ni * ni) / Math.max(1e-12, dr * dr + di * di))
      db += 20 * Math.log10(Math.max(1e-6, mag))
    }
    return db
  })
}

/** House reference: the RMS a normal guide-voice clip lands at (same figure
    Renderer v3 uses). Kept for legacy paths and as the short-clip fallback. */
export const VOICE_REF_RMS = 0.13

/** PO pipeline (rev. 3), step 1 — the pinned loudness metric: integrated
    LUFS (BS.1770), voice = 0 dB = this anchor. Every volume_db in the Excel
    is an offset with respect to it. */
export const ANCHOR_LUFS = -23
/** Per-channel RMS roughly equivalent to the anchor for clips too short to
    measure in LUFS (<0.4 s — the BS.1770 block size). */
const ANCHOR_RMS_FALLBACK = 0.05

/** Gated RMS: mean square of the samples that actually carry signal (above
    −60 dBFS), so pauses inside a voice line or a faded soundscape don't
    drag the measurement down and cause over-boosting. */
export function gatedRms(buf: AudioBuffer): number {
  const GATE = 0.001
  let sum = 0
  let n = 0
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < d.length; i += 4) { // strided — plenty for level work
      const a = Math.abs(d[i])
      if (a > GATE) { sum += d[i] * d[i]; n++ }
    }
  }
  return n ? Math.sqrt(sum / n) : 0
}

/** PO pipeline (rev. 3), steps 2 + 3 in one: INPUT normalization per source
    + the Excel offset. The clip's INTEGRATED LUFS (BS.1770 — K-weighted,
    gated, so voice pauses and faded beds don't skew it) is measured and the
    buffer is scaled with ONE uniform gain so it lands at
    ANCHOR_LUFS + targetDb. A −18 dB music clip therefore sits measurably
    18 LU under the voice anchor no matter how hot or quiet the source file,
    synth or TTS take was — the number in the sheet produces the intended
    relationship. Output normalization happens ONCE, on the final mix
    (§9 mastering), so the ratios set here stay intact.
    Returns the applied linear gain (1 = untouched silent/broken source). */
export function calibrateBufferToDb(buf: AudioBuffer, targetDb: number): number {
  const lufs = measureLufs(buf)
  let gainDb: number
  if (Number.isFinite(lufs)) {
    gainDb = ANCHOR_LUFS + targetDb - lufs
  } else {
    // clip shorter than a BS.1770 block (or gated to nothing): RMS fallback
    const rms = gatedRms(buf)
    if (rms < 1e-4) return 1 // silence — leave it, the seed note says why
    gainDb = 20 * Math.log10((ANCHOR_RMS_FALLBACK * Math.pow(10, targetDb / 20)) / rms)
  }
  const g = Math.min(31.6, Math.max(0.0316, Math.pow(10, gainDb / 20))) // ±30 dB sanity
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < d.length; i++) d[i] *= g
  }
  return g
}

/** Full PLAIN clip conditioning: parametric EQ (spectral shaping) →
    loudness calibration (when `calibrateDb` is set — AFTER the EQ, so
    equalizing never moves a clip off its protocol layer level) → legacy
    relative gain + fades. One call, shared by the Studio's buffer pipeline
    and the offline renderer — both hear the same clip. */
export function shapeClipBuffer(
  buf: AudioBuffer,
  shape: { eq?: ClipEq; calibrateDb?: number; gainDb?: number; fadeInSec?: number; fadeOutSec?: number },
): AudioBuffer {
  if (shape.eq && !eqIsTransparent(shape.eq)) applyEqToBuffer(buf, shape.eq)
  if (shape.calibrateDb !== undefined) calibrateBufferToDb(buf, shape.calibrateDb)
  return applyClipShape(buf, shape.gainDb, shape.fadeInSec, shape.fadeOutSec)
}

/** Bake a PLAIN clip's shape into its rendered buffer: linear gain from a
    relative dB offset (vs the track base) plus fade_in/fade_out ramps. The
    shaped buffer stays the single source of truth, so waveform, realtime
    playback and the WAV mixdown all agree with zero scheduling changes. */
export function applyClipShape(buf: AudioBuffer, gainDb?: number, fadeInSec?: number, fadeOutSec?: number): AudioBuffer {
  const g = gainDb !== undefined && gainDb !== 0 ? Math.pow(10, gainDb / 20) : 1
  const fi = Math.max(0, fadeInSec ?? 0)
  const fo = Math.max(0, fadeOutSec ?? 0)
  if (g === 1 && fi < 0.05 && fo < 0.05) return buf
  const dur = buf.duration
  const fiN = Math.min(Math.floor(fi * buf.sampleRate), buf.length)
  const foN = Math.min(Math.floor(fo * buf.sampleRate), buf.length)
  const foStart = Math.max(0, buf.length - foN)
  const out = new AudioBuffer({ numberOfChannels: buf.numberOfChannels, length: buf.length, sampleRate: buf.sampleRate })
  const HALF_PI = Math.PI / 2
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const src = buf.getChannelData(ch)
    const dst = out.getChannelData(ch)
    for (let i = 0; i < buf.length; i++) {
      let env = 1
      // equal-power (sin/cos) ramps: crossfading two beds keeps constant
      // perceived level instead of the −3 dB dip linear ramps produce
      if (i < fiN) env = Math.sin(HALF_PI * (i / fiN))
      if (i >= foStart && foN > 0) env = Math.min(env, Math.sin(HALF_PI * ((buf.length - i) / foN)))
      dst[i] = src[i] * g * env
    }
  }
  void dur
  return out
}

/** Sample peak of a buffer in dBFS (−Infinity for silence). Cheap: no
    oversampling, because callers use it to spot a clip that has been driven
    PAST full scale, not to certify a true-peak ceiling. */
export function bufferPeakDb(buf: AudioBuffer): number {
  let peak = 0
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a }
  }
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity
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
export interface SchedTrack { id: string; effects?: TrackEffect[]; clips: SchedClip[] }

/**
 * Soft-clip curve for the monitor bus: near-linear where normal material lives,
 * rounding off towards a ceiling below full scale.
 *
 * `SOFT_CLIP_CEILING` is deliberately under 1.0 and the curve's ENDPOINTS carry
 * it. A WaveShaperNode maps input −1…+1 through the curve and clamps anything
 * beyond to the end values, so however hot the input, the output cannot reach
 * the rail. That is the guarantee the compressor alone cannot give, because a
 * transient arrives before its attack has moved the gain.
 *
 * Exported so the node proof can check the same curve the player uses.
 */
export const SOFT_CLIP_CEILING = 0.97
/** Below this the curve is EXACTLY unity — ordinary monitoring is bit-identical. */
export const SOFT_CLIP_KNEE = 0.5 // −6 dBFS, where the compressor also starts

export function softClipCurve(n = 4096): Float32Array<ArrayBuffer> {
  const c = new Float32Array(new ArrayBuffer(n * 4))
  const t = SOFT_CLIP_KNEE
  const span = SOFT_CLIP_CEILING - t
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    const a = Math.abs(x)
    // linear below the knee (slope exactly 1, so no level change at all), then
    // tanh onto the ceiling — continuous in value AND slope at the knee, so
    // there is no corner to generate harmonics on ordinary material
    const y = a <= t ? a : t + span * Math.tanh((a - t) / span)
    c[i] = x < 0 ? -y : y
  }
  return c
}

function makeContext(): AudioContext {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  return new AC()
}

export class MultitrackPlayer {
  private ctx: AudioContext
  private master: GainNode
  /** Peak protection on the MONITOR path only — see the constructor. */
  private limiter: DynamicsCompressorNode
  private softClip: WaveShaperNode
  private trackGains = new Map<string, GainNode>()
  private trackPans = new Map<string, StereoPannerNode>()
  private sources: AudioBufferSourceNode[] = []
  /** the one-off buffer being auditioned (voice preview), outside the timeline */
  private auditionSrc: AudioBufferSourceNode | null = null
  private startCtxTime = 0
  private startOffset = 0
  playing = false

  constructor(masterGain = 0.85) {
    this.ctx = makeContext()
    this.master = this.ctx.createGain()
    this.master.gain.value = masterGain
    /* MONITOR LIMITER — what you hear must be peak-safe, because clip buffers
       legitimately are not.

       `calibrateBufferToDb` gives a clip whatever gain its protocol level asks
       for, and a voice lane set to −6 LUFS needs a LOT: measured on the POs'
       own voices, the calibrated clip peaks between +5 and +10 dBFS with 12 000
       to 24 000 samples past full scale. That is fine inside the engine — the
       buffers are float, and §9 mastering brings the exported file back under
       −1 dBTP with no distortion (measured: −152 dB of non-gain residue).

       The REALTIME path had no such protection. Those same buffers went to
       ctx.destination, which hard-clips at ±1, so the Studio monitor was
       distorting audio that exports clean. It showed up on the male voices
       because Paternal carries 92 % of its energy below 160 Hz and clipped bass
       buzzes, where the child voice (12 % below 160 Hz) clips on sparse
       transients nobody hears — exactly the pattern the POs reported.

       This changes MONITORING ONLY. Exports and published audio are untouched:
       they go through renderMixdownBuffer + masterizeBuffer, not through here.

       Two stages, because one is not enough. The compressor does the level
       riding, but it has an attack time: a transient that arrives 10 dB over
       the threshold is already through before the gain moves. So a soft
       clipper follows it as a GUARANTEED ceiling — a WaveShaper curve whose
       endpoints stop below 1.0, which by construction cannot output a sample at
       the rail no matter what arrives. Rounded rather than flat-topped, which
       is the difference between "loud" and "buzzing". */
    this.limiter = this.ctx.createDynamicsCompressor()
    this.limiter.threshold.value = -6 // start riding well before the ceiling
    this.limiter.knee.value = 3
    this.limiter.ratio.value = 10
    this.limiter.attack.value = 0.002
    this.limiter.release.value = 0.2
    this.softClip = this.ctx.createWaveShaper()
    this.softClip.curve = softClipCurve()
    this.softClip.oversample = '4x' // no aliasing from the curve's knee
    this.master.connect(this.limiter).connect(this.softClip).connect(this.ctx.destination)
  }

  /** How hard the monitor limiter is working, in dB (0 = untouched). Lets the
      Studio say "what you are hearing is being held back" instead of leaving a
      hot lane to sound mysteriously wrong. */
  monitorReductionDb(): number {
    return this.limiter.reduction ?? 0
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
      const fx = buildEffectsChain(this.ctx, t.effects)
      g.connect(fx.input)
      fx.output.connect(pan).connect(this.master)
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

  /** Audition ONE buffer outside the timeline (the voice preview), through the
      same master so it is heard at the same level as the mix. Stops the
      previous audition; leaves transport playback alone. */
  async audition(buffer: AudioBuffer): Promise<void> {
    if (this.ctx.state === 'suspended') await this.ctx.resume()
    try { this.auditionSrc?.stop() } catch { /* already finished */ }
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    src.connect(this.master)
    src.start()
    this.auditionSrc = src
    src.onended = () => { if (this.auditionSrc === src) this.auditionSrc = null }
  }
}

/* ---- offline mixdown → WAV ------------------------------------------------- */

export interface MixTrack {
  gain: number
  pan?: number
  effects?: TrackEffect[]
  /** Optional gain-multiplier automation (PLAIN ducking): piecewise-linear
      points, value 1 = the track's nominal `gain`. Applied via a second gain
      node so `gain` semantics stay untouched. */
  gainAutomation?: { timeSec: number; mul: number }[]
  clips: { startSec: number; durationSec?: number; buffer: AudioBuffer | null }[]
}

export async function renderMixdownBuffer(tracks: MixTrack[], lengthSec: number, masterGain: number, fades?: { inSec?: number; outSec?: number }): Promise<AudioBuffer> {
  const frames = Math.max(1, Math.ceil(SAMPLE_RATE * lengthSec))
  const ctx = new OfflineAudioContext(2, frames, SAMPLE_RATE)
  const master = ctx.createGain()
  const fi = Math.max(0, fades?.inSec ?? 0)
  const fo = Math.max(0, fades?.outSec ?? 0)
  if (fi > 0.05 || fo > 0.05) {
    master.gain.setValueAtTime(fi > 0.05 ? 0 : masterGain, 0)
    if (fi > 0.05) master.gain.linearRampToValueAtTime(masterGain, Math.min(fi, lengthSec / 3))
    if (fo > 0.05) {
      master.gain.setValueAtTime(masterGain, Math.max(0, lengthSec - fo))
      master.gain.linearRampToValueAtTime(0, lengthSec)
    }
  } else {
    master.gain.value = masterGain
  }
  master.connect(ctx.destination)
  for (const t of tracks) {
    const g = ctx.createGain()
    g.gain.value = t.gain
    const pan = ctx.createStereoPanner()
    pan.pan.value = Math.max(-1, Math.min(1, t.pan ?? 0))
    const fx = buildEffectsChain(ctx, t.effects)
    let head: AudioNode = g
    if (t.gainAutomation?.length) {
      const duck = ctx.createGain()
      const pts = [...t.gainAutomation].sort((a, b) => a.timeSec - b.timeSec)
      duck.gain.setValueAtTime(pts[0].timeSec <= 0 ? pts[0].mul : 1, 0)
      for (const p of pts) {
        if (p.timeSec <= 0) continue
        duck.gain.linearRampToValueAtTime(p.mul, Math.min(lengthSec, p.timeSec))
      }
      g.connect(duck)
      head = duck
    }
    head.connect(fx.input)
    fx.output.connect(pan).connect(master)
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

export async function renderMixdown(tracks: MixTrack[], lengthSec: number, masterGain: number, fades?: { inSec?: number; outSec?: number }): Promise<Blob> {
  return audioBufferToWav(await renderMixdownBuffer(tracks, lengthSec, masterGain, fades))
}
