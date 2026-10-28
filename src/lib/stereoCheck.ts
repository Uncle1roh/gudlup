/* ============================================================================
   The headphone check

   A Good Loop treatment moves between the ears. Headphones that are mono, in
   one ear only, or not really connected make the session do nothing, so the
   check runs before the first session.

   TWO BUTTONS, and the owner's shape for them: "o usuário tem que clicar nos
   dois e cada um deles tem que fazer o som no devido lado, assim que ele
   clicar e der certo o botão fica verde ou vermelho se der errado, assim que
   os dois estiverem verde aparece o botão iniciar."

   So: tap LEFT, a tone plays in the left ear, the button goes green. Tap
   RIGHT, same on the other side. Two greens and Start appears. Under each
   button there is a way to say you heard nothing, which turns it red and
   says what to check — that is the only way a side goes red, and it is what
   makes green mean something rather than "was tapped".

   WHAT THIS GAVE UP, said plainly because it was a deliberate trade. The
   version before this played the two ears in a random order and asked which
   one you heard, so it could tell a reversed pair from a working one and
   could not be passed without listening. This one trusts the answer. It
   catches a dead side, a mono adapter and a disconnected pair — which is
   most of what goes wrong — and it does not catch headphones worn backwards.
   Three taps instead of six, which is what was asked for.

   Pure, and asserted in tools/test-stereo-check.ts.
   ============================================================================ */

export type Ear = 'left' | 'right'

/** What one side is showing. */
export type SideState = 'idle' | 'ok' | 'failed'

export interface StereoState {
  left: SideState
  right: SideState
}

export const FRESH: StereoState = { left: 'idle', right: 'idle' }

export function startCheck(): StereoState {
  return FRESH
}

/** The tone for that side played. The side is good until told otherwise. */
export function tonePlayed(s: StereoState, ear: Ear): StereoState {
  return { ...s, [ear]: 'ok' }
}

/** "I heard nothing." Only this turns a side red. */
export function markFailed(s: StereoState, ear: Ear): StereoState {
  return { ...s, [ear]: 'failed' }
}

/** Tapping a red side again plays it again, so it starts from nothing. */
export function retryEar(s: StereoState, ear: Ear): StereoState {
  return { ...s, [ear]: 'idle' }
}

/** Both sides heard. The only thing that opens the session. */
export function checkPassed(s: StereoState): boolean {
  return s.left === 'ok' && s.right === 'ok'
}

/** A side was reported silent: the screen says what to check. */
export function anyFailed(s: StereoState): boolean {
  return s.left === 'failed' || s.right === 'failed'
}
