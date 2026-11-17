/* ============================================================================
   What the door says when it refuses

   Supabase Auth answers in English, in sentences written for a developer
   reading a console. The door printed them as they came, so somebody
   registering an address they already had was told "User already
   registered" in the middle of a Portuguese form — reported as "the error
   message was never translated".

   Two things are worth holding still. Every refusal a person can REACH maps
   to a key the dictionaries carry; and everything else passes through
   UNCHANGED, because a message nobody wrote for a human still beats a
   shrug, and inventing a friendly sentence for a failure we have not
   understood is how a real cause gets buried.
   ============================================================================ */

import { authErrorKey } from '../src/auth/authError'
import { IT_SELF_USE } from '../src/i18n/it-selfuse'
import { PT } from '../src/i18n/pt'

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

const TAKEN = 'This address already has an account. Sign in instead, or ask for a new password if you have forgotten it.'

/* ---- the refusals, as Supabase actually phrases them ------------------- */

eq('the reported one, by message', authErrorKey({ message: 'User already registered' }), TAKEN)
eq('…and by code', authErrorKey({ code: 'user_already_exists', message: 'whatever' }), TAKEN)
eq('wrong password', authErrorKey({ message: 'Invalid login credentials' }),
  'That email and password do not match an account.')
eq('unconfirmed', authErrorKey({ message: 'Email not confirmed' }),
  'This account still has to be confirmed. Open the link in the email we sent you.')
eq('short password', authErrorKey({ message: 'Password should be at least 6 characters' }),
  'That password is too short.')
eq('rate limited by message', authErrorKey({ message: 'For security purposes, you can only request this after 46 seconds' }),
  'Too many attempts just now. Wait a minute and try again.')
eq('…and by status', authErrorKey({ status: 429, message: 'nope' }),
  'Too many attempts just now. Wait a minute and try again.')
eq('offline', authErrorKey({ name: 'TypeError', message: 'Failed to fetch' }),
  'We could not reach goodloop. Check your connection and try again.')

/* Wrong address and wrong password answer the SAME, on purpose: the
   difference between them is what tells a stranger an address exists. */
eq('a refusal to sign in does not say which half was wrong',
  authErrorKey({ message: 'Invalid login credentials' }),
  authErrorKey({ code: 'invalid_credentials', message: 'Invalid login credentials' }))

/* ---- and anything else survives intact -------------------------------- */

eq('an unknown failure is passed through, not dressed up',
  authErrorKey({ message: 'Database error saving new user' }),
  'Database error saving new user')
eq('…even with no message at all', authErrorKey({}), '[object Object]')

/* ---- every key we DO map has both languages --------------------------- */

const mapped = [
  TAKEN,
  'That email and password do not match an account.',
  'This account still has to be confirmed. Open the link in the email we sent you.',
  'That password is too short.',
  'Too many attempts just now. Wait a minute and try again.',
  'We could not reach goodloop. Check your connection and try again.',
]
for (const k of mapped) {
  assert(!!IT_SELF_USE[k], `Italian: ${k.slice(0, 38)}…`)
  assert(!!PT[k], `Portuguese: ${k.slice(0, 38)}…`)
}

console.log(`\n${checks} assertions, ${failed} failed`)
console.log(failed ? '\nFAILED' : '\ndone.')
if (failed) process.exitCode = 1
