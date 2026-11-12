/* ============================================================================
   A library shelf reads in the reader's language

   A shelf's title is written once, by an analyst, in a console pinned to
   Italian — and then read by people in Italian and in Portuguese. The product
   dictionaries key off the ENGLISH source string, so for a while the editor
   showed the Italian translation in the title field and wrote back whatever
   the field held: the first edit of a built-in shelf turned the key
   `Six minutes` into the prose `Sei minuti`, and the Portuguese app, having
   no such key, printed Italian to a Brazilian reader.

   `tc()` / `translateContent()` is the lookup that survives that: the string
   as a key, or else the string as some locale's translation resolved back to
   its key, or else the string exactly as typed.

     npx esbuild tools/test-rail-language.ts --bundle --platform=node \
       --format=cjs --define:import.meta.env={} --outfile=<tmp>/rl.cjs \
       && node <tmp>/rl.cjs
   ============================================================================ */

import { contentKey, translateContent } from '../src/i18n'
import { defaultRails, railsFromDefaults, resolveRails } from '../src/data/rails'
import type { ResolvedSession } from '../src/data/liveCatalog'

let pass = 0
const fails: string[] = []
function assert(cond: boolean, what: string): void {
  if (cond) { pass += 1; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

/* ------------------------------------------------- the string as a key --- */
console.log('\n--- an untouched default is still a key ---')
assert(translateContent('pt-BR', 'Six minutes') === 'Seis minutos', 'Six minutes reads as Seis minutos')
assert(translateContent('it', 'Six minutes') === 'Sei minuti', '…and as Sei minuti')
assert(
  translateContent('pt-BR', 'When that is all you have') === 'Quando é todo o tempo que você tem',
  'the subtitle too',
)

/* ---------------------------------------- the string as a translation --- */
console.log('\n--- Italian typed in the console still reaches Portuguese ---')
assert(translateContent('pt-BR', 'Sei minuti') === 'Seis minutos', 'Sei minuti → Seis minutos')
assert(translateContent('it', 'Sei minuti') === 'Sei minuti', '…and stays itself in Italian')
/* `Concentrazione` is already a KEY in the Portuguese dictionary -- the
   shelves in `data/library.ts` were authored in Italian and translated that
   way long before this. The string as a key is tried first, so that entry
   wins over the reverse pass, which is the right order: a translation
   someone wrote on purpose beats one inferred from a match. */
assert(translateContent('pt-BR', 'Concentrazione') === 'Concentração', 'Concentrazione → Concentração (its own entry)')
assert(translateContent('pt-BR', 'Focus') === 'Foco', 'and the English key still reads Foco')
assert(translateContent('pt-BR', 'Nuovo in libreria') === 'Novo na biblioteca', 'Nuovo in libreria → Novo na biblioteca')
assert(translateContent('pt-BR', 'Equilibrio') === 'Equilíbrio', 'Equilibrio → Equilíbrio')
assert(translateContent('pt-BR', ' Sei minuti ') === 'Seis minutos', 'and padding does not hide the match')

/* -------------------------------------------- a name nobody wrote for --- */
console.log('\n--- a name of the operator’s own is left alone ---')
const own = 'Promo Carnevale 2027'
assert(translateContent('pt-BR', own) === own, 'an unknown title is shown as typed')
assert(translateContent('it', own) === own, '…in every language')
assert(contentKey(own) === null, 'and the console is told there is no translation')
assert(contentKey('Sei minuti') === 'Six minutes', 'while a known one names its key')
assert(contentKey('Six minutes') === 'Six minutes', 'a key is its own key')
assert(contentKey('   ') === null, 'blank is not a key')
assert(translateContent('pt-BR', '') === '', 'and empty text comes back empty')

/* ------------------------------------------- what the editor opens on --- */
console.log('\n--- the editor starts from English keys, not from Italian ---')
const sessions = [
  { slug: 'a', name: 'Breathe', theme: 'calm', durations: [6, 12], fromCatalog: false },
  { slug: 'b', name: 'Sharpen', theme: 'focus', durations: [12], fromCatalog: true },
] as unknown as ResolvedSession[]
const rows = railsFromDefaults(sessions)
const quick = rows.find((r) => r.id === 'quick')
assert(!!quick && quick.title === 'Six minutes', 'the six-minute shelf is stored under its English key')
assert(rows.every((r) => contentKey(r.title) !== null), 'every default shelf has a translation in both languages')
assert(
  defaultRails(sessions).some((r) => r.id === 'calm' && r.title === 'Calm'),
  'a theme shelf is stored under the theme’s English label',
)
assert(resolveRails(rows, sessions).length === rows.length, 'and they resolve back to the same shelves')

console.log(`\n${pass} ok, ${fails.length} failed`)
if (fails.length) { for (const f of fails) console.log('  -', f); process.exit(1) }
