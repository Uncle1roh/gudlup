/* ============================================================================
   The colour of a feeling, checked against the spec

   docs/ui-redesign/checkin-emocional-spec.docx fixes five anchors, one
   algorithm and three invariants. All five, and all three, are asserted
   here — because this is the one piece of the check-in nobody can eyeball:
   a wrong mix looks like a colour someone chose.

       npx esbuild tools/test-mood-color.ts --bundle --platform=node \
         --format=cjs --define:import.meta.env={} --outfile=<tmp>/mc.cjs \
         && node <tmp>/mc.cjs
   ============================================================================ */

import {
  ANCHORS, CHROMA_CAP, LIGHT_THRESHOLD, NEUTRAL,
  capChroma, dampen, distanceFromCentre, labelsFor, mixOklab, moodColor, moodLab,
  moodWord, oklabToHex, oklabToOklch, oklchToOklab, quadrantOf, roundAxis,
} from '../src/mood/moodColor'
import { DARK_TOKENS, LIGHT_TOKENS, moodVars, tokensFor, type TokenSet } from '../src/mood/tokens'

let pass = 0
const fails: string[] = []
function assert(cond: boolean, what: string): void {
  if (cond) { pass += 1; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

/** Two hexes within `tol` per channel — rounding differs in the last step. */
function near(a: string, b: string, tol = 2): boolean {
  const ch = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16))
  const x = ch(a)
  const y = ch(b)
  return x.every((v, i) => Math.abs(v - y[i]) <= tol)
}

console.log('--- the centre is the spec\'s neutral ---')
const centre = moodColor({ valence: 0, arousal: 0 })
assert(near(centre.hex, '#BEB6A9'), `(0, 0) → #BEB6A9 (got ${centre.hex})`)
assert(NEUTRAL.hex === centre.hex, 'NEUTRAL is that same colour')
assert(centre.light, 'and it carries dark text (L 0.78 ≥ 0.65)')

console.log('\n--- each corner returns its anchor ---')
const corners: [string, number, number, string][] = [
  ['pleasant + agitated', 1, 1, '#FBC959'],
  ['unpleasant + agitated', -1, 1, '#C25237'],
  ['unpleasant + calm', -1, -1, '#46576C'],
  ['pleasant + calm', 1, -1, '#95E3D3'],
]
for (const [name, valence, arousal, hex] of corners) {
  const got = moodColor({ valence, arousal })
  assert(near(got.hex, hex, 3), `${name} → ${hex} (got ${got.hex})`)
}

console.log('\n--- the chroma ceiling holds everywhere ---')
let worst = 0
let worstAt = ''
for (let v = -1; v <= 1.0001; v += 0.05) {
  for (let a = -1; a <= 1.0001; a += 0.05) {
    const [, C] = oklabToOklch(moodLab({ valence: v, arousal: a }))
    if (C > worst) { worst = C; worstAt = `(${v.toFixed(2)}, ${a.toFixed(2)})` }
  }
}
assert(worst <= CHROMA_CAP + 1e-9, `chroma never exceeds ${CHROMA_CAP} (max ${worst.toFixed(4)} at ${worstAt})`)
const loud = capChroma([0.6, 0.4, 0.3])
assert(Math.hypot(loud[1], loud[2]) <= CHROMA_CAP + 1e-9, 'capChroma pulls a loud colour back')
assert(
  Math.abs(oklabToOklch(loud)[2] - oklabToOklch([0.6, 0.4, 0.3])[2]) < 1e-9,
  'and keeps its hue while doing it',
)

console.log('\n--- the lightness rule picks the token set ---')
assert(moodColor({ valence: 1, arousal: 1 }).light, 'amber (L 0.86) → dark text')
assert(moodColor({ valence: 1, arousal: -1 }).light, 'sea green (L 0.86) → dark text')
assert(!moodColor({ valence: -1, arousal: -1 }).light, 'blue-grey (L 0.45) → light text')
assert(!moodColor({ valence: -1, arousal: 1 }).light, 'terracotta (L 0.58) → light text')
assert(
  moodLab({ valence: -1, arousal: -1 })[0] < LIGHT_THRESHOLD
    && moodLab({ valence: 1, arousal: 1 })[0] >= LIGHT_THRESHOLD,
  'the threshold sits between the darkest and lightest anchors',
)

console.log('\n--- pleasantness lightens, arousal saturates ---')
const dim = moodLab({ valence: -0.8, arousal: 0 })
const bright = moodLab({ valence: 0.8, arousal: 0 })
assert(bright[0] > dim[0], 'a more pleasant state is a lighter colour')
const calmC = oklabToOklch(moodLab({ valence: 0, arousal: -0.9 }))[1]
const hotC = oklabToOklch(moodLab({ valence: 0, arousal: 0.9 }))[1]
assert(hotC > calmC, 'an agitated state is more saturated than a calm one')
const hotHue = oklabToOklch(moodLab({ valence: -0.9, arousal: 0.9 }))[2]
assert(hotHue > 0 && hotHue < 90, `agitated + unpleasant runs warm (hue ${hotHue.toFixed(0)}°)`)

console.log('\n--- the session ground is the same colour at half chroma ---')
const base = moodLab({ valence: -0.6, arousal: 0.7 })
const half = dampen(base)
assert(Math.abs(oklabToOklch(half)[1] - oklabToOklch(base)[1] / 2) < 1e-9, 'C × 0.5')
assert(half[0] === base[0], 'and the same lightness')

console.log('\n--- the maths is reversible and the anchors are what they say ---')
for (const [name, anchor] of Object.entries(ANCHORS)) {
  const back = oklabToOklch(oklchToOklab(anchor))
  const sameHue = Math.abs(back[2] - anchor[2]) < 1e-6 || anchor[1] === 0
  assert(Math.abs(back[0] - anchor[0]) < 1e-9 && Math.abs(back[1] - anchor[1]) < 1e-9 && sameHue,
    `${name} survives OKLCH → OKLab → OKLCH`)
}
assert(oklabToHex(mixOklab(oklchToOklab(ANCHORS.n), oklchToOklab(ANCHORS.n), 0.5)) === centre.hex,
  'mixing a colour with itself changes nothing')

console.log('\n--- the axes are clamped and rounded to what we store ---')
assert(roundAxis(1.4) === 1 && roundAxis(-9) === -1, 'out of range clamps to ±1')
assert(roundAxis(0.3333) === 0.33, 'two decimals, as the spec requires')
assert(moodColor({ valence: 5, arousal: -5 }).hex === moodColor({ valence: 1, arousal: -1 }).hex,
  'a point outside the grid is the corner, never a new colour')

console.log('\n--- the words follow the point, in the reader\'s language ---')
assert(quadrantOf({ valence: 0.5, arousal: 0.5 }) === 'q1', 'pleasant + agitated is q1')
assert(quadrantOf({ valence: -0.5, arousal: 0.5 }) === 'q2', 'unpleasant + agitated is q2')
assert(quadrantOf({ valence: -0.5, arousal: -0.5 }) === 'q3', 'unpleasant + calm is q3')
assert(quadrantOf({ valence: 0.5, arousal: -0.5 }) === 'q4', 'pleasant + calm is q4')
assert(labelsFor({ valence: -0.5, arousal: 0.5 }).length === 4, 'four words out in the quadrants')
assert(labelsFor({ valence: 0.05, arousal: -0.05 })[0] === 'neutral', 'near the centre, Neutral comes first')
assert(labelsFor({ valence: 0.05, arousal: -0.05 }).length === 5, 'and the quadrant\'s four follow it')
assert(distanceFromCentre({ valence: 0.2, arousal: 0.1 }) < 0.25, '(0.2, 0.1) counts as central')
assert(distanceFromCentre({ valence: 0.3, arousal: 0.3 }) >= 0.25, '(0.3, 0.3) does not')
assert(moodWord('tense', 'pt-BR') === 'Tenso(a)', 'pt-BR word')
assert(moodWord('tense', 'it') === 'Teso/a', 'Italian word')
assert(moodWord('tense', 'xx-YY') === 'Tenso(a)', 'an unknown locale falls back rather than printing an id')
assert(moodWord(null, 'pt-BR') === '', 'a skipped check-in has no word')
for (const id of labelsFor({ valence: 0.9, arousal: 0.9 })) {
  assert(!!moodWord(id, 'pt-BR') && !!moodWord(id, 'it'), `"${id}" exists in both languages`)
}

/* ---------------------------------------------------------- contrast ----

   The brief's gate (§6): text is ≥ 4.5:1 on the lightest and darkest mood
   colours, with both token sets. Asserted on the five named colours AND over
   the whole grid, because the hard case is neither anchor — it is the
   mid-tone at the token-set boundary, which is exactly why the ground
   carries a veil. */

/** WCAG 2.1 relative luminance of an #rrggbb colour. */
function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)))
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** `fg` at `alpha` composited over `bg`, both #rrggbb. */
function over(fg: string, bg: string, alpha: number): string {
  const part = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16)
  return '#' + [1, 3, 5]
    .map((i) => Math.round(part(fg, i) * alpha + part(bg, i) * (1 - alpha)).toString(16).padStart(2, '0'))
    .join('')
}

/** rgba(r, g, b, a) → [#rrggbb, a]. The token sets are written that way. */
function parseRgba(v: string): [string, number] {
  const m = v.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/)
  if (!m) return [v, 1]
  const hex = '#' + [1, 2, 3].map((i) => Number(m[i]).toString(16).padStart(2, '0')).join('')
  return [hex, m[4] === undefined ? 1 : Number(m[4])]
}

/** What a reader actually sees behind the text: mood colour, then the veil. */
function groundFor(hex: string, set: TokenSet): string {
  const [veilHex, veilAlpha] = parseRgba(set.veil)
  return over(veilHex, hex, veilAlpha)
}

function inkContrast(colour: ReturnType<typeof moodColor>, which: 'ink' | 'ink2' | 'link'): number {
  const set = tokensFor(colour)
  const ground = groundFor(colour.hex, set)
  const [fg, alpha] = parseRgba(set[which])
  return contrast(over(fg, ground, alpha), ground)
}

console.log('\n--- contrast: the five named colours, both token sets ---')
const NAMED: [string, number, number][] = [
  ['#FBC959', 1, 1], ['#95E3D3', 1, -1], ['#BEB6A9', 0, 0], ['#C25237', -1, 1], ['#46576C', -1, -1],
]
for (const [name, v, a] of NAMED) {
  const c = moodColor({ valence: v, arousal: a })
  const set = tokensFor(c)
  const ground = groundFor(c.hex, set)
  const ink = inkContrast(c, 'ink')
  const ink2 = inkContrast(c, 'ink2')
  const link = inkContrast(c, 'link')
  const act = contrast(set.actFg, set.actBg)
  assert(ink >= 4.5, `${name}: body text ${ink.toFixed(2)}:1 on ${ground}`)
  assert(ink2 >= 4.5, `${name}: secondary text ${ink2.toFixed(2)}:1`)
  assert(link >= 4.5, `${name}: links ${link.toFixed(2)}:1`)
  assert(act >= 4.5, `${name}: the filled action ${act.toFixed(2)}:1`)
}

console.log('\n--- contrast: every point on the grid, not only the corners ---')
let minInk = 99
let minInk2 = 99
let minLink = 99
let atInk = ''
for (let v = -1; v <= 1.0001; v += 0.02) {
  for (let a = -1; a <= 1.0001; a += 0.02) {
    const c = moodColor({ valence: roundAxis(v), arousal: roundAxis(a) })
    const ink = inkContrast(c, 'ink')
    if (ink < minInk) { minInk = ink; atInk = `${c.hex} (L ${c.lab[0].toFixed(2)})` }
    minInk2 = Math.min(minInk2, inkContrast(c, 'ink2'))
    minLink = Math.min(minLink, inkContrast(c, 'link'))
  }
}
assert(minInk >= 4.5, `body text never drops below 4.5:1 (worst ${minInk.toFixed(2)} at ${atInk})`)
assert(minInk2 >= 4.5, `secondary text never drops below 4.5:1 (worst ${minInk2.toFixed(2)})`)
assert(minLink >= 4.5, `links never drop below 4.5:1 (worst ${minLink.toFixed(2)})`)

console.log('\n--- the token set follows the spec rule, and carries a veil ---')
assert(tokensFor({ light: true }) === LIGHT_TOKENS && tokensFor({ light: false }) === DARK_TOKENS,
  'L ≥ 0.65 picks the dark-text set, below it the light-text set')
const vars = moodVars(moodColor({ valence: 0, arousal: 0 }))
assert(vars['--mood-bg'] === '#beb6a9' || vars['--mood-bg'] === moodColor({ valence: 0, arousal: 0 }).hex,
  '--mood-bg is the raw colour, not the veiled one')
for (const k of ['--mood-ink', '--mood-ink-2', '--mood-link', '--mood-glass', '--mood-btn',
  '--mood-line', '--mood-act-bg', '--mood-act-fg', '--mood-veil']) {
  assert(!!vars[k], `${k} is set`)
}
assert(!vars['--ink'] && !vars['--line'],
  'and the short names are NOT written to :root, where the other consoles read them')

console.log(`\n${pass} passed, ${fails.length} failed`)
if (fails.length) { for (const f of fails) console.log('  -', f); process.exit(1) }
