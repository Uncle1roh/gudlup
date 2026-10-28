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

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { BreathingOrb } from '../components/BreathingOrb'
import { SessionPlayer, playEarTone } from '../lib/audio'
import {
  startCheck, retryCheck, tonePlayed, answerEar, currentEar, checkPassed, toneNumber,
  type Ear, type StereoState,
} from '../lib/stereoCheck'
import { FeatureOff } from '../app/FeatureOff'
import { useFeature } from '../app/useFeature'
import { useI18n } from '../i18n'
import { useLegal } from '../legal/LegalContext'
import { getProtocol, versionLengthSeconds } from '../data/protocols'
import { durationLabel } from '../data/selfuse'
import { audioPick, type ResolvedSession } from '../data/liveCatalog'
import type { Addressee } from '../tts/voiceLang'
import type { Duration } from '../types/domain'
import { VAS_OPTIONS } from '../data/assessments'
import { Icon } from './icons'
import { coverFor, sessionGround } from './artwork'
import { useBackLayer } from './backStack'

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
  /** When the audio stopped — the end of listening, not the moment the
      post-session screen was answered. */
  endedAt: number
  /** Seconds the audio actually played: pauses, the background and seeks
      add nothing. What the server credits Points from (capped there at the
      nominal length). */
  listenedSec: number
  /** The stereo check ran and passed before this session. */
  stereoChecked: boolean
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
  /** How this person is addressed — which of the two recordings to play. */
  addressedAs: Addressee
  /** PLY-4: the link every self-guided session ends with (M1-06). */
  onFindProfessional: () => void
}

/* The safe-use note (PLY-1, CRS-06) is shown once, before the first audio
   session ever, on this device. A first-occurrence note is static in the
   sense that matters: every person gets it on the same trigger, and nothing
   about the person is inferred. */
const SAFE_USE_KEY = 'gl.legal.safeuse.v1'
function safeUseSeen(): boolean {
  try { return localStorage.getItem(SAFE_USE_KEY) === '1' } catch { return true }
}
function markSafeUseSeen(): void {
  try { localStorage.setItem(SAFE_USE_KEY, '1') } catch { /* storage unavailable */ }
}

type Stage = 'pre' | 'stereo' | 'play' | 'post'

/* A session is a dark room on purpose: the screen goes out, the eyes close.
   `su-dark` keeps the night palette on every screen of the flow even when the
   rest of the app is set to daylight — see selfuse-studio.css § 06. */
const SESSION_FRAME = 'app-frame su-studio su-dark'

/**
 * Every screen of the session flow, standing on the protocol's own cover.
 *
 * The flow used to paint itself flat `su-dark` while the page behind it was
 * the surface's photograph (ui2/shell.css) — two grounds, meeting at the edge
 * of the frame. There is one now, and it is the picture of the session you
 * are about to hear, darkened enough to read on (`sessionGround`).
 *
 * The style sits on the ELEMENT, so leaving the session takes the standard
 * ground back by itself: there is no global to set and no cleanup to forget.
 */
function SessionFrame({ ground, children }: { ground: CSSProperties; children: ReactNode }) {
  return <div className={`${SESSION_FRAME} su-session`} style={ground}>{children}</div>
}

/** The cover of the session being played, as a full-bleed ground. */
function useSessionGround(session: ResolvedSession): CSSProperties {
  return useMemo(
    () => sessionGround(coverFor(session.slug, session.theme, session.coverUrl)),
    [session.slug, session.theme, session.coverUrl],
  )
}

export function SessionFlow(props: SessionFlowProps) {
  const { session, duration, needsStereoCheck, onCancel } = props
  /* The player kill switch. Checked HERE, above every stage, because this is
     the one door into playback: the pre-session screen, the stereo check and
     the player itself are all behind it. */
  const playerOn = useFeature('player')
  const ground = useSessionGround(session)
  const [stage, setStage] = useState<Stage>('pre')
  /* Before the audio starts, back is the screen's own back: leave the session.
     While it plays, the player catches it (below). Afterwards there is nothing
     to go back TO — the session happened — so the press is caught and the
     screen stays where the person can still answer how it went. */
  useBackLayer(true, () => {
    if (stage === 'pre' || stage === 'stereo') onCancel()
  })
  const startedAt = useRef(Date.now())
  const completed = useRef(true)
  const endedAt = useRef(0)
  const listenedSec = useRef(0)
  const stereoChecked = useRef(false)
  const vasPre = useRef<number | null>(null)
  /* No "other language / other form" notice any more: a person is offered
     only versions recorded in their language and their form (owner's rule,
     2026-10-21; playableDurations + audioPick in data/liveCatalog). */
  /* BELOW every hook, never above one: flipping the switch changes this
     branch, and a conditional return over a useRef would change the hook
     count between renders and take the whole screen down with it. */
  if (!playerOn) return <FeatureOff area="player" onBack={onCancel} />

  function begin(pre: number | null) {
    vasPre.current = pre
    startedAt.current = Date.now()
    setStage(needsStereoCheck ? 'stereo' : 'play')
  }

  if (stage === 'pre') {
    return (
      <PreSession
        session={session}
        duration={duration}
        onBegin={begin}
        onCancel={onCancel}
      />
    )
  }
  if (stage === 'stereo') {
    return (
      <StereoCheck
        ground={ground}
        onDone={(passed) => { stereoChecked.current = passed; props.onStereoChecked(passed); setStage('play') }}
        onBack={onCancel}
      />
    )
  }
  if (stage === 'play') {
    return (
      <ImmersiveSession
        session={session}
        duration={duration}
        addressedAs={props.addressedAs}
        demoSeconds={props.demoSeconds ?? null}
        onEnd={(finished, listened) => {
          completed.current = finished
          endedAt.current = Date.now()
          listenedSec.current = listened
          setStage('post')
        }}
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
          endedAt: endedAt.current || Date.now(),
          listenedSec: Math.round(listenedSec.current),
          stereoChecked: stereoChecked.current,
          feedback: f ?? undefined,
          vasPre: vasPre.current ?? undefined,
          vasPost: post ?? undefined,
        })
      }}
      onFindProfessional={props.onFindProfessional}
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
  onBegin: (vasPre: number | null) => void
  onCancel: () => void
}) {
  const { t } = useI18n()
  const { m } = useLegal()
  const [vas, setVas] = useState<number | null>(null)
  const [safeNote, setSafeNote] = useState(() => !safeUseSeen())
  const ground = useSessionGround(session)
  return (
    <SessionFrame ground={ground}>
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

          {/* Said before it plays, not discovered during it. A protocol gets
              its second recording when it is made; until then this is the
              honest version of "we only have one". */}
          {/* PLY-1 — once, before the first audio session (Tier C). */}
          {safeNote && (
            <div className="legal-note legal-note--safety" role="note">
              <p className="legal-note__text">{m('PLY-1')}</p>
              <button type="button" className="legal-note__ok" onClick={() => { markSafeUseSeen(); setSafeNote(false) }}>{t('OK')}</button>
            </div>
          )}

          {/* PLY-3 — optional, skippable, shown back only as the person's own
              history; never compared to a threshold, never labelled (M1-08).
              The wording follows PLY-3 on the register's five-face scale. */}
          <div className="vas-block">
            <p className="small">{t('How settled do you feel? — optional.')}</p>
            <VasRow value={vas} onPick={setVas} />
          </div>
        </div>
        <div className="screen__footer btn-stack">
          <button className="btn btn--primary" onClick={() => onBegin(vas)}>
            {t('Begin Session')}
          </button>
          <button className="btn btn--quiet" onClick={onCancel}>{t('Cancel')}</button>
        </div>
      </div>
    </SessionFrame>
  )
}

/* ------------------------------------------------------------- SES-2 ----- */

/**
 * Two ears, in an order drawn fresh each attempt, and both have to be right.
 *
 * The machine is in `lib/stereoCheck.ts`, with the reasoning for every rule
 * and the tests that hold them. What lives here is the screen: one question
 * at a time, each one visibly its own, and the tone played from inside the
 * tap that asked for it — browsers start audio only in a user-gesture call
 * stack, so a tone played from an effect comes out of a suspended context,
 * silent, while the screen asks what you heard.
 *
 * There is no way past this into the session except passing it. A wrong
 * answer used to offer "Continue anyway", which meant the check was advice;
 * the only other door is Back, which leaves the session altogether.
 */
function StereoCheck({ ground, onDone, onBack }: { ground: CSSProperties; onDone: (passed: boolean) => void; onBack: () => void }) {
  const { t } = useI18n()
  const [check, setCheck] = useState<StereoState>(() => startCheck())
  /* No audio on this machine at all — the tone cannot be produced, so the
     screen says that instead of asking which ear heard nothing. */
  const [noAudio, setNoAudio] = useState(false)

  const playCurrent = useCallback((s: StereoState) => {
    const ear = currentEar(s)
    if (!ear) return s
    const ok = playEarTone(ear)
    setNoAudio(!ok)
    return ok ? tonePlayed(s) : s
  }, [])

  function begin() { setCheck((s) => playCurrent(s)) }
  function again() { const ear = currentEar(check); if (ear) setNoAudio(!playEarTone(ear)) }

  function answer(side: Ear) {
    setCheck((s) => {
      const next = answerEar(s, side)
      if (checkPassed(next)) onDone(true)
      return next
    })
  }

  const asking = check.phase === 'asking'

  return (
    <SessionFrame ground={ground}>
      <div className="screen screen--center stereo">
        <div className="screen__body stereo__body">
          <div className="stereo__art" aria-hidden="true"><Icon name="headphones" size={54} /></div>
          <h2 className="display">{t("Let's check your headphones")}</h2>

          {check.phase === 'intro' && (
            <>
              <p className="lead">{t('Put your headphones on. We will play a short tone in one ear, then in the other — and you tell us which.')}</p>
              <button className="btn btn--primary" onClick={begin}>{t('Play the tone')}</button>
            </>
          )}

          {asking && (
            <>
              {/* WHICH of the two questions this is. Without it the second
                  one looked like the first and the check read as one. */}
              <span className="stereo__step">
                {t('Tone {n} of 2', { n: toneNumber(check) })}
              </span>
              <p className="lead">{t('Which ear hears the tone?')}</p>
              <div className="chip-row stereo__answers">
                <button className="chip" onClick={() => answer('left')}>
                  <span className="chip__label">{t('Left')}</span>
                </button>
                <button className="chip" onClick={() => answer('right')}>
                  <span className="chip__label">{t('Right')}</span>
                </button>
              </div>
              <button className="btn btn--quiet" onClick={again}>{t('Play the tone again')}</button>
            </>
          )}

          {check.phase === 'between' && (
            <>
              {/* The first answer is ACKNOWLEDGED. Which ear it was is not
                  named: saying "left: correct" would hand over the order,
                  and the order is the thing the next attempt reshuffles. */}
              <p className="lead stereo__ok">{t('Correct. One more.')}</p>
              <p className="small muted">{t('The next tone is in the other ear.')}</p>
              <button className="btn btn--primary" onClick={begin}>{t('Play the second tone')}</button>
            </>
          )}

          {check.phase === 'failed' && (
            <div className="stereo__warn fade-in">
              <p className="lead">{t('That was the other ear.')}</p>
              <p className="small">
                {check.misses === 1
                  ? t('Check that both sides are plugged in and worn the right way round, then try again.')
                  : t('Wired stereo headphones work best. The session moves between your ears, so it needs both of them working.')}
              </p>
              <div className="chip-row">
                <button className="btn btn--primary" onClick={() => setCheck((s) => retryCheck(s))}>{t('Try again')}</button>
                <button className="btn btn--quiet" onClick={onBack}>{t('Go back')}</button>
              </div>
            </div>
          )}

          {noAudio && (
            <p className="small stereo__warn">
              {t('This device cannot play a sound right now, so the check cannot run.')}
            </p>
          )}
        </div>
      </div>
    </SessionFrame>
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
  addressedAs,
  onEnd,
}: {
  session: ResolvedSession
  duration: Duration
  demoSeconds: number | null
  addressedAs: Addressee
  onEnd: (completed: boolean, listenedSec: number) => void
}) {
  const { t, locale } = useI18n()
  const ground = useSessionGround(session)
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
  /* The recording that addresses this person — and whether it is the one
     they asked for. A protocol voiced for a man and not yet for a woman is
     still played, because an empty library is worse than a mismatched
     pronoun; `exact` is what lets the screen say so instead of letting her
     find out by being called "pronto". */
  const pick = protocol ? audioPick(protocol, duration, locale, addressedAs) : undefined
  const audioUrl = pick?.url
  const total = demoSeconds ?? (protocol ? versionLengthSeconds(protocol, duration) : duration * 60)
  const fractions = protocol?.phases.length ? protocol.phases.map((p) => p.fraction) : STANDARD_FRACTIONS
  /* Set when a published file existed but would not play. */
  const [audioFailed, setAudioFailed] = useState<string | null>(null)

  const [started, setStarted] = useState(false)
  const startedRef = useRef(false)
  startedRef.current = started
  const [playing, setPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [volume, setVolume] = useState(0.55)
  const [controls, setControls] = useState(true)
  const [confirmExit, setConfirmExit] = useState(false)
  /* The ✕ asks before it ends a session, so the back gesture asks too — and a
     second back, on that question, is "keep listening", the way back dismisses
     any dialog. A swipe must never end a session outright. */
  useBackLayer(true, () => {
    /* Nothing has started yet (the "Begin" screen, or a session that cannot
       play): there is nothing to interrupt, so back is that screen's Back. */
    if (!startedRef.current) { onEnd(false, 0); return }
    setConfirmExit((open) => !open)
  })

  /* While a finger (or the keyboard) is on the position control, the clock
     shows where it is being moved TO, not where the audio still is. Null
     when nobody is holding it. */
  const [scrubTo, setScrubTo] = useState<number | null>(null)

  const playerRef = useRef<SessionPlayer | null>(null)
  const tickRef = useRef<number | null>(null)
  const lastRef = useRef(0)
  const elapsedRef = useRef(0)
  /* Seconds of audio actually heard. Not elapsedRef: a seek moves that, and
     skipping to the end is not listening to the end. One tick never counts
     for more than a second, so a stalled timer cannot credit the stall. */
  const listenedRef = useRef(0)
  const playingRef = useRef(false)
  const endedRef = useRef(false)
  const fadeRef = useRef<number | null>(null)

  /* The position the screen is showing: where the session is, or where it is
     being dragged to. */
  const shown = scrubTo ?? elapsed
  const { index: phaseIdx, within } = phaseAt(shown, total, fractions)
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
    listenedRef.current += Math.min(dt, 1)
    if (elapsedRef.current >= total && !endedRef.current) {
      endedRef.current = true
      cleanup()
      onEnd(true, listenedRef.current)
      return
    }
    setElapsed(elapsedRef.current)
    /* Keep the OS progress bar honest. Cheap, and it is what makes the lock
       screen look like a real player rather than a notification. */
    playerRef.current?.reportPosition(elapsedRef.current)
  }

  async function begin() {
    setStarted(true)
    const p = new SessionPlayer({
      audioUrl,
      volume,
      onFallback: (reason) => setAudioFailed(reason),
      /* What the lock screen shows once the screen goes dark — which is the
         normal way this product is used, not an edge case. The session's own
         name, never the protocol code: a person reads "Calma e sicurezza",
         not "GL-ANX 1.1". */
      nowPlaying: {
        title: t(session.name),
        artist: 'Good Loop',
        durationSec: total,
      },
      onSeekRequest: (sec) => seekRef.current(sec),
    })
    playerRef.current = p
    await p.play()
    playingRef.current = true
    setPlaying(true)
    lastRef.current = Date.now()
    tickRef.current = window.setInterval(loop, 200)
    armFade()
  }

  /* ---- moving within the session ----
     A guided protocol has a shape, and for a long time this had no position
     control at all for that reason: you started at the beginning and you
     listened. What that meant in practice was that a person who fell asleep,
     or was interrupted at minute nine, had one option — begin again. The
     shape survives being re-entered; twelve minutes of a person's evening
     does not survive being spent twice.

     So: the bar is draggable, and it ends one second short of the end. A
     drag is a way to move inside a session, never a way to finish one — the
     session completes by being listened to, or not at all. */
  const SKIP_SEC = 15
  const seekTo = useCallback((sec: number) => {
    const at = Math.max(0, Math.min(total - 1, sec))
    elapsedRef.current = at
    setElapsed(at)
    /* The audio element moves if there is one; the synthesized bed has no
       position, and the timeline moving is the whole of what happens. */
    playerRef.current?.seek(at)
    playerRef.current?.reportPosition(at)
    /* A seek while paused must not be undone by the tick that follows the
       resume: the clock advances from NOW, not from before the drag. */
    lastRef.current = Date.now()
    armFade()
  }, [total, armFade])

  /* The lock screen's own scrubber and its ±15s buttons land here too — the
     surface a person has with the screen dark should not be the poorer one. */
  const seekRef = useRef(seekTo)
  seekRef.current = seekTo

  /** Where on the bar a point is, in seconds. */
  function railSec(rail: HTMLElement, clientX: number): number {
    const r = rail.getBoundingClientRect()
    if (r.width <= 0) return 0
    return Math.max(0, Math.min(total - 1, ((clientX - r.left) / r.width) * total))
  }

  /* Press anywhere on the bar to go there, and keep the finger down to drag.
     The pointer is captured, so the drag survives leaving the bar — which,
     on a 6px-tall control held with a thumb, it does constantly. */
  function beginScrub(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation()
    const rail = e.currentTarget
    try { rail.setPointerCapture(e.pointerId) } catch { /* no capture: the drag still works over the bar */ }
    setScrubTo(railSec(rail, e.clientX))
    const move = (ev: globalThis.PointerEvent) => setScrubTo(railSec(rail, ev.clientX))
    const end = (ev: globalThis.PointerEvent) => {
      rail.removeEventListener('pointermove', move)
      rail.removeEventListener('pointerup', end)
      rail.removeEventListener('pointercancel', end)
      seekTo(railSec(rail, ev.clientX))
      setScrubTo(null)
    }
    rail.addEventListener('pointermove', move)
    rail.addEventListener('pointerup', end)
    rail.addEventListener('pointercancel', end)
  }

  function onScrubKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    let next: number | null = null
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = elapsedRef.current - SKIP_SEC
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = elapsedRef.current + SKIP_SEC
    else if (e.key === 'PageDown') next = elapsedRef.current - SKIP_SEC * 4
    else if (e.key === 'PageUp') next = elapsedRef.current + SKIP_SEC * 4
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = total
    else return
    e.preventDefault()
    e.stopPropagation()
    seekTo(next)
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
    onEnd(false, listenedRef.current)
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
      <SessionFrame ground={ground}>
        <div className="player">
          <div className="fade-in player__ready">
            <p className="lead player__readytext">
              {t('This session is not available at the moment. Your therapist or the Good Loop team can restore it.')}
            </p>
            <button className="btn btn--light player__begin" onClick={() => onEnd(false, 0)}>{t('Back')}</button>
          </div>
        </div>
      </SessionFrame>
    )
  }

  if (!started) {
    return (
      <SessionFrame ground={ground}>
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
      </SessionFrame>
    )
  }

  const showControls = controls || !playing || scrubTo !== null
  const pct = total > 0 ? Math.max(0, Math.min(100, (shown / total) * 100)) : 0

  return (
    <SessionFrame ground={ground}>
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
            {/* A person reads the PART of the audio they are in, never the
                phase's clinical name: "Processing" and "Integration" are the
                therapeutic-arc framing Path A strips from anything
                client-facing (Lexicon_Avoid 16). */}
            <span className="hud__phase">{t('Part {n} of {total}', { n: phaseIdx + 1, total: session.entry?.phases.length ?? 6 })}</span>
            <span className="hud__spacer" aria-hidden="true" />
          </div>

          {/* The clock belongs UNDER the orb, at the size a person can read
              with their eyes half closed — it was in the top bar beside the
              phase label, where a 46px numeral has nowhere to go. */}
          <div className="hud__foot">
            <div className="hud__meta">
              <span className="hud__time">{fmt(shown)}</span>
              <span className="hud__sub">{t(session.name)} · {t('{n} min', { n: duration })}</span>
            </div>

            {/* Every phase at once, so the shape of the session is visible
                rather than only the one it is in — and now a control, not a
                readout: press anywhere on it to go there, or hold and drag.
                The row is 28px tall for a thumb; the bar drawn inside it
                stays the thin line the screen was designed around. */}
            <div
              className={`hud__seek${scrubTo !== null ? ' is-scrubbing' : ''}`}
              role="slider"
              tabIndex={0}
              aria-label={t('Position in the session')}
              aria-valuemin={0}
              aria-valuemax={Math.round(total)}
              aria-valuenow={Math.round(shown)}
              aria-valuetext={`${fmt(shown)} / ${fmt(total)}`}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={beginScrub}
              onKeyDown={onScrubKey}
            >
              <div className="hud__ticks" aria-hidden="true">
                {fractions.map((f, i) => (
                  <i
                    key={i}
                    style={i === phaseIdx
                      ? ({ flex: f, '--within': `${Math.round(within * 100)}%` } as CSSProperties)
                      : { flex: f }}
                    className={i < phaseIdx ? 'is-done' : i === phaseIdx ? 'is-now' : undefined}
                  />
                ))}
              </div>
              {/* The line that says where the audio is — the thing a person
                  was already looking for, now with something to take hold
                  of. */}
              <div className="hud__knob" style={{ '--pos': `${pct}%` } as CSSProperties} aria-hidden="true" />
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
              <p>{t('End session early? The minutes you listened still count.')}</p>
              <div className="chip-row">
                <button className="btn btn--light" onClick={() => setConfirmExit(false)}>{t('Keep listening')}</button>
                <button className="btn btn--light" onClick={exitNow}>{t('End session')}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SessionFrame>
  )
}

/* --------------------------------------------------------- SES-4 / SES-5 -- */

function PostSession({
  session,
  duration,
  contextLine,
  onFeedback,
  onFindProfessional,
}: {
  session: ResolvedSession
  duration: Duration
  contextLine?: string
  onFeedback: (f: PostFeedback | null, vasPost: number | null) => void
  onFindProfessional: () => void
}) {
  const { t } = useI18n()
  const { m } = useLegal()
  const [picked, setPicked] = useState<PostFeedback | null>(null)
  const [vas, setVas] = useState<number | null>(null)
  const ground = useSessionGround(session)
  const isDeep = duration === 24

  function choose(f: PostFeedback) {
    setPicked(f)
    // Support hands over immediately rather than waiting for the person to
    // press on to the next screen first.
    if (f === 'support') onFeedback('support', vas)
  }

  return (
    <SessionFrame ground={ground}>
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
            <p className="small">{t('How settled do you feel? — optional.')}</p>
            <VasRow value={vas} onPick={setVas} />
          </div>

          {/* PLY-4 — the one link every self-guided session ends with: a
              professional. Static, the same for everyone (D-17). */}
          <button type="button" className="legal-link post__pro" onClick={onFindProfessional}>{m('PLY-4')}</button>

          {/* The way out. A door, standing open. */}
          <button className="btn btn--quiet post__support" onClick={() => choose('support')}>
            <Icon name="support" size={16} /> {t('I need support')}
          </button>

          {contextLine && <p className="small muted post__context">{contextLine}</p>}
        </div>

        <div className="screen__footer">
          <button className="btn btn--primary" onClick={() => onFeedback(picked, vas)}>
            {t('Back to Home')}
          </button>
        </div>
      </div>
    </SessionFrame>
  )
}

export { durationLabel }
