/* ============================================================================
   Self Use — the first run: the POs' onboarding wizard, and then everything
   legal on the last screen

   THE SHAPE AND THE WORDS ARE v17's (POs, 2026-11-26).
   `Good Loop Visual ID/goodloop-onboarding-wizard-v17.html` is drawn screen
   by screen, in order, with its own furniture: the dots and the language
   pill, the wordmark centred under them, the eyebrow, the figures, the
   session lengths, the human/AI pair, the nine techniques, the four
   signature features, the two ways of using it and the three things to
   remember. Six screens in the prototype, and the seventh is the legal one.

     1  The methodology — what goodloop is, in figures and in lengths.
     2  Human creation. AI narration. — who made the method, who speaks it.
     3  Not meditation. A method. — the nine techniques, the quote.
     4  Different on purpose. — the four signature features, and headphones.
     5  One platform, two ways to transform.
     6  Three things to remember. — the recap.
     7  Your data, your control. — EVERYTHING legal, in one screen.

   THE COPY IS THE PROTOTYPE'S DICTIONARY, NOT ITS MARKUP. v17 ships both,
   and the dictionary is applied over the markup on load — in English too —
   so what the POs see on screen 3 is "Not meditation. A method.", not the
   "Not belief. Neuroscience." left in the HTML. The dictionary is what is
   ported, in all three languages, with the markup kept only where the two
   agree.

   SCREEN 7 IS NOT THE PROTOTYPE'S LAST SCREEN (POs, 2026-11-26). v17 ends
   on the recap WITH a legal paragraph and one tick box under it; that part
   was drawn when the app had no legal corpus and summarises documents that
   did not exist yet. So the recap keeps its three points and its button
   leads to the screen this flow already had — every notice, every
   acknowledgement and every optional purpose on it — and only the ground
   and the furniture there are the wizard's. The prototype's own paragraph
   is not carried over: it is legal copy with no id in the registered
   corpus, standing on the screen where the corpus is accepted. Its heading
   and its one-liner are, because they are what that screen already says.

   THE BRAND IS ONE WORD. v12 writes it `goodloop`, lowercase, bold inside
   a sentence. The dictionaries hold no markup — a translation is text — so
   the word is set apart at render (`brandText`, `components/Brand.tsx`) and
   this surface asks for the POs' bold with `frw__brandword`.

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

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useI18n, LOCALES, type Locale } from '../i18n'
import { BrandLogo, brandText } from '../components/Brand'
import { Icon, type IconName } from './icons'
import { useDataProvider } from '../data/provider'
import { useLegal } from '../legal/LegalContext'
import { LegalSheet } from '../legal/LegalPage'
import type { LegalDocId } from '../legal/types'
import type { ConsentPurpose } from '../legal/records'
import { clearArrival, useStageClaim } from '../components/ambient/stage'
import './firstrun.css'

type Step = 'welcome' | 'human' | 'method' | 'features' | 'modes' | 'recap' | 'legal'

/* ---- screen 1: the methodology -----------------------------------------
   The figures are the POs' own count of what the method is made of; the
   three lengths are the three time signatures the catalogue publishes
   (6 / 12 / 24), under the names the wizard gives them. */
const STATS: { num: string; label: string }[] = [
  { num: '9', label: 'Integrated Tools' },
  { num: '6', label: 'Phases per Session' },
  { num: '112', label: 'Validated Techniques' },
  { num: '30+', label: 'Years Clinical Practice' },
]

/* The three lengths, under the names the rest of the app already gives them
   (`data/selfuse.ts`) — which is what v12 renamed the wizard's chips to. */
const DURATIONS: { label: string; mins: string }[] = [
  { label: 'Quick', mins: '6 min' },
  { label: 'Standard', mins: '12 min' },
  { label: 'Deep', mins: '24 min' },
]

/* ---- screen 2: human creation, AI narration -----------------------------
   The two columns of v17's second screen. The left one is about the method
   and is a claim about a person's work; the right one is about the VOICE
   and is the plainest statement in the product that nobody human is
   speaking. It is here, second, before anything is heard. */
const MADE_BY_PEOPLE: string[] = [
  '30+ years of clinical psychology',
  'Patented instrument',
  '9 instruments of modern psychology',
]
const VOICED_BY_AI: string[] = [
  'Global scale',
  'In your language',
  'New sessions, sooner',
]

/* ---- screen 6: the three things ----------------------------------------
   The recap, in the order the screens made the points. */
const RECAP: string[] = [
  'Human creation. AI narration.',
  'Not meditation. A method.',
  'Multiple audio layers. Everything you hear is intentional.',
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
/** The same pair of headphones, at the size v17 gives the tip on screen 4. */
const IcoHeadphonesTip = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

/* ---- screen 4's four little animations ----------------------------------
   v17 draws each signature feature as a moving thing rather than an icon:
   two groups of bars beating out of step (a different message in each ear),
   a dot throwing rings (the echoes), two arrows turning (the repetition),
   three bars sliding over each other (the layers). They are CSS animations
   in `firstrun.css` and every one of them stops under
   `prefers-reduced-motion`, which is the prototype's own rule. */
const ArtEars = (
  <>
    <span className="frw__eq frw__eq--l"><i /><i /><i /></span>
    <span className="frw__eq frw__eq--r"><i /><i /><i /></span>
  </>
)
const ArtEcho = (
  <>
    <span className="frw__ring" /><span className="frw__ring" /><span className="frw__ring" />
    <span className="frw__echo" />
  </>
)
const ArtRepeat = (
  <svg className="frw__spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 2l4 4-4 4" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
    <path d="M7 22l-4-4 4-4" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
  </svg>
)
const ArtLayers = <span className="frw__lay"><i /><i /><i /></span>

/** The four signature features, with the wizard's own art and glosses. */
const FEATURES: { art: ReactNode; t: string; d: string }[] = [
  { art: ArtEars, t: 'Two ears, two voices',
    d: 'A different message in each ear at the same time, adding depth to every session.' },
  { art: ArtEcho, t: 'Echoes',
    d: 'Phrases that return and resonate, so each idea settles in layer by layer.' },
  { art: ArtRepeat, t: 'Intentional repetition',
    d: 'Every repeat is designed in: each return settles the message a little deeper.' },
  { art: ArtLayers, t: 'Layered by design',
    d: 'Voices, sounds and rhythms working together, each with its own purpose.' },
]

/** The five bars on the AI card — the only thing on that card that moves. */
const ArtWave = <span className="frw__wave" aria-hidden="true"><i /><i /><i /><i /><i /></span>

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
    ...(showTutorial ? (['welcome', 'human', 'method', 'features', 'modes', 'recap'] as Step[]) : []),
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

  /** The word on the pill: the wizard's own, screen by screen.

      The recap's button says "Last step →" because what follows it is the
      legal screen. On an account that has already accepted the Terms there
      is no step after it, so it says what it does instead. */
  const CTA: Record<Step, string> = {
    welcome: 'Begin →',
    human: 'See the method →',
    method: 'What you’ll hear →',
    features: 'Continue →',
    modes: 'Almost there →',
    recap: last ? 'Continue →' : 'Last step →',
    legal: 'Accept & Continue',
  }
  const cta = CTA[step]

  return (
    <div className="app-frame su-studio frw">
      {/* The two lights the wizard draws on its ground, and nothing else. */}
      <div className="frw__orb frw__orb--a" aria-hidden="true" />
      <div className="frw__orb frw__orb--b" aria-hidden="true" />

      <div className="frw__inner">
        <div
          ref={scroller}
          className={`frw__content frw__content--${step}`}
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
                <h1>{t('Mental wellbeing and health, reimagined through listening.')}</h1>
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

          {/* ---- screen 2: human creation, AI narration ------------------
              The portrait is here now, on the card about the people, where
              v17 puts it; screen 3 keeps the quote and signs it in type. */}
          {step === 'human' && (
            <>
              <div className="frw__headline">
                <h1 className="is-hero">
                  {t('Human creation.')}
                  <br />
                  <span className="frw__accent">{t('AI narration.')}</span>
                </h1>
                <p>{brandText(t('The goodloop method was created by the human mind. AI voices bring it to you: anywhere, in your language.'), 'frw__brandword')}</p>
              </div>

              <div className="frw__hx">
                <div className="frw__hx__card frw__hx__card--human">
                  <div className="frw__hx__top">
                    <img className="frw__hx__photo" src="/media/varetti.jpg" alt="" width={56} height={56} />
                  </div>
                  <div className="frw__hx__lbl">{t('Created by people')}</div>
                  <ul>
                    {MADE_BY_PEOPLE.map((l) => <li key={l}>{t(l)}</li>)}
                  </ul>
                </div>
                <div className="frw__hx__card frw__hx__card--ai">
                  <div className="frw__hx__top">{ArtWave}</div>
                  <div className="frw__hx__lbl">{t('Voiced by AI')}</div>
                  <ul>
                    {VOICED_BY_AI.map((l) => <li key={l}>{t(l)}</li>)}
                  </ul>
                </div>
              </div>

              <div className="frw__hxfoot">
                <b>Giampiero Varetti</b>
                <span>{t('Clinical Psychologist · Methodology Creator · 30+ yrs of clinical practice')}</span>
              </div>

              <p className="frw__mantra">{t('Human depth. Global reach.')}</p>
            </>
          )}

          {/* ---- screen 5 ------------------------------------------------
              The qualifier on the second card is the one sentence on these
              six screens that is not the wizard's: what the wizard calls
              Professionally Guided Use is a plan an employer either bought
              or did not. */}
          {step === 'modes' && (
            <>
              <div className="frw__headline">
                <h1 className="is-small">{t('One platform. Two ways to transform.')}</h1>
                <p>{brandText(t('Two ways to experience goodloop: Self-Guided Use for everyday wellbeing and Professionally Guided Use* with a licensed professional.'), 'frw__brandword')}</p>
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
                    <span className="frw__module__name">{t('With a Professional*')}</span>
                    <p>
                      {professional
                        ? t('The full GL Methodology, delivered by a licensed psychologist or occupational-health provider who guides your journey.')
                        : t('The full GL Methodology, delivered by a licensed psychologist or occupational-health provider who guides your journey. Available with your company’s extended plan.')}
                    </p>
                  </div>
                </li>
              </ul>

              {/* What the asterisk answers. v12 puts it under the two cards,
                  for everybody; the line inside the card above says whether
                  THIS person's own employer bought it. */}
              <p className="frw__foot">{t('* for corporate contracts only')}</p>
            </>
          )}

          {/* ---- screen 3: the nine instruments -------------------------- */}
          {step === 'method' && (
            <>
              <span className="frw__eyebrow">{t('The method')}</span>

              <div className="frw__headline">
                <h1 className="is-small">
                  {t('Not meditation.')}
                  <br />
                  {t('A method.')}
                </h1>
                <p>{brandText(t('goodloop orchestrates 9 instruments of modern psychology into one method, built on what already works.'), 'frw__brandword')}</p>
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
                <blockquote>{brandText(t('goodloop speaks directly to the nervous system, using the language it truly understands.'), 'frw__brandword')}</blockquote>
              </figure>

              {/* v17 signs the quote in type here — the portrait is on the
                  screen before, where the card is about the person. */}
              <p className="frw__qattr">— Giampiero Varetti, {t('methodology creator')}</p>
            </>
          )}

          {/* ---- screen 4: what makes it sound unlike anything else ------
              The four things somebody is about to hear and would otherwise
              think were faults: two different messages at once, phrases
              coming back, the same line again, and several layers running
              together. Said BEFORE the first session, on purpose. */}
          {step === 'features' && (
            <>
              <span className="frw__eyebrow">{t('By design')}</span>

              <div className="frw__headline">
                <h1 className="is-small">{t('Different on purpose.')}</h1>
                <p>{t('Your first session will sound like nothing you know. That’s the method at work:')}</p>
              </div>

              <div className="frw__feats">
                <div className="frw__featlabel">{t('Signature features')}</div>
                {FEATURES.map((f) => (
                  <div className="frw__feat" key={f.t}>
                    <span className="frw__feat__art" aria-hidden="true">{f.art}</span>
                    <div className="frw__feat__body">
                      <div className="frw__feat__t">{t(f.t)}</div>
                      <p>{t(f.d)}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="frw__tip">
                {IcoHeadphonesTip}
                <p>{t('Hearing something new? That’s by design. Put on headphones and let it unfold.')}</p>
              </div>
            </>
          )}

          {/* ---- screen 6: the three things ------------------------------
              v17 ends here, with a legal paragraph and a tick box under the
              three points. The points are the screen; the acceptance is the
              one after it, which is the app's own. */}
          {step === 'recap' && (
            <>
              <span className="frw__eyebrow">{t('You’re ready')}</span>

              <div className="frw__headline">
                <h1 className="is-small">{t('Three things to remember.')}</h1>
              </div>

              <ol className="frw__recap">
                {RECAP.map((r, n) => (
                  <li key={r}>
                    <span className="frw__recap__n" aria-hidden="true">{n + 1}</span>
                    <span className="frw__recap__t">{t(r)}</span>
                  </li>
                ))}
              </ol>
            </>
          )}

          {/* ---- screen 4: everything legal ------------------------------ */}
          {step === 'legal' && (
            <>
              <div className="frw__headline">
                <h1 className="is-small">{t('Your data, your control.')}</h1>
                <p>{brandText(t('goodloop is built to LGPD and GDPR standards from day one.'), 'frw__brandword')}</p>
              </div>

              {/* ---- what it is for, and what it is not for (ONB-2) ------
                  Its own box and its own record: this is not the Terms, and
                  somebody who accepts the Terms has not thereby said they
                  understand that Good Loop is not an emergency service. */}
              <div className="frw__card">
                <h2>{t('How goodloop works')}</h2>
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
                <div className="frw__links">
                  <button type="button" className="frw__link" onClick={() => setSheet('terms')}>{t('Read the full Terms of Use')}</button>
                  {/* ONB-3.2 lives here. It used to be a second, centred
                      line under the tick box saying the same thing as this
                      link — the privacy notice announced twice on one
                      screen, which reads as neither being the real one. */}
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
