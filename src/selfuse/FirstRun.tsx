/* ============================================================================
   Self Use — the first-run explainer

   People were arriving in the library and not knowing what the app is. There
   was nothing between registering and a shelf of covers: the library assumes
   you already know what a Good Loop session IS, and if you do not, a grid of
   pretty artwork does not tell you.

   So: three cards, once, on the first run. What it is, how long it takes, what
   to expect. Simple words — every line is meant to be read in one breath by
   someone who has not decided yet whether to care.

   Three rules it keeps:
   · It is ONE time. Finishing it or skipping it both stamp `tutorialSeenAt`,
     and the stamp is what the shell gates on. Profile → "How Good Loop Works"
     is where it lives afterwards, for anyone who wants it again.
   · It promises nothing clinical. Good Loop is a mitigation and wellbeing
     tool; the third card says in plain language that it does not replace
     medical or psychological care, because the first run is the honest place
     to say so.
   · The pictures are illustrations shipped in `public/tutorial`, one per
     card. They are `alt=""` and `aria-hidden`: the words carry the meaning,
     so a picture that has not loaded costs a person nothing.
   ============================================================================ */

import { useState } from 'react'
import { useI18n } from '../i18n'
import { BrandLogo } from '../components/Brand'
import { useSuTheme } from './theme'

interface Step {
  title: string
  body: string
  /** Key into ART below. */
  art: 'listen' | 'therapist' | 'method'
}

/* ------------------------------------------------------------- the art ----

   One illustration per card, from `public/tutorial`. They replace three
   drawn-in-SVG diagrams: the diagrams said what a session IS, and these say
   what the app is FOR — someone listening, a consultation, the work behind
   the protocols. Decorative: every one is `aria-hidden` and the words beside
   it carry the meaning. */

const ART: Record<string, { src: string; wide?: boolean }> = {
  listen:    { src: '/tutorial/t1.svg' },
  therapist: { src: '/tutorial/t2.svg', wide: true },
  method:    { src: '/tutorial/t3.svg' },
}

/* ------------------------------------------------------------ the words ---

   English is the key, Italian is in `it-selfuse.ts`, Portuguese in `pt.ts`.
   A title and one short paragraph each: a first run that needs scrolling is a
   first run people skip.

   Card 2 carries the line that Good Loop is not care and does not replace it.
   It belongs beside the mention of a therapist — that is where a person is
   deciding what this app is to them. */

const STEPS: Step[] = [
  {
    title: 'Press play and listen',
    body:
      'Good Loop is a library of short guided audio sessions for your wellbeing. Put your headphones on, choose one, and listen — a voice and the sound around it do the work. Six, twelve or twenty-four minutes, whichever fits the day you are having.',
    art: 'listen',
  },
  {
    title: 'Your therapist, inside the app',
    body:
      'If you are working with a therapist, this is where you meet: the sessions they assign you appear under Therapist, and your video appointments happen there too. Good Loop supports your wellbeing — it is not medical or psychological care and never replaces it.',
    art: 'therapist',
  },
  {
    title: 'The science behind the listening',
    body:
      'Phases, frequencies and voice are built on research in psychology and the neuroscience of sound, and tuned session by session by Giampiero. Nothing you hear is there by accident.',
    art: 'method',
  },
]

export function FirstRun({ onDone }: { onDone: () => void }) {
  const { t } = useI18n()
  const theme = useSuTheme()
  const [i, setI] = useState(0)
  const step = STEPS[i]
  const last = i === STEPS.length - 1

  return (
    <div className="app-frame su-studio">
      <div className="screen fr">
        <div className="fr__top">
          <BrandLogo variant={theme === 'light' ? 'green' : 'cream'} className="fr__brand" />
          {/* Skipping is not a different outcome: it is seen either way, and
              the whole thing stays in Profile. Nobody is held here. */}
          <button className="fr__skip" onClick={onDone}>{t('Skip')}</button>
        </div>

        {/* keyed on the step so the card fades in again on each move */}
        <figure className={`fr__art${ART[step.art].wide ? ' fr__art--wide' : ''}`} key={`art-${i}`}>
          <img className="fr-art" src={ART[step.art].src} alt="" aria-hidden="true" />
        </figure>

        <div className="fr__words" key={`words-${i}`}>
          <h1 className="display fr__title">{t(step.title)}</h1>
          <p className="lead fr__body">{t(step.body)}</p>
        </div>

        <div className="fr__foot">
          <div
            className="progress-dots"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={STEPS.length}
            aria-valuenow={i + 1}
            aria-label={t('Step {n} of {total}', { n: i + 1, total: STEPS.length })}
          >
            {STEPS.map((_, n) => <span key={n} className={n === i ? 'is-on' : ''} />)}
          </div>
          <button className="btn btn--primary" onClick={() => (last ? onDone() : setI(i + 1))}>
            {last ? t('Start listening') : t('Next')}
          </button>
          {i > 0 && (
            <button className="btn btn--quiet" onClick={() => setI(i - 1)}>{t('Back')}</button>
          )}
        </div>
      </div>
    </div>
  )
}
