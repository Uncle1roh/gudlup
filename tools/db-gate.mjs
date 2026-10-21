/* ============================================================================
   The database gate: setup.sql on a fresh Postgres 16, twice, then the SQL
   proofs.

     node tools/db-gate.mjs

   1. creates a throwaway database,
   2. applies tools/db/local-stubs.sql (the Supabase objects setup.sql uses),
   3. applies supabase/setup.sql — fresh,
   4. applies it AGAIN to the same database — it must be idempotent,
   5. checks the file ends with `notify pgrst, 'reload schema';`,
   6. runs every supabase/tests/*.sql against it. A test fails by raising;
      fixtures named in a test's first line (`-- fixtures: path.json`) are
      loaded first into a temp table `fixtures(j jsonb)`,
   7. drops the database.

   Statement by statement, never `psql -1`: setup.sql adds an enum value
   (`alter type … add value`) that cannot be used in the transaction that
   added it.

   Connection: the usual libpq variables (PGHOST, PGPORT, PGUSER, PGPASSWORD
   or a pgpass file), defaulting to postgres@localhost:5432. psql is found on
   PATH, or in $PSQL, or in the default Windows install folder.
   ============================================================================ */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const PSQL = process.env.PSQL
  || (existsSync('C:/Program Files/PostgreSQL/16/bin/psql.exe') ? 'C:/Program Files/PostgreSQL/16/bin/psql.exe' : 'psql')
/* lc_messages=C: server errors in English whatever the install's locale. */
const env = { PGHOST: 'localhost', PGPORT: '5432', PGUSER: 'postgres', PGOPTIONS: '-c lc_messages=C', ...process.env }
const DB = `gl_gate_${process.pid}`
const CACHE = join('node_modules', '.cache', 'gl', 'db')
mkdirSync(CACHE, { recursive: true })

function psql(db, args, label) {
  const r = spawnSync(PSQL, ['-X', '-q', '-w', '-v', 'ON_ERROR_STOP=1', '-d', db, ...args], { env, encoding: 'utf8' })
  if (r.error) { console.error(`FAIL: ${label}: ${r.error.message}`); process.exit(1) }
  const noise = (r.stderr || '').split('\n').filter((l) => l && !/NOTICE:|^DETAIL:|^HINT:|^CONTEXT:|^PL\/pgSQL/.test(l))
  if (r.status !== 0) {
    console.error(`FAIL: ${label}\n${r.stderr}`)
    return false
  }
  if (noise.length) console.log(noise.map((l) => `      ${l}`).join('\n'))
  console.log(`ok  : ${label}`)
  return true
}

let ok = true
const setup = readFileSync('supabase/setup.sql', 'utf8')
const lastStmt = setup.replace(/--[^\n]*/g, '').trim().split(';').filter((s) => s.trim()).pop()?.trim()
if (lastStmt !== "notify pgrst, 'reload schema'") { console.error(`FAIL: setup.sql must end with notify pgrst, 'reload schema'; (ends with: ${lastStmt})`); ok = false }
else console.log("ok  : setup.sql ends with notify pgrst, 'reload schema';")

if (!psql('postgres', ['-c', `create database ${DB}`], `create fresh database ${DB}`)) process.exit(1)
try {
  ok = psql(DB, ['-f', 'tools/db/local-stubs.sql'], 'Supabase stubs') && ok
  ok = ok && psql(DB, ['-f', 'supabase/setup.sql'], 'setup.sql on a fresh database')
  ok = ok && psql(DB, ['-f', 'supabase/setup.sql'], 'setup.sql re-applied (idempotent)')
  const dir = join('supabase', 'tests')
  const tests = ok && existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.sql')).sort() : []
  for (const t of tests) {
    const path = join(dir, t)
    const first = readFileSync(path, 'utf8').split('\n')[0]
    const m = /^--\s*fixtures:\s*(\S+)/.exec(first)
    const files = []
    if (m) {
      const json = readFileSync(m[1], 'utf8')
      const pre = join(CACHE, `${t}.fixtures.sql`)
      writeFileSync(pre, `create temp table fixtures(j jsonb);\ninsert into fixtures values ($gl_fx$${json}$gl_fx$::jsonb);\n`)
      files.push('-f', pre)
    }
    ok = psql(DB, [...files, '-f', path], `SQL proof ${t}`) && ok
  }
} finally {
  psql('postgres', ['-c', `drop database if exists ${DB} with (force)`], `drop ${DB}`)
}

console.log(ok ? '\ndb gate: PASS' : '\ndb gate: FAIL')
process.exit(ok ? 0 : 1)
