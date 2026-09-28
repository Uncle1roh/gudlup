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
import type { ExploreRail } from './rails'
import type { CompanyTherapist, TherapistActivationCode } from './provider'
import type { SessionRecord, MoodCheck, Duration } from '../types/domain'
import type { Patient, Therapist, B2bSession, B2cSession, Goal, Score, RapidNote } from '../b2b/data'
import type { CatalogProtocol, ProtocolSource, TenantScope } from './catalog'
import { repositioned, type Plan, type PlanItem } from './plan'
import { generateConnectionCode } from './link'
import { normalizeTags } from './tags'
import { normalizePromoCode, type PromoCode } from './promo'
import type { PartnerProduct } from './partners'
import type { Company, AdminUser, UserRole, CredentialRequest, CredentialStatus, AuditEvent } from '../admin/types'
import type { Nr1Report } from '../employer/types'
import type { PsychosocialResponse } from '../employer/assessment'
import { currentPeriodLabel } from '../employer/assessment'
import type {
  LegalProfile, Acceptance, ConsentEvent, ConsentPurpose, DataRequest, DataRequestKind, DataRequestStatus,
  Report, ReportKind, ReportStatus, LegalVersion, ProfessionalRecord, ProfessionalCard,
  InformedConsentTemplate, PatientInformedConsent, SponsorTotals,
} from '../legal/records'
import type { CrisisResource } from '../legal/market'
import { MIN_COHORT } from '../legal/market'

/* ---- legal-framework row mappers (supabase/11-legal-framework.sql) ---- */
function mapLegalProfile(r: any): LegalProfile {
  return {
    id: r.id, name: r.name ?? '', email: r.email ?? '',
    birthDate: r.birth_date ?? null, country: r.country ?? null,
    market: r.market === 'BR' || r.market === 'EU' ? r.market : null,
    personalEmail: r.personal_email ?? null, locale: r.locale ?? null,
    companyId: r.company_id ?? null,
    // a company code links the account; the sponsor supplied the code and nothing else
    sponsorFields: r.company_id ? ['company code'] : [],
  }
}
function mapAcceptance(r: any): Acceptance {
  return { id: r.id, profileId: r.profile_id, docId: r.doc_id, version: r.version, locale: r.locale, channel: r.channel ?? 'app', acceptedAt: toMs(r.accepted_at) }
}
function mapConsent(r: any): ConsentEvent {
  return { id: r.id, profileId: r.profile_id, purpose: r.purpose as ConsentPurpose, granted: !!r.granted, wording: r.wording ?? '', locale: r.locale ?? '', channel: r.channel ?? 'app', at: toMs(r.at) }
}
function mapDataRequest(r: any): DataRequest {
  return {
    id: r.id, profileId: r.profile_id,
    requester: r.profiles ? { name: r.profiles.name ?? '', email: r.profiles.email ?? '' } : undefined,
    kind: r.kind as DataRequestKind, market: r.market === 'BR' || r.market === 'EU' ? r.market : null,
    status: r.status as DataRequestStatus, note: r.note ?? undefined,
    receivedAt: toMs(r.received_at), dueAt: toMs(r.due_at),
    verifiedAt: r.verified_at ? toMs(r.verified_at) : undefined,
    deliveredAt: r.delivered_at ? toMs(r.delivered_at) : undefined,
    handledBy: r.handled_by ?? undefined, outcome: r.outcome ?? undefined,
  }
}
function mapReport(r: any): Report {
  return {
    id: r.id, kind: r.kind as ReportKind, reporterId: r.reporter_id ?? undefined, reporterEmail: r.reporter_email ?? undefined,
    subject: r.subject ?? '', location: r.location ?? undefined, reason: r.reason ?? '', status: r.status as ReportStatus,
    receivedAt: toMs(r.received_at), acknowledgedAt: r.acknowledged_at ? toMs(r.acknowledged_at) : undefined,
    decidedAt: r.decided_at ? toMs(r.decided_at) : undefined, decidedBy: r.decided_by ?? undefined, decision: r.decision ?? undefined,
  }
}
function mapLegalVersion(r: any): LegalVersion {
  return { id: r.id, docId: r.doc_id, version: r.version, locale: r.locale, inForceFrom: r.in_force_from, inForceTo: r.in_force_to ?? null, changelog: r.changelog ?? undefined, createdAt: toMs(r.created_at), createdBy: r.created_by ?? undefined }
}
function mapCrisis(r: any): CrisisResource {
  return { id: r.id, market: r.market, position: r.position ?? 0, label: r.label ?? '', number: r.number ?? '', hours: r.hours ?? undefined, url: r.url ?? undefined, lastVerifiedAt: r.last_verified_at ?? null, verifiedBy: r.verified_by ?? null, active: r.active !== false }
}
function mapProfessional(r: any): ProfessionalRecord {
  return {
    id: r.id, registration: r.crp ?? '', registry: r.registry === 'Ordine' ? 'Ordine' : r.registry === 'CRP' ? 'CRP' : null,
    registryRegion: r.registry_region ?? null, status: r.status ?? 'pending',
    verifiedAt: r.verified_at ? toMs(r.verified_at) : r.approved_at ? toMs(r.approved_at) : null,
    practiceCountry: r.practice_country ?? null, attestedAt: r.attested_at ? toMs(r.attested_at) : null,
    insuranceExpiresAt: r.insurance_expires_at ?? null, insuranceDoc: r.insurance_doc ?? null,
    termsVersion: r.terms_version ?? null, termsAcceptedAt: r.terms_accepted_at ? toMs(r.terms_accepted_at) : null,
    consentTemplate: r.consent_template ?? null,
  }
}

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
    // filled by mergeB2cSessions() — the bridge is consent-gated in RLS, so a
    // patient without the 'sharing' consent simply yields no rows
    b2cSessions: [],
    clinicalNotes: r.clinical_notes ?? '',
    notes: ((r.patient_notes ?? []) as any[])
      .map((n) => ({ id: n.id as string, at: toMs(n.at), editedAt: n.edited_at ? toMs(n.edited_at) : undefined, text: n.text as string }))
      .sort((a, b) => a.at - b.at),
    prescription: r.prescription ?? undefined,
    lastSessionAt: b2b.length ? Math.max(...b2b.map((x) => x.date)) : undefined,
    nextSessionAt: r.next_session_at ? toMs(r.next_session_at) : undefined,
    vasTrend: vasTrendFrom(b2b),
    assessmentDue: undefined,
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

const PATIENT_SELECT = '*, goals(*), scores(*), patient_consents(*), patient_notes(*), sessions(*, rapid_notes(*))'

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
    // per-time-signature material: publishing or editing one duration must not
    // disturb the others (see data/catalog.ts)
    plainByDuration: r.plain_by_duration ?? undefined,
    assetMap: r.asset_map ?? undefined,
    studio: r.studio ?? undefined,
    studioByDuration: r.studio_by_duration ?? undefined,
    // naming: `title` is the clinical name, `public_title` the non-therapeutic
    // one a person reads. Absent → the clinical title is shown, as before.
    publicTitle: r.public_title ?? undefined,
    publicBlurb: r.public_blurb ?? undefined,
    // the per-language overlay on those names (src/types/domain.ts)
    i18n: r.i18n && typeof r.i18n === 'object' ? r.i18n : undefined,
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : undefined,
    // rows written before the clinical/library split are clinical
    audience: r.audience === 'library' ? 'library' : 'clinical',
    library: r.library ?? undefined,
    coverUrl: r.cover_url ?? undefined,
    tier: r.tier === 'amber' || r.tier === 'red' ? r.tier : r.tier === 'green' ? 'green' : undefined,
    claimsGate: r.claims_gate ?? undefined,
  }
}

function mapPlanItem(r: any): PlanItem {
  return {
    id: r.id,
    position: r.position ?? 0,
    protocolCode: r.protocol_code,
    duration: asDuration(r.duration_min),
    week: r.week ?? 1,
    note: r.note ?? undefined,
    doneAt: r.done_at ? toMs(r.done_at) : undefined,
  }
}
function mapPartnerProduct(r: any): PartnerProduct {
  return {
    id: r.id,
    partner: r.partner ?? '',
    title: r.title ?? '',
    description: r.description ?? undefined,
    discount: r.discount ?? undefined,
    promoCode: r.promo_code ?? undefined,
    url: r.url ?? undefined,
    imageUrl: r.image_url ?? undefined,
    active: r.active !== false,
    position: r.position ?? 0,
    createdAt: toMs(r.created_at),
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
  return {
    id: r.id, name: r.profiles?.name ?? '', email: r.profiles?.email ?? '', crp: r.crp ?? '',
    documents: Array.isArray(r.documents) ? r.documents : [],
    submittedAt: toMs(r.created_at), status,
    reason: r.review_reason ?? undefined,
    decidedAt: r.decided_at ? toMs(r.decided_at) : undefined,
    decidedBy: r.decided_by ?? undefined,
  }
}
function mapAudit(r: any): AuditEvent {
  return { id: r.id, at: toMs(r.at), actor: r.actor ?? '', action: r.action ?? '', target: r.target ?? undefined, detail: r.detail ?? undefined }
}

export function createSupabaseProvider(url: string, anonKey: string): DataProvider {
  const sb: SupabaseClient = getSupabaseClient(url, anonKey)

  /* The profile id is cached PER ACCOUNT. It used to be cached per tab and
     never cleared on sign-out, so after one account signed out and another
     signed in, every write went out with the first account's id — refused by
     RLS, and the button that made it (accepting the terms, above all) just
     did nothing. The cache now forgets on every auth change and is keyed to
     the auth uid it was read for. */
  let cachedProfileId: string | null = null
  let cachedForUid: string | null = null
  sb.auth.onAuthStateChange(() => { cachedProfileId = null; cachedForUid = null })
  async function profileId(): Promise<string> {
    const { data: auth } = await sb.auth.getUser()
    const uid = auth.user?.id
    if (!uid) throw new Error('Not signed in')
    if (cachedProfileId && cachedForUid === uid) return cachedProfileId
    const { data, error } = await sb.from('profiles').select('id').eq('auth_uid', uid).single()
    if (error) throw error
    cachedProfileId = (data as any).id as string
    cachedForUid = uid
    return cachedProfileId
  }

  const toMs2 = (iso: string) => new Date(iso).getTime()

  /**
   * The B2C↔B2B bridge: self-practice sessions the person did in the consumer
   * app, surfaced in their clinician's view of the record. The link is
   * patients.b2c_profile_id; the CONSENT GATE lives in the RLS policy
   * (therapist_reads_linked_b2c_sessions — 'sharing' granted), so a revoked
   * consent silently yields no rows here rather than being filtered client-side.
   */
  async function mergeB2cSessions(rows: any[], patients: Patient[]): Promise<void> {
    const linked = rows
      .map((r, i) => ({ profileId: r.b2c_profile_id as string | null, patient: patients[i] }))
      .filter((x): x is { profileId: string; patient: Patient } => !!x.profileId)
    if (!linked.length) return

    const { data, error } = await sb
      .from('sessions')
      .select('b2c_profile_id, protocol_code, duration_min, started_at, ended_at, vas_pre, vas_post')
      .eq('kind', 'b2c')
      .in('b2c_profile_id', linked.map((x) => x.profileId))
      .order('started_at')
    if (error || !data) return // no consent / no access → the record shows none

    const byProfile = new Map<string, B2cSession[]>()
    for (const r of data as any[]) {
      const list = byProfile.get(r.b2c_profile_id) ?? []
      list.push({
        date: toMs(r.ended_at ?? r.started_at),
        protocolCode: r.protocol_code,
        duration: r.duration_min,
        vasPre: Number(r.vas_pre ?? 0),
        vasPost: Number(r.vas_post ?? 0),
      })
      byProfile.set(r.b2c_profile_id, list)
    }
    for (const { profileId, patient } of linked) {
      const list = byProfile.get(profileId) ?? []
      patient.b2cSessions = list
      const last = list[list.length - 1]
      if (last) patient.b2cInactiveDays = Math.max(0, Math.round((Date.now() - last.date) / 86_400_000))
    }
  }

  /** The company on the caller's OWN profile. A screen may pass an id (an
    admin acting for a tenant); everyone else gets their own, and
    row-level security has the final word either way. */
  async function myCompanyId(): Promise<string | null> {
    const uid = await authUid()
    const { data } = await sb.from('profiles').select('company_id').eq('auth_uid', uid).maybeSingle()
    return ((data as { company_id: string | null } | null)?.company_id) ?? null
  }

  async function authUid(): Promise<string> {
    const { data: auth } = await sb.auth.getUser()
    const uid = auth.user?.id
    if (!uid) throw new Error('Not signed in')
    return uid
  }

  return {
    /* ---- scheduling ---- */
    /**
     * The roster, through an RPC rather than a join.
     *
     * This used to select `therapists` joined to `profiles`. A patient can
     * read neither — `therapists` is owner-and-admin only, `profiles` is
     * self-only — so row-level security returned zero rows and the app told
     * every person "no therapist is available through your company yet". The
     * query was correct; the permission was never going to allow it.
     *
     * `public_therapists()` is SECURITY DEFINER and returns approved
     * therapists' name, CRP and avatar and nothing else (supabase/
     * 5-therapist-booking.sql). Company scoping moves here, where the roster
     * is already narrow.
     */
    async listAvailableTherapists() {
      const { data, error } = await sb.rpc('public_therapists')
      if (error) throw error
      return ((data ?? []) as { id: string; name: string; avatar_url: string | null }[])
        .map((r) => ({ id: r.id, name: r.name, avatarUrl: r.avatar_url ?? null }))
    },
    async getTherapistAvailability(therapistId: string) {
      const { data, error } = await sb.from('therapist_availability').select('slots').eq('therapist_id', therapistId).maybeSingle()
      if (error) return []
      return ((data as { slots: unknown } | null)?.slots as import('./scheduling').WeeklySlot[] | undefined) ?? []
    },
    /**
     * Which instants are taken — by anyone.
     *
     * Read directly, row-level security shows a patient only their OWN
     * bookings, so a slot another patient took still rendered as free and the
     * person found out by being refused. `booked_times()` returns start times
     * and nothing else: no names, no ids, no appointment rows.
     */
    async listBookedTimes(therapistId: string, fromMs: number, toMs: number) {
      const { data, error } = await sb.rpc('booked_times', {
        t_id: therapistId, from_at: toIso(fromMs), to_at: toIso(toMs),
      })
      if (error) return []
      return ((data ?? []) as { starts_at: string }[]).map((r) => toMs2(r.starts_at))
    },
    async bookAppointment(therapistId: string, startsAtMs: number) {
      const uid = await authUid()
      const { data: me, error: pErr } = await sb.from('profiles').select('id, name, company_id').eq('auth_uid', uid).single()
      if (pErr) throw pErr
      const meRow = me as { id: string; name: string; company_id: string | null }
      const { data, error } = await sb.from('appointments')
        .insert({ therapist_id: therapistId, profile_id: meRow.id, patient_name: meRow.name, company_id: meRow.company_id, starts_at: toIso(startsAtMs) })
        .select('id, duration_min')
        .single()
      if (error) {
        if (/duplicate|unique/i.test(error.message)) throw new Error('That time was just taken — pick another slot.')
        throw error
      }
      return { id: (data as any).id as string, therapistId, startsAtMs, durationMin: (data as any).duration_min ?? 50, status: 'booked' as const }
    },
    /**
     * The booking the person just made — also through an RPC.
     *
     * The old query reached the therapist's name through
     * `therapists!inner(profiles!inner(name))`, and an INNER join to tables
     * the patient cannot read drops the parent row. So a booking that was
     * successfully written came back as null: the join window never opened,
     * the video room id (this row's `id`) was never known, and Cancel did
     * nothing while the slot stayed blocked.
     */
    async getMyAppointment() {
      const { data, error } = await sb.rpc('my_appointments')
      if (error) return null
      const cutoff = Date.now() - 2 * 3600_000
      const next = ((data ?? []) as {
        id: string; therapist_id: string; therapist_name: string | null
        starts_at: string; duration_min: number | null; status: string
      }[])
        .filter((r) => r.status === 'booked' && toMs2(r.starts_at) >= cutoff)
        .sort((a, b) => toMs2(a.starts_at) - toMs2(b.starts_at))[0]
      if (!next) return null
      return {
        id: next.id,
        therapistId: next.therapist_id,
        therapistName: next.therapist_name ?? undefined,
        startsAtMs: toMs2(next.starts_at),
        durationMin: next.duration_min ?? 50,
        status: 'booked' as const,
      }
    },
    async cancelAppointment(id: string) {
      const { error } = await sb.from('appointments').update({ status: 'cancelled' }).eq('id', id)
      if (error) throw error
    },
    async getMyAvailability() {
      const pid = await profileId()
      const { data, error } = await sb.from('therapist_availability').select('slots').eq('therapist_id', pid).maybeSingle()
      if (error) return []
      return ((data as { slots: unknown } | null)?.slots as import('./scheduling').WeeklySlot[] | undefined) ?? []
    },
    async setMyAvailability(slots) {
      const pid = await profileId()
      const { error } = await sb.from('therapist_availability').upsert({ therapist_id: pid, slots, updated_at: toIso(Date.now()) }, { onConflict: 'therapist_id' })
      if (error) throw error
    },
    async listMyAppointments() {
      const pid = await profileId()
      const { data, error } = await sb.from('appointments')
        .select('id, profile_id, patient_name, starts_at, duration_min, status')
        .eq('therapist_id', pid)
        .eq('status', 'booked')
        .gte('starts_at', toIso(Date.now() - 2 * 3600_000))
        .order('starts_at', { ascending: true })
      if (error) return []
      return (data ?? []).map((r: any) => ({
        id: r.id as string,
        therapistId: pid,
        profileId: r.profile_id as string,
        patientName: r.patient_name as string,
        startsAtMs: toMs2(r.starts_at),
        durationMin: r.duration_min ?? 50,
        status: 'booked' as const,
      }))
    },
    async patientForAppointment(a) {
      const pid = await profileId()
      const { data: found } = await sb.from('patients')
        .select('id').eq('therapist_id', pid).eq('b2c_profile_id', a.profileId ?? '').limit(1)
      if (found?.length) return (found[0] as { id: string }).id
      const { data: created, error } = await sb.from('patients')
        .insert({ therapist_id: pid, name: a.patientName ?? 'Patient', b2c_profile_id: a.profileId ?? null, reason: 'Scheduled session' })
        .select('id').single()
      if (error) throw error
      const patientId = (created as { id: string }).id
      await sb.from('patient_consents').insert({ patient_id: patientId, kind: 'therapy', granted: true })
      return patientId
    },

    async getMyAvatarUrl(): Promise<string | null> {
      try {
        const uid = await authUid()
        const { data, error } = await sb.from('profiles').select('avatar_url').eq('auth_uid', uid).single()
        if (error) return null
        return (data as { avatar_url: string | null }).avatar_url ?? null
      } catch {
        return null
      }
    },
    async setMyAvatar(blob: Blob): Promise<string> {
      const uid = await authUid()
      const path = `${uid}/avatar.jpg`
      const { error: upErr } = await sb.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '60' })
      if (upErr) throw new Error(`Avatar upload failed: ${upErr.message}`)
      const { data: pub } = sb.storage.from('avatars').getPublicUrl(path)
      const url = `${pub.publicUrl}?v=${Date.now()}` // cache-bust replacements
      const { error } = await sb.from('profiles').update({ avatar_url: url }).eq('auth_uid', uid)
      if (error) throw new Error(`Could not save the avatar: ${error.message}`)
      return url
    },
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

    /* The pathway written FOR the signed-in person. RLS answers with the rows
       of the patient record linked to this profile — no plan, no rows, and the
       app then offers the library instead of inventing a pathway. */
    async getMyPlan(): Promise<Plan | null> {
      const { data, error } = await sb.from('plan_items').select('*').order('position')
      if (error) throw error
      const rows = data ?? []
      if (!rows.length) return null
      return {
        patientId: rows[0].patient_id,
        items: rows.map(mapPlanItem),
        updatedAt: Math.max(...rows.map((r: any) => toMs(r.created_at))),
      }
    },

    async markPlanItemDone(itemId: string): Promise<void> {
      const { error } = await sb.from('plan_items').update({ done_at: toIso(Date.now()) }).eq('id', itemId)
      if (error) throw error
    },

    async getPlan(patientId: string): Promise<Plan | null> {
      const [items, patient] = await Promise.all([
        sb.from('plan_items').select('*').eq('patient_id', patientId).order('position'),
        sb.from('patients').select('plan_title').eq('id', patientId).single(),
      ])
      if (items.error) throw items.error
      const rows = items.data ?? []
      const title = (patient.data as { plan_title?: string } | null)?.plan_title ?? undefined
      if (!rows.length && !title) return null
      return {
        patientId,
        title,
        items: rows.map(mapPlanItem),
        updatedAt: rows.length ? Math.max(...rows.map((r: any) => toMs(r.created_at))) : Date.now(),
      }
    },

    /* The editor saves the whole pathway: replace the rows, keeping the
       done_at of items that survived the edit so a therapist reshuffling
       week 9 doesn't wipe what the person already did. */
    async savePlan(patientId: string, items: PlanItem[], title?: string): Promise<void> {
      const del = await sb.from('plan_items').delete().eq('patient_id', patientId)
      if (del.error) throw del.error
      const rows = repositioned(items).map((i) => ({
        patient_id: patientId,
        position: i.position,
        protocol_code: i.protocolCode,
        duration_min: i.duration,
        week: i.week,
        note: i.note ?? null,
        done_at: i.doneAt ? toIso(i.doneAt) : null,
      }))
      if (rows.length) {
        const ins = await sb.from('plan_items').insert(rows)
        if (ins.error) throw ins.error
      }
      const upd = await sb.from('patients').update({ plan_title: title ?? null }).eq('id', patientId)
      if (upd.error) throw upd.error
    },

    async submitCredentials(crp: string, documents): Promise<void> {
      /* An RPC, not an update: the client may write the number and the
         documents and must never be able to write `status`. */
      const { error } = await sb.rpc('submit_credentials', { p_crp: crp, p_docs: documents })
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
        // every state the reviewer can leave it in, not just the two the old
        // mapping kept: "rejected" and "more_info" each need their own screen
        status: CRED_STATUSES.includes(row.status) ? row.status : 'pending',
        reason: row.review_reason ?? undefined,
        documents: Array.isArray(row.documents) ? row.documents : [],
        avatar: DEFAULT_AVATAR,
      }
    },

    async listPatients(): Promise<Patient[]> {
      // RLS limits rows to the therapist's own patients
      const { data, error } = await sb.from('patients').select(PATIENT_SELECT).order('name')
      if (error) throw error
      const rows = data ?? []
      const patients = rows.map(mapPatient)
      await mergeB2cSessions(rows, patients)
      return patients
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
      if (!data) return undefined
      const patient = mapPatient(data)
      await mergeB2cSessions([data], [patient])
      return patient
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
      // LGPD consents live in their own table, one row per kind. 'sharing' is
      // the gate the B2C↔B2B bridge policy reads.
      if (patch.consents !== undefined) {
        const at = toIso(Date.now())
        const rows = (['therapy', 'sharing', 'aggregates'] as const).map((kind) => ({
          patient_id: patientId, kind, granted: patch.consents![kind], at,
        }))
        const { error: cErr } = await sb.from('patient_consents').upsert(rows, { onConflict: 'patient_id,kind' })
        if (cErr) throw cErr
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

    /* ---- clinical diary (therapist-only, RLS-scoped to owned patients) ---- */
    async addPatientNote(patientId: string, text: string): Promise<void> {
      const { error } = await sb.from('patient_notes').insert({ patient_id: patientId, text })
      if (error) throw error
    },
    async updatePatientNote(_patientId: string, noteId: string, text: string): Promise<void> {
      const { error } = await sb.from('patient_notes').update({ text, edited_at: toIso(Date.now()) }).eq('id', noteId)
      if (error) throw error
    },
    async deletePatientNote(_patientId: string, noteId: string): Promise<void> {
      const { error } = await sb.from('patient_notes').delete().eq('id', noteId)
      if (error) throw error
    },

    /* --- the therapist ↔ patient link ------------------------------------

       `patients` is the therapist's table and a patient may only read their
       own row (supabase/6-two-sided-care.sql). Everything below is either
       that one row or a SECURITY DEFINER function that writes it. */

    async getMyCompanyCode() {
      const uid = await authUid()
      const { data, error } = await sb.from('profiles').select('company_id').eq('auth_uid', uid).maybeSingle()
      if (error) return null
      return ((data as { company_id: string | null } | null)?.company_id) ?? null
    },

    async getMyTherapistLink() {
      const { data, error } = await sb.rpc('my_therapist_link')
      if (error) return null
      const r = ((data ?? []) as {
        patient_id: string; therapist_id: string; therapist_name: string
        crp: string | null; since: string
      }[])[0]
      if (!r) return null
      return {
        patientId: r.patient_id,
        therapistId: r.therapist_id,
        therapistName: r.therapist_name,
        crp: r.crp ?? undefined,
        since: toMs(r.since),
      }
    },

    async redeemTherapistCode(code: string) {
      const { data, error } = await sb.rpc('redeem_therapist_code', { p_code: code })
      if (error) {
        // the function raises for both cases; keep them apart for the person
        if (/unknown code/i.test(error.message)) throw new Error('CODE_UNKNOWN')
        throw new Error(error.message)
      }
      const r = ((data ?? []) as {
        patient_id: string; therapist_id: string; therapist_name: string; crp: string | null
      }[])[0]
      if (!r) throw new Error('CODE_UNKNOWN')
      return {
        patientId: r.patient_id,
        therapistId: r.therapist_id,
        therapistName: r.therapist_name,
        crp: r.crp ?? undefined,
        since: Date.now(),
      }
    },

    async listMyTherapistCodes() {
      const pid = await profileId()
      const { data, error } = await sb.from('therapist_codes')
        .select('code, label, active, created_at')
        .eq('therapist_id', pid)
        .order('created_at', { ascending: false })
      if (error) return []
      return (data ?? []).map((r: { code: string; label: string | null; active: boolean; created_at: string }) => ({
        code: r.code, label: r.label ?? undefined, active: r.active, createdAt: toMs(r.created_at),
      }))
    },

    async createTherapistCode(label?: string) {
      const pid = await profileId()
      /* Retry once on the astronomically unlikely collision rather than hand
         the therapist an error they can do nothing about. */
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const code = generateConnectionCode()
        const { error } = await sb.from('therapist_codes')
          .insert({ code, therapist_id: pid, label: label ?? null })
        if (!error) return { code, label, active: true, createdAt: Date.now() }
        if ((error as { code?: string }).code !== '23505') throw error
      }
      throw new Error('Could not mint a connection code — try again.')
    },

    async deactivateTherapistCode(code: string) {
      const { error } = await sb.from('therapist_codes').update({ active: false }).eq('code', code)
      if (error) throw error
    },

    /* --- the thread -------------------------------------------------------

       One table, both sides. `patientId` is the therapist's way of naming a
       thread; the patient's own app omits it and their link supplies it. */

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
        plain_by_duration: p.plainByDuration ?? null,
        asset_map: p.assetMap ?? null,
        studio: p.studio ?? null,
        studio_by_duration: p.studioByDuration ?? null,
        audience: p.audience ?? 'clinical',
        library: p.library ?? null,
        cover_url: p.coverUrl ?? null,
        public_title: p.publicTitle ?? null,
        public_blurb: p.publicBlurb ?? null,
        i18n: p.i18n ?? {},
        tags: normalizeTags(p.tags),
        tier: p.tier ?? 'green',
        claims_gate: p.claimsGate ?? null,
      }
      const { error } = await sb.from('protocols').upsert(row, { onConflict: 'code' })
      if (error) throw error
    },
    async setProtocolEnabled(code: string, enabled: boolean): Promise<void> {
      const { error } = await sb.from('protocols').update({ enabled, updated_at: toIso(Date.now()) }).eq('code', code)
      if (error) throw error
    },
    async deleteProtocol(code: string): Promise<void> {
      /* `.select()` makes the database say WHICH rows it deleted. Without it a
         delete that row-level security filtered down to nothing comes back
         with no error at all — and the protocol is still there. */
      const { data, error } = await sb.from('protocols').delete().eq('code', code).select('code')
      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error(`Il database non ha eliminato ${code}: nessuna riga rimossa (serve un account amministratore, oppure il protocollo non esiste più).`)
      }
    },

    // --- Credentialing queue (therapists joined to their profile) ---
    async listCredentialRequests(): Promise<CredentialRequest[]> {
      const { data, error } = await sb.from('therapists').select('*, profiles!inner(name, email)').order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(mapCredReq)
    },
    async decideCredential(id, decision, reason, decidedBy): Promise<void> {
      const { error } = await sb.from('therapists').update({
        status: decision,
        review_reason: reason ?? null,
        decided_at: toIso(Date.now()),
        /* WHO. Written with the decision, not reconstructed later from an
           audit line: the audit trail can be pruned, a credential record
           cannot lose the name of the person who vouched for it. */
        decided_by: decidedBy ?? null,
      }).eq('id', id)
      if (error) throw error
    },

    /* --- a company's therapists ---
       "my company" is the company_id on the caller's own profile: the id a
       screen must never be allowed to pass for somebody else. */
    async listCompanyTherapists(companyId?: string) {
      const cid = companyId ?? (await myCompanyId())
      if (!cid) return []
      const { data, error } = await sb
        .from('company_therapists')
        .select('added_at, therapists!inner(id, crp, status, profiles!inner(name))')
        .eq('company_id', cid)
      if (error) return []
      return (data ?? []).map((r: Record<string, any>) => ({
        id: String(r.therapists.id),
        name: String(r.therapists.profiles?.name ?? ''),
        crp: String(r.therapists.crp ?? ''),
        status: r.therapists.status,
        addedAt: toMs(r.added_at),
      })) as CompanyTherapist[]
    },
    async removeCompanyTherapist(therapistId: string, companyId?: string) {
      const cid = companyId ?? (await myCompanyId())
      if (!cid) throw new Error('Nessuna azienda collegata a questo account.')
      const { error } = await sb.from('company_therapists').delete().eq('company_id', cid).eq('therapist_id', therapistId)
      if (error) throw error
    },
    async listCompanyTherapistCodes(companyId?: string) {
      const cid = companyId ?? (await myCompanyId())
      if (!cid) return []
      const { data, error } = await sb
        .from('therapist_activation_codes')
        .select('*, therapists(profiles(name))')
        .eq('company_id', cid)
        .order('created_at', { ascending: false })
      if (error) return []
      return (data ?? []).map((r: Record<string, any>) => ({
        code: String(r.code),
        companyId: String(r.company_id),
        createdAt: toMs(r.created_at),
        createdBy: r.created_by ?? undefined,
        usedBy: r.used_by ?? undefined,
        usedByName: r.therapists?.profiles?.name ?? undefined,
        usedAt: r.used_at ? toMs(r.used_at) : undefined,
        revokedAt: r.revoked_at ? toMs(r.revoked_at) : undefined,
      })) as TherapistActivationCode[]
    },
    async createCompanyTherapistCode(companyId?: string, createdBy?: string) {
      const cid = companyId ?? (await myCompanyId())
      if (!cid) throw new Error('Nessuna azienda collegata a questo account.')
      /* Readable down a phone line: no I/O/0/1, and the company in the prefix
         so a therapist can see whose list they are joining. */
      const ALPHABET = 'ABCDEFGHJKLMNPQRSTVWXYZ23456789'
      const tail = Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')
      const code = `${cid.split('-')[0].toUpperCase()}-TH-${tail}`
      const { error } = await sb.from('therapist_activation_codes').insert({
        code, company_id: cid, created_by: createdBy ?? null,
      })
      if (error) throw error
      return { code, companyId: cid, createdAt: Date.now(), createdBy }
    },
    async revokeCompanyTherapistCode(code: string) {
      const { error } = await sb.from('therapist_activation_codes').update({ revoked_at: toIso(Date.now()) }).eq('code', code)
      if (error) throw error
    },
    async redeemCompanyTherapistCode(code: string) {
      const { data, error } = await sb.rpc('redeem_therapist_activation', { p_code: code })
      if (error) throw error
      const answer = String(data ?? '')
      if (answer.startsWith('OK:')) return { ok: true as const, companyId: answer.slice(3) }
      if (answer === 'REVOKED') return { ok: false as const, reason: 'revoked' as const }
      if (answer === 'ALREADY_USED') return { ok: false as const, reason: 'already-used' as const }
      if (answer === 'NOT_A_THERAPIST') return { ok: false as const, reason: 'not-a-therapist' as const }
      return { ok: false as const, reason: 'unknown' as const }
    },

    // --- The Self Use home rails ---
    async listExploreRails(): Promise<ExploreRail[]> {
      /* A database that has not run the migration has no table, and that is
         not an error here: no rails means the app's built-in shelf. */
      const { data, error } = await sb.from('explore_rails').select('*').order('position')
      if (error) return []
      return (data ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id),
        title: String(r.title ?? ''),
        subtitle: (r.subtitle as string | null) ?? undefined,
        slugs: Array.isArray(r.slugs) ? (r.slugs as string[]) : [],
        position: Number(r.position ?? 0),
        enabled: r.enabled !== false,
      }))
    },
    async saveExploreRails(rails: ExploreRail[]): Promise<void> {
      /* The editor holds the whole shelf, so the whole shelf is written: rows
         it no longer contains are rails somebody deleted. */
      const { data: existing } = await sb.from('explore_rails').select('id')
      const keep = new Set(rails.map((r) => r.id))
      const gone = (existing ?? []).map((r: { id: string }) => r.id).filter((id: string) => !keep.has(id))
      if (gone.length) {
        const { error } = await sb.from('explore_rails').delete().in('id', gone)
        if (error) throw error
      }
      if (!rails.length) return
      const rows = rails.map((r, i) => ({
        id: r.id,
        title: r.title,
        subtitle: r.subtitle ?? null,
        slugs: r.slugs,
        position: i,
        enabled: r.enabled,
        updated_at: toIso(Date.now()),
      }))
      const { error } = await sb.from('explore_rails').upsert(rows, { onConflict: 'id' })
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

    // --- Promo codes ---
    async listPromoCodes(): Promise<PromoCode[]> {
      const { data, error } = await sb.from('promo_codes').select('*').order('created_at', { ascending: false })
      if (error) throw error
      // uses: counted from the profiles that registered with each code (an
      // admin reads every profile, and only the code column is fetched)
      const { data: used } = await sb.from('profiles').select('promo_code').not('promo_code', 'is', null)
      const uses = new Map<string, number>()
      for (const r of (used ?? []) as { promo_code: string }[]) uses.set(r.promo_code, (uses.get(r.promo_code) ?? 0) + 1)
      return (data ?? []).map((r: { code: string; discount_pct: number; created_at: string; created_by: string | null }) => ({
        code: r.code,
        discountPct: r.discount_pct,
        createdAt: toMs(r.created_at),
        createdBy: r.created_by ?? undefined,
        uses: uses.get(r.code) ?? 0,
      }))
    },
    async createPromoCode(code, discountPct, createdBy): Promise<void> {
      const { error } = await sb.from('promo_codes').insert({ code: normalizePromoCode(code), discount_pct: discountPct, created_by: createdBy ?? null })
      if (error) {
        if ((error as { code?: string }).code === '23505') throw new Error(`Il codice ${normalizePromoCode(code)} esiste già.`)
        throw error
      }
    },
    async deletePromoCode(code): Promise<void> {
      const { error } = await sb.from('promo_codes').delete().eq('code', code)
      if (error) throw error
    },
    async checkPromoCode(code): Promise<number | null> {
      const { data, error } = await sb.rpc('check_promo_code', { p_code: normalizePromoCode(code) })
      if (error) throw error
      return typeof data === 'number' ? data : null
    },

    // --- Partner products ---
    async listPartnerProducts(): Promise<PartnerProduct[]> {
      const { data, error } = await sb.from('partner_products').select('*')
        .order('position').order('partner').order('title')
      if (error) throw error
      return (data ?? []).map(mapPartnerProduct)
    },
    async savePartnerProduct(p): Promise<string> {
      const row = {
        partner: p.partner.trim(),
        title: p.title.trim(),
        description: p.description?.trim() || null,
        discount: p.discount?.trim() || null,
        promo_code: p.promoCode?.trim() || null,
        url: p.url?.trim() || null,
        image_url: p.imageUrl?.trim() || null,
        active: p.active,
        position: p.position,
        updated_at: new Date().toISOString(),
      }
      if (p.id) {
        const { error } = await sb.from('partner_products').update(row).eq('id', p.id)
        if (error) throw error
        return p.id
      }
      const { data, error } = await sb.from('partner_products').insert(row).select('id').single()
      if (error) throw error
      return (data as { id: string }).id
    },
    async deletePartnerProduct(id): Promise<void> {
      const { error } = await sb.from('partner_products').delete().eq('id', id)
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

    /* ---- legal framework (supabase/11-legal-framework.sql) ---- */
    async getMyLegalProfile(): Promise<LegalProfile> {
      const pid = await profileId()
      const { data, error } = await sb.from('profiles')
        .select('id, name, email, birth_date, country, market, personal_email, locale, company_id').eq('id', pid).single()
      if (error) throw error
      return mapLegalProfile(data)
    },
    async updateMyProfile(patch): Promise<void> {
      const pid = await profileId()
      const row: Record<string, unknown> = {}
      if (patch.name !== undefined) row.name = patch.name.trim()
      if (patch.personalEmail !== undefined) row.personal_email = patch.personalEmail?.trim() || null
      if (patch.country !== undefined) row.country = patch.country
      if (patch.birthDate !== undefined) row.birth_date = patch.birthDate
      if (patch.locale !== undefined) row.locale = patch.locale
      const { error } = await sb.from('profiles').update(row).eq('id', pid)
      if (error) throw error
    },
    async recordAcceptance(a): Promise<void> {
      const pid = await profileId()
      const { error } = await sb.from('legal_acceptances').insert({
        profile_id: pid, doc_id: a.docId, version: a.version, locale: a.locale, channel: a.channel ?? 'app',
        user_agent: typeof navigator === 'undefined' ? null : navigator.userAgent.slice(0, 200),
      })
      if (error) throw error
    },
    async listMyAcceptances(): Promise<Acceptance[]> {
      const pid = await profileId()
      const { data, error } = await sb.from('legal_acceptances').select('*').eq('profile_id', pid).order('accepted_at')
      if (error) throw error
      return (data ?? []).map(mapAcceptance)
    },
    async recordConsent(c): Promise<void> {
      const pid = await profileId()
      const { error } = await sb.from('consent_events').insert({
        profile_id: pid, purpose: c.purpose, granted: c.granted, wording: c.wording, locale: c.locale, channel: c.channel ?? 'app',
      })
      if (error) throw error
    },
    async listMyConsents(): Promise<ConsentEvent[]> {
      const pid = await profileId()
      const { data, error } = await sb.from('consent_events').select('*').eq('profile_id', pid).order('at')
      if (error) throw error
      return (data ?? []).map(mapConsent)
    },
    async createDataRequest(kind, note): Promise<DataRequest> {
      const pid = await profileId()
      const { data: prof } = await sb.from('profiles').select('market').eq('id', pid).single()
      const { data, error } = await sb.from('data_requests')
        .insert({ profile_id: pid, kind, note: note ?? null, market: (prof as { market?: string } | null)?.market ?? null })
        .select('*').single()
      if (error) throw error
      return mapDataRequest(data)
    },
    async listMyDataRequests(): Promise<DataRequest[]> {
      const pid = await profileId()
      const { data, error } = await sb.from('data_requests').select('*').eq('profile_id', pid).order('received_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(mapDataRequest)
    },
    async deleteMyAccount(): Promise<void> {
      const { error } = await sb.rpc('delete_my_account')
      if (error) throw error
      cachedProfileId = null
    },
    async createReport(r): Promise<Report> {
      const pid = await profileId().catch(() => null)
      const { data: auth } = await sb.auth.getUser()
      const { data, error } = await sb.from('content_reports').insert({
        kind: r.kind, reporter_id: pid, reporter_email: auth.user?.email ?? null,
        subject: r.subject, location: r.location ?? null, reason: r.reason,
      }).select('*').single()
      if (error) throw error
      return mapReport(data)
    },
    async listCrisisResources(): Promise<CrisisResource[]> {
      const { data, error } = await sb.from('crisis_resources').select('*').order('market').order('position')
      if (error) throw error
      return (data ?? []).map(mapCrisis)
    },
    async listLegalVersions(): Promise<LegalVersion[]> {
      const { data, error } = await sb.from('legal_versions').select('*').order('in_force_from', { ascending: false })
      if (error) throw error
      return (data ?? []).map(mapLegalVersion)
    },

    // admin
    async listDataRequests(): Promise<DataRequest[]> {
      const { data, error } = await sb.from('data_requests').select('*, profiles(name, email)').order('due_at')
      if (error) throw error
      return (data ?? []).map(mapDataRequest)
    },
    async updateDataRequest(id, patch): Promise<void> {
      const row: Record<string, unknown> = {}
      if (patch.status) row.status = patch.status
      if (patch.verifiedAt !== undefined) row.verified_at = patch.verifiedAt ? toIso(patch.verifiedAt) : null
      if (patch.deliveredAt !== undefined) row.delivered_at = patch.deliveredAt ? toIso(patch.deliveredAt) : null
      if (patch.handledBy !== undefined) row.handled_by = patch.handledBy
      if (patch.outcome !== undefined) row.outcome = patch.outcome
      const { error } = await sb.from('data_requests').update(row).eq('id', id)
      if (error) throw error
    },
    async listReports(): Promise<Report[]> {
      const { data, error } = await sb.from('content_reports').select('*').order('received_at')
      if (error) throw error
      return (data ?? []).map(mapReport)
    },
    async updateReport(id, patch): Promise<void> {
      const row: Record<string, unknown> = {}
      if (patch.status) row.status = patch.status
      if (patch.acknowledgedAt !== undefined) row.acknowledged_at = patch.acknowledgedAt ? toIso(patch.acknowledgedAt) : null
      if (patch.decidedAt !== undefined) row.decided_at = patch.decidedAt ? toIso(patch.decidedAt) : null
      if (patch.decidedBy !== undefined) row.decided_by = patch.decidedBy
      if (patch.decision !== undefined) row.decision = patch.decision
      const { error } = await sb.from('content_reports').update(row).eq('id', id)
      if (error) throw error
    },
    async saveLegalVersion(v): Promise<void> {
      // the previous in-force version of the same document closes on the new date
      await sb.from('legal_versions').update({ in_force_to: v.inForceFrom })
        .eq('doc_id', v.docId).eq('locale', v.locale).is('in_force_to', null)
      const { error } = await sb.from('legal_versions').insert({
        doc_id: v.docId, version: v.version, locale: v.locale, in_force_from: v.inForceFrom,
        in_force_to: v.inForceTo, changelog: v.changelog ?? null, created_by: v.createdBy ?? null,
      })
      if (error) throw error
    },
    async saveCrisisResource(r): Promise<void> {
      const { error } = await sb.from('crisis_resources').upsert({
        id: r.id, market: r.market, position: r.position, label: r.label, number: r.number,
        hours: r.hours ?? null, url: r.url ?? null, last_verified_at: r.lastVerifiedAt, verified_by: r.verifiedBy,
        active: r.active, updated_at: new Date().toISOString(),
      })
      if (error) throw error
    },
    async deleteCrisisResource(id): Promise<void> {
      const { error } = await sb.from('crisis_resources').delete().eq('id', id)
      if (error) throw error
    },
    async listUserLegalRecords(profileIdArg): Promise<{ acceptances: Acceptance[]; consents: ConsentEvent[] }> {
      const [a, c] = await Promise.all([
        sb.from('legal_acceptances').select('*').eq('profile_id', profileIdArg).order('accepted_at'),
        sb.from('consent_events').select('*').eq('profile_id', profileIdArg).order('at'),
      ])
      if (a.error) throw a.error
      if (c.error) throw c.error
      return { acceptances: (a.data ?? []).map(mapAcceptance), consents: (c.data ?? []).map(mapConsent) }
    },
    async adminDeleteProfile(profileIdArg): Promise<void> {
      const { error } = await sb.rpc('admin_delete_profile', { p_profile: profileIdArg })
      if (error) throw error
    },

    // the professional
    async getMyProfessionalRecord(): Promise<ProfessionalRecord> {
      const pid = await profileId()
      const { data, error } = await sb.from('therapists').select('*').eq('id', pid).single()
      if (error) throw error
      return mapProfessional(data)
    },
    async updateMyProfessionalRecord(patch): Promise<void> {
      const pid = await profileId()
      const row: Record<string, unknown> = {}
      if (patch.registry !== undefined) row.registry = patch.registry
      if (patch.registryRegion !== undefined) row.registry_region = patch.registryRegion
      if (patch.practiceCountry !== undefined) row.practice_country = patch.practiceCountry
      if (patch.attestedAt !== undefined) row.attested_at = toIso(patch.attestedAt)
      if (patch.insuranceExpiresAt !== undefined) row.insurance_expires_at = patch.insuranceExpiresAt
      if (patch.insuranceDoc !== undefined) row.insurance_doc = patch.insuranceDoc
      if (patch.termsVersion !== undefined) row.terms_version = patch.termsVersion
      if (patch.termsAcceptedAt !== undefined) row.terms_accepted_at = toIso(patch.termsAcceptedAt)
      if (patch.consentTemplate !== undefined) {
        row.consent_template = patch.consentTemplate
        row.consent_template_version = patch.consentTemplate.version
      }
      const { error } = await sb.from('therapists').update(row).eq('id', pid)
      if (error) throw error
    },
    async getProfessionalCard(therapistId): Promise<ProfessionalCard | null> {
      const { data, error } = await sb.rpc('professional_card', { p_therapist: therapistId })
      if (error) throw error
      const r = Array.isArray(data) ? data[0] : data
      if (!r) return null
      return {
        id: r.id, name: r.name ?? '', registration: r.registration ?? '',
        registry: r.registry === 'Ordine' ? 'Ordine' : r.registry === 'CRP' ? 'CRP' : null,
        registryRegion: r.registry_region ?? null, verifiedAt: r.verified_at ? toMs(r.verified_at) : null,
        consentTemplate: (r.consent_template as InformedConsentTemplate | null) ?? null,
      }
    },
    async acceptInformedConsent(therapistId, template): Promise<void> {
      const pid = await profileId()
      const { error } = await sb.from('patient_informed_consents').upsert({
        profile_id: pid, therapist_id: therapistId, template_version: template.version, template_copy: template,
      }, { onConflict: 'profile_id,therapist_id,template_version' })
      if (error) throw error
    },
    async listMyInformedConsents(): Promise<PatientInformedConsent[]> {
      const pid = await profileId()
      const { data, error } = await sb.from('patient_informed_consents').select('*').eq('profile_id', pid)
      if (error) throw error
      return (data ?? []).map((r: any) => ({ id: r.id, therapistId: r.therapist_id, templateVersion: r.template_version, acceptedAt: toMs(r.accepted_at) }))
    },
    async confirmSessionLocation(appointmentId, location): Promise<void> {
      const { error } = await sb.from('appointments')
        .update({ patient_location: location.trim().slice(0, 300), location_confirmed_at: new Date().toISOString() })
        .eq('id', appointmentId)
      if (error) throw error
    },

    // the sponsor
    async getSponsorTotals(): Promise<SponsorTotals> {
      const pid = await profileId()
      const { data: prof, error: pErr } = await sb.from('profiles').select('company_id').eq('id', pid).single()
      if (pErr) throw pErr
      const companyId = (prof as { company_id: string | null }).company_id
      if (!companyId) throw new Error('No company on this account')
      const { data: co } = await sb.from('companies').select('seats, active_users, min_cohort').eq('id', companyId).single()
      const c = (co as { seats?: number; active_users?: number; min_cohort?: number } | null) ?? {}
      const k = c.min_cohort ?? MIN_COHORT
      const suppress = (n: number | null | undefined) => (n == null || n < k ? null : n)
      /* Only what the company row already carries: seats and active users.
         Sessions are not counted here because the sponsor role has no grant
         on the sessions table — and that is the point. */
      return { companyId, minCohort: k, eligible: c.seats ?? 0, registered: suppress(c.active_users), active30d: null, sessions30d: null }
    },
  }
}
