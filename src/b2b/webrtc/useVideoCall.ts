import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createLoopbackPair,
  createRealtimeSignaling,
  hasRealtimeSignaling,
  type ControlAction,
  type PeerRole,
  type SignalMessage,
  type Signaling,
} from './signaling'

export type CamStatus = 'starting' | 'live' | 'denied' | 'error' | 'off'
export type CallState = 'idle' | 'connecting' | 'connected' | 'failed'

export interface VideoCallOptions {
  /** Shared room id — BOTH peers must pass the same one (the appointment id).
      Omitted (or without Supabase env) → the in-tab simulated demo. */
  roomId?: string | null
  role?: PeerRole
  /** Called when the other peer sends a session-control message. */
  onControl?: (c: ControlAction) => void
}

export interface VideoCall {
  camStatus: CamStatus
  callState: CallState
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  camOn: boolean
  micOn: boolean
  /** The remote peer is an in-tab simulation, not a real device. */
  simulated: boolean
  /** Real signalling is in use (a second device can join this room). */
  realtime: boolean
  /** The other peer has announced itself in the room. */
  peerPresent: boolean
  startCamera: () => void
  /** Release the camera and microphone. For terminal states only — `hangup`
      keeps them so a call can be retried from the same screen. */
  stopCamera: () => void
  connectPatient: () => void
  /** Demo escape hatch: connect to a simulated peer even in a real room. */
  connectSimulated: () => void
  hangup: () => void
  toggleCam: () => void
  toggleMic: () => void
  /** Drive the other peer's local session player. */
  sendControl: (c: ControlAction) => void
}

/** An animated canvas used as the simulated patient's video source. Movement +
    a live clock make it obvious the frames are flowing through the connection. */
function makeCanvasStream(rafRef: { current: number | null }): MediaStream {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 480
  const ctx = canvas.getContext('2d')
  const draw = () => {
    if (ctx) {
      const t = Date.now() / 1000
      const g = ctx.createLinearGradient(0, 0, 0, 480)
      g.addColorStop(0, '#0c2a22')
      g.addColorStop(1, '#061710')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 640, 480)
      const r = 62 + Math.sin(t * 1.5) * 8
      ctx.beginPath(); ctx.arc(320, 205, r, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(122,198,155,0.22)'; ctx.fill()
      ctx.beginPath(); ctx.arc(320, 205, 42, 0, Math.PI * 2)
      ctx.fillStyle = '#7ac69b'; ctx.fill()
      ctx.fillStyle = '#eaf3ec'; ctx.textAlign = 'center'
      ctx.font = '600 24px system-ui, sans-serif'
      ctx.fillText('Paziente — feed simulato', 320, 322)
      ctx.font = '15px system-ui, sans-serif'; ctx.fillStyle = '#9fbfae'
      ctx.fillText(new Date().toLocaleTimeString(), 320, 350)
    }
    rafRef.current = requestAnimationFrame(draw)
  }
  draw()
  return canvas.captureStream(15)
}

/** Buffer ICE candidates until the remote description exists, then flush. */
function candidateSink(pc: RTCPeerConnection) {
  const pending: RTCIceCandidateInit[] = []
  return {
    async add(c: RTCIceCandidateInit) {
      if (pc.remoteDescription && pc.remoteDescription.type) {
        try { await pc.addIceCandidate(c) } catch { /* ignore late/dup */ }
      } else pending.push(c)
    },
    async flush() {
      while (pending.length) {
        const c = pending.shift()!
        try { await pc.addIceCandidate(c) } catch { /* ignore */ }
      }
    },
  }
}

/* Public STUN is enough for most home/office NATs. Symmetric NAT / strict
   corporate firewalls need a TURN relay — add its credentials here when the
   pilot hits one. */
const ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]

export function useVideoCall(opts: VideoCallOptions = {}): VideoCall {
  const role: PeerRole = opts.role ?? 'therapist'
  const roomId = opts.roomId ?? null
  const realtime = !!roomId && hasRealtimeSignaling()

  const [camStatus, setCamStatus] = useState<CamStatus>('starting')
  const [callState, setCallState] = useState<CallState>('idle')
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [camOn, setCamOn] = useState(true)
  const [micOn, setMicOn] = useState(true)
  const [peerPresent, setPeerPresent] = useState(false)
  const [simulated, setSimulated] = useState(!realtime)

  const localRef = useRef<MediaStream | null>(null)
  const pc = useRef<RTCPeerConnection | null>(null)
  const sink = useRef<ReturnType<typeof candidateSink> | null>(null)
  const sig = useRef<Signaling | null>(null)
  const controlRef = useRef(opts.onControl)
  controlRef.current = opts.onControl

  /* simulated-peer bits (demo only) */
  const pcSim = useRef<RTCPeerConnection | null>(null)
  const sigPair = useRef<[Signaling, Signaling] | null>(null)
  const canvasStream = useRef<MediaStream | null>(null)
  const raf = useRef<number | null>(null)

  const startCamera = useCallback(() => {
    setCamStatus('starting')
    if (!navigator.mediaDevices?.getUserMedia) {
      // insecure origin (non-localhost http) or unsupported browser
      setCamStatus('error')
      return
    }
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((s) => {
        localRef.current = s
        setLocalStream(s)
        setCamStatus('live')
        setCamOn(true)
        setMicOn(true)
        /* Tracks may arrive after the peer connection was built. Adding them
           is not enough — they have to be renegotiated onto the wire. The
           therapist can offer directly; the patient asks by greeting again,
           which the presence handler above turns into a fresh offer. */
        const conn = pc.current
        if (conn && conn.getSenders().length === 0) {
          s.getTracks().forEach((t) => conn.addTrack(t, s))
          if (role === 'patient') sig.current?.send({ kind: 'hello', role })
        }
      })
      .catch((e: unknown) => {
        const name = (e as { name?: string })?.name
        setCamStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error')
      })
  }, [role])

  const teardownCall = useCallback(() => {
    pc.current?.close(); pc.current = null
    pcSim.current?.close(); pcSim.current = null
    sink.current = null
    sigPair.current?.forEach((s) => s.close()); sigPair.current = null
    if (raf.current != null) cancelAnimationFrame(raf.current)
    raf.current = null
    canvasStream.current?.getTracks().forEach((t) => t.stop())
    canvasStream.current = null
    setRemoteStream(null)
    setCallState('idle')
  }, [])

  /**
   * Build an offer and put it on the wire. The therapist is the only peer
   * allowed to offer, so every renegotiation funnels through here.
   *
   * `stable` is the guard: offering while an offer is already in flight throws
   * InvalidStateError and kills the connection.
   */
  const reoffer = useCallback(async (conn: RTCPeerConnection) => {
    if (conn.signalingState !== 'stable') return
    try {
      const offer = await conn.createOffer()
      await conn.setLocalDescription(offer)
      sig.current?.send({ kind: 'offer', sdp: offer })
    } catch {
      setCallState('failed')
    }
  }, [])

  /** The peer connection for the REAL call (one per session). */
  const ensurePc = useCallback((): RTCPeerConnection => {
    if (pc.current) return pc.current
    const conn = new RTCPeerConnection({ iceServers: ICE })
    pc.current = conn
    sink.current = candidateSink(conn)
    const local = localRef.current
    if (local) local.getTracks().forEach((t) => conn.addTrack(t, local))
    conn.onicecandidate = (e) => { if (e.candidate) sig.current?.send({ kind: 'ice', candidate: e.candidate.toJSON() }) }
    conn.ontrack = (e) => setRemoteStream(e.streams[0] ?? null)
    /* Tracks added after the first negotiation — a camera that arrived while
       the permission prompt was up, or a successful "Riprova" — reach the
       other side only if somebody re-offers. Nothing did, so a patient who
       granted the camera a second late was invisible for the whole call with
       no way to repair it. */
    if (role === 'therapist') conn.onnegotiationneeded = () => { void reoffer(conn) }
    conn.onconnectionstatechange = () => {
      const s = conn.connectionState
      if (s === 'connected') setCallState('connected')
      else if (s === 'failed') setCallState('failed')
      else if (s === 'disconnected' || s === 'closed') setCallState('idle')
    }
    return conn
  }, [role, reoffer])

  /* ---- real signalling: join the room, exchange presence + SDP ---- */
  useEffect(() => {
    if (!realtime || !roomId) return
    const s = createRealtimeSignaling(roomId, role)
    sig.current = s

    s.onMessage(async (m: SignalMessage) => {
      switch (m.kind) {
        case 'hello': {
          setPeerPresent(true)
          /* Answer a greeting so a peer that joined first also learns about
             us — but NEVER answer an answer. Without that guard both sides
             greeted each other forever, and since the therapist re-offers on
             every hello the pair renegotiated identical SDP several times a
             second for the whole call. That is enough Realtime traffic to hit
             the rate limit and drop a control cue mid-session. */
          if (!m.reply) s.send({ kind: 'hello', role, reply: true })
          /* The caller re-offers: the callee may have arrived after the first
             offer, or may be asking for renegotiation because its camera
             landed late (see startCamera). */
          if (role === 'therapist') {
            const conn = pc.current
            if (conn) void reoffer(conn)
          }
          break
        }
        case 'offer': {
          if (role === 'therapist') break // the therapist is always the caller
          const conn = ensurePc()
          setCallState('connecting')
          await conn.setRemoteDescription(m.sdp)
          await sink.current?.flush()
          const answer = await conn.createAnswer()
          await conn.setLocalDescription(answer)
          s.send({ kind: 'answer', sdp: answer })
          break
        }
        case 'answer': {
          const conn = pc.current
          if (!conn || conn.signalingState === 'stable') break
          await conn.setRemoteDescription(m.sdp)
          await sink.current?.flush()
          break
        }
        case 'ice':
          await sink.current?.add(m.candidate)
          break
        case 'bye':
          setPeerPresent(false)
          teardownCall()
          break
        case 'control':
          controlRef.current?.(m.control)
          break
      }
    })

    s.send({ kind: 'hello', role })
    return () => {
      s.send({ kind: 'bye' })
      s.close()
      sig.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realtime, roomId, role])

  /** Demo path: a second RTCPeerConnection in this tab, publishing a canvas. */
  const connectSimulated = useCallback(() => {
    const local = localRef.current
    if (!local || pc.current) return
    setSimulated(true)
    setCallState('connecting')

    const cfg: RTCConfiguration = { iceServers: [] } // in-tab loopback needs no STUN
    const t = new RTCPeerConnection(cfg)
    const p = new RTCPeerConnection(cfg)
    pc.current = t
    pcSim.current = p
    const [sigT, sigP] = createLoopbackPair()
    sigPair.current = [sigT, sigP]
    const sinkT = candidateSink(t)
    const sinkP = candidateSink(p)
    sink.current = sinkT

    local.getTracks().forEach((track) => t.addTrack(track, local))
    const canvas = makeCanvasStream(raf)
    canvasStream.current = canvas
    canvas.getTracks().forEach((track) => p.addTrack(track, canvas))

    t.onicecandidate = (e) => { if (e.candidate) sigT.send({ kind: 'ice', candidate: e.candidate.toJSON() }) }
    p.onicecandidate = (e) => { if (e.candidate) sigP.send({ kind: 'ice', candidate: e.candidate.toJSON() }) }
    t.ontrack = (e) => setRemoteStream(e.streams[0] ?? null)
    t.onconnectionstatechange = () => {
      const s = t.connectionState
      if (s === 'connected') setCallState('connected')
      else if (s === 'failed') setCallState('failed')
      else if (s === 'disconnected' || s === 'closed') setCallState('idle')
    }

    sigT.onMessage(async (m: SignalMessage) => {
      if (m.kind === 'answer') { await t.setRemoteDescription(m.sdp); await sinkT.flush() }
      else if (m.kind === 'ice') await sinkT.add(m.candidate)
    })
    sigP.onMessage(async (m: SignalMessage) => {
      if (m.kind === 'offer') {
        await p.setRemoteDescription(m.sdp); await sinkP.flush()
        const answer = await p.createAnswer()
        await p.setLocalDescription(answer)
        sigP.send({ kind: 'answer', sdp: answer })
      } else if (m.kind === 'ice') await sinkP.add(m.candidate)
    })

    void (async () => {
      try {
        const offer = await t.createOffer()
        await t.setLocalDescription(offer)
        sigT.send({ kind: 'offer', sdp: offer })
      } catch {
        setCallState('failed')
      }
    })()
  }, [])

  /** Therapist: call the patient in the room. */
  const connectPatient = useCallback(() => {
    if (!realtime) { connectSimulated(); return }
    if (!localRef.current) return
    setCallState('connecting')
    const conn = ensurePc()
    void (async () => {
      try {
        const offer = await conn.createOffer()
        await conn.setLocalDescription(offer)
        sig.current?.send({ kind: 'offer', sdp: offer })
      } catch {
        setCallState('failed')
      }
    })()
  }, [realtime, ensurePc, connectSimulated])

  const hangup = useCallback(() => {
    sig.current?.send({ kind: 'bye' })
    teardownCall()
  }, [teardownCall])

  /**
   * Release the camera and microphone.
   *
   * `hangup` deliberately keeps them: a call can be retried from the same
   * screen. But when a surface reaches its terminal state the hardware has to
   * go, or the camera light stays on over the "session ended" screen until
   * the person navigates away — which reads exactly like being recorded.
   */
  const stopCamera = useCallback(() => {
    localRef.current?.getTracks().forEach((t) => t.stop())
    localRef.current = null
    setLocalStream(null)
    setCamStatus('off')
  }, [])

  /**
   * Close the therapist's microphone while the protocol is playing.
   *
   * "Intervene" was icon state only: nothing ever touched the outbound audio
   * track, and the patient's view of the therapist is unmuted, so for the
   * whole treatment the person heard their therapist's open microphone —
   * breathing, typing, a door — underneath a session whose entire point is a
   * controlled soundscape. Meanwhile both therapist surfaces logged "audio
   * bidirezionale aperto" on intervene as though something had changed.
   *
   * `micIntent` remembers what the OPERATOR chose, so restoring the mic after
   * a session never un-mutes someone who had muted themselves.
   */
  const micIntent = useRef(true)
  const setOutboundAudio = useCallback((on: boolean) => {
    const track = localRef.current?.getAudioTracks()[0]
    if (!track) return
    const next = on && micIntent.current
    track.enabled = next
    setMicOn(next)
  }, [])

  const sendControl = useCallback((c: ControlAction) => {
    sig.current?.send({ kind: 'control', control: c })
    if (role !== 'therapist') return
    if (c.action === 'play' || c.action === 'resume') setOutboundAudio(false)
    else if (c.action === 'intervene') setOutboundAudio(c.on)
    else if (c.action === 'pause' || c.action === 'stop' || c.action === 'end') setOutboundAudio(true)
  }, [role, setOutboundAudio])

  const toggleCam = useCallback(() => {
    const track = localRef.current?.getVideoTracks()[0]
    if (track) { track.enabled = !track.enabled; setCamOn(track.enabled) }
  }, [])
  const toggleMic = useCallback(() => {
    const track = localRef.current?.getAudioTracks()[0]
    if (track) {
      track.enabled = !track.enabled
      micIntent.current = track.enabled
      setMicOn(track.enabled)
    }
  }, [])

  // auto-acquire the camera on mount; tear everything down on unmount
  useEffect(() => {
    startCamera()
    return () => {
      teardownCall()
      localRef.current?.getTracks().forEach((t) => t.stop())
      localRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    camStatus, callState, localStream, remoteStream, camOn, micOn,
    simulated, realtime, peerPresent,
    startCamera, stopCamera, connectPatient, connectSimulated, hangup, toggleCam, toggleMic, sendControl,
  }
}
