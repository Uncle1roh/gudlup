/* ============================================================================
   The headphone check, as a state machine

   A Good Loop treatment moves between the ears. Headphones that are mono,
   reversed, in one ear only, or not really connected make the session do
   nothing — so the check is not decoration, and the one moment to run it is
   before the session starts.

   WHAT WAS WRONG WITH THE OLD ONE. It asked about the left ear, then the
   right ear, in that order, every time. A fixed order is a test you can pass
   without hearing anything: tap "Left", tap "Right", and you are in, with the
   headphones on the desk. It also let a wrong answer through — the warning
   offered "Continue anyway", which went into the protocol — and it kept the
   first ear's correct answer after a wrong second one, so two attempts of
   guessing got there as well.

   WHAT THIS DOES INSTEAD.

     · The two ears are asked in a RANDOM order, drawn per attempt.
     · BOTH have to be right, in one unbroken run. A wrong answer ends the
       attempt and the next one is reshuffled, so the order cannot be learned
       and a guess is a one-in-four shot at the whole thing rather than a
       coin flip at each half.
     · There is no way through except passing. Leaving is still allowed —
       the person goes back, they do not enter the session.

   Pure, and asserted in tools/test-stereo-check.ts. The component holds one
   of these and plays the tone for `currentEar`; nothing about which ear is
   being asked about lives in the view.
   ============================================================================ */

export type Ear = 'left' | 'right'

export type StereoPhase =
  /** Nothing played yet. */
  | 'intro'
  /** A tone has played and is waiting to be named. */
  | 'asking'
  /** One ear right, the other not played yet. */
  | 'between'
  /** Both ears right, in a row. */
  | 'passed'
  /** The last answer was wrong: this attempt is over. */
  | 'failed'

export interface StereoState {
  /** The two ears, in the order this attempt asks about them. */
  order: readonly [Ear, Ear]
  /** How many have been named correctly so far in this attempt: 0, 1 or 2. */
  correct: 0 | 1 | 2
  phase: StereoPhase
  /** How many attempts have ended in a wrong answer. The screen uses it to
      stop repeating the same sentence at somebody who has read it twice. */
  misses: number
}

/** `Math.random` by default; the tests hand in their own. */
export type Rng = () => number

function shuffled(rnd: Rng): readonly [Ear, Ear] {
  return rnd() < 0.5 ? ['left', 'right'] : ['right', 'left']
}

/** A fresh attempt, with its own order. */
export function startCheck(rnd: Rng = Math.random): StereoState {
  return { order: shuffled(rnd), correct: 0, phase: 'intro', misses: 0 }
}

/** The ear whose tone is playing, or is about to. Null once the attempt is
    over either way — there is nothing left to play. */
export function currentEar(s: StereoState): Ear | null {
  if (s.phase === 'passed' || s.phase === 'failed') return null
  return s.correct === 2 ? null : s.order[s.correct]
}

/**
 * The tone for the current ear has been played; the question is now open.
 *
 * Only from a phase that has a question to open. Calling it on a passed or
 * failed attempt is a no-op rather than a way to reopen one.
 */
export function tonePlayed(s: StereoState): StereoState {
  if (s.phase !== 'intro' && s.phase !== 'between') return s
  return { ...s, phase: 'asking' }
}

/**
 * The person named an ear.
 *
 * Right: the attempt advances, and the second one in a row passes it.
 * Wrong: the attempt is over. Nothing partial survives — `correct` goes back
 * to zero — because half a check is not half a guarantee about a pair of
 * headphones, it is no guarantee at all.
 */
export function answerEar(s: StereoState, said: Ear): StereoState {
  if (s.phase !== 'asking' || s.correct === 2) return s
  const wanted = s.order[s.correct]
  if (said !== wanted) {
    return { ...s, correct: 0, phase: 'failed', misses: s.misses + 1 }
  }
  const correct = (s.correct + 1) as 0 | 1 | 2
  return { ...s, correct, phase: correct === 2 ? 'passed' : 'between' }
}

/** Start over after a wrong answer, with a newly drawn order. */
export function retryCheck(s: StereoState, rnd: Rng = Math.random): StereoState {
  return { order: shuffled(rnd), correct: 0, phase: 'intro', misses: s.misses }
}

/** The only way in. Nothing else in the app should test `phase` for this. */
export function checkPassed(s: StereoState): boolean {
  return s.phase === 'passed'
}

/** "Tone 1 of 2" — which question this is, 1-based. */
export function toneNumber(s: StereoState): 1 | 2 {
  return s.correct === 0 ? 1 : 2
}
