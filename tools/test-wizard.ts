/* Node proof for the B2C wizard routing data: every spec table row present,
   every code resolvable in the protocol registry, alternatives valid,
   tired-clarification and maintenance route correct. */
import { CLUSTER_SPECS, MAINTENANCE_ROUTE, PINPOINT_OPTIONS, TIRED_OPTIONS } from '../src/data/wizard'
import { PROTOCOLS } from '../src/data/protocols'

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else console.log(`ok  : ${msg}`)
}

const codes = new Set(PROTOCOLS.map((p) => p.code))
assert(codes.size === 25, `registry holds all 25 protocols (got ${codes.size})`)

assert(PINPOINT_OPTIONS.length === 7, `Q1: 7 pinpoint options`)
assert(PINPOINT_OPTIONS[5].id === 'tired' && PINPOINT_OPTIONS[6].id === 'maintenance', `tired + maintenance in place`)
assert(TIRED_OPTIONS.map((o) => o.id).join(',') === 'burnout,depression,stress', `tired clarifies to Burnout / Depression / Stress`)

// the spec's five tables, primary+alternative per row
const EXPECT: Record<string, [string, string][]> = {
  anxiety: [['GL-ANX 1.3', 'GL-ANX 1.1'], ['GL-ANX 1.1', 'GL-ANX 1.3'], ['GL-ANX 1.2', 'GL-ANX 1.5'], ['GL-ANX 1.4', 'GL-ANX 1.1'], ['GL-ANX 1.5', 'GL-ANX 1.2']],
  stress: [['GL-STRESS 4.1', 'GL-STRESS 4.2'], ['GL-STRESS 4.2', 'GL-STRESS 4.5'], ['GL-STRESS 4.3', 'GL-STRESS 4.2'], ['GL-STRESS 4.4', 'GL-STRESS 4.3'], ['GL-STRESS 4.5', 'GL-STRESS 4.2']],
  depression: [['GL-DEP 2.1', 'GL-DEP 2.4'], ['GL-DEP 2.2', 'GL-DEP 2.1'], ['GL-DEP 2.3', 'GL-DEP 2.2'], ['GL-DEP 2.4', 'GL-DEP 2.1'], ['GL-DEP 2.5', 'GL-DEP 2.1']],
  burnout: [['GL-BURN 3.1', 'GL-BURN 3.3'], ['GL-BURN 3.2', 'GL-BURN 3.1'], ['GL-BURN 3.3', 'GL-BURN 3.1'], ['GL-BURN 3.4', 'GL-BURN 3.5'], ['GL-BURN 3.5', 'GL-BURN 3.4']],
  resilience: [['GL-RESIL 5.1', 'GL-RESIL 5.2'], ['GL-RESIL 5.2', 'GL-RESIL 5.3'], ['GL-RESIL 5.3', 'GL-DEP 2.2'], ['GL-RESIL 5.4', 'GL-DEP 2.3'], ['GL-RESIL 5.5', 'GL-RESIL 5.3']],
}

for (const spec of CLUSTER_SPECS) {
  const want = EXPECT[spec.cluster]
  assert(!!want && spec.options.length === 5, `${spec.cluster}: 5 clarify options`)
  spec.options.forEach((o, i) => {
    assert(o.primary.code === want[i][0] && o.alternative.code === want[i][1], `${spec.cluster} row ${i + 1}: ${o.primary.code} → alt ${o.alternative.code}`)
    assert(codes.has(o.primary.code) && codes.has(o.alternative.code), `${spec.cluster} row ${i + 1}: both codes resolve in the registry`)
    assert(o.primary.code !== o.alternative.code, `${spec.cluster} row ${i + 1}: alternative differs from primary`)
  })
}

assert(codes.has(MAINTENANCE_ROUTE.primary.code), `maintenance route resolves (${MAINTENANCE_ROUTE.primary.code})`)

// cross-family fallbacks the spec deliberately uses (RESIL → DEP)
assert(CLUSTER_SPECS.find((c) => c.cluster === 'resilience')!.options[2].alternative.code === 'GL-DEP 2.2', `RESIL 5.3 falls back to DEP 2.2 (spec's cross-family link)`)

if (process.exitCode) { console.error('\nTEST FAILED'); process.exit(1) }
console.log('\nALL PASS')

/* --- the protocol project (family pathway + progression) --- */
import { buildProgramCodes } from '../src/data/program'
{
  const fromEntry = buildProgramCodes('GL-ANX 1.3')
  assert(fromEntry.join(' | ') === 'GL-ANX 1.3 | GL-ANX 1.4 | GL-ANX 1.5 | GL-ANX 1.1 | GL-ANX 1.2', `entry 1.3 → 1.3, 1.4, 1.5, wrap 1.1, 1.2`)
  const fromOne = buildProgramCodes('GL-DEP 2.1')
  assert(fromOne.join(' | ') === 'GL-DEP 2.1 | GL-DEP 2.2 | GL-DEP 2.3 | GL-DEP 2.4 | GL-DEP 2.5', `entry 2.1 → straight 2.1…2.5`)
  assert(buildProgramCodes('GL-STRESS 4.5').length === 5 && buildProgramCodes('GL-STRESS 4.5')[1] === 'GL-STRESS 4.1', `entry 4.5 wraps to 4.1`)
  assert(fromEntry.every((c) => codes.has(c)), `every pathway code resolves in the registry`)
}
console.log('program checks done')
