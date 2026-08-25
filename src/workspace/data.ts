/* ============================================================================
   Therapist Workspace — state

   The clinical side of the same material the Self Use app plays. What lives
   here is a therapist's own caseload: patients, calendar, notes, prescriptions,
   reports, messages and their private performance figures.

   Boundaries this file makes structural rather than aspirational:

   · A therapist's data is theirs. `Performance` is explicitly marked as never
     leaving this surface — corporate sees aggregate counts across all
     therapists and nothing per-therapist.
   · Clinical notes are ONE free-text entry per session, tagged "Session #N",
     not a Pre/During/Debrief split. The Good Loop quick-notes fold into that
     same entry with their timestamps.
   · The VAS is recorded BY the therapist from the patient's verbal answer.
     There is no patient-facing VAS widget anywhere in the product, so `vasPre`
     / `vasPost` only ever get written from this side.
   · Prescriptions may only carry one of the 19 Self Use protocols. The six
     clinical-only ones are usable in a LIVE session and are refused as
     homework — `prescribableProtocols()` is the single place that holds.
   ============================================================================ */

import { useCallback, useEffect, useState } from 'react'
import type { Duration } from '../types/domain'
import { PROTOCOLS } from '../data/protocols'
import { isClinicalOnly, sessionForProtocol } from '../data/selfuse'

const KEY = 'gl.workspace'
const DAY = 86_400_000
const HOUR = 3_600_000

/* ------------------------------------------------------------ therapist -- */

export type VerificationState = 'pending' | 'approved' | 'rejected' | 'docs-needed'

export interface TherapistAccount {
  fullName: string
  email: string
  licenceNumber: string
  licenceRegion: string
  glcpNumber: string
  photoDataUrl?: string
  certificateName?: string
  bio: string
  specializations: string[]
  verification: VerificationState
  verificationReason?: string
  verificationRef: string
  submittedAt: number | null
  termsSignedAt: number | null
  sandboxSeenAt: number | null
  online: boolean
}

/* -------------------------------------------------------------- patients -- */

export type PatientStatus = 'active' | 'inactive' | 'new'

export interface AssessmentPoint {
  instrument: string
  at: number
  /** DASS-21 carries three sub-scores; the others carry one. */
  values: { label: string; value: number }[]
}

export interface SessionRow {
  id: string
  at: number
  kind: 'gl-video' | 'video'
  protocolCode?: string
  version?: Duration
  minutes: number
  phasesCompleted?: number
  pauses?: number
  interventions?: number
  vasPre?: number
  vasPost?: number
  /** One free-text clinical note per session, tagged "Session #N". */
  note: string
  noteNumber: number
  goal?: string
  goalStatus?: 'addressed' | 'partial' | 'deferred'
  nextGoal?: string
  signedAt?: number
  signatureVersion: number
}

export interface WorkspacePrescription {
  id: string
  patientId: string
  protocolCode: string
  version: Duration
  perWeek: number
  fromAt: number
  toAt: number
  done: number
  clinicalNote?: string
  nudgedAt?: number
}

export interface WorkspaceNote {
  id: string
  at: number
  /** "Session #8" or "General". */
  tag: string
  time?: string
  text: string
}

export interface WorkspaceGoal {
  id: string
  text: string
  status: 'in-progress' | 'achieved' | 'revisit'
  createdAt: number
  closedAt?: number
}

export interface BridgedSession {
  at: number
  protocolCode: string
  minutes: number
  completed: boolean
}

export interface WorkspaceMessage {
  id: string
  from: 'patient' | 'therapist'
  text: string
  at: number
  read: boolean
}

export interface WorkspacePatient {
  id: string
  name: string
  memberSince: number
  company?: string
  status: PatientStatus
  linkedAt: number
  nextSessionAt?: number
  lastSessionAt?: number
  sessions: SessionRow[]
  assessments: AssessmentPoint[]
  assessmentDue?: string
  notes: WorkspaceNote[]
  goals: WorkspaceGoal[]
  prescriptions: WorkspacePrescription[]
  /** Present only when the patient consented to the Self Use bridge. */
  bridged: boolean
  bridgedSessions: BridgedSession[]
  messages: WorkspaceMessage[]
  consentTherapy: boolean
}

/* -------------------------------------------------------------- calendar -- */

export interface AvailabilityDay {
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number
  enabled: boolean
  ranges: { from: string; to: string }[]
}

export interface BookingRequest {
  id: string
  patientId: string
  patientName: string
  requestedAt: number
  slotAt: number
}

export interface MessageTemplate {
  id: string
  text: string
  builtIn: boolean
}

export interface WorkspaceSettings {
  sessionMinutes: 45 | 50 | 60
  bufferMinutes: 0 | 10 | 15 | 30
  availability: AvailabilityDay[]
  templates: MessageTemplate[]
  notifications: Record<string, boolean>
  twoFactor: boolean
  calendarSync: { google: boolean; outlook: boolean }
}

export interface WorkspaceState {
  account: TherapistAccount
  patients: WorkspacePatient[]
  requests: BookingRequest[]
  settings: WorkspaceSettings
  /** The one active connection code, if any. Single-use, 72h. */
  connectionCode: { code: string; issuedAt: number } | null
}

export const CODE_TTL_MS = 72 * HOUR

/* --------------------------------------------------------------- seeds --- */

const NOTIFICATIONS: { key: string; label: string }[] = [
  { key: 'booking', label: 'New booking request' },
  { key: 'reminder', label: 'Session reminder (1h before)' },
  { key: 'message', label: 'Patient message received' },
  { key: 'assessment', label: 'Assessment results received' },
  { key: 'sla', label: 'SLA warning (>24h unanswered)' },
  { key: 'adherence', label: 'Prescription adherence alert' },
  { key: 'inactivity', label: 'Patient inactivity alert (>7 days)' },
]

export const NOTIFICATION_ROWS = NOTIFICATIONS

const DEFAULT_TEMPLATES: MessageTemplate[] = [
  { id: 'tpl1', text: "I've received your message and will respond within 48 hours.", builtIn: true },
  { id: 'tpl2', text: "Thank you for sharing. We'll discuss this in our next session.", builtIn: true },
  { id: 'tpl3', text: 'Remember to complete your prescribed sessions this week.', builtIn: true },
]

function weekdayTemplate(): AvailabilityDay[] {
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    enabled: weekday >= 1 && weekday <= 5,
    ranges: weekday >= 1 && weekday <= 5 ? [{ from: '09:00', to: '17:00' }] : [],
  }))
}

export function emptyWorkspace(): WorkspaceState {
  return {
    account: {
      fullName: '',
      email: '',
      licenceNumber: '',
      licenceRegion: '',
      glcpNumber: '',
      bio: '',
      specializations: [],
      verification: 'pending',
      verificationRef: '',
      submittedAt: null,
      termsSignedAt: null,
      sandboxSeenAt: null,
      online: true,
    },
    patients: [],
    requests: [],
    settings: {
      sessionMinutes: 50,
      bufferMinutes: 10,
      availability: weekdayTemplate(),
      templates: DEFAULT_TEMPLATES,
      notifications: Object.fromEntries(NOTIFICATIONS.map((n) => [n.key, true])),
      twoFactor: false,
      calendarSync: { google: false, outlook: false },
    },
    connectionCode: null,
  }
}

/** A demo caseload, so every screen is navigable before a backend exists. */
export function demoWorkspace(account: Partial<TherapistAccount> = {}): WorkspaceState {
  const now = Date.now()
  const base = emptyWorkspace()
  const acct: TherapistAccount = {
    ...base.account,
    fullName: 'Dr. Ana Ribeiro',
    email: 'ana.ribeiro@example.com',
    licenceNumber: 'CRP 06/158342',
    licenceRegion: 'SP',
    glcpNumber: 'GLCP-2025-0418',
    bio: 'Clinical psychologist specializing in anxiety and stress-related disorders. 12 years of practice with a focus on evidence-based, integrative approaches.',
    specializations: ['Anxiety', 'Stress', 'Burnout'],
    verification: 'approved',
    verificationRef: 'GLCP-VR-40218',
    submittedAt: now - 40 * DAY,
    termsSignedAt: now - 39 * DAY,
    sandboxSeenAt: now - 39 * DAY,
    ...account,
  }

  const mk = (
    id: string,
    name: string,
    opts: Partial<WorkspacePatient> & { nextIn?: number; lastAgo?: number },
  ): WorkspacePatient => ({
    id,
    name,
    memberSince: now - 400 * DAY,
    company: 'Nexa Health',
    status: 'active',
    linkedAt: now - 380 * DAY,
    nextSessionAt: opts.nextIn != null ? now + opts.nextIn : undefined,
    lastSessionAt: opts.lastAgo != null ? now - opts.lastAgo : undefined,
    sessions: [],
    assessments: [],
    notes: [],
    goals: [],
    prescriptions: [],
    bridged: false,
    bridgedSessions: [],
    messages: [],
    consentTherapy: true,
    ...opts,
  })

  const maria = mk('p-maria', 'Maria Santos', {
    nextIn: 2 * HOUR,
    lastAgo: 6 * DAY,
    assessmentDue: 'DASS-21 (T2)',
    bridged: true,
    sessions: [
      {
        id: 's-m1', at: now - 6 * DAY, kind: 'gl-video', protocolCode: 'GL-ANX 1.2', version: 12,
        minutes: 52, phasesCompleted: 6, pauses: 1, interventions: 0, vasPre: 6, vasPost: 3,
        note: 'Patient showed significant easing through the processing phase.', noteNumber: 8,
        signedAt: now - 6 * DAY + HOUR, signatureVersion: 1,
      },
      {
        id: 's-m2', at: now - 13 * DAY, kind: 'video', minutes: 48,
        note: 'Intake session, discussed anticipatory anxiety triggers around work meetings.', noteNumber: 7,
        signedAt: now - 13 * DAY + HOUR, signatureVersion: 1,
      },
    ],
    assessments: [
      { instrument: 'DASS-21', at: now - 190 * DAY, values: [{ label: 'Depression', value: 18 }, { label: 'Anxiety', value: 22 }, { label: 'Stress', value: 20 }] },
      { instrument: 'DASS-21', at: now - 95 * DAY, values: [{ label: 'Depression', value: 16 }, { label: 'Anxiety', value: 20 }, { label: 'Stress', value: 17 }] },
      { instrument: 'DASS-21', at: now - 5 * DAY, values: [{ label: 'Depression', value: 14 }, { label: 'Anxiety', value: 19 }, { label: 'Stress', value: 16 }] },
      { instrument: 'PSS-10', at: now - 5 * DAY, values: [{ label: 'PSS-10', value: 21 }] },
      { instrument: 'BRS', at: now - 5 * DAY, values: [{ label: 'BRS', value: 3.4 }] },
    ],
    notes: [
      { id: 'n1', at: now - 1 * DAY, tag: 'Session #8', time: '14:00', text: 'Difficult week — two anxiety spikes before team meetings. Ran GL-ANX 1.2; visible relaxation by phase 2. Debrief: patient calmer and more grounded, imagery especially helpful. VAS 6→3.' },
      { id: 'n2', at: now - 6 * DAY, tag: 'General', text: 'Between sessions: patient emailed about medication timing. Advised to raise with prescribing physician; noted for next session.' },
      { id: 'n3', at: now - 13 * DAY, tag: 'Session #7', time: '10:30', text: 'Intake. Discussed anticipatory anxiety triggers around work meetings. Established home breathing routine. Video-only session.' },
    ],
    goals: [
      { id: 'g1', text: 'Reduce anticipatory anxiety before meetings', status: 'in-progress', createdAt: now - 60 * DAY },
      { id: 'g2', text: 'Re-establish evening wind-down routine', status: 'achieved', createdAt: now - 90 * DAY, closedAt: now - 20 * DAY },
    ],
    prescriptions: [
      { id: 'rx-m1', patientId: 'p-maria', protocolCode: 'GL-ANX 1.1', version: 6, perWeek: 3, fromAt: now - 6 * DAY, toAt: now + DAY, done: 2 },
    ],
    bridgedSessions: [
      { at: now - 3 * DAY, protocolCode: 'GL-STRESS 4.1', minutes: 12, completed: true },
      { at: now - 4 * DAY, protocolCode: 'GL-ANX 1.1', minutes: 6, completed: true },
      { at: now - 6 * DAY, protocolCode: 'GL-STRESS 4.1', minutes: 12, completed: true },
    ],
    messages: [
      { id: 'm1', from: 'patient', text: 'Hi Dr. Ribeiro — I tried the breathing exercise before my meeting today and it actually helped.', at: now - 5 * HOUR, read: true },
      { id: 'm2', from: 'therapist', text: "That's wonderful to hear, Maria. Let's build on it in our session this afternoon.", at: now - 4 * HOUR, read: true },
      { id: 'm3', from: 'patient', text: 'Thank you, that really helped this week 🙏', at: now - 2 * HOUR, read: false },
    ],
  })

  const joao = mk('p-joao', 'João Carvalho', {
    nextIn: DAY + 2 * HOUR,
    lastAgo: 7 * DAY,
    sessions: [
      { id: 's-j1', at: now - 7 * DAY, kind: 'gl-video', protocolCode: 'GL-ANX 1.1', version: 6, minutes: 46, phasesCompleted: 6, vasPre: 5, vasPost: 4, note: 'Steady progress; homework adherence good.', noteNumber: 4, signatureVersion: 0 },
    ],
    prescriptions: [],
    messages: [{ id: 'mj1', from: 'patient', text: "Could we move next week's session?", at: now - 26 * HOUR, read: false }],
  })

  const lucia = mk('p-lucia', 'Lúcia Pereira', {
    lastAgo: 34 * DAY,
    status: 'inactive',
    prescriptions: [
      { id: 'rx-l1', patientId: 'p-lucia', protocolCode: 'GL-ANX 1.1', version: 6, perWeek: 3, fromAt: now - 6 * DAY, toAt: now + DAY, done: 2 },
    ],
    messages: [{ id: 'ml1', from: 'patient', text: "I've been feeling much better lately", at: now - 3 * DAY, read: false }],
  })

  const rafael = mk('p-rafael', 'Rafael Fonseca', {
    nextIn: 2 * DAY + 6 * HOUR,
    lastAgo: 12 * DAY,
    sessions: [
      { id: 's-r1', at: now - 12 * DAY, kind: 'gl-video', protocolCode: 'GL-STRESS 4.1', version: 24, minutes: 58, phasesCompleted: 6, vasPre: 7, vasPost: 4, note: 'Deep version well tolerated.', noteNumber: 3, signedAt: now - 12 * DAY, signatureVersion: 1 },
    ],
    prescriptions: [
      { id: 'rx-r1', patientId: 'p-rafael', protocolCode: 'GL-STRESS 4.1', version: 12, perWeek: 2, fromAt: now - 12 * DAY, toAt: now + 2 * DAY, done: 2 },
    ],
  })

  const teresa = mk('p-teresa', 'Teresa Alves', { nextIn: 3 * DAY + 3 * HOUR, lastAgo: 9 * DAY, status: 'new' })
  const bruno = mk('p-bruno', 'Bruno Dias', {
    lastAgo: 20 * DAY,
    prescriptions: [
      { id: 'rx-b1', patientId: 'p-bruno', protocolCode: 'GL-DEP 2.4', version: 12, perWeek: 3, fromAt: now - 6 * DAY, toAt: now + DAY, done: 1 },
    ],
  })

  return {
    ...base,
    account: acct,
    patients: [maria, joao, lucia, rafael, teresa, bruno],
    requests: [
      { id: 'br1', patientId: 'p-lucia', patientName: 'Lúcia Pereira', requestedAt: now - 2 * DAY, slotAt: now + 4 * DAY + 7 * HOUR },
      { id: 'br2', patientId: 'p-bruno', patientName: 'Bruno Dias', requestedAt: now - DAY, slotAt: now + 5 * DAY + 3 * HOUR },
    ],
    settings: {
      ...base.settings,
      availability: base.settings.availability.map((d) =>
        d.weekday === 1 ? { ...d, ranges: [{ from: '09:00', to: '12:00' }, { from: '14:00', to: '18:00' }] } : d,
      ),
    },
  }
}

/* ---------------------------------------------------------------- hook --- */

export function loadWorkspace(): WorkspaceState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return demoWorkspace()
    const parsed = JSON.parse(raw) as WorkspaceState
    const base = demoWorkspace()
    return {
      ...base,
      ...parsed,
      account: { ...base.account, ...parsed.account },
      settings: { ...base.settings, ...parsed.settings },
    }
  } catch {
    return demoWorkspace()
  }
}

export function saveWorkspace(s: WorkspaceState): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* private mode */ }
}

export function useWorkspace() {
  const [state, setState] = useState<WorkspaceState>(() => loadWorkspace())
  const update = useCallback((fn: (s: WorkspaceState) => WorkspaceState) => {
    setState((prev) => {
      const next = fn(prev)
      saveWorkspace(next)
      return next
    })
  }, [])
  useEffect(() => { saveWorkspace(state) }, [state])
  return { state, update }
}

/* ----------------------------------------------------------- selectors --- */

/** The 19 protocols a therapist may prescribe as homework. The six
    clinical-only ones are excluded here and nowhere else, so the rule cannot
    be bypassed by a caller that forgets it. */
export function prescribableProtocols() {
  return PROTOCOLS.filter((p) => !isClinicalOnly(p.code) && sessionForProtocol(p.code))
}

/** All 25 protocols, grouped by cluster — usable in a LIVE session only. */
export function protocolsByCluster() {
  const map = new Map<string, typeof PROTOCOLS>()
  for (const p of PROTOCOLS) {
    map.set(p.family, [...(map.get(p.family) ?? []), p])
  }
  return [...map.entries()].map(([family, list]) => ({ family, list }))
}

export const CLUSTER_LABEL: Record<string, string> = {
  'GL-ANX': 'Anxiety',
  'GL-DEP': 'Depression',
  'GL-BURN': 'Burnout',
  'GL-STRESS': 'Stress',
  'GL-RESIL': 'Resilience',
  'GL-LIB': 'Library',
}

export function adherencePct(rx: WorkspacePrescription): number {
  const weeks = Math.max(1, Math.round((rx.toAt - rx.fromAt) / (7 * DAY)))
  const target = rx.perWeek * weeks
  return target > 0 ? Math.min(100, Math.round((rx.done / target) * 100)) : 0
}

export type AdherenceBand = 'green' | 'yellow' | 'red'
export function adherenceBand(p: number): AdherenceBand {
  return p >= 70 ? 'green' : p >= 40 ? 'yellow' : 'red'
}

/** VAS deltas for the last N sessions, oldest first — the sparkline source. */
export function vasSeries(p: WorkspacePatient, n = 8): number[] {
  return [...p.sessions]
    .filter((s) => s.vasPre != null && s.vasPost != null)
    .sort((a, b) => a.at - b.at)
    .slice(-n)
    .map((s) => (s.vasPre as number) - (s.vasPost as number))
}

export function vasDirection(p: WorkspacePatient): 'up' | 'down' | 'flat' | null {
  const s = vasSeries(p)
  if (s.length < 2) return null
  const diff = s[s.length - 1] - s[0]
  return Math.abs(diff) < 0.5 ? 'flat' : diff > 0 ? 'up' : 'down'
}

export function unreadCount(state: WorkspaceState): number {
  return state.patients.reduce((n, p) => n + p.messages.filter((m) => m.from === 'patient' && !m.read).length, 0)
}

export function lowAdherencePatients(state: WorkspaceState): number {
  return state.patients.filter((p) => p.prescriptions.some((rx) => adherenceBand(adherencePct(rx)) === 'red')).length
}

export function nextSessionNumber(p: WorkspacePatient): number {
  return Math.max(0, ...p.sessions.map((s) => s.noteNumber)) + 1
}

/** SLA on an unanswered patient message: amber past 24h, red past 48h. */
export function slaBand(p: WorkspacePatient, now = Date.now()): 'none' | 'amber' | 'red' {
  const lastPatient = [...p.messages].reverse().find((m) => m.from === 'patient')
  if (!lastPatient) return 'none'
  const lastTherapist = [...p.messages].reverse().find((m) => m.from === 'therapist')
  if (lastTherapist && lastTherapist.at > lastPatient.at) return 'none'
  const age = now - lastPatient.at
  if (age > 48 * HOUR) return 'red'
  if (age > 24 * HOUR) return 'amber'
  return 'none'
}

/** Assessment timing: T0 baseline, then end of months 1, 2 and 3. */
export function assessmentDueLabel(p: WorkspacePatient, now = Date.now()): string | null {
  if (!p.sessions.length) return 'T0 (baseline)'
  const first = Math.min(...p.sessions.map((s) => s.at))
  const months = Math.floor((now - first) / (30 * DAY))
  const taken = p.assessments.filter((a) => a.instrument === 'DASS-21').length
  if (months >= 1 && taken < months + 1 && months <= 3) return `T${months} due`
  return null
}

/** A single-use connection code, valid for 72 hours. */
export function generateConnectionCode(): string {
  const words = ['ALPHA', 'DELTA', 'SIGMA', 'OMEGA', 'LUMEN', 'NOVA', 'ORBIT', 'CEDAR']
  const n = Math.floor(1000 + Math.random() * 9000)
  return `GL-${n}-${words[Math.floor(Math.random() * words.length)]}`
}

export function codeExpired(code: { issuedAt: number } | null, now = Date.now()): boolean {
  return !code || now - code.issuedAt > CODE_TTL_MS
}

/* ---------------------------------------------------------- performance -- */

export interface PerformanceCard {
  label: string
  value: string
  unit?: string
  sub: string
  trend: string
  series: number[]
}

/**
 * The therapist's own figures. NOT visible to admin or corporate individually —
 * corporate sees one anonymous count of employees using professional support,
 * and nothing that could be attributed to a named professional.
 */
export function performance(state: WorkspaceState, period: 'week' | 'month' | 'quarter'): PerformanceCard[] {
  const factor = period === 'week' ? 0.25 : period === 'quarter' ? 3 : 1
  const all = state.patients.flatMap((p) => p.sessions)
  const withGl = all.filter((s) => s.kind === 'gl-video')
  const durations = all.map((s) => s.minutes)
  const avgDuration = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0
  const deltas = all
    .filter((s) => s.vasPre != null && s.vasPost != null)
    .map((s) => (s.vasPost as number) - (s.vasPre as number))
  const avgDelta = deltas.length ? Number((deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(1)) : 0
  const rxs = state.patients.flatMap((p) => p.prescriptions)
  const avgAdherence = rxs.length ? Math.round(rxs.reduce((n, r) => n + adherencePct(r), 0) / rxs.length) : 0
  const activePatients = state.patients.filter((p) => p.lastSessionAt && Date.now() - p.lastSessionAt < 30 * DAY).length

  const spark = (base: number) => Array.from({ length: 8 }, (_, i) => base * (0.85 + ((i * 7) % 5) / 20))

  return [
    { label: 'Total sessions', value: String(Math.round(all.length * 8 * factor)), sub: `this ${period}`, trend: '+12%', series: spark(40) },
    { label: 'Avg session duration', value: String(avgDuration), unit: 'min', sub: `this ${period}`, trend: '+3%', series: spark(50) },
    { label: 'Good Loop utilization', value: String(all.length ? Math.round((withGl.length / all.length) * 100) : 0), unit: '%', sub: 'of sessions include treatment', trend: '+8%', series: spark(60) },
    { label: 'Avg VAS delta', value: String(avgDelta), unit: 'pre→post', sub: 'lower is a larger drop', trend: '+0.3', series: spark(2) },
    { label: 'Prescription adherence', value: String(avgAdherence), unit: '%', sub: 'across active prescriptions', trend: '−2%', series: spark(74) },
    { label: 'Cancellation rate', value: '6', unit: '%', sub: `this ${period}`, trend: 'Stable', series: spark(6) },
    { label: 'Patient satisfaction', value: '4.7', unit: '/ 5', sub: 'where collected', trend: '+0.1', series: spark(4.7) },
    { label: 'Active patients', value: String(activePatients), sub: 'last 30 days', trend: '+2', series: spark(activePatients || 1) },
  ]
}
