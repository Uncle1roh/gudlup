/* ============================================================================
   THE DEMO WORLD — one cast, one month, three screens

   WHAT THIS IS FOR. A salesperson opens the commercial console, types the
   prospect's company name, and walks them through the product: the app a
   person listens in, that person's therapist's screen, and that company's
   dashboard. Three surfaces, and — this is the whole point — ONE STORY: the
   person in the app is the patient in the therapist's roster and one of the
   people behind the numbers in the employer's dashboard. A session finished
   in front of the prospect shows up on the other two.

   WHY IT IS A FILE AND NOT A DATABASE. The owner's instruction, 2026-11-03:
   "se essas informações pudessem viver dentro do app comercial, seria muito
   bom". It costs nothing to agree — a demo database is a second production
   to keep alive, and the one thing a demo must never do is read or write the
   real one. Everything below is a constant. The mock data layer serves it,
   every write lands in memory, and closing the tab ends it.

   WHAT WAS WRONG BEFORE, and what each part here answers:

     · The demo had no company and no therapist, so half the product was
       missing — the relationship fixtures were behind a build variable
       (`VITE_DEMO_FIXTURES`) meant for a separate commercial deployment that
       was never going to exist. The switch is now the demo itself:
       `demoFixturesOn()` is true while a demo is being given.
     · The person in the demo WAS THE SALESPERSON — "Boa tarde, Comercial",
       their own e-mail in the profile. Now it is Mariana Alves.
     · The numbers disagreed on screen: 542 Loops in the pill, 78 minutes in
       the profile, and an empty month in Minha jornada. The ledger and the
       person's own device state were two separate inventions. They are now
       one list, `DEMO_SESSIONS`, read by both.
     · The company was "Acme Corporation" in front of a Brazilian prospect.
       It is now whatever the salesperson typed (`demo/flag.ts`).
     · The therapist was three people at once — "Dra. Ana Fontes" in the app,
       "Dra. Helena Costa" in the console's user list, "Dr. Ana Silva" in the
       directory — and her notes were in Italian. One person now, and the
       notes are keys like every other string.

   RULE FOR ANYTHING ADDED HERE: it must be reachable ONLY while
   `previewing()` is true. A fixture a real person can meet is not a fixture,
   it is a defect (owner, 2026-10-30) — that is why this lives in `demo/` and
   why nothing outside the mock layer and the preview seed imports it.
   ============================================================================ */

import { DEMO_TENANT_CODE } from '../data/convention'
import type { GlDimension } from '../data/measures'
import { demoCompanyName } from './flag'

const DAY = 86_400_000
const HOUR = 3_600_000

/* ------------------------------------------------------------- the cast ---

   Brazilian, invented, and plausible. The names are already half-present in
   the mock data (`data/mock.ts` has Mariana Alves as the employee, Camila
   Rocha as her HR admin and Dra. Helena Costa as a clinician); what is new
   is that every surface now uses THESE and not its own. */

export const DEMO_PERSON = {
  /** What the app greets her as, and what her therapist's roster shows. */
  name: 'Mariana Alves',
  firstName: 'Mariana',
  email: 'mariana@aurora.co',
  /** The audio says "pronta", not "pronto". Asked at registration, answered
      here so a demo never opens on that question. */
  addressedAs: 'f' as const,
  /** Her id in the clinician's roster — the join that makes it one story. */
  patientId: 'p1',
  employeeRef: 'AUR-0241',
}

export const DEMO_CLINICIAN = {
  id: 'th-helena',
  name: 'Dra. Helena Costa',
  email: 'helena@clinic.demo',
  registration: 'CRP 04/45821',
  /** i18n keys, like every other string a person reads. */
  role: 'Clinical Psychologist',
  bio: 'Works with stress, sleep and the pace of a working week. Fourteen years in practice.',
  areas: ['Stress', 'Sleep', 'Work-life balance'],
}

export const DEMO_HR = {
  name: 'Camila Rocha',
  email: 'camila@aurora.co',
}

/** The company. The NAME is whatever the salesperson typed before opening
    the demo; everything else about it is fixed, because a prospect asks
    about the numbers, not about the licence window. */
export function demoCompany() {
  return {
    code: DEMO_TENANT_CODE,
    companyId: 'goodloop-demo',
    name: demoCompanyName(),
    licences: 250,
    /** 1.5× — the middle of the three contract multipliers, so the demo can
        show what the multiplier does without claiming the best deal. */
    multiplier: 1.5,
  }
}

/* --------------------------------------------------------- her last month ---

   Sixteen sessions over three weeks: mixed lengths, evenings and lunch
   breaks, two she stopped early. It is deliberately not a perfect streak —
   a demo person who never misses a day is a demo person nobody believes,
   and the product's own copy says that missing is not a failure (GAM-R1).

   ONE LIST, TWO READERS. `gamification/mockDemo.ts` credits these through
   the real economy rules to build the wallet, and `admin/preview.ts` writes
   the same ones into her device state so the profile, the journey and the
   mood calendar count the same sessions. They used to be two inventions,
   and they disagreed on screen.

   [days ago, hour in São Paulo (UTC−3), minutes, finished, slug] */
export type DemoSession = [number, number, 6 | 12 | 24, boolean, string]

export const DEMO_SESSIONS: DemoSession[] = [
  [20, 21, 12, true, 'calm-safety'],
  [19, 12, 6, true, 'permission-pause'],
  [17, 22, 24, true, 'calm-safety'],
  [16, 13, 12, true, 'focus-clarity'],
  [15, 8, 6, false, 'breathing-presence'],
  [13, 21, 24, true, 'calm-safety'],
  [12, 12, 12, true, 'focus-clarity'],
  [11, 22, 12, true, 'breathing-presence'],
  [9, 13, 6, true, 'permission-pause'],
  [8, 21, 24, true, 'calm-safety'],
  [6, 12, 12, true, 'focus-clarity'],
  [5, 7, 24, false, 'energy-renewal'],
  [4, 22, 12, true, 'breathing-presence'],
  [3, 13, 6, true, 'permission-pause'],
  [2, 21, 24, true, 'calm-safety'],
  [1, 12, 12, true, 'focus-clarity'],
]

/** When a session started, as a timestamp. São Paulo is UTC−3, and the hour
    in the table above is the local one she would say out loud. */
export function demoSessionStart([ago, hour]: DemoSession, now = Date.now()): number {
  const day = new Date(now - ago * DAY)
  return Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour + 3, 5)
}

/** Seconds of audio actually heard: all of it, or 45% of an early stop. */
export function demoListenedSec([, , min, done]: DemoSession): number {
  return done ? min * 60 : Math.round(min * 60 * 0.45)
}

/** The log rows her own device keeps — what Perfil counts and Minha jornada
    draws. Only finished sessions: an unfinished one is not logged locally
    (`selfuse/SelfUseApp.tsx`), and the demo must not invent an exception. */
export function demoLogs(now = Date.now()) {
  return DEMO_SESSIONS.filter(([, , , done]) => done).map((s) => ({
    at: demoSessionStart(s, now) + demoListenedSec(s) * 1000,
    slug: s[4],
    duration: s[2],
    feedback: undefined as undefined,
  }))
}

/* ------------------------------------------------------------ her month ----

   The mood calendar fills itself from the sliders at the end of a session
   (POs, 2026-11-02), so her days and her sessions are the same days. The
   two axes wander the way a month does: a heavy start, a better second
   week, one bad Monday. Nothing here is a score and nothing trends upward
   on purpose — a demo that draws a cure is a demo that promises one. */
const MOOD_BY_DAYS_AGO: Record<number, { valence: number; arousal: number }> = {
  20: { valence: -0.3, arousal: 0.5 },
  19: { valence: -0.1, arousal: 0.2 },
  17: { valence: 0.1, arousal: -0.2 },
  16: { valence: 0.0, arousal: 0.3 },
  13: { valence: 0.3, arousal: -0.3 },
  12: { valence: 0.2, arousal: 0.1 },
  11: { valence: 0.4, arousal: -0.4 },
  9: { valence: 0.1, arousal: 0.0 },
  8: { valence: 0.5, arousal: -0.5 },
  6: { valence: -0.2, arousal: 0.6 },
  4: { valence: 0.2, arousal: -0.1 },
  3: { valence: 0.4, arousal: -0.2 },
  2: { valence: 0.6, arousal: -0.4 },
  1: { valence: 0.3, arousal: 0.0 },
}

export function demoMoodPoints(): { ago: number; valence: number; arousal: number }[] {
  return Object.entries(MOOD_BY_DAYS_AGO).map(([ago, p]) => ({ ago: Number(ago), ...p }))
}

/** Two weekly check-ins, last week and this one — so the Jornada has
    something to set one week against the other, which is the whole of what
    that card does. Five 1–5 answers, the app's own dimensions
    (`data/measures.ts`). Better, not fixed: sleep is still the hard one. */
export const DEMO_CHECKINS: { ago: number; scores: Record<GlDimension, number> }[] = [
  { ago: 9, scores: { energy: 2, focus: 3, sleep: 2, balance: 2, motivation: 3 } },
  { ago: 2, scores: { energy: 3, focus: 4, sleep: 3, balance: 3, motivation: 4 } },
]

/** What she has put on her own list. */
export const DEMO_SAVED = ['calm-safety', 'permission-pause', 'energy-renewal']

/** The pathway she is on, and how far. Three of the five weeks done — far
    enough to show the ring moving, short enough that "what happens next" is
    still a question the salesperson can answer. */
export const DEMO_PATHWAY = {
  id: 'stress-management' as const,
  startedAgo: 18,
  done: { 1: 5, 2: 5, 3: 2 } as Record<number, number>,
}

export { DAY as DEMO_DAY, HOUR as DEMO_HOUR }

/* ----------------------------------------------------------- who am I? ----

   Three doors, three people. A demo switches surface with a full page load
   (`admin/preview.ts`), so "who is signed in" is decided by which door the
   salesperson walked through — and the legal store below hands out that
   person's profile and their acceptances.

   WHY THE ACCEPTANCES MATTER. All three surfaces opened on a legal wall:
   the app on "Passo 1 de 2 — como funciona", the workspace on the entire
   Professional Terms, the dashboard on "Entendi, em nome da Acme
   Corporation". The mock legal store starts empty, which is right for a
   developer who wants to see the first run and wrong for a demo — these
   three have been using the product for months. The gates themselves are
   untouched: what changed is that the demo's people have a history, which
   is the only honest way to walk past a consent screen. */
export type DemoPersona = 'person' | 'therapist' | 'company'

export function demoPersona(hash = typeof window === 'undefined' ? '' : window.location.hash): DemoPersona {
  if (hash === '#therapist' || hash === '#b2b' || hash === '#b2b-legacy') return 'therapist'
  if (hash === '#hr' || hash === '#employer' || hash === '#corporate') return 'company'
  return 'person'
}

/** Name, e-mail and company for the person behind the current door. */
export function demoProfile(persona: DemoPersona = demoPersona()) {
  if (persona === 'therapist') {
    return { name: DEMO_CLINICIAN.name, email: DEMO_CLINICIAN.email, companyId: null as string | null }
  }
  if (persona === 'company') {
    return { name: DEMO_HR.name, email: DEMO_HR.email, companyId: DEMO_TENANT_CODE as string | null }
  }
  return { name: DEMO_PERSON.name, email: DEMO_PERSON.email, companyId: DEMO_TENANT_CODE as string | null }
}

/** The documents each of them has already accepted. Everyone has the Terms;
    only the clinician has the Professional Terms, and only the sponsor
    console's admin has D-09 — handing all three to everybody would mean the
    gates were never really there. */
export function demoAcceptedDocs(persona: DemoPersona = demoPersona()): string[] {
  if (persona === 'therapist') return ['terms', 'professional']
  if (persona === 'company') return ['terms', 'D-09']
  return ['terms', 'crisis-ack']
}
