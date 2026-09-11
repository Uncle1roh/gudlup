/* ============================================================================
   Good Loop — company conventions

   A company code does four things, and nothing else:
     · links an account to a company (so it consumes a licence),
     · sets the CONVENTION — Self Use only, or Self Use + Professional Support,
     · carries the EAP contact the Safety Gateway shows,
     · names the therapists a person may book.

   Properties that separate it from a THERAPIST connection code:
     company code      reusable · lives as long as the convention · one per company
     connection code   single-use · expires in 72h · one active per therapist

   No employee data flows the other way. A convention is read by the app; it is
   never written by it.

   ── how a code comes to exist ─────────────────────────────────────────

   The codes were "weird" because there were two of them. The employer
   dashboard MINTED one shape (`generateCompanyCode`, NAME-YEAR, plus a random
   two-digit tail on regenerate) and this file RESOLVED another (two constants),
   so a code an HR admin read off their own screen resolved to nothing in the
   app and the employee silently got no professional support. One shape, one
   registry, one resolver — that is what the rest of this file is.

     1 · SHAPE.  `STEM-YYYY-XX`, uppercase.
         STEM  the company's first word, A–Z/0–9, up to 8 characters.
         YYYY  the year the convention STARTS. Renewal mints a new code; the
               old one dies with the old convention, which is what makes a
               leaked code self-limiting.
         XX    two characters derived from the company id, year and rotation,
               over an alphabet with no I/O/U/0/1 — a code gets read down a
               phone line by someone who has never seen it written.
         `STEM-YYYY` without the pair is still accepted: it is the shape the
         first conventions were issued in and those codes are in use.

     2 · MINT.  `generateCompanyCode(name, year, rotation)` — deterministic,
         so the dashboard and the back office cannot drift. Rotation is for a
         code that has to be replaced without the convention changing.

     3 · REGISTER.  A code only opens anything once its convention is in the
         registry `allConventions()` reads: the built-ins below, plus whatever
         `VITE_COMPANY_CONVENTIONS` carries (a JSON array of Convention, set
         per deployment). Registering a pilot company is therefore an env
         change, not a release. When the tenant table lands, it becomes a
         third source here and nothing above this line changes.

     4 · WHAT IT OPENS.  `type: 'self-use-plus'` is what puts therapist-led
         treatment in the app — booking, video sessions, prescriptions. Plain
         `self-use` is the audio library alone. Either way the convention also
         carries the EAP the Safety Gateway prints.

     5 · WHEN IT STOPS.  A code resolves while its convention is inside its
         window, and through the grace period to the end of that quarter.
         After that it resolves to NOTHING rather than to an expired tenant,
         so nobody keeps a paid feature by keeping an old code.
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

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase()
}

/* ------------------------------------------------------------- the code ---

   Minting and checking the shape. Nothing here talks to a tenant: a code that
   is well formed is not a code that is registered, and `resolveCompanyCode`
   below is the only thing that decides whether one opens anything. */

/** No I, O, U, 0 or 1: the pair gets dictated out loud more often than typed. */
const SUFFIX_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTVWXYZ'

/** Two stable characters from the company's identity. Deterministic — the same
    inputs mint the same code in the dashboard, in the back office and here. */
export function companyCodeSuffix(seed: string): string {
  // FNV-1a, 32-bit: small, dependency-free and stable across builds.
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  const n = SUFFIX_ALPHABET.length
  return SUFFIX_ALPHABET[h % n] + SUFFIX_ALPHABET[Math.floor(h / n) % n]
}

/** The company's first word, the shape a stem is allowed to take. */
function stemOf(companyName: string): string {
  const stem = companyName
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean)[0] ?? ''
  return stem.slice(0, 8) || 'COMPANY'
}

/**
 * Mint a company code: `STEM-YYYY-XX`.
 *
 * `year` is the year the convention STARTS, not today — a convention signed in
 * December for the following year carries the year it covers. `rotation` mints
 * a different code for the same company and year, for the one case that needs
 * it: a code that leaked and has to be replaced mid-term.
 */
export function generateCompanyCode(companyName: string, year = new Date().getFullYear(), rotation: number | string = 0): string {
  const stem = stemOf(companyName)
  return `${stem}-${year}-${companyCodeSuffix(`${stem}:${year}:${rotation}`)}`
}

/** The canonical shape, and the STEM-YYYY shape the first codes were issued in. */
const CODE_RX = /^[A-Z0-9]{2,8}-(19|20)\d{2}(-[A-Z0-9]{2,4})?$/

/** Well-formed — NOT the same as registered. This is the inline check that
    keeps a typo out of the field; `resolveCompanyCode` is the real answer. */
export function looksLikeCompanyCode(raw: string): boolean {
  return CODE_RX.test(normalizeCode(raw))
}

/* ------------------------------------------------------------ registry ----

   Every convention the app can resolve. Built-ins first, then whatever the
   deployment registered through `VITE_COMPANY_CONVENTIONS`.

   DEMO-2026-GL is the one to hand to a demo account: Professional Support, an
   EAP, and a window wide enough that nobody has to think about dates during a
   demo. ACME-2026 and NOVA-2026 stay exactly as they were — the mock data
   layer hands ACME-2026 to every demo account that types no code at all, and
   NOVA-2026 is how the without-Professional-Support state stays reachable. */

export const BUILT_IN_CONVENTIONS: Convention[] = [
  {
    companyId: 'goodloop-demo',
    companyName: 'Good Loop Demo',
    code: 'DEMO-2026-GL',
    /* The point of the demo code: Professional Support is what puts the
       therapist-led treatment — booking, video sessions, prescriptions — in
       the app. Without it a demo shows the audio library and nothing else. */
    type: 'self-use-plus',
    licences: 999,
    eap: {
      provider: 'Good Loop Demo EAP',
      phone: '+39 800 000 000',
      email: 'demo@goodloop.health',
      info: 'Demo contact · not a real support line',
    },
    startsAt: Date.UTC(2026, 0, 1),
    // deliberately long: a demo that stops working on a date nobody wrote down
    // is worse than no demo
    endsAt: Date.UTC(2028, 11, 31),
  },
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
    // pushed a year out: with expiry now enforced, the original date meant the
    // oldest demo tenant went dark mid-September 2026 and every demo account
    // that had never typed a code lost Professional Support on a Wednesday
    endsAt: Date.UTC(2027, 8, 30),
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

/**
 * Conventions registered by the DEPLOYMENT, as a JSON array in
 * `VITE_COMPANY_CONVENTIONS`.
 *
 * This is how a pilot company gets a working code today: mint it in the
 * employer dashboard, add its convention to the env var, redeploy. One
 * malformed entry must never take the app down with it — a parse failure
 * leaves the built-ins standing and says so once in the console.
 */
function envConventions(): Convention[] {
  // read through the whole object: this module is also imported by scripts that
  // run outside Vite, where `import.meta.env` does not exist at all
  const env = import.meta.env as ImportMetaEnv | undefined
  const raw = env?.VITE_COMPANY_CONVENTIONS?.trim()
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Convention[]
    if (!Array.isArray(parsed)) throw new Error('not an array')
    return parsed
      .filter((c) => c && typeof c.code === 'string' && typeof c.companyId === 'string')
      .map((c) => ({ ...c, code: normalizeCode(c.code), eap: c.eap ?? null }))
  } catch (e) {
    console.warn('VITE_COMPANY_CONVENTIONS is not valid JSON — ignoring it.', (e as Error).message)
    return []
  }
}

let registry: Convention[] | null = null

/** Every convention this build can resolve. Deployment entries win over a
    built-in with the same code, so a pilot can override a demo tenant. */
export function allConventions(): Convention[] {
  if (!registry) {
    const env = envConventions()
    const overridden = new Set(env.map((c) => c.code))
    registry = [...env, ...BUILT_IN_CONVENTIONS.filter((c) => !overridden.has(c.code))]
  }
  return registry
}

export type ConventionStatus = 'active' | 'grace' | 'expired'

/** Where a convention is in its life. `grace` still opens everything — it is
    the run-out to the end of the quarter, not a reduced plan. */
export function conventionStatus(c: Convention, now = Date.now()): ConventionStatus {
  if (now <= c.endsAt) return 'active'
  return now <= graceEndsAt(c.endsAt) ? 'grace' : 'expired'
}

/**
 * Resolve a code to its convention, or null.
 *
 * Null for three different reasons, and the app treats them the same because
 * the person is in the same place in all three: no code, a code no tenant
 * claims, and a code whose convention is over. The last one used to resolve
 * anyway — an expired convention kept Professional Support switched on for as
 * long as the employee kept the code in their profile.
 */
export function resolveCompanyCode(raw: string | null | undefined, now = Date.now()): Convention | null {
  if (!raw) return null
  const code = normalizeCode(raw)
  const found = allConventions().find((c) => c.code === code)
  if (!found) return null
  return conventionStatus(found, now) === 'expired' ? null : found
}

/** The contact the Safety Gateway should print: the company's EAP when one is
    configured, the generic crisis line otherwise. Never nothing. */
export function safetyContact(c: Convention | null): EapContact {
  return c?.eap ?? GENERIC_CRISIS
}
