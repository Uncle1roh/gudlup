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

import { useState } from 'react'
import { useI18n } from '../i18n'
import { BrandLogo } from '../components/Brand'
import { useSuTheme } from './theme'
import { useDataProvider } from '../data/provider'
import { useLegal } from '../legal/LegalContext'
import { LegalSheet } from '../legal/LegalPage'
import type { LegalDocId } from '../legal/types'
import type { ConsentPurpose } from '../legal/records'

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

/** What the sessions are FOR. */
const WORK_STEP: ExplainerStep = {
  kind: 'explainer',
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

/** Where it comes from: what the audio technically does, developed by our
    clinical team. A description of the sound, not a claim about you. */
const METHOD_STEP: ExplainerStep = {
  kind: 'explainer',
  title: 'Built as sound',
  body:
    'Each session is six segments of pre-recorded audio, developed by our clinical team and designed for relaxation that works in the time you have.',
  art: 'method',
  tight: true,
  points: [
    { label: 'Alternating audio', note: 'sound that moves between the left and right ear at a set interval' },
    { label: 'Binaural audio', note: 'calibrated frequencies, one per ear' },
    { label: 'Structured breathing cues', note: 'a rhythm to breathe with' },
    { label: 'Guided imagery', note: 'a scene to picture in detail' },
    { label: 'Ambient soundscape', note: 'the ground the voice sits on' },
    { label: 'Voice-guided sequence', note: 'one voice, one thread' },
  ],
}

/** The optional purposes asked on screen 3, with the wording the person sees
    — which is what the consent row records (LEG-04). */
const PURPOSES: { purpose: ConsentPurpose; label: string; note: string }[] = [
  { purpose: 'measurement', label: 'Wellbeing check-ins', note: 'A short weekly self-report you can see back as your own history. Never scored, never compared to anything.' },
  { purpose: 'aggregate', label: 'Aggregate programme figures', note: 'Counted in totals for groups of 25 or more. Never shared individually.' },
  { purpose: 'notifications', label: 'Reminders on this device', note: 'Reminders never contain health information.' },
  { purpose: 'marketing', label: 'News from Good Loop', note: 'Occasional product news by e-mail.' },
  { purpose: 'research', label: 'Research on the methodology', note: 'De-identified use, only in research about how the sessions work.' },
]

/** The notices incorporated into the Terms (D-01), each one tap from the
    acceptance screen. */
const LINKED_NOTICES: { id: LegalDocId; label: string }[] = [
  { id: 'terms', label: 'Terms' },
  { id: 'D-02', label: 'Nature of the service' },
  { id: 'D-04', label: 'Self-guided use' },
  { id: 'D-05', label: 'Professionally guided use' },
  { id: 'D-06', label: 'Automated features' },
  { id: 'D-10', label: 'Confidentiality and data' },
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
  const theme = useSuTheme()
  const legal = useLegal()
  const dp = useDataProvider()
  const [i, setI] = useState(0)
  const [crisisAck, setCrisisAck] = useState(false)
  const [termsAck, setTermsAck] = useState(false)
  const [consents, setConsents] = useState<Partial<Record<ConsentPurpose, boolean>>>({})
  const [personalEmail, setPersonalEmail] = useState('')
  const [sheet, setSheet] = useState<LegalDocId | null>(null)
  const [busy, setBusy] = useState(false)

  const legalSteps: Step[] = needsTerms
    ? [{ kind: 'how' }, { kind: 'terms' }, ...(hasCompanyCode ? [{ kind: 'sponsored' } as Step] : [])]
    : []
  const explainer: Step[] = hasCompanyCode
    ? [modesStep(professional), WORK_STEP, METHOD_STEP]
    : [WORK_STEP, METHOD_STEP]
  const steps: Step[] = [...legalSteps, ...(needsTutorial ? explainer : [])]

  const step = steps[i]
  const last = i === steps.length - 1
  const onLegal = step.kind !== 'explainer'
  /* The one control that decides whether a legal screen can be left. */
  const blocked =
    (step.kind === 'how' && !crisisAck) ||
    (step.kind === 'terms' && !termsAck)

  async function next() {
    if (blocked || busy) return
    setBusy(true)
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
    } finally {
      setBusy(false)
    }
    if (last) onDone()
    else setI(i + 1)
  }

  const dots = (
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
  )

  return (
    <div className="app-frame su-studio">
      <div className="screen fr">
        <div className="fr__top">
          <BrandLogo variant={theme === 'light' ? 'green' : 'cream'} className="fr__brand" />
          {/* The explainer can be skipped; a legal screen cannot. */}
          {!onLegal && <button className="fr__skip" onClick={onDone}>{t('Skip')}</button>}
        </div>

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
              <label className="legal-ack fr__accept">
                <input type="checkbox" checked={crisisAck} onChange={(e) => setCrisisAck(e.target.checked)} />
                <span>{legal.m('ONB-2.2')}</span>
              </label>
              <p className="small muted">{legal.m('ONB-2.3')}</p>
            </>
          )}

          {/* ---- screen 3: terms, privacy, optional consents -------------- */}
          {step.kind === 'terms' && (
            <>
              <h1 className="display fr__title">{t('Your terms and your choices')}</h1>
              <label className="legal-ack fr__accept">
                <input type="checkbox" checked={termsAck} onChange={(e) => setTermsAck(e.target.checked)} />
                <span>{legal.m('ONB-3.1')}</span>
              </label>
              <div className="legal-ack__links">
                {LINKED_NOTICES.map((n) => (
                  <button key={n.id} type="button" className="legal-link" onClick={() => setSheet(n.id)}>{t(n.label)}</button>
                ))}
              </div>
              <p className="small fr__privacy">
                <button type="button" className="legal-link" onClick={() => setSheet('privacy')}>{legal.m('ONB-3.2')}</button>
              </p>
              <ul className="fr__consents">
                {PURPOSES.map((p) => (
                  <li key={p.purpose} className="consent-row">
                    <div className="consent-row__main">
                      <div className="consent-row__text">
                        <div className="consent-row__title">{t(p.label)}</div>
                        <span className="legal-consent__hint">{t(p.note)}</span>
                        <span className="legal-consent__hint">{legal.m('ONB-3.3')}</span>
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
                  {t('Good Loop supports your wellbeing — it is not medical or psychological care and never replaces it.')}
                </p>
              )}
            </>
          )}
        </div>

        <div className="fr__foot">
          {dots}
          <button className="btn btn--primary" onClick={() => void next()} disabled={blocked || busy}>
            {step.kind === 'terms' ? t('Accept & continue') : last ? t('Start listening') : t('Next')}
          </button>
          {i > 0 && !onLegal && (
            <button className="btn btn--quiet" onClick={() => setI(i - 1)}>{t('Back')}</button>
          )}
        </div>
      </div>

      {sheet && <LegalSheet id={sheet} onClose={() => setSheet(null)} />}
    </div>
  )
}

