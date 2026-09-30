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

import type { ScriptIndex, SeedClip, SeedTrack, StudioPhase, VoiceChoice } from '../compose/types'
import { MAX_SAMPLE_SLOTS, type BilateralParams, type BinauralParams, type SampleParams, type SampleSlot, type VoiceParams } from '../studio/multitrack'
import { defaultEffects, type TrackEffect } from '../studio/effects'
import { applyFxSpecs, describeFx, fxKey } from './plainFx'
import { matchVoiceFromText, voiceLabel, voicesByArchetype, defaultPrimary, hasVoicesFor, type CatalogVoice } from '../tts/voiceCatalog'
import { LANG_IN, VOICE_LANGS, scriptKey, textIn, type TextByLang, type VoiceLang } from '../tts/voiceLang'
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
  /**
   * The language the seeded clips are SPOKEN in: which text lands in `text`
   * and which voice in `params`. Every language's text and voice are seeded
   * onto the clip regardless (`textByLang` / `voiceByLang`), so a session
   * seeded in one language can be worked in the other. Default Italian.
   */
  lang?: VoiceLang
}

/* ------------------------------------------------ texts per language ----

   One workbook row speaks in several languages; the Studio clip it becomes
   carries all of them. The helpers below are the only place that decides
   which text of a row belongs to which language, so the seed, the render and
   the "fill a saved session's missing language" lookup cannot disagree. */

function rowScript(c: Pick<PlainClip, 'testo' | 'testoByLang'>): TextByLang | undefined {
  return c.testoByLang ?? (c.testo ? { it: c.testo } : undefined)
}
function affScript(a: Pick<PlainAffirmation, 'testo' | 'testoByLang'> | undefined): TextByLang | undefined {
  if (!a) return undefined
  return a.testoByLang ?? (a.testo ? { it: a.testo } : undefined)
}
/** Only the languages that can be spoken — English is stored, not voiced. */
function spoken(byLang: TextByLang | undefined): Partial<Record<VoiceLang, string>> {
  const out: Partial<Record<VoiceLang, string>> = {}
  for (const l of VOICE_LANGS) { const v = textIn(byLang, l); if (v) out[l] = v }
  return out
}
/** A whispered refrain's "..."-separated fragments, in one language. */
function fragmentsOf(text: string | undefined): string[] {
  return (text ?? '').split(/\.\.\.|…/).map((x) => x.trim()).filter(Boolean)
}

/**
 * How many spoken lines of one version have NO text in `lang` — linea clips,
 * and the affirmations its loops and sequences speak. What a render in that
 * language would leave silent, counted before anyone presses Publish.
 */
export function missingScripts(timeline: PlainTimeline, version: PlainVersion, lang: VoiceLang): number {
  const affById = new Map(timeline.affirmations.map((a) => [a.id, a]))
  let n = 0
  const affIds = new Set<string>()
  for (const c of version.clips) {
    if (c.tipo !== 'voice') continue
    if (c.tipoContenuto === 'loop') {
      for (const id of c.setRange?.ids ?? []) affIds.add(id)
      for (const st of c.sequenzaSteps ?? []) affIds.add(st.id)
      continue
    }
    if (!textIn(rowScript(c), lang)) n++
  }
  for (const id of affIds) if (!textIn(affScript(affById.get(id)), lang)) n++
  return n
}


/**
 * Every spoken text of one duration's timeline, by source id and by Italian
 * text — what the Studio needs to fill a language a saved session lacks.
 */
export function buildScriptIndex(timeline: PlainTimeline): ScriptIndex {
  const idx: ScriptIndex = { bySource: {}, byItText: {} }
  const put = (source: string, byLang: Partial<Record<VoiceLang, string>>) => {
    if (!Object.keys(byLang).length) return
    idx.bySource[source] = byLang
    if (byLang.it) idx.byItText[scriptKey(byLang.it)] = byLang
  }
  for (const v of timeline.versions) {
    for (const c of v.clips) if (c.tipo === 'voice' && c.tipoContenuto !== 'loop') put(`clip:${c.clipId}`, spoken(rowScript(c)))
  }
  for (const a of timeline.affirmations) {
    const byLang = spoken(affScript(a))
    put(`aff:${a.id}`, byLang)
    const frags = Object.fromEntries(VOICE_LANGS.map((l) => [l, fragmentsOf(byLang[l])])) as Record<VoiceLang, string[]>
    const n = Math.max(...VOICE_LANGS.map((l) => frags[l].length))
    if (n > 1) {
      for (let i = 0; i < n; i++) {
        const one: Partial<Record<VoiceLang, string>> = {}
        for (const l of VOICE_LANGS) if (frags[l][i]) one[l] = frags[l][i]
        put(`aff:${a.id}#${i}`, one)
      }
    }
  }
  return idx
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
  if (c.velocitaWpm !== undefined) return `velocità ${c.velocitaWpm} wpm → ×${speed.toFixed(2)} (base ${SPOKEN_WPM} wpm)`
  return `sussurrato senza velocita_wpm → ×${speed.toFixed(2)} (base sussurro ${WHISPER_WPM} wpm)`
}

/** Dec. 6 (developer's mapping): archetype+modalità → catalog voice.
    sussurrato prefers a Whisper voice of the same gender as the archetype.

    The same rule in every language, applied only AMONG THAT LANGUAGE'S voices:
    a Portuguese line gets the BRA voice of the archetype and gender the
    Italian line got the ITA one of. A language with no voice for the archetype
    falls back to its own default (`defaultPrimary(lang)`), which falls back to
    any voice of the language, and only then to the Italian default. */
export function resolvePlainVoice(archetipo: string | undefined, modalita: 'normale' | 'sussurrato' | undefined, lang: VoiceLang = 'it'): { voice: CatalogVoice; why: string } {
  const matched = matchVoiceFromText(archetipo, lang)
  const base = matched ?? defaultPrimary(lang)
  const baseWhy = matched ? `archetipo "${archetipo}"` : archetipo ? `archetipo "${archetipo}" senza voce ${lang === 'it' ? 'italiana' : 'portoghese'} → predefinita` : 'nessun archetipo → predefinita'
  if (modalita !== 'sussurrato') return { voice: base, why: baseWhy }
  if (base.archetype === 'whisper') return { voice: base, why: `${baseWhy} (già Whisper)` }
  const whispers = voicesByArchetype('whisper', lang)
  const sameGender = whispers.find((v) => v.gender === base.gender)
  const chosen = sameGender ?? whispers[0]
  if (!chosen) return { voice: base, why: `${baseWhy} · sussurrato ma nessuna voce Whisper in catalogo` }
  return { voice: chosen, why: `${baseWhy} + sussurrato → Whisper [${chosen.gender}]` }
}

interface Lane {
  key: string
  track: SeedTrack
  clipDbs: number[]
  /** crossfade_prec_s per clip (sample lanes) — applied as real overlaps. */
  xfades: number[]
}

/* ---------------------------------------------------------------- fades ---

   WHY THIS EXISTS: a fade-out used to have exactly two sources — the sheet's
   `fade_out_s`, and a `crossfade_prec_s` on the next clip IN THE SAME LANE.
   Put the six songs of a 24-minute protocol on six lanes (MUS-1…MUS-6, one
   clip each, which is how the POs write a protocol whose pieces have
   different levels) and NO clip has a predecessor in its own lane: not one of
   them fades out. The music stops dead six times, and the sheet looks right.

   A handover is a handover whichever lane the next piece lives on. So the
   rule is stated in TIME, per kind of bed, not per lane:

   · a clip another one takes over from fades out over the incoming
     crossfade — or over HANDOVER_S when the sheet asked for neither;
   · the LAST music of the session fades over CLOSE_S, because a session
     ending on a hard cut is the one thing every protocol agrees on.

   The sheet always wins when it says MORE. Nothing here shortens a fade an
   author wrote, and every inferred fade is announced in the notes so it can
   be written into the workbook and stop being inferred. */

/** A bed handing over to the next one, when nobody said how long. */
const HANDOVER_S = 3
/** The last music of a session, when the sheet leaves it at zero. */
const CLOSE_S = 8
/** No fade may eat more than this share of its own clip. */
const MAX_SHARE = 1 / 3

export interface FadeOutPlan {
  /** clipId → the fade-out it should have, only where it beats the sheet. */
  byClip: Map<string, number>
  /** What was inferred, for the notes. */
  reasons: { clipId: string; sec: number; why: 'handover' | 'closing' }[]
}

/**
 * The fade-out every sample clip should end on, across lanes.
 *
 * Pure, and asserted in tools/test-music-fade.ts.
 */
export function planSampleFadeOuts(clips: PlainClip[]): FadeOutPlan {
  const plan: FadeOutPlan = { byClip: new Map(), reasons: [] }
  const EPS = 0.5

  for (const tipo of ['music', 'soundscape'] as const) {
    const rows = clips
      .filter((c) => c.tipo === tipo && c.endS > c.startS)
      .sort((a, b) => a.startS - b.startS || String(a.clipId).localeCompare(String(b.clipId)))

    rows.forEach((c, i) => {
      const own = c.fadeOutS ?? 0
      const len = c.endS - c.startS
      /* The next bed of the same kind, wherever it plays. It takes over when
         it starts at or before this one ends — the Excel writes abutting
         times, and a crossfade makes the overlap real. */
      const next = rows.slice(i + 1).find((n) => n.startS <= c.endS + EPS)
      let want = 0
      let why: 'handover' | 'closing' = 'handover'
      if (next) {
        want = Math.max(next.crossfadePrecS ?? 0, HANDOVER_S)
      } else if (tipo === 'music') {
        want = CLOSE_S
        why = 'closing'
      }
      if (!want) return
      want = Math.min(want, +(len * MAX_SHARE).toFixed(3))
      if (want <= own + 0.001) return
      plan.byClip.set(String(c.clipId), want)
      plan.reasons.push({ clipId: String(c.clipId), sec: want, why })
    })
  }
  return plan
}

export function plainToStudioTracks(
  timeline: PlainTimeline,
  version: PlainVersion,
  opts: PlainSeedOptions = {},
): { tracks: SeedTrack[]; name: string; totalSec: number; phases: StudioPhase[]; notes: string[] } {
  const notes: string[] = []
  const totalSec = version.durationS
  const affById = new Map(timeline.affirmations.map((a) => [a.id, a]))
  const rnd = mulberry32(opts.seed ?? Math.floor(Math.random() * 0xffffffff))
  const pools = opts.pools
  /* one ledger for the whole protocol: no music file is drawn twice while its
     phase pool still has an unused one */
  const ledger = newDrawLedger()

  /* Every bed's fade-out, decided across lanes (see planSampleFadeOuts). */
  const fadeOuts = planSampleFadeOuts(version.clips)

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

  /* Per-traccia voice resolution memo + note (one line per traccia/modalità,
     for the language being seeded — the other language's choice rides on the
     clip in `voiceByLang` and is announced by the Studio when it is used). */
  const lang: VoiceLang = opts.lang ?? 'it'
  const voiceNoteEmitted = new Set<string>()
  const voicesFor = (c: PlainClip): Record<VoiceLang, CatalogVoice> => {
    const out = {} as Record<VoiceLang, CatalogVoice>
    for (const l of VOICE_LANGS) {
      const { voice, why } = resolvePlainVoice(c.archetipo, c.modalita, l)
      out[l] = voice
      const noteKey = `${c.traccia}|${c.archetipo ?? ''}|${c.modalita ?? ''}`
      if (l === lang && !voiceNoteEmitted.has(noteKey)) {
        voiceNoteEmitted.add(noteKey)
        notes.push(`Voce "${c.traccia}"${c.modalita === 'sussurrato' ? ' (sussurrato)' : ''} → ${voiceLabel(voice)}: ${why}.`)
      }
    }
    return out
  }
  const choice = (v: CatalogVoice): VoiceChoice => ({ voiceId: v.id, voiceArchetype: v.archetype, voiceGender: v.gender })
  /** The per-language half of a voice clip: which text and voice it speaks
      now, and every language's text and voice for when the session switches. */
  let missingText = 0
  const spokenAs = (byLang: Partial<Record<VoiceLang, string>>, vs: Record<VoiceLang, CatalogVoice>, sourceId: string) => {
    const text = byLang[lang]
    if (!text && Object.keys(byLang).length) missingText++
    return {
      text,
      textByLang: byLang,
      voiceByLang: Object.fromEntries(VOICE_LANGS.map((l) => [l, choice(vs[l])])) as Record<VoiceLang, VoiceChoice>,
      sourceId,
    }
  }
  const voiceParams = (vs: Record<VoiceLang, CatalogVoice>) => ({ ...choice(vs[lang]), voiceLang: lang })

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

  /* The `fx` column. Effects belong to the LANE in this engine, so a clip's
     rack is applied to whatever lane the clip lands on — including the split
     `· eco` and `· loop` companions, which is where a whispered loop wants its
     reverb. Written once per traccia is enough; if two clips of the same lane
     disagree, the last one read wins and the notes say so. */
  const fxOnLane = new Map<string, string>()
  const laneFor = (key: string, make: () => SeedTrack, c: PlainClip): Lane => {
    const l = lane(key, make)
    if (!c.fx?.length) return l
    const sig = fxKey(c.fx)
    const prev = fxOnLane.get(l.key)
    if (prev !== undefined && prev !== sig) {
      notes.push(`"${l.track.name}": ${c.clipId} chiede un rack fx diverso da quello già impostato sulla traccia — vince l'ultimo letto (${describeFx(c.fx)}).`)
    } else if (prev === undefined) {
      notes.push(`"${l.track.name}": fx dal foglio ("${c.fxRaw}") → ${describeFx(c.fx)}.`)
    }
    fxOnLane.set(l.key, sig)
    l.track.effects = applyFxSpecs(l.track.effects, c.fx)
    return l
  }

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
      const l = laneFor(c.traccia, () => ({
        type: 'sample',
        name: c.traccia,
        volume: 0.3,
        channel: 'C',
        duck: isHeartbeat || isBowl ? 'none' : c.tipo === 'music' ? 'music' : 'soundscape',
        clips: [],
      }), c)
      /* Random draw (Rules §7.1–7.2): tag pool for soundscape, GLOBAL phase
         pool for music. A soundscape is one looping texture, so one draw is
         right. MUSIC is not: a clip longer than a song used to loop that song,
         and the POs heard it start again mid-clip in phase 4. So a music clip
         draws a PLAYLIST long enough to cover its window, and the renderer
         crossfades the songs in sequence and cuts the last one at the end. */
      const clipDur = c.endS - c.startS
      let url = ''
      /* The label is what the operator reads on the clip, so it has to say
         WHICH of the two silences this is: the library was never loaded, or
         it was loaded and holds nothing for this tag. Both used to print
         "no pool available", which sent the POs looking for a missing library
         when the real answer was a missing file. */
      let label = c.tipo === 'soundscape'
        ? `tag "${c.ambiente ?? '?'}" — libreria audio non caricata`
        : `F${c.faseFrom ?? '?'} — libreria audio non caricata`
      let slots: SampleSlot[] | undefined
      if (pools) {
        if (c.tipo === 'soundscape') {
          const drawn = drawSoundscape(pools, c.ambiente ?? '', rnd, ledger)
          if (drawn) {
            url = drawn.asset.publicUrl
            label = `${drawn.asset.name} · tag "${c.ambiente}"`
            notes.push(`${c.clipId} (${c.traccia}): sorteggiato "${drawn.asset.name}": ${drawn.how}.`)
          } else {
            const pending = isHeartbeat ? ' (file del battito dei PO in attesa)' : isBowl ? ' (file della campana tibetana dei PO in attesa)' : ''
            label = `tag "${c.ambiente ?? '?'}" — nessun file nel pool`
            notes.push(`${c.clipId} (${c.traccia}): NESSUN file per il tag "${c.ambiente}": la clip resta muta${pending}.`)
          }
        } else {
          const drawn = drawMusicPlaylist(pools, c.faseFrom ?? 1, clipDur, MAX_SAMPLE_SLOTS, rnd, ledger)
          if (drawn && drawn.assets.length) {
            const picked: SampleSlot[] = drawn.assets.map((a) => ({ url: a.publicUrl, label: a.name }))
            slots = picked
            url = picked[0].url
            label = `${drawn.assets.map((a) => a.name).join(' → ')} · F${c.faseFrom} pool`
            notes.push(`${c.clipId} (${c.traccia}): ${drawn.assets.length === 1 ? 'sorteggiato' : 'playlist'} "${drawn.assets.map((a) => a.name).join('" → "')}": ${drawn.how}.`)
            if (drawn.short) {
              /* What actually happens depends on how many songs were drawn: a
                 playlist cycles, a single song does not (it would loop audibly).
                 The note used to promise a repeat in both cases, which is why a
                 24-minute window over one song read as "the fade-out is gone" —
                 the music ended, with its fade, long before the window did. */
              notes.push(drawn.assets.length === 1
                ? `${c.clipId} (${c.traccia}): ATTENZIONE — "${drawn.assets[0].name}" dura ~${Math.round(drawn.estimatedSec)}s ma la finestra è di ${Math.round(clipDur)}s: il brano finisce (con la sua dissolvenza) e il resto della finestra resta in silenzio. Aggiungi brani al pool F${c.faseFrom} — con due o più la sequenza si concatena — oppure accorcia la finestra.`
                : `${c.clipId} (${c.traccia}): ATTENZIONE — i brani disponibili coprono solo ~${Math.round(drawn.estimatedSec)}s dei ${Math.round(clipDur)}s della clip; la sequenza si ripeterà. Aggiungi brani al pool F${c.faseFrom} o accorcia la finestra.`)
            }
          } else {
            label = `F${c.faseFrom ?? '?'} — nessun brano nel pool`
            notes.push(`${c.clipId} (${c.traccia}): NESSUN file nel pool di fase F${c.faseFrom}: la clip resta muta.`)
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
        /* The sheet, or the handover this clip is part of — whichever is
           longer. A lane of its own is not a reason to stop dead. */
        fadeOutSec: Math.max(c.fadeOutS, fadeOuts.byClip.get(String(c.clipId)) ?? 0),
      }
      l.track.clips.push(clip)
      l.clipDbs.push(nominalDb)
      l.xfades.push(c.crossfadePrecS ?? 0)
      continue
    }

    if (c.tipo === 'binaural' || c.tipo === 'solfeggio') {
      const l = laneFor(c.traccia, () => ({ type: 'binaural', name: c.traccia, volume: 0.3, channel: 'C', clips: [] }), c)
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
      const l = laneFor(c.traccia, () => ({ type: 'bilateral', name: c.traccia, volume: 0.3, channel: 'C', clips: [] }), c)
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
    const vs = voicesFor(c)
    const channel = trackChannel(c.traccia)

    if (c.tipoContenuto === 'loop') {
      // dedicated lane: the loop has its own level and (optional) echo
      const key = `${c.traccia} · loop`
      const l = laneFor(key, () => ({
        type: 'voice',
        name: `${c.traccia} · loop (${c.setAffermazioni ?? c.sequenza ?? 'set'})`,
        volume: 0.3,
        channel,
        effects: c.eco ? echoFx(c.ecoRitardoS ?? 2, c.ecoVolumeDb ?? -8) : undefined,
        clips: [],
      }), c)
      if (c.riverberoPct !== undefined && c.riverberoPct > 0) l.track.effects = withReverb(l.track.effects, c.riverberoPct)
      const ids = c.setRange?.ids ?? []

      /* ---- sequenza (mini-spec §2): an explicit ID@offset list. It was read
         by the parser, announced in the notes as "expanded at seeding" — and
         then never expanded, so a loop row carrying ONLY a sequenza built a
         named voice lane with nothing on it. A track you can see and cannot
         hear. It is expanded here, and it replaces the uniform
         cadence for this row. ---- */
      if (c.sequenzaSteps?.length) {
        const seqSpeed = clipSpeed(c)
        let placedSeq = 0
        let skippedSeq = 0
        for (const st of c.sequenzaSteps) {
          const aff = affById.get(st.id)
          if (!aff) continue
          const start = c.startS + st.offsetS
          const room = c.endS - start
          if (room <= 0.5) { skippedSeq++; continue }
          const dur = Math.min(aff.durataS ?? 6, Math.max(1, room - 0.5))
          l.track.clips.push({
            startSec: start,
            durationSec: dur,
            params: { pan: channel === 'C' ? (c.pan ?? 0) / 100 : 0, pulseHz: 0.35, toneHz: 320, speed: seqSpeed, ...voiceParams(vs) } as VoiceParams,
            ...spokenAs(spoken(affScript(aff)), vs, `aff:${aff.id}`),
            fadeInSec: 1,
            fadeOutSec: 2,
          })
          l.clipDbs.push(nominalDb)
          placedSeq++
        }
        notes.push(`Sequenza ${c.clipId} ("${c.sequenza}"): ${placedSeq} affermazioni a tempi espliciti su "${l.track.name}"${seqSpeed !== undefined ? `, ${speedWhy(c, seqSpeed)}` : ''}${skippedSeq ? ` · ${skippedSeq} oltre la fine del clip (${secToMmss(c.endS)})` : ''}.`)
        /* The sequenza IS the loop for this row — the uniform cadence below
           would place the same affirmations a second time. */
        continue
      }

      /* ---- whisper-ostinato (mini-spec §B): loop + sussurrato + single
         REF-xx. The refrain's "..."-separated fragments loop in a slow
         expiratory cadence for the whole window, deliberately OFFSET from
         the main affirmation interval; the last ~90 s slows down and drops
         a further −2.5 dB so it dissolves into the phase fade. ---- */
      const isOstinato = c.modalita === 'sussurrato' && ids.length === 1 && c.setRange && c.setRange.from === c.setRange.to
      if (isOstinato) {
        const aff = affById.get(ids[0])
        /* Fragments are split PER LANGUAGE, and the Italian ones set the
           cadence: the layout (how many fragments, where they fall) is part of
           the shared configuration, so it cannot depend on which language the
           session happens to be seeded in. Fragment i of every language rides
           on clip i; a language with fewer fragments leaves the later clips
           without text in that language (shown as missing, never silently
           Italian), and one with more has its surplus joined onto the last. */
        const affText = spoken(affScript(aff))
        const fragsByLang = Object.fromEntries(VOICE_LANGS.map((l) => [l, fragmentsOf(affText[l])])) as Record<VoiceLang, string[]>
        const fragments = fragsByLang.it.length ? fragsByLang.it : fragsByLang['pt-BR']
        for (const l of VOICE_LANGS) {
          const f = fragsByLang[l]
          if (f.length > fragments.length && fragments.length) {
            fragsByLang[l] = [...f.slice(0, fragments.length - 1), f.slice(fragments.length - 1).join('... ')]
          }
          if (f.length && f.length !== fragments.length && aff) {
            notes.push(`Ostinato ${c.clipId} (${aff.id}): ${f.length} frammenti ${LANG_IN[l]} contro ${fragments.length} della cadenza — ${f.length > fragments.length ? 'gli ultimi sono uniti nell’ultimo frammento' : 'i frammenti mancanti restano senza testo'}.`)
          }
        }
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
                  ...voiceParams(vs),
                } as VoiceParams,
                ...spokenAs(
                  Object.fromEntries(VOICE_LANGS.filter((lg) => fragsByLang[lg][i]).map((lg) => [lg, fragsByLang[lg][i]])),
                  vs,
                  `aff:${aff.id}#${i}`,
                ),
                fadeInSec: 1,
                fadeOutSec: inTail ? 3 : 1.5, // the tail dissolves, no hard cut
              })
              l.clipDbs.push(nominalDb + (inTail ? -2.5 : 0))
              placedW++
            }
            if (done || c.startS + (cy + 1) * cycleLen >= c.endS) break
          }
          notes.push(`Ostinato sussurrato ${c.clipId} (${ids[0]}): ${placedW} clip di frammenti ("${fragments.join(' / ')}"): cadenza ${SPACING}s + respiro ${BREATH}s = ciclo di ${cycleLen}s, sfasato rispetto all’intervallo delle affermazioni; pronunciate a ×${baseSpeed.toFixed(2)} (${speedWhy(c, baseSpeed)}); gli ultimi ~90 s rallentano a ×${tailSpeed.toFixed(2)} e scendono di −2,5 dB nella dissolvenza di ${secToMmss(c.endS)}; ducking di −2,5 dB sotto la voce principale (non copre mai il riferimento a −16 LUFS).`)
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
            params: { pan: channel === 'C' ? (c.pan ?? 0) / 100 : 0, pulseHz: 0.35, toneHz: 320, speed: loopSpeed, ...voiceParams(vs) } as VoiceParams,
            ...spokenAs(spoken(affScript(aff)), vs, `aff:${aff.id}`),
            fadeInSec: 1, // Rules doc: per-affirmation envelope is an app default
            fadeOutSec: 2,
          })
          l.clipDbs.push(nominalDb + cy * att)
          placed++
        }
      }
      notes.push(`Loop ${c.clipId} (${c.setAffermazioni}): ${placed} clip di affermazioni su "${l.track.name}": ogni ${interval}s × ${cycles} ${cycles === 1 ? 'ciclo' : 'cicli'}${cycles > 1 ? ` (${att} dB per ciclo)` : ''}, inviluppo predefinito 1s/2s${loopSpeed !== undefined ? `, ${speedWhy(c, loopSpeed)}` : ''}${c.eco ? `, Emotional Echo +${c.ecoRitardoS ?? 2}s ${c.ecoVolumeDb ?? -8}dB` : ''}${skipped ? ` · ${skipped} saltate (la finestra finisce a ${secToMmss(c.endS)})` : ''}.`)
      continue
    }

    // linea — eco clips ride a companion lane so the echo FX stays honest
    const hasEco = !!c.eco
    const key = hasEco ? `${c.traccia} · eco` : c.traccia
    const l = laneFor(key, () => ({
      type: 'voice',
      name: hasEco ? `${c.traccia} · eco` : c.traccia,
      volume: 0.3,
      channel,
      effects: hasEco ? echoFx(c.ecoRitardoS ?? 2, c.ecoVolumeDb ?? -8) : undefined,
      clips: [],
    }), c)
    if (hasEco && l.track.clips.length === 0) {
      notes.push(`"${c.traccia}": le clip con eco=on vanno sulla traccia gemella "${l.track.name}" (Emotional Echo già attivo): l’eco è un effetto di traccia.`)
    }
    if (c.riverberoPct !== undefined && c.riverberoPct > 0) {
      l.track.effects = withReverb(l.track.effects, c.riverberoPct)
    }
    const speed = clipSpeed(c)
    if (speed !== undefined) notes.push(`${c.clipId}: ${speedWhy(c, speed)}.`)
    l.track.clips.push({
      startSec: c.startS,
      durationSec: c.endS - c.startS,
      params: { pan: channel === 'C' ? (c.pan ?? 0) / 100 : 0, pulseHz: 0.35, toneHz: 320, speed, ...voiceParams(vs) } as VoiceParams,
      ...spokenAs(spoken(rowScript(c)), vs, `clip:${c.clipId}`),
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
      notes.push(`"${l.track.name}": clip normalizzate in ingresso a ${hi === lo ? levelLabel(hi, 'lufs') : `${levelLabel(hi, 'lufs')}…${levelLabel(lo, 'lufs')}`} (dall’Excel); fader neutro.`)
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
      notes.push(`"${l.track.name}": fader a ${(ANCHOR_LUFS + base).toFixed(0)} LUFS (i ${base} dB dell’Excel rispetto alla voce); clip normalizzate in ingresso${lo < base ? `, le più basse fino a ${(lo - base).toFixed(0)} dB sotto il fader` : ''}.`)
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
    if (applied) notes.push(`"${l.track.name}": ${applied} crossfade (crossfade_prec_s) ${applied === 1 ? 'applicato' : 'applicati'} come vere sovrapposizioni a potenza costante.`)
  }

  /* Every fade this file decided rather than read. It is worth saying: the
     fix for an inferred fade is to write it in the sheet, and the operator
     cannot do that without being told it happened. */
  if (fadeOuts.reasons.length) {
    const handovers = fadeOuts.reasons.filter((r) => r.why === 'handover')
    const closings = fadeOuts.reasons.filter((r) => r.why === 'closing')
    if (handovers.length) {
      notes.push(`Dissolvenza in uscita aggiunta a ${handovers.length} clip che passano il testimone alla successiva (${handovers.map((r) => `${r.clipId} ${r.sec}s`).join(', ')}): il foglio non la indicava e senza di essa il letto sonoro si interrompe di colpo. Scrivila in fade_out_s per deciderla tu.`)
    }
    if (closings.length) {
      notes.push(`Dissolvenza finale aggiunta a ${closings.map((r) => `${r.clipId} (${r.sec}s)`).join(', ')}: è l'ultima musica della sessione e il foglio la lasciava a zero.`)
    }
  }

  /* A lane the Excel asked for and nothing landed on.
     This is what "the track is there and does nothing" looks like from the
     inside: a loop row whose affirmations could not be resolved builds its
     voice lane and then places zero clips, and the seed used to hand that
     silence over without a word. Now it is the first thing the notes say. */
  for (const l of lanes) {
    if (l.track.clips.length === 0) {
      notes.push(`⚠ "${l.track.name}": nessun clip — la traccia esiste ma non suona. Controlla set_affermazioni / sequenza di questa riga nel foglio Affermazioni.`)
    }
  }

  /* Reverb note (once per reverb'd lane). */
  for (const l of lanes) {
    const rv = l.track.effects?.find((e) => e.kind === 'reverb' && e.enabled)
    if (rv) notes.push(`"${l.track.name}": Reverb ${Math.round((rv.params.mix ?? 0) * 100)}% (riverbero_pct: effetto di traccia).`)
  }

  /* The language the session is seeded in, said out loud where it is thin:
     lines with no text in it stay silent (never quietly Italian), and a
     language the account has no voice for is spoken by the Italian default —
     both are things to fix in the Excel or in ElevenLabs, not to discover by
     listening. */
  if (missingText) {
    notes.unshift(`⚠ ${missingText} clip vocal${missingText === 1 ? 'e' : 'i'} senza testo ${LANG_IN[lang].replace(/^in /, '')}: ${missingText === 1 ? 'resta muta' : 'restano mute'} in questa lingua. Aggiungi la colonna ${lang === 'pt-BR' ? 'testo_pt' : 'testo'} nell’Excel e reimporta — il resto del lavoro non si perde.`)
  }
  if (lang !== 'it' && !hasVoicesFor(lang) && lanes.some((x) => x.track.type === 'voice')) {
    notes.unshift(`⚠ L’account ElevenLabs non ha voci ${lang === 'pt-BR' ? 'portoghesi (nome che inizia con "BRA")' : lang}: le righe ${LANG_IN[lang]} userebbero la voce italiana predefinita.`)
  }

  const code = timeline.code ?? 'PLAIN'
  return {
    tracks: lanes.map((l) => l.track),
    name: `${code} · ${version.sheet}`,
    totalSec,
    /* The phase map goes with the tracks: the Studio cannot tell a closing from
       the middle of a session without it, and one of its overlap rules applies
       only in the sixth. */
    phases: version.phases.map((p) => ({ fase: p.fase, startSec: p.startS, endSec: p.endS })),
    notes,
  }
}
