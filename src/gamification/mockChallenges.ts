/* ============================================================================
   The demo's challenges — update_challenge_progress(), the rewards and
   settle_challenges() for the one demo person, in memory.

   The demo has one person, so a collective's shared value is a fixture that
   their own part is added to: plainly demo data, never shown outside demo
   mode. Every rule — the window, SOS, the reward at once for an individual
   challenge, the bonus once and unmultiplied, the prize while units last —
   is the database's.
   ============================================================================ */

import type { SessionRecord } from '../types/domain'
import { progressIncrement, type Challenge, type ChallengeAdminRow, type ChallengeView } from './challenges'
import type { MockLedger } from './mockLedger'
import type { MockBenefits } from './mockBenefits'

interface Part { progress: number; points: number; completedAt: number | null; rewardedAt: number | null; granted: boolean }

const DAY = 86_400_000

/** SPEC §10 slice 7: "Outubro Sereno" (active, 5 h, a 90 % facial-cream
    prize) and "Semana do Sono" (scheduled). Dated around today so the demo
    always has one of each. */
export function demoChallenges(now: number): Challenge[] {
  return [
    {
      id: 'outubro-sereno', companyId: null, title: 'Outubro Sereno',
      description: 'Cinco horas de escuta ao longo do mês, no seu ritmo.', badgeIcon: 'moon',
      format: 'individual', scope: 'national', scopeRef: null, metric: 'minutes_listened', goalValue: 300, goalKind: 'total',
      perPersonMin: null, windowStartHour: null, windowEndHour: null,
      startsAt: now - 12 * DAY, endsAt: now + 9 * DAY, status: 'active',
      rewardBonusLoopsCenti: null, rewardBenefitId: 'corpo3', rewardRule: 'first_to_complete', announceInApp: true, templateSlug: null,
    },
    {
      id: 'agosto-de-pausas', companyId: null, title: 'Agosto de Pausas',
      description: 'Cinco pausas no meio do dia ao longo do mês.', badgeIcon: 'sun',
      format: 'individual', scope: 'national', scopeRef: null, metric: 'sessions_in_time_window', goalValue: 5, goalKind: 'total',
      perPersonMin: null, windowStartHour: 12, windowEndHour: 14,
      startsAt: now - 80 * DAY, endsAt: now - 50 * DAY, status: 'settled',
      rewardBonusLoopsCenti: 3000, rewardBenefitId: null, rewardRule: 'first_to_complete', announceInApp: true, templateSlug: null,
    },
    {
      id: 'semana-do-sono', companyId: null, title: 'Semana do Sono',
      description: 'Cinco sessões depois das 21h em uma semana, para chegar à cama mais calmo.', badgeIcon: 'moon',
      format: 'individual', scope: 'national', scopeRef: null, metric: 'sessions_in_time_window', goalValue: 5, goalKind: 'total',
      perPersonMin: null, windowStartHour: 21, windowEndHour: 24,
      startsAt: now + 10 * DAY, endsAt: now + 17 * DAY, status: 'scheduled',
      rewardBonusLoopsCenti: 3000, rewardBenefitId: null, rewardRule: 'first_to_complete', announceInApp: true, templateSlug: null,
    },
  ]
}

export class MockChallenges {
  list: Challenge[]
  private parts = new Map<string, Part>()
  /** Collectives: what everyone else has contributed, a fixture. */
  others = new Map<string, number>()
  companyName: string | null = null

  constructor(private ledger: MockLedger, private benefits: MockBenefits, now = Date.now()) {
    this.list = demoChallenges(now)
    ledger.onCredit = (rec, points, at) => this.count(rec, points, at)
    /* History, for Progress › Desafios: an old challenge the demo person
       took part in and did not finish — nothing is lost, it just shows. */
    this.parts.set('agosto-de-pausas', { progress: 3, points: 60, completedAt: null, rewardedAt: null, granted: false })
  }

  /** A past challenge with the person's result — demo history (mockCompany). */
  addHistory(c: Challenge, progress: number, completed: boolean, at: number): void {
    this.list.push(c)
    this.parts.set(c.id, { progress, points: progress * 22, completedAt: completed ? at : null, rewardedAt: completed ? at : null, granted: false })
  }

  private part(id: string): Part {
    let p = this.parts.get(id)
    if (!p) { p = { progress: 0, points: 0, completedAt: null, rewardedAt: null, granted: false }; this.parts.set(id, p) }
    return p
  }

  private live(c: Challenge, at: number): boolean {
    return (c.status === 'active' || c.status === 'scheduled') && c.startsAt <= at && c.endsAt >= at
  }

  /** One credited session (SOS never gets here: the ledger does not credit it). */
  count(rec: SessionRecord, points: number, at: number): void {
    for (const c of this.list) {
      if (!this.live(c, at) || c.metric === 'pathway_completed') continue
      const inc = progressIncrement(c, {
        startedAt: rec.startedAt, endedAt: rec.completedAt ?? at, durationMin: rec.duration,
        listenedSec: rec.listenedSec ?? null, completed: rec.completed ?? !!rec.completedAt, sos: !!rec.sos,
      })
      const p = this.part(c.id)
      p.progress += inc
      p.points += points
      this.afterProgress(c, p, at)
    }
  }

  private afterProgress(c: Challenge, p: Part, at: number): void {
    if (c.format === 'individual') {
      if (p.progress >= c.goalValue && p.completedAt === null) {
        p.completedAt = at
        this.ledger.challengesCompleted += 1
        this.reward(c, p, at)
      }
    } else {
      if (c.perPersonMin !== null && p.progress >= c.perPersonMin && p.completedAt === null) {
        p.completedAt = at
        this.ledger.challengesCompleted += 1
      }
      if (this.collectiveValue(c) >= c.goalValue && p.completedAt !== null) this.reward(c, p, at)
    }
  }

  private reward(c: Challenge, p: Part, at: number): void {
    if (p.rewardedAt !== null) return
    p.rewardedAt = at
    this.ledger.postChallengeBonus(c.id, c.rewardBonusLoopsCenti ?? 0, c.companyId, at)
    if (c.rewardBenefitId && c.rewardRule === 'first_to_complete') {
      const b = this.benefits.catalog.find((x) => x.id === c.rewardBenefitId)
      if (!b || b.stockTotal === null || b.stockTotal > 0) {
        p.granted = true
        this.benefits.context.earned.add(c.rewardBenefitId)
      }
    }
  }

  /** A total: everyone else's (a fixture) plus the person's own part. A
      company share: the fixture's %, which one person barely moves. */
  private collectiveValue(c: Challenge): number {
    if (c.goalKind === 'share_reaching_min') return this.others.get(c.id) ?? 0
    return (this.others.get(c.id) ?? 0) + (this.parts.get(c.id)?.progress ?? 0)
  }

  mine(now = Date.now()): ChallengeView[] {
    return this.list
      .filter((c) => c.status !== 'draft' && c.status !== 'cancelled'
        && (c.endsAt > now - 14 * DAY || (this.parts.get(c.id)?.progress ?? 0) > 0))
      .map((c) => {
        const p = this.parts.get(c.id)
        const reward = c.rewardBenefitId ? this.benefits.catalog.find((b) => b.id === c.rewardBenefitId) : undefined
        return {
          id: c.id, companyId: c.companyId, companyName: c.companyId ? this.companyName : null,
          title: c.title, description: c.description, badgeIcon: c.badgeIcon, format: c.format, scope: c.scope,
          scopeRef: c.scopeRef, metric: c.metric, goalValue: c.goalValue, goalKind: c.goalKind, perPersonMin: c.perPersonMin,
          windowStartHour: c.windowStartHour, windowEndHour: c.windowEndHour, startsAt: c.startsAt, endsAt: c.endsAt,
          status: c.status === 'scheduled' && c.startsAt <= now ? 'active' : c.status,
          rewardBonusLoopsCenti: c.rewardBonusLoopsCenti,
          rewardBenefit: reward ? { id: reward.id, title: reward.title } : null,
          myProgress: p?.progress ?? 0, myCompletedAt: p?.completedAt ?? null, myRewardedAt: p?.rewardedAt ?? null,
          myBenefitGranted: p?.granted ?? false,
          collectiveValue: c.format === 'collective' ? this.collectiveValue(c) : null,
          participants: c.format === 'collective' ? 120 + (p && p.progress > 0 ? 1 : 0) : null,
          goalReachedAt: null,
        }
      })
  }

  /* ---- the console ---- */

  adminRows(): ChallengeAdminRow[] {
    return this.list.filter((c) => c.companyId === null).map((c) => {
      const p = this.parts.get(c.id)
      return {
        ...c,
        participants: p && p.progress > 0 ? 1 : 0, completed: p?.completedAt ? 1 : 0, rewarded: p?.rewardedAt ? 1 : 0,
        collectiveValue: c.format === 'collective' ? this.collectiveValue(c) : null,
      }
    })
  }

  save(c: Challenge): string {
    if (c.companyId !== null) throw new Error('Le sfide aziendali le scrive l’RH dell’azienda.')
    const id = c.id || `ch-${Date.now()}`
    const i = this.list.findIndex((x) => x.id === id)
    if (i >= 0 && !['draft', 'scheduled'].includes(this.list[i].status)) throw new Error('Una sfida in corso non si modifica.')
    const row = { ...c, id, status: i >= 0 ? this.list[i].status : 'draft' as const }
    if (i >= 0) this.list[i] = row
    else this.list.push(row)
    if (c.rewardBenefitId) {
      const b = this.benefits.catalog.find((x) => x.id === c.rewardBenefitId)
      if (b && b.priceLoopsCenti === null) b.challengeExclusiveId = id
    }
    return id
  }

  action(id: string, action: 'publish' | 'schedule' | 'end' | 'cancel' | 'duplicate', now = Date.now()): string {
    const c = this.list.find((x) => x.id === id)
    if (!c) throw new Error('Sfida non trovata.')
    if (action === 'publish' || action === 'schedule') {
      if (c.status !== 'draft') throw new Error('Già pubblicata.')
      if (action === 'publish' && c.startsAt > now) c.startsAt = now
      c.status = c.startsAt > now ? 'scheduled' : 'active'
    } else if (action === 'end') {
      c.endsAt = Math.min(c.endsAt, now)
      c.status = 'settled'
    } else if (action === 'cancel') {
      if (['draft', 'scheduled', 'active'].includes(c.status)) c.status = 'cancelled'
    } else {
      const copy: Challenge = { ...c, id: `ch-${Date.now()}`, title: `${c.title} (cópia)`.slice(0, 80), status: 'draft', rewardBenefitId: null,
        startsAt: Math.max(now, c.startsAt), endsAt: Math.max(now, c.startsAt) + (c.endsAt - c.startsAt) }
      this.list.push(copy)
      return copy.id
    }
    return id
  }
}
