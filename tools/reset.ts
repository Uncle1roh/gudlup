/* ============================================================================
   Good Loop — put a demo back the way it started, in one command

     GL_TARGET_URL=https://xxxx.supabase.co GL_SERVICE_KEY=eyJ... npm run reset

   Clears the PEOPLE and what they did — accounts, companies, patients,
   appointments, sessions, assessments, consents — and leaves the PRODUCT
   alone: protocols, their audio, the shelves, the operator settings and the
   feature switches are never touched.

   That split is the whole design. A demo is reset between prospects, often
   in a hurry, and the thing that must survive is the months of protocol work.
   So this tool has no statement that can reach the `protocols` table, and
   the one in supabase/reset/ it replaces had the same rule written down in a
   README instead of in the code.

   It refuses production the same three ways `npm run seed` does, and it will
   not run on a project whose `protocols` table it cannot first count — if the
   product cannot be seen, the people are not deleted.

   Afterwards: `npm run seed` for a populated demo, or leave it empty.
   ============================================================================ */

import { must, resolveTarget } from './seedTarget'

/** Cleared, in an order that respects the foreign keys. Nothing in this list
    is product: no protocols, no asset_meta, no explore_rails, no
    app_settings. Adding a table here is a decision about what a demo reset
    destroys, so the list is explicit rather than discovered. */
const WIPE: { table: string; why: string }[] = [
  { table: 'psychosocial_responses', why: 'the NR-1 population' },
  { table: 'clinical_events', why: 'clinical event log' },
  { table: 'rapid_notes', why: 'quick notes' },
  { table: 'patient_notes', why: 'session notes' },
  { table: 'plan_items', why: 'prescribed plans' },
  { table: 'goals', why: 'patient goals' },
  { table: 'sessions', why: 'listening history' },
  { table: 'messages', why: 'the therapist/patient thread' },
  { table: 'appointments', why: 'the calendar' },
  { table: 'session_requests', why: 'booking requests' },
  { table: 'therapist_availability', why: 'published slots' },
  { table: 'patient_informed_consents', why: 'informed consents' },
  { table: 'patient_consents', why: 'per-item consents' },
  { table: 'consent_events', why: 'the consent trail' },
  { table: 'legal_acceptances', why: 'terms acceptances' },
  { table: 'data_requests', why: 'DSR queue' },
  { table: 'content_reports', why: 'reports' },
  { table: 'patients', why: 'the caseload' },
  { table: 'therapist_codes', why: 'connection codes' },
  { table: 'therapist_activation_codes', why: 'activation codes' },
  { table: 'company_therapists', why: 'company/therapist links' },
  { table: 'therapists', why: 'clinician records' },
  { table: 'profiles', why: 'everybody' },
  { table: 'companies', why: 'the tenants' },
  { table: 'audit_events', why: 'the console log' },
]

/** Never deleted, and named here so the list is a promise rather than an
    omission. */
const KEPT = ['protocols', 'explore_rails', 'asset_meta', 'app_settings', 'promo_codes',
  'partner_products', 'crisis_resources', 'legal_versions']

async function main() {
  const { sb, ref } = await resolveTarget(
    'DELETE every account, company, patient, appointment, session and consent. Protocols and audio are NOT touched.',
  )
  console.log('')

  /* The product has to be visible before the people are removed. A project
     where `protocols` cannot be read is a project this tool does not
     understand, and the safe response to that is to stop. */
  const { count, error: probeErr } = await sb.from('protocols').select('code', { count: 'exact', head: true })
  if (probeErr) {
    console.error(`Cannot read the protocols table on ${ref}: ${probeErr.message}`)
    console.error('Refusing to delete anything on a project whose product I cannot see.')
    process.exit(1)
  }
  console.log(`${count ?? 0} protocols on ${ref}. They will not be touched.`)
  console.log('')

  console.log('Clearing...')
  for (const { table, why } of WIPE) {
    /* `neq` on a column that is never null is how PostgREST spells "all
       rows" — a bare delete with no filter is refused, which is a good rule
       that happens to be inconvenient exactly once. */
    const { error } = await sb.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (error && /column .* does not exist|invalid input syntax/i.test(error.message)) {
      /* `companies.id` is text, not uuid. Same intent, different sentinel. */
      must(`${table} — ${why}`, (await sb.from(table).delete().neq('id', '__none__')).error)
      continue
    }
    must(`${table} — ${why}`, error)
  }

  const { count: after } = await sb.from('protocols').select('code', { count: 'exact', head: true })
  console.log('')
  console.log('─'.repeat(66))
  if (after !== count) {
    console.error(`PROTOCOLS CHANGED: ${count} before, ${after} after. That must not happen — report it.`)
    process.exit(1)
  }
  console.log(`${ref} is empty of people. ${after ?? 0} protocols still there, untouched.`)
  console.log('')
  console.log(`Kept: ${KEPT.join(', ')}`)
  console.log('')
  console.log('Next: `npm run seed` for a populated demo, and re-create the demo')
  console.log('logins in Authentication → Users (deleting profiles does not delete')
  console.log('the auth users, but it does unbind them).')
  console.log('─'.repeat(66))
}

main().catch((e) => {
  console.error('')
  console.error((e as Error).message)
  process.exit(1)
})
