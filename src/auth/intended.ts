/* ============================================================================
   The screen somebody asked for before they were asked to sign in

   A signed-out visitor who opens an app route — a bookmark, a link a
   colleague pasted, a tab left open since yesterday — is sent to the door at
   `#entrar`, because one address for signing in is worth more than a door
   that appears at any address (`AuthScreen.tsx`, the signed-out branch). The
   cost of that is this: the address they asked for is gone by the time they
   have typed their password, and they land on their role's home instead.

   Which is half of a pass criterion the pilot asks for in as many words:
   "The user is sent to the login screen and, after logging in, arrives at
   the originally requested screen."

   So the route is kept for exactly as long as it takes to sign in.

   WHY sessionStorage AND NOT a React ref or the URL. `ToTheDoor` crosses
   surfaces with a real page LOAD, deliberately — each surface mounts its own
   data layer and its own gate, and only a load puts a person on the right
   one. Nothing in memory survives that. sessionStorage does, and it is per
   TAB, so a second window signing in as somebody else is not sent to the
   first one's screen.

   WHAT IS REFUSED, and each for its own reason:

     · a public stage (the landing, "como funciona", the door itself) — the
       door is not a screen to be returned to, and the landing is where
       signing out already goes
     · anything carrying a token or an error (`access_token`, `type=recovery`,
       `error=…`) — a recovery link is its own flow with its own screen, and
       a spent token in sessionStorage is a token in one more place
     · anything unreasonably long, or not starting with `#` — a hash that
       shape is not one of ours

   The value is read ONCE and cleared in the same breath (`takeIntended`),
   so a stale route can never redirect a later sign-in on the same tab.
   ============================================================================ */

import { publicStage } from '../components/ambient/stage'

const KEY = 'gl.auth.intended'

/** Longer than any route we have; shorter than anything worth keeping. */
const MAX = 200

/** Is this a hash worth bringing somebody back to after they sign in? */
export function worthRemembering(hash: string): boolean {
  if (!hash || !hash.startsWith('#')) return false
  if (hash.length > MAX) return false
  /* A token, a recovery fragment, or an error Supabase put in the URL. */
  if (/(^|[#&?])(access_token|refresh_token|type=recovery|error(_code|_description)?=)/.test(hash)) return false
  /* The landing, the door and the marketing pages are not destinations. */
  if (publicStage(hash) !== null) return false
  return true
}

/** Keep the route, if it is one. Safe to call with anything. */
export function rememberIntended(hash: string): void {
  if (!worthRemembering(hash)) return
  try { sessionStorage.setItem(KEY, hash) } catch { /* private mode: they land home */ }
}

/** The kept route, removed as it is read. Null when there is none. */
export function takeIntended(): string | null {
  try {
    const v = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    return v && worthRemembering(v) ? v : null
  } catch { return null }
}

/** Forget it without using it — signing out, or a door that is not the one
    the route belongs to. */
export function clearIntended(): void {
  try { sessionStorage.removeItem(KEY) } catch { /* nothing to clear */ }
}
