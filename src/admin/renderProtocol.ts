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
  /** The rendered PCM — kept so the upload step can encode the MP3 streaming copy. */
  buffer: AudioBuffer
  seconds: number
  voiceLines: number
  voiceRendered: number
  notes: string[]
}

export type RenderProgress = (stage: string, done: number, total: number) => void

/* ------------------------------------------------------------ mixing law
   Doc 06 (GL-ANX 1.1, §1 invariants + §7.2): the VOICE sits at 80% and is
   the reference every other layer is specified against, in dB:
     soundscape (lake / fire)  −20 dB vs voice
     soundscape (wind / rain)  −22 dB vs voice
     keyword echo              −8 dB (+2 s)      [parsed per line]
     whisper voice             −6 dB             [parsed per line, default]
     continuous whisper        −12 dB            [parsed per line]
     affirmation cycle 2+      −3 dB             [applied by the parser]
     bilateral tone            6% absolute, 400 Hz / 120 ms / ±80 pan
     binaural fade in/out      10–15 s / 15–20 s
   The doc gives no explicit binaural or music level; we hold the binaural
   bed at −16 dB and the musical pad at −18 dB vs voice — subtle layers under
   the < 70 dB SPL ceiling — and flag both in the render notes.            */
const VOICE_REF = 0.8
const dB = (x: number) => Math.pow(10, x / 20)
const LEVEL = {
  voice: VOICE_REF,
  soundscape: VOICE_REF * dB(-20),   // ≈ 0.080
  breathCue: VOICE_REF * dB(-20),
  binaural: VOICE_REF * dB(-16),     // ≈ 0.127 (not doc-specified; see note)
  music: VOICE_REF * dB(-18),        // ≈ 0.101 (not doc-specified; see note)
  bilateral: 0.06,                   // doc: "volume 6%"
  whisperDefaultDb: -6,
} as const

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

/* Musical pad: chord roots parsed from the timeline ("Music C maj pad",
   "Music transition C → G → Am"). A warm triad pad approximates the doc's
   "warm synth pad / drone" (§7.1) — real produced stems can replace it. */
const CHORD_FREQS: Record<string, number[]> = {
  c: [130.81, 164.81, 196.0],        // C3 E3 G3
  g: [98.0, 123.47, 146.83],         // G2 B2 D3
  am: [110.0, 130.81, 164.81],       // A2 C3 E3
  f: [87.31, 110.0, 130.81],         // F2 A2 C3
  dm: [73.42, 87.31, 110.0],
  em: [82.41, 98.0, 123.47],
}

export interface MusicSegment { atSec: number; chord: string }

export function deriveMusicPlan(v: SpecVersion): MusicSegment[] {
  const plan: MusicSegment[] = []
  for (const e of [...v.events].sort((a, b) => a.timeSec - b.timeSec)) {
    if (!/music/i.test(e.raw)) continue
    const tokens = [...e.raw.matchAll(/\b(Am|Dm|Em|[CGF])(?:\s*maj)?\b/g)].map((m) => m[1].toLowerCase())
    if (!tokens.length) continue
    const chord = tokens[tokens.length - 1]
    if (CHORD_FREQS[chord]) plan.push({ atSec: e.timeSec, chord })
  }
  if (!plan.length || plan[0].atSec > 0) plan.unshift({ atSec: 0, chord: 'c' })
  return plan
}

function textureFrom(soundscape: string | undefined): Texture {
  const s = (soundscape ?? '').toLowerCase()
  if (/lake|water|river|sea|ocean|rain/.test(s)) return 'lake'
  if (/wind|air|breeze|forest/.test(s)) return 'air'
  return 'deep'
}

const PAN: Record<'C' | 'L' | 'R', number> = { C: 0, L: -1, R: 1 }  // doc: L(−100) / R(+100)

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
  const voiceBuffers: { timeSec: number; buffer: AudioBuffer; pan: number; whisper: boolean; gainDb?: number; delaySec?: number; loop?: boolean }[] = []
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
            voiceBuffers.push({ timeSec, buffer: buf, pan: PAN[line.channel], whisper: line.whisper, gainDb: line.gainDb, delaySec: line.delaySec, loop: line.loop })
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
  // safety limiter: keeps voice + echo + bed peaks from ever clipping while
  // leaving the documented level relationships intact under the threshold
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -3
  limiter.knee.value = 3
  limiter.ratio.value = 12
  limiter.attack.value = 0.003
  limiter.release.value = 0.25
  master.connect(limiter).connect(ctx.destination)
  notes.push('Mix law: voice 80% reference; soundscape −20 dB; echo −8 dB (+2 s); whisper −6 dB; bilateral 6%; cycle 2 −3 dB (per protocol doc §1/§7).')
  notes.push('Binaural bed at −16 dB and musical pad at −18 dB vs voice — the doc gives no figure for these two; adjust here if the PO specifies one.')

  // soundscape — −20 dB vs voice (doc §7.2), fade-in 5 s (doc §3 t=0:00),
  // fade-out with the session end
  {
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, 0)
    g.gain.linearRampToValueAtTime(LEVEL.soundscape, Math.min(5, totalSec / 4))
    g.gain.setValueAtTime(LEVEL.soundscape, Math.max(0, totalSec - 4))
    g.gain.linearRampToValueAtTime(0, totalSec)
    const src = ctx.createBufferSource()
    src.buffer = soundscape
    src.connect(g).connect(master)
    src.start(0)
  }

  // musical pad — key changes at the documented transitions, 4 s crossfades
  {
    const plan = deriveMusicPlan(v)
    for (let i = 0; i < plan.length; i++) {
      const seg = plan[i]
      if (seg.atSec >= totalSec) break
      const segEnd = Math.min(totalSec, plan[i + 1]?.atSec ?? totalSec)
      const freqs = CHORD_FREQS[seg.chord]
      for (const f of freqs) {
        for (const detune of [0, 0.7]) {
          const osc = ctx.createOscillator()
          osc.type = 'triangle'
          osc.frequency.value = f + detune
          const g = ctx.createGain()
          const lvl = LEVEL.music / (freqs.length * 2)
          const xf = 4
          g.gain.setValueAtTime(0, Math.max(0, seg.atSec - 0.01))
          g.gain.linearRampToValueAtTime(lvl, Math.min(segEnd, seg.atSec + xf))
          g.gain.setValueAtTime(lvl, Math.max(seg.atSec, segEnd - xf))
          g.gain.linearRampToValueAtTime(0, segEnd)
          osc.connect(g).connect(master)
          osc.start(Math.max(0, seg.atSec - 0.01))
          osc.stop(segEnd + 0.05)
        }
      }
    }
  }

  // breathing cue
  for (const b of breathBuffers) {
    const g = ctx.createGain()
    g.gain.value = LEVEL.breathCue
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
    const level = LEVEL.binaural
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
      g.gain.linearRampToValueAtTime(LEVEL.bilateral, t + 0.01)
      g.gain.setValueAtTime(LEVEL.bilateral, t + Math.max(0.02, dur - 0.03))
      g.gain.linearRampToValueAtTime(0, t + dur)
      osc.connect(g).connect(pan).connect(master)
      osc.start(t)
      osc.stop(t + dur + 0.05)
    }
  }

  // voice — 80% reference; explicit per-line dB from the doc (echo −8, whisper
  // −6, continuous whisper −12, cycle 2 −3); affirmation-loop lines get the
  // documented 1 s fade-in / 2 s fade-out, everything gets a click guard
  for (const vb of voiceBuffers) {
    const src = ctx.createBufferSource()
    src.buffer = vb.buffer
    const lineDb = vb.gainDb ?? (vb.whisper ? LEVEL.whisperDefaultDb : 0)
    const gain = LEVEL.voice * dB(lineDb)
    const at = vb.timeSec + (vb.delaySec ?? 0)
    const durSec = vb.buffer.duration
    const inSec = vb.loop ? 1 : 0.06
    const outSec = vb.loop ? 2 : 0.08
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(gain, at + Math.min(inSec, durSec / 3))
    g.gain.setValueAtTime(gain, at + Math.max(0, durSec - outSec))
    g.gain.linearRampToValueAtTime(0, at + durSec)
    const pan = ctx.createStereoPanner()
    pan.pan.value = vb.pan
    src.connect(g).connect(pan).connect(master)
    src.start(at)
  }

  // gentle master fade at the very end
  master.gain.setValueAtTime(0.9, Math.max(0, totalSec - 0.5))
  master.gain.linearRampToValueAtTime(0, totalSec)

  const rendered = await ctx.startRendering()
  onProgress?.('mix', 1, 1)
  return { blob: audioBufferToWav(rendered), buffer: rendered, seconds: totalSec, voiceLines: allLines.length, voiceRendered, notes }
}

/** Suggested filename for a rendered version. */
export function wavFileName(spec: ProtocolSpec, duration: Duration, preview: boolean): string {
  return `${spec.code.replace(/\s+/g, '-')}_${duration}min${preview ? '_preview' : ''}.wav`
}
