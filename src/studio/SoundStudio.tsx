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
  type Chord,
} from './multitrack'
import { getTtsProvider } from '../tts'
import { VoiceEnginePanel } from '../tts/VoiceEnginePanel'
import { ARCHETYPES, DEFAULT_PRIMARY, voicesByArchetype } from '../tts/voiceCatalog'
import { defaultEffects, effectsKey, EFFECTS_META, harmonizeBuffer, type TrackEffect } from './effects'
import { groupSoundscapes, listAssets, assetPublicUrl, PHASE_KEYS, type AudioAsset } from '../admin/assets'
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
}
type TrackChannel = 'L' | 'C' | 'R'
const CHANNEL_PAN: Record<TrackChannel, number> = { L: -1, C: 0, R: 1 }

/* Audio-taper fader: the slider runs in dB (−40 … +6), not linear gain —
   a centimeter of travel is the same audible step anywhere on the range.
   `track.volume` stays LINEAR (engine + seeds unchanged); only the slider
   position and the readout speak dB. */
const FADER_MIN_DB = -40
const FADER_MAX_DB = 6
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
        <h1>Sound Studio is desktop-only</h1>
        <p>The multitrack editor needs a wider screen. Open Good Loop on a laptop or desktop to compose and render sessions.</p>
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

  type ClipShape = { calibrateDb?: number; gainDb?: number; fadeInSec?: number; fadeOutSec?: number }

  const doRender = useCallback(async (trackId: string, clipId: string, type: TrackType, params: ClipParams, dur: number, shape?: ClipShape) => {
    const token = (renderTokens.current.get(clipId) ?? 0) + 1
    renderTokens.current.set(clipId, token)
    let buf: AudioBuffer
    try {
      buf = await renderClipBuffer(type, params, dur)
    } catch (e) {
      // e.g. a sample clip whose file fetch failed — keep the clip, silent,
      // instead of crashing the render loop
      console.warn('clip render failed', type, (e as Error).message)
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
    const shape: ClipShape | undefined = cl.calibrateDb !== undefined || cl.gainDb !== undefined || cl.fadeInSec !== undefined || cl.fadeOutSec !== undefined
      ? { calibrateDb: cl.calibrateDb, gainDb: cl.gainDb, fadeInSec: cl.fadeInSec, fadeOutSec: cl.fadeOutSec }
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

  /* ---- voice (TTS) ---- */
  const setVoiceText = useCallback((trackId: string, clipId: string, text: string) => {
    setTracks((prev) => prev.map((t) => (t.id !== trackId ? t : { ...t, clips: t.clips.map((c) => (c.id !== clipId ? c : { ...c, text })) })))
  }, [])

  const setClipVoice = useCallback((trackId: string, clipId: string, voiceId: string) => {
    setTracks((prev) => prev.map((t) => (t.id !== trackId ? t : {
      ...t,
      clips: t.clips.map((c) => (c.id !== clipId ? c : {
        ...c,
        params: { ...(c.params as VoiceParams), voiceId: voiceId || undefined },
        ttsSource: null, // a different voice = a new TTS render — ♪ or "All voices"
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
    if (!text) { setTtsError('Type an affirmation first.'); return }
    setTtsError(null); setTtsBusy(clipId)
    try {
      const provider = getTtsProvider()
      const vp = cl.params as VoiceParams
      const bytes = await provider.render(text, { lang: 'pt-BR', voiceId: vp.voiceId })
      const decoded = await player.decode(bytes)
      const maxDur = Math.max(MIN_CLIP, lengthSecRef.current - cl.startSec)
      let buf = await bakeVoiceBuffer(decoded, vp.pan, maxDur, vp.speed ?? 1)
      buf = shapeClipBuffer(buf, { calibrateDb: cl.calibrateDb, gainDb: cl.gainDb, fadeInSec: cl.fadeInSec, fadeOutSec: cl.fadeOutSec })
      setClipBuffer(trackId, clipId, buf, { ttsSource: decoded, durationSec: buf.duration })
    } catch (e) {
      setTtsError((e as Error).message)
    } finally {
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
        if (text && !c.ttsSource && !c.frozen) jobs.push({ trackId: t.id, clipId: c.id, text, pan: vp.pan, speed: vp.speed ?? 1, voiceId: vp.voiceId, startSec: c.startSec, shape: c.calibrateDb !== undefined || c.gainDb !== undefined || c.fadeInSec !== undefined || c.fadeOutSec !== undefined ? { calibrateDb: c.calibrateDb, gainDb: c.gainDb, fadeInSec: c.fadeInSec, fadeOutSec: c.fadeOutSec } : undefined })
      }
    }
    if (!jobs.length) { setTtsError('No un-synthesized voice clips with text.'); return }
    setTtsError(null)
    const cache = new Map<string, AudioBuffer>()
    let done = 0
    let failed = 0
    for (const j of jobs) {
      setSynthAll(`Synthesizing voices ${done + 1}/${jobs.length}…`)
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
        setClipBuffer(j.trackId, j.clipId, buf, { ttsSource: decoded, durationSec: buf.duration })
        done++
      } catch (e) {
        failed++
        setTtsError(`Voice at ${fmtTime(j.startSec)}: ${(e as Error).message}`)
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
    if (!selected) { setEditMsg('Select a clip first, place the playhead inside it, then Cut.'); return }
    const tr = tracksRef.current.find((t) => t.id === selected.trackId)
    const cl = tr?.clips.find((c) => c.id === selected.clipId)
    if (!tr || !cl) return
    const t0 = cl.startSec, t1 = cl.startSec + cl.durationSec
    if (playhead < t0 + 0.2 || playhead > t1 - 0.2) { setEditMsg('Place the playhead INSIDE the selected clip (not at its very edge), then Cut.'); return }
    if (!cl.buffer) { setEditMsg('This clip is still rendering — wait for its waveform, then Cut.'); return }
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
    if (!selected) { setEditMsg('Select the left clip of the pair to glue.'); return }
    const tr = tracksRef.current.find((t) => t.id === selected.trackId)
    if (!tr) return
    const sorted = [...tr.clips].sort((x, y) => x.startSec - y.startSec)
    const i = sorted.findIndex((c) => c.id === selected.clipId)
    const cl = sorted[i]
    const nx = sorted[i + 1]
    if (!cl || !nx) { setEditMsg('No clip after the selected one on this track — nothing to glue.'); return }
    if (!cl.buffer || !nx.buffer) { setEditMsg('Both clips need their audio rendered before gluing (wait for the waveforms).'); return }
    const gap = Math.max(0, nx.startSec - (cl.startSec + cl.durationSec))
    if (gap > 60) { setEditMsg('These clips are more than 60 s apart — move them closer before gluing.'); return }
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
          <button className="mt-tbtn" onClick={stopT} title="Stop / to start">⏹</button>
          <button className="mt-tbtn mt-tbtn--play" onClick={playing ? pause : play} title={playing ? 'Pause' : 'Play'}>{playing ? '⏸' : '▶'}</button>
          <span className="mt-time">
            <EditableValue
              display={fmtTime(playhead)}
              title="Click to type a time (e.g. 3:45 or 225)"
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
        <button className={`mt-tbtn${voiceSetupOpen ? ' is-on' : ''}`} onClick={() => setVoiceSetupOpen((v) => !v)} title="Voice engine (TTS keys)">
          {ttsInfo.canRender ? '🎙' : '🎙!'}
        </button>
        <button
          className="mt-tbtn mt-tbtn--wide"
          onClick={() => void synthesizeAllVoices()}
          disabled={!!synthAll}
          title="Synthesize every voice clip that has text and no rendered voice yet (one TTS render per unique line)"
        >
          {synthAll ?? '♪ All voices'}
        </button>
        <button className="mt-tbtn mt-tbtn--wide" onClick={cutAtPlayhead} disabled={!selected} title="Cut the selected clip in two at the playhead">✂ Cut</button>
        <button className="mt-tbtn mt-tbtn--wide" onClick={glueWithNext} disabled={!selected} title="Glue the selected clip with the next clip on its track (gap becomes silence)">🩹 Glue</button>
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
          <span>length</span>
          <input type="number" min={10} max={1800} value={lengthSec} onChange={(e) => setLengthSec(clamp(Math.round(+e.target.value || 10), 10, 1800))} />
          <span>s</span>
        </div>
        <div className="mt-addwrap">
          <button className="mt-add" onClick={() => setAddOpen((v) => !v)}>＋ Track ▾</button>
          {addOpen && (
            <div className="mt-addmenu">
              {(Object.keys(TRACK_META) as TrackType[]).map((tp) => (
                <button key={tp} onClick={() => addTrack(tp)}><span>{TRACK_META[tp].icon}</span> {TRACK_META[tp].label}<em>{TRACK_META[tp].blurb}</em></button>
              ))}
            </div>
          )}
        </div>
        <button className="mt-export" onClick={exportWav} disabled={exporting}>{exporting ? 'Rendering…' : '⬇ Export WAV'}</button>
        {attachTarget && hasSupabaseEnv() && (
          <button className="mt-export" onClick={attachToCatalog} disabled={attaching} title={`Re-attach this edit to ${attachTarget.code} · ${attachTarget.duration} min`}>
            {attaching ? 'Attaching…' : `⬆ Attach to ${attachTarget.code}`}
          </button>
        )}
        <a className="mt-exit" href="#" title="Exit studio">✕</a>
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
            />
          ))}
          {tracks.length === 0 && <div className="mt-empty">No tracks. Use ＋ Track.</div>}
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
      />
    </div>
  )
}

/* ============================ track header ============================ */
function TrackHeader({ track, onVolume, onToggleMute, onToggleSolo, onDelete, onAddClip, onChannel, onFx }: {
  track: Track
  onVolume: (v: number) => void
  onToggleMute: () => void
  onToggleSolo: () => void
  onDelete: () => void
  onAddClip: () => void
  onChannel: (c: TrackChannel) => void
  onFx: () => void
}) {
  const meta = TRACK_META[track.type]
  const ch = track.channel ?? 'C'
  const fxOn = (track.effects ?? []).filter((e) => e.enabled).length
  return (
    <div className="mt-head" style={{ height: LANE_H, borderLeftColor: meta.color }}>
      <div className="mt-head__top">
        <span className="mt-head__icon">{meta.icon}</span>
        <span className="mt-head__name">{track.name}</span>
        <button className={`mt-fxbtn${fxOn ? ' is-on' : ''}`} onClick={onFx} title="Track effects (harmonizer · echo · reverb · saturation · filter)">
          FX{fxOn ? ` ${fxOn}` : ''}
        </button>
        <button className="mt-x" onClick={onDelete} title="Remove track">✕</button>
      </div>
      <div className="mt-head__row">
        <button className={`mt-mini${track.muted ? ' is-m' : ''}`} onClick={onToggleMute} title="Mute">M</button>
        <button className={`mt-mini${track.soloed ? ' is-s' : ''}`} onClick={onToggleSolo} title="Solo">S</button>
        <span className="mt-chan" title="Track channel — the whole track plays left / center / right (live + in the export)">
          {(['L', 'C', 'R'] as TrackChannel[]).map((c) => (
            <button key={c} className={`mt-chan__b${ch === c ? ' is-on' : ''}`} onClick={() => onChannel(c)}>{c}</button>
          ))}
        </span>
        <span style={{ flex: 1 }} />
        <button className="mt-addclip" onClick={onAddClip} title="Add clip at playhead">＋</button>
      </div>
      <div className="mt-head__vol" title="Track level in dB vs the mix — scroll for ±0.5 dB fine steps">
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
            title="Click to type the level in dB (e.g. -12)"
          />
        </span>
      </div>
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

function Inspector({ track, clip, onParam, onTiming, onDelete, ttsLabel, ttsCanRender, ttsBusy, ttsError, onVoiceText, onVoicePreview, onVoiceSynthesize, onVoiceChange }: {
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
}) {
  if (!track || !clip) {
    return (
      <div className="mt-inspector mt-inspector--empty">
        <span>Select a clip to edit its sound · double-click a lane to add one · drag edges to trim · drag a clip up/down to move it to another track of the same type</span>
      </div>
    )
  }
  const meta = TRACK_META[track.type]
  return (
    <div className="mt-inspector">
      <div className="mt-insp__head">
        <span className="mt-insp__title" style={{ color: meta.color }}>{meta.icon} {meta.label}</span>
        <span className="mt-insp__sub">{meta.blurb}</span>
        <button className="mt-insp__del" onClick={onDelete}>Delete clip</button>
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
            📄 From the protocol Excel: {clip.calibrateDb !== undefined ? `layer level ${clip.calibrateDb > 0 ? '+' : ''}${clip.calibrateDb} dB vs the guide voice (loudness-calibrated) · ` : ''}
            {clip.gainDb !== undefined && clip.gainDb !== 0 ? `clip offset ${clip.gainDb > 0 ? '+' : ''}${clip.gainDb} dB · ` : ''}
            fades {clip.fadeInSec ?? 0}s / {clip.fadeOutSec ?? 0}s — baked into the clip's audio.
          </div>
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
          <div className="mt-note">Warm triad pad — key changes follow the protocol's music transitions.</div>
        </> })()}

        {track.type === 'bilateral' && (() => { const p = clip.params as BilateralParams; return <>
          <Slider label="Tone" value={p.toneHz} min={200} max={800} step={5} onChange={(v) => onParam({ toneHz: v })} fmt={(v) => `${v} Hz`} />
          <Slider label="Blip" value={p.blipMs} min={40} max={400} step={5} onChange={(v) => onParam({ blipMs: v })} fmt={(v) => `${v} ms`} />
          <Slider label="Every" value={p.everySec} min={1} max={10} step={0.5} onChange={(v) => onParam({ everySec: v })} fmt={(v) => `${v.toFixed(1)} s`} />
          <div className="mt-note">Alternating L(−80)/R(+80) — the doc's PAT-05 stimulation.</div>
        </> })()}

        {track.type === 'sample' && (() => { const p = clip.params as SampleParams; return <>
          <div className="mt-note" style={{ marginBottom: 6 }}>
            <b>Library file:</b> {p.label || '— none —'}
          </div>
          <SampleFilePicker value={p.label} onPick={(url, label) => onParam({ url, label })} />
          <div className="mt-note">
            Plays the real asset, looped to the clip length with seam crossfades. Level = the track fader on the left.
            Picking a file here changes THIS clip only — the protocol's default per-phase mapping stays in the admin Asset Library.
          </div>
        </> })()}

        {track.type === 'voice' && (() => { const p = clip.params as VoiceParams; const rendered = !!clip.ttsSource; const hasText = !!(clip.text ?? '').trim(); return <>
          <div className="mt-tts">
            <div className="mt-tts__row">
              <span className="mt-tts__lbl">Affirmation</span>
              <span className="mt-tts__eng">{rendered ? 'voice rendered ✓' : `voice: ${ttsLabel}`}</span>
            </div>
            <textarea
              className="mt-tts__text"
              placeholder={'Type the spoken line, e.g. "Você está em segurança. Respire fundo."'}
              value={clip.text ?? ''}
              onChange={(e) => onVoiceText(e.target.value)}
              rows={2}
            />
            <div className="mt-tts__btns">
              <button className="mt-tts__btn" onClick={onVoicePreview} disabled={ttsBusy || !hasText}>▶ Preview</button>
              <button className="mt-tts__btn mt-tts__btn--go" onClick={onVoiceSynthesize} disabled={ttsBusy || !ttsCanRender || !hasText} title={ttsCanRender ? '' : 'Set an ElevenLabs or Azure key to render real voice'}>
                {ttsBusy ? 'Synthesizing…' : rendered ? '↻ Re-synthesize' : '✓ Synthesize into clip'}
              </button>
            </div>
            {!ttsCanRender && <div className="mt-tts__hint">Preview uses the browser voice. To render &amp; layer real voice, add a TTS key (docs/TTS_SETUP.md).</div>}
            {ttsError && <div className="mt-tts__err">{ttsError}</div>}
          </div>
          <VoicePicker value={p.voiceId ?? ''} onChange={onVoiceChange} rendered={rendered} />
          <Slider label="Pan" value={p.pan} min={-1} max={1} step={0.05} onChange={(v) => onParam({ pan: v })} fmt={(v) => (v === 0 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`)} />
          <Slider label="Speed" value={p.speed ?? 1} min={0.7} max={1.4} step={0.05} onChange={(v) => onParam({ speed: v })} fmt={(v) => `×${v.toFixed(2)}`} />
          {rendered && <div className="mt-note">Pan and speed re-bake the rendered voice instantly — no new TTS call. Speed is pitch-preserving (time-stretch): the voice speaks faster or slower without sounding higher or deeper.</div>}
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
      <span className="mt-tts__lbl">Voice</span>
      <select className="mt-tts__sel" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Default — {DEFAULT_PRIMARY.name} (engine voice)</option>
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
function SampleFilePicker({ value, onPick }: { value: string; onPick: (url: string, label: string) => void }) {
  const [assets, setAssets] = useState<AudioAsset[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!hasSupabaseEnv()) { setErr('Library browsing needs the Supabase env.'); setAssets([]); return }
    if (!assetListPromise) assetListPromise = listAssets()
    assetListPromise.then(setAssets).catch((e) => { assetListPromise = null; setErr((e as Error).message); setAssets([]) })
  }, [])
  if (err) return <div className="mt-note">{err}</div>
  if (!assets) return <div className="mt-note">Loading the asset library…</div>
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
        {busy && <span className="mt-fx__busy">processing chorus…</span>}
        <span className="mt-fx__hint">Effects apply live and in the export. Harmonizer processes each clip (a short wait); the others are instant.</span>
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
