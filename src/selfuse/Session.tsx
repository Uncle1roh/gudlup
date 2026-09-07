/* ============================================================================
   Self Use — the session experience (SES-1 … SES-5)

     SES-1  Pre-session card      set the pace before anything starts
     SES-2  Stereo check          FIRST session only; later ones check silently
     SES-3  Immersive player      eyes closed, no interaction needed after play
     SES-4  Post-session          Quick / Standard
     SES-5  Post-session          Deep — one extra re-orientation line

   The player is the screen the rest of the app exists to protect. Its rules:
   · Nothing is required of the person after they press play.
   · The screen follows the SIX PHASES: dim to near-black over Phase 1, the
     breathing orb in Phase 2, black through Phases 3–5, brighten over Phase 6.
   · Controls fade after 30 seconds; a tap brings them back.
   · The tab bar is hidden for the whole session (the shell handles that).
   · Leaving early asks first, and says plainly that progress is not saved.

   Phase 6 is re-orientation: NO metrics, NO celebration, NO pop-up. The
   post-session screen fades in only after the audio has finished.
   ============================================================================ */

import { useCallback, useEffect, useRef, useState } from 'react'
import { BreathingOrb } from '../components/BreathingOrb'
import { SessionPlayer, playEarTone } from '../lib/audio'
import { useI18n } from '../i18n'
import { getProtocol, versionLengthSeconds } from '../data/protocols'
import { durationLabel } from '../data/selfuse'
import { audioUrlFor, type ResolvedSession } from '../data/liveCatalog'
import type { Duration } from '../types/domain'
import { VAS_OPTIONS } from '../data/assessments'
import { Icon } from './icons'

/* A catalog row can arrive without phases (an import that only carried a
   timeline). The standard six-phase split keeps the player's screen
   behaviour correct rather than dividing by an empty list. */
const STANDARD_FRACTIONS = [0.11, 0.16, 0.16, 0.38, 0.1, 0.09]

export type PostFeedback = 'relaxed' | 'neutral' | 'restless' | 'support'

export interface SessionOutcome {
  slug: string
  duration: Duration
  startedAt: number
  completedAt: number
  /** false when the person ended it early from the player. */
  completed: boolean
  feedback?: PostFeedback
  /**
   * The VAS pair, 1–5, tapped before and after.
   *
   * One measure, two moments, the same scale — the delta only means something
   * because the second reading is the same question as the first. Both are
   * required to open the screen's primary button, which is what "mandatory,
   * one tap" comes to in practice.
   */
  vasPre?: number
  vasPost?: number
}

/**
 * The face scale, shared by the two ends of a session.
 *
 * Icons rather than numbers on purpose: a 100 mm line needs motor precision a
 * phone does not give, and a number invites the person to score themselves.
 * The system stores 1–5; the person sees a face. The label is read by screen
 * readers and never printed beside the icon.
 */
function VasRow({ value, onPick }: { value: number | null; onPick: (v: number) => void }) {
  const { t } = useI18n()
  return (
    <div className="vas-row" role="group" aria-label={t('How do you feel right now?')}>
      {VAS_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          className="vas-opt"
          aria-pressed={value === o.value}
          aria-label={t(o.label)}
          title={t(o.label)}
          onClick={() => onPick(o.value)}
        >
          <span aria-hidden="true"><Icon name={o.icon} size={26} /></span>
        </button>
      ))}
    </div>
  )
}

interface SessionFlowProps {
  session: ResolvedSession
  duration: Duration
  /** First session ever → run the stereo check. */
  needsStereoCheck: boolean
  /** Pathway context line under the feedback row, e.g. "3 of 5 this week." */
  contextLine?: string
  /** Testing hook: shorten every session to N seconds. null = full length. */
  demoSeconds?: number | null
  /** Called when the check finishes. `passed` is false when the person tapped
      "continue anyway" after a wrong ear — the session still starts, but the
      check is not retired. */
  onStereoChecked: (passed: boolean) => void
  onDone: (o: SessionOutcome) => void
  onCancel: () => void
  /** "Need support" — hands control to the Safety Gateway Level 3. */
  onNeedSupport: () => void
}

type Stage = 'pre' | 'stereo' | 'play' | 'post'

export function SessionFlow(props: SessionFlowProps) {
  const { session, duration, needsStereoCheck, onCancel } = props
  const [stage, setStage] = useState<Stage>('pre')
  const startedAt = useRef(Date.now())
  const completed = useRef(true)
  const vasPre = useRef<number | null>(null)

  function begin(pre: number) {
    vasPre.current = pre
    startedAt.current = Date.now()
    setStage(needsStereoCheck ? 'stereo' : 'play')
  }

  if (stage === 'pre') {
    return <PreSession session={session} duration={duration} onBegin={begin} onCancel={onCancel} />
  }
  if (stage === 'stereo') {
    return (
      <StereoCheck
        onDone={(passed) => { props.onStereoChecked(passed); setStage('play') }}
        onBack={onCancel}
      />
    )
  }
  if (stage === 'play') {
    return (
      <ImmersiveSession
        session={session}
        duration={duration}
        demoSeconds={props.demoSeconds ?? null}
        onEnd={(finished) => { completed.current = finished; setStage('post') }}
      />
    )
  }
  return (
    <PostSession
      session={session}
      duration={duration}
      contextLine={props.contextLine}
      onFeedback={(f, post) => {
        if (f === 'support') { props.onNeedSupport(); return }
        props.onDone({
          slug: session.slug,
          duration,
          startedAt: startedAt.current,
          completedAt: Date.now(),
          completed: completed.current,
          feedback: f ?? undefined,
          vasPre: vasPre.current ?? undefined,
          vasPost: post ?? undefined,
        })
      }}
    />
  )
}

/* ------------------------------------------------------------- SES-1 ----- */

function PreSession({
  session,
  duration,
  onBegin,
  onCancel,
}: {
  session: ResolvedSession
  duration: Duration
  onBegin: (vasPre: number) => void
  onCancel: () => void
}) {
  const { t } = useI18n()
  const [vas, setVas] = useState<number | null>(null)
  return (
    <div className="app-frame su-studio">
      <div className="screen screen--center pre-session">
        <div className="screen__body pre-session__body">
          <span className="pre-session__len">{t('{n} min', { n: duration })}</span>
          <h2 className="display">{t(session.name)}</h2>
          <ul className="pre-session__list">
            <li>{t('Find a quiet place.')}</li>
            <li>{t('Put on your headphones.')}</li>
            <li>{t('Get comfortable.')}</li>
          </ul>
          <p className="small muted"><Icon name="headphones" size={15} /> {t('Headphones recommended')}</p>

          <div className="vas-block">
            <p className="small">{t('How do you feel right now?')}</p>
            <VasRow value={vas} onPick={setVas} />
          </div>
        </div>
        <div className="screen__footer btn-stack">
          <button className="btn btn--primary" disabled={vas == null} onClick={() => onBegin(vas as number)}>
            {t('Begin Session')}
          </button>
          <button className="btn btn--quiet" onClick={onCancel}>{t('Cancel')}</button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- SES-2 ----- */

/**
 * Two ears, in order. Answering correctly moves on by itself; a wrong or mono
 * answer warns and still lets the person continue — a headphone problem is a
 * quality problem, not a safety one.
 */
function StereoCheck({ onDone, onBack }: { onDone: (passed: boolean) => void; onBack: () => void }) {
  const { t } = useI18n()
  const [ear, setEar] = useState<'left' | 'right'>('left')
  const [warn, setWarn] = useState(false)
  const [started, setStarted] = useState(false)

  const play = useCallback((side: 'left' | 'right') => playEarTone(side), [])

  /* The tone is played from a TAP, never from an effect on mount.
     Browsers only let audio start inside a user-gesture call stack; an
     auto-played tone comes out of a suspended context and is silent, so the
     person is asked about a sound that never happened. The first tap starts
     the check, and moving to the second ear plays from inside that same tap. */
  function begin() {
    setStarted(true)
    play('left')
  }

  function answer(side: 'left' | 'right') {
    if (side !== ear) { setWarn(true); return }
    setWarn(false)
    if (ear === 'left') { setEar('right'); play('right'); return }
    onDone(true)
  }

  return (
    <div className="app-frame su-studio">
      <div className="screen screen--center stereo">
        <div className="screen__body stereo__body">
          <div className="stereo__art" aria-hidden="true"><Icon name="headphones" size={54} /></div>
          <h2 className="display">{t("Let's check your headphones")}</h2>
          {!started ? (
            <>
              <p className="lead">{t('Put your headphones on. We will play a short tone in one ear.')}</p>
              <button className="btn btn--primary" onClick={begin}>{t('Play the tone')}</button>
            </>
          ) : (
            <>
              <p className="lead">{t('Which ear hears the tone?')}</p>
              <div className="chip-row stereo__answers">
                <button className="chip" onClick={() => answer('left')}>
                  <span className="chip__label">{t('Left')}</span>
                </button>
                <button className="chip" onClick={() => answer('right')}>
                  <span className="chip__label">{t('Right')}</span>
                </button>
              </div>
              <button className="btn btn--quiet" onClick={() => play(ear)}>{t('Play the tone again')}</button>
            </>
          )}

          {warn && (
            <div className="stereo__warn fade-in">
              <p className="small">
                {t('We recommend wired stereo headphones. Continue anyway?')}
              </p>
              <div className="chip-row">
                {/* Continuing is allowed — a headphone problem is a quality
                    problem, not a safety one — but it is NOT recorded as a
                    pass, so the check comes back next time instead of being
                    silently retired for good. */}
                <button className="btn btn--ghost" onClick={() => onDone(false)}>{t('Continue')}</button>
                <button className="btn btn--quiet" onClick={onBack}>{t('Go back')}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- SES-3 ----- */

function fmt(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Which of the six phases `elapsed` falls in, and how far through it is. */
function phaseAt(elapsed: number, total: number, fractions: number[]): { index: number; within: number } {
  let acc = 0
  for (let i = 0; i < fractions.length; i += 1) {
    const span = fractions[i] * total
    if (elapsed < acc + span || i === fractions.length - 1) {
      return { index: i, within: span > 0 ? Math.min(1, (elapsed - acc) / span) : 1 }
    }
    acc += span
  }
  return { index: fractions.length - 1, within: 1 }
}

const CONTROLS_FADE_MS = 30_000

function ImmersiveSession({
  session,
  duration,
  demoSeconds,
  onEnd,
}: {
  session: ResolvedSession
  duration: Duration
  demoSeconds: number | null
  onEnd: (completed: boolean) => void
}) {
  const { t, locale } = useI18n()
  /*
   * The CATALOG ROW the session already carries is the authority, not the
   * runtime registry.
   *
   * `getProtocol()` reads a registry that is hydrated asynchronously from the
   * catalog. Until that lands — and for anything the hydration filtered out —
   * it returns the STATIC SEED, which has no `audioUrl` at all. Resolving
   * audio through it therefore played the placeholder bed even when a PO had
   * published a real mixdown, which is exactly the bug this fixes.
   */
  /* There is deliberately no last-resort protocol here. It used to fall back
     to GL-ANX 1.1, so a session whose protocol had been deleted, disabled or
     renamed played SOMETHING — a different protocol's phases over a
     placeholder bed — and looked like it had worked. Nothing is a safer
     outcome than the wrong thing played silently. */
  const protocol = session.entry ?? getProtocol(session.protocolCode)
  const audioUrl = protocol ? audioUrlFor(protocol, duration, locale) : undefined
  const total = demoSeconds ?? (protocol ? versionLengthSeconds(protocol, duration) : duration * 60)
  const fractions = protocol?.phases.length ? protocol.phases.map((p) => p.fraction) : STANDARD_FRACTIONS
  /* Set when a published file existed but would not play. */
  const [audioFailed, setAudioFailed] = useState<string | null>(null)

  const [started, setStarted] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [volume, setVolume] = useState(0.55)
  const [controls, setControls] = useState(true)
  const [confirmExit, setConfirmExit] = useState(false)

  const playerRef = useRef<SessionPlayer | null>(null)
  const tickRef = useRef<number | null>(null)
  const lastRef = useRef(0)
  const elapsedRef = useRef(0)
  const playingRef = useRef(false)
  const endedRef = useRef(false)
  const fadeRef = useRef<number | null>(null)

  const { index: phaseIdx, within } = phaseAt(elapsed, total, fractions)
  const phase = protocol?.phases[phaseIdx]
  const isBreath = phaseIdx === 1
  const isClosing = phaseIdx === fractions.length - 1

  /* Phase 1 dims to near-black; Phases 2–5 stay dark; Phase 6 brings the light
     back over its own length so nobody is startled awake by a bright screen. */
  const veil = phaseIdx === 0 ? Math.min(0.9, within * 0.9) : isClosing ? 0.9 * (1 - within) : 0.9

  const cleanup = useCallback(() => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
    if (fadeRef.current) { clearTimeout(fadeRef.current); fadeRef.current = null }
    playerRef.current?.stop()
    playerRef.current = null
    playingRef.current = false
  }, [])

  useEffect(() => cleanup, [cleanup])

  const armFade = useCallback(() => {
    setControls(true)
    if (fadeRef.current) clearTimeout(fadeRef.current)
    fadeRef.current = window.setTimeout(() => setControls(false), CONTROLS_FADE_MS)
  }, [])

  function loop() {
    const now = Date.now()
    const dt = (now - lastRef.current) / 1000
    lastRef.current = now
    if (!playingRef.current) return
    elapsedRef.current += dt
    if (elapsedRef.current >= total && !endedRef.current) {
      endedRef.current = true
      cleanup()
      onEnd(true)
      return
    }
    setElapsed(elapsedRef.current)
  }

  async function begin() {
    setStarted(true)
    const p = new SessionPlayer({
      audioUrl,
      volume,
      onFallback: (reason) => setAudioFailed(reason),
    })
    playerRef.current = p
    await p.play()
    playingRef.current = true
    setPlaying(true)
    lastRef.current = Date.now()
    tickRef.current = window.setInterval(loop, 200)
    armFade()
  }

  function toggle() {
    const p = playerRef.current
    if (!p) return
    if (playingRef.current) { p.pause(); playingRef.current = false; setPlaying(false) }
    else { void p.resume(); playingRef.current = true; setPlaying(true); lastRef.current = Date.now() }
    armFade()
  }

  function nudgeVolume(delta: number) {
    setVolume((v) => {
      const next = Math.min(1, Math.max(0, Number((v + delta).toFixed(2))))
      playerRef.current?.setVolume(next)
      return next
    })
    armFade()
  }

  function exitNow() {
    if (endedRef.current) return
    endedRef.current = true
    cleanup()
    onEnd(false)
  }

  // Backgrounding the app pauses rather than races the timer on.
  useEffect(() => {
    function onHidden() {
      if (document.hidden && playingRef.current) {
        playerRef.current?.pause()
        playingRef.current = false
        setPlaying(false)
        setControls(true)
      }
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [])

  /* Every hook above has run, so this return is safe. The session cannot be
     played: rather than substituting another protocol, say so. */
  if (!protocol) {
    return (
      <div className="app-frame su-studio">
        <div className="player">
          <div className="fade-in player__ready">
            <p className="lead player__readytext">
              {t('This session is not available at the moment. Your therapist or the Good Loop team can restore it.')}
            </p>
            <button className="btn btn--light player__begin" onClick={() => onEnd(false)}>{t('Back')}</button>
          </div>
        </div>
      </div>
    )
  }

  if (!started) {
    return (
      <div className="app-frame su-studio">
        <div className="player">
          <div className="fade-in player__ready">
            <BreathingOrb size={150} breathing={false} />
            <p className="lead player__readytext">
              {t("Find a comfortable position. Close your eyes when you're ready.")}
            </p>
            <button className="btn btn--light player__begin" onClick={begin}><Icon name="play" size={18} /> {t('Begin')}</button>
            {!audioUrl && (
              <p className="small player__placeholder">
                {t('No recorded voice is published for this length yet — this plays an ambient bed.')}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  const showControls = controls || !playing

  return (
    <div className="app-frame su-studio">
      <div className="player" onClick={armFade}>
        {/* The orb, for the WHOLE session, not only phase 2.
            It used to appear during the breathing phase and be replaced by a
            flat radial glow everywhere else, so a twelve-minute session was
            eleven minutes of a still screen. It is the one thing on here that
            says the session is running — it breathes while the audio plays and
            holds still when paused, which is also the honest signal. */}
        <div className="player__orb">
          <BreathingOrb size={216} breathing={playing} />
        </div>
        <div className="player__veil" style={{ opacity: veil }} />

        {isBreath && controls && !audioFailed && <div className="player__hint">{t('Breathe in…')}</div>}
        {audioFailed && controls && (
          <div className="player__hint player__hint--warn">
            {t('The recorded audio could not be played, so this is the ambient bed.')}
          </div>
        )}

        <div
          className="hud"
          style={{ opacity: showControls ? 1 : 0, pointerEvents: showControls ? 'auto' : 'none' }}
        >
          <div className="hud__top">
            <button
              className="hud__x"
              onClick={(e) => { e.stopPropagation(); setConfirmExit(true) }}
              aria-label={t('End session')}
            >
              <Icon name="close" size={18} />
            </button>
            <span className="hud__phase">{t('Phase {n}', { n: phaseIdx + 1 })}{phase ? ` · ${t(phase.name)}` : ''}</span>
            <span className="hud__spacer" aria-hidden="true" />
          </div>

          {/* The clock belongs UNDER the orb, at the size a person can read
              with their eyes half closed — it was in the top bar beside the
              phase label, where a 46px numeral has nowhere to go. */}
          <div className="hud__foot">
            <div className="hud__meta">
              <span className="hud__time">{fmt(elapsed)}</span>
              <span className="hud__sub">{t(session.name)} · {t('{n} min', { n: duration })}</span>
            </div>

            {/* Every phase at once, so the shape of the session is visible
                rather than only the one it is in. */}
            <div className="hud__ticks" aria-hidden="true">
              {fractions.map((f, i) => (
                <i
                  key={i}
                  style={{ flex: f }}
                  className={i < phaseIdx ? 'is-done' : i === phaseIdx ? 'is-now' : undefined}
                />
              ))}
            </div>

            <div className="hud__controls">
            <button
              className="hud__btn"
              onClick={(e) => { e.stopPropagation(); nudgeVolume(-0.1) }}
              aria-label={t('Volume down')}
            >
              −
            </button>
            <button
              className="hud__btn hud__btn--play"
              onClick={(e) => { e.stopPropagation(); toggle() }}
              aria-label={playing ? t('Pause') : t('Resume')}
            >
              <Icon name={playing ? 'pause' : 'play'} size={26} />
            </button>
            <button
              className="hud__btn"
              onClick={(e) => { e.stopPropagation(); nudgeVolume(0.1) }}
              aria-label={t('Volume up')}
            >
              +
            </button>
            </div>
          </div>
        </div>

        {confirmExit && (
          <div className="player__confirm" onClick={(e) => e.stopPropagation()}>
            <div className="player__confirmbox fade-in">
              <p>{t("End session early? Your progress won't be saved.")}</p>
              <div className="chip-row">
                <button className="btn btn--light" onClick={() => setConfirmExit(false)}>{t('Keep listening')}</button>
                <button className="btn btn--light" onClick={exitNow}>{t('End session')}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* --------------------------------------------------------- SES-4 / SES-5 -- */

function PostSession({
  session,
  duration,
  contextLine,
  onFeedback,
}: {
  session: ResolvedSession
  duration: Duration
  contextLine?: string
  onFeedback: (f: PostFeedback | null, vasPost: number | null) => void
}) {
  const { t } = useI18n()
  const [picked, setPicked] = useState<PostFeedback | null>(null)
  const [vas, setVas] = useState<number | null>(null)
  const isDeep = duration === 24

  function choose(f: PostFeedback) {
    setPicked(f)
    // Support hands over immediately rather than waiting for the person to
    // press on to the next screen first.
    if (f === 'support') onFeedback('support', vas)
  }

  return (
    <div className="app-frame su-studio">
      <div className="screen screen--center post fade-in">
        <div className="screen__body post__body">
          <h2 className="display">{t('Well done')}</h2>
          <p className="muted post__what">{t(session.name)} · {t('{n} min', { n: duration })}</p>
          {isDeep && <p className="lead post__reorient">{t('Take a moment before moving on.')}</p>}

          {/* ONE question, asked once.

              This screen used to ask the same thing twice: the VAS faces, and
              then a row of mood chips underneath — "How do you feel right
              now?" followed by "How are you feeling?". Two askings of one
              question read as not having listened to the first answer, and
              the second reading was never used for anything the first was not.

              The VAS is the half that stays, because it is the same scale as
              the one before the session and the delta between them is the
              only number here that means anything. */}
          <div className="vas-block">
            <p className="small">{t('How do you feel right now?')}</p>
            <VasRow value={vas} onPick={setVas} />
          </div>

          {/* What the chip row carried that the VAS cannot: the way out. It is
              not a mood option among four — asking someone to rank "I need
              support" beside "Relaxed" was always the wrong shape — it is a
              door, standing open. */}
          <button className="btn btn--quiet post__support" onClick={() => choose('support')}>
            <Icon name="support" size={16} /> {t('I need support')}
          </button>

          {contextLine && <p className="small muted post__context">{contextLine}</p>}
        </div>

        <div className="screen__footer">
          <button className="btn btn--primary" disabled={vas == null} onClick={() => onFeedback(picked, vas)}>
            {t('Back to Home')}
          </button>
        </div>
      </div>
    </div>
  )
}

export { durationLabel }
