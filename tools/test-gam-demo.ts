/* Demo data lives in the demo, and only there.

   The walkthrough (the mock provider: no backend, or an admin's preview from
   the console) opens on a lived-in app; the live data layer and the
   database script carry no demo person, session, redemption or partner.

   Run: npm test -- gam-demo                                                 */

import { readFileSync, existsSync } from 'node:fs'
import { createMockProvider } from '../src/data/mock'

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else console.log(`ok  : ${msg}`)
}

const store = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
}

async function run() {
  const dp = createMockProvider()
  const w = await dp.getWallet()
  assert(w.loops > 0 && w.minutesMonth > 0, `the demo opens with Loops (${w.loops}) and time given this month (${w.minutesMonth} min)`)
  const ledger = await dp.listLoopsLedger()
  assert(ledger.some((e) => e.entryType === 'earn_company_multiplier'), 'the demo company’s multiplier shows in the history')
  const ach = await dp.listMyAchievements()
  const unlocked = ach.filter((a) => a.unlockedAt !== null)
  assert(unlocked.length >= 3, `several achievements unlocked (${unlocked.map((a) => a.slug).join(', ')})`)
  assert(unlocked.filter((a) => a.seenAt === null).length === 1, 'exactly one waits for the unlock sheet')
  assert((await dp.listMyRedemptions()).length === 1, 'one benefit already in Meus benefícios')
  const card = await dp.getMyCityCard()
  assert(card?.consented && card.city?.name === 'São Paulo' && card.eligible, 'the demo person takes part in the rankings from São Paulo')
  const os = (await dp.listMyChallenges()).find((c) => c.id === 'outubro-sereno')
  assert(os && os.myProgress > 0 && os.myProgress < os.goalValue, `Outubro Sereno in progress (${os?.myProgress} of ${os?.goalValue} min)`)
  assert((await dp.listSessions()).every((s) => s.completed !== false), 'early stops earn, but never appear as finished sessions')

  const fresh = createMockProvider({ gamificationHistory: false })
  assert((await fresh.getWallet()).loops === w.loops, 'one demo state per page load, shared across surfaces')
}

/* ---- the real side carries none of it ----------------------------------------- */
const supa = readFileSync('src/data/supabase.ts', 'utf8')
assert(!/DEMO_|mockDemo|benefitsDemo|mockLedger|mockCompany|mockChallenges/.test(supa), 'the live data layer imports no demo fixture')
const setup = readFileSync('supabase/setup.sql', 'utf8')
assert(!/\[PARCEIRO\]|goodloop\.demo|gl-demo-|Pessoa Demo|AURORA-(ALIMENTOS|2026)/i.test(setup), 'setup.sql seeds configuration only — no demo company, person or partner')
assert(!existsSync('supabase/seed_gamification_demo.sql'), 'no demo seed for a database exists to be run by mistake')

run().then(() => console.log(process.exitCode ? '\nFAILED' : '\ndone.'))
