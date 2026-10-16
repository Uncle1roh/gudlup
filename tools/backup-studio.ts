/* ============================================================================
   Good Loop — download every saved Studio session, in one command

     npm run backup:studio

   It signs in to Supabase as an admin, reads the Studio sessions out of the
   catalogue, and writes one `.glstudio.json` per session into
   `studio-backups/`. Those are the same files the Studio ⬇ Backup button
   writes, so any of them goes back in through ⬆ Restore.

   This is the easy path. supabase/export-studio-sessions.sql does the same
   job from the SQL editor, for when this machine cannot reach the database
   or Node is not available. Both produce identical files.

   WHY IT IMPORTS FROM src/ RATHER THAN REIMPLEMENTING: there must be exactly
   one answer to "which session belongs to which time signature" and one
   definition of the file format. `studioFor` and `buildStudioBackup` are
   those answers. A backup tool that drifts from the app is a backup tool
   that writes files the app will not open.

   CREDENTIALS: never stored, never written to a file, never passed on the
   command line, where they would land in shell history. Either put them in
   the environment for one run, or let it ask.

     GL_ADMIN_EMAIL=admin@goodloop.app npm run backup:studio

   Reads nothing but `protocols`, and writes nothing to the database.
   ============================================================================ */

import { createClient } from '@supabase/supabase-js'
import { createInterface } from 'node:readline'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { manifestFor, sessionsFromRows, type ProtocolRow } from './studioBackupSet'

const OUT_DIR = process.argv[2] ?? 'studio-backups'

/* ------------------------------------------------------------- the env --- */

/** Read `.env.local` the way Vite does, well enough for two keys. */
function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {}
  const out: Record<string, string> = {}
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

const fileEnv = { ...readEnvFile('.env'), ...readEnvFile('.env.local') }
const url = process.env.VITE_SUPABASE_URL ?? fileEnv.VITE_SUPABASE_URL
const anon = process.env.VITE_SUPABASE_ANON_KEY ?? fileEnv.VITE_SUPABASE_ANON_KEY

if (!url || !anon) {
  console.error('No Supabase connection found.')
  console.error('Expected VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local, or in the environment.')
  process.exit(1)
}

/* ------------------------------------------------------- who is asking --- */

function ask(question: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  return new Promise((resolve) => {
    if (!hidden) {
      rl.question(question, (a) => { rl.close(); resolve(a.trim()) })
      return
    }
    /* Typing a password into a terminal that echoes it is how a password ends
       up in a screen share. Mute the echo while it is being typed. */
    const out = rl as unknown as { output: { write: (s: string) => void }; _writeToOutput: (s: string) => void }
    let first = true
    out._writeToOutput = function (s: string) {
      if (first) { out.output.write(question); first = false; return }
      if (s.includes('\n') || s.includes('\r')) out.output.write('\n')
    }
    rl.question(question, (a) => { rl.close(); resolve(a.trim()) })
  })
}

async function credentials(): Promise<{ email: string; password: string }> {
  const email = process.env.GL_ADMIN_EMAIL ?? await ask('Admin email: ')
  const password = process.env.GL_ADMIN_PASSWORD ?? await ask('Password (not shown): ', true)
  if (!email || !password) {
    console.error('\nAn email and a password are needed: the catalogue is not readable without signing in.')
    process.exit(1)
  }
  return { email, password }
}

/* ------------------------------------------------------------- the run --- */

async function main() {
  const { email, password } = await credentials()
  const sb = createClient(url!, anon!, { auth: { persistSession: false } })

  process.stdout.write('\nSigning in... ')
  const { error: authErr } = await sb.auth.signInWithPassword({ email, password })
  if (authErr) {
    console.error('failed. ' + authErr.message)
    if (/fetch failed|ENOTFOUND|ECONNREFUSED|network/i.test(authErr.message)) {
      console.error(`\nCould not reach ${url}. Check the connection, and VITE_SUPABASE_URL in .env.local.`)
    } else if (/invalid login|credentials/i.test(authErr.message)) {
      console.error('\nThat email and password were not accepted. It has to be an account that can read')
      console.error('the catalogue — the same one you sign in to the admin console with.')
    }
    process.exit(1)
  }
  console.log('ok.')

  /* Three columns, not `select *`. The timelines and the datasheets are the
     heavy part of a protocol row and none of them is a Studio session; asking
     for them is what makes this read cross the statement timeout. */
  process.stdout.write('Reading the catalogue... ')
  const { data, error } = await sb
    .from('protocols')
    .select('code, studio, studio_by_duration')
    .order('code')
  if (error) {
    console.error('failed.\n' + error.message)
    if (/statement timeout|57014/i.test(error.message)) {
      console.error('\nThe catalogue is large. Use supabase/export-studio-sessions.sql QUERY 3 instead,')
      console.error('which goes one protocol at a time.')
    }
    process.exit(1)
  }
  const rows = (data ?? []) as ProtocolRow[]
  console.log(`${rows.length} protocols.`)

  const now = Date.now()
  const entries = sessionsFromRows(rows, now)

  mkdirSync(OUT_DIR, { recursive: true })
  for (const e of entries) {
    writeFileSync(join(OUT_DIR, e.file), JSON.stringify(e.backup))
    console.log(`  ${e.file}  ·  ${e.tracks} tracks, ${e.clips} clips`)
  }

  writeFileSync(
    join(OUT_DIR, 'manifest.json'),
    JSON.stringify(manifestFor(entries, {
      now,
      database: url!.replace(/^https?:\/\//, '').split('.')[0],
      protocols: rows.length,
    }), null, 2) + '\n',
  )

  await sb.auth.signOut().catch(() => undefined)

  console.log('')
  if (!entries.length) {
    console.log(`No saved Studio sessions found in ${rows.length} protocols.`)
    console.log('That is either a brand-new catalogue, or a sign-in without admin rights.')
    process.exit(1)
  }
  console.log(`${entries.length} sessions from ${new Set(entries.map((e) => e.code)).size} protocols`)
  console.log(`written to ${OUT_DIR}/ , with manifest.json beside them.`)
  console.log('')
  console.log('Check them with:  npm run verify:studio')
}

main().catch((e) => {
  console.error('\n' + (e as Error).message)
  process.exit(1)
})
