/* ============================================================================
   Chi siamo — the company, the clinician, and the two founding partners

   v19's `#page-about`. The credential line under the name is a real
   registration (Albo Nazionale, Sez. A, Ordine Psicologi Piemonte n. 6278)
   and is printed as the POs wrote it, in each language: a number a reader
   can check is the opposite of a claim, and shortening it would make it
   one.

   THE PHOTOGRAPH is `public/media/varetti.jpg`, and on 2026-11-23 it became
   a different photograph. The app had been carrying the portrait it was
   built with in October; the POs' own file (`Good Loop Visual ID/Website
   goodloop_v25.html`, 2026-11-20) had replaced it with a newer one, and the
   two surfaces were showing the same man at two different ages. v25 is the
   later decision, so the site follows it. The one it replaced is kept beside
   it as `varetti-2026-11-12.jpg` rather than deleted.

   It arrives at 400×400, which is exactly 2× the 176px circle it is drawn
   in and no more; the file it replaced was 1092×. Worth asking the POs for
   a larger export before anyone enlarges that circle.
   ============================================================================ */

import { useSite } from './lang'

const PORTRAIT = '/media/varetti.jpg'

export function SiteAbout() {
  const { s, r } = useSite()
  return (
    <>
      <div className="glw-orb glw-orb-a" />
      <div className="glw-orb glw-orb-b" />
      <section className="glw-section glw-tight">
        <div className="glw-wrap">
          <span className="glw-eyebrow">{s('a_eyebrow')}</span>
          <h1 className="glw-h1" style={{ maxWidth: 820 }}>{s('a_h1')}</h1>
          <p className="glw-sub">{r('a_sub')}</p>

          <div className="glw-founder" style={{ marginTop: 40 }}>
            <div className="glw-ph"><img src={PORTRAIT} alt="Giampiero Varetti" /></div>
            <div>
              <span className="glw-role">{s('a_role')}</span>
              <h3>Giampiero Varetti</h3>
              <p className="glw-cred">{s('a_cred')}</p>
              <p className="glw-bio">{r('a_bio')}</p>
            </div>
          </div>

          <h2 className="glw-partners-title" style={{ fontSize: '1.25rem' }}>{s('a_partners')}</h2>
          <div className="glw-cards2" style={{ marginTop: 0 }}>
            <div className="glw-pcard">
              <span className="glw-tag">{s('a_p1tag')}</span>
              <h3>GAM Tecnologia e Participações</h3>
              <p>{r('a_p1d')}</p>
            </div>
            <div className="glw-pcard">
              <span className="glw-tag">{s('a_p2tag')}</span>
              <h3>Quokkas</h3>
              <p>{r('a_p2d')}</p>
            </div>
          </div>

          {/* v25 — the technology partner, on a row of its own. Not a founding
              partner, which is why it is not a third column beside the two:
              the tag says what each one is, and a grid of three would say they
              are the same kind of thing. */}
          <div className="glw-cards2" style={{ marginTop: 20 }}>
            <div className="glw-pcard">
              <span className="glw-tag">{s('a_p3tag')}</span>
              <h3>Bachmann Studio</h3>
              <p>{r('a_p3d')}</p>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
