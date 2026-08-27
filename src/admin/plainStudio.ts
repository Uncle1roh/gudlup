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
import { MAX_SAMPLE_SLOTS, type BilateralParams, type BinauralParams, type SampleParams, type SampleSlot, type VoiceParams } from '../studio/multitrack'
import { defaultEffects, type TrackEffect } from '../studio/effects'
import { matchVoiceFromText, voiceLabel, voicesByArchetype, defaultPrimary, type CatalogVoice } from '../tts/voiceCatalog'
import {
  ANCHOR_LUFS,
  BILATERAL_SOUNDS,
  DEFAULT_BILATERAL_SOUND,
  bilateralSoundById,
  type BilateralSound,
} from '../studio/multitrack'
import { drawMusicPlaylist, drawSoundscape, mulberry32, newDrawLedger, type AssetPools } from './assetPools'
import { secToMmss, type PlainAffirmation, type PlainClip, type PlainTimeline, type PlainVersion } from './plainTimeline'

export interface PlainSeedOptions {
  /** Asset pools for the random draw (Rules §7.1–7.2). Absent = the sample
      lanes stay silent with a note (mock mode / library unreachable). */
  pools?: AssetPools
  /** RNG seed for reproducible draws. Default: fresh randomness per seed. */
  seed?: number
}

/* Level model (PO pipeline, rev. 3): the Excel's volume_db is an OFFSET vs
   the pinned anchor (voice 0 dB = ANCHOR_LUFS integrated). Every source
   clip is INPUT-NORMALIZED in LUFS and lands at anchor + offset — the
   number in the sheet produces the intended relationship whatever the
   source file's intrinsic loudness. The lane's dB sits on the FADER (the
   mixer reads the protocol); each clip is normalized to (its dB − lane
   base), so fader × clip = anchor + the Excel dB. Output normalization
   happens ONCE on the final mix (§9), ratios intact. */

/** §8.4 default levels when a clip leaves the volume column empty —
    offset encoding (dB vs voice) and LUFS encoding (absolute, README §6). */
const DEFAULT_DB: Record<PlainClip['tipo'], number> = {
  voice: 0,
  soundscape: -6,
  music: -18,
  binaural: -9,
  solfeggio: -14,
  bilateral: -12,
}
const DEFAULT_LUFS: Record<PlainClip['tipo'], number> = {
  voice: -16,
  soundscape: -28,
  music: -34,
  binaural: -34,
  solfeggio: -30,
  bilateral: -28,
}

/** The clip's level expressed as the engine's normalization offset
    (calibrateBufferToDb targets ANCHOR_LUFS + offset):
    · LUFS sheets: absolute target → offset = lufs − ANCHOR_LUFS
    · legacy offset sheets: the dB value itself. */
function clipLevel(c: PlainClip, mode: 'lufs' | 'offset'): number {
  if (mode === 'lufs') return (c.volumeLufs ?? DEFAULT_LUFS[c.tipo]) - ANCHOR_LUFS
  return c.volumeDb ?? DEFAULT_DB[c.tipo]
}

/** Human display of a level for notes. */
function levelLabel(v: number, mode: 'lufs' | 'offset'): string {
  return mode === 'lufs' ? `${(v + ANCHOR_LUFS).toFixed(0)} LUFS` : `${v} dB`
}

/* ---------------------------------------------------------- speech speed --

   `speed` is the engine's pitch-preserving rate: >1 talks FASTER (the buffer
   gets shorter), <1 slower. The format states cadence in words per minute;
   130 wpm is the spoken baseline the mapping is normalized to.

   A whispered line is authored slower than a spoken one, and the ASMR/Whisper
   ElevenLabs voices do NOT slow down on their own — so `sussurrato` rows whose
   sheet leaves velocita_wpm empty get the whisper baseline instead of the
   voice's natural (spoken) cadence. Before this, whisper lanes ran at ×1.00
   and the POs heard them as rushed. */
const SPOKEN_WPM = 130
const WHISPER_WPM = 110
/** The ostinato tail dissolves into the phase fade: 15% SLOWER, i.e. the
    speed is divided — not multiplied — by this factor. */
const TAIL_SLOWDOWN = 1.15

const clampSpeed = (v: number): number => +Math.min(1.4, Math.max(0.7, v)).toFixed(3)

/** Speech rate for a voice row: the sheet's wpm when present, else the whisper
    baseline for `sussurrato`, else the voice's own cadence (undefined). */
function clipSpeed(c: PlainClip): number | undefined {
  if (c.velocitaWpm !== undefined) return clampSpeed(c.velocitaWpm / SPOKEN_WPM)
  if (c.modalita === 'sussurrato') return clampSpeed(WHISPER_WPM / SPOKEN_WPM)
  return undefined
}

/* ------------------------------------------------------ bilateral pulse ----

   The pulse is a PO file now, not a synthesized beep, so a Bilateral row picks
   one from the shipped catalog. Priority: an explicit `timbro`/`suono` cell
   (matched by id, label or keyword), else the pitch tier implied by
   frequenza_blip_hz — the only pitched option left is the zen-tone trio, and
   the sheet's Hz is a statement about brightness — else the PO default. */
function resolveBilateralFromRow(c: PlainClip): { sound: BilateralSound; why: string } {
  const raw = (c.timbro ?? '').trim()
  if (raw) {
    const key = raw.toLowerCase()
    const hit = BILATERAL_SOUNDS.find((s) => s.id === key)
      ?? BILATERAL_SOUNDS.find((s) => s.label.toLowerCase() === key)
      ?? BILATERAL_SOUNDS.find((s) => key.includes(s.id.split('-')[0]) || s.label.toLowerCase().includes(key))
    if (hit) return { sound: hit, why: `colonna timbro "${raw}"` }
  }
  const hz = c.frequenzaBlipHz
  if (hz !== undefined) {
    const tier = hz < 300 ? 'zen-deep' : hz < 500 ? 'zen-mid' : 'zen-high'
    const sound = bilateralSoundById(tier)!
    return { sound, why: `frequenza_blip_hz ${hz} → tono zen ${hz < 300 ? 'grave' : hz < 500 ? 'medio' : 'medio-alto'} (il bip sintetico non esiste più)` }
  }
  const sound = bilateralSoundById(DEFAULT_BILATERAL_SOUND)!
  return { sound, why: raw ? `timbro "${raw}" non riconosciuto → predefinito` : 'nessun timbro nel foglio → predefinito' }
}

/** How a row's rate came about, for the import notes. */
function speedWhy(c: PlainClip, speed: number | undefined): string | null {
  if (speed === undefined) return null
  if (c.velocitaWpm !== undefined) return `velocità ${c.velocitaWpm} wpm → ×${speed.toFixed(2)} (${SPOKEN_WPM} wpm baseline)`
  return `sussurrato senza velocita_wpm → ×${speed.toFixed(2)} (${WHISPER_WPM} wpm whisper baseline)`
}

/** Dec. 6 (developer's mapping): archetype+modalità → catalog voice.
    sussurrato prefers a Whisper voice of the same gender as the archetype. */
export function resolvePlainVoice(archetipo: string | undefined, modalita: 'normale' | 'sussurrato' | undefined): { voice: CatalogVoice; why: string } {
  const base = matchVoiceFromText(archetipo) ?? defaultPrimary()
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
  /** crossfade_prec_s per clip (sample lanes) — applied as real overlaps. */
  xfades: number[]
}

export function plainToStudioTracks(
  timeline: PlainTimeline,
  version: PlainVersion,
  opts: PlainSeedOptions = {},
): { tracks: SeedTrack[]; name: string; totalSec: number; notes: string[] } {
  const notes: string[] = []
  const totalSec = version.durationS
  const affById = new Map(timeline.affirmations.map((a) => [a.id, a]))
  const rnd = mulberry32(opts.seed ?? Math.floor(Math.random() * 0xffffffff))
  const pools = opts.pools
  /* one ledger for the whole protocol: no music file is drawn twice while its
     phase pool still has an unused one */
  const ledger = newDrawLedger()

  /* Lanes keyed by final track name, created in file order so the Studio
     shows the same top-to-bottom structure as the Excel. */
  const lanes: Lane[] = []
  const laneByKey = new Map<string, Lane>()
  const lane = (key: string, make: () => SeedTrack): Lane => {
    let l = laneByKey.get(key)
    if (!l) {
      l = { key, track: make(), clipDbs: [], xfades: [] }
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
  const mode = version.levelMode
  for (const c of version.clips) {
    const nominalDb = clipLevel(c, mode)

    if (c.tipo === 'soundscape' || c.tipo === 'music') {
      const isHeartbeat = c.tipo === 'soundscape' && /heartbeat|battito|bpm/i.test(c.ambiente ?? '')
      /* A singing-bowl strike is an ACCENT, not a texture. It has to be told
         apart from a soundscape here because everything else about the two is
         the same, and a bowl looped over its clip rings again every few
         seconds instead of once. */
      const isBowl = c.tipo === 'soundscape' && /campan|bowl|tibetan|gong/i.test(c.ambiente ?? '')
      const l = lane(c.traccia, () => ({
        type: 'sample',
        name: c.traccia,
        volume: 0.3,
        channel: 'C',
        duck: isHeartbeat || isBowl ? 'none' : c.tipo === 'music' ? 'music' : 'soundscape',
        clips: [],
      }))
      /* Random draw (Rules §7.1–7.2): tag pool for soundscape, GLOBAL phase
         pool for music. A soundscape is one looping texture, so one draw is
         right. MUSIC is not: a clip longer than a song used to loop that song,
         and the POs heard it start again mid-clip in phase 4. So a music clip
         draws a PLAYLIST long enough to cover its window, and the renderer
         crossfades the songs in sequence and cuts the last one at the end. */
      const clipDur = c.endS - c.startS
      let url = ''
      let label = c.tipo === 'soundscape'
        ? `tag "${c.ambiente ?? '?'}" — no pool available`
        : `F${c.faseFrom ?? '?'} pool — no pool available`
      let slots: SampleSlot[] | undefined
      if (pools) {
        if (c.tipo === 'soundscape') {
          const drawn = drawSoundscape(pools, c.ambiente ?? '', rnd, ledger)
          if (drawn) {
            url = drawn.asset.publicUrl
            label = `${drawn.asset.name} · tag "${c.ambiente}"`
            notes.push(`${c.clipId} (${c.traccia}): drew "${drawn.asset.name}" — ${drawn.how}.`)
          } else {
            const pending = isHeartbeat ? ' (PO heartbeat file pending)' : isBowl ? ' (PO singing-bowl file pending)' : ''
            notes.push(`${c.clipId} (${c.traccia}): NO file for tag "${c.ambiente}" — clip stays silent${pending}.`)
          }
        } else {
          const drawn = drawMusicPlaylist(pools, c.faseFrom ?? 1, clipDur, MAX_SAMPLE_SLOTS, rnd, ledger)
          if (drawn && drawn.assets.length) {
            const picked: SampleSlot[] = drawn.assets.map((a) => ({ url: a.publicUrl, label: a.name }))
            slots = picked
            url = picked[0].url
            label = `${drawn.assets.map((a) => a.name).join(' → ')} · F${c.faseFrom} pool`
            notes.push(`${c.clipId} (${c.traccia}): ${drawn.assets.length === 1 ? 'drew' : 'playlist'} "${drawn.assets.map((a) => a.name).join('" → "')}" — ${drawn.how}.`)
            if (drawn.short) {
              notes.push(`${c.clipId} (${c.traccia}): ATTENZIONE — i brani disponibili coprono solo ~${Math.round(drawn.estimatedSec)}s dei ${Math.round(clipDur)}s della clip; la sequenza si ripeterà. Aggiungi brani al pool F${c.faseFrom} o accorcia la finestra.`)
            }
          } else {
            notes.push(`${c.clipId} (${c.traccia}): NO file for phase pool F${c.faseFrom} — clip stays silent.`)
          }
        }
      }
      const clip: SeedClip = {
        startSec: c.startS,
        durationSec: clipDur,
        params: {
          url,
          label,
          slots,
          // a texture loops; a song must not; a bowl strike rings once
          loop: c.tipo === 'soundscape' && !isBowl,
          drawTag: c.tipo === 'soundscape' ? (c.ambiente ?? undefined) : undefined,
          drawPhase: c.tipo === 'music' ? (c.faseFrom ?? 1) : undefined,
        } as SampleParams,
        fadeInSec: c.fadeInS,
        fadeOutSec: c.fadeOutS,
      }
      l.track.clips.push(clip)
      l.clipDbs.push(nominalDb)
      l.xfades.push(c.crossfadePrecS ?? 0)
      continue
    }

    if (c.tipo === 'binaural' || c.tipo === 'solfeggio') {
      const l = lane(c.traccia, () => ({ type: 'binaural', name: c.traccia, volume: 0.3, channel: 'C', clips: [] }))
      const params: BinauralParams = c.tipo === 'binaural'
        ? { carrierHz: ((c.carrierLHz ?? 200) + (c.carrierRHz ?? 210)) / 2, beatHz: (c.carrierRHz ?? 210) - (c.carrierLHz ?? 200) }
        : { carrierHz: c.frequenzaHz ?? 432, beatHz: 0 }
      /* BUTT-JOIN, never overlap. Two carrier pairs sounding together beat at
         the difference BETWEEN the pairs, not at either clip's intended rate:
         a 10 Hz clip (200/210 Hz) bleeding into a 6 Hz one (200/206 Hz) puts
         210 and 206 Hz in the same ear and wobbles at 4 Hz — the "binaural beat
         too fast, as if compressed" the POs heard once and could not reproduce,
         because it needs the sheet's own timings to overlap.
         The predecessor is cut short rather than the newcomer delayed: each
         clip's START is a phase boundary and has to stay put. plainTimeline
         warns about the same overlap so the Excel can be tidied. */
      const prev = l.track.clips[l.track.clips.length - 1]
      if (prev && prev.startSec < c.startS && prev.startSec + prev.durationSec > c.startS + 0.001) {
        prev.durationSec = c.startS - prev.startSec
        notes.push(`${c.clipId} (${c.traccia}): la clip precedente si sovrapponeva — accorciata a ${secToMmss(c.startS)} per giuntarle senza sovrapposizione (portanti sovrapposte = battimento sbagliato).`)
      }
      l.track.clips.push({ startSec: c.startS, durationSec: c.endS - c.startS, params, fadeInSec: c.fadeInS, fadeOutSec: c.fadeOutS })
      l.clipDbs.push(nominalDb)
      continue
    }

    if (c.tipo === 'bilateral') {
      const l = lane(c.traccia, () => ({ type: 'bilateral', name: c.traccia, volume: 0.3, channel: 'C', clips: [] }))
      const { sound, why } = resolveBilateralFromRow(c)
      const params: BilateralParams = {
        sound: sound.id,
        everySec: c.intervalloAlternanzaS ?? 4,
        panAmp: Math.min(1, Math.max(0, (c.panAmpiezza ?? 100) / 100)),
      }
      notes.push(`${c.clipId} (${c.traccia}): impulso bilaterale = ${sound.label} — ${why}.`)
      l.track.clips.push({ startSec: c.startS, durationSec: c.endS - c.startS, params, fadeInSec: c.fadeInS, fadeOutSec: c.fadeOutS })
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

      /* ---- whisper-ostinato (mini-spec §B): loop + sussurrato + single
         REF-xx. The refrain's "..."-separated fragments loop in a slow
         expiratory cadence for the whole window, deliberately OFFSET from
         the main affirmation interval; the last ~90 s slows down and drops
         a further −2.5 dB so it dissolves into the phase fade. ---- */
      const isOstinato = c.modalita === 'sussurrato' && ids.length === 1 && c.setRange && c.setRange.from === c.setRange.to
      if (isOstinato) {
        const aff = affById.get(ids[0])
        const fragments = (aff?.testo ?? '').split(/\.\.\./).map((x) => x.trim()).filter(Boolean)
        if (aff && fragments.length) {
          const SPACING = 5      // s between fragment starts [DESIGN ~4–5 s]
          const BREATH = 9       // s of breathing silence after a pass [DESIGN ~8–10 s]
          const cycleLen = fragments.length * SPACING + BREATH // 4 frags → 29 s (≠ 24 s main interval)
          const tailStart = Math.max(c.startS, c.endS - 90)
          /* the window only has to HOLD the whispered fragment — the real
             length comes from the TTS (the Studio resizes the clip on synthesis
             and the renderer no longer truncates). 3 s used to cut whispered
             fragments mid-phrase, which is what read as "too fast". */
          const FRAG_WINDOW = SPACING - 0.5
          // sussurrato by definition here, so clipSpeed() always answers
          const baseSpeed = clipSpeed(c) ?? clampSpeed(WHISPER_WPM / SPOKEN_WPM)
          const tailSpeed = clampSpeed(baseSpeed / TAIL_SLOWDOWN)
          l.track.duck = 'whisper' // sidechain: dips under the MAIN voice, never masks it
          let placedW = 0
          for (let cy = 0; ; cy++) {
            const cycleStart = c.startS + cy * cycleLen
            let done = false
            for (let i = 0; i < fragments.length; i++) {
              const start = cycleStart + i * SPACING
              const inTail = start >= tailStart // per-FRAGMENT: the whole last ~90 s dissolves
              if (start + FRAG_WINDOW > c.endS - 0.5) { done = true; break }
              l.track.clips.push({
                startSec: start,
                durationSec: FRAG_WINDOW,
                // diffuse, never dry-center: gentle alternating spread
                params: {
                  pan: ((i % 2 === 0 ? -1 : 1) * 0.15),
                  pulseHz: 0.35,
                  toneHz: 320,
                  // the tail really slows DOWN: speed is divided, not multiplied
                  speed: inTail ? tailSpeed : baseSpeed,
                  voiceId: voice.id,
                } as VoiceParams,
                text: fragments[i],
                fadeInSec: 1,
                fadeOutSec: inTail ? 3 : 1.5, // the tail dissolves, no hard cut
              })
              l.clipDbs.push(nominalDb + (inTail ? -2.5 : 0))
              placedW++
            }
            if (done || c.startS + (cy + 1) * cycleLen >= c.endS) break
          }
          notes.push(`Whisper-ostinato ${c.clipId} (${ids[0]}): ${placedW} fragment clips ("${fragments.join(' / ')}") — ${SPACING}s cadence + ${BREATH}s breath = ${cycleLen}s cycle, offset from the affirmation interval; spoken at ×${baseSpeed.toFixed(2)} (${speedWhy(c, baseSpeed)}); the last ~90 s slows to ×${tailSpeed.toFixed(2)} and drops −2.5 dB into the ${secToMmss(c.endS)} fade; ducks −2.5 dB under the main voice (never masks the −16 LUFS anchor).`)
          continue
        }
      }

      const interval = c.intervalloS ?? 20
      const cycles = Math.max(1, c.cicli ?? 1)
      const att = c.attenuazioneCicloDb ?? -3
      // loop rows used to drop velocita_wpm entirely — whisper loops ran at the
      // voice's own (spoken) cadence
      const loopSpeed = clipSpeed(c)
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
            params: { pan: channel === 'C' ? (c.pan ?? 0) / 100 : 0, pulseHz: 0.35, toneHz: 320, speed: loopSpeed, voiceId: voice.id } as VoiceParams,
            text: aff.testo,
            fadeInSec: 1, // Rules doc: per-affirmation envelope is an app default
            fadeOutSec: 2,
          })
          l.clipDbs.push(nominalDb + cy * att)
          placed++
        }
      }
      notes.push(`Loop ${c.clipId} (${c.setAffermazioni}): ${placed} affirmation clips on "${l.track.name}" — every ${interval}s × ${cycles} cycle${cycles === 1 ? '' : 's'}${cycles > 1 ? ` (${att} dB per cycle)` : ''}, 1s/2s default envelope${loopSpeed !== undefined ? `, ${speedWhy(c, loopSpeed)}` : ''}${c.eco ? `, Emotional Echo +${c.ecoRitardoS ?? 2}s ${c.ecoVolumeDb ?? -8}dB` : ''}${skipped ? ` · ${skipped} skipped (window ends ${secToMmss(c.endS)})` : ''}.`)
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
    const speed = clipSpeed(c)
    if (speed !== undefined) notes.push(`${c.clipId}: ${speedWhy(c, speed)}.`)
    l.track.clips.push({
      startSec: c.startS,
      durationSec: c.endS - c.startS,
      params: { pan: channel === 'C' ? (c.pan ?? 0) / 100 : 0, pulseHz: 0.35, toneHz: 320, speed, voiceId: voice.id } as VoiceParams,
      text: c.testo,
      fadeInSec: c.fadeInS,
      fadeOutSec: c.fadeOutS,
    })
    l.clipDbs.push(nominalDb)
  }

  /* ---------------- per-lane levels.
     LUFS sheets (current): every clip is input-normalized to its ABSOLUTE
     volume_lufs target — the sheet IS the mix — and every fader sits at
     neutral 0.0 dB (pure user offset on top of an authored mix).
     Legacy offset sheets: the lane's dB sits on the fader; clips are
     normalized to (their dB − lane base). */
  for (const l of lanes) {
    if (!l.clipDbs.length) { l.track.volume = 1; continue }
    if (mode === 'lufs') {
      l.track.volume = 1
      l.track.clips.forEach((clip, i) => {
        clip.calibrateDb = +l.clipDbs[i].toFixed(2)
        clip.gainDb = undefined
      })
      const hi = Math.max(...l.clipDbs)
      const lo = Math.min(...l.clipDbs)
      l.track.baseLufs = +(ANCHOR_LUFS + hi).toFixed(1) // fader reads/edits LUFS
      notes.push(`"${l.track.name}": clips input-normalized to ${hi === lo ? levelLabel(hi, 'lufs') : `${levelLabel(hi, 'lufs')}…${levelLabel(lo, 'lufs')}`} (from the Excel); fader neutral.`)
    } else {
      const base = Math.min(12, Math.max(-60, Math.max(...l.clipDbs)))
      l.track.volume = +Math.pow(10, base / 20).toFixed(4)
      l.track.clips.forEach((clip, i) => {
        clip.calibrateDb = +(l.clipDbs[i] - base).toFixed(2)
        clip.gainDb = undefined
      })
      // legacy offset sheets read in LUFS too: at fader gain 1 the lane sits
      // at anchor (clips normalized to dB−base, fader carries base)
      l.track.baseLufs = ANCHOR_LUFS
      const lo = Math.min(...l.clipDbs)
      notes.push(`"${l.track.name}": fader at ${(ANCHOR_LUFS + base).toFixed(0)} LUFS (the Excel's ${base} dB vs voice); clips input-normalized${lo < base ? `, quieter ones down to ${(lo - base).toFixed(0)} dB vs the fader` : ''}.`)
    }
  }

  /* ---------------- crossfade_prec_s → real overlaps (Rules §7): a sample
     clip with crossfade X starts X s EARLY with an equal-power fade-in of X
     while its predecessor gets an equal-power fade-out of X — the beds hand
     over instead of hard-cutting. (The Excel writes abutting times; the
     overlap is created here.) */
  for (const l of lanes) {
    if (l.track.type !== 'sample') continue
    let applied = 0
    for (let i = 0; i < l.track.clips.length; i++) {
      const xf = l.xfades[i] ?? 0
      if (xf <= 0) continue
      const clip = l.track.clips[i]
      const prev = i > 0 ? l.track.clips[i - 1] : null
      const shift = Math.min(xf, clip.startSec)
      clip.startSec = +(clip.startSec - shift).toFixed(3)
      clip.durationSec = +(clip.durationSec + shift).toFixed(3)
      clip.fadeInSec = Math.max(clip.fadeInSec ?? 0, xf)
      if (prev) prev.fadeOutSec = Math.max(prev.fadeOutSec ?? 0, xf)
      applied++
    }
    if (applied) notes.push(`"${l.track.name}": ${applied} crossfade${applied === 1 ? '' : 's'} (crossfade_prec_s) applied as real equal-power overlaps.`)
  }

  /* Reverb note (once per reverb'd lane). */
  for (const l of lanes) {
    const rv = l.track.effects?.find((e) => e.kind === 'reverb' && e.enabled)
    if (rv) notes.push(`"${l.track.name}": Reverb ${Math.round((rv.params.mix ?? 0) * 100)}% (riverbero_pct — track-level effect).`)
  }

  const code = timeline.code ?? 'PLAIN'
  return { tracks: lanes.map((l) => l.track), name: `${code} · ${version.sheet}`, totalSec, notes }
}
