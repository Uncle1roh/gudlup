/* ============================================================================
   How the app says hello

   Two things were wrong with it at once, and both are the kind that only show
   up in front of a real person:

     · it said "good morning" at one in the morning — which is precisely the
       hour somebody reaches for a sleep session, so not a rare edge;
     · it greeted people by their e-mail address. Not by accident: the sign-up
       form marks the name field optional, and an account created without one
       is written with the address's local part in `profiles.name`. The
       greeting read that field and printed what it found.

   Run: npx esbuild tools/test-greeting.ts --bundle --platform=node \
          --format=cjs --define:import.meta.env={} --outfile=x.cjs && node x.cjs
   ============================================================================ */

import { greeting, displayName, accountName } from '../src/selfuse/greeting'

let pass = 0
const fails: string[] = []
function assert(ok: boolean, what: string) {
  if (ok) { pass++; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

const at = (h: number) => new Date(2026, 9, 23, h, 30)

console.log('--- the hour of the day ---')
{
  assert(greeting(at(1)) === 'Good evening', 'one in the morning is the evening that has not ended')
  assert(greeting(at(4)) === 'Good evening', 'and so is four')
  assert(greeting(at(5)) === 'Good morning', 'five is where the morning starts')
  assert(greeting(at(11)) === 'Good morning', 'eleven is still morning')
  assert(greeting(at(12)) === 'Good afternoon', 'noon is the afternoon')
  assert(greeting(at(17)) === 'Good afternoon', 'five in the afternoon is still the afternoon')
  assert(greeting(at(18)) === 'Good evening', 'six is the evening')
  assert(greeting(at(23)) === 'Good evening', 'and so is eleven at night')
}

console.log('')
console.log('--- the name, when somebody wrote one ---')
{
  assert(displayName('l.pinto2026@acme.com', 'Lucas Pinto') === 'Lucas', 'the written name wins over the address')
  assert(displayName(null, 'Giulia Marchetti') === 'Giulia', 'the first name of it, not the whole thing')
  assert(displayName(null, 'ana') === 'Ana', 'a lowercase name is capitalised')
}

console.log('')
console.log('--- the name, when the profile holds an address ---')
{
  /* This is the common case, not the exception: sign up without filling the
     optional name field and `profiles.name` is the address's local part. */
  assert(displayName('lucas.pinto@gmail.com', 'lucas.pinto') === 'Lucas',
    'a profile that is really an address is read as one, not printed')
  assert(displayName(null, 'natalya.pinto@gmail.com') === 'Natalya',
    'even a whole address in the name field')
  assert(displayName('sofia.marchetti@acme.com') === 'Sofia', 'and the address alone still works')
  assert(displayName('maria_silva@acme.com') === 'Maria', 'underscores separate too')
}

console.log('')
console.log('--- rather say nothing than say the wrong thing ---')
{
  assert(displayName(null, null) === null, 'nothing to go on: the greeting stands alone')
  assert(displayName('info@acme.com') === null, 'a role account is not a person')
  assert(displayName(null, 'support') === null, 'in the profile field either')
  assert(displayName('2026@acme.com') === null, 'digits are not a name')
  assert(displayName('a@acme.com') === null, 'one letter is not a name')
  assert(displayName(null, '   ') === null, 'whitespace is not a name')
}

console.log('')
console.log('--- a document header must print something ---')
{
  assert(accountName('lucas.pinto@gmail.com', 'Lucas Pinto') === 'Lucas Pinto',
    'the full written name, not just the first — a report is not a hello')
  assert(accountName('lucas.pinto@gmail.com', 'lucas.pinto') === 'Lucas',
    'an address in the name field is not printed as a header')
  assert(accountName('info@acme.com') === 'info', 'a role account still heads its own report')
  assert(accountName(null, null) === 'Utente', 'and a blank one gets a neutral word, never an empty header')
}

console.log(`\n${pass} assertions passed.`)
if (fails.length) { console.log(`${fails.length} FAILED:`); for (const f of fails) console.log('  -', f); process.exit(1) }
