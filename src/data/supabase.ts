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
import type { CompanyMember, CompanyMemberDraft, CompanyTherapist, MoodCheckinRow, TherapistActivationCode } from './provider'
import type { SessionRecord, MoodCheck, Duration } from '../types/domain'
import type { Patient, Therapist, B2bSession, B2cSession, Goal, Score, RapidNote } from '../b2b/data'
import type { CatalogProtocol, ProtocolSource, TenantScope } from './catalog'
import { repositioned, type Plan, type PlanItem } from './plan'
import { generateConnectionCode } from './link'
import { normalizeTags } from './tags'
import { normalizePromoCode, type PromoCode } from './promo'
import type { PartnerProduct } from './partners'
import { DEFAULT_ECONOMY, displayLoops, type EconomySettings, type LoopsEntry, type Wallet } from '../gamification/economy'
import type { AchievementDef, AchievementView, CollectiveProgress, RankingPart } from '../gamification/achievements'
import type { CityCard, GeoRanking, GeoScope, Municipality } from '../gamification/geo'
import { RedeemError, type Benefit, type BenefitTag, type BenefitView, type RedeemRefusal, type RedeemResult as BenefitRedeemResult, type Redemption } from '../gamification/benefits'
import type { AdminRedemption, ChallengeReach, GamificationReport } from './provider'
import type { Challenge, ChallengeAdminRow, ChallengeScope, ChallengeView } from '../gamification/challenges'
import type {
  AddonDashboard, AddonInfo, AddonPlan, ChallengeTemplate, CompanyBenefitRow, CompanyChallengeDraft,
  CompanySubscription, IdentifiedRedemption, TagFilterRow,
} from '../gamification/company'
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

import type { AssessmentRecord } from './assessments'

/* ---- small converters ---- */
const toMs = (t: string | null | undefined): number => (t ? new Date(t).getTime() : 0)
const toIso = (ms: number): string => new Date(ms).toISOString()

/* A patient key is either a real `patients.id` (the therapist's desktop) or
   the sentinel the person's own app uses. Only the first is a foreign key. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function mapAssessment(r: any): AssessmentRecord {
  return {
    id: r.id,
    patientId: r.patient_key,
    instrumentId: r.instrument_id,
    timepoint: r.timepoint,
    administeredAt: r.administered_at ? Date.parse(r.administered_at) : 0,
    completedAt: r.completed_at ? Date.parse(r.completed_at) : null,
    status: r.status,
    proposedBy: r.proposed_by ?? 'system',
    confirmedBy: r.confirmed_by ?? null,
    responses: Array.isArray(r.responses) ? r.responses : [],
    scores: r.scores ?? null,
    immutable: !!r.immutable,
  }
}
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
    plainImportedAt: r.plain_imported_at ?? undefined,
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
    offer: r.offer ?? undefined,
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
  return { id: r.id, name: r.name, contactEmail: r.contact_email ?? null, seats: r.seats ?? 0, activeUsers: r.active_users ?? 0, status: r.status === 'paused' ? 'paused' : 'active', createdAt: toMs(r.created_at) }
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
      .eq('completed', true)
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
      const { data, error } = await sb.from('sessions').select('*').eq('kind', 'b2c').eq('completed', true).order('started_at', { ascending: true })
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
        completed: rec.completed ?? !!rec.completedAt,
        /* What the economy credits from (SPEC §2). The amounts are worked out
           by the sessions_credit trigger, never sent from here (GAM-R8). */
        listened_sec: rec.listenedSec == null ? null : Math.max(0, Math.round(rec.listenedSec)),
        is_sos: !!rec.sos,
        stereo_checked: !!rec.stereoChecked,
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

    async getMyAddressedAs() {
      const uid = await authUid()
      const { data, error } = await sb.from('profiles').select('addressed_as').eq('auth_uid', uid).maybeSingle()
      if (error) return null
      const v = (data as { addressed_as: string | null } | null)?.addressed_as
      return v === 'm' || v === 'f' ? v : null
    },

    async setMyAddressedAs(to: 'm' | 'f') {
      const uid = await authUid()
      const { error } = await sb.from('profiles').update({ addressed_as: to }).eq('auth_uid', uid)
      if (error) throw error
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
    /* ONE row, by its primary key.

       Every save used to confirm itself by reading the WHOLE catalog back and
       scanning it for the code it had just written — every timeline, every
       Studio session, every variant of every other protocol, to look at one
       row. As the catalogue filled up that read crossed the database's
       statement timeout, and an import that had SAVED reported "salvato, ma
       la rilettura del catalogo e fallita". */
    async findProtocol(code: string): Promise<CatalogProtocol | undefined> {
      const { data, error } = await sb.from('protocols').select('*').eq('code', code).maybeSingle()
      if (error) throw error
      return data ? mapCatalog(data) : undefined
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
        plain_imported_at: p.plainImportedAt ?? null,
        asset_map: p.assetMap ?? null,
        studio: p.studio ?? null,
        studio_by_duration: p.studioByDuration ?? null,
        audience: p.audience ?? 'clinical',
        library: p.library ?? null,
        offer: p.offer ?? null,
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

    /* --- a company's approved addresses ---
       Reads come straight off the table (HR may select its own company's
       rows); every WRITE goes through a function, because turning an address
       off has to cut the live account loose in the same transaction. The
       company is taken from the caller's own profile inside those functions
       and never from this argument, which exists for the admin-side read. */
    async listCompanyMembers(companyId?: string) {
      const cid = companyId ?? (await myCompanyId())
      if (!cid) return []
      const { data, error } = await sb
        .from('company_members')
        .select('*')
        .eq('company_id', cid.toUpperCase())
        .order('email')
      if (error) return []
      return (data ?? []).map((r: Record<string, any>) => ({
        email: String(r.email),
        name: r.name ?? undefined,
        employeeRef: r.employee_ref ?? undefined,
        enabled: !!r.enabled,
        addedAt: toMs(r.added_at),
        addedBy: r.added_by ?? undefined,
        disabledAt: r.disabled_at ? toMs(r.disabled_at) : undefined,
      })) as CompanyMember[]
    },
    async addCompanyMembers(rows: CompanyMemberDraft[]) {
      const payload = rows
        .map((r) => ({
          email: r.email.trim().toLowerCase(),
          name: r.name?.trim() || null,
          employee_ref: r.employeeRef?.trim() || null,
        }))
        .filter((r) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email))
      if (!payload.length) return 0
      const { data, error } = await sb.rpc('hr_add_company_members', { p_rows: payload })
      if (error) throw error
      return Number(data ?? 0)
    },
    async setCompanyMemberAccess(email: string, enabled: boolean) {
      const { error } = await sb.rpc('hr_set_member_access', { p_email: email, p_enabled: enabled })
      if (error) throw error
    },
    async removeCompanyMember(email: string) {
      const { error } = await sb.rpc('hr_remove_company_member', { p_email: email })
      if (error) throw error
    },
    async countUnlistedMembers() {
      const { data, error } = await sb.rpc('hr_unlisted_member_count')
      if (error) return 0
      return Number(data ?? 0)
    },
    async revokeUnlistedMembers() {
      const { data, error } = await sb.rpc('hr_revoke_unlisted_members')
      if (error) throw error
      return Number(data ?? 0)
    },
    /* --- the emotional check-in ---
       `user_id` is the caller's own profile id and the policy says so too;
       an insert for anybody else, or without the measurement consent, is
       refused by the database rather than by this function. */
    async recordMoodCheckin(row: MoodCheckinRow) {
      const { error } = await sb.from('mood_checkins').insert({
        user_id: await profileId(),
        created_at: toIso(row.at),
        context: row.context,
        session_id: row.sessionId ?? null,
        protocol_code: row.protocolCode ?? null,
        valence: row.valence,
        arousal: row.arousal,
        label_id: row.labelId,
        locale: row.locale,
        color_oklch: row.colorOklch,
        variant: row.variant,
      })
      if (error) throw error
    },
    async listMyMoodCheckins(limit = 60) {
      const { data, error } = await sb
        .from('mood_checkins')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) return []
      return (data ?? []).map((r: Record<string, any>) => ({
        id: String(r.id),
        at: toMs(r.created_at),
        context: r.context,
        sessionId: r.session_id ?? undefined,
        protocolCode: r.protocol_code ?? undefined,
        valence: Number(r.valence),
        arousal: Number(r.arousal),
        labelId: r.label_id ?? null,
        locale: String(r.locale ?? 'pt-BR'),
        colorOklch: String(r.color_oklch ?? ''),
        variant: r.variant ?? 'color',
      })) as MoodCheckinRow[]
    },

    async checkCompanyEmail(companyCode: string, email: string) {
      const { data, error } = await sb.rpc('company_email_status', {
        p_company_id: companyCode.trim().toUpperCase(),
        p_email: email.trim().toLowerCase(),
      })
      /* A database that has not run script 25 has no such function. The code
         then behaves exactly as it did before the list existed, rather than
         refusing every sign-up because a check could not be made. */
      if (error) return 'no-roster' as const
      const answer = String(data ?? '')
      if (answer === 'OK') return 'ok' as const
      if (answer === 'DENIED') return 'denied' as const
      if (answer === 'NO_COMPANY') return 'no-company' as const
      return 'no-roster' as const
    },

    // --- The Self Use home rails ---
    async topSessions(limit = 10): Promise<string[]> {
      const { data, error } = await sb.rpc('top_sessions', { p_limit: limit })
      /* A missing function (the migration has not been run) or a refusal is
         not an error worth surfacing: the shelf simply does not appear. */
      if (error) return []
      return ((data ?? []) as { protocol_code: string }[])
        .map((r) => r.protocol_code)
        .filter((c): c is string => !!c)
    },
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
      const row = { id: c.id, name: c.name, contact_email: c.contactEmail, seats: c.seats, active_users: c.activeUsers, status: c.status, created_at: toIso(c.createdAt) }
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
    /* --- clinical assessments -------------------------------------------

       Row-level security does the scoping: a person gets their own rows, a
       therapist gets their own patients’. Neither needs a filter here, and
       adding one would be a second, weaker copy of the rule. */
    async listAssessments(): Promise<AssessmentRecord[]> {
      const { data, error } = await sb
        .from('assessments')
        .select('*')
        .order('administered_at', { ascending: true })
      if (error) {
        /* The table is not there yet (setup.sql not re-run). The queue falls
           back to its local cache rather than taking the screen down. */
        if (/relation|does not exist|schema cache/i.test(error.message)) return []
        throw error
      }
      return (data ?? []).map(mapAssessment)
    },

    async saveAssessments(records: AssessmentRecord[]): Promise<void> {
      if (!records.length) return
      const pid = await profileId()
      /* `patient_key` is what the client indexes by and is kept as-is; when
         it is a real patient id the column is filled too, which is what lets
         the therapist policy find the row. */
      const rows = records.map((r) => ({
        id: r.id,
        owner_profile: pid,
        patient_id: UUID_RE.test(r.patientId) ? r.patientId : null,
        patient_key: r.patientId,
        instrument_id: r.instrumentId,
        timepoint: r.timepoint,
        administered_at: toIso(r.administeredAt),
        completed_at: r.completedAt ? toIso(r.completedAt) : null,
        status: r.status,
        proposed_by: r.proposedBy,
        confirmed_by: r.confirmedBy,
        responses: r.responses,
        scores: r.scores,
        immutable: r.immutable,
      }))
      const { error } = await sb.from('assessments').upsert(rows, { onConflict: 'id' })
      if (error) {
        if (/append-only|cannot be modified/i.test(error.message)) {
          throw new Error('Questa valutazione e completata: i record clinici non si modificano.')
        }
        throw error
      }
    },

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

    // gamification: the Loops economy
    async getWallet(): Promise<Wallet> {
      const { data, error } = await sb.rpc('get_wallet')
      if (error) throw error
      const w = (data ?? {}) as Record<string, number | null>
      const balanceCenti = Number(w.balance_centi ?? 0)
      return {
        balanceCenti,
        loops: displayLoops(balanceCenti),
        pointsTotal: Number(w.points_total ?? 0),
        pointsMonth: Number(w.points_month ?? 0),
        minutesMonth: Number(w.minutes_month ?? 0),
        sessionsMonth: Number(w.sessions_month ?? 0),
        multiplier: w.multiplier == null ? null : Number(w.multiplier),
      }
    },
    async listLoopsLedger(): Promise<LoopsEntry[]> {
      // RLS: the signed-in person's own entries only
      const { data, error } = await sb.from('loops_ledger').select('*').order('created_at', { ascending: false }).limit(500)
      if (error) throw error
      return (data ?? []).map((r: any): LoopsEntry => ({
        id: r.id,
        entryType: r.entry_type,
        amountCenti: r.amount_centi,
        fundingSource: r.funding_source,
        companyId: r.company_id,
        multiplierApplied: r.multiplier_applied == null ? null : Number(r.multiplier_applied),
        sourceType: r.source_type,
        sourceId: r.source_id,
        createdAt: toMs(r.created_at),
      }))
    },
    async getEconomySettings(): Promise<EconomySettings> {
      const { data, error } = await sb.from('economy_settings').select('*').eq('id', true).maybeSingle()
      if (error) throw error
      const r = data as any
      if (!r) return { ...DEFAULT_ECONOMY }
      return {
        pointsPerMinute: r.points_per_minute,
        pointsPerCompletedSession: r.points_per_completed_session,
        dailyMinutesCap: r.daily_minutes_cap,
        dailyCompletionBonusCap: r.daily_completion_bonus_cap,
        loopsPerPoint: Number(r.loops_per_point),
        minContributionPoints: r.min_contribution_points,
        countClinicalSessions: r.count_clinical_sessions,
        loopsExpiryMonths: r.loops_expiry_months,
        geoMinActiveUsers: r.geo_min_active_users,
        hrMinCohort: r.hr_min_cohort,
        maxBackdateHours: r.max_backdate_hours,
      }
    },
    async listMyAchievements(): Promise<AchievementView[]> {
      const { data, error } = await sb.rpc('get_my_achievements')
      if (error) throw error
      return ((data ?? []) as any[]).map((r): AchievementView => ({
        id: r.id,
        slug: r.slug,
        kind: r.kind,
        scope: r.scope,
        metric: r.metric,
        threshold: Number(r.threshold),
        period: r.period,
        tier: r.tier,
        icon: r.icon,
        bonusLoopsCenti: r.bonusLoopsCenti,
        active: r.active !== false,
        sortOrder: r.sortOrder,
        value: r.value == null ? null : Number(r.value),
        unlockedAt: r.unlockedAt ? toMs(r.unlockedAt) : null,
        seenAt: r.seenAt ? toMs(r.seenAt) : null,
      }))
    },
    async markAchievementsSeen(ids: string[]): Promise<void> {
      if (!ids.length) return
      const { error } = await sb.rpc('mark_achievements_seen', { p_ids: ids })
      if (error) throw error
    },
    async recordPathwayCompleted(slug: string): Promise<void> {
      const { error } = await sb.rpc('record_pathway_completed', { p_slug: slug })
      if (error) throw error
    },
    async getMyCollectiveProgress(): Promise<CollectiveProgress[]> {
      const { data, error } = await sb.rpc('get_my_collective_progress')
      if (error) throw error
      return ((data ?? []) as any[]).map((r): CollectiveProgress => ({
        slug: r.slug, unit: r.unit, unitRef: r.unitRef ?? null, unitName: r.unitName ?? null, canTakePart: !!r.canTakePart,
        myMinutes: Number(r.myMinutes ?? 0), neededMinutes: Number(r.neededMinutes ?? 0),
        unitShare: r.unitShare == null ? null : Number(r.unitShare),
      }))
    },
    async getMyRankingPart(): Promise<RankingPart> {
      const { data, error } = await sb.rpc('get_my_ranking_part')
      if (error) throw error
      const r = (data ?? {}) as { monthMinutes?: number; lifetimeMinutes?: number }
      return { monthMinutes: Number(r.monthMinutes ?? 0), lifetimeMinutes: Number(r.lifetimeMinutes ?? 0) }
    },
    async searchMunicipalities(q: string): Promise<Municipality[]> {
      const { data, error } = await sb.rpc('search_municipalities', { p_q: q, p_limit: 12 })
      if (error) throw error
      return ((data ?? []) as any[]).map((r) => ({ ibgeCode: r.ibge_code, name: r.name, uf: r.uf }))
    },
    async setMyCity(ibgeCode: string | null): Promise<void> {
      const { error } = await sb.rpc('set_my_city', { p_code: ibgeCode })
      if (error) throw error
    },
    async getGeoRankings(scope: GeoScope, period: 'month' | 'all', limit = 5): Promise<GeoRanking> {
      const { data, error } = await sb.rpc('get_geo_rankings', { p_scope: scope, p_period: period, p_limit: limit })
      if (error) throw error
      const r = data as any
      return {
        scope: r.scope,
        period: r.period,
        threshold: r.threshold,
        rows: ((r.rows ?? []) as any[]).map((x) => ({
          ref: x.ref, name: x.name ?? null, uf: x.uf ?? null, rank: Number(x.rank),
          minutesPerActive: Number(x.minutesPerActive ?? 0), mine: !!x.mine,
        })),
        mine: r.mine ? { ref: r.mine.ref, name: r.mine.name ?? null, uf: r.mine.uf ?? null, rank: r.mine.rank == null ? null : Number(r.mine.rank), eligible: !!r.mine.eligible } : null,
      }
    },
    async getMyCityCard(): Promise<CityCard | null> {
      const { data, error } = await sb.rpc('get_my_city_card')
      if (error) throw error
      const r = data as any
      if (!r) return null
      return {
        consented: !!r.consented,
        city: r.city ? { ibgeCode: r.city.ref, name: r.city.name, uf: r.city.uf } : null,
        eligible: !!r.eligible,
        goalSlug: r.goalSlug ?? 'city_in_loop',
        goalShare: r.goalShare == null ? null : Number(r.goalShare),
        myMinutesMonth: Number(r.myMinutesMonth ?? 0),
      }
    },
    async adminRefreshGeo(): Promise<number> {
      const { data, error } = await sb.rpc('admin_refresh_geo')
      if (error) throw error
      return Number(data ?? 0)
    },

    // gamification: benefits
    async getAvailableBenefits(): Promise<BenefitView[]> {
      const { data, error } = await sb.rpc('get_available_benefits')
      if (error) throw error
      return ((data ?? []) as any[]).map((r): BenefitView => ({
        id: r.id, companyId: r.companyId ?? null, companyName: r.companyName ?? null, title: r.title,
        description: r.description ?? null, careRationale: r.careRationale ?? null, partnerName: r.partnerName ?? null,
        pillar: r.pillar, priceLoopsCenti: r.priceLoopsCenti ?? null, perUserLimit: r.perUserLimit ?? 1,
        validTo: r.validTo ? toMs(r.validTo) : null, codeValidityDays: r.codeValidityDays ?? null,
        deliveryType: r.deliveryType, terms: r.terms ?? null, imageAsset: r.imageAsset ?? null,
        challengeExclusive: !!r.challengeExclusive, tags: r.tags ?? [], myRedemptions: Number(r.myRedemptions ?? 0),
        inStock: r.inStock !== false,
      }))
    },
    async getIdentifiedPreview(): Promise<{ name: string; companyName: string | null }> {
      const { data, error } = await sb.rpc('get_identified_preview')
      if (error) throw error
      const r = (data ?? {}) as { name?: string; companyName?: string | null }
      return { name: r.name ?? '', companyName: r.companyName ?? null }
    },
    async redeemBenefit(benefitId: string, consentIdentified = false, employeeNumber?: string): Promise<BenefitRedeemResult> {
      const { data, error } = await sb.rpc('redeem_benefit', {
        p_benefit: benefitId, p_consent_identified: consentIdentified, p_employee_number: employeeNumber ?? null,
      })
      if (error) {
        const hint = (error as { hint?: string }).hint as RedeemRefusal | undefined
        if (hint && hint.startsWith('BENEFIT_')) throw new RedeemError(hint)
        throw error
      }
      const r = data as any
      return {
        redemptionId: r.redemptionId, code: r.code ?? null, link: r.link ?? null,
        expiresAt: r.expiresAt ? toMs(r.expiresAt) : null, loopsSpentCenti: Number(r.loopsSpentCenti ?? 0),
      }
    },
    async listMyRedemptions(): Promise<Redemption[]> {
      const { data, error } = await sb.rpc('list_my_redemptions')
      if (error) throw error
      return ((data ?? []) as any[]).map((r): Redemption => ({
        id: r.id, benefitId: r.benefitId, title: r.title, partnerName: r.partnerName ?? null, pillar: r.pillar,
        deliveryType: r.deliveryType, terms: r.terms ?? null, code: r.code ?? null, link: r.link ?? null,
        loopsSpentCenti: Number(r.loopsSpentCenti ?? 0), status: r.status,
        createdAt: toMs(r.createdAt), expiresAt: r.expiresAt ? toMs(r.expiresAt) : null,
      }))
    },
    async listBenefitTags(): Promise<BenefitTag[]> {
      const { data, error } = await sb.from('benefit_tags').select('*').order('tag_group').order('label')
      if (error) throw error
      return ((data ?? []) as any[]).map((t) => ({ id: t.id, slug: t.slug, label: t.label, group: t.tag_group, description: t.description ?? null, active: !!t.active }))
    },
    async adminListBenefits(): Promise<Benefit[]> {
      const { data, error } = await sb.from('benefits').select('*, benefit_tag_map(tag_id)').order('pillar').order('sort_order')
      if (error) throw error
      return ((data ?? []) as any[]).map((r): Benefit => ({
        id: r.id, companyId: r.company_id ?? null, title: r.title, description: r.description ?? null,
        careRationale: r.care_rationale ?? null, partnerName: r.partner_name ?? null, pillar: r.pillar,
        priceLoopsCenti: r.price_loops_centi ?? null, stockTotal: r.stock_total ?? null, stockRemaining: r.stock_remaining ?? null,
        perUserLimit: r.per_user_limit ?? 1, validFrom: r.valid_from ? toMs(r.valid_from) : null, validTo: r.valid_to ? toMs(r.valid_to) : null,
        codeValidityDays: r.code_validity_days ?? null, deliveryType: r.delivery_type, staticCode: r.static_code ?? null,
        linkUrl: r.link_url ?? null, terms: r.terms ?? null, imageAsset: r.image_asset ?? null, status: r.status,
        challengeExclusiveId: r.challenge_exclusive_id ?? null, sortOrder: r.sort_order ?? 0,
        tagIds: ((r.benefit_tag_map ?? []) as { tag_id: string }[]).map((m) => m.tag_id),
      }))
    },
    async adminSaveBenefit(b: Benefit): Promise<string> {
      const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString())
      const { data, error } = await sb.rpc('admin_save_benefit', {
        p: { ...b, id: b.id || null, validFrom: iso(b.validFrom), validTo: iso(b.validTo) },
        p_tag_ids: b.tagIds,
      })
      if (error) {
        if ((error as { hint?: string }).hint === 'BENEFIT_NEEDS_TAG') throw new Error('Un beneficio Good Loop ha bisogno di almeno un tag.')
        throw error
      }
      return String(data)
    },
    async adminSaveTag(t: BenefitTag): Promise<void> {
      const row = { slug: t.slug, label: t.label, tag_group: t.group, description: t.description, active: t.active }
      const { error } = t.id ? await sb.from('benefit_tags').update(row).eq('id', t.id) : await sb.from('benefit_tags').insert(row)
      if (error) throw error
    },
    async adminUploadCodes(benefitId: string, codes: string[]): Promise<number> {
      const { data, error } = await sb.rpc('admin_upload_codes', { p_benefit: benefitId, p_codes: codes })
      if (error) throw error
      return Number(data ?? 0)
    },
    async adminBenefitCodeCounts(): Promise<Record<string, { total: number; free: number }>> {
      const { data, error } = await sb.rpc('admin_benefit_code_counts')
      if (error) throw error
      const out: Record<string, { total: number; free: number }> = {}
      for (const [k, v] of Object.entries((data ?? {}) as Record<string, { total: number; free: number }>)) out[k] = { total: Number(v.total), free: Number(v.free) }
      return out
    },
    async adminListRedemptions(): Promise<AdminRedemption[]> {
      /* `profiles!user_id`, not `profiles`.

         benefit_redemptions points at profiles TWICE — `user_id`, the person
         who redeemed, and `refunded_by`, whoever reversed it — so PostgREST
         cannot tell which join is meant and refuses the whole request:
         "could not embed because more than one relationship was found for
         'benefit_redemptions' and 'profiles'". The screen came up empty with
         that sentence on it. Naming the foreign key answers the question. */
      const { data, error } = await sb.from('benefit_redemptions')
        .select('*, benefits(title, partner_name, pillar, delivery_type, terms), profiles!user_id(name)')
        .order('created_at', { ascending: false }).limit(500)
      if (error) throw error
      return ((data ?? []) as any[]).map((r): AdminRedemption => ({
        id: r.id, benefitId: r.benefit_id, title: r.benefits?.title ?? '', partnerName: r.benefits?.partner_name ?? null,
        pillar: r.benefits?.pillar, deliveryType: r.benefits?.delivery_type, terms: r.benefits?.terms ?? null,
        code: null, link: null, loopsSpentCenti: r.loops_spent_centi, status: r.status,
        createdAt: toMs(r.created_at), expiresAt: r.expires_at ? toMs(r.expires_at) : null,
        userLabel: r.profiles?.name ?? '—',
      }))
    },
    async adminRefundRedemption(redemptionId: string): Promise<void> {
      const { error } = await sb.rpc('admin_refund_redemption', { p_redemption: redemptionId })
      if (error) throw error
    },

    // gamification: challenges
    async listMyChallenges(): Promise<ChallengeView[]> {
      const { data, error } = await sb.rpc('get_my_challenges')
      if (error) throw error
      return ((data ?? []) as any[]).map((r): ChallengeView => ({
        id: r.id, companyId: r.companyId ?? null, companyName: r.companyName ?? null, title: r.title,
        description: r.description ?? null, badgeIcon: r.badgeIcon ?? 'flag', format: r.format, scope: r.scope,
        scopeRef: r.scopeRef ?? null, metric: r.metric, goalValue: Number(r.goalValue), goalKind: r.goalKind ?? 'total',
        perPersonMin: r.perPersonMin == null ? null : Number(r.perPersonMin),
        windowStartHour: r.windowStartHour ?? null, windowEndHour: r.windowEndHour ?? null,
        startsAt: toMs(r.startsAt), endsAt: toMs(r.endsAt), status: r.status,
        rewardBonusLoopsCenti: r.rewardBonusLoopsCenti ?? null, rewardBenefit: r.rewardBenefit ?? null,
        myProgress: Number(r.myProgress ?? 0), myCompletedAt: r.myCompletedAt ? toMs(r.myCompletedAt) : null,
        myRewardedAt: r.myRewardedAt ? toMs(r.myRewardedAt) : null, myBenefitGranted: !!r.myBenefitGranted,
        collectiveValue: r.collectiveValue == null ? null : Number(r.collectiveValue),
        participants: r.participants == null ? null : Number(r.participants),
        goalReachedAt: r.goalReachedAt ? toMs(r.goalReachedAt) : null,
      }))
    },
    async adminListChallenges(): Promise<ChallengeAdminRow[]> {
      const { data, error } = await sb.rpc('admin_list_challenges')
      if (error) throw error
      return ((data ?? []) as any[]).map((r): ChallengeAdminRow => ({
        id: r.id, companyId: null, title: r.title, description: r.description ?? null, badgeIcon: r.badgeIcon ?? 'flag',
        format: r.format, scope: r.scope, scopeRef: r.scopeRef ?? null, metric: r.metric, goalValue: Number(r.goalValue),
        goalKind: 'total', perPersonMin: r.perPersonMin == null ? null : Number(r.perPersonMin),
        windowStartHour: r.windowStartHour ?? null, windowEndHour: r.windowEndHour ?? null,
        startsAt: toMs(r.startsAt), endsAt: toMs(r.endsAt), status: r.status,
        rewardBonusLoopsCenti: r.rewardBonusLoopsCenti ?? null, rewardBenefitId: r.rewardBenefitId ?? null,
        rewardRule: r.rewardRule ?? 'first_to_complete', announceInApp: r.announceInApp !== false, templateSlug: null,
        participants: Number(r.participants ?? 0), completed: Number(r.completed ?? 0), rewarded: Number(r.rewarded ?? 0),
        collectiveValue: r.collectiveValue == null ? null : Number(r.collectiveValue),
      }))
    },
    async adminSaveChallenge(c: Challenge): Promise<string> {
      const { data, error } = await sb.rpc('admin_save_challenge', {
        p: {
          ...c, id: c.id || null, rewardRule: c.rewardRule,
          startsAt: new Date(c.startsAt).toISOString(), endsAt: new Date(c.endsAt).toISOString(),
        },
      })
      if (error) throw error
      return String(data)
    },
    async adminChallengeAction(id: string, action: 'publish' | 'schedule' | 'end' | 'cancel' | 'duplicate'): Promise<string> {
      const { data, error } = await sb.rpc('admin_challenge_action', { p_id: id, p_action: action })
      if (error) throw error
      return String(data)
    },
    async adminChallengeReach(scope: ChallengeScope, ref: string | null): Promise<ChallengeReach> {
      const { data, error } = await sb.rpc('admin_challenge_reach', { p_scope: scope, p_ref: ref })
      if (error) throw error
      const r = data as any
      return { people: Number(r.people ?? 0), activeLastMonth: Number(r.activeLastMonth ?? 0), threshold: Number(r.threshold ?? 0), enough: !!r.enough }
    },
    async adminSettleChallenges(): Promise<number> {
      const { data, error } = await sb.rpc('admin_settle_challenges')
      if (error) throw error
      return Number(data ?? 0)
    },

    // gamification: the company add-on
    async hrGetAddon(): Promise<AddonInfo | null> {
      const { data, error } = await sb.rpc('hr_get_addon')
      if (error) throw error
      const r = data as any
      if (!r) return null
      return {
        planId: r.planId, planName: r.planName, multiplier: Number(r.multiplier), companyChallenges: !!r.companyChallenges,
        companyBenefits: !!r.companyBenefits, tagFilter: !!r.tagFilter, startsAt: toMs(r.startsAt), endsAt: r.endsAt ? toMs(r.endsAt) : null,
      }
    },
    async hrListTagFilter(): Promise<TagFilterRow[]> {
      const { data, error } = await sb.rpc('hr_list_tag_filter')
      if (error) throw error
      return ((data ?? []) as any[]).map((r) => ({ id: r.id, slug: r.slug, label: r.label, group: r.group, disabled: !!r.disabled, affects: Number(r.affects ?? 0), benefits: r.benefits ?? [] }))
    },
    async hrSetTagDisabled(tagId: string, disabled: boolean): Promise<void> {
      const { error } = await sb.rpc('hr_set_tag_disabled', { p_tag: tagId, p_disabled: disabled })
      if (error) throw error
    },
    async hrTagFilterHistory(): Promise<{ label: string; disabledAt: number; enabledAt: number | null }[]> {
      const { data, error } = await sb.rpc('hr_tag_filter_history')
      if (error) throw error
      return ((data ?? []) as any[]).map((r) => ({ label: r.label, disabledAt: toMs(r.disabledAt), enabledAt: r.enabledAt ? toMs(r.enabledAt) : null }))
    },
    async hrListCompanyBenefits(): Promise<CompanyBenefitRow[]> {
      const { data, error } = await sb.rpc('hr_list_company_benefits')
      if (error) throw error
      return ((data ?? []) as any[]).map((r): CompanyBenefitRow => ({
        id: r.id, title: r.title, description: r.description ?? null, careRationale: r.careRationale ?? null, pillar: r.pillar,
        priceLoopsCenti: r.priceLoopsCenti ?? null, stockTotal: r.stockTotal ?? null, deliveryType: r.deliveryType, status: r.status,
        terms: r.terms ?? null, codesFree: Number(r.codesFree ?? 0), codesTotal: Number(r.codesTotal ?? 0),
      }))
    },
    async hrSaveCompanyBenefit(b: CompanyBenefitRow): Promise<string> {
      const { data, error } = await sb.rpc('hr_save_company_benefit', { p: { ...b, id: b.id || null } })
      if (error) throw error
      return String(data)
    },
    async hrUploadCodes(benefitId: string, codes: string[]): Promise<number> {
      const { data, error } = await sb.rpc('hr_upload_codes', { p_benefit: benefitId, p_codes: codes })
      if (error) throw error
      return Number(data ?? 0)
    },
    async hrIdentifiedRedemptions(): Promise<IdentifiedRedemption[]> {
      const { data, error } = await sb.rpc('hr_identified_redemptions')
      if (error) throw error
      return ((data ?? []) as any[]).map((r) => ({ id: r.id, benefit: r.benefit, name: r.name ?? '', employeeNumber: r.employeeNumber ?? null, consentedAt: toMs(r.consentedAt), status: r.status }))
    },
    async listChallengeTemplates(): Promise<ChallengeTemplate[]> {
      const { data, error } = await sb.from('challenge_templates').select('*').eq('active', true).order('sort_order')
      if (error) throw error
      return ((data ?? []) as any[]).map((t): ChallengeTemplate => ({
        slug: t.slug, title: t.title, description: t.description, badgeIcon: t.badge_icon, format: t.format, metric: t.metric,
        goalValue: Number(t.goal_value), goalKind: t.goal_kind, perPersonMin: t.per_person_min == null ? null : Number(t.per_person_min),
        windowStartHour: t.window_start_hour ?? null, windowEndHour: t.window_end_hour ?? null, defaultDays: t.default_days,
      }))
    },
    async adminListChallengeTemplates(): Promise<ChallengeTemplate[]> {
      const { data, error } = await sb.from('challenge_templates').select('*').order('sort_order')
      if (error) throw error
      return ((data ?? []) as any[]).map((t): ChallengeTemplate => ({
        slug: t.slug, title: t.title, description: t.description, badgeIcon: t.badge_icon, format: t.format, metric: t.metric,
        goalValue: Number(t.goal_value), goalKind: t.goal_kind, perPersonMin: t.per_person_min == null ? null : Number(t.per_person_min),
        windowStartHour: t.window_start_hour ?? null, windowEndHour: t.window_end_hour ?? null, defaultDays: t.default_days,
        active: !!t.active, sortOrder: t.sort_order,
      }))
    },
    async adminSaveChallengeTemplate(tp: ChallengeTemplate): Promise<void> {
      const { error } = await sb.from('challenge_templates').upsert({
        slug: tp.slug, title: tp.title, description: tp.description, badge_icon: tp.badgeIcon, format: tp.format, metric: tp.metric,
        goal_value: tp.goalValue, goal_kind: tp.goalKind, per_person_min: tp.perPersonMin,
        window_start_hour: tp.windowStartHour, window_end_hour: tp.windowEndHour, default_days: tp.defaultDays,
        active: tp.active !== false, sort_order: tp.sortOrder ?? 0,
      })
      if (error) throw error
    },
    async hrSaveCompanyChallenge(d: CompanyChallengeDraft): Promise<string> {
      const { data, error } = await sb.rpc('hr_save_company_challenge', {
        p: { ...d, id: d.id || null, startsAt: new Date(d.startsAt).toISOString(), endsAt: new Date(d.endsAt).toISOString() },
      })
      if (error) throw error
      return String(data)
    },
    async hrCompanyChallengeAction(id: string, action: 'publish' | 'end' | 'cancel'): Promise<void> {
      const { error } = await sb.rpc('hr_company_challenge_action', { p_id: id, p_action: action })
      if (error) throw error
    },
    async hrAddonDashboard(): Promise<AddonDashboard> {
      const { data, error } = await sb.rpc('hr_addon_dashboard')
      if (error) throw error
      const r = data as any
      return {
        minCohort: Number(r.minCohort), eligible: r.eligible == null ? null : Number(r.eligible),
        activeChallenges: Number(r.activeChallenges ?? 0),
        multiplierLoopsMonth: r.multiplierLoopsMonth == null ? null : Number(r.multiplierLoopsMonth),
        redemptionsMonth: r.redemptionsMonth == null ? null : Number(r.redemptionsMonth),
        challenges: ((r.challenges ?? []) as any[]).map((c) => ({
          id: c.id, title: c.title, status: c.status, templateSlug: c.templateSlug ?? null, startsAt: toMs(c.startsAt), endsAt: toMs(c.endsAt),
          format: c.format, goalKind: c.goalKind, goalValue: Number(c.goalValue), perPersonMin: c.perPersonMin == null ? null : Number(c.perPersonMin),
          rewardBonusLoopsCenti: c.rewardBonusLoopsCenti ?? null, rewardBenefitId: c.rewardBenefitId ?? null,
          adhesionPct: c.adhesionPct == null ? null : Number(c.adhesionPct), completedPct: c.completedPct == null ? null : Number(c.completedPct),
          collectivePct: c.collectivePct == null ? null : Number(c.collectivePct), goalReached: !!c.goalReached,
        })),
      }
    },
    async adminListPlans(): Promise<AddonPlan[]> {
      const { data, error } = await sb.from('addon_plans').select('*').order('loops_multiplier')
      if (error) throw error
      return ((data ?? []) as any[]).map((p) => ({
        id: p.id, name: p.name, multiplier: Number(p.loops_multiplier), companyChallenges: !!p.allows_company_challenges,
        companyBenefits: !!p.allows_company_benefits, tagFilter: !!p.allows_tag_filter, active: !!p.active,
      }))
    },
    async adminSavePlan(p: AddonPlan): Promise<void> {
      const { error } = await sb.from('addon_plans').upsert({
        id: p.id, name: p.name, loops_multiplier: p.multiplier, allows_company_challenges: p.companyChallenges,
        allows_company_benefits: p.companyBenefits, allows_tag_filter: p.tagFilter, active: p.active,
      })
      if (error) throw error
    },
    async adminListSubscriptions(): Promise<CompanySubscription[]> {
      const { data, error } = await sb.from('company_addon_subscriptions').select('*, companies(name)').order('starts_at', { ascending: false })
      if (error) throw error
      return ((data ?? []) as any[]).map((s) => ({
        id: s.id, companyId: s.company_id, companyName: s.companies?.name ?? s.company_id, planId: s.plan_id,
        startsAt: toMs(s.starts_at), endsAt: s.ends_at ? toMs(s.ends_at) : null, status: s.status,
      }))
    },
    async adminListAchievementDefs(): Promise<(AchievementDef & { id: string })[]> {
      const { data, error } = await sb.from('achievement_definitions').select('*').order('sort_order')
      if (error) throw error
      return ((data ?? []) as any[]).map((d) => ({
        id: d.id, slug: d.slug, kind: d.kind, scope: d.scope, metric: d.metric, threshold: Number(d.threshold), period: d.period,
        tier: d.tier, icon: d.icon, bonusLoopsCenti: d.bonus_loops_centi, active: !!d.active, sortOrder: d.sort_order,
      }))
    },
    async adminSaveAchievementDef(d: AchievementDef & { id: string }): Promise<void> {
      const { error } = await sb.from('achievement_definitions')
        .update({ threshold: d.threshold, bonus_loops_centi: d.bonusLoopsCenti, active: d.active }).eq('id', d.id)
      if (error) throw error
    },
    async adminEvaluateAchievements(): Promise<number> {
      const { data, error } = await sb.rpc('admin_evaluate_achievements')
      if (error) throw error
      return Number(data ?? 0)
    },
    async adminGamificationReport(from: string, to: string): Promise<GamificationReport> {
      const { data, error } = await sb.rpc('admin_gamification_report', { p_from: from, p_to: to })
      if (error) throw error
      const r = data as any
      return {
        from: r.from, to: r.to, pointsIssued: Number(r.pointsIssued ?? 0),
        loopsBySource: ((r.loopsBySource ?? []) as any[]).map((x) => ({ entryType: x.entryType, fundingSource: x.fundingSource, centi: Number(x.centi), entries: Number(x.entries) })),
        redemptionsByBenefit: ((r.redemptionsByBenefit ?? []) as any[]).map((x) => ({ benefitId: x.benefitId, title: x.title, companyId: x.companyId ?? null, redemptions: Number(x.redemptions ?? 0), refunded: Number(x.refunded ?? 0), loopsCenti: Number(x.loopsCenti ?? 0) })),
        multiplierByCompanyMonth: ((r.multiplierByCompanyMonth ?? []) as any[]).map((x) => ({ companyId: x.companyId, companyName: x.companyName, month: x.month, loopsCenti: Number(x.loopsCenti), people: Number(x.people) })),
        challengeResults: ((r.challengeResults ?? []) as any[]).map((x) => ({ id: x.id, title: x.title, companyId: x.companyId ?? null, status: x.status, startsAt: toMs(x.startsAt), endsAt: toMs(x.endsAt), participants: Number(x.participants), completed: Number(x.completed), rewarded: Number(x.rewarded), bonusCenti: Number(x.bonusCenti) })),
      }
    },
    async adminSetCompanyPlan(companyId: string, planId: string | null): Promise<void> {
      const { error } = await sb.rpc('admin_set_company_plan', { p_company: companyId, p_plan: planId })
      if (error) throw error
    },
    async saveEconomySettings(next: EconomySettings): Promise<void> {
      // RLS: admin only; the schema refuses hr_min_cohort below 25 (SPN-02)
      const { error } = await sb.from('economy_settings').update({
        points_per_minute: next.pointsPerMinute,
        points_per_completed_session: next.pointsPerCompletedSession,
        daily_minutes_cap: next.dailyMinutesCap,
        daily_completion_bonus_cap: next.dailyCompletionBonusCap,
        loops_per_point: next.loopsPerPoint,
        min_contribution_points: next.minContributionPoints,
        count_clinical_sessions: next.countClinicalSessions,
        loops_expiry_months: next.loopsExpiryMonths,
        geo_min_active_users: next.geoMinActiveUsers,
        hr_min_cohort: next.hrMinCohort,
        max_backdate_hours: next.maxBackdateHours,
        updated_at: new Date().toISOString(),
        updated_by: await profileId(),
      }).eq('id', true)
      if (error) throw error
    },
  }
}
