import type { SessionRecord } from '../types/domain'
import type { DataProvider, SessionRequest } from './provider'
import { SEED_HISTORY } from './seed'
import { DEMO_PATIENTS, DEMO_THERAPIST, type Patient } from '../b2b/data'
import { seedCatalog, type CatalogProtocol } from './catalog'
import { repositioned, type Plan, type PlanItem } from './plan'
import { generateConnectionCode, type TherapistLink, type TherapistCode } from './link'
import { MAX_LENGTH as MESSAGE_MAX_LENGTH, type ChatMessage } from './messageStore'
import type { Company, AdminUser, CredentialRequest, AuditEvent } from '../admin/types'
import { aggregate } from '../employer/aggregate'
import { PSYCHOSOCIAL_DIMENSIONS, OUTCOME_KEYS, type PsychosocialResponse } from '../employer/assessment'

/* Tiny simulated latency so loading states are exercised exactly as they will be
   against a real backend. Set to 0 to disable. */
const wait = (ms = 130) => new Promise<void>((r) => setTimeout(r, ms))
const delay = <T,>(value: T, ms = 130) => new Promise<T>((r) => setTimeout(() => r(value), ms))

/**
 * The demo consumer is the SAME person as this patient in the clinician roster.
 * So a self-use session completed in the B2C app surfaces in the therapist's
 * view of that patient — the B2C↔B2B bridge, demonstrated live.
 */
export const LINKED_PATIENT_ID = 'p1'

/* The pathway "Dra. Helena" wrote for the demo patient in their first session:
   three months, one session a week, her own pacing. The app did not compose
   it and cannot — this is what a therapist's plan looks like in the data. */
const DEMO_PLAN_ITEMS: PlanItem[] = [
  { id: 'pi-1', position: 0, protocolCode: 'GL-ANX 1.1', duration: 12, week: 1, note: 'Iniziamo da qui, anche solo tre volte questa settimana.', doneAt: Date.now() - 6 * 86_400_000 },
  { id: 'pi-2', position: 1, protocolCode: 'GL-ANX 1.1', duration: 12, week: 2, doneAt: Date.now() - 2 * 86_400_000 },
  { id: 'pi-3', position: 2, protocolCode: 'GL-ANX 1.3', duration: 12, week: 3, note: 'Questa lavora sul respiro: falla quando senti il corpo attivato.' },
  { id: 'pi-4', position: 3, protocolCode: 'GL-ANX 1.3', duration: 24, week: 4 },
  { id: 'pi-5', position: 4, protocolCode: 'GL-ANX 1.4', duration: 12, week: 5 },
  { id: 'pi-6', position: 5, protocolCode: 'GL-ANX 1.4', duration: 12, week: 6 },
  { id: 'pi-7', position: 6, protocolCode: 'GL-ANX 1.2', duration: 12, week: 7 },
  { id: 'pi-8', position: 7, protocolCode: 'GL-ANX 1.2', duration: 24, week: 8 },
  { id: 'pi-9', position: 8, protocolCode: 'GL-ANX 1.5', duration: 12, week: 9 },
  { id: 'pi-10', position: 9, protocolCode: 'GL-ANX 1.5', duration: 24, week: 10 },
  { id: 'pi-11', position: 10, protocolCode: 'GL-ANX 1.1', duration: 12, week: 11 },
  { id: 'pi-12', position: 11, protocolCode: 'GL-ANX 1.4', duration: 12, week: 12 },
  { id: 'pi-13', position: 12, protocolCode: 'GL-ANX 1.5', duration: 24, week: 13, note: 'Ultima del percorso: ci rivediamo per rivedere insieme come è andata.' },
]

const DEMO_PLAN: Plan = {
  patientId: LINKED_PATIENT_ID,
  title: 'Percorso di tre mesi — ansia',
  items: DEMO_PLAN_ITEMS,
  updatedAt: Date.now() - 6 * 86_400_000,
}

/**
 * Module-level store — ONE in-memory database shared for the whole browser
 * session, so B2C and B2B (and trips through the Studio) all see the same data.
 * Mutable on purpose: writes are reflected when screens refetch, proving the
 * seam handles writes, not just reads. Replaced wholesale by Supabase later.
 */
/* Therapist-authored pathways, keyed by patient. The demo patient starts with
   one already written, so the B2C home has a plan to follow without a round
   trip through the therapist console. */
const plans = new Map<string, Plan>([[LINKED_PATIENT_ID, DEMO_PLAN]])
const clonePlan = (p: Plan | null): Plan | null => (p ? { ...p, items: p.items.map((i) => ({ ...i })) } : null)


/* The link and the thread, in memory.

   The mock is one shared store for the whole browser session, so unlike the
   old two-localStorage arrangement the therapist console and the patient app
   genuinely read the SAME messages here — which is what makes the demo an
   honest rehearsal of the wired version rather than a mime of it. */
const link: TherapistLink = {
  patientId: LINKED_PATIENT_ID,
  therapistId: 'th-silva',
  therapistName: 'Dra. Ana Silva',
  crp: 'CRP 06/12345',
  since: Date.now() - 21 * 86_400_000,
}
let therapistCodes: TherapistCode[] = [
  { code: 'GL-DEMO-CODE', label: 'Demo', active: true, createdAt: Date.now() - 86_400_000 },
]
let thread: ChatMessage[] = [
  {
    id: 'm1', patientId: LINKED_PATIENT_ID, from: 'therapist',
    text: 'Ciao! Ho aggiornato il percorso per questa settimana.',
    at: Date.now() - 2 * 86_400_000, readByPatient: true, readByTherapist: true,
  },
]

let sessions: SessionRecord[] = [...SEED_HISTORY]
const patients: Patient[] = DEMO_PATIENTS.map((p) => ({
  ...p,
  b2bSessions: [...p.b2bSessions],
  b2cSessions: [...p.b2cSessions],
  messages: [...p.messages],
  notes: p.notes.map((n) => ({ ...n })),
  goals: p.goals.map((g) => ({ ...g })),
  scores: p.scores.map((s) => ({ ...s })),
  conditions: [...p.conditions],
  medications: [...p.medications],
  contraindications: [...p.contraindications],
  consents: { ...p.consents },
}))

/* --- Admin / catalog stores (same shared session-level singleton) --------- */
const DAY = 86_400_000
const nowMs = Date.now()

let catalog: CatalogProtocol[] = seedCatalog()

const companies: Company[] = [
  { id: 'c1', name: 'Aurora Tech', seats: 250, activeUsers: 168, status: 'active', createdAt: nowMs - 90 * DAY },
  { id: 'c2', name: 'Meridian Saúde', seats: 120, activeUsers: 74, status: 'active', createdAt: nowMs - 40 * DAY },
  { id: 'c3', name: 'Vale Logística', seats: 500, activeUsers: 0, status: 'paused', createdAt: nowMs - 6 * DAY },
]

const adminUsers: AdminUser[] = [
  { id: 'u1', name: 'Dra. Helena Costa', email: 'helena@clinic.demo', role: 'therapist', active: true, createdAt: nowMs - 120 * DAY },
  { id: 'u2', name: 'Dr. Rafael Lima', email: 'rafael@clinic.demo', role: 'therapist', active: true, createdAt: nowMs - 60 * DAY },
  { id: 'u3', name: 'Camila Rocha', email: 'camila@aurora.co', role: 'hr_admin', companyId: 'c1', active: true, createdAt: nowMs - 88 * DAY },
  { id: 'u4', name: 'Mariana Alves', email: 'mariana@aurora.co', role: 'b2c_user', companyId: 'c1', active: true, createdAt: nowMs - 30 * DAY },
  { id: 'u5', name: 'Admin (you)', email: 'admin@goodloop.app', role: 'admin', active: true, createdAt: nowMs - 200 * DAY },
]

let credentialRequests: CredentialRequest[] = [
  { id: 'cr1', name: 'Dr. Paulo Mendes', email: 'paulo@clinic.demo', crp: 'CRP 06/98211', submittedAt: nowMs - 20 * 3_600_000, status: 'pending' },
  { id: 'cr2', name: 'Dra. Sofia Ribeiro', email: 'sofia@clinic.demo', crp: 'CRP 05/33740', submittedAt: nowMs - 2 * DAY, status: 'pending' },
  { id: 'cr3', name: 'Dr. André Souza', email: 'andre@clinic.demo', crp: 'CRP 04/12345', submittedAt: nowMs - 5 * DAY, status: 'approved', decidedAt: nowMs - 4 * DAY },
]

let auditEvents: AuditEvent[] = [
  { id: 'a1', at: nowMs - 4 * DAY, actor: 'admin@goodloop.app', action: 'credential.approved', target: 'Dr. André Souza', detail: 'CRP 04/12345' },
  { id: 'a2', at: nowMs - 6 * DAY, actor: 'admin@goodloop.app', action: 'company.created', target: 'Vale Logística' },
]

let seq = 100
const nextId = (prefix: string) => `${prefix}-${++seq}`

/* --- NR-1: a seeded population of individual responses, aggregated on demand ---
   Aggregate-only by construction downstream; here we hold anonymised per-person
   rows (as a real backend would, gated on the aggregate-reporting consent) so
   the employer report is COMPUTED, not hardcoded — and a freshly submitted
   assessment actually shifts the numbers. Deterministic PRNG → stable across
   reloads. Two small teams sit below k=5 to exercise suppression. */
const NR1_COMPANY = 'Aurora Tech'
const NR1_ELIGIBLE = 150
const NR1_K = 5

function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DIM_PROB: Record<string, { high: number; mod: number }> = {
  demands: { high: 0.28, mod: 0.38 }, pace: { high: 0.26, mod: 0.37 }, balance: { high: 0.25, mod: 0.36 },
  recognition: { high: 0.16, mod: 0.34 }, support_mgr: { high: 0.12, mod: 0.30 }, control: { high: 0.10, mod: 0.26 },
  role: { high: 0.075, mod: 0.23 }, relationships: { high: 0.075, mod: 0.20 },
}
const OUT_PROB: Record<string, number> = { stress: 0.30, anxiety: 0.23, burnout: 0.19 }
const TEAM_COUNTS: Record<string, number> = { Engineering: 52, Sales: 28, 'Customer Support': 22, Product: 12, People: 4, Finance: 3 }
// each cycle improves (earlier periods carry more high-risk)
const PERIODS: { period: string; factor: number }[] = [
  { period: 'Q3 2025', factor: 1.35 }, { period: 'Q4 2025', factor: 1.18 },
  { period: 'Q1 2026', factor: 1.05 }, { period: 'Q2 2026', factor: 0.95 },
]

function buildPopulation(): PsychosocialResponse[] {
  const rnd = mulberry32(0x600d100)
  const out: PsychosocialResponse[] = []
  for (const { period, factor } of PERIODS) {
    for (const [team, count] of Object.entries(TEAM_COUNTS)) {
      for (let i = 0; i < count; i++) {
        const dims: Record<string, 'low' | 'moderate' | 'high'> = {}
        for (const d of PSYCHOSOCIAL_DIMENSIONS) {
          const p = DIM_PROB[d.key]
          const pHigh = Math.min(0.9, p.high * factor)
          const r = rnd()
          dims[d.key] = r < pHigh ? 'high' : r < pHigh + p.mod ? 'moderate' : 'low'
        }
        const outcomes = { stress: false, anxiety: false, burnout: false }
        for (const k of OUTCOME_KEYS) outcomes[k] = rnd() < Math.min(0.9, OUT_PROB[k] * factor)
        out.push({ team, period, dims, outcomes, at: nowMs })
      }
    }
  }
  return out
}

let psychosocialResponses: PsychosocialResponse[] = buildPopulation()

/* B2C→therapist intake queue (one seeded open request so the roster demo shows it) */
let sessionRequests: SessionRequest[] = [
  { id: 'sr1', requesterName: 'Mariana Alves', requesterEmail: 'mariana@aurora.co', company: 'Aurora Tech', note: 'Ansiedade no trabalho', status: 'open', createdAt: nowMs - 2 * 3_600_000 },
]
const NR1_CURRENT_PERIOD = PERIODS[PERIODS.length - 1].period

export function createMockProvider(): DataProvider {
  return {
    // --- B2C ---
    /* ---- scheduling (localStorage-backed demo) ---- */
    listAvailableTherapists: async () => [
      { id: 'th-demo', name: 'Dra. Ana Fontes', avatarUrl: null },
      { id: 'th-demo-2', name: 'Dr. Rafael Lima', avatarUrl: null },
    ],
    getTherapistAvailability: async (therapistId: string) => {
      try {
        const raw = localStorage.getItem(`gl.mock.avail.${therapistId}`)
        if (raw) return JSON.parse(raw)
      } catch { /* fine */ }
      // demo default: Mon–Fri 09:00 / 14:00 / 16:00
      return [1, 2, 3, 4, 5].flatMap((weekday) => ['09:00', '14:00', '16:00'].map((hhmm) => ({ weekday, hhmm })))
    },
    listBookedTimes: async (therapistId: string) => {
      try { return JSON.parse(localStorage.getItem(`gl.mock.booked.${therapistId}`) ?? '[]') } catch { return [] }
    },
    bookAppointment: async (therapistId: string, startsAtMs: number) => {
      const key = `gl.mock.booked.${therapistId}`
      let booked: number[] = []
      try { booked = JSON.parse(localStorage.getItem(key) ?? '[]') } catch { /* fine */ }
      if (booked.includes(startsAtMs)) throw new Error('That time was just taken — pick another slot.')
      booked.push(startsAtMs)
      const appt = { id: `ap-${Date.now()}`, therapistId, therapistName: therapistId === 'th-demo' ? 'Dra. Ana Fontes' : 'Dr. Rafael Lima', patientName: 'You', profileId: 'me', startsAtMs, durationMin: 50, status: 'booked' as const }
      try {
        localStorage.setItem(key, JSON.stringify(booked))
        localStorage.setItem('gl.mock.myappt', JSON.stringify(appt))
        const mine = JSON.parse(localStorage.getItem('gl.mock.thappts') ?? '[]')
        mine.push(appt)
        localStorage.setItem('gl.mock.thappts', JSON.stringify(mine))
      } catch { /* fine */ }
      await wait()
      return appt
    },
    getMyAppointment: async () => {
      try {
        const raw = localStorage.getItem('gl.mock.myappt')
        if (!raw) return null
        const a = JSON.parse(raw)
        if (a.status !== 'booked' || Date.now() > a.startsAtMs + a.durationMin * 60000) return null
        return a
      } catch { return null }
    },
    cancelAppointment: async (id: string) => {
      try {
        const raw = localStorage.getItem('gl.mock.myappt')
        if (raw) {
          const a = JSON.parse(raw)
          if (a.id === id) localStorage.removeItem('gl.mock.myappt')
        }
        const mine = (JSON.parse(localStorage.getItem('gl.mock.thappts') ?? '[]') as { id: string }[]).filter((x) => x.id !== id)
        localStorage.setItem('gl.mock.thappts', JSON.stringify(mine))
      } catch { /* fine */ }
    },
    getMyAvailability: async () => {
      try { return JSON.parse(localStorage.getItem('gl.mock.avail.me') ?? '[]') } catch { return [] }
    },
    setMyAvailability: async (slots) => {
      try { localStorage.setItem('gl.mock.avail.me', JSON.stringify(slots)); localStorage.setItem('gl.mock.avail.th-demo', JSON.stringify(slots)) } catch { /* fine */ }
    },
    listMyAppointments: async () => {
      try {
        return (JSON.parse(localStorage.getItem('gl.mock.thappts') ?? '[]') as any[])
          .filter((a) => a.status === 'booked' && Date.now() < a.startsAtMs + a.durationMin * 60000)
          .sort((a, b) => a.startsAtMs - b.startsAtMs)
      } catch { return [] }
    },
    patientForAppointment: async (a) => {
      const existing = patients.find((p) => p.name === (a.patientName ?? 'You'))
      if (existing) return existing.id
      const id = `pt-${Date.now()}`
      patients.push({ ...patients[0], id, name: a.patientName ?? 'You' })
      return id
    },

    getMyAvatarUrl: async () => {
      try { return localStorage.getItem('gl.mock.avatar') } catch { return null }
    },
    setMyAvatar: async (blob: Blob) => {
      const url: string = await new Promise((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(r.result as string)
        r.onerror = () => rej(new Error('read failed'))
        r.readAsDataURL(blob)
      })
      try { localStorage.setItem('gl.mock.avatar', url) } catch { /* private mode */ }
      return url
    },
    listSessions: () => delay([...sessions]),
    recordSession: async (rec) => {
      sessions = [...sessions, rec]
      // bridge the self-use session into the linked patient's record (B2C↔B2B)
      const linked = patients.find((p) => p.id === LINKED_PATIENT_ID)
      if (linked) {
        linked.b2cSessions = [
          ...linked.b2cSessions,
          {
            date: rec.completedAt ?? rec.startedAt,
            protocolCode: rec.protocolCode,
            duration: rec.duration,
            vasPre: rec.vasPre?.vas ?? 0,
            vasPost: rec.vasPost?.vas ?? 0,
          },
        ]
        linked.b2cInactiveDays = 0
      }
      await wait()
    },

    getMyPlan: () => delay(clonePlan(plans.get(LINKED_PATIENT_ID) ?? null)),
    markPlanItemDone: async (itemId) => {
      for (const plan of plans.values()) {
        const item = plan.items.find((i) => i.id === itemId)
        if (item) { item.doneAt = Date.now(); plan.updatedAt = Date.now() }
      }
      await wait()
    },

    // --- B2B ---
    getTherapist: () => delay(DEMO_THERAPIST),
    listPatients: () => delay(patients),
    getPlan: (patientId) => delay(clonePlan(plans.get(patientId) ?? null)),
    savePlan: async (patientId, items, title) => {
      plans.set(patientId, {
        patientId,
        title,
        items: repositioned(items).map((i, n) => ({ ...i, id: i.id.startsWith('new-') ? `pi-${Date.now()}-${n}` : i.id })),
        updatedAt: Date.now(),
      })
      await wait()
    },
    requestSession: async (note) => {
      sessionRequests.push({ id: `sr-${Date.now()}`, requesterName: 'You', note, company: NR1_COMPANY, status: 'open', createdAt: Date.now() })
      await wait()
    },
    getMySessionRequest: () => delay(sessionRequests.find((r) => r.requesterName === 'You') ?? null),
    listSessionRequests: () => delay(sessionRequests.map((r) => ({ ...r }))),
    acceptSessionRequest: async (requestId) => {
      const req = sessionRequests.find((r) => r.id === requestId && r.status === 'open')
      if (!req) throw new Error('Request already accepted')
      const id = `p-${Date.now()}`
      patients.push({
        id, name: req.requesterName, age: 0, sex: 'F', reason: req.note ?? '',
        conditions: [], medications: [], contraindications: [],
        goals: [], scores: [], b2bSessions: [], b2cSessions: [], messages: [],
        clinicalNotes: '', notes: [], vasTrend: 'stable', unread: 0,
        consents: { therapy: true, sharing: false, aggregates: false },
      })
      req.status = 'claimed'
      await wait()
      return id
    },
    createPatient: async (name) => {
      const id = `p-${Date.now()}`
      patients.push({
        id, name, age: 0, sex: 'F', reason: '',
        conditions: [], medications: [], contraindications: [],
        goals: [], scores: [], b2bSessions: [], b2cSessions: [], messages: [],
        clinicalNotes: '', notes: [], vasTrend: 'stable', unread: 0,
        consents: { therapy: true, sharing: false, aggregates: false },
      })
      await wait()
      return id
    },
    getPatient: (id) => delay(patients.find((p) => p.id === id)),
    recordB2bSession: async (patientId, session) => {
      const p = patients.find((x) => x.id === patientId)
      if (p) {
        p.b2bSessions = [...p.b2bSessions, session]
        p.lastSessionAt = session.date
      }
      await wait()
    },
    updatePatient: async (patientId, patch) => {
      const p = patients.find((x) => x.id === patientId)
      if (p) Object.assign(p, patch)
      await wait()
    },
    addPatientNote: async (patientId, text) => {
      const p = patients.find((x) => x.id === patientId)
      if (p) p.notes = [...p.notes, { id: nextId('note'), at: Date.now(), text }]
      await wait()
    },
    updatePatientNote: async (patientId, noteId, text) => {
      const p = patients.find((x) => x.id === patientId)
      if (p) p.notes = p.notes.map((n) => (n.id === noteId ? { ...n, text, editedAt: Date.now() } : n))
      await wait()
    },
    deletePatientNote: async (patientId, noteId) => {
      const p = patients.find((x) => x.id === patientId)
      if (p) p.notes = p.notes.filter((n) => n.id !== noteId)
      await wait()
    },

    // --- the therapist ↔ patient link ---
    getMyCompanyCode: () => delay('ACME-2026' as string | null),
    getMyTherapistLink: () => delay({ ...link }),
    redeemTherapistCode: async (code: string) => {
      await wait()
      const known = therapistCodes.find((c) => c.active && c.code.toUpperCase() === code.trim().toUpperCase())
      if (!known) throw new Error('CODE_UNKNOWN')
      return { ...link }
    },
    listMyTherapistCodes: () => delay(therapistCodes.map((c) => ({ ...c }))),
    createTherapistCode: async (label?: string) => {
      await wait()
      const made: TherapistCode = { code: generateConnectionCode(), label, active: true, createdAt: Date.now() }
      therapistCodes = [made, ...therapistCodes]
      return { ...made }
    },
    deactivateTherapistCode: async (code: string) => {
      await wait()
      therapistCodes = therapistCodes.map((c) => (c.code === code ? { ...c, active: false } : c))
    },

    // --- the thread ---
    listThreads: () => delay(thread.map((m) => ({ ...m }))),
    listMessages: (patientId?: string) =>
      delay(thread.filter((m) => m.patientId === (patientId ?? link.patientId)).map((m) => ({ ...m }))),
    sendMessage: async (text: string, patientId?: string) => {
      await wait()
      const body = text.trim().slice(0, MESSAGE_MAX_LENGTH)
      if (!body) return
      const from: 'patient' | 'therapist' = patientId ? 'therapist' : 'patient'
      thread = [...thread, {
        id: `m-${Date.now()}`,
        patientId: patientId ?? link.patientId,
        from,
        text: body,
        at: Date.now(),
        readByPatient: from === 'patient',
        readByTherapist: from === 'therapist',
      }]
    },
    markMessagesRead: async (patientId?: string) => {
      await wait()
      const pid = patientId ?? link.patientId
      const side = patientId ? 'readByTherapist' : 'readByPatient'
      thread = thread.map((m) => (m.patientId === pid ? { ...m, [side]: true } : m))
    },

    // --- Protocol catalog ---
    listProtocols: () => delay(catalog.map((p) => ({ ...p }))),
    saveProtocol: async (p) => {
      const i = catalog.findIndex((x) => x.code === p.code)
      const next = { ...p, updatedAt: Date.now() }
      catalog = i >= 0 ? catalog.map((x, j) => (j === i ? next : x)) : [...catalog, next]
      await wait()
    },
    setProtocolEnabled: async (code, enabled) => {
      catalog = catalog.map((p) => (p.code === code ? { ...p, enabled, updatedAt: Date.now() } : p))
      await wait()
    },
    deleteProtocol: async (code) => {
      catalog = catalog.filter((p) => p.code !== code)
      await wait()
    },

    // --- Credentialing queue ---
    listCredentialRequests: () => delay(credentialRequests.map((r) => ({ ...r }))),
    decideCredential: async (id, decision, reason) => {
      credentialRequests = credentialRequests.map((r) =>
        r.id === id ? { ...r, status: decision, reason, decidedAt: Date.now() } : r,
      )
      // approving a credential activates the matching therapist user, if present
      if (decision === 'approved') {
        const req = credentialRequests.find((r) => r.id === id)
        const u = adminUsers.find((x) => x.email === req?.email)
        if (u) u.active = true
      }
      await wait()
    },

    // --- Companies (tenants) ---
    listCompanies: () => delay(companies.map((c) => ({ ...c }))),
    saveCompany: async (company) => {
      const i = companies.findIndex((c) => c.id === company.id)
      if (i >= 0) companies[i] = { ...company }
      else companies.push({ ...company })
      await wait()
    },

    // --- Users & roles ---
    listAdminUsers: () => delay(adminUsers.map((u) => ({ ...u }))),
    setUserRole: async (id, role) => {
      const u = adminUsers.find((x) => x.id === id)
      if (u) u.role = role
      await wait()
    },
    setUserActive: async (id, active) => {
      const u = adminUsers.find((x) => x.id === id)
      if (u) u.active = active
      await wait()
    },

    // --- Audit trail ---
    listAuditEvents: () => delay([...auditEvents].sort((a, b) => b.at - a.at)),
    logAudit: async (event) => {
      auditEvents = [...auditEvents, { ...event, id: nextId('audit'), at: Date.now() }]
      await wait(40)
    },

    // --- Employer NR-1 aggregates (computed from the response population) ---
    getPsychosocialAggregates: () => delay(aggregate(psychosocialResponses, { company: NR1_COMPANY, eligible: NR1_ELIGIBLE, minCellSize: NR1_K })),
    submitPsychosocialAssessment: async (resp) => {
      // stamp to the current cycle; team defaults to the demo employee's team
      psychosocialResponses = [...psychosocialResponses, { ...resp, period: resp.period || NR1_CURRENT_PERIOD }]
      await wait()
    },
  }
}

/** Factory for a company id (used by the admin UI when creating a tenant). */
export function newCompanyId(): string {
  return nextId('c')
}
