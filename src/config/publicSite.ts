/* ============================================================================
   The two outward-facing links the public pages need

   Both are here rather than in the components because neither is a design
   decision: one is a sales address the team owns, and the other is a file
   that does not exist yet. An empty string is not a bug — the page checks,
   and simply does not draw the thing it would have pointed at. A card with
   a play button that plays nothing is worse than no card.
   ============================================================================ */

/**
 * A short extract of a real session, for the "listen to a piece of one"
 * card on Como funciona.
 *
 * EMPTY ON PURPOSE. Nothing in the catalogue is cleared for public,
 * un-gated listening: every protocol is addressed to a listener, recorded
 * per language and per gender, and published to a library behind a login.
 * Putting one on a marketing page is a decision for the POs and probably a
 * purpose-made cut, not a link to an existing asset. Until there is a file,
 * the card is not rendered at all (brief section 11).
 *
 * To turn the card on: drop the file in `public/media/` and point at it,
 * e.g. `/media/sample-como-funciona.mp3`.
 */
export const SAMPLE_AUDIO_URL = ''

/**
 * Where "Agendar demonstração" goes.
 *
 * The one address the product writes to, the same one the company
 * dashboard uses for a licence question (POs, 2026-11-10: everything to
 * Suporte@goodloop.com.br). It is a `mailto:` and not a booking form
 * because there is no booking form — when there is one, this is the single
 * line that changes.
 */
export const DEMO_URL = 'mailto:Suporte@goodloop.com.br?subject=Good%20Loop%20—%20demonstra%C3%A7%C3%A3o'
