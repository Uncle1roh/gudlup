/* ============================================================================
   A company code answers two things, and only two

   WHAT THIS IS ABOUT. The registration form used to check a typed code
   against a registry written in TypeScript — four demo tenants — so every
   company sold through the commercial console was unknown to it and the form
   told people their real code did not exist. They then registered with no
   company behind them, which is the second half of the same bug: no count
   ever appeared against the company whose code they had just typed.

   WHAT IS WORTH HOLDING STILL. The answer's SHAPE, because the person asking
   has no account yet. A name to show and whether the contract is live is
   everything the form needs; seats, contact addresses and created dates are
   not its business, and a code it does not recognise must say so without
   saying anything else. See supabase/37-a-code-can-be-looked-up.sql for why
   this is a function and not a policy on the table.
   ============================================================================ */

import { createMockProvider } from '../src/data/mock'

let failed = 0
let checks = 0
function eq(label: string, got: unknown, want: unknown): void {
  checks++
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  if (a !== b) { failed++; console.log(`FAIL  ${label}\n      got  ${a}\n      want ${b}`) }
  else console.log(`ok  : ${label}`)
}

const dp = createMockProvider()

const main = async () => {
  /* A live contract: the name is what the form prints, so the person can see
     which company they are about to be tied to. */
  eq('a live company answers with its name',
    await dp.lookupCompanyCode('AURORA-2026-Z5'), { name: 'Aurora Tech', active: true })

  /* A paused one answers too, and says it is paused. Hiding it would send
     somebody to ask HR about a code that is perfectly real. */
  eq('a paused company is named AND flagged',
    await dp.lookupCompanyCode('VALE-2026-JL'), { name: 'Vale Logística', active: false })

  /* Case and spacing are how a code arrives from an e-mail. */
  eq('lower case', await dp.lookupCompanyCode('aurora-2026-z5'), { name: 'Aurora Tech', active: true })
  eq('spaces around it', await dp.lookupCompanyCode('  AURORA-2026-Z5  '), { name: 'Aurora Tech', active: true })

  /* Nothing claims it. Null, and nothing else: no hint about what would have
     been valid, no count of what exists. */
  eq('an unknown code', await dp.lookupCompanyCode('NOPE-2026-XX'), null)
  eq('an empty code', await dp.lookupCompanyCode(''), null)

  /* THE SHAPE. Two keys. A third would be something the form does not need
     and an anonymous caller should not have. */
  const live = await dp.lookupCompanyCode('AURORA-2026-Z5')
  eq('exactly two fields come back', live ? Object.keys(live).sort() : null, ['active', 'name'])

  console.log(`\n${checks} assertions, ${failed} failed`)
  console.log(failed ? '\nFAILED' : '\ndone.')
  if (failed) process.exitCode = 1
}

void main()
