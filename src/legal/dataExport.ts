/* ============================================================================
   Good Loop — the data-subject export (DAT-02, DSR specification Part III)

   Twelve domains, A to L, every one present — with an express nil where
   Good Loop holds nothing, because "none" is itself information and better
   evidence than silence (2.2). Domain J, the clinical record, is routed to
   the professional who holds it and never supplied by Good Loop (4.3);
   domain K states that no automated feature exists and that no score,
   rating, severity level, risk classification or clinical assessment about
   the person is held — the sentence that carries the wellness position (3.3).

   This is the machine-readable half of a response. The accompanying
   statement (Part II.3) is completed per request by the data-protection
   officer; the request row the admin console tracks carries the deadline.
   ============================================================================ */

import type { SelfUseState } from '../data/selfUseStore'
import type { Acceptance, ConsentEvent, LegalProfile } from './records'
import { LEGAL_VERSION } from './types'

export interface ExportInput {
  requestId: string | null
  profile: LegalProfile | null
  email: string | null
  companyCode: string | null
  acceptances: Acceptance[]
  consents: ConsentEvent[]
  state: SelfUseState
  sessions: { slug: string; name: string; theme?: string; protocolCode?: string }[]
  therapy: {
    therapistName: string
    sessions: unknown[]
    selected: unknown[]
  } | null
}

const NIL = 'none — Good Loop holds no data in this domain for you'

export function buildDataExport(i: ExportInput) {
  const bySlug = new Map(i.sessions.map((s) => [s.slug, s]))
  const iso = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString() : null)
  const nil = <T,>(rows: T[]) => (rows.length ? rows : NIL)

  return {
    schema: 'goodloop-dsr-export/1',
    generatedAt: new Date().toISOString(),
    requestId: i.requestId,
    legalVersion: LEGAL_VERSION,
    domains: {
      A_identity_and_account: {
        id: i.profile?.id ?? null,
        name: i.profile?.name ?? null,
        email: i.email,
        personalEmail: i.profile?.personalEmail ?? null,
        birthDate: i.profile?.birthDate ?? null,
        country: i.profile?.country ?? null,
        market: i.profile?.market ?? null,
        locale: i.profile?.locale ?? null,
        accountStartedAt: iso(i.state.onboardedAt),
      },
      B_consent_and_acceptance: {
        acceptances: nil(i.acceptances.map((a) => ({ document: a.docId, version: a.version, locale: a.locale, channel: a.channel, at: iso(a.acceptedAt) }))),
        consents: nil(i.consents.map((c) => ({ purpose: c.purpose, granted: c.granted, wording: c.wording, locale: c.locale, at: iso(c.at) }))),
        localMirror: i.state.consents,
      },
      C_subscription_and_billing: NIL,
      D_usage_records: {
        note: 'Which sessions you opened, when and for how long. Where a professional selected content for you, it is recorded as selected by that named professional — Good Loop selects, orders and adapts nothing.',
        sessions: nil(i.state.logs.map((l) => ({
          at: iso(l.at), session: bySlug.get(l.slug)?.name ?? l.slug, durationMin: l.duration,
          selectedByProfessional: !!l.prescriptionId, feedback: l.feedback ?? null,
        }))),
        settledness: nil(i.state.glChecks.map((g) => ({ at: iso(g.at), scores: g.scores, scale: '1–5 self-report' }))),
        dailyMood: nil(i.state.moods.map((m) => ({ day: m.day, level: m.level, scale: '1–5 self-report' }))),
        series: i.state.pathway ?? NIL,
        completedSeries: nil(i.state.completedPathways),
        preferences: { notifications: i.state.notifications, session: i.state.prefs },
      },
      E_user_created_content: NIL,
      F_communications_with_good_loop: NIL,
      G_technical_and_log_data: {
        note: 'Device, application version and login history are held by the platform provider and are supplied with the complete response.',
      },
      H_sponsorship_and_eligibility: i.companyCode
        ? {
            note: 'This data came from your sponsor, not from you. Your sponsor has received no information identifying you and none about whether, when or how you have used Good Loop.',
            companyCode: i.companyCode,
            fieldsSuppliedBySponsor: i.profile?.sponsorFields ?? ['company code'],
          }
        : NIL,
      I_booking_and_scheduling: i.therapy
        ? { professional: i.therapy.therapistName, sessions: nil(i.therapy.sessions), selectedContent: nil(i.therapy.selected) }
        : NIL,
      J_clinical_record: i.therapy
        ? {
            heldBy: i.therapy.therapistName,
            note: 'The clinical record of your work with this professional — notes, observations and any questionnaire you completed for them — is kept by that professional, who is independently responsible for it under the rules of their profession. Good Loop does not hold it and cannot provide it; ask the professional directly, and tell us if you have any difficulty reaching them. The professional may be required to retain it even after a deletion request.',
          }
        : NIL,
      K_automated_features: {
        automatedDecisions: 'none — Good Loop does not use artificial intelligence and takes no decision about you by automated means',
        scoresOrClassifications: 'none — Good Loop holds no score, rating, severity level, risk classification or clinical assessment about you',
      },
      L_marketing_and_communication_preferences: {
        marketing: i.consents.filter((c) => c.purpose === 'marketing').map((c) => ({ granted: c.granted, at: iso(c.at) })),
        testimonial: i.consents.filter((c) => c.purpose === 'testimonial').map((c) => ({ granted: c.granted, at: iso(c.at) })),
        research: i.consents.filter((c) => c.purpose === 'research').map((c) => ({ granted: c.granted, at: iso(c.at) })),
      },
    },
  }
}
