/* ============================================================================
   Para empresas — what a sponsor gets, and what it must never be sold as

   The last card on this page is the most important thing on the public
   site. Good Loop MITIGATES: it offers sessions people listen to. It does
   not assess psychosocial risk, it does not produce a risk register, and it
   is not a PGR. A buyer who reads "NR-1" on a wellbeing page will assume
   all three unless the page says otherwise in plain words, so the page says
   it in plain words — and that card is not a footnote in grey, it is a card
   like the others.

   Nothing on this page promises a number, a score or an individual report.
   The one thing said about measurement is that the reports are anonymous
   and aggregate, which is the k-anonymity rule in the legal framework
   stated as a feature rather than as a limitation.
   ============================================================================ */

import { useI18n } from '../i18n'
import { DEMO_URL } from '../config/publicSite'

const CARDS: { title: string; text: string }[] = [
  {
    title: 'For the people using it',
    text: 'Audio sessions of 6, 12 or 24 minutes, to listen to whenever and wherever they like.',
  },
  {
    title: 'For HR',
    text: 'Simple to switch on, invitations by company code, and participation followed in aggregate numbers.',
  },
  {
    title: 'For the company',
    text: 'A concrete act of care for mental health, which can form part of the wellbeing measures in your programme.',
  },
]

const STEPS: { title: string; text: string }[] = [
  { title: 'First conversation', text: 'We get to know your team and what the programme is for.' },
  { title: 'Invitation by code', text: 'Everyone signs in with the company code — no account created by hand in HR.' },
  { title: 'Launch', text: 'Internal communication material, and guided first steps inside the app.' },
  { title: 'Follow-up', text: 'Regular reports, with anonymous and aggregate data only.' },
]

export function Empresas() {
  const { t } = useI18n()
  return (
    <article className="pub-page">
      <p className="pub-eyebrow">{t('For companies')}</p>
      <h1 className="pub-h1">
        {t('Pauses that find room')}{' '}
        <i className="pub-em">{t('in your team’s routine.')}</i>
      </h1>
      <p className="pub-sub">
        {t('Good Loop gives your people guided audio sessions, and supports your company’s wellbeing work in the context of NR-1.')}
      </p>

      {/* The one outward link on the site. It is a `mailto:` to the address
          the company dashboard already writes to; when there is a booking
          form, `config/publicSite.ts` is the single line that changes. */}
      {DEMO_URL && (
        <p className="pub-ctarow">
          <a className="pub-cta" href={DEMO_URL}>{t('Book a demo')}</a>
        </p>
      )}

      <div className="pub-cards pub-cards--3">
        {CARDS.map((c) => (
          <section className="pub-card" key={c.title}>
            <h2 className="pub-card__h pub-card__h--lg">{t(c.title)}</h2>
            <p className="pub-card__t">{t(c.text)}</p>
          </section>
        ))}
      </div>

      <h2 className="pub-h2">{t('How the rollout works')}</h2>
      <ol className="pub-steps">
        {STEPS.map((s, i) => (
          <li className="pub-step" key={s.title}>
            <span className="pub-step__n" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
            <div className="pub-step__body">
              <h3 className="pub-step__h">{t(s.title)}</h3>
              <p className="pub-step__t">{t(s.text)}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="pub-card pub-card--wide">
        <h2 className="pub-card__h pub-card__h--lg">{t('What Good Loop does not do')}</h2>
        <p className="pub-card__t">
          {t('Good Loop does not assess psychosocial risk and does not replace the PGR, nor psychological or medical care. It is a tool for care that complements that work.')}
        </p>
      </section>
    </article>
  )
}
