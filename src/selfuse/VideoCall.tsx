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
import { SessionPlayer } from '../lib/audio'
import { useLegal } from '../legal/LegalContext'
import { useDataProvider } from '../data/provider'
import type { Addressee } from '../tts/voiceLang'
import { useI18n, fmtDate } from '../i18n'
import { getProtocol, versionLengthSeconds } from '../data/protocols'
import { audioUrlFor, useCatalog } from '../data/liveCatalog'
import { useVideoCall, type VideoCall as Call } from '../b2b/webrtc/useVideoCall'
import type { ControlAction } from '../b2b/webrtc/signaling'
import type { TherapistProfile } from './therapyStore'
import type { Duration } from '../types/domain'
import { Icon } from './icons'
import { Shell } from '../ui2/Shell'
import { TopBar, PageTitle } from '../ui2/TopBar'
import { EarTest } from '../ui2/EarTest'
import { initialsOf } from '../ui2/Home'
import { durationLabel } from '../data/selfuse'

type Stage = 'waiting' | 'video' | 'countdown' | 'treatment' | 'debrief' | 'ended'

interface VideoCallProps {
  therapist: TherapistProfile
  startsAt: number | null
  /** The shared room BOTH peers join — the appointment id. */
  roomId: string | null
  /** The appointment the lobby location is confirmed against (M2P-06). */
  appointmentId?: string | null
  /** Testing hook — shortens the audio. null = the content's real length. */
  demoSeconds?: number | null
  /** How this person is addressed: a therapist-led session plays on THIS
      device, so it plays their recording, not a default one. */
  addressedAs: Addressee
  onLeave: () => void
  /** The person's own name — the top bar prints it. */
  name: string | null
}

const COUNTDOWN_FROM = 10

/** What the therapist started, carried from the control message into the player. */
interface Treatment {
  protocolCode: string
  duration: Duration
}

export function PatientVideoCall({ therapist, startsAt, roomId, appointmentId, demoSeconds, addressedAs, name, onLeave }: VideoCallProps) {
  const { t } = useI18n()
  const { m } = useLegal()
  const dp = useDataProvider()
  const [stage, setStage] = useState<Stage>('waiting')
  const [earsOk, setEarsOk] = useState(false)
  /* LOB-1: where the person is, so the professional can get help to them in
     an emergency. Confirmed in the lobby, read by that professional only. */
  const [location, setLocation] = useState('')
  const [locationOk, setLocationOk] = useState(false)
  const [recordedTip, setRecordedTip] = useState(false)
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

  const call = useVideoCall({ roomId, role: 'patient', onControl })

  /* The camera goes when the session is over, however it ended — the person
     hung up, the therapist ended it, or the treatment ran out. `hangup` keeps
     the hardware on purpose (a call can be retried from the same screen), so
     the terminal stage is the right place to release it. Otherwise the camera
     light stays lit over "session ended", which reads as still recording. */
  const { stopCamera } = call
  useEffect(() => { if (stage === 'ended') stopCamera() }, [stage, stopCamera])

  /* The therapist calling IS the session starting. The patient does not press
     anything a second time once they have joined the room. */
  useEffect(() => {
    if (call.callState === 'connected' && stageRef.current === 'waiting') setStage('video')
  }, [call.callState])

  /* ------------------------------------------------------------ VID-1 --- */
  if (stage === 'waiting') {
    const ready = call.camStatus === 'live'
    const minutes = startsAt ? Math.max(0, Math.round((startsAt - Date.now()) / 60_000)) : null
    return (
      <Shell dest="therapy" onDest={onLeave} surface="deep">
        <TopBar name={name} />
        <PageTitle
          title={t('Waiting room')}
          note={
            minutes !== null && minutes > 0
              ? t('{name} joins in about {n} minutes. Meanwhile, let us check your audio.', { name: therapist.name, n: minutes })
              : t('{name} will open the room. Meanwhile, let us check your audio.', { name: therapist.name })
          }
        />

        <div className="call2">
          <div className="call2-stage">
            <SelfView call={call} />
            <span className="call2-stage__tag">{t('Camera')}</span>
            <div className="call2-bar">
              <button type="button" className="call2-btn" disabled={!ready} onClick={call.toggleMic} aria-pressed={!call.micOn} aria-label={call.micOn ? t('Mute') : t('Unmute')}>
                <Icon name={call.micOn ? 'mic' : 'micOff'} size={20} />
              </button>
              <button type="button" className="call2-btn" disabled={!ready} onClick={call.toggleCam} aria-pressed={!call.camOn} aria-label={call.camOn ? t('Camera off') : t('Camera on')}>
                <Icon name={call.camOn ? 'camera' : 'cameraOff'} size={20} />
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* The block the old lobby never had, and the one thing here that
                decides whether the treatment can work at all. */}
            <EarTest onPass={() => setEarsOk(true)} />

            <article className="glass call2-pane">
              <ul className="call2-list">
                <li>
                  <span className="call2-list__tick" aria-hidden="true">{earsOk ? '\u2713' : '\u25cb'}</span>
                  <span className={earsOk ? undefined : 'call2-list__off'}>{t('Wired headphones connected')}</span>
                </li>
                <li>
                  <span className="call2-list__tick" aria-hidden="true">{ready ? '\u2713' : '\u25cb'}</span>
                  <span className={ready ? undefined : 'call2-list__off'}>{t('Camera and microphone allowed')}</span>
                </li>
                <li>
                  <span className="call2-list__tick" aria-hidden="true">{locationOk ? '\u2713' : '\u25cb'}</span>
                  <span className={locationOk ? undefined : 'call2-list__off'}>{t('A quiet, comfortable place')}</span>
                </li>
              </ul>
            </article>

            {/* LOB-1 — where you are, asked once per session, because a
                professional has to know which country they are working in. */}
            <article className="glass call2-pane">
              <p className="call2-note">{m('LOB-1', { name: therapist.name })}</p>
              {locationOk ? (
                <p className="call2-ok">{t('Location confirmed')}: {location}</p>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="ob-input"
                    style={{ flex: 1, minWidth: 0 }}
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder={t('Where you are now (address or place)')}
                    aria-label={t('Where you are now')}
                  />
                  <button
                    type="button"
                    className="glass-btn call2-pill"
                    disabled={!location.trim()}
                    onClick={() => {
                      setLocationOk(true)
                      if (appointmentId) void dp.confirmSessionLocation(appointmentId, location).catch(() => undefined)
                    }}
                  >
                    {t('Confirm')}
                  </button>
                </div>
              )}
            </article>

            {(call.camStatus === 'denied' || call.camStatus === 'error') && (
              <article className="glass call2-pane">
                <p className="call2-warn">
                  {call.camStatus === 'denied'
                    ? t('Your camera is blocked. Allow it in your browser settings, then tap retry.')
                    : t('No camera available. A session needs a secure connection and a working camera.')}
                </p>
                <button type="button" className="glass-btn call2-pill" onClick={call.startCamera}>{t('Retry')}</button>
              </article>
            )}

            {/* The room opens itself when the professional arrives; this
                button is here for the moment they already have. */}
            <button type="button" className="call2-act" disabled={!call.peerPresent} onClick={() => setStage('video')}>
              <Icon name="camera" size={18} />
              {t('Enter session')}
            </button>
            <p className="call2-note" style={{ textAlign: 'center' }}>
              {call.callState === 'connecting'
                ? t('Connecting…')
                : call.peerPresent
                  ? t('Your therapist is here. The session will open by itself.')
                  : t('Waiting for your therapist to open the room…')}
            </p>
            <button type="button" className="call2-quiet" onClick={onLeave}>{t('Leave')}</button>
          </div>
        </div>
      </Shell>
    )
  }

  if (stage === 'countdown') {
    /* Tell the therapist when the audio actually starts, so their monitor
       clock and ours agree — they used to start theirs ten seconds earlier,
       the moment they pressed play. */
    return (
      <TransitionCountdown
        therapist={therapist}
        onDone={() => { setStage('treatment'); call.sendControl({ action: 'started' }) }}
      />
    )
  }

  if (stage === 'treatment' && treatment) {
    return (
      <TreatmentMode
        therapist={therapist}
        call={call}
        treatment={treatment}
        demoSeconds={demoSeconds ?? null}
        addressedAs={addressedAs}
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
      <div className="app-frame call su-studio su-dark">
        <div className="call__ended">
          <h2 className="display">{t('Session ended')}</h2>
          <p className="small muted">
            {fmtDate(Date.now(), { month: 'long', day: 'numeric' })}
          </p>
          <button className="btn btn--primary" onClick={onLeave}>{t('Back to Home')}</button>
        </div>
      </div>
    )
  }

  /* VID-2 — rapport before the protocol, debrief after it. */
  const debrief = stage === 'debrief'
  return (
    <Shell dest="therapy" onDest={() => setConfirmEnd(true)} surface="deep">
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: 26, fontWeight: 500 }}>
            {t('Session with {name}', { name: therapist.name })}
          </span>
          {/* SES-1 — said plainly, every minute of the call, with SES-1b one
              tap away. It is not a badge: it is the promise the room runs on. */}
          <button type="button" className="call2-quiet" style={{ textAlign: 'left', textDecoration: 'none' }} onClick={() => setRecordedTip((v) => !v)} aria-expanded={recordedTip}>
            {m('SES-1')}
          </button>
          {recordedTip && <p className="call2-note" style={{ maxWidth: 520 }}>{m('SES-1b')}</p>}
        </div>
        <span className="glass-btn" style={{ height: 40, padding: '0 16px', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: '#3DB189' }} />
          {debrief ? t('Final conversation') : t('Welcome')}
        </span>
      </header>

      <div className="call2">
        <div className="call2-stage">
          <PeerView call={call} name={therapist.name} />
          <SelfView call={call} compact />
          <span className="call2-stage__tag">{therapist.name}</span>

          <div className="call2-bar">
            <button type="button" className="call2-btn" onClick={call.toggleMic} aria-pressed={!call.micOn} aria-label={t('Mic')}>
              <Icon name={call.micOn ? 'mic' : 'micOff'} size={20} />
            </button>
            <button type="button" className="call2-btn" onClick={call.toggleCam} aria-pressed={!call.camOn} aria-label={t('Camera')}>
              <Icon name={call.camOn ? 'camera' : 'cameraOff'} size={20} />
            </button>
            <button type="button" className="call2-btn call2-btn--end" onClick={() => setConfirmEnd(true)} aria-label={t('End')}>
              {/* The mockup's handset, laid down. No icon in the app's set
                  says "end the call" and nothing else. */}
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 14c5-5 13-5 18 0l-2.5 2.5-3-1.5v-2.5c-2-.7-5-.7-7 0V15l-3 1.5z" />
              </svg>
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <article className="glass call2-pane">
            <h2 className="call2-pane__h">{t('How the session goes')}</h2>
            <ol className="call2-steps">
              <li>
                <span className={`call2-steps__n${debrief ? '' : ' call2-steps__n--on'}`}>1</span>
                <span className="call2-steps__t">
                  <strong>{t('Welcome')}</strong>
                  <span>{t('You talk about how you are.')}</span>
                </span>
              </li>
              <li>
                <span className="call2-steps__n">2</span>
                <span className="call2-steps__t">
                  <strong>{t('Treatment')}</strong>
                  <span>{t('Guided audio, with your eyes closed.')}</span>
                </span>
              </li>
              <li>
                <span className={`call2-steps__n${debrief ? ' call2-steps__n--on' : ''}`}>3</span>
                <span className="call2-steps__t">
                  <strong>{t('Final conversation')}</strong>
                  <span>{t('You talk about what you felt.')}</span>
                </span>
              </li>
            </ol>
          </article>

          <article className="glass call2-pane">
            <span style={{ fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--warn)' }}>
              {t('Next')}
            </span>
            <p className="call2-note" style={{ color: 'var(--ink)' }}>
              {debrief
                ? t('Debrief with your therapist')
                : t('Your therapist will start the session when you are both ready.')}
            </p>
          </article>
        </div>
      </div>

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
    </Shell>
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

  const cls = compact ? 'call2-self' : 'call__selfview'
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
    <div className="app-frame call su-studio su-dark">
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
  addressedAs,
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
  addressedAs: Addressee
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
  /* No fallback protocol. Substituting GL-ANX 1.1 for a protocol the catalog
     no longer has meant a therapist and a patient could sit through a session
     neither of them had chosen. */
  const protocol = entry ?? getProtocol(treatment.protocolCode)
  /* THIS device plays the published mixdown for the version the therapist
     chose. Nothing about the treatment audio travels over the call. */
  const audioUrl = protocol ? audioUrlFor(protocol, treatment.duration, locale, addressedAs) : undefined
  const [audioFailed, setAudioFailed] = useState<string | null>(null)
  const total = demoSeconds ?? (protocol ? versionLengthSeconds(protocol, treatment.duration) : treatment.duration * 60)

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

  /* No "Part 3 of 6" any more. The mockup strips this screen to the line
     that asks you to close your eyes, and a phase counter is the one thing
     on it that would make you open them to check. The phases still run; they
     are simply not announced. */

  return (
    <div className="gl-root gl-root--deep gl-root--dim treat2">
      {/* No rail. For these minutes there is nowhere else to be. */}
      <span className="glass treat2__chip">
        <i aria-hidden="true" />
        {t('Treatment · guided by {name}', { name: therapist.name })}
      </span>

      <TherapistThumb call={call} name={therapist.name} />

      {/* The mockup's orb, copied. NOT the breathing pacer: that was retired
          because every protocol is voice-guided, and a disc that expands and
          contracts in front of somebody with their eyes closed is a
          breathing cue whether it means to be one or not. This one holds
          still; only its glow drifts, over twelve seconds. */}
      <svg className="treat2__orb" viewBox="0 0 280 280" width="360" height="360" aria-hidden="true">
        <circle cx="140" cy="140" r="134" fill="none" stroke="rgba(250,248,223,.08)" />
        <circle cx="140" cy="140" r="110" fill="rgba(61,177,137,.06)" stroke="rgba(183,219,173,.16)" />
        <circle cx="140" cy="140" r="84" fill="rgba(61,177,137,.12)" stroke="rgba(183,219,173,.26)" />
        <circle cx="140" cy="140" r="56" fill="#3DB189" opacity=".55" />
        <path d="M10 140c18-24 36 24 54 0s36 24 54 0 36 24 54 0 36 24 54 0 36 24 54 0" fill="none" stroke="#F4F0BE" strokeWidth="1.4" opacity=".35" />
      </svg>

      <p className="treat2__line">{t('Close your eyes and follow the sound.')}</p>
      <p className="treat2__sub">{t('The screen dims by itself.')}</p>

      <div className="treat2__state">
        {intervening && <>{t('Your therapist is speaking')}</>}
        {!intervening && paused && <>{t('Paused by your therapist')}</>}
        {!intervening && !paused && audioFailed && <>{t('The recorded audio could not be played, so this is the ambient bed.')}</>}
      </div>

      <div className="treat2__hud">
        <div className="treat2__bar" aria-hidden="true">
          <span style={{ width: `${Math.min(100, (elapsed / total) * 100)}%` }} />
        </div>
        <div className="treat2__times">
          <span>{fmt(elapsed)}</span>
          <span>{t(durationLabel(treatment.duration))} · {fmt(total)}</span>
        </div>
      </div>

      {/* The person's only control is leaving, and it asks first, because
          leaving ends the session with their therapist. Pausing and stopping
          belong to the professional and to nobody else. */}
      <div className="treat2__acts">
        <button type="button" className="glass-btn treat2__pause" onClick={onLeaveRequested}>{t('Leave')}</button>
      </div>

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
  )
}

/** The therapist stays on screen through the treatment — low opacity, small,
    but present. A voice with no face is a worse place to close your eyes. */
function TherapistThumb({ call, name }: { call: Call; name: string }) {
  const { t } = useI18n()
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => { if (ref.current) ref.current.srcObject = call.remoteStream }, [call.remoteStream])

  return (
    <div className="glass treat2__thumb">
      {call.remoteStream ? (
        <video ref={ref} autoPlay playsInline />
      ) : (
        <span className="treat2__disc" aria-hidden="true">{initialsOf(name)}</span>
      )}
      <span>{t('live')}</span>
    </div>
  )
}
