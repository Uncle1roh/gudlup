/* ============================================================================
   Good Loop — Self Use local state

   Everything the Self Use app remembers about ONE person that the clinical
   backend does not own: onboarding answers, which pathway is active and how
   far along it is, the three measurement series, consent timestamps, and the
   Safety Gateway's "shown once per cycle" bookkeeping.

   Why it lives here and not behind `DataProvider`: none of it is clinical
   material, none of it is ever read by a therapist or an employer, and by the
   privacy rule the corporate dashboard only ever sees k-anonymous aggregates
   derived from it server-side. Keeping it out of the clinical provider makes
   that boundary structural rather than a convention.

   It is keyed per user id so two accounts on one device never mix, and every
   read is defensive: a corrupt or absent record yields a fresh state rather
   than a crash (private-browsing mode simply forgets between launches).
   ============================================================================ */

import { useCallback, useEffect, useState } from 'react'
import type { Duration } from '../types/domain'
import type { GlCheckEntry, Who5Entry, MoodEntry } from './measures'
import type { PathwayId, IntakeTime, IntakeMatter } from './selfuse'
import { INTAKE_CHALLENGES, pathwayById } from './selfuse'

const KEY = 'gl.selfuse'
const VERSION = 1

/** ON-3 + ON-7. Each consent carries its OWN timestamp — that is the whole
    point of the two screens being separate. `null` = never answered. */
/* ------------------------------------------------- the registration handoff

   Consent is given during REGISTRATION now — the seven onboarding screens are
   gone and a person lands on the library as soon as their account exists. The
   sign-in screen is generic (it serves clinicians and admins too) and has no
   access to this store, which is keyed by a user id that does not exist until
   the account is made. So the two answers travel here in one small record and
   are applied the first time the Self Use app renders for that account.

   Deliberately not a component prop: the sign-up screen unmounts the moment
   the session appears, and the app that reads this may mount on the other side
   of a page load. */

const SIGNUP_KEY = 'gl.signup'

export interface SignupIntake {
  /** REQUIRED — app usage & session data. Registration cannot proceed without it. */
  usage: boolean
  /** Wellbeing check-ins: measurement is off unless it is given. */
  measurement: boolean
  companyCode: string | null
}

export function stashSignupIntake(v: SignupIntake): void {
  try { localStorage.setItem(SIGNUP_KEY, JSON.stringify(v)) } catch { /* private mode */ }
}

/** Read it once and clear it — a second account on this device must answer
    for itself rather than inheriting the last person's consent. */
export function takeSignupIntake(): SignupIntake | null {
  try {
    const raw = localStorage.getItem(SIGNUP_KEY)
    localStorage.removeItem(SIGNUP_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<SignupIntake>
    return {
      usage: p.usage === true,
      measurement: p.measurement === true,
      companyCode: typeof p.companyCode === 'string' && p.companyCode.trim() ? p.companyCode.trim() : null,
    }
  } catch {
    return null
  }
}

export interface Consents {
  /** REQUIRED — app usage & session data. */
  usageAt: number | null
  /** REQUIRED FOR MEASUREMENT — wellbeing check-ins. */
  measurementAt: number | null
  /** OPTIONAL, DEFAULT OFF — anonymous aggregate company reports. */
  aggregate: boolean
  aggregateAt: number | null
  /** OPTIONAL, DEFAULT ON — push notifications & reminders. */
  notifications: boolean
  notificationsAt: number | null
  /** OPTIONAL, DEFAULT OFF — share Self Use history with the linked therapist. */
  therapistBridge: boolean
  therapistBridgeAt: number | null
}

export interface NotificationPrefs {
  selfUseReminder: boolean
  selfUseReminderTime: IntakeTime
  therapistSessions: boolean
  glCheck: boolean
  glCheckDay: number // 0=Sun … 6=Sat
  who5: boolean
  nudges: boolean
  therapistMessages: boolean
  prescriptions: boolean
}

export interface SessionPrefs {
  defaultDuration: Duration
  preferredTime: IntakeTime
  audioQuality: 'standard' | 'high'
}

export interface IntakeAnswers {
  challenge: string | null
  duration: Duration | null
  time: IntakeTime | null
  matters: IntakeMatter | null
}

export interface PathwayState {
  id: PathwayId
  startedAt: number
  /** Completed sessions, by pathway week. `done[2]` = sessions done in week 2. */
  done: Record<number, number>
  completedAt?: number
}

/** One finished Self Use session, for the streak / minutes / history readouts.
    The clinical record still goes through `DataProvider.recordSession`. */
export interface SelfUseLog {
  at: number
  slug: string
  duration: Duration
  /** Set when the session was a therapist prescription, not pathway or free. */
  prescriptionId?: string
  /** Set when the session ticked off a pathway week. */
  pathwayWeek?: number
  feedback?: 'relaxed' | 'neutral' | 'restless' | 'support'
}

export interface SelfUseState {
  version: number
  onboardedAt: number | null
  /** ON-2 — the company code entered at registration, uppercased, or null. */
  companyCode: string | null
  intake: IntakeAnswers
  consents: Consents
  notifications: NotificationPrefs
  prefs: SessionPrefs
  pathway: PathwayState | null
  completedPathways: { id: PathwayId; at: number }[]
  logs: SelfUseLog[]
  glChecks: GlCheckEntry[]
  who5: Who5Entry[]
  moods: MoodEntry[]
  /** First session done → the stereo check is not shown again. */
  stereoCheckedAt: number | null
  /** The tutorial card on Home is dismissible; the tutorial itself stays in Profile. */
  tutorialSeenAt: number | null
  /** Safety Gateway L2: the trigger id last shown, so a cycle shows once. */
  safetyShown: string | null
}

export function emptyState(): SelfUseState {
  return {
    version: VERSION,
    onboardedAt: null,
    companyCode: null,
    intake: { challenge: null, duration: null, time: null, matters: null },
    consents: {
      usageAt: null,
      measurementAt: null,
      aggregate: false,
      aggregateAt: null,
      notifications: true,
      notificationsAt: null,
      therapistBridge: false,
      therapistBridgeAt: null,
    },
    notifications: {
      selfUseReminder: true,
      selfUseReminderTime: 'morning',
      therapistSessions: true,
      glCheck: true,
      glCheckDay: 1,
      who5: true,
      nudges: true,
      therapistMessages: true,
      prescriptions: true,
    },
    prefs: { defaultDuration: 6, preferredTime: 'morning', audioQuality: 'standard' },
    pathway: null,
    completedPathways: [],
    logs: [],
    glChecks: [],
    who5: [],
    moods: [],
    stereoCheckedAt: null,
    tutorialSeenAt: null,
    safetyShown: null,
  }
}

function storageKey(userId?: string): string {
  return userId ? `${KEY}.${userId}` : KEY
}

export function loadState(userId?: string): SelfUseState {
  try {
    const raw = localStorage.getItem(storageKey(userId)) ?? localStorage.getItem(KEY)
    if (!raw) return emptyState()
    const parsed = JSON.parse(raw) as Partial<SelfUseState>
    // Merge onto a fresh state so a record written by an older build keeps
    // working: missing fields take their defaults instead of arriving undefined.
    const base = emptyState()
    return {
      ...base,
      ...parsed,
      version: VERSION,
      intake: { ...base.intake, ...(parsed.intake ?? {}) },
      consents: { ...base.consents, ...(parsed.consents ?? {}) },
      notifications: { ...base.notifications, ...(parsed.notifications ?? {}) },
      prefs: { ...base.prefs, ...(parsed.prefs ?? {}) },
      logs: parsed.logs ?? [],
      glChecks: parsed.glChecks ?? [],
      who5: parsed.who5 ?? [],
      moods: parsed.moods ?? [],
      completedPathways: parsed.completedPathways ?? [],
    }
  } catch {
    return emptyState()
  }
}

export function saveState(s: SelfUseState, userId?: string): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(s))
  } catch {
    /* private mode / quota — the session still works, it just isn't remembered */
  }
}

/* ------------------------------------------------------------------ hook -- */

export interface SelfUseStore {
  state: SelfUseState
  update: (fn: (s: SelfUseState) => SelfUseState) => void
  reset: () => void
}

export function useSelfUseStore(userId?: string): SelfUseStore {
  const [state, setState] = useState<SelfUseState>(() => loadState(userId))

  // Switching account mid-session (sign out → sign in) must not carry state over.
  useEffect(() => { setState(loadState(userId)) }, [userId])

  const update = useCallback(
    (fn: (s: SelfUseState) => SelfUseState) => {
      setState((prev) => {
        const next = fn(prev)
        saveState(next, userId)
        return next
      })
    },
    [userId],
  )

  const reset = useCallback(() => {
    const fresh = emptyState()
    saveState(fresh, userId)
    setState(fresh)
  }, [userId])

  return { state, update, reset }
}

/* ------------------------------------------------------------- selectors -- */

/** The shape `currentWeek` and `isPathwayComplete` need. The RESOLVED pathway
    (weeks whose protocol was disabled already dropped and the rest renumbered)
    satisfies it, and so does the editorial one — callers with a resolved
    catalog should pass it, because it is the plan the person is actually
    walking. */
export interface PlanShape {
  plan: { week: number; blocks: { count: number }[] }[]
}

function asked(w: { blocks: { count: number }[] }): number {
  return w.blocks.reduce((n, b) => n + b.count, 0)
}

/** Which pathway week is current: the first week whose count is not yet met. */
export function currentWeek(ps: PathwayState | null, resolved?: PlanShape): number {
  const p = resolved ?? pathwayById(ps?.id)
  if (!ps || !p || !p.plan.length) return 1
  for (const w of p.plan) {
    if ((ps.done[w.week] ?? 0) < asked(w)) return w.week
  }
  return p.plan.length
}

export function pathwayDone(ps: PathwayState | null): number {
  if (!ps) return 0
  return Object.values(ps.done).reduce((a, b) => a + b, 0)
}

export function isPathwayComplete(ps: PathwayState | null, resolved?: PlanShape): boolean {
  const p = resolved ?? pathwayById(ps?.id)
  if (!ps || !p || !p.plan.length) return false
  return p.plan.every((w) => (ps.done[w.week] ?? 0) >= asked(w))
}

/** Sessions logged since the most recent Monday 00:00 local. */
export function sessionsThisWeek(logs: SelfUseLog[], now = Date.now()): SelfUseLog[] {
  const d = new Date(now)
  const dow = (d.getDay() + 6) % 7 // Monday = 0
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow).getTime()
  return logs.filter((l) => l.at >= monday)
}

/** Consecutive days ending today (or yesterday) with at least one session. */
export function streakDays(logs: SelfUseLog[], now = Date.now()): number {
  if (!logs.length) return 0
  const days = new Set(
    logs.map((l) => {
      const d = new Date(l.at)
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    }),
  )
  const key = (ms: number) => {
    const d = new Date(ms)
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  }
  let n = 0
  // A streak may legitimately end yesterday — today's session may not be done yet.
  let cursor = days.has(key(now)) ? now : now - 86_400_000
  if (!days.has(key(cursor))) return 0
  while (days.has(key(cursor))) {
    n += 1
    cursor -= 86_400_000
  }
  return n
}

/** Whether a weekly GL-Check is due (none in the last 7 days). */
export function glCheckDue(s: SelfUseState, now = Date.now()): boolean {
  if (!s.consents.measurementAt) return false
  const last = s.glChecks[s.glChecks.length - 1]
  return !last || now - last.at >= 7 * 86_400_000
}

/** Whether the 4-weekly WHO-5 is due. */
export function who5Due(s: SelfUseState, now = Date.now()): boolean {
  if (!s.consents.measurementAt) return false
  const last = s.who5[s.who5.length - 1]
  return !last || now - last.at >= 28 * 86_400_000
}

/** The pathway ON-4 Q1 maps to. "I'm not sure yet" — and any answer we cannot
    resolve — lands on Stress Management, the most universal starting point;
    ON-5 says so in that case rather than pretending it was a diagnosis. */
export function suggestedPathway(intake: IntakeAnswers): PathwayId {
  const found = INTAKE_CHALLENGES.find((c) => c.id === intake.challenge)
  return found?.pathway ?? 'stress-management'
}
