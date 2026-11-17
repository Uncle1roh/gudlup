/* ============================================================================
   An invitation link carries the code and the address — and nothing else

   WHY THIS EXISTS. The two things somebody being invited has to get exactly
   right are the company code and the approved address, and they had to type
   both from an e-mail onto a home page. The link now carries them.

   WHAT THIS GUARDS, in order of how much it would cost to get wrong:

   · THE LINK GRANTS NOTHING. It fills two fields. Everything that decides
     whether the account may exist happens elsewhere — the password is set on
     the form, the address is checked against the company's own roster by a
     trigger inside the database, the code has to resolve to a live contract.
     So the only thing this file can assert about safety is the shape: no
     token, no role, no id, nothing but a code, an address and which door.
   · THE PARAMETERS STAY OUT OF THE HASH. The app routes on
     `window.location.hash`, compared whole (`route === '#admin'`), so a hash
     of `#entrar?code=X` matches no route at all. The query belongs before
     the hash, and the hash has to come out of the builder untouched.
   · A MANGLED LINK STILL OPENS A FORM. Every part is validated and a bad
     part is dropped, never thrown — an invitation that half-survived a mail
     client must leave somebody a form they can fill in by hand.
   ============================================================================ */

import { inviteUrl, readInvite, clearInvite } from '../src/auth/invite'

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

/* ---- a browser, roughly ------------------------------------------------- */

const loc = { origin: 'https://app.goodloop.test', pathname: '/', search: '', hash: '#entrar' }
let replaced: string | null = null
;(globalThis as Record<string, unknown>).window = {
  location: loc,
  history: { replaceState: (_s: unknown, _t: string, url: string) => { replaced = url } },
}

/** Point the fake browser at a URL the way a mail client would. */
function visit(url: string): void {
  const u = new URL(url)
  loc.origin = u.origin
  loc.pathname = u.pathname
  loc.search = u.search
  loc.hash = u.hash
}

/* ---- the round trip ---------------------------------------------------- */

const employee = inviteUrl({ code: 'looney-2026-br', email: ' Mattia.Volpe@Gmail.com ' })
eq('the code is normalised and the address lower-cased and trimmed',
  employee,
  'https://app.goodloop.test/?code=LOONEY-2026-BR&email=mattia.volpe%40gmail.com#entrar')
assert(employee.indexOf('?') < employee.indexOf('#'), 'the query comes BEFORE the hash')
eq('and the hash is the route, untouched', new URL(employee).hash, '#entrar')

visit(employee)
eq('read back', readInvite(), { code: 'LOONEY-2026-BR', email: 'mattia.volpe@gmail.com', kind: 'b2c_user' })

const hr = inviteUrl({ code: 'LOONEY-2026-BR', email: 'rh@looney.test', kind: 'company' })
visit(hr)
eq('the company door is asked for explicitly', readInvite()?.kind, 'company')

/* Nothing but those three things. A link that could carry a role, a token or
   an id would be a link that grants something. */
visit(employee)
eq('the parameters are exactly these', [...new URL(employee).searchParams.keys()].sort(), ['code', 'email'])
eq('…and these, for HR', [...new URL(hr).searchParams.keys()].sort(), ['code', 'email', 'for'])

/* ---- a link that half-survived ---------------------------------------- */

visit('https://app.goodloop.test/?code=NOT+A+CODE&email=not-an-address#entrar')
eq('both parts bad: nothing to apply', readInvite(), null)

visit('https://app.goodloop.test/?code=LOONEY-2026-BR&email=not-an-address#entrar')
eq('a bad address is dropped, the good code kept',
  readInvite(), { code: 'LOONEY-2026-BR', email: null, kind: 'b2c_user' })

visit('https://app.goodloop.test/?email=a@b.co#entrar')
eq('an address with no code is still worth filling in',
  readInvite(), { code: null, email: 'a@b.co', kind: 'b2c_user' })

visit('https://app.goodloop.test/#entrar')
eq('no query, no invitation', readInvite(), null)

/* An address must not be mistaken for a code or the other way round. */
visit('https://app.goodloop.test/?code=a@b.co&email=LOONEY-2026-BR#entrar')
eq('each part is validated as what it claims to be', readInvite(), null)

/* ---- clearing it ------------------------------------------------------- */

visit(employee)
clearInvite()
eq('the address comes out of the URL and the route stays',
  replaced, 'https://app.goodloop.test/#entrar')

/* ---- the form consumes it --------------------------------------------- */
/* Read from source: the effect is what makes the link do anything, and it
   must stay on the PUBLIC door only — the other four surfaces are
   provisioned by hand and have no sign-up to open. */
import { readFileSync } from 'node:fs'
const door = readFileSync('src/auth/AuthScreen.tsx', 'utf8')
assert(/const invite = readInvite\(\)/.test(door), 'the door reads the invitation')
assert(/if \(mode !== 'b2c'\) return\s*\n\s*const invite = readInvite\(\)/.test(door), '…on the public door only')
assert(/setSignup\(true\)/.test(door), 'it opens the sign-up form')
assert(/setCompanyCode\(invite\.code\)/.test(door), 'it fills the code')
assert(/setEmail\(invite\.email\)/.test(door), 'it fills the address')
assert(/clearInvite\(\)/.test(door), 'and takes the parameters out of the URL')

console.log(`\n${checks} assertions, ${failed} failed`)
console.log(failed ? '\nFAILED' : '\ndone.')
if (failed) process.exitCode = 1
