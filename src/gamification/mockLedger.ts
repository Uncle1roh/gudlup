/* ============================================================================
   The demo's ledgers — what credit_session() does on the server, in memory.

   The mock provider has one person, so one wallet. Every rule is the pure
   one in economy.ts; this only keeps the state those rules need between
   sessions (the day's usage, the entries, the company windows) and enforces
   what the database enforces: a session is credited once, entries are never
   edited, SOS earns nothing, an achievement unlocks once and pays once.
   ============================================================================ */

import type { SessionRecord } from '../types/domain'
import {
  DEFAULT_ECONOMY, addUsage, computeSessionCredit, creditInstant, dayKeySaoPaulo, monthKeySaoPaulo, multiplierAt, walletFrom,
  type CompanyWindow, type DailyUsage, type EconomySettings, type LoopsEntry, type PointsEntry, type Wallet,
} from './economy'
import {
  ACHIEVEMENTS, individualMetrics, newlyUnlocked,
  type AchievementDef, type AchievementView, type CreditedSession,
} from './achievements'

export class MockLedger {
  settings: EconomySettings = { ...DEFAULT_ECONOMY }
  /** The person's company links with their add-on, for the multiplier. */
  windows: Array<CompanyWindow & { companyId: string }> = []
  private points: PointsEntry[] = []
  private loops: LoopsEntry[] = []
  private usage = new Map<string, DailyUsage>()
  private seq = 0
  defs: AchievementDef[] = ACHIEVEMENTS.map((x) => ({ ...x }))
  private credited: CreditedSession[] = []
  private pathways = new Set<string>()
  private unlocked = new Map<string, { unlockedAt: number; seenAt: number | null }>()
  /** Completed challenges — kept by the demo's challenges (mockChallenges.ts). */
  challengesCompleted = 0
  /** What update_challenge_progress() hears: each credited session, before
      achievements are evaluated (the server's order). */
  onCredit: ((rec: SessionRecord, points: number, at: number) => void) | null = null
  onPathway: ((slug: string, at: number) => void) | null = null

  /** Credit one recorded session. Idempotent on the record id. */
  creditSession(rec: SessionRecord, now = Date.now()): void {
    if (this.points.some((p) => p.sourceType === 'session' && p.sourceId === rec.id)) return
    if (rec.sos) return
    const at = creditInstant(rec.completedAt, now, this.settings)
    const usage = this.usage.get(dayKeySaoPaulo(at)) ?? null
    const multiplier = multiplierAt(this.windows, at)
    const credit = computeSessionCredit(
      {
        kind: 'b2c',
        durationMin: rec.duration,
        listenedSec: rec.listenedSec ?? null,
        completed: rec.completed ?? !!rec.completedAt,
        sos: false,
        endedAt: at,
      },
      this.settings,
      usage,
      multiplier,
    )
    this.usage.set(credit.day, addUsage(usage, credit))
    this.credited.push({ startedAt: rec.startedAt, durationMin: rec.duration, completed: rec.completed ?? !!rec.completedAt, stereoChecked: !!rec.stereoChecked })
    this.points.push({
      id: this.id(), sourceType: 'session', sourceId: rec.id, points: credit.points,
      periodMonth: `${credit.day.slice(0, 7)}-01`, cityIbgeCode: null, createdAt: now,
    })
    if (credit.baseCenti > 0) {
      this.loops.push({
        id: this.id(), entryType: 'earn_listening', amountCenti: credit.baseCenti, fundingSource: 'goodloop',
        companyId: null, multiplierApplied: null, sourceType: 'session', sourceId: rec.id, createdAt: now,
      })
    }
    if (credit.companyCenti > 0) {
      const company = this.windows.find((w) => multiplierAt([w], at) === credit.multiplier)
      this.loops.push({
        id: this.id(), entryType: 'earn_company_multiplier', amountCenti: credit.companyCenti, fundingSource: 'company',
        companyId: company?.companyId ?? null, multiplierApplied: credit.multiplier, sourceType: 'session', sourceId: rec.id, createdAt: now,
      })
    }
    this.onCredit?.(rec, credit.points, at)
    this.evaluate(now)
  }

  /** A finished pathway (record_pathway_completed). */
  recordPathwayCompleted(slug: string, now = Date.now()): void {
    this.pathways.add(slug)
    this.onPathway?.(slug, now)
    this.evaluate(now)
  }

  /** A challenge's bonus — gam_credit_bonus(): never multiplied, funded by
      whoever owns the challenge, once per challenge. */
  postChallengeBonus(challengeId: string, centi: number, companyId: string | null, now = Date.now()): void {
    if (centi <= 0) return
    if (this.loops.some((e) => e.entryType === 'challenge_bonus' && e.sourceId === challengeId)) return
    this.loops.push({
      id: this.id(), entryType: 'challenge_bonus', amountCenti: centi, fundingSource: companyId ? 'company' : 'goodloop',
      companyId, multiplierApplied: null, sourceType: 'challenge', sourceId: challengeId, createdAt: now,
    })
  }

  /** evaluate_achievements(): unlock what is reached, pay each bonus once. */
  evaluate(now = Date.now()): AchievementDef[] {
    const minutes = [...this.usage.values()].reduce((a, u) => a + u.eligibleMinutes, 0)
    const metrics = individualMetrics(this.credited, minutes, this.pathways.size, this.challengesCompleted)
    const fresh = newlyUnlocked(this.defs, metrics, new Set(this.unlocked.keys()))
    for (const a of fresh) {
      this.unlocked.set(a.slug, { unlockedAt: now, seenAt: null })
      if (a.bonusLoopsCenti > 0) {
        this.loops.push({
          id: this.id(), entryType: 'achievement_bonus', amountCenti: a.bonusLoopsCenti, fundingSource: 'goodloop',
          companyId: null, multiplierApplied: null, sourceType: 'achievement', sourceId: a.slug, createdAt: now,
        })
      }
    }
    return fresh
  }

  /** get_my_achievements(): active definitions plus any unlocked one. */
  achievements(): AchievementView[] {
    const minutes = [...this.usage.values()].reduce((a, u) => a + u.eligibleMinutes, 0)
    const metrics = individualMetrics(this.credited, minutes, this.pathways.size, this.challengesCompleted)
    return this.defs
      .filter((x) => x.active || this.unlocked.has(x.slug))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((x) => {
        const u = this.unlocked.get(x.slug)
        return {
          ...x,
          id: x.slug,
          value: x.kind === 'individual' ? metrics[x.metric as keyof typeof metrics] ?? 0 : null,
          unlockedAt: u?.unlockedAt ?? null,
          seenAt: u?.seenAt ?? null,
        }
      })
  }

  /** Every eligible minute ever credited. */
  lifetimeMinutes(): number {
    return [...this.usage.values()].reduce((a, u) => a + u.eligibleMinutes, 0)
  }

  balanceCenti(): number {
    return this.loops.reduce((a, e) => a + e.amountCenti, 0)
  }

  /** A redemption's debit or its refund — what redeem_benefit() and
      admin_refund_redemption() write. Idempotent on the redemption. */
  postRedemption(type: 'redemption' | 'redemption_refund', centi: number, redemptionId: string, now = Date.now()): void {
    if (centi <= 0) return
    if (this.loops.some((e) => e.entryType === type && e.sourceId === redemptionId)) return
    this.loops.push({
      id: this.id(), entryType: type, amountCenti: type === 'redemption' ? -centi : centi, fundingSource: 'goodloop',
      companyId: null, multiplierApplied: null, sourceType: 'redemption', sourceId: redemptionId, createdAt: now,
    })
  }

  markSeen(ids: string[], now = Date.now()): void {
    for (const id of ids) {
      const u = this.unlocked.get(id)
      if (u && u.seenAt === null) u.seenAt = now
    }
  }

  wallet(now = Date.now()): Wallet {
    const month = monthKeySaoPaulo(now).slice(0, 7)
    let minutes = 0
    let sessions = 0
    for (const u of this.usage.values()) {
      if (u.day.slice(0, 7) !== month) continue
      minutes += u.eligibleMinutes
      sessions += u.sessions ?? 0
    }
    return walletFrom(this.loops, this.points, minutes, sessions, multiplierAt(this.windows, now), now)
  }

  /** Newest first, as the wallet history reads. */
  loopsEntries(): LoopsEntry[] {
    return [...this.loops].sort((a, b) => b.createdAt - a.createdAt)
  }

  pointsEntries(): PointsEntry[] {
    return [...this.points]
  }

  private id(): string {
    this.seq += 1
    return `gam-${this.seq}`
  }
}
