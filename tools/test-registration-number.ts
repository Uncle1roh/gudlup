/* ============================================================================
   A professional registration number, and the two screens that disagreed

   WHY THIS EXISTS. `therapists.crp` is one text column written by two
   screens with different ideas of what belongs in it. The registration form
   asks for the number and the region separately — the region has its own
   column — so it writes `158342`. The credentialing screen tested the field
   against the FULL form, `CRP 06/158342`, which is what the demo fixtures
   hold. So a real clinician was told their own correct number was malformed,
   and `submit()` returns early on an invalid format: the screen whose whole
   purpose is sending a document to a reviewer could not send one.

   WHAT THIS GUARDS:

   · BOTH SHAPES READ BACK. Anything already in the column has to be
     accepted, or an existing clinician is locked out of their own
     credentialing screen. That is `looksLikeRegistration`.
   · ONE SHAPE GOES IN. Where the region is a field of its own, the full form
     would store the region twice in a column that is not where the region
     lives. That is `isBareRegistrationNumber`, and the message beside the
     field promises exactly it.
   · A REVIEW OF NOTHING IS STILL REFUSED. The point of validating at all is
     that a reviewer vouches for a licence; a name, an empty field or a
     number of implausible length is not one.
   · IT NEVER CLAIMS THE NUMBER IS REAL. Shape only. Whether the licence
     exists and belongs to this person is the document and the human
     reviewer, and nothing here may read as if the platform had checked.
   ============================================================================ */

import { looksLikeRegistration, isBareRegistrationNumber, registrationHint } from '../src/b2b/registration'

let failed = 0
let checks = 0
function assert(cond: boolean, label: string): void {
  checks++
  if (cond) console.log(`ok  : ${label}`)
  else { failed++; console.log(`FAIL  ${label}`) }
}

/* ---- what the registration form writes ---------------------------------- */

assert(looksLikeRegistration('158342'), 'the bare number is accepted on read')
assert(isBareRegistrationNumber('158342'), 'and on write')
assert(isBareRegistrationNumber('1234'), 'four digits is the shortest')
assert(isBareRegistrationNumber('123456'), 'six is the longest')
assert(isBareRegistrationNumber('  158342  '), 'surrounding space is trimmed, not refused')

/* ---- what the fixtures and older rows hold ------------------------------ */

assert(looksLikeRegistration('CRP 06/98211'), 'the full form reads back')
assert(looksLikeRegistration('CRP06/98211'), 'with or without the space')
assert(looksLikeRegistration('crp 06/98211'), 'and whatever the case')
assert(looksLikeRegistration('Ordine 12/3456'), 'the Italian register too')

/* …and the form that asks the region separately refuses it, because it
   would store the region twice. */
assert(!isBareRegistrationNumber('CRP 06/158342'), 'the full form is refused where the region is its own field')
assert(!isBareRegistrationNumber('06/158342'), 'and so is a region with a slash')

/* ---- what is a review of nothing ---------------------------------------- */

for (const bad of ['', '   ', '123', '1234567', 'Paulo Mendes', 'CRP', 'CRP 6/1', '158.342', '15-83-42', 'abc123', '0x1234']) {
  assert(!looksLikeRegistration(bad), `refused on read: ${JSON.stringify(bad)}`)
  assert(!isBareRegistrationNumber(bad), `refused on write: ${JSON.stringify(bad)}`)
}

/* ---- the hint is about the field beside it ------------------------------ */

assert(/region/i.test(registrationHint('CRP')), 'the hint sends them to the region field')
assert(/region/i.test(registrationHint('Ordine')), 'for either register')
assert(registrationHint('CRP') !== registrationHint('Ordine'), 'with its own example each')

console.log(`\n${checks} assertions, ${failed} failed`)
if (failed) process.exit(1)
