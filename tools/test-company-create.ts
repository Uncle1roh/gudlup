/* ============================================================================
   Creating a company: the code it is given, and what it says when it fails

   Two defects, both of which looked like "I cannot create a company" and
   neither of which said anything on screen:

     · the two writes in `create()` were awaited bare, so a refusal from the
       database threw into an unhandled rejection and left the Crea button
       disabled for the rest of the session;
     · the suggested code is deterministic on the FIRST WORD of the name, so
       the second customer called "Teste …" was handed a code another company
       already held and met a disabled button under a line of small print.

     npx esbuild tools/test-company-create.ts --bundle --platform=node \
       --format=cjs --define:import.meta.env={} --outfile=<tmp>/cc.cjs \
       && node <tmp>/cc.cjs
   ============================================================================ */

import { explainWriteError } from '../src/admin/writeError'
import { generateCompanyCode, looksLikeCompanyCode, normalizeCode } from '../src/data/convention'

let pass = 0
const fails: string[] = []
function assert(cond: boolean, what: string): void {
  if (cond) { pass += 1; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

/* ------------------------------------------------- the code it is given --- */
console.log('\n--- two customers whose names start with the same word ---')
const year = 2026
/** What the form does: walk the rotation until the code is free. */
function suggest(name: string, taken: Set<string>): string {
  for (let rotation = 0; rotation < 40; rotation++) {
    const minted = generateCompanyCode(name, year, rotation)
    if (!taken.has(minted)) return minted
  }
  return generateCompanyCode(name, year)
}
const first = suggest('Teste Brasil Ltda', new Set())
const second = suggest('Teste Outro SA', new Set([first]))
assert(first === generateCompanyCode('Teste Brasil Ltda', year, 0), 'the first customer gets the plain mint')
assert(second !== first, 'the second is not handed a code the first already holds')
assert(looksLikeCompanyCode(second), '…and the rotated code is still a well-formed one')
assert(second.startsWith('TESTE-2026-'), '…still named after the company, still this year')
const third = suggest('Teste Terzo', new Set([first, second]))
assert(third !== first && third !== second, 'and a third is free of both')
assert(new Set([first, second, third]).size === 3, 'three customers, three codes')
assert(suggest('Teste Brasil Ltda', new Set()) === first, 'the mint is still deterministic when nothing is taken')
assert(normalizeCode(' teste-2026-rk ') === 'TESTE-2026-RK', 'a code typed by hand is still normalised')

/* ----------------------------------------------- what it says when it fails --- */
console.log('\n--- the three refusals that actually happen ---')
const rls = explainWriteError({ code: '42501', message: 'new row violates row-level security policy for table "companies"' })
assert(/permesso|permiss/i.test(rls), 'row-level security is reported as a permission, not as a policy name')
assert(/admin|sales/.test(rls), '…and names the roles that may write')
const byMessage = explainWriteError({ message: 'new row violates row-level security policy' })
assert(byMessage === rls, 'the same answer without the code: PostgREST does not always send one')

const missing = explainWriteError({ code: 'PGRST204', message: "Could not find the 'contact_email' column of 'companies' in the schema cache" })
assert(/migrazione|migra/i.test(missing), 'a missing column is reported as a migration that was not run')
assert(missing.includes('contact_email'), '…and still carries the column the database named')

const dup = explainWriteError({ code: '23505', message: 'duplicate key value violates unique constraint "companies_pkey"' })
assert(/codice|c\u00f3digo/i.test(dup), 'a duplicate id is reported as the code being taken')

console.log('\n--- and anything else ---')
const odd = explainWriteError({ message: 'TypeError: Failed to fetch' })
assert(odd.includes('Failed to fetch'), 'an unknown failure is passed through rather than swallowed')
const empty = explainWriteError({})
assert(!!empty.trim(), 'a refusal with no message still says something')
assert(!!explainWriteError(null).trim(), '…and so does no error at all')

console.log(`\n${pass} ok, ${fails.length} failed`)
if (fails.length) { for (const f of fails) console.log('  -', f); process.exit(1) }
