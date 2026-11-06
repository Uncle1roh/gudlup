/* ============================================================================
   Good Loop — Self Use measurement (GL-Check · WHO-5 · Daily Mood)

   Three instruments, all OPTIONAL, all non-clinical in how they are shown:

     GL-Check    weekly, 5 dimensions, 1–5 each, ~60–90s
     WHO-5       every 4 weeks, 5 standard items, 0–5 each, reported as 0–100%
     Daily Mood  one tap, 5 levels, optional 200-char note

   Rules that this module enforces rather than documents:
   · No clinical interpretation is ever derived here. The only labels produced
     are "Trending up" / "Stable" / "Trending down" — never "good", "poor",
     "at risk", "concerning".
   · WHO-5 items stay in ENGLISH (as DASS-21 does) until validated clinical
     translations exist; the surrounding UI is localized normally.
   · The Safety Gateway Level 2 trigger is computed from these series only, and
     fires ONCE per trigger cycle.
   ============================================================================ */

/* --------------------------------------------------------------- GL-Check -- */

export type GlDimension = 'energy' | 'focus' | 'sleep' | 'balance' | 'motivation'

export interface GlCheckQuestion {
  id: GlDimension
  label: string
  /** The question a person reads. */
  question: string
  lowLabel: string
  highLabel: string
}

export const GL_CHECK_QUESTIONS: GlCheckQuestion[] = [
  { id: 'energy', label: 'Energy', question: 'How has your energy been this week?', lowLabel: 'Very low', highLabel: 'Very high' },
  { id: 'focus', label: 'Focus', question: 'How easy has it been to concentrate?', lowLabel: 'Very hard', highLabel: 'Very easy' },
  { id: 'sleep', label: 'Sleep', question: 'How well have you been sleeping?', lowLabel: 'Very poorly', highLabel: 'Very well' },
  { id: 'balance', label: 'Balance', question: 'How balanced has your week felt?', lowLabel: 'Not at all', highLabel: 'Very balanced' },
  { id: 'motivation', label: 'Motivation', question: 'How motivated have you felt?', lowLabel: 'Very low', highLabel: 'Very high' },
]

export const GL_DIMENSIONS: GlDimension[] = GL_CHECK_QUESTIONS.map((q) => q.id)

export interface GlCheckEntry {
  /** epoch ms */
  at: number
  scores: Record<GlDimension, number> // 1..5
}

/** Mean across the five dimensions, 1..5, or null when the entry is empty. */
export function glCheckAverage(e: GlCheckEntry | null | undefined): number | null {
  if (!e) return null
  const vals = GL_DIMENSIONS.map((d) => e.scores[d]).filter((v) => typeof v === 'number')
  if (!vals.length) return null
  return Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2))
}

/* ------------------------------------------------------------------ WHO-5 -- */

/** The five standard WHO-5 items. English, per the clinical-translation rule. */
export const WHO5_ITEMS: string[] = [
  'I have felt cheerful and in good spirits',
  'I have felt calm and relaxed',
  'I have felt active and vigorous',
  'I woke up feeling fresh and rested',
  'My daily life has been filled with things that interest me',
]

export const WHO5_STEM = 'Over the last two weeks…'

/** Response options, 5 → 0. */
export const WHO5_OPTIONS: { value: number; label: string }[] = [
  { value: 5, label: 'All of the time' },
  { value: 4, label: 'Most of the time' },
  { value: 3, label: 'More than half the time' },
  { value: 2, label: 'Less than half the time' },
  { value: 1, label: 'Some of the time' },
  { value: 0, label: 'At no time' },
]

export interface Who5Entry {
  at: number
  /** Five raw item scores, 0..5 each. */
  items: number[]
}

/** Raw 0–25 → percentage 0–100, the only form ever shown. */
export function who5Percent(e: Who5Entry | null | undefined): number | null {
  if (!e || e.items.length !== WHO5_ITEMS.length) return null
  const raw = e.items.reduce((a, b) => a + b, 0)
  return Math.round(raw * 4)
}

/* ------------------------------------------------------------------- Mood --

   TWO SLIDERS, asked at the two ends of a session (POs, 2026-11-02).

   What they replace: five emoji faces before the protocol and five after it,
   and a separate "How was your day?" button on the mood calendar. Three
   askings of one question, two instruments, and the calendar only ever had
   anything in it if the person remembered to go and press the button.

   One instrument now, two axes, in the one place a person is already
   stopping: ENERGY (how switched on) and MOOD (how pleasant). Both run
   −1…+1 — the two axes of the circumplex, which is what the five faces were
   a one-dimensional slice of. The reading taken AFTER the session is the
   day's mood-calendar entry, so the calendar fills itself from what the
   person already answered and has no button of its own.

   `level` (1–5) stays, derived from the mood axis, because three things
   downstream are built on it and none of them should have to know about
   radians: the calendar's shade, the monthly PDF, and the three buckets the
   corporate dashboard is ever allowed to see. */

export type MoodLevel = 1 | 2 | 3 | 4 | 5

/** A reading: both axes, −1…+1. Nothing here is a score and nothing is
    compared to a threshold (M1-08). */
export interface MoodPoint {
  /** Unpleasant (−1) … pleasant (+1). */
  valence: number
  /** Calm (−1) … lit up (+1). */
  arousal: number
}

/** Two decimals, which is as fine as a finger on a phone can be. */
export function roundAxis(v: number): number {
  return Math.round(Math.max(-1, Math.min(1, v)) * 100) / 100
}

/** The five steps of the mood axis, in the person's own words. No emoji: the
    faces are what the sliders replaced. */
export const MOOD_LEVELS: { value: MoodLevel; label: string }[] = [
  { value: 1, label: 'Tough' },
  { value: 2, label: 'So-so' },
  { value: 3, label: 'Normal' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Great' },
]

/** The five steps of the energy axis. Never "good" or "bad": energy is not
    a thing a person can be failing at, so the words are quantities. They are
    also the words the weekly check-in already uses for its energy question,
    which is what keeps them agreeing with the feminine "energia" in both
    Portuguese and Italian. */
export const ENERGY_LEVELS: { value: MoodLevel; label: string }[] = [
  { value: 1, label: 'Very low' },
  { value: 2, label: 'Low' },
  { value: 3, label: 'Medium' },
  { value: 4, label: 'High' },
  { value: 5, label: 'Very high' },
]

/** −1…+1 → 1…5. The midpoint is 3, and the ends are 1 and 5. */
export function levelFromAxis(v: number): MoodLevel {
  const n = Math.round(((Math.max(-1, Math.min(1, v)) + 1) / 2) * 4) + 1
  return Math.min(5, Math.max(1, n)) as MoodLevel
}

export function moodLabel(level: MoodLevel): string {
  return MOOD_LEVELS.find((l) => l.value === level)?.label ?? ''
}

export function energyLabel(level: MoodLevel): string {
  return ENERGY_LEVELS.find((l) => l.value === level)?.label ?? ''
}

export const MOOD_NOTE_MAX = 200

export interface MoodEntry {
  at: number
  /** YYYY-MM-DD. Several entries can share one — see `addMood`. */
  day: string
  /** 1–5, derived from `valence` when the entry came from the sliders. */
  level: MoodLevel
  /** The reading itself, when there is one. Optional because entries written
      by the old five-face check-in carry only a level. */
  valence?: number
  arousal?: number
  note?: string
}

/** Today's entry from a reading taken at the end of a session. */
export function moodEntryFrom(point: MoodPoint, at = Date.now()): MoodEntry {
  return {
    at,
    day: dayKey(at),
    level: levelFromAxis(point.valence),
    valence: roundAxis(point.valence),
    arousal: roundAxis(point.arousal),
  }
}

/** The 1–5 VAS the assessment series has always carried, from the mood axis.
    The series does not change shape: the instrument in front of the person
    did, and the number it produces is the same number. */
export function vasFromMood(point: MoodPoint): number {
  return levelFromAxis(point.valence)
}

/**
 * EVERY reading is kept, including several on one day (POs, 2026-11-06).
 *
 * It used to be one per day, newest wins — the end of today's second session
 * overwrote the end of today's first. That threw away the more interesting
 * half of the answer: somebody who starts the day flat and ends it bright
 * has told you something that a single square cannot say, and the POs asked
 * for the day to be "uma mescla de todos os inputs coloridos feitos no dia".
 * The calendar blends them (`dayMood`, `moodGradient`); nothing is replaced.
 *
 * Kept in time order, because the blend is drawn in the order the day
 * happened.
 */
export function addMood(moods: MoodEntry[], entry: MoodEntry): MoodEntry[] {
  return [...moods, entry].sort((a, b) => a.at - b.at)
}

/** The readings of one day, oldest first. */
export function moodsOfDay(moods: MoodEntry[], day: string): MoodEntry[] {
  return moods.filter((m) => m.day === day).sort((a, b) => a.at - b.at)
}

/** Every day that has at least one reading, newest day first. */
export function moodDays(moods: MoodEntry[]): string[] {
  return [...new Set(moods.map((m) => m.day))].sort().reverse()
}

/* ------------------------------------------------------- the colour ------

   THE FOUR CORNERS OF THE SQUARE. A reading is a point in the circumplex,
   and the circumplex has had the same four colours since Russell drew it:
   high energy and unpleasant is red, high energy and pleasant is yellow,
   low energy and unpleasant is blue, low energy and pleasant is green. This
   is not a palette somebody invented for this app — it is the one a person
   who has seen a mood meter before already knows how to read.

   Vivid on purpose (POs, 2026-11-06: "cores mais vivas e mais
   expressivas"). The first pass was muted to sit politely beside the cream
   action, and a mood calendar in four shades of sage says nothing from
   across a room.

   WHAT THIS IS NOT. It is not the mood COLOUR MECHANIC that was built and
   removed in October — no engine, no tinted glasses, no colour that follows
   the person from screen to screen. It is the fill of a calendar square and
   of one pill that opens that calendar, and it is computed here, from the
   two numbers the person moved, with nothing kept anywhere. */

type Rgb = [number, number, number]

const CORNER: { hiUnpleasant: Rgb; hiPleasant: Rgb; loUnpleasant: Rgb; loPleasant: Rgb } = {
  hiUnpleasant: [224, 62, 62],   // lit up and not enjoying it
  hiPleasant: [245, 183, 0],     // lit up and enjoying it
  loUnpleasant: [45, 102, 201],  // low and heavy
  loPleasant: [25, 169, 116],    // low and at ease
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
]

/** The colour of one reading, as `rgb(…)`. Bilinear between the corners:
    the mood axis picks left-to-right, the energy axis top-to-bottom. */
export function moodColor(point: MoodPoint): string {
  const x = (Math.max(-1, Math.min(1, point.valence)) + 1) / 2
  const y = (Math.max(-1, Math.min(1, point.arousal)) + 1) / 2
  const hi = mix(CORNER.hiUnpleasant, CORNER.hiPleasant, x)
  const lo = mix(CORNER.loUnpleasant, CORNER.loPleasant, x)
  const [r, g, b] = mix(lo, hi, y)
  return `rgb(${r}, ${g}, ${b})`
}

/** The colour of a stored entry. Entries written before the two axes existed
    carry only a 1–5 level; they are placed on the mood axis at that level
    with the energy axis unknown, which is the middle. */
export function entryColor(m: MoodEntry): string {
  const valence = m.valence ?? (m.level - 3) / 2
  return moodColor({ valence, arousal: m.arousal ?? 0 })
}

/** The whole day, as one fill: a flat colour for a single reading, and a
    gradient across them — in the order they happened — for a day with more
    than one. A morning that was heavy and an evening that was not should
    look like a day that changed, not like the average of the two. */
export function moodGradient(entries: MoodEntry[]): string | null {
  if (!entries.length) return null
  const stops = entries.map(entryColor)
  if (stops.length === 1) return stops[0]
  const step = 100 / stops.length
  const bands = stops.map((c, i) => `${c} ${(i * step).toFixed(1)}%, ${c} ${((i + 1) * step).toFixed(1)}%`)
  return `linear-gradient(135deg, ${bands.join(', ')})`
}

/** The day's reading as ONE point — for anything that needs a single
    answer (the pill's own fill, the 1–5 the series carries). The mean of
    what was said, which is the honest summary of a mixed day. */
export function dayMood(entries: MoodEntry[]): MoodPoint | null {
  const withAxes = entries.filter((m) => m.valence !== undefined)
  const src = withAxes.length ? withAxes : entries
  if (!src.length) return null
  const v = src.reduce((a, m) => a + (m.valence ?? (m.level - 3) / 2), 0) / src.length
  const r = src.reduce((a, m) => a + (m.arousal ?? 0), 0) / src.length
  return { valence: roundAxis(v), arousal: roundAxis(r) }
}

export function dayKey(ms: number): string {
  const d = new Date(ms)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Positive (4–5) / Neutral (3) / Negative (1–2) — the only three buckets the
    corporate dashboard is ever allowed to see. */
export type MoodBucket = 'positive' | 'neutral' | 'negative'
export function moodBucket(level: MoodLevel): MoodBucket {
  return level >= 4 ? 'positive' : level === 3 ? 'neutral' : 'negative'
}

/* ------------------------------------------------------------------ trend -- */

export type TrendDirection = 'up' | 'flat' | 'down'

export interface Trend {
  direction: TrendDirection
  /** Signed change, already rounded for display. */
  delta: number
  /** "Trending up" / "Stable" / "Trending down" — the ONLY allowed labels. */
  label: string
}

const TREND_LABEL: Record<TrendDirection, string> = {
  up: 'Trending up',
  flat: 'Stable',
  down: 'Trending down',
}

/**
 * Compare a current value against a previous one.
 * `epsilon` is the band inside which a change reads as "Stable" — 0.05 for a
 * 1–5 scale, 1 for a 0–100 one.
 */
export function trend(current: number | null, previous: number | null, epsilon = 0.05, decimals = 1): Trend | null {
  if (current == null || previous == null) return null
  const raw = current - previous
  const delta = Number(raw.toFixed(decimals))
  const direction: TrendDirection = Math.abs(raw) <= epsilon ? 'flat' : raw > 0 ? 'up' : 'down'
  return { direction, delta, label: TREND_LABEL[direction] }
}

export function trendArrow(d: TrendDirection): string {
  return d === 'up' ? '↑' : d === 'down' ? '↓' : '→'
}

/** "+0.3 vs previous" / "No change" — never "improving" or "worsening". */
export function trendDeltaLabel(t: Trend | null, unit = ''): string {
  if (!t) return '—'
  if (t.direction === 'flat') return 'No change'
  const sign = t.delta > 0 ? '+' : '−'
  return `${sign}${Math.abs(t.delta)}${unit} vs previous`
}

/* -------------------------------------------------------- Safety Gateway -- */

export interface SafetySignals {
  /** GL-Check entries, newest LAST. */
  glChecks: GlCheckEntry[]
  /** Mood entries, newest LAST. */
  moods: MoodEntry[]
  /** ms of the last completed session, or null if never. */
  lastSessionAt: number | null
  /** now, injected so this is testable. */
  now: number
}

export type SafetyTrigger = 'declining-checkin' | 'low-mood-run' | 'inactivity-after-decline'

/**
 * Level 2 of the Safety Gateway is DATA-triggered and deliberately narrow:
 *   · the GL-Check average has fallen three weeks running, or
 *   · Daily Mood has been at its lowest for 5+ consecutive days, or
 *   · 14+ days of inactivity that FOLLOW a declining trend.
 * It is empathetic, never diagnostic, and shows once per trigger cycle — the
 * caller stores the returned trigger id and does not re-show it for the same one.
 */
export function safetyLevel2Trigger(s: SafetySignals): SafetyTrigger | null {
  const checks = s.glChecks.slice(-4)
  const avgs = checks.map(glCheckAverage).filter((v): v is number => v != null)
  const declining3 =
    avgs.length >= 4 && avgs[1] < avgs[0] && avgs[2] < avgs[1] && avgs[3] < avgs[2]
  if (declining3) return 'declining-checkin'

  // 5+ consecutive calendar days at the lowest level, ending today or yesterday
  const byDay = new Map(s.moods.map((m) => [m.day, m]))
  let run = 0
  for (let i = 0; i < 14; i += 1) {
    const key = dayKey(s.now - i * 86_400_000)
    const m = byDay.get(key)
    if (!m) break
    if (m.level === 1) run += 1
    else break
  }
  if (run >= 5) return 'low-mood-run'

  const idleDays = s.lastSessionAt == null ? Infinity : (s.now - s.lastSessionAt) / 86_400_000
  if (idleDays >= 14) {
    /* Inactivity ALONE is not a signal — plenty of people simply stop using an
       app they no longer need. It only counts when the data BEFORE the silence
       was already heading down. Note the explicit length checks: `[].every()`
       is true, so an empty mood series would otherwise read as "every recent
       mood was low" and fire on anyone who went quiet. */
    const checksDeclining = avgs.length >= 2 && avgs[avgs.length - 1] < avgs[avgs.length - 2]
    const recentMoods = s.moods.slice(-3)
    const moodsLow = recentMoods.length >= 3 && recentMoods.every((m) => m.level <= 2)
    if (checksDeclining || moodsLow) return 'inactivity-after-decline'
  }
  return null
}
