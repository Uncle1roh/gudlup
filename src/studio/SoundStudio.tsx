import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  MultitrackPlayer,
  renderClipBuffer,
  renderMixdownBuffer,
  sliceBuffer,
  concatBuffers,
  bakeVoiceBuffer,
  shapeClipBuffer,
  ANCHOR_LUFS,
  defaultClipEq,
  eqIsTransparent,
  eqMagnitudeDb,
  type ClipEq,
  type EqBand,
  computePeaks,
  peakBuckets,
  defaultParams,
  TRACK_META,
  type TrackType,
  type ClipParams,
  type SampleParams,
  type BinauralParams,
  type SoundscapeParams,
  type BreathParams,
  type VoiceParams,
  type Texture,
  type SchedTrack,
  type MixTrack,
  type MusicParams,
  type BilateralParams,
  type BilateralSoundId,
  BILATERAL_SOUNDS,
  BILATERAL_FAMILY_LABEL,
  DEFAULT_BILATERAL_SOUND,
  bilateralSoundUrl,
  resolveBilateralSound,
  sampleSlots,
  sampleLoops,
  sampleDurationSec,
  MAX_SAMPLE_SLOTS,
  type SampleSlot,
  type Chord,
} from './multitrack'
import { getTtsProvider, type TtsSpan } from '../tts'
import { VoiceEnginePanel } from '../tts/VoiceEnginePanel'
import { masterizeBuffer, SESSION_CEILING_DBTP, SESSION_TARGET_LUFS } from './mastering'
import { audioBufferToWav } from '../lib/wav'
import { ARCHETYPES, defaultPrimary, hasVoicesFor, resolveVoiceId, voiceById, voiceLangOf, voicesByArchetype, type CatalogVoice, type KnownVoice } from '../tts/voiceCatalog'
import { LANG_LABEL, LANG_SHORT, VOICE_LANGS, type VoiceLang } from '../tts/voiceLang'
import { canonicalVoiceClip, isTextMissing, switchClipLang } from './sessionLang'
import { defaultEffects, effectsKey, EFFECTS_META, harmonizeBuffer, type TrackEffect } from './effects'
import { libraryGroups, listAssets, assetPublicUrl, type AudioAsset } from '../admin/assets'
import { buildAssetPools, drawMusicPlaylist, drawSoundscape, loadAssetMeta, mulberry32, newDrawLedger, type AssetPools, type DrawLedger } from '../admin/assetPools'
import { hasSupabaseEnv } from '../auth/supabaseClient'
import { peekStudioSeed, releaseStudioSeed, setStudioProject, type StudioAttachTarget } from '../compose/handoff'
import { persistenceNote, saveProtocolVerified } from '../admin/publish'
import { getProtocol } from '../data/protocols'
import { entryForStudioSave } from '../admin/publishPlain'
import { setReturnToProtocol } from '../admin/workscreenReturn'
import { lookup as ttsLookup, store as ttsStore, ttsPath as ttsPathFor, type TtsKey } from '../tts/ttsStore'
import type { Duration } from '../types/domain'
import type { CatalogProtocol } from '../data/catalog'
import type { ScriptIndex, StudioProject, VoiceChoice } from '../compose/types'
import { useDataProvider } from '../data/provider'
import type { SeedTrack, StudioPhase } from '../compose/types'
import { planVoiceOverlaps, VOICE_GAP, type VoicePlan } from './voiceOverlap'
import { BrandLogo } from '../components/Brand'
import { useI18n } from '../i18n'
import { LanguagePicker } from '../components/LanguagePicker'
import './studio-lang.css'

/* ---- interface language ----
   The Studio's words go through t() (English source keys, translations in
   i18n/studio-editor.ts). The translator is named `lt` everywhere in this
   file because `t` is already the conventional name for a track. The data
   modules (multitrack.ts, voiceCatalog.ts) keep their Italian labels — other
   code stores them as track names — so the Studio carries the English source
   of each label here and translates that at render time. */
type Lt = (key: string, vars?: Record<string, string | number>) => string

const TRACK_TEXT: Record<TrackType, { label: string; blurb: string }> = {
  soundscape: { label: 'Soundscape', blurb: 'Ambient bed' },
  binaural: { label: 'Binaural', blurb: 'L/R carrier beat' },
  breath: { label: 'Breathing', blurb: 'Paced pulsing tone' },
  voice: { label: 'Voice', blurb: 'Guided affirmation (TTS or placeholder)' },
  music: { label: 'Music', blurb: 'Warm harmonic pad' },
  bilateral: { label: 'Bilateral', blurb: 'Alternating L/R pulses (PAT-05)' },
  sample: { label: 'Audio file', blurb: 'Real library assets — up to 5 tracks in sequence; soundscapes loop, music does not' },
}
function trackText(type: TrackType): { label: string; blurb: string } {
  return TRACK_TEXT[type] ?? { label: TRACK_META[type].label, blurb: TRACK_META[type].blurb }
}

const BILATERAL_FAMILY_TEXT: Record<string, string> = {
  tone: 'Zen tones',
  bell: 'Gongs and bells',
  whoosh: 'Air passes',
}
const BILATERAL_TEXT: Record<string, { label: string; blurb: string }> = {
  'zen-deep': { label: 'Deep zen tone', blurb: 'Pure, warm tone — the most discreet bilateral cue' },
  'zen-mid': { label: 'Mid zen tone', blurb: 'Central zen tone, a good balance of presence and softness' },
  'zen-high': { label: 'Mid-high zen tone', blurb: 'Brighter zen tone — stands out better over a dense bed' },
  gong: { label: 'Gong', blurb: 'Gong hit with a metallic tail — the POs’ original request' },
  'temple-bell': { label: 'Temple bell', blurb: 'Deep toll, sharp attack and long resonance' },
  bong: { label: 'Bong', blurb: 'Short pitched percussion — the driest of the group' },
  'bowl-gong': { label: 'Singing bowl', blurb: 'Struck singing bowl, crystalline timbre' },
  'bowl-low': { label: 'Deep singing bowl', blurb: 'Large, full bowl — very long tail, best with wide intervals' },
  'whoosh-1': { label: 'Whoosh 1', blurb: 'Rush of air — a pitchless cue that does not interfere with the binaural' },
  'whoosh-2': { label: 'Whoosh 2', blurb: 'Rush of air, slightly darker timbre' },
  swoosh: { label: 'Short swoosh', blurb: 'Short, quick breath — the most discreet of the air passes' },
  'deep-swoosh': { label: 'Deep swoosh', blurb: 'Low, wide breath, good for slow phases' },
}
function bilateralFamilyLabel(lt: Lt, fam: keyof typeof BILATERAL_FAMILY_LABEL): string {
  const en = BILATERAL_FAMILY_TEXT[fam]
  return en ? lt(en) : BILATERAL_FAMILY_LABEL[fam]
}
function bilateralText(lt: Lt, s: { id: string; label: string; blurb: string }): { label: string; blurb: string } {
  const en = BILATERAL_TEXT[s.id]
  return en ? { label: lt(en.label), blurb: lt(en.blurb) } : { label: s.label, blurb: s.blurb }
}

const ARCHETYPE_TEXT: Record<string, string> = {
  maternal: 'Maternal',
  paternal: 'Paternal',
  wise: 'Wise / Mentor',
  neutral: 'Neutral / Descriptive',
  warrior: 'Warrior',
  shadow: 'Shadow',
  ritual: 'Ritual / Ceremonial',
  child: 'Inner child',
  whisper: 'Intimate / Whispered',
}
function archetypeLabel(lt: Lt, a: { id: string; label: string }): string {
  const en = ARCHETYPE_TEXT[a.id]
  return en ? lt(en) : a.label
}

/** A translated sentence whose {placeholders} render in bold. */
function withBold(text: string, vars: Record<string, string | number>) {
  return text.split(/\{(\w+)\}/).map((part, i) => (i % 2 === 1 ? <b key={i}>{vars[part] ?? `{${part}}`}</b> : part))
}

/* ---- layout constants ---- */
const LANE_H = 104
const RULER_H = 30
const HEADER_W = 254
const MIN_CLIP = 1

/* ---- model ---- */
/** The per-clip level/tone shaping baked into a rendered buffer. */
type ClipShape = { eq?: ClipEq; calibrateDb?: number; gainDb?: number; fadeInSec?: number; fadeOutSec?: number }

interface Clip {
  id: string
  startSec: number
  durationSec: number
  params: ClipParams
  buffer: AudioBuffer | null
  peaks: Float32Array | null
  text?: string
  ttsSource?: AudioBuffer | null
  /** Storage path of the synthesized bytes, so the render survives a save. */
  ttsPath?: string
  /** The text `ttsSource` was actually spoken from. Editing `text` cannot clear
      ttsSource (a voice clip without it re-renders as the placeholder TONE), so
      staleness is tracked instead of destroyed: Preview auditions the existing
      audio only while this still matches, and the Inspector asks for a
      re-synthesis once it doesn't. */
  ttsText?: string
  /** A cut/glued piece: its audio is frozen — parameter edits don't
      re-render it (glue pieces back together to re-edit parameters). */
  frozen?: boolean
  /** Harmonized (Coral) version of `buffer` — played when present. */
  fxBuffer?: AudioBuffer | null
  /** Which harmonizer params produced fxBuffer (invalidation key). */
  fxKey?: string
  /** WHICH buffer fxBuffer was computed from. Without this, re-rendering a
      clip (any parameter change) left the harmonized copy in place and
      playback kept the old audio, since the params key had not changed. */
  fxSource?: AudioBuffer | null
  /** PLAIN import: per-clip dB offset vs the track base, baked into the
      rendered buffer (with the fades below) via applyClipShape. */
  gainDb?: number
  fadeInSec?: number
  fadeOutSec?: number
  /** PLAIN loudness ladder: calibrate the rendered buffer's gated RMS to
      exactly this many dB vs the guide-voice reference — the Excel's
      volume_db as a real, measured layer selector. */
  calibrateDb?: number
  /** Per-clip parametric EQ (Studio tool) — baked into the buffer before
      the loudness calibration, so EQ never moves the layer level. */
  eq?: ClipEq
  /* Voice clips, per language (see studio/sessionLang.ts): `text`, `ttsPath`
     / `ttsText` and `params.voiceId` above are the WORKING language's; these
     hold every language, and where the text came from in the workbook. */
  sourceId?: string
  textByLang?: Partial<Record<VoiceLang, string>>
  ttsByLang?: Partial<Record<VoiceLang, { path?: string; text?: string }>>
  voiceByLang?: Partial<Record<VoiceLang, VoiceChoice>>
}
type TrackChannel = 'L' | 'C' | 'R'
const CHANNEL_PAN: Record<TrackChannel, number> = { L: -1, C: 0, R: 1 }

/* Audio-taper fader: the slider runs in dB (−40 … +6), not linear gain —
   a centimeter of travel is the same audible step anywhere on the range.
   `track.volume` stays LINEAR (engine + seeds unchanged); only the slider
   position and the readout speak dB. */
const FADER_MIN_DB = -60
const FADER_MAX_DB = 12
function gainToFaderPos(gain: number): number {
  if (gain <= 0) return 0
  const db = 20 * Math.log10(gain)
  return Math.min(1, Math.max(0, (db - FADER_MIN_DB) / (FADER_MAX_DB - FADER_MIN_DB)))
}
function faderPosToGain(pos: number): number {
  if (pos <= 0) return 0
  const db = FADER_MIN_DB + pos * (FADER_MAX_DB - FADER_MIN_DB)
  return Math.pow(10, db / 20)
}
function gainToDbLabel(gain: number): string {
  if (gain <= 0) return '−∞ dB'
  const db = 20 * Math.log10(gain)
  return `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`
}

/* LUFS fader (PLAIN imports): the slider reads/edits the lane's RESULTING
   loudness target — authored baseLufs (README §6 map) plus the fader's gain.
   Voice at −16 LUFS shows "−16.0 LUFS"; pulling it to −22 attenuates 6 dB. */
const FADER_MIN_LUFS = -60
const FADER_MAX_LUFS = -6
function trackLufs(baseLufs: number, gain: number): number {
  return gain <= 0 ? -Infinity : baseLufs + 20 * Math.log10(gain)
}
function lufsToGain(baseLufs: number, lufs: number): number {
  return Math.pow(10, (Math.min(FADER_MAX_LUFS, lufs) - baseLufs) / 20)
}
function lufsToFaderPos(lufs: number): number {
  if (!Number.isFinite(lufs)) return 0
  return Math.min(1, Math.max(0, (lufs - FADER_MIN_LUFS) / (FADER_MAX_LUFS - FADER_MIN_LUFS)))
}
function faderPosToLufs(pos: number): number {
  return FADER_MIN_LUFS + pos * (FADER_MAX_LUFS - FADER_MIN_LUFS)
}

interface Track {
  id: string
  type: TrackType
  name: string
  volume: number
  muted: boolean
  soloed: boolean
  /** Whole-track stereo position (applies live and in the mixdown). */
  channel?: TrackChannel
  /** Per-track effect chain (harmonizer · echo · reverb · saturation · filter). */
  effects?: TrackEffect[]
  /** Authored loudness target (absolute LUFS at fader gain 1) — PLAIN
      imports set it; when present the fader reads/edits in LUFS. */
  baseLufs?: number
  clips: Clip[]
}

/* ---- helpers ---- */
const CATALOG_DURATIONS: Duration[] = [6, 12, 24]
/** Catalog versions are 6/12/24 min — map a timeline length onto the closest. */
function nearestDuration(lengthSec: number): Duration {
  const mins = lengthSec / 60
  return CATALOG_DURATIONS.reduce((best, d) => (Math.abs(d - mins) < Math.abs(best - mins) ? d : best), CATALOG_DURATIONS[0])
}
const uid = () => Math.random().toString(36).slice(2, 9)
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const snap = (v: number) => Math.round(v * 4) / 4
function fmtTime(sec: number): string {
  const s = Math.max(0, sec)
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
}
function niceInterval(pxPerSec: number): number {
  const raw = 84 / pxPerSec
  return [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300].find((s) => s >= raw) ?? 300
}

/** Fold a plan onto the tracks. Separate from the planning so the rule can be
    read, argued about and tested without a Clip in sight (voiceOverlap.ts). */
function applyVoicePlan(tracks: Track[], plan: VoicePlan): Track[] {
  if (!plan.panned && !plan.moved && !plan.longer) return tracks
  return tracks.map((t) => ({
    ...t,
    clips: t.clips.map((c) => {
      const start = plan.starts[c.id]
      const pan = plan.pans[c.id]
      const dur = plan.stretched[c.id]
      if (start !== undefined) return { ...c, startSec: start }
      if (pan !== undefined) return { ...c, params: { ...(c.params as VoiceParams), pan } as ClipParams }
      if (dur !== undefined) return { ...c, durationSec: dur }
      return c
    }),
  }))
}

function makeClip(type: TrackType, startSec: number, durationSec: number): Clip {
  return { id: uid(), startSec, durationSec, params: defaultParams(type), buffer: null, peaks: null }
}

/** Convert a composed seed (from the Session Composer) into editable studio tracks. */
function seedTrackToTrack(t: SeedTrack): Track {
  return {
    id: uid(), type: t.type, name: t.name, volume: t.volume, muted: false, soloed: false,
    channel: t.channel,
    effects: t.effects,
    baseLufs: t.baseLufs,
    /* `eq`, `ttsPath` and `ttsText` were written by the save and dropped here,
       so a reopened project came back without its per-clip EQ and with every
       voice line unrendered. Whatever `toStudioProject` writes, this reads. */
    clips: t.clips.map((c) => ({
      id: uid(), startSec: c.startSec, durationSec: c.durationSec, params: c.params,
      buffer: null, peaks: null, text: c.text,
      gainDb: c.gainDb, fadeInSec: c.fadeInSec, fadeOutSec: c.fadeOutSec,
      calibrateDb: c.calibrateDb, eq: c.eq,
      ttsPath: c.ttsPath, ttsText: c.ttsText,
      sourceId: c.sourceId, textByLang: c.textByLang, ttsByLang: c.ttsByLang, voiceByLang: c.voiceByLang,
    })),
  }
}

/**
 * Every voice clip of a session switched from one language to another. The
 * counts are for the message the switch leaves: how many lines found their
 * text in the stored timeline, how many have none, and how many cut pieces
 * keep audio in the language they were cut in (their audio is frozen).
 */
function switchTracksLang(tracks: Track[], from: VoiceLang, to: VoiceLang, scripts?: ScriptIndex): { tracks: Track[]; missing: number; filled: number; frozen: number } {
  let missing = 0
  let filled = 0
  let frozen = 0
  const next = tracks.map((t) => (t.type !== 'voice' ? t : {
    ...t,
    clips: t.clips.map((c) => {
      const r = switchClipLang(c, from, to, scripts)
      if (r.missing) missing++
      if (r.filled) filled++
      if (c.frozen) { frozen++; return r.clip }
      // the audio in the clip is the OTHER language's: it re-renders on demand
      return { ...r.clip, ttsSource: null }
    }),
  }))
  return { tracks: next, missing, filled, frozen }
}

/* seed = the GL-ANX 1.1 bed, so the studio opens with something to hear + edit */
function makeSeed(): Track[] {
  const sc = { id: uid(), type: 'soundscape' as const, name: 'Soundscape', volume: 0.82, muted: false, soloed: false, clips: [makeClip('soundscape', 0, 120)] }
  ;(sc.clips[0].params as SoundscapeParams).warmth = 640
  const bi = { id: uid(), type: 'binaural' as const, name: 'Binaural', volume: 0.8, muted: false, soloed: false, clips: [makeClip('binaural', 0, 120)] }
  Object.assign(bi.clips[0].params, { carrierHz: 180, beatHz: 6 })
  const br = { id: uid(), type: 'breath' as const, name: 'Breathing', volume: 0.85, muted: false, soloed: false, clips: [makeClip('breath', 8, 104)] }
  Object.assign(br.clips[0].params, { breathsPerMin: 5.5, toneHz: 300 })
  const vo = { id: uid(), type: 'voice' as const, name: 'Voice', volume: 0.7, muted: false, soloed: false, clips: [makeClip('voice', 30, 60)] }
  Object.assign(vo.clips[0].params, { pan: -0.5, pulseHz: 0.2, toneHz: 420 })
  return [sc, bi, br, vo]
}

/* ============================ desktop gate ============================ */
export function SoundStudio({ languagePicker = false }: { languagePicker?: boolean } = {}) {
  const [wide, setWide] = useState(() => window.innerWidth >= 1024)
  useEffect(() => {
    const f = () => setWide(window.innerWidth >= 1024)
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])
  if (!wide) return <StudioTooSmall languagePicker={languagePicker} />
  return <StudioDesktop languagePicker={languagePicker} />
}

function StudioTooSmall({ languagePicker }: { languagePicker: boolean }) {
  const { t: lt } = useI18n()
  return (
    <div className="mt-gate">
      <div className="mt-gate__card">
        <div className="mt-gate__icon">🎛️</div>
        <h1>{lt('The Sound Studio is desktop only')}</h1>
        <p>{lt('The multitrack editor needs a wider screen. Open Good Loop on a laptop or desktop to compose and render sessions.')}</p>
        {languagePicker && (
          <div className="mt-gate__lang"><LanguagePicker label={false} className="mt-lang mt-lang--gate" /></div>
        )}
        <a className="mt-gate__back" href="#">{lt('← Back to the app')}</a>
      </div>
    </div>
  )
}

/* ============================ main editor ============================ */
function StudioDesktop({ languagePicker }: { languagePicker: boolean }) {
  /* Stable across renders so the memoized callbacks below always speak the
     CURRENT language, not the one they were created in. */
  const { t: ltNow } = useI18n()
  const ltRef = useRef<Lt>(ltNow)
  ltRef.current = ltNow
  const lt = useCallback<Lt>((key, vars) => ltRef.current(key, vars), [])
  const handoff = useMemo(() => {
    const h = peekStudioSeed()
    if (!h) return null
    const end = Math.max(120, ...h.tracks.flatMap((t) => t.clips.map((c) => c.startSec + c.durationSec)))
    return {
      tracks: h.tracks.map(seedTrackToTrack),
      name: h.name,
      attach: h.attach ?? null,
      phases: h.phases ?? [],
      lengthSec: h.lengthSec ?? Math.ceil(end),
      masterGain: h.masterGain,
      fadeInSec: h.fadeInSec ?? 0,
      fadeOutSec: h.fadeOutSec ?? 0,
      returnTo: h.returnTo ?? null,
      workingLang: h.workingLang,
      scripts: h.scripts,
    }
  }, [])
  /* ---- the WORKING language ----
     The hand-off holds the session in its canonical form (Italian in the live
     fields). A remount that already had a language chosen comes back in it
     without asking; a protocol opened fresh asks (`langAsk`). */
  const scripts = handoff?.scripts
  const [workingLang, setWorkingLang] = useState<VoiceLang>(handoff?.workingLang ?? 'it')
  const [langAsk, setLangAsk] = useState<boolean>(() => !!handoff?.attach && !handoff.workingLang)
  const workingLangRef = useRef(workingLang); workingLangRef.current = workingLang
  const [tracks, setTracks] = useState<Track[]>(() => {
    const base = handoff?.tracks ?? makeSeed()
    const lang = handoff?.workingLang
    return lang && lang !== 'it' ? switchTracksLang(base, 'it', lang, handoff?.scripts).tracks : base
  })
  const [projectName, setProjectName] = useState(handoff?.name ?? 'GL-ANX 1.1 — Calm and Inner Safety')
  const [masterGain, setMasterGain] = useState(handoff?.masterGain ?? 0.82)
  const [lengthSec, setLengthSec] = useState(handoff?.lengthSec ?? 120)
  const [pxPerSec, setPxPerSec] = useState(() => (handoff ? Math.max(0.6, Math.min(7, 1100 / (handoff.lengthSec || 120))) : 7))
  /* The six phase windows, when this session came from a PLAIN import. The
     Studio uses them for one thing only: telling the closing apart from the
     middle of a session when two voices overlap. */
  const [phases] = useState<StudioPhase[]>(() => handoff?.phases ?? [])
  const attachTarget: StudioAttachTarget | null = handoff?.attach ?? null
  const returnTo: string | null = handoff?.returnTo ?? null
  const sessionFades = { inSec: handoff?.fadeInSec ?? 0, outSec: handoff?.fadeOutSec ?? 0 }
  const dp = useDataProvider()
  const [attachMsg, setAttachMsg] = useState<string | null>(null)
  const [targetOverride, setTargetOverride] = useState<StudioAttachTarget | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  /** The whole session, serialized — everything except the audio buffers,
      which re-render from these parameters when the project is reopened. */
  function toStudioProject(): StudioProject {
    return {
      name: projectName,
      lengthSec,
      masterGain,
      fadeInSec: sessionFades.inSec,
      fadeOutSec: sessionFades.outSec,
      phases: phases.length ? phases : undefined,
      savedAt: Date.now(),
      tracks: tracks.map((t) => ({
        type: t.type,
        name: t.name,
        volume: t.volume,
        channel: t.channel,
        effects: t.effects,
        baseLufs: t.baseLufs,
        clips: t.clips.map((live) => {
          /* Every language together, in the canonical form: the live fields
             are the ITALIAN ones whatever language is being worked in, and
             the maps carry all of them (studio/sessionLang.ts). */
          const c = t.type === 'voice' ? canonicalVoiceClip(live, workingLang) : live
          return {
            startSec: c.startSec,
            durationSec: c.durationSec,
            params: c.params,
            text: c.text,
            gainDb: c.gainDb,
            fadeInSec: c.fadeInSec,
            fadeOutSec: c.fadeOutSec,
            calibrateDb: c.calibrateDb,
            eq: c.eq,
            /* What makes a synthesized voice survive the save. Only written when
               the render matches the text currently on the clip — an edited line
               must come back unrendered, not silently spoken as the old one. */
            ttsPath: c.ttsText && c.ttsText === (c.text ?? '').trim() ? c.ttsPath : undefined,
            ttsText: c.ttsPath ? c.ttsText : undefined,
            sourceId: c.sourceId,
            textByLang: c.textByLang,
            ttsByLang: c.ttsByLang,
            voiceByLang: c.voiceByLang,
          }
        }),
      })),
    }
  }

  /** Which protocol this session writes to. Explicit hand-off target first;
      otherwise read the code out of the project name (the seed and every
      import name it, e.g. "GL-ANX 1.1 — Calm and Inner Safety"); otherwise ask
      once. Saving must not depend on having come through the importer. */
  function deriveTarget(): StudioAttachTarget | null {
    if (attachTarget) return attachTarget
    if (targetOverride) return targetOverride
    const m = /(GL-[A-Z]+)\s*(\d+\.\d+)/i.exec(projectName)
    return m ? { code: `${m[1].toUpperCase()} ${m[2]}`, duration: nearestDuration(lengthSec) } : null
  }

  function askTarget(): StudioAttachTarget | null {
    const found = deriveTarget()
    if (found) return found
    const code = window.prompt(lt('Code of the protocol to create or update (e.g. GL-ANX 1.1)'))?.trim()
    if (!code) return null
    const t: StudioAttachTarget = { code: code.toUpperCase(), duration: nearestDuration(lengthSec) }
    setTargetOverride(t)
    return t
  }

  /** The catalog entry for `target`, CREATING it when the protocol has never
      been published. The rule lives in `publishPlain.ts` so it can be asserted
      — in particular that a protocol born from a Studio save is a draft. */
  async function ensureCatalogProtocol(target: StudioAttachTarget): Promise<CatalogProtocol> {
    const existing = (await dp.listProtocols()).find((p) => p.code === target.code)
    return entryForStudioSave({
      code: target.code,
      duration: target.duration,
      existing,
      base: getProtocol(target.code),
      projectName,
    })
  }

  /** Persist every Studio edit onto the protocol, creating it if needed.
      The session is stored against the TIME SIGNATURE being edited, so working
      on the 24-minute mix leaves the 6- and 12-minute sessions untouched. */
  async function saveToProtocol(target: StudioAttachTarget): Promise<CatalogProtocol> {
    const entry = await ensureCatalogProtocol(target)
    const project = toStudioProject()
    const stored = await saveProtocolVerified(dp, {
      ...entry,
      studioByDuration: { ...(entry.studioByDuration ?? {}), [target.duration]: project },
      // legacy mirror: the session saved last, for readers written before the
      // per-duration split
      studio: project,
    })
    setDirty(false)
    return stored
  }

  async function onSave() {
    const target = askTarget()
    if (!target) return
    setSaving(true)
    setAttachMsg(null)
    try {
      const stored = await saveToProtocol(target)
      const draft = !stored.enabled
      setAttachMsg(
        lt('Saved to {code} · {min} min — reopen it to find exactly this session.', { code: target.code, min: target.duration }) +
        (draft
          ? ' ' + lt('It is in the catalogue as a DRAFT: it is not live until you publish the duration from the protocol screen.')
          : '') +
        (persistenceNote() ?? ''),
      )
    } catch (e) {
      setAttachMsg(lt('Save failed: {error}', { error: (e as Error).message }))
    } finally {
      setSaving(false)
    }
  }

  function goBack() {
    if (dirty && attachTarget && !window.confirm(lt('There are unsaved changes to the protocol. Leave anyway?'))) return
    /* The hand-off is released HERE and nowhere else. Reading it no longer
       consumes it, so the session survives a resize, a re-render or a reload;
       leaving the Studio on purpose is the one thing that ends it. */
    releaseStudioSeed()
    /* Back to the PROTOCOL, not to the catalog list. The admin app routes with
       local state, so '#admin' alone would drop the person two steps from
       where they were working and make them find the protocol again. */
    if (attachTarget) setReturnToProtocol({ code: attachTarget.code, duration: attachTarget.duration })
    window.location.hash = returnTo ?? '#'
  }

  const [playing, setPlaying] = useState(false)
  const [playhead, setPlayhead] = useState(0)
  const [selected, setSelected] = useState<{ trackId: string; clipId: string } | null>(null)
  const [exporting, setExporting] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [ttsBusy, setTtsBusy] = useState<string | null>(null)
  const [previewBusy, setPreviewBusy] = useState<string | null>(null)
  const [ttsError, setTtsError] = useState<string | null>(null)
  const [ttsTick, setTtsTick] = useState(0)
  const [voiceSetupOpen, setVoiceSetupOpen] = useState(false)
  const ttsInfo = useMemo(() => { const p = getTtsProvider(); return { label: p.label, canRender: p.canRender } }, [ttsTick])

  const playerRef = useRef<MultitrackPlayer | null>(null)
  const rafRef = useRef<number | null>(null)
  const renderTokens = useRef<Map<string, number>>(new Map())
  const renderTimers = useRef<Map<string, number>>(new Map())
  /* Clips with a TTS request in flight. A voice clip has no ttsSource until
     the request lands, so ANY re-render triggered meanwhile (a drag, a pan
     tweak, a track-wide parameter change) would synthesize the placeholder
     pulsed tone and — finishing after the voice arrived — overwrite it. That
     is the "one clip suddenly sounds like anything but the plan" bug. */
  const ttsInFlight = useRef<Set<string>>(new Set())
  /* How many times each clip has been RE-synthesized, so "↻ Re-synthesize" can
     ask ElevenLabs for a genuinely different take instead of resampling the
     same deterministic seed. */
  const rerollRef = useRef<Map<string, number>>(new Map())
  const dragRef = useRef<{ mode: 'move' | 'trim-l' | 'trim-r'; trackId: string; trackType: TrackType; clipId: string; startClientX: number; origStart: number; origDur: number } | null>(null)
  const lanesRef = useRef<HTMLDivElement | null>(null)

  const tracksRef = useRef(tracks); tracksRef.current = tracks
  const pxPerSecRef = useRef(pxPerSec); pxPerSecRef.current = pxPerSec
  const lengthSecRef = useRef(lengthSec); lengthSecRef.current = lengthSec

  /* ---- clip rendering ---- */
  const setClipBuffer = useCallback((trackId: string, clipId: string, buf: AudioBuffer, extra?: Partial<Clip>) => {
    const peaks = computePeaks(buf, peakBuckets(buf.duration))
    setTracks((prev) => prev.map((t) => (t.id !== trackId ? t : {
      ...t,
      // Drop any harmonized copy: it was computed from the PREVIOUS audio, and
      // playback/mixdown read `fxBuffer ?? buffer`. Leaving it would keep the
      // old sound playing after a parameter change — the harmonizer effect
      // then recomputes it from the new buffer.
      clips: t.clips.map((c) => (c.id !== clipId ? c : { ...c, buffer: buf, peaks, fxBuffer: null, fxKey: undefined, fxSource: null, ...extra })),
    })))
  }, [])


  const doRender = useCallback(async (trackId: string, clipId: string, type: TrackType, params: ClipParams, dur: number, shape?: ClipShape) => {
    const token = (renderTokens.current.get(clipId) ?? 0) + 1
    renderTokens.current.set(clipId, token)
    let buf: AudioBuffer
    try {
      buf = await renderClipBuffer(type, params, dur)
    } catch (e) {
      // e.g. a sample clip whose file fetch failed — keep the clip, silent,
      // instead of crashing the render loop
      console.warn('render della clip non riuscito', type, (e as Error).message)
      buf = await renderClipBuffer(type === 'sample' ? 'sample' : type, type === 'sample' ? { url: '', label: `load failed: ${(e as Error).message}` } : params, dur)
    }
    if (shape) buf = shapeClipBuffer(buf, shape)
    if (renderTokens.current.get(clipId) !== token) return
    setClipBuffer(trackId, clipId, buf)
  }, [setClipBuffer])

  const rebakeVoice = useCallback(async (trackId: string, clipId: string, source: AudioBuffer, pan: number, startSec: number, speed = 1, shape?: ClipShape) => {
    const token = (renderTokens.current.get(clipId) ?? 0) + 1
    renderTokens.current.set(clipId, token)
    // bake to the full available window: a slower speed lengthens the spoken
    // line, and the clip follows the voice rather than truncating it
    const maxDur = Math.max(MIN_CLIP, lengthSecRef.current - startSec)
    let buf = await bakeVoiceBuffer(source, pan, maxDur, speed)
    if (shape) buf = shapeClipBuffer(buf, shape)
    if (renderTokens.current.get(clipId) !== token) return
    setClipBuffer(trackId, clipId, buf, { durationSec: buf.duration })
  }, [setClipBuffer])

  const renderClip = useCallback((trackId: string, clipId: string) => {
    const tr = tracksRef.current.find((t) => t.id === trackId)
    const cl = tr?.clips.find((c) => c.id === clipId)
    if (!tr || !cl) return
    if (cl.frozen) return // cut/glued audio is authoritative — never re-render over it
    // a voice render is on its way: don't lay the placeholder tone over it
    if (ttsInFlight.current.has(clipId)) return
    const hasEq = cl.eq && !eqIsTransparent(cl.eq)
    const shape: ClipShape | undefined = hasEq || cl.calibrateDb !== undefined || cl.gainDb !== undefined || cl.fadeInSec !== undefined || cl.fadeOutSec !== undefined
      ? { eq: cl.eq, calibrateDb: cl.calibrateDb, gainDb: cl.gainDb, fadeInSec: cl.fadeInSec, fadeOutSec: cl.fadeOutSec }
      : undefined
    if (tr.type === 'voice' && cl.ttsSource) {
      const vp = cl.params as VoiceParams
      void rebakeVoice(trackId, clipId, cl.ttsSource, vp.pan, cl.startSec, vp.speed ?? 1, shape)
      return
    }
    void doRender(trackId, clipId, tr.type, cl.params, cl.durationSec, shape)
  }, [doRender, rebakeVoice])

  /**
   * Keep the hand-off in step with what is on screen.
   *
   * Restoring only the seed would bring back the project as it was OPENED —
   * every edit since would still vanish on a resize past the desktop gate, a
   * re-render or a reload. This writes the working state back after each
   * change, so what comes back is what was there a moment ago.
   *
   * It is NOT a save. `dirty` stays set and the protocol is untouched until
   * 💾 Salva is pressed; this is only what makes the editor survive being
   * remounted. Debounced, because a drag fires it continuously.
   */
  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        /* The working language rides along only once it has been chosen: a
           remount before the question is answered must ask it again. */
        setStudioProject(toStudioProject(), attachTarget ?? undefined, returnTo ?? undefined, { workingLang: langAsk ? undefined : workingLang, scripts })
      } catch {
        /* a project too large for sessionStorage keeps working in memory */
      }
    }, 800)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, projectName, lengthSec, masterGain, sessionFades.inSec, sessionFades.outSec, workingLang, langAsk])

  /* No voice is loaded when a project opens. Every voice line starts
     unrendered and is voiced only on request — "Tutte le voci" or the clip's
     own ♪. Bringing stored renders back automatically on open was reverted:
     it did not work reliably for the POs. */

  const scheduleRender = useCallback((trackId: string, clipId: string) => {
    const m = renderTimers.current
    const prev = m.get(clipId); if (prev) window.clearTimeout(prev)
    const id = window.setTimeout(() => { m.delete(clipId); renderClip(trackId, clipId) }, 170)
    m.set(clipId, id)
  }, [renderClip])

  /* ---- clip EQ ---- */
  const setClipEq = useCallback((trackId: string, clipId: string, eq: ClipEq) => {
    setTracks((prev) => prev.map((t) => (t.id !== trackId ? t : { ...t, clips: t.clips.map((c) => (c.id !== clipId ? c : { ...c, eq })) })))
    scheduleRender(trackId, clipId)
  }, [scheduleRender])

  /* ---- late pool draws (sample clips seeded without a reachable library,
     or a deliberate re-roll) ---- */
  const [drawBusy, setDrawBusy] = useState(false)
  const [drawMsg, setDrawMsg] = useState<string | null>(null)

  const drawForClip = useCallback(async (trackId: string, clipId: string) => {
    const tr = tracksRef.current.find((t) => t.id === trackId)
    const cl = tr?.clips.find((c) => c.id === clipId)
    if (!tr || !cl || tr.type !== 'sample') return
    const p = cl.params as SampleParams
    if (p.drawTag === undefined && p.drawPhase === undefined) return
    setDrawBusy(true)
    setDrawMsg(null)
    try {
      const pools = await getStudioPools()
      const rnd = mulberry32(Math.floor(Math.random() * 0xffffffff))
      // a re-roll must not hand back a file another clip of this protocol is
      // already playing (this clip itself doesn't count — it is being replaced)
      const ledger = projectLedger(pools, tracksRef.current, clipId)
      if (p.drawTag !== undefined) {
        const drawn = drawSoundscape(pools, p.drawTag, rnd, ledger)
        if (!drawn) {
          setDrawMsg(lt('No library file matches the tag "{tag}" — upload one in the Asset Library (or add the tag to an existing file there).', { tag: p.drawTag }))
          return
        }
        patchClipParams(trackId, clipId, { url: drawn.asset.publicUrl, label: `${drawn.asset.name} · tag "${p.drawTag}"`, slots: undefined })
        setDrawMsg(drawn.asset.publicUrl === p.url
          ? lt('"{name}" is the ONLY file in the pool for the tag "{tag}" — nothing else to draw. Upload another, or tag one in the Asset Library.', { name: drawn.asset.name, tag: p.drawTag })
          : lt('Drew "{name}" — {how}.', { name: drawn.asset.name, how: drawn.how }))
        return
      }
      // music: draw a PLAYLIST long enough for the window, not one song to loop
      const drawn = drawMusicPlaylist(pools, p.drawPhase ?? 1, cl.durationSec, MAX_SAMPLE_SLOTS, rnd, ledger)
      if (!drawn || !drawn.assets.length) {
        setDrawMsg(lt('The F{phase} music pool is empty — upload files to assets/music/f{phase} in the Asset Library.', { phase: p.drawPhase ?? 1 }))
        return
      }
      const picked: SampleSlot[] = drawn.assets.map((a) => ({ url: a.publicUrl, label: a.name }))
      const before = sampleSlots(p).map((s) => s.url).join('|')
      patchClipParams(trackId, clipId, {
        url: picked[0].url,
        label: picked.length > 1 ? picked.map((s) => s.label).join(' → ') : `${picked[0].label} · F${p.drawPhase} pool`,
        slots: picked,
      })
      setDrawMsg(picked.map((s) => s.url).join('|') === before
        ? lt('The F{phase} pool has nothing this clip is not already playing — add files to assets/music/f{phase} to get a different draw.', { phase: p.drawPhase ?? 1 })
        : (picked.length === 1
          ? lt('Drew "{name}" — {how}.', { name: drawn.assets.map((a) => a.name).join('" → "'), how: drawn.how })
          : lt('Drew {n} tracks "{names}" — {how}.', { n: picked.length, names: drawn.assets.map((a) => a.name).join('" → "'), how: drawn.how }))
          + (drawn.short ? ' ' + lt('The sequence is shorter than the clip: add a track.') : ''))
    } catch (e) {
      setDrawMsg(lt('Library unreachable: {error}', { error: (e as Error).message }))
    } finally {
      setDrawBusy(false)
    }
  }, [patchClipParams])

  const drawAllMissing = useCallback(async () => {
    setDrawBusy(true)
    setDrawMsg(null)
    try {
      const pools = await getStudioPools()
      const rnd = mulberry32(Math.floor(Math.random() * 0xffffffff))
      // ONE ledger for the whole sweep: the files already in the project count,
      // and each draw excludes the ones this sweep has just made
      const ledger = projectLedger(pools, tracksRef.current)
      let filled = 0
      let empty = 0
      for (const t of tracksRef.current) {
        if (t.type !== 'sample') continue
        for (const c of t.clips) {
          const p = c.params as SampleParams
          if (p.url || (p.drawTag === undefined && p.drawPhase === undefined)) continue
          if (p.drawTag !== undefined) {
            const drawn = drawSoundscape(pools, p.drawTag, rnd, ledger)
            if (!drawn) { empty++; continue }
            patchClipParams(t.id, c.id, { url: drawn.asset.publicUrl, label: `${drawn.asset.name} · tag "${p.drawTag}"`, slots: undefined })
            filled++
            continue
          }
          const drawn = drawMusicPlaylist(pools, p.drawPhase ?? 1, c.durationSec, MAX_SAMPLE_SLOTS, rnd, ledger)
          if (!drawn || !drawn.assets.length) { empty++; continue }
          const picked: SampleSlot[] = drawn.assets.map((a) => ({ url: a.publicUrl, label: a.name }))
          patchClipParams(t.id, c.id, {
            url: picked[0].url,
            label: picked.length > 1 ? picked.map((s) => s.label).join(' → ') : `${picked[0].label} · F${p.drawPhase} pool`,
            slots: picked,
          })
          filled++
        }
      }
      setDrawMsg(
        (filled === 1 ? lt('Drew files for 1 clip') : lt('Drew files for {n} clips', { n: filled }))
        + (empty ? ' · ' + lt('{n} still empty (their pools have no files — check the Asset Library folders/tags)', { n: empty }) : '')
        + '.',
      )
    } catch (e) {
      setDrawMsg(lt('Library unreachable: {error}', { error: (e as Error).message }))
    } finally {
      setDrawBusy(false)
    }
  }, [patchClipParams])

  /* ---- voice (TTS) ---- */
  const setVoiceText = useCallback((trackId: string, clipId: string, text: string) => {
    setTracks((prev) => prev.map((t) => (t.id !== trackId ? t : { ...t, clips: t.clips.map((c) => (c.id !== clipId ? c : { ...c, text })) })))
  }, [])

  const setClipVoice = useCallback((trackId: string, clipId: string, voiceId: string) => {
    // invalidate anything in flight for this clip: its audio is the OLD voice
    renderTokens.current.set(clipId, (renderTokens.current.get(clipId) ?? 0) + 1)
    setTracks((prev) => prev.map((t) => (t.id !== trackId ? t : {
      ...t,
      clips: t.clips.map((c) => (c.id !== clipId ? c : {
        ...c,
        params: {
          ...(c.params as VoiceParams),
          voiceId: voiceId || undefined,
          /* …and what that voice IS, so the choice survives a key change on a
             machine that never synced this account (see VoiceParams). */
          voiceArchetype: voiceId ? voiceById(voiceId)?.archetype : undefined,
          voiceGender: voiceId ? voiceById(voiceId)?.gender : undefined,
        },
        ttsSource: null, // a different voice = a new TTS render — ♪ or "Tutte le voci"
      })),
    })))
  }, [])

  /* Preview used to hand the provider whatever `voiceId` the clip happened to
     carry — undefined on hand-added clips, and stale on clips imported before
     the catalog was narrowed to the POs' voices. Either way the engine quietly
     substituted its own default (or, with no key at all, the OPERATING SYSTEM
     voice), so what you auditioned was not the voice the picker showed.
     Now the voice is resolved once, explicitly, and the preview plays the SAME
     baked buffer the clip will get — pan and speed included.

     That fix settled WHICH VOICE resolves, but not WHICH AUDIO you hear, which
     is why the POs kept reporting Preview as wrong: it re-requested the API
     every time, so previewing an already-synthesized clip played a brand-new
     take — a different performance from the one in the timeline, and billed for
     it. A rendered clip is now auditioned from its own `ttsSource`, which is
     the exact generation the clip was built from, re-baked for pan and speed
     but WITHOUT the protocol's calibration (so a whisper lane sitting at
     −34 LUFS is still audible at audition level). Only an unrendered clip
     needs the network. */
  const previewVoice = useCallback(async (clip: Clip) => {
    const text = (clip.text ?? '').trim()
    if (!text) return
    const vp = clip.params as VoiceParams
    const voice = effectiveVoice(vp)
    const player = playerRef.current
    setTtsError(null)
    setPreviewBusy(clip.id)
    try {
      if (clip.ttsSource && clip.ttsText === text && player) {
        const src = clip.ttsSource
        const baked = await bakeVoiceBuffer(src, vp.pan, src.duration / Math.max(0.5, vp.speed ?? 1) + 1, vp.speed ?? 1)
        await player.audition(baked)
        return
      }
      const provider = getTtsProvider()
      // the session's WORKING language, not a deployment-wide setting
      const lang = workingLangRef.current
      if (!provider.canRender || !player) {
        // no key: the browser engine can only speak in an OS voice — say so
        await provider.speak(text, { lang, voiceId: voice.id, rate: vp.speed })
        return
      }
      const bytes = await provider.render(text, { lang, voiceId: voice.id, ...voiceContext(tracksRef.current, clip.id) })
      const decoded = await player.decode(bytes)
      const baked = await bakeVoiceBuffer(decoded, vp.pan, decoded.duration / Math.max(0.5, vp.speed ?? 1) + 1, vp.speed ?? 1)
      await player.audition(baked)
    } catch (e) {
      setTtsError((e as Error).message)
    } finally {
      setPreviewBusy(null)
    }
  }, [])

  const synthesizeVoice = useCallback(async (trackId: string, clipId: string) => {
    const tr = tracksRef.current.find((t) => t.id === trackId)
    const cl = tr?.clips.find((c) => c.id === clipId)
    const player = playerRef.current
    if (!tr || !cl || !player) return
    const text = (cl.text ?? '').trim()
    if (!text) { setTtsError(lt('Write an affirmation first.')); return }
    setTtsError(null); setTtsBusy(clipId)
    // claim the clip for the whole round-trip, and take a render token so a
    // parameter edit that lands mid-flight supersedes us instead of racing
    ttsInFlight.current.add(clipId)
    const token = (renderTokens.current.get(clipId) ?? 0) + 1
    renderTokens.current.set(clipId, token)
    try {
      const provider = getTtsProvider()
      const vp = cl.params as VoiceParams
      /* Renders are deterministic now (same line + voice + context = same
         audio), which is what makes a session reproducible — but it would also
         mean "↻ Re-synthesize" handed back the SAME bad take forever. An
         explicit re-render of an already-rendered clip therefore asks for a
         fresh seed; a first render keeps the reproducible one. */
      let seed: number | undefined
      if (cl.ttsSource) {
        const n = (rerollRef.current.get(clipId) ?? 0) + 1
        rerollRef.current.set(clipId, n)
        seed = Math.imul(n, 2654435761) >>> 0
      }
      const ctx = voiceContext(tracksRef.current, clipId)
      const key: TtsKey = {
        text,
        voiceId: effectiveVoice(vp).id,
        lang: workingLangRef.current,
        context: `${ctx.previousText ?? ''}|${ctx.nextText ?? ''}`,
        seed,
      }
      /* Storage first. An identical request — same line, same voice, same
         context, no re-roll — has already been paid for once, here or in
         another protocol, and asking costs a download instead of credits. */
      let bytes = await ttsLookup(key)
      let fromCache = true
      if (!bytes) {
        fromCache = false
        bytes = await provider.render(text, {
          lang: key.lang,
          voiceId: key.voiceId,
          ...ctx,
          seed,
        })
      }
      const storedPath = fromCache ? await ttsPathFor(key) : await ttsStore(key, bytes)
      const decoded = await player.decode(bytes)
      const maxDur = Math.max(MIN_CLIP, lengthSecRef.current - cl.startSec)
      let buf = await bakeVoiceBuffer(decoded, vp.pan, maxDur, vp.speed ?? 1)
      buf = shapeClipBuffer(buf, { eq: cl.eq, calibrateDb: cl.calibrateDb, gainDb: cl.gainDb, fadeInSec: cl.fadeInSec, fadeOutSec: cl.fadeOutSec })
      if (renderTokens.current.get(clipId) !== token) return
      setClipBuffer(trackId, clipId, buf, { ttsSource: decoded, ttsText: text, ttsPath: storedPath ?? undefined, durationSec: buf.duration })
      /* The clip is now as long as the voice really is, which may be longer
         than the window the sheet gave it — queued AFTER the buffer update, so
         the pass sees the new duration. */
      resolveVoiceOverlaps()
    } catch (e) {
      setTtsError((e as Error).message)
    } finally {
      ttsInFlight.current.delete(clipId)
      setTtsBusy(null)
    }
  }, [setClipBuffer])

  /** Synthesize EVERY voice clip that has text and no rendered voice yet —
      one TTS render per unique line (cached), sequential to respect rate
      limits. Turns a seeded protocol project into real voices in one click. */
  const [synthAll, setSynthAll] = useState<string | null>(null)
  const synthesizeAllVoices = useCallback(async () => {
    const player = playerRef.current
    if (!player) return
    const provider = getTtsProvider()
    if (!provider.canRender) { setTtsError(lt('{engine} is preview-only — set ElevenLabs keys (🎙) first.', { engine: provider.label })); return }
    const jobs: VoiceJob[] = []
    for (const t of tracksRef.current) {
      if (t.type !== 'voice') continue
      for (const c of t.clips) {
        const text = (c.text ?? '').trim()
        const vp = c.params as VoiceParams
        if (text && !c.ttsSource && !c.frozen) jobs.push({ trackId: t.id, clipId: c.id, text, pan: vp.pan, speed: vp.speed ?? 1, voiceId: effectiveVoice(vp).id, startSec: c.startSec, ...voiceContext(tracksRef.current, c.id), shape: (c.eq && !eqIsTransparent(c.eq)) || c.calibrateDb !== undefined || c.gainDb !== undefined || c.fadeInSec !== undefined || c.fadeOutSec !== undefined ? { eq: c.eq, calibrateDb: c.calibrateDb, gainDb: c.gainDb, fadeInSec: c.fadeInSec, fadeOutSec: c.fadeOutSec } : undefined })
      }
    }
    if (!jobs.length) { setTtsError(lt('No voice clip with text to synthesize.')); return }
    setTtsError(null)
    const lang = workingLangRef.current
    const cache = new Map<string, AudioBuffer>()
    /* One joined render serves every clip in its block, and repeats of the same
       block (a LOOP lane cycles the same four words all phase) reuse it — so the
       whole ostinato costs ONE request and every cycle is identical. */
    const blockCache = new Map<string, { decoded: AudioBuffer; spans: TtsSpan[] }>()
    const groups = groupVoiceJobs(jobs, provider.canRenderJoined === true && typeof provider.renderJoined === 'function')
    const total = jobs.length
    let done = 0
    let failed = 0

    /** Bake one job from already-decoded audio and put it in its clip. */
    const place = async (j: VoiceJob, source: AudioBuffer, token: number): Promise<boolean> => {
      const maxDur = Math.max(MIN_CLIP, lengthSecRef.current - j.startSec)
      let buf = await bakeVoiceBuffer(source, j.pan, maxDur, j.speed)
      if (j.shape) buf = shapeClipBuffer(buf, j.shape)
      if (renderTokens.current.get(j.clipId) !== token) return false
      setClipBuffer(j.trackId, j.clipId, buf, { ttsSource: source, ttsText: j.text, durationSec: buf.duration })
      return true
    }

    for (const group of groups) {
      const tokens = new Map<string, number>()
      for (const j of group) {
        ttsInFlight.current.add(j.clipId)
        const t = (renderTokens.current.get(j.clipId) ?? 0) + 1
        renderTokens.current.set(j.clipId, t)
        tokens.set(j.clipId, t)
      }
      try {
        if (group.length > 1) {
          /* A block: spoken as ONE utterance, then cut apart on the character
             timings ElevenLabs returns. Asking for "pace" on its own has no
             right answer — the word is Italian AND English, and every model
             tried guessed, including turbo/flash with an explicit
             language_code. Inside a sentence the same model is correct every
             time. See TtsProvider.renderJoined. */
          setSynthAll(lt('Synthesizing block ({n} lines) {i}/{total}…', { n: group.length, i: done + 1, total }))
          const texts = group.map((j) => j.text)
          const key = `BLOCK|${group[0].voiceId ?? ''}|${lang}|${texts.join('')}`
          let block = blockCache.get(key)
          if (!block) {
            const r = await provider.renderJoined!(texts, { lang, voiceId: group[0].voiceId })
            block = { decoded: await player.decode(r.bytes), spans: r.spans }
            blockCache.set(key, block)
          }
          for (let i = 0; i < group.length; i++) {
            const j = group[i]
            const span = block.spans[i]
            const piece = sliceBuffer(block.decoded, span.startSec, span.endSec)
            if (await place(j, piece, tokens.get(j.clipId)!)) done++
          }
        } else {
          const j = group[0]
          setSynthAll(lt('Synthesizing voices {i}/{total}…', { i: done + 1, total }))
          /* The single-line cache bills one render per repeated line. It keys on
             the WHOLE request: the same words with different neighbours are a
             different generation now that the neighbours condition the result.
             Keying on text alone is what stamped ONE bad take onto every repeat
             of a loop block. */
          const key = `${j.voiceId ?? ''}|${lang}|${j.text}|${j.previousText ?? ''}|${j.nextText ?? ''}`
          let decoded = cache.get(key)
          if (!decoded) {
            const bytes = await provider.render(j.text, { lang, voiceId: j.voiceId, previousText: j.previousText, nextText: j.nextText })
            decoded = await player.decode(bytes)
            cache.set(key, decoded)
          }
          if (await place(j, decoded, tokens.get(j.clipId)!)) done++
        }
      } catch (e) {
        failed += group.length
        setTtsError(lt('Voice at {time}: {error}', { time: fmtTime(group[0].startSec), error: (e as Error).message }))
      } finally {
        for (const j of group) ttsInFlight.current.delete(j.clipId)
      }
    }
    setSynthAll(null)
    // every lane at once: each take is now its real length, so any line that
    // grew into the next one is pulled apart — in the field, or in time
    resolveVoiceOverlaps()
    if (!failed) setTtsError(null)
  }, [setClipBuffer])

  /* What the connected ElevenLabs account can answer for. Recomputed when the
     tracks change or the key does (ttsTick), which is exactly when it moves. */
  const voiceAccount = useMemo(() => {
    let remapped = 0
    let stale = 0
    const examples: string[] = []
    for (const t of tracks) {
      if (t.type !== 'voice') continue
      for (const c of t.clips) {
        const vp = c.params as VoiceParams
        const id = vp.voiceId
        if (!id) continue
        const res = resolveVoiceId(id, voiceHint(vp))
        if (res.remappedFrom) {
          remapped++
          const line = `${res.remappedFrom.name} → ${res.voice?.name ?? '—'}`
          if (!examples.includes(line) && examples.length < 3) examples.push(line)
        } else if (!res.voice) {
          stale++
        }
      }
    }
    return { remapped, stale, examples }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, ttsTick])

  /* ---- switching the working language ----
     Everything but the voice clips' words and voices is shared, so a switch
     touches nothing else: timing, levels, fx and draws stay exactly as they
     are. Each clip's current text, render and voice are folded into its
     per-language maps first, so switching back finds them again — nothing is
     lost by switching, in either direction. Refused while voices are being
     synthesized: a take landing after the switch would be filed under the
     wrong language. */
  const [langMsg, setLangMsg] = useState<string | null>(null)
  function switchLang(next: VoiceLang) {
    setLangAsk(false)
    if (next === workingLang) return
    if (ttsInFlight.current.size > 0 || synthAll) {
      setLangMsg(lt('Wait for the voices being synthesized to finish, then switch language.'))
      return
    }
    const r = switchTracksLang(tracksRef.current, workingLang, next, scripts)
    setTracks(r.tracks)
    setWorkingLang(next)
    const bits: string[] = [lt('Working in {lang}: the voice clips show and speak this language; everything else is shared.', { lang: LANG_LABEL[next] })]
    if (r.filled) bits.push(lt('{n} texts filled from the stored Excel.', { n: r.filled }))
    if (r.missing) bits.push(lt('{n} voice clips have no text in {lang} yet — marked ⚠, they stay silent in this language.', { n: r.missing, lang: LANG_LABEL[next] }))
    if (r.frozen) bits.push(lt('{n} cut pieces keep the audio they were cut from (frozen audio).', { n: r.frozen }))
    if (!hasVoicesFor(next)) bits.push(lt('The ElevenLabs account has no {lang} voices: the default voice is used.', { lang: LANG_LABEL[next] }))
    setLangMsg(bits.join(' '))
    /* The clips were holding the other language's audio: back to the
       placeholder until they are synthesized in this one. */
    window.setTimeout(() => {
      for (const t of tracksRef.current) {
        if (t.type !== 'voice') continue
        for (const c of t.clips) if (!c.frozen) scheduleRender(t.id, c.id)
      }
    }, 0)
  }
  /** Voice clips with no text in the working language, for the top bar. */
  const missingInLang = useMemo(
    () => tracks.reduce((n, t) => n + (t.type === 'voice' ? t.clips.filter((c) => isTextMissing(c)).length : 0), 0),
    [tracks],
  )
  /** How many voice clips have text in each language, for the question. */
  const textCount = useMemo(() => {
    const out: Record<VoiceLang, number> = { it: 0, 'pt-BR': 0 }
    let total = 0
    for (const t of tracks) {
      if (t.type !== 'voice') continue
      for (const c of t.clips) {
        total++
        for (const l of VOICE_LANGS) {
          const live = l === workingLang ? c.text : c.textByLang?.[l]
          const fromIndex = !live?.trim() && scripts
            ? (c.sourceId ? scripts.bySource[c.sourceId]?.[l] : undefined)
            : undefined
          if (live?.trim() || fromIndex?.trim()) out[l]++
        }
      }
    }
    return { ...out, total }
  }, [tracks, workingLang, scripts])

  /* any edit after the first paint means the saved project is behind */
  const firstTracks = useRef(true)
  useEffect(() => {
    if (firstTracks.current) { firstTracks.current = false; return }
    setDirty(true)
  }, [tracks, lengthSec, masterGain, projectName])

  /* ---- mount / unmount ---- */
  useEffect(() => {
    playerRef.current = new MultitrackPlayer(0.82)
    tracksRef.current.forEach((t) => t.clips.forEach((c) => renderClip(t.id, c.id)))
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      renderTimers.current.forEach((id) => window.clearTimeout(id))
      playerRef.current?.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---- transport ---- */
  function gainForId(id: string): number {
    const t = tracksRef.current.find((x) => x.id === id)
    if (!t) return 0
    if (t.muted) return 0
    if (tracksRef.current.some((x) => x.soloed) && !t.soloed) return 0
    return t.volume
  }
  function panForId(id: string): number {
    const t = tracksRef.current.find((x) => x.id === id)
    return CHANNEL_PAN[t?.channel ?? 'C']
  }
  function snapshot(): SchedTrack[] {
    return tracksRef.current.map((t) => ({
      id: t.id,
      effects: t.effects,
      clips: t.clips.map((c) => ({ startSec: c.startSec, durationSec: c.durationSec, buffer: c.fxBuffer ?? c.buffer })),
    }))
  }
  function startRaf() {
    const tick = () => {
      const p = playerRef.current; if (!p) return
      const t = p.currentTime()
      if (t >= lengthSecRef.current) { p.stop(); setPlaying(false); setPlayhead(lengthSecRef.current); rafRef.current = null; return }
      setPlayhead(t)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }
  async function play() {
    const p = playerRef.current; if (!p) return
    let from = playhead
    if (from >= lengthSec - 0.01) from = 0
    await p.play(snapshot(), from, gainForId, panForId)
    setPlayhead(from); setPlaying(true); startRaf()
  }
  function pause() {
    const p = playerRef.current; if (!p) return
    p.pause(); setPlayhead(p.currentTime()); setPlaying(false)
    if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null
  }
  function stopT() {
    const p = playerRef.current; if (!p) return
    p.stop(); setPlaying(false); setPlayhead(0)
    if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = null
  }
  const seekTimer = useRef<number | null>(null)
  function seek(sec: number) {
    const c = clamp(sec, 0, lengthSec)
    setPlayhead(c)
    const p = playerRef.current; if (!p) return
    if (playing) {
      if (seekTimer.current) window.clearTimeout(seekTimer.current)
      seekTimer.current = window.setTimeout(() => { void p.play(snapshot(), c, gainForId, panForId) }, 90)
    } else {
      p.setPlayhead(c)
    }
  }

  // live gain + pan + master updates while playing
  useEffect(() => {
    const p = playerRef.current; if (!p || !playing) return
    const solo = tracks.some((t) => t.soloed)
    tracks.forEach((t) => {
      p.setTrackGain(t.id, t.muted ? 0 : solo && !t.soloed ? 0 : t.volume)
      p.setTrackPan(t.id, CHANNEL_PAN[t.channel ?? 'C'])
    })
  }, [tracks, playing])
  useEffect(() => { playerRef.current?.setMasterGain(masterGain) }, [masterGain])

  // HOT-SWAP: while playing, any change to clip audio or timing (a parameter
  // re-render finishing, a drag, a cut/glue, a synthesized voice landing)
  // reschedules the transport at the current playhead — edits are audible
  // immediately instead of only after stop/play.
  const bufferIds = useRef(new WeakMap<AudioBuffer, number>())
  const bufferSeq = useRef(0)
  const lastSig = useRef('')
  const swapTimer = useRef<number | null>(null)
  useEffect(() => {
    const bufId = (b: AudioBuffer | null) => {
      if (!b) return 0
      let id = bufferIds.current.get(b)
      if (!id) { id = ++bufferSeq.current; bufferIds.current.set(b, id) }
      return id
    }
    const sig = tracks.map((t) => `${t.id}[${effectsKey(t.effects)}]:` + t.clips.map((c) => `${c.id}@${c.startSec.toFixed(2)}+${c.durationSec.toFixed(2)}#${bufId(c.fxBuffer ?? c.buffer)}`).join(',')).join('|')
    if (!playing) { lastSig.current = sig; return }
    if (sig === lastSig.current) return
    lastSig.current = sig
    if (swapTimer.current) window.clearTimeout(swapTimer.current)
    swapTimer.current = window.setTimeout(() => {
      const p = playerRef.current
      if (p && p.playing) void p.play(snapshot(), p.currentTime(), gainForId, panForId)
    }, 160)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, playing])

  /* ---- track effects ---- */
  const [fxTrackId, setFxTrackId] = useState<string | null>(null)
  /** Track whose master-parameter drawer (the P button) is open. */
  const [paramTrackId, setParamTrackId] = useState<string | null>(null)
  const [fxBusy, setFxBusy] = useState(false)

  function patchEffect(trackId: string, kind: TrackEffect['kind'], patch: Partial<TrackEffect> | { params: Record<string, number> }) {
    setTracks((prev) => prev.map((t) => {
      if (t.id !== trackId) return t
      const effects = (t.effects ?? defaultEffects()).map((e) =>
        e.kind !== kind ? e : { ...e, ...patch, params: { ...e.params, ...('params' in patch ? patch.params : {}) } })
      return { ...t, effects }
    }))
  }

  // HARMONIZER (Coral): offline per-clip processing. Whenever a track's
  // harmonizer settings change, every rendered clip gets its chorus version
  // computed (cached by source+params) and stored as fxBuffer; disabling
  // clears it. Playback/mixdown pick fxBuffer ?? buffer.
  useEffect(() => {
    let cancelled = false
    const jobs: { trackId: string; clipId: string; source: AudioBuffer; params: Record<string, number>; key: string }[] = []
    for (const t of tracks) {
      const h = t.effects?.find((e) => e.kind === 'harmonizer')
      const key = h?.enabled ? `h:${Object.entries(h.params).map(([k, v]) => `${k}=${v}`).join(',')}` : ''
      for (const c of t.clips) {
        if (!key) {
          if (c.fxBuffer || c.fxKey) {
            setTracks((prev) => prev.map((x) => (x.id !== t.id ? x : { ...x, clips: x.clips.map((y) => (y.id !== c.id ? y : { ...y, fxBuffer: null, fxKey: undefined, fxSource: null })) })))
          }
          continue
        }
        // recompute when the harmonizer settings change OR when the clip's own
        // audio was re-rendered underneath it
        if (c.buffer && (c.fxKey !== key || c.fxSource !== c.buffer)) jobs.push({ trackId: t.id, clipId: c.id, source: c.buffer, params: h!.params, key })
      }
    }
    if (!jobs.length) return
    setFxBusy(true)
    void (async () => {
      for (const j of jobs) {
        try {
          const out = await harmonizeBuffer(j.source, j.params)
          if (cancelled) return
          setTracks((prev) => prev.map((t) => (t.id !== j.trackId ? t : {
            ...t,
            clips: t.clips.map((c) => (c.id !== j.clipId || c.buffer !== j.source ? c : { ...c, fxBuffer: out, fxKey: j.key, fxSource: j.source })),
          })))
        } catch { /* clip keeps its dry buffer */ }
      }
      if (!cancelled) setFxBusy(false)
    })()
    return () => { cancelled = true; setFxBusy(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks])

  /* ---- cut & glue ---- */
  const [editMsg, setEditMsg] = useState<string | null>(null)

  /** Split the selected clip at the playhead into two FROZEN audio pieces.
      Slicing the rendered buffer (instead of re-rendering halves) keeps
      periodic layers phase-continuous and keeps synthesized voices intact. */
  function cutAtPlayhead() {
    if (!selected) { setEditMsg(lt('Select a clip first, move the cursor inside it, then Cut.')); return }
    const tr = tracksRef.current.find((t) => t.id === selected.trackId)
    const cl = tr?.clips.find((c) => c.id === selected.clipId)
    if (!tr || !cl) return
    const t0 = cl.startSec, t1 = cl.startSec + cl.durationSec
    if (playhead < t0 + 0.2 || playhead > t1 - 0.2) { setEditMsg(lt('Move the cursor INSIDE the selected clip (not on its edge), then Cut.')); return }
    if (!cl.buffer) { setEditMsg(lt('This clip is still rendering — wait for the waveform, then Cut.')); return }
    const cutAt = playhead - t0
    const bufA = sliceBuffer(cl.buffer, 0, cutAt)
    const bufB = sliceBuffer(cl.buffer, cutAt, cl.durationSec)
    const mk = (start: number, buf: AudioBuffer, text?: string): Clip => ({
      id: uid(), startSec: start, durationSec: buf.duration,
      params: { ...(cl.params as object) } as ClipParams,
      buffer: buf, peaks: computePeaks(buf, peakBuckets(buf.duration)),
      text, frozen: true,
      // the first piece keeps the line in every language, and where it came from
      ...(text !== undefined ? { sourceId: cl.sourceId, textByLang: cl.textByLang, voiceByLang: cl.voiceByLang } : {}),
    })
    const a = mk(t0, bufA, cl.text)
    const b = mk(t0 + bufA.duration, bufB)
    setTracks((prev) => prev.map((t) => (t.id !== tr.id ? t : {
      ...t,
      clips: [...t.clips.filter((c) => c.id !== cl.id), a, b].sort((x, y) => x.startSec - y.startSec),
    })))
    setSelected({ trackId: tr.id, clipId: b.id })
    setEditMsg(null)
  }

  /** Merge the selected clip with the NEXT clip on the same track into one
      frozen clip; any gap between them becomes silence inside the clip. */
  function glueWithNext() {
    if (!selected) { setEditMsg(lt('Select the left clip of the pair to join.')); return }
    const tr = tracksRef.current.find((t) => t.id === selected.trackId)
    if (!tr) return
    const sorted = [...tr.clips].sort((x, y) => x.startSec - y.startSec)
    const i = sorted.findIndex((c) => c.id === selected.clipId)
    const cl = sorted[i]
    const nx = sorted[i + 1]
    if (!cl || !nx) { setEditMsg(lt('No clip after the selected one on this track — nothing to join.')); return }
    if (!cl.buffer || !nx.buffer) { setEditMsg(lt('Both clips need rendered audio before they can be joined (wait for the waveforms).')); return }
    const gap = Math.max(0, nx.startSec - (cl.startSec + cl.durationSec))
    if (gap > 60) { setEditMsg(lt('These clips are more than 60 s apart — move them closer before joining.')); return }
    const bufA = sliceBuffer(cl.buffer, 0, cl.durationSec)
    const bufB = sliceBuffer(nx.buffer, 0, nx.durationSec)
    const buf = concatBuffers(bufA, bufB, gap)
    const merged: Clip = {
      id: uid(), startSec: cl.startSec, durationSec: buf.duration,
      params: { ...(cl.params as object) } as ClipParams,
      buffer: buf, peaks: computePeaks(buf, peakBuckets(buf.duration)),
      text: cl.text ?? nx.text, frozen: true,
      sourceId: cl.sourceId ?? nx.sourceId,
      textByLang: cl.textByLang ?? nx.textByLang,
      voiceByLang: cl.voiceByLang ?? nx.voiceByLang,
    }

    setTracks((prev) => prev.map((t) => (t.id !== tr.id ? t : {
      ...t,
      clips: [...t.clips.filter((c) => c.id !== cl.id && c.id !== nx.id), merged].sort((x, y) => x.startSec - y.startSec),
    })))
    setSelected({ trackId: tr.id, clipId: merged.id })
    setEditMsg(null)
  }

  /* ---- clip / track ops ---- */
  function addClip(trackId: string, atSec: number) {
    const tr = tracksRef.current.find((t) => t.id === trackId); if (!tr) return
    const dur = clamp(20, MIN_CLIP, Math.max(MIN_CLIP, lengthSec))
    const start = snap(clamp(atSec, 0, Math.max(0, lengthSec - dur)))
    const clip = makeClip(tr.type, start, dur)
    setTracks((prev) => prev.map((t) => (t.id !== trackId ? t : { ...t, clips: [...t.clips, clip] })))
    setSelected({ trackId, clipId: clip.id })
    doRender(trackId, clip.id, tr.type, clip.params, dur)
  }
  function addTrack(type: TrackType) {
    setAddOpen(false)
    const t: Track = { id: uid(), type, name: TRACK_META[type].label, volume: 0.82, muted: false, soloed: false, clips: [] }
    setTracks((prev) => [...prev, t])
  }
  function deleteTrack(trackId: string) {
    setTracks((prev) => prev.filter((t) => t.id !== trackId))
    setSelected((s) => (s?.trackId === trackId ? null : s))
  }
  function deleteClip(trackId: string, clipId: string) {
    setTracks((prev) => prev.map((t) => (t.id !== trackId ? t : { ...t, clips: t.clips.filter((c) => c.id !== clipId) })))
    setSelected((s) => (s?.clipId === clipId ? null : s))
  }
  /**
   * Two voices at once, and what to do about it.
   *
   * Sliding the later line down the timeline — which is what this used to do —
   * is the wrong answer almost everywhere. A protocol's voices are placed
   * against music, against a phase map and against each other; moving one
   * moves it out of the bed it was written for. The POs' answer is two rules,
   * and which applies depends on WHERE the overlap falls and on what the two
   * voices already are. See `planVoiceOverlaps`.
   *
   * Run after a synthesis, because that is when a clip stops being as long as
   * the sheet planned and becomes as long as the voice actually took.
   */
  function resolveVoiceOverlaps() {
    const closing = phases.find((ph) => ph.fase === 6) ?? null
    /* The plan is computed inside the updater so it sees the duration the
       synthesis just wrote, and read back out here for the things that are not
       track state: the session length, the re-render, the note. The updater
       stays pure — StrictMode calls it twice. */
    let plan: VoicePlan | null = null
    setTracks((prev) => {
      plan = planVoiceOverlaps(prev, closing)
      return applyVoicePlan(prev, plan)
    })

    window.setTimeout(() => {
      const p = plan
      if (!p || (!p.panned && !p.moved)) return
      /* The closing may now run past the end of the session. It is allowed to:
         a protocol that ends a few seconds past 24 minutes is the accepted
         price of not stacking two voices on top of each other. */
      if (p.closingEnd > lengthSecRef.current) setLengthSec(Math.ceil(p.closingEnd))
      for (const t of tracksRef.current) {
        for (const c of t.clips) {
          if (p.starts[c.id] !== undefined || p.pans[c.id] !== undefined || p.stretched[c.id] !== undefined) {
            scheduleRender(t.id, c.id)
          }
        }
      }
      const bits: string[] = []
      if (p.panned) bits.push(lt('{n} in the stereo field (1st right, 2nd left)', { n: p.panned }))
      if (p.moved) bits.push(p.moved === 1
        ? lt('1 in phase 6 spaced {gap}s apart, centred', { gap: VOICE_GAP })
        : lt('{n} in phase 6 spaced {gap}s apart, centred', { n: p.moved, gap: VOICE_GAP }))
      if (p.longer) bits.push(lt('phase 6 music extended to the last voice'))
      setEditMsg(lt('Overlapping voices resolved: {list}.', { list: bits.join(' \u00b7 ') }))
    }, 0)
  }

  function patchTrack(trackId: string, patch: Partial<Track>) {
    setTracks((prev) => prev.map((t) => (t.id !== trackId ? t : { ...t, ...patch })))
  }
  function patchClipParams(trackId: string, clipId: string, patch: Partial<ClipParams>) {
    setTracks((prev) => prev.map((t) => (t.id !== trackId ? t : { ...t, clips: t.clips.map((c) => (c.id !== clipId ? c : { ...c, params: { ...c.params, ...patch } as ClipParams })) })))
    scheduleRender(trackId, clipId)
  }

  /** Master parameter change: apply one patch to EVERY clip on the track, so a
      value is set once instead of clip by clip. Cut/glued pieces are skipped —
      their audio is frozen and would not re-render. */
  function patchTrackParams(trackId: string, patch: Partial<ClipParams>) {
    const track = tracksRef.current.find((t) => t.id === trackId)
    if (!track) return
    const targets = track.clips.filter((c) => !c.frozen)
    if (!targets.length) {
      setEditMsg(lt('Every clip on this track has frozen audio (cut pieces) — the parameters do not apply.'))
      return
    }
    setTracks((prev) => prev.map((t) => (t.id !== trackId ? t : {
      ...t,
      clips: t.clips.map((c) => (c.frozen ? c : { ...c, params: { ...c.params, ...patch } as ClipParams })),
    })))
    for (const c of targets) scheduleRender(trackId, c.id)
    const frozen = track.clips.length - targets.length
    setEditMsg(frozen > 0
      ? (frozen === 1
        ? lt('Applied to {n} clips · 1 cut piece skipped (frozen audio).', { n: targets.length })
        : lt('Applied to {n} clips · {k} cut pieces skipped (frozen audio).', { n: targets.length, k: frozen }))
      : null)
  }
  /** Per-clip volume trim, in dB RELATIVE to the track fader. It is baked into
      the clip's buffer (like the PLAIN Excel's volume_db), so the track keeps
      owning the layer's level in the mix and the clip only rides above or
      below it — the hierarchy stays intact, nothing is bypassed. */
  function patchClipGain(trackId: string, clipId: string, gainDb: number) {
    const cl = tracksRef.current.find((t) => t.id === trackId)?.clips.find((c) => c.id === clipId)
    if (cl?.frozen) {
      setEditMsg(lt('Cut pieces have frozen audio — change the volume before cutting, or by joining the parts again.'))
      return
    }
    const v = Math.max(-24, Math.min(12, Math.round(gainDb * 2) / 2))
    setTracks((prev) => prev.map((t) => (t.id !== trackId ? t : {
      ...t,
      clips: t.clips.map((c) => (c.id !== clipId ? c : { ...c, gainDb: v === 0 ? undefined : v })),
    })))
    scheduleRender(trackId, clipId)
  }

  /** Nudge EVERY clip on a track by the same number of dB, keeping the
      relative ladder the protocol authored (a flat "set all to X" would erase
      the per-clip differences the Excel encodes). */
  function trimTrackClips(trackId: string, deltaDb: number) {
    const track = tracksRef.current.find((t) => t.id === trackId)
    if (!track) return
    const targets = track.clips.filter((c) => !c.frozen)
    if (!targets.length) return
    setTracks((prev) => prev.map((t) => (t.id !== trackId ? t : {
      ...t,
      clips: t.clips.map((c) => {
        if (c.frozen) return c
        const next = deltaDb === 0 ? 0 : Math.max(-24, Math.min(12, (c.gainDb ?? 0) + deltaDb))
        return { ...c, gainDb: next === 0 ? undefined : next }
      }),
    })))
    for (const c of targets) scheduleRender(trackId, c.id)
  }

  function patchClipTiming(trackId: string, clipId: string, patch: { startSec?: number; durationSec?: number }) {
    const cl = tracksRef.current.find((t) => t.id === trackId)?.clips.find((c) => c.id === clipId)
    if (cl?.frozen && patch.durationSec != null && Math.abs(patch.durationSec - cl.durationSec) > 0.01) {
      setEditMsg(lt('Cut pieces have frozen audio — move them freely, or cut again / join to change their length.'))
      return
    }
    setTracks((prev) => prev.map((t) => (t.id !== trackId ? t : { ...t, clips: t.clips.map((c) => (c.id !== clipId ? c : { ...c, ...patch })) })))
    if (patch.durationSec != null) scheduleRender(trackId, clipId)
  }

  /* ---- drag / trim ---- */
  const onDragMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current; if (!d) return
    // vertical hop: while MOVING, dragging into another lane of the SAME track
    // type carries the clip over (e.g. a guide voice clip down to echo & whisper)
    if (d.mode === 'move' && lanesRef.current) {
      const rect = lanesRef.current.getBoundingClientRect()
      const idx = Math.floor((e.clientY - rect.top - RULER_H) / LANE_H)
      const target = tracksRef.current[idx]
      if (target && target.id !== d.trackId && target.type === d.trackType) {
        const fromId = d.trackId
        const clipId = d.clipId
        setTracks((prev) => {
          const src = prev.find((t) => t.id === fromId)
          const cl = src?.clips.find((c) => c.id === clipId)
          if (!src || !cl) return prev
          return prev.map((t) =>
            t.id === fromId ? { ...t, clips: t.clips.filter((c) => c.id !== clipId) }
            : t.id === target.id ? { ...t, clips: [...t.clips, cl].sort((a, b) => a.startSec - b.startSec) }
            : t)
        })
        d.trackId = target.id
        setSelected({ trackId: target.id, clipId })
      }
    }
    const px = pxPerSecRef.current, len = lengthSecRef.current
    const dx = (e.clientX - d.startClientX) / px
    setTracks((prev) => prev.map((t) => (t.id !== d.trackId ? t : {
      ...t,
      clips: t.clips.map((c) => {
        if (c.id !== d.clipId) return c
        if (d.mode === 'move') { const ns = snap(clamp(d.origStart + dx, 0, Math.max(0, len - c.durationSec))); return { ...c, startSec: ns } }
        if (c.frozen) return c // cut pieces: audio frozen — move only, no trims
        if (d.mode === 'trim-l') { const maxStart = d.origStart + d.origDur - MIN_CLIP; const ns = snap(clamp(d.origStart + dx, 0, maxStart)); return { ...c, startSec: ns, durationSec: d.origStart + d.origDur - ns } }
        const nd = snap(clamp(d.origDur + dx, MIN_CLIP, Math.max(MIN_CLIP, len - c.startSec))); return { ...c, durationSec: nd }
      }),
    })))
  }, [])
  const onDragEnd = useCallback(() => {
    const d = dragRef.current; dragRef.current = null
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragEnd)
    if (d && d.mode !== 'move') scheduleRender(d.trackId, d.clipId)
  }, [onDragMove, scheduleRender])
  const beginDrag = useCallback((mode: 'move' | 'trim-l' | 'trim-r', trackId: string, clipId: string, e: ReactPointerEvent) => {
    const tr = tracksRef.current.find((t) => t.id === trackId); const cl = tr?.clips.find((c) => c.id === clipId); if (!tr || !cl) return
    dragRef.current = { mode, trackId, trackType: tr.type, clipId, startClientX: e.clientX, origStart: cl.startSec, origDur: cl.durationSec }
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', onDragEnd)
  }, [onDragMove, onDragEnd])
  useEffect(() => () => {
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragEnd)
  }, [onDragMove, onDragEnd])

  // delete key removes selected clip
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        const el = document.activeElement
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
        deleteClip(selected.trackId, selected.clipId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  /* ---- export ---- */
  async function exportWav() {
    setExporting(true)
    try {
      const solo = tracks.some((t) => t.soloed)
      const mix: MixTrack[] = tracks.map((t) => ({ gain: t.muted ? 0 : solo && !t.soloed ? 0 : t.volume, pan: CHANNEL_PAN[t.channel ?? 'C'], effects: t.effects, clips: t.clips.map((c) => ({ startSec: c.startSec, durationSec: c.durationSec, buffer: c.fxBuffer ?? c.buffer })) }))
      const buffer = await renderMixdownBuffer(mix, lengthSec, masterGain, sessionFades)
      masterSessionBuffer(buffer)
      const blob = audioBufferToWav(buffer)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${projectName.replace(/[^\w.-]+/g, '_') || 'session'}.wav`; a.click()
      // revoking in the same tick can cancel the download before the browser
      // has read the blob — the other three download helpers already wait
      setTimeout(() => URL.revokeObjectURL(url), 4000)
    } finally {
      setExporting(false)
    }
  }

  const contentWidth = lengthSec * pxPerSec
  const contentHeight = RULER_H + tracks.length * LANE_H
  const selClip = selected ? tracks.find((t) => t.id === selected.trackId)?.clips.find((c) => c.id === selected.clipId) ?? null : null
  const selTrack = selected ? tracks.find((t) => t.id === selected.trackId) ?? null : null

  return (
    <div className="mt-studio">
      {/* ---- top transport bar ---- */}
      <header className="mt-topbar">
        <div className="mt-brand"><BrandLogo variant="cream" /><span className="mt-brand__sub">studio</span></div>
        <input className="mt-name" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
        <div className="mt-transport">
          <button className="mt-tbtn" onClick={stopT} title={lt('Stop / back to the start')}>⏹</button>
          <button className="mt-tbtn mt-tbtn--play" onClick={playing ? pause : play} title={playing ? lt('Pause') : lt('Start playback')}>{playing ? '⏸' : '▶'}</button>
          <span className="mt-time">
            <EditableValue
              display={fmtTime(playhead)}
              title={lt('Click to type a time (e.g. 3:45 or 225)')}
              commit={(raw) => {
                const t = raw.trim()
                const mm = /^(\d{1,3}):(\d{1,2})$/.exec(t)
                const sec = mm ? Number(mm[1]) * 60 + Number(mm[2]) : parseFloat(t.replace(',', '.'))
                if (Number.isFinite(sec)) seek(sec)
              }}
            />
            {' '}<span className="mt-time__sep">/</span> {fmtTime(lengthSec)}
          </span>
        </div>
        <button className={`mt-tbtn${voiceSetupOpen ? ' is-on' : ''}`} onClick={() => setVoiceSetupOpen((v) => !v)} title={lt('Voice engine (TTS keys)')}>
          {ttsInfo.canRender ? '🎙' : '🎙!'}
        </button>
        <button
          className="mt-tbtn mt-tbtn--wide"
          onClick={() => void synthesizeAllVoices()}
          disabled={!!synthAll}
          title={lt('Synthesize every voice clip that has text and has not been rendered yet (one TTS render per unique line)')}
        >
          {synthAll ?? lt('♪ All voices')}
        </button>
        <button className="mt-tbtn mt-tbtn--wide" onClick={cutAtPlayhead} disabled={!selected} title={lt('Split the selected clip in two at the cursor')}>{lt('✂ Cut')}</button>
        <button className="mt-tbtn mt-tbtn--wide" onClick={glueWithNext} disabled={!selected} title={lt('Join the selected clip to the next one on the same track (the gap becomes silence)')}>{lt('🩹 Join')}</button>
        <div className="mt-master">
          <span className="mt-master__lbl">Master</span>
          <input type="range" min={0} max={1} step={0.01} value={masterGain} onChange={(e) => setMasterGain(+e.target.value)} />
        </div>
        <div className="mt-zoom">
          <button onClick={() => setPxPerSec((v) => clamp(+(v * 0.8).toFixed(2), 2, 60))}>−</button>
          <span>zoom</span>
          <button onClick={() => setPxPerSec((v) => clamp(+(v * 1.25).toFixed(2), 2, 60))}>+</button>
        </div>
        <div className="mt-len">
          <span>{lt('length')}</span>
          <input type="number" min={10} max={1800} value={lengthSec} onChange={(e) => setLengthSec(clamp(Math.round(+e.target.value || 10), 10, 1800))} />
          <span>s</span>
        </div>
        <div className="mt-addwrap">
          <button className="mt-add" onClick={() => setAddOpen((v) => !v)}>{lt('＋ Track ▾')}</button>
          {addOpen && (
            <div className="mt-addmenu">
              {(Object.keys(TRACK_META) as TrackType[]).map((tp) => (
                <button key={tp} onClick={() => addTrack(tp)}><span>{TRACK_META[tp].icon}</span> {lt(trackText(tp).label)}<em>{lt(trackText(tp).blurb)}</em></button>
              ))}
            </div>
          )}
        </div>
        <button className="mt-export" onClick={exportWav} disabled={exporting}>{exporting ? lt('Rendering…') : lt('⬇ Export WAV')}</button>
        {
          <button
            className={`mt-export${dirty ? ' is-dirty' : ''}`}
            onClick={() => void onSave()}
            disabled={saving}
            title={lt('Save every change into the protocol — reopen it to find this session again')}
          >
            {saving ? lt('Saving…') : dirty ? lt('💾 Save •') : lt('💾 Save')}
          </button>
        }
        {/* Pubblica and Solo audio used to live here. Publishing is one act
            with one home — the protocol workscreen — and having a second door
            into it from the Studio meant two code paths that could disagree
            about what a published protocol looks like. The Studio saves; the
            workscreen publishes. */}
        {/* The session's WORKING language: which text and voice the voice
            clips speak. Not the interface language (the picker next to it). */}
        <div className="mt-worklang" role="group" aria-label={lt('Working language')} title={lt('Working language: the voice clips show and speak this language; everything else is shared')}>
          {VOICE_LANGS.map((l) => (
            <button key={l} className={workingLang === l ? 'is-on' : ''} aria-pressed={workingLang === l} onClick={() => switchLang(l)}>
              {LANG_SHORT[l]}
            </button>
          ))}
          {missingInLang > 0 && (
            <span className="mt-worklang__warn" title={lt('Voice clips with no text in {lang}', { lang: LANG_LABEL[workingLang] })}>⚠ {missingInLang}</span>
          )}
        </div>
        {languagePicker && <LanguagePicker label={false} className="mt-lang" />}
        <button className="mt-back" onClick={goBack} title={returnTo ? lt('Back to the previous screen') : lt('Leave the studio')}>
          {lt('← Back')}
        </button>
      </header>

      {voiceSetupOpen && (
        <div className="mt-voicesetup">
          <VoiceEnginePanel onChanged={() => setTtsTick((n) => n + 1)} />
        </div>
      )}
      {attachMsg && <div className="mt-voicesetup" style={{ fontSize: 12.5 }}>{attachMsg}</div>}
      {langMsg && <div className="mt-editmsg" onClick={() => setLangMsg(null)}>{langMsg} ✕</div>}
      {langAsk && (
        <div className="mt-langask" role="dialog" aria-modal="true" aria-label={lt('Which language do you want to work in?')}>
          <div className="mt-langask__card">
            <h2>{lt('Which language do you want to work in?')}</h2>
            <p>{lt('Tracks, timing, levels, effects and draws are the same in every language: only the voice clips’ text and voice change. You can switch at any time from the top bar, and saving keeps every language.')}</p>
            <div className="mt-langask__opts">
              {VOICE_LANGS.map((l) => (
                <button key={l} className="mt-langask__opt" onClick={() => switchLang(l)}>
                  <b>{LANG_LABEL[l]}</b>
                  <span>{lt('{n} of {total} voice clips have text', { n: textCount[l], total: textCount.total })}</span>
                  {!hasVoicesFor(l) && <span className="mt-langask__warn">{lt('No {lang} voices in the account', { lang: LANG_LABEL[l] })}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mt-hint">{lt('🎧 Use headphones — the binaural beat lives in the L/R difference.')}</div>
      {/* The voices were authored against one ElevenLabs account; the key can
          now point at another. Every clip keeps the id it was saved with and
          is served by the same archetype here, but that is worth saying once,
          at the top — the alternative reads as "the Studio lost my voices". */}
      {(voiceAccount.remapped > 0 || voiceAccount.stale > 0) && (
        <div className="mt-hint mt-hint--warn">
          {voiceAccount.remapped > 0 && (
            <>{lt(voiceAccount.remapped === 1
              ? '🎙 {n} clip uses a voice from another ElevenLabs account: {examples}. The same archetype on this account synthesizes it.'
              : '🎙 {n} clips use voices from another ElevenLabs account: {examples}. The same archetype on this account synthesizes them.', {
              n: voiceAccount.remapped,
              examples: voiceAccount.examples.join(' · ') + (voiceAccount.examples.length < voiceAccount.remapped ? ' …' : ''),
            })}{' '}</>
          )}
          {voiceAccount.stale > 0 && (
            <>{lt(voiceAccount.stale === 1
              ? '⚠ {n} clip has a voice this account cannot replace: pick one in the inspector before synthesizing.'
              : '⚠ {n} clips have a voice this account cannot replace: pick one in the inspector before synthesizing.', { n: voiceAccount.stale })}{' '}</>
          )}
          {lt('Switching back to the previous key brings the previous voices back.')}
        </div>
      )}

      {/* ---- arrange view ---- */}
      {editMsg && <div className="mt-editmsg" onClick={() => setEditMsg(null)}>{editMsg} ✕</div>}
      {fxTrackId && (() => {
        const t = tracks.find((x) => x.id === fxTrackId)
        if (!t) return null
        return (
          <FxDrawer
            track={t}
            busy={fxBusy}
            onClose={() => setFxTrackId(null)}
            onToggle={(kind, enabled) => patchEffect(t.id, kind, { enabled })}
            onParam={(kind, key, v) => patchEffect(t.id, kind, { params: { [key]: v } })}
          />
        )
      })()}
      {paramTrackId && (() => {
        const t = tracks.find((x) => x.id === paramTrackId)
        if (!t) return null
        return (
          <TrackParamsDrawer
            track={t}
            onClose={() => setParamTrackId(null)}
            onParam={(patch) => patchTrackParams(t.id, patch)}
            onTrim={(db) => trimTrackClips(t.id, db)}
          />
        )
      })()}
      <div className="mt-body">
        <div className="mt-grid">
          <div className="mt-headers" style={{ width: HEADER_W }}>
          <div className="mt-headers__spacer" style={{ height: RULER_H }} />
          {tracks.map((t) => (
            <TrackHeader
              key={t.id}
              track={t}
              onVolume={(v) => patchTrack(t.id, { volume: v })}
              onToggleMute={() => patchTrack(t.id, { muted: !t.muted })}
              onToggleSolo={() => patchTrack(t.id, { soloed: !t.soloed })}
              onDelete={() => deleteTrack(t.id)}
              onAddClip={() => addClip(t.id, playhead)}
              onChannel={(c) => patchTrack(t.id, { channel: c })}
              onFx={() => setFxTrackId((v) => (v === t.id ? null : t.id))}
              paramsOpen={paramTrackId === t.id}
              onParams={() => setParamTrackId((v) => (v === t.id ? null : t.id))}
            />
          ))}
          {tracks.length === 0 && <div className="mt-empty">{lt('No tracks. Use ＋ Track.')}</div>}
          </div>

          <div className="mt-content" ref={lanesRef} style={{ width: contentWidth, height: contentHeight }}>
            <Ruler lengthSec={lengthSec} pxPerSec={pxPerSec} onSeek={seek} />
            {tracks.map((t) => (
              <Lane
                key={t.id}
                track={t}
                pxPerSec={pxPerSec}
                lengthSec={lengthSec}
                selected={selected}
                onSelectClip={(tid, cid) => setSelected({ trackId: tid, clipId: cid })}
                onBeginDrag={beginDrag}
                onAddClipAt={(sec) => addClip(t.id, sec)}
                onDeselect={() => setSelected(null)}
              />
            ))}
            <div className="mt-playhead" style={{ left: playhead * pxPerSec, height: contentHeight }} />
          </div>
        </div>
      </div>

      {/* ---- inspector ---- */}
      <Inspector
        track={selTrack}
        clip={selClip}
        onParam={(patch) => selected && patchClipParams(selected.trackId, selected.clipId, patch)}
        onTiming={(patch) => selected && patchClipTiming(selected.trackId, selected.clipId, patch)}
        onGain={(db) => selected && patchClipGain(selected.trackId, selected.clipId, db)}
        onDelete={() => selected && deleteClip(selected.trackId, selected.clipId)}
        ttsLabel={ttsInfo.label}
        ttsCanRender={ttsInfo.canRender}
        ttsBusy={!!selected && ttsBusy === selected.clipId}
        previewBusy={!!selected && previewBusy === selected.clipId}
        ttsError={ttsError}
        onVoiceText={(text) => selected && setVoiceText(selected.trackId, selected.clipId, text)}
        onVoicePreview={() => selClip && void previewVoice(selClip)}
        onVoiceSynthesize={() => selected && synthesizeVoice(selected.trackId, selected.clipId)}
        onVoiceChange={(v) => selected && setClipVoice(selected.trackId, selected.clipId, v)}
        workingLang={workingLang}
        onEq={(eq) => selected && setClipEq(selected.trackId, selected.clipId, eq)}
        onDrawClip={() => selected && void drawForClip(selected.trackId, selected.clipId)}
        onDrawAllMissing={() => void drawAllMissing()}
        drawBusy={drawBusy}
        drawMsg={drawMsg}
      />
    </div>
  )
}

/* ============================ track header ============================ */
function TrackHeader({ track, onVolume, onToggleMute, onToggleSolo, onDelete, onAddClip, onChannel, onFx, paramsOpen, onParams }: {
  track: Track
  onVolume: (v: number) => void
  onToggleMute: () => void
  onToggleSolo: () => void
  onDelete: () => void
  onAddClip: () => void
  onChannel: (c: TrackChannel) => void
  onFx: () => void
  paramsOpen: boolean
  onParams: () => void
}) {
  const { t: lt } = useI18n()
  const meta = TRACK_META[track.type]
  const ch = track.channel ?? 'C'
  const fxOn = (track.effects ?? []).filter((e) => e.enabled).length
  return (
    <div className="mt-head" style={{ height: LANE_H, borderLeftColor: meta.color }}>
      <div className="mt-head__top">
        <span className="mt-head__icon">{meta.icon}</span>
        <span className="mt-head__name" title={track.name}>{lt(track.name)}</span>
        <button className={`mt-fxbtn${fxOn ? ' is-on' : ''}`} onClick={onFx} title={lt('Track effects (harmonizer · echo · reverb · saturation · filter)')}>
          FX{fxOn ? ` ${fxOn}` : ''}
        </button>
        <button className="mt-x" onClick={onDelete} title={lt('Remove the track')}>✕</button>
      </div>
      <div className="mt-head__row">
        <button className={`mt-mini${track.muted ? ' is-m' : ''}`} onClick={onToggleMute} title={lt('Mute track')}>M</button>
        <button className={`mt-mini${track.soloed ? ' is-s' : ''}`} onClick={onToggleSolo} title="Solo">S</button>
        <span className="mt-chan" title={lt('Track channel — the whole track plays left / centre / right (when listening and in the export)')}>
          {(['L', 'C', 'R'] as TrackChannel[]).map((c) => (
            <button key={c} className={`mt-chan__b${ch === c ? ' is-on' : ''}`} onClick={() => onChannel(c)}>{c}</button>
          ))}
        </span>
        <button
          className={`mt-mini mt-mini--p${paramsOpen ? ' is-p' : ''}`}
          onClick={onParams}
          title={lt('Track parameters — change a value once for every clip')}
        >
          P
        </button>
        <span style={{ flex: 1 }} />
        <button className="mt-addclip" onClick={onAddClip} title={lt('Add a clip at the cursor')}>＋</button>
      </div>
      {track.baseLufs !== undefined ? (
        <div className="mt-head__vol" title={lt('Track loudness target in LUFS (the protocol’s mix language) — scroll for ±0.5 LU')}>
          <input
            className="mt-vol"
            type="range" min={0} max={1} step={0.002}
            value={lufsToFaderPos(trackLufs(track.baseLufs, track.volume))}
            onChange={(e) => onVolume(lufsToGain(track.baseLufs!, faderPosToLufs(+e.target.value)))}
            onWheel={(e) => {
              e.preventDefault()
              const cur = trackLufs(track.baseLufs!, track.volume)
              const next = (Number.isFinite(cur) ? cur : FADER_MIN_LUFS) + (e.deltaY < 0 ? 0.5 : -0.5)
              onVolume(next < FADER_MIN_LUFS ? 0 : lufsToGain(track.baseLufs!, next))
            }}
          />
          <span className="mt-head__voldb">
            <EditableValue
              display={Number.isFinite(trackLufs(track.baseLufs, track.volume)) ? `${trackLufs(track.baseLufs, track.volume).toFixed(1)} LUFS` : '−∞'}
              commit={(raw) => {
                const v = parseTyped(raw, FADER_MIN_LUFS, FADER_MAX_LUFS)
                if (v != null) onVolume(lufsToGain(track.baseLufs!, v))
              }}
              title={lt('Click to type the target in LUFS (e.g. -22)')}
            />
          </span>
        </div>
      ) : (
        <div className="mt-head__vol" title={lt('Track level in dB relative to the mix — scroll for fine ±0.5 dB steps')}>
          <input
            className="mt-vol"
            type="range" min={0} max={1} step={0.002}
            value={gainToFaderPos(track.volume)}
            onChange={(e) => onVolume(faderPosToGain(+e.target.value))}
            onWheel={(e) => {
              e.preventDefault()
              if (track.volume <= 0) { onVolume(faderPosToGain(0.02)); return }
              const db = 20 * Math.log10(track.volume) + (e.deltaY < 0 ? 0.5 : -0.5)
              onVolume(db < FADER_MIN_DB ? 0 : Math.pow(10, Math.min(FADER_MAX_DB, db) / 20))
            }}
          />
          <span className="mt-head__voldb">
            <EditableValue
              display={gainToDbLabel(track.volume)}
              commit={(raw) => {
                const v = parseTyped(raw, FADER_MIN_DB, FADER_MAX_DB)
                if (v != null) onVolume(Math.pow(10, v / 20))
              }}
              title={lt('Click to type the level in dB (e.g. -12)')}
            />
          </span>
        </div>
      )}
    </div>
  )
}

/* ============================ ruler ============================ */
function Ruler({ lengthSec, pxPerSec, onSeek }: { lengthSec: number; pxPerSec: number; onSeek: (s: number) => void }) {
  const interval = niceInterval(pxPerSec)
  const ticks: number[] = []
  for (let s = 0; s <= lengthSec + 0.001; s += interval) ticks.push(+s.toFixed(3))
  return (
    <div
      className="mt-ruler"
      style={{ height: RULER_H, width: lengthSec * pxPerSec }}
      onPointerDown={(e) => {
        const el = e.currentTarget
        const r = el.getBoundingClientRect()
        const at = (x: number) => Math.max(0, Math.min(lengthSec, (x - r.left) / pxPerSec))
        onSeek(at(e.clientX))
        el.setPointerCapture(e.pointerId)
        const move = (ev: globalThis.PointerEvent) => onSeek(at(ev.clientX))
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
      }}
    >
      {ticks.map((s) => (
        <div key={s} className="mt-tick" style={{ left: s * pxPerSec }}><span>{fmtTime(s)}</span></div>
      ))}
    </div>
  )
}

/* ============================ lane ============================ */
function Lane({ track, pxPerSec, lengthSec, selected, onSelectClip, onBeginDrag, onAddClipAt, onDeselect }: {
  track: Track
  pxPerSec: number
  lengthSec: number
  selected: { trackId: string; clipId: string } | null
  onSelectClip: (trackId: string, clipId: string) => void
  onBeginDrag: (mode: 'move' | 'trim-l' | 'trim-r', trackId: string, clipId: string, e: ReactPointerEvent) => void
  onAddClipAt: (sec: number) => void
  onDeselect: () => void
}) {
  return (
    <div
      className="mt-lane"
      style={{ height: LANE_H, width: lengthSec * pxPerSec }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onDeselect() }}
      onDoubleClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onAddClipAt((e.clientX - r.left) / pxPerSec) }}
    >
      {track.clips.map((c) => (
        <ClipView
          key={c.id}
          track={track}
          clip={c}
          pxPerSec={pxPerSec}
          selected={selected?.trackId === track.id && selected?.clipId === c.id}
          onSelect={() => onSelectClip(track.id, c.id)}
          onBeginDrag={(mode, e) => onBeginDrag(mode, track.id, c.id, e)}
        />
      ))}
    </div>
  )
}

/* ============================ clip ============================ */
function drawWave(canvas: HTMLCanvasElement | null, peaks: Float32Array | null, cssW: number, cssH: number, color: string) {
  if (!canvas) return
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.floor(cssW * dpr))
  canvas.height = Math.max(1, Math.floor(cssH * dpr))
  canvas.style.width = `${cssW}px`
  canvas.style.height = `${cssH}px`
  const ctx = canvas.getContext('2d'); if (!ctx) return
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, cssW, cssH)
  const mid = cssH / 2
  if (!peaks) { ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(0, mid - 1, cssW, 2); return }
  const buckets = peaks.length / 2
  ctx.fillStyle = color
  for (let x = 0; x < cssW; x++) {
    const bi = Math.min(buckets - 1, Math.floor((x / cssW) * buckets))
    const mn = peaks[bi * 2], mx = peaks[bi * 2 + 1]
    const y1 = mid - mx * mid * 0.9
    const y2 = mid - mn * mid * 0.9
    ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1))
  }
}

function ClipView({ track, clip, pxPerSec, selected, onSelect, onBeginDrag }: {
  track: Track
  clip: Clip
  pxPerSec: number
  selected: boolean
  onSelect: () => void
  onBeginDrag: (mode: 'move' | 'trim-l' | 'trim-r', e: ReactPointerEvent) => void
}) {
  const { t: lt } = useI18n()
  const meta = TRACK_META[track.type]
  const left = clip.startSec * pxPerSec
  const width = Math.max(10, clip.durationSec * pxPerSec)
  const waveH = LANE_H - 26
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => { drawWave(canvasRef.current, clip.peaks, width, waveH, meta.color) }, [clip.peaks, width, waveH, meta.color, selected])
  return (
    <div
      className={`mt-clip${selected ? ' is-sel' : ''}`}
      style={{ left, width, height: LANE_H - 8, borderColor: meta.color, background: `${meta.color}1f` }}
      onPointerDown={(e) => { e.stopPropagation(); onSelect(); onBeginDrag('move', e) }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="mt-clip__label" style={{ color: meta.color }}>
        {meta.icon} {lt(trackText(track.type).label)}{clip.peaks ? '' : ' …'}
        {track.type === 'voice' && isTextMissing(clip) && (
          <span className="mt-clip__missing" title={lt('No text in the working language — this clip stays silent')}> ⚠ {lt('no text')}</span>
        )}
      </div>
      <canvas ref={canvasRef} className="mt-clip__wave" />
      <div className="mt-clip__h mt-clip__h--l" onPointerDown={(e) => { e.stopPropagation(); onSelect(); onBeginDrag('trim-l', e) }} />
      <div className="mt-clip__h mt-clip__h--r" onPointerDown={(e) => { e.stopPropagation(); onSelect(); onBeginDrag('trim-r', e) }} />
    </div>
  )
}

/* ============================ inspector ============================ */
/** Click/double-click the shown value → type the exact number → Enter/blur.
    Accepts "83", "0.83", "83%", "3:45", "-6 dB", commas as decimals. */
function EditableValue({ display, commit, title }: { display: string; commit: (raw: string) => void; title?: string }) {
  const { t: lt } = useI18n()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  if (!editing) {
    return (
      <b
        className="mt-editable"
        title={title ?? lt('Click to type the exact value')}
        onClick={() => { setText(display); setEditing(true) }}
      >{display}</b>
    )
  }
  const done = (apply: boolean) => { if (apply) commit(text); setEditing(false) }
  return (
    <input
      className="mt-editable__input"
      autoFocus
      value={text}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false) }}
      onBlur={() => done(true)}
    />
  )
}

/* ------------------------------------------------------------- clip EQ UI */

const EQ_BAND_LABEL: Record<EqBand['type'], string> = {
  highpass: 'Low cut',
  lowshelf: 'Low shelf',
  peaking: 'Bell',
  highshelf: 'High shelf',
  lowpass: 'High cut',
}

const EQ_CURVE_FREQS = (() => {
  const out: number[] = []
  for (let i = 0; i <= 72; i++) out.push(20 * Math.pow(10, (i / 72) * 3)) // 20 Hz → 20 kHz log
  return out
})()

function EqCurve({ eq }: { eq: ClipEq }) {
  const W = 252
  const H = 76
  const RANGE = 18 // ±18 dB vertical
  const mags = eqMagnitudeDb(eq, EQ_CURVE_FREQS)
  const pts = mags.map((db, i) => {
    const x = (i / (EQ_CURVE_FREQS.length - 1)) * W
    const y = H / 2 - (Math.max(-RANGE, Math.min(RANGE, db)) / RANGE) * (H / 2 - 4)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return (
    <svg className="mt-eq__curve" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} aria-hidden="true">
      <line x1="0" y1={H / 2} x2={W} y2={H / 2} className="mt-eq__zero" />
      {[100, 1000, 10000].map((f) => {
        const x = (Math.log10(f / 20) / 3) * W
        return <line key={f} x1={x} y1="0" x2={x} y2={H} className="mt-eq__grid" />
      })}
      <polyline points={pts.join(' ')} className="mt-eq__line" fill="none" />
    </svg>
  )
}

function ClipEqPanel({ clip, onEq }: { clip: Clip; onEq: (eq: ClipEq) => void }) {
  const eq = clip.eq ?? defaultClipEq()
  const active = clip.eq !== undefined && !eqIsTransparent(clip.eq)
  const [open, setOpen] = useState(active)
  const { t: lt } = useI18n()

  function patchBand(i: number, patch: Partial<EqBand>) {
    onEq({ ...eq, bands: eq.bands.map((b, k) => (k === i ? { ...b, ...patch } : b)) })
  }

  return (
    <div className="mt-eq">
      <div className="mt-eq__head">
        <button className="mt-eq__toggle" onClick={() => setOpen((o) => !o)}>
          {open ? '▾' : '▸'} {active ? lt('Equalizer · on') : lt('Equalizer')}
        </button>
        {clip.eq && (
          <button
            className="mt-eq__reset"
            title={lt('Reset all bands')}
            onClick={() => onEq(defaultClipEq())}
          >
            {lt('Reset EQ')}
          </button>
        )}
      </div>
      {open && (
        <>
          <EqCurve eq={eq} />
          {eq.bands.map((b, i) => (
            <div key={i} className={`mt-eq__band${b.enabled ? '' : ' is-off'}`}>
              <button
                className={`mt-eq__on${b.enabled ? ' is-on' : ''}`}
                title={b.enabled ? lt('Band on — click to bypass') : lt('Band off — click to enable')}
                onClick={() => patchBand(i, { enabled: !b.enabled })}
              >
                {lt(EQ_BAND_LABEL[b.type])}
              </button>
              <label className="mt-eq__f" title={lt('Frequency (click the number to type it)')}>
                <input
                  type="range" min={0} max={1} step={0.002}
                  value={Math.log10(b.freqHz / 20) / 3}
                  onChange={(e) => patchBand(i, { freqHz: Math.round(20 * Math.pow(10, +e.target.value * 3)) })}
                />
                <EditableValue
                  display={b.freqHz >= 1000 ? `${(b.freqHz / 1000).toFixed(1)}k` : `${b.freqHz}`}
                  commit={(raw) => {
                    const t = raw.trim().toLowerCase()
                    const n = parseFloat(t.replace(',', '.'))
                    if (!Number.isFinite(n)) return
                    const hz = /k/.test(t) ? n * 1000 : n
                    patchBand(i, { freqHz: Math.round(Math.min(20000, Math.max(20, hz))) })
                  }}
                  title={lt('Frequency in Hz (e.g. 250 or 2.5k)')}
                />
              </label>
              {b.type !== 'highpass' && b.type !== 'lowpass' && (
                <label className="mt-eq__g" title={lt('Gain (click the number to type it)')}>
                  <input
                    type="range" min={-18} max={18} step={0.5}
                    value={b.gainDb}
                    onChange={(e) => patchBand(i, { gainDb: +e.target.value })}
                  />
                  <EditableValue
                    display={`${b.gainDb > 0 ? '+' : ''}${b.gainDb.toFixed(1)}`}
                    commit={(raw) => { const v = parseTyped(raw, -18, 18); if (v != null) patchBand(i, { gainDb: v }) }}
                    title={lt('Gain in dB')}
                  />
                </label>
              )}
              {b.type === 'peaking' && (
                <label className="mt-eq__q" title={lt('Q — bell width (higher = narrower)')}>
                  <input
                    type="range" min={0.3} max={8} step={0.1}
                    value={b.q}
                    onChange={(e) => patchBand(i, { q: +e.target.value })}
                  />
                  <EditableValue
                    display={`Q${b.q.toFixed(1)}`}
                    commit={(raw) => { const v = parseTyped(raw, 0.3, 8); if (v != null) patchBand(i, { q: v }) }}
                    title={lt('Q (0.3–8)')}
                  />
                </label>
              )}
            </div>
          ))}
          <div className="mt-note" style={{ marginTop: 4 }}>
            {lt('EQ is baked into the clip before its loudness calibration — shaping the tone never moves the clip off its protocol layer level, and playback, waveform and the WAV export all hear it.')}
          </div>
        </>
      )}
    </div>
  )
}

/** Parse a typed value for a numeric param: unit stripping, comma decimals,
    "%"/bare-percent shorthand for 0..1 ranges, clamped to [min, max]. */
function parseTyped(raw: string, min: number, max: number): number | null {
  const t = raw.replace(',', '.').trim()
  const m = /-?\d+(?:\.\d+)?/.exec(t)
  if (!m) return null
  let v = parseFloat(m[0])
  if (/%/.test(t) && max <= 1.5) v = v / 100
  else if (max <= 1.5 && v > 1.5) v = v / 100 // typed "83" on a 0..1 param
  return Math.min(max, Math.max(min, v))
}

function Slider({ label, value, min, max, step, onChange, fmt }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt?: (v: number) => string
}) {
  return (
    <label className="mt-field">
      <span className="mt-field__lbl">
        {label}
        <EditableValue
          display={fmt ? fmt(value) : String(value)}
          commit={(raw) => { const v = parseTyped(raw, min, max); if (v != null) onChange(v) }}
        />
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    </label>
  )
}

function Inspector({ track, clip, onParam, onTiming, onGain, onDelete, ttsLabel, ttsCanRender, ttsBusy, previewBusy, ttsError, onVoiceText, onVoicePreview, onVoiceSynthesize, onVoiceChange, onEq, onDrawClip, onDrawAllMissing, drawBusy, drawMsg, workingLang }: {
  track: Track | null
  clip: Clip | null
  onParam: (patch: Partial<ClipParams>) => void
  onTiming: (patch: { startSec?: number; durationSec?: number }) => void
  onGain: (db: number) => void
  onDelete: () => void
  ttsLabel: string
  ttsCanRender: boolean
  ttsBusy: boolean
  previewBusy: boolean
  ttsError: string | null
  onVoiceText: (text: string) => void
  onVoicePreview: () => void
  onVoiceSynthesize: () => void
  onVoiceChange: (voiceId: string) => void
  onEq: (eq: ClipEq) => void
  onDrawClip: () => void
  onDrawAllMissing: () => void
  drawBusy: boolean
  drawMsg: string | null
  /** The session's working language: which text the box edits. */
  workingLang: VoiceLang
}) {
  const { t: lt } = useI18n()
  if (!track || !clip) {
    return (
      <div className="mt-inspector mt-inspector--empty">
        <span>{lt('Select a clip to edit its sound · double-click a lane to add one · drag the edges to shorten it · drag up/down to move it to another track of the same type')}</span>
      </div>
    )
  }
  const meta = TRACK_META[track.type]
  return (
    <div className="mt-inspector">
      <div className="mt-insp__head">
        <span className="mt-insp__title" style={{ color: meta.color }}>{meta.icon} {lt(trackText(track.type).label)}</span>
        <span className="mt-insp__sub">{lt(trackText(track.type).blurb)}</span>
        <button className="mt-insp__del" onClick={onDelete}>{lt('Delete the clip')}</button>
      </div>
      <div className="mt-insp__grid">
        <Slider label={lt('Clip start')} value={clip.startSec} min={0} max={1800} step={0.25} onChange={(v) => onTiming({ startSec: v })} fmt={(v) => `${v.toFixed(2)}s`} />
        <Slider label={lt('Clip length')} value={clip.durationSec} min={MIN_CLIP} max={600} step={0.25} onChange={(v) => onTiming({ durationSec: v })} fmt={(v) => `${v.toFixed(2)}s`} />
        {!clip.frozen && (
          <>
            <Slider
              label={lt('Clip volume')}
              value={clip.gainDb ?? 0}
              min={-24} max={12} step={0.5}
              onChange={onGain}
              fmt={(v) => (v === 0 ? '0 dB' : `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`)}
            />
            <div className="mt-note">
              {lt('Relative to the track fader: the track stays the layer’s level in the mix, the clip rises or falls relative to it. 0 dB = exactly the track level.')}
              {clip.calibrateDb !== undefined && ' ' + lt('It applies AFTER the protocol’s LUFS calibration.')}
            </div>
          </>
        )}
        {clip.frozen && (
          <div className="mt-note" style={{ marginTop: 6 }}>
            {lt('✂ Cut piece — its audio is frozen: move it freely, cut it again, or join it with its neighbour. Parameter and length edits don’t apply to frozen pieces.')}
          </div>
        )}
        {(clip.calibrateDb !== undefined || clip.gainDb !== undefined || (clip.fadeInSec ?? 0) > 0 || (clip.fadeOutSec ?? 0) > 0) && (
          <div className="mt-note" style={{ marginTop: 6 }}>
            {lt('📄 From the protocol Excel:')}{' '}
            {clip.calibrateDb !== undefined ? lt('normalized to {lufs} LUFS', { lufs: (ANCHOR_LUFS + clip.calibrateDb).toFixed(1) }) + ' · ' : ''}
            {lt('fades {in}s / {out}s — baked into the clip audio.', { in: clip.fadeInSec ?? 0, out: clip.fadeOutSec ?? 0 })}
          </div>
        )}
        {!clip.frozen && <ClipEqPanel clip={clip} onEq={onEq} />}
        {clip.frozen && clip.eq && (
          <div className="mt-note" style={{ marginTop: 6 }}>{lt('EQ is locked on cut pieces — the audio is frozen.')}</div>
        )}

        {track.type === 'binaural' && (() => { const p = clip.params as BinauralParams; return <>
          <Slider label={lt('Carrier')} value={p.carrierHz} min={60} max={520} step={1} onChange={(v) => onParam({ carrierHz: v })} fmt={(v) => `${v} Hz`} />
          <Slider label={lt('Beat')} value={p.beatHz} min={0.5} max={16} step={0.1} onChange={(v) => onParam({ beatHz: v })} fmt={(v) => `${v.toFixed(1)} Hz`} />
          <div className="mt-note">L {Math.round(p.carrierHz - p.beatHz / 2)} Hz · R {Math.round(p.carrierHz + p.beatHz / 2)} Hz</div>
        </> })()}

        {track.type === 'soundscape' && (() => { const p = clip.params as SoundscapeParams; return <>
          <div className="mt-seg">
            {(['lake', 'air', 'deep'] as Texture[]).map((tx) => (
              <button key={tx} className={p.texture === tx ? 'is-on' : ''} onClick={() => onParam({ texture: tx })}>{lt(tx)}</button>
            ))}
          </div>
          <Slider label={lt('Warmth')} value={p.warmth} min={200} max={2000} step={10} onChange={(v) => onParam({ warmth: v })} fmt={(v) => `${v} Hz`} />
        </> })()}

        {track.type === 'breath' && (() => { const p = clip.params as BreathParams; return <>
          <Slider label={lt('Breaths / min')} value={p.breathsPerMin} min={3} max={10} step={0.1} onChange={(v) => onParam({ breathsPerMin: v })} fmt={(v) => v.toFixed(1)} />
          <Slider label={lt('Tone')} value={p.toneHz} min={120} max={520} step={1} onChange={(v) => onParam({ toneHz: v })} fmt={(v) => `${v} Hz`} />
        </> })()}

        {track.type === 'music' && (() => { const p = clip.params as MusicParams; return <>
          <div className="mt-seg">
            {(['c', 'g', 'am', 'f', 'dm', 'em'] as Chord[]).map((ch) => (
              <button key={ch} className={p.chord === ch ? 'is-on' : ''} onClick={() => onParam({ chord: ch })}>{ch.toUpperCase()}</button>
            ))}
          </div>
          <div className="mt-note">{lt('Warm triad pad — key changes follow the protocol’s musical transitions.')}</div>
        </> })()}

        {track.type === 'bilateral' && (() => {
          const p = clip.params as BilateralParams
          const snd = resolveBilateralSound(p)
          const every = Math.max(0.5, p.everySec)
          const hold = p.holdSec ?? Math.min(snd.naturalSec, every * 0.9)
          return <>
            <div className="mt-tts__row" style={{ margin: '2px 0 6px' }}>
              <span className="mt-tts__lbl">{lt('Sound')}</span>
              <select className="mt-tts__sel" value={snd.id} onChange={(e) => onParam({ sound: e.target.value as BilateralSoundId })}>
                {(['tone', 'bell', 'whoosh'] as const).map((fam) => (
                  <optgroup key={fam} label={bilateralFamilyLabel(lt, fam)}>
                    {BILATERAL_SOUNDS.filter((s) => s.family === fam).map((s) => (
                      <option key={s.id} value={s.id}>{bilateralText(lt, s).label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <button className="mt-tts__btn" onClick={() => void auditionBilateral(snd.id)} title={lt('Listen to the whole file')}>▶</button>
            </div>
            <div className="mt-note">{lt('{blurb} · {sec} s file', { blurb: bilateralText(lt, snd).blurb, sec: snd.naturalSec.toFixed(1) })}</div>
            <Slider label={lt('Every')} value={p.everySec} min={1} max={10} step={0.5} onChange={(v) => onParam({ everySec: v })} fmt={(v) => `${v.toFixed(1)} s`} />
            <Slider label={lt('Hit length')} value={hold} min={0.2} max={12} step={0.1} onChange={(v) => onParam({ holdSec: v })} fmt={(v) => `${v.toFixed(1)} s`} />
            <Slider label={lt('Pan width')} value={p.panAmp ?? 0.8} min={0.1} max={1} step={0.05} onChange={(v) => onParam({ panAmp: v })} fmt={(v) => `±${Math.round(v * 100)}`} />
            {hold > every && <div className="mt-note">{lt('⚠ The hit lasts longer than the interval: the sides overlap. Shorten the length or widen “Every”.')}</div>}
            <div className="mt-note">
              {lt('L/R alternation at ±{amp} — the protocol’s PAT-05 stimulation.', { amp: Math.round((p.panAmp ?? 0.8) * 100) })}{' '}
              {lt('The file is cut to “Hit length” with a short fade, so even a long bell does not spill into the next hit.')}
            </div>
          </>
        })()}

        {track.type === 'sample' && (() => { const p = clip.params as SampleParams; return <>
          <div className="mt-note" style={{ marginBottom: 6 }}>
            <b>{lt('Library file:')}</b> {p.label || lt('— none —')}
          </div>
          {(p.drawTag !== undefined || p.drawPhase !== undefined) && (
            <div className="mt-tts__row" style={{ margin: '4px 0' }}>
              <button className="mt-tts__btn" disabled={drawBusy} onClick={onDrawClip} title={lt('Random draw from this clip’s pool (tag / phase)')}>
                🎲 {p.url ? lt('Redraw from pool') : lt('Draw from pool')}
              </button>
              <button className="mt-tts__btn" disabled={drawBusy} onClick={onDrawAllMissing} title={lt('Fill every silent sample clip in this project from its pool')}>
                {lt('Draw ALL missing')}
              </button>
            </div>
          )}
          {drawMsg && <div className="mt-note" style={{ marginBottom: 6 }}>{drawMsg}</div>}
          <SampleQueue params={p} clipDurationSec={clip.durationSec} />
          <SampleFilePicker
            value={p.label}
            label={sampleLoops(p) ? undefined : lt('Replace with a single track…')}
            onPick={(url, label) => onParam({ url, label, slots: undefined })}
          />
          <div className="mt-note">
            {sampleLoops(p)
              ? lt('Soundscape: the file loops over the clip length with crossfades at the joins — it is a texture, the repetition is intended.')
              : lt('Music: tracks are drawn automatically to cover the clip and play IN SEQUENCE, crossfading from one to the next; the last one is cut at the end. A track never repeats — you would hear it restart mid-clip. Picking a file here replaces the sequence with that single track.')}
            {' '}{lt('The level is the track fader on the left. Picking a file here changes ONLY this clip — the default per-phase mapping stays in the admin Audio library.')}
          </div>
        </> })()}

        {track.type === 'voice' && (() => { const p = clip.params as VoiceParams; const txt = (clip.text ?? '').trim(); const staleText = !!clip.ttsSource && clip.ttsText !== txt; const rendered = !!clip.ttsSource && !staleText; const hasText = !!txt; const voice = effectiveVoice(p); const stale = staleVoiceId(p); const remap = remappedVoice(p); return <>
          <div className="mt-tts">
            <div className="mt-tts__row">
              <span className="mt-tts__lbl">{lt('Affirmation')} · {LANG_SHORT[workingLang]}</span>
              <span className="mt-tts__eng">{rendered ? lt('voice rendered ✓') : staleText ? lt('text changed — needs re-synthesis') : lt('voice: {engine}', { engine: ttsLabel })}</span>
            </div>
            <textarea
              className="mt-tts__text"
              placeholder={lt('Write the spoken line, e.g. "Você está em segurança. Respire fundo."')}
              value={clip.text ?? ''}
              onChange={(e) => onVoiceText(e.target.value)}
              rows={2}
            />
            <div className="mt-tts__btns">
              <button
                className="mt-tts__btn"
                onClick={onVoicePreview}
                disabled={ttsBusy || previewBusy || !hasText || !ttsCanRender}
                title={ttsCanRender ? lt('Listen to this line with {voice} — clip pan and speed included', { voice: voice.name }) : lt('Without a TTS key the preview would use a system voice, not the chosen one')}
              >
                {previewBusy ? lt('Previewing…') : lt('▶ Preview — {voice}', { voice: voice.name })}
              </button>
              <button className="mt-tts__btn mt-tts__btn--go" onClick={onVoiceSynthesize} disabled={ttsBusy || !ttsCanRender || !hasText} title={ttsCanRender ? '' : lt('Set an ElevenLabs or Azure key to render real voice')}>
                {ttsBusy ? lt('Synthesizing…') : rendered ? lt('↻ Re-synthesize') : lt('✓ Synthesize into clip')}
              </button>
            </div>
            {isTextMissing(clip) && (
              <div className="mt-tts__hint mt-tts__hint--missing">
                {lt('⚠ No text in {lang} for this clip yet — it stays silent in this language. Write it here, or add it to the Excel (testo_pt) and import it again: nothing else is lost.', { lang: LANG_LABEL[workingLang] })}
              </div>
            )}
            {/* The same line in the other language, read-only: what is being
                translated, and what the other language will say. */}
            {VOICE_LANGS.filter((l) => l !== workingLang && clip.textByLang?.[l]?.trim()).map((l) => (
              <div key={l} className="mt-tts__other">
                <span>{LANG_LABEL[l]}:</span> «{clip.textByLang?.[l]}»
              </div>
            ))}
            {!ttsCanRender && <div className="mt-tts__hint">{lt('No TTS key: preview is off — the browser voice is a system voice, not the one chosen here. Add a key (🎙) to hear and render the real voice (docs/TTS_SETUP.md).')}</div>}
            {staleText && <div className="mt-tts__hint">{lt('⚠ The text changed after synthesis: the clip still holds the previous line. Re-synthesize to update it (the preview will request a new voice).')}</div>}
            {stale && (
              <div className="mt-tts__hint">
                {lt('⚠ This clip was imported with a voice that is no longer in the catalogue')} (<code>{stale}</code>). {lt('It will be spoken by {voice}.', { voice: voice.name })}{' '}
                <button className="mt-tts__btn" onClick={() => onVoiceChange('')}>{lt('Use the default')}</button>
              </div>
            )}
            {ttsError && <div className="mt-tts__err">{ttsError}</div>}
          </div>
          {remap && (
            <div className="mt-note">
              {withBold(lt('Voice {old} from the previous ElevenLabs account: {new} speaks it here, same archetype.'), { old: remap.name, new: voice.name })}{' '}
              {lt('The clip keeps the saved id — go back to the previous key and the previous voice comes back.')}{' '}
              {withBold(lt('To keep the current one, pick {voice} below.'), { voice: voice.name })}
            </div>
          )}
          <VoicePicker value={p.voiceId ?? ''} onChange={onVoiceChange} rendered={rendered} lang={workingLang} />
          <Slider label={lt('Pan')} value={p.pan} min={-1} max={1} step={0.05} onChange={(v) => onParam({ pan: v })} fmt={(v) => (v === 0 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`)} />
          <Slider label={lt('Speed')} value={p.speed ?? 1} min={0.7} max={1.4} step={0.05} onChange={(v) => onParam({ speed: v })} fmt={(v) => `×${v.toFixed(2)}`} />
          {rendered && <div className="mt-note">{lt('Pan and speed reprocess the rendered voice immediately, with no new TTS call. Speed preserves pitch (time-stretch): the voice speaks faster or slower without getting higher or lower.')}</div>}
          {!rendered && <>
            <Slider label={lt('Pulse')} value={p.pulseHz} min={0.05} max={1.2} step={0.01} onChange={(v) => onParam({ pulseHz: v })} fmt={(v) => `${v.toFixed(2)} Hz`} />
            <Slider label={lt('Tone')} value={p.toneHz} min={200} max={700} step={1} onChange={(v) => onParam({ toneHz: v })} fmt={(v) => `${v} Hz`} />
          </>}
        </> })()}
      </div>
    </div>
  )
}


/* ---- audition a bilateral file whole, straight from public/ ---- */
let bilateralAudio: HTMLAudioElement | null = null
async function auditionBilateral(id: BilateralSoundId): Promise<void> {
  bilateralAudio?.pause()
  bilateralAudio = new Audio(bilateralSoundUrl(resolveBilateralSound({ sound: id })))
  await bilateralAudio.play().catch(() => { /* autoplay policy — the click already unlocked it */ })
}

/* ---- §9 mastering on the way out ----

   Every route out of the Studio has to carry it. Only the PLAIN auto-render
   (admin/renderPlain.ts) used to: "⬇ Esporta WAV", "publish" and "attach" wrote
   the raw mixdown straight to a file or to the streaming copy, with no loudness
   normalization and — the part that bit — no true-peak limiter.

   The GL-ANX 1.1 reference render is what that produces: −14.85 LUFS against
   the −16 target, and 35 777 samples pinned at full scale in the left channel
   (7 945 runs of two or more, the longest 166 samples flat) for an inter-sample
   peak of +0.18 dBTP against a −1 dBTP ceiling. Hard clipping, on the copy
   patients stream.

   `masterizeBuffer` mutates the buffer in place; the returned string is for the
   status line. */
function masterSessionBuffer(buffer: AudioBuffer): string {
  const m = masterizeBuffer(buffer)
  const lufs = Number.isFinite(m.postLufs) ? m.postLufs.toFixed(1) : '−∞'
  return `§9: ${lufs} LUFS (target ${SESSION_TARGET_LUFS}), true peak ${m.truePeakDb.toFixed(1)} dBTP (ceiling ${SESSION_CEILING_DBTP})${m.limiterDb < -0.1 ? `, limiter ${m.limiterDb.toFixed(1)} dB` : ''}`
}

/* ---- which voice a clip is REALLY spoken in ----

   One resolver for preview, synthesis and the picker's label: the clip's own
   voice when that id is still in the catalog, otherwise the engine default.
   Everything that speaks must agree — a preview that resolves differently from
   the render is exactly the bug the POs reported. */
const voiceHint = (p: VoiceParams) => ({ archetype: p.voiceArchetype, gender: p.voiceGender, language: p.voiceLang })

/* An empty `voiceId` means "the default" — of the language the clip is spoken
   in, so a Portuguese line with no voice picked is not read by the Italian
   default. */
function effectiveVoice(p: VoiceParams): CatalogVoice {
  return resolveVoiceId(p.voiceId, voiceHint(p)).voice ?? defaultPrimary(p.voiceLang)
}

/** The voice this clip was saved with, when it came from another ElevenLabs
    account and is being served by the same archetype here. */
function remappedVoice(p: VoiceParams): KnownVoice | null {
  return resolveVoiceId(p.voiceId, voiceHint(p)).remappedFrom ?? null
}

/** An id the clip carries that NOTHING in this account can serve — neither
    the id itself nor its archetype. Imported before the roster was narrowed,
    or from an account this browser has never synced. */
function staleVoiceId(p: VoiceParams): string | null {
  return p.voiceId && !resolveVoiceId(p.voiceId, voiceHint(p)).voice ? p.voiceId : null
}

/* ---- the lines around a voice clip, for TTS request stitching ----

   ElevenLabs renders one API request per line, so by default every line is
   generated in isolation: prosody restarts, and a fragment too short to place
   in a language gets placed in the wrong one. Handing it the neighbouring lines
   fixes both.

   Neighbours are taken across the WHOLE project by time, not just within the
   clip's own lane, and that is the point: the lanes that produce short
   fragments (whisper loops, echo ostinati — "pace", "calma", "calore… sole…
   pelle") are precisely the ones whose own neighbours are equally short and
   contextless. The nearest lines anywhere in the protocol are real sentences. */
interface VoiceJob {
  trackId: string
  clipId: string
  text: string
  pan: number
  speed: number
  voiceId?: string
  startSec: number
  shape?: ClipShape
  previousText?: string
  nextText?: string
}

/* ---- which lines are too short to survive on their own ----

   A one-word request has no language to detect. "pace" is Italian and English;
   "calma" is Italian, Portuguese and Spanish. Measured: isolated fragments came
   back non-Italian on 0-of-3 takes across FIVE configurations, including
   turbo_v2_5 and flash_v2_5 with an explicit language_code=it, and v3. Spoken
   inside a sentence, the same model is right every time.

   So short lines are batched into one utterance and cut apart afterwards.
   Anything long enough to carry its own language is left alone — a sentence
   already works, and grouping it would only risk the cut. */
const JOIN_MAX_CHARS = 34
const JOIN_MAX_WORDS = 4
const JOIN_MAX_LINES = 6
const JOIN_MAX_TOTAL_CHARS = 400

function isShortLine(text: string): boolean {
  return text.length <= JOIN_MAX_CHARS && text.split(/\s+/).filter(Boolean).length <= JOIN_MAX_WORDS
}

/**
 * Partition jobs into render groups. A group of 2+ is spoken as one utterance;
 * a group of 1 is rendered on its own as before.
 *
 * Only ADJACENT short lines on the SAME lane with the SAME voice are grouped:
 * the cut has to land in real silence between neighbours, and mixing lanes or
 * voices would put unrelated material into one breath.
 */
function groupVoiceJobs(jobs: VoiceJob[], canJoin: boolean): VoiceJob[][] {
  if (!canJoin) return jobs.map((j) => [j])
  const out: VoiceJob[][] = []
  let run: VoiceJob[] = []
  let chars = 0
  const flush = () => {
    if (run.length) out.push(run)
    run = []
    chars = 0
  }
  // lane order, then time order — the order the cut relies on
  const ordered = [...jobs].sort((a, b) => (a.trackId < b.trackId ? -1 : a.trackId > b.trackId ? 1 : a.startSec - b.startSec))
  for (const j of ordered) {
    const head = run[0]
    const compatible = head !== undefined
      && head.trackId === j.trackId
      && head.voiceId === j.voiceId
      && Math.abs(head.speed - j.speed) < 0.001
      && run.length < JOIN_MAX_LINES
      && chars + j.text.length + 1 <= JOIN_MAX_TOTAL_CHARS
    if (!isShortLine(j.text)) { flush(); out.push([j]); continue }
    if (!compatible) flush()
    run.push(j)
    chars += j.text.length + 1
  }
  flush()
  return out
}

function voiceContext(tracks: Track[], clipId: string): { previousText?: string; nextText?: string } {
  const lines: { startSec: number; id: string; text: string }[] = []
  for (const t of tracks) {
    if (t.type !== 'voice') continue
    for (const c of t.clips) {
      const text = (c.text ?? '').trim()
      if (text) lines.push({ startSec: c.startSec, id: c.id, text })
    }
  }
  // stable order: clips starting together must not swap between renders, or the
  // deterministic seed stops being deterministic
  lines.sort((a, b) => a.startSec - b.startSec || a.id.localeCompare(b.id))
  const i = lines.findIndex((l) => l.id === clipId)
  if (i < 0) return {}
  return { previousText: lines[i - 1]?.text, nextText: lines[i + 1]?.text }
}

/* ---- per-clip voice picker (the built-in PO catalog, by archetype) ----
   The working language's voices come first, grouped by archetype; the other
   language's follow in one group of their own. Picking across languages is
   allowed — a PO may want it — but it is never the path of least resistance. */
function VoicePicker({ value, onChange, rendered, lang }: { value: string; onChange: (v: string) => void; rendered: boolean; lang: VoiceLang }) {
  void rendered
  const { t: lt } = useI18n()
  const res = resolveVoiceId(value, { language: lang })
  const known = !value || !!res.voice
  const others = VOICE_LANGS.filter((l) => l !== lang)
  return (
    <div className="mt-tts__row" style={{ margin: '8px 0 4px' }}>
      <span className="mt-tts__lbl">{lt('Voice')}</span>
      <select className="mt-tts__sel" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{lt('Default — {name} (engine voice)', { name: `${defaultPrimary(lang).name} · ${LANG_SHORT[voiceLangOf(defaultPrimary(lang))]}` })}</option>
        {/* an id that left the catalog stays visible instead of silently
            showing "Predefinita" while the clip still uses the old voice */}
        {!known && <option value={value}>{lt('⚠ Voice outside the catalogue — {id}', { id: value })}</option>}
        {/* the saved id is another account's, and an archetype here answers
            for it: name the stand-in rather than showing a raw id */}
        {res.remappedFrom && (
          <option value={value}>{lt('↪ {old} (other account) → {new}', { old: res.remappedFrom.name, new: res.voice?.name ?? '—' })}</option>
        )}
        {ARCHETYPES.map((a) => {
          const list = voicesByArchetype(a.id, lang)
          return list.length ? (
            <optgroup key={a.id} label={`${a.icon} ${archetypeLabel(lt, a)} · ${LANG_SHORT[lang]}`}>
              {list.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.gender})</option>)}
            </optgroup>
          ) : null
        })}
        {others.map((l) => {
          const list = ARCHETYPES.flatMap((a) => voicesByArchetype(a.id, l))
          return list.length ? (
            <optgroup key={l} label={lt('Other language — {lang}', { lang: LANG_LABEL[l] })}>
              {list.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.gender} · {LANG_SHORT[l]})</option>)}
            </optgroup>
          ) : null
        })}
      </select>
    </div>
  )
}

/* ---- library file picker for sample clips (music by phase, soundscapes) ---- */
let assetListPromise: Promise<AudioAsset[]> | null = null

/**
 * Draw memory built from the files the project ALREADY plays, so a late draw
 * or a manual re-roll can't hand back one that is in use elsewhere in the
 * protocol.
 *
 * `rerollClipId` is the clip the 🎲 button is re-rolling. Its files are the
 * ones the operator is asking to get RID of: they count like every other file
 * in use AND go on the ledger's avoid list, so the draw only returns one of
 * them again when the pool holds nothing else. Excluding that clip from the
 * ledger instead — what this used to do — made its current file the least-used
 * candidate in its own pool, so the draw handed the same file straight back
 * and the button looked broken.
 */
function projectLedger(pools: AssetPools, tracks: Track[], rerollClipId?: string): DrawLedger {
  const inUse = new Set<string>()
  const rerolling = new Set<string>()
  for (const t of tracks) {
    if (t.type !== 'sample') continue
    for (const c of t.clips) {
      // EVERY entry of a playlist counts, not just the first — otherwise a
      // redraw happily hands back a song already queued later in the protocol
      for (const s of sampleSlots(c.params as SampleParams)) {
        inUse.add(s.url)
        if (c.id === rerollClipId) rerolling.add(s.url)
      }
    }
  }
  const all: AudioAsset[] = [...pools.soundscapes, ...pools.heartbeat, ...pools.bowl]
  for (const arr of Object.values(pools.musicByPhase)) if (arr) all.push(...arr)
  const ledger = newDrawLedger()
  for (const a of all) {
    if (inUse.has(a.publicUrl)) ledger.counts.set(a.path, (ledger.counts.get(a.path) ?? 0) + 1)
    if (rerolling.has(a.publicUrl)) ledger.avoid.add(a.path)
  }
  return ledger
}

/** Lazy shared pools for late draws (a seeded project whose library wasn't
    reachable at import time — or a deliberate re-roll). */
let poolsPromise: Promise<AssetPools> | null = null
function getStudioPools(): Promise<AssetPools> {
  if (!poolsPromise) {
    if (!assetListPromise) assetListPromise = listAssets()
    poolsPromise = Promise.all([assetListPromise, loadAssetMeta()])
      .then(([assets, meta]) => buildAssetPools(assets, meta))
    poolsPromise.catch(() => { poolsPromise = null; assetListPromise = null })
  }
  return poolsPromise
}
/* ---- what a sample clip will actually play, and whether it fills the clip ---

   The phase-4 bug: a music clip drew ONE song, and since a song must not loop,
   the rest of the phase fell silent. The clip carries a queue now, drawn
   automatically — this is the readout, not an editor. The five editable gaps
   are gone: choosing songs by hand was the part that did not work, and the
   draw covers the window on its own.

   Lengths are the REAL decoded durations (shared with the render cache), not
   the byte estimate the draw uses, so the meter tells the truth about what
   will be rendered even when the estimate was off. */
function SampleQueue({ params, clipDurationSec }: {
  params: SampleParams
  clipDurationSec: number
}) {
  const { t: lt } = useI18n()
  const slots = sampleSlots(params)
  const loops = sampleLoops(params)
  const [durations, setDurations] = useState<Record<string, number>>({})
  const urlKey = slots.map((s) => s.url).join('|')

  useEffect(() => {
    let alive = true
    for (const s of slots) {
      sampleDurationSec(s.url)
        .then((d) => { if (alive) setDurations((prev) => (prev[s.url] === d ? prev : { ...prev, [s.url]: d })) })
        .catch(() => { /* unreachable file — the row shows "—" */ })
    }
    return () => { alive = false }
  }, [urlKey]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!slots.length) return null

  const known = slots.filter((s) => durations[s.url] !== undefined)
  const total = known.reduce((a, s) => a + durations[s.url], 0)
  const allKnown = known.length === slots.length
  const covered = clipDurationSec > 0 ? Math.min(100, (total / clipDurationSec) * 100) : 0
  const short = allKnown && total < clipDurationSec - 0.5
  const over = allKnown && total > clipDurationSec + 0.5

  return (
    <div style={{ margin: '6px 0 8px' }}>
      <div className="mt-tts__row" style={{ marginBottom: 4 }}>
        <span className="mt-tts__lbl">{loops ? lt('File') : lt('Tracks in sequence ({n})', { n: slots.length })}</span>
        <span className="mt-tts__eng">
          {allKnown ? lt('{total} of {clip}', { total: fmtTime(total), clip: fmtTime(clipDurationSec) }) : lt('reading durations…')}
        </span>
      </div>

      {slots.map((s, i) => (
        <div key={`${s.url}-${i}`} className="mt-tts__row" style={{ margin: '3px 0', alignItems: 'center' }}>
          {!loops && <span className="mt-tts__lbl" style={{ minWidth: 22, opacity: 0.7 }}>{i + 1}.</span>}
          <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.label}>
            {s.label || s.url.split('/').pop()}
          </span>
          <span style={{ fontSize: 11, opacity: 0.7, minWidth: 46, textAlign: 'right' }}>
            {durations[s.url] !== undefined ? fmtTime(durations[s.url]) : '—'}
          </span>
        </div>
      ))}

      {!loops && (
        <div className="mt-meter" title={lt('{total} of music for a {clip} clip', { total: fmtTime(total), clip: fmtTime(clipDurationSec) })}>
          <div
            className="mt-meter__fill"
            style={{ width: `${covered}%`, background: over ? '#C8A15E' : short ? '#C87F7F' : '#2FA98C' }}
          />
        </div>
      )}
      {!loops && allKnown && (
        <div className="mt-note" style={{ marginTop: 4 }}>
          {short && <>{withBold(lt('⚠ {time} missing: redraw 🎲, or add tracks to the phase pool.'), { time: fmtTime(clipDurationSec - total) })}</>}
          {over && <>{lt('The last track will be cut at the end of the clip.')}</>}
          {!short && !over && <>{lt('The sequence covers the clip exactly.')}</>}
        </div>
      )}
    </div>
  )
}

function SampleFilePicker({ value, onPick, label }: { value: string; onPick: (url: string, label: string) => void; label?: string }) {
  const { t: lt } = useI18n()
  const [assets, setAssets] = useState<AudioAsset[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!hasSupabaseEnv()) { setErr('Library browsing needs the Supabase env.'); setAssets([]); return }
    if (!assetListPromise) assetListPromise = listAssets()
    assetListPromise.then(setAssets).catch((e) => { assetListPromise = null; setErr((e as Error).message); setAssets([]) })
  }, [])
  if (err) return <div className="mt-note">{lt(err)}</div>
  if (!assets) return <div className="mt-note">{lt('Loading the audio library…')}</div>
  /* Every kind the library holds, in one list. The old version enumerated
     music and soundscapes by hand, so the two PO deliverables were absent from
     the dropdown even though they were sitting in Storage. */
  const groups = libraryGroups(assets)
  return (
    <div className="mt-tts__row" style={{ margin: '4px 0 8px' }}>
      <span className="mt-tts__lbl">{lt('File')}</span>
      <select
        className="mt-tts__sel"
        value=""
        onChange={(e) => {
          const a = assets.find((x) => x.path === e.target.value)
          if (a) { try { onPick(assetPublicUrl(a.path), a.name) } catch (er) { setErr((er as Error).message) } }
        }}
      >
        <option value="" disabled>{label ?? (value ? lt('Change file (now: {file})…', { file: value }) : lt('Pick a library file…'))}</option>
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.items.map((a) => <option key={a.path} value={a.path}>{a.name}</option>)}
          </optgroup>
        ))}
      </select>
    </div>
  )
}


/* ---- per-track effects drawer (metadata-driven controls) ---- */
/* ==================== track master parameters (the P button) ====================
   Every parameter of a track type in one place, applied to ALL its clips at
   once. Values that differ across clips show as "misto"; setting one levels
   every clip to it. Cut pieces keep their frozen audio and are reported. */
function TrackParamsDrawer({ track, onClose, onParam, onTrim }: {
  track: Track
  onClose: () => void
  onParam: (patch: Partial<ClipParams>) => void
  /** Relative dB nudge applied to every clip (0 = reset them all to the track level). */
  onTrim: (deltaDb: number) => void
}) {
  const { t: lt } = useI18n()
  const meta = TRACK_META[track.type]
  const live = track.clips.filter((c) => !c.frozen)
  const frozen = track.clips.length - live.length

  /** The shared value of one param across the track — plus whether clips differ. */
  function shared<T>(key: string, fallback: T): { value: T; mixed: boolean } {
    if (!live.length) return { value: fallback, mixed: false }
    const values = live.map((c) => (c.params as unknown as Record<string, unknown>)[key] as T | undefined)
    const first = values[0] ?? fallback
    return { value: first, mixed: values.some((v) => v !== values[0]) }
  }

  /** A slider bound to the whole track. */
  function TrackSlider({ label, k, fallback, min, max, step, fmt }: {
    label: string; k: string; fallback: number; min: number; max: number; step: number; fmt: (v: number) => string
  }) {
    const { value, mixed } = shared<number>(k, fallback)
    return (
      <Slider
        label={mixed ? lt('{label} · mixed', { label }) : label}
        value={value}
        min={min} max={max} step={step}
        onChange={(v) => onParam({ [k]: v } as unknown as Partial<ClipParams>)}
        fmt={fmt}
      />
    )
  }

  /** A segmented choice bound to the whole track. */
  function TrackSeg<T extends string>({ k, options, fallback, label }: { k: string; options: readonly T[]; fallback: T; label: (o: T) => string }) {
    const { value, mixed } = shared<T>(k, fallback)
    return (
      <>
        <div className="mt-seg">
          {options.map((o) => (
            <button key={o} className={!mixed && value === o ? 'is-on' : ''} onClick={() => onParam({ [k]: o } as unknown as Partial<ClipParams>)}>{label(o)}</button>
          ))}
        </div>
        {mixed && <div className="mt-note">{lt('The clips use different values — picking one applies it to all of them.')}</div>}
      </>
    )
  }

  const voiceShared = shared<string>('voiceId', '')
  const bilateralShared = shared<string>('sound', DEFAULT_BILATERAL_SOUND)

  return (
    <div className="mt-fx mt-params">
      <div className="mt-fx__head">
        <b style={{ color: meta.color }}>{meta.icon} {lt('Parameters — {name}', { name: lt(track.name) })}</b>
        <span className="mt-fx__hint">
          {lt('Applies to all {n} clips on the track at once.', { n: live.length })}
          {frozen > 0 && ' ' + (frozen === 1
            ? lt('1 cut piece keeps its frozen audio.')
            : lt('{n} cut pieces keep their frozen audio.', { n: frozen }))}
        </span>
        <button className="mt-x" onClick={onClose}>✕</button>
      </div>

      <div className="mt-params__grid">
        {live.length === 0 && <div className="mt-note">{lt('No editable clips on this track.')}</div>}

        {live.length > 0 && (() => {
          const gains = live.map((c) => c.gainDb ?? 0)
          const lo = Math.min(...gains)
          const hi = Math.max(...gains)
          const fmt = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`
          return (
            <div className="mt-trim">
              <span className="mt-trim__lbl">{lt('Clips volume')}</span>
              <span className="mt-trim__val">{lo === hi ? `${fmt(lo)} dB` : lt('from {lo} to {hi} dB', { lo: fmt(lo), hi: fmt(hi) })}</span>
              <span className="mt-trim__btns">
                <button onClick={() => onTrim(-1)} title={lt('Lower every clip by 1 dB')}>−1 dB</button>
                <button onClick={() => onTrim(-0.5)}>−0,5</button>
                <button onClick={() => onTrim(0.5)}>+0,5</button>
                <button onClick={() => onTrim(1)} title={lt('Raise every clip by 1 dB')}>+1 dB</button>
                <button onClick={() => onTrim(0)} title={lt('Return every clip to the track level')}>{lt('reset')}</button>
              </span>
              <div className="mt-note">
                {lt('Moves every clip together while keeping the differences between them (the ladder written in the Excel stays intact).')}{' '}
                {lt('The track fader still decides the layer’s level in the mix; here the clips rise or fall relative to it.')}
              </div>
            </div>
          )
        })()}

        {track.type === 'binaural' && live.length > 0 && (() => {
          const carrier = shared<number>('carrierHz', 180).value
          const beat = shared<number>('beatHz', 6).value
          return <>
            <TrackSlider label={lt('Carrier')} k="carrierHz" fallback={180} min={60} max={520} step={1} fmt={(v) => `${v} Hz`} />
            <TrackSlider label={lt('Beat')} k="beatHz" fallback={6} min={0.5} max={16} step={0.1} fmt={(v) => `${v.toFixed(1)} Hz`} />
            <div className="mt-note">L {Math.round(carrier - beat / 2)} Hz · R {Math.round(carrier + beat / 2)} Hz</div>
          </>
        })()}

        {track.type === 'soundscape' && live.length > 0 && <>
          <TrackSeg k="texture" options={['lake', 'air', 'deep'] as const} fallback={'lake' as Texture} label={(o) => lt(o)} />
          <TrackSlider label={lt('Warmth')} k="warmth" fallback={640} min={200} max={2000} step={10} fmt={(v) => `${v} Hz`} />
        </>}

        {track.type === 'breath' && live.length > 0 && <>
          <TrackSlider label={lt('Breaths / min')} k="breathsPerMin" fallback={5.5} min={3} max={10} step={0.1} fmt={(v) => v.toFixed(1)} />
          <TrackSlider label={lt('Tone')} k="toneHz" fallback={300} min={120} max={520} step={1} fmt={(v) => `${v} Hz`} />
        </>}

        {track.type === 'music' && live.length > 0 && <>
          <TrackSeg k="chord" options={['c', 'g', 'am', 'f', 'dm', 'em'] as const} fallback={'c' as Chord} label={(o) => o.toUpperCase()} />
          <div className="mt-note">{lt('Sets the same chord across the whole track — useful to bring a pad back to a single key.')}</div>
        </>}

        {track.type === 'bilateral' && live.length > 0 && <>
          <div className="mt-tts__row" style={{ margin: '2px 0 6px' }}>
            <span className="mt-tts__lbl">{lt('Sound')}</span>
            <select
              className="mt-tts__sel"
              value={bilateralShared.mixed ? '' : bilateralShared.value}
              onChange={(e) => e.target.value && onParam({ sound: e.target.value as BilateralSoundId } as unknown as Partial<ClipParams>)}
            >
              {bilateralShared.mixed && <option value="">{lt('— mixed —')}</option>}
              {(['tone', 'bell', 'whoosh'] as const).map((fam) => (
                <optgroup key={fam} label={bilateralFamilyLabel(lt, fam)}>
                  {BILATERAL_SOUNDS.filter((s) => s.family === fam).map((s) => (
                    <option key={s.id} value={s.id}>{bilateralText(lt, s).label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <TrackSlider label={lt('Every')} k="everySec" fallback={4} min={1} max={10} step={0.5} fmt={(v) => `${v.toFixed(1)} s`} />
          <TrackSlider label={lt('Hit length')} k="holdSec" fallback={3.6} min={0.2} max={12} step={0.1} fmt={(v) => `${v.toFixed(1)} s`} />
          <TrackSlider label={lt('Pan width')} k="panAmp" fallback={0.8} min={0.1} max={1} step={0.05} fmt={(v) => `±${Math.round(v * 100)}`} />
        </>}

        {track.type === 'voice' && live.length > 0 && <>
          <div className="mt-tts__row" style={{ margin: '2px 0 6px' }}>
            <span className="mt-tts__lbl">{voiceShared.mixed ? lt('{label} · mixed', { label: lt('Voice') }) : lt('Voice')}</span>
            <select
              className="mt-tts__sel"
              value={voiceShared.mixed ? '' : voiceShared.value}
              onChange={(e) => onParam({ voiceId: e.target.value || undefined } as unknown as Partial<ClipParams>)}
            >
              <option value="">{lt('Default — {name} (engine voice)', { name: defaultPrimary().name })}</option>
              {ARCHETYPES.map((a) => {
                const list = voicesByArchetype(a.id)
                return list.length ? (
                  <optgroup key={a.id} label={`${a.icon} ${archetypeLabel(lt, a)}`}>
                    {list.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.gender})</option>)}
                  </optgroup>
                ) : null
              })}
            </select>
          </div>
          <TrackSlider label={lt('Pan')} k="pan" fallback={0} min={-1} max={1} step={0.05} fmt={(v) => (v === 0 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`)} />
          <TrackSlider label={lt('Speed')} k="speed" fallback={1} min={0.7} max={1.4} step={0.05} fmt={(v) => `×${v.toFixed(2)}`} />
          <TrackSlider label={lt('Pulse')} k="pulseHz" fallback={0.2} min={0.05} max={1.2} step={0.01} fmt={(v) => `${v.toFixed(2)} Hz`} />
          <TrackSlider label={lt('Tone')} k="toneHz" fallback={420} min={200} max={700} step={1} fmt={(v) => `${v} Hz`} />
          <div className="mt-note">
            {lt('Changing the voice here affects every line on the track. Clips already synthesized are regenerated at the next synthesis; pan and speed reapply immediately, with no new TTS calls.')}
          </div>
        </>}

        {track.type === 'sample' && live.length > 0 && (() => {
          const tag = shared<string | undefined>('drawTag', undefined)
          const phase = shared<number | undefined>('drawPhase', undefined)
          return <>
            <div className="mt-note">
              {lt('Audio-file clips point to one file each: the pool draw and the file choice stay in each clip’s inspector, so a track can alternate several ambiences.')}
            </div>
            <div className="mt-note" style={{ marginTop: 6 }}>
              {lt('Track pool: {pool} · {n} clips without a file.', {
                pool: tag.mixed || phase.mixed ? lt('mixed') : tag.value ? `tag "${tag.value}"` : phase.value ? lt('phase {n}', { n: phase.value }) : lt('none'),
                n: live.filter((c) => !(c.params as SampleParams).url).length,
              })}
            </div>
          </>
        })()}
      </div>
    </div>
  )
}

function FxDrawer({ track, busy, onClose, onToggle, onParam }: {
  track: Track
  busy: boolean
  onClose: () => void
  onToggle: (kind: TrackEffect['kind'], enabled: boolean) => void
  onParam: (kind: TrackEffect['kind'], key: string, v: number) => void
}) {
  const { t: lt } = useI18n()
  const effects = track.effects ?? defaultEffects()
  return (
    <div className="mt-fx">
      <div className="mt-fx__head">
        <b>FX — {lt(track.name)}</b>
        {busy && <span className="mt-fx__busy">{lt('processing the chorus…')}</span>}
        <span className="mt-fx__hint">{lt('Effects apply both when listening and in the export. The harmonizer processes each clip (a short wait); the others are immediate.')}</span>
        <button className="mt-x" onClick={onClose}>✕</button>
      </div>
      <div className="mt-fx__grid">
        {EFFECTS_META.map((meta) => {
          const fx = effects.find((e) => e.kind === meta.kind)!
          return (
            <div key={meta.kind} className={`mt-fx__card${fx.enabled ? ' is-on' : ''}`}>
              <label className="mt-fx__title">
                <input type="checkbox" checked={fx.enabled} onChange={(e) => onToggle(meta.kind, e.target.checked)} />
                <span>{meta.icon} {lt(meta.label)}</span>
              </label>
              <div className="mt-fx__blurb">{lt(meta.blurb)}</div>
              {fx.enabled && meta.params.map((p) => (
                <div key={p.key} className="mt-fx__param">
                  <span className="mt-fx__plbl">{lt(p.label)}</span>
                  <input
                    type="range" min={p.min} max={p.max} step={p.step}
                    value={fx.params[p.key] ?? p.min}
                    onChange={(e) => onParam(meta.kind, p.key, +e.target.value)}
                  />
                  <span className="mt-fx__pval">
                    <EditableValue
                      display={lt(p.fmt(fx.params[p.key] ?? p.min))}
                      commit={(raw) => { const v = parseTyped(raw, p.min, p.max); if (v != null) onParam(meta.kind, p.key, v) }}
                    />
                  </span>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
