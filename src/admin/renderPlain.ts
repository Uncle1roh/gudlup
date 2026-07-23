/* ============================================================================
   Good Loop — PLAIN offline renderer: the WAV IS the Studio mixdown
   One source of truth: the render seeds the SAME project the Sound Studio
   opens (plainToStudioTracks — 1 row = 1 clip, drawn sample files, per-clip
   gain/fades baked by applyClipShape) and mixes it with the SAME offline
   mixdown the Studio's Export WAV uses (renderMixdownBuffer, shared FX
   builder). What the admin hears after "Open in Sound Studio" is what this
   renders — bit-path identical, minus the manual edits.

   On top of the Studio path, this adds the app-side behaviors the Rules doc
   assigns to the renderer (§8.3): DUCKING — Music −10 dB and Soundscape
   −6 dB under active voice (attack 200 ms · release 500 ms), computed from
   the voice-clip WINDOWS (we know exactly when voice plays — no detector
   needed). Voice, entrainment and the heartbeat sub-case never duck.

   Approximations documented per the Rules doc §6: binaural glides and pan
   transitions are successive clips + fades (already how the format writes).
   ============================================================================ */

import { getTtsProvider } from '../tts'
import { voiceById, DEFAULT_PRIMARY } from '../tts/voiceCatalog'
import {
  SAMPLE_RATE,
  bakeVoiceBuffer,
  renderClipBuffer,
  renderMixdownBuffer,
  shapeClipBuffer,
  type MixTrack,
  type SampleParams,
  type VoiceParams,
} from '../studio/multitrack'
import { audioBufferToWav } from '../lib/wav'
import { masterizeBuffer, SESSION_CEILING_DBTP, SESSION_TARGET_LUFS } from '../studio/mastering'
import type { SeedTrack } from '../compose/types'
import type { AssetPools } from './assetPools'
import { plainToStudioTracks } from './plainStudio'
import { secToMmss, type PlainTimeline, type PlainVersion } from './plainTimeline'

const CHANNEL_PAN: Record<'L' | 'C' | 'R', number> = { L: -1, C: 0, R: 1 }

/* Rules §8.3 — fixed app-side ducking constants. */
const DUCK_DB: Record<'music' | 'soundscape', number> = { music: -10, soundscape: -6 }
const DUCK_ATTACK_S = 0.2
const DUCK_RELEASE_S = 0.5

/** Merge possibly-overlapping [start,end) windows (sorted output). */
export function mergeWindows(windows: { start: number; end: number }[]): { start: number; end: number }[] {
  const sorted = [...windows].filter((w) => w.end > w.start).sort((a, b) => a.start - b.start)
  const out: { start: number; end: number }[] = []
  for (const w of sorted) {
    const last = out[out.length - 1]
    if (last && w.start <= last.end + 0.05) last.end = Math.max(last.end, w.end)
    else out.push({ ...w })
  }
  return out
}

/** Piecewise-linear duck envelope (multiplier, 1 = nominal) for one lane:
    ramp to `duckMul` over the attack at each voice window start, back to 1
    over the release after its end. */
export function buildDuckEnvelope(
  voiceWindows: { start: number; end: number }[],
  duckDb: number,
  lengthSec: number,
): { timeSec: number; mul: number }[] {
  const mul = Math.pow(10, duckDb / 20)
  const pts: { timeSec: number; mul: number }[] = [{ timeSec: 0, mul: 1 }]
  for (const w of mergeWindows(voiceWindows)) {
    if (w.start >= lengthSec) break
    const aStart = Math.max(0, w.start)
    pts.push({ timeSec: aStart, mul: pts[pts.length - 1].mul })
    pts.push({ timeSec: Math.min(lengthSec, aStart + DUCK_ATTACK_S), mul })
    const rStart = Math.min(lengthSec, w.end)
    pts.push({ timeSec: rStart, mul })
    pts.push({ timeSec: Math.min(lengthSec, rStart + DUCK_RELEASE_S), mul: 1 })
  }
  // collapse the redundant leading point when the first window starts at 0
  return pts.filter((p, i) => i === 0 || p.timeSec > pts[i - 1].timeSec || p.mul !== pts[i - 1].mul)
}

/* ------------------------------------------------------------------ render */

export interface RenderPlainOptions {
  pools?: AssetPools
  /** Reproducible draws. Default: fresh randomness. */
  seed?: number
  /** Synthesize the voice clips with the configured TTS. */
  withVoice?: boolean
  onProgress?: (msg: string) => void
}

export interface RenderPlainResult {
  blob: Blob
  buffer: AudioBuffer
  seconds: number
  voiceClips: number
  notes: string[]
}

export async function renderPlainWav(
  timeline: PlainTimeline,
  version: PlainVersion,
  opts: RenderPlainOptions = {},
): Promise<RenderPlainResult> {
  const progress = opts.onProgress ?? (() => undefined)
  progress('Seeding the Studio project…')
  const seed = plainToStudioTracks(timeline, version, { pools: opts.pools, seed: opts.seed })
  const notes = [...seed.notes]
  const lengthSec = seed.totalSec
  if (!opts.pools) notes.push('No asset pools available (Supabase env absent or library empty) — Music/Soundscape lanes are silent.')

  const tts = getTtsProvider()
  const wantVoice = opts.withVoice !== false
  const canVoice = wantVoice && tts.canRender
  if (wantVoice && !tts.canRender) notes.push(`No render-capable TTS configured (${tts.label} is preview-only) — rendered without voice.`)

  /* One decoder AudioContext for the TTS bytes (same pattern as Renderer v3). */
  const decoder = canVoice ? new AudioContext({ sampleRate: SAMPLE_RATE }) : null
  const ttsCache = new Map<string, AudioBuffer>()

  let voiceClips = 0
  const mix: MixTrack[] = []
  try {
    for (const t of seed.tracks) {
      const clips: MixTrack['clips'] = []
      for (const c of t.clips) {
        if (c.startSec >= lengthSec) continue
        const dur = Math.min(c.durationSec, lengthSec - c.startSec)
        let buffer: AudioBuffer | null = null
        if (t.type === 'voice') {
          const vp = c.params as VoiceParams
          const text = (c.text ?? '').trim()
          if (!text || !canVoice || !decoder) { continue }
          const voiceId = vp.voiceId ?? DEFAULT_PRIMARY.id
          const key = `${voiceId}|${text}`
          let decoded = ttsCache.get(key)
          if (!decoded) {
            progress(`Voice ${voiceClips + 1}: "${text.slice(0, 42)}${text.length > 42 ? '…' : ''}" (${voiceById(voiceId)?.name ?? 'default'})`)
            const bytes = await tts.render(text, { lang: 'it', voiceId })
            decoded = await decoder.decodeAudioData(bytes.slice(0))
            ttsCache.set(key, decoded)
          }
          let baked = await bakeVoiceBuffer(decoded, vp.pan, dur, vp.speed ?? 1)
          baked = shapeClipBuffer(baked, c)
          buffer = baked
          voiceClips++
        } else {
          const sp = t.type === 'sample' ? (c.params as SampleParams) : null
          if (sp && !sp.url) continue // undrawn lane — silent by design
          progress(`Rendering ${t.name} @ ${secToMmss(c.startSec)}…`)
          let buf = await renderClipBuffer(t.type, c.params, dur)
          buf = shapeClipBuffer(buf, c)
          buffer = buf
        }
        clips.push({ startSec: c.startSec, durationSec: dur, buffer })
      }
      mix.push({
        gain: t.volume,
        pan: CHANNEL_PAN[t.channel ?? 'C'],
        effects: t.effects,
        clips,
        // filled below once the voice windows are known
        gainAutomation: undefined,
      })
    }

    /* §8.3 ducking: voice windows from the SEED (only clips that will really
       sound — i.e. with text — count; silent voice lanes don't duck the bed). */
    const voiceWindows = seed.tracks
      .filter((t) => t.type === 'voice')
      .flatMap((t) => t.clips
        .filter((c) => (c.text ?? '').trim() && c.startSec < lengthSec && canVoice)
        .map((c) => ({ start: c.startSec, end: Math.min(lengthSec, c.startSec + c.durationSec) })))
    if (voiceWindows.length) {
      seed.tracks.forEach((t: SeedTrack, i: number) => {
        if (t.duck === 'music' || t.duck === 'soundscape') {
          mix[i].gainAutomation = buildDuckEnvelope(voiceWindows, DUCK_DB[t.duck], lengthSec)
        }
      })
      const ducked = seed.tracks.filter((t) => t.duck === 'music' || t.duck === 'soundscape')
      if (ducked.length) notes.push(`Ducking (§8.3): ${ducked.map((t) => `"${t.name}" ${DUCK_DB[t.duck as 'music' | 'soundscape']} dB`).join(', ')} under ${mergeWindows(voiceWindows).length} voice windows (200/500 ms).`)
    }

    progress('Mixing down…')
    const buffer = await renderMixdownBuffer(mix, lengthSec, 0.85)
    progress('Mastering (§9): loudness + true-peak…')
    const m = masterizeBuffer(buffer)
    notes.push(
      `Mastering (§9): measured ${Number.isFinite(m.preLufs) ? m.preLufs.toFixed(1) : '−∞'} LUFS → ` +
      `${m.gainDb >= 0 ? '+' : ''}${m.gainDb.toFixed(1)} dB to the ${SESSION_TARGET_LUFS} LUFS session target · ` +
      `final ${Number.isFinite(m.postLufs) ? m.postLufs.toFixed(1) : '−∞'} LUFS, true peak ${m.truePeakDb.toFixed(1)} dBTP (ceiling ${SESSION_CEILING_DBTP} dBTP` +
      `${m.limiterDb < -0.1 ? `, limiter up to ${m.limiterDb.toFixed(1)} dB` : ', limiter untouched'}). ` +
      `The <70 dB SPL ceiling depends on the listener's device volume — at this normalization a normal phone/headset setting sits under it.`,
    )
    const blob = audioBufferToWav(buffer)
    return { blob, buffer, seconds: lengthSec, voiceClips, notes }
  } finally {
    if (decoder) { try { await decoder.close() } catch { /* fine */ } }
  }
}

export function plainWavFileName(code: string | null, sheet: string): string {
  const safe = (code ?? 'PLAIN').replace(/[^A-Za-z0-9_-]+/g, '_')
  return `${safe}_${sheet}.wav`
}
