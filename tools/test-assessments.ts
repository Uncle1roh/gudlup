/* Proof for the five B2B assessment instruments.

   Scoring is the part of a clinical instrument that is objectively right or
   wrong, and it is invisible when wrong: a missed reverse-score gives a number
   that looks plausible, plots a trend, and says the opposite of the truth. So
   every rule in the developer reference is asserted here — item counts, the
   subscale maps, each reverse set, both DASS-21 scales, and the append-only
   rule that makes a completed record evidence.

   Run: npx esbuild tools/test-assessments.ts --bundle --platform=node \
          --format=esm --outfile=.tmp-test/asmt.mjs && node .tmp-test/asmt.mjs */

import {
  BRS, CBI, CBI_DEGREE, CBI_FREQUENCY, DASS21, INSTRUMENTS, PSS10,
  SCHEDULE, SCORE_DIRECTION, SCORE_RANGE, VAS_OPTIONS,
  canEdit, dueOnDay, freeze, isComplete, isDueAt, missingItems, optionsForItem,
  percentDelta, proposesCbi, scoreBrs, scoreCbi, scoreDass21, scorePss10, scoreVas,
  type AssessmentRecord, type Responses,
} from '../src/data/assessments'

let passed = 0
function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else { passed += 1; console.log(`ok  : ${msg}`) }
}

/** Answer every item with the same value. */
function all(instrument: { items: { index: number }[] }, value: number): Responses {
  return Object.fromEntries(instrument.items.map((i) => [i.index, value]))
}

/* ============================================================== shape ===== */
console.log('\n--- the instruments are the ones the reference specifies ---')

assert(DASS21.items.length === 21, 'DASS-21 has 21 items')
assert(PSS10.items.length === 10, 'PSS-10 has 10 items')
assert(BRS.items.length === 6, 'BRS has 6 items')
assert(CBI.items.length === 19, 'CBI has 19 items')
assert(VAS_OPTIONS.length === 5, 'VAS has 5 points, not the 10 a slider would give')

for (const [id, inst] of Object.entries(INSTRUMENTS)) {
  assert(
    inst.items.every((it, i) => it.index === i + 1),
    `${id} items are 1-indexed and dense — the subscale maps depend on it`,
  )
  assert(inst.items.every((it) => it.text.trim().length > 0), `${id} has no empty item text`)
  assert(new Set(inst.items.map((it) => it.text)).size === inst.items.length, `${id} has no duplicated item`)
}

/* ---- the published subscale maps, verbatim from the reference ---- */
const dassMap = {
  depression: [3, 5, 10, 13, 16, 17, 21],
  anxiety: [2, 4, 7, 9, 15, 19, 20],
  stress: [1, 6, 8, 11, 12, 14, 18],
}
for (const [sub, indices] of Object.entries(dassMap)) {
  const mine = DASS21.items.filter((i) => i.subscale === sub).map((i) => i.index)
  assert(mine.join(',') === indices.join(','), `DASS-21 ${sub} items are ${indices.join(', ')}`)
}
assert(
  Object.values(dassMap).flat().sort((a, b) => a - b).join(',') ===
    Array.from({ length: 21 }, (_, i) => i + 1).join(','),
  'every DASS-21 item belongs to exactly one subscale',
)

const cbiMap = {
  personal: [1, 2, 3, 4, 5, 6],
  workRelated: [7, 8, 9, 10, 11, 12, 13],
  clientRelated: [14, 15, 16, 17, 18, 19],
}
for (const [sub, indices] of Object.entries(cbiMap)) {
  const mine = CBI.items.filter((i) => i.subscale === sub).map((i) => i.index)
  assert(mine.join(',') === indices.join(','), `CBI ${sub} items are ${indices.join(', ')}`)
}

/* ---- reverse sets ---- */
assert(
  PSS10.items.filter((i) => i.reverse).map((i) => i.index).join(',') === '4,5,7,8',
  'PSS-10 reverse-scores items 4, 5, 7 and 8',
)
assert(
  BRS.items.filter((i) => i.reverse).map((i) => i.index).join(',') === '2,4,6',
  'BRS reverse-scores items 2, 4 and 6',
)
assert(
  CBI.items.filter((i) => i.reverse).map((i) => i.index).join(',') === '13',
  'CBI reverse-scores item 13 — having energy left is the ABSENCE of burnout',
)

/* ---- response scales ---- */
assert(DASS21.options.map((o) => o.value).join(',') === '0,1,2,3', 'DASS-21 is a 0–3 scale')
assert(PSS10.options.map((o) => o.value).join(',') === '0,1,2,3,4', 'PSS-10 is a 0–4 scale')
assert(BRS.options.map((o) => o.value).join(',') === '1,2,3,4,5', 'BRS is a 1–5 scale')
assert(CBI_FREQUENCY.map((o) => o.value).join(',') === '0,25,50,75,100', 'CBI frequency runs 0–100 in steps of 25')
assert(CBI_DEGREE.map((o) => o.value).join(',') === '0,25,50,75,100', 'CBI degree uses the same values')
assert(
  CBI_FREQUENCY[2].label !== CBI_DEGREE[2].label,
  'the two CBI scales share values but NOT wording — "Sometimes" is not "Somewhat"',
)
assert(
  optionsForItem(CBI, CBI.items[0]) === CBI_FREQUENCY,
  'a personal-burnout item asks about frequency',
)
assert(
  optionsForItem(CBI, CBI.items[13]) === CBI_DEGREE,
  'a client-related item asks about degree',
)
assert(optionsForItem(PSS10, PSS10.items[0]) === PSS10.options, 'a single-scale instrument returns its own options')

/* ============================================================ scoring ===== */
console.log('\n--- DASS-21 ---')

const dassMax = scoreDass21(all(DASS21, 3))
assert(dassMax.raw.depression === 21, 'a maxed depression subscale sums to 21')
assert(dassMax.raw.anxiety === 21 && dassMax.raw.stress === 21, 'the other two max at 21 as well')
assert(dassMax.scaled.depression === 42, 'the scaled score doubles to the DASS-42 range')
assert(dassMax.scaled.stress === 42, 'every subscale doubles')

const dassMin = scoreDass21(all(DASS21, 0))
assert(dassMin.raw.depression === 0 && dassMin.scaled.depression === 0, 'a floor DASS-21 scores zero on both scales')

/* One subscale at a time proves the map is actually being used. */
const onlyAnxiety: Responses = Object.fromEntries(
  DASS21.items.map((i) => [i.index, i.subscale === 'anxiety' ? 3 : 0]),
)
const anx = scoreDass21(onlyAnxiety)
assert(anx.raw.anxiety === 21, 'answering only the anxiety items loads only anxiety')
assert(anx.raw.depression === 0 && anx.raw.stress === 0, 'and leaves the other two at zero')
assert(SCORE_RANGE['DASS21.raw'].max === 21 && SCORE_RANGE['DASS21.scaled'].max === 42, 'both ranges are published')

console.log('\n--- PSS-10 ---')

/* All "Never" is 0 on the eight forward items and 4 on each of the four
   reversed ones — the single most common scoring bug in this instrument. */
assert(scorePss10(all(PSS10, 0)) === 16, 'all-Never scores 16, not 0 — four items are reversed')
assert(scorePss10(all(PSS10, 4)) === 24, 'all-Very-often scores 24, not 40')
assert(scorePss10(all(PSS10, 2)) === 20, 'all-Sometimes sits at the midpoint, 20')
const pssWorst: Responses = Object.fromEntries(
  PSS10.items.map((i) => [i.index, i.reverse ? 0 : 4]),
)
assert(scorePss10(pssWorst) === 40, 'the true maximum of 40 needs the reversed items answered low')
assert(SCORE_RANGE.PSS10.max === 40, 'the published range is 0–40')

console.log('\n--- BRS ---')

assert(scoreBrs(all(BRS, 3)) === 3, 'all-Neutral is exactly the scale midpoint')
assert(scoreBrs(all(BRS, 5)) === 3, 'agreeing with everything is 3, because half the items contradict each other')
const brsBest: Responses = Object.fromEntries(BRS.items.map((i) => [i.index, i.reverse ? 1 : 5]))
assert(scoreBrs(brsBest) === 5, 'the true maximum of 5 needs the reversed items disagreed with')
const brsWorst: Responses = Object.fromEntries(BRS.items.map((i) => [i.index, i.reverse ? 5 : 1]))
assert(scoreBrs(brsWorst) === 1, 'the true minimum is 1')
assert(SCORE_RANGE.BRS.min === 1 && SCORE_RANGE.BRS.max === 5, 'BRS is reported on its 1–5 scale, not summed')

console.log('\n--- CBI ---')

const cbiMax = scoreCbi(all(CBI, 100))
assert(cbiMax.personal === 100, 'personal burnout is a mean, so it maxes at 100 not 600')
assert(cbiMax.clientRelated === 100, 'client-related maxes at 100')
assert(
  cbiMax.workRelated < 100,
  'work-related cannot reach 100 when every item is answered "Always" — item 13 is reversed',
)
assert(cbiMax.workRelated === 85.71, 'six items at 100 and one reversed to 0 averages 85.71')
const cbiWorst: Responses = Object.fromEntries(CBI.items.map((i) => [i.index, i.reverse ? 0 : 100]))
assert(scoreCbi(cbiWorst).workRelated === 100, 'the true work-related maximum needs item 13 answered low')
assert(scoreCbi(all(CBI, 50)).personal === 50, 'a mid answer gives a mid score')
assert(SCORE_RANGE.CBI.max === 100, 'CBI subscales are 0–100')

console.log('\n--- VAS ---')

assert(scoreVas(2, 4).delta === 2, 'the delta is post minus pre')
assert(scoreVas(4, 2).delta === -2, 'a fall is negative')
assert(scoreVas(3, 3).delta === 0, 'no change is zero, not null')
assert(VAS_OPTIONS.every((o) => o.icon.length > 0), 'every VAS point has an icon')
assert(VAS_OPTIONS.map((o) => o.value).join(',') === '1,2,3,4,5', 'the stored values are 1–5')

/* ========================================================= completeness === */
console.log('\n--- a partial questionnaire is never scored ---')

const partial: Responses = { 1: 2, 2: 3 }
assert(!isComplete(DASS21, partial), 'two answers out of 21 is not complete')
assert(missingItems(DASS21, partial).length === 19, 'the missing items are named, so a screen can point at them')
assert(isComplete(DASS21, all(DASS21, 0)), 'every item answered with zero IS complete — 0 is an answer')
assert(missingItems(BRS, all(BRS, 3)).length === 0, 'a full BRS has nothing missing')

/* ============================================================ schedule ==== */
console.log('\n--- when the system proposes what ---')

assert(isDueAt('DASS21', 'T0') && isDueAt('DASS21', 'T1'), 'DASS-21 runs at every timepoint')
assert(isDueAt('DASS21', 'T2') && isDueAt('DASS21', 'T3'), 'including T2 and T3')
assert(isDueAt('PSS10', 'T0') && isDueAt('BRS', 'T0'), 'PSS-10 and BRS are baseline instruments')
assert(!isDueAt('PSS10', 'T1'), 'PSS-10 is deliberately skipped at T1 to cap the burden')
assert(!isDueAt('BRS', 'T1'), 'BRS is skipped at T1 too')
assert(isDueAt('PSS10', 'T2') && isDueAt('BRS', 'T2'), 'both return at T2')
assert(!SCHEDULE.some((s) => s.instruments.includes('CBI')), 'CBI is never on the schedule — it is conditional')
assert(!SCHEDULE.some((s) => s.instruments.includes('VAS')), 'VAS is not scheduled either — it runs per session')
assert(dueOnDay(1).length === 1, 'day 1 proposes the baseline DASS-21')
assert(dueOnDay(3)[0].instruments.join(',') === 'PSS10,BRS', 'days 3–4 pair PSS-10 with BRS in one sitting')
assert(dueOnDay(14).length === 0, 'a day with nothing due proposes nothing')
assert(dueOnDay(28)[0].timepoint === 'T1', 'day 28 is the month-one review')

assert(proposesCbi({ depression: 12, anxiety: 8, stress: 22 }), 'a burnout-shaped DASS-21 proposes CBI')
assert(!proposesCbi({ depression: 4, anxiety: 8, stress: 22 }), 'high stress alone does not propose CBI')
assert(!proposesCbi({ depression: 12, anxiety: 8, stress: 8 }), 'low stress does not propose CBI')

/* ============================================================== record ==== */
console.log('\n--- a completed record is evidence, so it cannot change ---')

const base: AssessmentRecord = {
  id: 'a1', patientId: 'p1', instrumentId: 'BRS', timepoint: 'T0',
  administeredAt: 1000, completedAt: null, status: 'confirmed',
  proposedBy: 'system', confirmedBy: 'th-1', responses: [], scores: null, immutable: false,
}

assert(canEdit(base), 'a record that is not finished can still be written')

const done = freeze(base, all(BRS, 3), 2000)
assert(done.status === 'completed', 'freezing completes the record')
assert(done.immutable, 'and marks it immutable')
assert(done.completedAt === 2000, 'and stamps when')
assert(!canEdit(done), 'a completed record refuses further edits')
assert(done.responses.length === 6, 'every raw response is kept, not just the score')
assert(done.scores?.kind === 'BRS' && done.scores.mean === 3, 'the score is computed on freeze')
assert(base.immutable === false && base.scores === null, 'the original record is not mutated')

let threw = false
try { freeze(done, all(BRS, 4)) } catch { threw = true }
assert(threw, 'freezing an already-frozen record throws rather than silently overwriting evidence')

let incomplete = false
try { freeze(base, { 1: 3 }) } catch { incomplete = true }
assert(incomplete, 'freezing an incomplete questionnaire throws — a partial score is worse than none')

/* ========================================================== no verdicts === */
console.log('\n--- the system scores, it never interprets ---')

assert(
  SCORE_DIRECTION.BRS === 'higher-is-more-resource' && SCORE_DIRECTION.DASS21 === 'higher-is-more-symptom',
  'direction says which way is MORE of the construct, not which way is better',
)
const words = JSON.stringify({ DASS21, PSS10, BRS, CBI }).toLowerCase()
for (const banned of ['mild', 'moderate', 'severe', 'normal range', 'cut-off', 'cutoff', 'diagnos', 'clinical range']) {
  assert(!words.includes(banned), `no instrument carries a "${banned}" label`)
}

assert(percentDelta(20, 15) === -25, 'a fall from 20 to 15 is −25%')
assert(percentDelta(15, 20) === 33, 'a rise from 15 to 20 is +33%')
assert(percentDelta(0, 5) === null, 'a change from zero has no percentage, and says so rather than dividing')
assert(percentDelta(10, 10) === 0, 'no change is 0%')

console.log(`\n${passed} assertions passed.`)
