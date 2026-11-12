/* ============================================================================
   Self Use — the first run: the POs' onboarding wizard, and then everything
   legal on the last screen

   THE SHAPE IS THE WIZARD'S (POs, 2026-11-12). `Good Loop Visual ID/
   goodloop-onboarding-wizard-v08.html` is drawn screen by screen, in order,
   with its own furniture: the dots and the language pill, the wordmark
   centred under them, the eyebrow, the figures, the session lengths, the two
   ways of using it, the nine techniques, the quote and the man who wrote the
   method. Four screens, four dots, and the fourth is the legal one.

     1  The methodology — what Good Loop is, in figures and in lengths.
     2  One platform, two ways to transform.
     3  Not belief. Neuroscience. — the nine techniques, the quote.
     4  Your data, your control. — EVERYTHING legal, in one screen.

   NO PHOTOGRAPH. The door's picture is the ground for the form; from the
   moment the account exists the flow stands on the dark ground this surface
   paints for itself, with the wizard's two blurred lights on it and nothing
   else (POs, 2026-11-12: "um background sem imagem somente escuro"). That
   is what `useStageClaim('off')` says, and the stylesheet is
   `selfuse/firstrun.css`.

   ---- what screen 4 carries -------------------------------------------------

   The legal framework asks for more than the wizard's single tick box, and
   none of it is dropped — it is all on that one screen now, in the wizard's
   own blocks:

     ONB-2.1/2.2/2.3  what Good Loop is for, a SEPARATE and separately
                      logged acknowledgement that it is not for emergencies
                      (LEG-02), and where Help lives.
     ONB-3.1          the acceptance itself, unticked, with every notice the
                      Terms incorporate one tap away (D-01 drafting note).
     ONB-3.2          the privacy notice, acknowledged, not consented.
     ONB-3.3          one toggle per optional purpose, none pre-ticked, each
                      with its consequence (LEG-04, MN-14).
     ONB-3.4/3.5/3.6  the essentials: what it is, what it is not, who sees it.
     ONB-4.1/4.2/4.3  sponsored people only — what the employer never sees,
                      the work-device line, and a personal e-mail (SPN-12).

   Two boxes, two records: the emergency acknowledgement and the Terms are
   not one tick, and never were.

   ONB-05 WROTE THIS FLOW THE OTHER WAY ROUND — consent first, on its own
   screen, before anything of Good Loop is shown. The POs have asked for the
   wizard's order instead, which is consent last, and this follows it: the
   three cards say what the thing is and the fourth is where it is agreed to.
   Nothing of the SERVICE is reachable before the acceptance — the three
   cards are the explanation, the library is behind the button — and every
   acceptance is still recorded the moment it is given, versioned and
   timestamped through the legal context, not when the flow ends. Worth
   putting to whoever owns the framework text, because the screen order is
   written down in it.
   ============================================================================ */

import { useEffect, useRef, useState } from 'react'
import { useI18n, LOCALES, type Locale } from '../i18n'
import { BrandLogo } from '../components/Brand'
import { Icon, type IconName } from './icons'
import { useDataProvider } from '../data/provider'
import { useLegal } from '../legal/LegalContext'
import { LegalSheet } from '../legal/LegalPage'
import type { LegalDocId } from '../legal/types'
import type { ConsentPurpose } from '../legal/records'
import { clearArrival, useStageClaim } from '../components/ambient/stage'
import './firstrun.css'

type Step = 'welcome' | 'modes' | 'science' | 'legal'

/* ---- screen 1: the methodology -----------------------------------------
   The figures are the POs' own count of what the method is made of; the
   three lengths are the three time signatures the catalogue publishes
   (6 / 12 / 24), under the names the wizard gives them. */
const STATS: { num: string; label: string }[] = [
  { num: '9', label: 'Integrated Tools' },
  { num: '6', label: 'Process Phases' },
  { num: '112', label: 'Validated Techniques' },
  { num: '30+', label: 'Years Clinical Practice' },
]

const DURATIONS: { label: string; mins: string }[] = [
  { label: 'Quick Reset', mins: '6 min' },
  { label: 'Full Session', mins: '12 min' },
  { label: 'Deep Immersion', mins: '24 min' },
]

/* ---- screen 3: where it comes from --------------------------------------
   The nine techniques with the wizard's own one-line glosses. Those glosses
   name modalities, which the CATALOGUE may not do (MN-31, Lexicon_Avoid row
   15). It is the POs' call, and it is already the public position:
   `public/Metodo.tsx` prints the same list on the open web. The lexicon
   linter runs over catalogue metadata, never over this. */
const CHIPS: { t: string; s: string }[] = [
  { t: 'Dichotic Listening', s: 'Bilateral stimulation, EMDR-style' },
  { t: 'Imagery Rehearsal', s: 'Guided imagery in a safe space' },
  { t: 'Binaural Beats', s: 'Calibrated frequencies for state' },
  { t: 'Voice Morphing', s: 'Shifting tones, deeper reach' },
  { t: 'Music & Ambient Sounds', s: 'Builds a safe inner space' },
  { t: 'Dual Voice Immersion', s: 'Layered voices for deep listening' },
  { t: 'Rhythmic Loop', s: 'Anchors change, layer by layer' },
  { t: 'Guided Breathing', s: 'Slow, paced breathing for calm' },
  { t: 'Sensory Stimulation', s: 'Grounds you in the here and now' },
]

/** The optional purposes asked on the legal screen, with the wording the
    person sees — which is what the consent row records (LEG-04).

    THREE, where there were five. News from Good Loop and research on the
    methodology are neither about this app nor about today: asked at the door
    they are two more switches between somebody and the thing they came for,
    and both are still offered — with the other five — in Profile ›
    Privacy and data, where a person who wants to read about them can. */
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

/* ---- the wizard's own line art ------------------------------------------
   Four small shapes, inline because they are this screen's and no other's:
   the headphones and the shield on the two module cards, the chevron on the
   back button, the globe on the language pill. Copied from the wizard. */
const IcoHeadphones = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
    <rect x="2.5" y="13" width="4" height="6" rx="1.5" />
    <rect x="17.5" y="13" width="4" height="6" rx="1.5" />
  </svg>
)
const IcoShield = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
)
const IcoBack = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 18l-6-6 6-6" />
  </svg>
)
const IcoChevron = (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
)
const IcoGlobe = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.3 6.4-3.9 9c-2.6-2.6-3.9-5.6-3.9-9S9.4 5.6 12 3z" />
  </svg>
)

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
  /** Their employer bought Good Loop: ONB-4 applies. */
  hasCompanyCode?: boolean
  sponsorName?: string
  /** That plan is the extended one — booking and video sessions are live. */
  professional?: boolean
  /** The Terms have never been accepted on this account. */
  needsTerms?: boolean
  /** The explainer has never been seen. */
  needsTutorial?: boolean
}) {
  const { t, locale, setLocale } = useI18n()

  /* A FIRST RUN IS NOT AN ARRIVAL. Signing in sets a flag that sends the
     background's rings travelling out across the library (brief 10.3) —
     but if the terms have never been accepted, this screen is what comes
     next, and the brief is explicit that a login landing on consent gets a
     plain fade and no travel. Clearing the flag here is what makes that
     true, and it also means the animation cannot fire late, when the person
     finally reaches the library minutes later. */
  useEffect(() => { clearArrival() }, [])

  /* DARK, AND NOTHING BEHIND IT (POs, 2026-11-12). The door's photograph
     ends with the form. Claiming `off` is what takes it down: the ambient
     background fades out, `data-gl-amb` leaves the document, and this
     surface's own near-black ground — the same `#0a1211` the wizard is
     drawn on — is what the cards and the consents stand on. */
  useStageClaim('off')
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
  /** The two tick boxes, and the flash a refused button sets off. */
  const crisisRef = useRef<HTMLLabelElement>(null)
  const termsRef = useRef<HTMLLabelElement>(null)
  const [nudge, setNudge] = useState<'crisis' | 'terms' | null>(null)
  /** The scroller, so each screen opens at its top rather than where the
      previous one was left. */
  const scroller = useRef<HTMLDivElement>(null)

  /* ---- the screens are decided when the flow OPENS ------------------------

     `needsTerms` turns false the instant the Terms are accepted — acceptance
     is recorded the moment it is given, not at the end, which is the point —
     and a list rebuilt from it would lose its last screen from under
     somebody standing on it. Frozen at mount instead. */
  const [showLegal] = useState(needsTerms)
  const [showTutorial] = useState(needsTutorial)

  const steps: Step[] = [
    ...(showTutorial ? (['welcome', 'modes', 'science'] as Step[]) : []),
    ...(showLegal ? (['legal'] as Step[]) : []),
  ]

  /* Nothing may leave somebody on a screen that is not there. */
  const i = Math.min(rawI, steps.length - 1)
  const step = steps[i]
  if (!step) return <div className="app-frame su-studio" />

  const last = i === steps.length - 1
  /* The one screen that cannot be left until it is answered. */
  const blocked = step === 'legal' && (!crisisAck || !termsAck)

  /* ---- a button that refuses must say what it is waiting for -------------

     The legal screen is long: two tick boxes, the essentials, the optional
     switches, and — for a sponsored account — the employer lines. By the
     time somebody reaches the pill at the foot, the box that unlocks it has
     scrolled off the top. So the pill is live whether or not the boxes are
     ticked, and pressed while one is not it does the only useful thing:
     takes the person to that box and makes it move. */
  function nudgeAck() {
    const which = !crisisAck ? 'crisis' : 'terms'
    const el = which === 'crisis' ? crisisRef.current : termsRef.current
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setNudge(which)
    window.setTimeout(() => setNudge(null), 1400)
  }

  function go(n: number) {
    setI(n)
    /* The screens share one scroller; a new one starts at its top. */
    window.requestAnimationFrame(() => { if (scroller.current) scroller.current.scrollTop = 0 })
  }

  async function next() {
    if (blocked || busy) return
    setBusy(true)
    setSaveError(null)
    try {
      if (step === 'legal') {
        /* Two acknowledgements, two records. */
        await legal.accept('crisis-ack')
        await legal.accept('terms')
        for (const p of PURPOSES) {
          // only what was answered: an untouched toggle is "no", and no row
          if (consents[p.purpose]) await legal.setConsent(p.purpose, true, `${t(p.label)} — ${t(p.note)}`)
        }
        if (hasCompanyCode && personalEmail.trim()) {
          await dp.updateMyProfile({ personalEmail: personalEmail.trim() }).catch(() => undefined)
        }
        onAcceptTerms?.()
      }
    } catch {
      /* The acceptance is what lets the person in, so a failed save must be
         said out loud — it used to leave the button doing nothing at all. */
      setSaveError(t('We could not save your answer just now. Check your connection and try again.'))
      setBusy(false)
      return
    }
    setBusy(false)
    if (last) onDone()
    else go(i + 1)
  }

  /** The word on the pill: the wizard's own, screen by screen. */
  const cta = step === 'welcome' ? 'Begin →'
    : step === 'modes' ? 'Continue →'
      : step === 'science' ? 'See how it works →'
        : 'Accept & Continue'

  return (
    <div className="app-frame su-studio frw">
      {/* The two lights the wizard draws on its ground, and nothing else. */}
      <div className="frw__orb frw__orb--a" aria-hidden="true" />
      <div className="frw__orb frw__orb--b" aria-hidden="true" />

      <div className="frw__inner">
        <div
          ref={scroller}
          className={`frw__content${step === 'science' ? ' frw__content--science' : ''}${step === 'legal' ? ' frw__content--legal' : ''}`}
          key={`step-${i}`}
        >
          {/* ---- the head: back, where you are, the language ------------- */}
          <div className="frw__head">
            <div className="frw__headrow">
              {i > 0
                ? (
                  <button className="frw__back" onClick={() => go(i - 1)} aria-label={t('Back')}>
                    {IcoBack}
                  </button>
                )
                : <span className="frw__spacer" />}

              <div
                className="frw__dots"
                role="progressbar"
                aria-valuemin={1}
                aria-valuemax={steps.length}
                aria-valuenow={i + 1}
                aria-label={t('Step {n} of {total}', { n: i + 1, total: steps.length })}
              >
                {steps.map((_, n) => <span key={n} className={n <= i ? 'is-on' : ''} />)}
              </div>

              <div className="frw__lang">
                {IcoGlobe}
                <span aria-hidden="true">{locale.slice(0, 2).toUpperCase()}</span>
                {IcoChevron}
                <select
                  className="frw__lang__sel"
                  value={locale}
                  aria-label={t('Language')}
                  onChange={(e) => setLocale(e.target.value as Locale)}
                >
                  {LOCALES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </div>
            </div>

            <div className="frw__brand">
              <BrandLogo variant="cream" />
            </div>
          </div>

          {/* ---- screen 1 ------------------------------------------------ */}
          {step === 'welcome' && (
            <>
              <span className="frw__eyebrow">{t('Proprietary Methodology')}</span>

              <div className="frw__headline">
                <h1>{t('Mental health and wellbeing, reimagined through listening.')}</h1>
                <p>{t('A proprietary, science-validated audio methodology that speaks directly to your nervous system.')}</p>
              </div>

              {/* A number and what it counts — not a claim about anybody,
                  which is why they can be here. */}
              <ul className="frw__stats">
                {STATS.map((s) => (
                  <li key={s.label}>
                    <b>{s.num}</b>
                    <span>{t(s.label)}</span>
                  </li>
                ))}
              </ul>

              <div>
                <div className="frw__pickerlabel">{t('Session lengths')}</div>
                <ul className="frw__durs">
                  {DURATIONS.map((d) => (
                    <li key={d.label}>
                      <b>{t(d.label)}</b>
                      <span>{t(d.mins)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {/* ---- screen 2 ------------------------------------------------
              The qualifier on the second card is the one sentence on these
              three screens that is not the wizard's: what the wizard calls
              Professionally Guided Use is a plan an employer either bought
              or did not. */}
          {step === 'modes' && (
            <>
              <div className="frw__headline">
                <h1 className="is-small">{t('One platform. Two ways to transform.')}</h1>
                <p>{t('Two ways to experience Good Loop: Self-Guided Use for everyday wellbeing and Professionally Guided Use with a licensed professional.')}</p>
              </div>

              <ul className="frw__modules">
                <li className="frw__module">
                  <span className="frw__module__icon">{IcoHeadphones}</span>
                  <div className="frw__module__body">
                    <span className="frw__module__name">{t('For You')}</span>
                    <p>{t('Self-directed sessions for everyday wellbeing — stress, sleep, focus. Available anytime, on the go.')}</p>
                  </div>
                </li>
                <li className="frw__module">
                  <span className="frw__module__icon">{IcoShield}</span>
                  <div className="frw__module__body">
                    <span className="frw__module__name">{t('With a Professional')}</span>
                    <p>
                      {professional
                        ? t('The full GL Methodology, delivered by a licensed psychologist or occupational-health provider who guides your journey.')
                        : t('The full GL Methodology, delivered by a licensed psychologist or occupational-health provider who guides your journey. Available with your company’s extended plan.')}
                    </p>
                  </div>
                </li>
              </ul>
            </>
          )}

          {/* ---- screen 3 ------------------------------------------------ */}
          {step === 'science' && (
            <>
              <div className="frw__headline">
                <h1 className="is-small">{t('Not belief. Neuroscience.')}</h1>
                <p>{t('Good Loop doesn’t invent new science — it orchestrates the best of what already works.')}</p>
              </div>

              <ul className="frw__chips">
                {CHIPS.map((c) => (
                  <li key={c.t}>
                    <b>{t(c.t)}</b>
                    <span>{t(c.s)}</span>
                  </li>
                ))}
              </ul>

              <figure className="frw__quote">
                <span className="frw__quote__mark" aria-hidden="true">&ldquo;</span>
                <blockquote>{t('Good Loop speaks directly to the nervous system, using the language it truly understands.')}</blockquote>
              </figure>

              <div className="frw__credit">
                <img src="/media/varetti.jpg" alt="" width={44} height={44} />
                <div>
                  <b>Giampiero Varetti</b>
                  <span>{t('Clinical Psychologist · Methodology Creator · 30+ yrs of clinical practice')}</span>
                </div>
              </div>
            </>
          )}

          {/* ---- screen 4: everything legal ------------------------------ */}
          {step === 'legal' && (
            <>
              <div className="frw__headline">
                <h1 className="is-small">{t('Your data, your control.')}</h1>
                <p>{t('Good Loop is built to LGPD and GDPR standards from day one.')}</p>
              </div>

              {/* The wizard's own paragraph: what this is and what it is not,
                  in one card, before anything is asked. */}
              <div className="frw__card">
                <p>{t('By continuing, you agree to our Terms and Privacy Policy. Good Loop provides self-directed wellbeing content or professionally guided sessions, per your selection, and is not a substitute for medical or psychological treatment.')}</p>
              </div>

              {/* ---- what it is for, and what it is not for (ONB-2) ------
                  Its own box and its own record: this is not the Terms, and
                  somebody who accepts the Terms has not thereby said they
                  understand that Good Loop is not an emergency service. */}
              <div className="frw__card">
                <h2>{t('How Good Loop works')}</h2>
                <p>{legal.m('ONB-2.1')}</p>
              </div>
              <label ref={crisisRef} className={`frw__ack${crisisAck ? ' is-on' : ''}${nudge === 'crisis' ? ' is-nudge' : ''}`}>
                <input type="checkbox" checked={crisisAck} onChange={(e) => setCrisisAck(e.target.checked)} />
                <span>{legal.m('ONB-2.2')}</span>
              </label>
              <p className="frw__sub">{legal.m('ONB-2.3')}</p>

              {/* ---- the essentials, and every notice one tap away -------
                  The three things the notices are about are ON the screen —
                  what the service is, what it is not, who sees it — above
                  the box, so the honest reading of this screen is not "tick
                  this to get in". The notices are all still one tap away,
                  which is what D-01 asks for. */}
              <div className="frw__card">
                <h2>{t('The essentials')}</h2>
                <ul className="frw__ess">
                  {ESSENTIALS.filter((e) => !e.sponsored || hasCompanyCode).map((e) => (
                    <li key={e.id}>
                      <Icon name={e.icon} size={18} />
                      <span>{legal.m(e.id)}</span>
                    </li>
                  ))}
                </ul>
                {/* ONB-3.2 lives here: the privacy notice, named once. The
                    Terms themselves are linked under the box that accepts
                    them, where the wizard puts them. */}
                <div className="frw__links">
                  <button type="button" className="frw__link" onClick={() => setSheet('privacy')}>{legal.m('ONB-3.2')}</button>
                </div>
                {/* The rest of what the Terms incorporate (D-01). */}
                <div className="frw__links frw__links--fine">
                  {LINKED_NOTICES.map((n) => (
                    <button key={n.id} type="button" className="frw__link" onClick={() => setSheet(n.id)}>{t(n.label)}</button>
                  ))}
                </div>
              </div>

              {/* ---- the acceptance (ONB-3.1) ---------------------------- */}
              <label ref={termsRef} className={`frw__ack${termsAck ? ' is-on' : ''}${nudge === 'terms' ? ' is-nudge' : ''}`}>
                <input type="checkbox" checked={termsAck} onChange={(e) => setTermsAck(e.target.checked)} />
                <span>{legal.m('ONB-3.1')}</span>
              </label>
              <div className="frw__links">
                <button type="button" className="frw__link" onClick={() => setSheet('terms')}>{t('Read full terms')}</button>
              </div>

              {/* ---- the optional purposes (ONB-3.3) ---------------------
                  Each row is what it is — a thing, and a switch — with its
                  consequence under it and the wording the consent record
                  stores (LEG-04) one tap away inside it. */}
              <div className="frw__card">
                <h2>{t('Optional choices')}</h2>
                <p>{t('Everything starts switched off. You can switch each one on or off whenever you like.')}</p>
              </div>
              <ul className="frw__consents">
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

              {/* ---- sponsored accounts (ONB-4) -------------------------- */}
              {hasCompanyCode && (
                <div className="frw__card">
                  <h2>{t('What your employer will never see')}</h2>
                  <p>{legal.m('ONB-4.1', { sponsor: sponsorName ?? t('Your employer') })}</p>
                  <p>{legal.m('ONB-4.2')}</p>
                  <label className="frw__field">
                    <span>{legal.m('ONB-4.3')}</span>
                    <input type="email" autoComplete="email" value={personalEmail}
                      onChange={(e) => setPersonalEmail(e.target.value)} placeholder={t('name@example.com')} />
                  </label>
                  <div className="frw__links">
                    <button type="button" className="frw__link" onClick={() => setSheet('D-08')}>{t('Read the full notice')}</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="frw__cta-bar">
          {saveError && <p className="frw__error" role="alert">{saveError}</p>}
          {blocked && (
            <p className="frw__need" aria-live="polite">
              {!crisisAck
                ? t('Tick the box above to continue.')
                : t('Tick the box above to accept the Terms and continue.')}
            </p>
          )}
          <button
            className={`frw__cta${blocked ? ' is-waiting' : ''}`}
            onClick={() => (blocked ? nudgeAck() : void next())}
            aria-disabled={blocked || busy}
            disabled={busy}
          >
            {t(cta)}
          </button>
        </div>
      </div>

      {sheet && <LegalSheet id={sheet} onClose={() => setSheet(null)} />}
    </div>
  )
}
