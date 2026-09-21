/* ============================================================================
   A company's therapist list, end to end

   Who an employee may book is the list their employer put together, and the
   only way onto it is an activation code the therapist redeems. This asserts
   the lifecycle against the data layer: issue, redeem, appear, remove, revoke
   — including the refusals, which are the part that matters.

       npx esbuild tools/test-company-therapists.ts --bundle --platform=node \
         --format=esm --outfile=<tmp>/ct.mjs && node <tmp>/ct.mjs
   ============================================================================ */

import { createMockProvider } from '../src/data/mock'

let pass = 0
const fails: string[] = []
function assert(cond: boolean, what: string): void {
  if (cond) { pass += 1; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

async function main() {
  const dp = createMockProvider()
  const COMPANY = 'ACME-2026'

  /* ------------------------------------------------------------ issuing */
  console.log('\n--- HR issues a code ---')
  const empty = await dp.listCompanyTherapists(COMPANY)
  assert(empty.length === 0, 'a company starts with nobody on its list')

  const code = await dp.createCompanyTherapistCode(COMPANY, 'hr@acme.demo')
  assert(code.code.length > 0, 'a code is issued')
  assert(code.companyId === COMPANY, 'against the company that asked for it')
  assert(code.createdBy === 'hr@acme.demo', 'and it records who issued it')

  const codes = await dp.listCompanyTherapistCodes(COMPANY)
  assert(codes.some((c) => c.code === code.code), 'it appears in that company’s list of codes')
  assert(!codes.find((c) => c.code === code.code)?.usedAt, 'unused until somebody uses it')

  /* ----------------------------------------------------------- refusals */
  console.log('\n--- what a bad code does ---')
  const nonsense = await dp.redeemCompanyTherapistCode('NOT-A-CODE')
  assert(!nonsense.ok && nonsense.reason === 'unknown', 'a code that does not exist is refused, by name')

  const revoked = await dp.createCompanyTherapistCode(COMPANY, 'hr@acme.demo')
  await dp.revokeCompanyTherapistCode(revoked.code)
  const afterRevoke = await dp.redeemCompanyTherapistCode(revoked.code)
  assert(!afterRevoke.ok && afterRevoke.reason === 'revoked', 'a revoked code is refused')
  const stillListed = (await dp.listCompanyTherapistCodes(COMPANY)).find((c) => c.code === revoked.code)
  assert(!!stillListed?.revokedAt, 'and stays visible as revoked rather than vanishing')

  /* ------------------------------------------------------------ joining */
  console.log('\n--- the therapist redeems it ---')
  const ok = await dp.redeemCompanyTherapistCode(code.code)
  assert(ok.ok === true, 'a good code is accepted')
  assert(ok.ok && ok.companyId === COMPANY, 'and names the company joined')

  const list = await dp.listCompanyTherapists(COMPANY)
  assert(list.length === 1, 'the therapist is now on the list')
  assert(!!list[0].name && !!list[0].crp, 'with their name and licence — the two things HR may see')
  assert(!('patients' in list[0]) && !('sessions' in list[0]), 'and nothing about patients or sessions')

  const used = (await dp.listCompanyTherapistCodes(COMPANY)).find((c) => c.code === code.code)
  assert(!!used?.usedAt && !!used?.usedByName, 'the code records who used it and when')

  console.log('\n--- redeeming twice ---')
  const again = await dp.redeemCompanyTherapistCode(code.code)
  assert(again.ok === true, 'the SAME therapist redeeming again is harmless')
  assert((await dp.listCompanyTherapists(COMPANY)).length === 1, 'and does not double them on the list')

  /* ------------------------------------------------------------ removal */
  console.log('\n--- HR removes them ---')
  await dp.removeCompanyTherapist(list[0].id, COMPANY)
  assert((await dp.listCompanyTherapists(COMPANY)).length === 0, 'they are off the list')
  const codesAfter = await dp.listCompanyTherapistCodes(COMPANY)
  assert(codesAfter.length === 2, 'the codes they used are still on record — removal is not erasure of the history')

  /* -------------------------------------------------- one company only */
  console.log('\n--- companies do not see each other ---')
  const other = await dp.listCompanyTherapists('OTHER-2026')
  assert(other.length === 0, 'another company’s list is its own')
  const otherCodes = await dp.listCompanyTherapistCodes('OTHER-2026')
  assert(otherCodes.length === 0, 'and so are its codes')

  console.log(`\n${pass} passed, ${fails.length} failed`)
  if (fails.length) { for (const f of fails) console.log('  -', f); throw new Error('company therapist tests failed') }
}

void main()
