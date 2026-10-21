/* ============================================================================
   The demo's benefits — what get_available_benefits(), redeem_benefit() and
   admin_refund_redemption() do on the server, in memory, for the one demo
   person. Same refusals, same order of checks, same ledger entries.
   ============================================================================ */

import {
  RedeemError, isAvailable,
  type AvailabilityContext, type Benefit, type BenefitTag, type BenefitView, type Redemption, type RedeemResult,
} from './benefits'
import { DEMO_BENEFITS, DEMO_CODES, TAG_SEED } from './benefitsDemo'
import type { MockLedger } from './mockLedger'

interface StoredRedemption {
  id: string
  benefitId: string
  code: string | null
  loopsSpentCenti: number
  status: 'active' | 'refunded'
  consentIdentifiedAt: number | null
  createdAt: number
  expiresAt: number | null
}

export class MockBenefits {
  catalog: Benefit[] = DEMO_BENEFITS.map((b) => ({ ...b, tagIds: [...b.tagIds] }))
  tags: BenefitTag[] = TAG_SEED.map((t) => ({ ...t }))
  /** benefitId → codes not yet handed out */
  private codes = new Map<string, string[]>(Object.entries(DEMO_CODES).map(([k, v]) => [k, [...v]]))
  private redemptions: StoredRedemption[] = []
  private seq = 0
  /** The demo person's company context; slice 6 sets it for Aurora. */
  context: Omit<AvailabilityContext, 'now'> = { company: null, disabledTagIds: new Set(), earned: new Set() }

  constructor(private ledger: MockLedger) {}

  private ctx(now: number): AvailabilityContext {
    return { ...this.context, now }
  }

  available(now = Date.now()): BenefitView[] {
    return this.catalog
      .filter((b) => isAvailable(b, this.ctx(now)))
      .sort((a, b) => a.pillar.localeCompare(b.pillar) || a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
      .map((b) => ({
        id: b.id, companyId: b.companyId, companyName: b.companyId ? (this.context.company?.id === b.companyId ? b.companyId : null) : null,
        title: b.title, description: b.description, careRationale: b.careRationale, partnerName: b.partnerName,
        pillar: b.pillar, priceLoopsCenti: b.priceLoopsCenti, perUserLimit: b.perUserLimit, validTo: b.validTo,
        codeValidityDays: b.codeValidityDays, deliveryType: b.deliveryType, terms: b.terms, imageAsset: b.imageAsset,
        challengeExclusive: b.challengeExclusiveId !== null,
        tags: b.tagIds.map((id) => this.tags.find((t) => t.id === id)?.label).filter((x): x is string => !!x),
        myRedemptions: this.redemptions.filter((r) => r.benefitId === b.id && r.status === 'active').length,
        inStock: b.stockRemaining === null || b.stockRemaining > 0 || b.deliveryType === 'collective',
      }))
  }

  /** The checks of redeem_benefit(), in its order. */
  redeem(benefitId: string, consentIdentified: boolean, now = Date.now()): RedeemResult {
    const b = this.catalog.find((x) => x.id === benefitId)
    if (!b || !isAvailable(b, this.ctx(now))) throw new RedeemError('BENEFIT_UNAVAILABLE')
    const used = this.redemptions.filter((r) => r.benefitId === b.id && r.status === 'active').length
    if (used >= b.perUserLimit) throw new RedeemError('BENEFIT_LIMIT')
    if (b.deliveryType === 'identified' && !consentIdentified) throw new RedeemError('BENEFIT_NEEDS_CONSENT')
    const price = b.priceLoopsCenti ?? 0
    if (this.ledger.balanceCenti() < price) throw new RedeemError('BENEFIT_BALANCE')
    if (b.stockRemaining !== null && b.deliveryType !== 'collective') {
      if (b.stockRemaining <= 0) throw new RedeemError('BENEFIT_STOCK')
    }
    let code: string | null = null
    if (b.deliveryType === 'code_pool') {
      const pool = this.codes.get(b.id) ?? []
      if (!pool.length) throw new RedeemError('BENEFIT_STOCK')
      code = pool.shift() ?? null
    } else if (b.deliveryType === 'static_code') {
      code = b.staticCode
    }
    if (b.stockRemaining !== null && b.deliveryType !== 'collective') b.stockRemaining -= 1

    let expiresAt: number | null = b.codeValidityDays ? now + b.codeValidityDays * 86_400_000 : null
    if (b.validTo !== null && (expiresAt === null || b.validTo < expiresAt)) expiresAt = b.validTo
    this.seq += 1
    const id = `red-${this.seq}`
    this.redemptions.push({
      id, benefitId: b.id, code, loopsSpentCenti: price, status: 'active',
      consentIdentifiedAt: b.deliveryType === 'identified' ? now : null, createdAt: now, expiresAt,
    })
    this.ledger.postRedemption('redemption', price, id, now)
    return { redemptionId: id, code, link: b.linkUrl, expiresAt, loopsSpentCenti: price }
  }

  /** list_my_redemptions(): shown whatever the company filter says now. */
  mine(): Redemption[] {
    return [...this.redemptions].sort((a, b) => b.createdAt - a.createdAt).map((r) => {
      const b = this.catalog.find((x) => x.id === r.benefitId)!
      return {
        id: r.id, benefitId: b.id, title: b.title, partnerName: b.partnerName, pillar: b.pillar,
        deliveryType: b.deliveryType, terms: b.terms, code: r.code, link: b.linkUrl,
        loopsSpentCenti: r.loopsSpentCenti, status: r.status, createdAt: r.createdAt, expiresAt: r.expiresAt,
      }
    })
  }

  refund(redemptionId: string, now = Date.now()): void {
    const r = this.redemptions.find((x) => x.id === redemptionId)
    if (!r || r.status === 'refunded') return
    r.status = 'refunded'
    const b = this.catalog.find((x) => x.id === r.benefitId)
    if (b && b.stockRemaining !== null && b.deliveryType !== 'collective') b.stockRemaining += 1
    this.ledger.postRedemption('redemption_refund', r.loopsSpentCenti, r.id, now)
  }

  /** Admin: counts, never the codes. */
  codeCounts(): Record<string, { total: number; free: number }> {
    const out: Record<string, { total: number; free: number }> = {}
    for (const b of this.catalog) {
      const free = this.codes.get(b.id)?.length ?? 0
      const used = this.redemptions.filter((r) => r.benefitId === b.id && r.code && b.deliveryType === 'code_pool').length
      if (free || used) out[b.id] = { total: free + used, free }
    }
    return out
  }

  uploadCodes(benefitId: string, codes: string[]): number {
    const pool = this.codes.get(benefitId) ?? []
    const seen = new Set([...pool, ...this.redemptions.filter((r) => r.benefitId === benefitId).map((r) => r.code)])
    let n = 0
    for (const raw of codes) {
      const c = raw.trim()
      if (!c || c.length > 200 || seen.has(c)) continue
      seen.add(c)
      pool.push(c)
      n += 1
    }
    this.codes.set(benefitId, pool)
    return n
  }

  /** Admin: every redemption, for the list and refunds. */
  all(): (Redemption & { userLabel: string })[] {
    return this.mine().map((r) => ({ ...r, userLabel: 'Demo' }))
  }
}
