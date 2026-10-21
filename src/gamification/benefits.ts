/* ============================================================================
   Benefits — the catalogue, the availability rule and the redemption rules,
   with no React and no I/O.  SPEC §6.

   The database decides (get_available_benefits / redeem_benefit in
   setup.sql, proved in supabase/tests/benefits_redeem.sql); these are the
   same rules for the demo provider, held to the same behaviour by
   tools/test-gam-benefits.ts.

   Health-first (GAM-R7): a benefit is care that comes back to the person.
   No stock figure, no countdown, no "last units" ever leaves this module.
   ============================================================================ */

import type { IconName } from '../selfuse/icons'
import { computeSessionCredit, type EconomySettings } from './economy'

export type Pillar = 'sono' | 'mente' | 'corpo' | 'movimento' | 'alimentacao' | 'pausas_lazer'
export type Delivery = 'code_pool' | 'static_code' | 'link' | 'collective' | 'identified'
export type BenefitStatus = 'draft' | 'active' | 'paused' | 'archived'
export type TagGroup = 'partner_segment' | 'benefit_type'

/** The pillars, in the order the tab shows them. English keys for i18n. */
export const PILLARS: { id: Pillar; label: string; icon: IconName }[] = [
  { id: 'sono', label: 'Sleep', icon: 'moon' },
  { id: 'mente', label: 'Mind', icon: 'thought' },
  { id: 'corpo', label: 'Body', icon: 'heart' },
  { id: 'movimento', label: 'Movement', icon: 'run' },
  { id: 'alimentacao', label: 'Nourishment', icon: 'leaf' },
  { id: 'pausas_lazer', label: 'Pauses and leisure', icon: 'coffee' },
]

/** Max cards per pillar — a short curated list, no infinite scroll (RN-UX-02). */
export const PILLAR_MAX = 6

export interface BenefitTag {
  id: string
  slug: string
  label: string
  group: TagGroup
  description: string | null
  active: boolean
}

/** A catalogue row, as the console edits it. */
export interface Benefit {
  id: string
  /** null = a Good Loop benefit; set = that company's own. */
  companyId: string | null
  title: string
  description: string | null
  careRationale: string | null
  partnerName: string | null
  pillar: Pillar
  /** null = only through a challenge. */
  priceLoopsCenti: number | null
  stockTotal: number | null
  stockRemaining: number | null
  perUserLimit: number
  validFrom: number | null
  validTo: number | null
  codeValidityDays: number | null
  deliveryType: Delivery
  staticCode: string | null
  linkUrl: string | null
  terms: string | null
  imageAsset: string | null
  status: BenefitStatus
  challengeExclusiveId: string | null
  sortOrder: number
  tagIds: string[]
}

/** What the person's Benefits tab reads. No stock figure — only whether it
    can still be had. */
export interface BenefitView {
  id: string
  companyId: string | null
  companyName: string | null
  title: string
  description: string | null
  careRationale: string | null
  partnerName: string | null
  pillar: Pillar
  priceLoopsCenti: number | null
  perUserLimit: number
  validTo: number | null
  codeValidityDays: number | null
  deliveryType: Delivery
  terms: string | null
  imageAsset: string | null
  challengeExclusive: boolean
  tags: string[]
  myRedemptions: number
  inStock: boolean
}

export interface Redemption {
  id: string
  benefitId: string
  title: string
  partnerName: string | null
  pillar: Pillar
  deliveryType: Delivery
  terms: string | null
  code: string | null
  link: string | null
  loopsSpentCenti: number
  status: 'active' | 'refunded'
  createdAt: number
  expiresAt: number | null
}

export interface RedeemResult {
  redemptionId: string
  code: string | null
  link: string | null
  expiresAt: number | null
  loopsSpentCenti: number
}

/** Why a redemption was refused — the HINT the database raises. */
export type RedeemRefusal =
  | 'BENEFIT_UNAVAILABLE' | 'BENEFIT_LIMIT' | 'BENEFIT_BALANCE' | 'BENEFIT_STOCK' | 'BENEFIT_NEEDS_CONSENT'

export class RedeemError extends Error {
  constructor(readonly refusal: RedeemRefusal) { super(refusal) }
}

/* ---- availability (mirrors gam_benefit_available) ------------------------- */

export interface AvailabilityContext {
  now: number
  /** The person's company, if it has an active add-on now. */
  company: { id: string; allowsTagFilter: boolean; allowsCompanyBenefits: boolean } | null
  /** Tag ids that company has disabled now. */
  disabledTagIds: Set<string>
  /** Challenge-exclusive benefits the person earned. */
  earned: Set<string>
}

export function isAvailable(b: Benefit, ctx: AvailabilityContext): boolean {
  if (b.status !== 'active') return false
  if (b.validFrom !== null && b.validFrom > ctx.now) return false
  if (b.validTo !== null && b.validTo <= ctx.now) return false
  if (b.challengeExclusiveId !== null) return ctx.earned.has(b.id)
  if (b.companyId === null) {
    if (ctx.company?.allowsTagFilter && b.tagIds.some((t) => ctx.disabledTagIds.has(t))) return false
    return true
  }
  return !!ctx.company && ctx.company.id === b.companyId && ctx.company.allowsCompanyBenefits
}

/** Order the tab lists them in: pillar, then the catalogue's own order. */
export function byPillar(list: BenefitView[]): Map<Pillar, BenefitView[]> {
  const out = new Map<Pillar, BenefitView[]>()
  for (const p of PILLARS) out.set(p.id, [])
  for (const b of list) if (!b.challengeExclusive) out.get(b.pillar)?.push(b)
  for (const [k, v] of out) out.set(k, v.slice(0, PILLAR_MAX))
  return out
}

/* ---- affordability -------------------------------------------------------- */

/** How many completed Standard (12-minute) sessions earn `missingCenti`, at
    the person's multiplier — "Faltam 12 Loops · cerca de 2 sessões". Rounded
    up; never less than 1 when anything is missing. */
export function standardSessionsFor(missingCenti: number, settings: EconomySettings, multiplier: number | null): number {
  if (missingCenti <= 0) return 0
  const c = computeSessionCredit(
    { kind: 'b2c', durationMin: 12, listenedSec: 720, completed: true, sos: false, endedAt: 0 },
    settings, null, multiplier,
  )
  const per = c.baseCenti + c.companyCenti
  if (per <= 0) return Infinity
  return Math.max(1, Math.ceil(missingCenti / per))
}

/** Whole Loops still missing, or 0. */
export function missingLoops(priceCenti: number | null, balanceCenti: number): number {
  if (priceCenti === null) return 0
  return Math.max(0, Math.ceil((priceCenti - balanceCenti) / 100))
}
