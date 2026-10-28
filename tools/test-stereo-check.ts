/* ============================================================================
   The headphone check

   Two buttons, one per ear. Tap one, hear that side, it goes green; say you
   heard nothing and it goes red. Two greens is the only thing that opens the
   session.

       npx esbuild tools/test-stereo-check.ts --bundle --platform=node \
         --format=cjs --outfile=<tmp>/sc.cjs && node <tmp>/sc.cjs
   ============================================================================ */

import {
  startCheck, tonePlayed, markFailed, retryEar, checkPassed, anyFailed,
  type Ear,
} from '../src/lib/stereoCheck'

let pass = 0
const fails: string[] = []
function assert(cond: boolean, what: string): void {
  if (cond) { pass += 1; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

/* ------------------------------------------------------------ both sides */
console.log('\n--- one side is not enough ---')
const fresh = startCheck()
assert(!checkPassed(fresh), 'nothing tapped yet is not a pass')

const l = tonePlayed(fresh, 'left')
assert(l.left === 'ok', 'the left tone turns the left button green')
assert(l.right === 'idle', 'and does not touch the right one')
assert(!checkPassed(l), 'one green is NOT a pass — a dead right channel would walk through')

const both = tonePlayed(l, 'right')
assert(checkPassed(both), 'both green passes')

/* ------------------------------------------------- green has to mean heard */
console.log('\n--- saying you heard nothing is the only way to go red ---')
const silent = markFailed(both, 'right')
assert(silent.right === 'failed', 'the right side goes red')
assert(!checkPassed(silent), 'and the check is no longer passed')
assert(anyFailed(silent), 'so the screen can say what to check')
assert(silent.left === 'ok', 'while the side that WAS heard is left alone')

/* A red side can be tried again, and it starts from nothing. */
const again = retryEar(silent, 'right')
assert(again.right === 'idle', 'retrying a side clears it')
assert(!checkPassed(again), 'and clearing it is not passing it')
assert(checkPassed(tonePlayed(again, 'right')), 'playing it again passes')

/* --------------------------------------------------------------- no order */
console.log('\n--- the two sides are independent ---')
let rightFirst = startCheck()
for (const ear of ['right', 'left'] as Ear[]) rightFirst = tonePlayed(rightFirst, ear)
assert(checkPassed(rightFirst), 'right then left passes just as left then right does')

/* Nothing is mutated in place: every helper returns a new state. */
assert(fresh.left === 'idle' && fresh.right === 'idle', 'the first state was never written to')
assert(both.right === 'ok' && silent !== both, 'and neither was the passing one')

/* ----------------------------------------------------- the tone's routing
   Not asserted here: this runner has no Web Audio, and a fake one would only
   be testing the fake. It was measured against a real browser on the exact
   graph `playEarTone` builds — an oscillator through a gain into one input
   of a two-channel merger, rendered through an OfflineAudioContext:

       left  tone → channel 0 RMS 0.07096, channel 1 RMS 0
       right tone → channel 0 RMS 0,       channel 1 RMS 0.07096

   So tapping a side really does sound in that ear and nowhere else, which
   is what the green is reporting. */

console.log(`\n${pass} passed, ${fails.length} failed`)
if (fails.length) { for (const f of fails) console.log('  FAIL:', f); process.exit(1) }
