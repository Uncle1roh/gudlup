/* ============================================================================
   Good Loop — the PERCORSO (therapist-authored plan)

   The app does NOT compose a three-month pathway any more. The therapist writes
   it during the first session and the person follows it: an ordered list of
   sessions, each with a week, a length and (optionally) a line addressed to the
   patient. What the app does is show the next one and remember what was done.

   This replaces the self-guided programme the wizard used to build from a
   family's sub-protocols (src/data/program.ts, deleted): a plan of clinical
   material is a clinical decision, and it is now made by the clinician. The
   check-in survives, but only inside the library, where it picks a general
   wellbeing audio and nothing more.
   ============================================================================ */

import type { Duration } from '../types/domain'

export interface PlanItem {
  id: string
  /** Order in the pathway (0-based, dense). */
  position: number
  protocolCode: string
  duration: Duration
  /** 1-based week of the plan. Several items may share a week. */
  week: number
  /** Optional line from the therapist, shown to the person with the session. */
  note?: string
  /** When the person completed it (ms). Absent = still ahead. */
  doneAt?: number
}

export interface Plan {
  patientId: string
  /** Free-text framing the therapist gives the whole pathway. */
  title?: string
  items: PlanItem[]
  updatedAt: number
}

export const PLAN_WEEKS = 13 // ~3 months, the length agreed with the POs

/** The next session to do: the first item not yet done. */
export function nextPlanItem(plan: Plan | null): PlanItem | null {
  if (!plan) return null
  const ordered = [...plan.items].sort((a, b) => a.position - b.position)
  return ordered.find((i) => !i.doneAt) ?? null
}

export function planProgress(plan: Plan | null): { done: number; total: number } {
  const items = plan?.items ?? []
  return { done: items.filter((i) => i.doneAt).length, total: items.length }
}

export function planComplete(plan: Plan | null): boolean {
  const { done, total } = planProgress(plan)
  return total > 0 && done === total
}

/** Items grouped by week, weeks in order — how the therapist edits it and how
    the person sees the road ahead. */
export function byWeek(plan: Plan | null): { week: number; items: PlanItem[] }[] {
  const out = new Map<number, PlanItem[]>()
  for (const i of [...(plan?.items ?? [])].sort((a, b) => a.position - b.position)) {
    out.set(i.week, [...(out.get(i.week) ?? []), i])
  }
  return [...out.entries()].sort((a, b) => a[0] - b[0]).map(([week, items]) => ({ week, items }))
}

/** Renumber positions densely after an edit (insert / remove / reorder). */
export function repositioned(items: PlanItem[]): PlanItem[] {
  return items.map((i, n) => ({ ...i, position: n }))
}

/** A blank plan skeleton: one session a week for the agreed three months,
    all on the protocol the therapist picked as the entry point. The therapist
    edits from here — the app proposes a shape, never the clinical content. */
export function skeletonPlan(entryCode: string, duration: Duration, weeks = PLAN_WEEKS): PlanItem[] {
  return Array.from({ length: weeks }, (_, n) => ({
    id: `new-${n}`,
    position: n,
    protocolCode: entryCode,
    duration,
    week: n + 1,
  }))
}
