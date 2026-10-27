import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { EconomySettings, LoopsEntry, Wallet } from '../gamification/economy'
import type { AchievementDef, AchievementView, CollectiveProgress, RankingPart } from '../gamification/achievements'
import type { CityCard, GeoRanking, GeoScope, Municipality } from '../gamification/geo'
import type { Benefit, BenefitTag, BenefitView, RedeemResult as BenefitRedeemResult, Redemption } from '../gamification/benefits'
import type { Challenge, ChallengeAdminRow, ChallengeScope, ChallengeView } from '../gamification/challenges'
import type {
  AddonDashboard, AddonInfo, AddonPlan, ChallengeTemplate, CompanyBenefitRow, CompanyChallengeDraft,
  CompanySubscription, IdentifiedRedemption, TagFilterRow,
} from '../gamification/company'
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

/** One address an employer has approved. Nothing about an ACCOUNT is here —
    not whether one exists, not what it did. HR keeps the list; the app reads
    it only to decide whether the company code opens anything for a person. */
export interface CompanyMember {
  /** Folded to lower case: an address is the same person however it was typed. */
  email: string
  name?: string
  /** The employer's own reference — badge number, payroll id. Never read by us. */
  employeeRef?: string
  enabled: boolean
  addedAt: number
  addedBy?: string
  disabledAt?: number
}

export interface CompanyMemberDraft {
  email: string
  name?: string
  employeeRef?: string
}

/** One emotional check-in (docs/ui-redesign/checkin-emocional-spec.docx).
    Health data: it goes nowhere near an employer, and nothing is written
    without the measurement consent — the database enforces both. */
export interface MoodCheckinRow {
  id?: string
  at: number
  context: 'pre_session' | 'post_session' | 'standalone'
  /** Ties the before and the after of one session. Minted by the app. */
  sessionId?: string
  protocolCode?: string
  /** −1 … +1, two decimals. */
  valence: number
  arousal: number
  /** The word they chose; null when they skipped it. */
  labelId: string | null
  locale: string
  colorOklch: string
  variant: 'color' | 'no_color'
}

/** What a company code does for ONE address.
    `no-roster` — the company approves nobody in particular, so the code alone
    is the gate, which is how every tenant worked before the list existed. */
export type CompanyEmailStatus = 'ok' | 'no-roster' | 'no-company' | 'denied'
import type { Plan, PlanItem } from './plan'
import type { PromoCode } from './promo'
import type { PartnerProduct } from './partners'
import type { TherapistLink, TherapistCode } from './link'
import type { Company, AdminUser, UserRole, CredentialRequest, CredentialDecision, AuditEvent } from '../admin/types'
import type { CredentialDoc } from '../b2b/credentials'
import type { Nr1Report } from '../employer/types'
import type { PsychosocialResponse } from '../employer/assessment'
import type { AssessmentRecord } from './assessments'
import type {
  LegalProfile, ProfilePatch, Acceptance, AcceptanceDoc, ConsentEvent, ConsentPurpose,
  DataRequest, DataRequestKind, Report, ReportKind, LegalVersion,
  ProfessionalRecord, ProfessionalPatch, ProfessionalCard, InformedConsentTemplate,
  PatientInformedConsent, SponsorTotals,
} from '../legal/records'
import type { CrisisResource } from '../legal/market'
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
  /** How the audio should address the signed-in person, or null if unasked.
      It chooses a recording; it is not an identity field and nothing else
      reads it. */
  getMyAddressedAs(): Promise<'m' | 'f' | null>
  setMyAddressedAs(to: 'm' | 'f'): Promise<void>
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
  /** Every protocol in the catalog (enabled + disabled).

      This is an EXPENSIVE read: a protocol carries its timelines and its
      Studio sessions for three time signatures and four variants, so the
      whole catalog is megabytes of jsonb. Use it for a list; never to look
      one protocol up by code — that is what `findProtocol` is for. */
  listProtocols(): Promise<CatalogProtocol[]>
  /** ONE protocol by code, or undefined. */
  findProtocol(code: string): Promise<CatalogProtocol | undefined>
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

  /* --- A company's approved addresses ----------------------------------
     The second gate. A code says which company; this says who inside it may
     use the code — so a code that leaks enrols nobody, and somebody who
     leaves loses the convention without the whole company being reissued.
     A company with an EMPTY list keeps the code-only behaviour it has had
     all along: building the list is what arms the gate. */

  /** The addresses a company approves, in alphabetical order. */
  listCompanyMembers(companyId?: string): Promise<CompanyMember[]>
  /** Add or update rows — one typed in, or a few hundred from a spreadsheet.
      An address already on the list keeps its enabled flag. Returns how many
      rows the list took. */
  addCompanyMembers(rows: CompanyMemberDraft[], companyId?: string): Promise<number>
  /** Turn one address on or off. OFF also unlinks the live account that has
      it, the same second: that is what cancelling access has to mean. */
  setCompanyMemberAccess(email: string, enabled: boolean, companyId?: string): Promise<void>
  /** Off the list entirely — same consequence as disabling, and the row goes. */
  removeCompanyMember(email: string, companyId?: string): Promise<void>
  /** How many accounts hold the company code without being on the list. A
      count and nothing else: no addresses, no names, nothing they did. */
  countUnlistedMembers(companyId?: string): Promise<number>
  /** Disconnect every one of them. Returns how many lost the convention. */
  revokeUnlistedMembers(companyId?: string): Promise<number>
  /* --- The emotional check-in ------------------------------------------
     Ten seconds before and after a session, and whenever a person wants it.
     The rows are theirs: no employer path, no therapist path, and no write
     at all without the measurement consent. */

  /** Store one. Refused by the database when consent is off — the caller
      checks first and keeps the colour either way. */
  recordMoodCheckin(row: MoodCheckinRow): Promise<void>
  /** This person's own check-ins, newest first. */
  listMyMoodCheckins(limit?: number): Promise<MoodCheckinRow[]>

  /** Asked at the door, BEFORE the account exists: does this code open
      anything for this address? Never says whether an address is unknown or
      turned off — both are `denied` — so a code cannot be used to read an
      employer's list back out one guess at a time. */
  checkCompanyEmail(companyCode: string, email: string): Promise<CompanyEmailStatus>

  // --- The Self Use home rails (admin-managed) ---
  /** Every rail, in order. Empty = the app's built-in rails. */
  listExploreRails(): Promise<ExploreRail[]>
  /** Replace the whole set: what the editor holds IS the shelf. */
  saveExploreRails(rails: ExploreRail[]): Promise<void>
  /**
   * The most-listened protocol CODES, ranked, newest 90 days.
   *
   * Codes only — no counts and no profiles leave the database, and a
   * protocol has to clear a five-listener floor before it is named at all
   * (`top_sessions` in supabase/setup.sql). An empty list is the normal
   * answer on a young install and means "no shelf", not "failed".
   */
  topSessions(limit?: number): Promise<string[]>

  // --- Admin: companies (tenants) ---
  listCompanies(): Promise<Company[]>
  saveCompany(company: Company): Promise<void>

  // --- Admin: promo codes ---
  listPromoCodes(): Promise<PromoCode[]>
  /** Rejects when the code already exists. */
  createPromoCode(code: string, discountPct: number, createdBy?: string): Promise<void>
  /** Accounts already registered with it keep their discount. */
  deletePromoCode(code: string): Promise<void>
  /** What a code is worth (percent), or null when unknown. Works signed out:
      the registration form asks it before the account exists. */
  checkPromoCode(code: string): Promise<number | null>

  // --- Partner products (admin-managed catalogue, shown on the Partner tab) ---
  /** Every offer the caller may read: all of them for an admin, the active
      ones for anyone else. */
  listPartnerProducts(): Promise<PartnerProduct[]>
  /** Upsert. An empty id creates a new offer; returns the stored id. */
  savePartnerProduct(p: PartnerProduct): Promise<string>
  deletePartnerProduct(id: string): Promise<void>

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

  // --- Clinical assessments (DASS-21, CBI, the session VAS) ---------------
  // These are the records a therapist reads a score from, and they may be
  // used to show efficacy, so they are append-only: the database refuses to
  // modify or delete one that has been completed. Scoped by row-level
  // security to the person they are about and to their therapist.
  /** Every assessment the signed-in person may see. */
  listAssessments(): Promise<AssessmentRecord[]>
  /** Create or update the given records. A completed one is refused. */
  saveAssessments(records: AssessmentRecord[]): Promise<void>

  // --- Legal framework (src/legal) ---------------------------------------
  //     Who the person is for legal purposes, what they accepted, what they
  //     consented to, what they asked us for. See supabase/11-legal-framework.sql.
  /** The signed-in person's legal profile. Rejects when nobody is signed in. */
  getMyLegalProfile(): Promise<LegalProfile>
  /** Rectification (DAT-07): name, personal e-mail, country, locale. */
  updateMyProfile(patch: ProfilePatch): Promise<void>
  /** One affirmative act, versioned and timestamped (LEG-01). Append-only. */
  recordAcceptance(a: { docId: AcceptanceDoc | string; version: string; locale: string; channel?: string }): Promise<void>
  listMyAcceptances(): Promise<Acceptance[]>
  /** One grant or withdrawal, with the wording the person saw (LEG-04). */
  recordConsent(c: { purpose: ConsentPurpose; granted: boolean; wording: string; locale: string; channel?: string }): Promise<void>
  /** The full history, oldest first. */
  listMyConsents(): Promise<ConsentEvent[]>
  /** Files a data-subject request; the 15-day clock starts now (DAT-01). */
  createDataRequest(kind: DataRequestKind, note?: string): Promise<DataRequest>
  listMyDataRequests(): Promise<DataRequest[]>
  /** Deletes the person's own rows and login; retains only what the law
      requires (DAT-06). The caller signs out afterwards. */
  deleteMyAccount(): Promise<void>
  /** Files a content report or a complaint (Terms cl. 9 / cl. 19). */
  createReport(r: { kind: ReportKind; subject: string; location?: string; reason: string }): Promise<Report>
  /** Crisis numbers for a market, as configured (CRS-03). Works signed out. */
  listCrisisResources(): Promise<CrisisResource[]>
  /** The version register (ADM-06 / LEG-07). Works signed out. */
  listLegalVersions(): Promise<LegalVersion[]>

  // --- Legal framework: admin ---
  listDataRequests(): Promise<DataRequest[]>
  updateDataRequest(id: string, patch: Partial<Pick<DataRequest, 'status' | 'verifiedAt' | 'deliveredAt' | 'handledBy' | 'outcome'>>): Promise<void>
  listReports(): Promise<Report[]>
  updateReport(id: string, patch: Partial<Pick<Report, 'status' | 'acknowledgedAt' | 'decidedAt' | 'decidedBy' | 'decision'>>): Promise<void>
  saveLegalVersion(v: Omit<LegalVersion, 'id' | 'createdAt'>): Promise<void>
  saveCrisisResource(r: CrisisResource): Promise<void>
  deleteCrisisResource(id: string): Promise<void>
  /** ADM-07: one person's acceptance and consent history. */
  listUserLegalRecords(profileId: string): Promise<{ acceptances: Acceptance[]; consents: ConsentEvent[] }>
  /** ONB-02 / D-11: suspend and delete a person found to be under 18. */
  adminDeleteProfile(profileId: string): Promise<void>

  // --- Legal framework: the professional ---
  getMyProfessionalRecord(): Promise<ProfessionalRecord>
  updateMyProfessionalRecord(patch: ProfessionalPatch): Promise<void>
  /** The card a patient reads about a professional (PRF-1). */
  getProfessionalCard(therapistId: string): Promise<ProfessionalCard | null>
  /** M2P-04: accept the professional's informed-consent form, by version. */
  acceptInformedConsent(therapistId: string, template: InformedConsentTemplate): Promise<void>
  listMyInformedConsents(): Promise<PatientInformedConsent[]>
  /** M2P-06: where the person is, confirmed in the lobby. */
  confirmSessionLocation(appointmentId: string, location: string): Promise<void>

  // --- Legal framework: the sponsor ---
  /** The only figures a sponsor receives: totals, suppressed below the cohort
      threshold, no categories, no professionally-guided split (SPN-01..04). */
  getSponsorTotals(): Promise<SponsorTotals>

  // --- Gamification: the Loops economy (docs/gamification/SPEC.md §2) ---
  /** The signed-in person's wallet. Credits are computed server-side from
      recorded sessions; the client never sends an amount (GAM-R8). */
  getWallet(): Promise<Wallet>
  /** The person's Loops entries, newest first. */
  listLoopsLedger(): Promise<LoopsEntry[]>
  /** The economy settings (Admin › Economia reads and writes them). */
  getEconomySettings(): Promise<EconomySettings>
  /** Admin only. */
  saveEconomySettings(next: EconomySettings): Promise<void>

  // --- Gamification: achievements (SPEC §3) ---
  /** Active definitions (plus any the person unlocked), with their value. */
  listMyAchievements(): Promise<AchievementView[]>
  /** The unlock sheet closed on these. */
  markAchievementsSeen(ids: string[]): Promise<void>
  /** A pathway reached its end; the server evaluates achievements. */
  recordPathwayCompleted(slug: string): Promise<void>
  /** The person's part in every collective achievement, and their unit's progress. */
  getMyCollectiveProgress(): Promise<CollectiveProgress[]>
  /** Rankings › the person's own minutes, this month and since joining. */
  getMyRankingPart(): Promise<RankingPart>

  // --- Gamification: geographic ranks (SPEC §4) ---
  /** The city picker: "Campinas · SP". */
  searchMunicipalities(q: string): Promise<Municipality[]>
  /** The city the person declares; null clears it. The geo_ranking consent
      is recorded separately, through recordConsent. */
  setMyCity(ibgeCode: string | null): Promise<void>
  /** Units above their threshold, ranked by Points per active person —
      returned without Points (PLAN A6). */
  getGeoRankings(scope: GeoScope, period: 'month' | 'all', limit?: number): Promise<GeoRanking>
  getMyCityCard(): Promise<CityCard | null>
  /** Admin: refresh the roll-up and evaluate collective achievements. */
  adminRefreshGeo(): Promise<number>

  // --- Gamification: benefits (SPEC §6) ---
  /** What this person may see now — decided server-side, company filter included. */
  getAvailableBenefits(): Promise<BenefitView[]>
  /** The one way to redeem. Throws RedeemError with the refusal. */
  redeemBenefit(benefitId: string, consentIdentified?: boolean, employeeNumber?: string): Promise<BenefitRedeemResult>
  /** What an identified redemption shares, shown before the person consents. */
  getIdentifiedPreview(): Promise<{ name: string; companyName: string | null }>
  /** "Meus benefícios", codes included. */
  listMyRedemptions(): Promise<Redemption[]>
  listBenefitTags(): Promise<BenefitTag[]>
  /** Admin: the whole catalogue, drafts included. */
  adminListBenefits(): Promise<Benefit[]>
  /** Admin: a benefit and its tags in one step (a Good Loop benefit needs ≥ 1). */
  adminSaveBenefit(b: Benefit): Promise<string>
  adminSaveTag(t: BenefitTag): Promise<void>
  /** Admin: codes from a CSV; returns how many were new. */
  adminUploadCodes(benefitId: string, codes: string[]): Promise<number>
  /** Admin: code counts per benefit — never the codes. */
  adminBenefitCodeCounts(): Promise<Record<string, { total: number; free: number }>>
  adminListRedemptions(): Promise<AdminRedemption[]>
  adminRefundRedemption(redemptionId: string): Promise<void>

  // --- Gamification: challenges (SPEC §5) ---
  /** The challenges this person is in scope for, with their own part only. */
  listMyChallenges(): Promise<ChallengeView[]>
  adminListChallenges(): Promise<ChallengeAdminRow[]>
  /** Admin: a Good Loop challenge, saved as a draft (or edited while not live). */
  adminSaveChallenge(c: Challenge): Promise<string>
  adminChallengeAction(id: string, action: 'publish' | 'schedule' | 'end' | 'cancel' | 'duplicate'): Promise<string>
  /** "População ativa suficiente" and the estimated reach. */
  adminChallengeReach(scope: ChallengeScope, ref: string | null): Promise<ChallengeReach>
  adminSettleChallenges(): Promise<number>

  // --- Gamification: the company add-on (SPEC §7). HR's company is the
  //     signed-in account's, server-side; nothing here takes a company id. ---
  /** Plano: the add-on in force, or null. */
  hrGetAddon(): Promise<AddonInfo | null>
  hrListTagFilter(): Promise<TagFilterRow[]>
  hrSetTagDisabled(tagId: string, disabled: boolean): Promise<void>
  hrTagFilterHistory(): Promise<{ label: string; disabledAt: number; enabledAt: number | null }[]>
  hrListCompanyBenefits(): Promise<CompanyBenefitRow[]>
  hrSaveCompanyBenefit(b: CompanyBenefitRow): Promise<string>
  hrUploadCodes(benefitId: string, codes: string[]): Promise<number>
  /** The only names HR ever sees: identified redemptions, each consented. */
  hrIdentifiedRedemptions(): Promise<IdentifiedRedemption[]>
  listChallengeTemplates(): Promise<ChallengeTemplate[]>
  /** Admin: every template, offered or not. */
  adminListChallengeTemplates(): Promise<ChallengeTemplate[]>
  /** Admin: a template's text, goal and defaults — the only words of a company challenge. */
  adminSaveChallengeTemplate(t: ChallengeTemplate): Promise<void>
  hrSaveCompanyChallenge(d: CompanyChallengeDraft): Promise<string>
  hrCompanyChallengeAction(id: string, action: 'publish' | 'end' | 'cancel'): Promise<void>
  /** Company-wide aggregates only, k-guarded with complementary suppression. */
  hrAddonDashboard(): Promise<AddonDashboard>
  /** Admin › Piani e aziende. */
  adminListPlans(): Promise<AddonPlan[]>
  adminSavePlan(p: AddonPlan): Promise<void>
  adminListSubscriptions(): Promise<CompanySubscription[]>
  adminSetCompanyPlan(companyId: string, planId: string | null): Promise<void>

  // --- Gamification: the console's achievements and reports (SPEC §8) ---
  adminListAchievementDefs(): Promise<(AchievementDef & { id: string })[]>
  /** Threshold, bonus, active — the slug, metric and scope are fixed. */
  adminSaveAchievementDef(d: AchievementDef & { id: string }): Promise<void>
  /** Re-evaluate everyone, e.g. after lowering a threshold. Returns new unlocks. */
  adminEvaluateAchievements(): Promise<number>
  adminGamificationReport(from: string, to: string): Promise<GamificationReport>
}

/** Admin › Report: totals only, never a person. Dates are YYYY-MM-DD. */
export interface GamificationReport {
  from: string
  to: string
  pointsIssued: number
  loopsBySource: { entryType: string; fundingSource: 'goodloop' | 'company'; centi: number; entries: number }[]
  redemptionsByBenefit: { benefitId: string; title: string; companyId: string | null; redemptions: number; refunded: number; loopsCenti: number }[]
  multiplierByCompanyMonth: { companyId: string; companyName: string; month: string; loopsCenti: number; people: number }[]
  challengeResults: { id: string; title: string; companyId: string | null; status: string; startsAt: number; endsAt: number; participants: number; completed: number; rewarded: number; bonusCenti: number }[]
}

export interface ChallengeReach {
  people: number
  activeLastMonth: number
  threshold: number
  enough: boolean
}

export interface AdminRedemption extends Redemption {
  /** Who redeemed — the admin sees it; HR never does (§7.4). */
  userLabel: string
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
        setProvider((p) => (p ? {
          ...p,
          listProtocols: () => live.listProtocols(),
          findProtocol: (code: string) => live.findProtocol(code),
          listExploreRails: () => live.listExploreRails(),
          topSessions: (n?: number) => live.topSessions(n),
          // partner offers are catalogue too: the Partner tab shows the real ones
          listPartnerProducts: () => live.listPartnerProducts(),
        } : p))
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
