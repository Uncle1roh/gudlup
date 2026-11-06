/* ============================================================================
   Como funciona — three steps, and the six phases of a session

   The six phases are the real protocol structure (see
   docs/PROTOCOL_CATALOG.md), named for a stranger rather than clinically,
   and the little icon beside each one fills in as the session goes: one ring
   lit for the first two phases, two for the middle pair, all three for the
   last. It is the brand's mark used as a progress indicator, and it is the
   only thing on the public site that encodes anything about the product.

   The last line of the page says what none of it replaces. That sentence is
   not decoration and is not optional — it is the same one the library
   carries under its own heading.
   ============================================================================ */

import { useI18n } from '../i18n'
import { SAMPLE_AUDIO_URL } from '../config/publicSite'

const STEPS: { title: string; text: string }[] = [
  {
    title: 'Choose your moment',
    text: 'Before a meeting, mid-afternoon, at the end of the day. Choose by theme: focus, calm, energy, balance or growth.',
  },
  {
    title: 'Put your headphones on',
    text: 'The sessions use stereo sound: some sounds move from one ear to the other. With headphones the experience is complete.',
  },
  {
    title: 'Listen for 6, 12 or 24 minutes',
    text: 'Short for a breath, standard for every day, deep when you have more time.',
  },
]

/** Name, one line about it, and how many of the three rings are lit. */
const PHASES: { name: string; text: string; lit: number }[] = [
  { name: 'Welcome in', text: 'The session takes you exactly as you are.', lit: 1 },
  { name: 'Breathing', text: 'The body slows down and finds a safe base.', lit: 1 },
  { name: 'Exploration', text: 'You go into the theme of the session.', lit: 2 },
  { name: 'Processing', text: 'The heart of the session, with the layers of sound at their most present.', lit: 2 },
  { name: 'Integration', text: 'What you have just lived finds its place.', lit: 3 },
  { name: 'Return', text: 'You come back, little by little, to your day.', lit: 3 },
]

/** The mark at 44px, with the outer `lit` rings at full strength and the
    rest at a third. Decorative: the phase is named in words beside it. */
function PhaseMark({ lit }: { lit: number }) {
  const op = (i: number) => (i < lit ? 1 : 0.3)
  return (
    <svg className="pub-phase__mark" viewBox="0 0 44 44" aria-hidden="true" focusable="false">
      <circle cx="22" cy="22" r="20" fill="none" stroke="#B7DBAD" strokeWidth="1.6" opacity={op(0)} />
      <circle cx="22" cy="22" r="14" fill="none" stroke="#B7DBAD" strokeWidth="1.6" opacity={op(1)} />
      <circle cx="22" cy="22" r="8" fill="none" stroke="#B7DBAD" strokeWidth="1.6" opacity={op(2)} />
      <circle cx="22" cy="22" r="3" fill="#FAF8DF" />
    </svg>
  )
}

export function Como() {
  const { t } = useI18n()
  return (
    <article className="pub-page pub-page--como">
      <p className="pub-eyebrow">{t('How it works')}</p>
      <h1 className="pub-h1">
        {t('Three steps.')}{' '}
        <i className="pub-em">{t('One real pause.')}</i>
      </h1>
      <p className="pub-sub">
        {t('No complicated sign-up, no targets to hit. You choose, put your headphones on and listen.')}
      </p>

      <div className="pub-cards pub-cards--3">
        {STEPS.map((s, i) => (
          <section className="pub-card" key={s.title}>
            <span className="pub-card__num" aria-hidden="true">{i + 1}</span>
            <h2 className="pub-card__h">{t(s.title)}</h2>
            <p className="pub-card__t">{t(s.text)}</p>
          </section>
        ))}
      </div>

      <h2 className="pub-h2">{t('What happens in a session')}</h2>
      <ol className="pub-phases">
        {PHASES.map((p) => (
          <li className="pub-phase" key={p.name}>
            <PhaseMark lit={p.lit} />
            <h3 className="pub-phase__h">{t(p.name)}</h3>
            <p className="pub-phase__t">{t(p.text)}</p>
          </li>
        ))}
      </ol>
      <p className="pub-note">{t('In the short version, some phases are combined.')}</p>

      {/* Only when there is something to play. There is no cleared public
          extract yet, and a play button that plays nothing is worse than no
          card at all — `config/publicSite.ts` says why and what to change. */}
      {SAMPLE_AUDIO_URL && (
        <section className="pub-sample">
          <audio className="pub-sample__audio" src={SAMPLE_AUDIO_URL} controls preload="none" aria-label={t('Play the sample extract')} />
          <div className="pub-sample__words">
            <h2 className="pub-sample__h">{t('Listen to a piece of a session')}</h2>
            <p className="pub-sample__t">{t('Use headphones to hear the layers.')}</p>
          </div>
        </section>
      )}

      <p className="pub-fine">{t('Wellbeing content. It does not replace psychological or medical care.')}</p>
    </article>
  )
}
