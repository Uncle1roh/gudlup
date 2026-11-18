/* ============================================================================
   What a professional registration number is allowed to look like

   THE PROBLEM THIS SOLVES. `therapists.crp` is one text column, and two
   screens disagreed about what goes in it.

     · The clinician's registration (`workspace/Onboarding.tsx`) asks for the
       NUMBER and the REGION separately — the region is a select, and it is
       stored in its own column, `registry_region`. So it writes `158342`.
     · The credentialing screen (`b2b/Credentialing.tsx`) tested the field
       against /^CRP\s?\d{2}\/\d{4,6}$/ — the full form, region included, as
       the demo fixtures hold it (`CRP 06/98211`).

   A real clinician therefore registered, opened the credentialing screen,
   and was told "Formato atteso: CRP 04/12345" about their own correct
   number — and `submit()` returns early on an invalid format, so the screen
   that exists to send a document could not send one. Doing what the hint
   asked typed the region a second time into a field that is not where the
   region lives, which is the duplication the registration form had just had
   removed from it.

   So BOTH shapes are accepted, because both are in the database already and
   neither is wrong:

     158342             the number, with the region in its own column
     CRP 06/158342      the full form, as older rows and the fixtures hold it
     Ordine 12345       the Italian register, same two shapes

   WHAT IS STILL REFUSED, which is the point of validating at all: empty, a
   name, a number of implausible length, punctuation that belongs to no
   register. An invalid value reaching a reviewer is a review of nothing.

   WHAT THIS IS NOT. It is a FORMAT check, never a check that the number
   exists or belongs to the person. That is the document upload and a human
   reviewer, and nothing here should read as if the platform had verified a
   licence (`docs/ACCESS_MATRIX.md`).
   ============================================================================ */

/** The bare number: 4–6 digits, which is what both registers issue. */
const BARE = /^\d{4,6}$/

/** The full form, region included — `CRP 06/158342`, `Ordine 12/3456`. */
const FULL = /^(CRP|ORDINE)\s?\d{2}\/\d{4,6}$/i

/** Does this look like a registration number we can send to a reviewer?
    Either shape, because both are in the database already. Use this where a
    STORED value is read back — the credentialing screen. */
export function looksLikeRegistration(raw: string): boolean {
  const v = raw.trim()
  return BARE.test(v) || FULL.test(v)
}

/**
 * The strict one: the number ALONE.
 *
 * Used where the form asks for the region in a field of its own — the
 * clinician's registration. Accepting `CRP 06/158342` there would pass a
 * value that carries the region twice, into a column that is not where the
 * region lives, which is the duplication that form had removed from it. The
 * message beside the field promises digits, so this is what enforces it.
 */
export function isBareRegistrationNumber(raw: string): boolean {
  return BARE.test(raw.trim())
}

/** The hint under the field: what to type, given which register is selected.
    Returns an English key — the caller translates. */
export function registrationHint(registry: string | null | undefined): string {
  return registry === 'Ordine'
    ? 'Just the number, for example 12345 — the region is the field beside it.'
    : 'Just the number, for example 158342 — the region is the field beside it.'
}
