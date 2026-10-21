/* ============================================================================
   The company add-on — types and the one rule HR figures obey.  SPEC §7.

   HR configures and reads aggregates; it never reads a person, except an
   identified redemption the employee chose (§7.4). Every figure goes
   through kCell(): shown only when the people it counts AND the eligible
   people it leaves out are both at least k (25, SPN-02), so neither a
   figure nor its complement can single anyone out. The database applies
   the same rule (gam_k_cell in setup.sql).
   ============================================================================ */

import type { ChallengeFormat, ChallengeMetric, GoalKind } from './challenges'
import type { Delivery, Pillar } from './benefits'

export interface AddonInfo {
  planId: string
  planName: string
  multiplier: number
  companyChallenges: boolean
  companyBenefits: boolean
  tagFilter: boolean
  startsAt: number
  endsAt: number | null
}

export interface AddonPlan {
  id: string
  name: string
  multiplier: number
  companyChallenges: boolean
  companyBenefits: boolean
  tagFilter: boolean
  active: boolean
}

export interface CompanySubscription {
  id: string
  companyId: string
  companyName: string
  planId: string
  startsAt: number
  endsAt: number | null
  status: 'active' | 'paused' | 'ended'
}

export interface TagFilterRow {
  id: string
  slug: string
  label: string
  group: 'partner_segment' | 'benefit_type'
  disabled: boolean
  /** How many public benefits carry the tag — "afeta N benefícios". */
  affects: number
  benefits: string[]
}

export interface CompanyBenefitRow {
  id: string
  title: string
  description: string | null
  careRationale: string | null
  pillar: Pillar
  priceLoopsCenti: number | null
  stockTotal: number | null
  /** A company benefit is a code, collective, or identified — nothing else. */
  deliveryType: Extract<Delivery, 'code_pool' | 'collective' | 'identified'>
  status: 'draft' | 'active' | 'paused' | 'archived'
  terms: string | null
  codesFree: number
  codesTotal: number
}

export interface IdentifiedRedemption {
  id: string
  benefit: string
  name: string
  employeeNumber: string | null
  consentedAt: number
  status: 'active' | 'refunded'
}

/** An approved template — the only way a company writes a challenge (SPN-06). */
export interface ChallengeTemplate {
  slug: string
  title: string
  description: string
  badgeIcon: string
  format: ChallengeFormat
  metric: ChallengeMetric
  goalValue: number
  goalKind: GoalKind
  perPersonMin: number | null
  windowStartHour: number | null
  windowEndHour: number | null
  defaultDays: number
}

/** The first set (PLAN A4) — identical to the seed in setup.sql. */
export const TEMPLATE_SEED: ChallengeTemplate[] = [
  { slug: 'boas_vindas', title: 'Boas-vindas', description: 'Três sessões no primeiro mês, para conhecer o seu ritmo.', badgeIcon: 'spark',
    format: 'individual', metric: 'sessions_completed', goalValue: 3, goalKind: 'total', perPersonMin: null, windowStartHour: null, windowEndHour: null, defaultDays: 30 },
  { slug: 'sono_em_dia', title: 'Sono em dia', description: 'Cinco sessões depois das 21h, para chegar à cama mais calmo.', badgeIcon: 'moon',
    format: 'individual', metric: 'sessions_in_time_window', goalValue: 5, goalKind: 'total', perPersonMin: null, windowStartHour: 21, windowEndHour: 24, defaultDays: 30 },
  { slug: 'pausa_consciente', title: 'Pausa consciente', description: 'Cinco pausas no meio do dia, entre 12h e 14h.', badgeIcon: 'sun',
    format: 'individual', metric: 'sessions_in_time_window', goalValue: 5, goalKind: 'total', perPersonMin: null, windowStartHour: 12, windowEndHour: 14, defaultDays: 30 },
  { slug: 'empresa_em_sintonia', title: 'Empresa em sintonia', description: 'A empresa inteira, junta: 60% de nós com três sessões ou mais no mês.', badgeIcon: 'building',
    format: 'collective', metric: 'sessions_completed', goalValue: 60, goalKind: 'share_reaching_min', perPersonMin: 3, windowStartHour: null, windowEndHour: null, defaultDays: 30 },
]

export interface CompanyChallengeDraft {
  id: string
  templateSlug: string
  goalValue: number
  perPersonMin: number | null
  startsAt: number
  endsAt: number
  rewardBonusLoopsCenti: number | null
  rewardBenefitId: string | null
  rewardRule: 'first_to_complete' | 'raffle'
}

export interface AddonChallengeCard {
  id: string
  title: string
  status: string
  templateSlug: string | null
  startsAt: number
  endsAt: number
  format: ChallengeFormat
  goalKind: GoalKind
  goalValue: number
  perPersonMin: number | null
  rewardBonusLoopsCenti: number | null
  rewardBenefitId: string | null
  /** k-guarded; null = hidden. */
  adhesionPct: number | null
  completedPct: number | null
  collectivePct: number | null
  goalReached: boolean
}

export interface AddonDashboard {
  minCohort: number
  eligible: number | null
  activeChallenges: number
  multiplierLoopsMonth: number | null
  redemptionsMonth: number | null
  challenges: AddonChallengeCard[]
}

/** Mirrors gam_k_cell(): the count, or null when it or its complement in
    the population is under k. */
export function kCell(count: number, population: number, k: number): number | null {
  const rest = population - count
  if (count < k || (rest >= 1 && rest < k)) return null
  return count
}

/** A share of the whole company, k-guarded both ways. */
export function kShare(count: number, population: number, k: number): number | null {
  if (population < k || kCell(count, population, k) === null) return null
  return Math.round((100 * count) / population)
}
