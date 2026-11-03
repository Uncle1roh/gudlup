/* ============================================================================
   ONE BACKGROUND, from the edge of the screen (POs, 2026-11-03)

   THE DEFECT. Tapping a protocol opened a screen standing on that protocol's
   own cover — and across the top, about fifty pixels of it, the app's
   mountain photograph, left over from the screen before. Two pictures, one
   seam, on the screen whose whole job is to make you want to listen.

   WHY IT WAS THERE. The Help now strip is above the surface, always, by
   requirement (CRS-01): one tap from every screen, never covered by
   anything. So `.sess-full` and the player are absolutely positioned inside
   `.gl-root`, which starts BELOW that strip — and the strip is transparent,
   with the page's own ground showing through it.

   THE FIX. While a protocol screen is open, the PAGE carries the protocol's
   cover: the picture runs behind the Help now button, the strip stops being
   a strip, and the Help button is still a button. `<html>` gets the cover in
   `--gl-session-image` and `data-gl-session='on'`, which is what the rule in
   `shell.css` keys off; the elements stop painting their own copy there, so
   there is exactly one picture, cropped once, to the window.

   It is removed on unmount, so leaving a session takes the standard ground
   back by itself — there is no cleanup to forget and no global to reset.
   ============================================================================ */

import { useEffect } from 'react'

/* TWO SCREENS CAN WANT IT AT ONCE, and one of them leaves first.
   `SessionFlow` holds the ground for the whole flow while `PreSession`, its
   own first stage, asks for the same picture — so when the pre-session card
   unmounted, its cleanup took the ground away from the player that was still
   standing on it, and the mountains came back mid-session. The claims are
   counted: the ground is cleared when the LAST one goes, not the first. */
let claims: { id: number; image: string }[] = []
let nextId = 0

function apply(): void {
  const root = document.documentElement
  const top = claims[claims.length - 1]
  if (!top) {
    root.style.removeProperty('--gl-session-image')
    delete root.dataset.glSession
    return
  }
  root.style.setProperty('--gl-session-image', top.image)
  root.dataset.glSession = 'on'
}

/**
 * Paint `image` (a CSS `url(…)` value, from `selfuse/artwork.ts`) as the
 * ground of the whole window for as long as the calling screen is mounted.
 *
 * Null is a no-op, so a screen that may or may not have a cover can call it
 * unconditionally — the hook count must not change between renders.
 */
export function usePageSessionGround(image: string | null): void {
  useEffect(() => {
    if (!image) return
    const id = nextId += 1
    claims.push({ id, image })
    apply()
    return () => {
      claims = claims.filter((x) => x.id !== id)
      apply()
    }
  }, [image])
}
