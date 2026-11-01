/* ============================================================================
   The demo's people do not follow anybody home

   A fixture that claims a RELATIONSHIP — a company, a therapist, that
   therapist's plan — is off unless a deployment asks for it with
   VITE_DEMO_FIXTURES=1. That switch governs what the data layer hands out,
   and it arrived after people had already signed in to builds where the
   fixtures were on.

   Those builds wrote the fixtures into the browser, and local state outlives
   the deployment that wrote it. An account with no company at all opened the
   Therapy tab and met Dr. Ana Silva, with her sessions, her plan and a next
   appointment on Wednesday — all of it fiction, none of it removable by the
   person reading it. The cleanup that existed deliberately protected a link
   IN USE, so that somebody mid-treatment whose company lapses does not lose
   their therapist, and a seeded link is full of sessions and prescriptions:
   it looked exactly like one.

   The test is not how full the link is. It is whether the person on the card
   exists. That is what this suite pins.

   Run: npx esbuild tools/test-fixtures.ts --bundle --platform=node \
          --format=cjs --define:import.meta.env={} --outfile=x.cjs && node x.cjs
   ============================================================================ */

import { demoFixturesOn } from '../src/app/environment'
import { isDemoTenantCode, DEMO_TENANT_CODE } from '../src/data/convention'
import {
  DEMO_THERAPISTS,
  isFixtureTherapist,
  seedLink,
  withoutFixtures,
  type TherapyState,
} from '../src/selfuse/therapyStore'

let pass = 0
const fails: string[] = []
function assert(ok: boolean, what: string) {
  if (ok) { pass++; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

/* ---- the switch itself --------------------------------------------------

   Built with `import.meta.env` defined as `{}`, which is a deployment that
   set nothing. The answer has to be NO: a flag that fails open is a flag
   that was never a flag. */
console.log('--- the switch ---')
assert(demoFixturesOn() === false, 'a deployment that sets nothing shows no fixtures')

/* ---- who is fictional --------------------------------------------------- */
console.log('\n--- the demo’s people ---')
for (const d of DEMO_THERAPISTS) {
  assert(isFixtureTherapist(d), `${d.name} is one of them, by id`)
  assert(isFixtureTherapist({ name: d.name }), `…and by name alone, which is all a stored request carries`)
}
/* The booking directory invented two more, and they were never switched off
   with the rest: a company code left behind in a browser was enough to put
   them on screen, bookable, to somebody with no plan. */
assert(isFixtureTherapist({ id: 'th-demo' }), 'Dra. Ana Fontes, from the booking directory')
assert(isFixtureTherapist({ id: 'th-demo-2' }), 'Dr. Rafael Lima, the same')
assert(!isFixtureTherapist({ id: 'c0ffee', name: 'Dra. Marta Nogueira' }), 'a real professional is not swept')
assert(!isFixtureTherapist(null) && !isFixtureTherapist(undefined), 'nothing is not somebody')

/* ---- the sweep ---------------------------------------------------------- */
console.log('\n--- what is left of a stored link ---')
{
  const seeded: TherapyState = { link: seedLink(DEMO_THERAPISTS[0]), request: null }
  assert(seeded.link!.sessions.length > 0 && seeded.link!.prescriptions.length > 0,
    'the seeded link is full — which is exactly why the old rule kept it')
  const swept = withoutFixtures(seeded)
  assert(swept.link === null, 'and it goes anyway: the test is the person, not the contents')
}
{
  const real: TherapyState = {
    link: {
      ...seedLink(DEMO_THERAPISTS[0]),
      therapist: { ...DEMO_THERAPISTS[0], id: 'real-1', name: 'Dra. Marta Nogueira' },
    },
    request: null,
  }
  assert(withoutFixtures(real) === real,
    'a real link is returned unchanged — the same object, so a load writes nothing')
}
{
  const pending: TherapyState = {
    link: null,
    request: { therapistId: 'th-silva', therapistName: 'Dr. Ana Silva', therapistRole: 'x', slotMs: Date.now(), requestedAt: Date.now() },
  }
  assert(withoutFixtures(pending).request === null, 'a pending booking with one of them goes too')
}
{
  const empty: TherapyState = { link: null, request: null }
  assert(withoutFixtures(empty) === empty, 'nothing stored, nothing written')
}

/* ---- the demo tenant's code --------------------------------------------- */
console.log('\n--- the company code the old build handed to everybody ---')
assert(isDemoTenantCode(DEMO_TENANT_CODE), 'the demo tenant’s own code')
assert(isDemoTenantCode(' demo-2026-gl '), '…however it was cased or spaced')
assert(!isDemoTenantCode('ACME-2026'), 'a real convention is not the demo')
assert(!isDemoTenantCode(null) && !isDemoTenantCode(''), 'no code is not the demo code')

console.log(`\n${pass + fails.length} checks, ${fails.length} failed`)
if (fails.length) { for (const f of fails) console.log('  ·', f) }
process.exit(fails.length ? 1 : 0)
