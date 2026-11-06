/* ============================================================================
   Self Use — the first run: the onboarding screens the framework requires,
   then the explainer

   ONB-05 fixes the onboarding at three screens, plus one for sponsored
   people, and nothing legal anywhere else in it. Screen 1 — age and country —
   is the door itself (AuthScreen), because it has to precede the account.
   The rest is here, once, before the library:

     Screen 2  How Good Loop works — the two ways of using it (ONB-2.1), a
               SEPARATE, logged tick that it is not for emergencies (ONB-2.2,
               LEG-02) and where Help now lives (ONB-2.3).
     Screen 3  Terms — an unticked box (ONB-3.1) with every incorporated
               notice linked from the screen (D-01 drafting note), the
               privacy line (ONB-3.2, acknowledged, not consented), and one
               toggle per optional purpose, none pre-ticked, each with its
               consequence (ONB-3.3, LEG-04, MN-14).
     Screen 4  Sponsored people only — what the employer never sees
               (ONB-4.1), the work-device line (ONB-4.2) and a personal
               e-mail (ONB-4.3, SPN-12).

   After that, the explainer cards: what the sessions are for and where they
   come from. They promise nothing clinical. The method card describes what
   the audio technically does — sound alternating between the ears, binaural
   audio, structured breathing cues, guided imagery — and names no modality
   (MN-31, Lexicon_Avoid 15/16): the professional may draw such a connection
   in their own communication with their own client; Good Loop may not.

   Every acceptance is recorded the moment it is given (versioned, timestamped,
   server-side through the legal context), not when the last card is reached.
   Someone who accepts and then closes the app has accepted.
   ============================================================================ */

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { BrandLogo } from '../components/Brand'
import { Icon, type IconName } from './icons'
import { BreathingOrb } from '../components/BreathingOrb'
import { useSuTheme } from './theme'
import { useDataProvider } from '../data/provider'
import { useLegal } from '../legal/LegalContext'
import { LegalSheet } from '../legal/LegalPage'
import type { LegalDocId } from '../legal/types'
import type { ConsentPurpose } from '../legal/records'
import { clearArrival } from '../components/ambient/stage'

interface Point {
  label: string
  note: string
}

type ArtKey = 'modes' | 'work' | 'method'

const ART: Record<ArtKey, { src: string; wide?: boolean; small?: boolean }> = {
  modes:  { src: '/tutorial/t2.svg', wide: true },
  work:   { src: '/tutorial/t1.svg' },
  method: { src: '/tutorial/t3.svg', small: true },
}

interface ExplainerStep {
  kind: 'explainer'
  title: string
  body: string
  art: ArtKey
  points: Point[]
  tight?: boolean
}
type Step =
  | { kind: 'how' }
  | { kind: 'terms' }
  | { kind: 'sponsored' }
  | ExplainerStep

/** Card 1 of the explainer, only for someone whose company bought this. */
function modesStep(professional: boolean): ExplainerStep {
  return {
    kind: 'explainer',
    title: 'One library, two ways to use it',
    body:
      'Most days you open Good Loop on your own. Where your plan includes it, a licensed professional can also work with you — and may use the same sessions in the care they provide.',
    art: 'modes',
    points: [
      {
        label: 'On your own',
        note: 'Short audio sessions for the moment you are in — 6, 12 or 24 minutes, whenever you want them, with nobody to ask.',
      },
      {
        label: 'With a professional',
        note: professional
          ? 'Included in your plan: sessions with a licensed psychologist, booked and held inside the app. They decide what is used and when.'
          : 'Available with your company’s extended plan: sessions with a licensed psychologist, booked and held inside the app.',
      },
    ],
  }
}

/** What the sessions are FOR. Each moment is named as the moment, not as a
    preposition: "Before" and "After" were the shortest possible labels and
    said nothing until you read the line under them. */
const WORK_STEP: ExplainerStep = {
  kind: 'explainer',
  title: 'Made for your working day',
  body:
    'Put your headphones on, choose how long you have, and just listen: the voice and the sound guide you. Nothing to read, nothing to answer, and your company is never told what you chose.',
  art: 'work',
  points: [
    { label: 'Before something difficult', note: 'A meeting that worries you, a call you have been putting off.' },
    { label: 'After something unexpected', note: 'Something that went wrong and is still sitting on your shoulders.' },
    { label: 'At the end of the day', note: 'To close the working day and not take it home with you.' },
  ],
}

/** Where it comes from: what the audio technically does, built with
    psychologists. A description of the sound, not a claim about you — and in
    the order you MEET it, voice first, rather than the order the engine
    mixes it. */
const METHOD_STEP: ExplainerStep = {
  kind: 'explainer',
  title: 'Made of sound',
  body:
    'Each session combines six audio elements, built with psychologists to help you relax in the time you have.',
  art: 'method',
  tight: true,
  points: [
    { label: 'Guiding voice', note: 'A voice that takes you from beginning to end.' },
    { label: 'Soundscape', note: 'Background sound that makes the room the session happens in.' },
    { label: 'Guided breathing', note: 'A rhythm to breathe along with.' },
    { label: 'Guided visualisation', note: 'A scene to picture in detail.' },
    { label: 'Alternating audio', note: 'A sound that moves from one ear to the other, at a steady rhythm.' },
    { label: 'Binaural audio', note: 'Different frequencies in each ear. That is why you need headphones.' },
  ],
}

/** The optional purposes asked on screen 3, with the wording the person sees
    — which is what the consent row records (LEG-04).

    THREE, where there were five. News from Good Loop and research on the
    methodology are neither about this app nor about today: asked at the door
    they are two more switches between somebody and the thing they came for,
    and both are still offered — with the other five — in Profile ›
    Privacy and data, where a person who wants to read about them can.

    Each line says what HAPPENS, not what is collected. "Counted in totals
    for groups of 25 or more" is accurate and answers a question nobody
    asked; "your company sees the report, never you in it" is the same fact
    from where the person is standing. */
const PURPOSES: { purpose: ConsentPurpose; label: string; note: string }[] = [
  { purpose: 'measurement', label: 'Wellbeing check-ins',
    note: 'Answer now and then how you are doing, to follow how you change over time. Only you see your answers.' },
  { purpose: 'aggregate', label: 'Take part in the company figures',
    note: 'Your use is counted anonymously, added to other people’s, in the reports that help your company look after the team. Nobody sees your individual data.' },
  { purpose: 'notifications', label: 'Reminders',
    note: 'Get a nudge on this device to remind you to take a pause.' },
]

/** The notices incorporated into the Terms (D-01). Every one of them is
    still one tap from the acceptance screen, which is what D-01's drafting
    note requires — but the two a person actually opens lead, and the four
    that exist so that the Terms can point at them follow in small type. */
const LINKED_NOTICES: { id: LegalDocId; label: string }[] = [
  { id: 'D-02', label: 'Nature of the service' },
  { id: 'D-04', label: 'Self-guided use' },
  { id: 'D-05', label: 'Professionally guided use' },
  { id: 'D-06', label: 'Automated features' },
  { id: 'D-10', label: 'Confidentiality and data' },
]

/** The three lines above the box: what it is, what it is not, who sees it.
    The last one only means anything to somebody whose employer is paying. */
const ESSENTIALS: { icon: IconName; id: 'ONB-3.4' | 'ONB-3.5' | 'ONB-3.6'; sponsored?: true }[] = [
  { icon: 'headphones', id: 'ONB-3.4' },
  { icon: 'heart', id: 'ONB-3.5' },
  { icon: 'lock', id: 'ONB-3.6', sponsored: true },
]

export function FirstRun({
  onDone,
  onAcceptTerms,
  hasCompanyCode = false,
  sponsorName,
  professional = false,
  needsTerms = false,
  needsTutorial = true,
}: {
  onDone: () => void
  /** Called the moment the Terms are accepted, not at the end. */
  onAcceptTerms?: () => void
  /** Their employer bought Good Loop: screen 4 and the modes card apply. */
  hasCompanyCode?: boolean
  sponsorName?: string
  /** That plan is the extended one — booking and video sessions are live. */
  professional?: boolean
  /** The Terms have never been accepted on this account. */
  needsTerms?: boolean
  /** The explainer has never been seen or skipped. */
  needsTutorial?: boolean
}) {
  const { t } = useI18n()

  /* A FIRST RUN IS NOT AN ARRIVAL. Signing in sets a flag that sends the
     background's rings travelling out across the library (brief 10.3) —
     but if the terms have never been accepted, this screen is what comes
     next, and the brief is explicit that a login landing on consent gets a
     plain fade and no travel. Clearing the flag here is what makes that
     true, and it also means the animation cannot fire late, when the person
     finally reaches the library minutes later. */
  useEffect(() => { clearArrival() }, [])
  const theme = useSuTheme()
  const legal = useLegal()
  const dp = useDataProvider()
  const [rawI, setI] = useState(0)
  const [crisisAck, setCrisisAck] = useState(false)
  const [termsAck, setTermsAck] = useState(false)
  const [consents, setConsents] = useState<Partial<Record<ConsentPurpose, boolean>>>({})
  const [personalEmail, setPersonalEmail] = useState('')
  const [sheet, setSheet] = useState<LegalDocId | null>(null)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  /** The tick box of whichever legal screen is open, and its flash. */
  const ackRef = useRef<HTMLLabelElement>(null)
  const [nudge, setNudge] = useState(false)

  /* ---- the screens are decided when the flow OPENS ------------------------

     `needsTerms` turns false the instant the Terms are accepted — acceptance
     is recorded the moment it is given, not at the end, which is the point —
     and the list used to be rebuilt from it on the very next render. The two
     legal screens then vanished from under somebody who was standing on the
     screen after them: with no company that left two screens and an index of
     two, `steps[i]` was undefined, and reading its `kind` took the whole
     screen down as "Something was interrupted". With a company it skipped the
     sponsored screen in silence instead, so ONB-4 was never asked.

     The company code is read from the profile and can still arrive late, so
     that half stays live: a list that GROWS only moves the person forward
     into a screen that exists, which is safe. One that shrinks is not. */
  const [showLegal] = useState(needsTerms)
  const [showTutorial] = useState(needsTutorial)

  const legalSteps: Step[] = showLegal
    ? [{ kind: 'how' }, { kind: 'terms' }, ...(hasCompanyCode ? [{ kind: 'sponsored' } as Step] : [])]
    : []
  const explainer: Step[] = hasCompanyCode
    ? [modesStep(professional), WORK_STEP, METHOD_STEP]
    : [WORK_STEP, METHOD_STEP]
  const steps: Step[] = [...legalSteps, ...(showTutorial ? explainer : [])]

  /* Nothing may leave somebody on a screen that is not there. The freeze above
     is the fix; this is the floor under it, so no later prop can ever make the
     first run fall over again. */
  const i = Math.min(rawI, steps.length - 1)
  const step = steps[i]
  if (!step) return <div className="app-frame su-studio" />

  const last = i === steps.length - 1
  const onLegal = step.kind !== 'explainer'
  /* The one control that decides whether a legal screen can be left. */
  const blocked =
    (step.kind === 'how' && !crisisAck) ||
    (step.kind === 'terms' && !termsAck)

  /* ---- a button that refuses must say what it is waiting for -------------

     Both legal screens open with one tick box and end, several hundred
     pixels further down, with a greyed-out button. On the Terms screen the
     five optional switches sit between the two, so by the time somebody
     reaches the button the box that unlocks it has scrolled off the top of
     the screen — and the button said nothing at all. It was simply dead, on
     the one screen nobody can go round, and "I cannot go forward" is exactly
     what that looks like from the outside.

     The button is live now whether or not the box is ticked. Pressed while
     it is not, it does the only useful thing: takes the person to the box
     and makes it move. */
  function nudgeAck() {
    ackRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setNudge(true)
    window.setTimeout(() => setNudge(false), 1400)
  }

  async function next() {
    if (blocked || busy) return
    setBusy(true)
    setSaveError(null)
    try {
      if (step.kind === 'how') {
        await legal.accept('crisis-ack')
      }
      if (step.kind === 'terms') {
        await legal.accept('terms')
        for (const p of PURPOSES) {
          // only what was answered: an untouched toggle is "no", and no row
          if (consents[p.purpose]) await legal.setConsent(p.purpose, true, `${t(p.label)} — ${t(p.note)}`)
        }
        onAcceptTerms?.()
      }
      if (step.kind === 'sponsored' && personalEmail.trim()) {
        await dp.updateMyProfile({ personalEmail: personalEmail.trim() }).catch(() => undefined)
      }
    } catch {
      /* The acceptance is what lets the person in, so a failed save must be
         said out loud — it used to leave the button doing nothing at all. */
      setSaveError(t('We could not save your answer just now. Check your connection and try again.'))
      return
    } finally {
      setBusy(false)
    }
    if (last) onDone()
    else setI(i + 1)
  }

  /* Where you are, at the top, where a person looks for it — and how many
     there are, in words. Five dots above a button told somebody standing on
     the second legal screen nothing about how much of this there is. */
  const bar = (
    <div
      className="fr__bar"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={steps.length}
      aria-valuenow={i + 1}
      aria-label={t('Step {n} of {total}', { n: i + 1, total: steps.length })}
    >
      {steps.map((_, n) => <span key={n} className={n <= i ? 'is-on' : ''} />)}
    </div>
  )

  return (
    <div className="app-frame su-studio">
      <div className="screen fr">
        {/* ---- the desktop half ----------------------------------------------

            On a phone this flow is a small drawing above a short column of
            words, which is right for a phone. On a desktop it was the same
            560px column stranded in the middle of a wide dark window, with a
            210px drawing floating at the top of it.

            From 1000px the screen becomes two: the card's picture at the size
            a desktop has room for on the left, the words and the buttons in
            their own column on the right. The small drawing is dropped there
            — it is the SAME picture, and printing it twice is just a smaller
            copy of the thing already filling half the screen.

            The legal screens have no drawing of their own, so they take the
            brand's signature: a panel that is never empty, whatever step the
            person is on. */}
        <div className="fr__stage" aria-hidden="true">
          {step.kind === 'explainer'
            ? <img className="fr__stageart" src={ART[step.art].src} alt="" />
            : <BreathingOrb size={300} />}
        </div>

        <div className="fr__col">
        <div className="fr__top">
          <BrandLogo variant={theme === 'light' ? 'green' : 'cream'} className="fr__brand" />
          <span className="fr__step">{t('Step {n} of {total}', { n: i + 1, total: steps.length })}</span>
          {/* The explainer can be skipped; a legal screen cannot. */}
          {!onLegal && <button className="fr__skip" onClick={onDone}>{t('Skip')}</button>}
        </div>
        {bar}

        {step.kind === 'explainer' && (
          <figure
            className={`fr__art${ART[step.art].wide ? ' fr__art--wide' : ''}${ART[step.art].small ? ' fr__art--small' : ''}`}
            key={`art-${i}`}
          >
            <img className="fr-art" src={ART[step.art].src} alt="" aria-hidden="true" />
          </figure>
        )}

        <div className="fr__words" key={`words-${i}`}>
          {/* ---- screen 2: how Good Loop works ---------------------------- */}
          {step.kind === 'how' && (
            <>
              <h1 className="display fr__title">{t('How Good Loop works')}</h1>
              <p className="lead fr__body">{legal.m('ONB-2.1')}</p>
              <label ref={ackRef} className={`legal-ack fr__accept${nudge ? ' is-nudge' : ''}`}>
                <input type="checkbox" checked={crisisAck} onChange={(e) => setCrisisAck(e.target.checked)} />
                <span>{legal.m('ONB-2.2')}</span>
              </label>
              <p className="small muted">{legal.m('ONB-2.3')}</p>
            </>
          )}

          {/* ---- screen 3: the essentials, the box, the optional choices ---

              It used to open on the tick box. A person met an acceptance
              before they had been told what they were accepting, and
              everything that WOULD have told them was behind six links in a
              row under it — so the honest reading of that screen was "tick
              this to get in".

              Now the three things the notices are about are on the screen,
              in three lines, above the box: what the service is, what it is
              not, and who sees it. The notices are all still one tap away,
              which is what D-01 asks for; they are no longer the only way to
              find out. */}
          {step.kind === 'terms' && (
            <>
              <h1 className="display fr__title">{t('Before you start')}</h1>
              <p className="lead fr__body">{t('Read the essentials and choose what you want to switch on. You can change your choices whenever you like.')}</p>

              <section className="fr__ess">
                <h2 className="fr__ess__h">{t('The essentials')}</h2>
                <ul className="fr__esslist">
                  {ESSENTIALS.filter((e) => !e.sponsored || hasCompanyCode).map((e) => (
                    <li key={e.id}>
                      <Icon name={e.icon} size={20} />
                      <span>{legal.m(e.id)}</span>
                    </li>
                  ))}
                </ul>
                <div className="fr__esslinks">
                  <button type="button" className="legal-link" onClick={() => setSheet('terms')}>{t('Read the full Terms of Use')}</button>
                  {/* ONB-3.2 lives here now. It used to be a second,
                      centred line under the tick box saying the same thing
                      as this link — the privacy notice announced twice on
                      one screen, which reads as neither being the real
                      one. */}
                  <button type="button" className="legal-link" onClick={() => setSheet('privacy')}>{legal.m('ONB-3.2')}</button>
                </div>
                {/* The rest of what the Terms incorporate (D-01). */}
                <div className="legal-ack__links fr__essmore">
                  {LINKED_NOTICES.map((n) => (
                    <button key={n.id} type="button" className="legal-link" onClick={() => setSheet(n.id)}>{t(n.label)}</button>
                  ))}
                </div>
              </section>

              <label ref={ackRef} className={`legal-ack fr__accept${nudge ? ' is-nudge' : ''}`}>
                <input type="checkbox" checked={termsAck} onChange={(e) => setTermsAck(e.target.checked)} />
                <span>{legal.m('ONB-3.1')}</span>
              </label>
              {/* ---- the optional choices ---------------------------------

                  Five rows, each of which used to print its title, its
                  consequence and the "you can change this later" line in
                  full, one under the other. Fifteen lines of grey type
                  between the acceptance and the button: a person reads the
                  first one, sees how much is left, and stops reading.

                  Now each row is what it is — a thing, and a switch — with
                  its consequence one tap under it. Nothing is hidden: the
                  wording that the consent record stores (LEG-04) is the
                  wording inside the disclosure, and it is on this screen,
                  which is what ONB-3.3 asks for. It is simply not all
                  shouted at once. */}
              <h2 className="fr__opth">{t('Optional choices')}</h2>
              <p className="fr__optional">{t('Everything starts switched off. You can switch each one on or off whenever you like.')}</p>
              <ul className="fr__consents">
                {PURPOSES.map((p) => (
                  <li key={p.purpose} className="consent-row">
                    <div className="consent-row__main">
                      <div className="consent-row__text">
                        <div className="consent-row__title">{t(p.label)}</div>
                        <p className="consent-row__note">{t(p.note)}</p>
                      </div>
                      <button
                        type="button"
                        className={`switch${consents[p.purpose] ? ' is-on' : ''}`}
                        role="switch"
                        aria-checked={!!consents[p.purpose]}
                        aria-label={t(p.label)}
                        onClick={() => setConsents((c) => ({ ...c, [p.purpose]: !c[p.purpose] }))}
                      >
                        <span className="switch__knob" />
                      </button>
                    </div>
                    {/* The state in words under the row, and the sentence
                        that says saying no costs nothing — one tap away
                        rather than printed five times down the screen. */}
                    <div className="consent-row__foot">
                      <span className="consent-row__state">{consents[p.purpose] ? t('Switched on') : t('Switched off')}</span>
                      <details className="consent-row__more">
                        <summary>{t('Learn more')}</summary>
                        <span className="legal-consent__hint">{legal.m('ONB-3.3')}</span>
                      </details>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* ---- screen 4: sponsored people --------------------------------- */}
          {step.kind === 'sponsored' && (
            <>
              <h1 className="display fr__title">{t('What your employer will never see')}</h1>
              <p className="lead fr__body">{legal.m('ONB-4.1', { sponsor: sponsorName ?? t('Your employer') })}</p>
              <p className="small muted">{legal.m('ONB-4.2')}</p>
              <label className="ob-field">
                <span className="ob-field__label">{legal.m('ONB-4.3')}</span>
                <input className="ob-input" type="email" autoComplete="email" value={personalEmail}
                  onChange={(e) => setPersonalEmail(e.target.value)} placeholder={t('name@example.com')} />
              </label>
              <p className="small">
                <button type="button" className="legal-link" onClick={() => setSheet('D-08')}>{t('Read the full notice')}</button>
              </p>
            </>
          )}

          {/* ---- the explainer ----------------------------------------------- */}
          {step.kind === 'explainer' && (
            <>
              <h1 className="display fr__title">{t(step.title)}</h1>
              <p className="lead fr__body">{t(step.body)}</p>
              <ul className={`fr__points${step.tight ? ' fr__points--tight' : ''}`}>
                {step.points.map((p) => (
                  <li key={p.label}>
                    <b>{t(p.label)}</b>
                    <span>{t(p.note)}</span>
                  </li>
                ))}
              </ul>
              {last && (
                <p className="fr__fine">
                  {t('On your own, Good Loop supports your wellbeing, but it is not medical or psychological care and does not replace that care.')}
                </p>
              )}
            </>
          )}
        </div>

        <div className="fr__foot">
          {saveError && <p className="fr__error" role="alert">{saveError}</p>}
          {blocked && (
            <p className="fr__need" aria-live="polite">
              {step.kind === 'terms'
                ? t('Tick the box above to accept the Terms and continue.')
                : t('Tick the box above to continue.')}
            </p>
          )}
          <button
            className={`btn btn--primary${blocked ? ' is-waiting' : ''}`}
            onClick={() => (blocked ? nudgeAck() : void next())}
            aria-disabled={blocked || busy}
            disabled={busy}
          >
            {step.kind === 'terms' ? t('Accept & continue') : last ? t('Start listening') : t('Next')}
          </button>
          {i > 0 && !onLegal && (
            <button className="btn btn--quiet" onClick={() => setI(i - 1)}>{t('Back')}</button>
          )}
        </div>
        </div>
      </div>

      {sheet && <LegalSheet id={sheet} onClose={() => setSheet(null)} />}
    </div>
  )
}

