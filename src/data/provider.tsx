import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { SessionRecord } from '../types/domain'
import type { Patient, Therapist, B2bSession } from '../b2b/data'
import type { CatalogProtocol } from './catalog'
import type { Company, AdminUser, UserRole, CredentialRequest, CredentialDecision, AuditEvent } from '../admin/types'
import type { Nr1Report } from '../employer/types'
import type { PsychosocialResponse } from '../employer/assessment'
import { createMockProvider } from './mock'
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
  // --- B2B ---
  getTherapist(): Promise<Therapist>
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

  // --- Protocol catalog (shared, admin-managed) ---
  /** Every protocol in the catalog (enabled + disabled). */
  listProtocols(): Promise<CatalogProtocol[]>
  /** Upsert a protocol by code (used by admin edits and the import pipeline). */
  saveProtocol(p: CatalogProtocol): Promise<void>
  setProtocolEnabled(code: string, enabled: boolean): Promise<void>

  // --- Admin: therapist credentialing queue ---
  listCredentialRequests(): Promise<CredentialRequest[]>
  decideCredential(id: string, decision: CredentialDecision, reason?: string): Promise<void>

  // --- Admin: companies (tenants) ---
  listCompanies(): Promise<Company[]>
  saveCompany(company: Company): Promise<void>

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
  const [provider, setProvider] = useState<DataProvider | null>(() => (USE_SUPABASE ? null : createMockProvider()))

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
