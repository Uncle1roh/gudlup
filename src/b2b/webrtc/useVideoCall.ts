import { useCallback, useEffect, useRef, useState } from 'react'
import { createLoopbackPair, type SignalMessage, type Signaling } from './signaling'

export type CamStatus = 'starting' | 'live' | 'denied' | 'error' | 'off'
export type CallState = 'idle' | 'connecting' | 'connected' | 'failed'

export interface VideoCall {
  camStatus: CamStatus
  callState: CallState
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  camOn: boolean
  micOn: boolean
  /** The remote peer is an in-tab simulation (no signalling server yet). */
  simulated: boolean
  startCamera: () => void
  connectPatient: () => void
  hangup: () => void
  toggleCam: () => void
  toggleMic: () => void
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
      ctx.fillText('Patient — simulated feed', 320, 322)
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

export function useVideoCall(): VideoCall {
  const [camStatus, setCamStatus] = useState<CamStatus>('starting')
  const [callState, setCallState] = useState<CallState>('idle')
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [camOn, setCamOn] = useState(true)
  const [micOn, setMicOn] = useState(true)

  const localRef = useRef<MediaStream | null>(null)
  const pcT = useRef<RTCPeerConnection | null>(null)
  const pcP = useRef<RTCPeerConnection | null>(null)
  const canvasStream = useRef<MediaStream | null>(null)
  const raf = useRef<number | null>(null)
  const sig = useRef<[Signaling, Signaling] | null>(null)

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
      })
      .catch((e: unknown) => {
        const name = (e as { name?: string })?.name
        setCamStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error')
      })
  }, [])

  const teardownCall = useCallback(() => {
    pcT.current?.close(); pcT.current = null
    pcP.current?.close(); pcP.current = null
    sig.current?.forEach((s) => s.close()); sig.current = null
    if (raf.current != null) cancelAnimationFrame(raf.current)
    raf.current = null
    canvasStream.current?.getTracks().forEach((t) => t.stop())
    canvasStream.current = null
    setRemoteStream(null)
    setCallState('idle')
  }, [])

  const connectPatient = useCallback(() => {
    const local = localRef.current
    if (!local || pcT.current) return
    setCallState('connecting')

    const cfg: RTCConfiguration = { iceServers: [] } // in-tab loopback needs no STUN/TURN
    const t = new RTCPeerConnection(cfg)
    const p = new RTCPeerConnection(cfg)
    pcT.current = t
    pcP.current = p
    const [sigT, sigP] = createLoopbackPair()
    sig.current = [sigT, sigP]
    const sinkT = candidateSink(t)
    const sinkP = candidateSink(p)

    // therapist publishes camera + mic; patient publishes the canvas feed
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

    ;(async () => {
      try {
        const offer = await t.createOffer()
        await t.setLocalDescription(offer)
        sigT.send({ kind: 'offer', sdp: offer })
      } catch {
        setCallState('failed')
      }
    })()
  }, [])

  const hangup = useCallback(() => teardownCall(), [teardownCall])

  const toggleCam = useCallback(() => {
    const track = localRef.current?.getVideoTracks()[0]
    if (track) { track.enabled = !track.enabled; setCamOn(track.enabled) }
  }, [])
  const toggleMic = useCallback(() => {
    const track = localRef.current?.getAudioTracks()[0]
    if (track) { track.enabled = !track.enabled; setMicOn(track.enabled) }
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

  return { camStatus, callState, localStream, remoteStream, camOn, micOn, simulated: true, startCamera, connectPatient, hangup, toggleCam, toggleMic }
}
