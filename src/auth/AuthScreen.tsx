/* The sign-in / sign-up screen and the gate that decides whether to show it.
   In demo mode any credentials work (prefilled); in Supabase mode it's real. */

import { useState, type ReactNode } from 'react'
import { useAuth, type Role } from './auth'
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
  const [team, setTeam] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null); setBusy(true)
    try {
      if (signup) {
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

  const canSubmit = !!email && !!password && (!signup || !isB2b || (!!name.trim() && !!crp.trim()))

  return (
    <div className={`auth ${isB2b ? 'auth--b2b' : 'auth--b2c'}`}>
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
            {!demo && <>
              <input className="auth__input" type="text" placeholder={t('Company code (from HR, optional)')}
                value={companyCode} onChange={(e) => setCompanyCode(e.target.value)} />
              <input className="auth__input" type="text" placeholder={t('Team (optional)')}
                value={team} onChange={(e) => setTeam(e.target.value)} />
            </>}
          </>}
        </div>

        {error && <div className="auth__error">{error}</div>}

        <button className="auth__btn" disabled={busy || !canSubmit} onClick={() => void submit()}>
          {busy ? t('Please wait…') : signup ? t('Create account') : t('Sign in')}
        </button>
        {!noSignup && (
          <button className="auth__toggle" onClick={() => { setSignup((s) => !s); setError(null) }}>
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
      <div className="auth auth--loading">
        <div className="auth__spin" aria-label={t('Loading')} />
      </div>
    )
  }
  if (!user) return <AuthScreen mode={mode} />
  return <>{children}</>
}
