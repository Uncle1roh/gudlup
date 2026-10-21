/* ============================================================================
   The demo company's add-on — what the hr_* functions do on the server, for
   the demo's Aurora (AURORA-2026-Z5, the company the existing HR demo
   account belongs to). SPEC §10 slice 7: Premium 1.5×, "Alimentos e
   bebidas" switched off, a whole-company "Novembro em Loop".

   The demo person is one of Aurora's employees for the gamification
   screens, so the multiplier line, the company chip and the tag filter can
   be seen end to end. Every figure HR receives here is a fixture passed
   through kCell()/kShare(): the same suppression the database applies.
   ============================================================================ */

import { TEMPLATE_SEED, kCell, kShare, type ChallengeTemplate, type AddonDashboard, type AddonInfo, type AddonPlan, type CompanyBenefitRow, type CompanyChallengeDraft, type CompanySubscription, type TagFilterRow } from './company'
import type { Benefit } from './benefits'
import type { MockLedger } from './mockLedger'
import type { MockBenefits } from './mockBenefits'
import type { MockChallenges } from './mockChallenges'
import { MIN_COHORT } from '../legal/market'

export const DEMO_COMPANY_ID = 'AURORA-2026-Z5'
const DAY = 86_400_000

export class MockCompany {
  plans: AddonPlan[] = [
    { id: 'essencial', name: 'Essencial', multiplier: 1, companyChallenges: true, companyBenefits: true, tagFilter: true, active: true },
    { id: 'plus', name: 'Plus', multiplier: 1.25, companyChallenges: true, companyBenefits: true, tagFilter: true, active: true },
    { id: 'premium', name: 'Premium', multiplier: 1.5, companyChallenges: true, companyBenefits: true, tagFilter: true, active: true },
    { id: 'max', name: 'Max', multiplier: 2, companyChallenges: true, companyBenefits: true, tagFilter: true, active: true },
  ]
  subscriptions: CompanySubscription[]
  history: { label: string; disabledAt: number; enabledAt: number | null }[] = []
  /** Editable in the console (Sfide › Modelli aziendali). */
  templates: ChallengeTemplate[] = TEMPLATE_SEED.map((t, i) => ({ ...t, active: true, sortOrder: (i + 1) * 10 }))
  /** The company's people, a fixture: what eligibility counts. */
  eligible = 150

  constructor(private ledger: MockLedger, private benefits: MockBenefits, private challenges: MockChallenges, companyName: string, now = Date.now()) {
    this.subscriptions = [{ id: 'sub-1', companyId: DEMO_COMPANY_ID, companyName, planId: 'premium', startsAt: now - 90 * DAY, endsAt: null, status: 'active' }]
    challenges.companyName = companyName
    this.apply(now)
    this.setTag('tag-alimentos_bebidas', true, now - 30 * DAY)

    const own = (id: string, p: Partial<Benefit>): Benefit => ({
      id, companyId: DEMO_COMPANY_ID, title: '', description: null, careRationale: null, partnerName: null, pillar: 'pausas_lazer',
      priceLoopsCenti: 0, stockTotal: null, stockRemaining: null, perUserLimit: 1, validFrom: null, validTo: null, codeValidityDays: 30,
      deliveryType: 'collective', staticCode: null, linkUrl: null, terms: null, imageAsset: null, status: 'active',
      challengeExclusiveId: null, sortOrder: 0, tagIds: [], ...p,
    })
    benefits.catalog.push(
      /* free in the demo, so the identified consent can be tried at once */
      own('co-folga', { title: 'Um dia de folga', careRationale: 'Um dia inteiro para descansar de verdade.', pillar: 'pausas_lazer', priceLoopsCenti: 0, deliveryType: 'identified', stockTotal: 10, stockRemaining: 10 }),
      own('co-cafe', { title: 'Café da manhã da empresa', careRationale: 'Uma pausa juntos, sem pressa.', pillar: 'alimentacao', priceLoopsCenti: 0, deliveryType: 'collective' }),
    )

    const tpl = this.templates.find((t) => t.slug === 'empresa_em_sintonia')!
    challenges.list.push({
      id: 'novembro-em-loop', companyId: DEMO_COMPANY_ID, title: 'Novembro em Loop', description: tpl.description, badgeIcon: tpl.badgeIcon,
      format: 'collective', scope: 'company', scopeRef: DEMO_COMPANY_ID, metric: 'sessions_completed', goalValue: 60, goalKind: 'share_reaching_min',
      perPersonMin: 3, windowStartHour: null, windowEndHour: null, startsAt: now - 6 * DAY, endsAt: now + 12 * DAY, status: 'active',
      rewardBonusLoopsCenti: 3000, rewardBenefitId: null, rewardRule: 'first_to_complete', announceInApp: true, templateSlug: tpl.slug,
    })
    challenges.others.set('novembro-em-loop', 41)
    /* Last quarter's company challenge, completed — for the history. */
    challenges.addHistory({
      id: 'setembro-em-sintonia', companyId: DEMO_COMPANY_ID, title: 'Pausa consciente', description: this.templates.find((t) => t.slug === 'pausa_consciente')!.description,
      badgeIcon: 'sun', format: 'individual', scope: 'company', scopeRef: DEMO_COMPANY_ID, metric: 'sessions_in_time_window', goalValue: 5, goalKind: 'total',
      perPersonMin: null, windowStartHour: 12, windowEndHour: 14, startsAt: now - 52 * DAY, endsAt: now - 22 * DAY, status: 'settled',
      rewardBonusLoopsCenti: 2000, rewardBenefitId: null, rewardRule: 'first_to_complete', announceInApp: true, templateSlug: 'pausa_consciente',
    }, 5, true, now - 30 * DAY)
  }

  /** The add-on in force, pushed into the person's wallet and catalogue. */
  private apply(now: number): void {
    const s = this.subscriptions.find((x) => x.companyId === DEMO_COMPANY_ID && x.status === 'active' && x.startsAt <= now && (x.endsAt === null || x.endsAt > now))
    const plan = s ? this.plans.find((p) => p.id === s.planId) : undefined
    this.ledger.windows = s && plan ? [{
      companyId: DEMO_COMPANY_ID, multiplier: plan.multiplier, affiliationStartsAt: 0, affiliationEndsAt: null,
      subscriptionStatus: 'active', subscriptionStartsAt: s.startsAt, subscriptionEndsAt: s.endsAt,
    }] : []
    this.benefits.context.company = plan ? { id: DEMO_COMPANY_ID, allowsTagFilter: plan.tagFilter, allowsCompanyBenefits: plan.companyBenefits } : null
  }

  addon(now = Date.now()): AddonInfo | null {
    const s = this.subscriptions.find((x) => x.companyId === DEMO_COMPANY_ID && x.status === 'active' && x.startsAt <= now && (x.endsAt === null || x.endsAt > now))
    const p = s && this.plans.find((x) => x.id === s.planId)
    if (!s || !p) return null
    return { planId: p.id, planName: p.name, multiplier: p.multiplier, companyChallenges: p.companyChallenges, companyBenefits: p.companyBenefits, tagFilter: p.tagFilter, startsAt: s.startsAt, endsAt: s.endsAt }
  }

  /* ---- a) the tag filter ---- */
  tagFilter(): TagFilterRow[] {
    const live = this.benefits.catalog.filter((b) => b.companyId === null && b.status === 'active' && b.challengeExclusiveId === null)
    return this.benefits.tags.filter((t) => t.active).map((t) => {
      const hit = live.filter((b) => b.tagIds.includes(t.id))
      return { id: t.id, slug: t.slug, label: t.label, group: t.group, disabled: this.benefits.context.disabledTagIds.has(t.id), affects: hit.length, benefits: hit.map((b) => b.title) }
    })
  }

  setTag(tagId: string, disabled: boolean, now = Date.now()): void {
    const set = this.benefits.context.disabledTagIds
    const label = this.benefits.tags.find((t) => t.id === tagId)?.label ?? tagId
    if (disabled && !set.has(tagId)) { set.add(tagId); this.history.unshift({ label, disabledAt: now, enabledAt: null }) }
    if (!disabled && set.has(tagId)) {
      set.delete(tagId)
      const open = this.history.find((h) => h.label === label && h.enabledAt === null)
      if (open) open.enabledAt = now
    }
  }

  /* ---- b) company benefits ---- */
  companyBenefits(): CompanyBenefitRow[] {
    const counts = this.benefits.codeCounts()
    return this.benefits.catalog.filter((b) => b.companyId === DEMO_COMPANY_ID).map((b) => ({
      id: b.id, title: b.title, description: b.description, careRationale: b.careRationale, pillar: b.pillar,
      priceLoopsCenti: b.priceLoopsCenti, stockTotal: b.stockTotal, deliveryType: b.deliveryType as CompanyBenefitRow['deliveryType'],
      status: b.status, terms: b.terms, codesFree: counts[b.id]?.free ?? 0, codesTotal: counts[b.id]?.total ?? 0,
    }))
  }

  saveCompanyBenefit(row: CompanyBenefitRow): string {
    if (!['code_pool', 'collective', 'identified'].includes(row.deliveryType)) throw new Error('A company benefit is a code, collective or identified.')
    const id = row.id || `co-${Date.now()}`
    const i = this.benefits.catalog.findIndex((b) => b.id === id)
    const prev = i >= 0 ? this.benefits.catalog[i] : undefined
    const used = prev && prev.stockTotal !== null && prev.stockRemaining !== null ? prev.stockTotal - prev.stockRemaining : 0
    const b: Benefit = {
      id, companyId: DEMO_COMPANY_ID, title: row.title, description: row.description, careRationale: row.careRationale, partnerName: null,
      pillar: row.pillar, priceLoopsCenti: row.priceLoopsCenti, stockTotal: row.stockTotal,
      stockRemaining: row.stockTotal === null ? null : Math.max(0, row.stockTotal - used), perUserLimit: 1,
      validFrom: null, validTo: null, codeValidityDays: 30, deliveryType: row.deliveryType, staticCode: null, linkUrl: null,
      terms: row.terms, imageAsset: null, status: row.status, challengeExclusiveId: prev?.challengeExclusiveId ?? null, sortOrder: 0, tagIds: [],
    }
    if (i >= 0) this.benefits.catalog[i] = b
    else this.benefits.catalog.push(b)
    return id
  }

  /* ---- c) company challenges ---- */
  saveCompanyChallenge(d: CompanyChallengeDraft): string {
    const tpl = this.templates.find((t) => t.slug === d.templateSlug && t.active !== false)
    if (!tpl) throw new Error('Choose a template.')
    if (d.rewardBenefitId && !this.benefits.catalog.some((b) => b.id === d.rewardBenefitId && b.companyId === DEMO_COMPANY_ID)) {
      throw new Error('The reward must be one of your company’s benefits.')
    }
    const id = d.id || `co-ch-${Date.now()}`
    const i = this.challenges.list.findIndex((c) => c.id === id)
    if (i >= 0 && !['draft', 'scheduled'].includes(this.challenges.list[i].status)) throw new Error('A live challenge cannot be edited.')
    const row = {
      id, companyId: DEMO_COMPANY_ID, title: tpl.title, description: tpl.description, badgeIcon: tpl.badgeIcon, format: tpl.format,
      scope: 'company' as const, scopeRef: DEMO_COMPANY_ID, metric: tpl.metric, goalValue: d.goalValue, goalKind: tpl.goalKind,
      perPersonMin: d.perPersonMin ?? tpl.perPersonMin, windowStartHour: tpl.windowStartHour, windowEndHour: tpl.windowEndHour,
      startsAt: d.startsAt, endsAt: d.endsAt, status: i >= 0 ? this.challenges.list[i].status : 'draft' as const,
      rewardBonusLoopsCenti: d.rewardBonusLoopsCenti, rewardBenefitId: d.rewardBenefitId, rewardRule: d.rewardRule,
      announceInApp: true, templateSlug: tpl.slug,
    }
    if (i >= 0) this.challenges.list[i] = row
    else this.challenges.list.push(row)
    return id
  }

  challengeAction(id: string, action: 'publish' | 'end' | 'cancel', now = Date.now()): void {
    const c = this.challenges.list.find((x) => x.id === id && x.companyId === DEMO_COMPANY_ID)
    if (!c) throw new Error('Not your company’s challenge.')
    if (action === 'publish') {
      if (c.status !== 'draft') throw new Error('Already published.')
      if (!c.rewardBonusLoopsCenti && !c.rewardBenefitId) throw new Error('A challenge needs a reward.')
      c.status = c.startsAt > now ? 'scheduled' : 'active'
    } else if (action === 'end') { c.endsAt = Math.min(c.endsAt, now); c.status = 'settled' }
    else if (['draft', 'scheduled', 'active'].includes(c.status)) c.status = 'cancelled'
  }

  /* ---- d) the dashboard: fixtures through the k rule ---- */
  dashboard(): AddonDashboard {
    const k = Math.max(MIN_COHORT, this.ledger.settings.hrMinCohort)
    const pop = this.eligible
    const fixture: Record<string, [number, number]> = { 'novembro-em-loop': [93, 61] }   // took part, completed
    return {
      minCohort: k,
      eligible: pop >= k ? pop : null,
      activeChallenges: this.challenges.list.filter((c) => c.companyId === DEMO_COMPANY_ID && c.status === 'active').length,
      multiplierLoopsMonth: 1840,
      redemptionsMonth: kCell(31, Math.max(31, pop), k),
      challenges: this.challenges.list.filter((c) => c.companyId === DEMO_COMPANY_ID && c.status !== 'cancelled').map((c) => {
        const [took, done] = fixture[c.id] ?? [0, 0]
        return {
          id: c.id, title: c.title, status: c.status, templateSlug: c.templateSlug, startsAt: c.startsAt, endsAt: c.endsAt,
          format: c.format, goalKind: c.goalKind, goalValue: c.goalValue, perPersonMin: c.perPersonMin,
          rewardBonusLoopsCenti: c.rewardBonusLoopsCenti, rewardBenefitId: c.rewardBenefitId,
          adhesionPct: kShare(took, pop, k), completedPct: kShare(done, pop, k),
          collectivePct: c.goalKind === 'share_reaching_min' && pop >= k ? this.challenges.others.get(c.id) ?? 0 : null,
          goalReached: false,
        }
      }),
    }
  }

  /* ---- the console: plans and subscriptions ---- */
  setPlan(companyId: string, planId: string | null, companyName: string, now = Date.now()): void {
    for (const s of this.subscriptions) if (s.companyId === companyId && s.status === 'active') { s.status = 'ended'; s.endsAt = now }
    if (planId) this.subscriptions.push({ id: `sub-${this.subscriptions.length + 1}`, companyId, companyName, planId, startsAt: now, endsAt: null, status: 'active' })
    this.apply(now)
  }
}
