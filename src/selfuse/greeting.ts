/* ============================================================================
   Self Use — how the app says hello

   Three small functions that used to live inside the old Home screen. They
   moved here when Home became the library, because the greeting outlived the
   screen it was written for and should not depend on a component nobody
   routes to any more.

   The name comes from the email's local part, which is a guess and is treated
   as one: it is used to be friendly, never to address someone formally and
   never in anything clinical. When there is nothing to go on the app says
   hello without a name rather than inventing one.
   ============================================================================ */

import { fmtDate } from '../i18n'

/** Morning / afternoon / evening, by the person's own clock. */
export function greeting(now = new Date()): string {
  const h = now.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

/** "Wednesday, 7 September" — the eyebrow above the greeting. */
export function longDate(now = new Date()): string {
  return fmtDate(now.getTime(), { weekday: 'long', month: 'long', day: 'numeric' })
}

/**
 * A first name to say hello with, from an email address.
 *
 * `sofia.marchetti@acme.com` → "Sofia". Returns null rather than a placeholder
 * when there is nothing usable: "Good morning" on its own reads as a greeting,
 * "Good morning, there" reads as a bug. Anything that looks like a role
 * account or is all digits is dropped for the same reason — "Good morning,
 * Info" is worse than no name.
 */
export function displayName(email?: string | null): string | null {
  if (!email) return null
  const local = email.split('@')[0] ?? ''
  const first = local.split(/[._+-]/)[0]?.trim() ?? ''
  if (first.length < 2 || /^\d+$/.test(first)) return null
  if (/^(info|admin|hello|contact|support|noreply|no-reply|demo|test)$/i.test(first)) return null
  return first.charAt(0).toUpperCase() + first.slice(1)
}

/**
 * A name for places that must print SOMETHING — a report header, the profile
 * row — where a blank would look like missing data rather than a greeting
 * without a name.
 *
 * Falls back to the email's local part as written, and only then to a neutral
 * word. Kept apart from `displayName` on purpose: a PDF header and a hello are
 * different jobs, and the hello is allowed to say nothing.
 */
export function accountName(email?: string | null): string {
  const friendly = displayName(email)
  if (friendly) return friendly
  const local = email?.split('@')[0]?.trim()
  return local && local.length >= 2 ? local : 'Utente'
}
