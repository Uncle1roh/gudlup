/* ============================================================================
   Corporate Dashboard — the aggregate model

   THE constraint on this whole surface: the company can never identify which
   employee did what. Two mechanisms enforce it here rather than by convention:

   1. `Cell<T>` — no metric is a bare number. Every figure arrives paired with
      the number of people it was computed from, and `cellValue()` returns null
      below the threshold. A screen that forgets to check gets "Not enough data
      yet", never a number derived from four people.

   2. `MIN_CELL = 5`. One constant, used everywhere, matching the copy shown to
      the HR admin ("metrics require at least 5 participants").

   The therapy channel is deliberately the thinnest thing in this file: ONE
   integer, no breakdown, no trend, no per-therapist split. That sparseness is
   the privacy commitment made visible, so it is modelled as its own type that
   cannot be decomposed.

   Vocabulary is also enforced here — `FORBIDDEN_TERMS` is checked by the test
   harness against the rendered dashboard copy. Trend labels come from ONE
   function so "improving" / "worsening" / "at risk" cannot creep into a chart
   caption later.
   ============================================================================ */

import type { ConventionType, EapContact } from '../data/convention'

/** k-anonymity threshold. Below this, a metric is withheld, never rounded. */
export const MIN_CELL = 5

/** Never allowed anywhere in dashboard copy. */
export const FORBIDDEN_TERMS = [
  'at risk',
  'problematic',
  'concerning',
  'needs intervention',
  'red flag',
  'alarming',
  'critical',
  'pathological',
  'diagnosis',
  'symptoms',
  'disorder',
  'treatment',
] as const

/** The vocabulary that IS allowed for describing movement. */
export const TREND_LABELS = ['Trending up', 'Stable', 'Trending down'] as const
export type TrendLabel = (typeof TREND_LABELS)[number]

/** A figure plus the population it came from. */
export interface Cell<T = number> {
  value: T
  /** How many people contributed. Compared against MIN_CELL. */
  n: number
}

export function cell<T>(value: T, n: number): Cell<T> {
  return { value, n }
}

/** The value, or null when too few people contributed to publish it. */
export function cellValue<T>(c: Cell<T> | null | undefined): T | null {
  if (!c) return null
  return c.n >= MIN_CELL ? c.value : null
}

export function suppressed(c: Cell<unknown> | null | undefined): boolean {
  return !c || c.n < MIN_CELL
}

/* ------------------------------------------------------------- trends ---- */

export interface Movement {
  label: TrendLabel
  /** Signed delta, already rounded. */
  delta: number
  direction: 'up' | 'flat' | 'down'
}

/**
 * The ONE place a direction becomes words. `epsilon` is the band that reads as
 * "Stable" — 1 for a 0–100 score, 0.05 for a 1–5 one, 1 for a percentage.
 *
 * Note what this deliberately does NOT do: it never says whether up is good.
 * On WHO-5 up is higher perceived wellbeing; on a hypothetical cost metric it
 * would not be. The dashboard states the direction and leaves the reading to
 * the human, which is also what keeps the copy out of clinical territory.
 */
export function movement(current: number | null, previous: number | null, epsilon = 1, decimals = 1): Movement | null {
  if (current == null || previous == null) return null
  const raw = current - previous
  const delta = Number(raw.toFixed(decimals))
  if (Math.abs(raw) <= epsilon) return { label: 'Stable', delta, direction: 'flat' }
  return raw > 0
    ? { label: 'Trending up', delta, direction: 'up' }
    : { label: 'Trending down', delta, direction: 'down' }
}

export function movementText(m: Movement | null, unit = '', period = 'last month'): string {
  if (!m) return '—'
  if (m.direction === 'flat') return `Stable vs ${period}`
  const sign = m.delta > 0 ? '+' : '−'
  return `${m.label} · ${sign}${Math.abs(m.delta)}${unit} vs ${period}`
}

/* -------------------------------------------------------------- report ---- */

export type PeriodId = 'month' | 'quarter' | 'last30' | 'last90' | 'custom'

export const PERIODS: { id: PeriodId; label: string }[] = [
  { id: 'month', label: 'This month' },
  { id: 'quarter', label: 'This quarter' },
  { id: 'last30', label: 'Last 30 days' },
  { id: 'last90', label: 'Last 90 days' },
  { id: 'custom', label: 'Custom range' },
]

export interface SeriesPoint {
  /** Bucket label — a week ("W32") or a month ("Aug"). */
  label: string
  value: number
}

export interface KpiSet {
  registered: Cell
  licences: number
  registeredDelta: number
  active7: Cell
  activationPct: Cell
  weeklyActivePct: Cell
  retention30: Cell
  sessions: Cell
  sessionsPerUserWeek: Cell
  who5Avg: Cell
  glCheckAvg: Cell
  /** Previous-period values, for the trend arrows. Null when unavailable. */
  previous: {
    active7: number | null
    sessions: number | null
    who5Avg: number | null
    glCheckAvg: number | null
  }
}

export interface EngagementData {
  registrationSeries: SeriesPoint[]
  activeSeries: SeriesPoint[]
  sessionsByWeek: { label: string; quick: number; standard: number; deep: number }[]
  frequency: { label: string; pct: number }[]
  durationSplit: { label: string; pct: number }[]
  pathways: { name: string; pct: number; n: number }[]
}

export interface WellbeingData {
  who5Series: SeriesPoint[]
  who5Current: Cell
  who5Previous: number | null
  /** WHO-5 general-population reference band, for the shaded area. */
  who5Reference: { low: number; high: number }
  dimensions: { key: string; label: string; current: Cell; previous: number | null }[]
  moodSeries: { label: string; positive: number; neutral: number; negative: number }[]
  moodCurrent: { positive: number; neutral: number; negative: number } | null
  moodPrevious: { positive: number; neutral: number; negative: number } | null
  moodResponses: number
  moodRespondents: number
  benchmark: { metric: string; company: number; industry: number | null; unit: string }[]
}

/** The ONE anonymous integer the therapy channel exposes. Nothing else. */
export interface ProfessionalSupport {
  /** Count of employees currently using professional support sessions. */
  employees: number
}

export interface Alert {
  id: string
  kind: 'report' | 'renewal' | 'licences' | 'therapist'
  text: string
  at: number
  action?: string
}

export interface TherapistRow {
  id: string
  name: string
  crp: string
  specializations: string[]
  status: 'active' | 'pending-invitation' | 'pending-verification' | 'declined' | 'removed'
  email?: string
  invitedAt?: number
}

export interface AdminRow {
  id: string
  name: string
  email: string
  role: 'owner' | 'admin'
  addedAt: number
}

export interface ReportRow {
  id: string
  name: string
  kind: 'auto' | 'on-demand'
  periodFrom: number
  periodTo: number
  generatedAt: number
  viewed: boolean
  /** Which sections this report was generated with. Absent on an auto
      report, which carries them all. Stored so re-downloading an archived
      row reproduces the same document rather than a wider one. */
  sections?: string[]
}

export interface CompanyProfile {
  name: string
  country: string
  industry: string
  size: string
  contactName: string
  contactEmail: string
  contactPhone: string
}

export interface NotificationPrefs {
  monthlyReport: boolean
  quarterlyReport: boolean
  renewalReminder: boolean
  licenceAlert: boolean
  therapistStatus: boolean
}

export interface CorporateState {
  setupDoneAt: number | null
  companyId: string
  profile: CompanyProfile
  conventionType: ConventionType
  licences: number
  companyCode: string
  eap: EapContact | null
  conventionStart: number
  conventionEnd: number
  therapists: TherapistRow[]
  admins: AdminRow[]
  reports: ReportRow[]
  notifications: NotificationPrefs
  /** People who opted into anonymous aggregate sharing. */
  consented: number
}

/* ---------------------------------------------------------- utilities ---- */

export function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

/** License utilisation crosses into "high" at 80%, which is what triggers the
    Management alert and the Overview notification. */
export const HIGH_UTILISATION = 0.8

export function utilisationHigh(used: number, total: number): boolean {
  return total > 0 && used / total >= HIGH_UTILISATION
}

export function daysUntil(ms: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((ms - now) / 86_400_000))
}

/** Renewal notice appears inside 60 days. */
export const RENEWAL_NOTICE_DAYS = 60

/** A company code: NAME-YEAR, uppercase, derived from the company name. */
export function generateCompanyCode(companyName: string, year = new Date().getFullYear()): string {
  const stem = companyName
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .split(/\s+/)[0]
    .slice(0, 8)
  return `${stem || 'COMPANY'}-${year}`
}
