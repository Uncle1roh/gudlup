/* ============================================================================
   Moduli — the two ways in, and the asterisk that answers itself

   v19's `#page-modules`. Two cards: Self-Guided Use, which anybody with an
   account has, and Professionally Guided Use, which a licensed professional
   runs. The second carries an asterisk and the footnote under both cards
   says what it means — corporate contracts only.

   THE SECOND CARD'S LAST LINE IS THE IMPORTANT ONE. In Professionally
   Guided Use the professional selects and sequences the content and remains
   the sole treating party; goodloop supplies a catalogue and a technology
   and makes no clinical decision. That is the same division the footer's
   disclaimer states and the legal corpus registers, and it is said here
   because this is the page where somebody decides which door they are
   looking at.
   ============================================================================ */

import { R_CONTATO, R_LOGIN, navigate } from '../components/ambient/stage'
import { useSite } from './lang'

export function SiteModules() {
  const { s, r } = useSite()
  return (
    <>
      <div className="glw-orb glw-orb-a" />
      <div className="glw-orb glw-orb-b" />
      <section className="glw-section glw-tight">
        <div className="glw-wrap">
          <span className="glw-eyebrow">{s('o_eyebrow')}</span>
          <h1 className="glw-h1">{s('o_h1')}</h1>
          <p className="glw-sub">{r('o_sub')}</p>

          <div className="glw-cards2">
            <div className="glw-mcard">
              <div className="glw-ic">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1FBF94" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
                  <rect x="2.5" y="13" width="4" height="6" rx="1.5" />
                  <rect x="17.5" y="13" width="4" height="6" rx="1.5" />
                </svg>
              </div>
              <h2>{s('m1_name')}</h2>
              <p className="glw-grow">{s('m1_desc')}</p>
              <a
                className="glw-btn glw-btn-enter"
                href={R_LOGIN}
                onClick={(e) => { e.preventDefault(); navigate(R_LOGIN) }}
              >
                {s('o_cta1')}
              </a>
            </div>

            <div className="glw-mcard">
              <div className="glw-ic">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1FBF94" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              </div>
              <h2>{s('m2_name')}</h2>
              <p>{s('m2_desc')}</p>
              {/* Who treats, and who does not. */}
              <p className="glw-pro glw-grow">{s('m2_pro')}</p>
              <a
                className="glw-btn glw-btn-outline"
                href={R_CONTATO}
                onClick={(e) => { e.preventDefault(); navigate(R_CONTATO) }}
              >
                {s('o_cta2')}
              </a>
            </div>
          </div>

          <p className="glw-foot">{s('o_foot')}</p>
        </div>
      </section>
    </>
  )
}
