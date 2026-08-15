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

/** Each respondent's overall band, derived from their dimension bands.
    Returns null for a response carrying no dimension data — it must NOT be
    counted as 'low', which would quietly pull the company's risk down. */
function overallBand(dims: Record<string, RiskBand>): RiskBand | null {
  const vals = Object.values(dims).filter(Boolean)
  if (!vals.length) return null
  const highs = vals.filter((b) => b === 'high').length
  const mods = vals.filter((b) => b === 'moderate').length
  if (highs >= 3) return 'high'
  if (highs >= 1 || mods >= 4) return 'moderate'
  return 'low'
}

/** Total of a band split — the denominator every percentage here must use. */
function splitTotal(s: BandSplit): number {
  return s.low + s.moderate + s.high
}

export interface AggregateOpts {
  company: string
  eligible: number
  minCellSize: number
}

export function aggregate(all: PsychosocialResponse[], opts: AggregateOpts): Nr1Report {
  const k = Math.max(1, opts.minCellSize)
  const periods = [...new Set(all.map((r) => r.period))].sort((a, b) => periodRank(a) - periodRank(b))
  const current = periods[periods.length - 1] ?? '—'
  const cur = all.filter((r) => r.period === current)
  const respondents = cur.length

  /* ---- gate 1: the WHOLE cycle, not just the cells -----------------------
     Suppressing per-team while publishing everything else is no protection at
     all when the company total is itself tiny: with three respondents the
     "aggregate" IS three people, and with one it is a named individual's risk
     profile. Below k, nothing but the headcount leaves this function. */
  if (respondents < k) {
    return {
      company: opts.company,
      period: current,
      eligible: opts.eligible,
      respondents,
      minCellSize: k,
      overall: emptySplit(),
      dimensions: PSYCHOSOCIAL_DIMENSIONS.map((d) => ({ key: d.key, label: d.label, about: d.about, split: emptySplit(), suppressed: true })),
      outcomes: OUTCOME_KEYS.map((key) => ({ key, label: OUTCOME_LABEL[key] ?? key, elevatedPct: 0, deltaPct: 0, suppressed: true })),
      teams: [],
      trend: [],
      suppressed: true,
      generatedAt: Date.now(),
    }
  }

  // overall — responses with no dimension data are excluded, not counted low
  const overall = emptySplit()
  for (const r of cur) { const b = overallBand(r.dims); if (b) bump(overall, b) }

  // dimensions: each is its own cell and gets its own k test, because a
  // dimension only a handful of people answered is a small cell too
  const dimensions: DimensionRisk[] = PSYCHOSOCIAL_DIMENSIONS.map((d) => {
    const split = emptySplit()
    for (const r of cur) { const b = r.dims[d.key]; if (b) bump(split, b) }
    return splitTotal(split) < k
      ? { key: d.key, label: d.label, about: d.about, split: emptySplit(), suppressed: true }
      : { key: d.key, label: d.label, about: d.about, split }
  })

  // outcomes with delta vs previous cycle; the delta is withheld when the
  // PREVIOUS cycle was too small to publish, or it leaks that cycle by
  // subtraction from a figure the reader already has
  const prevPeriod = periods[periods.length - 2]
  const prev = prevPeriod ? all.filter((r) => r.period === prevPeriod) : []
  const prevPublishable = prev.length >= k
  const outcomes = OUTCOME_KEYS.map((key) => {
    const elevated = pctOf(cur.filter((r) => r.outcomes[key]).length, respondents)
    const prevElevated = prevPublishable ? pctOf(prev.filter((r) => r.outcomes[key]).length, prev.length) : elevated
    return { key, label: OUTCOME_LABEL[key] ?? key, elevatedPct: elevated, deltaPct: elevated - prevElevated }
  })

  /* ---- gate 2: teams, WITH secondary suppression -------------------------
     Hiding one small team is useless while the company total and every other
     team are published: the hidden split is simply total − the rest. That is
     the classic differencing attack, and it recovers the cell exactly.
     So when only ONE team would be suppressed, the next-smallest publishable
     team is suppressed too, leaving at least two unknowns in the equation.
     Respondent counts are banded rather than exact for the same reason —
     "3 people" plus a total is another subtraction. */
  const teamNames = [...new Set(cur.map((r) => r.team))].sort()
  const built = teamNames.map((team) => {
    const rows = cur.filter((r) => r.team === team)
    const split = emptySplit()
    for (const r of rows) { const b = overallBand(r.dims); if (b) bump(split, b) }
    return { team, n: rows.length, split, small: rows.length < k }
  })
  const suppressedNames = new Set(built.filter((t) => t.small).map((t) => t.team))
  if (suppressedNames.size) {
    const hiddenHeads = () => built.filter((t) => suppressedNames.has(t.team)).reduce((a, t) => a + t.n, 0)
    /* Grow the hidden set until the residual is safe. Two conditions, and BOTH
       matter: at least two hidden teams (one alone is named by subtraction),
       and at least k people hidden in total (two teams of 2 and 1 leave a
       3-person residual, which is under k however many teams it spans).
       Publishable teams are absorbed smallest-first, so the report loses as
       little detail as it can. */
    const absorbable = built.filter((t) => !t.small).sort((a, b) => a.n - b.n)
    for (const c of absorbable) {
      if (suppressedNames.size >= 2 && hiddenHeads() >= k) break
      suppressedNames.add(c.team)
    }
    // not enough teams in the whole company to hide behind → publish none
    if (suppressedNames.size < 2 || hiddenHeads() < k) built.forEach((t) => suppressedNames.add(t.team))
  }
  const teams = built.map((t) =>
    suppressedNames.has(t.team)
      ? { team: t.team, respondents: bandCount(t.n, k), suppressed: true }
      : { team: t.team, respondents: t.n, suppressed: false, split: t.split },
  )

  /* ---- gate 3: the trend -------------------------------------------------
     A cycle with one respondent plots at 0 % or 100 % — that person's result,
     as a point on a chart. Cycles below k are dropped from the series. */
  const trend = periods
    .map((p) => {
      const rows = all.filter((r) => r.period === p)
      const bands = rows.map((r) => overallBand(r.dims)).filter(Boolean) as RiskBand[]
      return { period: p, n: bands.length, high: bands.filter((b) => b === 'high').length }
    })
    .filter((x) => x.n >= k)
    .map((x) => ({ period: x.period, highPct: pctOf(x.high, x.n) }))

  return {
    company: opts.company,
    period: current,
    eligible: opts.eligible,
    respondents,
    minCellSize: k,
    overall,
    dimensions,
    outcomes,
    teams,
    trend,
    suppressed: false,
    generatedAt: Date.now(),
  }
}

/** Small headcounts are reported as the band CEILING, never exactly: an exact
    count of a hidden cell is one subtraction away from the cell itself. Every
    suppressed cell reports the same "at most k−1", so the number carries no
    information about which small cell it is. */
function bandCount(n: number, k: number): number {
  return n <= 0 ? 0 : k - 1
}
