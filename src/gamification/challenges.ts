/* ============================================================================
   Challenges — the model and the rules, with no React and no I/O.  SPEC §5.

   The database is the source (challenges, update_challenge_progress,
   settle_challenges in setup.sql; proved in supabase/tests/challenges.sql);
   these are the same rules for the demo provider and for the console's live
   check, so a rule the schema would refuse is shown as broken before
   anyone presses Publish.
   ============================================================================ */

import { localParts } from './achievements'
import type { GamScope } from './achievements'

export type ChallengeFormat = 'individual' | 'collective'
export type ChallengeStatus = 'draft' | 'scheduled' | 'active' | 'ended' | 'settled' | 'cancelled'
/** Usage only (GAM-R2), never consecutive days (GAM-R1). */
export type ChallengeMetric = 'minutes_listened' | 'sessions_completed' | 'deep_sessions_completed' | 'sessions_in_time_window' | 'pathway_completed'
export type ChallengeScope = Exclude<GamScope, 'user'>
export type StockRule = 'first_to_complete' | 'raffle'
export type GoalKind = 'total' | 'share_reaching_min'

export const METRICS: ChallengeMetric[] = ['minutes_listened', 'sessions_completed', 'deep_sessions_completed', 'sessions_in_time_window', 'pathway_completed']
/** GAM-R4 — the only scopes there are. */
export const PUBLIC_SCOPES: ChallengeScope[] = ['national', 'region', 'state', 'city']

/** A challenge as the console writes it. */
export interface Challenge {
  id: string
  companyId: string | null
  title: string
  description: string | null
  badgeIcon: string
  format: ChallengeFormat
  scope: ChallengeScope
  scopeRef: string | null
  metric: ChallengeMetric
  goalValue: number
  goalKind: GoalKind
  perPersonMin: number | null
  windowStartHour: number | null
  windowEndHour: number | null
  startsAt: number
  endsAt: number
  status: ChallengeStatus
  rewardBonusLoopsCenti: number | null
  rewardBenefitId: string | null
  rewardRule: StockRule
  announceInApp: boolean
  templateSlug: string | null
}

/** The console's list row. */
export interface ChallengeAdminRow extends Challenge {
  participants: number
  completed: number
  rewarded: number
  collectiveValue: number | null
}

/** What the person's app reads: the challenge and their own part — never
    anyone else's. */
export interface ChallengeView {
  id: string
  companyId: string | null
  companyName: string | null
  title: string
  description: string | null
  badgeIcon: string
  format: ChallengeFormat
  scope: ChallengeScope
  scopeRef: string | null
  metric: ChallengeMetric
  goalValue: number
  goalKind: GoalKind
  perPersonMin: number | null
  windowStartHour: number | null
  windowEndHour: number | null
  startsAt: number
  endsAt: number
  status: ChallengeStatus
  rewardBonusLoopsCenti: number | null
  rewardBenefit: { id: string; title: string } | null
  myProgress: number
  myCompletedAt: number | null
  myRewardedAt: number | null
  myBenefitGranted: boolean
  /** Collective: the shared total, or the company's share in %. */
  collectiveValue: number | null
  /** Collective: how many take part; null for a company under k. */
  participants: number | null
  goalReachedAt: number | null
}

/* ---- the locked rules (§5.4) and the "Checagem Good Loop" (§7.2c) --------- */

export type RuleId = 'R1' | 'R2' | 'R3' | 'R4' | 'dates' | 'reward' | 'goal'

export interface RuleCheck { id: RuleId; ok: boolean }

/** Every rule, each ✓ or ✗. The metric list has no score, VAS, streak or SOS
    value at all, so R1–R3 hold by construction for anything the console can
    express; they are checked anyway, against the value actually chosen. */
export function checkRules(c: Pick<Challenge, 'companyId' | 'format' | 'scope' | 'scopeRef' | 'metric' | 'goalValue' | 'goalKind' | 'perPersonMin' | 'windowStartHour' | 'windowEndHour' | 'startsAt' | 'endsAt' | 'rewardBonusLoopsCenti' | 'rewardBenefitId'>): RuleCheck[] {
  const metricOk = METRICS.includes(c.metric)
  const scopeOk = c.companyId === null
    ? PUBLIC_SCOPES.includes(c.scope) && (c.scope === 'national' ? c.scopeRef === null : !!c.scopeRef)
    : c.scope === 'company' && c.scopeRef === c.companyId
  const windowOk = c.metric !== 'sessions_in_time_window'
    || (c.windowStartHour !== null && c.windowEndHour !== null && c.windowEndHour > c.windowStartHour)
  const goalOk = c.goalValue > 0 && windowOk
    && (c.format === 'individual' || (c.perPersonMin !== null && c.perPersonMin > 0))
    && (c.goalKind === 'total' || (c.format === 'collective' && c.scope === 'company' && c.goalValue <= 100))
  return [
    { id: 'R1', ok: metricOk },                 // no streaks: no consecutive metric exists
    { id: 'R2', ok: metricOk },                 // no scores, VAS or assessment results
    { id: 'R3', ok: metricOk },                 // SOS never counts: only credited sessions
    { id: 'R4', ok: scopeOk },                  // no teams or small groups
    { id: 'dates', ok: c.endsAt > c.startsAt },
    { id: 'reward', ok: (c.rewardBonusLoopsCenti ?? 0) > 0 || c.rewardBenefitId !== null },
    { id: 'goal', ok: goalOk },
  ]
}

export const allRulesHold = (c: Parameters<typeof checkRules>[0]) => checkRules(c).every((r) => r.ok)

/* ---- progress (mirrors update_challenge_progress) ------------------------- */

export interface CountedSession {
  startedAt: number
  endedAt: number
  durationMin: number
  listenedSec: number | null
  completed: boolean
  sos: boolean
}

/** What one credited session adds to a challenge — 0 when it does not count. */
export function progressIncrement(c: Pick<Challenge, 'metric' | 'startsAt' | 'endsAt' | 'windowStartHour' | 'windowEndHour'>, s: CountedSession): number {
  if (s.sos) return 0                                                   // GAM-R3
  if (s.endedAt < c.startsAt || s.endedAt > c.endsAt) return 0          // only sessions that END inside
  switch (c.metric) {
    case 'minutes_listened':
      return Math.floor(Math.max(0, Math.min(s.listenedSec ?? 0, s.durationMin * 60)) / 60)
    case 'sessions_completed':
      return s.completed ? 1 : 0
    case 'deep_sessions_completed':
      return s.completed && s.durationMin === 24 ? 1 : 0
    case 'sessions_in_time_window': {
      const h = localParts(s.startedAt).hour
      return s.completed && c.windowStartHour !== null && c.windowEndHour !== null && h >= c.windowStartHour && h < c.windowEndHour ? 1 : 0
    }
    default:
      return 0
  }
}

/* ---- for the screens ------------------------------------------------------- */

export function isLive(c: Pick<ChallengeView, 'status' | 'startsAt' | 'endsAt'>, now: number): boolean {
  return (c.status === 'active' || c.status === 'scheduled') && c.startsAt <= now && c.endsAt > now
}

/** The person's share of the goal, 0..1. Collective: the shared value. */
export function shareOf(c: ChallengeView): number {
  const v = c.format === 'collective' ? c.collectiveValue ?? 0 : c.myProgress
  return Math.max(0, Math.min(1, v / c.goalValue))
}

/** At most ONE card on Home (§5.5): a company challenge first, then the one
    closest to completion, then the one ending soonest (PLAN A5). */
/**
 * The challenges a person may see.
 *
 * A challenge an employer is running belongs to that employer's people. A
 * person with no company code has no employer, so "the challenge at your
 * company" is somebody else's: the open ones stay, the company ones go.
 * The server scopes these too; this is the client refusing to draw what it
 * was handed anyway.
 */
export function visibleChallenges<T extends { companyId?: string | null }>(all: T[], hasCompany: boolean): T[] {
  return hasCompany ? all : all.filter((c) => !c.companyId)
}

export function pickHomeChallenge(list: ChallengeView[], now: number): ChallengeView | null {
  const live = list.filter((c) => isLive(c, now) && !(c.format === 'individual' && c.myCompletedAt !== null))
  if (!live.length) return null
  return [...live].sort((a, b) =>
    Number(b.companyId !== null) - Number(a.companyId !== null)
    || shareOf(b) - shareOf(a)
    || a.endsAt - b.endsAt,
  )[0]
}

/** "faltam 9 dias" — whole days, never a countdown clock. */
export function daysLeft(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 86_400_000))
}

/** A starting point for the console's editor. */
export function blankChallenge(now: number): Challenge {
  const day = 86_400_000
  return {
    id: '', companyId: null, title: '', description: null, badgeIcon: 'flag', format: 'individual',
    scope: 'national', scopeRef: null, metric: 'minutes_listened', goalValue: 300, goalKind: 'total',
    perPersonMin: null, windowStartHour: null, windowEndHour: null,
    startsAt: now + day, endsAt: now + 31 * day, status: 'draft',
    rewardBonusLoopsCenti: 5000, rewardBenefitId: null, rewardRule: 'first_to_complete', announceInApp: true, templateSlug: null,
  }
}
