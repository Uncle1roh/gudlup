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

/**
 * Morning / afternoon / evening, by the person's own clock.
 *
 * The night belongs to the evening, not to the morning. `h < 12` alone said
 * "good morning" to somebody opening the app at one in the morning — which is
 * precisely the hour a person reaches for a sleep session, so it is not a rare
 * edge. Five o'clock is where the morning starts; before that the day that is
 * still running is yesterday's.
 */
export function greeting(now = new Date()): string {
  const h = now.getHours()
  if (h < 5) return 'Good evening'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

const ROLE_WORDS = /^(info|admin|hello|contact|support|noreply|no-reply|demo|test|user|usuario|usuário|utente)$/i

/**
 * One name to say hello with, out of whatever we were handed.
 *
 * It takes an address as readily as a name, on purpose: the profile's `name`
 * IS an address for most accounts. The sign-up form asks for a name and marks
 * it optional, and when it is left blank the account is created with the
 * email's local part in that field (`src/auth/auth.tsx`) — so "Lucas" signs
 * up, writes nothing, and the row that the whole app greets him by says
 * `lucas.pinto`. Splitting on the separators an address uses is therefore not
 * a trick played on names, it is the main path.
 *
 * Returns null rather than a placeholder when there is nothing usable:
 * "Good morning" on its own reads as a greeting, "Good morning, there" reads
 * as a bug, and "Good morning, Info" is worse than either.
 */
function friendly(raw?: string | null): string | null {
  let s = (raw ?? '').trim()
  if (!s) return null
  if (s.includes('@')) s = s.split('@')[0] ?? ''
  const first = s.split(/[\s._+-]+/).filter(Boolean)[0] ?? ''
  if (first.length < 2 || /^\d+$/.test(first)) return null
  if (ROLE_WORDS.test(first)) return null
  return first.charAt(0).toUpperCase() + first.slice(1)
}

/** "Wednesday, 7 September" — the eyebrow above the greeting. */
export function longDate(now = new Date()): string {
  return fmtDate(now.getTime(), { weekday: 'long', month: 'long', day: 'numeric' })
}

/** A first name to say hello with: `sofia.marchetti@acme.com` → "Sofia". */
export function displayName(email?: string | null, profileName?: string | null): string | null {
  /* The profile first, the address second. They are frequently the same
     string, and `friendly` treats both the same way, so the order only
     matters for the accounts where somebody did write their name. */
  return friendly(profileName) ?? friendly(email)
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
export function accountName(email?: string | null, profileName?: string | null): string {
  /* A name with a space in it was typed by a person and is printed whole —
     "Van Der Berg" is not a first name and a header must not shorten it. One
     unspaced token is as likely to be `lucas.pinto` as "Giulia", so it goes
     through the same reading as the greeting rather than onto the page. */
  const written = (profileName ?? '').trim()
  if (/\s/.test(written) && !written.includes('@')) return written
  const hello = displayName(email, profileName)
  if (hello) return hello
  const local = email?.split('@')[0]?.trim()
  return local && local.length >= 2 ? local : 'Utente'
}
