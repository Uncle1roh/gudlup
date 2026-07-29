/* ============================================================================
   Good Loop — patient ↔ therapist scheduling (shared types + slot math)
   The therapist keeps a WEEKLY availability template (agenda); the patient
   books a concrete occurrence of a free slot. Pure helpers here so the slot
   expansion is node-testable.
   ============================================================================ */

export interface WeeklySlot {
  /** 0 = Sunday … 6 = Saturday (JS Date.getDay). */
  weekday: number
  /** 'HH:mm', therapist-local. */
  hhmm: string
}

export interface TherapistListing {
  id: string
  name: string
  avatarUrl?: string | null
}

export interface Appointment {
  id: string
  therapistId: string
  therapistName?: string
  profileId?: string
  patientName?: string
  startsAtMs: number
  durationMin: number
  status: 'booked' | 'cancelled' | 'done'
}

export const APPOINTMENT_MIN = 50
/** The "enter/start" window opens this many ms before the start. */
export const JOIN_EARLY_MS = 5 * 60 * 1000

export function slotKey(s: WeeklySlot): string {
  return `${s.weekday}|${s.hhmm}`
}

/** Expand a weekly template into concrete future openings (ms), skipping
    already-booked times, within [now, now + days). Sorted ascending. */
export function expandOpenings(
  slots: WeeklySlot[],
  bookedStartsMs: number[],
  nowMs: number,
  days = 14,
): number[] {
  const booked = new Set(bookedStartsMs)
  const out: number[] = []
  const start = new Date(nowMs)
  for (let d = 0; d < days; d++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d)
    for (const s of slots) {
      if (day.getDay() !== s.weekday) continue
      const [hh, mm] = s.hhmm.split(':').map((x) => parseInt(x, 10))
      if (!Number.isFinite(hh) || !Number.isFinite(mm)) continue
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm).getTime()
      if (at <= nowMs) continue
      if (booked.has(at)) continue
      out.push(at)
    }
  }
  return out.sort((a, b) => a - b)
}

/** Whether the join/start window for an appointment is open right now. */
export function joinWindowOpen(a: Appointment, nowMs: number): boolean {
  if (a.status !== 'booked') return false
  const end = a.startsAtMs + a.durationMin * 60 * 1000
  return nowMs >= a.startsAtMs - JOIN_EARLY_MS && nowMs < end
}

/** Upcoming = booked and not yet ended. */
export function isUpcoming(a: Appointment, nowMs: number): boolean {
  return a.status === 'booked' && nowMs < a.startsAtMs + a.durationMin * 60 * 1000
}

export function fmtDay(ms: number, locale = 'pt-BR'): string {
  return new Date(ms).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })
}

export function fmtTime(ms: number, locale = 'pt-BR'): string {
  return new Date(ms).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
}
