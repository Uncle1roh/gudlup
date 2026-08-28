/* ============================================================================
   Good Loop — coming back from the Studio to the protocol you left

   The admin app routes with local state, not with the hash, so "#admin" only
   ever lands on the catalog LIST. Going Studio → back therefore dropped you two
   steps away from where you were working: find the protocol again, click it
   again, pick the time signature again. Every time.

   This remembers the one thing needed to put you back: which protocol and which
   time signature. `CatalogAdmin` reads it once on mount and opens that
   workscreen directly.

   In sessionStorage rather than a module variable because leaving the Studio is
   a real navigation — the whole app re-renders and a reload here is ordinary.
   ============================================================================ */

import type { Duration } from '../types/domain'

const KEY = 'gl.admin.returnto'

export interface WorkscreenTarget {
  code: string
  duration?: Duration
}

export function setReturnToProtocol(target: WorkscreenTarget): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(target))
  } catch {
    /* private mode — the back button just lands on the list, as before */
  }
}

/** Read it once and clear it: this is a one-way trip back, and a stale target
    must not hijack the catalog the next time it is opened. */
export function takeReturnToProtocol(): WorkscreenTarget | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as WorkscreenTarget
    return parsed && typeof parsed.code === 'string' ? parsed : null
  } catch {
    return null
  }
}
