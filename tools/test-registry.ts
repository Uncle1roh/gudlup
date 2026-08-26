/* ============================================================================
   The runtime protocol registry

   The bug: `getProtocol('GL-ANX 1.1')` answered even when the catalog had no
   such protocol. The registry is seeded at module load with the 25 static
   PROTOCOLS baked into the bundle, and hydration only ever ADDED to it — so a
   protocol deleted from the database, disabled by an admin, or halfway through
   a re-import still resolved, silently, to a static seed carrying six generic
   phases and no audio.

   `supabase/setup.sql` deletes every `source = 'seed'` row from the database,
   which makes the gap wider still: the server has none of them and the browser
   has all of them.

       npx esbuild tools/test-registry.ts --bundle --platform=node \
         --format=esm --outfile=<tmp>/r.mjs && node <tmp>/r.mjs
   ============================================================================ */

import {
  PROTOCOLS,
  getProtocol,
  allProtocols,
  registerProtocol,
  registerProtocols,
  syncProtocols,
  resetProtocolRegistry,
  type Protocol,
} from '../src/data/protocols'

let pass = 0
const fails: string[] = []
function assert(cond: boolean, what: string): void {
  if (cond) { pass += 1; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

function proto(code: string, title = code): Protocol {
  return {
    code,
    family: code.split(' ')[0],
    title,
    blurb: '',
    phases: [{ name: 'Opening', fraction: 1 }],
    versions: [{ duration: 12 }],
  } as Protocol
}

/* --------------------------------------------------------- the ghost ----- */
console.log('\n--- what the registry starts with ---')

resetProtocolRegistry()
assert(getProtocol('GL-ANX 1.1') !== undefined, 'the static seeds are resolvable before any catalog loads')
assert(allProtocols().length === PROTOCOLS.length, 'and nothing else is')

/* This is the bug, reproduced: adding does not remove. */
registerProtocols([proto('GL-ANX 1.3')])
assert(
  getProtocol('GL-ANX 1.1') !== undefined,
  'registerProtocols only ADDS — a seed the catalog never mentioned survives it',
)

/* ------------------------------------------------------------- the fix --- */
console.log('\n--- syncing makes the catalog authoritative ---')

resetProtocolRegistry()
syncProtocols([proto('GL-ANX 1.3'), proto('GL-STRESS 4.1')])

assert(getProtocol('GL-ANX 1.3') !== undefined, 'what the catalog has, resolves')
assert(getProtocol('GL-STRESS 4.1') !== undefined, 'all of it')
assert(
  getProtocol('GL-ANX 1.1') === undefined,
  'a protocol the catalog does NOT have stops resolving — no more ghost 1.1',
)
assert(getProtocol('GL-ANX 1.2') === undefined, 'and no more ghost 1.2')
assert(allProtocols().length === 2, 'the registry holds exactly the catalog, nothing more')

/* A re-import must not be shadowed by the seed it replaces. */
resetProtocolRegistry()
const reimported = proto('GL-ANX 1.1', 'Grounded Calm, re-imported')
syncProtocols([reimported])
assert(getProtocol('GL-ANX 1.1')?.title === 'Grounded Calm, re-imported', 'a re-imported protocol wins over its own seed')
assert(getProtocol('GL-ANX 1.1')?.phases.length === 1, 'including its phases, not the seed six')

/* --------------------------------------------------- the empty catalog --- */
console.log('\n--- an empty answer is not an empty catalog ---')

resetProtocolRegistry()
syncProtocols([])
assert(
  getProtocol('GL-ANX 1.1') !== undefined,
  'an empty list is ignored — it is a permissions or connectivity failure far more often than a real empty catalog',
)
assert(allProtocols().length === PROTOCOLS.length, 'so the registry is left exactly as it was')

/* ------------------------------------------------- publishing in-session -- */
console.log('\n--- a protocol published while the app is open ---')

resetProtocolRegistry()
syncProtocols([proto('GL-ANX 1.3')])
registerProtocol(proto('GL-ANX 1.9', 'Just published'))
assert(getProtocol('GL-ANX 1.9')?.title === 'Just published', 'is resolvable immediately, without a refetch')
assert(getProtocol('GL-ANX 1.3') !== undefined, 'and does not disturb what the catalog already gave us')

/* The next hydration is still authoritative over it. */
syncProtocols([proto('GL-ANX 1.3'), proto('GL-ANX 1.9', 'Just published')])
assert(allProtocols().length === 2, 'the following refetch replaces the lot')

resetProtocolRegistry()

console.log(`\n${pass} assertions passed.`)
if (fails.length) {
  console.log(`${fails.length} FAILED:`)
  for (const f of fails) console.log('  -', f)
  process.exit(1)
}
