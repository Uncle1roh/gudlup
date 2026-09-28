/* ============================================================================
   Corporate Dashboard — state and aggregate source

   Two halves, deliberately separated:

   · CONFIGURATION (`CorporateState`) is what the HR admin owns and edits —
     company profile, code, EAP contact, therapists, admins, notifications. It
     is persisted locally per company here; a wired build moves it behind the
     data provider unchanged, because nothing about it is employee data.

   · AGGREGATES (`buildAggregates`) are the numbers. They are DERIVED, never
     stored on this side, and every one of them is a `Cell` carrying the number
     of people behind it. In production this is one SECURITY DEFINER call that
     returns exactly these shapes; nothing employee-level can cross the
     boundary because the boundary only speaks in these types.

   The demo aggregates below are deterministic — seeded from the company id, so
   the same tenant always paints the same dashboard and a reviewer comparing
   two screenshots is comparing the UI, not noise.
   ============================================================================ */

import { fmtDate as localeDate } from '../i18n'
import { useCallback, useEffect, useState } from 'react'
import { resolveCompanyCode, type Convention, type ConventionType, type EapContact } from '../data/convention'
import {
  cell,
  pct,
  type Alert,
  type CorporateState,
  type EngagementData,
  type KpiSet,
  type ProfessionalSupport,
  type WellbeingData,
} from './metrics'
import { PATHWAYS } from '../data/selfuse'
import { GL_CHECK_QUESTIONS } from '../data/measures'

const KEY = 'gl.corporate'

const DAY = 86_400_000

/* ------------------------------------------------------------- tenant ----

   WHICH company this dashboard is for. It used to be nobody's: the state was
   one localStorage slot seeded with "Acme Corporation" and a code minted from
   that name (ACME-2026-9C) that no registry knew, so an HR admin who signed up
   with AURORA-2026-Z5 was shown Acme and a code that opened nothing.

   The tenant now comes from the signed-in account's company code, resolved
   through the same registry the employee door uses (`resolveCompanyCode`), so
   the company, its code, its convention type, its licences and its EAP are the
   ones that code actually opens. Each tenant keeps its own configuration slot.
   A code that is on the account but not in the registry still names the
   tenant — by the admin console's company list when that can be read, by the
   code itself otherwise — and never borrows another company's identity. Only
   an account with NO code falls back, to ACME-2026, the demo tenant the mock
   layer hands to every account that typed none. */

export interface Tenant {
  companyId: string
  name: string
  code: string
  conventionType: ConventionType
  licences: number
  eap: EapContact | null
  startsAt: number
  endsAt: number
}

export function tenantFromConvention(c: Convention): Tenant {
  return {
    companyId: c.companyId,
    name: c.companyName,
    code: c.code,
    conventionType: c.type,
    licences: c.licences,
    eap: c.eap,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
  }
}

/** The tenant an account with no company code sees in the demo. */
export const FALLBACK_TENANT: Tenant = (() => {
  const acme = resolveCompanyCode('ACME-2026')
  if (acme) return tenantFromConvention(acme)
  const now = Date.now()
  return {
    companyId: 'acme', name: 'Acme Corporation', code: 'ACME-2026', conventionType: 'self-use-plus',
    licences: 250, eap: null, startsAt: now - 328 * DAY, endsAt: now + 37 * DAY,
  }
})()

/** A code on the account that the registry does not (yet) know. */
export function tenantFromCode(code: string, known?: { name: string; seats: number } | null): Tenant {
  const now = Date.now()
  return {
    companyId: code,
    name: known?.name || code,
    code,
    conventionType: 'self-use',
    licences: known?.seats ?? 0,
    eap: null,
    startsAt: now,
    endsAt: now + 365 * DAY,
  }
}

/* Demo profile details for the built-in tenants. Country is an ISO region
   code, printed in the reader's language (Intl.DisplayNames). */
const DEMO_PROFILE: Record<string, { country: string; industry: string; size: string }> = {
  acme: { country: 'US', industry: 'Technology', size: '201–500' },
  aurora: { country: 'BR', industry: 'Technology', size: '201–500' },
  meridian: { country: 'BR', industry: 'Healthcare', size: '51–200' },
  nova: { country: 'IT', industry: 'Manufacturing', size: '51–200' },
  'goodloop-demo': { country: 'IT', industry: 'Technology', size: '1–50' },
}

export function defaultState(tenant: Tenant = FALLBACK_TENANT): CorporateState {
  const p = DEMO_PROFILE[tenant.companyId]
  return {
    setupDoneAt: null,
    companyId: tenant.companyId,
    profile: {
      name: tenant.name,
      country: p?.country ?? '',
      industry: p?.industry ?? 'Other',
      size: p?.size ?? '1–50',
      contactName: '',
      contactEmail: '',
      contactPhone: '',
    },
    conventionType: tenant.conventionType,
    licences: tenant.licences,
    companyCode: tenant.code,
    eap: tenant.eap,
    conventionStart: tenant.startsAt,
    conventionEnd: tenant.endsAt,
    therapists: [],
    admins: [],
    reports: [],
    notifications: {
      monthlyReport: true,
      quarterlyReport: true,
      renewalReminder: true,
      licenceAlert: true,
      therapistStatus: true,
    },
    consented: Math.round(tenant.licences * 0.756),
  }
}

function slotKey(tenant: Tenant): string {
  return `${KEY}.${tenant.code}`
}

/** The tenant's saved configuration. What the CONTRACT fixes — name, code,
    convention type, licences, dates — always comes from the tenant, so a stale
    slot can never show another company or a code that opens nothing. */
export function loadCorporate(tenant: Tenant = FALLBACK_TENANT): CorporateState {
  const base = defaultState(tenant)
  try {
    const raw = localStorage.getItem(slotKey(tenant))
    if (!raw) return base
    const saved = JSON.parse(raw) as Partial<CorporateState>
    return {
      ...base,
      ...saved,
      companyId: base.companyId,
      companyCode: base.companyCode,
      conventionType: base.conventionType,
      licences: base.licences,
      conventionStart: base.conventionStart,
      conventionEnd: base.conventionEnd,
      profile: { ...base.profile, ...(saved.profile ?? {}), name: base.profile.name },
    }
  } catch {
    return base
  }
}

export function saveCorporate(tenant: Tenant, s: CorporateState): void {
  try { localStorage.setItem(slotKey(tenant), JSON.stringify(s)) } catch { /* private mode */ }
}

export function useCorporateState(tenant: Tenant) {
  const [slot, setSlot] = useState(() => ({ code: tenant.code, state: loadCorporate(tenant) }))
  /* A different tenant (the account's code arrived, or changed) is a
     different dashboard: swap the slot during render rather than showing one
     frame of the previous company. */
  let current = slot
  if (slot.code !== tenant.code) {
    current = { code: tenant.code, state: loadCorporate(tenant) }
    setSlot(current)
  }
  const update = useCallback((fn: (s: CorporateState) => CorporateState) => {
    setSlot((prev) => {
      const next = fn(prev.state)
      saveCorporate(tenant, next)
      return { code: prev.code, state: next }
    })
  }, [tenant])
  useEffect(() => { saveCorporate(tenant, slot.state) }, [tenant, slot.state])
  return { state: current.state, update }
}

/* --------------------------------------------------------- aggregates ---- */

/** Deterministic pseudo-random from a string seed, so the demo never flickers. */
function seeded(seed: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return () => {
    h += 0x6d2b79f5
    let x = Math.imul(h ^ (h >>> 15), 1 | h)
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

function weekLabels(n: number): string[] {
  const out: string[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(now.getTime() - i * 7 * DAY)
    out.push(`${d.getDate()}/${d.getMonth() + 1}`)
  }
  return out
}

function monthLabels(n: number): string[] {
  const out: string[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i -= 1) {
    out.push(localeDate(new Date(now.getFullYear(), now.getMonth() - i, 1).getTime(), { month: 'short' }))
  }
  return out
}

export interface Aggregates {
  kpis: KpiSet
  engagement: EngagementData
  wellbeing: WellbeingData
  professionalSupport: ProfessionalSupport | null
  alerts: Alert[]
}

/**
 * Build the whole dashboard's numbers for one company.
 *
 * `respondents` is what makes the k-anonymity rule real rather than decorative:
 * pass a small number (a young tenant, or one where few people opted into
 * aggregate sharing) and the suppression paths across every screen light up,
 * because each Cell carries that population with it.
 */
export function buildAggregates(state: CorporateState, respondents = state.consented): Aggregates {
  const rnd = seeded(state.companyId)
  const licences = state.licences
  const registered = Math.min(licences, Math.round(licences * 0.87))
  const active7 = Math.round(registered * 0.807)
  const sessions = 1284
  const n = respondents

  const kpis: KpiSet = {
    registered: cell(registered, registered),
    licences,
    registeredDelta: 34,
    active7: cell(active7, registered),
    activationPct: cell(84, registered),
    weeklyActivePct: cell(pct(active7, registered), registered),
    retention30: cell(71, registered),
    sessions: cell(sessions, registered),
    sessionsPerUserWeek: cell(3.2, registered),
    who5Avg: cell(63, n),
    glCheckAvg: cell(3.3, n),
    previous: { active7: Math.round(active7 * 0.94), sessions: 1157, who5Avg: 61, glCheckAvg: 3.3 },
  }

  const weeks = weekLabels(12)
  let cum = Math.round(registered * 0.62)
  const registrationSeries = weeks.map((label) => {
    cum = Math.min(registered, cum + Math.round(rnd() * 8) + 1)
    return { label, value: cum }
  })
  const activeSeries = weeks.map((label, i) => ({
    label,
    value: Math.round(registrationSeries[i].value * (0.72 + rnd() * 0.12)),
  }))

  const sessionsByWeek = weeks.map((label) => {
    const total = 80 + Math.round(rnd() * 40)
    const quick = Math.round(total * 0.46)
    const standard = Math.round(total * 0.39)
    return { label, quick, standard, deep: total - quick - standard }
  })

  const engagement: EngagementData = {
    registrationSeries,
    activeSeries,
    sessionsByWeek,
    frequency: [
      { label: '1 / week', pct: 28 },
      { label: '2–3 / week', pct: 44 },
      { label: '4–5 / week', pct: 21 },
      { label: '6+ / week', pct: 7 },
    ],
    durationSplit: [
      { label: 'Quick (6 min)', pct: 46 },
      { label: 'Standard (12 min)', pct: 39 },
      { label: 'Deep (24 min)', pct: 15 },
    ],
    pathways: [
      { name: PATHWAYS[1].name, pct: 34, n: Math.round(registered * 0.34) },
      { name: PATHWAYS[0].name, pct: 26, n: Math.round(registered * 0.26) },
      { name: PATHWAYS[2].name, pct: 19, n: Math.round(registered * 0.19) },
      { name: PATHWAYS[3].name, pct: 13, n: Math.round(registered * 0.13) },
      { name: PATHWAYS[4].name, pct: 8, n: Math.round(registered * 0.08) },
    ],
  }

  const months = monthLabels(6)
  const who5Series = months.map((label, i) => ({ label, value: 57 + i + Math.round(rnd() * 2) }))

  const dimensionValues: Record<string, { current: number; previous: number }> = {
    energy: { current: 3.4, previous: 3.1 },
    focus: { current: 3.1, previous: 3.1 },
    sleep: { current: 2.8, previous: 3.0 },
    balance: { current: 3.2, previous: 3.1 },
    motivation: { current: 3.5, previous: 3.1 },
  }

  const moodWeeks = weekLabels(8)
  const moodSeries = moodWeeks.map((label, i) => {
    const positive = 52 + i + Math.round(rnd() * 3)
    const negative = Math.max(6, 15 - i)
    return { label, positive, neutral: 100 - positive - negative, negative }
  })

  const wellbeing: WellbeingData = {
    who5Series,
    who5Current: cell(63, n),
    who5Previous: 61,
    who5Reference: { low: 50, high: 70 },
    dimensions: GL_CHECK_QUESTIONS.map((q) => ({
      key: q.id,
      label: q.label,
      current: cell(dimensionValues[q.id].current, n),
      previous: dimensionValues[q.id].previous,
    })),
    moodSeries,
    moodCurrent: { positive: 58, neutral: 31, negative: 11 },
    moodPrevious: { positive: 55, neutral: 33, negative: 12 },
    moodResponses: 612,
    moodRespondents: 143,
    benchmark: [
      { metric: 'Activation Rate', company: 84, industry: 76, unit: '%' },
      { metric: 'Weekly Active Rate', company: pct(active7, registered), industry: 68, unit: '%' },
      { metric: 'WHO-5 Average', company: 63, industry: 61, unit: '' },
      { metric: 'Sessions / User / Week', company: 3.2, industry: 2.7, unit: '' },
    ],
  }

  const now = Date.now()
  const alerts: Alert[] = []
  const latest = state.reports.find((r) => !r.viewed)
  if (latest) {
    alerts.push({ id: `a-${latest.id}`, kind: 'report', text: '{name} is ready for download', vars: { name: latest.name }, at: latest.generatedAt, action: 'Download' })
  }
  const days = Math.ceil((state.conventionEnd - now) / DAY)
  if (days <= 60) {
    alerts.push({
      id: 'a-renewal',
      kind: 'renewal',
      text: 'Your convention expires on {date} — {n} days remaining',
      vars: { date: localeDate(state.conventionEnd, { month: 'short', day: 'numeric', year: 'numeric' }), n: days },
      at: now - DAY,
      action: 'View',
    })
  }
  if (registered / licences >= 0.8) {
    alerts.push({
      id: 'a-lic',
      kind: 'licences',
      text: '{n}% of licenses are in use — consider expanding',
      vars: { n: pct(registered, licences) },
      at: now - 2 * DAY,
      action: 'View',
    })
  }
  for (const th of state.therapists.filter((x) => x.status === 'active')) {
    alerts.push({ id: `a-th-${th.id}`, kind: 'therapist', text: '{name} accepted your invitation', vars: { name: th.name }, at: now - 3 * DAY, action: 'View' })
  }

  return {
    kpis,
    engagement,
    wellbeing,
    /* Never a separate figure for professionally guided use (SPN-04). */
    professionalSupport: null,
    alerts,
  }
}
