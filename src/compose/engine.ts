/* Turns ComposeSettings into the layered bed, reusing the Studio's synths so the
   sound is identical to what the Studio would produce. The bed is built at a
   short, editable base length (the Studio opens fast); the chosen session length
   is metadata that drives the actual session, not this preview. */

import {
  renderClipBuffer,
  renderMixdown,
  defaultParams,
  TRACK_META,
  type MixTrack,
  type BinauralParams,
  type SoundscapeParams,
  type BreathParams,
  type VoiceParams,
} from '../studio/multitrack'
import { BRAINWAVE, type ComposeSettings, type SeedTrack } from './types'

/** Editable base length for the composed bed (seconds). */
export const BASE_SEC = 120

const BREATH_BY_WAVE = { delta: 4.5, theta: 5.5, alpha: 6, smr: 5 } as const

/** Build the layered seed (soundscape + binaural + breath + optional voice). */
export function buildSeed(s: ComposeSettings): SeedTrack[] {
  const i = Math.max(0, Math.min(1, s.intensity))
  const wave = BRAINWAVE[s.brainwave]

  const scParams = defaultParams('soundscape') as SoundscapeParams
  scParams.texture = s.soundscape
  scParams.warmth = Math.round(420 + i * 520) // brighter with intensity

  const biParams = defaultParams('binaural') as BinauralParams
  biParams.carrierHz = wave.carrierHz
  biParams.beatHz = wave.beatHz

  const brParams = defaultParams('breath') as BreathParams
  brParams.breathsPerMin = BREATH_BY_WAVE[s.brainwave]
  brParams.toneHz = 300

  const tracks: SeedTrack[] = [
    { type: 'soundscape', name: TRACK_META.soundscape.label, volume: 0.6 + i * 0.25, clips: [{ startSec: 0, durationSec: BASE_SEC, params: scParams }] },
    { type: 'binaural', name: TRACK_META.binaural.label, volume: 0.55 + i * 0.3, clips: [{ startSec: 0, durationSec: BASE_SEC, params: biParams }] },
    { type: 'breath', name: TRACK_META.breath.label, volume: 0.7, clips: [{ startSec: 6, durationSec: BASE_SEC - 12, params: brParams }] },
  ]

  if (s.voiceOn) {
    const voParams = defaultParams('voice') as VoiceParams
    voParams.pan = -0.4
    tracks.push({
      type: 'voice',
      name: TRACK_META.voice.label,
      volume: 0.7,
      clips: [{ startSec: 24, durationSec: 60, params: voParams, text: s.affirmation }],
    })
  }
  return tracks
}

/** Render a short taste of the bed to a WAV blob for in-app preview. */
export async function renderPreviewBlob(seed: SeedTrack[], previewSec = 22): Promise<Blob> {
  const mix: MixTrack[] = []
  for (const tr of seed) {
    const clips: { startSec: number; buffer: AudioBuffer | null }[] = []
    for (const cl of tr.clips) {
      const dur = Math.min(cl.durationSec, previewSec)
      const buffer = await renderClipBuffer(tr.type, cl.params, dur)
      clips.push({ startSec: 0, buffer })
    }
    mix.push({ gain: tr.volume, clips })
  }
  return renderMixdown(mix, previewSec, 0.85)
}
