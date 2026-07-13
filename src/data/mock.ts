import type { SessionRecord } from '../types/domain'
import type { DataProvider } from './provider'
import { SEED_HISTORY } from './seed'
import { DEMO_PATIENTS, DEMO_THERAPIST, type Patient } from '../b2b/data'
import { seedCatalog, type CatalogProtocol } from './catalog'
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

/**
 * Module-level store — ONE in-memory database shared for the whole browser
 * session, so B2C and B2B (and trips through the Studio) all see the same data.
 * Mutable on purpose: writes are reflected when screens refetch, proving the
 * seam handles writes, not just reads. Replaced wholesale by Supabase later.
 */
let sessions: SessionRecord[] = [...SEED_HISTORY]
const patients: Patient[] = DEMO_PATIENTS.map((p) => ({
  ...p,
  b2bSessions: [...p.b2bSessions],
  b2cSessions: [...p.b2cSessions],
  messages: [...p.messages],
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
const NR1_CURRENT_PERIOD = PERIODS[PERIODS.length - 1].period

export function createMockProvider(): DataProvider {
  return {
    // --- B2C ---
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

    // --- B2B ---
    getTherapist: () => delay(DEMO_THERAPIST),
    listPatients: () => delay(patients),
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
