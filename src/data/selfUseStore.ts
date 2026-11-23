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

import { useCallback, useEffect, useRef, useState } from 'react'
import { useDataProvider } from './provider'
import type { Addressee } from '../tts/voiceLang'
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
  /** How the audio should address them — asked on the same form, because it
      decides which recording they hear from their very first session. */
  addressedAs: Addressee | null
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
      addressedAs: p.addressedAs === 'm' || p.addressedAs === 'f' ? p.addressedAs : null,
    }
  } catch {
    return null
  }
}

export interface Consents {
  /**
   * REQUIRED — the Terms of Service and the Privacy Policy.
   *
   * Accepted on the FIRST screen after registering, before anything else is
   * shown, and recorded the moment the box is ticked. Null is what makes the
   * app ask: an account that predates this screen is asked once, the next
   * time it opens, rather than being assumed to have agreed.
   */
  termsAt: number | null
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
/**
 * What to start: a session, at a length, optionally ticking off a pathway week.
 *
 * Lived in the old Home screen, which no longer exists. It belongs beside
 * `SelfUseLog` — one says what is about to be played, the other what was.
 */
export interface Launch {
  slug: string
  duration: Duration
  pathwayWeek?: number
}

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
  /** Stamped the first time the three first-run cards are finished OR skipped.
      Null is what makes the shell show them; nothing sets it back, so they are
      a one-time thing. The same material stays in Profile afterwards. */
  tutorialSeenAt: number | null
  /** Safety Gateway L2: the trigger id last shown, so a cycle shows once. */
  safetyShown: string | null
  /**
   * How the audio addresses this person: "sei pronto" or "sei pronta".
   *
   * Italian and Portuguese make it audible, so the recording has to know. It
   * is asked at registration and answerable again in Profilo; null means
   * nobody has been asked yet, which is every account that existed before the
   * female scripts did — the app asks them once before the library.
   *
   * Not an identity field and not used as one: it chooses a recording.
   */
  addressedAs: Addressee | null
  /**
   * Slugs the person has put on their own list, newest first.
   *
   * Slugs, not protocol codes: the library browses by slug, and a saved item
   * has to survive the protocol behind it being re-coded. Kept on the device
   * with the rest of this state — a list of what you mean to listen to is a
   * preference, not a clinical record.
   */
  saved: string[]
}

export function emptyState(): SelfUseState {
  return {
    version: VERSION,
    onboardedAt: null,
    companyCode: null,
    intake: { challenge: null, duration: null, time: null, matters: null },
    consents: {
      termsAt: null,
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
    addressedAs: null,
    saved: [],
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
      saved: parsed.saved ?? [],
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

/* -------------------------------------------------- what follows the account

   WHY ONLY THESE SEVEN. The three first-run cards are shown until
   `tutorialSeenAt` is set, and that lived in `localStorage` alone — so it
   was true per BROWSER and not per account, and the app introduced itself
   again to somebody who had been using it for weeks, on every new device.
   That is the reported bug, and these are the things in this record that a
   person ANSWERED or CHOSE and that cost something to ask for twice.

   Their HISTORY is deliberately not here: sessions listened, pathway
   progress, weekly check-ins, WHO-5. Those are records rather than
   settings, some of them feed a professional's view, and what of a person's
   history lives on a server is a decision to make deliberately rather than
   as a side effect of fixing a wizard. The mood calendar went up on its own
   terms, with its own table and its own reasoning
   (supabase/32-mood-readings.sql).

   So a person changing device today still arrives with their own list,
   their preferences and their language — and with an empty history. That
   is a smaller surprise than being introduced to the app again, and it is
   named here so the next person to read this knows it was a choice. */
export function personalSettings(s: SelfUseState): Record<string, unknown> {
  return {
    tutorialSeenAt: s.tutorialSeenAt,
    addressedAs: s.addressedAs,
    saved: s.saved,
    prefs: s.prefs,
    notifications: s.notifications,
    intake: s.intake,
    companyCode: s.companyCode,
  }
}

/** Lay stored settings over a state, ignoring anything that is not theirs. */
export function withPersonalSettings(base: SelfUseState, saved: Record<string, unknown> | null): SelfUseState {
  if (!saved || typeof saved !== 'object') return base
  const num = (v: unknown) => (typeof v === 'number' ? v : null)
  return {
    ...base,
    /* The LATER of the two wins: seen on another device counts as seen, and
       seen here counts as seen there. */
    tutorialSeenAt: num(saved.tutorialSeenAt) ?? base.tutorialSeenAt,
    addressedAs: saved.addressedAs === 'm' || saved.addressedAs === 'f' ? saved.addressedAs : base.addressedAs,
    saved: Array.isArray(saved.saved) ? (saved.saved as string[]) : base.saved,
    prefs: { ...base.prefs, ...((saved.prefs ?? {}) as object) },
    notifications: { ...base.notifications, ...((saved.notifications ?? {}) as object) },
    intake: { ...base.intake, ...((saved.intake ?? {}) as object) },
    companyCode: typeof saved.companyCode === 'string' ? saved.companyCode : base.companyCode,
  }
}

/* ------------------------------------------------------------------ hook -- */

export interface SelfUseStore {
  state: SelfUseState
  update: (fn: (s: SelfUseState) => SelfUseState) => void
  reset: () => void
  /**
   * Has the ACCOUNT's copy of the settings been heard from yet?
   *
   * THE WHOLE POINT OF THE FLAG. Script 40 moved `tutorialSeenAt` off the
   * browser and onto the account, so a second device no longer loses it —
   * but the device still PAINTS from its own cache first, and a device that
   * has never seen this account has a cache saying `null`. So the three
   * first-run cards were drawn, and a fraction of a second later the
   * server's answer arrived and took them away. "I keep on receiving the
   * Introductory Wizard" survived the migration that was supposed to end
   * it, in the shape of a flash.
   *
   * False only while the one round trip is in flight. A failure sets it
   * true: an older database or a dead connection means the cache is the
   * only answer there is, and holding a blank screen for a stranger is
   * worse than introducing the app to them twice.
   */
  loaded: boolean
}

export function useSelfUseStore(userId?: string): SelfUseStore {
  const dp = useDataProvider()
  const [state, setState] = useState<SelfUseState>(() => loadState(userId))
  /* Nobody signed in: there is no row to wait for. */
  const [loaded, setLoaded] = useState(() => !userId)

  // Switching account mid-session (sign out → sign in) must not carry state over.
  useEffect(() => { setState(loadState(userId)); setLoaded(!userId) }, [userId])

  /* ---- the settings that follow the ACCOUNT, not the browser -------------

     `personalSettings` says which, and why only those. The device keeps its
     copy as a cache so the app still paints instantly; the server's answer
     is laid over it once, per mount, and anything this browser has that the
     server does not is pushed up — so nobody loses what they chose before
     this existed.

     Not in a preview: a walkthrough's answers are seeded locally and belong
     to the tab (`admin/preview.ts`). */
  const pulled = useRef<string | null>(null)
  useEffect(() => {
    if (!userId || pulled.current === userId) return
    pulled.current = userId
    let alive = true
    const done = () => { if (alive) setLoaded(true) }
    void dp.getMySettings()
      .then((saved) => {
        if (!alive) return
        if (saved && Object.keys(saved).length) {
          setState((prev) => {
            const next = withPersonalSettings(prev, saved)
            saveState(next, userId)
            return next
          })
          return
        }
        setState((prev) => {
          /* Nothing up there. Hand it whatever this browser already knows —
             but only once there is something worth keeping, or every fresh
             account would write an empty row on its first paint. */
          if (prev.tutorialSeenAt || prev.saved.length || prev.addressedAs) {
            void dp.saveMySettings(personalSettings(prev)).catch(() => undefined)
          }
          return prev
        })
      })
      .catch(() => { /* older database, or offline: the cache stands */ })
      .finally(done)
    return () => { alive = false }
  }, [dp, userId])

  const update = useCallback(
    (fn: (s: SelfUseState) => SelfUseState) => {
      setState((prev) => {
        const next = fn(prev)
        saveState(next, userId)
        /* Up as well as down, and only when one of the seven actually
           changed: this fires on every session logged and every mood
           answered too, and those are not in the row. */
        if (userId && JSON.stringify(personalSettings(next)) !== JSON.stringify(personalSettings(prev))) {
          void dp.saveMySettings(personalSettings(next)).catch(() => undefined)
        }
        return next
      })
    },
    [userId, dp],
  )

  const reset = useCallback(() => {
    const fresh = emptyState()
    saveState(fresh, userId)
    setState(fresh)
  }, [userId])

  return { state, update, reset, loaded }
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
