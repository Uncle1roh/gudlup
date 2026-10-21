/* Achievements, proved on the parity fixtures.

   src/gamification/__fixtures__/achievements.json is shared with
   supabase/tests/achievements_parity.sql (tools/db-gate.mjs): the same
   sessions through the mock ledger here, through the real triggers there,
   the same metrics, unlocks and bonus total expected of both.

   Run: npm test -- gam-achievements                                       */

import fixtures from '../src/gamification/__fixtures__/achievements.json'
import { MockLedger } from '../src/gamification/mockLedger'
import {
  ACHIEVEMENTS, individualMetrics, isoWeekKey, localParts, nextAchievement, unseenUnlocks, fmtMinutes,
  type IndividualMetric,
} from '../src/gamification/achievements'

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else console.log(`ok  : ${msg}`)
}

interface Scenario {
  name: string
  sessions: { startedAt: string; durationMin: number; listenedSec: number; completed: boolean; stereoChecked: boolean; sos: boolean }[]
  pathways: string[]
  expected: { metrics: Partial<Record<IndividualMetric, number>>; unlocked: string[]; bonusCenti: number }
}

const NOW = Date.parse('2026-10-22T12:00:00Z')

for (const sc of (fixtures as { scenarios: Scenario[] }).scenarios) {
  const l = new MockLedger()
  l.settings = { ...l.settings, maxBackdateHours: null }
  sc.sessions.forEach((s, i) => {
    const startedAt = Date.parse(s.startedAt)
    l.creditSession({
      id: `s-${i}`, protocolCode: 'X', duration: s.durationMin as 6 | 12 | 24, startedAt,
      completedAt: startedAt + s.durationMin * 60_000, completed: s.completed,
      listenedSec: s.listenedSec, stereoChecked: s.stereoChecked, sos: s.sos,
    }, NOW)
  })
  for (const p of sc.pathways) l.recordPathwayCompleted(p, NOW)

  const views = l.achievements()
  const got = views.filter((a) => a.unlockedAt !== null).map((a) => a.slug)
  assert(JSON.stringify(got) === JSON.stringify(sc.expected.unlocked), `${sc.name}: unlocks ${got.join(', ') || 'nothing'}` +
    (JSON.stringify(got) === JSON.stringify(sc.expected.unlocked) ? '' : `  (expected ${sc.expected.unlocked.join(', ')})`))
  for (const [k, v] of Object.entries(sc.expected.metrics)) {
    const val = views.find((a) => a.metric === k)?.value
    assert(val === v, `${sc.name}: ${k} = ${val} (expected ${v})`)
  }
  const bonus = l.loopsEntries().filter((e) => e.entryType === 'achievement_bonus').reduce((a, e) => a + e.amountCenti, 0)
  assert(bonus === sc.expected.bonusCenti, `${sc.name}: bonus ${bonus} centi (expected ${sc.expected.bonusCenti})`)

  // Re-evaluating never pays twice.
  l.evaluate(NOW + 1000)
  const again = l.loopsEntries().filter((e) => e.entryType === 'achievement_bonus').reduce((a, e) => a + e.amountCenti, 0)
  assert(again === bonus, `${sc.name}: re-evaluating pays nothing more`)
}

/* ---- the seed --------------------------------------------------------- */
const slugs = ACHIEVEMENTS.map((a) => a.slug)
assert(new Set(slugs).size === slugs.length, 'achievement slugs are unique')
assert(ACHIEVEMENTS.filter((a) => a.kind === 'individual').length === 16, '16 individual achievements (SPEC §3.2)')
assert(ACHIEVEMENTS.filter((a) => a.kind === 'collective').length === 8, '8 collective achievements (SPEC §3.3)')
assert(ACHIEVEMENTS.every((a) => (a.kind === 'individual') === (a.scope === 'user')), 'individual ⇔ scope user')
assert(!ACHIEVEMENTS.some((a) => /team|area|unit|depart|group|friend|equipe|unidade/i.test(`${a.slug} ${a.scope} ${a.metric}`)), 'GAM-R4: no team/area/unit achievement')
assert(!ACHIEVEMENTS.some((a) => /score|vas|dass|pss|brs|streak|consecutive|result/i.test(a.metric)), 'GAM-R1/R2: no metric on scores, VAS or streaks')
const tierBonus: Record<string, number> = { semente: 2000, broto: 5000, raiz: 10000, copa: 25000 }
assert(ACHIEVEMENTS.filter((a) => a.kind === 'individual').every((a) => a.bonusLoopsCenti === tierBonus[a.tier]), 'tier bonuses 20 / 50 / 100 / 250 Loops')

/* ---- the clock -------------------------------------------------------- */
assert(localParts(Date.parse('2026-10-15T00:00:00Z')).hour === 21, '00:00 UTC is 21:00 in São Paulo (a night session)')
assert(localParts(Date.parse('2026-10-18T23:59:00Z')).hour === 20, '23:59 UTC is 20:59 — not yet night')
assert(isoWeekKey(Date.parse('2026-10-19T02:00:00Z')) === '2026-42', 'Sunday 23:00 in São Paulo is still ISO week 42')
assert(isoWeekKey(Date.parse('2026-10-19T03:00:00Z')) === '2026-43', 'Monday 00:00 in São Paulo starts week 43')
assert(isoWeekKey(Date.parse('2027-01-01T15:00:00Z')) === '2026-53', '1 Jan 2027 belongs to ISO week 2026-53')

/* ---- weeks count, never in a row (GAM-R1) ------------------------------ */
{
  const at = (iso: string) => ({ startedAt: Date.parse(iso), durationMin: 6, completed: true, stereoChecked: false })
  const m = individualMetrics([at('2026-01-05T15:00:00Z'), at('2026-03-02T15:00:00Z'), at('2026-06-01T15:00:00Z'), at('2026-10-05T15:00:00Z')], 24, 0, 0)
  assert(m.distinct_weeks === 4, 'four weeks months apart still make four weeks')
}

/* ---- for the screens -------------------------------------------------- */
{
  const l = new MockLedger()
  const t0 = Date.parse('2026-10-20T15:00:00Z')
  for (let i = 0; i < 9; i++) {
    l.creditSession({ id: `n-${i}`, protocolCode: 'X', duration: 24, startedAt: t0 + i * 86_400_000, completedAt: t0 + i * 86_400_000 + 1_440_000, completed: true, listenedSec: 1440 }, t0 + i * 86_400_000 + 1_500_000)
  }
  const views = l.achievements()
  const next = nextAchievement(views)
  assert(next?.slug === 'listen_5h', `next achievement after 216 min is 5 h of listening (${next?.slug})`)
  const queue = unseenUnlocks(views)
  assert(queue.length > 0 && queue.every((a) => a.seenAt === null), 'unlocks wait in the sheet queue until seen')
  l.markSeen(queue.map((a) => a.id))
  assert(unseenUnlocks(l.achievements()).length === 0, 'closing the sheet marks them seen')
}
assert(fmtMinutes(220) === '3h 40min' && fmtMinutes(300) === '5h' && fmtMinutes(45) === '45 min', 'listening time reads "3h 40min", "5h", "45 min"')

console.log(process.exitCode ? '\nFAILED' : '\ndone.')
