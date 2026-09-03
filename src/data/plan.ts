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


/* ================================================== prescriptions ↔ plan ===

   A therapist prescribes "this protocol, three times a week, for four weeks".
   The database stores a PATHWAY: one row per session, each with a week. The
   two are the same fact at different resolutions, and before this the
   therapist wrote the first shape into their browser while the patient read a
   fixture — so a prescription reached nobody.

   Expanding here rather than at either screen means both sides agree about
   what "three times a week" means without either owning the definition. */

export interface PrescriptionSpec {
  protocolCode: string
  duration: Duration
  perWeek: number
  weeks: number
  note?: string
}

/** One plan item per prescribed session, appended after whatever exists. */
export function planItemsForPrescription(
  spec: PrescriptionSpec,
  startPosition: number,
  startWeek = 1,
): PlanItem[] {
  const out: PlanItem[] = []
  const weeks = Math.max(1, Math.round(spec.weeks))
  const perWeek = Math.max(1, Math.round(spec.perWeek))
  for (let w = 0; w < weeks; w += 1) {
    for (let i = 0; i < perWeek; i += 1) {
      out.push({
        id: `rx-${startPosition + out.length}-${Date.now().toString(36)}`,
        position: startPosition + out.length,
        protocolCode: spec.protocolCode,
        duration: spec.duration,
        week: startWeek + w,
        note: i === 0 ? spec.note : undefined,
      })
    }
  }
  return out
}

export interface PlanPrescription {
  protocolCode: string
  duration: Duration
  perWeek: number
  weeks: number
  done: number
  total: number
  note?: string
}

/**
 * Read a plan back as the prescriptions it came from.
 *
 * Grouped by protocol AND length, because "GL-ANX 1.1 for 12 minutes" and the
 * same protocol for 24 are different prescriptions to a clinician even though
 * they share a code.
 */
export function prescriptionsFromPlan(plan: Plan | null): PlanPrescription[] {
  if (!plan) return []
  const groups = new Map<string, PlanItem[]>()
  for (const it of plan.items) {
    const key = `${it.protocolCode}|${it.duration}`
    const arr = groups.get(key) ?? []
    arr.push(it)
    groups.set(key, arr)
  }
  return [...groups.values()].map((items) => {
    const weeks = new Set(items.map((i) => i.week))
    return {
      protocolCode: items[0].protocolCode,
      duration: items[0].duration,
      perWeek: Math.max(1, Math.round(items.length / Math.max(1, weeks.size))),
      weeks: weeks.size,
      done: items.filter((i) => i.doneAt).length,
      total: items.length,
      note: items.find((i) => i.note)?.note,
    }
  })
}
