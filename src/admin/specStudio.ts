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

/* ---------------------------------------------------------------------------
   Datasheet → Studio project (real assets)
   Same layer structure as specToStudioTracks, but when the protocol has an
   Asset Library mapping, the synth Music/Soundscape tracks are replaced with
   SAMPLE tracks — one clip per mapped phase, each playing the actual library
   file (looped to the phase length). Unmapped phases keep the synth fallback
   on a separate track so nothing goes silent. Voice clips carry their text:
   hit ♪ Synthesize on a clip (or "Synthesize all") to render the real voice.
   --------------------------------------------------------------------------- */

import { assetPublicUrl, PHASE_KEYS, type AssetMap, type PhaseKey } from './assets'
import { datasheetToProtocolSpec, speakableText, type Datasheet } from './datasheet'
import { matchVoiceFromText } from '../tts/voiceCatalog'
import type { VoiceParams, BinauralParams, BreathParams } from '../studio/multitrack'

export function datasheetToStudioTracks(
  ds: Datasheet,
  duration: Duration,
  assetMap?: AssetMap,
): { tracks: SeedTrack[]; name: string; totalSec: number } {
  const base = specToStudioTracks(datasheetToProtocolSpec(ds), duration)
  const phases = ds.phases.filter((p) => p.duration === duration)
  const totalSec = base.totalSec

  /* ---- v2: rebuild the VOICE tracks straight from the datasheet rows so
     every clip carries ITS OWN voice (row Voce → catalog id), fine pan and
     speed — "Synthesize all" then speaks each line with the right voice. */
  {
    const rows = ds.timelines[duration] ?? []
    const defP = matchVoiceFromText(ds.defaultVoice)
    const defM = matchVoiceFromText(ds.defaultVoiceM)
    const affByRec = new Map(ds.affirmations.map((a) => [a.id, a]))
    const guide: SeedClip[] = []
    const low: SeedClip[] = []
    for (const r of rows) {
      if (r.channel === 'SYS') continue
      if (!(r.kind === 'VOCE' || r.kind === 'LOOP' || r.kind === 'ECO' || r.kind === 'SUSSURRO')) continue
      const text = speakableText(r)
      if (!text || r.timeSec >= totalSec) continue
      const rowVoice = matchVoiceFromText(r.voiceName)
        ?? (r.kind === 'LOOP' && r.rec ? matchVoiceFromText(affByRec.get(r.rec.toUpperCase())?.voiceName) : undefined)
        ?? (r.voice === 'M' ? defM : defP)
      const pan = r.pan ?? (r.channel === 'L' ? -1 : r.channel === 'R' ? 1 : 0)
      const params: VoiceParams = { pan, pulseHz: 0.35, toneHz: 320, speed: r.speed, voiceId: rowVoice?.id }
      const clip: SeedClip = { startSec: r.timeSec, durationSec: Math.min(9, Math.max(4, text.length / 11)), params, text }
      if (r.kind === 'ECO' || r.kind === 'SUSSURRO') low.push(clip)
      else guide.push(clip)
    }
    if (guide.length || low.length) {
      const keep = base.tracks.filter((t) => t.type !== 'voice')
      if (guide.length) keep.push({ type: 'voice', name: 'Voice — guide', volume: 0.8, clips: guide })
      if (low.length) keep.push({ type: 'voice', name: 'Voice — echo & whisper', volume: 0.32, clips: low })
      base.tracks = keep
    }
  }

  /* ---- v2: binaural CURVE as per-phase clips (visible/editable) ---- */
  {
    const curve = phases.filter((p) => p.binaural && p.startSec < totalSec)
    if (curve.length) {
      const binBase = base.tracks.find((t) => t.type === 'binaural')
      const baseParams = binBase?.clips[0]?.params as BinauralParams | undefined
      const carrier = baseParams?.carrierHz ?? 200
      const baseBeat = baseParams?.beatHz ?? 8
      const clips: SeedClip[] = []
      let cursor = 0
      const pushSeg = (endSec: number, beat: number) => {
        const dur = Math.min(totalSec, endSec) - cursor
        if (dur > 1) clips.push({ startSec: cursor, durationSec: dur, params: { carrierHz: carrier, beatHz: beat } as BinauralParams })
        cursor = Math.min(totalSec, endSec)
      }
      for (const p of curve) { pushSeg(p.startSec, baseBeat); pushSeg(p.endSec, p.binaural!.beatHz) }
      pushSeg(totalSec, baseBeat)
      if (binBase) { binBase.name = `Binaural (curve ${baseBeat}→${curve[0].binaural!.beatHz} Hz)`; binBase.clips = clips }
    }
  }

  /* ---- v2: Solfeggio layer (### MIX) — a binaural clip with beat 0 is a
     pure tone on both channels ---- */
  if (ds.mix?.solfeggioHz) {
    base.tracks.push({
      type: 'binaural',
      name: `Solfeggio ${ds.mix.solfeggioHz} Hz`,
      volume: 0.12,
      clips: [{ startSec: 0, durationSec: totalSec, params: { carrierHz: ds.mix.solfeggioHz, beatHz: 0 } as BinauralParams }],
    })
  }

  /* ---- v2: breathing pacer (### RESPIRAZIONE) as breath clips ---- */
  {
    const rows = (ds.breathing ?? []).filter((b) => b.duration === duration && b.guided)
    if (rows.length) {
      const clips: SeedClip[] = []
      for (const b of rows) {
        const ph = phases.find((p) => p.id === b.phase)
        if (!ph || ph.startSec >= totalSec) continue
        const nums = (b.pattern.match(/\d+(?:[.,]\d+)?/g) ?? []).map((x) => parseFloat(x.replace(',', '.')))
        const cycleSec = nums.length >= 2 ? nums.reduce((a, x) => a + x, 0) : 10
        clips.push({
          startSec: ph.startSec + 2,
          durationSec: Math.min(Math.max(8, b.cycles * cycleSec + 2), ph.endSec - ph.startSec - 2),
          params: { breathsPerMin: Math.max(2, Math.min(12, 60 / cycleSec)), toneHz: 280 } as BreathParams,
        })
      }
      if (clips.length) base.tracks.push({ type: 'breath', name: 'Breathing pacer', volume: 0.14, clips })
    }
  }

  if (!assetMap) return base
  const key = (id: number): PhaseKey => PHASE_KEYS[Math.min(5, Math.max(0, id - 1))]
  const fileName = (path: string) => path.split('/').pop() ?? path

  const sampleClips = (paths: Partial<Record<PhaseKey, string>>): { clips: SeedClip[]; covered: Set<number> } => {
    const clips: SeedClip[] = []
    const covered = new Set<number>()
    for (const p of phases) {
      const path = paths[key(p.id)]
      if (!path) continue
      let url = ''
      try { url = assetPublicUrl(path) } catch { continue } // no Supabase env → keep synth
      clips.push({
        startSec: p.startSec,
        durationSec: Math.max(1, p.endSec - p.startSec),
        params: { url, label: `F${p.id} · ${fileName(path)}` },
      })
      covered.add(p.id)
    }
    return { clips, covered }
  }

  const music = sampleClips(assetMap.music)
  const scape = sampleClips(assetMap.soundscape)
  const tracks: SeedTrack[] = []
  for (const t of base.tracks) {
    if (t.type === 'music' && music.clips.length) {
      // keep synth clips only where no stem is mapped (phase coverage gaps)
      const keep = t.clips.filter((c) => {
        const ph = phases.find((p) => c.startSec >= p.startSec - 1 && c.startSec < p.endSec)
        return ph ? !music.covered.has(ph.id) : true
      })
      if (keep.length) tracks.push({ ...t, name: 'Music (synth gaps)', volume: 0.10, clips: keep })
      tracks.push({ type: 'sample', name: 'Music (library stems)', volume: 0.30, clips: music.clips })
      continue
    }
    if (t.type === 'soundscape' && scape.clips.length) {
      const keep = t.clips.filter((c) => {
        const ph = phases.find((p) => c.startSec >= p.startSec - 1 && c.startSec < p.endSec)
        return ph ? !scape.covered.has(ph.id) : true
      })
      if (keep.length) tracks.push({ ...t, name: 'Soundscape (synth gaps)', volume: 0.10, clips: keep })
      tracks.push({ type: 'sample', name: 'Soundscape (library)', volume: 0.35, clips: scape.clips })
      continue
    }
    tracks.push(t)
  }
  return { tracks, name: base.name, totalSec: base.totalSec }
}
