/* ============================================================================
   Good Loop — the five B2B assessment instruments

   Source: "Good Loop — B2B Assessment Instruments: Developer Reference" v1.0,
   August 2026, marked **Confirmed — these 5 instruments are the definitive MVP
   set**. Scope: the Therapist Guided channel.

   The system's job is to ADMINISTER, SCORE, STORE and DISPLAY. It never
   interprets. That is not a UI preference — it is the line between a wellbeing
   product and a diagnostic one, so it is enforced here rather than left to the
   screens:

   · No function in this file returns a severity, a band, or a label. Scores
     come back as numbers with their range, and `SCORE_DIRECTION` says only
     which way is "more of the construct" — never which way is good.
   · Every instrument is SELF-REPORT, completed by the patient in their own
     app, never during a video call.
   · A completed record is append-only. `AssessmentRecord.immutable` is not
     decoration: a score that can be edited after submission is worthless as
     clinical evidence, and these records may be used to demonstrate efficacy
     in an NR-1 compliance context.

   All five are public domain and carry no licence fee. The item text is the
   published English wording; per CLAUDE.md it stays in English until validated
   clinical translations exist, while the surrounding UI is localized normally.
   ============================================================================ */

import type { IconName } from '../selfuse/icons'

export type InstrumentId = 'DASS21' | 'PSS10' | 'BRS' | 'CBI' | 'VAS'

/** T0 baseline, then the end of each of the first three months. */
export type Timepoint = 'T0' | 'T1' | 'T2' | 'T3' | 'session'

export interface ResponseOption {
  value: number
  label: string
}

export interface InstrumentItem {
  /** 1-indexed, matching the published instrument — the subscale maps use it. */
  index: number
  text: string
  /** Which subscale it belongs to, where the instrument has them. */
  subscale?: string
  /** Reverse-scored against its own scale. */
  reverse?: boolean
}

export interface Instrument {
  id: InstrumentId
  name: string
  /** The stem a respondent reads before the items. */
  stem: string
  items: InstrumentItem[]
  options: ResponseOption[]
  /** Roughly how long a sitting takes, for the "7 minutes max" rule. */
  minutes: string
  licence: string
}

/* ============================================================== DASS-21 ==== */

const DASS21_ITEMS: [string, 'depression' | 'anxiety' | 'stress'][] = [
  ['I found it hard to wind down', 'stress'],
  ['I was aware of dryness of my mouth', 'anxiety'],
  ["I couldn't seem to experience any positive feeling at all", 'depression'],
  ['I experienced breathing difficulty (e.g. excessively rapid breathing, breathlessness in the absence of physical exertion)', 'anxiety'],
  ['I found it difficult to work up the initiative to do things', 'depression'],
  ['I tended to over-react to situations', 'stress'],
  ['I experienced trembling (e.g. in the hands)', 'anxiety'],
  ['I felt that I was using a lot of nervous energy', 'stress'],
  ['I was worried about situations in which I might panic and make a fool of myself', 'anxiety'],
  ['I felt that I had nothing to look forward to', 'depression'],
  ['I found myself getting agitated', 'stress'],
  ['I found it difficult to relax', 'stress'],
  ['I felt down-hearted and blue', 'depression'],
  ['I was intolerant of anything that kept me from getting on with what I was doing', 'stress'],
  ['I felt I was close to panic', 'anxiety'],
  ['I was unable to become enthusiastic about anything', 'depression'],
  ["I felt I wasn't worth much as a person", 'depression'],
  ['I felt that I was rather touchy', 'stress'],
  ['I was aware of the action of my heart in the absence of physical exertion', 'anxiety'],
  ['I felt scared without any good reason', 'anxiety'],
  ['I felt that life was meaningless', 'depression'],
]

export const DASS21: Instrument = {
  id: 'DASS21',
  name: 'DASS-21',
  stem: 'Please indicate how much each statement applied to you over the past week.',
  items: DASS21_ITEMS.map(([text, subscale], i) => ({ index: i + 1, text, subscale })),
  options: [
    { value: 0, label: 'Did not apply to me at all' },
    { value: 1, label: 'Applied to me to some degree, or some of the time' },
    { value: 2, label: 'Applied to me to a considerable degree, or a good part of time' },
    { value: 3, label: 'Applied to me very much, or most of the time' },
  ],
  minutes: '5–7',
  licence: 'Public domain',
}

/* ================================================================ PSS-10 === */

const PSS10_ITEMS: [string, boolean][] = [
  ['been upset because of something that happened unexpectedly?', false],
  ['felt that you were unable to control the important things in your life?', false],
  ['felt nervous and stressed?', false],
  ['felt confident about your ability to handle your personal problems?', true],
  ['felt that things were going your way?', true],
  ['found that you could not cope with all the things that you had to do?', false],
  ['been able to control irritations in your life?', true],
  ['felt that you were on top of things?', true],
  ['been angered because of things that were outside of your control?', false],
  ['felt difficulties were piling up so high that you could not overcome them?', false],
]

export const PSS10: Instrument = {
  id: 'PSS10',
  name: 'PSS-10',
  stem: 'In the last month, how often have you…',
  items: PSS10_ITEMS.map(([text, reverse], i) => ({ index: i + 1, text, reverse })),
  options: [
    { value: 0, label: 'Never' },
    { value: 1, label: 'Almost never' },
    { value: 2, label: 'Sometimes' },
    { value: 3, label: 'Fairly often' },
    { value: 4, label: 'Very often' },
  ],
  minutes: '2–3',
  licence: 'Public domain',
}

/* =================================================================== BRS === */

const BRS_ITEMS: [string, boolean][] = [
  ['I tend to bounce back quickly after hard times', false],
  ['I have a hard time making it through stressful events', true],
  ['It does not take me long to recover from a stressful event', false],
  ['It is hard for me to snap back when something bad happens', true],
  ['I usually come through difficult times with little trouble', false],
  ['I tend to take a long time to get over set-backs in my life', true],
]

export const BRS: Instrument = {
  id: 'BRS',
  name: 'BRS',
  stem: 'Please indicate how much you agree with each statement.',
  items: BRS_ITEMS.map(([text, reverse], i) => ({ index: i + 1, text, reverse })),
  options: [
    { value: 1, label: 'Strongly disagree' },
    { value: 2, label: 'Disagree' },
    { value: 3, label: 'Neutral' },
    { value: 4, label: 'Agree' },
    { value: 5, label: 'Strongly agree' },
  ],
  minutes: '1–2',
  licence: 'Public domain',
}

/* =================================================================== CBI === */

const CBI_ITEMS: [string, 'personal' | 'workRelated' | 'clientRelated', boolean][] = [
  ['How often do you feel tired?', 'personal', false],
  ['How often are you physically exhausted?', 'personal', false],
  ['How often are you emotionally exhausted?', 'personal', false],
  ['How often do you think: "I can\'t take it anymore"?', 'personal', false],
  ['How often do you feel worn out?', 'personal', false],
  ['How often do you feel weak and susceptible to illness?', 'personal', false],
  ['Is your work emotionally exhausting?', 'workRelated', false],
  ['Do you feel burnt out because of your work?', 'workRelated', false],
  ['Does your work frustrate you?', 'workRelated', false],
  ['Do you feel worn out at the end of the working day?', 'workRelated', false],
  ['Are you exhausted in the morning at the thought of another day at work?', 'workRelated', false],
  ['Do you feel that every working hour is tiring for you?', 'workRelated', false],
  // The published CBI reverse-scores this one: having energy left is the
  // ABSENCE of burnout. The developer reference does not mention it; scoring it
  // forward would make a healthy answer read as exhaustion.
  ['Do you have enough energy for family and friends during leisure time?', 'workRelated', true],
  ['Do you find it hard to work with clients?', 'clientRelated', false],
  ['Do you find it frustrating to work with clients?', 'clientRelated', false],
  ['Does it drain your energy to work with clients?', 'clientRelated', false],
  ['Do you feel that you give more than you get back when you work with clients?', 'clientRelated', false],
  ['Are you tired of working with clients?', 'clientRelated', false],
  ['Do you sometimes wonder how long you will be able to continue working with clients?', 'clientRelated', false],
]

/** Personal and work-related items ask about FREQUENCY. */
export const CBI_FREQUENCY: ResponseOption[] = [
  { value: 0, label: 'Never / almost never' },
  { value: 25, label: 'Seldom' },
  { value: 50, label: 'Sometimes' },
  { value: 75, label: 'Often' },
  { value: 100, label: 'Always' },
]

/** Client-related items ask about DEGREE. Same values, different words. */
export const CBI_DEGREE: ResponseOption[] = [
  { value: 0, label: 'To a very low degree' },
  { value: 25, label: 'To a low degree' },
  { value: 50, label: 'Somewhat' },
  { value: 75, label: 'To a high degree' },
  { value: 100, label: 'To a very high degree' },
]

export const CBI: Instrument = {
  id: 'CBI',
  name: 'CBI',
  stem: 'Please answer for how things have been recently.',
  items: CBI_ITEMS.map(([text, subscale, reverse], i) => ({ index: i + 1, text, subscale, reverse })),
  // The default set; `optionsForItem` picks the right scale per item.
  options: CBI_FREQUENCY,
  minutes: '4–5',
  licence: 'Public domain (Kristensen et al., 2005)',
}

/** CBI is the one instrument whose response wording changes mid-questionnaire. */
export function optionsForItem(instrument: Instrument, item: InstrumentItem): ResponseOption[] {
  if (instrument.id !== 'CBI') return instrument.options
  return item.subscale === 'clientRelated' ? CBI_DEGREE : CBI_FREQUENCY
}

/* =================================================================== VAS === */

/** A face scale rather than a 100 mm line: a line needs fine motor precision
    that is clumsy on a phone and adds measurement noise from imprecise taps.
    The system stores the number; the person sees only the face.

    The faces are DRAWN, not emoji — one instrument in one hand, at a size the
    app chooses, instead of five pictures from whichever vendor the device
    ships. `icon` is the glyph's name; see selfuse/icons.tsx. */
export const VAS_OPTIONS: (ResponseOption & { icon: IconName })[] = [
  { value: 1, icon: 'vas1', label: 'Very distressed' },
  { value: 2, icon: 'vas2', label: 'Somewhat distressed' },
  { value: 3, icon: 'vas3', label: 'Neutral' },
  { value: 4, icon: 'vas4', label: 'Good' },
  { value: 5, icon: 'vas5', label: 'Very good' },
]

export const INSTRUMENTS: Record<Exclude<InstrumentId, 'VAS'>, Instrument> = {
  DASS21, PSS10, BRS, CBI,
}

/* =============================================================== scoring === */

export interface Dass21Scores { depression: number; anxiety: number; stress: number }
export interface CbiScores { personal: number; workRelated: number; clientRelated: number }

export type Scores =
  | ({ kind: 'DASS21' } & { raw: Dass21Scores; scaled: Dass21Scores })
  | { kind: 'PSS10'; total: number }
  | { kind: 'BRS'; mean: number }
  | ({ kind: 'CBI' } & CbiScores)
  | { kind: 'VAS'; pre: number; post: number; delta: number }

/** One response, by 1-indexed item. */
export type Responses = Record<number, number>

/** Apply reverse scoring against the instrument's own option range. */
function scored(instrument: Instrument, item: InstrumentItem, value: number): number {
  if (!item.reverse) return value
  const opts = optionsForItem(instrument, item)
  const min = Math.min(...opts.map((o) => o.value))
  const max = Math.max(...opts.map((o) => o.value))
  return min + max - value
}

/** Every item answered? A partial questionnaire must not be scored. */
export function isComplete(instrument: Instrument, responses: Responses): boolean {
  return instrument.items.every((i) => typeof responses[i.index] === 'number')
}

export function missingItems(instrument: Instrument, responses: Responses): number[] {
  return instrument.items.filter((i) => typeof responses[i.index] !== 'number').map((i) => i.index)
}

function subscaleSum(instrument: Instrument, responses: Responses, subscale: string): number {
  return instrument.items
    .filter((i) => i.subscale === subscale)
    .reduce((n, i) => n + scored(instrument, i, responses[i.index]), 0)
}

function subscaleMean(instrument: Instrument, responses: Responses, subscale: string): number {
  const items = instrument.items.filter((i) => i.subscale === subscale)
  if (!items.length) return 0
  const total = items.reduce((n, i) => n + scored(instrument, i, responses[i.index]), 0)
  return round2(total / items.length)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * DASS-21 keeps BOTH numbers.
 *
 * The raw subscale sums are 0–21; multiplying by two puts them on the DASS-42
 * norms the published tables are written against. Storing only one of them
 * would leave a reader guessing which scale a "14" is on — a real risk when the
 * two differ by exactly a factor most people will not notice.
 */
export function scoreDass21(responses: Responses): { raw: Dass21Scores; scaled: Dass21Scores } {
  const raw: Dass21Scores = {
    depression: subscaleSum(DASS21, responses, 'depression'),
    anxiety: subscaleSum(DASS21, responses, 'anxiety'),
    stress: subscaleSum(DASS21, responses, 'stress'),
  }
  return {
    raw,
    scaled: { depression: raw.depression * 2, anxiety: raw.anxiety * 2, stress: raw.stress * 2 },
  }
}

export function scorePss10(responses: Responses): number {
  return PSS10.items.reduce((n, i) => n + scored(PSS10, i, responses[i.index]), 0)
}

export function scoreBrs(responses: Responses): number {
  const total = BRS.items.reduce((n, i) => n + scored(BRS, i, responses[i.index]), 0)
  return round2(total / BRS.items.length)
}

export function scoreCbi(responses: Responses): CbiScores {
  return {
    personal: subscaleMean(CBI, responses, 'personal'),
    workRelated: subscaleMean(CBI, responses, 'workRelated'),
    clientRelated: subscaleMean(CBI, responses, 'clientRelated'),
  }
}

/** Post minus pre. Positive = the session moved them up the scale. */
export function scoreVas(pre: number, post: number): { pre: number; post: number; delta: number } {
  return { pre, post, delta: post - pre }
}

/** The publishable range of each score, so a screen can draw a bar without
    inventing its own bounds. */
export const SCORE_RANGE: Record<string, { min: number; max: number }> = {
  'DASS21.raw': { min: 0, max: 21 },
  'DASS21.scaled': { min: 0, max: 42 },
  PSS10: { min: 0, max: 40 },
  BRS: { min: 1, max: 5 },
  CBI: { min: 0, max: 100 },
  VAS: { min: 1, max: 5 },
}

/**
 * Which direction is MORE of the measured construct — not which is better.
 *
 * A higher DASS-21 is more symptom load and a higher BRS is more resilience;
 * calling either "good" would be an interpretation, and interpretation is the
 * therapist's alone. A screen colours a trend from this plus the therapist's
 * reading, never from the number itself.
 */
export const SCORE_DIRECTION: Record<InstrumentId, 'higher-is-more-symptom' | 'higher-is-more-resource'> = {
  DASS21: 'higher-is-more-symptom',
  PSS10: 'higher-is-more-symptom',
  CBI: 'higher-is-more-symptom',
  BRS: 'higher-is-more-resource',
  VAS: 'higher-is-more-resource',
}

/* ============================================================== schedule === */

export interface ScheduleEntry {
  timepoint: Timepoint
  /** Days from the start of the journey when this is proposed. */
  dayFrom: number
  instruments: InstrumentId[]
  note?: string
}

/**
 * The proposed timing. The system PROPOSES; the therapist confirms, postpones
 * or ignores — nothing here is ever sent automatically except VAS, which is
 * the one instrument that runs without confirmation.
 *
 * PSS-10 and BRS skip T1 deliberately, to keep the month-one review under the
 * seven-minute ceiling.
 */
export const SCHEDULE: ScheduleEntry[] = [
  { timepoint: 'T0', dayFrom: 1, instruments: ['DASS21'], note: 'Baseline, days 1–2' },
  { timepoint: 'T0', dayFrom: 3, instruments: ['PSS10', 'BRS'], note: 'Baseline, days 3–4 — one micro-session' },
  { timepoint: 'T1', dayFrom: 28, instruments: ['DASS21'], note: 'M1 Review — DASS-21 only, to cap the burden' },
  { timepoint: 'T2', dayFrom: 56, instruments: ['DASS21', 'PSS10', 'BRS'], note: 'M2 Review' },
  { timepoint: 'T3', dayFrom: 84, instruments: ['DASS21', 'PSS10', 'BRS'], note: 'Journey completion' },
]

/** Whether an instrument is due at a timepoint. CBI is never scheduled — it is
    conditional, see `proposesCbi`. */
export function isDueAt(instrument: InstrumentId, timepoint: Timepoint): boolean {
  return SCHEDULE.some((s) => s.timepoint === timepoint && s.instruments.includes(instrument))
}

/** What the system proposes at a given day of the journey, if anything. */
export function dueOnDay(day: number): ScheduleEntry[] {
  return SCHEDULE.filter((s) => day >= s.dayFrom && day < s.dayFrom + 2)
}

/**
 * CBI is proposed, never scheduled: it is offered when the DASS-21 pattern
 * looks like burnout rather than at a fixed date.
 *
 * The reference gives the trigger on the ×2 (DASS-42) scale, which is the one
 * the published tables use — passing raw sums would fire at roughly half the
 * intended threshold, so this takes the scaled scores explicitly.
 */
export function proposesCbi(scaled: Dass21Scores): boolean {
  return scaled.stress >= 19 && scaled.depression >= 10
}

/* ================================================================ record === */

export type AssessmentStatus = 'proposed' | 'confirmed' | 'in_progress' | 'completed' | 'postponed'

export interface AssessmentRecord {
  id: string
  patientId: string
  instrumentId: InstrumentId
  timepoint: Timepoint
  administeredAt: number
  completedAt: number | null
  status: AssessmentStatus
  proposedBy: 'system'
  /** 'auto' for VAS, which needs no confirmation. */
  confirmedBy: string | 'auto' | null
  responses: { itemIndex: number; value: number }[]
  scores: Scores | null
  /** True once completed. See `freeze`. */
  immutable: boolean
}

/**
 * Complete a record: score it, stamp it, and freeze it.
 *
 * Append-only is a clinical-integrity AND a legal-evidence requirement — these
 * records may be used to demonstrate efficacy in an NR-1 compliance context, and
 * a score that can be edited afterwards proves nothing. `freeze` is the only
 * way a record reaches `completed`, and `canEdit` is what every caller should
 * ask before writing.
 */
export function freeze(record: AssessmentRecord, responses: Responses, at = Date.now()): AssessmentRecord {
  if (record.immutable) throw new Error('A completed assessment cannot be modified.')
  const instrument = record.instrumentId === 'VAS' ? null : INSTRUMENTS[record.instrumentId]
  if (instrument && !isComplete(instrument, responses)) {
    throw new Error(`Incomplete: items ${missingItems(instrument, responses).join(', ')} unanswered.`)
  }
  return {
    ...record,
    responses: Object.entries(responses).map(([k, v]) => ({ itemIndex: Number(k), value: v })),
    scores: scoreFor(record.instrumentId, responses),
    completedAt: at,
    status: 'completed',
    immutable: true,
  }
}

export function canEdit(record: AssessmentRecord): boolean {
  return !record.immutable && record.status !== 'completed'
}

function scoreFor(id: InstrumentId, responses: Responses): Scores {
  switch (id) {
    case 'DASS21': return { kind: 'DASS21', ...scoreDass21(responses) }
    case 'PSS10': return { kind: 'PSS10', total: scorePss10(responses) }
    case 'BRS': return { kind: 'BRS', mean: scoreBrs(responses) }
    case 'CBI': return { kind: 'CBI', ...scoreCbi(responses) }
    case 'VAS': return { kind: 'VAS', ...scoreVas(responses[1] ?? 0, responses[2] ?? 0) }
  }
}

/** A percentage change between two measurements, for the trend readout. Never
    a judgement — the sign is arithmetic, the meaning is the therapist's. */
export function percentDelta(before: number, after: number): number | null {
  if (!Number.isFinite(before) || before === 0) return null
  return Math.round(((after - before) / Math.abs(before)) * 100)
}
