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

/* --- scheduling slot math --- */
import { expandOpenings, joinWindowOpen } from '../src/data/scheduling'
{
  // a Monday 09:00 weekly slot expands to future Mondays only, minus booked
  const now = new Date(2026, 6, 20, 8, 0).getTime() // Mon Jul 20 2026 08:00
  const slots = [{ weekday: 1, hhmm: '09:00' }, { weekday: 3, hhmm: '14:00' }]
  const open = expandOpenings(slots, [], now, 14)
  const dates = open.map((ms) => new Date(ms))
  assert(dates.every((d) => (d.getDay() === 1 && d.getHours() === 9) || (d.getDay() === 3 && d.getHours() === 14)), `openings land only on the template slots`)
  assert(open.length === 4, `two weekly slots × two weeks = 4 openings (got ${open.length})`)
  assert(open[0] === new Date(2026, 6, 20, 9, 0).getTime(), `same-day future slot included (Mon 09:00 today at 08:00)`)
  const monday9 = open[0]
  const minusBooked = expandOpenings(slots, [monday9], now, 14)
  assert(!minusBooked.includes(monday9) && minusBooked.length === 3, `a booked time disappears from the openings`)
  // past slots excluded
  const later = new Date(2026, 6, 20, 10, 0).getTime() // after 09:00
  assert(!expandOpenings(slots, [], later, 14).includes(monday9), `past occurrences never offered`)
}
{
  const appt = { id: 'x', therapistId: 'y', startsAtMs: new Date(2026, 6, 20, 9, 0).getTime(), durationMin: 50, status: 'booked' as const }
  const t0 = appt.startsAtMs
  assert(!joinWindowOpen(appt, t0 - 6 * 60000), `join closed 6 min before`)
  assert(joinWindowOpen(appt, t0 - 5 * 60000), `join OPENS exactly 5 min before (the therapist notice window)`)
  assert(joinWindowOpen(appt, t0 + 30 * 60000), `join stays open during the session`)
  assert(!joinWindowOpen(appt, t0 + 51 * 60000), `join closes after the end`)
}
console.log('scheduling checks done')
