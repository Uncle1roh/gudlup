/* ============================================================================
   The stereo check actually checks

   Two ears are asked about, in order. The bug was not in this logic — it was
   that both questions looked the same, so answering the first correctly
   played the second tone and changed nothing on screen: tap "Left", see no
   reaction, tap "Right", and the session starts. Two questions asked, one
   experienced.

   The stages are explicit now, and these are the rules they follow.

       npx esbuild tools/test-stereo-check.ts --bundle --platform=node \
         --format=esm --outfile=<tmp>/sc.mjs && node <tmp>/sc.mjs
   ============================================================================ */

import { stereoAnswer, type StereoStage } from '../src/selfuse/Session'

let pass = 0
const fails: string[] = []
function assert(cond: boolean, what: string): void {
  if (cond) { pass += 1; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

/* ------------------------------------------------------------- first ear */
console.log('\n--- the left tone ---')
const l = stereoAnswer('ask-left', 'left')
assert(l.next === 'confirmed-left', 'answering LEFT to the left tone moves to the acknowledgement, not to the session')
assert(!l.pass, 'and one correct ear is NOT a pass on its own')
assert(!l.warn, 'nothing to warn about')

const lw = stereoAnswer('ask-left', 'right')
assert(lw.warn, 'answering RIGHT to the left tone warns')
assert(lw.next === 'ask-left', 'and stays on the same question — it does not skip ahead')
assert(!lw.pass, 'a wrong answer is never a pass')

/* ------------------------------------------------------------ second ear */
console.log('\n--- the right tone ---')
const r = stereoAnswer('ask-right', 'right')
assert(r.pass, 'answering RIGHT to the right tone passes the check')
assert(!r.warn, 'with nothing to warn about')

const rw = stereoAnswer('ask-right', 'left')
assert(rw.warn && !rw.pass, 'answering LEFT to the right tone warns instead of passing')
assert(rw.next === 'ask-right', 'and keeps the question open')

/* ------------------------------------------- nothing is answerable early */
console.log('\n--- before a tone has played ---')
for (const stage of ['intro', 'confirmed-left'] as StereoStage[]) {
  for (const side of ['left', 'right'] as const) {
    const s = stereoAnswer(stage, side)
    assert(!s.pass && !s.warn && s.next === stage, `"${side}" at "${stage}" does nothing — no tone has been played to answer`)
  }
}

/* ------------------------------------------------- the only way to a pass */
console.log('\n--- the only route through ---')
let stage: StereoStage = 'intro'
let passed = false
// intro → (tap Play) ask-left → left → confirmed-left → (tap) ask-right → right
stage = 'ask-left'
const step1 = stereoAnswer(stage, 'left'); stage = step1.next
assert(stage === 'confirmed-left', 'left, acknowledged')
stage = 'ask-right' // the acknowledgement screen's button plays the second tone
const step2 = stereoAnswer(stage, 'right'); passed = step2.pass
assert(passed, 'right, and only then does the check pass')

console.log(`\n${pass} passed, ${fails.length} failed`)
if (fails.length) { for (const f of fails) console.log('  -', f); throw new Error('stereo check tests failed') }
