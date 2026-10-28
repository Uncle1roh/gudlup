/* ============================================================================
   The headphone check actually checks

   The old one asked about the left ear and then the right ear, in that order,
   every time — so it could be passed with the headphones on the desk, by
   tapping "Left" and then "Right". It also let a wrong answer through: the
   warning offered "Continue anyway", which went into the protocol.

   These are the rules that replace it (src/lib/stereoCheck.ts).

       npx esbuild tools/test-stereo-check.ts --bundle --platform=node \
         --format=esm --outfile=<tmp>/sc.mjs && node <tmp>/sc.mjs
   ============================================================================ */

import {
  startCheck, retryCheck, tonePlayed, answerEar, currentEar, checkPassed, toneNumber,
  type Ear, type StereoState,
} from '../src/lib/stereoCheck'

let pass = 0
const fails: string[] = []
function assert(cond: boolean, what: string): void {
  if (cond) { pass += 1; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

/** An rng that returns the numbers it was given, then 0. */
function fakeRng(...values: number[]): () => number {
  let i = 0
  return () => values[i++] ?? 0
}

/** Play the current tone and answer it. */
function step(s: StereoState, said: Ear): StereoState {
  return answerEar(tonePlayed(s), said)
}

/* ------------------------------------------------------- the order varies */
console.log('\n--- the order is drawn, not fixed ---')
assert(startCheck(fakeRng(0.1)).order[0] === 'left', 'a low draw asks the left ear first')
assert(startCheck(fakeRng(0.9)).order[0] === 'right', 'a high draw asks the right ear first')
assert(startCheck(fakeRng(0.9)).order[1] === 'left', 'and the other ear is always the second one')

/* The whole point: the sequence "left, right" is not a passing answer every
   time, so it cannot be learned and replayed without listening. */
const rightFirst = startCheck(fakeRng(0.9))
assert(step(rightFirst, 'left').phase === 'failed',
  'answering "left" first fails when the tone was in the right ear')

/* --------------------------------------------------------- both are asked */
console.log('\n--- one ear is not a pass ---')
const a0 = startCheck(fakeRng(0.1))
const a1 = step(a0, 'left')
assert(a1.phase === 'between', 'the first correct answer moves on')
assert(!checkPassed(a1), 'and is NOT a pass on its own')
assert(currentEar(a1) === 'right', 'the second question is the other ear')
assert(toneNumber(a1) === 2, 'and says so')

const a2 = step(a1, 'right')
assert(checkPassed(a2), 'both correct, in a row, passes')
assert(currentEar(a2) === null, 'and there is nothing left to play')

/* --------------------------------------------------- a wrong answer resets */
console.log('\n--- a wrong answer ends the attempt ---')
const b1 = step(startCheck(fakeRng(0.1)), 'left')
const b2 = step(b1, 'left') // the second tone is in the RIGHT ear
assert(b2.phase === 'failed', 'getting the second ear wrong fails')
assert(b2.correct === 0, 'and the first ear does not carry over — half a check is no check')
assert(b2.misses === 1, 'the miss is counted, so the screen can stop repeating itself')

/* Guessing twice must not add up to a pass. */
const b3 = retryCheck(b2, fakeRng(0.9))
assert(b3.correct === 0 && b3.phase === 'intro', 'a retry starts from nothing')
assert(b3.order[0] === 'right', 'with a newly drawn order')
assert(b3.misses === 1, 'while remembering how many attempts have missed')

/* ------------------------------------------- nothing is answerable early */
console.log('\n--- an answer needs a tone first ---')
for (const phase of ['intro', 'between'] as const) {
  const s: StereoState = { order: ['left', 'right'], correct: phase === 'between' ? 1 : 0, phase, misses: 0 }
  for (const said of ['left', 'right'] as Ear[]) {
    assert(answerEar(s, said) === s, `answering during "${phase}" (${said}) changes nothing`)
  }
}
const done = step(step(startCheck(fakeRng(0.1)), 'left'), 'right')
assert(answerEar(done, 'left') === done, 'and a passed check cannot be un-passed by answering again')
assert(tonePlayed(done) === done, 'nor reopened by playing another tone')

/* ----------------------------------------------------- the tone's routing
   Not asserted here: this runner has no Web Audio, and a fake one would only
   be testing the fake. It was measured against a real browser instead, on
   the exact graph `playEarTone` builds — an oscillator through a gain into
   one input of a two-channel merger — rendered through an OfflineAudioContext:

       left  tone → channel 0 RMS 0.07096, channel 1 RMS 0
       right tone → channel 0 RMS 0,       channel 1 RMS 0.07096

   So the question on screen has exactly one right answer, which is what the
   rules above are allowed to assume. */

console.log(`\n${pass} passed, ${fails.length} failed`)
if (fails.length) { for (const f of fails) console.log('  FAIL:', f); process.exit(1) }
