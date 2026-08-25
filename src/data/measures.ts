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

/* ------------------------------------------------------------- Daily Mood -- */

export type MoodLevel = 1 | 2 | 3 | 4 | 5

export const MOOD_LEVELS: { value: MoodLevel; label: string; icon: string }[] = [
  { value: 1, label: 'Tough', icon: '😔' },
  { value: 2, label: 'So-so', icon: '😕' },
  { value: 3, label: 'Normal', icon: '😐' },
  { value: 4, label: 'Good', icon: '🙂' },
  { value: 5, label: 'Great', icon: '😄' },
]

export const MOOD_NOTE_MAX = 200

export interface MoodEntry {
  at: number
  /** YYYY-MM-DD, so one entry per calendar day. */
  day: string
  level: MoodLevel
  note?: string
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
