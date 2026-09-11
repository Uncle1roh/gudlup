/* The sign-in / sign-up screen and the gate that decides whether to show it.
   In demo mode any credentials work (prefilled); in Supabase mode it's real. */

import { useMemo, useState, type ReactNode } from 'react'
import { useAuth, type Role } from './auth'
import { stashSignupIntake } from '../data/selfUseStore'
import { conventionLabel, looksLikeCompanyCode, resolveCompanyCode } from '../data/convention'
import { useI18n } from '../i18n'

export function AuthScreen({ mode }: { mode: 'b2c' | 'b2b' | 'admin' | 'hr' }) {
  const auth = useAuth()
  const { t } = useI18n()
  const isB2b = mode === 'b2b'
  const isAdmin = mode === 'admin'
  const isHr = mode === 'hr'
  const noSignup = isAdmin || isHr
  const role: Role = isAdmin ? 'admin' : isHr ? 'hr_admin' : isB2b ? 'therapist' : 'b2c_user'
  const demo = auth.mode === 'demo'

  const [signup, setSignup] = useState(false)
  const [email, setEmail] = useState(demo ? (isAdmin ? 'admin@goodloop.app' : isHr ? 'camila@aurora.co' : isB2b ? 'helena@clinic.demo' : 'demo@goodloop.app') : '')
  const [password, setPassword] = useState(demo ? 'demo' : '')
  const [name, setName] = useState(demo && isB2b ? 'Dra. Helena Costa' : '')
  const [crp, setCrp] = useState(demo && isB2b ? 'CRP 04/45821' : '')
  const [companyCode, setCompanyCode] = useState('')
  /* Consent is given HERE now. The seven onboarding screens are gone — a
     person lands on the library the moment their account exists — so the two
     answers that must precede any data being gathered are asked at
     registration, which is the last honest moment to ask them. */
  const [resetSent, setResetSent] = useState(false)
  const [consentUsage, setConsentUsage] = useState(false)
  const [consentMeasure, setConsentMeasure] = useState(true)
  const [team, setTeam] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null); setBusy(true)
    try {
      if (signup) {
        /* Recorded BEFORE the account call, so a sign-up that succeeds can
           never land on a library with no consent behind it. */
        if (needsConsent) {
          stashSignupIntake({
            usage: consentUsage,
            measurement: consentMeasure,
            companyCode: companyCode.trim() || null,
          })
        }
        await auth.signUp(email.trim(), password, role, {
          name: name.trim() || undefined,
          crp: crp.trim() || undefined,
          companyId: companyCode.trim() || undefined,
          team: team.trim() || undefined,
        })
      } else {
        await auth.signIn(email.trim(), password)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const needsConsent = signup && !isB2b && !isAdmin && !isHr
  /**
   * Forgotten password.
   *
   * The confirmation is the SAME whether or not the address has an account:
   * "if that address has an account, a link is on its way". Saying "no such
   * user" turns the login form into a way to find out who has an account
   * here — and on a mental-health product that is a disclosure, not a
   * convenience.
   */
  async function forgot() {
    const address = email.trim()
    if (!address) { setError(t('Enter your email address first.')); return }
    setError(null)
    setBusy(true)
    try {
      await auth.resetPassword(address)
      setResetSent(true)
    } catch {
      setError(t('We could not send the link just now. Try again in a moment.'))
    } finally {
      setBusy(false)
    }
  }

  /**
   * What the typed company code actually is, said before the account exists.
   *
   * A code is the only thing on this form whose effect a person cannot see:
   * it decides whether therapist-led treatment is in their app at all, and a
   * wrong character just quietly meant "no company". So it is answered here —
   * the company and the plan when the code is registered, a nudge about the
   * shape when it is a typo, and an honest "not yet" otherwise, because a
   * pilot company may be registered after its people have signed up.
   */
  const codeCheck = useMemo(() => {
    const raw = companyCode.trim()
    if (!raw) return null
    const found = resolveCompanyCode(raw)
    if (found) return { ok: true, text: `${found.companyName} · ${t(conventionLabel(found.type))}` }
    if (!looksLikeCompanyCode(raw)) {
      return { ok: false, text: t('A company code looks like ACME-2026-K7. Check it with whoever gave it to you.') }
    }
    return { ok: false, text: t('We do not know this code yet. You can create your account without it and add it later.') }
  }, [companyCode, t])

  const canSubmit =
    !!email && !!password &&
    (!signup || !isB2b || (!!name.trim() && !!crp.trim())) &&
    (!needsConsent || consentUsage)

  return (
    /* The b2c door belongs to the Self Use surface, so it carries that
       surface's theme. Without this it stayed cream while everything behind
       it was dark, and opening the app meant a white screen handing over to a
       black one. The clinician, employer and admin doors are unchanged — their
       surfaces are still light. */
    <div className={`auth ${isB2b ? 'auth--b2b' : 'auth--b2c'}${isB2b || isAdmin || isHr ? '' : ' su-studio'}`}>
      <div className="auth__card">
        <div className="auth__brand">goodloop</div>
        <h1 className="auth__title">{isAdmin ? t('Administrator access') : isHr ? t('Employer access') : isB2b ? t('Clinician access') : t('Welcome')}</h1>
        <p className="auth__sub">{isAdmin ? t('Sign in to the admin console') : isHr ? t('Sign in to the employer dashboard') : signup ? t('Create your account') : t('Sign in to continue')}</p>

        <div className="auth__fields">
          <input className="auth__input" type="email" placeholder={t('Email')} autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit && !busy) void submit() }} />
          <input className="auth__input" type="password" placeholder={t('Password')}
            autoComplete={signup ? 'new-password' : 'current-password'}
            value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit && !busy) void submit() }} />

          {signup && isB2b && <>
            <input className="auth__input" type="text" placeholder={t('Full name')}
              value={name} onChange={(e) => setName(e.target.value)} />
            <input className="auth__input" type="text" placeholder={t('CRP / CFP registration')}
              value={crp} onChange={(e) => setCrp(e.target.value)} />
          </>}
          {signup && !isB2b && <>
            <input className="auth__input" type="text" placeholder={t('Your name (optional)')}
              value={name} onChange={(e) => setName(e.target.value)} />
            {/* The code field is on the demo door too. It is the only way to
                hand a demo account a convention — and a demo of Professional
                Support that cannot be switched on is not a demo of it. */}
            <input className="auth__input" type="text" placeholder={t('Company code (from HR, optional)')}
              autoCapitalize="characters" spellCheck={false}
              value={companyCode} onChange={(e) => setCompanyCode(e.target.value)} />
            {codeCheck && (
              <p className={`auth__code${codeCheck.ok ? ' is-ok' : ''}`}>{codeCheck.text}</p>
            )}
            {!demo && (
              <input className="auth__input" type="text" placeholder={t('Team (optional)')}
                value={team} onChange={(e) => setTeam(e.target.value)} />
            )}
          </>}
        </div>

        {needsConsent && (
          <div className="auth__consents">
            <label className="auth__consent">
              <input type="checkbox" checked={consentUsage} onChange={() => setConsentUsage((v) => !v)} />
              <span>
                <b>{t('App usage & session data')}</b> <em>{t('REQUIRED')}</em>
                <small>{t('Used to remember your preferences and suggest the right sessions.')}</small>
              </span>
            </label>
            <label className="auth__consent">
              <input type="checkbox" checked={consentMeasure} onChange={() => setConsentMeasure((v) => !v)} />
              <span>
                <b>{t('Wellbeing check-ins')}</b>
                <small>{t('Lets the app measure how you are doing over time. You can turn this off later.')}</small>
              </span>
            </label>
          </div>
        )}

        {error && <div className="auth__error">{error}</div>}
        {resetSent && (
          <div className="auth__sent">
            {t('If that address has an account, a reset link is on its way. Check your inbox.')}
          </div>
        )}

        <button className="auth__btn" disabled={busy || !canSubmit} onClick={() => void submit()}>
          {busy ? t('Please wait…') : signup ? t('Create account') : t('Sign in')}
        </button>
        {/* Signing in only. On the sign-up form there is no password to have
            forgotten, and the link would just be noise. */}
        {!signup && !demo && (
          <button className="auth__forgot" disabled={busy} onClick={() => void forgot()}>
            {t('Forgot your password?')}
          </button>
        )}
        {!noSignup && (
          <button className="auth__toggle" onClick={() => { setSignup((s) => !s); setError(null); setResetSent(false) }}>
            {signup ? t('Have an account? Sign in') : t('New here? Create an account')}
          </button>
        )}

        <a className="auth__hub" href="#hub">{t('All apps')} ↗</a>

        {demo && <p className="auth__demo">{t('Demo mode — any email & password works. Tap {action}.', { action: signup ? t('Create account') : t('Sign in') })}</p>}
        {isB2b && !demo && <p className="auth__fine">{t('Clinician accounts start unverified — credentialing is reviewed before patient sessions.')}</p>}
      </div>
    </div>
  )
}

export function AuthGate({ mode, children }: { mode: 'b2c' | 'b2b' | 'admin' | 'hr'; children: ReactNode }) {
  const { ready, user } = useAuth()
  const { t } = useI18n()
  if (!ready) {
    return (
      /* same ground as the door it precedes, or the wait is a white flash */
      <div className={`auth auth--loading${mode === 'b2c' ? ' su-studio' : ''}`}>
        <div className="auth__spin" aria-label={t('Loading')} />
      </div>
    )
  }
  if (!user) return <AuthScreen mode={mode} />
  return <>{children}</>
}
