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
   · The pictures are drawn here, in SVG, on the palette's own tokens. No
     files to ship, nothing to load, nothing to go missing behind a slow
     network on the one screen a person sees before anything else.
   ============================================================================ */

import { useState, type ReactNode } from 'react'
import { useI18n } from '../i18n'

interface Step {
  title: string
  body: string
  art: ReactNode
}

/* ------------------------------------------------------------- the art ----

   Three pictures on the same 160 grid, in the same two colours the rest of
   the surface uses: emerald carries the subject, cream marks the one thing
   the eye should land on. Decorative — every one is `aria-hidden`, and the
   text beside it says everything they say. */

/** Sound arriving at a pair of headphones: what a session physically is. */
function ArtListen() {
  return (
    <svg className="fr-art" viewBox="0 0 160 160" fill="none" aria-hidden="true">
      <circle className="fr-art__wash" cx="80" cy="84" r="54" />
      <circle className="fr-art__ring" cx="80" cy="84" r="42" />
      <circle className="fr-art__ring fr-art__ring--soft" cx="80" cy="84" r="52" />
      <circle className="fr-art__core" cx="80" cy="84" r="17" />
      <path className="fr-art__stroke" d="M40 84v-6a40 40 0 0 1 80 0v6" />
      <rect className="fr-art__solid" x="30" y="80" width="18" height="34" rx="9" />
      <rect className="fr-art__solid" x="112" y="80" width="18" height="34" rx="9" />
    </svg>
  )
}

/** Three lengths of the same session, as three rings filled a quarter, a half
    and the whole way round. No numerals to translate. */
function ArtLengths() {
  return (
    <svg className="fr-art" viewBox="0 0 160 160" fill="none" aria-hidden="true">
      <circle className="fr-art__wash" cx="80" cy="80" r="56" />
      <g transform="rotate(-90 80 80)">
        <circle className="fr-art__track" cx="80" cy="80" r="26" />
        <circle className="fr-art__track" cx="80" cy="80" r="40" />
        <circle className="fr-art__track" cx="80" cy="80" r="54" />
        <circle className="fr-art__arc" cx="80" cy="80" r="26" pathLength={100} strokeDasharray="25 100" />
        <circle className="fr-art__arc" cx="80" cy="80" r="40" pathLength={100} strokeDasharray="50 100" />
        <circle className="fr-art__arc fr-art__arc--full" cx="80" cy="80" r="54" pathLength={100} strokeDasharray="96 100" />
      </g>
      <circle className="fr-art__core" cx="80" cy="80" r="9" />
    </svg>
  )
}

/** A little, often: short days stacking up, and the line they make. */
function ArtOften() {
  return (
    <svg className="fr-art" viewBox="0 0 160 160" fill="none" aria-hidden="true">
      <circle className="fr-art__wash" cx="80" cy="80" r="54" />
      <path className="fr-art__line" d="M28 96c14-2 20-10 30-14s16 4 26-6 16-18 26-24" />
      <g className="fr-art__bars">
        <rect x="24" y="104" width="13" height="24" rx="6.5" />
        <rect x="46" y="96" width="13" height="32" rx="6.5" />
        <rect x="68" y="100" width="13" height="28" rx="6.5" />
        <rect x="90" y="84" width="13" height="44" rx="6.5" />
        <rect x="112" y="72" width="13" height="56" rx="6.5" />
      </g>
      <rect className="fr-art__key" x="134" y="56" width="13" height="72" rx="6.5" />
    </svg>
  )
}

/* ------------------------------------------------------------ the words ---

   English is the key, Italian is in `it-selfuse.ts`. Kept to a title and one
   short paragraph each: a first run that needs scrolling is a first run
   people skip. */

const STEPS: Step[] = [
  {
    title: 'Press play and listen',
    body:
      'Good Loop is a library of short guided audio sessions. Put your headphones on, choose one, and listen — a voice and the sound around it do the work. Nothing to read, nothing to answer.',
    art: <ArtListen />,
  },
  {
    title: 'Six, twelve or twenty-four minutes',
    body:
      'Every session is built in phases: it settles you, it does its work, and it brings you back. Pick the length that fits the day you are having — the short one is a whole session, not a taste of one.',
    art: <ArtLengths />,
  },
  {
    title: 'A little, often',
    body:
      'A few minutes on most days does more than one long session now and then. You can note how you feel before and after and watch it move. Good Loop supports your wellbeing — it is not medical or psychological care and does not replace it.',
    art: <ArtOften />,
  },
]

export function FirstRun({ onDone }: { onDone: () => void }) {
  const { t } = useI18n()
  const [i, setI] = useState(0)
  const step = STEPS[i]
  const last = i === STEPS.length - 1

  return (
    <div className="app-frame su-studio">
      <div className="screen fr">
        <div className="fr__top">
          <span className="fr__brand" aria-hidden="true">
            <span className="fr__mark" />
            Good Loop
          </span>
          {/* Skipping is not a different outcome: it is seen either way, and
              the whole thing stays in Profile. Nobody is held here. */}
          <button className="fr__skip" onClick={onDone}>{t('Skip')}</button>
        </div>

        {/* keyed on the step so the card fades in again on each move */}
        <figure className="fr__art" key={`art-${i}`}>{step.art}</figure>

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
