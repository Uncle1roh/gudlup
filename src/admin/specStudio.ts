/* ============================================================================
   Good Loop — protocol spec → editable Studio project
   Converts a parsed protocol document into Sound Studio tracks so the
   generated audio can be EDITED layer by layer (levels, timing, texture,
   voice lines) instead of being a sealed mixdown:

     Binaural   — one clip per band segment (e.g. Alpha → Theta → Alpha)
     Soundscape — the full-length ambient bed
     Music      — one clip per documented key change (C → G → Am → G)
     Breathing  — one clip per breathing phase
     Bilateral  — one clip per PAT-05 ON window (tone/blip/interval editable)
     Voice      — two tracks: the guide lines, and the echo/whisper layer,
                  each clip carrying its text for TTS synthesis in the Studio

   Track volumes are calibrated so the Studio project starts at the same
   relative levels as the protocol renderer's mixing law (voice reference,
   soundscape −20 dB, echo −8 dB, bilateral 6%). The Studio's synth layers
   have their own internal gains, so these are starting points to fine-tune.
   ============================================================================ */

import type { SeedTrack, SeedClip } from '../compose/types'
import type { Duration } from '../types/domain'
import type { Chord } from '../studio/multitrack'
import { deriveBinauralPlan, deriveBilateral, deriveMusicPlan } from './renderProtocol'
import { voiceLinesForVersion, type ProtocolSpec } from './protocolDoc'

const PAN: Record<'C' | 'L' | 'R', number> = { C: 0, L: -1, R: 1 }

/** Rough spoken duration at the doc's ~110 wpm, for clip sizing. */
function estimateSpeechSec(text: string): number {
  const words = text.trim().split(/\s+/).length
  return Math.min(24, Math.max(1.5, words / (110 / 60) + 0.8))
}

export function specToStudioTracks(spec: ProtocolSpec, duration: Duration): { tracks: SeedTrack[]; name: string; totalSec: number } {
  const v = spec.versions.find((x) => x.duration === duration)
  if (!v) throw new Error(`This spec has no ${duration}-minute version.`)
  const totalSec = duration * 60

  const tracks: SeedTrack[] = []

  // binaural — clip per band segment
  {
    const plan = deriveBinauralPlan(spec, v)
    const clips: SeedClip[] = plan.map((seg, i) => ({
      startSec: seg.atSec,
      durationSec: Math.max(1, (plan[i + 1]?.atSec ?? totalSec) - seg.atSec),
      params: { carrierHz: seg.carrierHz, beatHz: seg.beatHz },
    }))
    tracks.push({ type: 'binaural', name: 'Binaural', volume: 0.25, clips })
  }

  // soundscape — full-length bed
  tracks.push({
    type: 'soundscape', name: 'Soundscape', volume: 0.18,
    clips: [{ startSec: 0, durationSec: totalSec, params: { texture: 'lake', warmth: 620 } }],
  })

  // music — clip per documented key change
  {
    const plan = deriveMusicPlan(v)
    const clips: SeedClip[] = plan
      .filter((seg) => seg.atSec < totalSec)
      .map((seg, i, arr) => ({
        startSec: seg.atSec,
        durationSec: Math.max(2, (arr[i + 1]?.atSec ?? totalSec) - seg.atSec),
        params: { chord: seg.chord as Chord },
      }))
    if (clips.length) tracks.push({ type: 'music', name: 'Music pad', volume: 0.2, clips })
  }

  // breathing — clip per breathing phase
  {
    const clips: SeedClip[] = v.phases
      .filter((p) => /breath/i.test(p.name) && p.endSec - p.startSec >= 4)
      .map((p) => ({
        startSec: p.startSec,
        durationSec: p.endSec - p.startSec,
        params: { breathsPerMin: spec.invariants.breathsPerMin ?? 6, toneHz: 300 },
      }))
    if (clips.length) tracks.push({ type: 'breath', name: 'Breathing cue', volume: 0.28, clips })
  }

  // bilateral — clip per ON window
  {
    const clips: SeedClip[] = deriveBilateral(v, totalSec).map((seg) => ({
      startSec: seg.startSec,
      durationSec: Math.max(1, seg.endSec - seg.startSec),
      params: { toneHz: seg.toneHz, blipMs: seg.blipMs, everySec: seg.everySec },
    }))
    if (clips.length) tracks.push({ type: 'bilateral', name: 'Bilateral (PAT-05)', volume: 0.06, clips })
  }

  // voice — guide lines vs echo/whisper layer (−8 dB starting volume)
  {
    const lines = voiceLinesForVersion(spec, duration).filter((l) => l.timeSec < totalSec - 1)
    const guide: SeedClip[] = []
    const low: SeedClip[] = []
    for (const { timeSec, line } of lines) {
      const clip: SeedClip = {
        startSec: timeSec + (line.delaySec ?? 0),
        durationSec: estimateSpeechSec(line.text),
        params: { pan: PAN[line.channel], pulseHz: 0.2, toneHz: 420 },
        text: line.text,
      }
      if (line.whisper || (line.gainDb ?? 0) < 0) low.push(clip)
      else guide.push(clip)
    }
    if (guide.length) tracks.push({ type: 'voice', name: 'Voice — guide', volume: 0.8, clips: guide })
    if (low.length) tracks.push({ type: 'voice', name: 'Voice — echo & whisper', volume: 0.32, clips: low })
  }

  return { tracks, name: `${spec.code} · ${duration} min`, totalSec }
}
