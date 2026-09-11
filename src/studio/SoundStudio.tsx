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
import { getTtsProvider, ttsLanguage, type TtsSpan } from '../tts'
import { VoiceEnginePanel } from '../tts/VoiceEnginePanel'
import { masterizeBuffer, SESSION_CEILING_DBTP, SESSION_TARGET_LUFS } from './mastering'
import { audioBufferToWav } from '../lib/wav'
import { ARCHETYPES, defaultPrimary, voiceById, voicesByArchetype, type CatalogVoice } from '../tts/voiceCatalog'
import { defaultEffects, effectsKey, EFFECTS_META, harmonizeBuffer, type TrackEffect } from './effects'
import { libraryGroups, listAssets, assetPublicUrl, type AudioAsset } from '../admin/assets'
import { buildAssetPools, drawMusicPlaylist, drawSoundscape, loadAssetMeta, mulberry32, newDrawLedger, type AssetPools, type DrawLedger } from '../admin/assetPools'
import { hasSupabaseEnv } from '../auth/supabaseClient'
import { peekStudioSeed, releaseStudioSeed, setStudioProject, type StudioAttachTarget } from '../compose/handoff'
import { persistenceNote, saveProtocolVerified } from '../admin/publish'
import { getProtocol } from '../data/protocols'
import { entryForStudioSave } from '../admin/publishPlain'
import { setReturnToProtocol } from '../admin/workscreenReturn'
import { lookup as ttsLookup, store as ttsStore, fetchStored as ttsFetch, ttsPath as ttsPathFor, type TtsKey } from '../tts/ttsStore'
import type { Duration } from '../types/domain'
import type { CatalogProtocol } from '../data/catalog'
import type { StudioProject } from '../compose/types'
import { useDataProvider } from '../data/provider'
import type { SeedTrack } from '../compose/types'
import { BrandLogo } from '../components/Brand'

/* ---- layout constants ---- */
const LANE_H = 104
const RULER_H = 30
const HEADER_W = 254
const MIN_CLIP = 1
/**
 * Breath between two spoken lines on the same lane, in seconds.
 *
 * A synthesized line is as long as the voice actually took, which is rarely
 * the length the sheet planned for it: a slower speed, a longer take or a
 * different voice pushes the end of one clip past the start of the next and
 * the two are heard talking over each other. The de-overlap pass slides the
 * later line down to here, so a pushed line lands just after the one before
 * it instead of on top of it.
 */
const VOICE_GAP = 0.15

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
    })),
  }
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
export function SoundStudio() {
  const [wide, setWide] = useState(() => window.innerWidth >= 1024)
  useEffect(() => {
    const f = () => setWide(window.innerWidth >= 1024)
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])
  if (!wide) return <StudioTooSmall />
  return <StudioDesktop />
}

function StudioTooSmall() {
  return (
    <div className="mt-gate">
      <div className="mt-gate__card">
        <div className="mt-gate__icon">🎛️</div>
        <h1>Il Sound Studio è solo per desktop</h1>
        <p>L’editor multitraccia richiede uno schermo più ampio. Apri Good Loop su laptop o desktop per comporre e renderizzare le sessioni.</p>
        <a className="mt-gate__back" href="#">← Back to the app</a>
      </div>
    </div>
  )
}

/* ============================ main editor ============================ */
function StudioDesktop() {
  const handoff = useMemo(() => {
    const h = peekStudioSeed()
    if (!h) return null
    const end = Math.max(120, ...h.tracks.flatMap((t) => t.clips.map((c) => c.startSec + c.durationSec)))
    return {
      tracks: h.tracks.map(seedTrackToTrack),
      name: h.name,
      attach: h.attach ?? null,
      lengthSec: h.lengthSec ?? Math.ceil(end),
      masterGain: h.masterGain,
      fadeInSec: h.fadeInSec ?? 0,
      fadeOutSec: h.fadeOutSec ?? 0,
      returnTo: h.returnTo ?? null,
    }
  }, [])
  const [tracks, setTracks] = useState<Track[]>(() => handoff?.tracks ?? makeSeed())
  const [projectName, setProjectName] = useState(handoff?.name ?? 'GL-ANX 1.1 — Calm and Inner Safety')
  const [masterGain, setMasterGain] = useState(handoff?.masterGain ?? 0.82)
  const [lengthSec, setLengthSec] = useState(handoff?.lengthSec ?? 120)
  const [pxPerSec, setPxPerSec] = useState(() => (handoff ? Math.max(0.6, Math.min(7, 1100 / (handoff.lengthSec || 120))) : 7))
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
      savedAt: Date.now(),
      tracks: tracks.map((t) => ({
        type: t.type,
        name: t.name,
        volume: t.volume,
        channel: t.channel,
        effects: t.effects,
        baseLufs: t.baseLufs,
        clips: t.clips.map((c) => ({
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
        })),
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
    const code = window.prompt('Codice del protocollo da creare o aggiornare (es. GL-ANX 1.1)')?.trim()
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
        `Salvato in ${target.code} · ${target.duration} min — riaprendolo ritrovi esattamente questa sessione.` +
        (draft
          ? ' È nel catalogo come BOZZA: non è attivo finché non pubblichi la durata dalla schermata del protocollo.'
          : '') +
        (persistenceNote() ?? ''),
      )
    } catch (e) {
      setAttachMsg(`Salvataggio non riuscito: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  function goBack() {
    if (dirty && attachTarget && !window.confirm('Ci sono modifiche non salvate nel protocollo. Uscire comunque?')) return
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
        setStudioProject(toStudioProject(), attachTarget ?? undefined, returnTo ?? undefined)
      } catch {
        /* a project too large for sessionStorage keeps working in memory */
      }
    }, 800)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, projectName, lengthSec, masterGain, sessionFades.inSec, sessionFades.outSec])

  /**
   * Bring saved voice renders back, once, when a project opens.
   *
   * The bytes are in Storage and the clip carries the path, so this is a
   * download and a decode — no provider call and no credits. A path that no
   * longer resolves simply leaves the clip unrendered, which is the state it
   * would have been in anyway.
   */
  const hydrated = useRef(false)
  useEffect(() => {
    if (hydrated.current) return
    hydrated.current = true
    const jobs: { trackId: string; clip: Clip }[] = []
    for (const t of tracksRef.current) {
      if (t.type !== 'voice') continue
      for (const c of t.clips) if (c.ttsPath && !c.ttsSource) jobs.push({ trackId: t.id, clip: c })
    }
    if (!jobs.length) return
    let alive = true
    void (async () => {
      for (const { trackId, clip } of jobs) {
        try {
          const player = playerRef.current
          if (!player) return
          const bytes = await ttsFetch(clip.ttsPath as string)
          if (!alive || !bytes) continue
          const decoded = await player.decode(bytes)
          if (!alive) continue
          const vp = clip.params as VoiceParams
          const maxDur = Math.max(MIN_CLIP, lengthSecRef.current - clip.startSec)
          let buf = await bakeVoiceBuffer(decoded, vp.pan, maxDur, vp.speed ?? 1)
          buf = shapeClipBuffer(buf, {
            eq: clip.eq, calibrateDb: clip.calibrateDb, gainDb: clip.gainDb,
            fadeInSec: clip.fadeInSec, fadeOutSec: clip.fadeOutSec,
          })
          if (!alive) continue
          setClipBuffer(trackId, clip.id, buf, { ttsSource: decoded, durationSec: buf.duration })
        } catch {
          /* a render that will not come back just leaves the clip unrendered */
        }
      }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
          setDrawMsg(`No library file matches the tag "${p.drawTag}" — upload one in the Asset Library (or add the tag to an existing file there).`)
          return
        }
        patchClipParams(trackId, clipId, { url: drawn.asset.publicUrl, label: `${drawn.asset.name} · tag "${p.drawTag}"`, slots: undefined })
        setDrawMsg(drawn.asset.publicUrl === p.url
          ? `"${drawn.asset.name}" is the ONLY file in the pool for the tag "${p.drawTag}" — nothing else to draw. Upload another, or tag one in the Asset Library.`
          : `Drew "${drawn.asset.name}" — ${drawn.how}.`)
        return
      }
      // music: draw a PLAYLIST long enough for the window, not one song to loop
      const drawn = drawMusicPlaylist(pools, p.drawPhase ?? 1, cl.durationSec, MAX_SAMPLE_SLOTS, rnd, ledger)
      if (!drawn || !drawn.assets.length) {
        setDrawMsg(`The F${p.drawPhase} music pool is empty — upload files to assets/music/f${p.drawPhase} in the Asset Library.`)
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
        ? `The F${p.drawPhase} pool has nothing this clip is not already playing — add files to assets/music/f${p.drawPhase} to get a different draw.`
        : `${picked.length === 1 ? 'Drew' : `Drew ${picked.length} brani`} "${drawn.assets.map((a) => a.name).join('" → "')}" — ${drawn.how}.${drawn.short ? ' La sequenza è più corta della clip: aggiungi un brano.' : ''}`)
    } catch (e) {
      setDrawMsg(`Library unreachable: ${(e as Error).message}`)
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
      setDrawMsg(`Drew files for ${filled} clip${filled === 1 ? '' : 's'}${empty ? ` · ${empty} still empty (their pools have no files — check the Asset Library folders/tags)` : ''}.`)
    } catch (e) {
      setDrawMsg(`Library unreachable: ${(e as Error).message}`)
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
        params: { ...(c.params as VoiceParams), voiceId: voiceId || undefined },
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
      const lang = ttsLanguage()
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
    if (!text) { setTtsError('Scrivi prima un’affermazione.'); return }
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
        lang: ttsLanguage(),
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
      separateVoiceClips(trackId)
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
    if (!provider.canRender) { setTtsError(`${provider.label} is preview-only — set ElevenLabs keys (🎙) first.`); return }
    const jobs: VoiceJob[] = []
    for (const t of tracksRef.current) {
      if (t.type !== 'voice') continue
      for (const c of t.clips) {
        const text = (c.text ?? '').trim()
        const vp = c.params as VoiceParams
        if (text && !c.ttsSource && !c.frozen) jobs.push({ trackId: t.id, clipId: c.id, text, pan: vp.pan, speed: vp.speed ?? 1, voiceId: effectiveVoice(vp).id, startSec: c.startSec, ...voiceContext(tracksRef.current, c.id), shape: (c.eq && !eqIsTransparent(c.eq)) || c.calibrateDb !== undefined || c.gainDb !== undefined || c.fadeInSec !== undefined || c.fadeOutSec !== undefined ? { eq: c.eq, calibrateDb: c.calibrateDb, gainDb: c.gainDb, fadeInSec: c.fadeInSec, fadeOutSec: c.fadeOutSec } : undefined })
      }
    }
    if (!jobs.length) { setTtsError('Nessuna clip vocale con testo da sintetizzare.'); return }
    setTtsError(null)
    const lang = ttsLanguage()
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
          setSynthAll(`Sintesi del blocco (${group.length} frasi) ${done + 1}/${total}…`)
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
          setSynthAll(`Sintesi delle voci ${done + 1}/${total}…`)
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
        setTtsError(`Voce a ${fmtTime(group[0].startSec)}: ${(e as Error).message}`)
      } finally {
        for (const j of group) ttsInFlight.current.delete(j.clipId)
      }
    }
    setSynthAll(null)
    // every lane at once: each take is now its real length, so lines that grew
    // past their window are slid clear of the one before them
    separateVoiceClips()
    if (!failed) setTtsError(null)
  }, [setClipBuffer])

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
    if (!selected) { setEditMsg('Seleziona prima una clip, porta il cursore al suo interno, poi Taglia.'); return }
    const tr = tracksRef.current.find((t) => t.id === selected.trackId)
    const cl = tr?.clips.find((c) => c.id === selected.clipId)
    if (!tr || !cl) return
    const t0 = cl.startSec, t1 = cl.startSec + cl.durationSec
    if (playhead < t0 + 0.2 || playhead > t1 - 0.2) { setEditMsg('Porta il cursore DENTRO la clip selezionata (non sul bordo), poi Taglia.'); return }
    if (!cl.buffer) { setEditMsg('Questa clip è ancora in render — aspetta la forma d’onda, poi Taglia.'); return }
    const cutAt = playhead - t0
    const bufA = sliceBuffer(cl.buffer, 0, cutAt)
    const bufB = sliceBuffer(cl.buffer, cutAt, cl.durationSec)
    const mk = (start: number, buf: AudioBuffer, text?: string): Clip => ({
      id: uid(), startSec: start, durationSec: buf.duration,
      params: { ...(cl.params as object) } as ClipParams,
      buffer: buf, peaks: computePeaks(buf, peakBuckets(buf.duration)),
      text, frozen: true,
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
    if (!selected) { setEditMsg('Seleziona la clip di sinistra della coppia da unire.'); return }
    const tr = tracksRef.current.find((t) => t.id === selected.trackId)
    if (!tr) return
    const sorted = [...tr.clips].sort((x, y) => x.startSec - y.startSec)
    const i = sorted.findIndex((c) => c.id === selected.clipId)
    const cl = sorted[i]
    const nx = sorted[i + 1]
    if (!cl || !nx) { setEditMsg('Nessuna clip dopo quella selezionata su questa traccia — niente da unire.'); return }
    if (!cl.buffer || !nx.buffer) { setEditMsg('Entrambe le clip devono avere l’audio renderizzato prima di unirle (aspetta le forme d’onda).'); return }
    const gap = Math.max(0, nx.startSec - (cl.startSec + cl.durationSec))
    if (gap > 60) { setEditMsg('Queste clip distano più di 60 s — avvicinale prima di unirle.'); return }
    const bufA = sliceBuffer(cl.buffer, 0, cl.durationSec)
    const bufB = sliceBuffer(nx.buffer, 0, nx.durationSec)
    const buf = concatBuffers(bufA, bufB, gap)
    const merged: Clip = {
      id: uid(), startSec: cl.startSec, durationSec: buf.duration,
      params: { ...(cl.params as object) } as ClipParams,
      buffer: buf, peaks: computePeaks(buf, peakBuckets(buf.duration)),
      text: cl.text ?? nx.text, frozen: true,
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
   * Stop synthesized voices from talking over each other.
   *
   * The Excel plans a window per line; the TTS delivers whatever the sentence
   * actually takes. Once a take runs long — a slower `speed`, a longer voice,
   * an edited line — its clip's real duration reaches into the next clip's
   * window and the mix plays both at once. This walks each voice lane in time
   * order and slides every line that starts at or before the previous one ends
   * down to `VOICE_GAP` after it, cascading. Nothing is re-rendered: a baked
   * voice buffer does not depend on where the clip sits.
   *
   * Frozen pieces (a cut/glued clip) that merely BUTT-JOIN are left alone —
   * that adjacency is one utterance split in two, not a scheduling conflict,
   * and prising it apart would open a hole inside a word.
   *
   * `trackId` limits the pass to one lane; omitted, every voice lane is swept.
   */
  function separateVoiceClips(trackId?: string) {
    const EPS = 1e-3
    let moved = 0
    let overflow = false
    setTracks((prev) => prev.map((t) => {
      if (t.type !== 'voice' || (trackId && t.id !== trackId)) return t
      const order = [...t.clips].sort((a, b) => a.startSec - b.startSec)
      const starts = new Map<string, number>()
      let last: { end: number; frozen?: boolean } | null = null
      for (const c of order) {
        let start = c.startSec
        if (last && last.end >= start - EPS) {
          const butt = c.frozen && last.frozen && Math.abs(last.end - start) <= EPS
          if (!butt) {
            start = last.end + VOICE_GAP
            starts.set(c.id, start)
            moved++
          }
        }
        last = { end: start + c.durationSec, frozen: c.frozen }
      }
      if (!starts.size) return t
      if (last && last.end > lengthSecRef.current + EPS) overflow = true
      return { ...t, clips: t.clips.map((c) => (starts.has(c.id) ? { ...c, startSec: starts.get(c.id) as number } : c)) }
    }))
    if (moved) {
      setEditMsg(`${moved} clip vocale${moved === 1 ? '' : 'i'} spostata${moved === 1 ? '' : 'e'}: la voce sintetizzata era più lunga della finestra e si sovrapponeva alla successiva.${overflow ? ' ⚠ L’ultima ora supera la durata della sessione — allunga la sessione o accorcia una frase.' : ''}`)
    }
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
      setEditMsg('Tutte le clip di questa traccia hanno l’audio congelato (pezzi tagliati) — i parametri non si applicano.')
      return
    }
    setTracks((prev) => prev.map((t) => (t.id !== trackId ? t : {
      ...t,
      clips: t.clips.map((c) => (c.frozen ? c : { ...c, params: { ...c.params, ...patch } as ClipParams })),
    })))
    for (const c of targets) scheduleRender(trackId, c.id)
    const frozen = track.clips.length - targets.length
    setEditMsg(frozen > 0
      ? `Applicato a ${targets.length} clip · ${frozen} pezzo${frozen === 1 ? '' : 'i'} tagliato${frozen === 1 ? '' : 'i'} salta${frozen === 1 ? '' : 'no'} (audio congelato).`
      : null)
  }
  /** Per-clip volume trim, in dB RELATIVE to the track fader. It is baked into
      the clip's buffer (like the PLAIN Excel's volume_db), so the track keeps
      owning the layer's level in the mix and the clip only rides above or
      below it — the hierarchy stays intact, nothing is bypassed. */
  function patchClipGain(trackId: string, clipId: string, gainDb: number) {
    const cl = tracksRef.current.find((t) => t.id === trackId)?.clips.find((c) => c.id === clipId)
    if (cl?.frozen) {
      setEditMsg('I pezzi tagliati hanno l’audio congelato — il volume si cambia prima di tagliare, oppure riunendo le parti.')
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
      setEditMsg('Cut pieces have frozen audio — move them freely, or cut again / glue to change their length.')
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
          <button className="mt-tbtn" onClick={stopT} title="Stop / torna all’inizio">⏹</button>
          <button className="mt-tbtn mt-tbtn--play" onClick={playing ? pause : play} title={playing ? 'Pausa' : 'Riproduci'}>{playing ? '⏸' : '▶'}</button>
          <span className="mt-time">
            <EditableValue
              display={fmtTime(playhead)}
              title="Clicca per digitare un tempo (es. 3:45 o 225)"
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
        <button className={`mt-tbtn${voiceSetupOpen ? ' is-on' : ''}`} onClick={() => setVoiceSetupOpen((v) => !v)} title="Motore vocale (chiavi TTS)">
          {ttsInfo.canRender ? '🎙' : '🎙!'}
        </button>
        <button
          className="mt-tbtn mt-tbtn--wide"
          onClick={() => void synthesizeAllVoices()}
          disabled={!!synthAll}
          title="Sintetizza ogni clip vocale che ha testo e non è ancora stata renderizzata (un render TTS per battuta unica)"
        >
          {synthAll ?? '♪ Tutte le voci'}
        </button>
        <button className="mt-tbtn mt-tbtn--wide" onClick={cutAtPlayhead} disabled={!selected} title="Taglia in due la clip selezionata al cursore">✂ Taglia</button>
        <button className="mt-tbtn mt-tbtn--wide" onClick={glueWithNext} disabled={!selected} title="Unisce la clip selezionata alla successiva sulla stessa traccia (lo spazio diventa silenzio)">🩹 Unisci</button>
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
          <span>durata</span>
          <input type="number" min={10} max={1800} value={lengthSec} onChange={(e) => setLengthSec(clamp(Math.round(+e.target.value || 10), 10, 1800))} />
          <span>s</span>
        </div>
        <div className="mt-addwrap">
          <button className="mt-add" onClick={() => setAddOpen((v) => !v)}>＋ Traccia ▾</button>
          {addOpen && (
            <div className="mt-addmenu">
              {(Object.keys(TRACK_META) as TrackType[]).map((tp) => (
                <button key={tp} onClick={() => addTrack(tp)}><span>{TRACK_META[tp].icon}</span> {TRACK_META[tp].label}<em>{TRACK_META[tp].blurb}</em></button>
              ))}
            </div>
          )}
        </div>
        <button className="mt-export" onClick={exportWav} disabled={exporting}>{exporting ? 'Render in corso…' : '⬇ Esporta WAV'}</button>
        {
          <button
            className={`mt-export${dirty ? ' is-dirty' : ''}`}
            onClick={() => void onSave()}
            disabled={saving}
            title="Salva tutte le modifiche dentro il protocollo — riaprendolo ritrovi questa sessione"
          >
            {saving ? 'Salvataggio…' : dirty ? '💾 Salva •' : '💾 Salva'}
          </button>
        }
        {/* Pubblica and Solo audio used to live here. Publishing is one act
            with one home — the protocol workscreen — and having a second door
            into it from the Studio meant two code paths that could disagree
            about what a published protocol looks like. The Studio saves; the
            workscreen publishes. */}
        <button className="mt-back" onClick={goBack} title={returnTo ? 'Torna alla schermata precedente' : 'Esci dallo studio'}>
          ← Indietro
        </button>
      </header>

      {voiceSetupOpen && (
        <div className="mt-voicesetup">
          <VoiceEnginePanel onChanged={() => setTtsTick((n) => n + 1)} />
        </div>
      )}
      {attachMsg && <div className="mt-voicesetup" style={{ fontSize: 12.5 }}>{attachMsg}</div>}

      <div className="mt-hint">🎧 Use headphones — the binaural beat lives in the L/R difference.</div>

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
          {tracks.length === 0 && <div className="mt-empty">Nessuna traccia. Usa ＋ Traccia.</div>}
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
  const meta = TRACK_META[track.type]
  const ch = track.channel ?? 'C'
  const fxOn = (track.effects ?? []).filter((e) => e.enabled).length
  return (
    <div className="mt-head" style={{ height: LANE_H, borderLeftColor: meta.color }}>
      <div className="mt-head__top">
        <span className="mt-head__icon">{meta.icon}</span>
        <span className="mt-head__name">{track.name}</span>
        <button className={`mt-fxbtn${fxOn ? ' is-on' : ''}`} onClick={onFx} title="Effetti della traccia (armonizzatore · eco · riverbero · saturazione · filtro)">
          FX{fxOn ? ` ${fxOn}` : ''}
        </button>
        <button className="mt-x" onClick={onDelete} title="Rimuovi la traccia">✕</button>
      </div>
      <div className="mt-head__row">
        <button className={`mt-mini${track.muted ? ' is-m' : ''}`} onClick={onToggleMute} title="Muto">M</button>
        <button className={`mt-mini${track.soloed ? ' is-s' : ''}`} onClick={onToggleSolo} title="Solo">S</button>
        <span className="mt-chan" title="Canale della traccia — l’intera traccia suona a sinistra / centro / destra (in ascolto e nell’export)">
          {(['L', 'C', 'R'] as TrackChannel[]).map((c) => (
            <button key={c} className={`mt-chan__b${ch === c ? ' is-on' : ''}`} onClick={() => onChannel(c)}>{c}</button>
          ))}
        </span>
        <button
          className={`mt-mini mt-mini--p${paramsOpen ? ' is-p' : ''}`}
          onClick={onParams}
          title="Parametri della traccia — cambia un valore una volta sola per tutte le clip"
        >
          P
        </button>
        <span style={{ flex: 1 }} />
        <button className="mt-addclip" onClick={onAddClip} title="Aggiungi una clip al cursore">＋</button>
      </div>
      {track.baseLufs !== undefined ? (
        <div className="mt-head__vol" title="Loudness target della traccia in LUFS (il linguaggio di mix del protocollo) — scorri per ±0,5 LU">
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
              title="Clicca per digitare il target in LUFS (es. -22)"
            />
          </span>
        </div>
      ) : (
        <div className="mt-head__vol" title="Livello della traccia in dB rispetto al mix — scorri per passi fini di ±0,5 dB">
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
              title="Clicca per digitare il livello in dB (es. -12)"
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
      <div className="mt-clip__label" style={{ color: meta.color }}>{meta.icon} {meta.label}{clip.peaks ? '' : ' …'}</div>
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
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  if (!editing) {
    return (
      <b
        className="mt-editable"
        title={title ?? 'Click to type the exact value'}
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

  function patchBand(i: number, patch: Partial<EqBand>) {
    onEq({ ...eq, bands: eq.bands.map((b, k) => (k === i ? { ...b, ...patch } : b)) })
  }

  return (
    <div className="mt-eq">
      <div className="mt-eq__head">
        <button className="mt-eq__toggle" onClick={() => setOpen((o) => !o)}>
          {open ? '▾' : '▸'} Equalizer{active ? ' · on' : ''}
        </button>
        {clip.eq && (
          <button
            className="mt-eq__reset"
            title="Azzera tutte le bande"
            onClick={() => onEq(defaultClipEq())}
          >
            Reset
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
                title={b.enabled ? 'Band on — click to bypass' : 'Band off — click to enable'}
                onClick={() => patchBand(i, { enabled: !b.enabled })}
              >
                {EQ_BAND_LABEL[b.type]}
              </button>
              <label className="mt-eq__f" title="Frequenza (clicca il numero per digitarlo)">
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
                  title="Frequenza in Hz (es. 250 o 2.5k)"
                />
              </label>
              {b.type !== 'highpass' && b.type !== 'lowpass' && (
                <label className="mt-eq__g" title="Guadagno (clicca il numero per digitarlo)">
                  <input
                    type="range" min={-18} max={18} step={0.5}
                    value={b.gainDb}
                    onChange={(e) => patchBand(i, { gainDb: +e.target.value })}
                  />
                  <EditableValue
                    display={`${b.gainDb > 0 ? '+' : ''}${b.gainDb.toFixed(1)}`}
                    commit={(raw) => { const v = parseTyped(raw, -18, 18); if (v != null) patchBand(i, { gainDb: v }) }}
                    title="Guadagno in dB"
                  />
                </label>
              )}
              {b.type === 'peaking' && (
                <label className="mt-eq__q" title="Q — larghezza della campana (più alto = più stretta)">
                  <input
                    type="range" min={0.3} max={8} step={0.1}
                    value={b.q}
                    onChange={(e) => patchBand(i, { q: +e.target.value })}
                  />
                  <EditableValue
                    display={`Q${b.q.toFixed(1)}`}
                    commit={(raw) => { const v = parseTyped(raw, 0.3, 8); if (v != null) patchBand(i, { q: v }) }}
                    title="Q (0,3–8)"
                  />
                </label>
              )}
            </div>
          ))}
          <div className="mt-note" style={{ marginTop: 4 }}>
            EQ is baked into the clip before its loudness calibration — shaping the tone never moves the clip off its
            protocol layer level, and playback, waveform and the WAV export all hear it.
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

function Inspector({ track, clip, onParam, onTiming, onGain, onDelete, ttsLabel, ttsCanRender, ttsBusy, previewBusy, ttsError, onVoiceText, onVoicePreview, onVoiceSynthesize, onVoiceChange, onEq, onDrawClip, onDrawAllMissing, drawBusy, drawMsg }: {
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
}) {
  if (!track || !clip) {
    return (
      <div className="mt-inspector mt-inspector--empty">
        <span>Seleziona una clip per modificarne il suono · doppio clic su una corsia per aggiungerne una · trascina i bordi per accorciarla · trascina su/giù per spostarla su un’altra traccia dello stesso tipo</span>
      </div>
    )
  }
  const meta = TRACK_META[track.type]
  return (
    <div className="mt-inspector">
      <div className="mt-insp__head">
        <span className="mt-insp__title" style={{ color: meta.color }}>{meta.icon} {meta.label}</span>
        <span className="mt-insp__sub">{meta.blurb}</span>
        <button className="mt-insp__del" onClick={onDelete}>Elimina la clip</button>
      </div>
      <div className="mt-insp__grid">
        <Slider label="Start" value={clip.startSec} min={0} max={1800} step={0.25} onChange={(v) => onTiming({ startSec: v })} fmt={(v) => `${v.toFixed(2)}s`} />
        <Slider label="Length" value={clip.durationSec} min={MIN_CLIP} max={600} step={0.25} onChange={(v) => onTiming({ durationSec: v })} fmt={(v) => `${v.toFixed(2)}s`} />
        {!clip.frozen && (
          <>
            <Slider
              label="Volume clip"
              value={clip.gainDb ?? 0}
              min={-24} max={12} step={0.5}
              onChange={onGain}
              fmt={(v) => (v === 0 ? '0 dB' : `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`)}
            />
            <div className="mt-note">
              Relativo al fader della traccia: la traccia resta il livello del layer nel mix, la clip sale o scende
              rispetto a quello. 0 dB = esattamente il livello della traccia.
              {clip.calibrateDb !== undefined && ' Si applica DOPO la calibrazione LUFS del protocollo.'}
            </div>
          </>
        )}
        {clip.frozen && (
          <div className="mt-note" style={{ marginTop: 6 }}>
            ✂ Cut piece — its audio is frozen: move it freely, cut it again, or glue it with its neighbor.
            Parameter and length edits don't apply to frozen pieces.
          </div>
        )}
        {(clip.calibrateDb !== undefined || clip.gainDb !== undefined || (clip.fadeInSec ?? 0) > 0 || (clip.fadeOutSec ?? 0) > 0) && (
          <div className="mt-note" style={{ marginTop: 6 }}>
            📄 Dall’Excel del protocollo: {clip.calibrateDb !== undefined ? `normalizzata a ${(ANCHOR_LUFS + clip.calibrateDb).toFixed(1)} LUFS · ` : ''}
            dissolvenze {clip.fadeInSec ?? 0}s / {clip.fadeOutSec ?? 0}s — impresse nell’audio della clip.
          </div>
        )}
        {!clip.frozen && <ClipEqPanel clip={clip} onEq={onEq} />}
        {clip.frozen && clip.eq && (
          <div className="mt-note" style={{ marginTop: 6 }}>L’EQ è bloccato sui frammenti tagliati — l’audio è congelato.</div>
        )}

        {track.type === 'binaural' && (() => { const p = clip.params as BinauralParams; return <>
          <Slider label="Carrier" value={p.carrierHz} min={60} max={520} step={1} onChange={(v) => onParam({ carrierHz: v })} fmt={(v) => `${v} Hz`} />
          <Slider label="Beat" value={p.beatHz} min={0.5} max={16} step={0.1} onChange={(v) => onParam({ beatHz: v })} fmt={(v) => `${v.toFixed(1)} Hz`} />
          <div className="mt-note">L {Math.round(p.carrierHz - p.beatHz / 2)} Hz · R {Math.round(p.carrierHz + p.beatHz / 2)} Hz</div>
        </> })()}

        {track.type === 'soundscape' && (() => { const p = clip.params as SoundscapeParams; return <>
          <div className="mt-seg">
            {(['lake', 'air', 'deep'] as Texture[]).map((tx) => (
              <button key={tx} className={p.texture === tx ? 'is-on' : ''} onClick={() => onParam({ texture: tx })}>{tx}</button>
            ))}
          </div>
          <Slider label="Warmth" value={p.warmth} min={200} max={2000} step={10} onChange={(v) => onParam({ warmth: v })} fmt={(v) => `${v} Hz`} />
        </> })()}

        {track.type === 'breath' && (() => { const p = clip.params as BreathParams; return <>
          <Slider label="Breaths / min" value={p.breathsPerMin} min={3} max={10} step={0.1} onChange={(v) => onParam({ breathsPerMin: v })} fmt={(v) => v.toFixed(1)} />
          <Slider label="Tone" value={p.toneHz} min={120} max={520} step={1} onChange={(v) => onParam({ toneHz: v })} fmt={(v) => `${v} Hz`} />
        </> })()}

        {track.type === 'music' && (() => { const p = clip.params as MusicParams; return <>
          <div className="mt-seg">
            {(['c', 'g', 'am', 'f', 'dm', 'em'] as Chord[]).map((ch) => (
              <button key={ch} className={p.chord === ch ? 'is-on' : ''} onClick={() => onParam({ chord: ch })}>{ch.toUpperCase()}</button>
            ))}
          </div>
          <div className="mt-note">Pad in triade calda — i cambi di tonalità seguono le transizioni musicali del protocollo.</div>
        </> })()}

        {track.type === 'bilateral' && (() => {
          const p = clip.params as BilateralParams
          const snd = resolveBilateralSound(p)
          const every = Math.max(0.5, p.everySec)
          const hold = p.holdSec ?? Math.min(snd.naturalSec, every * 0.9)
          return <>
            <div className="mt-tts__row" style={{ margin: '2px 0 6px' }}>
              <span className="mt-tts__lbl">Suono</span>
              <select className="mt-tts__sel" value={snd.id} onChange={(e) => onParam({ sound: e.target.value as BilateralSoundId })}>
                {(['tone', 'bell', 'whoosh'] as const).map((fam) => (
                  <optgroup key={fam} label={BILATERAL_FAMILY_LABEL[fam]}>
                    {BILATERAL_SOUNDS.filter((s) => s.family === fam).map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <button className="mt-tts__btn" onClick={() => void auditionBilateral(snd.id)} title="Ascolta il file per intero">▶</button>
            </div>
            <div className="mt-note">{snd.blurb} · file da {snd.naturalSec.toFixed(1)} s</div>
            <Slider label="Ogni" value={p.everySec} min={1} max={10} step={0.5} onChange={(v) => onParam({ everySec: v })} fmt={(v) => `${v.toFixed(1)} s`} />
            <Slider label="Durata colpo" value={hold} min={0.2} max={12} step={0.1} onChange={(v) => onParam({ holdSec: v })} fmt={(v) => `${v.toFixed(1)} s`} />
            <Slider label="Ampiezza pan" value={p.panAmp ?? 0.8} min={0.1} max={1} step={0.05} onChange={(v) => onParam({ panAmp: v })} fmt={(v) => `±${Math.round(v * 100)}`} />
            {hold > every && <div className="mt-note">⚠ Il colpo dura più dell’intervallo: i lati si sovrappongono. Accorcia la durata o allarga “Ogni”.</div>}
            <div className="mt-note">
              Alternanza L/R a ±{Math.round((p.panAmp ?? 0.8) * 100)} — la stimolazione PAT-05 del protocollo.
              Il file viene tagliato a “Durata colpo” con una breve dissolvenza, così anche una campana lunga non invade il colpo successivo.
            </div>
          </>
        })()}

        {track.type === 'sample' && (() => { const p = clip.params as SampleParams; return <>
          <div className="mt-note" style={{ marginBottom: 6 }}>
            <b>File di libreria:</b> {p.label || '— none —'}
          </div>
          {(p.drawTag !== undefined || p.drawPhase !== undefined) && (
            <div className="mt-tts__row" style={{ margin: '4px 0' }}>
              <button className="mt-tts__btn" disabled={drawBusy} onClick={onDrawClip} title="Sorteggio casuale dal pool di questa clip (tag / fase)">
                🎲 {p.url ? 'Redraw from pool' : 'Draw from pool'}
              </button>
              <button className="mt-tts__btn" disabled={drawBusy} onClick={onDrawAllMissing} title="Riempi dal suo pool ogni clip campione muta di questo progetto">
                Draw ALL missing
              </button>
            </div>
          )}
          {drawMsg && <div className="mt-note" style={{ marginBottom: 6 }}>{drawMsg}</div>}
          <SampleQueue params={p} clipDurationSec={clip.durationSec} />
          <SampleFilePicker
            value={p.label}
            label={sampleLoops(p) ? undefined : 'Sostituisci con un solo brano…'}
            onPick={(url, label) => onParam({ url, label, slots: undefined })}
          />
          <div className="mt-note">
            {sampleLoops(p)
              ? 'Paesaggio sonoro: il file va in loop sulla durata della clip con crossfade sulle giunzioni — è una texture, la ripetizione è voluta.'
              : 'Musica: i brani sono sorteggiati automaticamente per coprire la clip e suonano IN SEQUENZA, con crossfade fra l’uno e l’altro; l’ultimo viene tagliato alla fine. Un brano non si ripete mai — si sentirebbe ricominciare a metà clip. Scegliendo un file qui la sequenza viene sostituita da quel solo brano.'}
            {' '}Il livello è il fader della traccia a sinistra. Scegliere un file qui cambia SOLO questa clip — la mappatura predefinita per fase resta nella Libreria audio dell’amministrazione.
          </div>
        </> })()}

        {track.type === 'voice' && (() => { const p = clip.params as VoiceParams; const txt = (clip.text ?? '').trim(); const staleText = !!clip.ttsSource && clip.ttsText !== txt; const rendered = !!clip.ttsSource && !staleText; const hasText = !!txt; const voice = effectiveVoice(p); const stale = staleVoiceId(p); return <>
          <div className="mt-tts">
            <div className="mt-tts__row">
              <span className="mt-tts__lbl">Affermazione</span>
              <span className="mt-tts__eng">{rendered ? 'voce renderizzata ✓' : staleText ? 'testo modificato — da risintetizzare' : `voce: ${ttsLabel}`}</span>
            </div>
            <textarea
              className="mt-tts__text"
              placeholder={'Scrivi la battuta parlata, es. "Você está em segurança. Respire fundo."'}
              value={clip.text ?? ''}
              onChange={(e) => onVoiceText(e.target.value)}
              rows={2}
            />
            <div className="mt-tts__btns">
              <button
                className="mt-tts__btn"
                onClick={onVoicePreview}
                disabled={ttsBusy || previewBusy || !hasText || !ttsCanRender}
                title={ttsCanRender ? `Ascolta questa battuta con ${voice.name} — pan e velocità della clip inclusi` : 'Senza chiave TTS l’anteprima userebbe una voce di sistema, non quella scelta'}
              >
                {previewBusy ? 'Anteprima…' : `▶ Anteprima — ${voice.name}`}
              </button>
              <button className="mt-tts__btn mt-tts__btn--go" onClick={onVoiceSynthesize} disabled={ttsBusy || !ttsCanRender || !hasText} title={ttsCanRender ? '' : 'Set an ElevenLabs or Azure key to render real voice'}>
                {ttsBusy ? 'Synthesizing…' : rendered ? '↻ Re-synthesize' : '✓ Synthesize into clip'}
              </button>
            </div>
            {!ttsCanRender && <div className="mt-tts__hint">Nessuna chiave TTS: l’anteprima è disattivata — la voce del browser è una voce di sistema, non quella scelta qui. Aggiungi una chiave (🎙) per ascoltare e renderizzare la voce reale (docs/TTS_SETUP.md).</div>}
            {staleText && <div className="mt-tts__hint">⚠ Il testo è cambiato dopo la sintesi: la clip contiene ancora la battuta precedente. Risintetizza per aggiornarla (l’anteprima richiederà una nuova voce).</div>}
            {stale && (
              <div className="mt-tts__hint">
                ⚠ Questa clip è stata importata con una voce che non è più nel catalogo (<code>{stale}</code>). Verrà parlata da {voice.name}.{' '}
                <button className="mt-tts__btn" onClick={() => onVoiceChange('')}>Usa la predefinita</button>
              </div>
            )}
            {ttsError && <div className="mt-tts__err">{ttsError}</div>}
          </div>
          <VoicePicker value={p.voiceId ?? ''} onChange={onVoiceChange} rendered={rendered} />
          <Slider label="Pan" value={p.pan} min={-1} max={1} step={0.05} onChange={(v) => onParam({ pan: v })} fmt={(v) => (v === 0 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`)} />
          <Slider label="Speed" value={p.speed ?? 1} min={0.7} max={1.4} step={0.05} onChange={(v) => onParam({ speed: v })} fmt={(v) => `×${v.toFixed(2)}`} />
          {rendered && <div className="mt-note">Panning e velocità rielaborano subito la voce già renderizzata, senza una nuova chiamata TTS. La velocità preserva l’intonazione (time-stretch): la voce parla più veloce o più lenta senza diventare più acuta o più grave.</div>}
          {!rendered && <>
            <Slider label="Pulse" value={p.pulseHz} min={0.05} max={1.2} step={0.01} onChange={(v) => onParam({ pulseHz: v })} fmt={(v) => `${v.toFixed(2)} Hz`} />
            <Slider label="Tone" value={p.toneHz} min={200} max={700} step={1} onChange={(v) => onParam({ toneHz: v })} fmt={(v) => `${v} Hz`} />
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
function effectiveVoice(p: VoiceParams): CatalogVoice {
  return (p.voiceId ? voiceById(p.voiceId) : undefined) ?? defaultPrimary()
}

/** An id the clip still carries but the catalog no longer offers (imported
    before the roster was narrowed to the POs' voices). */
function staleVoiceId(p: VoiceParams): string | null {
  return p.voiceId && !voiceById(p.voiceId) ? p.voiceId : null
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

/* ---- per-clip voice picker (the built-in PO catalog, by archetype) ---- */
function VoicePicker({ value, onChange, rendered }: { value: string; onChange: (v: string) => void; rendered: boolean }) {
  void rendered
  const known = !value || !!voiceById(value)
  return (
    <div className="mt-tts__row" style={{ margin: '8px 0 4px' }}>
      <span className="mt-tts__lbl">Voce</span>
      <select className="mt-tts__sel" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Predefinita — {defaultPrimary().name} (voce del motore)</option>
        {/* an id that left the catalog stays visible instead of silently
            showing "Predefinita" while the clip still uses the old voice */}
        {!known && <option value={value}>⚠ Voce fuori catalogo — {value}</option>}
        {ARCHETYPES.map((a) => {
          const list = voicesByArchetype(a.id)
          return list.length ? (
            <optgroup key={a.id} label={`${a.icon} ${a.label}`}>
              {list.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.gender})</option>)}
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
        <span className="mt-tts__lbl">{loops ? 'File' : `Brani in sequenza (${slots.length})`}</span>
        <span className="mt-tts__eng">
          {allKnown ? `${fmtTime(total)} su ${fmtTime(clipDurationSec)}` : 'lettura durate…'}
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
        <div className="mt-meter" title={`${fmtTime(total)} di musica per una clip di ${fmtTime(clipDurationSec)}`}>
          <div
            className="mt-meter__fill"
            style={{ width: `${covered}%`, background: over ? '#C8A15E' : short ? '#C87F7F' : '#2FA98C' }}
          />
        </div>
      )}
      {!loops && allKnown && (
        <div className="mt-note" style={{ marginTop: 4 }}>
          {short && <>⚠ Mancano <b>{fmtTime(clipDurationSec - total)}</b>: rilancia il sorteggio 🎲, oppure aggiungi brani al pool della fase.</>}
          {over && <>L’ultimo brano verrà tagliato alla fine della clip.</>}
          {!short && !over && <>La sequenza copre esattamente la clip.</>}
        </div>
      )}
    </div>
  )
}

function SampleFilePicker({ value, onPick, label }: { value: string; onPick: (url: string, label: string) => void; label?: string }) {
  const [assets, setAssets] = useState<AudioAsset[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!hasSupabaseEnv()) { setErr('Library browsing needs the Supabase env.'); setAssets([]); return }
    if (!assetListPromise) assetListPromise = listAssets()
    assetListPromise.then(setAssets).catch((e) => { assetListPromise = null; setErr((e as Error).message); setAssets([]) })
  }, [])
  if (err) return <div className="mt-note">{err}</div>
  if (!assets) return <div className="mt-note">Caricamento della libreria audio…</div>
  /* Every kind the library holds, in one list. The old version enumerated
     music and soundscapes by hand, so the two PO deliverables were absent from
     the dropdown even though they were sitting in Storage. */
  const groups = libraryGroups(assets)
  return (
    <div className="mt-tts__row" style={{ margin: '4px 0 8px' }}>
      <span className="mt-tts__lbl">File</span>
      <select
        className="mt-tts__sel"
        value=""
        onChange={(e) => {
          const a = assets.find((x) => x.path === e.target.value)
          if (a) { try { onPick(assetPublicUrl(a.path), a.name) } catch (er) { setErr((er as Error).message) } }
        }}
      >
        <option value="" disabled>{label ?? (value ? `Change file (now: ${value})…` : 'Pick a library file…')}</option>
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
        label={mixed ? `${label} · misto` : label}
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
        {mixed && <div className="mt-note">Le clip usano valori diversi — sceglierne uno lo applica a tutte.</div>}
      </>
    )
  }

  const voiceShared = shared<string>('voiceId', '')
  const bilateralShared = shared<string>('sound', DEFAULT_BILATERAL_SOUND)

  return (
    <div className="mt-fx mt-params">
      <div className="mt-fx__head">
        <b style={{ color: meta.color }}>{meta.icon} Parametri — {track.name}</b>
        <span className="mt-fx__hint">
          Vale per tutte le {live.length} clip della traccia in una volta sola.
          {frozen > 0 && ` ${frozen} pezzo${frozen === 1 ? '' : 'i'} tagliato${frozen === 1 ? '' : 'i'} resta${frozen === 1 ? '' : 'no'} con l’audio congelato.`}
        </span>
        <button className="mt-x" onClick={onClose}>✕</button>
      </div>

      <div className="mt-params__grid">
        {live.length === 0 && <div className="mt-note">Nessuna clip modificabile su questa traccia.</div>}

        {live.length > 0 && (() => {
          const gains = live.map((c) => c.gainDb ?? 0)
          const lo = Math.min(...gains)
          const hi = Math.max(...gains)
          const fmt = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`
          return (
            <div className="mt-trim">
              <span className="mt-trim__lbl">Volume delle clip</span>
              <span className="mt-trim__val">{lo === hi ? `${fmt(lo)} dB` : `da ${fmt(lo)} a ${fmt(hi)} dB`}</span>
              <span className="mt-trim__btns">
                <button onClick={() => onTrim(-1)} title="Abbassa ogni clip di 1 dB">−1 dB</button>
                <button onClick={() => onTrim(-0.5)}>−0,5</button>
                <button onClick={() => onTrim(0.5)}>+0,5</button>
                <button onClick={() => onTrim(1)} title="Alza ogni clip di 1 dB">+1 dB</button>
                <button onClick={() => onTrim(0)} title="Riporta ogni clip al livello della traccia">azzera</button>
              </span>
              <div className="mt-note">
                Sposta tutte le clip insieme mantenendo le differenze fra loro (la scala scritta nell’Excel resta intatta).
                Il fader della traccia continua a decidere il livello del layer nel mix; qui le clip salgono o scendono rispetto a quello.
              </div>
            </div>
          )
        })()}

        {track.type === 'binaural' && live.length > 0 && (() => {
          const carrier = shared<number>('carrierHz', 180).value
          const beat = shared<number>('beatHz', 6).value
          return <>
            <TrackSlider label="Portante" k="carrierHz" fallback={180} min={60} max={520} step={1} fmt={(v) => `${v} Hz`} />
            <TrackSlider label="Battimento" k="beatHz" fallback={6} min={0.5} max={16} step={0.1} fmt={(v) => `${v.toFixed(1)} Hz`} />
            <div className="mt-note">L {Math.round(carrier - beat / 2)} Hz · R {Math.round(carrier + beat / 2)} Hz</div>
          </>
        })()}

        {track.type === 'soundscape' && live.length > 0 && <>
          <TrackSeg k="texture" options={['lake', 'air', 'deep'] as const} fallback={'lake' as Texture} label={(o) => o} />
          <TrackSlider label="Calore" k="warmth" fallback={640} min={200} max={2000} step={10} fmt={(v) => `${v} Hz`} />
        </>}

        {track.type === 'breath' && live.length > 0 && <>
          <TrackSlider label="Respiri / min" k="breathsPerMin" fallback={5.5} min={3} max={10} step={0.1} fmt={(v) => v.toFixed(1)} />
          <TrackSlider label="Tono" k="toneHz" fallback={300} min={120} max={520} step={1} fmt={(v) => `${v} Hz`} />
        </>}

        {track.type === 'music' && live.length > 0 && <>
          <TrackSeg k="chord" options={['c', 'g', 'am', 'f', 'dm', 'em'] as const} fallback={'c' as Chord} label={(o) => o.toUpperCase()} />
          <div className="mt-note">Imposta lo stesso accordo su tutta la traccia — utile per riportare un pad a una tonalità unica.</div>
        </>}

        {track.type === 'bilateral' && live.length > 0 && <>
          <div className="mt-tts__row" style={{ margin: '2px 0 6px' }}>
            <span className="mt-tts__lbl">Suono</span>
            <select
              className="mt-tts__sel"
              value={bilateralShared.mixed ? '' : bilateralShared.value}
              onChange={(e) => e.target.value && onParam({ sound: e.target.value as BilateralSoundId } as unknown as Partial<ClipParams>)}
            >
              {bilateralShared.mixed && <option value="">— misto —</option>}
              {(['tone', 'bell', 'whoosh'] as const).map((fam) => (
                <optgroup key={fam} label={BILATERAL_FAMILY_LABEL[fam]}>
                  {BILATERAL_SOUNDS.filter((s) => s.family === fam).map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <TrackSlider label="Ogni" k="everySec" fallback={4} min={1} max={10} step={0.5} fmt={(v) => `${v.toFixed(1)} s`} />
          <TrackSlider label="Durata colpo" k="holdSec" fallback={3.6} min={0.2} max={12} step={0.1} fmt={(v) => `${v.toFixed(1)} s`} />
          <TrackSlider label="Ampiezza pan" k="panAmp" fallback={0.8} min={0.1} max={1} step={0.05} fmt={(v) => `±${Math.round(v * 100)}`} />
        </>}

        {track.type === 'voice' && live.length > 0 && <>
          <div className="mt-tts__row" style={{ margin: '2px 0 6px' }}>
            <span className="mt-tts__lbl">Voce{voiceShared.mixed ? ' · misto' : ''}</span>
            <select
              className="mt-tts__sel"
              value={voiceShared.mixed ? '' : voiceShared.value}
              onChange={(e) => onParam({ voiceId: e.target.value || undefined } as unknown as Partial<ClipParams>)}
            >
              <option value="">Predefinita — {defaultPrimary().name} (voce del motore)</option>
              {ARCHETYPES.map((a) => {
                const list = voicesByArchetype(a.id)
                return list.length ? (
                  <optgroup key={a.id} label={`${a.icon} ${a.label}`}>
                    {list.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.gender})</option>)}
                  </optgroup>
                ) : null
              })}
            </select>
          </div>
          <TrackSlider label="Pan" k="pan" fallback={0} min={-1} max={1} step={0.05} fmt={(v) => (v === 0 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`)} />
          <TrackSlider label="Velocità" k="speed" fallback={1} min={0.7} max={1.4} step={0.05} fmt={(v) => `×${v.toFixed(2)}`} />
          <TrackSlider label="Pulsazione" k="pulseHz" fallback={0.2} min={0.05} max={1.2} step={0.01} fmt={(v) => `${v.toFixed(2)} Hz`} />
          <TrackSlider label="Tono" k="toneHz" fallback={420} min={200} max={700} step={1} fmt={(v) => `${v} Hz`} />
          <div className="mt-note">
            Cambiare voce qui riguarda tutte le battute della traccia. Le clip già sintetizzate vengono
            rigenerate alla prossima sintesi; pan e velocità si riapplicano subito, senza nuove chiamate TTS.
          </div>
        </>}

        {track.type === 'sample' && live.length > 0 && (() => {
          const tag = shared<string | undefined>('drawTag', undefined)
          const phase = shared<number | undefined>('drawPhase', undefined)
          return <>
            <div className="mt-note">
              Le clip file audio puntano a un file ciascuna: il sorteggio dal pool e la scelta del file restano
              nell’ispettore della singola clip, così una traccia può alternare più ambienti.
            </div>
            <div className="mt-note" style={{ marginTop: 6 }}>
              Pool della traccia: {tag.mixed || phase.mixed ? 'misto' : tag.value ? `tag "${tag.value}"` : phase.value ? `fase ${phase.value}` : 'nessuno'} ·
              {' '}{live.filter((c) => !(c.params as SampleParams).url).length} clip senza file.
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
  const effects = track.effects ?? defaultEffects()
  return (
    <div className="mt-fx">
      <div className="mt-fx__head">
        <b>FX — {track.name}</b>
        {busy && <span className="mt-fx__busy">elaborazione del coro…</span>}
        <span className="mt-fx__hint">Gli effetti valgono sia in ascolto sia nell’export. L’armonizzatore elabora ogni clip (breve attesa); gli altri sono immediati.</span>
        <button className="mt-x" onClick={onClose}>✕</button>
      </div>
      <div className="mt-fx__grid">
        {EFFECTS_META.map((meta) => {
          const fx = effects.find((e) => e.kind === meta.kind)!
          return (
            <div key={meta.kind} className={`mt-fx__card${fx.enabled ? ' is-on' : ''}`}>
              <label className="mt-fx__title">
                <input type="checkbox" checked={fx.enabled} onChange={(e) => onToggle(meta.kind, e.target.checked)} />
                <span>{meta.icon} {meta.label}</span>
              </label>
              <div className="mt-fx__blurb">{meta.blurb}</div>
              {fx.enabled && meta.params.map((p) => (
                <div key={p.key} className="mt-fx__param">
                  <span className="mt-fx__plbl">{p.label}</span>
                  <input
                    type="range" min={p.min} max={p.max} step={p.step}
                    value={fx.params[p.key] ?? p.min}
                    onChange={(e) => onParam(meta.kind, p.key, +e.target.value)}
                  />
                  <span className="mt-fx__pval">
                    <EditableValue
                      display={p.fmt(fx.params[p.key] ?? p.min)}
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
