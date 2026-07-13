/* ============================================================================
   Good Loop — Employer NR-1 psychosocial-risk report (aggregates only)
   The shape the HR/employer dashboard consumes. By design it carries NO
   individual records — only counts, distributions and suppressed cells. The
   data-provider boundary is where the privacy model is enforced: HR literally
   cannot receive employee-level rows, and any group below `minCellSize` is
   suppressed (k-anonymity). This mirrors the SECURITY DEFINER aggregate
   function in docs/DATA_MODEL.sql; nothing here can identify a person.

   Framework: the psychosocial dimensions follow the COPSOQ / HSE Management
   Standards families that Brazilian NR-1 psychosocial-risk assessments use.
   ============================================================================ */

export type RiskBand = 'low' | 'moderate' | 'high'

/** Respondent counts across the three risk bands (never percentages of one). */
export interface BandSplit {
  low: number
  moderate: number
  high: number
}

export interface DimensionRisk {
  key: string
  label: string
  /** One-line description of what the dimension measures. */
  about: string
  split: BandSplit
}

export interface OutcomeIndicator {
  key: string
  label: string
  /** % of respondents in the elevated range. */
  elevatedPct: number
  /** Change in that % vs the previous cycle (negative = improving). */
  deltaPct: number
}

/** Per-team breakdown. Below the k-anonymity threshold, `split` is withheld. */
export interface TeamRisk {
  team: string
  respondents: number
  suppressed: boolean
  split?: BandSplit
}

export interface TrendPoint {
  period: string
  /** Overall % of respondents at high risk that cycle. */
  highPct: number
}

export interface Nr1Report {
  company: string
  period: string
  /** Employees eligible = those who granted the aggregate-reporting consent. */
  eligible: number
  /** Employees who completed the assessment this cycle. */
  respondents: number
  /** k — groups smaller than this are suppressed everywhere. */
  minCellSize: number
  overall: BandSplit
  dimensions: DimensionRisk[]
  outcomes: OutcomeIndicator[]
  teams: TeamRisk[]
  trend: TrendPoint[]
  generatedAt: number
}

/* ---- small shared helpers ---- */
export function splitTotal(s: BandSplit): number {
  return s.low + s.moderate + s.high
}
export function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0
}
