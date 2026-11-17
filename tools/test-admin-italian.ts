/* ============================================================================
   The admin console is Italian, and that has to reach the readers that are
   not React

   THE RULE. The admin console is Italian by decision: it is one team's
   working tool, and a console that switched language because the last
   surface previewed was Portuguese is a console nobody on the team can
   read. Every other surface follows the person.

   HOW IT KEPT LEAKING. `FixedLocale` pins the React CONTEXT, so everything
   reading `useI18n()` obeys — and nothing else does. `st()` (the commercial
   dictionary), `fmtDate()`, `fmtDateTime()`, `relWhen()` and the PDF
   builders ask `currentLocale()` at call time, because they run outside
   React. An operator whose own language is Portuguese therefore got an
   Italian console with Portuguese dates down it: "13 de nov., 13:33" under
   Credenziali, the same in the Registro attività. Reported twice as "mix of
   languages, mainly Portuguese and Italian mixed together".

   So `currentLocale()` honours a pin now, and src/App.tsx asserts it on
   every render from the same flag that already sets `documentElement.lang`.
   Three things are worth holding still, and the third is the one that stops
   this class of bug coming back a third time.
   ============================================================================ */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { currentLocale, pinLocale } from '../src/i18n'
import { fmtDate, fmtDateTime } from '../src/b2b/data'
import { st } from '../src/sales/i18n'

let failed = 0
let checks = 0
function eq(label: string, got: unknown, want: unknown): void {
  checks++
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  if (a !== b) { failed++; console.log(`FAIL  ${label}\n      got  ${a}\n      want ${b}`) }
  else console.log(`ok  : ${label}`)
}
function assert(cond: boolean, label: string): void {
  checks++
  if (cond) console.log(`ok  : ${label}`)
  else { failed++; console.log(`FAIL  ${label}`) }
}

/* 13 November 2026, 13:33 local — the timestamp from the report. */
const WHEN = new Date(2026, 10, 13, 13, 33).getTime()

/* ---- 1. the pin reaches the non-React readers -------------------------- */

/* Whatever the person's own language is on this machine — in node, with no
   storage, the module default. The point is that it is read from the module
   value and that releasing the pin comes back to exactly it. */
const own = currentLocale()

/* A PORTUGUESE person, which is the account the bug was reported from. */
pinLocale('pt-BR')
eq('the non-React readers follow the pin', currentLocale(), 'pt-BR')
const ptDate = fmtDateTime(WHEN)
assert(/ de /.test(ptDate), `a Portuguese account reads a Portuguese date (${ptDate})`)
eq('…and the commercial dictionary answers in Portuguese', st('Aziende'), 'Empresas')

/* The same readers, on the console. */
pinLocale('it')
eq('pinned to Italian', currentLocale(), 'it')
const itDate = fmtDateTime(WHEN)
assert(!/ de /.test(itDate), `the console reads an Italian date (${itDate})`)
assert(itDate !== ptDate, 'which is not the same string as the Portuguese one')
eq('…and st() falls back to its Italian key', st('Aziende'), 'Aziende')
assert(!/ de /.test(fmtDate(WHEN)), 'fmtDate is pinned too, not only fmtDateTime')

/* Releasing restores the person's own choice — the pin never writes to
   storage, so every other surface is untouched. */
pinLocale(null)
eq('released, back to the person', currentLocale(), own)

/* ---- 2. src/App.tsx is what asserts it -------------------------------- */

const app = readFileSync('src/App.tsx', 'utf8')
assert(/pinLocale\(pinnedIt \? 'it' : null\)/.test(app), 'App pins on the admin surface and releases everywhere else')
assert(
  !/useEffect\(\(\) => \{\s*pinLocale/.test(app),
  'and does it in the body, not in an effect — a module value re-renders nothing',
)

/* ---- 3. no admin screen reads a Portuguese dictionary ----------------- */
/* This is how the achievements page came to list «Cidade em Loop» and
   «Região em Loop» in the middle of an Italian console: it imported
   PT_GAMIFICATION and indexed it directly, so the pin could not help it.
   Anything person-facing goes through t(), which the console pins. */

const admin = readdirSync('src/admin').filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
const offenders: string[] = []
for (const f of admin) {
  const src = readFileSync(join('src/admin', f), 'utf8')
  /* `PT_SALES` is reached only through `st()`, which the pin covers, and no
     admin file imports it. Any other PT_* import is a second copy of the
     language rule in a file that cannot see the pin. */
  if (/import\s*\{[^}]*\bPT_[A-Z_]+\b[^}]*\}\s*from/.test(src)) offenders.push(f)
}
eq('no admin file imports a Portuguese dictionary', offenders, [])

console.log(`\n${checks} assertions, ${failed} failed`)
console.log(failed ? '\nFAILED' : '\ndone.')
if (failed) process.exitCode = 1
