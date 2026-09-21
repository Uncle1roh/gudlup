/* ============================================================================
   Self Use — the first-run explainer

   People were arriving in the library and not knowing what the app is. There
   was nothing between registering and a shelf of covers: the library assumes
   you already know what a Good Loop session IS, and if you do not, a grid of
   pretty artwork does not tell you.

   THE FIRST SCREEN IS ALWAYS THE SAME: the Terms and the Privacy Policy,
   accepted before anything else, by everyone. It is not a card in the
   explainer — it is the door. It cannot be skipped, the button stays inert
   until the box is ticked, and the acceptance is recorded the moment it is
   given rather than when the last card is reached. Someone who accepts and
   then closes the app has accepted.

   TWO WIZARDS AFTER THAT, because two people arrive here.

   · With a company code — their employer bought Good Loop, so the first thing
     to say is what they were given: one method, two ways to use it. Then what
     it is for at work, then where it comes from. Three cards.
   · Without one — nobody bought anything for them, and a card about a plan
     they do not have is an advertisement in the way. Two cards: what it is
     for, and where it comes from.

   The middle and last cards are the SAME cards in both flows; the first is the
   one the code adds. Content follows `Suggestions/onboarding-sug.html`.

   Three rules it keeps:
   · It is ONE time. Finishing it or skipping it both stamp `tutorialSeenAt`,
     and the stamp is what the shell gates on. Profile → "How Good Loop Works"
     is where it lives afterwards, for anyone who wants it again.
   · It promises nothing clinical. Good Loop is a mitigation and wellbeing
     tool; the last card of either flow says in plain language that it does not
     replace medical or psychological care, because the first run is the honest
     place to say so.
   · The pictures are illustrations shipped in `public/tutorial`, one per
     card. They are `alt=""` and `aria-hidden`: the words carry the meaning,
     so a picture that has not loaded costs a person nothing.
   ============================================================================ */

import { useState } from 'react'
import { useI18n } from '../i18n'
import { BrandLogo } from '../components/Brand'
import { useSuTheme } from './theme'

interface Point {
  label: string
  note: string
}

interface Step {
  title: string
  body: string
  /** Key into ART below; the legal card has no illustration. */
  art?: ArtKey
  /** The Terms + Privacy gate. Rendered differently and never skippable. */
  legal?: boolean
  /** Two to six short lines under the paragraph — what the card lists. */
  points?: Point[]
  /** Six one-word techniques read better on one line each than as stacked
      label/paragraph pairs — and they have to fit beside a quote. */
  tight?: boolean
  quote?: { text: string; who: string }
}

/* ------------------------------------------------------------- the art ----

   One illustration per card, from `public/tutorial`: a consultation for the
   two modes, someone listening for the working day, a desk for the method.
   Decorative — every one is `aria-hidden` and the words carry the meaning. */

type ArtKey = 'modes' | 'work' | 'method'

const ART: Record<ArtKey, { src: string; wide?: boolean; small?: boolean }> = {
  modes:  { src: '/tutorial/t2.svg', wide: true },
  work:   { src: '/tutorial/t1.svg' },
  /* The method card carries six techniques and a quote as well; of everything
     on it, the picture is what can afford to be small. */
  method: { src: '/tutorial/t3.svg', small: true },
}

/* ------------------------------------------------------------ the words ---

   English is the key, Italian is in `it-selfuse.ts`, Portuguese in `pt.ts`. */

/**
 * The acceptance, from `Suggestions/onboarding-sug.html`.
 *
 * What is NOT here: a link to a hosted Terms page, because there is no URL to
 * point at yet. Inventing one would be worse than naming the documents and
 * showing what they say — when the real pages exist, they belong here.
 */
const LEGAL_STEP: Step = {
  title: 'Your data, your control.',
  body:
    'Good Loop is built to LGPD and GDPR standards. What you listen to and how you say you feel is yours: it is never sold, never shown to your employer, and never shared with a therapist unless you ask for it.',
  legal: true,
  points: [
    { label: 'What we keep', note: 'Your account, the sessions you play and the check-ins you fill in — nothing else.' },
    { label: 'Your company sees', note: 'Anonymous aggregate figures only, and only above a threshold that cannot identify anyone.' },
    { label: 'You can stop', note: 'Withdraw a consent or export everything from Profile → Privacy & Data, at any time.' },
  ],
}

/** Card 1, only for someone whose company bought this. */
function modesStep(professional: boolean): Step {
  return {
    title: 'One method, two ways to use it',
    body:
      'Your company gives you both. Most days you open Good Loop on your own; when you want someone with you, the same method is delivered by a licensed professional.',
    art: 'modes',
    points: [
      {
        label: 'On your own',
        note: 'Short guided audio sessions for the day you are having — 6, 12 or 24 minutes, whenever you want them, with nobody to ask.',
      },
      {
        label: 'With a professional',
        /* An extended plan is the ONLY thing that opens booking, video
           sessions and assigned sessions, so the card says which of the two a
           person actually holds instead of promising both to everyone. */
        note: professional
          ? 'Included in your plan: sessions with a licensed psychologist, booked and held inside the app.'
          : 'Available with your company’s extended plan: sessions with a licensed psychologist, booked and held inside the app.',
      },
    ],
  }
}

/** What the sessions are FOR — the card both flows open with or reach second. */
const WORK_STEP: Step = {
  title: 'Made for the working day',
  body:
    'Put your headphones on, choose a length and listen — the voice and the sound around it do the work. Nothing to read, nothing to answer, and nobody is told what you chose.',
  art: 'work',
  points: [
    { label: 'Before', note: 'A meeting you are dreading, a call you have been putting off.' },
    { label: 'After', note: 'Something that went badly, and is still in your shoulders.' },
    { label: 'At the end', note: 'Closing the day so it does not follow you home.' },
  ],
}

/** Where it comes from. Content from the POs' onboarding deck. */
const METHOD_STEP: Step = {
  title: 'Not belief. Neuroscience.',
  body:
    'Good Loop does not invent new science — it orchestrates what already works. Six phases, built from established clinical techniques and delivered as sound.',
  art: 'method',
  tight: true,
  points: [
    { label: 'EMDR', note: 'bilateral stimulation' },
    { label: 'Polyvagal theory', note: 'nervous-system regulation' },
    { label: 'Binaural beats', note: 'calibrated frequencies' },
    { label: 'Guided breathing', note: 'parasympathetic activation' },
    { label: 'Mindfulness', note: 'stress and regulation' },
    { label: 'DBT', note: 'emotional tolerance' },
  ],
  quote: {
    text: 'The body knows how to process — when given the space.',
    who: 'Giampiero Varetti · Clinical psychologist · Creator of the methodology · 30+ years of practice',
  },
}

export function FirstRun({
  onDone,
  onAcceptTerms,
  hasCompanyCode = false,
  professional = false,
  needsTerms = false,
  needsTutorial = true,
}: {
  onDone: () => void
  /** Called the moment the box is ticked and accepted, not at the end. */
  onAcceptTerms?: () => void
  /** Their employer bought Good Loop: the flow opens with what they were given. */
  hasCompanyCode?: boolean
  /** That plan is the extended one — booking and video sessions are live. */
  professional?: boolean
  /** The Terms have never been accepted on this account. */
  needsTerms?: boolean
  /** The explainer has never been seen or skipped. */
  needsTutorial?: boolean
}) {
  const { t } = useI18n()
  const theme = useSuTheme()
  const [i, setI] = useState(0)
  const [accepted, setAccepted] = useState(false)

  const explainer: Step[] = hasCompanyCode
    ? [modesStep(professional), WORK_STEP, METHOD_STEP]
    : [WORK_STEP, METHOD_STEP]
  const steps: Step[] = [
    ...(needsTerms ? [LEGAL_STEP] : []),
    ...(needsTutorial ? explainer : []),
  ]

  const step = steps[i]
  const last = i === steps.length - 1
  const onLegal = !!step.legal
  /* The one control that decides whether this screen can be left. */
  const blocked = onLegal && !accepted

  function next() {
    if (blocked) return
    if (onLegal) onAcceptTerms?.()
    if (last) onDone()
    else setI(i + 1)
  }

  return (
    <div className="app-frame su-studio">
      <div className="screen fr">
        <div className="fr__top">
          <BrandLogo variant={theme === 'light' ? 'green' : 'cream'} className="fr__brand" />
          {/* Skipping the EXPLAINER is not a different outcome: it is seen
              either way, and the whole thing stays in Profile. The acceptance
              is not an explainer, so it has no Skip. */}
          {!onLegal && <button className="fr__skip" onClick={onDone}>{t('Skip')}</button>}
        </div>

        {/* keyed on the step so the card fades in again on each move */}
        {step.art && (
          <figure
            className={`fr__art${ART[step.art].wide ? ' fr__art--wide' : ''}${ART[step.art].small ? ' fr__art--small' : ''}`}
            key={`art-${i}`}
          >
            <img className="fr-art" src={ART[step.art].src} alt="" aria-hidden="true" />
          </figure>
        )}

        <div className="fr__words" key={`words-${i}`}>
          <h1 className="display fr__title">{t(step.title)}</h1>
          <p className="lead fr__body">{t(step.body)}</p>

          {step.points && (
            <ul className={`fr__points${step.tight ? ' fr__points--tight' : ''}`}>
              {step.points.map((p) => (
                <li key={p.label}>
                  <b>{t(p.label)}</b>
                  <span>{t(p.note)}</span>
                </li>
              ))}
            </ul>
          )}

          {step.quote && (
            <figure className="fr__quote">
              <blockquote>{t(step.quote.text)}</blockquote>
              <figcaption>{t(step.quote.who)}</figcaption>
            </figure>
          )}

          {/* The last card of either flow carries it: a first run is the
              honest place to say what this is not. The legal card says it too,
              because for some people that card IS the last one. */}
          {(last || onLegal) && (
            <p className="fr__fine">
              {t('Good Loop supports your wellbeing — it is not medical or psychological care and never replaces it.')}
            </p>
          )}

          {onLegal && (
            <label className="fr__accept">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
              />
              <span>{t('I have read and accept the Terms and the Privacy Policy.')}</span>
            </label>
          )}
        </div>

        <div className="fr__foot">
          <div
            className="progress-dots"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={steps.length}
            aria-valuenow={i + 1}
            aria-label={t('Step {n} of {total}', { n: i + 1, total: steps.length })}
          >
            {steps.map((_, n) => <span key={n} className={n === i ? 'is-on' : ''} />)}
          </div>
          <button className="btn btn--primary" onClick={next} disabled={blocked}>
            {onLegal ? t('Accept & continue') : last ? t('Start listening') : t('Next')}
          </button>
          {i > 0 && !onLegal && (
            <button className="btn btn--quiet" onClick={() => setI(i - 1)}>{t('Back')}</button>
          )}
        </div>
      </div>
    </div>
  )
}
