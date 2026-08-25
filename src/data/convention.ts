/* ============================================================================
   Good Loop — company conventions

   A company code does four things, and nothing else:
     · links an account to a company (so it consumes a licence),
     · sets the CONVENTION — Self Use only, or Self Use + Professional Support,
     · carries the EAP contact the Safety Gateway shows,
     · names the therapists a person may book.

   Properties that separate it from a THERAPIST connection code:
     company code      reusable · does not expire · one per company
     connection code   single-use · expires in 72h · one active per therapist

   No employee data flows the other way. A convention is read by the app; it is
   never written by it.
   ============================================================================ */

export type ConventionType = 'self-use' | 'self-use-plus'

export interface EapContact {
  provider: string
  phone: string
  email?: string
  website?: string
  /** e.g. "Available 24/7 · Quote company code when calling". */
  info?: string
}

export interface Convention {
  companyId: string
  companyName: string
  /** Uppercase, e.g. "ACME-2026". */
  code: string
  type: ConventionType
  licences: number
  eap: EapContact | null
  /** ms — after this the grace period to end-of-quarter starts. */
  startsAt: number
  endsAt: number
}

/** A generic crisis line shown when a company configured no EAP, and to people
    using the app individually. Placeholder details — the deployment replaces
    them per country before launch. */
export const GENERIC_CRISIS: EapContact = {
  provider: 'Crisis helpline',
  phone: '112',
  info: 'Free, confidential support line',
}

export function conventionLabel(t: ConventionType): string {
  return t === 'self-use-plus' ? 'Self Use + Professional Support' : 'Self Use'
}

export function conventionBlurb(t: ConventionType): string {
  return t === 'self-use-plus'
    ? 'Employees get autonomous audio wellbeing sessions via the app, plus access to therapist-led sessions via video call.'
    : 'Employees get autonomous audio wellbeing sessions via the app.'
}

export function hasProfessionalSupport(c: Convention | null): boolean {
  return c?.type === 'self-use-plus'
}

/** Grace period: access continues to the END OF THE QUARTER after expiry. */
export function graceEndsAt(endsAt: number): number {
  const d = new Date(endsAt)
  const quarterEndMonth = Math.floor(d.getMonth() / 3) * 3 + 3 // exclusive
  return new Date(d.getFullYear(), quarterEndMonth, 1).getTime() - 1
}

export function daysRemaining(endsAt: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((endsAt - now) / 86_400_000))
}

/** A company code is well-formed if it is NAME-YEAR-ish: letters/digits and
    dashes, 4–24 chars. Validity against a real tenant is a server call; this is
    only the inline check that keeps obvious typos out of it. */
export function looksLikeCompanyCode(raw: string): boolean {
  return /^[A-Z0-9][A-Z0-9-]{2,22}[A-Z0-9]$/.test(raw.trim().toUpperCase())
}

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase()
}

/* ---------------------------------------------------------------- demo -----

   Two conventions so every convention-dependent state in the app is reachable
   in a demo build: ACME-2026 has Professional Support, NOVA-2026 does not.
   A real deployment resolves the code against the tenant table instead. */

export const DEMO_CONVENTIONS: Convention[] = [
  {
    companyId: 'acme',
    companyName: 'Acme Corporation',
    code: 'ACME-2026',
    type: 'self-use-plus',
    licences: 250,
    eap: {
      provider: 'WellMind Support Services',
      phone: '+1 800 555 0142',
      email: 'help@wellmind.example',
      info: 'Available 24/7 · Quote company code when calling',
    },
    startsAt: Date.UTC(2025, 9, 1),
    endsAt: Date.UTC(2026, 8, 30),
  },
  {
    companyId: 'nova',
    companyName: 'Nova Industries',
    code: 'NOVA-2026',
    type: 'self-use',
    licences: 80,
    eap: null,
    startsAt: Date.UTC(2026, 0, 1),
    endsAt: Date.UTC(2026, 11, 31),
  },
]

/** Resolve a code to its convention, or null when it matches no tenant. */
export function resolveCompanyCode(raw: string | null | undefined): Convention | null {
  if (!raw) return null
  const code = normalizeCode(raw)
  return DEMO_CONVENTIONS.find((c) => c.code === code) ?? null
}

/** The contact the Safety Gateway should print: the company's EAP when one is
    configured, the generic crisis line otherwise. Never nothing. */
export function safetyContact(c: Convention | null): EapContact {
  return c?.eap ?? GENERIC_CRISIS
}
