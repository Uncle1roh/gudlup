/* ============================================================================
   An invitation link that opens the form, filled in

   WHAT IT IS FOR. The code and the address are the two things a person being
   invited must get exactly right, and the two they have no way to check. A
   company code is read off an e-mail and typed from memory
   ("LOONEY-2026-BR" — one hyphen wrong and the account is created with no
   company behind it); the ADDRESS has to be the one their employer approved,
   which is often not the one they would have reached for. Both were being
   asked of somebody who had just been dropped on the home page.

   So an invitation carries them, and the form opens with both in place.

   IT GRANTS NOTHING. This is worth being plain about, because a link that
   fills in an identity looks like a link that proves one. It fills two
   fields. The person still sets a password, their address is still checked
   against the company's own roster inside the database (`company_email_status`,
   enforced by a trigger on `profiles`, not by this form), and the code still
   has to resolve to a live contract. A forwarded link enrols nobody it was
   not already going to enrol — it only saves the typing.

   WHY THE REAL QUERY STRING AND NOT THE HASH. The app routes on
   `window.location.hash`, compared as a whole string in a dozen places
   (`route === '#admin'`). A hash of `#entrar?code=X` matches none of them,
   so putting the parameters there would have broken routing to fix typing.
   `?code=X#entrar` leaves the hash exactly as the router expects it.

   AND IT IS CLEARED once read. The address has done its job by then, and an
   e-mail address left in the URL bar outlives its usefulness in screen
   shares, in browser history and in whatever a person pastes next.
   ============================================================================ */

import { looksLikeCompanyCode, normalizeCode } from '../data/convention'

/** Which door the invitation opens: an employee's own account, or the
    company panel for whoever runs the contract. */
export type InviteKind = 'b2c_user' | 'company'

export interface Invite {
  /** Normalised, and only when it has the shape of a company code. */
  code: string | null
  email: string | null
  kind: InviteKind
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The link to put in an invitation. */
export function inviteUrl(i: { code: string; email?: string | null; kind?: InviteKind }): string {
  const q = new URLSearchParams()
  q.set('code', normalizeCode(i.code))
  const email = i.email?.trim()
  if (email && EMAIL_RE.test(email)) q.set('email', email.toLowerCase())
  if (i.kind === 'company') q.set('for', 'company')
  const { origin, pathname } = window.location
  return `${origin}${pathname}?${q.toString()}#entrar`
}

/**
 * What the current URL is inviting, or null.
 *
 * Every part is validated and a bad part is simply dropped: a mangled link
 * must still open a form somebody can fill in by hand, never an error page.
 */
export function readInvite(): Invite | null {
  let params: URLSearchParams
  try {
    params = new URLSearchParams(window.location.search)
  } catch {
    return null
  }
  const rawCode = params.get('code')?.trim() ?? ''
  const rawEmail = params.get('email')?.trim().toLowerCase() ?? ''
  const code = rawCode && looksLikeCompanyCode(rawCode) ? normalizeCode(rawCode) : null
  const email = rawEmail && EMAIL_RE.test(rawEmail) ? rawEmail : null
  if (!code && !email) return null
  return { code, email, kind: params.get('for') === 'company' ? 'company' : 'b2c_user' }
}

/** Take the invitation out of the URL, keeping the hash and the history
    entry. Called once the form has the values. */
export function clearInvite(): void {
  try {
    const { origin, pathname, hash } = window.location
    window.history.replaceState(null, '', `${origin}${pathname}${hash}`)
  } catch {
    /* A sandboxed frame: the address bar keeps the parameters, which costs
       tidiness and nothing else. */
  }
}
