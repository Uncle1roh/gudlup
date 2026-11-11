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

   After that, the explainer cards. THE WORDS ON THEM ARE THE POs' OWN
   (`Good Loop Visual ID/goodloop-onboarding-wizard-v07.html`, 2026-11-11):
   the methodology and what it is made of, the two ways of using it, and the
   techniques it draws on, each one quoted from that file rather than
   rewritten here. The card that used to sit between them — "Made for your
   working day" — is not in the wizard and is gone with this change.

   The wizard orders its four screens welcome, two ways, techniques, consent.
   This flow keeps consent FIRST, because that is the legal framework's order
   (ONB-05) and not a copy decision: nothing of Good Loop is shown to
   somebody who has not been told what it is not.

   Every acceptance is recorded the moment it is given (versioned, timestamped,
   server-side through the legal context), not when the last card is reached.
   Someone who accepts and then closes the app has accepted.
   ============================================================================ */

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { BrandLogo } from '../components/Brand'
import { Icon, type IconName } from './icons'
import { useSuTheme } from './theme'
import { useDataProvider } from '../data/provider'
import { useLegal } from '../legal/LegalContext'
import { LegalSheet } from '../legal/LegalPage'
import type { LegalDocId } from '../legal/types'
import type { ConsentPurpose } from '../legal/records'
import { clearArrival, useStageClaim } from '../components/ambient/stage'

interface Point {
  label: string
  note: string
}

/* ---- NO DRAWINGS, AND ONE GROUND ----------------------------------------

   The three `/tutorial/t*.svg` illustrations, and the orb that stood in for
   them on the legal screens, are gone (POs, 2026-11-11): the photograph
   behind the door is the ground for the whole of making an account, it does
   not change from one screen to the next, and nothing is drawn on top of
   it. What the cards carry instead is what the wizard puts on them — the
   figures, the session lengths, the techniques. Words. */

interface ExplainerStep {
  kind: 'explainer'
  /** The small capital line above the title, where the wizard has one. */
  eyebrow?: string
  title: string
  body: string
  points?: Point[]
  /** Nine short techniques read as a grid of cards, not as a list. */
  grid?: boolean
  tight?: boolean
  /** The four figures of the methodology. */
  stats?: { num: string; label: string }[]
  /** The three session lengths, named. */
  durations?: { label: string; mins: string }[]
  quote?: string
  credit?: { name: string; role: string }
  /** The word on the button, where the POs wrote one for this card. */
  cta?: string
}
type Step =
  | { kind: 'how' }
  | { kind: 'terms' }
  | { kind: 'sponsored' }
  | ExplainerStep

/* ---- card 1: the methodology --------------------------------------------
   Wizard screen 1. The figures are the POs' own count of what the method is
   made of; the three lengths are the three time signatures the catalogue
   publishes (6 / 12 / 24), under the names the wizard gives them. */
const WELCOME_STEP: ExplainerStep = {
  kind: 'explainer',
  eyebrow: 'Proprietary Methodology',
  title: 'Mental health and wellbeing, reimagined through listening.',
  body: 'A proprietary, science-validated audio methodology that speaks directly to your nervous system.',
  stats: [
    { num: '9', label: 'Integrated Tools' },
    { num: '6', label: 'Process Phases' },
    { num: '112', label: 'Validated Techniques' },
    { num: '30+', label: 'Years Clinical Practice' },
  ],
  durations: [
    { label: 'Quick Reset', mins: '6 min' },
    { label: 'Full Session', mins: '12 min' },
    { label: 'Deep Immersion', mins: '24 min' },
  ],
  cta: 'Begin',
}

/** Card 2 — wizard screen 2 — only for someone whose company bought this:
    the second way of using Good Loop does not exist without one, and a
    person who cannot book a professional should not be shown a card about
    booking one. The qualifier on that line is the one sentence here that is
    not the wizard's — what the wizard calls Professionally Guided Use is a
    plan their employer either bought or did not. */
function modesStep(professional: boolean): ExplainerStep {
  return {
    kind: 'explainer',
    title: 'One platform. Two ways to transform.',
    body:
      'Two ways to experience Good Loop: Self-Guided Use for everyday wellbeing and Professionally Guided Use with a licensed professional.',
    cta: 'Continue',
    points: [
      {
        label: 'For You',
        note: 'Self-directed sessions for everyday wellbeing — stress, sleep, focus. Available anytime, on the go.',
      },
      {
        label: 'With a Professional',
        note: professional
          ? 'The full GL Methodology, delivered by a licensed psychologist or occupational-health provider who guides your journey.'
          : 'The full GL Methodology, delivered by a licensed psychologist or occupational-health provider who guides your journey. Available with your company’s extended plan.',
      },
    ],
  }
}

/* ---- card 3: where it comes from ----------------------------------------
   Wizard screen 3, whole: the nine techniques with the wizard's own one-line
   glosses, the line about the nervous system, and who wrote the method.

   Those glosses name modalities, which the catalogue may not do (MN-31,
   Lexicon_Avoid row 15). It is the POs' call, and it is already the public
   position: `public/Metodo.tsx` prints the same list on the open web. The
   lexicon linter runs over catalogue metadata, never over this. */
const SCIENCE_STEP: ExplainerStep = {
  kind: 'explainer',
  title: 'Not belief. Neuroscience.',
  body: 'Good Loop doesn’t invent new science — it orchestrates the best of what already works.',
  grid: true,
  points: [
    { label: 'Dichotic Listening', note: 'Bilateral stimulation, EMDR-style' },
    { label: 'Imagery Rehearsal', note: 'Guided imagery in a safe space' },
    { label: 'Binaural Beats', note: 'Calibrated frequencies for state' },
    { label: 'Voice Morphing', note: 'Shifting tones, deeper reach' },
    { label: 'Music & Ambient Sounds', note: 'Builds a safe inner space' },
    { label: 'Dual Voice Immersion', note: 'Layered voices for deep listening' },
    { label: 'Rhythmic Loop', note: 'Anchors change, layer by layer' },
    { label: 'Guided Breathing', note: 'Slow, paced breathing for calm' },
    { label: 'Sensory Stimulation', note: 'Grounds you in the here and now' },
  ],
  quote: 'Good Loop speaks directly to the nervous system, using the language it truly understands.',
  credit: {
    name: 'Giampiero Varetti',
    role: 'Clinical Psychologist · Methodology Creator · 30+ yrs of clinical practice',
  },
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

  /* THE WATERFALL STAYS (POs, 2026-11-06). Creating an account is one flow
     with several screens: the form stands on the photograph, and from the
     second screen on — the terms, then the cards explaining what Good Loop
     is — it used to fall back to this surface's own near-black ground. Same
     flow, two different rooms, with the change happening at the moment a
     person has just handed over their details.

     The door's stage, not the library's: the picture is dimmed and softened
     and the rings breathe around the person in it, exactly as they do
     behind the form this follows. The library's rings arrive later, when
     the flow is finished and there is something to arrive at. */
  useStageClaim('login')
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
    ? [WELCOME_STEP, modesStep(professional), SCIENCE_STEP]
    : [WELCOME_STEP, SCIENCE_STEP]
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
        {/* ---- the mark ------------------------------------------------------

            OUTSIDE the card, where the site header keeps it on the door —
            72 from the left, 28 from the top. It used to be the first thing
            inside the column, which read as a second header belonging to a
            different screen (POs, 2026-11-11). Nothing else is drawn here:
            the photograph is the ground for the whole flow and it does not
            change from the first field of the form to the last card. */}
        <div className="fr__mark" aria-hidden="true">
          <BrandLogo variant={theme === 'light' ? 'green' : 'cream'} />
        </div>

        <div className="fr__col">
        <div className="fr__top">
          <span className="fr__step">{t('Step {n} of {total}', { n: i + 1, total: steps.length })}</span>
          {/* The explainer can be skipped; a legal screen cannot. */}
          {!onLegal && <button className="fr__skip" onClick={onDone}>{t('Skip')}</button>}
        </div>
        {bar}

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
              {/* Wizard screen 4's heading. What is under it is the
                  registered corpus and is not rewritten; the instruction
                  that used to be the lead ("read the essentials and choose
                  what you want to switch on") is still on the screen, above
                  the switches it is about. */}
              <h1 className="display fr__title">{t('Your data, your control.')}</h1>
              <p className="lead fr__body">{t('Good Loop is built to LGPD and GDPR standards from day one.')}</p>

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
              {step.eyebrow && <span className="fr__eyebrow">{t(step.eyebrow)}</span>}
              {/* Ranged left, like everything else on these cards and like
                  the wizard itself. The two legal screens keep their centred
                  heading: they are one statement, not a page of material. */}
              <h1 className="display fr__title fr__title--left">{t(step.title)}</h1>
              <p className="lead fr__body">{t(step.body)}</p>

              {/* The four figures. A number and what it counts — not a
                  claim about anybody, which is why they can be here. */}
              {step.stats && (
                <ul className="fr__stats">
                  {step.stats.map((f) => (
                    <li key={f.label}>
                      <b>{f.num}</b>
                      <span>{t(f.label)}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* The three time signatures the catalogue publishes, named. */}
              {step.durations && (
                <div className="fr__durs">
                  <h2 className="fr__durs__h">{t('Session lengths')}</h2>
                  <ul>
                    {step.durations.map((d) => (
                      <li key={d.label}>
                        <b>{t(d.label)}</b>
                        <span>{t(d.mins)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {step.points && (
                <ul className={`fr__points${step.tight ? ' fr__points--tight' : ''}${step.grid ? ' fr__points--grid' : ''}`}>
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
                  <blockquote>{t(step.quote)}</blockquote>
                  {step.credit && (
                    <figcaption>
                      <b>{step.credit.name}</b>
                      <span>{t(step.credit.role)}</span>
                    </figcaption>
                  )}
                </figure>
              )}

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
            {step.kind === 'terms'
              ? t('Accept & continue')
              : last
                ? t('Start listening')
                /* The wizard writes its own word on two of the cards. */
                : step.kind === 'explainer' && step.cta ? t(step.cta) : t('Next')}
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

