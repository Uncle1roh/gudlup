import { useCallback, useEffect, useRef, useState } from 'react'
import { BreathingOrb } from '../components/BreathingOrb'
import { MoodScale } from '../components/MoodScale'
import { PostSession } from '../screens/PostSession'
import { VideoStage } from '../b2b/webrtc/VideoStage'
import { useVideoCall } from '../b2b/webrtc/useVideoCall'
import { SessionPlayer } from '../lib/audio'
import { getProtocol, versionLengthSeconds } from '../data/protocols'
import { makeMoodFromVas } from '../lib/vas'
import { useI18n } from '../i18n'
import type { ControlAction } from '../b2b/webrtc/signaling'
import type { Appointment } from '../data/scheduling'
import type { Duration, MoodCheck, SessionRecord } from '../types/domain'

interface PatientCallProps {
  appointment: Appointment
  demoSeconds: number | null
  /** Hands back a session record when the therapist played a protocol. */
  onDone: (record: SessionRecord | null) => void
}

type Stage = 'pre' | 'call' | 'post'

/**
 * The patient's side of a monitored session. Joins the therapist's room over
 * the same WebRTC signalling, then obeys the session-control cues: the protocol
 * audio is played HERE, locally, from the patient's own device — so the
 * binaural image survives, which it would not if the audio were streamed
 * through the (mono, echo-cancelled) call.
 */
export function PatientCall({ appointment, demoSeconds, onDone }: PatientCallProps) {
  const { t } = useI18n()
  const [stage, setStage] = useState<Stage>('pre')
  const [vasPre, setVasPre] = useState<MoodCheck | null>(null)

  const [playingCode, setPlayingCode] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [intervening, setIntervening] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  const player = useRef<SessionPlayer | null>(null)
  const startedAt = useRef(Date.now())
  const playedRef = useRef<{ code: string; duration: Duration } | null>(null)
  const elapsedRef = useRef(0)
  const pausedRef = useRef(false)

  pausedRef.current = paused

  const finish = useCallback(() => {
    player.current?.stop()
    player.current = null
    const played = playedRef.current
    if (!played || !vasPre) {
      onDone(null)
      return
    }
    setStage('post')
    // the record is completed in the post-session step, once the mood is in
  }, [onDone, vasPre])

  /** Cues from the therapist's console. */
  const onControl = useCallback((c: ControlAction) => {
    switch (c.action) {
      case 'play': {
        const p = getProtocol(c.protocolCode)
        if (!p) return
        const version = p.versions.find((v) => v.duration === c.durationMin) ?? p.versions[0]
        const url = version?.audioUrl?.['pt-BR']
        player.current?.stop()
        player.current = new SessionPlayer({ audioUrl: url, volume: 0.85 })
        void player.current.play()
        playedRef.current = { code: p.code, duration: (version?.duration ?? c.durationMin) as Duration }
        elapsedRef.current = 0
        setElapsed(0)
        setPaused(false)
        setPlayingCode(p.code)
        break
      }
      case 'pause':
        player.current?.pause()
        setPaused(true)
        break
      case 'resume':
        void player.current?.resume()
        setPaused(false)
        break
      case 'stop':
        player.current?.stop()
        player.current = null
        setPlayingCode(null)
        break
      case 'intervene':
        // the therapist opened the voice channel: duck the bed, don't stop it
        if (c.on) player.current?.pause()
        else void player.current?.resume()
        setIntervening(c.on)
        setPaused(c.on)
        break
      case 'end':
        finish()
        break
    }
  }, [finish])

  const call = useVideoCall({
    roomId: appointment.id,
    role: 'patient',
    autoAnswer: true,
    onControl,
  })

  /* session clock, only while a protocol is actually playing */
  useEffect(() => {
    const iv = window.setInterval(() => {
      if (!player.current || pausedRef.current) return
      elapsedRef.current += 0.25
      setElapsed(elapsedRef.current)
    }, 250)
    return () => {
      window.clearInterval(iv)
      player.current?.stop()
    }
  }, [])

  const protocol = playingCode ? getProtocol(playingCode) : undefined
  const total = protocol
    ? (demoSeconds ?? versionLengthSeconds(protocol, playedRef.current?.duration ?? 24))
    : 0
  const pct = total > 0 ? Math.min(100, (elapsed / total) * 100) : 0

  /* ---- 1 · pre-session check-in ---- */
  if (stage === 'pre') {
    return (
      <div className="app-frame">
        <div className="screen">
          <div className="screen__body" style={{ justifyContent: 'center', gap: 28 }}>
            <div className="stack-md" style={{ textAlign: 'center' }}>
              <span className="eyebrow">{t('Session with {name}', { name: appointment.therapistName ?? '' })}</span>
              <h2 className="display">{t('How are you right now?')}</h2>
              <p className="muted small">{t('0 = not well at all · 10 = very well')}</p>
            </div>
            <MoodScale
              value={vasPre?.vas ?? null}
              onChange={(v) => {
                setVasPre(makeMoodFromVas(v))
                startedAt.current = Date.now()
                window.setTimeout(() => setStage('call'), 200)
              }}
            />
            <button className="btn btn--quiet" onClick={() => onDone(null)}>{t('Back')}</button>
          </div>
        </div>
      </div>
    )
  }

  /* ---- 3 · post-session mood, then hand the record back ---- */
  if (stage === 'post') {
    const played = playedRef.current
    return (
      <div className="app-frame">
        <PostSession
          vasPre={vasPre ?? makeMoodFromVas(5)}
          doneLabel="Back to home"
          onFinish={(post) => {
            onDone(played ? {
              id: `s-${startedAt.current}`,
              protocolCode: played.code,
              duration: played.duration,
              startedAt: startedAt.current,
              completedAt: Date.now(),
              vasPre: vasPre ?? undefined,
              vasPost: post ?? undefined,
            } : null)
          }}
        />
      </div>
    )
  }

  /* ---- 2 · the call itself ---- */
  return (
    <div className="pcall">
      <div className="pcall__bar">
        <span className="pcall__who">{appointment.therapistName ?? t('Your therapist')}</span>
        {playingCode && <span className="pcall__proto">{protocol?.title ?? playingCode}</span>}
        {intervening && <span className="pcall__flag">🔴 {t('your therapist is speaking')}</span>}
      </div>

      {playingCode ? (
        /* immersive: the session is playing on THIS device; the therapist is
           a small window so the room stays present */
        <div className="pcall__immersive">
          <BreathingOrb size={190} breathing={!paused} />
          <p className="pcall__hint">
            {paused ? t('Paused by your therapist') : t('Close your eyes and follow the sound.')}
          </p>
          <div className="pcall__progress"><div className="pcall__progressfill" style={{ width: `${pct}%` }} /></div>
          <div className="pcall__pip">
            <VideoStage call={call} peerName={appointment.therapistName ?? t('Your therapist')} answerOnly intervening={intervening} />
          </div>
        </div>
      ) : (
        <div className="pcall__stage">
          <VideoStage call={call} peerName={appointment.therapistName ?? t('Your therapist')} answerOnly intervening={intervening} />
        </div>
      )}

      <button className="btn btn--quiet pcall__leave" onClick={finish}>{t('Leave the session')}</button>
    </div>
  )
}
