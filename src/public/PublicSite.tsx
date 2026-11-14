/* ============================================================================
   The door's shell: a logo, and the way back

   This file used to be the whole public site. The site is v19's now
   (`Site.tsx`), and what is left here is the frame the DOOR stands in,
   which that redesign does not touch: v19 is a marketing site that links
   out to the app and has no sign-in of its own, so the sign-in screen keeps
   the chrome it was built with — the photograph, the breathing rings, the
   mark top-left, and nothing else in the bar.

   THE BACKGROUND IS NOT HERE. The photograph, the rings and the scrim are
   drawn once at the app root (`components/ambient/`), because they outlive
   every page change and a page cannot animate something it unmounts. This
   tells the background which stage it is on by claiming it, and draws the
   mark over the top.

   The mark is a link home: from the door, that is the landing page. It is
   the only navigation the door has (10.2).
   ============================================================================ */

import { type ReactNode } from 'react'
import { useI18n } from '../i18n'
import { BrandLogo } from '../components/Brand'
import { HASH_FOR_STAGE, navigate, R_LANDING, useStageClaim } from '../components/ambient/stage'
import './public.css'

/* Never a reload: the background has to live through the change, or the
   rings cut instead of travelling. `navigate` is in `stage.ts`. */
const go = navigate

export function PublicSite({ door }: { door?: ReactNode }) {
  const { t } = useI18n()
  useStageClaim('login')

  return (
    <div className="pub pub--door">
      <header className="pub-head">
        <a
          className="pub-head__logo"
          href={window.location.pathname}
          aria-label={t('goodloop — home')}
          onClick={(e) => { e.preventDefault(); go(R_LANDING) }}
        >
          {/* The cream colourway: the door stands on the dark ground, and
              the green mark on near-black is the one pairing `Brand.tsx`
              explicitly does not allow. */}
          <BrandLogo variant="cream" />
        </a>
      </header>

      <main className="pub-main">{door}</main>

      <span className="pub-sr" aria-live="polite">{t('Sign in')}</span>
    </div>
  )
}

export { HASH_FOR_STAGE, go as goPublic }
