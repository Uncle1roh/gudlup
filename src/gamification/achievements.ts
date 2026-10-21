/* ============================================================================
   Achievements — the definitions and the rules, with no React and no I/O.

   docs/gamification/SPEC.md §3. The database seeds the same definitions and
   evaluates the same metrics (gam_user_metrics / evaluate_achievements in
   supabase/setup.sql); src/gamification/__fixtures__/achievements.json holds
   the two together (tools/test-gam-achievements.ts + the SQL proof).

   Permanent and one-time (GAM-R1). Only sessions the economy credited count,
   so SOS counts for nothing (GAM-R3). No metric reads a score, a VAS or an
   assessment result (GAM-R2). Bonuses are Good Loop's and never multiplied.
   ============================================================================ */

import { TIME_ZONE } from './economy'
import type { IconName } from '../selfuse/icons'

export type AchievementKind = 'individual' | 'collective'
/** GAM-R4: there is no team, area, unit or group scope. */
export type GamScope = 'user' | 'city' | 'state' | 'region' | 'national' | 'company'
export type AchievementTier = 'semente' | 'broto' | 'raiz' | 'copa' | 'coletiva' | 'nacional' | 'empresa'

export type IndividualMetric =
  | 'sessions_completed' | 'stereo_sessions_completed' | 'self_assessment_done' | 'minutes_listened'
  | 'deep_sessions_completed' | 'durations_completed' | 'distinct_weeks' | 'night_sessions'
  | 'midday_weekday_sessions' | 'pathways_completed' | 'journey_completed' | 'challenges_completed'
export type CollectiveMetric =
  | 'city_month_points' | 'city_rank_per_active' | 'city_night_sessions' | 'state_active_cities'
  | 'region_month_points' | 'national_minutes_lifetime' | 'company_active_share_pct'
  | 'company_collective_challenges'
export type AchievementMetric = IndividualMetric | CollectiveMetric

export interface AchievementDef {
  slug: string
  kind: AchievementKind
  scope: GamScope
  metric: AchievementMetric
  threshold: number
  period: 'lifetime' | 'month'
  tier: AchievementTier
  icon: IconName
  bonusLoopsCenti: number
  active: boolean
  sortOrder: number
}

/** What a screen reads: a definition, where the person stands, and whether
    and when they unlocked it. */
export interface AchievementView extends AchievementDef {
  id: string
  /** The person's value of the metric; null for collectives. */
  value: number | null
  unlockedAt: number | null
  seenAt: number | null
}

const d = (
  slug: string, kind: AchievementKind, scope: GamScope, metric: AchievementMetric, threshold: number,
  period: 'lifetime' | 'month', tier: AchievementTier, icon: IconName, bonusLoopsCenti: number, active: boolean, sortOrder: number,
): AchievementDef => ({ slug, kind, scope, metric, threshold, period, tier, icon, bonusLoopsCenti, active, sortOrder })

/** The seed — identical to the insert in setup.sql. Admin edits live in the
    database; the mock starts from these. */
export const ACHIEVEMENTS: AchievementDef[] = [
  d('first_loop',        'individual', 'user', 'sessions_completed',        1,    'lifetime', 'semente', 'spark',      2000,  true,  10),
  d('stereo_ready',      'individual', 'user', 'stereo_sessions_completed', 1,    'lifetime', 'semente', 'headphones', 2000,  true,  20),
  d('know_yourself',     'individual', 'user', 'self_assessment_done',      1,    'lifetime', 'semente', 'thought',    2000,  false, 30),
  d('listen_1h',         'individual', 'user', 'minutes_listened',          60,   'lifetime', 'semente', 'clock',      2000,  true,  40),
  d('listen_5h',         'individual', 'user', 'minutes_listened',          300,  'lifetime', 'broto',   'clock',      5000,  true,  50),
  d('listen_20h',        'individual', 'user', 'minutes_listened',          1200, 'lifetime', 'raiz',    'clock',      10000, true,  60),
  d('listen_50h',        'individual', 'user', 'minutes_listened',          3000, 'lifetime', 'copa',    'clock',      25000, true,  70),
  d('deep_dive',         'individual', 'user', 'deep_sessions_completed',   1,    'lifetime', 'broto',   'wave',       5000,  true,  80),
  d('explorer',          'individual', 'user', 'durations_completed',       3,    'lifetime', 'broto',   'compass',    5000,  true,  90),
  d('own_rhythm',        'individual', 'user', 'distinct_weeks',            4,    'lifetime', 'broto',   'calendar',   5000,  true,  100),
  d('serene_nights',     'individual', 'user', 'night_sessions',            5,    'lifetime', 'broto',   'moon',       5000,  true,  110),
  d('work_pause',        'individual', 'user', 'midday_weekday_sessions',   5,    'lifetime', 'broto',   'sun',        5000,  true,  120),
  d('month1_done',       'individual', 'user', 'pathways_completed',        1,    'lifetime', 'raiz',    'route',      10000, true,  130),
  d('journey_done',      'individual', 'user', 'journey_completed',         1,    'lifetime', 'copa',    'sprout',     25000, false, 140),
  d('first_challenge',   'individual', 'user', 'challenges_completed',      1,    'lifetime', 'broto',   'flag',       5000,  true,  150),
  d('challenger',        'individual', 'user', 'challenges_completed',      5,    'lifetime', 'raiz',    'flag',       10000, true,  160),
  d('city_in_loop',      'collective', 'city',     'city_month_points',             100000,   'month',    'coletiva', 'pin',      0, true, 210),
  d('calm_capital',      'collective', 'city',     'city_rank_per_active',          1,        'month',    'coletiva', 'spark',    0, true, 220),
  d('collective_nights', 'collective', 'city',     'city_night_sessions',           1000,     'month',    'coletiva', 'moon',     0, true, 230),
  d('state_in_tune',     'collective', 'state',    'state_active_cities',           20,       'month',    'coletiva', 'map',      0, true, 240),
  d('region_in_loop',    'collective', 'region',   'region_month_points',           500000,   'month',    'coletiva', 'globe',    0, true, 250),
  d('brazil_in_loop',    'collective', 'national', 'national_minutes_lifetime',     60000000, 'lifetime', 'nacional', 'globe',    0, true, 260),
  d('company_in_loop',   'collective', 'company',  'company_active_share_pct',      60,       'month',    'empresa',  'building', 0, true, 270),
  d('company_in_tune',   'collective', 'company',  'company_collective_challenges', 1,        'month',    'empresa',  'building', 0, true, 280),
]

/** A session the economy credited — the only kind an achievement counts. */
export interface CreditedSession {
  startedAt: number
  durationMin: number
  completed: boolean
  stereoChecked: boolean
}

export type IndividualMetrics = Record<IndividualMetric, number>

const PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short',
})
const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }

/** São Paulo wall-clock parts of an instant. */
export function localParts(at: number): { y: number; m: number; d: number; hour: number; isoDow: number } {
  const p: Record<string, string> = {}
  for (const x of PARTS.formatToParts(new Date(at))) p[x.type] = x.value
  return { y: +p.year, m: +p.month, d: +p.day, hour: +p.hour % 24, isoDow: WEEKDAY[p.weekday] ?? 0 }
}

/** ISO week of the São Paulo calendar day, as Postgres prints `IYYY-IW`. */
export function isoWeekKey(at: number): string {
  const { y, m, d: day, isoDow } = localParts(at)
  const date = Date.UTC(y, m - 1, day)
  const thursday = new Date(date + (4 - isoDow) * 86_400_000)
  const year = thursday.getUTCFullYear()
  const week = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / (7 * 86_400_000)) + 1
  return `${year}-${String(week).padStart(2, '0')}`
}

/** Mirrors gam_user_metrics(). */
export function individualMetrics(
  credited: CreditedSession[],
  minutesListened: number,
  pathwaysCompleted: number,
  challengesCompleted: number,
): IndividualMetrics {
  const done = credited.filter((s) => s.completed)
  const local = done.map((s) => ({ s, p: localParts(s.startedAt) }))
  return {
    sessions_completed: done.length,
    stereo_sessions_completed: done.filter((s) => s.stereoChecked).length,
    self_assessment_done: 0,
    minutes_listened: minutesListened,
    deep_sessions_completed: done.filter((s) => s.durationMin === 24).length,
    durations_completed: new Set(done.map((s) => s.durationMin).filter((x) => x === 6 || x === 12 || x === 24)).size,
    distinct_weeks: new Set(done.map((s) => isoWeekKey(s.startedAt))).size,
    night_sessions: local.filter(({ p }) => p.hour >= 21).length,
    midday_weekday_sessions: local.filter(({ p }) => p.isoDow >= 1 && p.isoDow <= 5 && (p.hour === 12 || p.hour === 13)).length,
    pathways_completed: pathwaysCompleted,
    journey_completed: 0,
    challenges_completed: challengesCompleted,
  }
}

/** The individual definitions newly reached. Mirrors evaluate_achievements(). */
export function newlyUnlocked(defs: AchievementDef[], metrics: IndividualMetrics, unlocked: Set<string>): AchievementDef[] {
  return defs
    .filter((x) => x.active && x.kind === 'individual' && !unlocked.has(x.slug))
    .filter((x) => (metrics[x.metric as IndividualMetric] ?? 0) >= x.threshold)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/* ---- for the screens ---------------------------------------------------- */

/** The locked individual achievement the person is closest to: the highest
    share of its threshold reached. Null when everything is unlocked. */
export function nextAchievement(list: AchievementView[]): AchievementView | null {
  let best: AchievementView | null = null
  let bestShare = -1
  for (const a of list) {
    if (a.kind !== 'individual' || a.unlockedAt !== null || !a.active) continue
    const share = Math.min(1, (a.value ?? 0) / a.threshold)
    if (share > bestShare || (share === bestShare && best && a.sortOrder < best.sortOrder)) { best = a; bestShare = share }
  }
  return best
}

/** Unlocked and not yet shown, oldest first — the unlock sheet's queue. */
export function unseenUnlocks(list: AchievementView[]): AchievementView[] {
  return list.filter((a) => a.unlockedAt !== null && a.seenAt === null).sort((a, b) => (a.unlockedAt ?? 0) - (b.unlockedAt ?? 0))
}

/** "3h 40min" — how listening time is shown. Points never are (PLAN A6). */
export function fmtMinutes(min: number): string {
  const m = Math.max(0, Math.round(min))
  const h = Math.floor(m / 60)
  const r = m % 60
  if (!h) return `${r} min`
  return r ? `${h}h ${r}min` : `${h}h`
}
