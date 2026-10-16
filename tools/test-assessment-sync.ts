/* ============================================================================
   The assessment queue, now that it lives in a database

   The queue carries DASS-21, CBI and the session VAS between a patient's app
   and a therapist's desktop. Two properties have to survive the move out of
   localStorage, and they are the two this asserts:

     · a completed record cannot be changed, by anybody, through any path
     · a record written while offline is not lost when the connection returns

   The second is the one that would fail quietly. A naive refresh replaces
   local rows with server rows, and an answer given on a train disappears
   without anything going wrong on screen.

   Run: npx esbuild tools/test-assessment-sync.ts --bundle --platform=node \
          --format=cjs --define:import.meta.env={} --outfile=x.cjs && node x.cjs
   ============================================================================ */

import {
  completedFor, latestOf, pendingFor, send, seriesOf, vasRecord, vasSeries,
} from '../src/data/assessmentStore'
import { freeze, canEdit } from '../src/data/assessments'
import type { AssessmentRecord } from '../src/data/assessments'

let pass = 0
const fails: string[] = []
function assert(ok: boolean, what: string) {
  if (ok) { pass++; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

/* A stand-in for the table, with the trigger's rule in it. If this and
   supabase/15-assessments.sql ever disagree, one of them is wrong — and the
   SQL is the one that counts, so this copy exists to be compared with it. */
class FakeTable {
  rows = new Map<string, AssessmentRecord>()
  upsert(records: AssessmentRecord[]): void {
    for (const r of records) {
      const existing = this.rows.get(r.id)
      if (existing?.immutable) {
        throw new Error(`Assessment ${r.id} is completed and cannot be modified (append-only clinical record).`)
      }
      this.rows.set(r.id, { ...r })
    }
  }
  remove(id: string): void {
    if (this.rows.get(id)?.immutable) {
      throw new Error(`Assessment ${id} is completed and cannot be deleted (append-only clinical record).`)
    }
    this.rows.delete(id)
  }
  list(): AssessmentRecord[] {
    return [...this.rows.values()].sort((a, b) => a.administeredAt - b.administeredAt)
  }
}

const PATIENT = 'me'

console.log('--- a therapist sends an instrument ---')
let rows: AssessmentRecord[] = []
rows = send(rows, PATIENT, 'DASS21', 't0', 'dott.ssa Rossi', 1_000)
assert(rows.length === 1, 'one record')
assert(rows[0].status === 'confirmed', 'it lands confirmed — a therapist choosing it IS the confirmation')
assert(pendingFor(rows, PATIENT).length === 1, 'and it is pending for the patient')
assert(completedFor(rows, PATIENT).length === 0, 'with nothing completed yet')

const table = new FakeTable()
table.upsert(rows)
assert(table.list().length === 1, 'it reaches the table')

console.log('')
console.log('--- the patient answers, and it freezes ---')
const answers: Record<number, number> = {}
for (let i = 1; i <= 21; i++) answers[i] = i % 4
const done = freeze(rows[0], answers, 2_000)
assert(done.status === 'completed' && done.immutable, 'completed and frozen')
assert(!!done.scores && done.scores.kind === 'DASS21', 'and scored')
assert(!canEdit(done), 'canEdit says no')
table.upsert([done])
assert(table.list()[0].immutable, 'the frozen record is what the table holds')

console.log('')
console.log('--- and now nobody can change it ---')
let refused = false
try { table.upsert([{ ...done, scores: null }]) } catch { refused = true }
assert(refused, 'blanking the scores is refused by the store, not only by the client')
refused = false
try { table.upsert([{ ...done, responses: [] }]) } catch { refused = true }
assert(refused, 'so is emptying the responses')
refused = false
try { table.remove(done.id) } catch { refused = true }
assert(refused, 'and deleting it, which would be an edit with extra steps')
refused = false
try { freeze(done, answers, 3_000) } catch { refused = true }
assert(refused, 'freeze() still refuses too — two independent locks, not one')

console.log('')
console.log('--- an answer given offline is not lost on the next refresh ---')
/* The merge in useAssessments: server rows win, and local rows the server
   has never seen are KEPT and pushed, rather than replaced away. */
function merge(server: AssessmentRecord[], cache: AssessmentRecord[]) {
  const seen = new Set(server.map((r) => r.id))
  const unsent = cache.filter((r) => !seen.has(r.id))
  return { merged: [...server, ...unsent], unsent }
}

const onServer = table.list()
const offlineVas = vasRecord(PATIENT, 7, 3, 4_000)
const cache = [...onServer, offlineVas]
const { merged, unsent } = merge(onServer, cache)
assert(merged.length === 2, 'the refresh keeps both')
assert(unsent.length === 1 && unsent[0].id === offlineVas.id, 'and knows which one still has to go up')
table.upsert(unsent)
assert(table.list().length === 2, 'pushing it up lands it')

const { merged: second } = merge(table.list(), merged)
assert(second.length === 2, 'a second refresh does not duplicate it')

console.log('')
console.log('--- what the therapist reads back ---')
const final = table.list()
assert(latestOf(final, PATIENT, 'DASS21')?.id === done.id, 'the latest DASS-21 is the completed one')
assert(seriesOf(final, PATIENT, 'VAS').length === 1, 'the VAS series has the offline record in it')
const vs = vasSeries(final, PATIENT)
assert(vs.length === 1 && vs[0].pre === 7 && vs[0].post === 3 && vs[0].delta === -4,
  'with its pre, post and delta intact after the round trip')

console.log('')
console.log('--- only changed rows are sent ---')
/* Re-sending a completed record on every edit would hit the append-only
   trigger and turn a normal save into an error. The fingerprint is what
   stops that. */
function fingerprint(r: AssessmentRecord): string {
  return `${r.status}|${r.completedAt ?? 0}|${r.responses.length}|${r.immutable ? 1 : 0}`
}
const sentMap = new Map(final.map((r) => [r.id, fingerprint(r)]))
const withNew = send(final, PATIENT, 'CBI', 't1', 'dott.ssa Rossi', 5_000)
const changed = withNew.filter((r) => sentMap.get(r.id) !== fingerprint(r))
assert(changed.length === 1 && changed[0].instrumentId === 'CBI',
  'adding one record sends one record, not the whole queue')
let threw = false
try { table.upsert(changed) } catch { threw = true }
assert(!threw, 'so the completed record is never re-sent and the trigger never fires')

console.log('')
console.log('--- a patient key is a patient id, or it is not ---')
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
assert(!UUID_RE.test('me'), 'the self-use sentinel is not a foreign key and must not be written as one')
assert(UUID_RE.test('3f2504e0-4f89-11d3-9a0c-0305e82c3301'), 'a real patient id is')

console.log(`\n${pass} assertions passed.`)
if (fails.length) { console.log(`${fails.length} FAILED:`); for (const f of fails) console.log('  -', f); process.exit(1) }
