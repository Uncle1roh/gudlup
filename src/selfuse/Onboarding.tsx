/* ============================================================================
   Self Use — Onboarding (ON-1 … ON-7)

   Seven screens, linear, first launch only. Two rules shape the whole flow:

   · NO clinical language. Not "therapy", not "mental health", not "treatment",
     not "diagnosis". The welcome screen names a feeling, never a condition.
   · The first session must be reachable in about three minutes. That is why
     ON-7 (the OPTIONAL consents and preferences) sits AFTER the first-session
     prompt rather than before it — a person who taps "Start now" on ON-6 gets
     their session immediately and answers ON-7 afterwards.

   ON-3 collects only the two REQUIRED consents, before any data is gathered.
   ON-7 collects the optional ones: aggregate reporting is OFF by default
   (privacy by default) and refusing it changes nothing about the app.
   ============================================================================ */

import { useState } from 'react'
import { useI18n } from '../i18n'
import {
  INTAKE_CHALLENGES,
  INTAKE_MATTERS,
  INTAKE_TIMES,
  DURATIONS,
  durationLabel,
  pathwayById,
  type IntakeTime,
  type IntakeMatter,
} from '../data/selfuse'
import { looksLikeCompanyCode, normalizeCode, resolveCompanyCode } from '../data/convention'
import { suggestedPathway, type IntakeAnswers, type Consents } from '../data/selfUseStore'
import type { Duration } from '../types/domain'
import { Icon } from './icons'

export interface OnboardingResult {
  companyCode: string | null
  intake: IntakeAnswers
  consents: Pick<Consents, 'usageAt' | 'measurementAt' | 'aggregate' | 'aggregateAt' | 'notifications' | 'notificationsAt'>
  /** true when the person tapped "Start now" on ON-6. */
  startNow: boolean
}

interface OnboardingProps {
  onComplete: (r: OnboardingResult) => void
}

const STEPS = 7

function Dots({ step }: { step: number }) {
  return (
    <div className="progress-dots ob-dots" aria-label={`Step ${step} of ${STEPS}`}>
      {Array.from({ length: STEPS }, (_, i) => (
        <span key={i} className={i < step ? 'is-on' : ''} />
      ))}
    </div>
  )
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const { t } = useI18n()
  const [step, setStep] = useState(1)

  const [companyCode, setCompanyCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [acceptedCode, setAcceptedCode] = useState<string | null>(null)
  const [emailMode, setEmailMode] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [usage, setUsage] = useState(false)
  const [measurement, setMeasurement] = useState(false)

  const [challenge, setChallenge] = useState<string | null>(null)
  const [duration, setDuration] = useState<Duration | null>(null)
  const [time, setTime] = useState<IntakeTime | null>(null)
  const [matters, setMatters] = useState<IntakeMatter | null>(null)

  const [aggregate, setAggregate] = useState(false)
  const [notifications, setNotifications] = useState(true)
  const [legalOpen, setLegalOpen] = useState<'aggregate' | 'notifications' | null>(null)
  const [startNow, setStartNow] = useState(false)

  const intake: IntakeAnswers = { challenge, duration, time, matters }
  const pathway = pathwayById(suggestedPathway(intake))
  const unsure = challenge === 'unsure'

  function finish(withStart: boolean) {
    const now = Date.now()
    onComplete({
      companyCode: acceptedCode,
      intake,
      consents: {
        usageAt: now,
        measurementAt: measurement ? now : null,
        aggregate,
        aggregateAt: aggregate ? now : null,
        notifications,
        notificationsAt: now,
      },
      startNow: withStart,
    })
  }

  /* ------------------------------------------------------------ ON-1 ----- */
  if (step === 1) {
    return (
      <div className="app-frame ob su-studio">
        <div className="screen screen--center">
          <Dots step={1} />
          <div className="screen__body ob-hero">
            <div className="ob-art" aria-hidden="true">
              <span className="ob-art__glow" />
            </div>
            <div className="wordmark">Good Loop</div>
            <h1 className="display ob-h1">{t('Your personal space for wellbeing')}</h1>
            <p className="lead">
              {t('Guided audio sessions to help you find calm, focus, energy, and balance in your day.')}
            </p>
          </div>
          <div className="screen__footer">
            <button className="btn btn--primary" onClick={() => setStep(2)}>
              {t('Get Started')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ------------------------------------------------------------ ON-2 ----- */
  if (step === 2) {
    function submitCode() {
      const raw = companyCode.trim()
      if (!raw) { setAcceptedCode(null); setCodeError(null); setStep(3); return }
      const code = normalizeCode(raw)
      if (!looksLikeCompanyCode(code) || !resolveCompanyCode(code)) {
        setCodeError(t('This code is not valid. Check with your HR team.'))
        return
      }
      setCodeError(null)
      setAcceptedCode(code)
      setStep(3)
    }

    return (
      <div className="app-frame ob su-studio">
        <div className="screen">
          <button className="ob-back" onClick={() => setStep(1)} aria-label={t('Back')}>‹</button>
          <Dots step={2} />
          <div className="screen__body stack-lg">
            <h2 className="display ob-h2">{t('Create your account')}</h2>

            <div className="btn-stack">
              <button className="btn btn--ghost ob-social" onClick={() => setStep(3)}>
                {t('Continue with Google')}
              </button>
              <button className="btn btn--ghost ob-social" onClick={() => setStep(3)}>
                <span aria-hidden="true"></span> {t('Continue with Apple')}
              </button>
            </div>

            <div className="ob-or"><span>{t('or')}</span></div>

            {!emailMode ? (
              <button className="btn btn--quiet ob-emaillink" onClick={() => setEmailMode(true)}>
                {t('Sign up with email')}
              </button>
            ) : (
              <div className="stack-md fade-in">
                <label className="ob-field">
                  <span className="ob-field__label">{t('Email')}</span>
                  <input
                    className="ob-input"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </label>
                <label className="ob-field">
                  <span className="ob-field__label">{t('Password')}</span>
                  <input
                    className="ob-input"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
              </div>
            )}

            <div className="ob-codebox">
              <div className="ob-field__label">{t('Do you have a company code?')}</div>
              <p className="small muted">{t('Links you to your company plan. Optional.')}</p>
              <input
                className={`ob-input ob-input--code${codeError ? ' is-error' : ''}`}
                value={companyCode}
                onChange={(e) => { setCompanyCode(e.target.value); setCodeError(null) }}
                placeholder="ACME-2026"
                autoCapitalize="characters"
                spellCheck={false}
              />
              {codeError && <p className="ob-error">{codeError}</p>}
            </div>
          </div>

          <div className="screen__footer btn-stack">
            <button className="btn btn--primary" onClick={submitCode}>
              {emailMode ? t('Create Account') : t('Continue')}
            </button>
            <button
              className="btn btn--quiet"
              onClick={() => { setCompanyCode(''); setAcceptedCode(null); setCodeError(null); setStep(3) }}
            >
              {t("Skip — I don't have one")}
            </button>
            <p className="small muted ob-center">
              {t('Already have an account?')} <a href="#login">{t('Log in')}</a>
            </p>
          </div>
        </div>
      </div>
    )
  }

  /* ------------------------------------------------------------ ON-3 ----- */
  if (step === 3) {
    return (
      <div className="app-frame ob su-studio">
        <div className="screen">
          <button className="ob-back" onClick={() => setStep(2)} aria-label={t('Back')}>‹</button>
          <Dots step={3} />
          <div className="screen__body stack-lg">
            <div>
              <span className="eyebrow">{t('Step 1 of 2')}</span>
              <h2 className="display ob-h2">{t('Before we begin')}</h2>
              <p className="lead">{t('We need your consent to personalize your experience.')}</p>
            </div>

            <ConsentRow
              title={t('App usage & session data')}
              body={t('Used to remember your preferences and suggest the right sessions.')}
              tag={t('REQUIRED')}
              on={usage}
              onToggle={() => setUsage((v) => !v)}
            />
            <ConsentRow
              title={t('Wellbeing check-ins')}
              body={t('Used to track your progress over time.')}
              tag={t('REQUIRED FOR MEASUREMENT')}
              on={measurement}
              onToggle={() => setMeasurement((v) => !v)}
            />

            <a className="small ob-policy" href="#privacy">{t('Read full privacy policy')}</a>
          </div>

          <div className="screen__footer">
            <button className="btn btn--primary" disabled={!usage || !measurement} onClick={() => setStep(4)}>
              {t('Accept & Continue')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ------------------------------------------------------------ ON-4 ----- */
  if (step === 4) {
    const answered = [challenge, duration, time, matters].filter(Boolean).length
    return (
      <div className="app-frame ob su-studio">
        <div className="screen">
          <button className="ob-back" onClick={() => setStep(3)} aria-label={t('Back')}>‹</button>
          <Dots step={4} />
          <div className="screen__body stack-lg ob-scroll">
            <div className="ob-qhead">
              <h2 className="display ob-h2">{t('A few quick questions')}</h2>
              <span className="ob-qcount">{t('{n} of 4', { n: answered })}</span>
            </div>

            <fieldset className="ob-q">
              <legend className="field-label">{t("What's your main challenge right now?")}</legend>
              <div className="ob-optlist">
                {INTAKE_CHALLENGES.map((o) => (
                  <button
                    key={o.id}
                    className="ob-opt"
                    aria-pressed={challenge === o.id}
                    onClick={() => setChallenge(o.id)}
                  >
                    <span className="ob-opt__icon" aria-hidden="true">{o.icon}</span>
                    <span className="ob-opt__label">{t(o.label)}</span>
                    <span className="ob-radio" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="ob-q">
              <legend className="field-label">{t('How much time can you dedicate to yourself?')}</legend>
              <div className="ob-optlist">
                {DURATIONS.map((d) => (
                  <button key={d} className="ob-opt" aria-pressed={duration === d} onClick={() => setDuration(d)}>
                    <span className="ob-opt__icon" aria-hidden="true">⏱</span>
                    <span className="ob-opt__label">{t('{n} minutes', { n: d })}</span>
                    <span className="ob-radio" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="ob-q">
              <legend className="field-label">{t('When would you prefer your session?')}</legend>
              <div className="ob-optlist">
                {INTAKE_TIMES.map((o) => (
                  <button key={o.id} className="ob-opt" aria-pressed={time === o.id} onClick={() => setTime(o.id)}>
                    <span className="ob-opt__icon" aria-hidden="true"><Icon name="clock" size={20} /></span>
                    <span className="ob-opt__label">{t(o.label)}</span>
                    <span className="ob-radio" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="ob-q">
              <legend className="field-label">{t('What matters most to you right now?')}</legend>
              <div className="ob-optlist">
                {INTAKE_MATTERS.map((o) => (
                  <button key={o.id} className="ob-opt" aria-pressed={matters === o.id} onClick={() => setMatters(o.id)}>
                    <span className="ob-opt__icon" aria-hidden="true"><Icon name="spark" size={20} /></span>
                    <span className="ob-opt__label">{t(o.label)}</span>
                    <span className="ob-radio" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="screen__footer">
            <button className="btn btn--primary" disabled={answered < 4} onClick={() => setStep(5)}>
              {t('Continue')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ------------------------------------------------------------ ON-5 ----- */
  if (step === 5 && pathway) {
    return (
      <div className="app-frame ob su-studio">
        <div className="screen">
          <button className="ob-back" onClick={() => setStep(4)} aria-label={t('Back')}>‹</button>
          <Dots step={5} />
          <div className="screen__body ob-hero">
            <div className="ob-art ob-art--pathway" aria-hidden="true"><span className="ob-art__glow" /></div>
            <span className="eyebrow">{t('Recommended for you')}</span>
            <h2 className="display ob-h1">{t(pathway.name)}</h2>
            <p className="lead">
              {t(pathway.about)} {t('{len}, {per} sessions per week.', { len: t(pathway.lengthLabel), per: pathway.perWeekLabel })}
            </p>
            <p className="ob-duration">{t('~{n} min per session', { n: duration ?? pathway.duration })}</p>
            {unsure && (
              <p className="small muted ob-note">
                {t("We've suggested this as a great starting point. You can explore other pathways anytime.")}
              </p>
            )}
          </div>
          <div className="screen__footer btn-stack">
            <button className="btn btn--primary" onClick={() => setStep(6)}>{t('Start this pathway')}</button>
            <button className="btn btn--quiet" onClick={() => setStep(6)}>{t('See all pathways')}</button>
          </div>
        </div>
      </div>
    )
  }

  /* ------------------------------------------------------------ ON-6 ----- */
  if (step === 6) {
    return (
      <div className="app-frame ob su-studio">
        <div className="screen">
          <button className="ob-back" onClick={() => setStep(5)} aria-label={t('Back')}>‹</button>
          <Dots step={6} />
          <div className="screen__body ob-hero">
            <div className="ob-art ob-art--head" aria-hidden="true"><span className="ob-art__glow" /></div>
            <h2 className="display ob-h1">{t('Ready for your first session?')}</h2>
            <p className="lead">
              {t("Your first session is just 6 minutes. Find a quiet place, put on your headphones, and let's begin.")}
            </p>
            <p className="small muted ob-headphones">
              <Icon name="headphones" size={15} /> {t('Headphones recommended for best experience')}
            </p>
          </div>
          <div className="screen__footer btn-stack">
            <button className="btn btn--primary" onClick={() => { setStartNow(true); setStep(7) }}>
              {t('Start now')}
            </button>
            <button className="btn btn--quiet" onClick={() => { setStartNow(false); setStep(7) }}>
              {t('Later')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ------------------------------------------------------------ ON-7 ----- */
  return (
    <div className="app-frame ob su-studio">
      <div className="screen">
        <button className="ob-back" onClick={() => setStep(6)} aria-label={t('Back')}>‹</button>
        <Dots step={7} />
        <div className="screen__body stack-lg ob-scroll">
          <div>
            <span className="eyebrow">{t('Step 2 of 2')}</span>
            <h2 className="display ob-h2">{t('Almost done')}</h2>
          </div>

          <ConsentRow
            title={t('Anonymous data for aggregate company reports')}
            body={t('Your company receives anonymous, aggregate wellbeing statistics. Your individual data is never shared.')}
            tag={t('DEFAULT: OFF')}
            on={aggregate}
            onToggle={() => setAggregate((v) => !v)}
            legalOpen={legalOpen === 'aggregate'}
            onLegal={() => setLegalOpen((v) => (v === 'aggregate' ? null : 'aggregate'))}
            legal={t('Aggregated statistics are computed across all participating employees and suppressed below a minimum of five responses, so no individual can be identified or reconstructed. You can withdraw this consent at any time in Profile → Privacy & Data.')}
          />
          <ConsentRow
            title={t('Push notifications & reminders')}
            body={t("We'll remind you of your sessions and check-ins.")}
            tag={t('DEFAULT: ON')}
            on={notifications}
            onToggle={() => setNotifications((v) => !v)}
            legalOpen={legalOpen === 'notifications'}
            onLegal={() => setLegalOpen((v) => (v === 'notifications' ? null : 'notifications'))}
            legal={t('Reminders are sent at the time you chose and can be switched off individually in Profile → Notifications. They never contain health information.')}
          />

          <p className="small muted">
            {t('Each consent has an independent, per-item timestamp. Refusing has zero impact on app features.')}
          </p>
        </div>

        <div className="screen__footer">
          <button className="btn btn--primary" onClick={() => finish(startNow)}>{t('Continue')}</button>
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

interface ConsentRowProps {
  title: string
  body: string
  tag: string
  on: boolean
  onToggle: () => void
  legal?: string
  legalOpen?: boolean
  onLegal?: () => void
}

function ConsentRow({ title, body, tag, on, onToggle, legal, legalOpen, onLegal }: ConsentRowProps) {
  const { t } = useI18n()
  return (
    <div className="consent-row">
      <div className="consent-row__main">
        <div className="consent-row__text">
          <div className="consent-row__title">{title}</div>
          <p className="small muted">{body}</p>
          <span className="consent-row__tag">{tag}</span>
        </div>
        <button
          className={`switch${on ? ' is-on' : ''}`}
          role="switch"
          aria-checked={on}
          aria-label={title}
          onClick={onToggle}
        >
          <span className="switch__knob" />
        </button>
      </div>
      {legal && (
        <>
          <button className="consent-row__legal" onClick={onLegal}>
            {t('Full legal text')} {legalOpen ? '⌃' : '⌄'}
          </button>
          {legalOpen && <p className="small muted consent-row__legaltext fade-in">{legal}</p>}
        </>
      )}
    </div>
  )
}

/** Exported for the tutorial and the pathway suggestion copy. */
export function durationName(d: Duration): string {
  return durationLabel(d)
}
