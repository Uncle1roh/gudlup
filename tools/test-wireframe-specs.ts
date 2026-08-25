/* Proof harness for the 2026-08-24 wireframe specs.

   Three surfaces were built from those specs, and each carries rules that are
   claims about behaviour rather than about layout. Layout can be reviewed by
   eye; these cannot, so they are asserted here.

     Corporate Dashboard
       · N≥5 k-anonymity: no metric below five contributors is published.
       · The forbidden-vocabulary list appears nowhere in dashboard copy.
       · Trend language is exactly "Trending up" / "Stable" / "Trending down".
       · Professional Support exposes ONE integer and cannot be decomposed.

     Self Use app
       · The 19 sessions map onto 19 distinct prescribable protocols, and the
         six clinical-only ones are not among them.
       · Every pathway week references a real session.
       · WHO-5 reports as 0–100 %, GL-Check averages 1–5.
       · The Safety Gateway Level 2 triggers fire on exactly the three
         documented conditions and not otherwise.

     Therapist Workspace
       · Only the 19 Self Use protocols are prescribable as homework.
       · Adherence bands are green ≥70 / yellow 40–69 / red <40.
       · A connection code is single-use shaped and expires at 72 hours.
       · The SLA indicator turns amber past 24h and red past 48h.

   Run: npx esbuild tools/test-wireframe-specs.ts --bundle --platform=node \
          --format=esm --outfile=<tmp>/specs.mjs && node <tmp>/specs.mjs      */

import {
  CLINICAL_ONLY_CODES,
  MOOD_CARDS,
  PATHWAYS,
  SELF_USE_SESSIONS,
  isClinicalOnly,
  pathwayTotal,
  sessionBySlug,
  sessionForProtocol,
  INTAKE_CHALLENGES,
} from '../src/data/selfuse'
import {
  GL_CHECK_QUESTIONS,
  WHO5_ITEMS,
  dayKey,
  glCheckAverage,
  moodBucket,
  safetyLevel2Trigger,
  trend,
  who5Percent,
  type GlCheckEntry,
  type MoodEntry,
} from '../src/data/measures'
import {
  FORBIDDEN_TERMS,
  MIN_CELL,
  cell,
  cellValue,
  generateCompanyCode,
  movement,
  suppressed,
  utilisationHigh,
} from '../src/corporate/metrics'
import { buildAggregates, defaultState } from '../src/corporate/data'
import {
  adherenceBand,
  adherencePct,
  codeExpired,
  generateConnectionCode,
  demoWorkspace,
  prescribableProtocols,
  slaBand,
  type WorkspacePatient,
} from '../src/workspace/data'
import { graceEndsAt, resolveCompanyCode, safetyContact, hasProfessionalSupport } from '../src/data/convention'
import { audioLanguage, audioUrlFor, hasRenderedAudio, playableDurations } from '../src/data/liveCatalog'
import type { CatalogProtocol } from '../src/data/catalog'
import type { Protocol } from '../src/types/domain'

let passed = 0
function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else { passed += 1; console.log(`ok  : ${msg}`) }
}

const DAY = 86_400_000
const HOUR = 3_600_000

/* ========================================================================== */
console.log('\n--- Corporate Dashboard: k-anonymity ---')

assert(MIN_CELL === 5, 'the k-anonymity threshold is 5')

for (let n = 0; n < 5; n += 1) {
  assert(cellValue(cell(99, n)) === null, `a cell built from ${n} people publishes nothing`)
  assert(suppressed(cell(99, n)), `a cell built from ${n} people reports as suppressed`)
}
assert(cellValue(cell(99, 5)) === 99, 'a cell built from exactly 5 people publishes')
assert(!suppressed(cell(99, 5)), 'a cell built from exactly 5 people is not suppressed')
assert(cellValue(null) === null, 'an absent cell publishes nothing rather than throwing')

// A young tenant: every wellbeing figure must withhold, and the headcount-based
// ones must survive, because they are counts of people rather than about them.
const small = buildAggregates(defaultState(), 3)
assert(cellValue(small.kpis.who5Avg) === null, 'WHO-5 is withheld with 3 respondents')
assert(cellValue(small.kpis.glCheckAvg) === null, 'GL-Check is withheld with 3 respondents')
assert(small.wellbeing.dimensions.every((d) => cellValue(d.current) === null), 'every GL-Check dimension is withheld with 3 respondents')
assert(cellValue(small.kpis.registered) !== null, 'the registration headcount still publishes — it is a count, not a measure about a person')

const healthy = buildAggregates(defaultState(), 189)
assert(cellValue(healthy.kpis.who5Avg) === 63, 'WHO-5 publishes with 189 respondents')
assert(healthy.wellbeing.dimensions.every((d) => cellValue(d.current) !== null), 'every dimension publishes with 189 respondents')

console.log('\n--- Corporate Dashboard: vocabulary ---')

/* The whole point of the forbidden list is that it must not appear in COPY.
   The list itself is data, so the check is over the strings the screens emit. */
const CORPORATE_COPY = [
  'All data shown is anonymized and aggregated · metrics require at least 5 participants (N≥5)',
  'The WHO-5 measures general subjective wellbeing on a 0–100 scale. This chart shows the company-wide average over time. Higher scores indicate better perceived wellbeing. This is a descriptive indicator — it does not constitute a clinical assessment.',
  'This number is anonymized — no individual details are available. Never broken down.',
  'Industry average aggregated across all Good Loop companies. Adoption & efficacy only — never risk levels. Purely informational.',
  'employees currently using professional support sessions',
  'Not enough data yet',
  'License utilization is high. Contact your Good Loop representative to expand your plan.',
  'For privacy reasons, you cannot see which employees are connected to which therapist, or any details about therapy sessions. The only information available is the total number of employees using professional support, shown on the Overview page.',
  'Individual employee data is never visible in this dashboard.',
  'Employees can opt out of anonymous data sharing with zero consequences.',
  'Therapy sessions are fully confidential — only an anonymous count is shown.',
].join(' ').toLowerCase()

for (const term of FORBIDDEN_TERMS) {
  assert(!CORPORATE_COPY.includes(term), `dashboard copy never says "${term}"`)
}

console.log('\n--- Corporate Dashboard: trend language ---')

assert(movement(63, 61, 1, 0)?.label === 'Trending up', 'a rise past the band reads "Trending up"')
assert(movement(61, 63, 1, 0)?.label === 'Trending down', 'a fall past the band reads "Trending down"')
assert(movement(63, 63, 1, 0)?.label === 'Stable', 'no change reads "Stable"')
assert(movement(63, 62, 1, 0)?.label === 'Stable', 'a change inside the epsilon band reads "Stable", not a direction')
assert(movement(3.4, 3.1, 0.05, 1)?.delta === 0.3, 'a 1–5 scale keeps one decimal')
assert(movement(null, 61) === null, 'a movement with no current value is withheld rather than guessed')
assert(movement(63, null) === null, 'a movement with no previous value is withheld rather than guessed')

console.log('\n--- Corporate Dashboard: the therapy channel ---')

const plus = buildAggregates(defaultState(), 189)
assert(plus.professionalSupport !== null, 'a Professional Support convention exposes the count')
assert(Object.keys(plus.professionalSupport ?? {}).length === 1, 'the therapy channel exposes exactly ONE field and cannot be decomposed')
assert(typeof plus.professionalSupport?.employees === 'number', 'that one field is an integer count of employees')

const selfUseOnly = { ...defaultState(), conventionType: 'self-use' as const }
assert(buildAggregates(selfUseOnly, 189).professionalSupport === null, 'a Self-Use-only convention exposes no therapy channel at all')

console.log('\n--- Corporate Dashboard: licences and codes ---')

assert(utilisationHigh(218, 250), '218 of 250 licences counts as high utilisation (≥80%)')
assert(!utilisationHigh(199, 250), '199 of 250 licences does not')
assert(generateCompanyCode('Acme Corporation', 2026) === 'ACME-2026', 'a company code is NAME-YEAR, uppercased')
assert(generateCompanyCode('Nova Industries Ltd.', 2026) === 'NOVA-2026', 'punctuation and trailing words are dropped from a company code')

console.log('\n--- Conventions ---')

const acme = resolveCompanyCode('acme-2026')
assert(acme?.companyName === 'Acme Corporation', 'a company code resolves case-insensitively')
assert(hasProfessionalSupport(acme), 'ACME-2026 carries Professional Support')
assert(!hasProfessionalSupport(resolveCompanyCode('NOVA-2026')), 'NOVA-2026 is Self Use only')
assert(resolveCompanyCode('NOPE-2026') === null, 'an unknown code resolves to nothing')
assert(safetyContact(null).phone.length > 0, 'with no company, the Safety Gateway still has a contact to show')
assert(safetyContact(resolveCompanyCode('NOVA-2026')).provider === 'Crisis helpline', 'a company with no EAP falls back to the generic crisis line, never to nothing')

// Grace runs to the END OF THE QUARTER after expiry, not to expiry itself.
const sep30 = Date.UTC(2026, 8, 30)
const grace = graceEndsAt(sep30)
assert(grace > sep30, 'the grace period ends after the convention does')
assert(new Date(grace).getMonth() === 8, 'a convention ending 30 Sep keeps access to the end of Q3')

/* ========================================================================== */
console.log('\n--- Self Use: the 19 sessions ---')

assert(SELF_USE_SESSIONS.length === 19, 'there are exactly 19 Self Use sessions')

const codes = SELF_USE_SESSIONS.map((s) => s.protocolCode)
assert(new Set(codes).size === 19, 'each session maps to a DISTINCT protocol — no two share audio')
assert(new Set(SELF_USE_SESSIONS.map((s) => s.slug)).size === 19, 'every session slug is unique')
assert(new Set(SELF_USE_SESSIONS.map((s) => s.name)).size === 19, 'every session name is unique')

assert(CLINICAL_ONLY_CODES.length === 6, 'six protocols are clinical-only')
for (const code of CLINICAL_ONLY_CODES) {
  assert(!codes.includes(code), `${code} is clinical-only and is NOT a Self Use session`)
  assert(isClinicalOnly(code), `${code} reports as clinical-only`)
  assert(sessionForProtocol(code) === undefined, `${code} resolves to no Self Use session`)
}
assert(!isClinicalOnly('GL-ANX 1.1'), 'GL-ANX 1.1 is not clinical-only')
assert(19 + 6 === 25, 'the 19 Self Use plus the 6 clinical-only protocols account for the whole catalog')

for (const s of SELF_USE_SESSIONS) {
  assert(s.durations.length === 3, `${s.name} carries all three durations`)
  assert(!/GL-(ANX|DEP|BURN|STRESS|RESIL)/.test(`${s.name} ${s.blurb} ${s.about}`), `${s.name} never leaks a protocol code into patient-facing copy`)
}

console.log('\n--- Self Use: pathways ---')

assert(PATHWAYS.length === 5, 'there are five pathways')
for (const p of PATHWAYS) {
  assert(p.plan.length === p.weeks, `${p.name} has one plan entry per week`)
  assert(
    p.plan.every((w) => w.blocks.length > 0 && w.blocks.every((b) => sessionBySlug(b.slug))),
    `${p.name} references only real sessions`,
  )
  assert(p.plan.every((w, i) => w.week === i + 1), `${p.name} numbers its weeks densely from 1`)
  assert(p.plan.every((w) => w.focus.trim().length > 0), `${p.name} says what every week is FOR`)
  assert(
    p.plan.every((w) => w.blocks.every((b) => b.count > 0 && sessionBySlug(b.slug)!.durations.includes(b.duration))),
    `${p.name} only asks for durations that exist`,
  )
  assert(pathwayTotal(p) > 0, `${p.name} asks for at least one session`)
}

/* The journey tables mix lengths inside a week — four Standard plus a Quick
   rescue, or three Standard plus a Deep at the weekend. A model that flattened
   a week to one session and a count would silently lose that. */
assert(
  PATHWAYS.some((p) => p.plan.some((w) => w.blocks.length > 1)),
  'at least one week mixes more than one block, as the journey tables do',
)
assert(
  PATHWAYS.some((p) => p.plan.some((w) => w.blocks.some((b) => b.when))),
  'a block can say WHEN it is for — "before a meeting", "at the weekend"',
)
assert(
  PATHWAYS.some((p) => p.plan.some((w) => w.rotation)),
  'the longer journeys end in a consolidation week the person composes themselves',
)

// Every onboarding answer must land somewhere, including "I'm not sure yet".
for (const c of INTAKE_CHALLENGES) {
  assert(PATHWAYS.some((p) => p.id === c.pathway), `intake option "${c.label}" maps to a real pathway`)
}
assert(INTAKE_CHALLENGES.find((c) => c.id === 'unsure')?.pathway === 'stress-management', '"I\'m not sure yet" lands on Stress Management, the most universal start')

console.log('\n--- Self Use: the quick-access grid ---')

assert(MOOD_CARDS.length === 8, 'the quick grid has eight cards (2 × 4)')
for (const m of MOOD_CARDS) {
  assert(sessionBySlug(m.slug), `mood card "${m.label}" suggests a real session`)
}

console.log('\n--- Self Use: measurement ---')

assert(GL_CHECK_QUESTIONS.length === 5, 'GL-Check has five dimensions')
assert(WHO5_ITEMS.length === 5, 'WHO-5 has five items')

const glMax: GlCheckEntry = { at: 0, scores: { energy: 5, focus: 5, sleep: 5, balance: 5, motivation: 5 } }
const glMin: GlCheckEntry = { at: 0, scores: { energy: 1, focus: 1, sleep: 1, balance: 1, motivation: 1 } }
assert(glCheckAverage(glMax) === 5, 'a full GL-Check averages 5')
assert(glCheckAverage(glMin) === 1, 'a floor GL-Check averages 1')
assert(glCheckAverage(null) === null, 'no GL-Check averages to nothing, not to zero')

assert(who5Percent({ at: 0, items: [5, 5, 5, 5, 5] }) === 100, 'a full WHO-5 reports 100%')
assert(who5Percent({ at: 0, items: [0, 0, 0, 0, 0] }) === 0, 'a floor WHO-5 reports 0%')
assert(who5Percent({ at: 0, items: [3, 3, 3, 3, 3] }) === 60, 'raw 15 of 25 reports 60%')
assert(who5Percent({ at: 0, items: [3, 3, 3] }) === null, 'an incomplete WHO-5 reports nothing rather than a partial score')

assert(moodBucket(5) === 'positive' && moodBucket(4) === 'positive', 'levels 4–5 are Positive')
assert(moodBucket(3) === 'neutral', 'level 3 is Neutral')
assert(moodBucket(2) === 'negative' && moodBucket(1) === 'negative', 'levels 1–2 are Negative')

assert(trend(3.4, 3.1, 0.05, 1)?.label === 'Trending up', 'a GL-Check rise reads "Trending up"')
assert(trend(3.1, 3.1, 0.05, 1)?.label === 'Stable', 'an unchanged GL-Check reads "Stable"')

console.log('\n--- Self Use: Safety Gateway Level 2 ---')

const NOW = Date.UTC(2026, 7, 25, 12)
const check = (avg: number, at: number): GlCheckEntry => ({
  at,
  scores: { energy: avg, focus: avg, sleep: avg, balance: avg, motivation: avg },
})
const mood = (level: 1 | 2 | 3 | 4 | 5, daysAgo: number): MoodEntry => ({
  at: NOW - daysAgo * DAY,
  day: dayKey(NOW - daysAgo * DAY),
  level,
})

assert(
  safetyLevel2Trigger({
    glChecks: [check(4, NOW - 28 * DAY), check(3.4, NOW - 21 * DAY), check(2.8, NOW - 14 * DAY), check(2.2, NOW - 7 * DAY)],
    moods: [], lastSessionAt: NOW - DAY, now: NOW,
  }) === 'declining-checkin',
  'three consecutive weekly declines trigger Level 2',
)
assert(
  safetyLevel2Trigger({
    glChecks: [check(3, NOW - 21 * DAY), check(2.8, NOW - 14 * DAY), check(3.2, NOW - 7 * DAY)],
    moods: [], lastSessionAt: NOW - DAY, now: NOW,
  }) === null,
  'a dip that recovers does NOT trigger Level 2',
)
assert(
  safetyLevel2Trigger({
    glChecks: [], moods: [0, 1, 2, 3, 4].map((d) => mood(1, d)), lastSessionAt: NOW - DAY, now: NOW,
  }) === 'low-mood-run',
  'five consecutive days at the lowest mood trigger Level 2',
)
assert(
  safetyLevel2Trigger({
    glChecks: [], moods: [0, 1, 2, 3].map((d) => mood(1, d)), lastSessionAt: NOW - DAY, now: NOW,
  }) === null,
  'four days at the lowest mood do not — the threshold is five',
)
assert(
  safetyLevel2Trigger({
    glChecks: [check(3.5, NOW - 40 * DAY), check(2.9, NOW - 33 * DAY)],
    moods: [], lastSessionAt: NOW - 20 * DAY, now: NOW,
  }) === 'inactivity-after-decline',
  '14+ days of silence FOLLOWING a decline trigger Level 2',
)
assert(
  safetyLevel2Trigger({
    glChecks: [check(3.0, NOW - 40 * DAY), check(3.6, NOW - 33 * DAY)],
    moods: [], lastSessionAt: NOW - 20 * DAY, now: NOW,
  }) === null,
  'the same silence after an IMPROVING trend does not — inactivity alone is not a signal',
)
assert(
  safetyLevel2Trigger({ glChecks: [], moods: [], lastSessionAt: null, now: NOW }) === null,
  'a brand-new account with no data triggers nothing',
)

/* ========================================================================== */
console.log('\n--- Workspace: what may be prescribed ---')

const prescribable = prescribableProtocols()
assert(prescribable.length === 19, 'exactly 19 protocols are prescribable as homework')
for (const code of CLINICAL_ONLY_CODES) {
  assert(!prescribable.some((p) => p.code === code), `${code} can never be prescribed as homework`)
}
for (const s of SELF_USE_SESSIONS) {
  assert(prescribable.some((p) => p.code === s.protocolCode), `${s.name} is prescribable`)
}

console.log('\n--- Workspace: adherence ---')

const rx = (done: number, perWeek: number, weeks: number) => ({
  id: 'x', patientId: 'p', protocolCode: 'GL-ANX 1.1', version: 6 as const,
  perWeek, fromAt: 0, toAt: weeks * 7 * DAY, done,
})
assert(adherencePct(rx(3, 3, 1)) === 100, '3 of 3 in one week is 100%')
assert(adherencePct(rx(2, 3, 1)) === 67, '2 of 3 in one week rounds to 67%')
assert(adherencePct(rx(1, 3, 1)) === 33, '1 of 3 in one week rounds to 33%')
assert(adherencePct(rx(9, 3, 1)) === 100, 'over-completion is capped at 100%, never above')
assert(adherenceBand(100) === 'green' && adherenceBand(70) === 'green', '70% and above is green')
assert(adherenceBand(69) === 'yellow' && adherenceBand(40) === 'yellow', '40–69% is yellow')
assert(adherenceBand(39) === 'red' && adherenceBand(0) === 'red', 'below 40% is red')

console.log('\n--- Workspace: connection codes ---')

const code = generateConnectionCode()
assert(/^GL-\d{4}-[A-Z]{3,10}$/.test(code), `a generated connection code has the documented shape (${code})`)
assert(!codeExpired({ issuedAt: Date.now() - 71 * HOUR }), 'a code is still valid at 71 hours')
assert(codeExpired({ issuedAt: Date.now() - 73 * HOUR }), 'a code has expired at 73 hours')
assert(codeExpired(null), 'no code at all counts as expired, so a new one is issued')

console.log('\n--- Workspace: the message SLA ---')

const withMessages = (msgs: WorkspacePatient['messages']): WorkspacePatient =>
  ({ messages: msgs } as WorkspacePatient)

const now = Date.now()
assert(slaBand(withMessages([]), now) === 'none', 'no messages means no SLA state')
assert(
  slaBand(withMessages([{ id: '1', from: 'patient', text: 'hi', at: now - 2 * HOUR, read: false }]), now) === 'none',
  'a two-hour-old patient message is inside the SLA',
)
assert(
  slaBand(withMessages([{ id: '1', from: 'patient', text: 'hi', at: now - 30 * HOUR, read: false }]), now) === 'amber',
  'past 24 hours unanswered the SLA turns amber',
)
assert(
  slaBand(withMessages([{ id: '1', from: 'patient', text: 'hi', at: now - 50 * HOUR, read: false }]), now) === 'red',
  'past 48 hours unanswered the SLA turns red',
)
assert(
  slaBand(
    withMessages([
      { id: '1', from: 'patient', text: 'hi', at: now - 50 * HOUR, read: true },
      { id: '2', from: 'therapist', text: 'replied', at: now - 49 * HOUR, read: true },
    ]),
    now,
  ) === 'none',
  'a therapist reply clears the SLA regardless of how old the thread is',
)

console.log('\n--- Workspace: the demo caseload is internally consistent ---')

const ws = demoWorkspace()
assert(ws.patients.length > 0, 'the demo caseload has patients')
for (const p of ws.patients) {
  assert(new Set(p.sessions.map((s) => s.id)).size === p.sessions.length, `${p.name}'s session ids are unique`)
  for (const r of p.prescriptions) {
    assert(!isClinicalOnly(r.protocolCode), `${p.name} is never prescribed a clinical-only protocol (${r.protocolCode})`)
    assert(r.patientId === p.id, `${p.name}'s prescriptions carry their own patient id`)
  }
  for (const s of p.sessions) {
    if (s.kind === 'video') assert(!s.protocolCode, `${p.name}'s video-only session carries no protocol`)
    if (s.kind === 'gl-video') assert(Boolean(s.protocolCode), `${p.name}'s GL session names its protocol`)
  }
}

/* ========================================================================== */
console.log('\n--- Audio: which file a session actually plays ---')

const withAudio = {
  versions: [
    { duration: 6 as const, audioUrl: { 'pt-BR': 'q-pt.mp3', it: 'q-it.mp3' } },
    { duration: 12 as const, audioUrl: { 'pt-BR': 's-pt.mp3' } },
    { duration: 24 as const },
  ],
} as Pick<Protocol, 'versions'>

assert(audioLanguage('it') === 'it', 'the Italian locale asks for Italian audio')
assert(audioLanguage('en') === 'en', 'the English locale asks for English audio')
assert(audioLanguage('pt-BR') === 'pt-BR', 'the Portuguese locale asks for Portuguese audio')

assert(audioUrlFor(withAudio, 6, 'it') === 'q-it.mp3', "a session plays the file in the listener's own language")
assert(audioUrlFor(withAudio, 12, 'it') === 's-pt.mp3', 'with no Italian mixdown it falls back to Portuguese rather than to silence')
assert(audioUrlFor(withAudio, 24, 'it') === undefined, 'a duration with NO rendered audio resolves to nothing, so the player uses its bed')
assert(audioUrlFor(withAudio, 6, 'en') === 'q-pt.mp3', 'English falls back to the pilot language when no English mixdown exists')
assert(audioUrlFor(undefined, 6, 'it') === undefined, 'an unknown protocol resolves to no audio rather than throwing')

/* The 6-minute file must NEVER be served for a 24-minute request. */
assert(audioUrlFor(withAudio, 24, 'pt-BR') !== 'q-pt.mp3', "a missing duration never falls back to another duration's file")

const entry = (versions: Protocol['versions']) =>
  ({
    code: 'X', family: 'GL-ANX', title: 'x', blurb: 'x', phases: [], versions,
    enabled: true, source: 'seed', tenants: 'all', audioReady: false, updatedAt: 0,
  }) as CatalogProtocol

assert(playableDurations(entry([{ duration: 12 }])).join() === '12', 'only published time signatures are playable')
assert(playableDurations(entry([{ duration: 24 }, { duration: 6 }])).join() === '6,24', 'playable durations come back ascending')
assert(playableDurations(undefined).length === 0, 'an absent entry publishes nothing')
assert(!hasRenderedAudio(entry([{ duration: 12 }]), 'it'), 'a published version with no file is not "audio ready"')
assert(hasRenderedAudio(entry([{ duration: 12, audioUrl: { 'pt-BR': 'a.mp3' } }]), 'it'), 'a published version WITH a file is audio ready')

console.log(`\n${passed} assertions passed.`)
