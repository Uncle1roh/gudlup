/* ============================================================================
   The assessment queue

   `test-assessments.ts` covers the instruments — items, reverse scoring, the
   schedule. This covers the QUEUE: what the therapist sends, what the patient
   gets back, and the three things that must hold no matter which screen is
   driving.

       node --experimental-strip-types tools/test-assessment-queue.ts
   ============================================================================ */

import {
  send,
  proposeDue,
  confirm,
  postpone,
  saveProgress,
  responsesOf,
  complete,
  pendingFor,
  completedFor,
  latestOf,
  seriesOf,
  forPatient,
  cbiOffered,
  minutesFor,
  vasRecord,
  vasSeries,
} from '../src/data/assessmentStore'
import { DASS21, PSS10, type AssessmentRecord, type Responses } from '../src/data/assessments'

let pass = 0
const fails: string[] = []
function assert(cond: boolean, what: string): void {
  if (cond) { pass += 1; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}
function throws(fn: () => unknown, what: string): void {
  try { fn(); assert(false, what) } catch { assert(true, what) }
}

const P = 'p-1'
const DAY = 86_400_000
const T = 1_700_000_000_000

/** Answer every item of an instrument with the same value. */
function all(items: { index: number }[], v: number): Responses {
  const r: Responses = {}
  for (const i of items) r[i.index] = v
  return r
}

/* ------------------------------------------------------------ sending ---- */
console.log('\n--- sending ---')

let rows: AssessmentRecord[] = []
rows = send(rows, P, 'DASS21', 'T0', 'therapist', T)

assert(rows.length === 1, 'sending adds one record')
assert(rows[0].status === 'confirmed', 'a therapist choosing an instrument IS the confirmation')
assert(rows[0].confirmedBy === 'therapist', 'the record says who confirmed it')
assert(rows[0].scores === null && rows[0].responses.length === 0, 'a sent record carries no answers and no score')
assert(!rows[0].immutable, 'a sent record is still writable')
assert(pendingFor(rows, P).length === 1, 'it shows in the patient queue')
assert(pendingFor(rows, 'someone-else').length === 0, "it does NOT show in another patient's queue")

rows = send(rows, P, 'PSS10', 'T0', 'therapist', T + 1000)
assert(pendingFor(rows, P)[0].instrumentId === 'DASS21', 'the queue is oldest-request first')

/* ---------------------------------------------------------- proposing ---- */
console.log('\n--- the schedule proposes, it does not send ---')

let sched: AssessmentRecord[] = proposeDue([], P, T, T)
assert(sched.length === 1 && sched[0].instrumentId === 'DASS21', 'day 1 proposes the DASS-21 baseline')
assert(sched[0].status === 'proposed', 'it is PROPOSED, not confirmed')
assert(sched[0].confirmedBy === null, 'nobody has confirmed it')
assert(pendingFor(sched, P).length === 0, 'a proposal never reaches the patient queue')

/* Running it again the same day must not pile up duplicates — a screen that
   calls this on every render would otherwise fill the queue. */
const again = proposeDue(sched, P, T, T)
assert(again.length === 1, 'proposing twice on the same day adds nothing')

const day3 = proposeDue(sched, P, T, T + 2 * DAY)
assert(day3.length === 3, 'days 3–4 add PSS-10 and BRS')
assert(
  day3.filter((r) => r.timepoint === 'T0').length === 3,
  'all three baseline instruments sit at T0',
)

const day28 = proposeDue(day3, P, T, T + 27 * DAY)
assert(
  day28.filter((r) => r.timepoint === 'T1').map((r) => r.instrumentId).join() === 'DASS21',
  'M1 proposes the DASS-21 alone, to cap the burden',
)

sched = confirm(sched, sched[0].id, 'dr-silva')
assert(sched[0].status === 'confirmed' && sched[0].confirmedBy === 'dr-silva', 'confirming records who did it')
assert(pendingFor(sched, P).length === 1, 'a confirmed proposal reaches the patient')

const put = postpone(sched, sched[0].id)
assert(put[0].status === 'postponed', 'postponing is a state, not a deletion')
assert(pendingFor(put, P).length === 0, 'a postponed instrument leaves the queue')
assert(forPatient(put, P).length === 1, 'but the record survives — the therapist can see it was put off')

/* ----------------------------------------------------------- progress ---- */
console.log('\n--- a half-finished questionnaire ---')

const id = rows[0].id
let mid = saveProgress(rows, id, { 1: 2, 2: 0, 3: 3 })
const midRec = mid.find((r) => r.id === id)!
assert(midRec.status === 'in_progress', 'the first answer moves it to in_progress')
assert(midRec.responses.length === 3, 'the answers so far are kept')
assert(midRec.scores === null, 'a partial questionnaire is NEVER scored')
assert(!midRec.immutable, 'and stays writable')
assert(pendingFor(mid, P).some((r) => r.id === id), 'an in-progress record is still in the queue')

const resumed = responsesOf(midRec)
assert(resumed[1] === 2 && resumed[3] === 3, 'the answers come back in the shape the runner wants')
assert(Object.keys(resumed).length === 3, 'nothing is invented for the unanswered items')

mid = saveProgress(mid, id, { 1: 1 })
assert(mid.find((r) => r.id === id)!.responses.length === 1, 'progress is replaced, not merged — the runner owns the draft')

throws(() => complete(mid, id, { 1: 1 }), 'a questionnaire missing 20 of 21 items cannot be completed')

/* --------------------------------------------------------- completing ---- */
console.log('\n--- completing, and staying completed ---')

const answers = all(DASS21.items, 3)
let doneRows = complete(mid, id, answers, T + DAY)
const rec = doneRows.find((r) => r.id === id)!

assert(rec.status === 'completed', 'a full questionnaire completes')
assert(rec.immutable, 'and freezes')
assert(rec.completedAt === T + DAY, 'stamped when it was finished, not when it was sent')
assert(rec.scores?.kind === 'DASS21', 'the score is computed on completion')
assert(
  rec.scores?.kind === 'DASS21' && rec.scores.scaled.depression === 42,
  'all-3s on every depression item is 42 on the scaled range',
)
assert(rec.responses.length === 21, 'every answer is stored, not just the score')
assert(pendingFor(doneRows, P).length === 1, 'the finished one leaves the queue, the PSS-10 stays')
assert(completedFor(doneRows, P).length === 1, 'and appears in the completed list')

throws(() => complete(doneRows, id, all(DASS21.items, 0)), 'a completed record cannot be re-submitted')
const tampered = saveProgress(doneRows, id, { 1: 0 })
assert(
  tampered.find((r) => r.id === id)!.responses.length === 21,
  'saveProgress refuses a frozen record rather than half-erasing it',
)
assert(
  tampered.find((r) => r.id === id)!.status === 'completed',
  'and cannot walk it back to in_progress',
)

/* ------------------------------------------------------------ reading ---- */
console.log('\n--- reading it back ---')

const pssId = doneRows.find((r) => r.instrumentId === 'PSS10')!.id
doneRows = complete(doneRows, pssId, all(PSS10.items, 2), T + 2 * DAY)

assert(latestOf(doneRows, P, 'DASS21')!.id === id, 'the latest DASS-21 is found')
assert(latestOf(doneRows, P, 'BRS') === undefined, 'an instrument never completed has no latest')
assert(completedFor(doneRows, P)[0].instrumentId === 'PSS10', 'completed reads newest first')

let series = doneRows
series = send(series, P, 'DASS21', 'T1', 'therapist', T + 30 * DAY)
const secondId = series[series.length - 1].id
series = complete(series, secondId, all(DASS21.items, 1), T + 31 * DAY)
const s = seriesOf(series, P, 'DASS21')
assert(s.length === 2, 'the series carries both administrations')
assert((s[0].completedAt ?? 0) < (s[1].completedAt ?? 0), 'and reads oldest first, so a chart plots left to right')

/* ---------------------------------------------------------------- CBI ---- */
console.log('\n--- CBI is offered, never scheduled ---')

assert(!cbiOffered([], P), 'with no DASS-21 there is nothing to trigger on')

/* All-1s gives raw D=7 S=7 → scaled D=14 S=14. Stress must reach 19. */
let low = send([], P, 'DASS21', 'T0', 'th', T)
low = complete(low, low[0].id, all(DASS21.items, 1), T)
assert(!cbiOffered(low, P), 'a pattern below the trigger does not offer CBI')

let high = send([], P, 'DASS21', 'T0', 'th', T)
high = complete(high, high[0].id, all(DASS21.items, 3), T)
assert(cbiOffered(high, P), 'a pattern meeting the trigger offers it')

const withCbi = send(high, P, 'CBI', 'T0', 'th', T + 1000)
assert(!cbiOffered(withCbi, P), 'once offered at that timepoint it is not offered again')

const sentAgain = send(withCbi, P, 'DASS21', 'T1', 'th', T + 30 * DAY)
const laterDass = complete(sentAgain, sentAgain[sentAgain.length - 1].id, all(DASS21.items, 3), T + 30 * DAY)
assert(cbiOffered(laterDass, P), 'a new timepoint meeting the trigger offers it again')

/* ---------------------------------------------------------------- VAS ---- */
console.log('\n--- the session VAS ---')

const v1 = vasRecord('me', 2, 4, T)
assert(v1.status === 'completed' && v1.immutable, 'a VAS pair arrives already finished and frozen')
assert(v1.confirmedBy === 'auto', 'it is the one instrument no therapist confirms')
assert(v1.timepoint === 'session', 'and it sits at `session`, never at T0–T3')
assert(v1.scores?.kind === 'VAS' && v1.scores.delta === 2, 'the delta is post minus pre')
assert(v1.responses.length === 2, 'both taps are stored, not just the delta')

const worse = vasRecord('me', 4, 2, T)
assert(worse.scores?.kind === 'VAS' && worse.scores.delta === -2, 'a session that went the other way records a negative delta')
const flat = vasRecord('me', 3, 3, T)
assert(flat.scores?.kind === 'VAS' && flat.scores.delta === 0, 'and no change is 0, not missing')

throws(() => complete([v1], v1.id, { 1: 1, 2: 5 }), 'a VAS record cannot be rewritten afterwards')

/* Both channels write into one series — that is the whole point of a shared
   patientId and a shared instrument id. */
const mixed = [vasRecord('me', 2, 4, T), vasRecord('me', 3, 5, T + DAY), vasRecord('other', 1, 5, T)]
const trend = vasSeries(mixed, 'me')
assert(trend.length === 2, 'the trend carries this patient only')
assert(trend[0].at < trend[1].at, 'and reads oldest first')
assert(trend[1].delta === 2, 'each point carries its own delta')
assert(vasSeries(mixed, 'nobody').length === 0, 'a patient with no readings has an empty trend, not a zero')

/* VAS must not collide with the scheduled instruments in the queue. */
assert(pendingFor(mixed, 'me').length === 0, 'a VAS never sits in the patient queue waiting to be filled in')
assert(completedFor(mixed, 'me').length === 2, 'it goes straight to completed')

/* --------------------------------------------------------- the rules ---- */
console.log('\n--- the rules the queue must not break ---')

assert(minutesFor('DASS21') === DASS21.minutes, 'the sitting length comes from the instrument, not from copy')
assert(minutesFor('VAS') === '<1', 'VAS is the one that takes no time')

/* Nothing in the store hands back a severity, a band or a label. */
const scoreText = JSON.stringify(completedFor(series, P).map((r) => r.scores))
assert(
  !/mild|moderate|severe|normal|extremely|risk|burnout|cut-?off/i.test(scoreText),
  'a completed score is numbers only — no band, no label, no interpretation',
)

/* A record belongs to exactly one patient. Two patients, one storage list. */
const shared = send(send([], 'a', 'BRS', 'T0', 'th', T), 'b', 'BRS', 'T0', 'th', T)
assert(forPatient(shared, 'a').length === 1 && forPatient(shared, 'b').length === 1, 'one list, no leakage between patients')

console.log(`\n${pass} assertions passed.`)
if (fails.length) {
  console.log(`${fails.length} FAILED:`)
  for (const f of fails) console.log('  -', f)
  process.exit(1)
}
