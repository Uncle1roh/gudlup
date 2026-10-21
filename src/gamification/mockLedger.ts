/* ============================================================================
   The demo's ledgers — what credit_session() does on the server, in memory.

   The mock provider has one person, so one wallet. Every rule is the pure
   one in economy.ts; this only keeps the state those rules need between
   sessions (the day's usage, the entries, the company windows) and enforces
   what the database enforces: a session is credited once, entries are never
   edited, SOS earns nothing.
   ============================================================================ */

import type { SessionRecord } from '../types/domain'
import {
  DEFAULT_ECONOMY, addUsage, computeSessionCredit, creditInstant, dayKeySaoPaulo, monthKeySaoPaulo, multiplierAt, walletFrom,
  type CompanyWindow, type DailyUsage, type EconomySettings, type LoopsEntry, type PointsEntry, type Wallet,
} from './economy'

export class MockLedger {
  settings: EconomySettings = { ...DEFAULT_ECONOMY }
  /** The person's company links with their add-on, for the multiplier. */
  windows: Array<CompanyWindow & { companyId: string }> = []
  private points: PointsEntry[] = []
  private loops: LoopsEntry[] = []
  private usage = new Map<string, DailyUsage>()
  private seq = 0

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
