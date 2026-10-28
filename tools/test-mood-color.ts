/* ============================================================================
   The colour engine, against the mockup

   src/mood/moodColor.ts is a port of renderVals() in
   docs/ui-redesign/mockups/HomeMood.dc.html. These assertions are how we
   know it is still a port and not a drift: the centre, the four corners, the
   chroma cap, and the one number that decides whether text goes dark or
   cream.

   The four corner hexes are not invented here — they are the same four
   colours the mockup paints the check-in grid with (`.mood-grid`), so if the
   engine and the grid ever disagree, this fails.

       npx esbuild tools/test-mood-color.ts --bundle --platform=node \
         --format=cjs --define:import.meta.env={} --outfile=<tmp>/mc.cjs \
         && node <tmp>/mc.cjs
   ============================================================================ */

import {
  moodColor, labelsFor, moodWord, quadrantOf, distanceFromCentre,
  clampAxis, roundAxis, CHROMA_CAP, LIGHT_THRESHOLD, FACE_POINTS,
  QUADRANT_LABELS, NEUTRAL_LABEL,
} from '../src/mood/moodColor'
import { tokensFor, moodVars, GROUND_TOKENS, LIGHT_TOKENS, DARK_TOKENS } from '../src/mood/tokens'

let pass = 0
const fails: string[] = []
function assert(cond: boolean, what: string): void {
  if (cond) { pass += 1; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

const at = (valence: number, arousal: number) => moodColor({ valence, arousal })

/* ---------------------------------------------------------- the centre --- */
console.log('\n--- the centre is the sand the app rests on ---')
assert(at(0, 0).hex === '#beb6a9', '(0,0) is #beb6a9 — the mockup body colour')
assert(at(0, 0).light, 'and it carries dark text')

/* ---------------------------------------------------------- the corners ---
   Each corner is its anchor exactly, because the radius saturates at 1. */
console.log('\n--- each corner is its anchor, and its gradient stop ---')
assert(at(1, 1).hex === '#fbc959', 'pleasant + agitated is #FBC959, the grid’s amber')
assert(at(-1, 1).hex === '#c25237', 'unpleasant + agitated is #C25237, the terracotta')
assert(at(-1, -1).hex === '#46576c', 'unpleasant + calm is #46576C, the slate')
assert(at(1, -1).hex === '#95e3d3', 'pleasant + calm is #95E3D3, the pale green')

/* ------------------------------------------------------- the chroma cap --- */
console.log('\n--- chroma never passes the cap ---')
let worstC = 0
let overCap = 0
for (let i = -100; i <= 100; i += 2) {
  for (let j = -100; j <= 100; j += 2) {
    const c = at(i / 100, j / 100)
    worstC = Math.max(worstC, c.C)
    if (c.C > CHROMA_CAP + 1e-9) overCap += 1
  }
}
assert(overCap === 0, `no point of the 101×101 grid passes C=${CHROMA_CAP}`)
assert(worstC <= CHROMA_CAP + 1e-9, `the highest chroma found is ${worstC.toFixed(4)}`)
assert(at(-1, 1).C > 0.149, 'the terracotta corner is the one the cap actually bites')

/* --------------------------------------------------------- the two sets --- */
console.log('\n--- lightness, and nothing else, picks the token set ---')
assert(at(1, 1).light && tokensFor(at(1, 1)) === LIGHT_TOKENS, 'the amber takes dark text')
assert(!at(-1, -1).light && tokensFor(at(-1, -1)) === DARK_TOKENS, 'the slate takes cream text')
assert(at(-1, 1).light === false, 'the terracotta (L=0.58) is below the threshold')
for (let i = -100; i <= 100; i += 5) {
  for (let j = -100; j <= 100; j += 5) {
    const c = at(i / 100, j / 100)
    if (c.light !== c.L >= LIGHT_THRESHOLD) { fails.push('token set disagrees with L'); break }
  }
}
assert(!fails.includes('token set disagrees with L'), `the rule is exactly L >= ${LIGHT_THRESHOLD}, everywhere`)

/* `tokensFor` is still the mapping above, and is still right. What the
   SHELL wears is a separate question now, and the answer no longer depends
   on the mood: the page is a fixed darkened photograph (ui2/shell.css), so
   `moodVars` publishes the ground's set whatever the colour of the day is.
   The colour itself is still published — the check-in dot, the chip and the
   faces are what the mood paints now. */
const centre = moodVars(at(0, 0))
const amber = moodVars(at(1, 1))
assert(centre['--mood-bg'] === '#beb6a9', 'the custom properties carry the colour')
assert(centre['--mood-ink'] === GROUND_TOKENS.ink, 'and the ink of the GROUND, not of the colour')
assert(amber['--mood-ink'] === centre['--mood-ink'],
  'so the amber and the slate write the same way: one ground, one set')
assert(tokensFor(at(1, 1)) !== tokensFor(at(-1, -1)),
  'while tokensFor still maps lightness to a set, for whenever the ground moves again')
assert(Object.keys(centre).every((k) => k.startsWith('--mood-')),
  'every property is namespaced, so no other console inherits the mood')

/* ------------------------------------------------------------ the axes --- */
console.log('\n--- the grid cannot be left ---')
assert(clampAxis(5) === 1 && clampAxis(-5) === -1, 'an out-of-range number is held at the edge')
assert(clampAxis(Number.NaN) === 0, 'and NaN falls back to the centre')
assert(at(5, 5).hex === at(1, 1).hex, 'so a point past the corner IS the corner')
assert(roundAxis(0.126) === 0.13, 'an axis is read at two decimals')

/* ----------------------------------------------------------- the words --- */
console.log('\n--- the word belongs to the quadrant, in the reader’s language ---')
assert(quadrantOf({ valence: 0.5, arousal: 0.5 }) === 'q1', 'pleasant + agitated is q1')
assert(quadrantOf({ valence: -0.5, arousal: 0.5 }) === 'q2', 'unpleasant + agitated is q2')
assert(quadrantOf({ valence: -0.5, arousal: -0.5 }) === 'q3', 'unpleasant + calm is q3')
assert(quadrantOf({ valence: 0.5, arousal: -0.5 }) === 'q4', 'pleasant + calm is q4')

assert(labelsFor({ valence: 0.5, arousal: 0.5 }).length === 4, 'four words away from the centre')
assert(labelsFor({ valence: 0.1, arousal: 0.1 })[0] === NEUTRAL_LABEL,
  'and a fifth, "Neutro(a)", first, inside 0.25 of it')
assert(distanceFromCentre({ valence: 0.1, arousal: 0.1 }) < 0.25, 'which is what "inside" means')
assert(distanceFromCentre({ valence: 1, arousal: 1 }) === 1, 'and the distance saturates at 1')

assert(moodWord('tense', 'pt-BR') === 'Tenso(a)', 'Portuguese reads "Tenso(a)"')
assert(moodWord('tense', 'it') === 'Teso/a', 'Italian reads "Teso/a"')
assert(moodWord('tense', 'pt') === 'Tenso(a)', 'a bare language tag still finds the table')
assert(moodWord(null, 'it') === '', 'and no word is no word, not a blank key')
for (const q of ['q1', 'q2', 'q3', 'q4'] as const) {
  for (const id of QUADRANT_LABELS[q]) {
    if (!moodWord(id, 'pt-BR') || !moodWord(id, 'it')) fails.push(`word ${id} missing`)
  }
}
assert(!fails.some((f) => f.startsWith('word ')), 'all sixteen words exist in both languages')

/* ------------------------------------------------------- the five faces --- */
console.log('\n--- the phone’s faces run through the same engine ---')
assert(FACE_POINTS.length === 5, 'five faces')
assert(FACE_POINTS[2].mood.valence === 0 && FACE_POINTS[2].mood.arousal === 0,
  'the middle face is the centre of the grid')
const faceHexes = new Set(FACE_POINTS.map((f) => moodColor(f.mood).hex))
assert(faceHexes.size === 5, 'and the five produce five different colours')
assert(moodColor(FACE_POINTS[2].mood).hex === at(0, 0).hex,
  'the neutral face and the centre of the grid are the same colour')

console.log(`\n${pass} passed, ${fails.length} failed`)
if (fails.length) { for (const f of fails) console.log('  -', f); process.exit(1) }
