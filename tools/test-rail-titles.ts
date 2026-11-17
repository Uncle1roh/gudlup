/* ============================================================================
   A shelf can be named in every language — including one nobody has a
   dictionary for

   THE BUG THIS IS ABOUT. console → Scaffali della libreria prints, under
   each title, how that title will read in every language. For the shelves
   the app ships with it works: "Six minutes", "Calm", "New in the library"
   are English KEYS, the product dictionaries carry them, and the lines show
   "Sei minuti" and "Seis minutos". For a shelf somebody INVENTS it cannot
   work at all — no dictionary has ever seen "Pausas para a tarde" — so the
   page could only say there was no translation and that every language would
   read it as typed. Reported, correctly, as "it stops being able to
   translate, mostly when we create a new shelf".

   So a rail carries its own translations now, and the four things worth
   holding still are:

     · what somebody wrote for a language WINS, for any name at all;
     · a language left blank still falls back to the dictionary, which is
       what keeps the built-in shelves reading exactly as they did;
     · clearing a field REMOVES the override rather than storing an empty
       string — otherwise a shelf could be published with a blank title in
       one language, and the editor's unsaved-changes check would fire on a
       field somebody typed into and emptied again;
     · the editor and the two screens read through the same two functions,
       so the preview at the bottom of that page cannot disagree with what a
       person sees.
   ============================================================================ */

import { readFileSync } from 'node:fs'
import {
  railTitle, railSubtitle, withRailText, resolveRails,
  type ExploreRail,
} from '../src/data/rails'
import type { ResolvedSession } from '../src/data/liveCatalog'

let failed = 0
let checks = 0
function eq(label: string, got: unknown, want: unknown): void {
  checks++
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  if (a !== b) { failed++; console.log(`FAIL  ${label}\n      got  ${a}\n      want ${b}`) }
  else console.log(`ok  : ${label}`)
}
function assert(cond: boolean, label: string): void {
  checks++
  if (cond) console.log(`ok  : ${label}`)
  else { failed++; console.log(`FAIL  ${label}`) }
}

const rail = (over: Partial<ExploreRail>): ExploreRail => ({
  id: 'r1', title: '', slugs: [], enabled: true, position: 0, ...over,
})

/* ---- a shelf the dictionaries know: unchanged -------------------------- */

const builtin = rail({ title: 'Six minutes', subtitle: 'When that is all you have' })
eq('built-in title, Italian', railTitle(builtin, 'it'), 'Sei minuti')
eq('built-in title, Portuguese', railTitle(builtin, 'pt-BR'), 'Seis minutos')
assert(railSubtitle(builtin, 'it') !== builtin.subtitle, 'built-in subtitle is translated too')

/* ---- a shelf somebody invented: the dictionaries cannot help ----------- */

const invented = rail({ title: 'Pausas para a tarde' })
eq('invented title falls through to itself in Italian', railTitle(invented, 'it'), 'Pausas para a tarde')
eq('…and in Portuguese', railTitle(invented, 'pt-BR'), 'Pausas para a tarde')
eq('no subtitle means no subtitle', railSubtitle(invented, 'it'), undefined)

/* ---- …until somebody writes one --------------------------------------- */

const written = withRailText(invented, 'it', 'title', 'Pause del pomeriggio')
eq('what was written is what Italian reads', railTitle(written, 'it'), 'Pause del pomeriggio')
eq('the language nobody wrote still falls back', railTitle(written, 'pt-BR'), 'Pausas para a tarde')
eq('the source string is untouched', written.title, 'Pausas para a tarde')
assert(invented.i18n === undefined, 'the rail passed in was not mutated')

/* An override beats the dictionary, which is the point: a shelf named with
   an English key can still be called something else in one language. */
const renamed = withRailText(builtin, 'it', 'title', 'Sei minuti e via')
eq('an override beats the dictionary', railTitle(renamed, 'it'), 'Sei minuti e via')
eq('…in that language only', railTitle(renamed, 'pt-BR'), 'Seis minutos')

/* ---- clearing removes, and prunes ------------------------------------- */

const two = withRailText(withRailText(invented, 'it', 'title', 'A'), 'it', 'subtitle', 'B')
eq('both fields stored', two.i18n?.it, { title: 'A', subtitle: 'B' })
const oneLeft = withRailText(two, 'it', 'title', '   ')
eq('a cleared field is gone, the other stays', oneLeft.i18n?.it, { subtitle: 'B' })
const none = withRailText(oneLeft, 'it', 'subtitle', '')
eq('an empty language is pruned', none.i18n, undefined)
assert(!('i18n' in none), 'and the key itself is removed, so the editor sees no change')

/* Two languages do not disturb each other. */
const both = withRailText(withRailText(invented, 'it', 'title', 'IT'), 'pt-BR', 'title', 'PT')
eq('Italian', railTitle(both, 'it'), 'IT')
eq('Portuguese', railTitle(both, 'pt-BR'), 'PT')
const dropIt = withRailText(both, 'it', 'title', '')
eq('dropping one leaves the other', dropIt.i18n, { 'pt-BR': { title: 'PT' } })

/* ---- the translations survive the trip to the screen ------------------ */

const session = { slug: 's1', available: true, durations: [6] } as unknown as ResolvedSession
const resolved = resolveRails([{ ...both, slugs: ['s1'] }], [session])
eq('resolveRails carries i18n through', resolved[0]?.i18n, both.i18n)
eq('…so the screen can pick the language', railTitle(resolved[0], 'pt-BR'), 'PT')

/* ---- one lookup, three places ----------------------------------------- */
/* The editor's preview, the Home rails and the library's shelves must read
   a title the same way; three copies of this rule is how the preview starts
   lying about what a person sees. */
const editor = readFileSync('src/admin/ExploreRails.tsx', 'utf8')
const home = readFileSync('src/ui2/Home.tsx', 'utf8')
const catalog = readFileSync('src/selfuse/Catalog.tsx', 'utf8')
for (const [what, src] of [['the editor preview', editor], ['Home', home], ['the library', catalog]] as const) {
  assert(/railTitle\(/.test(src), `${what} reads the title through railTitle`)
  assert(!/\btc\(r?a?i?l?\.?title\)/.test(src), `${what} no longer translates a shelf name as product copy`)
}
assert(/withRailText\(x, code, 'title'/.test(editor), 'the editor writes the title override')
assert(/withRailText\(x, code, 'subtitle'/.test(editor), 'the editor writes the subtitle override')
assert(/placeholder=\{fallback\}/.test(editor), 'each language field shows the fallback as its placeholder')

console.log(`\n${checks} assertions, ${failed} failed`)
console.log(failed ? '\nFAILED' : '\ndone.')
if (failed) process.exitCode = 1
