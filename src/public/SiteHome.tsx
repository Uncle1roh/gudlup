/* ============================================================================
   Home — one screenful, a claim and a way in

   v19's `#page-home`, which is the shortest page on the site: a headline, a
   sentence, and the button. There is nothing below the fold on purpose —
   everything a reader might want next is one of five words in the bar.
   ============================================================================ */

import { R_LOGIN, navigate } from '../components/ambient/stage'
import { useSite } from './lang'

export function SiteHome() {
  const { s, r } = useSite()
  return (
    <section className="glw-section glw-tight glw-home-hero">
      <div className="glw-wrap">
        <h1 className="glw-h1">{r('h_h1')}</h1>
        <p className="glw-sub">{s('h_sub')}</p>
        <div className="glw-home-cta">
          <a
            className="glw-btn glw-btn-enter"
            href={R_LOGIN}
            onClick={(e) => { e.preventDefault(); navigate(R_LOGIN) }}
          >
            {s('o_cta1')}
          </a>
        </div>
      </div>
    </section>
  )
}
