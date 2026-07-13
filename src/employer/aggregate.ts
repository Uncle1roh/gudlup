/* ============================================================================
   Good Loop — NR-1 aggregation (pure)
   Computes the employer Nr1Report from many individual PsychosocialResponses:
   overall risk, per-dimension splits, outcome prevalence with cycle-over-cycle
   delta, per-team breakdown with k-anonymity suppression, and the high-risk
   trend. This is the reference for the SECURITY DEFINER SQL function of the
   same name — the mock runs this so "submit an assessment → the employer number
   moves" is real, not staged.
   ============================================================================ */

import type { Nr1Report, BandSplit, DimensionRisk, RiskBand } from './types'
import { PSYCHOSOCIAL_DIMENSIONS, OUTCOME_KEYS, type PsychosocialResponse } from './assessment'

const OUTCOME_LABEL: Record<string, string> = { stress: 'Perceived stress', anxiety: 'Anxiety symptoms', burnout: 'Burnout risk' }

function emptySplit(): BandSplit { return { low: 0, moderate: 0, high: 0 } }
function bump(s: BandSplit, b: RiskBand) { s[b] += 1 }
function round(n: number) { return Math.round(n) }
function pctOf(part: number, total: number) { return total > 0 ? round((part / total) * 100) : 0 }

/** Chronological rank for a "Q<n> YYYY" period label. */
function periodRank(p: string): number {
  const m = /Q([1-4])\s+(\d{4})/.exec(p)
  if (!m) return 0
  return Number(m[2]) * 4 + (Number(m[1]) - 1)
}

/** Each respondent's overall band, derived from their dimension bands. */
function overallBand(dims: Record<string, RiskBand>): RiskBand {
  const vals = Object.values(dims)
  const highs = vals.filter((b) => b === 'high').length
  const mods = vals.filter((b) => b === 'moderate').length
  if (highs >= 3) return 'high'
  if (highs >= 1 || mods >= 4) return 'moderate'
  return 'low'
}

export interface AggregateOpts {
  company: string
  eligible: number
  minCellSize: number
}

export function aggregate(all: PsychosocialResponse[], opts: AggregateOpts): Nr1Report {
  const periods = [...new Set(all.map((r) => r.period))].sort((a, b) => periodRank(a) - periodRank(b))
  const current = periods[periods.length - 1] ?? '—'
  const cur = all.filter((r) => r.period === current)
  const respondents = cur.length

  // overall
  const overall = emptySplit()
  for (const r of cur) bump(overall, overallBand(r.dims))

  // dimensions
  const dimensions: DimensionRisk[] = PSYCHOSOCIAL_DIMENSIONS.map((d) => {
    const split = emptySplit()
    for (const r of cur) { const b = r.dims[d.key]; if (b) bump(split, b) }
    return { key: d.key, label: d.label, about: d.about, split }
  })

  // outcomes with delta vs previous cycle
  const prevPeriod = periods[periods.length - 2]
  const prev = prevPeriod ? all.filter((r) => r.period === prevPeriod) : []
  const outcomes = OUTCOME_KEYS.map((k) => {
    const elevated = pctOf(cur.filter((r) => r.outcomes[k]).length, respondents)
    const prevElevated = prev.length ? pctOf(prev.filter((r) => r.outcomes[k]).length, prev.length) : elevated
    return { key: k, label: OUTCOME_LABEL[k] ?? k, elevatedPct: elevated, deltaPct: elevated - prevElevated }
  })

  // teams with k-anonymity suppression
  const teamNames = [...new Set(cur.map((r) => r.team))].sort()
  const teams = teamNames.map((team) => {
    const rows = cur.filter((r) => r.team === team)
    if (rows.length < opts.minCellSize) return { team, respondents: rows.length, suppressed: true }
    const split = emptySplit()
    for (const r of rows) bump(split, overallBand(r.dims))
    return { team, respondents: rows.length, suppressed: false, split }
  })

  // trend across cycles
  const trend = periods.map((p) => {
    const rows = all.filter((r) => r.period === p)
    const high = rows.filter((r) => overallBand(r.dims) === 'high').length
    return { period: p, highPct: pctOf(high, rows.length) }
  })

  return {
    company: opts.company,
    period: current,
    eligible: opts.eligible,
    respondents,
    minCellSize: opts.minCellSize,
    overall,
    dimensions,
    outcomes,
    teams,
    trend,
    generatedAt: Date.now(),
  }
}
