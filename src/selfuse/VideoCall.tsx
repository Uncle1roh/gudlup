/* ============================================================================
   Self Use — the patient side of a therapist-led session (VID-1 … VID-4)

     VID-1  Waiting room       self-view, mic/camera status, headphone notice
     VID-2  Video conversation rapport before, debrief after — therapist full screen
     VID-3  Transition          ~10s countdown the THERAPIST triggers
     VID-4  Treatment mode      the Good Loop protocol, therapist-led

   The call is a REAL peer connection. What crosses it is voice and video and
   nothing else: the protocol audio is played by THIS device from the published
   file, because WebRTC audio is mono-ised and echo-cancelled and would destroy
   the binaural beat the method depends on. What keeps the two sides in step is
   a control channel — play, pause, resume, stop, intervene, end — sent by the
   therapist and applied here.

   That is also why this screen has no transport of its own. The patient is
   given:
     · no play/pause — the therapist holds it
     · no exit from treatment — leaving ends the session, and it confirms first
     · always the version the therapist chose
   The therapist's thumbnail stays on screen through the treatment, quietly,
   because a voice with no face is a worse place to have your eyes closed.

   Reorientation gets the same protection as in Self Use: the treatment fades
   back to video over about ten seconds with no pop-up and no metric.
   ============================================================================ */

import { useCallback, useEffect, useRef, useState } from 'react'
import { BreathingOrb } from '../components/BreathingOrb'
import { SessionPlayer } from '../lib/audio'
import { useI18n } from '../i18n'
import { getProtocol, versionLengthSeconds } from '../data/protocols'
import { audioUrlFor, useCatalog } from '../data/liveCatalog'
import { useVideoCall, type VideoCall as Call } from '../b2b/webrtc/useVideoCall'
import type { ControlAction } from '../b2b/webrtc/signaling'
import type { TherapistProfile } from './therapyStore'
import type { Duration } from '../types/domain'

type Stage = 'waiting' | 'video' | 'countdown' | 'treatment' | 'debrief' | 'ended'

interface VideoCallProps {
  therapist: TherapistProfile
  startsAt: number | null
  /** The shared room BOTH peers join — the appointment id. */
  roomId: string | null
  /** Testing hook — shortens the treatment. null = the protocol's real length. */
  demoSeconds?: number | null
  onLeave: () => void
}

const COUNTDOWN_FROM = 10

/** What the therapist started, carried from the control message into the player. */
interface Treatment {
  protocolCode: string
  duration: Duration
}

export function PatientVideoCall({ therapist, startsAt, roomId, demoSeconds, onLeave }: VideoCallProps) {
  const { t } = useI18n()
  const [stage, setStage] = useState<Stage>('waiting')
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [treatment, setTreatment] = useState<Treatment | null>(null)
  const [paused, setPaused] = useState(false)
  const [intervening, setIntervening] = useState(false)

  const stageRef = useRef(stage)
  stageRef.current = stage

  /* Session control from the therapist. This is the only thing that moves the
     patient between video and treatment — there is no button on this side that
     starts a protocol, by design. */
  const onControl = useCallback((c: ControlAction) => {
    switch (c.action) {
      case 'play':
        setTreatment({ protocolCode: c.protocolCode, duration: (c.durationMin as Duration) ?? 24 })
        setPaused(false)
        setIntervening(false)
        setStage('countdown')
        break
      case 'pause':
        setPaused(true)
        break
      case 'resume':
        setPaused(false)
        setIntervening(false)
        break
      case 'stop':
        // Straight to the debrief: the reorientation is inside the audio, and
        // the player fades itself out rather than cutting.
        setStage((s) => (s === 'treatment' || s === 'countdown' ? 'debrief' : s))
        break
      case 'intervene':
        setIntervening(c.on)
        setPaused(c.on)
        break
      case 'end':
        setStage('ended')
        break
    }
  }, [])

  const call = useVideoCall({ roomId, role: 'patient', autoAnswer: true, onControl })

  /* The therapist calling IS the session starting. The patient does not press
     anything a second time once they have joined the room. */
  useEffect(() => {
    if (call.callState === 'connected' && stageRef.current === 'waiting') setStage('video')
  }, [call.callState])

  /* ------------------------------------------------------------ VID-1 --- */
  if (stage === 'waiting') {
    const ready = call.camStatus === 'live'
    return (
      <div className="app-frame call">
        <div className="call__waiting">
          <p className="small muted">{t('Your session with')}</p>
          <h1 className="display">{therapist.name}</h1>
          {startsAt && (
            <p className="lead">
              {t('starts at {time}', {
                time: new Date(startsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
              })}
            </p>
          )}

          <SelfView call={call} />

          <div className="call__status">
            <span>{t('Mic')}: {call.micOn ? t('ON') : t('OFF')}</span>
            <span>{t('Camera')}: {call.camOn ? t('ON') : t('OFF')}</span>
          </div>
          <div className="chip-row">
            <button className="btn btn--ghost" disabled={!ready} onClick={call.toggleMic}>
              {call.micOn ? t('Mute') : t('Unmute')}
            </button>
            <button className="btn btn--ghost" disabled={!ready} onClick={call.toggleCam}>
              {call.camOn ? t('Camera off') : t('Camera on')}
            </button>
          </div>

          {call.camStatus === 'denied' && (
            <p className="small call__warn">
              {t('Your camera is blocked. Allow it in your browser settings, then tap retry.')}{' '}
              <button className="btn btn--quiet" onClick={call.startCamera}>{t('Retry')}</button>
            </p>
          )}
          {call.camStatus === 'error' && (
            <p className="small call__warn">
              {t('No camera available. A session needs a secure connection and a working camera.')}{' '}
              <button className="btn btn--quiet" onClick={call.startCamera}>{t('Retry')}</button>
            </p>
          )}

          <p className="small muted call__hp">🎧 {t('Stereo headphones are required for this session')}</p>

          <p className="lead">
            {call.callState === 'connecting'
              ? t('Connecting…')
              : call.peerPresent
                ? t('Your therapist is here. The session will open by itself.')
                : t('Waiting for your therapist to open the room…')}
          </p>
          <p className="small muted">{t('Stay on this screen — the call opens on its own.')}</p>

          <button className="btn btn--quiet" onClick={onLeave}>{t('Leave')}</button>
        </div>
      </div>
    )
  }

  if (stage === 'countdown') {
    return <TransitionCountdown therapist={therapist} onDone={() => setStage('treatment')} />
  }

  if (stage === 'treatment' && treatment) {
    return (
      <TreatmentMode
        therapist={therapist}
        call={call}
        treatment={treatment}
        demoSeconds={demoSeconds ?? null}
        paused={paused}
        intervening={intervening}
        onFinished={() => setStage('debrief')}
        onLeaveRequested={() => setConfirmEnd(true)}
        confirmEnd={confirmEnd}
        onKeepGoing={() => setConfirmEnd(false)}
        onEndNow={() => { setConfirmEnd(false); call.hangup(); setStage('ended') }}
      />
    )
  }

  if (stage === 'ended') {
    return (
      <div className="app-frame call">
        <div className="call__ended">
          <h2 className="display">{t('Session ended')}</h2>
          <p className="small muted">
            {new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
          </p>
          <button className="btn btn--primary" onClick={onLeave}>{t('Back to Home')}</button>
        </div>
      </div>
    )
  }

  /* VID-2 — rapport before the protocol, debrief after it. */
  const debrief = stage === 'debrief'
  return (
    <div className="app-frame call">
      <div className="call__video">
        <PeerView call={call} name={therapist.name} />
        <div className="call__name">{therapist.name}</div>
        <SelfView call={call} compact />

        <div className="call__bar">
          <button className="call__btn" onClick={call.toggleMic} aria-pressed={!call.micOn}>
            {call.micOn ? '🎤' : '🔇'}<span>{t('Mic')}</span>
          </button>
          <button className="call__btn call__btn--end" onClick={() => setConfirmEnd(true)}>
            <span>{t('End')}</span>
          </button>
          <button className="call__btn" onClick={call.toggleCam} aria-pressed={!call.camOn}>
            {call.camOn ? '📷' : '🚫'}<span>{t('Camera')}</span>
          </button>
        </div>

        {debrief && <div className="call__cue call__cue--quiet">{t('Debrief with your therapist')}</div>}
        {!debrief && (
          <div className="call__cue call__cue--quiet">
            {t('Your therapist will start the session when you are both ready.')}
          </div>
        )}

        {confirmEnd && (
          <div className="player__confirm">
            <div className="player__confirmbox fade-in">
              <p>{t('Leave the session? This ends the call with your therapist.')}</p>
              <div className="chip-row">
                <button className="btn btn--light" onClick={() => setConfirmEnd(false)}>{t('Stay')}</button>
                <button className="btn btn--light" onClick={() => { call.hangup(); setStage('ended') }}>{t('End')}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------- video bits --- */

function PeerView({ call, name }: { call: Call; name: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const { t } = useI18n()
  useEffect(() => { if (ref.current) ref.current.srcObject = call.remoteStream }, [call.remoteStream])

  if (call.callState === 'connected' && call.remoteStream) {
    return <video ref={ref} className="call__feed call__feed--live" autoPlay playsInline />
  }
  return (
    <div className="call__feed" aria-hidden="true">
      <span>{call.callState === 'connecting' ? t('Connecting to {name}…', { name }) : t('Therapist video feed')}</span>
    </div>
  )
}

function SelfView({ call, compact }: { call: Call; compact?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  const { t } = useI18n()
  useEffect(() => { if (ref.current) ref.current.srcObject = call.localStream }, [call.localStream])

  const cls = compact ? 'call__self' : 'call__selfview'
  if (call.camStatus !== 'live') {
    return (
      <div className={cls}>
        <span>{call.camStatus === 'starting' ? t('Starting camera…') : call.camStatus === 'denied' ? t('Camera blocked') : t('No camera')}</span>
      </div>
    )
  }
  return (
    <div className={cls}>
      <video ref={ref} className={`call__el${call.camOn ? '' : ' is-off'}`} autoPlay playsInline muted />
      {!call.camOn && <span className="call__selfoff">{t('Camera off')}</span>}
    </div>
  )
}

/* -------------------------------------------------------------- VID-3 ---- */

function TransitionCountdown({ therapist, onDone }: { therapist: TherapistProfile; onDone: () => void }) {
  const { t } = useI18n()
  const [n, setN] = useState(COUNTDOWN_FROM)

  useEffect(() => {
    if (n <= 0) { onDone(); return }
    const id = window.setTimeout(() => setN((v) => v - 1), 1000)
    return () => clearTimeout(id)
  }, [n, onDone])

  return (
    <div className="app-frame call">
      <div className="call__transition">
        <p className="lead">{t('Your therapist is starting your session')}</p>
        <p className="small muted">{t('Put on your headphones, close your eyes, and get comfortable.')}</p>
        <div className="call__count" aria-live="polite">{Math.max(0, n)}</div>
        <p className="small muted">{t('Starting in')}</p>
        <p className="small muted">{therapist.name}</p>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- VID-4 ---- */

function fmt(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function TreatmentMode({
  therapist,
  call,
  treatment,
  demoSeconds,
  paused,
  intervening,
  onFinished,
  onLeaveRequested,
  confirmEnd,
  onKeepGoing,
  onEndNow,
}: {
  therapist: TherapistProfile
  call: Call
  treatment: Treatment
  demoSeconds: number | null
  paused: boolean
  intervening: boolean
  onFinished: () => void
  onLeaveRequested: () => void
  confirmEnd: boolean
  onKeepGoing: () => void
  onEndNow: () => void
}) {
  const { t, locale } = useI18n()
  const catalog = useCatalog()
  /* The catalog row wins over the runtime registry: the registry is hydrated
     asynchronously and, until it lands, returns a static seed that carries no
     published audio at all. */
  const entry = catalog.all.find((p) => p.code === treatment.protocolCode)
  const protocol = entry ?? getProtocol(treatment.protocolCode) ?? getProtocol('GL-ANX 1.1')!
  const fractions = protocol.phases.length
    ? protocol.phases.map((p) => p.fraction)
    : [0.11, 0.16, 0.16, 0.38, 0.1, 0.09]
  /* THIS device plays the published mixdown for the version the therapist
     chose. Nothing about the treatment audio travels over the call. */
  const audioUrl = audioUrlFor(protocol, treatment.duration, locale)
  const [audioFailed, setAudioFailed] = useState<string | null>(null)
  const total = demoSeconds ?? versionLengthSeconds(protocol, treatment.duration)

  const [elapsed, setElapsed] = useState(0)
  const playerRef = useRef<SessionPlayer | null>(null)
  const doneRef = useRef(false)
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  useEffect(() => {
    const p = new SessionPlayer({
      audioUrl,
      volume: 0.55,
      onFallback: (reason) => setAudioFailed(reason),
    })
    playerRef.current = p
    void p.play()
    let last = Date.now()
    let acc = 0
    const id = window.setInterval(() => {
      const now = Date.now()
      const dt = (now - last) / 1000
      last = now
      // A pause held by the therapist must stop the CLOCK too, or the phases
      // would run on under silence and the two sides would end up out of step.
      if (pausedRef.current) return
      acc += dt
      if (acc >= total && !doneRef.current) {
        doneRef.current = true
        clearInterval(id)
        p.stop()
        // Fade back to video over ~10s — no pop-up, no metric, no celebration.
        window.setTimeout(onFinished, 10_000)
        return
      }
      setElapsed(acc)
    }, 250)
    return () => { clearInterval(id); p.stop() }
  }, [audioUrl, total, onFinished])

  /* The therapist's pause/resume/intervene reaches the local player here. */
  useEffect(() => {
    const p = playerRef.current
    if (!p) return
    if (paused) p.pause()
    else void p.resume()
  }, [paused])

  let acc = 0
  let phaseIdx = 0
  for (let i = 0; i < fractions.length; i += 1) {
    acc += fractions[i] * total
    if (elapsed < acc) { phaseIdx = i; break }
    phaseIdx = i
  }
  const isBreath = phaseIdx === 1

  return (
    <div className="app-frame">
      <div className="player player--guided">
        {isBreath ? <BreathingOrb size={210} /> : <div className="ambient-pulse" />}
        <div className="player__veil" style={{ opacity: 0.88 }} />

        <TherapistThumb call={call} name={therapist.name} />

        {intervening && <div className="guided__speaking">🔴 {t('Your therapist is speaking')}</div>}
        {audioFailed && !intervening && (
          <div className="guided__speaking guided__speaking--warn">
            {t('The recorded audio could not be played, so this is the ambient bed.')}
          </div>
        )}

        <div className="guided__hud">
          <div className="guided__phase">
            {t('Phase {n}', { n: phaseIdx + 1 })} · {t(protocol.phases[phaseIdx].name)}
          </div>
          <div className="guided__bar" aria-hidden="true">
            <span style={{ width: `${(elapsed / total) * 100}%` }} />
          </div>
          <div className="guided__time">{fmt(elapsed)} / {fmt(total)}</div>
          {paused && !intervening && <div className="guided__paused">{t('Paused by your therapist')}</div>}
        </div>

        {/* No transport for the patient. The only affordance is leaving, and it
            asks first because leaving ends the session with the therapist. */}
        <button className="guided__leave" onClick={onLeaveRequested}>{t('Leave')}</button>

        {confirmEnd && (
          <div className="player__confirm">
            <div className="player__confirmbox fade-in">
              <p>{t('Leaving now ends your session with your therapist. Are you sure?')}</p>
              <div className="chip-row">
                <button className="btn btn--light" onClick={onKeepGoing}>{t('Stay')}</button>
                <button className="btn btn--light" onClick={onEndNow}>{t('End session')}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** The therapist stays on screen through the treatment — low opacity, small,
    but present. A voice with no face is a worse place to close your eyes. */
function TherapistThumb({ call, name }: { call: Call; name: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => { if (ref.current) ref.current.srcObject = call.remoteStream }, [call.remoteStream])

  return (
    <div className="guided__thumb" aria-hidden="true">
      {call.remoteStream ? (
        <video ref={ref} className="call__el" autoPlay playsInline />
      ) : (
        <span>{name.split(' ').slice(-1)[0]}</span>
      )}
    </div>
  )
}
