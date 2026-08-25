/* ============================================================================
   Good Loop — the assessment queue

   `assessments.ts` knows the five instruments: their items, their options,
   their scoring and the schedule. This file is the QUEUE that carries one from
   the therapist's desktop to the patient's app, and the completed record back.

   Three properties matter more than convenience here:

   · A record is written once. Completion goes through `assessments.freeze`,
     which refuses a second write and refuses an incomplete questionnaire. This
     store never patches `responses` or `scores` in place, and `complete()`
     throws rather than quietly ignoring a repeat submission.
   · The patient never sees a score. `pendingFor` and `completedFor` are the
     only reads the Self Use side needs, and neither carries an interpretation.
     The number is a clinical datum; it is read on the therapist's side, next
     to the history that gives it meaning.
   · Records are stored per PATIENT, in one list, so the therapist's screen and
     the patient's app read the same rows rather than two copies that can
     disagree. In a Supabase build these functions become queries; nothing
     above them changes.

   Transport in this build is localStorage, the same as `therapyStore`. That is
   a demo stand-in for a table, not a claim about where clinical data belongs —
   assessment records are health data and live server-side, under LGPD, with
   the treating therapist as the only reader.
   ============================================================================ */

import { useCallback, useEffect, useState } from 'react'
import {
  INSTRUMENTS,
  canEdit,
  freeze,
  dueOnDay,
  proposesCbi,
  type AssessmentRecord,
  type InstrumentId,
  type Responses,
  type Timepoint,
} from './assessments'

const KEY = 'gl.assessments'

/**
 * The Self Use side of this build is one person; the workspace fixtures are
 * several. This is the id the patient app reads under, and the workspace
 * patient carrying it in `selfUseId` is the one whose app the demo drives.
 */
export const SELF_USE_PATIENT_ID = 'me'

export function loadRecords(): AssessmentRecord[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as AssessmentRecord[]) : []
  } catch {
    return []
  }
}

export function saveRecords(rows: AssessmentRecord[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows))
  } catch {
    /* private mode */
  }
}

/* ------------------------------------------------------------- queries --- */

export function forPatient(rows: AssessmentRecord[], patientId: string): AssessmentRecord[] {
  return rows.filter((r) => r.patientId === patientId)
}

/** What the patient still has to fill in, oldest request first. */
export function pendingFor(rows: AssessmentRecord[], patientId: string): AssessmentRecord[] {
  return forPatient(rows, patientId)
    .filter((r) => r.status === 'confirmed' || r.status === 'in_progress')
    .sort((a, b) => a.administeredAt - b.administeredAt)
}

/** What they have finished, most recent first. */
export function completedFor(rows: AssessmentRecord[], patientId: string): AssessmentRecord[] {
  return forPatient(rows, patientId)
    .filter((r) => r.status === 'completed')
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
}

export function latestOf(
  rows: AssessmentRecord[],
  patientId: string,
  instrumentId: InstrumentId,
): AssessmentRecord | undefined {
  return completedFor(rows, patientId).find((r) => r.instrumentId === instrumentId)
}

/** Every completed record of one instrument, oldest first — the trend source. */
export function seriesOf(
  rows: AssessmentRecord[],
  patientId: string,
  instrumentId: InstrumentId,
): AssessmentRecord[] {
  return completedFor(rows, patientId)
    .filter((r) => r.instrumentId === instrumentId)
    .sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0))
}

/* -------------------------------------------------------------- writes --- */

let seq = 0
function newId(at: number): string {
  seq += 1
  return `as-${at.toString(36)}-${seq}`
}

/**
 * The therapist sends an instrument.
 *
 * It lands `confirmed`, not `proposed`: a therapist choosing it IS the
 * confirmation. `proposed` is reserved for what the schedule suggested and
 * nobody has yet agreed to.
 */
export function send(
  rows: AssessmentRecord[],
  patientId: string,
  instrumentId: InstrumentId,
  timepoint: Timepoint,
  by: string,
  at = Date.now(),
): AssessmentRecord[] {
  const record: AssessmentRecord = {
    id: newId(at),
    patientId,
    instrumentId,
    timepoint,
    administeredAt: at,
    completedAt: null,
    status: 'confirmed',
    proposedBy: 'system',
    confirmedBy: by,
    responses: [],
    scores: null,
    immutable: false,
  }
  return [...rows, record]
}

/** The schedule PROPOSES; it never sends. Nothing here becomes a notification. */
export function proposeDue(
  rows: AssessmentRecord[],
  patientId: string,
  journeyStart: number,
  now = Date.now(),
): AssessmentRecord[] {
  const day = Math.floor((now - journeyStart) / 86_400_000) + 1
  const mine = forPatient(rows, patientId)
  let next = rows
  for (const entry of dueOnDay(day)) {
    for (const id of entry.instruments) {
      if (mine.some((r) => r.instrumentId === id && r.timepoint === entry.timepoint)) continue
      next = [
        ...next,
        {
          id: newId(now),
          patientId,
          instrumentId: id,
          timepoint: entry.timepoint,
          administeredAt: now,
          completedAt: null,
          status: 'proposed',
          proposedBy: 'system',
          confirmedBy: null,
          responses: [],
          scores: null,
          immutable: false,
        },
      ]
    }
  }
  return next
}

export function confirm(rows: AssessmentRecord[], id: string, by: string): AssessmentRecord[] {
  return rows.map((r) => (r.id === id && !r.immutable ? { ...r, status: 'confirmed' as const, confirmedBy: by } : r))
}

export function postpone(rows: AssessmentRecord[], id: string): AssessmentRecord[] {
  return rows.map((r) => (r.id === id && !r.immutable ? { ...r, status: 'postponed' as const } : r))
}

/**
 * Keep a half-finished questionnaire.
 *
 * DASS-21 is twenty-one items; losing them because someone put their phone
 * down would push people to rush the second attempt, which is a data-quality
 * problem, not just an annoyance. Partial answers are held on the record while
 * `canEdit` is true and are overwritten freely — they are not a result, carry
 * no score, and a completed record refuses this outright.
 */
export function saveProgress(
  rows: AssessmentRecord[],
  id: string,
  responses: Responses,
): AssessmentRecord[] {
  return rows.map((r) =>
    r.id === id && canEdit(r)
      ? {
          ...r,
          status: 'in_progress' as const,
          responses: Object.entries(responses).map(([k, v]) => ({ itemIndex: Number(k), value: v })),
        }
      : r,
  )
}

/** The answers held on a record, back in the shape the scorers want. */
export function responsesOf(record: AssessmentRecord): Responses {
  const out: Responses = {}
  for (const r of record.responses) out[r.itemIndex] = r.value
  return out
}

/**
 * Complete one. Throws if the record is already frozen or the questionnaire is
 * unfinished — both are `freeze`'s rules, deliberately not softened here.
 */
export function complete(
  rows: AssessmentRecord[],
  id: string,
  responses: Responses,
  at = Date.now(),
): AssessmentRecord[] {
  const record = rows.find((r) => r.id === id)
  if (!record) throw new Error(`No assessment ${id}.`)
  const frozen = freeze(record, responses, at)
  return rows.map((r) => (r.id === id ? frozen : r))
}

/**
 * The pre/post pair a session collects, as one finished record.
 *
 * VAS is the only instrument that runs without a therapist confirming it —
 * `confirmedBy: 'auto'` is that, in the record rather than in a comment. It is
 * also the only one that arrives already complete: two taps, no queue, no
 * draft, straight to frozen. Its timepoint is `session`, not T0–T3, so it
 * never collides with the scheduled instruments.
 *
 * The same call serves both channels. A person who uses Self Use and sees a
 * therapist produces one series, not two.
 */
export function vasRecord(
  patientId: string,
  pre: number,
  post: number,
  at = Date.now(),
): AssessmentRecord {
  const base: AssessmentRecord = {
    id: newId(at),
    patientId,
    instrumentId: 'VAS',
    timepoint: 'session',
    administeredAt: at,
    completedAt: null,
    status: 'confirmed',
    proposedBy: 'system',
    confirmedBy: 'auto',
    responses: [],
    scores: null,
    immutable: false,
  }
  return freeze(base, { 1: pre, 2: post }, at)
}

/** Every session VAS, oldest first — the Patient Card sparkline. */
export function vasSeries(rows: AssessmentRecord[], patientId: string): { at: number; pre: number; post: number; delta: number }[] {
  const out: { at: number; pre: number; post: number; delta: number }[] = []
  for (const r of seriesOf(rows, patientId, 'VAS')) {
    if (r.scores?.kind !== 'VAS') continue
    out.push({ at: r.completedAt ?? r.administeredAt, pre: r.scores.pre, post: r.scores.post, delta: r.scores.delta })
  }
  return out
}

/**
 * Whether CBI should be OFFERED, given what this patient has completed.
 *
 * The trigger reads the latest DASS-21's scaled scores, and it is suppressed
 * once a CBI exists at that timepoint — a screen that re-proposed it on every
 * render would read as the system insisting on a burnout hypothesis, which is
 * precisely the interpretation it is not allowed to make.
 */
export function cbiOffered(rows: AssessmentRecord[], patientId: string): boolean {
  const dass = latestOf(rows, patientId, 'DASS21')
  if (!dass || dass.scores?.kind !== 'DASS21') return false
  if (!proposesCbi(dass.scores.scaled)) return false
  return !forPatient(rows, patientId).some((r) => r.instrumentId === 'CBI' && r.timepoint === dass.timepoint)
}

/** Minutes copy for a queue row, taken from the instrument itself. */
export function minutesFor(id: InstrumentId): string {
  return id === 'VAS' ? '<1' : INSTRUMENTS[id].minutes
}

/* --------------------------------------------------------------- hook ---- */

export function useAssessments() {
  const [rows, setRows] = useState<AssessmentRecord[]>(() => loadRecords())

  /* Another surface in the same build — the therapist desktop — writes the same
     key. Re-reading on focus keeps the two from drifting inside one demo. */
  useEffect(() => {
    const reread = () => setRows(loadRecords())
    window.addEventListener('focus', reread)
    window.addEventListener('storage', reread)
    return () => {
      window.removeEventListener('focus', reread)
      window.removeEventListener('storage', reread)
    }
  }, [])

  const update = useCallback((fn: (rows: AssessmentRecord[]) => AssessmentRecord[]) => {
    setRows((prev) => {
      const next = fn(prev)
      saveRecords(next)
      return next
    })
  }, [])

  return { rows, update }
}
