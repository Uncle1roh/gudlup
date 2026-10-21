/* The company add-on in the demo provider, held to what
   supabase/tests/company_addon.sql proves of the database: the multiplier
   window and plan changes, the tag filter applied to the employee's own
   catalogue, the identified consent, template-only challenges, and k
   suppression with its complement.

   Run: npm test -- gam-company                                              */

import { readFileSync } from 'node:fs'
import { TEMPLATE_SEED, kCell, kShare } from '../src/gamification/company'
import { createMockProvider } from '../src/data/mock'
import { RedeemError } from '../src/gamification/benefits'

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

/* ---- k, both ways (mirrors gam_k_cell) ----------------------------------- */
assert(kCell(24, 100, 25) === null, 'under k: hidden')
assert(kCell(27, 30, 25) === null, '27 of 30: the 3 left out could be recovered — hidden')
assert(kCell(30, 30, 25) === 30, 'everyone: nothing to recover — shown')
assert(kCell(50, 100, 25) === 50, '50 of 100: shown')
assert(kShare(30, 60, 25) === 50 && kShare(10, 60, 25) === null && kShare(20, 20, 25) === null, 'shares: 50 %, hidden under k, hidden for a company under k')
{
  const sql = readFileSync('supabase/setup.sql', 'utf8')
  assert(/case when p_count < p_k or \(p_population - p_count\) between 1 and p_k - 1 then null else p_count end/.test(sql), 'the database applies the same rule')
  assert(TEMPLATE_SEED.every((t) => sql.includes(`('${t.slug}', '${t.title}', '${t.description}'`)), 'the TS templates are the database seed')
}

async function run() {
  store.clear()
  const dp = createMockProvider({ gamificationHistory: false })

  /* the plan */
  const addon = await dp.hrGetAddon()
  assert(addon?.planId === 'premium' && addon.multiplier === 1.5, 'the demo company is on Premium 1.5×')
  const t0 = Date.now() - 60_000
  await dp.recordSession({ id: 's-co-1', protocolCode: 'X', duration: 12, startedAt: t0 - 720_000, completedAt: t0, completed: true, listenedSec: 720 })
  let w = await dp.getWallet()
  assert(w.multiplier === 1.5, 'the employee’s wallet says 1.5×')
  const entries = await dp.listLoopsLedger()
  assert(entries.some((e) => e.entryType === 'earn_company_multiplier' && e.fundingSource === 'company' && e.amountCenti === 110), 'a Standard session: +1.10 Loops, company-funded')
  await dp.adminSetCompanyPlan('AURORA-2026-Z5', 'max')
  assert((await dp.hrGetAddon())?.multiplier === 2, 'a plan change takes effect')
  await dp.adminSetCompanyPlan('AURORA-2026-Z5', null)
  assert((await dp.hrGetAddon()) === null, 'ending the plan ends the add-on')
  w = await dp.getWallet()
  assert(w.multiplier === null, 'and the wallet stops showing a multiplier')
  await dp.adminSetCompanyPlan('AURORA-2026-Z5', 'premium')

  /* a) the tag filter reaches the employee's own catalogue */
  const tags = await dp.hrListTagFilter()
  const food = tags.find((x) => x.slug === 'alimentos_bebidas')!
  assert(food.disabled && food.affects > 0, `"Alimentos e bebidas" is off in the demo, affecting ${food.affects}`)
  let mine = await dp.getAvailableBenefits()
  assert(!mine.some((b) => b.tags.includes('Alimentos e bebidas')), 'its benefits are hidden from the employee')
  await dp.hrSetTagDisabled(food.id, false)
  mine = await dp.getAvailableBenefits()
  assert(mine.some((b) => b.tags.includes('Alimentos e bebidas')), 'switched on again, they return')
  await dp.hrSetTagDisabled(food.id, true)
  assert((await dp.hrTagFilterHistory()).length === 2, 'each switch-off is a history row')

  /* b) company benefits and the identified consent */
  assert(mine.some((b) => b.companyId === 'AURORA-2026-Z5'), 'the company’s own benefits reach its employee')
  let refused = ''
  try { await dp.redeemBenefit('co-folga', true) } catch (e) { refused = e instanceof RedeemError ? e.refusal : String(e) }
  assert(refused === 'BENEFIT_NEEDS_CONSENT' || refused === 'BENEFIT_BALANCE', `identified without an employee number is refused (${refused})`)
  const cafe = await dp.redeemBenefit('co-cafe')
  assert(cafe.code === null, 'a collective benefit hands out no code and names nobody')
  const ids = await dp.hrIdentifiedRedemptions()
  assert(ids.every((r) => r.employeeNumber !== undefined), 'HR sees identified redemptions only')
  let badMode = false
  try { await dp.hrSaveCompanyBenefit({ id: '', title: 'x', description: null, careRationale: null, pillar: 'sono', priceLoopsCenti: 0, stockTotal: null, deliveryType: 'static_code' as never, status: 'active', terms: null, codesFree: 0, codesTotal: 0 }) } catch { badMode = true }
  assert(badMode, 'a company benefit is a code, collective or identified — nothing else')

  /* c) templates only */
  const id = await dp.hrSaveCompanyChallenge({ id: '', templateSlug: 'sono_em_dia', goalValue: 5, perPersonMin: null, startsAt: Date.now(), endsAt: Date.now() + 20 * 86_400_000, rewardBonusLoopsCenti: 2000, rewardBenefitId: null, rewardRule: 'first_to_complete' })
  await dp.hrCompanyChallengeAction(id, 'publish')
  const ch = (await dp.listMyChallenges()).find((c) => c.id === id)
  assert(ch?.title === 'Sono em dia' && ch.scope === 'company', 'the challenge carries the template’s title, whole company')
  let noTpl = false
  try { await dp.hrSaveCompanyChallenge({ id: '', templateSlug: 'livre', goalValue: 1, perPersonMin: null, startsAt: Date.now(), endsAt: Date.now() + 86_400_000, rewardBonusLoopsCenti: 100, rewardBenefitId: null, rewardRule: 'first_to_complete' }) } catch { noTpl = true }
  assert(noTpl, 'no template, no challenge')

  /* d) the dashboard */
  const dash = await dp.hrAddonDashboard()
  assert(dash.minCohort >= 25, 'k is at least 25')
  assert(!JSON.stringify(dash).match(/"(name|email|userId|area|team|unit|department)"/i), 'company-wide only: no person, no sub-group')
  const nov = dash.challenges.find((c) => c.id === 'novembro-em-loop')!
  assert(nov.adhesionPct === 62 && nov.completedPct === 41, `Novembro em Loop: 62 % took part, 41 % completed (${nov.adhesionPct}/${nov.completedPct})`)
  const fresh = dash.challenges.find((c) => c.id === id)!
  assert(fresh.adhesionPct === null && fresh.completedPct === null, 'a challenge nobody has joined yet shows nothing, not a zero someone could subtract from')
}

run().then(() => console.log(process.exitCode ? '\nFAILED' : '\ndone.'))
