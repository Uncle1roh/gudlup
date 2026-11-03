/* The demo world — one cast, one month, and OFF unless a demo is running.

   Two things this guards, and the first one is the important one:

   1. SAFETY. The demo's company, therapist and plan are fixtures that claim
      a RELATIONSHIP the signed-in person does not have. They are now on
      whenever `previewing()` is true (POs, 2026-11-03: the commercial team
      needs them without a deployment of their own), which puts the whole
      weight on that flag being false everywhere else. A fixture a real
      person can meet is not a fixture, it is a defect.

   2. COHERENCE. The person's device, the Loops ledger and the clinician's
      record used to be three separate inventions, and they disagreed on
      screen: 542 Loops, 78 minutes and an empty month, in one profile. They
      are one list now, and this fails if they drift apart again.

   Run: npm test -- demo-world                                               */

import { previewing, demoCompanyName, DEMO_COMPANY_FALLBACK } from '../src/demo/flag'
import {
  DEMO_SESSIONS, DEMO_PERSON, DEMO_CLINICIAN, DEMO_HR, demoLogs, demoProfile,
  demoAcceptedDocs, demoSessionStart, demoListenedSec, demoCompany,
} from '../src/demo/world'
import { demoFixturesOn } from '../src/app/environment'
import { SEED_HISTORY } from '../src/data/seed'
import { DEMO_THERAPIST, DEMO_PATIENTS } from '../src/b2b/data'
import { SELF_USE_SESSIONS } from '../src/data/selfuse'
import { CONTRACT_MULTIPLIERS } from '../src/gamification/economy'

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else console.log(`ok  : ${msg}`)
}

/* ---- 1. off unless a demo is being given ------------------------------- */
/* There is no sessionStorage in node, so `previewing()` takes its own
   catch — which is exactly the state every server render and every build
   script is in. */
assert(previewing() === false, 'outside a browser nobody is previewing')
assert(demoFixturesOn() === false, 'and the relationship fixtures are therefore OFF')
assert(demoCompanyName() === DEMO_COMPANY_FALLBACK, 'the company name falls back rather than reading a stranger')

/* ---- 2. one cast ------------------------------------------------------- */
assert(DEMO_THERAPIST.name === DEMO_CLINICIAN.name, 'the clinician in the B2B fixtures is the demo world’s clinician')
assert(DEMO_THERAPIST.crp === DEMO_CLINICIAN.registration, '…with her own registration, not a second one')
assert(DEMO_PATIENTS.some((p) => p.id === DEMO_PERSON.patientId && p.name === DEMO_PERSON.name),
  'the patient in the clinician’s roster is the person in the app')
assert(DEMO_HR.email !== DEMO_PERSON.email, 'the company’s admin is not the employee')
assert(demoProfile('person').name === DEMO_PERSON.name, 'the app door is the person')
assert(demoProfile('therapist').name === DEMO_CLINICIAN.name, 'the workspace door is the clinician')
assert(demoProfile('company').name === DEMO_HR.name, 'the dashboard door is HR')

/* ---- 3. each door has accepted what that surface asks for -------------- */
assert(demoAcceptedDocs('person').includes('terms'), 'the person has accepted the Terms')
assert(demoAcceptedDocs('therapist').includes('professional'), 'the clinician has accepted the Professional Terms')
assert(demoAcceptedDocs('company').includes('D-09'), 'the sponsor admin has acknowledged D-09')
assert(!demoAcceptedDocs('person').includes('professional'), '…and the person has not: the gates are still gates')
assert(!demoAcceptedDocs('person').includes('D-09'), '…nor D-09')

/* ---- 4. one month, read the same way by everything --------------------- */
const finished = DEMO_SESSIONS.filter(([, , , done]) => done)
const minutes = finished.reduce((a, [, , m]) => a + m, 0)
const logs = demoLogs()
assert(logs.length === finished.length, `the device logs the finished sessions and only those (${logs.length} of ${DEMO_SESSIONS.length})`)
assert(logs.reduce((a, l) => a + l.duration, 0) === minutes, `the minutes on the device are the minutes in the list (${minutes})`)
assert(SEED_HISTORY.length === finished.length, 'the server-side history is the same sessions')
assert(
  SEED_HISTORY.every((r, i) => r.startedAt === demoSessionStart(finished[i]) && r.duration === finished[i][2]),
  'each server record is the same session at the same minute — so the two do not double-count',
)
assert(
  DEMO_SESSIONS.every(([, , , done, slug]) => done === false || SELF_USE_SESSIONS.some((x) => x.slug === slug)),
  'every slug in the demo month is a session the catalogue actually has',
)
assert(
  finished.every((s) => demoListenedSec(s) === s[2] * 60),
  'a finished session was heard to the end; an unfinished one was not',
)
assert(DEMO_SESSIONS.some(([, , , done]) => !done), 'and the month is not a perfect streak: two were stopped early')

/* ---- 5. the contract the demo claims ----------------------------------- */
assert(CONTRACT_MULTIPLIERS.includes(demoCompany().multiplier),
  'the demo company’s multiplier is one a contract can actually have')

console.log(process.exitCode ? '\nFAILED' : '\ndone.')
