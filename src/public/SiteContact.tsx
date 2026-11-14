/* ============================================================================
   Contatti — two doors, support and commercial

   v19's `#page-contact`. It is not in the bar: it is reached from the
   footer, from "Parla con noi" on the modules page, and from the old
   `#para-empresas` hash, which a deck and a handful of e-mails still carry
   (`stage.ts`).

   SUPPORT'S ADDRESS FOLLOWS THE LANGUAGE — support@ / supporto@ / suporte@
   — exactly as v19 switches it. The commercial one does not.
   ============================================================================ */

import { useSite } from './lang'
import { MAIL_INFO, supportMail } from './Site'

export function SiteContact() {
  const { s, r, lang } = useSite()
  const support = supportMail(lang)
  return (
    <>
      <div className="glw-orb glw-orb-a" />
      <div className="glw-orb glw-orb-b" />
      <section className="glw-section glw-tight">
        <div className="glw-wrap">
          <span className="glw-eyebrow">{s('k_eyebrow')}</span>
          <h1 className="glw-h1">{s('k_h1')}</h1>
          <p className="glw-sub">{r('k_sub')}</p>

          <div className="glw-contact-boxes">
            <div className="glw-ccard">
              <div className="glw-ic">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1FBF94" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7" />
                  <path d="M12 17h.01" />
                </svg>
              </div>
              <h2>{s('ks_title')}</h2>
              <p>{s('ks_desc')}</p>
              <ul>
                <li>{s('ks_b1')}</li>
                <li>{s('ks_b2')}</li>
                <li>{s('ks_b3')}</li>
              </ul>
              <a className="glw-btn glw-btn-outline" href={`mailto:${support}`}>{s('ks_cta')}</a>
              <a className="glw-mail" href={`mailto:${support}`}>{support}</a>
            </div>

            <div className="glw-ccard">
              <div className="glw-ic">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1FBF94" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="7" width="18" height="12" rx="2" />
                  <path d="M3 9l9 6 9-6" />
                </svg>
              </div>
              <h2>{s('kc_title')}</h2>
              <p>{r('kc_desc')}</p>
              <ul>
                <li>{s('kc_b1')}</li>
                <li>{s('kc_b2')}</li>
                <li>{s('kc_b3')}</li>
              </ul>
              <a className="glw-btn glw-btn-accent" href={`mailto:${MAIL_INFO}`}>{s('kc_cta')}</a>
              <a className="glw-mail" href={`mailto:${MAIL_INFO}`}>{MAIL_INFO}</a>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
