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

import { renderClipBuffer, SAMPLE_RATE, CHORD_TRIADS, type Chord, type SoundscapeParams, type Texture } from '../studio/multitrack'
import { audioBufferToWav } from '../lib/wav'
import { getTtsProvider } from '../tts'
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

const XFADE_PHASE = 4 // s — equal-power crossfade at phase boundaries
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

/* ------------------------------------------------- synth fallbacks */

const KEY_TO_CHORD: Record<string, Chord> = { c: 'c', g: 'g', am: 'am', f: 'f', dm: 'dm', em: 'em' }

/** Warm triad pad for one window (fallback when no stem is mapped). */
function synthPad(ctx: OfflineAudioContext, dest: AudioNode, at: number, dur: number, keys: string[], level: number): void {
  const chords = keys.map((k) => KEY_TO_CHORD[k.toLowerCase().replace(/\s+/g, '')]).filter(Boolean) as Chord[]
  const use = chords.length ? chords : ['am' as Chord]
  const segDur = dur / use.length
  use.forEach((chord, i) => {
    const segAt = at + i * segDur
    const freqs = CHORD_TRIADS[chord]
    for (const f of freqs) {
      for (const detune of [0, 0.7]) {
        const osc = ctx.createOscillator()
        osc.type = 'triangle'
        osc.frequency.value = f + detune
        const g = ctx.createGain()
        g.gain.value = 0
        const lvl = level / (freqs.length * 2)
        const xf = Math.min(XFADE_PHASE, segDur / 3)
        g.gain.setValueCurveAtTime(fadeInCurve(lvl), Math.max(0, segAt), xf)
        g.gain.setValueAtTime(lvl, Math.max(0, segAt) + xf + 0.005) // hold, after the curve
        const outStart = Math.max(Math.max(0, segAt) + xf + 0.02, segAt + segDur - xf)
        g.gain.setValueCurveAtTime(fadeOutCurve(lvl), outStart, Math.max(0.02, segAt + segDur - outStart + xf / 2))
        osc.connect(g).connect(dest)
        osc.start(Math.max(0, segAt))
        osc.stop(segAt + segDur + 0.1)
      }
    }
  })
}

function textureFrom(label: string): Texture {
  const s = label.toLowerCase()
  if (/lake|water|rain|wave|sea|ocean|lago|acqua|pioggia|onde/.test(s)) return 'lake'
  if (/wind|breeze|air|vento|brezza|forest|bosco/.test(s)) return 'air'
  return 'deep'
}

/** Singing-bowl strike: inharmonic partials with beating pairs, long decay. */
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
    const defaultDb = row.kind === 'ECO' ? -8 : row.kind === 'SUSSURRO' ? -12 : 0
    jobs.push({
      timeSec: row.timeSec,
      text,
      pan: PAN[row.channel] ?? 0,
      gainDb: row.gainDb ?? defaultDb,
      delaySec: row.delaySec ?? (row.kind === 'ECO' ? 2 : 0),
      fadeIn: isLoop ? v.affFadeInSec : 0.06,
      fadeOut: isLoop ? v.affFadeOutSec : 0.08,
      secondary: row.voice === 'M',
    })
    // Versioni-prescribed echo stacking on affirmation loops (Standard/Deep),
    // only when the timeline hasn't been compiled with explicit ECO rows.
    if (isLoop && !timelineHasEcho && (v.stacking === 'echo' || v.stacking === 'triple')) {
      const kw = row.rec ? affByRec.get(row.rec.toUpperCase())?.echoKeywords : undefined
      if (kw) {
        jobs.push({
          timeSec: row.timeSec, text: kw, pan: PAN[row.channel] ?? 0,
          gainDb: (row.gainDb ?? 0) - 8, delaySec: 2,
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
      const renderText = async (text: string, voice: 'primary' | 'secondary' = 'primary'): Promise<AudioBuffer> => {
        // secondary requests without a configured [M] voice fall back to the
        // primary INSIDE the provider — share the cache entry in that case
        const effective = voice === 'secondary' && tts.hasSecondaryVoice ? 'secondary' : 'primary'
        const key = `${effective}|${text}`
        let buf = cache.get(key)
        if (!buf) {
          const bytes = await tts.render(text, { lang: 'it', voice: effective })
          buf = await decoder.decodeAudioData(bytes.slice(0))
          cache.set(key, buf)
        }
        return buf
      }
      try {
        for (let i = 0; i < jobs.length; i++) {
          onProgress?.('voice', i, jobs.length)
          try {
            voiceBuffers.push({ job: jobs[i], buffer: await renderText(jobs[i].text, jobs[i].secondary ? 'secondary' : 'primary') })
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
          try { whisperLoopBuffer = await renderText(text) } catch (e) { notes.push(`Continuous whisper failed: ${(e as Error).message}`) }
        }
      } finally {
        await decoder.close()
      }
      onProgress?.('voice', jobs.length, jobs.length)
      if (jobs.some((j) => j.secondary)) {
        if (tts.hasSecondaryVoice) {
          notes.push(`Secondary [M] voice rows rendered with the configured male voice (${jobs.filter((j) => j.secondary).length} rows).`)
        } else {
          notes.push('Secondary [M] voice rows rendered with the primary voice — set the [M] Voice ID in the Voice engine panel to give the double-induction its male voice.')
        }
      }
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
  const musicByPhase = new Map((ds.musicMap ?? []).map((m) => [m.phase, m]))
  const fallbackScapes = new Map<number, AudioBuffer>()
  for (const p of phases) {
    if (p.startSec >= totalSec) continue
    if (map?.soundscape[phaseKey(p.id)] && assetBuffers.has(map.soundscape[phaseKey(p.id)]!)) continue
    const label = musicByPhase.get(p.id)?.soundscape ?? ds.invariants.find((i) => /soundscape/i.test(i.param))?.value ?? ''
    const dur = Math.min(p.endSec, totalSec) - p.startSec + XFADE_PHASE
    if (dur < 2) continue
    const params: SoundscapeParams = { texture: textureFrom(label), warmth: 620 }
    fallbackScapes.set(p.id, await renderClipBuffer('soundscape', params, dur))
  }

  /* ---- 4. offline mix ---- */
  onProgress?.('mix', 0, 1)
  const ctx = new OfflineAudioContext(2, Math.ceil(totalSec * SAMPLE_RATE), SAMPLE_RATE)
  const master = ctx.createGain()
  master.gain.value = 0.9
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
  notes.push(`Mix law (loudness-measured): voice ref RMS ${voiceRefRms.toFixed(3)} · music −18 dB · soundscape −20 dB · echo −8 dB (+2 s) · whisper −12 dB · bilateral ~6% · loop fades ${v.affFadeInSec}/${v.affFadeOutSec} s (${opts.duration}-min).`)
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

    const musicPath = map?.music[phaseKey(p.id)]
    const stem = musicPath ? assetBuffers.get(musicPath) : undefined
    if (stem) {
      scheduleLooped(ctx, stem, master, at, dur, gainForOffset(stem, voiceRefRms, -18), inSec, outSec)
      stemsUsed++
    } else {
      // synth pad — oscillators, not a buffer: scale its empirical unit RMS
      // (~0.25 at level 1) to the same −18 dB target
      synthPad(ctx, master, at, dur, musicByPhase.get(p.id)?.keys ?? ['Am'], Math.min(0.6, (voiceRefRms * dB(-18)) / 0.25))
    }

    const scapePath = map?.soundscape[phaseKey(p.id)]
    const scape = scapePath ? assetBuffers.get(scapePath) : undefined
    const scapeBuf = scape ?? fallbackScapes.get(p.id)
    if (scapeBuf) {
      scheduleLooped(ctx, scapeBuf, master, at, dur, gainForOffset(scapeBuf, voiceRefRms, -20), inSec, outSec)
    }
  }
  if (map && stemsUsed === 0) notes.push('No music stems were mapped/loaded for this version — the whole bed used the synth pad. Map phase stems in the Asset Library.')

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

  // binaural (invariant beat; Deep transitions to Theta in one phase)
  {
    const b = v.binaural
    const oscL = ctx.createOscillator()
    const oscR = ctx.createOscillator()
    oscL.type = 'sine'
    oscR.type = 'sine'
    oscL.frequency.setValueAtTime(b.carrierLowHz, 0)
    oscR.frequency.setValueAtTime(b.carrierHighHz, 0)
    if (b.theta) {
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
    const binLevel = Math.min(0.2, voiceRefRms * dB(-16) * Math.SQRT2)
    bg.gain.setValueAtTime(0, 0)
    bg.gain.linearRampToValueAtTime(binLevel, Math.min(b.fadeInSec, totalSec / 3))
    bg.gain.setValueAtTime(binLevel, Math.max(0, totalSec - b.fadeOutSec))
    bg.gain.linearRampToValueAtTime(0, totalSec)
    oscL.start(0); oscR.start(0)
    oscL.stop(totalSec); oscR.stop(totalSec)
  }

  // bilateral 600 Hz blips in the loop phase (Standard: /4 s · Deep: /3 s)
  if (v.bilateral) {
    // the phase whose Fasi note names the bilateral layer, else phase 4
    const ph = phases.find((p) => /bilat/i.test(p.notes)) ?? phases.find((p) => p.id === 4)
    if (ph && ph.startSec < totalSec) {
      const start = ph.startSec
      const end = Math.min(totalSec, ph.endSec)
      const dur = v.bilateral.blipMs / 1000
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
        g.gain.linearRampToValueAtTime(LEVEL.bilateral, t + 0.01)
        g.gain.setValueAtTime(LEVEL.bilateral, t + Math.max(0.02, dur - 0.03))
        g.gain.linearRampToValueAtTime(0, t + dur)
        osc.connect(g).connect(pan).connect(master)
        osc.start(t)
        osc.stop(t + dur + 0.05)
      }
    }
  }

  // voice rows
  for (const { job, buffer } of voiceBuffers) {
    const at = job.timeSec + job.delaySec
    if (at >= totalSec - 0.2) continue
    const gain = LEVEL.voice * dB(job.gainDb)
    const durSec = buffer.duration
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(gain, at + Math.min(job.fadeIn, durSec / 3))
    g.gain.setValueAtTime(gain, at + Math.max(0, durSec - job.fadeOut))
    g.gain.linearRampToValueAtTime(0, at + durSec)
    const pan = ctx.createStereoPanner()
    pan.pan.value = job.pan
    src.connect(g).connect(pan).connect(master)
    src.start(at)
  }

  // Deep continuous whisper (Layer 9) — looped across its phase window
  if (whisperLoopBuffer && v.continuousWhisper) {
    const ph = phases.find((p) => p.id === v.continuousWhisper!.phase)
    if (ph && ph.startSec < totalSec) {
      const at = ph.startSec
      const dur = Math.min(totalSec, ph.endSec) - at
      // pad each pass with a breath of silence so the loop doesn't machine-gun
      const level = VOICE_REF * dB(v.continuousWhisper.gainDb)
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
  master.gain.setValueAtTime(0.9, Math.max(0, totalSec - 0.5))
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
