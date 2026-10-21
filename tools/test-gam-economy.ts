/* The Loops economy, proved on the parity fixtures.

   src/gamification/__fixtures__/economy.json is shared with
   supabase/tests/economy_parity.sql (run by tools/db-gate.mjs): the same
   cases, the same expected numbers, one through the TypeScript rules the mock
   uses and one through credit_session() in the database. If the two ever
   disagree, one of these suites fails.

   Run: npm test -- gam-economy                                            */

import fixtures from '../src/gamification/__fixtures__/economy.json'
import { MockLedger } from '../src/gamification/mockLedger'
import {
  DEFAULT_ECONOMY, computeSessionCredit, multiplierAt, addUsage, dayKeySaoPaulo, monthKeySaoPaulo,
  displayLoops, walletFrom, type EconomySettings, type CompanyWindow, type LoopsEntry,
} from '../src/gamification/economy'

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else console.log(`ok  : ${msg}`)
}

interface Case {
  name: string
  settings?: Partial<EconomySettings>
  session: { kind: 'b2c' | 'b2b'; durationMin: number; listenedSec: number | null; completed: boolean; sos: boolean; endedAt: string }
  usage: { day: string; eligibleMinutes: number; completionBonuses: number } | null
  company: {
    multiplier: number; affiliationStartsAt: string; affiliationEndsAt: string | null
    subscriptionStatus: 'active' | 'paused' | 'ended'; subscriptionStartsAt: string; subscriptionEndsAt: string | null
  } | null
  expected: { points: number; baseCenti: number; companyCenti: number }
}

const ms = (iso: string | null) => (iso === null ? null : Date.parse(iso))
const cases = (fixtures as { cases: Case[] }).cases

assert(cases.length >= 12, `at least 12 parity fixtures (${cases.length})`)

for (const c of cases) {
  const endedAt = Date.parse(c.session.endedAt)
  const windows: CompanyWindow[] = c.company ? [{
    multiplier: c.company.multiplier,
    affiliationStartsAt: ms(c.company.affiliationStartsAt)!,
    affiliationEndsAt: ms(c.company.affiliationEndsAt),
    subscriptionStatus: c.company.subscriptionStatus,
    subscriptionStartsAt: ms(c.company.subscriptionStartsAt)!,
    subscriptionEndsAt: ms(c.company.subscriptionEndsAt),
  }] : []
  const got = computeSessionCredit(
    { ...c.session, endedAt },
    { ...DEFAULT_ECONOMY, ...c.settings },
    c.usage,
    multiplierAt(windows, endedAt),
  )
  const e = c.expected
  assert(
    got.points === e.points && got.baseCenti === e.baseCenti && got.companyCenti === e.companyCenti,
    `${c.name} → ${got.points} pts / ${got.baseCenti} / ${got.companyCenti}` +
      (got.points === e.points && got.baseCenti === e.baseCenti && got.companyCenti === e.companyCenti
        ? '' : `  (expected ${e.points} / ${e.baseCenti} / ${e.companyCenti})`),
  )
}

/* ---- rules the fixtures do not spell out -------------------------------- */

// GAM-R9: the multiplier never touches Points.
{
  const s = { kind: 'b2c' as const, durationMin: 24, listenedSec: 1440, completed: true, sos: false, endedAt: Date.parse('2026-10-20T15:00:00Z') }
  const plain = computeSessionCredit(s, DEFAULT_ECONOMY, null, null)
  const boosted = computeSessionCredit(s, DEFAULT_ECONOMY, null, 2)
  assert(plain.points === boosted.points && plain.baseCenti === boosted.baseCenti, 'GAM-R9: Points and base Loops identical with and without a multiplier')
}

// The caps accumulate across a day and reset the next.
{
  const at = Date.parse('2026-10-20T12:00:00Z')
  const s = { kind: 'b2c' as const, durationMin: 24, listenedSec: 1440, completed: true, sos: false, endedAt: at }
  let usage = null as ReturnType<typeof addUsage> | null
  let points = 0
  for (let i = 0; i < 7; i++) {
    const c = computeSessionCredit(s, DEFAULT_ECONOMY, usage, null)
    points += c.points
    usage = addUsage(usage, c)
  }
  assert(usage!.eligibleMinutes === 120, `seven Deep sessions in a day: 120 eligible minutes (${usage!.eligibleMinutes})`)
  assert(usage!.completionBonuses === 4, `… and 4 completion bonuses (${usage!.completionBonuses})`)
  assert(points === 160, `… so 160 points (${points})`)
  const next = computeSessionCredit({ ...s, endedAt: at + 86_400_000 }, DEFAULT_ECONOMY, usage, null)
  assert(next.points === 34, `the next day starts fresh (${next.points})`)
}

// Nothing is ever negative.
{
  const c = computeSessionCredit({ kind: 'b2c', durationMin: 6, listenedSec: -50, completed: false, sos: false, endedAt: Date.now() }, DEFAULT_ECONOMY, { day: dayKeySaoPaulo(Date.now()), eligibleMinutes: 500, completionBonuses: 9 }, null)
  assert(c.points === 0 && c.baseCenti === 0, 'negative listened seconds and an over-full day credit zero, never less')
}

// São Paulo calendar.
assert(dayKeySaoPaulo(Date.parse('2026-10-21T02:59:00Z')) === '2026-10-20', 'day key: 23:59 in São Paulo is still that day')
assert(dayKeySaoPaulo(Date.parse('2026-10-21T03:00:00Z')) === '2026-10-21', 'day key: midnight in São Paulo is the next day')
assert(monthKeySaoPaulo(Date.parse('2026-11-01T02:00:00Z')) === '2026-10-01', 'month key: 23:00 on 31 Oct in São Paulo is October')

// Display.
assert(displayLoops(330) === 3 && displayLoops(99) === 0 && displayLoops(0) === 0, 'Loops are shown floored: 330 → 3, 99 → 0')

// The wallet adds the ledger up.
{
  const now = Date.parse('2026-10-20T15:00:00Z')
  const e = (amountCenti: number): LoopsEntry => ({ id: String(amountCenti), entryType: 'earn_listening', amountCenti, fundingSource: 'goodloop', companyId: null, multiplierApplied: null, sourceType: 'session', sourceId: String(amountCenti), createdAt: now })
  const w = walletFrom([e(220), e(110), e(-200)], [
    { id: 'a', sourceType: 'session', sourceId: 'a', points: 22, periodMonth: '2026-10-01', cityIbgeCode: null, createdAt: now },
    { id: 'b', sourceType: 'session', sourceId: 'b', points: 10, periodMonth: '2026-09-01', cityIbgeCode: null, createdAt: now },
  ], 12, 1, 1, now)
  assert(w.balanceCenti === 130 && w.loops === 1, `wallet balance 130 centi → 1 Loop (${w.balanceCenti})`)
  assert(w.pointsTotal === 32 && w.pointsMonth === 22, `points: 32 total, 22 this month (${w.pointsTotal}/${w.pointsMonth})`)
  assert(w.multiplier === null, 'a 1.0× plan shows no multiplier line')
}

// The demo provider's ledger behaves like the database.
{
  const now = Date.parse('2026-10-20T15:00:00Z')
  const l = new MockLedger()
  l.windows = [{ companyId: 'aurora', multiplier: 1.5, affiliationStartsAt: 0, affiliationEndsAt: null, subscriptionStatus: 'active', subscriptionStartsAt: 0, subscriptionEndsAt: null }]
  const rec = { id: 's-1', protocolCode: 'X', duration: 12 as const, startedAt: now - 780_000, completedAt: now - 60_000, completed: true, listenedSec: 720 }
  l.creditSession(rec, now)
  l.creditSession(rec, now)
  l.creditSession({ ...rec, id: 's-sos', sos: true }, now)
  const w = l.wallet(now)
  assert(w.balanceCenti === 330 && w.loops === 3, `mock: Ana's session once, at 1.5×: 330 centi (${w.balanceCenti})`)
  assert(l.loopsEntries().length === 2, `mock: two entries, base + company, and SOS added none (${l.loopsEntries().length})`)
  assert(l.loopsEntries().every((e) => e.entryType !== 'earn_company_multiplier' || (e.fundingSource === 'company' && e.companyId === 'aurora')), 'mock: the multiplier entry is company-funded and names the company')
  assert(w.minutesMonth === 12 && w.sessionsMonth === 1 && w.pointsMonth === 22, `mock: 12 min, 1 session, 22 points this month (${w.minutesMonth}/${w.sessionsMonth}/${w.pointsMonth})`)
  assert(w.multiplier === 1.5, 'mock: the wallet names the multiplier in force')
  l.creditSession({ ...rec, id: 's-old', startedAt: now - 30 * 86_400_000, completedAt: now - 30 * 86_400_000 + 720_000 }, now)
  assert(l.pointsEntries().find((p) => p.sourceId === 's-old')?.periodMonth === '2026-10-01', 'mock: a session dated a month back is credited as of now')
}

console.log(process.exitCode ? '\nFAILED' : '\ndone.')
