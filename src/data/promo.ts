/* ============================================================================
   Good Loop — promo codes

   An admin mints a code with a discount percentage; a person types it at
   registration and the account carries it. The profile keeps a snapshot of
   the code and its percentage (written by the database, never by the client),
   so deleting a code stops new sign-ups using it and never changes what an
   existing account was promised. See the PROMO CODES block in setup.sql.
   ============================================================================ */

export interface PromoCode {
  code: string
  /** 1–100. */
  discountPct: number
  createdAt: number
  createdBy?: string
  /** Accounts registered with this code. */
  uses: number
}

/** Same rule as the table's CHECK: 3–32 chars, A–Z/0–9 and dashes, not
    starting with a dash. */
const PROMO_RX = /^[A-Z0-9][A-Z0-9-]{2,31}$/

export function normalizePromoCode(raw: string): string {
  return raw.trim().toUpperCase()
}

export function isValidPromoCode(raw: string): boolean {
  return PROMO_RX.test(normalizePromoCode(raw))
}

export function isValidDiscount(pct: number): boolean {
  return Number.isInteger(pct) && pct >= 1 && pct <= 100
}

/** No I, O, 0 or 1 — a promo code gets read out loud and copied off posters. */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

export function generatePromoCode(length = 8): string {
  const bytes = new Uint32Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length]
  return out
}
