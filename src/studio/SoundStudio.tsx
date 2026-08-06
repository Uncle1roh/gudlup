import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  MultitrackPlayer,
  renderClipBuffer,
  renderMixdown,
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
  type BilateralTimbre,
  BILATERAL_TIMBRES,
  type Chord,
} from './multitrack'
import { getTtsProvider } from '../tts'
import { VoiceEnginePanel } from '../tts/VoiceEnginePanel'
import { ARCHETYPES, defaultPrimary, voicesByArchetype } from '../tts/voiceCatalog'
import { defaultEffects, effectsKey, EFFECTS_META, harmonizeBuffer, type TrackEffect } from './effects'
import { groupSoundscapes, listAssets, assetPublicUrl, PHASE_KEYS, type AudioAsset } from '../admin/assets'
import { buildAssetPools, drawMusic, drawSoundscape, loadAssetMeta, mulberry32, type AssetPools } from '../admin/assetPools'
import { hasSupabaseEnv } from '../auth/supabaseClient'
import { takeStudioSeed, type StudioAttachTarget } from '../compose/handoff'
import { useDataProvider } from '../data/provider'
import { attachRenderedAudio } from '../admin/attachAudio'
import type { SeedTrack } from '../compose/types'

/* ---- layout constants ---- */
const LANE_H = 104
const RULER_H = 30
const HEADER_W = 254
const MIN_CLIP = 1

/* ---- model ---- */
interface Clip {
  id: string
  startSec: number
  durationSec: number
  params: ClipParams
  buffer: AudioBuffer | null
  peaks: Float32Array | null
  text?: string
  ttsSource?: AudioBuffer | null
  /** A cut/glued piece: its audio is frozen — parameter edits don't
      re-render it (glue pieces back together to re-edit parameters). */
  frozen?: boolean
  /** Harmonized (Coral) version of `buffer` — played when present. */
  fxBuffer?: AudioBuffer | null
  /** Which harmonizer params produced fxBuffer (invalidation key). */
  fxKey?: string
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
    clips: t.clips.map((c) => ({ id: uid(), startSec: c.startSec, durationSec: c.durationSec, params: c.params, buffer: null, peaks: null, text: c.text, gainDb: c.gainDb, fadeInSec: c.fadeInSec, fadeOutSec: c.fadeOutSec, calibrateDb: c.calibrateDb })),
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
    const h = takeStudioSeed()
    if (!h) return null
    const end = Math.max(120, ...h.tracks.flatMap((t) => t.clips.map((c) => c.startSec + c.durationSec)))
    return { tracks: h.tracks.map(seedTrackToTrack), name: h.name, attach: h.attach ?? null, lengthSec: Math.ceil(end), fadeInSec: h.fadeInSec ?? 0, fadeOutSec: h.fadeOutSec ?? 0 }
  }, [])
  const [tracks, setTracks] = useState<Track[]>(() => handoff?.tracks ?? makeSeed())
  const [projectName, setProjectName] = useState(handoff?.name ?? 'GL-ANX 1.1 — Calm and Inner Safety')
  const [masterGain, setMasterGain] = useState(0.82)
  const [lengthSec, setLengthSec] = useState(handoff?.lengthSec ?? 120)
  const [pxPerSec, setPxPerSec] = useState(() => (handoff ? Math.max(0.6, Math.min(7, 1100 / (handoff.lengthSec || 120))) : 7))
  const attachTarget: StudioAttachTarget | null = handoff?.attach ?? null
  const sessionFades = { inSec: handoff?.fadeInSec ?? 0, outSec: handoff?.fadeOutSec ?? 0 }
  const dp = useDataProvider()
  const [attaching, setAttaching] = useState(false)
  const [attachMsg, setAttachMsg] = useState<string | null>(null)

  async function attachToCatalog() {
    if (!attachTarget) return
    setAttaching(true)
    setAttachMsg(null)
    try {
      const mix: MixTrack[] = tracks.map((t) => ({
        gain: t.muted ? 0 : tracks.some((x) => x.soloed) && !t.soloed ? 0 : t.volume,
        pan: CHANNEL_PAN[t.channel ?? 'C'],
        effects: t.effects,
        clips: t.clips.map((c) => ({ startSec: c.startSec, durationSec: c.durationSec, buffer: c.fxBuffer ?? c.buffer })),
      }))
      const buffer = await renderMixdownBuffer(mix, lengthSec, masterGain, sessionFades)
      const { url } = await attachRenderedAudio(dp, attachTarget.code, attachTarget.duration, buffer)
      setAttachMsg(`Attached — ${attachTarget.code} · ${attachTarget.duration} min now streams this edit. (${url.split('/').pop()})`)
    } catch (e) {
      setAttachMsg(`Attach failed: ${(e as Error).message}`)
    } finally {
      setAttaching(false)
    }
  }
  const [playing, setPlaying] = useState(false)
  const [playhead, setPlayhead] = useState(0)
  const [selected, setSelected] = useState<{ trackId: string; clipId: string } | null>(null)
  const [exporting, setExporting] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [ttsBusy, setTtsBusy] = useState<string | null>(null)
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
  const dragRef = useRef<{ mode: 'move' | 'trim-l' | 'trim-r'; trackId: string; trackType: TrackType; clipId: string; startClientX: number; origStart: number; origDur: number } | null>(null)
  const lanesRef = useRef<HTMLDivElement | null>(null)

  const tracksRef = useRef(tracks); tracksRef.current = tracks
  const pxPerSecRef = useRef(pxPerSec); pxPerSecRef.current = pxPerSec
  const lengthSecRef = useRef(lengthSec); lengthSecRef.current = lengthSec

  /* ---- clip rendering ---- */
  const setClipBuffer = useCallback((trackId: string, clipId: string, buf: AudioBuffer, extra?: Partial<Clip>) => {
    const peaks = computePeaks(buf, peakBuckets(buf.duration))
    setTracks((prev) => prev.map((t) => (t.id !== trackId ? t : { ...t, clips: t.clips.map((c) => (c.id !== clipId ? c : { ...c, buffer: buf, peaks, ...extra })) })))
  }, [])

  type ClipShape = { eq?: ClipEq; calibrateDb?: number; gainDb?: number; fadeInSec?: number; fadeOutSec?: number }

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
      const drawn = p.drawTag !== undefined ? drawSoundscape(pools, p.drawTag, rnd) : drawMusic(pools, p.drawPhase ?? 1, rnd)
      if (!drawn) {
        setDrawMsg(p.drawTag !== undefined
          ? `No library file matches the tag "${p.drawTag}" — upload one in the Asset Library (or add the tag to an existing file there).`
          : `The F${p.drawPhase} music pool is empty — upload files to assets/music/f${p.drawPhase} in the Asset Library.`)
        return
      }
      patchClipParams(trackId, clipId, { url: drawn.asset.publicUrl, label: `${drawn.asset.name} · ${p.drawTag !== undefined ? `tag "${p.drawTag}"` : `F${p.drawPhase} pool`}` })
      setDrawMsg(`Drew "${drawn.asset.name}" — ${drawn.how}.`)
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
      let filled = 0
      let empty = 0
      for (const t of tracksRef.current) {
        if (t.type !== 'sample') continue
        for (const c of t.clips) {
          const p = c.params as SampleParams
          if (p.url || (p.drawTag === undefined && p.drawPhase === undefined)) continue
          const drawn = p.drawTag !== undefined ? drawSoundscape(pools, p.drawTag, rnd) : drawMusic(pools, p.drawPhase ?? 1, rnd)
          if (!drawn) { empty++; continue }
          patchClipParams(t.id, c.id, { url: drawn.asset.publicUrl, label: `${drawn.asset.name} · ${p.drawTag !== undefined ? `tag "${p.drawTag}"` : `F${p.drawPhase} pool`}` })
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

  const previewVoice = useCallback(async (text: string, voiceId?: string) => {
    if (!text.trim()) return
    setTtsError(null)
    try { await getTtsProvider().speak(text, { lang: 'pt-BR', voiceId }) } catch (e) { setTtsError((e as Error).message) }
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
      const bytes = await provider.render(text, { lang: 'pt-BR', voiceId: vp.voiceId })
      const decoded = await player.decode(bytes)
      const maxDur = Math.max(MIN_CLIP, lengthSecRef.current - cl.startSec)
      let buf = await bakeVoiceBuffer(decoded, vp.pan, maxDur, vp.speed ?? 1)
      buf = shapeClipBuffer(buf, { eq: cl.eq, calibrateDb: cl.calibrateDb, gainDb: cl.gainDb, fadeInSec: cl.fadeInSec, fadeOutSec: cl.fadeOutSec })
      if (renderTokens.current.get(clipId) !== token) return
      setClipBuffer(trackId, clipId, buf, { ttsSource: decoded, durationSec: buf.duration })
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
    const jobs: { trackId: string; clipId: string; text: string; pan: number; speed: number; voiceId?: string; startSec: number; shape?: ClipShape }[] = []
    for (const t of tracksRef.current) {
      if (t.type !== 'voice') continue
      for (const c of t.clips) {
        const text = (c.text ?? '').trim()
        const vp = c.params as VoiceParams
        if (text && !c.ttsSource && !c.frozen) jobs.push({ trackId: t.id, clipId: c.id, text, pan: vp.pan, speed: vp.speed ?? 1, voiceId: vp.voiceId, startSec: c.startSec, shape: (c.eq && !eqIsTransparent(c.eq)) || c.calibrateDb !== undefined || c.gainDb !== undefined || c.fadeInSec !== undefined || c.fadeOutSec !== undefined ? { eq: c.eq, calibrateDb: c.calibrateDb, gainDb: c.gainDb, fadeInSec: c.fadeInSec, fadeOutSec: c.fadeOutSec } : undefined })
      }
    }
    if (!jobs.length) { setTtsError('Nessuna clip vocale con testo da sintetizzare.'); return }
    setTtsError(null)
    const cache = new Map<string, AudioBuffer>()
    let done = 0
    let failed = 0
    for (const j of jobs) {
      setSynthAll(`Sintesi delle voci ${done + 1}/${jobs.length}…`)
      ttsInFlight.current.add(j.clipId)
      const token = (renderTokens.current.get(j.clipId) ?? 0) + 1
      renderTokens.current.set(j.clipId, token)
      try {
        const key = `${j.voiceId ?? ''}|${j.text}`
        let decoded = cache.get(key)
        if (!decoded) {
          const bytes = await provider.render(j.text, { lang: 'pt-BR', voiceId: j.voiceId })
          decoded = await player.decode(bytes)
          cache.set(key, decoded)
        }
        const maxDur = Math.max(MIN_CLIP, lengthSecRef.current - j.startSec)
        let buf = await bakeVoiceBuffer(decoded, j.pan, maxDur, j.speed)
        if (j.shape) buf = shapeClipBuffer(buf, j.shape)
        if (renderTokens.current.get(j.clipId) !== token) continue
        setClipBuffer(j.trackId, j.clipId, buf, { ttsSource: decoded, durationSec: buf.duration })
        done++
      } catch (e) {
        failed++
        setTtsError(`Voce a ${fmtTime(j.startSec)}: ${(e as Error).message}`)
      } finally {
        ttsInFlight.current.delete(j.clipId)
      }
    }
    setSynthAll(null)
    if (!failed) setTtsError(null)
  }, [setClipBuffer])

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
            setTracks((prev) => prev.map((x) => (x.id !== t.id ? x : { ...x, clips: x.clips.map((y) => (y.id !== c.id ? y : { ...y, fxBuffer: null, fxKey: undefined })) })))
          }
          continue
        }
        if (c.buffer && c.fxKey !== key) jobs.push({ trackId: t.id, clipId: c.id, source: c.buffer, params: h!.params, key })
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
            clips: t.clips.map((c) => (c.id !== j.clipId || c.buffer !== j.source ? c : { ...c, fxBuffer: out, fxKey: j.key })),
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
      const blob = await renderMixdown(mix, lengthSec, masterGain, sessionFades)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${projectName.replace(/[^\w.-]+/g, '_') || 'session'}.wav`; a.click()
      URL.revokeObjectURL(url)
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
        <div className="mt-brand"><span className="mt-brand__mark">◠◡</span>goodloop <span className="mt-brand__sub">studio</span></div>
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
        {attachTarget && hasSupabaseEnv() && (
          <button className="mt-export" onClick={attachToCatalog} disabled={attaching} title={`Ricollega questa modifica a ${attachTarget.code} · ${attachTarget.duration} min`}>
            {attaching ? 'Collegamento…' : `⬆ Collega a ${attachTarget.code}`}
          </button>
        )}
        <a className="mt-exit" href="#" title="Esci dallo studio">✕</a>
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
        onDelete={() => selected && deleteClip(selected.trackId, selected.clipId)}
        ttsLabel={ttsInfo.label}
        ttsCanRender={ttsInfo.canRender}
        ttsBusy={!!selected && ttsBusy === selected.clipId}
        ttsError={ttsError}
        onVoiceText={(text) => selected && setVoiceText(selected.trackId, selected.clipId, text)}
        onVoicePreview={() => selClip && previewVoice(selClip.text ?? '', (selClip.params as VoiceParams).voiceId)}
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

function Inspector({ track, clip, onParam, onTiming, onDelete, ttsLabel, ttsCanRender, ttsBusy, ttsError, onVoiceText, onVoicePreview, onVoiceSynthesize, onVoiceChange, onEq, onDrawClip, onDrawAllMissing, drawBusy, drawMsg }: {
  track: Track | null
  clip: Clip | null
  onParam: (patch: Partial<ClipParams>) => void
  onTiming: (patch: { startSec?: number; durationSec?: number }) => void
  onDelete: () => void
  ttsLabel: string
  ttsCanRender: boolean
  ttsBusy: boolean
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
        {clip.frozen && (
          <div className="mt-note" style={{ marginTop: 6 }}>
            ✂ Cut piece — its audio is frozen: move it freely, cut it again, or glue it with its neighbor.
            Parameter and length edits don't apply to frozen pieces.
          </div>
        )}
        {(clip.calibrateDb !== undefined || clip.gainDb !== undefined || (clip.fadeInSec ?? 0) > 0 || (clip.fadeOutSec ?? 0) > 0) && (
          <div className="mt-note" style={{ marginTop: 6 }}>
            📄 From the protocol Excel: {clip.calibrateDb !== undefined ? `input-normalized to ${(ANCHOR_LUFS + clip.calibrateDb).toFixed(1)} LUFS · ` : ''}
            {clip.gainDb !== undefined && clip.gainDb !== 0 ? `clip gain ${clip.gainDb > 0 ? '+' : ''}${clip.gainDb} dB · ` : ''}
            fades {clip.fadeInSec ?? 0}s / {clip.fadeOutSec ?? 0}s — baked into the clip's audio.
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

        {track.type === 'bilateral' && (() => { const p = clip.params as BilateralParams; const tb = p.timbre ?? 'blip'; return <>
          <div className="mt-seg mt-seg--wrap">
            {BILATERAL_TIMBRES.map((t) => (
              <button key={t.id} className={tb === t.id ? 'is-on' : ''} title={t.blurb} onClick={() => onParam({ timbre: t.id })}>{t.label}</button>
            ))}
          </div>
          <div className="mt-note">{BILATERAL_TIMBRES.find((t) => t.id === tb)?.blurb}</div>
          <Slider label="Tone" value={p.toneHz} min={200} max={800} step={5} onChange={(v) => onParam({ toneHz: v })} fmt={(v) => `${v} Hz`} />
          <Slider label="Blip" value={p.blipMs} min={40} max={400} step={5} onChange={(v) => onParam({ blipMs: v })} fmt={(v) => `${v} ms`} />
          <Slider label="Every" value={p.everySec} min={1} max={10} step={0.5} onChange={(v) => onParam({ everySec: v })} fmt={(v) => `${v.toFixed(1)} s`} />
          <div className="mt-note">Alternanza L(−80)/R(+80) — la stimolazione PAT-05 del protocollo.</div>
        </> })()}

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
          <SampleFilePicker value={p.label} onPick={(url, label) => onParam({ url, label })} />
          <div className="mt-note">
            Riproduce l’asset reale, in loop sulla durata della clip con crossfade sulle giunzioni. Il livello è il fader della traccia a sinistra.
            Scegliere un file qui cambia SOLO questa clip — la mappatura predefinita per fase resta nella Libreria audio dell’amministrazione.
          </div>
        </> })()}

        {track.type === 'voice' && (() => { const p = clip.params as VoiceParams; const rendered = !!clip.ttsSource; const hasText = !!(clip.text ?? '').trim(); return <>
          <div className="mt-tts">
            <div className="mt-tts__row">
              <span className="mt-tts__lbl">Affermazione</span>
              <span className="mt-tts__eng">{rendered ? 'voce renderizzata ✓' : `voce: ${ttsLabel}`}</span>
            </div>
            <textarea
              className="mt-tts__text"
              placeholder={'Scrivi la battuta parlata, es. "Você está em segurança. Respire fundo."'}
              value={clip.text ?? ''}
              onChange={(e) => onVoiceText(e.target.value)}
              rows={2}
            />
            <div className="mt-tts__btns">
              <button className="mt-tts__btn" onClick={onVoicePreview} disabled={ttsBusy || !hasText}>▶ Anteprima</button>
              <button className="mt-tts__btn mt-tts__btn--go" onClick={onVoiceSynthesize} disabled={ttsBusy || !ttsCanRender || !hasText} title={ttsCanRender ? '' : 'Set an ElevenLabs or Azure key to render real voice'}>
                {ttsBusy ? 'Synthesizing…' : rendered ? '↻ Re-synthesize' : '✓ Synthesize into clip'}
              </button>
            </div>
            {!ttsCanRender && <div className="mt-tts__hint">L’anteprima usa la voce del browser. Per renderizzare e montare la voce reale, aggiungi una chiave TTS (docs/TTS_SETUP.md).</div>}
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


/* ---- per-clip voice picker (the built-in PO catalog, by archetype) ---- */
function VoicePicker({ value, onChange, rendered }: { value: string; onChange: (v: string) => void; rendered: boolean }) {
  void rendered
  return (
    <div className="mt-tts__row" style={{ margin: '8px 0 4px' }}>
      <span className="mt-tts__lbl">Voce</span>
      <select className="mt-tts__sel" value={value} onChange={(e) => onChange(e.target.value)}>
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
  )
}

/* ---- library file picker for sample clips (music by phase, soundscapes) ---- */
let assetListPromise: Promise<AudioAsset[]> | null = null

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
function SampleFilePicker({ value, onPick }: { value: string; onPick: (url: string, label: string) => void }) {
  const [assets, setAssets] = useState<AudioAsset[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!hasSupabaseEnv()) { setErr('Library browsing needs the Supabase env.'); setAssets([]); return }
    if (!assetListPromise) assetListPromise = listAssets()
    assetListPromise.then(setAssets).catch((e) => { assetListPromise = null; setErr((e as Error).message); setAssets([]) })
  }, [])
  if (err) return <div className="mt-note">{err}</div>
  if (!assets) return <div className="mt-note">Caricamento della libreria audio…</div>
  const music = assets.filter((a) => a.kind === 'music')
  const scapes = groupSoundscapes(assets)
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
        <option value="" disabled>{value ? `Change file (now: ${value})…` : 'Pick a library file…'}</option>
        {PHASE_KEYS.map((k) => {
          const list = music.filter((a) => a.phase === k)
          return list.length ? (
            <optgroup key={k} label={`Music · ${k.toUpperCase()}`}>
              {list.map((a) => <option key={a.path} value={a.path}>{a.name}</option>)}
            </optgroup>
          ) : null
        })}
        {music.some((a) => !a.phase) && (
          <optgroup label="Music · no phase prefix">
            {music.filter((a) => !a.phase).map((a) => <option key={a.path} value={a.path}>{a.name}</option>)}
          </optgroup>
        )}
        {[...scapes.entries()].map(([texture, list]) => (
          <optgroup key={texture} label={`Soundscape · ${texture}`}>
            {list.map((a) => <option key={a.path} value={a.path}>{a.name}</option>)}
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
function TrackParamsDrawer({ track, onClose, onParam }: {
  track: Track
  onClose: () => void
  onParam: (patch: Partial<ClipParams>) => void
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
          <TrackSeg k="timbre" options={BILATERAL_TIMBRES.map((t) => t.id)} fallback={'blip' as BilateralTimbre} label={(o) => BILATERAL_TIMBRES.find((t) => t.id === o)?.label ?? o} />
          <TrackSlider label="Tono" k="toneHz" fallback={400} min={200} max={800} step={5} fmt={(v) => `${v} Hz`} />
          <TrackSlider label="Impulso" k="blipMs" fallback={120} min={40} max={400} step={5} fmt={(v) => `${v} ms`} />
          <TrackSlider label="Ogni" k="everySec" fallback={4} min={1} max={10} step={0.5} fmt={(v) => `${v.toFixed(1)} s`} />
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
