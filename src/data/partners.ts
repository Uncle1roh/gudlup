/* ============================================================================
   Good Loop — partner products

   Offers from partner brands: a product, the discount on it, and how to get
   it. Written in the admin console (Partner), shown on the Partner tab of the
   person's app. Catalogue, not personal data — see PARTNER PRODUCTS in
   setup.sql.
   ============================================================================ */

export interface PartnerProduct {
  id: string
  /** The brand, e.g. "Yoga Studio Roma". */
  partner: string
  /** The product or service on offer. */
  title: string
  description?: string
  /** Free text, so it can say what the offer really is: "-20%", "1 mese
      gratis", "2x1 il martedì". */
  discount?: string
  /** A code to quote at the partner, when the offer needs one. */
  promoCode?: string
  /** Where to redeem it. http(s) only. */
  url?: string
  imageUrl?: string
  active: boolean
  /** Lower first. */
  position: number
  createdAt: number
}

export function emptyPartnerProduct(): PartnerProduct {
  return { id: '', partner: '', title: '', active: true, position: 0, createdAt: 0 }
}

/** An http(s) address or nothing: the same rule as the table's CHECK, so a
    link typed in the console can never become a `javascript:` href. */
export function isHttpUrl(raw: string | undefined): boolean {
  if (!raw) return true
  return /^https?:\/\/\S+$/i.test(raw.trim())
}

export function sortPartnerProducts(list: PartnerProduct[]): PartnerProduct[] {
  return [...list].sort((a, b) =>
    a.position - b.position
    || a.partner.localeCompare(b.partner)
    || a.title.localeCompare(b.title))
}
