/* ============================================================================
   A library with nothing published shows nothing

   Lucas asked why the Home has protocol cards when no protocol has been
   published yet. The answer is that it does not — in a real environment.
   `playableDurations` offers a length only when a rendered file exists for
   it; the declared-durations fallback is reached ONLY for a seed protocol in
   an install with no Supabase, which is the preview and the local demo.

   This pins both ends of that branch so the rule cannot drift:

       npx esbuild tools/test-empty-library.ts --bundle --platform=node \
         --format=cjs --define:import.meta.env={} --outfile=<tmp>/el.cjs \
         && node <tmp>/el.cjs
   ============================================================================ */

import { playableDurations, hasRenderedAudio } from '../src/data/liveCatalog'
import type { CatalogProtocol } from '../src/data/catalog'

let pass = 0
const fails: string[] = []
function assert(cond: boolean, what: string): void {
  if (cond) { pass += 1; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

/* A seeded protocol as the app ships it: three lengths declared, not one
   rendered. Exactly what the catalogue holds before the POs publish. */
const unpublished = {
  code: 'GL-CALM 1.1',
  source: 'seed',
  enabled: true,
  versions: [
    { duration: 6, audioUrl: {} },
    { duration: 12, audioUrl: {} },
    { duration: 24, audioUrl: {} },
  ],
} as unknown as CatalogProtocol

/* The same protocol once a mixdown exists for one length, in one form. */
const published = {
  ...unpublished,
  versions: [
    { duration: 6, audioUrl: { 'pt-BR': 'https://example.test/6.mp3' } },
    { duration: 12, audioUrl: {} },
    { duration: 24, audioUrl: {} },
  ],
} as unknown as CatalogProtocol

const reader = { lang: 'pt-BR', addressee: 'm' } as never

console.log('\n--- with no audio published ---')
assert(!hasRenderedAudio(unpublished, reader), 'nothing is rendered for this person')
assert(playableDurations(published, reader).length === 1, 'a published length is the only one offered')

console.log('\n--- the fallback is the preview, and only the preview ---')
/* `import.meta.env` is defined away to `{}` by the test build, so
   `hasSupabaseEnv()` is false here: this IS the preview case. */
assert(
  playableDurations(unpublished, reader).length === 3,
  'with no Supabase, a SEED protocol falls back to its declared lengths — the demo has something to show',
)
assert(
  playableDurations({ ...unpublished, source: 'console' } as unknown as CatalogProtocol, reader).length === 0,
  'a protocol that came from the console gets no fallback, even in the preview',
)

console.log('\n--- what the person would be shown ---')
assert(
  playableDurations({ ...published, versions: [{ duration: 6, audioUrl: { it: 'x' } }] } as unknown as CatalogProtocol, reader).length === 0,
  'a file in somebody else’s language offers nothing: files exist, none for this reader',
)

console.log(`\n${pass} passed, ${fails.length} failed`)
if (fails.length) { for (const f of fails) console.log('  -', f); process.exit(1) }
