/* ============================================================================
   Good Loop — Protocol renderer (spec → WAV)
   Executes a parsed ProtocolSpec offline and encodes the result as a WAV file:

     • binaural layer  — carrier L / carrier+beat R, with the band transitions
                         the timeline calls for (e.g. Deep: Alpha → Theta →
                         Alpha) and the fade-in/out from the invariants
     • soundscape bed  — the Studio's soundscape synth, texture mapped from the
                         invariants ("calm lake…" → lake)
     • breathing cue   — during phases named "Breathing…", at the documented
                         breaths/min
     • bilateral tone  — the PAT-05 blips (e.g. 400 Hz / 120 ms / every 3–4 s,
                         alternating L/R) between the ON and OFF events
     • voice           — every quoted line in the timeline plus the affirmation
                         loops (CSI database), synthesized through the active
                         TTS provider (ElevenLabs / Azure pt-BR) and panned per
                         its channel. Without a render-capable TTS key the bed
                         renders voiceless and the lines are reported.

   Reuses the Studio's synths (renderClipBuffer) and WAV encoder so the output
   is consistent with everything else the platform produces: 44.1 kHz / 16-bit
   stereo WAV per FN-06.
   ============================================================================ */

import { renderClipBuffer, SAMPLE_RATE, type SoundscapeParams, type BreathParams, type Texture } from '../studio/multitrack'
import { audioBufferToWav } from '../lib/wav'
import { getTtsProvider } from '../tts'
import type { Duration } from '../types/domain'
import { voiceLinesForVersion, type ProtocolSpec, type SpecVersion } from './protocolDoc'

export interface SpecRenderOptions {
  duration: Duration
  /** Synthesize the spoken lines (needs a render-capable TTS provider). */
  withVoice: boolean
  /** Render only the first N seconds (preview). Omit for the full session. */
  capSeconds?: number
}

export interface SpecRenderResult {
  blob: Blob
  seconds: number
  voiceLines: number
  voiceRendered: number
  notes: string[]
}

export type RenderProgress = (stage: string, done: number, total: number) => void

/* ----------------------------------------------------- plan derivation */

const BAND_BEAT: Record<string, number> = { delta: 2.5, theta: 6, alpha: 10, smr: 13, beta: 18 }

export interface BinauralSegment { atSec: number; beatHz: number; carrierHz: number; rampSec: number }

/** Binaural frequency plan: the invariant primary, plus timeline transitions. */
export function deriveBinauralPlan(spec: ProtocolSpec, v: SpecVersion): BinauralSegment[] {
  const prim = spec.invariants.binauralPrimary ?? { beatHz: 10, carrierHz: 200 }
  const sec = spec.invariants.binauralSecondary
  const plan: BinauralSegment[] = [{ atSec: 0, beatHz: prim.beatHz, carrierHz: prim.carrierHz, rampSec: 0 }]
  for (const e of v.events) {
    if (!/binaural/i.test(e.raw) || !/transition|->|→/i.test(e.raw)) continue
    // target band = the LAST band named in the event ("Alpha 10 Hz → Theta 6 Hz")
    const bands = [...e.raw.matchAll(/(Alpha|Theta|Delta|SMR|Beta)(?:\s*(\d+(?:\.\d+)?)\s*Hz)?/gi)]
    if (!bands.length) continue
    const last = bands[bands.length - 1]
    const band = last[1].toLowerCase()
    const beat = last[2] ? Number(last[2]) : (sec && sec.band?.toLowerCase() === band ? sec.beatHz : BAND_BEAT[band] ?? prim.beatHz)
    const carrier = sec && sec.band?.toLowerCase() === band ? sec.carrierHz : prim.carrierHz
    const ramp = Number(/fade\s*(\d+)\s*s/i.exec(e.raw)?.[1] ?? 15)
    plan.push({ atSec: e.timeSec, beatHz: beat, carrierHz: carrier, rampSec: ramp })
  }
  return plan.sort((a, b) => a.atSec - b.atSec)
}

export interface BilateralSegment { startSec: number; endSec: number; toneHz: number; blipMs: number; everySec: number }

/** Bilateral-stimulation windows from the ON / OFF timeline events. */
export function deriveBilateral(v: SpecVersion, totalSec: number): BilateralSegment[] {
  const out: BilateralSegment[] = []
  let open: BilateralSegment | null = null
  for (const e of [...v.events].sort((a, b) => a.timeSec - b.timeSec)) {
    if (!/bilateral/i.test(e.raw)) continue
    const on = /Bilateral[^.]*\bON\b[^0-9]*(\d+)\s*Hz[^0-9]*(\d+)\s*ms.*?every\s+(\d+)\s*s/i.exec(e.raw)
    if (on) {
      if (open) { open.endSec = e.timeSec; out.push(open) }
      open = { startSec: e.timeSec, endSec: totalSec, toneHz: Number(on[1]), blipMs: Number(on[2]), everySec: Number(on[3]) }
      continue
    }
    if (/\bOFF\b|fade-?out/i.test(e.raw) && open) {
      open.endSec = e.timeSec
      out.push(open)
      open = null
    }
  }
  if (open) out.push(open)
  return out
}

function textureFrom(soundscape: string | undefined): Texture {
  const s = (soundscape ?? '').toLowerCase()
  if (/lake|water|river|sea|ocean|rain/.test(s)) return 'lake'
  if (/wind|air|breeze|forest/.test(s)) return 'air'
  return 'deep'
}

const PAN: Record<'C' | 'L' | 'R', number> = { C: 0, L: -0.85, R: 0.85 }

/* --------------------------------------------------------------- render */

export async function renderSpecWav(spec: ProtocolSpec, opts: SpecRenderOptions, onProgress?: RenderProgress): Promise<SpecRenderResult> {
  const v = spec.versions.find((x) => x.duration === opts.duration)
  if (!v) throw new Error(`This spec has no ${opts.duration}-minute version.`)
  const notes: string[] = []
  const fullSec = opts.duration * 60
  const totalSec = Math.max(10, Math.min(fullSec, opts.capSeconds ?? fullSec))
  if (totalSec < fullSec) notes.push(`Preview render — first ${totalSec}s of ${fullSec}s.`)

  // ---- 1. synthesize the voice lines (before opening the offline graph) ----
  const allLines = voiceLinesForVersion(spec, opts.duration).filter((l) => l.timeSec < totalSec - 1)
  const voiceBuffers: { timeSec: number; buffer: AudioBuffer; pan: number; whisper: boolean }[] = []
  let voiceRendered = 0
  if (opts.withVoice && allLines.length) {
    const tts = getTtsProvider()
    if (!tts.canRender) {
      notes.push(`No render-capable TTS configured (${tts.label} is preview-only) — rendered the bed without voice.`)
    } else {
      const decoder = new AudioContext({ sampleRate: SAMPLE_RATE })
      const cache = new Map<string, AudioBuffer>()
      try {
        for (let i = 0; i < allLines.length; i++) {
          const { timeSec, line } = allLines[i]
          onProgress?.('voice', i, allLines.length)
          try {
            let buf = cache.get(line.text)
            if (!buf) {
              const bytes = await tts.render(line.text, { lang: 'pt-BR' })
              buf = await decoder.decodeAudioData(bytes.slice(0))
              cache.set(line.text, buf)
            }
            voiceBuffers.push({ timeSec, buffer: buf, pan: PAN[line.channel], whisper: line.whisper })
            voiceRendered++
          } catch (e) {
            notes.push(`Voice line at ${Math.floor(timeSec / 60)}:${String(Math.floor(timeSec % 60)).padStart(2, '0')} failed: ${(e as Error).message}`)
          }
        }
      } finally {
        await decoder.close()
      }
      onProgress?.('voice', allLines.length, allLines.length)
    }
  } else if (!opts.withVoice && allLines.length) {
    notes.push(`Bed-only render — ${allLines.length} spoken lines were not synthesized.`)
  }

  // ---- 2. pre-render the synth beds ----
  onProgress?.('bed', 0, 1)
  const scParams: SoundscapeParams = { texture: textureFrom(spec.invariants.soundscape), warmth: 620 }
  const soundscape = await renderClipBuffer('soundscape', scParams, totalSec)

  const breathWindows = v.phases
    .filter((p) => /breath/i.test(p.name) && p.startSec < totalSec)
    .map((p) => ({ startSec: p.startSec, durationSec: Math.min(p.endSec, totalSec) - p.startSec }))
  const breathBuffers: { startSec: number; buffer: AudioBuffer }[] = []
  const brParams: BreathParams = { breathsPerMin: spec.invariants.breathsPerMin ?? 6, toneHz: 300 }
  for (const w of breathWindows) {
    if (w.durationSec < 4) continue
    breathBuffers.push({ startSec: w.startSec, buffer: await renderClipBuffer('breath', brParams, w.durationSec) })
  }
  onProgress?.('bed', 1, 1)

  // ---- 3. assemble the offline graph ----
  onProgress?.('mix', 0, 1)
  const ctx = new OfflineAudioContext(2, Math.ceil(totalSec * SAMPLE_RATE), SAMPLE_RATE)
  const master = ctx.createGain()
  master.gain.value = 0.9
  master.connect(ctx.destination)

  // soundscape
  {
    const g = ctx.createGain()
    g.gain.value = 0.5
    const src = ctx.createBufferSource()
    src.buffer = soundscape
    src.connect(g).connect(master)
    src.start(0)
  }

  // breathing cue
  for (const b of breathBuffers) {
    const g = ctx.createGain()
    g.gain.value = 0.28
    const src = ctx.createBufferSource()
    src.buffer = b.buffer
    src.connect(g).connect(master)
    src.start(b.startSec)
  }

  // binaural (L carrier / R carrier+beat) with the timeline's band transitions
  {
    const plan = deriveBinauralPlan(spec, v)
    const oscL = ctx.createOscillator()
    const oscR = ctx.createOscillator()
    oscL.type = 'sine'
    oscR.type = 'sine'
    const first = plan[0]
    oscL.frequency.setValueAtTime(first.carrierHz, 0)
    oscR.frequency.setValueAtTime(first.carrierHz + first.beatHz, 0)
    for (const seg of plan.slice(1)) {
      if (seg.atSec >= totalSec) continue
      const end = Math.min(totalSec, seg.atSec + Math.max(1, seg.rampSec))
      oscL.frequency.setValueAtTime(oscL.frequency.value, seg.atSec) // anchor
      oscL.frequency.linearRampToValueAtTime(seg.carrierHz, end)
      oscR.frequency.setValueAtTime(oscR.frequency.value, seg.atSec)
      oscR.frequency.linearRampToValueAtTime(seg.carrierHz + seg.beatHz, end)
    }
    const gL = ctx.createGain()
    const gR = ctx.createGain()
    const merger = ctx.createChannelMerger(2)
    oscL.connect(gL).connect(merger, 0, 0)
    oscR.connect(gR).connect(merger, 0, 1)
    const bg = ctx.createGain()
    merger.connect(bg).connect(master)
    const fadeIn = spec.invariants.binauralFadeInSec ?? 12
    const fadeOut = spec.invariants.binauralFadeOutSec ?? 18
    const level = 0.16
    gL.gain.value = 1
    gR.gain.value = 1
    bg.gain.setValueAtTime(0, 0)
    bg.gain.linearRampToValueAtTime(level, Math.min(fadeIn, totalSec / 3))
    bg.gain.setValueAtTime(level, Math.max(0, totalSec - fadeOut))
    bg.gain.linearRampToValueAtTime(0, totalSec)
    oscL.start(0)
    oscR.start(0)
    oscL.stop(totalSec)
    oscR.stop(totalSec)
  }

  // bilateral blips (PAT-05)
  for (const seg of deriveBilateral(v, totalSec)) {
    const start = Math.max(0, seg.startSec)
    const end = Math.min(totalSec, seg.endSec)
    let side = -1
    for (let t = start; t < end; t += seg.everySec) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = seg.toneHz
      const g = ctx.createGain()
      const pan = ctx.createStereoPanner()
      pan.pan.value = 0.8 * side
      side = -side
      const dur = seg.blipMs / 1000
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.12, t + 0.01)
      g.gain.setValueAtTime(0.12, t + Math.max(0.02, dur - 0.03))
      g.gain.linearRampToValueAtTime(0, t + dur)
      osc.connect(g).connect(pan).connect(master)
      osc.start(t)
      osc.stop(t + dur + 0.05)
    }
  }

  // voice
  for (const vb of voiceBuffers) {
    const src = ctx.createBufferSource()
    src.buffer = vb.buffer
    const g = ctx.createGain()
    g.gain.value = vb.whisper ? 0.3 : 0.78
    const pan = ctx.createStereoPanner()
    pan.pan.value = vb.pan
    src.connect(g).connect(pan).connect(master)
    src.start(vb.timeSec)
  }

  // gentle master fade at the very end
  master.gain.setValueAtTime(0.9, Math.max(0, totalSec - 0.5))
  master.gain.linearRampToValueAtTime(0, totalSec)

  const rendered = await ctx.startRendering()
  onProgress?.('mix', 1, 1)
  return { blob: audioBufferToWav(rendered), seconds: totalSec, voiceLines: allLines.length, voiceRendered, notes }
}

/** Suggested filename for a rendered version. */
export function wavFileName(spec: ProtocolSpec, duration: Duration, preview: boolean): string {
  return `${spec.code.replace(/\s+/g, '-')}_${duration}min${preview ? '_preview' : ''}.wav`
}
