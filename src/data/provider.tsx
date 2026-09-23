import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { SessionRecord } from '../types/domain'
import type { Patient, Therapist, B2bSession } from '../b2b/data'
import type { CatalogProtocol } from './catalog'
import type { ExploreRail } from './rails'

/** One therapist on a company's list. Nothing clinical, by construction. */
export interface CompanyTherapist {
  id: string
  name: string
  crp: string
  /** The credential state a reviewer left on them. */
  status: 'pending' | 'approved' | 'rejected' | 'more_info'
  addedAt: number
}

export interface TherapistActivationCode {
  code: string
  companyId: string
  createdAt: number
  createdBy?: string
  usedBy?: string
  usedByName?: string
  usedAt?: number
  revokedAt?: number
}

export type RedeemResult =
  | { ok: true; companyId: string }
  | { ok: false; reason: 'unknown' | 'revoked' | 'already-used' | 'not-a-therapist' }
import type { Plan, PlanItem } from './plan'
import type { TherapistLink, TherapistCode } from './link'
import type { Company, AdminUser, UserRole, CredentialRequest, CredentialDecision, AuditEvent } from '../admin/types'
import type { CredentialDoc } from '../b2b/credentials'
import type { Nr1Report } from '../employer/types'
import type { PsychosocialResponse } from '../employer/assessment'
import { createMockProvider } from './mock'
import { previewing } from '../admin/preview'
import { registerProtocols } from './protocols'

/**
 * The data-access seam. Every screen reads/writes through this interface — never
 * by importing seed data directly. It's backed by an in-memory mock by default;
 * when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set, DataLayerProvider
 * swaps in the Supabase-backed provider with no UI changes.
 *
 * All methods are async on purpose: the contract already matches a real network
 * backend, so the screens' loading handling is correct from day one.
 */
export interface SessionRequest {
  id: string
  requesterName: string
  requesterEmail?: string
  company?: string
  note?: string
  status: 'open' | 'claimed'
  createdAt: number
}

export interface DataProvider {
  // --- B2C ---
  listSessions(): Promise<SessionRecord[]>
  recordSession(rec: SessionRecord): Promise<void>
  /** The pathway the signed-in person's therapist wrote for them, or null when
      nobody has written one — the app never composes one by itself. */
  getMyPlan(): Promise<Plan | null>
  /** Tick off a plan session the person just finished. */
  markPlanItemDone(itemId: string): Promise<void>
  // --- B2B ---
  getTherapist(): Promise<Therapist>
  /**
   * Submit (or re-submit) the registration number and its documents.
   *
   * Always returns the account to `pending`: this is an application for
   * review, and there is no argument to it that can approve anybody. Editing
   * an already-approved record therefore re-opens the review, which is the
   * honest consequence of changing the thing that was reviewed.
   */
  submitCredentials(crp: string, documents: CredentialDoc[]): Promise<void>
  listPatients(): Promise<Patient[]>
  /** B2C→therapist intake queue. */
  requestSession(note?: string): Promise<void>
  getMySessionRequest(): Promise<SessionRequest | null>
  listSessionRequests(): Promise<SessionRequest[]>
  /** Accept an open request: creates the linked patient, returns its id. */
  acceptSessionRequest(requestId: string): Promise<string>
  /** Create a patient owned by the signed-in therapist; returns the new id. */
  createPatient(name: string): Promise<string>
  getPatient(id: string): Promise<Patient | undefined>
  recordB2bSession(patientId: string, session: B2bSession): Promise<void>
  updatePatient(patientId: string, patch: Partial<Patient>): Promise<void>
  /** The three-month pathway the therapist wrote for a patient. */
  getPlan(patientId: string): Promise<Plan | null>
  /** Replace a patient's pathway wholesale (the editor saves the whole list). */
  savePlan(patientId: string, items: PlanItem[], title?: string): Promise<void>
  /** Clinical diary (therapist-only): one dated entry per note. */
  addPatientNote(patientId: string, text: string): Promise<void>
  updatePatientNote(patientId: string, noteId: string, text: string): Promise<void>
  deletePatientNote(patientId: string, noteId: string): Promise<void>

  /* --- The therapist ↔ patient link, and everything keyed to it -----------

     One `patients` row IS the link: `therapist_id` on one side,
     `b2c_profile_id` on the other. The prescribed pathway and the
     clinical record all hang off it. Before these methods each side kept its
     own copy in its own browser and neither ever reached the other. */

  /**
   * The company code on the signed-in person's own profile.
   *
   * Onboarding asks for it and keeps it in this browser, which is fine until
   * the person signs in somewhere else — or is provisioned server-side, where
   * onboarding never ran. The convention (professional support, the company's
   * own crisis contacts) then silently resolved to nothing.
   */
  getMyCompanyCode(): Promise<string | null>
  /** The signed-in person's therapist, or null when they have none. */
  getMyTherapistLink(): Promise<TherapistLink | null>
  /** Connect to a therapist with the code they gave you. Idempotent. */
  redeemTherapistCode(code: string): Promise<TherapistLink>
  /** Codes this therapist has minted, newest first. */
  listMyTherapistCodes(): Promise<TherapistCode[]>
  /** Mint a new connection code for this therapist. */
  createTherapistCode(label?: string): Promise<TherapistCode>
  /** Retire a code without deleting the patients who used it. */
  deactivateTherapistCode(code: string): Promise<void>

  // --- Protocol catalog (shared, admin-managed) ---
  /** Every protocol in the catalog (enabled + disabled). */
  listProtocols(): Promise<CatalogProtocol[]>
  /** Upsert a protocol by code (used by admin edits and the import pipeline). */
  saveProtocol(p: CatalogProtocol): Promise<void>
  setProtocolEnabled(code: string, enabled: boolean): Promise<void>
  /** Permanently remove a protocol from the catalog (admin cleanup). */
  deleteProtocol(code: string): Promise<void>

  // --- Admin: therapist credentialing queue ---
  listCredentialRequests(): Promise<CredentialRequest[]>
  /** `decidedBy` is the reviewer: recorded with the decision, never inferred
      later from an audit line that may have been pruned. */
  decideCredential(id: string, decision: CredentialDecision, reason?: string, decidedBy?: string): Promise<void>

  /* --- A company's therapists ------------------------------------------
     Who an employee may book is the list their employer put together. A
     therapist joins it by redeeming an activation code; HR never types a
     name, and nothing here joins a therapist to a patient — which employee
     saw whom is not the employer's business and is not in this data. */

  /** The therapists enrolled with a company. Omit the id for "my company". */
  listCompanyTherapists(companyId?: string): Promise<CompanyTherapist[]>
  /** Take a therapist off the list. Their account and their patients stay. */
  removeCompanyTherapist(therapistId: string, companyId?: string): Promise<void>
  /** Activation codes issued for a company, newest first. */
  listCompanyTherapistCodes(companyId?: string): Promise<TherapistActivationCode[]>
  /** Issue one. HR may do this for their own company, an admin for any. */
  createCompanyTherapistCode(companyId?: string, createdBy?: string): Promise<TherapistActivationCode>
  /** Stop a code that has not been used, or a therapist who should not have had it. */
  revokeCompanyTherapistCode(code: string): Promise<void>
  /** The therapist's side: present a code, join a company's list. */
  redeemCompanyTherapistCode(code: string): Promise<RedeemResult>

  // --- The Self Use home rails (admin-managed) ---
  /** Every rail, in order. Empty = the app's built-in rails. */
  listExploreRails(): Promise<ExploreRail[]>
  /** Replace the whole set: what the editor holds IS the shelf. */
  saveExploreRails(rails: ExploreRail[]): Promise<void>

  // --- Admin: companies (tenants) ---
  listCompanies(): Promise<Company[]>
  saveCompany(company: Company): Promise<void>

  // --- Scheduling (patient ↔ therapist) ---
  /** Approved therapists the signed-in employee can book (same company
      first; falls back to all approved in the pilot). */
  listAvailableTherapists(): Promise<import('./scheduling').TherapistListing[]>
  /** A therapist's weekly availability template. */
  getTherapistAvailability(therapistId: string): Promise<import('./scheduling').WeeklySlot[]>
  /** Booked start times (ms) for a therapist in [fromMs, toMs). */
  listBookedTimes(therapistId: string, fromMs: number, toMs: number): Promise<number[]>
  /** Book a concrete slot; rejects when it was just taken. */
  bookAppointment(therapistId: string, startsAtMs: number): Promise<import('./scheduling').Appointment>
  /** The signed-in patient's upcoming appointment (or null). */
  getMyAppointment(): Promise<import('./scheduling').Appointment | null>
  cancelAppointment(id: string): Promise<void>
  // --- Scheduling (therapist side) ---
  getMyAvailability(): Promise<import('./scheduling').WeeklySlot[]>
  setMyAvailability(slots: import('./scheduling').WeeklySlot[]): Promise<void>
  /** The signed-in therapist's upcoming appointments (soonest first). */
  listMyAppointments(): Promise<import('./scheduling').Appointment[]>
  /** Find (or create) the roster patient linked to an appointment's B2C
      profile — used by the "start session" notice; the session flow itself
      is the existing one. */
  patientForAppointment(a: import('./scheduling').Appointment): Promise<string>

  // --- My profile picture (all roles) ---
  /** Public URL of the signed-in user's avatar, or null when unset. */
  getMyAvatarUrl(): Promise<string | null>
  /** Upload/replace the signed-in user's avatar (pre-cropped JPEG blob).
      Returns the new public URL. */
  setMyAvatar(blob: Blob): Promise<string>

  // --- Admin: users & roles ---
  listAdminUsers(): Promise<AdminUser[]>
  setUserRole(id: string, role: UserRole): Promise<void>
  setUserActive(id: string, active: boolean): Promise<void>

  // --- Admin: audit trail (append-only) ---
  listAuditEvents(): Promise<AuditEvent[]>
  logAudit(event: Omit<AuditEvent, 'id' | 'at'>): Promise<void>

  // --- Employer: NR-1 psychosocial aggregates (aggregates only, scoped to the
  //     caller's company; contains no individual records by construction) ---
  getPsychosocialAggregates(): Promise<Nr1Report>
  /** Record one employee's periodic psychosocial assessment (feeds the aggregates). */
  submitPsychosocialAssessment(response: PsychosocialResponse): Promise<void>
}

const DataCtx = createContext<DataProvider | null>(null)

const SB_URL = import.meta.env.VITE_SUPABASE_URL
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const USE_SUPABASE = Boolean(SB_URL && SB_KEY)

/**
 * Wrap the app once; the single provider instance lives here.
 * - No Supabase env → mock provider immediately (the Supabase module is never
 *   even loaded, so the app behaves exactly as before).
 * - Supabase env present → dynamically import and use the real provider.
 */
export function DataLayerProvider({ children }: { children: ReactNode }) {
  /* An admin walking sales through the other apps runs on the DEMO fixtures,
     never on the live database — so the walkthrough shows populated screens,
     writes nothing anybody can lose, and reads nobody's clinical record. The
     flag is per tab and only an admin can set it; see src/admin/preview.ts. */
  const demo = !USE_SUPABASE || previewing()
  const [provider, setProvider] = useState<DataProvider | null>(() => (demo ? createMockProvider() : null))

  /* ---- a preview reads the REAL catalogue ---------------------------------

     The split is between the PRODUCT and the PEOPLE.

     The catalogue is the product: the published protocols, their covers, the
     rendered audio, the library shelves. None of it is personal, all of it is
     what a customer is being shown, and the fixtures have no audio at all —
     so a walkthrough on fixtures plays the placeholder bed and shows drawn
     motifs instead of the real artwork. That is a demo of the wrong product.

     The people stay fictional: patients, appointments, rosters, companies,
     clinical records. Nothing here reads them and nothing here writes
     anywhere — only two READ methods are taken from the live provider, and
     every write in a preview still lands in memory and dies with the tab. */
  const wantsLiveCatalog = USE_SUPABASE && previewing()
  const [catalogLive, setCatalogLive] = useState(false)
  useEffect(() => {
    if (!wantsLiveCatalog || catalogLive) return
    let active = true
    void import('./supabase')
      .then(({ createSupabaseProvider }) => {
        if (!active) return
        const live = createSupabaseProvider(SB_URL as string, SB_KEY as string)
        setProvider((p) => (p ? { ...p, listProtocols: () => live.listProtocols(), listExploreRails: () => live.listExploreRails() } : p))
        setCatalogLive(true)
      })
      .catch(() => {
        /* No reachable backend: the walkthrough keeps the fixtures, which is
           the old behaviour rather than an empty library. */
        if (active) setCatalogLive(true)
      })
    return () => { active = false }
  }, [wantsLiveCatalog, catalogLive])

  useEffect(() => {
    if (provider) return
    let active = true
    import('./supabase')
      .then(({ createSupabaseProvider }) => {
        if (active) setProvider(createSupabaseProvider(SB_URL as string, SB_KEY as string))
      })
      .catch((e) => {
        console.error('Supabase init failed; falling back to mock data.', e)
        if (active) setProvider(createMockProvider())
      })
    return () => {
      active = false
    }
  }, [provider])

  // Hydrate the runtime protocol registry from the catalog, so protocols that
  // were imported in an earlier session (persistent backends) resolve via
  // getProtocol() everywhere — sessions, debriefs, reports, the B2C player.
  useEffect(() => {
    if (!provider) return
    provider
      .listProtocols()
      .then((list) => registerProtocols(list.filter((p) => p.enabled)))
      .catch(() => { /* registry keeps the static seeds */ })
  }, [provider])

  if (!provider) {
    return (
      <div className="loading">
        <span className="loading__spin" aria-hidden="true" />
        <span>Connecting…</span>
      </div>
    )
  }
  return <DataCtx.Provider value={provider}>{children}</DataCtx.Provider>
}

export function useDataProvider(): DataProvider {
  const p = useContext(DataCtx)
  if (!p) throw new Error('useDataProvider must be used inside <DataLayerProvider>')
  return p
}
