/* ============================================================================
   Good Loop — legal records: the rows behind the framework

   Domain shapes for what supabase/11-legal-framework.sql stores. Nothing in
   here is clinical; it is who accepted what, when, what they consented to,
   what they asked us for, and what the professional attested. The mock and
   the Supabase provider both produce these.
   ============================================================================ */

import type { Market } from './messages'

/* --- the person ---------------------------------------------------------- */

export interface LegalProfile {
  id: string
  name: string
  email: string
  /** ISO date (YYYY-MM-DD) or null when the account predates the gate. */
  birthDate: string | null
  /** ISO 3166-1 alpha-2, or null. */
  country: string | null
  market: Market | null
  personalEmail: string | null
  locale: string | null
  companyId: string | null
  /** The fields the sponsor supplied about the person (SET-7 / ONB-08).
      Today a company code links the account, so the sponsor supplied nothing
      but the code; the list is here so the screen prints the truth. */
  sponsorFields: string[]
}

export interface ProfilePatch {
  name?: string
  personalEmail?: string | null
  country?: string
  birthDate?: string
  locale?: string
}

/* --- acceptances and consents ------------------------------------------- */

/** What an acceptance row is FOR. The doc ids of the corpus, plus the
    affirmative acts that are not documents. */
export type AcceptanceDoc =
  | 'terms'          // ONB-3.1 — Terms + incorporated notices, versioned
  | 'crisis-ack'     // ONB-2.2 — "not for emergencies", logged separately
  | 'BKG-1'          // first-booking professional-service acknowledgement
  | 'professional'   // Professional Terms (M2R-05)
  | 'D-09'           // sponsor console first-login acknowledgement (SPN-07)
  | 'renewal'        // CHK-2 — separate auto-renewal consent (PAY-02)

export interface Acceptance {
  id: string
  profileId: string
  docId: AcceptanceDoc | string
  version: string
  locale: string
  channel: string
  acceptedAt: number
}

/** The optional purposes a person may switch on and off, one toggle each,
    none pre-ticked (LEG-04, LEG-05). 'usage' is NOT here: the account and
    session data are processed on the contract, not on consent, and calling
    that a consent would be the bundling the register forbids. */
export type ConsentPurpose =
  | 'measurement'      // wellbeing check-ins (weekly / monthly self-report)
  | 'aggregate'        // inclusion in aggregate programme figures for a sponsor
  | 'notifications'    // reminders on the device / by e-mail
  | 'therapist_bridge' // a linked professional may see self-use history
  | 'marketing'        // product news
  | 'testimonial'      // an account of the person's experience may be published
  | 'research'         // de-identified use in research about the methodology

export const CONSENT_PURPOSES: ConsentPurpose[] = [
  'measurement', 'aggregate', 'notifications', 'therapist_bridge', 'marketing', 'testimonial', 'research',
]

export interface ConsentEvent {
  id: string
  profileId: string
  purpose: ConsentPurpose
  granted: boolean
  wording: string
  locale: string
  channel: string
  at: number
}

/** The current state: latest event per purpose; absent = never answered,
    which the screens treat as "no". */
export function consentState(events: ConsentEvent[]): Partial<Record<ConsentPurpose, ConsentEvent>> {
  const out: Partial<Record<ConsentPurpose, ConsentEvent>> = {}
  for (const e of [...events].sort((a, b) => a.at - b.at)) out[e.purpose] = e
  return out
}

export function hasConsent(events: ConsentEvent[], purpose: ConsentPurpose): boolean {
  return consentState(events)[purpose]?.granted === true
}

/* --- data-subject requests ---------------------------------------------- */

export type DataRequestKind = 'access' | 'portability' | 'rectification' | 'deletion'
export type DataRequestStatus = 'open' | 'verified' | 'delivered' | 'closed' | 'refused'

export interface DataRequest {
  id: string
  profileId: string
  /** Denormalised for the admin queue, which must not join profiles to read
      a name. */
  requester?: { name: string; email: string }
  kind: DataRequestKind
  market: Market | null
  status: DataRequestStatus
  note?: string
  receivedAt: number
  dueAt: number
  verifiedAt?: number
  deliveredAt?: number
  handledBy?: string
  outcome?: string
}

/* --- reports: notice-and-action and complaints -------------------------- */

export type ReportKind = 'content' | 'complaint'
export type ReportStatus = 'received' | 'acknowledged' | 'assessing' | 'actioned' | 'dismissed' | 'closed'

export interface Report {
  id: string
  kind: ReportKind
  reporterId?: string
  reporterEmail?: string
  subject: string
  location?: string
  reason: string
  status: ReportStatus
  receivedAt: number
  acknowledgedAt?: number
  decidedAt?: number
  decidedBy?: string
  decision?: string
}

/* --- legal text versions ------------------------------------------------ */

export interface LegalVersion {
  id: string
  docId: string
  version: string
  locale: string
  inForceFrom: string   // ISO date
  inForceTo: string | null
  changelog?: string
  createdAt: number
  createdBy?: string
}

/* --- the professional --------------------------------------------------- */

/** The eight items P3.2 requires an informed-consent form to cover. A
    template cannot be published with any of them empty (M2R-06). */
export const CONSENT_TEMPLATE_ITEMS = [
  'nature',        // the nature and purpose of the intervention
  'remote',        // that it is delivered at a distance and what that means
  'medium',        // the limits of the medium and what happens if the connection fails
  'confidentiality', // confidentiality and its limits
  'records',       // how records are kept, where, for how long and who may access them
  'risk',          // the arrangements if the person is at risk
  'fees',          // fees and cancellation
  'alternatives',  // the alternatives to remote work
] as const
export type ConsentTemplateItem = typeof CONSENT_TEMPLATE_ITEMS[number]

export interface InformedConsentTemplate {
  version: number
  items: Record<ConsentTemplateItem, string>
  updatedAt: number
}

export function consentTemplateComplete(t: InformedConsentTemplate | null | undefined): boolean {
  if (!t) return false
  return CONSENT_TEMPLATE_ITEMS.every((k) => (t.items[k] ?? '').trim().length > 0)
}

export interface ProfessionalRecord {
  id: string
  registration: string
  registry: 'CRP' | 'Ordine' | null
  registryRegion: string | null
  status: 'pending' | 'approved' | 'rejected' | 'more_info'
  verifiedAt: number | null
  practiceCountry: string | null
  attestedAt: number | null
  insuranceExpiresAt: string | null
  insuranceDoc: string | null
  termsVersion: string | null
  termsAcceptedAt: number | null
  consentTemplate: InformedConsentTemplate | null
}

export interface ProfessionalPatch {
  registry?: 'CRP' | 'Ordine'
  registryRegion?: string
  practiceCountry?: string
  attestedAt?: number
  insuranceExpiresAt?: string | null
  insuranceDoc?: string | null
  termsVersion?: string
  termsAcceptedAt?: number
  consentTemplate?: InformedConsentTemplate
}

/** The card a patient reads about a professional they can book (PRF-1). */
export interface ProfessionalCard {
  id: string
  name: string
  registration: string
  registry: 'CRP' | 'Ordine' | null
  registryRegion: string | null
  verifiedAt: number | null
  consentTemplate: InformedConsentTemplate | null
}

export interface PatientInformedConsent {
  id: string
  therapistId: string
  templateVersion: number
  acceptedAt: number
}

/* --- the sponsor -------------------------------------------------------- */

/** The only figures a sponsor ever receives (D-08, SPN-01..04): programme
    totals, each suppressed below the cohort threshold. No categories, no
    professionally-guided split, no rows. */
export interface SponsorTotals {
  companyId: string
  minCohort: number
  eligible: number
  registered: number | null
  active30d: number | null
  sessions30d: number | null
}
