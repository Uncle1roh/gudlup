/* ============================================================================
   Good Loop — PLAIN Timeline → editable Studio project (1 row = 1 clip)
   Every Excel row becomes exactly ONE Studio clip, on a track named from its
   `traccia` column. Mapping per type:

     Soundscape → SAMPLE track (label = the `ambiente` tag; the file is drawn
                  at random from the tag pool — slice 3 fills the URL; until
                  then the lane is a visible, silent reminder)
     Music      → SAMPLE track (label = "F<fase> pool"; same draw logic)
     Binaural   → binaural clip: carrierHz = (L+R)/2, beatHz = R−L
     Solfeggio  → binaural clip with beat 0 (pure tone — house convention)
     Bilateral  → bilateral clip (intervallo/blip/pan_ampiezza)
     Voice      → voice clip; archetipo+modalità → catalog voice (Dec. 6:
                  modalità=sussurrato prefers a Whisper-archetype voice of the
                  SAME GENDER as the resolved archetype voice); pan per clip
                  (whole-track channel when every clip sits hard L/R);
                  riverbero → track Reverb; eco → track Emotional Echo;
                  tipo_contenuto=loop expands the affirmation set by rule
                  (intervallo × cicli, attenuazione per cycle, 1s/2s default
                  envelope per the Rules doc).

   Volume model: guide voice 0 dB = linear 0.8 (house reference). Each track's
   fader is set from its LOUDEST clip's nominal dB; the per-clip difference
   rides as `gainDb`, baked into the clip buffer together with the Excel
   fade_in/fade_out (applyClipShape) — so waveform, playback and mixdown agree.

   Documented MVP approximations (per the Rules doc §6):
     · crossfade_prec_s → the clips simply overlap by that amount, each with
       its own fades (glide ≈ crossfade)
     · pan/binaural glides = successive clips (already how the format writes)

   Track splits that keep the 1:1 row↔clip guarantee but respect track-level
   FX: linea clips WITH eco go to a "<traccia> · eco" companion track (echo
   pre-enabled); a loop clip expands on its own "<traccia> · loop" track.
   Every deviation is recorded in `notes`.
   ============================================================================ */

import type { SeedClip, SeedTrack } from '../compose/types'
import type { BilateralParams, BinauralParams, SampleParams, VoiceParams } from '../studio/multitrack'
import { defaultEffects, type TrackEffect } from '../studio/effects'
import { matchVoiceFromText, voiceLabel, voicesByArchetype, DEFAULT_PRIMARY, type CatalogVoice } from '../tts/voiceCatalog'
import { secToMmss, type PlainAffirmation, type PlainClip, type PlainTimeline, type PlainVersion } from './plainTimeline'

/** House reference: guide voice 0 dB ≙ linear 0.8 on the track fader. */
const REF_LINEAR = 0.8

/** §8.4 default nominal levels when a clip leaves volume_db empty. */
const DEFAULT_DB: Record<PlainClip['tipo'], number> = {
  voice: 0,
  soundscape: -6,
  music: -18,
  binaural: -9,
  solfeggio: -14,
  bilateral: -12,
}

const dbToLinear = (db: number) => Math.min(1, Math.max(0.02, REF_LINEAR * Math.pow(10, db / 20)))

function clipDb(c: PlainClip): number {
  return c.volumeDb ?? DEFAULT_DB[c.tipo]
}

/** Dec. 6 (developer's mapping): archetype+modalità → catalog voice.
    sussurrato prefers a Whisper voice of the same gender as the archetype. */
export function resolvePlainVoice(archetipo: string | undefined, modalita: 'normale' | 'sussurrato' | undefined): { voice: CatalogVoice; why: string } {
  const base = matchVoiceFromText(archetipo) ?? DEFAULT_PRIMARY
  const baseWhy = matchVoiceFromText(archetipo) ? `archetipo "${archetipo}"` : archetipo ? `archetipo "${archetipo}" not in catalog → default` : 'no archetipo → default'
  if (modalita !== 'sussurrato') return { voice: base, why: baseWhy }
  if (base.archetype === 'whisper') return { voice: base, why: `${baseWhy} (already Whisper)` }
  const whispers = voicesByArchetype('whisper')
  const sameGender = whispers.find((v) => v.gender === base.gender)
  const chosen = sameGender ?? whispers[0]
  if (!chosen) return { voice: base, why: `${baseWhy} · sussurrato but no Whisper voices in catalog` }
  return { voice: chosen, why: `${baseWhy} + sussurrato → Whisper [${chosen.gender}]` }
}

interface Lane {
  key: string
  track: SeedTrack
  clipDbs: number[]
}

export function plainToStudioTracks(
  timeline: PlainTimeline,
  version: PlainVersion,
): { tracks: SeedTrack[]; name: string; totalSec: number; notes: string[] } {
  const notes: string[] = []
  const totalSec = version.durationS
  const affById = new Map(timeline.affirmations.map((a) => [a.id, a]))

  /* Lanes keyed by final track name, created in file order so the Studio
     shows the same top-to-bottom structure as the Excel. */
  const lanes: Lane[] = []
  const laneByKey = new Map<string, Lane>()
  const lane = (key: string, make: () => SeedTrack): Lane => {
    let l = laneByKey.get(key)
    if (!l) {
      l = { key, track: make(), clipDbs: [] }
      laneByKey.set(key, l)
      lanes.push(l)
    }
    return l
  }

  /* Voice-track channel decision: collect the pans of the MAIN (non-eco,
     non-loop) linea clips per traccia first. All at −100 → track L; all at
     +100 → track R (pan 0 per clip); mixed → per-clip pans, channel C. */
  const mainPans = new Map<string, Set<number>>()
  for (const c of version.clips) {
    if (c.tipo !== 'voice' || c.tipoContenuto === 'loop' || c.eco) continue
    const set = mainPans.get(c.traccia) ?? new Set<number>()
    set.add(c.pan ?? 0)
    mainPans.set(c.traccia, set)
  }
  const trackChannel = (traccia: string): 'L' | 'C' | 'R' => {
    const set = mainPans.get(traccia)
    if (!set || set.size !== 1) return 'C'
    const only = [...set][0]
    return only === -100 ? 'L' : only === 100 ? 'R' : 'C'
  }

  /* Per-traccia voice resolution memo + note (one line per traccia/modalità). */
  const voiceNoteEmitted = new Set<string>()
  const voiceFor = (c: PlainClip): CatalogVoice => {
    const { voice, why } = resolvePlainVoice(c.archetipo, c.modalita)
    const noteKey = `${c.traccia}|${c.archetipo ?? ''}|${c.modalita ?? ''}`
    if (!voiceNoteEmitted.has(noteKey)) {
      voiceNoteEmitted.add(noteKey)
      notes.push(`Voice "${c.traccia}"${c.modalita === 'sussurrato' ? ' (sussurrato)' : ''} → ${voiceLabel(voice)} — ${why}.`)
    }
    return voice
  }

  /* Track-level FX derived from clip fields (echo/reverb are per-track in the
     Studio; the split lanes keep them honest). */
  const echoFx = (delaySec: number, volumeDb: number): TrackEffect[] =>
    defaultEffects().map((e) => (e.kind === 'echo'
      ? { ...e, enabled: true, params: { ...e.params, delaySec, feedback: 0.22, mix: Math.min(0.9, Math.pow(10, volumeDb / 20)) } }
      : e))
  const withReverb = (fx: TrackEffect[] | undefined, pct: number): TrackEffect[] =>
    (fx ?? defaultEffects()).map((e) => (e.kind === 'reverb'
      ? { ...e, enabled: true, params: { ...e.params, mix: Math.min(0.9, pct / 100) } }
      : e))

  /* ---------------- clip placement (1 row = 1 clip; loops expand by rule) */
  for (const c of version.clips) {
    const nominalDb = clipDb(c)

    if (c.tipo === 'soundscape' || c.tipo === 'music') {
      const l = lane(c.traccia, () => ({ type: 'sample', name: c.traccia, volume: 0.3, channel: 'C', clips: [] }))
      const label = c.tipo === 'soundscape'
        ? `tag "${c.ambiente ?? '?'}" — drawn at import/render (slice 3)`
        : `F${c.faseFrom ?? '?'} pool — drawn at import/render (slice 3)`
      const clip: SeedClip = {
        startSec: c.startS,
        durationSec: c.endS - c.startS,
        params: { url: '', label } as SampleParams,
        gainDb: 0, // rewritten below once the track base is known
        fadeInSec: c.fadeInS,
        fadeOutSec: c.fadeOutS,
      }
      l.track.clips.push(clip)
      l.clipDbs.push(nominalDb)
      continue
    }

    if (c.tipo === 'binaural' || c.tipo === 'solfeggio') {
      const l = lane(c.traccia, () => ({ type: 'binaural', name: c.traccia, volume: 0.3, channel: 'C', clips: [] }))
      const params: BinauralParams = c.tipo === 'binaural'
        ? { carrierHz: ((c.carrierLHz ?? 200) + (c.carrierRHz ?? 210)) / 2, beatHz: (c.carrierRHz ?? 210) - (c.carrierLHz ?? 200) }
        : { carrierHz: c.frequenzaHz ?? 432, beatHz: 0 }
      l.track.clips.push({ startSec: c.startS, durationSec: c.endS - c.startS, params, gainDb: 0, fadeInSec: c.fadeInS, fadeOutSec: c.fadeOutS })
      l.clipDbs.push(nominalDb)
      continue
    }

    if (c.tipo === 'bilateral') {
      const l = lane(c.traccia, () => ({ type: 'bilateral', name: c.traccia, volume: 0.3, channel: 'C', clips: [] }))
      const params: BilateralParams = {
        toneHz: c.frequenzaBlipHz ?? 400,
        blipMs: 120,
        everySec: c.intervalloAlternanzaS ?? 4,
        panAmp: Math.min(1, Math.max(0, (c.panAmpiezza ?? 100) / 100)),
      }
      l.track.clips.push({ startSec: c.startS, durationSec: c.endS - c.startS, params, gainDb: 0, fadeInSec: c.fadeInS, fadeOutSec: c.fadeOutS })
      l.clipDbs.push(nominalDb)
      continue
    }

    /* ---- voice ---- */
    const voice = voiceFor(c)
    const channel = trackChannel(c.traccia)

    if (c.tipoContenuto === 'loop') {
      // dedicated lane: the loop has its own level and (optional) echo
      const key = `${c.traccia} · loop`
      const l = lane(key, () => ({
        type: 'voice',
        name: `${c.traccia} · loop (${c.setAffermazioni ?? 'set'})`,
        volume: 0.3,
        channel,
        effects: c.eco ? echoFx(c.ecoRitardoS ?? 2, c.ecoVolumeDb ?? -8) : undefined,
        clips: [],
      }))
      if (c.riverberoPct !== undefined && c.riverberoPct > 0) l.track.effects = withReverb(l.track.effects, c.riverberoPct)
      const ids = c.setRange?.ids ?? []
      const interval = c.intervalloS ?? 20
      const cycles = Math.max(1, c.cicli ?? 1)
      const att = c.attenuazioneCicloDb ?? -3
      let placed = 0
      let skipped = 0
      for (let cy = 0; cy < cycles; cy++) {
        for (let i = 0; i < ids.length; i++) {
          const aff: PlainAffirmation | undefined = affById.get(ids[i])
          if (!aff) continue
          const start = c.startS + (cy * ids.length + i) * interval
          const dur = Math.min(aff.durataS ?? Math.min(6, interval - 1), Math.max(1, interval - 0.5))
          if (start + dur > c.endS + 0.01) { skipped++; continue }
          l.track.clips.push({
            startSec: start,
            durationSec: dur,
            params: { pan: channel === 'C' ? (c.pan ?? 0) / 100 : 0, pulseHz: 0.35, toneHz: 320, voiceId: voice.id } as VoiceParams,
            text: aff.testo,
            gainDb: cy * att, // rebased below; cycle attenuation stays relative
            fadeInSec: 1, // Rules doc: per-affirmation envelope is an app default
            fadeOutSec: 2,
          })
          l.clipDbs.push(nominalDb + cy * att)
          placed++
        }
      }
      notes.push(`Loop ${c.clipId} (${c.setAffermazioni}): ${placed} affirmation clips on "${l.track.name}" — every ${interval}s × ${cycles} cycle${cycles === 1 ? '' : 's'}${cycles > 1 ? ` (${att} dB per cycle)` : ''}, 1s/2s default envelope${c.eco ? `, Emotional Echo +${c.ecoRitardoS ?? 2}s ${c.ecoVolumeDb ?? -8}dB` : ''}${skipped ? ` · ${skipped} skipped (window ends ${secToMmss(c.endS)})` : ''}.`)
      if (c.sequenza) notes.push(`Loop ${c.clipId}: "sequenza" column present but not expanded (non-uniform loops are a later slice).`)
      continue
    }

    // linea — eco clips ride a companion lane so the echo FX stays honest
    const hasEco = !!c.eco
    const key = hasEco ? `${c.traccia} · eco` : c.traccia
    const l = lane(key, () => ({
      type: 'voice',
      name: hasEco ? `${c.traccia} · eco` : c.traccia,
      volume: 0.3,
      channel,
      effects: hasEco ? echoFx(c.ecoRitardoS ?? 2, c.ecoVolumeDb ?? -8) : undefined,
      clips: [],
    }))
    if (hasEco && l.track.clips.length === 0) {
      notes.push(`"${c.traccia}": clips with eco=on ride the companion track "${l.track.name}" (Emotional Echo pre-enabled) — echo is a track effect.`)
    }
    if (c.riverberoPct !== undefined && c.riverberoPct > 0) {
      l.track.effects = withReverb(l.track.effects, c.riverberoPct)
    }
    const speed = c.velocitaWpm !== undefined ? Math.min(1.4, Math.max(0.7, c.velocitaWpm / 130)) : undefined
    if (speed !== undefined) notes.push(`${c.clipId}: velocità ${c.velocitaWpm} wpm → ×${speed.toFixed(2)} speed (130 wpm baseline — MVP mapping).`)
    l.track.clips.push({
      startSec: c.startS,
      durationSec: c.endS - c.startS,
      params: { pan: channel === 'C' ? (c.pan ?? 0) / 100 : 0, pulseHz: 0.35, toneHz: 320, speed, voiceId: voice.id } as VoiceParams,
      text: c.testo,
      gainDb: 0,
      fadeInSec: c.fadeInS,
      fadeOutSec: c.fadeOutS,
    })
    l.clipDbs.push(nominalDb)
  }

  /* ---------------- per-lane volume: fader = loudest clip's nominal dB;
     each clip's gainDb = its nominal − the track base (≤ 0, no clipping). */
  for (const l of lanes) {
    if (!l.clipDbs.length) continue
    const baseDb = Math.max(...l.clipDbs)
    l.track.volume = +dbToLinear(baseDb).toFixed(3)
    l.track.clips.forEach((clip, i) => {
      const rel = +(l.clipDbs[i] - baseDb).toFixed(2)
      clip.gainDb = rel === 0 ? undefined : rel
    })
    const spread = Math.max(...l.clipDbs) - Math.min(...l.clipDbs)
    if (spread > 0.01) notes.push(`"${l.track.name}": fader at ${baseDb} dB (rel. voice); per-clip offsets down to −${spread.toFixed(0)} dB baked into the clips.`)
  }

  /* Reverb note (once per reverb'd lane). */
  for (const l of lanes) {
    const rv = l.track.effects?.find((e) => e.kind === 'reverb' && e.enabled)
    if (rv) notes.push(`"${l.track.name}": Reverb ${Math.round((rv.params.mix ?? 0) * 100)}% (riverbero_pct — track-level effect).`)
  }

  const code = timeline.code ?? 'PLAIN'
  return { tracks: lanes.map((l) => l.track), name: `${code} · ${version.sheet}`, totalSec, notes }
}
