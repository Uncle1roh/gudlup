/* ============================================================================
   The two switches the POs have not decided yet

   Both are listed as open decisions in the spec, so neither is wired to a
   guess. They are constants with a comment saying who decides, which is the
   honest shape for "not yet": one line to change, and nothing to hunt for.
   ============================================================================ */

/**
 * The A/B pilot (spec § Validação).
 *
 * `false` — everybody gets the colour. This is the shipped default, because
 * the POs have not decided whether the pilot starts in v1.
 *
 * `true` — the variant is drawn once per person, stored with their rows, and
 * group B sees the identical check-in on a fixed neutral grey. Nothing else
 * changes: both groups answer the same two axes and the same words, which is
 * what makes the comparison worth anything.
 */
export const AB_PILOT_ENABLED = false

/**
 * Mood data may be health data: LGPD sensitive data, GDPR art. 9.
 *
 * TODO (legal, before launch) — the current consent text (`measurement`,
 * D-05 in the legal corpus) covers "medidas de bem-estar" and does NOT
 * mention emotional state in so many words. Someone with the authority to
 * write legal text has to decide whether it covers a mood diary or whether a
 * new purpose is needed. No text is invented here.
 *
 * Until that is answered, the rule below is the conservative one: without
 * the existing measurement consent, the check-in still runs and still
 * colours the app — in memory, on this device, for this session — and
 * NOTHING is written to the database. The screen says so.
 */
export const MOOD_CONSENT_PURPOSE = 'measurement' as const

/** Rows are only written when this is true for the person. */
export function mayStoreMood(hasMeasurementConsent: boolean): boolean {
  return hasMeasurementConsent
}
