/* ============================================================================
   Good Loop — Renderer v3 (Protocol Datasheet + real assets → WAV)
   Executes a parsed Datasheet offline, mixing the PO's produced library
   (Supabase bucket `protocol-audio/assets/…`) with the synth layers:

     • music        — real stems per phase per MappaMusicale, chosen in the
                      Asset Library (AssetMap), looped when shorter than the
                      phase and joined with EQUAL-POWER crossfades at every
                      phase boundary and loop seam. No stem mapped → warm
                      synth pad following the phase's key progression.
     • soundscape   — looping textures per phase (AssetMap), equal-power
                      crossfades at loop seams and phase changes; fallback to
                      the Studio texture synth mapped from MappaMusicale.
     • heartbeat    — NEW: 60 BPM sub-audio lub-dub, −24 dB (Standard) /
                      −20 dB (Deep) vs voice, F2–F4 per the Versioni sheet.
                      Synth until the PO file arrives; a mapped file loops.
     • singing bowl — NEW: synth strike (inharmonic partials, long decay) at
                      the timeline BOWL rows plus the Versioni schedule
                      ("Transizioni + F3 ogni 30 s"); a mapped file overrides.
     • binaural     — invariant beat (8 Hz, 198/206 Hz), per-version fade-in;
                      Deep transitions to Theta in F4 only, per the sheet.
     • bilateral    — 600 Hz sinusoidal 100 ms blips (per Invarianti), every
                      4 s (Standard) / 3 s (Deep) in the loop phase, alt L/R.
     • voice        — every VOCE/LOOP/ECO/SUSSURRO timeline row through the
                      active TTS provider; per-row dB honored; affirmation
                      loops get the PER-VERSION fades (1.0/2.0 · 1.5/2.5 ·
                      1.5/3.0 s); echo/whisper stacking from the version
                      params when the timeline doesn't spell them out.

   Mixing law unchanged from doc 06: voice 80% reference; soundscape −20 dB;
   echo −8 dB (+2 s); whisper −12 dB; bilateral ~6%; binaural −16 dB and
   music −18 dB (both still unspecified by the PO — flagged in notes).
   ============================================================================ */

import { SAMPLE_RATE } from '../studio/multitrack'
import { audioBufferToWav } from '../lib/wav'
import { getTtsProvider } from '../tts'
import { DEFAULT_PRIMARY, DEFAULT_SECONDARY, matchVoiceFromText } from '../tts/voiceCatalog'
import { timeStretch } from '../studio/timestretch'
import { harmonizeBuffer } from '../studio/effects'
import type { Duration } from '../types/domain'
import { fetchAssetBuffer, type AssetMap, type PhaseKey } from './assets'
import { fmtTime, speakableText, timelineReady, type Datasheet, type DsPhase, type DsRowKind, type DsTimelineRow, type DsVersionParams } from './datasheet'

export interface DsRenderOptions {
  duration: Duration
  /** Synthesize the spoken rows (needs a render-capable TTS provider). */
  withVoice: boolean
  /** Render only the first N seconds (preview). Omit for the full session. */
  capSeconds?: number
  /** Phase → storage-path assignments from the Asset Library. */
  assetMap?: AssetMap
}

export interface DsRenderResult {
  blob: Blob
  buffer: AudioBuffer
  seconds: number
  voiceLines: number
  voiceRendered: number
  /** Phases that played a real stem (vs the synth fallback). */
  stemsUsed: number
  notes: string[]
}

export type DsRenderProgress = (stage: 'voice' | 'assets' | 'mix', done: number, total: number) => void

/* --------------------------------------------------------------- levels */

const VOICE_REF = 0.8
const dB = (x: number) => Math.pow(10, x / 20)
const LEVEL = {
  voice: VOICE_REF,
  bilateral: 0.06, // Invarianti: "5–8% (sottofondo percepibile)" — absolute by doc
} as const

const XFADE_PHASE_DEFAULT = 4 // s — equal-power crossfade at phase boundaries
const XFADE_LOOP = 2  // s — equal-power crossfade at loop seams

/* --------------------------------------------- loudness measurement
   The PO library is ALREADY normalized (music −18 LUFS, soundscapes −24 LUFS),
   and TTS voice arrives near full scale. Fixed gains derived from the doc's
   "−18/−20 dB vs voice" therefore attenuated the files TWICE (≈ −36/−46 dBFS
   effective — inaudible). v3.1 measures the RMS of every decoded buffer and
   of the rendered voice, and gains each layer so it sits at its documented
   offset relative to the MEASURED voice loudness. */

/** Strided RMS of a buffer (fast enough for multi-minute stems). */
function bufferRms(buf: AudioBuffer): number {
  const stride = Math.max(1, Math.floor(buf.length / 200_000))
  let sum = 0
  let n = 0
  for (let ch = 0; ch < Math.min(2, buf.numberOfChannels); ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < d.length; i += stride) { sum += d[i] * d[i]; n++ }
  }
  return n ? Math.sqrt(sum / n) : 0
}

/** Nominal voice RMS when rendering bed-only (≈ TTS at the 0.8 voice gain). */
const NOMINAL_VOICE_RMS = 0.13

/** Gain that puts `buf` at `offsetDb` below the voice reference RMS. */
function gainForOffset(buf: AudioBuffer, voiceRefRms: number, offsetDb: number): number {
  const rms = bufferRms(buf)
  if (rms < 1e-4) return 1 // silent/broken file — leave as-is, the note will say so
  return Math.min(2.5, Math.max(0.005, (voiceRefRms * dB(offsetDb)) / rms))
}

/* ------------------------------------------------- equal-power fades */

const CURVE_STEPS = 64
const fadeInCurve = (level: number): Float32Array => {
  const c = new Float32Array(CURVE_STEPS)
  for (let i = 0; i < CURVE_STEPS; i++) c[i] = level * Math.sin((i / (CURVE_STEPS - 1)) * Math.PI / 2)
  return c
}
const fadeOutCurve = (level: number): Float32Array => {
  const c = new Float32Array(CURVE_STEPS)
  for (let i = 0; i < CURVE_STEPS; i++) c[i] = level * Math.cos((i / (CURVE_STEPS - 1)) * Math.PI / 2)
  return c
}

/* --------------------------------------------- breathing pacer (RESPIRAZIONE)
   A soft "air" pacer the listener can entrain to: band-passed noise swells —
   rising for the inhale, falling for the exhale, silent on holds. Pattern
   timings from the PO catalog (Scheda 8); unknown patterns fall back to
   coherent 5-5. Rendered inside the phase declared by the RESPIRAZIONE row. */

/** [inhale, hold, exhale, hold] seconds per named pattern. */
function breathTimings(pattern: string): number[] {
  const p = pattern.toLowerCase()
  const nums = (p.match(/\d+(?:[.,]\d+)?/g) ?? []).map((x) => parseFloat(x.replace(',', '.')))
  if (/sospiro|sigh/.test(p)) return [-1, 0, 0, 0] // special-cased below
  if (/box/.test(p)) return nums.length >= 4 ? nums.slice(0, 4) : [4, 4, 4, 4]
  if (nums.length >= 4) return nums.slice(0, 4)
  if (nums.length === 3) return [nums[0], nums[1], nums[2], 0] // 4-7-8, 4-4-6
  if (nums.length === 2) return [nums[0], 0, nums[1], 0] // 5-5, 6-6, 4-6
  return [5, 0, 5, 0] // coherent default
}

function synthBreathPacer(
  ctx: OfflineAudioContext, dest: AudioNode,
  at: number, pattern: string, cycles: number, level: number,
): number {
  const mkNoise = (dur: number): AudioBuffer => {
    const len = Math.max(64, Math.ceil(dur * SAMPLE_RATE))
    const b = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate: SAMPLE_RATE })
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch)
      let last = 0
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = 0.985 * last + 0.015 * w; d[i] = last * 8 }
    }
    return b
  }
  const swell = (t0: number, dur: number, rising: boolean) => {
    if (dur < 0.4) return
    const src = ctx.createBufferSource()
    src.buffer = mkNoise(dur + 0.3)
    // dark, breath-like band (double low-pass ≈ air, no hiss) with a gentle
    // pitch drift up on the inhale, down on the exhale
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.setValueAtTime(rising ? 300 : 420, t0)
    bp.frequency.linearRampToValueAtTime(rising ? 480 : 240, t0 + dur)
    bp.Q.value = 0.5
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 900
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t0)
    // slow sinusoid-ish swell: ease in AND out, never abrupt
    if (rising) {
      g.gain.linearRampToValueAtTime(level * 0.4, t0 + dur * 0.35)
      g.gain.linearRampToValueAtTime(level, t0 + dur * 0.8)
      g.gain.linearRampToValueAtTime(0, t0 + dur + 0.2)
    } else {
      g.gain.linearRampToValueAtTime(level, t0 + dur * 0.3)
      g.gain.linearRampToValueAtTime(level * 0.35, t0 + dur * 0.8)
      g.gain.linearRampToValueAtTime(0, t0 + dur + 0.2)
    }
    src.connect(bp).connect(lp).connect(g).connect(dest)
    src.start(t0)
    src.stop(t0 + dur + 0.3)
  }
  let t = at
  const timings = breathTimings(pattern)
  for (let c = 0; c < cycles; c++) {
    if (timings[0] === -1) {
      // Sospiro Fisiologico: double nasal inhale + long mouth exhale
      swell(t, 1.6, true); t += 1.7
      swell(t, 0.9, true); t += 1.0
      swell(t, 5.0, false); t += 6.0
    } else {
      const [inh, h1, exh, h2] = timings
      swell(t, inh, true); t += inh + h1
      swell(t, exh, false); t += exh + h2
    }
    t += 0.4
  }
  return t - at
}

/** Schedule one buffer window [at, at+dur) with equal-power in/out ramps.
    Loops the buffer with equal-power seams when it's shorter than dur.
    Automation is scheduled so no event ever falls INSIDE (or exactly at the
    start of) a setValueCurveAtTime range — per spec that throws, and even
    where tolerated the behavior is undefined across browsers. */
function scheduleLooped(
  ctx: OfflineAudioContext, buffer: AudioBuffer, dest: AudioNode,
  at: number, dur: number, level: number, inSec: number, outSec: number,
): void {
  const bufDur = buffer.duration
  const seam = Math.min(XFADE_LOOP, bufDur / 4)
  let t = at
  const end = at + dur
  let first = true
  while (t < end - 0.01) {
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const g = ctx.createGain()
    g.gain.value = 0 // intrinsic value before the first event
    const stopAt = Math.min(t + bufDur, end)
    const playDur = stopAt - t
    const gIn = Math.min(first ? inSec : seam, playDur / 3)
    const isLast = t + bufDur >= end - seam
    const gOut = Math.min(isLast ? outSec : seam, playDur / 3)
    const t0 = Math.max(0, t)
    if (gIn > 0.02) {
      g.gain.setValueCurveAtTime(fadeInCurve(level), t0, gIn)
      g.gain.setValueAtTime(level, t0 + gIn + 0.005) // hold, safely after the curve
    } else {
      g.gain.setValueAtTime(level, t0)
    }
    const outStart = Math.max(t0 + gIn + 0.02, stopAt - gOut)
    if (gOut > 0.02 && stopAt - outStart > 0.02) {
      g.gain.setValueCurveAtTime(fadeOutCurve(level), outStart, stopAt - outStart)
    } else {
      g.gain.setValueAtTime(level, Math.max(t0 + gIn + 0.03, stopAt - 0.02))
      g.gain.linearRampToValueAtTime(0, stopAt)
    }
    src.connect(g).connect(dest)
    src.start(t0)
    src.stop(stopAt + 0.05)
    // next iteration starts one seam BEFORE this one ends (overlap = crossfade)
    t = t + bufDur - (isLast ? 0 : seam)
    first = false
  }
}

/* ------------------------------------------------- synth provisionals (bowl/heartbeat stay until PO files arrive) */

function synthBowl(ctx: OfflineAudioContext, dest: AudioNode, at: number, decaySec: number, level: number): void {
  const f0 = 196 // G3-region fundamental — typical mid-size bowl
  const partials = [
    { r: 1.0, g: 1.0 }, { r: 2.71, g: 0.55 }, { r: 5.05, g: 0.28 }, { r: 8.2, g: 0.12 },
  ]
  for (const p of partials) {
    for (const beat of [-1.2, 1.2]) { // detuned pair → characteristic shimmer
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = f0 * p.r + beat
      const g = ctx.createGain()
      const peak = (level * p.g) / (partials.length * 1.4)
      g.gain.setValueAtTime(0, at)
      g.gain.linearRampToValueAtTime(peak, at + 0.015) // strike transient
      g.gain.exponentialRampToValueAtTime(Math.max(1e-4, peak * 1e-3), at + decaySec)
      osc.connect(g).connect(dest)
      osc.start(at)
      osc.stop(at + decaySec + 0.1)
    }
  }
}

/** Heartbeat lub-dub at `bpm`, sub-audio soft-percussive (synth provisional). */
function synthHeartbeat(ctx: OfflineAudioContext, dest: AudioNode, at: number, dur: number, bpm: number, level: number): void {
  const period = 60 / bpm
  const thump = (t: number, freq: number, lenSec: number, gain: number) => {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, t)
    osc.frequency.exponentialRampToValueAtTime(freq * 0.72, t + lenSec)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(gain, t + 0.012)
    g.gain.exponentialRampToValueAtTime(Math.max(1e-4, gain * 1e-3), t + lenSec)
    osc.connect(g).connect(dest)
    osc.start(t)
    osc.stop(t + lenSec + 0.05)
  }
  // ramp the layer in/out so it never pops at the window edges
  const win = ctx.createGain()
  win.gain.setValueAtTime(0, Math.max(0, at))
  win.gain.linearRampToValueAtTime(1, at + 3)
  win.gain.setValueAtTime(1, Math.max(at + 3, at + dur - 3))
  win.gain.linearRampToValueAtTime(0, at + dur)
  win.connect(dest)
  for (let t = at; t < at + dur - 0.4; t += period) {
    thump(t, 54, 0.11, level)          // lub
    thump(t + 0.30, 46, 0.09, level * 0.7) // dub
  }
}

/* ------------------------------------------------------- row helpers */

interface VoiceJob {
  timeSec: number
  text: string
  pan: number
  gainDb: number
  delaySec: number
  fadeIn: number
  fadeOut: number
  secondary: boolean // [M] voice row
  /** Declared voice: catalog name or archetype (single-tab rows / per-aff). */
  voiceName?: string
  /** Row effect: CORO (harmonized chorus) or ECO (extra delayed copy). */
  effect?: 'CORO' | 'ECO'
  /** Pitch-preserving speed for this row (0.7–1.4). */
  speed?: number
}

const PAN: Record<string, number> = { C: 0, L: -1, R: 1 }

/** Build the ordered voice jobs of a version: the timeline's spoken rows plus
    the stacking the Versioni sheet prescribes when the timeline doesn't spell
    it out (echo −8 dB +2 s on LOOP rows; the Deep continuous whisper is a
    separate looped layer, handled in the renderer body). */
export function deriveVoiceJobs(ds: Datasheet, v: DsVersionParams, rows: DsTimelineRow[]): VoiceJob[] {
  const jobs: VoiceJob[] = []
  const affByRec = new Map(ds.affirmations.map((a) => [a.id, a]))
  const timelineHasEcho = rows.some((r) => r.kind === 'ECO')
  for (const row of rows) {
    if (row.channel === 'SYS') continue
    if (!(row.kind === 'VOCE' || row.kind === 'LOOP' || row.kind === 'ECO' || row.kind === 'SUSSURRO')) continue
    const text = speakableText(row)
    if (!text) continue
    const isLoop = row.kind === 'LOOP'
    const mix = ds.mix
    const isDich = row.channel === 'L' || row.channel === 'R'
    // ### MIX overrides the doc-standard echo/whisper levels per protocol
    // (e.g. GL-STRESS: eco dicotico −6 dB/+2 s vs eco loop −8 dB/+3 s)
    const ecoDb = isDich ? (mix?.echoDichoticGainDb ?? mix?.echoLoopGainDb ?? -8) : (mix?.echoLoopGainDb ?? -8)
    const ecoDelay = isDich ? (mix?.echoDichoticDelaySec ?? mix?.echoLoopDelaySec ?? 2) : (mix?.echoLoopDelaySec ?? 2)
    const defaultDb = row.kind === 'ECO' ? ecoDb : row.kind === 'SUSSURRO' ? (mix?.whisperGainDb ?? -12) : 0
    const affVoice = isLoop && row.rec ? affByRec.get(row.rec.toUpperCase())?.voiceName : undefined
    jobs.push({
      timeSec: row.timeSec,
      text,
      pan: row.pan ?? PAN[row.channel] ?? 0,
      gainDb: row.gainDb ?? defaultDb,
      delaySec: row.delaySec ?? (row.kind === 'ECO' ? ecoDelay : 0),
      fadeIn: isLoop ? v.affFadeInSec : 0.06,
      fadeOut: isLoop ? v.affFadeOutSec : 0.08,
      secondary: row.voice === 'M',
      voiceName: row.voiceName ?? affVoice,
      effect: row.effect,
      speed: row.speed,
    })
    // Versioni-prescribed echo stacking on affirmation loops (Standard/Deep),
    // only when the timeline hasn't been compiled with explicit ECO rows.
    if (isLoop && !timelineHasEcho && (v.stacking === 'echo' || v.stacking === 'triple')) {
      const kw = row.rec ? affByRec.get(row.rec.toUpperCase())?.echoKeywords : undefined
      if (kw) {
        jobs.push({
          timeSec: row.timeSec, text: kw, pan: row.pan ?? PAN[row.channel] ?? 0,
          gainDb: (row.gainDb ?? 0) + (mix?.echoLoopGainDb ?? -8), delaySec: mix?.echoLoopDelaySec ?? 2,
          fadeIn: v.affFadeInSec, fadeOut: v.affFadeOutSec, secondary: false,
        })
      }
    }
  }
  return jobs
}

/** Dichotic exploration layer (Versioni: "Intervallo dicotico") — derived only
    when the timeline hasn't been compiled with explicit L/R spoken rows.
    Alternating hard-panned affirmations from the version's REC sub-set every
    `intervalSec`, for `alternations` slots, inside the dichotic phase (the
    Fasi row named "…Dicotica", else F3). With `doubleInduction` (24-min Deep)
    each slot speaks TWO different affirmations simultaneously, one per ear. */
export function deriveDichoticJobs(ds: Datasheet, v: DsVersionParams, rows: DsTimelineRow[], phases: DsPhase[]): VoiceJob[] {
  const di = v.dichotic
  if (!di) return []
  const spoken = (k: DsRowKind) => k === 'VOCE' || k === 'LOOP' || k === 'ECO' || k === 'SUSSURRO'
  const timelineHasLR = rows.some((r) => (r.channel === 'L' || r.channel === 'R') && spoken(r.kind) && !!speakableText(r))
  if (timelineHasLR) return [] // the compiled timeline spells the panning out
  const ph = phases.find((p) => /dicoti/i.test(p.name) || /dicoti/i.test(p.notes)) ?? phases.find((p) => p.id === 3)
  if (!ph) return []
  const affByRec = new Map(ds.affirmations.map((a) => [a.id, a]))
  const pool = v.recSubset.map((id) => affByRec.get(id)?.text).filter((t): t is string => !!t)
  const texts = pool.length ? pool : ds.affirmations.filter((a) => a.inVersion[v.duration]).map((a) => a.text)
  if (!texts.length) return []
  const gainDb = di.gainDb ?? -5
  const jobs: VoiceJob[] = []
  let ti = 0
  const next = () => texts[ti++ % texts.length]
  let side: 1 | -1 = -1 // start left, per the compiled 6-min timeline's L-first pattern
  for (let slot = 0, t = ph.startSec + 2; slot < di.alternations && t < ph.endSec - 4; slot++, t += di.intervalSec) {
    if (di.doubleInduction) {
      const a = next()
      let b = next()
      if (b === a && texts.length > 1) b = next() // two EARS, two texts
      jobs.push({ timeSec: t, text: a, pan: -1, gainDb, delaySec: 0, fadeIn: v.affFadeInSec, fadeOut: v.affFadeOutSec, secondary: false })
      jobs.push({ timeSec: t, text: b, pan: 1, gainDb, delaySec: 0, fadeIn: v.affFadeInSec, fadeOut: v.affFadeOutSec, secondary: true })
    } else {
      jobs.push({ timeSec: t, text: next(), pan: side, gainDb, delaySec: 0, fadeIn: v.affFadeInSec, fadeOut: v.affFadeOutSec, secondary: false })
      side = side === -1 ? 1 : -1
    }
  }
  return jobs
}

/** Bowl strike schedule: timeline BOWL rows + the Versioni prescription. */
export function deriveBowlStrikes(v: DsVersionParams, rows: DsTimelineRow[], phases: DsPhase[], totalSec: number): { atSec: number; decaySec: number }[] {
  const strikes: { atSec: number; decaySec: number }[] = []
  const near = (t: number) => strikes.some((s) => Math.abs(s.atSec - t) < 3)
  for (const r of rows) {
    if (r.kind !== 'BOWL') continue
    const long = /riverbero lungo|riverbero 10/i.test(r.text)
    strikes.push({ atSec: r.timeSec, decaySec: long ? 10 : 8 })
  }
  const raw = v.bowlRaw ?? ''
  if (/transizioni/i.test(raw)) {
    for (const p of phases) {
      if (p.id === 1 || p.startSec <= 0.5) continue
      if (!near(p.startSec)) strikes.push({ atSec: p.startSec, decaySec: 8 })
    }
  }
  const every = /F(\d)\s+ogni\s+(\d+)\s*s/i.exec(raw.replace(/\u2212/g, '-'))
  if (every) {
    const ph = phases.find((p) => p.id === Number(every[1]))
    if (ph) {
      for (let t = ph.startSec + Number(every[2]); t < ph.endSec - 5; t += Number(every[2])) {
        if (!near(t)) strikes.push({ atSec: t, decaySec: 6 })
      }
    }
  }
  if (/chiusura/i.test(raw)) {
    const decay = Number(/riverbero\s+(\d+)/i.exec(raw)?.[1] ?? 10)
    const t = totalSec - decay * 0.6
    if (!near(t)) strikes.push({ atSec: t, decaySec: decay })
  }
  return strikes.filter((s) => s.atSec < totalSec - 1).sort((a, b) => a.atSec - b.atSec)
}

/* --------------------------------------------------------------- render */

export async function renderDatasheetWav(ds: Datasheet, opts: DsRenderOptions, onProgress?: DsRenderProgress): Promise<DsRenderResult> {
  const v = ds.versions.find((x) => x.duration === opts.duration)
  if (!v) throw new Error(`This datasheet has no ${opts.duration}-minute version.`)
  if (!timelineReady(ds, opts.duration)) {
    throw new Error(`Timeline_${opts.duration}min is not compiled yet — fill the timeline sheet and re-import before rendering this version.`)
  }
  const rows = ds.timelines[opts.duration]!
  const phases = ds.phases.filter((p) => p.duration === opts.duration)
  if (!phases.length) throw new Error(`The Fasi sheet has no phases for the ${opts.duration}-minute version.`)

  const notes: string[] = []
  const fullSec = opts.duration * 60
  const totalSec = Math.max(10, Math.min(fullSec, opts.capSeconds ?? fullSec))
  if (totalSec < fullSec) notes.push(`Preview render — first ${totalSec}s of ${fullSec}s.`)
  const map = opts.assetMap

  /* ---- 1. voice (TTS) ---- */
  const dichoticJobs = deriveDichoticJobs(ds, v, rows, phases)
  if (dichoticJobs.length) {
    notes.push(`Dichotic layer derived from the Versioni sheet — ${dichoticJobs.length} hard-panned utterance${dichoticJobs.length === 1 ? '' : 's'} every ${v.dichotic!.intervalSec}s${v.dichotic!.doubleInduction ? ' (double induction: two affirmations at once, one per ear)' : ''}; a compiled timeline with explicit L/R rows overrides this.`)
  }
  const jobs = [...deriveVoiceJobs(ds, v, rows), ...dichoticJobs]
    .sort((a, b) => a.timeSec - b.timeSec)
    .filter((j) => j.timeSec + j.delaySec < totalSec - 1)
  const voiceBuffers: { job: VoiceJob; buffer: AudioBuffer }[] = []
  let whisperLoopBuffer: AudioBuffer | null = null
  let voiceRendered = 0
  const tts = getTtsProvider()
  if (opts.withVoice && (jobs.length || v.continuousWhisper)) {
    if (!tts.canRender) {
      notes.push(`No render-capable TTS configured (${tts.label} is preview-only) — rendered the bed without voice.`)
    } else {
      const decoder = new AudioContext({ sampleRate: SAMPLE_RATE })
      const cache = new Map<string, AudioBuffer>()
      // The DATASHEET decides the voices, most specific wins:
      //   1. the row's own Voce column (catalog name or archetype)
      //   2. the affirmation's Voce (AFFERMAZIONI section)
      //   3. protocol defaults ("Voce predefinita" / "Voce [M] predefinita")
      //   4. Invarianti "Voce primaria/secondaria" archetype match
      //   5. the engine defaults (Valeria / Marco)
      const dsPrimary = matchVoiceFromText(ds.defaultVoice)
        ?? matchVoiceFromText(ds.invariants.find((i) => /voce primaria|voce predefinita/i.test(i.param))?.value)
      const dsSecondary = matchVoiceFromText(ds.defaultVoiceM)
        ?? matchVoiceFromText(ds.invariants.find((i) => /voce secondaria/i.test(i.param))?.value)
      notes.push(`Voices: [F] ${dsPrimary ? `${dsPrimary.name} (from the datasheet)` : `${DEFAULT_PRIMARY.name} (default — the datasheet doesn't specify one)`} · [M] ${dsSecondary ? `${dsSecondary.name} (from the datasheet)` : `${DEFAULT_SECONDARY.name} (default)`}.`)
      const usedVoices = new Set<string>()
      const resolveJobVoice = (job: VoiceJob): string | undefined => {
        const rowMatch = matchVoiceFromText(job.voiceName)
        const id = rowMatch?.id ?? (job.secondary ? dsSecondary?.id : dsPrimary?.id)
        if (rowMatch) usedVoices.add(rowMatch.name)
        if (job.voiceName && !rowMatch) notes.push(`Voice "${job.voiceName}" at ${fmtTime(job.timeSec)} is not in the PO catalog — the default was used.`)
        return id
      }
      const renderText = async (text: string, voice: 'primary' | 'secondary' = 'primary', voiceId?: string): Promise<AudioBuffer> => {
        const key = `${voiceId ?? voice}|${text}`
        let buf = cache.get(key)
        if (!buf) {
          const bytes = await tts.render(text, { lang: 'it', voice, voiceId })
          buf = await decoder.decodeAudioData(bytes.slice(0))
          cache.set(key, buf)
        }
        return buf
      }
      try {
        for (let i = 0; i < jobs.length; i++) {
          onProgress?.('voice', i, jobs.length)
          try {
            {
              let vb = await renderText(jobs[i].text, jobs[i].secondary ? 'secondary' : 'primary', resolveJobVoice(jobs[i]))
              const sp = jobs[i].speed
              if (sp && Math.abs(sp - 1) > 0.02) vb = timeStretch(vb, Math.max(0.7, Math.min(1.4, sp)))
              if (jobs[i].effect === 'CORO') {
                vb = await harmonizeBuffer(vb, { voices: 3, spreadCents: 22, octave: 0, mix: 0.55 })
              }
              voiceBuffers.push({ job: jobs[i], buffer: vb })
            }
            voiceRendered++
          } catch (e) {
            notes.push(`Voice row at ${fmtTime(jobs[i].timeSec)} failed: ${(e as Error).message}`)
          }
        }
        // Deep continuous-whisper loop (Layer 9): quoted loop text from the
        // LayerEngine sheet, else the refrain's keywords.
        const hasWhisperRows = rows.some((r) => r.kind === 'SUSSURRO')
        if (v.continuousWhisper && !hasWhisperRows) {
          const layer9 = ds.layers.find((l) => /sussurro continuo/i.test(l.description))
          const quoted = layer9 ? /["\u201c]([^"\u201d]+)["\u201d]/.exec(layer9.description)?.[1] : undefined
          const text = quoted ?? (ds.refrain ? ds.refrain.toLowerCase().split(/[,\s]+/).filter((w) => w.length > 3).join('… ') + '…' : 'centro… respiro… pace…')
          try { whisperLoopBuffer = await renderText(text, 'secondary', dsSecondary?.id) } catch (e) { notes.push(`Continuous whisper failed: ${(e as Error).message}`) }
        }
      } finally {
        await decoder.close()
      }
      onProgress?.('voice', jobs.length, jobs.length)
      if (jobs.some((j) => j.secondary)) {
        notes.push(`Secondary [M] voice rows: ${jobs.filter((j) => j.secondary).length} (rendered with ${dsSecondary?.name ?? DEFAULT_SECONDARY.name}).`)
      }
      if (usedVoices.size) notes.push(`Row-level voices from the datasheet: ${[...usedVoices].join(', ')}.`)
    }
  } else if (!opts.withVoice && jobs.length) {
    notes.push(`Bed-only render — ${jobs.length} spoken rows were not synthesized.`)
  }

  /* ---- 2. fetch the mapped assets ---- */
  const phaseKey = (id: number): PhaseKey => `f${Math.min(6, Math.max(1, id))}` as PhaseKey
  const wanted = new Set<string>()
  for (const p of phases) {
    if (p.startSec >= totalSec) continue
    const mk = map?.music[phaseKey(p.id)]
    const sk = map?.soundscape[phaseKey(p.id)]
    if (mk) wanted.add(mk)
    if (sk) wanted.add(sk)
  }
  if (map?.heartbeat && v.heartbeat) wanted.add(map.heartbeat)
  if (map?.bowl) wanted.add(map.bowl)
  const assetBuffers = new Map<string, AudioBuffer>()
  {
    const list = [...wanted]
    for (let i = 0; i < list.length; i++) {
      onProgress?.('assets', i, list.length)
      try {
        assetBuffers.set(list[i], await fetchAssetBuffer(list[i]))
      } catch (e) {
        notes.push(`Asset ${list[i]} failed to load (${(e as Error).message}) — synth fallback used.`)
      }
    }
    onProgress?.('assets', list.length, list.length)
  }

  /* ---- 3. fallback soundscape textures (pre-rendered per phase) ---- */
  const XFADE_PHASE = ds.mix?.phaseCrossfadeSec ?? XFADE_PHASE_DEFAULT
  const unmappedMusic: number[] = []
  const unmappedScape: number[] = []

  /* ---- 4. offline mix ---- */
  onProgress?.('mix', 0, 1)
  const ctx = new OfflineAudioContext(2, Math.ceil(totalSec * SAMPLE_RATE), SAMPLE_RATE)
  const master = ctx.createGain()
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -3
  limiter.knee.value = 3
  limiter.ratio.value = 12
  limiter.attack.value = 0.003
  limiter.release.value = 0.25
  master.connect(limiter).connect(ctx.destination)

  // measured voice reference: mean RMS of the rendered normal-level voice
  // clips at the 0.8 voice gain (nominal fallback when rendering bed-only)
  let voiceRefRms = NOMINAL_VOICE_RMS
  {
    const normal = voiceBuffers.filter(({ job }) => job.gainDb >= -1)
    if (normal.length) {
      const mean = normal.reduce((s, { buffer }) => s + bufferRms(buffer), 0) / normal.length
      if (mean > 1e-3) voiceRefRms = mean * LEVEL.voice
    }
  }
  // makeup: soft TTS voices previously dragged the WHOLE mix down (every
  // layer follows the measured voice). Lift the master so the voice lands
  // near the target session loudness; layer relationships ride along intact.
  const TARGET_VOICE_RMS = 0.14 // ≈ −17 dBFS, comfortable session level pre-limiter
  const makeup = Math.min(3, Math.max(1, TARGET_VOICE_RMS / voiceRefRms))
  master.gain.value = 0.9 * makeup
  notes.push(`Mix law (loudness-measured): voice ref RMS ${voiceRefRms.toFixed(3)} · master makeup ×${makeup.toFixed(2)} → voice ≈ −17 dBFS · music −18 dB · soundscape −20 dB · echo −8 dB (+2 s) · whisper −12 dB · bilateral ~6% · loop fades ${v.affFadeInSec}/${v.affFadeOutSec} s (${opts.duration}-min).`)
  // one explicit line so it's auditable that every psychoacoustic layer of
  // THIS version was scheduled (or is off by design in the datasheet)
  notes.push(`Layers (${opts.duration}-min per datasheet): binaural ${v.binaural.beatHz} Hz ON${v.binaural.theta ? ` (Theta ${v.binaural.theta.beatHz} Hz in F${v.binaural.theta.phase})` : ''} · bilateral ${v.bilateral ? `${v.bilateral.toneHz} Hz/${v.bilateral.everySec}s ON` : 'OFF by design'} · heartbeat ${v.heartbeat ? `${v.heartbeat.gainDb} dB F${v.heartbeat.fromPhase}–F${v.heartbeat.toPhase} ON` : 'OFF by design'} · whisper ${v.continuousWhisper ? `${v.continuousWhisper.gainDb} dB F${v.continuousWhisper.phase} ON` : 'OFF by design'} · stacking ${v.stacking}.`)
  notes.push('Binaural −16 dB and music −18 dB vs voice — still not PO-specified; adjust in renderDatasheet.ts if a figure lands.')

  let stemsUsed = 0

  // music + soundscape, phase by phase, equal-power crossfaded at boundaries
  for (const p of phases) {
    if (p.startSec >= totalSec) continue
    const start = p.startSec
    const end = Math.min(p.endSec, totalSec)
    const isFirst = p.id === phases[0].id
    const isLast = end >= totalSec - 0.5
    // overlap half a crossfade into the neighbouring phases
    const at = isFirst ? start : start - XFADE_PHASE / 2
    const dur = (isLast ? end : end + XFADE_PHASE / 2) - at
    const inSec = isFirst ? Math.min(5, dur / 4) : XFADE_PHASE
    const outSec = isLast ? Math.min(4, dur / 4) : XFADE_PHASE

    // POLICY: only the REAL library files (f1–f6 mapping) play. No synth
    // pads, no synth textures — an unmapped phase is silent, and the notes
    // say so. The excel's MUSICA section is metadata only.
    const musicPath = map?.music[phaseKey(p.id)]
    const stem = musicPath ? assetBuffers.get(musicPath) : undefined
    if (stem) {
      scheduleLooped(ctx, stem, master, at, dur, gainForOffset(stem, voiceRefRms, ds.mix?.musicDb ?? -18), inSec, outSec)
      stemsUsed++
    } else {
      unmappedMusic.push(p.id)
    }

    const scapePath = map?.soundscape[phaseKey(p.id)]
    const scape = scapePath ? assetBuffers.get(scapePath) : undefined
    if (scape) {
      scheduleLooped(ctx, scape, master, at, dur, gainForOffset(scape, voiceRefRms, ds.mix?.soundscapeDb ?? -20), inSec, outSec)
    } else {
      unmappedScape.push(p.id)
    }
  }
  if (unmappedMusic.length) notes.push(`Music: no library file mapped for F${[...new Set(unmappedMusic)].join('/F')} — those phases have no music (map f1–f6 in the Asset Library).`)
  if (unmappedScape.length) notes.push(`Soundscape: no library file mapped for F${[...new Set(unmappedScape)].join('/F')} — silent there (map in the Asset Library).`)

  // heartbeat (Layer 2)
  if (v.heartbeat) {
    const from = phases.find((p) => p.id === v.heartbeat!.fromPhase)
    const to = phases.find((p) => p.id === v.heartbeat!.toPhase)
    const at = Math.max(0, from?.startSec ?? 0)
    const end = Math.min(totalSec, to?.endSec ?? totalSec)
    if (end - at > 4) {
      const hbFile = map?.heartbeat ? assetBuffers.get(map.heartbeat) : undefined
      if (hbFile) scheduleLooped(ctx, hbFile, master, at, end - at, gainForOffset(hbFile, voiceRefRms, v.heartbeat.gainDb), 3, 3)
      else {
        // synth thump peaks ≈ its level → scale peak so RMS lands near target
        synthHeartbeat(ctx, master, at, end - at, 60, Math.min(0.5, voiceRefRms * dB(v.heartbeat.gainDb) * 6))
        notes.push(`Heartbeat: synth provisional at 60 BPM, ${v.heartbeat.gainDb} dB (F${v.heartbeat.fromPhase}–F${v.heartbeat.toPhase}) — swaps to the PO file automatically once mapped.`)
      }
    }
  }

  // singing bowl (Layer 3 accents)
  {
    const strikes = deriveBowlStrikes(v, rows, phases, totalSec)
    const bowlFile = map?.bowl ? assetBuffers.get(map.bowl) : undefined
    for (const s of strikes) {
      if (bowlFile) {
        const src = ctx.createBufferSource()
        src.buffer = bowlFile
        const g = ctx.createGain()
        g.gain.setValueAtTime(gainForOffset(bowlFile, voiceRefRms, -10), s.atSec)
        src.connect(g).connect(master)
        src.start(s.atSec)
        src.stop(Math.min(totalSec, s.atSec + bowlFile.duration) + 0.05)
      } else {
        synthBowl(ctx, master, s.atSec, s.decaySec, Math.min(0.5, voiceRefRms * dB(-10) * 4))
      }
    }
    if (strikes.length && !bowlFile) notes.push(`Singing bowl: ${strikes.length} synth strikes (provisional) — swaps to the PO file automatically once mapped.`)
  }

  // binaural / isochronic bed — per-phase curve when the FASI sheet declares
  // one (e.g. "Theta 7 Hz (rampa 90 s)"), else the version's invariant beat
  // (incl. the legacy Deep Theta transition). Isochronic mode (### MIX
  // "Tipo battimento: isocronico") pulses ONE carrier on both channels —
  // works without headphones per the Scheda 3 spec.
  {
    const b = v.binaural
    const phaseCurve = phases.filter((p) => p.binaural && p.startSec < totalSec)
    const beatAt = (sec: number): number => {
      const ph = phases.find((p) => sec >= p.startSec && sec < p.endSec)
      return ph?.binaural?.beatHz ?? b.beatHz
    }
    const binDb = ds.mix?.binauralDb ?? -16
    const binLevel = Math.min(0.2, voiceRefRms * dB(binDb) * Math.SQRT2)
    const isochronic = ds.mix?.beatType === 'isochronic'
    if (isochronic) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = (b.carrierLowHz + b.carrierHighHz) / 2
      const pulse = ctx.createGain()
      pulse.gain.value = 0
      // amplitude LFO at the (possibly phase-varying) beat frequency
      const lfo = ctx.createOscillator()
      lfo.type = 'sine'
      lfo.frequency.setValueAtTime(beatAt(0), 0)
      for (const p of phaseCurve) {
        const at = Math.min(totalSec, p.startSec)
        lfo.frequency.setValueAtTime(lfo.frequency.value, Math.max(0, at - 0.01))
        lfo.frequency.linearRampToValueAtTime(p.binaural!.beatHz, Math.min(totalSec, at + Math.min(p.binaural!.rampSec, (p.endSec - p.startSec) / 2)))
        const back = Math.min(totalSec, p.endSec)
        lfo.frequency.setValueAtTime(p.binaural!.beatHz, Math.max(0, back - 0.01))
        lfo.frequency.linearRampToValueAtTime(beatAt(back + 1), Math.min(totalSec, back + 30))
      }
      const lfoGain = ctx.createGain()
      lfoGain.gain.value = 0.5
      const dc = ctx.createConstantSource()
      dc.offset.value = 0.5
      lfo.connect(lfoGain).connect(pulse.gain)
      dc.connect(pulse.gain)
      const bg = ctx.createGain()
      osc.connect(pulse).connect(bg).connect(master)
      bg.gain.setValueAtTime(0, 0)
      bg.gain.linearRampToValueAtTime(binLevel, Math.min(ds.mix?.sessionFadeInSec ?? b.fadeInSec, totalSec / 3))
      bg.gain.setValueAtTime(binLevel, Math.max(0, totalSec - (ds.mix?.sessionFadeOutSec ?? b.fadeOutSec)))
      bg.gain.linearRampToValueAtTime(0, totalSec)
      osc.start(0); lfo.start(0); dc.start(0)
      osc.stop(totalSec); lfo.stop(totalSec); dc.stop(totalSec)
      notes.push(`Isochronic tones ${b.beatHz} Hz on a ${Math.round((b.carrierLowHz + b.carrierHighHz) / 2)} Hz carrier (MIX: tipo battimento).`)
    } else {
      const oscL = ctx.createOscillator()
      const oscR = ctx.createOscillator()
      oscL.type = 'sine'
      oscR.type = 'sine'
      oscL.frequency.setValueAtTime(b.carrierLowHz, 0)
      oscR.frequency.setValueAtTime(b.carrierHighHz, 0)
      if (phaseCurve.length) {
        // FASI-declared curve: ramp the RIGHT carrier so the perceived beat
        // follows each phase's target, ramping back after the phase ends
        for (const p of phaseCurve) {
          const target = b.carrierLowHz + p.binaural!.beatHz
          const at = Math.min(totalSec, p.startSec)
          const ramp = Math.min(p.binaural!.rampSec, Math.max(5, (p.endSec - p.startSec) / 2))
          oscR.frequency.setValueAtTime(oscR.frequency.value, Math.max(0, at - 0.01))
          oscR.frequency.linearRampToValueAtTime(target, Math.min(totalSec, at + ramp))
          const back = Math.min(totalSec, p.endSec)
          const nextBeat = beatAt(back + 1)
          if (back < totalSec - 1 && Math.abs(nextBeat - p.binaural!.beatHz) > 0.01) {
            oscR.frequency.setValueAtTime(target, Math.max(0, back - 0.01))
            oscR.frequency.linearRampToValueAtTime(b.carrierLowHz + nextBeat, Math.min(totalSec, back + Math.min(120, ramp)))
          }
        }
        notes.push(`Binaural curve from FASI: ${phaseCurve.map((p) => `F${p.id}→${p.binaural!.beatHz} Hz`).join(' · ')} (ramped).`)
      } else if (b.theta) {
        const ph = phases.find((p) => p.id === b.theta!.phase)
        if (ph && ph.startSec < totalSec) {
          const ramp = 10
          const inAt = ph.startSec
          const outAt = Math.min(totalSec, ph.endSec)
          oscR.frequency.setValueAtTime(b.carrierHighHz, inAt)
          oscR.frequency.linearRampToValueAtTime(b.carrierLowHz + b.theta.beatHz, Math.min(totalSec, inAt + ramp))
          if (outAt < totalSec - 1) {
            oscR.frequency.setValueAtTime(b.carrierLowHz + b.theta.beatHz, outAt)
            oscR.frequency.linearRampToValueAtTime(b.carrierHighHz, Math.min(totalSec, outAt + ramp))
          }
        }
      }
      const panL = ctx.createStereoPanner(); panL.pan.value = -1
      const panR = ctx.createStereoPanner(); panR.pan.value = 1
      const bg = ctx.createGain()
      oscL.connect(panL).connect(bg)
      oscR.connect(panR).connect(bg)
      bg.connect(master)
      bg.gain.setValueAtTime(0, 0)
      bg.gain.linearRampToValueAtTime(binLevel, Math.min(ds.mix?.sessionFadeInSec ?? b.fadeInSec, totalSec / 3))
      bg.gain.setValueAtTime(binLevel, Math.max(0, totalSec - (ds.mix?.sessionFadeOutSec ?? b.fadeOutSec)))
      bg.gain.linearRampToValueAtTime(0, totalSec)
      oscL.start(0); oscR.start(0)
      oscL.stop(totalSec); oscR.stop(totalSec)
    }
  }

  // Solfeggio layer — continuous tuning tone (432/528/396 Hz across the PO
  // protocols), soft triangle at the MIX level (default −22 dB vs voice)
  if (ds.mix?.solfeggioHz) {
    const osc = ctx.createOscillator()
    osc.type = 'sine' // pure — a triangle's harmonics clash with the music bed
    osc.frequency.value = ds.mix.solfeggioHz
    const g = ctx.createGain()
    const lvl = Math.min(0.1, voiceRefRms * dB(Math.min(-14, ds.mix.solfeggioDb ?? -22)))
    g.gain.value = 0
    g.gain.setValueAtTime(0, 0)
    g.gain.linearRampToValueAtTime(lvl, Math.min(20, totalSec / 4))
    g.gain.setValueAtTime(lvl, Math.max(0, totalSec - 15))
    g.gain.linearRampToValueAtTime(0, totalSec)
    osc.connect(g).connect(master)
    osc.start(0); osc.stop(totalSec)
    notes.push(`Solfeggio layer ${ds.mix.solfeggioHz} Hz at ${ds.mix.solfeggioDb ?? -22} dB vs voice (MIX).`)
  }

  // guided breathing pacer (### RESPIRAZIONE) — one entry per declared row
  {
    const rows = (ds.breathing ?? []).filter((b) => b.duration === opts.duration && b.guided)
    for (const b of rows) {
      const ph = phases.find((p) => p.id === b.phase)
      if (!ph || ph.startSec >= totalSec) continue
      const lvl = Math.min(0.12, voiceRefRms * dB(-24))
      const used = synthBreathPacer(ctx, master, Math.min(totalSec - 4, ph.startSec + 2), b.pattern, Math.max(1, b.cycles), lvl)
      notes.push(`Breathing pacer: ${b.pattern} ×${b.cycles} in F${b.phase} (${Math.round(used)} s of soft air swells at −24 dB).`)
    }
  }

  // bilateral blips in the loop phase (freq/blip/volume from Invarianti + MIX)
  if (v.bilateral) {
    // the phase whose Fasi note names the bilateral layer, else phase 4
    const ph = phases.find((p) => /bilat/i.test(p.notes)) ?? phases.find((p) => p.id === 4)
    if (ph && ph.startSec < totalSec) {
      const start = ph.startSec
      const end = Math.min(totalSec, ph.endSec)
      const dur = (ds.mix?.bilateralBlipMs ?? v.bilateral.blipMs) / 1000
      let side = -1
      for (let t = start; t < end - dur; t += v.bilateral.everySec) {
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.value = v.bilateral.toneHz
        const g = ctx.createGain()
        const pan = ctx.createStereoPanner()
        pan.pan.value = 0.8 * side
        side = -side
        g.gain.setValueAtTime(0, t)
        const bilLvl = ds.mix?.bilateralVolPct != null ? Math.min(0.15, ds.mix.bilateralVolPct / 100) : LEVEL.bilateral
        g.gain.linearRampToValueAtTime(bilLvl, t + 0.01)
        g.gain.setValueAtTime(bilLvl, t + Math.max(0.02, dur - 0.03))
        g.gain.linearRampToValueAtTime(0, t + dur)
        osc.connect(g).connect(pan).connect(master)
        osc.start(t)
        osc.stop(t + dur + 0.05)
      }
    }
  }

  // voice rows
  const scheduleVoice = (buffer: AudioBuffer, at: number, gainDb: number, panV: number, fadeIn: number, fadeOut: number) => {
    if (at >= totalSec - 0.2) return
    const gain = LEVEL.voice * dB(gainDb)
    const durSec = buffer.duration
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(gain, at + Math.min(fadeIn, durSec / 3))
    g.gain.setValueAtTime(gain, at + Math.max(0, durSec - fadeOut))
    g.gain.linearRampToValueAtTime(0, at + durSec)
    const pan = ctx.createStereoPanner()
    pan.pan.value = panV
    src.connect(g).connect(pan).connect(master)
    src.start(at)
  }
  for (const { job, buffer } of voiceBuffers) {
    scheduleVoice(buffer, job.timeSec + job.delaySec, job.gainDb, job.pan, job.fadeIn, job.fadeOut)
    if (job.effect === 'ECO') {
      // Effetto ECO: one extra delayed, attenuated copy of the same take
      const d = ds.mix?.echoLoopDelaySec ?? 2
      const g2 = job.gainDb + (ds.mix?.echoLoopGainDb ?? -8)
      scheduleVoice(buffer, job.timeSec + job.delaySec + d, g2, job.pan, job.fadeIn, Math.max(job.fadeOut, 0.4))
    }
  }
  {
    const n = voiceBuffers.filter(({ job }) => job.effect === 'CORO').length
    if (n) notes.push(`Effetto CORO applied to ${n} row(s) (harmonized chorus).`)
  }

  // Deep continuous whisper (Layer 9) — looped across its phase window
  if (whisperLoopBuffer && v.continuousWhisper) {
    const ph = phases.find((p) => p.id === v.continuousWhisper!.phase)
    if (ph && ph.startSec < totalSec) {
      const at = ph.startSec
      const dur = Math.min(totalSec, ph.endSec) - at
      // pad each pass with a breath of silence so the loop doesn't machine-gun
      const level = VOICE_REF * dB(ds.mix?.whisperGainDb ?? v.continuousWhisper.gainDb)
      const passDur = whisperLoopBuffer.duration + 2.5
      for (let t = at; t < at + dur - 1; t += passDur) {
        const src = ctx.createBufferSource()
        src.buffer = whisperLoopBuffer
        const g = ctx.createGain()
        const stop = Math.min(t + whisperLoopBuffer.duration, at + dur)
        g.gain.setValueAtTime(0, t)
        g.gain.linearRampToValueAtTime(level, t + 0.8)
        g.gain.setValueAtTime(level, Math.max(t + 0.8, stop - 1.2))
        g.gain.linearRampToValueAtTime(0, stop)
        src.connect(g).connect(master)
        src.start(t)
        src.stop(stop + 0.05)
      }
    }
  }

  // gentle master fade at the very end
  master.gain.setValueAtTime(0.9 * makeup, Math.max(0, totalSec - 0.5))
  master.gain.linearRampToValueAtTime(0, totalSec)

  const rendered = await ctx.startRendering()
  onProgress?.('mix', 1, 1)
  return {
    blob: audioBufferToWav(rendered),
    buffer: rendered,
    seconds: totalSec,
    voiceLines: jobs.length,
    voiceRendered,
    stemsUsed,
    notes,
  }
}

/** Suggested filename for a rendered version. */
export function dsWavFileName(ds: Datasheet, duration: Duration, preview: boolean): string {
  return `${ds.code.replace(/\s+/g, '-')}_${duration}min${preview ? '_preview' : ''}.wav`
}
