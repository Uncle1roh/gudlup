/* Challenges: the rules the console checks before Publish, the progress rule
   the demo shares with update_challenge_progress(), the Home card's
   priority, and the demo's Outubro Sereno played through to its prize.
   The database side is supabase/tests/challenges.sql.

   Run: npm test -- gam-challenges                                           */

import { readFileSync } from 'node:fs'
import {
  blankChallenge, checkRules, daysLeft, pickHomeChallenge, progressIncrement, shareOf, METRICS, PUBLIC_SCOPES,
  type ChallengeView,
} from '../src/gamification/challenges'
import { MockLedger } from '../src/gamification/mockLedger'
import { MockBenefits } from '../src/gamification/mockBenefits'
import { MockChallenges } from '../src/gamification/mockChallenges'

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else console.log(`ok  : ${msg}`)
}

const NOW = Date.parse('2026-10-20T15:00:00Z')
const DAY = 86_400_000

/* ---- what can be expressed at all (GAM-R1/R2/R4) ------------------------- */
assert(!METRICS.some((m) => /score|vas|dass|pss|brs|streak|consecutive|sos/i.test(m)), 'no metric on scores, VAS, streaks or SOS exists')
assert(PUBLIC_SCOPES.join() === 'national,region,state,city', 'public scopes: national, region, state, city — nothing smaller')
{
  const sql = readFileSync('supabase/setup.sql', 'utf8')
  const metricEnum = /create type challenge_metric as enum \(([^)]*)\)/.exec(sql)?.[1] ?? ''
  assert(METRICS.every((m) => metricEnum.includes(`'${m}'`)) && (metricEnum.match(/'/g)?.length ?? 0) === METRICS.length * 2, 'the TS metric list is exactly the database enum')
  assert(/check \(scope <> 'user'\)/.test(sql), 'the schema refuses scope user on a challenge')
}

/* ---- the checks before Publish ------------------------------------------- */
{
  const ok = { ...blankChallenge(NOW), title: 'x' }
  assert(checkRules(ok).every((r) => r.ok), 'a blank challenge with a title passes every rule')
  const bad = (p: Partial<typeof ok>) => checkRules({ ...ok, ...p }).filter((r) => !r.ok).map((r) => r.id).join()
  assert(bad({ endsAt: ok.startsAt - 1 }) === 'dates', 'end before start: dates')
  assert(bad({ rewardBonusLoopsCenti: null, rewardBenefitId: null }) === 'reward', 'no reward: reward')
  assert(bad({ format: 'collective', perPersonMin: null }) === 'goal', 'collective without a per-person minimum: goal')
  assert(bad({ scope: 'city', scopeRef: null }) === 'R4', 'a city scope without its city: R4')
  assert(bad({ scope: 'company', scopeRef: 'X' }) === 'R4', 'a Good Loop challenge cannot take a company scope: R4')
  assert(bad({ metric: 'sessions_in_time_window', windowStartHour: 22, windowEndHour: 21 }) === 'goal', 'a time window that ends before it starts: goal')
  assert(bad({ metric: 'consecutive_days' as never }).includes('R1'), 'a streak metric fails R1/R2/R3')
  const company = { ...ok, companyId: 'aurora', scope: 'company' as const, scopeRef: 'aurora' }
  assert(checkRules(company).every((r) => r.ok), 'a company challenge on the whole company passes')
}

/* ---- progress: the window, SOS, the metrics --------------------------------- */
{
  const c = { metric: 'minutes_listened' as const, startsAt: NOW - 10 * DAY, endsAt: NOW + 10 * DAY, windowStartHour: null, windowEndHour: null }
  const s = { startedAt: NOW - 1_440_000, endedAt: NOW, durationMin: 24, listenedSec: 1439, completed: true, sos: false }
  assert(progressIncrement(c, s) === 23, 'minutes heard, floored, capped at nominal')
  assert(progressIncrement(c, { ...s, sos: true }) === 0, 'SOS counts for nothing')
  assert(progressIncrement(c, { ...s, endedAt: c.startsAt - 1 }) === 0, 'a session ending before the start does not count')
  assert(progressIncrement(c, { ...s, endedAt: c.endsAt }) === 23, 'one ending exactly at the end does')
  const night = { ...c, metric: 'sessions_in_time_window' as const, windowStartHour: 21, windowEndHour: 24 }
  assert(progressIncrement(night, { ...s, startedAt: Date.parse('2026-10-21T00:30:00Z') }) === 1, '21:30 in São Paulo is inside 21h–24h')
  assert(progressIncrement(night, { ...s, startedAt: Date.parse('2026-10-20T23:30:00Z') }) === 0, '20:30 is not')
  assert(progressIncrement({ ...c, metric: 'deep_sessions_completed' }, { ...s, durationMin: 12 }) === 0, 'a Standard session is not Deep')
  assert(progressIncrement({ ...c, metric: 'sessions_completed' }, { ...s, completed: false }) === 0, 'an unfinished session is not a completed one')
}

/* ---- the one Home card (§5.5, PLAN A5) --------------------------------------- */
{
  const v = (id: string, p: Partial<ChallengeView>): ChallengeView => ({
    id, companyId: null, companyName: null, title: id, description: null, badgeIcon: 'flag', format: 'individual', scope: 'national',
    scopeRef: null, metric: 'sessions_completed', goalValue: 10, goalKind: 'total', perPersonMin: null, windowStartHour: null,
    windowEndHour: null, startsAt: NOW - DAY, endsAt: NOW + 5 * DAY, status: 'active', rewardBonusLoopsCenti: 100, rewardBenefit: null,
    myProgress: 0, myCompletedAt: null, myRewardedAt: null, myBenefitGranted: false, collectiveValue: null, participants: null,
    goalReachedAt: null, ...p,
  })
  const list = [v('soon', { endsAt: NOW + DAY }), v('close', { myProgress: 8 }), v('company', { companyId: 'aurora', myProgress: 1 })]
  assert(pickHomeChallenge(list, NOW)?.id === 'company', 'a company challenge comes first')
  assert(pickHomeChallenge(list.slice(0, 2), NOW)?.id === 'close', 'then the one closest to completion')
  assert(pickHomeChallenge([v('a', { endsAt: NOW + 3 * DAY }), v('b', { endsAt: NOW + DAY })], NOW)?.id === 'b', 'then the one ending soonest')
  assert(pickHomeChallenge([v('done', { myCompletedAt: NOW })], NOW) === null, 'a completed individual challenge leaves Home')
  assert(pickHomeChallenge([v('later', { startsAt: NOW + DAY, status: 'scheduled' })], NOW) === null, 'a scheduled one is not on Home yet')
  assert(shareOf(v('x', { myProgress: 15 })) === 1, 'the share never passes 100%')
  assert(daysLeft(NOW + 8.2 * DAY, NOW) === 9 && daysLeft(NOW - DAY, NOW) === 0, '"faltam 9 dias", never negative')
}

/* ---- the demo, played through ---------------------------------------------------- */
{
  const ledger = new MockLedger()
  ledger.settings = { ...ledger.settings, maxBackdateHours: null }
  const benefits = new MockBenefits(ledger)
  const ch = new MockChallenges(ledger, benefits, NOW)
  assert(ch.mine(NOW).some((c) => c.id === 'outubro-sereno' && c.status === 'active'), 'Outubro Sereno is live in the demo')
  assert(!benefits.available(NOW).some((b) => b.id === 'corpo3'), 'its prize is hidden until earned')

  for (let i = 0; i < 13; i++) {
    const end = NOW - 10 * DAY + i * DAY / 2
    ledger.creditSession({ id: `d${i}`, protocolCode: 'X', duration: 24, startedAt: end - 1_440_000, completedAt: end, completed: true, listenedSec: 1440 }, NOW)
  }
  ledger.creditSession({ id: 'sos', protocolCode: 'X', duration: 24, startedAt: NOW - 3 * DAY, completedAt: NOW - 3 * DAY + 1_440_000, completed: true, listenedSec: 1440, sos: true }, NOW)
  const os = ch.mine(NOW).find((c) => c.id === 'outubro-sereno')!
  assert(os.myProgress === 312, `13 Deep sessions: 312 minutes; SOS added nothing (${os.myProgress})`)
  assert(os.myCompletedAt !== null && os.myBenefitGranted, 'completed, and the prize granted at once')
  assert(benefits.available(NOW).some((b) => b.id === 'corpo3'), 'the prize now appears in Benefits')
  assert(ledger.achievements().find((a) => a.slug === 'first_challenge')?.unlockedAt !== null, 'Primeiro desafio unlocked')
  const sono = ch.mine(NOW).find((c) => c.id === 'semana-do-sono')!
  assert(sono.myProgress === 0, 'a scheduled challenge counted nothing')
  assert(!JSON.stringify(ch.mine(NOW)).match(/"(name|email|userId)"/), 'the person reads no one else’s identity')

  assert(ch.adminRows().length === 2, 'the console lists the Good Loop challenges')
  let threw = false
  try { ch.save({ ...ch.list[0] }) } catch { threw = true }
  assert(threw, 'a live challenge cannot be edited')
  const copy = ch.action('outubro-sereno', 'duplicate', NOW)
  assert(ch.list.find((c) => c.id === copy)?.status === 'draft', 'duplicate makes a draft')
}

console.log(process.exitCode ? '\nFAILED' : '\ndone.')
