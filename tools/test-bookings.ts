/* ============================================================================
   A booking reaches the therapist

   The patient books in their own app; the row lands against the therapist.
   Until now the workspace read that list only to find a video room id, so
   from the clinician's side the booking had not happened. These are the three
   rules that make it visible: a known person's next session is updated, an
   unknown person is offered, and accepting one puts them on the roster with
   the session already attached.

       npx esbuild tools/test-bookings.ts --bundle --platform=node \
         --format=esm --define:import.meta.env={} --outfile=<tmp>/bk.mjs \
         && node <tmp>/bk.mjs
   ============================================================================ */

import { applyAppointments, pendingBookings, linkBooking, type WorkspaceState, type WorkspacePatient } from '../src/workspace/data'
import type { Appointment } from '../src/data/scheduling'

let pass = 0
const fails: string[] = []
function assert(cond: boolean, what: string): void {
  if (cond) { pass += 1; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

const HOUR = 3_600_000
const now = Date.now()

function patient(name: string, extra: Partial<WorkspacePatient> = {}): WorkspacePatient {
  return {
    id: `p-${name}`, name, memberSince: now - 30 * 86_400_000, status: 'active', linkedAt: now,
    sessions: [], assessments: [], notes: [], goals: [], prescriptions: [],
    bridged: false, bridgedSessions: [], consentTherapy: true, ...extra,
  }
}

function booking(name: string, inHours: number, id = `ap-${name}-${inHours}`): Appointment {
  return { id, therapistId: 'th-1', profileId: `pr-${name}`, patientName: name, startsAtMs: now + inHours * HOUR, durationMin: 50, status: 'booked' }
}

function stateWith(...ps: WorkspacePatient[]): WorkspaceState {
  return { patients: ps } as unknown as WorkspaceState
}

/* ------------------------------------------------ someone already known --- */
console.log('\n--- a patient on the roster books ---')
{
  const s = stateWith(patient('Giulia Rossi'), patient('Marco Neri'))
  const out = applyAppointments(s, [booking('Giulia Rossi', 48)])
  const g = out.patients.find((p) => p.name === 'Giulia Rossi')
  assert(g?.nextSessionAt === now + 48 * HOUR, 'their next session is the time they booked')
  assert(out.patients.find((p) => p.name === 'Marco Neri')?.nextSessionAt === undefined, 'nobody else is touched')
  assert(pendingBookings(out, [booking('Giulia Rossi', 48)]).length === 0, 'and it is not offered as new — they are already here')
}

{
  const s = stateWith(patient('Giulia Rossi'))
  const out = applyAppointments(s, [booking('Giulia Rossi', 72), booking('Giulia Rossi', 24, 'ap-b')])
  assert(out.patients[0].nextSessionAt === now + 24 * HOUR, 'with two booked, the SOONER one is the next session')
}

{
  const s = stateWith(patient('giulia rossi'))
  const out = applyAppointments(s, [booking('Giulia Rossi', 12)])
  assert(out.patients[0].nextSessionAt === now + 12 * HOUR, 'the name match ignores case and spacing')
}

{
  const s = stateWith(patient('Giulia Rossi', { nextSessionAt: now + 5 * HOUR }))
  assert(applyAppointments(s, []) === s, 'no appointments changes nothing, identically')
  const same = applyAppointments(s, [booking('Giulia Rossi', 5)])
  assert(same === s, 'and re-applying the same time does not churn the state')
}

/* ------------------------------------------------------ someone unknown --- */
console.log('\n--- a stranger books ---')
{
  const s = stateWith(patient('Marco Neri'))
  const b = booking('Elena Conti', 36)
  const pend = pendingBookings(s, [b])
  assert(pend.length === 1 && pend[0].patientName === 'Elena Conti', 'a booking from nobody on the roster is offered')
  assert(applyAppointments(s, [b]).patients.every((p) => p.nextSessionAt === undefined), 'and changes no existing record')

  const after = linkBooking(s, b)
  const e = after.patients.find((p) => p.name === 'Elena Conti')
  assert(!!e, 'accepting puts them on the roster')
  assert(e?.nextSessionAt === b.startsAtMs, 'with the session they booked already on it')
  assert(e?.status === 'active' && e?.consentTherapy === true, 'as an active patient in care')
  assert(pendingBookings(after, [b]).length === 0, 'and they stop being offered')
}

{
  const s = stateWith(patient('Elena Conti'))
  const b = booking('Elena Conti', 36)
  const after = linkBooking(s, b)
  assert(after.patients.length === 1, 'accepting somebody already listed does not duplicate them')
  assert(after.patients[0].nextSessionAt === b.startsAtMs, 'it just carries the session over')
}

{
  const s = stateWith()
  const after = linkBooking(s, booking('Elena Conti', 36), 'srv-9')
  assert(after.patients[0].linkedPatientId === 'srv-9', 'the server record id is kept when there is one')
}

/* ------------------------------------------------------------- the past --- */
console.log('\n--- what is over ---')
{
  const s = stateWith()
  assert(pendingBookings(s, [booking('Elena Conti', -5)]).length === 0, 'a session five hours gone is not an invitation')
  assert(pendingBookings(s, [booking('Elena Conti', -1)]).length === 1, 'one that started an hour ago still is — it may be running')
  const cancelled = { ...booking('Elena Conti', 10), status: 'cancelled' as const }
  assert(pendingBookings(s, [cancelled]).length === 0, 'a cancelled booking is not offered')
  assert(applyAppointments(stateWith(patient('Elena Conti')), [cancelled]).patients[0].nextSessionAt === undefined,
    'nor does it become anyone’s next session')
}

console.log(`\n${pass} passed, ${fails.length} failed`)
if (fails.length) { for (const f of fails) console.log('  -', f); process.exit(1) }
