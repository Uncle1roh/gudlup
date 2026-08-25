/* ============================================================================
   Self Use — the patient side of Therapist Guided

   What this holds is the PATIENT's view of the link: which therapist they are
   connected to, the booking request they are waiting on, the three-step
   patient onboarding they completed, the prescriptions their therapist wrote,
   the session chronology, goals and messages.

   Three rules the shape of this file enforces:

   · ONE therapist at a time. `link` is a single value, not a list, and
     `connect()` refuses while a link exists.
   · NO protocol codes on this side. A prescription carries a Self Use `slug`;
     the clinical code stays on the therapist's desktop. The therapist chooses
     from a clinical vocabulary, the person hears the wellbeing one, and the
     audio is the same file.
   · The VAS is NOT collected here. The therapist records it verbally from
     their workspace during rapport and debrief; it arrives on this side as a
     read-only data point and the app never shows the person a VAS widget.

   Therapist connection codes differ from company codes: single-use, expiring
   after 72 hours, opaque, carrying no personal data.
   ============================================================================ */

import { useCallback, useEffect, useState } from 'react'
import type { Duration } from '../types/domain'
import { sessionBySlug } from '../data/selfuse'

const KEY = 'gl.therapy'
const CODE_TTL_MS = 72 * 3_600_000

export interface TherapistProfile {
  id: string
  name: string
  role: string
  registration: string
  bio: string
  areas: string[]
  languages: string[]
  specialties: string[]
  /** Next free slot, ms. */
  nextSlot?: number
}

export interface Prescription {
  id: string
  /** Self Use session slug — never a protocol code. */
  slug: string
  duration: Duration
  /** e.g. 3 = three times this week. */
  perWeek: number
  assignedAt: number
  /** How many the person has completed against it. */
  done: number
  status: 'active' | 'completed'
}

export interface TherapySession {
  id: string
  at: number
  /** Self Use session name shown to the person; absent for video-only. */
  slug?: string
  minutes: number
  notesShared: boolean
}

export interface TherapyGoal {
  id: string
  text: string
  status: 'in-progress' | 'achieved'
}

export interface TherapyMessage {
  id: string
  from: 'patient' | 'therapist'
  text: string
  at: number
}

/** The clinical instruments the THERAPIST administers. Read-only here. */
export interface ClinicalScore {
  label: string
  points: { at: number; value: number }[]
  max: number
}

export interface VasPoint {
  at: number
  pre: number
  post: number
}

export interface PatientIntake {
  reason: string
  conditions: string
  medications: string
  clinicalConsentAt: number | null
  notesConsentAt: number | null
  bridge: boolean
  bridgeAt: number | null
}

export interface TherapyLink {
  therapist: TherapistProfile
  linkedAt: number
  intake: PatientIntake | null
  nextSessionAt: number | null
  prescriptions: Prescription[]
  sessions: TherapySession[]
  goals: TherapyGoal[]
  messages: TherapyMessage[]
  vas: VasPoint[]
  scores: ClinicalScore[]
  weeksInTherapy: number
}

export interface BookingRequest {
  therapistId: string
  therapistName: string
  therapistRole: string
  slotMs: number
  sentAt: number
}

export interface TherapyState {
  link: TherapyLink | null
  request: BookingRequest | null
}

export function emptyTherapy(): TherapyState {
  return { link: null, request: null }
}

function key(userId?: string): string {
  return userId ? `${KEY}.${userId}` : KEY
}

export function loadTherapy(userId?: string): TherapyState {
  try {
    const raw = localStorage.getItem(key(userId))
    if (!raw) return emptyTherapy()
    const parsed = JSON.parse(raw) as TherapyState
    return { link: parsed.link ?? null, request: parsed.request ?? null }
  } catch {
    return emptyTherapy()
  }
}

export function saveTherapy(s: TherapyState, userId?: string): void {
  try { localStorage.setItem(key(userId), JSON.stringify(s)) } catch { /* private mode */ }
}

export function useTherapyStore(userId?: string) {
  const [state, setState] = useState<TherapyState>(() => loadTherapy(userId))
  useEffect(() => { setState(loadTherapy(userId)) }, [userId])

  const update = useCallback(
    (fn: (s: TherapyState) => TherapyState) => {
      setState((prev) => {
        const next = fn(prev)
        saveTherapy(next, userId)
        return next
      })
    },
    [userId],
  )

  return { state, update }
}

/* --------------------------------------------------------- connection ----- */

export interface CodeCheck {
  ok: boolean
  reason?: 'invalid' | 'expired'
  therapist?: TherapistProfile
}

/**
 * A therapist connection code is opaque and carries no personal data, so the
 * only thing the client can do locally is check its SHAPE (GL-####-WORD) and
 * hand it to the backend. In a demo build the directory below stands in for
 * that call; an expired code is reported separately from an invalid one
 * because the two need different copy ("ask your therapist for a new one").
 */
export function checkConnectionCode(raw: string, directory: TherapistProfile[], now = Date.now()): CodeCheck {
  const code = raw.trim().toUpperCase()
  if (!/^GL-\d{4}-[A-Z]{3,10}$/.test(code)) return { ok: false, reason: 'invalid' }
  const issued = DEMO_CODES[code]
  if (!issued) return { ok: false, reason: 'invalid' }
  if (now - issued.issuedAt > CODE_TTL_MS) return { ok: false, reason: 'expired' }
  const therapist = directory.find((d) => d.id === issued.therapistId)
  if (!therapist) return { ok: false, reason: 'invalid' }
  return { ok: true, therapist }
}

/** Codes a therapist generated from their desktop. Demo stand-in for the API. */
export const DEMO_CODES: Record<string, { therapistId: string; issuedAt: number }> = {
  'GL-4829-ALPHA': { therapistId: 'th-silva', issuedAt: Date.now() - 3_600_000 },
  'GL-1174-DELTA': { therapistId: 'th-moreira', issuedAt: Date.now() - 96 * 3_600_000 }, // expired
}

/* ------------------------------------------------------------ directory ---- */

const HOUR = 3_600_000
const DAY = 86_400_000

/** The therapists a company convention makes bookable. Real deployments read
    this from the convention; the shape is what the screens consume. */
export const DEMO_THERAPISTS: TherapistProfile[] = [
  {
    id: 'th-silva',
    name: 'Dr. Ana Silva',
    role: 'Clinical Psychologist',
    registration: 'CRP 06/158342',
    bio: 'Specializing in stress management and burnout prevention. 12 years of clinical experience.',
    areas: ['Stress', 'Burnout', 'Work-life balance'],
    languages: ['English', 'Portuguese'],
    specialties: ['Stress', 'Burnout'],
    nextSlot: Date.now() + 3 * DAY + 15 * HOUR,
  },
  {
    id: 'th-moreira',
    name: 'Dr. Carlos Moreira',
    role: 'Clinical Psychologist',
    registration: 'CRP 06/167221',
    bio: 'Focused on anxiety and resilience building with an integrative, evidence-based approach.',
    areas: ['Anxiety', 'Resilience'],
    languages: ['English', 'Portuguese', 'Spanish'],
    specialties: ['Anxiety', 'Resilience'],
    nextSlot: Date.now() + 4 * DAY + 10 * HOUR,
  },
  {
    id: 'th-rocha',
    name: 'Dr. Lucia Rocha',
    role: 'Clinical Psychologist',
    registration: 'CRP 06/171904',
    bio: 'Works with stress, balance and sustainable working habits.',
    areas: ['Stress', 'Balance'],
    languages: ['English', 'Italian'],
    specialties: ['Stress', 'Balance'],
    nextSlot: Date.now() + 5 * DAY + 14 * HOUR,
  },
]

/**
 * The presentation metadata for a therapist the DATA LAYER returned.
 *
 * A listing from `listAvailableTherapists()` carries an id, a name and an
 * avatar — everything a booking needs and nothing a person wants to read
 * before choosing someone. The bio, the areas and the languages are profile
 * content; until they live on the therapist record, this fills them in for the
 * professionals the demo knows and degrades to the plain listing for anyone
 * else, rather than showing an empty card.
 */
export function profileFor(listing: { id: string; name: string }): TherapistProfile {
  const known = DEMO_THERAPISTS.find((d) => d.id === listing.id || d.name === listing.name)
  if (known) return known
  return {
    id: listing.id,
    name: listing.name,
    role: 'Clinical Psychologist',
    registration: '',
    bio: '',
    areas: [],
    languages: [],
    specialties: [],
  }
}

/** Concrete openings for a therapist over the next two weeks. */
export function openingsFor(t: TherapistProfile, now = Date.now()): { day: number; slots: number[] }[] {
  const out: { day: number; slots: number[] }[] = []
  const base = new Date(now)
  for (let d = 1; d <= 7; d += 1) {
    const day = new Date(base.getFullYear(), base.getMonth(), base.getDate() + d)
    if (day.getDay() === 0 || day.getDay() === 6) continue
    // A deterministic spread so the same therapist always offers the same grid.
    const hours = t.id.charCodeAt(3) % 2 === 0 ? [10, 14, 16] : [9, 11, 15]
    out.push({ day: day.getTime(), slots: hours.map((h) => day.getTime() + h * HOUR) })
  }
  return out
}

/* ------------------------------------------------------------ selectors ---- */

export function prescriptionLabel(p: Prescription): string {
  const s = sessionBySlug(p.slug)
  return s ? s.name : p.slug
}

export function adherence(p: Prescription): number {
  if (p.perWeek <= 0) return 0
  return Math.min(100, Math.round((p.done / p.perWeek) * 100))
}

/** "Join Session" opens 15 minutes before the start and stays open until the
    slot has run its course. */
export const JOIN_WINDOW_MS = 15 * 60_000

export function canJoin(nextSessionAt: number | null, now = Date.now()): boolean {
  if (!nextSessionAt) return false
  return now >= nextSessionAt - JOIN_WINDOW_MS && now < nextSessionAt + 60 * 60_000
}

/** A demo link, used when a person connects with a valid code so every screen
    downstream (progress, prescriptions, chronology) has something to show. */
export function seedLink(therapist: TherapistProfile, now = Date.now()): TherapyLink {
  return {
    therapist,
    linkedAt: now,
    intake: null,
    nextSessionAt: now + 3 * DAY + 15 * HOUR,
    prescriptions: [
      { id: 'rx1', slug: 'calm-safety', duration: 12, perWeek: 3, assignedAt: now - 2 * DAY, done: 2, status: 'active' },
      { id: 'rx2', slug: 'inner-strength', duration: 12, perWeek: 2, assignedAt: now - 2 * DAY, done: 0, status: 'active' },
    ],
    sessions: [
      { id: 's1', at: now - 6 * DAY, slug: 'focus-clarity', minutes: 24, notesShared: true },
      { id: 's2', at: now - 13 * DAY, slug: 'calm-safety', minutes: 24, notesShared: true },
      { id: 's3', at: now - 20 * DAY, slug: 'inner-strength', minutes: 24, notesShared: true },
    ],
    goals: [
      { id: 'g1', text: 'Reduce anticipatory anxiety before meetings', status: 'in-progress' },
      { id: 'g2', text: 'Re-establish an evening wind-down routine', status: 'achieved' },
    ],
    messages: [
      { id: 'm1', from: 'therapist', text: "Let's build on the breathing work in our next session.", at: now - 2 * DAY },
    ],
    vas: [
      { at: now - 20 * DAY, pre: 7, post: 5 },
      { at: now - 13 * DAY, pre: 7, post: 4 },
      { at: now - 6 * DAY, pre: 6, post: 3 },
    ],
    scores: [
      { label: 'DASS-21', max: 42, points: [{ at: now - 60 * DAY, value: 22 }, { at: now - 20 * DAY, value: 18 }] },
      { label: 'PSS-10', max: 40, points: [{ at: now - 60 * DAY, value: 24 }, { at: now - 20 * DAY, value: 21 }] },
      { label: 'BRS', max: 5, points: [{ at: now - 60 * DAY, value: 3.1 }, { at: now - 20 * DAY, value: 3.4 }] },
    ],
    weeksInTherapy: 6,
  }
}
