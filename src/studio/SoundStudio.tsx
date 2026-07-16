import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  MultitrackPlayer,
  renderClipBuffer,
  renderMixdown,
  renderMixdownBuffer,
  sliceBuffer,
  concatBuffers,
  bakeVoiceBuffer,
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
import { takeStudioSeed, type StudioAttachTarget } from '../compose/handoff'
import { useDataProvider } from '../data/provider'
import { attachRenderedAudio } from '../admin/attachAudio'
import { hasSupabaseEnv } from '../auth/supabaseClient'
import type { SeedTrack } from '../compose/types'

/* ---- layout constants ---- */
const LANE_H = 86
const RULER_H = 30
const HEADER_W = 236
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
}
type TrackChannel = 'L' | 'C' | 'R'
const CHANNEL_PAN: Record<TrackChannel, number> = { L: -1, C: 0, R: 1 }

interface Track {
  id: string
  type: TrackType
  name: string
  volume: number
  muted: boolean
  soloed: boolean
  /** Whole-track stereo position (applies live and in the mixdown). */
  channel?: TrackChannel
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
    clips: t.clips.map((c) => ({ id: uid(), startSec: c.startSec, durationSec: c.durationSec, params: c.params, buffer: null, peaks: null, text: c.text })),
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
    return { tracks: h.tracks.map(seedTrackToTrack), name: h.name, attach: h.attach ?? null, lengthSec: Math.ceil(end) }
  }, [])
  const [tracks, setTracks] = useState<Track[]>(() => handoff?.tracks ?? makeSeed())
  const [projectName, setProjectName] = useState(handoff?.name ?? 'GL-ANX 1.1 — Calm and Inner Safety')
  const [masterGain, setMasterGain] = useState(0.82)
  const [lengthSec, setLengthSec] = useState(handoff?.lengthSec ?? 120)
  const [pxPerSec, setPxPerSec] = useState(() => (handoff ? Math.max(0.6, Math.min(7, 1100 / (handoff.lengthSec || 120))) : 7))
  const attachTarget: StudioAttachTarget | null = handoff?.attach ?? null
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
        clips: t.clips.map((c) => ({ startSec: c.startSec, durationSec: c.durationSec, buffer: c.buffer })),
      }))
      const buffer = await renderMixdownBuffer(mix, lengthSec, masterGain)
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
  const dragRef = useRef<{ mode: 'move' | 'trim-l' | 'trim-r'; trackId: string; clipId: string; startClientX: number; origStart: number; origDur: number } | null>(null)

  const tracksRef = useRef(tracks); tracksRef.current = tracks
  const pxPerSecRef = useRef(pxPerSec); pxPerSecRef.current = pxPerSec
  const lengthSecRef = useRef(lengthSec); lengthSecRef.current = lengthSec

  /* ---- clip rendering ---- */
  const setClipBuffer = useCallback((trackId: string, clipId: string, buf: AudioBuffer, extra?: Partial<Clip>) => {
    const peaks = computePeaks(buf, peakBuckets(buf.duration))
    setTracks((prev) => prev.map((t) => (t.id !== trackId ? t : { ...t, clips: t.clips.map((c) => (c.id !== clipId ? c : { ...c, buffer: buf, peaks, ...extra })) })))
  }, [])

  const doRender = useCallback(async (trackId: string, clipId: string, type: TrackType, params: ClipParams, dur: number) => {
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
    if (renderTokens.current.get(clipId) !== token) return
    setClipBuffer(trackId, clipId, buf)
  }, [setClipBuffer])

  const rebakeVoice = useCallback(async (trackId: string, clipId: string, source: AudioBuffer, pan: number, startSec: number, speed = 1) => {
    const token = (renderTokens.current.get(clipId) ?? 0) + 1
    renderTokens.current.set(clipId, token)
    // bake to the full available window: a slower speed lengthens the spoken
    // line, and the clip follows the voice rather than truncating it
    const maxDur = Math.max(MIN_CLIP, lengthSecRef.current - startSec)
    const buf = await bakeVoiceBuffer(source, pan, maxDur, speed)
    if (renderTokens.current.get(clipId) !== token) return
    setClipBuffer(trackId, clipId, buf, { durationSec: buf.duration })
  }, [setClipBuffer])

  const renderClip = useCallback((trackId: string, clipId: string) => {
    const tr = tracksRef.current.find((t) => t.id === trackId)
    const cl = tr?.clips.find((c) => c.id === clipId)
    if (!tr || !cl) return
    if (cl.frozen) return // cut/glued audio is authoritative — never re-render over it
    if (tr.type === 'voice' && cl.ttsSource) {
      const vp = cl.params as VoiceParams
      void rebakeVoice(trackId, clipId, cl.ttsSource, vp.pan, cl.startSec, vp.speed ?? 1)
      return
    }
    void doRender(trackId, clipId, tr.type, cl.params, cl.durationSec)
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

  const previewVoice = useCallback(async (text: string) => {
    if (!text.trim()) return
    setTtsError(null)
    try { await getTtsProvider().speak(text, { lang: 'pt-BR' }) } catch (e) { setTtsError((e as Error).message) }
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
      const bytes = await provider.render(text, { lang: 'pt-BR' })
      const decoded = await player.decode(bytes)
      const maxDur = Math.max(MIN_CLIP, lengthSecRef.current - cl.startSec)
      const vp = cl.params as VoiceParams
      const buf = await bakeVoiceBuffer(decoded, vp.pan, maxDur, vp.speed ?? 1)
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
    const jobs: { trackId: string; clipId: string; text: string; pan: number; speed: number; startSec: number }[] = []
    for (const t of tracksRef.current) {
      if (t.type !== 'voice') continue
      for (const c of t.clips) {
        const text = (c.text ?? '').trim()
        const vp = c.params as VoiceParams
        if (text && !c.ttsSource && !c.frozen) jobs.push({ trackId: t.id, clipId: c.id, text, pan: vp.pan, speed: vp.speed ?? 1, startSec: c.startSec })
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
        let decoded = cache.get(j.text)
        if (!decoded) {
          const bytes = await provider.render(j.text, { lang: 'pt-BR' })
          decoded = await player.decode(bytes)
          cache.set(j.text, decoded)
        }
        const maxDur = Math.max(MIN_CLIP, lengthSecRef.current - j.startSec)
        const buf = await bakeVoiceBuffer(decoded, j.pan, maxDur, j.speed)
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
    return tracksRef.current.map((t) => ({ id: t.id, clips: t.clips.map((c) => ({ startSec: c.startSec, durationSec: c.durationSec, buffer: c.buffer })) }))
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
  function seek(sec: number) {
    const c = clamp(sec, 0, lengthSec)
    setPlayhead(c)
    const p = playerRef.current; if (!p) return
    if (playing) p.play(snapshot(), c, gainForId, panForId)
    else p.setPlayhead(c)
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
    const sig = tracks.map((t) => `${t.id}:` + t.clips.map((c) => `${c.id}@${c.startSec.toFixed(2)}+${c.durationSec.toFixed(2)}#${bufId(c.buffer)}`).join(',')).join('|')
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
    const tr = tracksRef.current.find((t) => t.id === trackId); const cl = tr?.clips.find((c) => c.id === clipId); if (!cl) return
    dragRef.current = { mode, trackId, clipId, startClientX: e.clientX, origStart: cl.startSec, origDur: cl.durationSec }
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
      const mix: MixTrack[] = tracks.map((t) => ({ gain: t.muted ? 0 : solo && !t.soloed ? 0 : t.volume, pan: CHANNEL_PAN[t.channel ?? 'C'], clips: t.clips.map((c) => ({ startSec: c.startSec, durationSec: c.durationSec, buffer: c.buffer })) }))
      const blob = await renderMixdown(mix, lengthSec, masterGain)
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
          <span className="mt-time">{fmtTime(playhead)} <span className="mt-time__sep">/</span> {fmtTime(lengthSec)}</span>
        </div>
        <button className={`mt-tbtn${voiceSetupOpen ? ' is-on' : ''}`} onClick={() => setVoiceSetupOpen((v) => !v)} title="Voice engine (TTS keys)">
          {ttsInfo.canRender ? '🎙' : '🎙!'}
        </button>
        <button
          className="mt-tbtn"
          onClick={() => void synthesizeAllVoices()}
          disabled={!!synthAll}
          title="Synthesize every voice clip that has text and no rendered voice yet (one TTS render per unique line)"
          style={{ width: 'auto', padding: '0 10px', fontSize: 12 }}
        >
          {synthAll ?? '♪ Synthesize all voices'}
        </button>
        <button className="mt-tbtn" onClick={cutAtPlayhead} disabled={!selected} title="Cut the selected clip in two at the playhead" style={{ width: 'auto', padding: '0 10px', fontSize: 12 }}>✂ Cut</button>
        <button className="mt-tbtn" onClick={glueWithNext} disabled={!selected} title="Glue the selected clip with the next clip on its track (gap becomes silence)" style={{ width: 'auto', padding: '0 10px', fontSize: 12 }}>🩹 Glue</button>
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
            />
          ))}
          {tracks.length === 0 && <div className="mt-empty">No tracks. Use ＋ Track.</div>}
          </div>

          <div className="mt-content" style={{ width: contentWidth, height: contentHeight }}>
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
        onVoicePreview={() => selClip && previewVoice(selClip.text ?? '')}
        onVoiceSynthesize={() => selected && synthesizeVoice(selected.trackId, selected.clipId)}
      />
    </div>
  )
}

/* ============================ track header ============================ */
function TrackHeader({ track, onVolume, onToggleMute, onToggleSolo, onDelete, onAddClip, onChannel }: {
  track: Track
  onVolume: (v: number) => void
  onToggleMute: () => void
  onToggleSolo: () => void
  onDelete: () => void
  onAddClip: () => void
  onChannel: (c: TrackChannel) => void
}) {
  const meta = TRACK_META[track.type]
  const ch = track.channel ?? 'C'
  return (
    <div className="mt-head" style={{ height: LANE_H, borderLeftColor: meta.color }}>
      <div className="mt-head__top">
        <span className="mt-head__icon">{meta.icon}</span>
        <span className="mt-head__name">{track.name}</span>
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
        <input className="mt-vol" type="range" min={0} max={1} step={0.01} value={track.volume} onChange={(e) => onVolume(+e.target.value)} />
        <button className="mt-addclip" onClick={onAddClip} title="Add clip at playhead">＋</button>
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
      onPointerDown={(e) => { const r = e.currentTarget.getBoundingClientRect(); onSeek((e.clientX - r.left) / pxPerSec) }}
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
function Slider({ label, value, min, max, step, onChange, fmt }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt?: (v: number) => string
}) {
  return (
    <label className="mt-field">
      <span className="mt-field__lbl">{label}<b>{fmt ? fmt(value) : value}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    </label>
  )
}

function Inspector({ track, clip, onParam, onTiming, onDelete, ttsLabel, ttsCanRender, ttsBusy, ttsError, onVoiceText, onVoicePreview, onVoiceSynthesize }: {
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
}) {
  if (!track || !clip) {
    return (
      <div className="mt-inspector mt-inspector--empty">
        <span>Select a clip to edit its sound · double-click a lane to add one · drag edges to trim</span>
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
          <div className="mt-note">
            Plays the real asset, looped to the clip length with seam crossfades. Level = the track fader on the left;
            to use a DIFFERENT file for this phase, change the mapping in the admin Asset Library and re-open Edit in Studio.
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
