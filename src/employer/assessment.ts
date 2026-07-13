/* ============================================================================
   Good Loop — Psychosocial assessment (the input that feeds NR-1)
   The employee-facing periodic check. Answers map deterministically to a risk
   band per dimension; the aggregate (employer) view is computed from many of
   these responses (see aggregate.ts). One canonical dimension list is shared by
   the questionnaire and the aggregation so they never drift.

   Dimensions follow the COPSOQ / HSE Management-Standards families that
   Brazilian NR-1 psychosocial-risk assessments use.
   ============================================================================ */

import type { RiskBand } from './types'

export interface PsychosocialDimension {
  key: string
  label: string
  about: string
}

export const PSYCHOSOCIAL_DIMENSIONS: PsychosocialDimension[] = [
  { key: 'demands', label: 'Work demands', about: 'Workload and cognitive/emotional load' },
  { key: 'pace', label: 'Pace & time pressure', about: 'Deadlines and pace of work' },
  { key: 'balance', label: 'Work–life balance', about: 'Boundaries between work and personal time' },
  { key: 'recognition', label: 'Recognition', about: 'Reward and acknowledgement for effort' },
  { key: 'support_mgr', label: 'Manager support', about: 'Guidance and backing from leadership' },
  { key: 'control', label: 'Control & autonomy', about: 'Influence over how work is done' },
  { key: 'role', label: 'Role clarity', about: 'Clear expectations and responsibilities' },
  { key: 'relationships', label: 'Relationships', about: 'Peer support and workplace conflict' },
]

export const OUTCOME_KEYS = ['stress', 'anxiety', 'burnout'] as const
export type OutcomeKey = (typeof OUTCOME_KEYS)[number]

export interface AssessmentQuestion {
  id: string
  /** Dimension key, or an outcome key. */
  target: string
  kind: 'dimension' | 'outcome'
  text: string
  /** If true, agreeing indicates worse (higher risk). If false, agreeing is protective. */
  higherIsWorse: boolean
}

/** 5-point agreement scale used by every item. */
export const LIKERT: { value: number; label: string }[] = [
  { value: 1, label: 'Strongly disagree' },
  { value: 2, label: 'Disagree' },
  { value: 3, label: 'Neutral' },
  { value: 4, label: 'Agree' },
  { value: 5, label: 'Strongly agree' },
]

export const ASSESSMENT_QUESTIONS: AssessmentQuestion[] = [
  { id: 'q_demands', target: 'demands', kind: 'dimension', text: 'I face unrealistic time pressures in my work.', higherIsWorse: true },
  { id: 'q_pace', target: 'pace', kind: 'dimension', text: 'I have to work very intensively.', higherIsWorse: true },
  { id: 'q_balance', target: 'balance', kind: 'dimension', text: 'Work regularly interferes with my personal life.', higherIsWorse: true },
  { id: 'q_recognition', target: 'recognition', kind: 'dimension', text: 'My efforts at work are recognised and valued.', higherIsWorse: false },
  { id: 'q_support', target: 'support_mgr', kind: 'dimension', text: 'I can rely on my manager for support when needed.', higherIsWorse: false },
  { id: 'q_control', target: 'control', kind: 'dimension', text: 'I have a say in how I carry out my work.', higherIsWorse: false },
  { id: 'q_role', target: 'role', kind: 'dimension', text: 'I am clear about what is expected of me.', higherIsWorse: false },
  { id: 'q_relationships', target: 'relationships', kind: 'dimension', text: 'There is friction or conflict within my team.', higherIsWorse: true },
  { id: 'q_stress', target: 'stress', kind: 'outcome', text: 'Over the last month I have felt stressed by work.', higherIsWorse: true },
  { id: 'q_anxiety', target: 'anxiety', kind: 'outcome', text: 'Over the last month I have felt anxious or on edge.', higherIsWorse: true },
  { id: 'q_burnout', target: 'burnout', kind: 'outcome', text: 'Over the last month I have felt emotionally drained by work.', higherIsWorse: true },
]

/** Map a 1..5 answer to a risk band, respecting question polarity. */
export function likertToBand(score: number, higherIsWorse: boolean): RiskBand {
  const risk = higherIsWorse ? score : 6 - score // flip protective items
  if (risk >= 4) return 'high'
  if (risk === 3) return 'moderate'
  return 'low'
}

/** An outcome counts as elevated when the (polarity-adjusted) answer is 4–5. */
export function isElevated(score: number, higherIsWorse: boolean): boolean {
  const risk = higherIsWorse ? score : 6 - score
  return risk >= 4
}

/** A single employee's response — the row aggregated into the NR-1 report. */
export interface PsychosocialResponse {
  team: string
  period: string
  /** Per-dimension band. */
  dims: Record<string, RiskBand>
  /** Elevated flags per outcome. */
  outcomes: Record<OutcomeKey, boolean>
  at: number
}

/** e.g. "Q3 2026" for the given (or current) date. */
export function currentPeriodLabel(d: Date = new Date()): string {
  const q = Math.floor(d.getMonth() / 3) + 1
  return `Q${q} ${d.getFullYear()}`
}

/** Build a response row from a questionnaire's raw answers. */
export function buildResponse(answers: Record<string, number>, team: string, period: string): PsychosocialResponse {
  const dims: Record<string, RiskBand> = {}
  const outcomes: Record<OutcomeKey, boolean> = { stress: false, anxiety: false, burnout: false }
  for (const q of ASSESSMENT_QUESTIONS) {
    const score = answers[q.id]
    if (score == null) continue
    if (q.kind === 'dimension') dims[q.target] = likertToBand(score, q.higherIsWorse)
    else outcomes[q.target as OutcomeKey] = isElevated(score, q.higherIsWorse)
  }
  return { team, period, dims, outcomes, at: Date.now() }
}
