/* Benefits in the demo provider, held to what supabase/tests/benefits_redeem.sql
   proves of the database: availability (company filter included), the order
   of refusals, codes handed out once, the ledger debit, the refund.

   Run: npm test -- gam-benefits                                              */

import { MockLedger } from '../src/gamification/mockLedger'
import { MockBenefits } from '../src/gamification/mockBenefits'
import { DEFAULT_ECONOMY } from '../src/gamification/economy'
import { DEMO_BENEFITS, TAG_SEED } from '../src/gamification/benefitsDemo'
import { PILLARS, PILLAR_MAX, RedeemError, byPillar, isAvailable, missingLoops, standardSessionsFor, type Benefit } from '../src/gamification/benefits'

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else console.log(`ok  : ${msg}`)
}
function refusal(fn: () => unknown): string {
  try { fn(); return 'ok' } catch (e) { return e instanceof RedeemError ? e.refusal : String(e) }
}

const NOW = Date.parse('2026-10-20T15:00:00Z')

/* A person with 100 Loops. */
function person(): { ledger: MockLedger; b: MockBenefits } {
  const ledger = new MockLedger()
  for (let i = 0; i < 5; i++) {
    const at = NOW - (5 - i) * 86_400_000
    ledger.creditSession({ id: `s${i}`, protocolCode: 'X', duration: 24, startedAt: at - 1_440_000, completedAt: at, completed: true, listenedSec: 1440 }, at)
  }
  return { ledger, b: new MockBenefits(ledger) }
}

/* ---- the catalogue ---------------------------------------------------- */
assert(DEMO_BENEFITS.length >= 15, `about fifteen demo benefits (${DEMO_BENEFITS.length})`)
assert(PILLARS.every((p) => DEMO_BENEFITS.some((b) => b.pillar === p.id)), 'every pillar has at least one demo benefit')
assert(DEMO_BENEFITS.every((b) => b.tagIds.length >= 1), 'every Good Loop demo benefit has a tag (§6.4)')
assert(DEMO_BENEFITS.every((b) => b.partnerName === '[PARCEIRO]'), 'partners are [PARCEIRO] placeholders')
assert(TAG_SEED.filter((t) => t.group === 'partner_segment').length === 10 && TAG_SEED.filter((t) => t.group === 'benefit_type').length === 5, 'the seed tags of §6.4')

/* ---- availability (mirrors gam_benefit_available) ------------------------ */
{
  const food = DEMO_BENEFITS.find((b) => b.tagIds.includes('tag-alimentos_bebidas'))!
  const own: Benefit = { ...food, id: 'own', companyId: 'aurora', tagIds: [] }
  const base = { now: NOW, disabledTagIds: new Set(['tag-alimentos_bebidas']), earned: new Set<string>() }
  assert(isAvailable(food, { ...base, company: null }), 'no company: every public benefit')
  assert(!isAvailable(food, { ...base, company: { id: 'aurora', allowsTagFilter: true, allowsCompanyBenefits: true } }), 'Aurora disabled the tag: hidden for its people')
  assert(isAvailable(food, { ...base, company: { id: 'aurora', allowsTagFilter: false, allowsCompanyBenefits: true } }), 'a plan without the tag filter cannot hide anything')
  assert(isAvailable(own, { ...base, company: { id: 'aurora', allowsTagFilter: true, allowsCompanyBenefits: true } }), 'Aurora’s own benefit reaches Aurora')
  assert(!isAvailable(own, { ...base, company: null }) && !isAvailable(own, { ...base, company: { id: 'other', allowsTagFilter: true, allowsCompanyBenefits: true } }), '…and nobody else')
  const exclusive = DEMO_BENEFITS.find((b) => b.challengeExclusiveId)!
  assert(!isAvailable(exclusive, { ...base, company: null }), 'a challenge-exclusive benefit is hidden until earned')
  assert(isAvailable(exclusive, { ...base, company: null, earned: new Set([exclusive.id]) }), '…and appears once earned')
  assert(!isAvailable({ ...food, status: 'paused' }, { ...base, company: null }), 'paused is unavailable')
  assert(!isAvailable({ ...food, validTo: NOW - 1 }, { ...base, company: null }), 'past its date is unavailable')
}

/* ---- redemption --------------------------------------------------------- */
{
  const { ledger, b } = person()
  const before = ledger.balanceCenti()
  assert(before >= 10000, `the test person has ${Math.floor(before / 100)} Loops`)

  const r = b.redeem('mente1', false, NOW)
  assert(r.code === 'DIARIO-7KQ2', `code pool: the first code (${r.code})`)
  assert(ledger.balanceCenti() === before - 5000, 'the price is debited once')
  assert(ledger.loopsEntries().some((e) => e.entryType === 'redemption' && e.amountCenti === -5000), '…as a redemption entry')
  assert(refusal(() => b.redeem('mente1', false, NOW)) === 'BENEFIT_LIMIT', 'once per person')

  const dear = b.catalog.find((x) => x.id === 'pausa2')!
  dear.priceLoopsCenti = ledger.balanceCenti() + 100
  const bal = ledger.balanceCenti()
  assert(refusal(() => b.redeem('pausa2', false, NOW)) === 'BENEFIT_BALANCE', 'never beyond the balance')
  assert(ledger.balanceCenti() === bal, '…and a refusal moves nothing')

  const id = b.catalog.find((x) => x.id === 'corpo1')!
  id.deliveryType = 'identified'
  id.priceLoopsCenti = 1000
  assert(refusal(() => b.redeem('corpo1', false, NOW)) === 'BENEFIT_NEEDS_CONSENT', 'identified: only with consent')
  assert(refusal(() => b.redeem('corpo1', true, NOW)) === 'ok', '…and with it')

  const last = b.catalog.find((x) => x.id === 'mov1')!
  last.stockTotal = 1; last.stockRemaining = 0
  assert(refusal(() => b.redeem('mov1', false, NOW)) === 'BENEFIT_STOCK', 'nothing left: refused')
  assert(b.available(NOW).find((x) => x.id === 'mov1')?.inStock === false, '…and shown as not available, with no figure')
  assert(!Object.keys(b.available(NOW)[0]).some((k) => /stock/i.test(k) && k !== 'inStock'), 'the tab never receives a stock count')

  assert(refusal(() => b.redeem('corpo3', false, NOW)) === 'BENEFIT_UNAVAILABLE', 'a challenge prize cannot be redeemed without the challenge')

  const mine = b.mine()
  const red = mine.find((m) => m.benefitId === 'mente1')!
  b.refund(red.id, NOW)
  b.refund(red.id, NOW)
  assert(ledger.loopsEntries().filter((e) => e.entryType === 'redemption_refund').length === 1, 'refund: once')
  assert(b.mine().find((m) => m.id === red.id)?.status === 'refunded' && b.mine().find((m) => m.id === red.id)?.code === 'DIARIO-7KQ2', '…the redemption stays, marked returned, its code kept')
  assert(refusal(() => b.redeem('mente1', false, NOW)) === 'ok', 'after a refund the benefit can be redeemed again')
  assert(b.mine().find((m) => m.benefitId === 'mente1' && m.status === 'active')?.code === 'DIARIO-P3LM', '…with a NEW code: a code once shown is never handed out again')

  assert(b.uploadCodes('mente1', ['DIARIO-7KQ2', 'NEW-1', 'NEW-1', '  ']) === 1, 'code upload skips duplicates, blanks and codes already used')
}

/* ---- the tab's arithmetic ----------------------------------------------- */
assert(missingLoops(5000, 3800) === 12 && missingLoops(5000, 6000) === 0, '"Faltam 12 Loops"')
assert(standardSessionsFor(1200, DEFAULT_ECONOMY, null) === 6, 'a Standard session earns 2.2 Loops: 12 Loops ≈ 6 sessions')
assert(standardSessionsFor(1200, DEFAULT_ECONOMY, 1.5) === 4, 'at 1.5× it earns 3.3: ≈ 4 sessions')
assert(standardSessionsFor(0, DEFAULT_ECONOMY, null) === 0, 'nothing missing, no sessions')
{
  const { b } = person()
  const many = Array.from({ length: 9 }, (_, i) => ({ ...b.available(NOW)[0], id: `x${i}`, pillar: 'sono' as const }))
  assert(byPillar(many).get('sono')!.length === PILLAR_MAX, `at most ${PILLAR_MAX} per pillar — no infinite list`)
}

console.log(process.exitCode ? '\nFAILED' : '\ndone.')
