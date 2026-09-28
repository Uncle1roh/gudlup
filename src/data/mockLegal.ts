/* ============================================================================
   Good Loop — the legal framework's DEMO store

   What supabase/11-legal-framework.sql keeps in Postgres, kept here in
   localStorage for the demo (no Supabase env) so that a walkthrough behaves
   like the product: the Terms are asked once, a withdrawn consent stays
   withdrawn after a reload, a data request shows up in the admin queue. One
   demo person, one store. Nothing here is read by the live provider.
   ============================================================================ */

import type {
  LegalProfile, Acceptance, ConsentEvent, DataRequest, Report, LegalVersion,
  ProfessionalRecord, PatientInformedConsent,
} from '../legal/records'
import { DEFAULT_CRISIS, DSR_DAYS, type CrisisResource } from '../legal/market'
import { LEGAL_VERSION } from '../legal/types'

const KEY = 'gl.mock.legal'

export interface MockLegalState {
  profile: LegalProfile
  acceptances: Acceptance[]
  consents: ConsentEvent[]
  dataRequests: DataRequest[]
  reports: Report[]
  versions: LegalVersion[]
  crisis: CrisisResource[]
  professional: ProfessionalRecord
  informedConsents: PatientInformedConsent[]
  locations: Record<string, string>
  /** Set by the sponsor-console acknowledgement in demo mode. */
  seq: number
}

const DAY = 86_400_000

function fresh(): MockLegalState {
  const today = new Date().toISOString().slice(0, 10)
  return {
    profile: {
      id: 'demo-profile', name: 'Demo', email: 'demo@goodloop.app',
      birthDate: null, country: null, market: null, personalEmail: null, locale: null,
      companyId: null, sponsorFields: ['company code'],
    },
    acceptances: [],
    consents: [],
    dataRequests: [],
    reports: [],
    versions: [
      { id: 'v-terms', docId: 'terms', version: LEGAL_VERSION, locale: 'en', inForceFrom: today, inForceTo: null, changelog: 'v5 Path A — first draft for counsel', createdAt: Date.now() },
      { id: 'v-notices', docId: 'notices', version: LEGAL_VERSION, locale: 'en', inForceFrom: today, inForceTo: null, changelog: 'D-01 to D-17, v5 Path A', createdAt: Date.now() },
    ],
    crisis: DEFAULT_CRISIS.map((c) => ({ ...c })),
    professional: {
      id: 'th-demo', registration: 'CRP 04/45821', registry: 'CRP', registryRegion: '04', status: 'approved',
      verifiedAt: Date.now() - 40 * DAY, practiceCountry: null, attestedAt: null, insuranceExpiresAt: null,
      insuranceDoc: null, termsVersion: null, termsAcceptedAt: null, consentTemplate: null,
    },
    informedConsents: [],
    locations: {},
    seq: 0,
  }
}

let cache: MockLegalState | null = null

export function loadMockLegal(): MockLegalState {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Partial<MockLegalState>
      cache = { ...fresh(), ...saved, profile: { ...fresh().profile, ...(saved.profile ?? {}) } }
      return cache
    }
  } catch { /* storage unavailable */ }
  cache = fresh()
  return cache
}

export function saveMockLegal(next: MockLegalState): void {
  cache = next
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* storage unavailable */ }
}

export function mutateMockLegal(fn: (s: MockLegalState) => void): MockLegalState {
  const s = { ...loadMockLegal() }
  fn(s)
  saveMockLegal(s)
  return s
}

export function nextMockLegalId(prefix: string): string {
  const s = mutateMockLegal((x) => { x.seq += 1 })
  return `${prefix}-${s.seq}`
}

/** Demo sign-up: what the person told us at the door. */
export function stashMockLegalProfile(patch: Partial<LegalProfile>): void {
  mutateMockLegal((s) => { s.profile = { ...s.profile, ...patch } })
}

/** Demo account deletion: the person's rows go; the configuration stays. */
export function wipeMockLegalPerson(): void {
  const s = loadMockLegal()
  saveMockLegal({ ...fresh(), versions: s.versions, crisis: s.crisis, reports: s.reports.filter((r) => r.reporterId !== s.profile.id) })
}

export function dueAtFrom(receivedAt: number): number {
  return receivedAt + DSR_DAYS * DAY
}
