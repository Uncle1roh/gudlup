/* ============================================================================
   B2B (telemedicine) demo data. Mock caseload so the therapist console is fully
   navigable for the stakeholder demo, before any backend exists.
   ============================================================================ */

const DAY = 86_400_000
const HOUR = 3_600_000
const now = Date.now()

export interface Goal {
  text: string
  status: 'achieved' | 'in-progress' | 'review'
}

/** A clinical instrument tracked across T0/T1/T2. */
export interface Score {
  label: string
  max: number
  lowerIsBetter: boolean
  t0: number
  t1?: number
  t2?: number
}

export interface RapidNote {
  phase: number
  at: number // seconds into the session
  text: string
}

export interface B2bSession {
  id: string
  date: number
  protocolCode: string
  duration: number
  vasPre: number
  vasPost: number
  notes: RapidNote[]
}

export interface B2cSession {
  date: number
  protocolCode: string
  duration: number
  vasPre: number
  vasPost: number
}

export interface Message {
  from: 'patient' | 'therapist'
  text: string
  at: number
}

export interface Patient {
  id: string
  name: string
  age: number
  sex: 'F' | 'M'
  reason: string
  conditions: string[]
  medications: string[]
  contraindications: string[]
  goals: Goal[]
  scores: Score[]
  b2bSessions: B2bSession[]
  b2cSessions: B2cSession[]
  messages: Message[]
  clinicalNotes: string
  prescription?: string
  // roster status
  lastSessionAt?: number
  nextSessionAt?: number
  vasTrend: 'up' | 'down' | 'stable'
  assessmentDue?: string
  b2cInactiveDays?: number
  unread: number
  consents: { therapy: boolean; sharing: boolean; aggregates: boolean }
}

export interface Therapist {
  name: string
  crp: string
  status: 'pending' | 'approved'
  avatar: string
}

export const DEMO_THERAPIST: Therapist = {
  name: 'Dra. Helena Costa',
  crp: 'CRP 04/45821',
  status: 'approved',
  avatar: '👩🏻‍⚕️',
}

export const DEMO_PATIENTS: Patient[] = [
  {
    id: 'p1',
    name: 'Mariana Alves',
    age: 34,
    sex: 'F',
    reason: 'Generalised anxiety, work-related',
    conditions: ['Generalised anxiety disorder', 'Insomnia (mild)'],
    medications: ['Escitalopram 10mg'],
    contraindications: ['None flagged for GL audio'],
    goals: [
      { text: 'Reduce night-time rumination', status: 'in-progress' },
      { text: 'Build a daily wind-down habit', status: 'achieved' },
    ],
    scores: [
      { label: 'DASS-21 Anxiety', max: 42, lowerIsBetter: true, t0: 26, t1: 20, t2: 15 },
      { label: 'PSS-10', max: 40, lowerIsBetter: true, t0: 28, t1: 22 },
      { label: 'BRS (resilience)', max: 5, lowerIsBetter: false, t0: 2.4, t1: 3.1 },
    ],
    b2bSessions: [
      { id: 'b1', date: now - 14 * DAY, protocolCode: 'GL-ANX 1.1', duration: 24, vasPre: 3, vasPost: 6, notes: [{ phase: 4, at: 540, text: 'Visible easing of shoulders during Processing.' }] },
      { id: 'b2', date: now - 7 * DAY, protocolCode: 'GL-ANX 1.1', duration: 24, vasPre: 4, vasPost: 7, notes: [{ phase: 3, at: 300, text: 'Brief tearfulness at bilateral onset — settled quickly.' }] },
    ],
    b2cSessions: [
      { date: now - 5 * DAY, protocolCode: 'GL-ANX 1.1', duration: 12, vasPre: 4, vasPost: 6 },
      { date: now - 3 * DAY, protocolCode: 'GL-ANX 1.1', duration: 12, vasPre: 4, vasPost: 7 },
      { date: now - 1 * DAY, protocolCode: 'GL-ANX 1.1', duration: 12, vasPre: 5, vasPost: 7 },
    ],
    messages: [
      { from: 'patient', text: 'The evening sessions are really helping me fall asleep faster.', at: now - 2 * DAY },
      { from: 'therapist', text: "That's great to hear, Mariana. Keep them up this week.", at: now - 2 * DAY + HOUR },
    ],
    clinicalNotes: 'Responding well. Consider stepping to maintenance cadence after T2.',
    prescription: '3× GL-ANX Quick / week',
    lastSessionAt: now - 7 * DAY,
    nextSessionAt: now + 2 * HOUR,
    vasTrend: 'up',
    b2cInactiveDays: 1,
    unread: 0,
    consents: { therapy: true, sharing: true, aggregates: true },
  },
  {
    id: 'p2',
    name: 'João Pereira',
    age: 41,
    sex: 'M',
    reason: 'Occupational burnout',
    conditions: ['Burnout', 'Hypertension'],
    medications: ['Losartan 50mg'],
    contraindications: ['None flagged for GL audio'],
    goals: [{ text: 'Re-establish boundaries with work hours', status: 'in-progress' }],
    scores: [
      { label: 'CBI (burnout)', max: 100, lowerIsBetter: true, t0: 72, t1: 64 },
      { label: 'DASS-21 Stress', max: 42, lowerIsBetter: true, t0: 30, t1: 28 },
    ],
    b2bSessions: [
      { id: 'b3', date: now - 10 * DAY, protocolCode: 'GL-STRESS 4.1', duration: 24, vasPre: 2, vasPost: 5, notes: [] },
    ],
    b2cSessions: [{ date: now - 9 * DAY, protocolCode: 'GL-STRESS 4.1', duration: 6, vasPre: 3, vasPost: 4 }],
    messages: [{ from: 'patient', text: 'Had a rough week, did not manage many sessions.', at: now - 26 * HOUR }],
    clinicalNotes: 'Adherence dropping. Address barriers at next session.',
    prescription: '2× GL-STRESS Standard / week',
    lastSessionAt: now - 10 * DAY,
    nextSessionAt: now + 1 * DAY,
    vasTrend: 'stable',
    assessmentDue: 'DASS-21 (T2)',
    b2cInactiveDays: 9,
    unread: 1,
    consents: { therapy: true, sharing: true, aggregates: false },
  },
  {
    id: 'p3',
    name: 'Beatriz Santos',
    age: 28,
    sex: 'F',
    reason: 'Acute stress after relocation',
    conditions: ['Adjustment disorder'],
    medications: [],
    contraindications: ['None flagged for GL audio'],
    goals: [{ text: 'Establish baseline and first protocol', status: 'review' }],
    scores: [{ label: 'DASS-21 Stress', max: 42, lowerIsBetter: true, t0: 24 }],
    b2bSessions: [],
    b2cSessions: [],
    messages: [],
    clinicalNotes: 'New patient. Baseline (T0) completed; first session today.',
    lastSessionAt: undefined,
    nextSessionAt: now + 30 * 60_000,
    vasTrend: 'stable',
    assessmentDue: 'Baseline done',
    unread: 0,
    consents: { therapy: true, sharing: true, aggregates: true },
  },
  {
    id: 'p4',
    name: 'Carlos Nogueira',
    age: 52,
    sex: 'M',
    reason: 'Resilience / preventative',
    conditions: ['Subclinical stress'],
    medications: [],
    contraindications: ['None flagged for GL audio'],
    goals: [{ text: 'Maintain weekly practice', status: 'achieved' }],
    scores: [{ label: 'BRS (resilience)', max: 5, lowerIsBetter: false, t0: 3.0, t1: 3.6, t2: 3.9 }],
    b2bSessions: [{ id: 'b4', date: now - 21 * DAY, protocolCode: 'GL-DEP 2.4', duration: 24, vasPre: 4, vasPost: 6, notes: [] }],
    b2cSessions: [{ date: now - 12 * DAY, protocolCode: 'GL-DEP 2.4', duration: 12, vasPre: 5, vasPost: 6 }],
    messages: [],
    clinicalNotes: 'Stable maintenance. Monthly cadence appropriate.',
    prescription: '1× GL-RESIL Standard / week',
    lastSessionAt: now - 21 * DAY,
    nextSessionAt: now + 6 * DAY,
    vasTrend: 'up',
    b2cInactiveDays: 12,
    unread: 0,
    consents: { therapy: true, sharing: false, aggregates: true },
  },
]

/** Per-family preset shown in the wizard (MVP = choose a protocol; params are read-only). */
export interface Preset {
  binaural: string
  loop: string
  voice: string
  breathing: string
  audioFile: string
}

export const PRESETS: Record<string, Preset> = {
  'GL-ANX': { binaural: 'Theta 6 Hz', loop: '20 s', voice: 'Reverb 30%', breathing: '4-7-8', audioFile: 'gl-anx_1-1_deep_ptBR.wav' },
  'GL-STRESS': { binaural: 'Alpha 10 Hz', loop: '18 s', voice: 'Reverb 25%', breathing: '4-6', audioFile: 'gl-stress_4-1_deep_ptBR.wav' },
  'GL-DEP': { binaural: 'Low-beta 14 Hz', loop: '22 s', voice: 'Warmth +', breathing: '4-4', audioFile: 'gl-dep_2-4_deep_ptBR.wav' },
  'GL-BURN': { binaural: 'Alpha 9 Hz', loop: '20 s', voice: 'Reverb 30%', breathing: '4-7-8', audioFile: 'gl-burn_3-1_deep_ptBR.wav' },
  'GL-RESIL': { binaural: 'SMR 12 Hz', loop: '16 s', voice: 'Neutral', breathing: '5-5', audioFile: 'gl-resil_5-1_deep_ptBR.wav' },
}

export function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export function fmtDateTime(ts: number): string {
  return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function relWhen(ts: number): string {
  const diff = ts - Date.now()
  const abs = Math.abs(diff)
  const fut = diff > 0
  if (abs < HOUR) return fut ? `in ${Math.round(abs / 60_000)} min` : `${Math.round(abs / 60_000)} min ago`
  if (abs < DAY) return fut ? `in ${Math.round(abs / HOUR)} h` : `${Math.round(abs / HOUR)} h ago`
  const d = Math.round(abs / DAY)
  return fut ? `in ${d} d` : `${d} d ago`
}
