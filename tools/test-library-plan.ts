/* Node proof for the two ways the app is consumed:
     §1 the LEGAL BOUNDARY — the clinical list and the library list never
        intersect, and nothing a person browses carries a clinical identity
     §2 the LIBRARY naming register and the check-in's routing into it
     §3 the PERCORSO — a therapist-authored plan drives "next session", and
        the app has no way to compose one (data/program.ts is gone)
   Run:
     node_modules/.bin/esbuild tools/test-library-plan.ts --bundle --platform=node \
       --outfile=$TEMP/tlp.cjs && node $TEMP/tlp.cjs
*/
import { existsSync } from 'node:fs'
import { audienceOf, clinicalEntries, libraryEntries, seedCatalog } from '../src/data/catalog'
import { isLibraryCode, LIBRARY_CATEGORIES, LIBRARY_SEEDS, pickFromLibrary, type LibraryTag } from '../src/data/library'
import { applyDraft, slugFromTitle, EMPTY_DRAFT } from '../src/admin/LibraryEditor'
import { byWeek, nextPlanItem, planComplete, planProgress, repositioned, skeletonPlan, PLAN_WEEKS, type Plan } from '../src/data/plan'

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else console.log(`ok  : ${msg}`)
}

const catalog = seedCatalog()
const lib = libraryEntries(catalog)
const clin = clinicalEntries(catalog)

/* ------------------------------------------------------- §1 the boundary */

assert(lib.length > 0 && clin.length > 0, `catalog carries both shelves — ${clin.length} clinical, ${lib.length} library`)
const codes = new Set(clin.map((p) => p.code))
assert(lib.every((p) => !codes.has(p.code)), `no entry is on both shelves`)
assert(lib.every((p) => p.family === 'GL-LIB'), `every library entry is family GL-LIB`)
assert(clin.every((p) => p.family !== 'GL-LIB'), `no clinical entry is GL-LIB`)
assert(lib.every((p) => audienceOf(p) === 'library'), `audienceOf agrees on the library shelf`)
assert(clin.every((p) => audienceOf(p) === 'clinical'), `audienceOf agrees on the clinical shelf`)
// rows written before the split have no audience column at all
assert(audienceOf({ family: 'GL-ANX' } as never) === 'clinical', `a row with no audience is clinical`)
assert(lib.every((p) => isLibraryCode(p.code)), `library codes are recognisable without their catalog entry`)
assert(clin.every((p) => !isLibraryCode(p.code)), `a clinical code is never mistaken for a library one`)

/* the register: a browsable title names a moment, never a condition, a
   protocol number or a treatment */
const CLINICAL_WORDS = /(ansia|ansios|depress|burnout|stress|protocoll|terapi|disturb|patolog|clinic|trattament|GL-)/i
for (const s of LIBRARY_SEEDS) {
  assert(!CLINICAL_WORDS.test(s.title), `title says the moment, not the condition: "${s.title}"`)
}
assert(LIBRARY_SEEDS.every((s) => LIBRARY_CATEGORIES.some((c) => c.id === s.meta.category)), `every seed sits on a real shelf`)
assert(new Set(LIBRARY_SEEDS.map((s) => s.slug)).size === LIBRARY_SEEDS.length, `no duplicate library slugs`)

/* ---------------------------------------------------- §2 check-in routing */

const seq = [0.1, 0.4, 0.9, 0.2]
let n = 0
const rnd = () => seq[n++ % seq.length]
for (const tag of ['anxiety', 'stress', 'depression', 'burnout', 'resilience', 'maintenance'] as LibraryTag[]) {
  const pick = pickFromLibrary(lib, tag, 12, rnd)
  assert(!!pick && isLibraryCode(pick.item.code), `"${tag}" routes into the library → ${pick?.item.title}`)
}
const exact = pickFromLibrary(lib.filter((p) => p.library?.tags.includes('anxiety')), 'anxiety', 6, () => 0)
assert(!!exact && exact.item.versions[0].duration === 6, `an exact length is preferred when one exists (${exact?.item.title})`)
assert(pickFromLibrary([], 'stress', 12) === null, `an empty library suggests nothing rather than falling back to clinical material`)

/* the admin editor mints a library entry from a title alone */
const draft = { ...EMPTY_DRAFT, title: '20 minuti prima di un volo', blurb: 'x', duration: 24 as const, tags: ['anxiety' as LibraryTag] }
const made = applyDraft(draft)
assert(made.code === 'GL-LIB 20-minuti-prima-di-un-volo', `title → code: ${made.code}`)
assert(made.audience === 'library' && made.family === 'GL-LIB', `a new entry lands on the library shelf`)
assert(made.phases.length > 0 && !/processing|integration/i.test(made.phases.map((p) => p.name).join(' ')), `library phases use no treatment vocabulary`)
assert(slugFromTitle('Però! Città---à  ') === 'pero-citta-a', `slug strips accents and punctuation`)
assert(slugFromTitle('!!!').startsWith('audio-'), `a title with nothing usable still yields a code`)

/* --------------------------------------------------------- §3 il percorso */

assert(!existsSync('src/data/program.ts'), `the app-composed 90-day programme is gone — a pathway is written by a clinician`)

const plan: Plan = {
  patientId: 'p1',
  items: [
    { id: 'a', position: 0, protocolCode: 'GL-ANX 1.1', duration: 12, week: 1, doneAt: 1 },
    { id: 'b', position: 1, protocolCode: 'GL-ANX 1.1', duration: 12, week: 1 },
    { id: 'c', position: 2, protocolCode: 'GL-ANX 1.3', duration: 24, week: 2, note: 'ciao' },
  ],
  updatedAt: 0,
}
assert(nextPlanItem(plan)?.id === 'b', `next session = the first item not done`)
assert(planProgress(plan).done === 1 && planProgress(plan).total === 3, `progress counts what was done`)
assert(!planComplete(plan) && planComplete({ ...plan, items: plan.items.map((i) => ({ ...i, doneAt: 1 })) }), `complete only when every item is done`)
assert(nextPlanItem(null) === null && planProgress(null).total === 0, `no plan = no next session (the app proposes the library instead)`)
const weeks = byWeek(plan)
assert(weeks.length === 2 && weeks[0].items.length === 2, `items group by week, weeks in order`)
assert(repositioned([plan.items[2], plan.items[0]]).map((i) => i.position).join(',') === '0,1', `reordering renumbers densely`)
const sk = skeletonPlan('GL-ANX 1.1', 12)
assert(sk.length === PLAN_WEEKS && sk[12].week === 13, `the skeleton is ${PLAN_WEEKS} weeks, one session each`)
assert(sk.every((i) => !i.doneAt), `a fresh skeleton has nothing marked done`)

if (process.exitCode) { console.error('\nTEST FAILED'); process.exit(1) }
console.log('\nALL PASS')
