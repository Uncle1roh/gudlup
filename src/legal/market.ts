/* ============================================================================
   Good Loop — market-driven configuration (ONB-03 / ONB-04)

   Where a person lives decides their crisis numbers, the withdrawal period,
   the governing annex of the Terms, the supervisory authority and the
   professional council they may complain to. All of that hangs off ONE
   field — the market on the profile — and nothing in a screen branches on a
   country name (Feature Register rule 5: "drive them from the user's market
   setting"). Adding a territory means adding a row here, not a branch there.

   Crisis NUMBERS are deliberately not the source of truth in this file: they
   live in the crisis_resources table with a last-verified date (CRS-03), so a
   changed helpline is a row edit and not a release. The DEFAULT_CRISIS list
   below is the seed for that table and the fallback when the database cannot
   be reached — a person in crisis must never meet an empty sheet.
   ============================================================================ */

import type { Market } from './messages'

/** ISO 3166-1 alpha-2 codes of the territories where Good Loop is offered
    (D-12). A country not in this list is blocked at sign-up (ONB-1.4). */
export const SUPPORTED_COUNTRIES: { code: string; market: Market; label: { en: string; it: string; 'pt-BR': string } }[] = [
  { code: 'BR', market: 'BR', label: { en: 'Brazil', it: 'Brasile', 'pt-BR': 'Brasil' } },
  { code: 'IT', market: 'EU', label: { en: 'Italy', it: 'Italia', 'pt-BR': 'Itália' } },
]

/** The other countries offered in the selector, so a person can say where
    they live and be told, honestly, that the service is not offered there
    yet — rather than being made to lie about their country. */
export const OTHER_COUNTRIES: { code: string; label: { en: string; it: string; 'pt-BR': string } }[] = [
  { code: 'PT', label: { en: 'Portugal', it: 'Portogallo', 'pt-BR': 'Portugal' } },
  { code: 'ES', label: { en: 'Spain', it: 'Spagna', 'pt-BR': 'Espanha' } },
  { code: 'FR', label: { en: 'France', it: 'Francia', 'pt-BR': 'França' } },
  { code: 'DE', label: { en: 'Germany', it: 'Germania', 'pt-BR': 'Alemanha' } },
  { code: 'GB', label: { en: 'United Kingdom', it: 'Regno Unito', 'pt-BR': 'Reino Unido' } },
  { code: 'US', label: { en: 'United States', it: 'Stati Uniti', 'pt-BR': 'Estados Unidos' } },
  { code: 'AR', label: { en: 'Argentina', it: 'Argentina', 'pt-BR': 'Argentina' } },
  { code: 'XX', label: { en: 'Another country', it: 'Un altro Paese', 'pt-BR': 'Outro país' } },
]

export function marketForCountry(code: string | null | undefined): Market | null {
  const row = SUPPORTED_COUNTRIES.find(c => c.code === code)
  return row ? row.market : null
}

/** The market to assume before a person has told us where they live — from
    the interface language, which is the least wrong guess available. */
export function marketForLocale(locale: string): Market {
  return locale === 'pt-BR' ? 'BR' : 'EU'
}

/* --- crisis resources ---------------------------------------------------- */

export interface CrisisResource {
  id: string
  market: Market
  /** Order on the sheet: numbers first, emotional support first of all. */
  position: number
  /** Short label a person reads next to the number — "CVV", "SAMU". */
  label: string
  /** What is dialled; digits only, so it can be a tel: link. */
  number: string
  /** "24h, free" — kept short; the sheet is action-first. */
  hours?: string
  url?: string
  /** A person in crisis should never follow a number nobody has checked. */
  lastVerifiedAt: string | null
  verifiedBy: string | null
  active: boolean
}

/** Seed / fallback. The Brazilian numbers are the ones D-03 names; the EU
    sheet carries 112 only, because the national support line for each
    country is a bracketed placeholder in the deliverable that the owner
    verifies and adds through the admin console — never from memory. */
export const DEFAULT_CRISIS: CrisisResource[] = [
  { id: 'br-cvv', market: 'BR', position: 1, label: 'CVV', number: '188', hours: '24h · free', url: 'https://cvv.org.br', lastVerifiedAt: null, verifiedBy: null, active: true },
  { id: 'br-samu', market: 'BR', position: 2, label: 'SAMU', number: '192', lastVerifiedAt: null, verifiedBy: null, active: true },
  { id: 'br-police', market: 'BR', position: 3, label: 'Police', number: '190', lastVerifiedAt: null, verifiedBy: null, active: true },
  { id: 'eu-112', market: 'EU', position: 1, label: 'Emergency', number: '112', lastVerifiedAt: null, verifiedBy: null, active: true },
]

/** CRS-03: alert the console when a number has not been checked for 90 days. */
export const CRISIS_VERIFY_DAYS = 90

export function crisisVerificationOverdue(r: CrisisResource, now = Date.now()): boolean {
  if (!r.lastVerifiedAt) return true
  return now - Date.parse(r.lastVerifiedAt) > CRISIS_VERIFY_DAYS * 86_400_000
}

/* --- authorities and councils ------------------------------------------ */

export interface MarketAuthority {
  /** Data-protection supervisory authority a person may complain to. */
  dpa: { name: string; url: string }
  /** The professional body a complaint about a psychologist goes to (PRF-2). */
  council: { name: string; short: string; url: string }
  /** Consumer routes named in the governing annex. */
  consumer: { name: string; url: string }[]
}

export const AUTHORITIES: Record<Market, MarketAuthority> = {
  BR: {
    dpa: { name: 'Autoridade Nacional de Proteção de Dados (ANPD)', url: 'https://www.gov.br/anpd' },
    council: { name: 'Conselho Regional de Psicologia', short: 'CRP', url: 'https://site.cfp.org.br' },
    consumer: [
      { name: 'PROCON', url: 'https://www.gov.br/mj/pt-br/assuntos/seus-direitos/consumidor' },
      { name: 'consumidor.gov.br', url: 'https://www.consumidor.gov.br' },
    ],
  },
  EU: {
    dpa: { name: 'Garante per la protezione dei dati personali', url: 'https://www.garanteprivacy.it' },
    council: { name: 'Ordine degli Psicologi', short: 'Ordine', url: 'https://www.psy.it' },
    consumer: [
      { name: 'European online dispute resolution platform', url: 'https://ec.europa.eu/consumers/odr' },
    ],
  },
}

/** Data-request deadline: fifteen calendar days for every user in every
    market (DSR spec rule 1 — the Brazilian period is the shorter and is not
    extendable, and one clock is safer than two). */
export const DSR_DAYS = 15

/** Complaints: acknowledge within 2 working days, reply within 10 (cl. 19.1). */
export const COMPLAINT_ACK_WORKING_DAYS = 2
export const COMPLAINT_REPLY_WORKING_DAYS = 10

/** Notice period before sponsored access changes (S6) or Terms change (cl. 21). */
export const NOTICE_DAYS = 30

/** Professional registration is re-checked every six months (M2R-02). */
export const REVERIFY_MONTHS = 6

/** Minimum cohort for any sponsor figure (D-08 / SPN-02). Must equal the
    number in the Master Services Agreement. */
export const MIN_COHORT = 25

export function addWorkingDays(from: Date, days: number): Date {
  const d = new Date(from)
  let left = days
  while (left > 0) {
    d.setDate(d.getDate() + 1)
    const wd = d.getDay()
    if (wd !== 0 && wd !== 6) left--
  }
  return d
}
