/* ============================================================================
   Good Loop — fill a staging or demo project with a world, in one command

     GL_TARGET_URL=https://xxxx.supabase.co GL_SERVICE_KEY=eyJ... npm run seed

   Builds: a fictional company, a population of employees with four quarters
   of psychosocial responses behind them, an approved therapist with patients
   and appointments, and the protocols needed for a session to be playable.

   WHY NOT seed_demo.sql: that file is plpgsql pasted into the SQL editor by
   hand, which is three manual steps and no way to tell whether it worked. It
   stays, because the SQL editor is sometimes all you have. This is the same
   world through the API, as one command that reports what it wrote.

   DETERMINISTIC. The same seed produces the same company every time — same
   names, same teams, same numbers — so two people describing "the demo" are
   describing the same thing, and a screenshot taken last month still matches.

   IT REFUSES PRODUCTION. See tools/seedTarget.ts; the target is explicit, is
   checked against a refusal list, and the operator types the project ref.

   WHAT IT DOES NOT DO: create logins. Supabase owns the auth tables and
   writing passwords into them by hand breaks in ways that are hard to see.
   The synthetic people have no `auth_uid` and can never sign in — they exist
   so the aggregates have a population. Real demo logins are made in the
   dashboard; this prints exactly which ones and what to do next.
   ============================================================================ */

import { must, resolveTarget } from './seedTarget'

/* ------------------------------------------------- a repeatable random --- */

/** mulberry32: small, fast, and the same sequence on every machine. The
    point is not randomness, it is a fixed world that looks unplanned. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ------------------------------------------------------------ the world -- */

const COMPANY = { id: 'c1', name: 'Aurora Tech', seats: 250, active_users: 168, status: 'active' }

const TEAMS: { name: string; n: number }[] = [
  { name: 'Engineering', n: 52 },
  { name: 'Sales', n: 28 },
  { name: 'Customer Support', n: 22 },
  { name: 'Product', n: 12 },
  /* Two teams under k=5 on purpose: they are what exercises the anonymity
     suppression, and a demo where suppression never fires has not shown the
     one guarantee the dashboard makes. */
  { name: 'People', n: 4 },
  { name: 'Finance', n: 3 },
]

const PERIODS = ['Q3 2025', 'Q4 2025', 'Q1 2026', 'Q2 2026']
/* Earlier quarters are worse, so the dashboard shows a programme working. */
const FACTOR = [1.35, 1.18, 1.05, 0.95]

const DIMS: { key: string; high: number; mod: number }[] = [
  { key: 'demands', high: 0.28, mod: 0.38 },
  { key: 'pace', high: 0.26, mod: 0.37 },
  { key: 'balance', high: 0.25, mod: 0.36 },
  { key: 'recognition', high: 0.16, mod: 0.34 },
  { key: 'support_mgr', high: 0.12, mod: 0.30 },
  { key: 'control', high: 0.10, mod: 0.26 },
  { key: 'role', high: 0.075, mod: 0.23 },
  { key: 'relationships', high: 0.075, mod: 0.20 },
]
const OUTCOMES: { key: string; p: number }[] = [
  { key: 'stress', p: 0.30 },
  { key: 'anxiety', p: 0.23 },
  { key: 'burnout', p: 0.19 },
]

const PATIENTS = [
  { name: 'Marta Oliveira', age: 34, sex: 'f', reason: 'Ansia legata al lavoro', conditions: ['ansia'] },
  { name: 'Davide Conti', age: 41, sex: 'm', reason: 'Difficoltà di sonno', conditions: ['insonnia'] },
  { name: 'Sofia Ferraro', age: 29, sex: 'f', reason: 'Carico emotivo', conditions: ['stress'] },
  { name: 'Luca Benedetti', age: 47, sex: 'm', reason: 'Recupero dopo un periodo intenso', conditions: [] },
]

const EMAIL_DOMAIN = 'aurora.demo'
const THERAPIST_EMAIL = 'demo-therapist@aurora.demo'

async function main() {
  const { sb, ref } = await resolveTarget(
    'DELETE the previous demo rows and write a fresh fictional company, population, therapist and patients.',
  )
  const r = rng(0x5eed)
  console.log('')

  /* ---- 1. clear what a previous run wrote ------------------------------
     Scoped by the demo email domain, never by company alone: a staging
     project may also hold real test accounts somebody is using. */
  console.log('Clearing the previous seed...')
  const { data: old } = await sb.from('profiles').select('id').like('email', `%@${EMAIL_DOMAIN}`)
  const oldIds = (old ?? []).map((p: { id: string }) => p.id)
  if (oldIds.length) {
    must('psychosocial responses', (await sb.from('psychosocial_responses').delete().in('profile_id', oldIds)).error)
    must('appointments', (await sb.from('appointments').delete().in('profile_id', oldIds)).error)
    const { data: oldT } = await sb.from('therapists').select('id').in('id', oldIds)
    const tIds = (oldT ?? []).map((t: { id: string }) => t.id)
    if (tIds.length) {
      must('patients', (await sb.from('patients').delete().in('therapist_id', tIds)).error)
      must('appointments (as therapist)', (await sb.from('appointments').delete().in('therapist_id', tIds)).error)
      must('therapists', (await sb.from('therapists').delete().in('id', tIds)).error)
    }
    must(`profiles (${oldIds.length})`, (await sb.from('profiles').delete().in('id', oldIds)).error)
  } else {
    console.log('  ok   nothing to clear')
  }

  /* ---- 2. the company ---------------------------------------------------- */
  console.log('')
  console.log('Company...')
  must(COMPANY.name, (await sb.from('companies').upsert(COMPANY, { onConflict: 'id' })).error)

  /* ---- 3. the population ------------------------------------------------- */
  console.log('')
  console.log('Employees and four quarters of responses...')
  const people: { name: string; email: string; company_id: string; role: string; active: boolean; team: string }[] = []
  for (const team of TEAMS) {
    for (let i = 1; i <= team.n; i++) {
      people.push({
        role: 'b2c_user',
        name: `Demo ${team.name} ${i}`,
        email: `demo-emp-${team.name.toLowerCase().replace(/\s+/g, '-')}-${i}@${EMAIL_DOMAIN}`,
        company_id: COMPANY.id,
        active: true,
        team: team.name,
      })
    }
  }

  /* In batches: one insert of 121 rows is fine, one of several thousand
     responses is not, and a failed half-batch is the worst outcome here. */
  const inserted: { id: string; team: string }[] = []
  for (let i = 0; i < people.length; i += 100) {
    const batch = people.slice(i, i + 100)
    const { data, error } = await sb
      .from('profiles')
      .insert(batch.map(({ team: _team, ...row }) => row))
      .select('id, email')
    must(`profiles ${i + 1}–${i + batch.length}`, error)
    for (const row of (data ?? []) as { id: string; email: string }[]) {
      const src = batch.find((b) => b.email === row.email)
      inserted.push({ id: row.id, team: src?.team ?? 'Engineering' })
    }
  }

  const responses: Record<string, unknown>[] = []
  for (const person of inserted) {
    for (let pd = 0; pd < PERIODS.length; pd++) {
      const dims: Record<string, string> = {}
      for (const d of DIMS) {
        const x = r()
        const high = Math.min(0.9, d.high * FACTOR[pd])
        dims[d.key] = x < high ? 'high' : x < high + d.mod ? 'moderate' : 'low'
      }
      const outs: Record<string, boolean> = {}
      for (const o of OUTCOMES) outs[o.key] = r() < Math.min(0.9, o.p * FACTOR[pd])
      responses.push({
        profile_id: person.id,
        company_id: COMPANY.id,
        team: person.team,
        period: PERIODS[pd],
        dims,
        outcomes: outs,
      })
    }
  }
  for (let i = 0; i < responses.length; i += 500) {
    const batch = responses.slice(i, i + 500)
    must(`responses ${i + 1}–${i + batch.length}`, (await sb.from('psychosocial_responses').insert(batch)).error)
  }

  /* ---- 4. an approved therapist, with a caseload ------------------------- */
  console.log('')
  console.log('Therapist, patients and appointments...')
  const { data: tProfile, error: tErr } = await sb
    .from('profiles')
    .insert({ role: 'therapist', name: 'Dott.ssa Elena Rossi', email: THERAPIST_EMAIL, company_id: COMPANY.id, active: true, locale: 'it' })
    .select('id')
    .single()
  must('therapist profile', tErr)
  const therapistId = (tProfile as { id: string }).id

  must('therapist record (approved)', (await sb.from('therapists').insert({
    id: therapistId,
    crp: 'CRP 06/123456',
    status: 'approved',
    approved_at: new Date().toISOString(),
  })).error)

  must('patients', (await sb.from('patients').insert(
    PATIENTS.map((p) => ({ ...p, therapist_id: therapistId })),
  )).error)

  /* Two appointments on the therapist's calendar: one in two days, one last
     week, so both the upcoming and the past views have something in them. */
  const day = 24 * 60 * 60 * 1000
  const soon = new Date(Date.now() + 2 * day)
  soon.setHours(10, 0, 0, 0)
  const past = new Date(Date.now() - 7 * day)
  past.setHours(15, 0, 0, 0)
  must('appointments', (await sb.from('appointments').insert([
    { therapist_id: therapistId, profile_id: inserted[0].id, patient_name: PATIENTS[0].name, company_id: COMPANY.id, starts_at: soon.toISOString(), status: 'booked' },
    { therapist_id: therapistId, profile_id: inserted[1].id, patient_name: PATIENTS[1].name, company_id: COMPANY.id, starts_at: past.toISOString(), status: 'done' },
  ])).error)

  /* ---- 5. what is NOT here ---------------------------------------------- */
  const { count: protocolCount } = await sb.from('protocols').select('code', { count: 'exact', head: true })

  console.log('')
  console.log('─'.repeat(66))
  console.log(`Seeded ${ref}:`)
  console.log(`  ${COMPANY.name}, ${inserted.length} employees across ${TEAMS.length} teams`)
  console.log(`  ${responses.length} psychosocial responses over ${PERIODS.length} quarters`)
  console.log(`  1 approved therapist, ${PATIENTS.length} patients, 2 appointments`)
  console.log(`  ${protocolCount ?? 0} protocols already in the catalogue`)
  console.log('')
  if (!protocolCount) {
    console.log('NO PROTOCOLS. Nothing is playable until some exist. Either import a')
    console.log('PLAIN workbook through the admin console, or copy them from another')
    console.log('project — docs/ENVIRONMENTS.md, "Getting protocols into staging".')
    console.log('')
  }
  console.log('LOGINS are not created here: Supabase owns the auth tables. In the')
  console.log('dashboard → Authentication → Users → Add user (Auto Confirm ON):')
  console.log('')
  console.log('  demo@goodloop.app        the person')
  console.log('  demo-therapist@goodloop.app  the clinician')
  console.log('  hr@goodloop.app          the company admin')
  console.log('')
  console.log('then bind each to a profile — supabase/7-demo-user.sql has the')
  console.log('statements, and the therapist profile just created is:')
  console.log(`  ${therapistId}`)
  console.log('─'.repeat(66))
}

main().catch((e) => {
  console.error('')
  console.error((e as Error).message)
  process.exit(1)
})
