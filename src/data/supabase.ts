/* ============================================================================
   Good Loop — Supabase-backed DataProvider
   Implements the exact same DataProvider interface as the mock, but resolves
   against Postgres (per docs/DATA_MODEL.sql) with row-level security doing the
   access enforcement server-side. DataLayerProvider auto-selects this when
   VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set — no UI changes.

   Rows come back as snake_case; the mapper functions translate them into the
   camelCase domain shapes the screens already consume. Rows are treated as
   `any` here because the generated DB types aren't wired yet (a later step:
   `supabase gen types typescript`).

   NOTE: this is the data-layer half. To actually run, it needs (1) a Supabase
   project with the schema applied and (2) a signed-in user — the sign-in flow
   is the next step. See docs/SUPABASE_SETUP.md.
   ============================================================================ */

import { type SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseClient } from '../auth/supabaseClient'
import type { DataProvider, SessionRequest } from './provider'
import type { SessionRecord, MoodCheck, Duration } from '../types/domain'
import type { Patient, Therapist, B2bSession, Goal, Score, Message, RapidNote } from '../b2b/data'
import type { CatalogProtocol, ProtocolSource, TenantScope } from './catalog'
import type { Company, AdminUser, UserRole, CredentialRequest, CredentialStatus, AuditEvent } from '../admin/types'
import type { Nr1Report } from '../employer/types'
import type { PsychosocialResponse } from '../employer/assessment'
import { currentPeriodLabel } from '../employer/assessment'

const DEFAULT_AVATAR = '👩🏻‍⚕️'

/* ---- small converters ---- */
const toMs = (t: string | null | undefined): number => (t ? new Date(t).getTime() : 0)
const toIso = (ms: number): string => new Date(ms).toISOString()
const asDuration = (n: number): Duration => (n === 6 || n === 12 || n === 24 ? n : (Math.max(6, Math.min(24, n)) as Duration))
// the sessions table stores the VAS but not the emoji; reconstruct a MoodCheck
const moodFromVas = (vas: number | null, atMs: number): MoodCheck | undefined =>
  vas == null ? undefined : { vas: Number(vas), emoji: Math.max(1, Math.min(5, Math.round(Number(vas) / 2) + 1)), at: atMs }

/* ---- row → domain mappers ---- */
function mapGoal(r: any): Goal {
  return { text: r.text, status: r.status }
}
function mapScore(r: any): Score {
  return {
    label: r.instrument,
    max: Number(r.max),
    lowerIsBetter: !!r.lower_is_better,
    t0: Number(r.t0),
    t1: r.t1 == null ? undefined : Number(r.t1),
    t2: r.t2 == null ? undefined : Number(r.t2),
  }
}
function mapMessage(r: any): Message {
  return { from: r.sender, text: r.body, at: toMs(r.at) }
}
function mapRapidNote(r: any): RapidNote {
  return { phase: r.phase, at: r.at_seconds, text: r.text }
}
function mapB2bSession(r: any): B2bSession {
  return {
    id: r.id,
    date: toMs(r.ended_at ?? r.started_at),
    protocolCode: r.protocol_code,
    duration: r.duration_min,
    vasPre: Number(r.vas_pre ?? 0),
    vasPost: Number(r.vas_post ?? 0),
    notes: (r.rapid_notes ?? []).map(mapRapidNote),
  }
}
function consentsFrom(rows: any[]): { therapy: boolean; sharing: boolean; aggregates: boolean } {
  const granted = (k: string) => rows.find((c) => c.kind === k)?.granted ?? false
  return { therapy: granted('therapy'), sharing: granted('sharing'), aggregates: granted('aggregates') }
}
function vasTrendFrom(sessions: B2bSession[]): 'up' | 'down' | 'stable' {
  if (sessions.length < 2) return 'stable'
  const s = [...sessions].sort((a, b) => a.date - b.date)
  const last = s[s.length - 1], prev = s[s.length - 2]
  const d = last.vasPost - last.vasPre - (prev.vasPost - prev.vasPre)
  return d > 0.3 ? 'up' : d < -0.3 ? 'down' : 'stable'
}
function mapPatient(r: any): Patient {
  const b2b = ((r.sessions ?? []) as any[]).filter((s) => s.kind === 'b2b').map(mapB2bSession)
  const messages = (r.messages ?? []).map(mapMessage)
  return {
    id: r.id,
    name: r.name,
    age: r.age ?? 0,
    sex: r.sex === 'F' ? 'F' : 'M',
    reason: r.reason ?? '',
    conditions: r.conditions ?? [],
    medications: r.medications ?? [],
    contraindications: r.contraindications ?? [],
    goals: (r.goals ?? []).map(mapGoal),
    scores: (r.scores ?? []).map(mapScore),
    b2bSessions: b2b,
    b2cSessions: [], // B2C bridge is consent-gated — merged in a later pass
    messages,
    clinicalNotes: r.clinical_notes ?? '',
    prescription: r.prescription ?? undefined,
    lastSessionAt: b2b.length ? Math.max(...b2b.map((x) => x.date)) : undefined,
    nextSessionAt: r.next_session_at ? toMs(r.next_session_at) : undefined,
    vasTrend: vasTrendFrom(b2b),
    assessmentDue: undefined,
    unread: messages.filter((m: Message) => m.from === 'patient').length,
    consents: consentsFrom(r.patient_consents ?? []),
  }
}

function mapSessionRequest(r: any): SessionRequest {
  return {
    id: r.id,
    requesterName: r.requester_name,
    requesterEmail: r.requester_email ?? undefined,
    company: r.company_id ?? undefined,
    note: r.note ?? undefined,
    status: r.status === 'claimed' ? 'claimed' : 'open',
    createdAt: toMs(r.created_at),
  }
}

const PATIENT_SELECT = '*, goals(*), scores(*), messages(*), patient_consents(*), sessions(*, rapid_notes(*))'

/* ---- admin / catalog mappers ---- */
const CRED_STATUSES: CredentialStatus[] = ['pending', 'approved', 'rejected', 'more_info']
function mapCatalog(r: any): CatalogProtocol {
  const tenants: TenantScope = r.tenants === 'all' || r.tenants == null ? 'all' : (r.tenants as string[])
  return {
    code: r.code, family: r.family, title: r.title, blurb: r.blurb,
    phases: r.phases ?? [], versions: r.versions ?? [],
    enabled: r.enabled !== false,
    source: (r.source === 'imported' ? 'imported' : 'seed') as ProtocolSource,
    tenants, audioReady: !!r.audio_ready, updatedAt: toMs(r.updated_at),
    spec: r.spec ?? undefined,
    datasheet: r.datasheet ?? undefined,
    plain: r.plain ?? undefined,
    assetMap: r.asset_map ?? undefined,
  }
}
function mapCompany(r: any): Company {
  return { id: r.id, name: r.name, seats: r.seats ?? 0, activeUsers: r.active_users ?? 0, status: r.status === 'paused' ? 'paused' : 'active', createdAt: toMs(r.created_at) }
}
function mapAdminUser(r: any): AdminUser {
  return { id: r.id, name: r.name ?? '', email: r.email ?? '', role: (r.role as UserRole) ?? 'b2c_user', companyId: r.company_id ?? undefined, active: r.active !== false, createdAt: toMs(r.created_at) }
}
function mapCredReq(r: any): CredentialRequest {
  const status: CredentialStatus = CRED_STATUSES.includes(r.status) ? r.status : 'pending'
  return { id: r.id, name: r.profiles?.name ?? '', email: r.profiles?.email ?? '', crp: r.crp ?? '', submittedAt: toMs(r.created_at), status, reason: r.review_reason ?? undefined, decidedAt: r.decided_at ? toMs(r.decided_at) : undefined }
}
function mapAudit(r: any): AuditEvent {
  return { id: r.id, at: toMs(r.at), actor: r.actor ?? '', action: r.action ?? '', target: r.target ?? undefined, detail: r.detail ?? undefined }
}

export function createSupabaseProvider(url: string, anonKey: string): DataProvider {
  const sb: SupabaseClient = getSupabaseClient(url, anonKey)

  let cachedProfileId: string | null = null
  async function profileId(): Promise<string> {
    if (cachedProfileId) return cachedProfileId
    const { data: auth } = await sb.auth.getUser()
    const uid = auth.user?.id
    if (!uid) throw new Error('Not signed in')
    const { data, error } = await sb.from('profiles').select('id').eq('auth_uid', uid).single()
    if (error) throw error
    cachedProfileId = (data as any).id as string
    return cachedProfileId
  }

  return {
    async listSessions(): Promise<SessionRecord[]> {
      // RLS limits rows to the signed-in B2C user's own sessions
      const { data, error } = await sb.from('sessions').select('*').eq('kind', 'b2c').order('started_at', { ascending: true })
      if (error) throw error
      return (data ?? []).map((r: any): SessionRecord => ({
        id: r.id,
        protocolCode: r.protocol_code,
        duration: asDuration(r.duration_min),
        startedAt: toMs(r.started_at),
        completedAt: r.ended_at ? toMs(r.ended_at) : undefined,
        vasPre: moodFromVas(r.vas_pre, toMs(r.started_at)),
        vasPost: moodFromVas(r.vas_post, toMs(r.ended_at ?? r.started_at)),
      }))
    },

    async recordSession(rec: SessionRecord): Promise<void> {
      const pid = await profileId()
      const { error } = await sb.from('sessions').insert({
        kind: 'b2c',
        b2c_profile_id: pid,
        protocol_code: rec.protocolCode,
        duration_min: rec.duration,
        started_at: toIso(rec.startedAt),
        ended_at: rec.completedAt ? toIso(rec.completedAt) : null,
        vas_pre: rec.vasPre?.vas ?? null,
        vas_post: rec.vasPost?.vas ?? null,
        completed: !!rec.completedAt,
      })
      if (error) throw error
    },

    async getTherapist(): Promise<Therapist> {
      const { data: auth } = await sb.auth.getUser()
      const uid = auth.user?.id
      if (!uid) throw new Error('Not signed in')
      const { data, error } = await sb
        .from('therapists')
        .select('*, profiles!inner(name, auth_uid)')
        .eq('profiles.auth_uid', uid)
        .single()
      if (error) throw error
      const row = data as any
      return {
        name: row.profiles.name,
        crp: row.crp,
        status: row.status === 'approved' ? 'approved' : 'pending',
        avatar: DEFAULT_AVATAR,
      }
    },

    async listPatients(): Promise<Patient[]> {
      // RLS limits rows to the therapist's own patients
      const { data, error } = await sb.from('patients').select(PATIENT_SELECT).order('name')
      if (error) throw error
      return (data ?? []).map(mapPatient)
    },

    async requestSession(note?: string): Promise<void> {
      const pid = await profileId()
      const { data: prof, error: pErr } = await sb.from('profiles')
        .select('name, email, company_id').eq('id', pid).single()
      if (pErr) throw pErr
      const row = prof as { name: string; email: string | null; company_id: string | null }
      const { error } = await sb.from('session_requests').insert({
        profile_id: pid,
        company_id: row.company_id,
        requester_name: row.name,
        requester_email: row.email,
        note: note ?? null,
      })
      if (error) throw error
    },

    async getMySessionRequest(): Promise<SessionRequest | null> {
      const pid = await profileId()
      const { data, error } = await sb.from('session_requests')
        .select('*').eq('profile_id', pid)
        .order('created_at', { ascending: false }).limit(1)
      if (error) throw error
      const r = (data ?? [])[0] as any
      return r ? mapSessionRequest(r) : null
    },

    async listSessionRequests(): Promise<SessionRequest[]> {
      const { data, error } = await sb.from('session_requests')
        .select('*').eq('status', 'open')
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []).map(mapSessionRequest)
    },

    async acceptSessionRequest(requestId: string): Promise<string> {
      const pid = await profileId()
      const { data: reqRows, error: rErr } = await sb.from('session_requests')
        .select('*').eq('id', requestId).limit(1)
      if (rErr) throw rErr
      const req = (reqRows ?? [])[0] as any
      if (!req || req.status !== 'open') throw new Error('Request was already accepted')
      // create the patient LINKED to the requester's B2C profile
      const { data: pRow, error: cErr } = await sb.from('patients')
        .insert({ therapist_id: pid, name: req.requester_name, reason: req.note ?? null, b2c_profile_id: req.profile_id })
        .select('id').single()
      if (cErr) throw cErr
      const patientId = (pRow as { id: string }).id
      const { error: conErr } = await sb.from('patient_consents')
        .insert({ patient_id: patientId, kind: 'therapy', granted: true })
      if (conErr) throw conErr
      // claim atomically: only succeeds if still open
      const { data: claimed, error: uErr } = await sb.from('session_requests')
        .update({ status: 'claimed', claimed_by: pid, patient_id: patientId })
        .eq('id', requestId).eq('status', 'open').select('id')
      if (uErr) throw uErr
      if (!claimed || claimed.length === 0) throw new Error('Request was already accepted')
      return patientId
    },

    async createPatient(name: string): Promise<string> {
      const pid = await profileId()   // therapist id === profile id in the schema
      const { data, error } = await sb.from('patients')
        .insert({ therapist_id: pid, name })
        .select('id').single()
      if (error) throw error
      const newId = (data as { id: string }).id
      // therapy consent is implied by intake; sharing/aggregates default to off
      const { error: cErr } = await sb.from('patient_consents')
        .insert({ patient_id: newId, kind: 'therapy', granted: true })
      if (cErr) throw cErr
      return newId
    },

    async getPatient(id: string): Promise<Patient | undefined> {
      const { data, error } = await sb.from('patients').select(PATIENT_SELECT).eq('id', id).single()
      if (error) {
        if ((error as any).code === 'PGRST116') return undefined // no rows
        throw error
      }
      return data ? mapPatient(data) : undefined
    },

    async recordB2bSession(patientId: string, session: B2bSession): Promise<void> {
      const therapistId = await profileId()
      const { data, error } = await sb
        .from('sessions')
        .insert({
          kind: 'b2b',
          patient_id: patientId,
          therapist_id: therapistId,
          protocol_code: session.protocolCode,
          duration_min: session.duration,
          started_at: toIso(session.date - session.duration * 60_000),
          ended_at: toIso(session.date),
          vas_pre: session.vasPre,
          vas_post: session.vasPost,
          completed: true,
        })
        .select('id')
        .single()
      if (error) throw error
      if (session.notes.length) {
        const rows = session.notes.map((n) => ({ session_id: (data as any).id, phase: n.phase, at_seconds: n.at, text: n.text }))
        const { error: nErr } = await sb.from('rapid_notes').insert(rows)
        if (nErr) throw nErr
      }
    },
    async updatePatient(patientId: string, patch: Partial<Patient>): Promise<void> {
      // map the editable subset onto the patients table (extend as the schema grows)
      const row: Record<string, unknown> = {}
      if (patch.name !== undefined) row.name = patch.name
      if (patch.age !== undefined) row.age = patch.age
      if (patch.reason !== undefined) row.reason = patch.reason
      if (patch.clinicalNotes !== undefined) row.clinical_notes = patch.clinicalNotes
      if (patch.prescription !== undefined) row.prescription = patch.prescription
      if (patch.conditions !== undefined) row.conditions = patch.conditions
      if (patch.medications !== undefined) row.medications = patch.medications
      if (patch.nextSessionAt !== undefined) row.next_session_at = toIso(patch.nextSessionAt)
      if (Object.keys(row).length > 0) {
        const { error } = await sb.from('patients').update(row).eq('id', patientId)
        if (error) throw error
      }
      // goals live in their own table — replace the set wholesale
      if (patch.goals !== undefined) {
        const { error: dErr } = await sb.from('goals').delete().eq('patient_id', patientId)
        if (dErr) throw dErr
        if (patch.goals.length) {
          const { error: iErr } = await sb.from('goals')
            .insert(patch.goals.map((g) => ({ patient_id: patientId, text: g.text, status: g.status })))
          if (iErr) throw iErr
        }
      }
    },

    // --- Protocol catalog ---
    async listProtocols(): Promise<CatalogProtocol[]> {
      const { data, error } = await sb.from('protocols').select('*').order('code')
      if (error) throw error
      return (data ?? []).map(mapCatalog)
    },
    async saveProtocol(p: CatalogProtocol): Promise<void> {
      const row = {
        code: p.code, family: p.family, title: p.title, blurb: p.blurb,
        phases: p.phases, versions: p.versions, enabled: p.enabled,
        source: p.source, tenants: p.tenants, audio_ready: p.audioReady, updated_at: toIso(Date.now()),
        spec: p.spec ?? null,
        datasheet: p.datasheet ?? null,
        plain: p.plain ?? null,
        asset_map: p.assetMap ?? null,
      }
      const { error } = await sb.from('protocols').upsert(row, { onConflict: 'code' })
      if (error) throw error
    },
    async setProtocolEnabled(code: string, enabled: boolean): Promise<void> {
      const { error } = await sb.from('protocols').update({ enabled, updated_at: toIso(Date.now()) }).eq('code', code)
      if (error) throw error
    },
    async deleteProtocol(code: string): Promise<void> {
      const { error } = await sb.from('protocols').delete().eq('code', code)
      if (error) throw error
    },

    // --- Credentialing queue (therapists joined to their profile) ---
    async listCredentialRequests(): Promise<CredentialRequest[]> {
      const { data, error } = await sb.from('therapists').select('*, profiles!inner(name, email)').order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(mapCredReq)
    },
    async decideCredential(id, decision, reason): Promise<void> {
      const { error } = await sb.from('therapists').update({ status: decision, review_reason: reason ?? null, decided_at: toIso(Date.now()) }).eq('id', id)
      if (error) throw error
    },

    // --- Companies (tenants) ---
    async listCompanies(): Promise<Company[]> {
      const { data, error } = await sb.from('companies').select('*').order('name')
      if (error) throw error
      return (data ?? []).map(mapCompany)
    },
    async saveCompany(c: Company): Promise<void> {
      const row = { id: c.id, name: c.name, seats: c.seats, active_users: c.activeUsers, status: c.status, created_at: toIso(c.createdAt) }
      const { error } = await sb.from('companies').upsert(row, { onConflict: 'id' })
      if (error) throw error
    },

    // --- Users & roles ---
    async listAdminUsers(): Promise<AdminUser[]> {
      const { data, error } = await sb.from('profiles').select('id, name, email, role, company_id, active, created_at').order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(mapAdminUser)
    },
    async setUserRole(id, role): Promise<void> {
      const { error } = await sb.from('profiles').update({ role }).eq('id', id)
      if (error) throw error
    },
    async setUserActive(id, active): Promise<void> {
      const { error } = await sb.from('profiles').update({ active }).eq('id', id)
      if (error) throw error
    },

    // --- Audit trail ---
    async listAuditEvents(): Promise<AuditEvent[]> {
      const { data, error } = await sb.from('audit_events').select('*').order('at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(mapAudit)
    },
    async logAudit(e): Promise<void> {
      const { error } = await sb.from('audit_events').insert({ actor: e.actor, action: e.action, target: e.target ?? null, detail: e.detail ?? null })
      if (error) throw error
    },

    // --- Employer NR-1 aggregates ---
    // Resolves through a SECURITY DEFINER function that aggregates + applies the
    // k-anonymity suppression server-side and returns the report as JSON, scoped
    // to the caller's company. No employee-level rows ever reach the client.
    async getPsychosocialAggregates(): Promise<Nr1Report> {
      const { data, error } = await sb.rpc('nr1_report')
      if (error) throw error
      return data as Nr1Report
    },
    async submitPsychosocialAssessment(resp: PsychosocialResponse): Promise<void> {
      const pid = await profileId()
      const { data: prof } = await sb.from('profiles').select('company_id, team').eq('id', pid).single()
      const profRow = prof as { company_id: string | null; team: string | null } | null
      const { error } = await sb.from('psychosocial_responses').insert({
        profile_id: pid,
        company_id: profRow?.company_id ?? null,
        team: profRow?.team || resp.team,
        period: resp.period || currentPeriodLabel(),
        dims: resp.dims,
        outcomes: resp.outcomes,
      })
      if (error) throw error
    },
  }
}
