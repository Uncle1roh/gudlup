/* ============================================================================
   The Loops economy — the rules, with no React and no I/O.

   docs/gamification/SPEC.md §2 is the source. The database is the source of
   truth (GAM-R8): `credit_session()` in supabase/setup.sql applies these same
   rules server-side, and the mock provider applies them from here. The two
   are held together by src/gamification/__fixtures__/economy.json, which
   both tools/test-gam-economy.ts and supabase/tests/economy_parity.sql run.
   Change a rule in one place and the other proof fails.

   Points measure care: listening only, never spent, never decrease.
   Loops are the currency: from Points, plus bonuses. Stored in integer
   centiloops (1 Loop = 100), shown floored.
   The company multiplier touches ONLY Loops from listening (GAM-R9).
   ============================================================================ */

export interface EconomySettings {
  pointsPerMinute: number
  pointsPerCompletedSession: number
  /** Eligible listened minutes per São Paulo calendar day. */
  dailyMinutesCap: number
  /** Completion bonuses per São Paulo calendar day. */
  dailyCompletionBonusCap: number
  loopsPerPoint: number
  /** Points in the period for a collective achievement to reach a person. */
  minContributionPoints: number
  /** Sessions run inside the therapist console earn Points (off). */
  countClinicalSessions: boolean
  /** null = Loops never expire. */
  loopsExpiryMonths: number | null
  /** A city enters a ranking or collective goal only above this. */
  geoMinActiveUsers: number
  /** Sponsor figures from fewer people are suppressed (SPN-02, D-08).
      Never below 25 — the database refuses it. */
  hrMinCohort: number
  /** A session that says it ended longer ago than this is credited as of
      now, so past days' unused caps cannot be mined. null = trust it. */
  maxBackdateHours: number | null
}

export const DEFAULT_ECONOMY: EconomySettings = {
  pointsPerMinute: 1,
  pointsPerCompletedSession: 10,
  dailyMinutesCap: 120,
  dailyCompletionBonusCap: 4,
  loopsPerPoint: 0.1,
  minContributionPoints: 30,
  countClinicalSessions: false,
  loopsExpiryMonths: null,
  geoMinActiveUsers: 50,
  hrMinCohort: 25,
  maxBackdateHours: 24,
}

export const TIME_ZONE = 'America/Sao_Paulo'

export interface SessionCreditInput {
  kind: 'b2c' | 'b2b'
  /** Nominal length: 6, 12 or 24. Listening is capped here. */
  durationMin: number
  /** Seconds actually played; null when the client did not report it. */
  listenedSec: number | null
  completed: boolean
  sos: boolean
  /** When listening ended (ms). Decides the day and the multiplier window. */
  endedAt: number
}

/** What a day has used already, for the caps. */
export interface DailyUsage {
  /** YYYY-MM-DD in São Paulo. */
  day: string
  eligibleMinutes: number
  completionBonuses: number
  /** Sessions credited that day (SOS never reaches the ledger). */
  sessions?: number
}

/** A company link and the add-on it bought, both as time windows (ms). */
export interface CompanyWindow {
  multiplier: number
  affiliationStartsAt: number
  affiliationEndsAt: number | null
  subscriptionStatus: 'active' | 'paused' | 'ended'
  subscriptionStartsAt: number
  subscriptionEndsAt: number | null
}

export interface SessionCredit {
  eligibleMinutes: number
  completionBonus: boolean
  points: number
  baseCenti: number
  companyCenti: number
  /** The multiplier that was applied, or null when none was. */
  multiplier: number | null
  day: string
}

const within = (at: number, from: number, to: number | null) => at >= from && (to === null || at < to)

/** The multiplier in force at `at`: an active affiliation to a company whose
    add-on subscription is active at that moment. The highest wins if, in a
    changeover, two overlap. */
export function multiplierAt(windows: CompanyWindow[], at: number): number | null {
  let best: number | null = null
  for (const w of windows) {
    if (w.subscriptionStatus !== 'active') continue
    if (!within(at, w.affiliationStartsAt, w.affiliationEndsAt)) continue
    if (!within(at, w.subscriptionStartsAt, w.subscriptionEndsAt)) continue
    if (best === null || w.multiplier > best) best = w.multiplier
  }
  return best
}

/** The instant a session is credited at: its end, never in the future, and
    never further back than `maxBackdateHours` (then: now). Mirrors the head
    of credit_session(). */
export function creditInstant(endedAt: number | undefined, now: number, settings: EconomySettings): number {
  const at = Math.min(endedAt ?? now, now)
  if (settings.maxBackdateHours !== null && at < now - settings.maxBackdateHours * 3_600_000) return now
  return at
}

/** The São Paulo calendar day of an instant, as YYYY-MM-DD. */
export function dayKeySaoPaulo(at: number): string {
  /* en-CA formats as YYYY-MM-DD. */
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at))
}

/** First day of the São Paulo month of an instant, as YYYY-MM-01. */
export function monthKeySaoPaulo(at: number): string {
  return `${dayKeySaoPaulo(at).slice(0, 7)}-01`
}

/** Half away from zero on a value that is mathematically exact to 1e-6:
    22 × 0.1 × 100 is 220.00000000000003 in binary floating point, and SQL's
    numeric says 220. Rounding the noise off first makes the two agree. */
function roundHalfUp(x: number): number {
  const clean = Number(x.toFixed(6))
  return Math.sign(clean) * Math.round(Math.abs(clean))
}

const ZERO = (day: string): SessionCredit =>
  ({ eligibleMinutes: 0, completionBonus: false, points: 0, baseCenti: 0, companyCenti: 0, multiplier: null, day })

/**
 * What one session earns.
 *
 *   points  = floor(listened minutes, capped at nominal and at the day) × ppm
 *           + completion bonus (if completed and the day has bonuses left)
 *   base    = round(points × loopsPerPoint × 100)          centiloops
 *   company = round(base × (multiplier − 1))               only with an
 *             active affiliation + active subscription at session end
 *
 * SOS earns nothing (GAM-R3); a therapist-console session earns nothing
 * unless `countClinicalSessions`.
 */
export function computeSessionCredit(
  input: SessionCreditInput,
  settings: EconomySettings,
  usage: DailyUsage | null,
  multiplier: number | null,
): SessionCredit {
  const day = dayKeySaoPaulo(input.endedAt)
  if (input.sos) return ZERO(day)
  if (input.kind === 'b2b' && !settings.countClinicalSessions) return ZERO(day)

  const today = usage && usage.day === day ? usage : { day, eligibleMinutes: 0, completionBonuses: 0 }
  const listened = Math.max(0, Math.min(input.listenedSec ?? 0, input.durationMin * 60))
  const minutes = Math.floor(listened / 60)
  const eligibleMinutes = Math.min(minutes, Math.max(0, settings.dailyMinutesCap - today.eligibleMinutes))
  const completionBonus = input.completed && today.completionBonuses < settings.dailyCompletionBonusCap

  const points = eligibleMinutes * settings.pointsPerMinute + (completionBonus ? settings.pointsPerCompletedSession : 0)
  const baseCenti = roundHalfUp(points * settings.loopsPerPoint * 100)
  const applied = multiplier !== null && multiplier > 1 ? multiplier : null
  const companyCenti = applied === null ? 0 : roundHalfUp(baseCenti * (applied - 1))

  return { eligibleMinutes, completionBonus, points, baseCenti, companyCenti, multiplier: applied, day }
}

/** The day's usage after a credit. */
export function addUsage(usage: DailyUsage | null, credit: SessionCredit): DailyUsage {
  const base = usage && usage.day === credit.day ? usage : { day: credit.day, eligibleMinutes: 0, completionBonuses: 0 }
  return {
    day: credit.day,
    eligibleMinutes: base.eligibleMinutes + credit.eligibleMinutes,
    completionBonuses: base.completionBonuses + (credit.completionBonus ? 1 : 0),
    sessions: (base.sessions ?? 0) + 1,
  }
}

/** Whole Loops, as a person reads them. */
export const displayLoops = (centi: number): number => Math.floor(centi / 100)

/* ---- the ledgers, as the client reads them ------------------------------ */

export type LoopsEntryType =
  | 'earn_listening'
  | 'earn_company_multiplier'
  | 'achievement_bonus'
  | 'challenge_bonus'
  | 'redemption'
  | 'redemption_refund'
  | 'admin_adjustment'

export type FundingSource = 'goodloop' | 'company'

export interface LoopsEntry {
  id: string
  entryType: LoopsEntryType
  /** Signed centiloops. */
  amountCenti: number
  fundingSource: FundingSource
  companyId: string | null
  multiplierApplied: number | null
  sourceType: string
  sourceId: string
  createdAt: number
}

export interface PointsEntry {
  id: string
  sourceType: string
  sourceId: string
  points: number
  /** YYYY-MM-01 */
  periodMonth: string
  cityIbgeCode: string | null
  createdAt: number
}

export interface Wallet {
  balanceCenti: number
  /** floor(balanceCenti / 100) */
  loops: number
  pointsTotal: number
  /** Points in the current São Paulo month. */
  pointsMonth: number
  /** Minutes credited this São Paulo month — "você dedicou 3h 40min". */
  minutesMonth: number
  /** Sessions credited this São Paulo month. */
  sessionsMonth: number
  /** The company multiplier in force now, or null. */
  multiplier: number | null
}

/** The wallet a ledger adds up to. Used by the mock; the server has
    get_wallet() for the same answer. */
export function walletFrom(
  loops: LoopsEntry[],
  points: PointsEntry[],
  minutesMonth: number,
  sessionsMonth: number,
  multiplier: number | null,
  now: number,
): Wallet {
  const balanceCenti = loops.reduce((a, e) => a + e.amountCenti, 0)
  const month = monthKeySaoPaulo(now)
  return {
    balanceCenti,
    loops: displayLoops(balanceCenti),
    pointsTotal: points.reduce((a, e) => a + e.points, 0),
    pointsMonth: points.filter((e) => e.periodMonth === month).reduce((a, e) => a + e.points, 0),
    minutesMonth,
    sessionsMonth,
    multiplier: multiplier !== null && multiplier > 1 ? multiplier : null,
  }
}
