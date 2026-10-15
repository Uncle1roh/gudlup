/* ============================================================================
   The saved Studio sessions survive every write that was not about them

   Every catalog write is a full-row upsert, so a column the caller forgot
   becomes null in the database. The question these assertions answer is the
   one that was asked out loud: can we lose the old Studio saved files?

   Run: npx esbuild tools/test-protect-authored.ts --bundle --platform=node \
          --format=cjs --define:import.meta.env={} --outfile=x.cjs && node x.cjs
   ============================================================================ */

import { preserveAuthored } from '../src/admin/protectAuthored'
import { removeDurationMaterial } from '../src/admin/protocolRemoval'
import { studioFor } from '../src/data/catalog'
import type { CatalogProtocol } from '../src/data/catalog'
import type { StudioProject } from '../src/compose/types'

let pass = 0
const fails: string[] = []
function assert(ok: boolean, what: string) {
  if (ok) { pass++; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

function session(name: string, lengthSec: number): StudioProject {
  return {
    name, lengthSec, masterGain: 0.8, savedAt: 1_760_000_000_000,
    tracks: [{ type: 'voice', name: 'Voce', volume: 1, clips: [{ startSec: 0, durationSec: 30, params: {} as never, text: name }] }],
  }
}

/* A protocol as the POs have left it after months: three time signatures,
   three Studio sessions, a cover, public naming, tags, attached audio. */
const stored: CatalogProtocol = {
  code: 'GL-ANX 1.1', family: 'GL-ANX',
  title: 'Calma e sicurezza', blurb: 'clinico',
  phases: [], enabled: true, source: 'imported', tenants: 'all', audioReady: true,
  updatedAt: 1_760_000_000_000,
  versions: [
    { duration: 6, lengthSeconds: 361, audioUrl: { it: 'https://cdn/6-it.mp3' } },
    { duration: 12, audioUrl: { it: 'https://cdn/12-it.mp3' } },
    { duration: 24, audioUrl: { it: 'https://cdn/24-it.mp3' } },
  ],
  studioByDuration: { 6: session('sei', 360), 12: session('dodici', 720), 24: session('ventiquattro', 1440) },
  plainByDuration: { 6: { code: 'GL-ANX 1.1', rows: [] } as never },
  plainImportedAt: { 6: 1_759_000_000_000 },
  assetMap: { music: {} } as never,
  coverUrl: 'https://cdn/cover.jpg',
  publicTitle: 'Un respiro', publicBlurb: 'Dieci minuti per te',
  i18n: { 'pt-BR': { publicTitle: 'Um respiro' } } as never,
  tags: ['sera', 'respiro'],
  offer: { kind: 'free' } as never,
  tier: 'amber',
}

/* What a spec or datasheet re-import builds: the document, and nothing else. */
const reimport: CatalogProtocol = {
  code: 'GL-ANX 1.1', family: 'GL-ANX',
  title: 'Calma e sicurezza (rev 2)', blurb: 'testo corretto',
  phases: [], enabled: true, source: 'imported', tenants: 'all', audioReady: false,
  updatedAt: 1_770_000_000_000,
  versions: [{ duration: 6 }, { duration: 12 }, { duration: 24 }],
  spec: { code: 'GL-ANX 1.1' } as never,
}

console.log('--- a re-import of a protocol that already exists ---')
const merged = preserveAuthored(stored, reimport)

assert(!!studioFor(merged, 6) && !!studioFor(merged, 12) && !!studioFor(merged, 24),
  'all three Studio sessions are still there after a full re-import')
assert(studioFor(merged, 24)?.name === 'ventiquattro', 'and they are the SAME sessions, not placeholders')
assert(!!merged.plainByDuration?.[6], 'the imported timelines survive')
assert(merged.plainImportedAt?.[6] === 1_759_000_000_000, 'so does the import stamp that decides which wins')
assert(!!merged.assetMap, 'the asset map survives')
assert(merged.coverUrl === 'https://cdn/cover.jpg', 'the uploaded cover survives')
assert(merged.publicTitle === 'Un respiro' && merged.publicBlurb === 'Dieci minuti per te', 'the public naming survives')
assert(!!merged.i18n?.['pt-BR'], 'and the translations of it')
assert(merged.tags?.length === 2, 'the tags survive')
assert(merged.offer?.kind === 'free' && merged.tier === 'amber', 'the offer and the clinical label survive')

console.log('\n--- what the import IS allowed to change ---')
assert(merged.title === 'Calma e sicurezza (rev 2)', 'the title it carries wins')
assert(merged.blurb === 'testo corretto', 'and the description')
assert(!!merged.spec, 'and the document it parsed')
assert(merged.updatedAt === 1_770_000_000_000, 'and the timestamp')

console.log('\n--- the attached audio ---')
assert(merged.versions.find((v) => v.duration === 24)?.audioUrl?.it === 'https://cdn/24-it.mp3',
  'a published file keeps playing after a re-import that rebuilt the versions list')
assert(merged.versions.find((v) => v.duration === 6)?.lengthSeconds === 361, 'with its real length')

console.log('\n--- a version the import drops, and one it adds ---')
const fewer = preserveAuthored(stored, { ...reimport, versions: [{ duration: 6 }] })
assert(fewer.versions.length === 1, 'the incoming list decides WHICH durations exist')
assert(fewer.versions[0].audioUrl?.it === 'https://cdn/6-it.mp3', 'and the one that stays keeps its audio')
const more = preserveAuthored(stored, { ...reimport, versions: [{ duration: 6 }, { duration: 12 }, { duration: 24 }, { duration: 6 }] })
assert(more.versions.length === 4, 'a duration the stored row never had is simply added')

console.log('\n--- a protocol that does not exist yet ---')
const brandNew = preserveAuthored(undefined, reimport)
assert(brandNew === reimport, 'nothing to protect, nothing changed')

console.log('\n--- an empty tag list is absence, not an instruction ---')
assert(preserveAuthored(stored, { ...reimport, tags: [] }).tags?.length === 2, 'empty tags do not erase the editorial ones')
assert(preserveAuthored(stored, { ...reimport, tags: ['notte'] }).tags?.join() === 'notte', 'but real tags replace them')

console.log('\n--- a REMOVAL is still a removal ---')
/* removeDurationMaterial names the thing it is emptying and saves directly,
   never through preserveAuthored. If it ever went through, this is what it
   would have to keep doing. */
const minus12 = removeDurationMaterial(stored, 12, 1_770_000_000_000)
assert(!studioFor(minus12, 12), 'the 12-minute session asked to go is gone')
assert(!!studioFor(minus12, 6) && !!studioFor(minus12, 24), 'and the other two are not')

console.log(`\n${pass} assertions passed.`)
if (fails.length) { console.log(`${fails.length} FAILED:`); for (const f of fails) console.log('  -', f); process.exit(1) }
