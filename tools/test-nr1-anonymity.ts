/* Privacy proof for the NR-1 employer report.

   CLAUDE.md is binding here: "NR-1 reporting: aggregates only, k-anonymity
   suppression. No individual records reach the client (NR-1 + LGPD)." The
   suppression that existed hid a small TEAM's split but published everything
   around it, which is not the same thing. These are the attacks that got
   through, each now a test:

     1. Tiny cycle. With 1-4 respondents the "aggregate" IS the individuals —
        with one respondent, `overall` was that person's risk profile.
     2. Differencing. One suppressed team + the company total + every other
        team = the hidden split by subtraction.
     3. Exact small counts. "Team X: 1 respondent" next to a total is another
        subtraction.
     4. Trend and per-dimension cells had no k test at all, so a one-person
        cycle plotted that person at 0 % or 100 %.

   Run: npx esbuild tools/test-nr1-anonymity.ts --bundle --platform=node \
          --format=esm --outfile=<tmp>/nr1.mjs && node <tmp>/nr1.mjs         */

import { aggregate } from '../src/employer/aggregate'
import { PSYCHOSOCIAL_DIMENSIONS, OUTCOME_KEYS, type PsychosocialResponse } from '../src/employer/assessment'
import type { BandSplit, RiskBand } from '../src/employer/types'

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else console.log(`ok  : ${msg}`)
}

const K = 5
const OPTS = { company: 'Acme', eligible: 500, minCellSize: K }
const total = (s: BandSplit) => s.low + s.moderate + s.high

/** A respondent whose dimensions are all `band`, so their overall band is known. */
function person(team: string, period: string, band: RiskBand, elevated = false): PsychosocialResponse {
  const dims: Record<string, RiskBand> = {}
  for (const d of PSYCHOSOCIAL_DIMENSIONS) dims[d.key] = band
  const outcomes: Record<string, boolean> = {}
  for (const k of OUTCOME_KEYS) outcomes[k] = elevated
  return { profileId: `${team}-${Math.random()}`, team, period, dims, outcomes } as unknown as PsychosocialResponse
}
const many = (n: number, team: string, period: string, band: RiskBand) =>
  Array.from({ length: n }, () => person(team, period, band))

/* ---- 1. a cycle below k publishes nothing but the headcount ------------- */
for (const n of [1, 2, 4]) {
  const r = aggregate(many(n, 'Solo', 'Q1 2026', 'high'), OPTS)
  assert(r.suppressed === true, `${n} respondent(s): the whole report is flagged suppressed`)
  assert(total(r.overall) === 0, `${n} respondent(s): the overall split is withheld, not published`)
  assert(r.teams.length === 0, `${n} respondent(s): no team rows at all`)
  assert(r.trend.length === 0, `${n} respondent(s): no trend points`)
  assert(r.dimensions.every((d) => d.suppressed && total(d.split) === 0), `${n} respondent(s): every dimension is withheld`)
  assert(r.respondents === n, `${n} respondent(s): the headcount itself is still reported (it identifies nobody)`)
}
const atK = aggregate(many(K, 'Solo', 'Q1 2026', 'high'), OPTS)
assert(!atK.suppressed && total(atK.overall) === K, `exactly k respondents: the report is published`)

/* ---- 2. a lone small team must not be recoverable by subtraction -------- */
{
  const rows = [
    ...many(20, 'Engineering', 'Q1 2026', 'low'),
    ...many(12, 'Sales', 'Q1 2026', 'moderate'),
    ...many(2, 'Legal', 'Q1 2026', 'high'), // the one small team
  ]
  const r = aggregate(rows, OPTS)
  const shown = r.teams.filter((t) => !t.suppressed)
  const hidden = r.teams.filter((t) => t.suppressed)
  assert(hidden.length >= 2, `a lone small team drags a second team into suppression (${hidden.length} hidden)`)

  // the actual attack: total minus everything published
  const residual = { low: r.overall.low, moderate: r.overall.moderate, high: r.overall.high }
  for (const s of shown) {
    if (!s.split) continue
    residual.low -= s.split.low; residual.moderate -= s.split.moderate; residual.high -= s.split.high
  }
  assert(total(residual) > 0, 'there IS a residual to attribute (the subtraction is possible in principle)')
  /* The property that matters: the residual covers 2+ teams, so it cannot be
     assigned to any one of them. With a single hidden team the subtraction
     would name that team's split exactly. */
  assert(hidden.length >= 2, 'the residual spans at least two hidden teams, so no single team is pinned down')
  assert(!hidden.some((t) => t.split), 'no suppressed team leaks a split object')
  assert(new Set(hidden.map((t) => t.respondents)).size === 1,
    'every hidden team reports the SAME banded count, so the number says nothing about which is which')
}

/* ---- 2b. two hidden teams are not enough if they hide too FEW people ---- */
{
  // 2 + 1 hidden = a 3-person residual, still under k even across two teams
  const rows = [
    ...many(30, 'Engineering', 'Q1 2026', 'low'),
    ...many(20, 'Sales', 'Q1 2026', 'moderate'),
    ...many(2, 'Legal', 'Q1 2026', 'high'),
    ...many(1, 'Facilities', 'Q1 2026', 'high'),
  ]
  const r = aggregate(rows, OPTS)
  const hidden = r.teams.filter((t) => t.suppressed)
  const shown = r.teams.filter((t) => !t.suppressed)
  const hiddenHeads = rows.length - shown.reduce((a, s) => a + s.respondents, 0)
  assert(hiddenHeads >= K,
    `the hidden group covers at least k real people (${hiddenHeads} >= ${K}), so the residual names no sub-k group`)
  assert(hidden.length >= 2, 'and it still spans at least two teams')
}

/* ---- 2c. too few teams to hide behind → publish no team detail at all --- */
{
  const rows = [...many(30, 'Engineering', 'Q1 2026', 'low'), ...many(1, 'Legal', 'Q1 2026', 'high')]
  const r = aggregate(rows, OPTS)
  assert(r.teams.every((t) => t.suppressed),
    'with only one publishable team, every team row is suppressed rather than leaving one derivable')
}

/* ---- 3. suppressed counts are banded, never exact ---------------------- */
{
  const rows = [
    ...many(20, 'Engineering', 'Q1 2026', 'low'),
    ...many(12, 'Sales', 'Q1 2026', 'moderate'),
    ...many(1, 'Legal', 'Q1 2026', 'high'),
  ]
  const r = aggregate(rows, OPTS)
  const legal = r.teams.find((t) => t.team === 'Legal')!
  assert(legal.suppressed, 'a one-person team is suppressed')
  assert(legal.respondents !== 1, `its exact count is NOT published (got ${legal.respondents}, not 1)`)
  assert(legal.respondents < K, 'the count is reported as a band under k')
}

/* ---- 4. thin cycles never reach the trend ------------------------------ */
{
  const rows = [
    ...many(1, 'A', 'Q1 2026', 'high'),   // one person — would plot at 100 %
    ...many(30, 'A', 'Q2 2026', 'low'),
  ]
  const r = aggregate(rows, OPTS)
  assert(r.trend.length === 1, 'the one-person cycle is dropped from the trend')
  assert(r.trend[0].period === 'Q2 2026', 'only the publishable cycle is plotted')
  assert(!r.trend.some((p) => p.highPct === 100), 'no trend point is a single person at 100 %')
}

/* ---- 5. a thinly-answered DIMENSION is its own small cell --------------- */
{
  // 30 people, but only 2 answered the first dimension
  const rows = many(30, 'A', 'Q1 2026', 'low')
  const thin = PSYCHOSOCIAL_DIMENSIONS[0].key
  rows.forEach((r, i) => { if (i >= 2) delete (r.dims as Record<string, RiskBand>)[thin] })
  const r = aggregate(rows, OPTS)
  const d = r.dimensions.find((x) => x.key === thin)!
  assert(d.suppressed === true, 'a dimension only 2 people answered is suppressed')
  assert(total(d.split) === 0, 'and its split is zeroed rather than published')
  assert(r.dimensions.filter((x) => x.key !== thin).every((x) => !x.suppressed), 'the well-answered dimensions still publish')
}

/* ---- 6. a blank response must not count as low risk -------------------- */
{
  const good = many(10, 'A', 'Q1 2026', 'high')
  const blank = many(5, 'A', 'Q1 2026', 'high').map((r) => ({ ...r, dims: {} }))
  const r = aggregate([...good, ...blank], OPTS)
  assert(r.overall.low === 0, 'responses with no dimension data are excluded, not banded low')
  assert(total(r.overall) === 10, 'only the 10 real responses are counted in the overall split')
}

/* ---- 7. the delta must not leak a suppressed previous cycle ------------- */
{
  const rows = [
    ...many(2, 'A', 'Q1 2026', 'high'),  // previous cycle, below k
    ...many(30, 'A', 'Q2 2026', 'low'),
  ]
  const r = aggregate(rows, OPTS)
  assert(r.outcomes.every((o) => o.deltaPct === 0),
    'with an unpublishable previous cycle the delta is 0, not a number the reader can invert')
}

/* ---- 8. nothing in the payload is a person ----------------------------- */
{
  const rows = [...many(20, 'A', 'Q1 2026', 'low'), ...many(8, 'B', 'Q1 2026', 'high')]
  const r = aggregate(rows, OPTS)
  const json = JSON.stringify(r)
  assert(!/profileId/i.test(json), 'no profileId reaches the report')
  assert(!/@/.test(json), 'no email-looking string reaches the report')
  const ids = rows.map((x) => (x as unknown as { profileId: string }).profileId)
  assert(!ids.some((id) => json.includes(id)), 'no respondent identifier appears anywhere in the payload')
}
