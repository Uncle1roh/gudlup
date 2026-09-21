/* ============================================================================
   The shelf on the Home screen

   Rails used to be written in code. They are rows an admin edits now, and the
   rules that matter are the ones that keep a bad edit from emptying a
   person's library: no rails means the built-in shelf, a session that left
   the catalog is skipped, and a rail left with nothing in it is not rendered.

       npx esbuild tools/test-explore-rails.ts --bundle --platform=node \
         --format=esm --outfile=<tmp>/er.mjs && node <tmp>/er.mjs
   ============================================================================ */

import { defaultRails, railsFromDefaults, resolveRails, type ExploreRail } from '../src/data/rails'
import type { ResolvedSession } from '../src/data/liveCatalog'

let pass = 0
const fails: string[] = []
function assert(cond: boolean, what: string): void {
  if (cond) { pass += 1; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

const s = (slug: string, theme: string, durations: number[], fromCatalog = false): ResolvedSession =>
  ({ slug, name: slug, theme, durations, fromCatalog, available: true, audioReady: true } as unknown as ResolvedSession)

const library = [
  s('calma', 'calm', [6, 12, 24]),
  s('respiro', 'calm', [6, 12]),
  s('focus-1', 'focus', [12, 24], true),
  s('energia', 'energy', [6]),
]

/* --------------------------------------------------------- the default --- */
console.log('\n--- with nothing stored ---')
const built = defaultRails(library)
assert(built.length > 0, 'the built-in shelf is not empty')
assert(built[0].id === 'quick', 'it opens on the six-minute rail')
assert(resolveRails(null, library).length === built.length, 'null rails resolve to the built-in shelf')
assert(resolveRails([], library).length === built.length, 'and so does an empty set — publishing nothing is not publishing a blank Home')
assert(defaultRails([]).length === 0, 'an empty library has no rails at all')

/* ---------------------------------------------------------- the stored --- */
console.log('\n--- with a shelf an admin arranged ---')
const stored: ExploreRail[] = [
  { id: 'r2', title: 'Second', slugs: ['energia'], enabled: true, position: 1 },
  { id: 'r1', title: 'First', subtitle: 'on top', slugs: ['calma', 'respiro'], enabled: true, position: 0 },
]
const out = resolveRails(stored, library)
assert(out.map((r) => r.title).join() === 'First,Second', 'rails render in the stored order, not the array order')
assert(out[0].subtitle === 'on top', 'the subtitle is carried')
assert(out[0].items.map((x) => x.slug).join() === 'calma,respiro', 'sessions keep the order the admin put them in')

/* ------------------------------------------------ what a bad edit cannot do */
console.log('\n--- what cannot happen ---')
const withGhost = resolveRails(
  [{ id: 'r', title: 'Has a ghost', slugs: ['calma', 'deleted-protocol'], enabled: true, position: 0 }],
  library,
)
assert(withGhost[0].items.length === 1, 'a slug that left the catalog is skipped rather than rendered empty')

const allGhosts = resolveRails(
  [{ id: 'r', title: 'All gone', slugs: ['deleted-1', 'deleted-2'], enabled: true, position: 0 }],
  library,
)
assert(allGhosts.length === built.length, 'a shelf whose sessions have all gone falls back to the built-in one')

const hidden = resolveRails(
  [
    { id: 'a', title: 'Shown', slugs: ['calma'], enabled: true, position: 0 },
    { id: 'b', title: 'Hidden', slugs: ['respiro'], enabled: false, position: 1 },
  ],
  library,
)
assert(hidden.length === 1 && hidden[0].title === 'Shown', 'a disabled rail is not rendered')

const emptied = resolveRails([{ id: 'a', title: 'Nothing in it', slugs: [], enabled: true, position: 0 }], library)
assert(emptied.length === built.length, 'a rail with no sessions cannot become the whole shelf')

/* ------------------------------------------------- the editor's starting point */
console.log('\n--- the editor opens on what people are seeing ---')
const seeded = railsFromDefaults(library)
assert(seeded.length === built.length, 'the built-in shelf writes out as editable rows')
assert(seeded.every((r) => r.enabled && r.slugs.length > 0), 'every one of them is enabled and populated')
assert(
  resolveRails(seeded, library).map((r) => r.title).join() === built.map((r) => r.title).join(),
  'and saving them unchanged produces exactly the shelf that was there',
)

console.log(`\n${pass} passed, ${fails.length} failed`)
if (fails.length) { for (const f of fails) console.log('  -', f); throw new Error('explore rails tests failed') }
