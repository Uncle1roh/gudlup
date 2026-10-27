/* The sign-in / sign-up screen and the gate that decides whether to show it.
   In demo mode any credentials work (prefilled); in Supabase mode it's real. */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth, type Role } from './auth'
import { stashSignupIntake } from '../data/selfUseStore'
import { conventionLabel, looksLikeCompanyCode, normalizeCode, resolveCompanyCode } from '../data/convention'
import { useI18n } from '../i18n'
import { previewing, clearPreview } from '../admin/preview'
import { BrandLogo } from '../components/Brand'
import { useSuTheme } from '../selfuse/theme'
import { useDataProvider } from '../data/provider'
import { isValidPromoCode, normalizePromoCode } from '../data/promo'
import { useLegal } from '../legal/LegalContext'
import { HelpNowButton } from '../legal/HelpNow'
import { LanguagePicker } from '../components/LanguagePicker'
import { SUPPORTED_COUNTRIES, OTHER_COUNTRIES, marketForCountry } from '../legal/market'

/** Whole years between a date of birth and today. */
export function ageAt(birthDate: string, now = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null
  const b = new Date(birthDate + 'T00:00:00')
  if (Number.isNaN(b.getTime())) return null
  let age = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age -= 1
  return age
}

export function AuthScreen({ mode }: { mode: 'b2c' | 'b2b' | 'admin' | 'hr' | 'sales' }) {
  const auth = useAuth()
  const dp = useDataProvider()
  const { t, locale } = useI18n()
  const { m } = useLegal()
  // the b2c door carries the Self Use ground, so its logo follows that theme
  const theme = useSuTheme()
  const isB2b = mode === 'b2b'
  const isAdmin = mode === 'admin'
  const isHr = mode === 'hr'
  const isSales = mode === 'sales'
  /* The admin console has no sign-up and never will: an account that can read
     every company and every protocol is provisioned by hand, not claimed from
     a form. HR does sign up, but only against a company code an admin minted,
     which is what ties the account to the company panel it will open. */
  /* Neither console is claimed from a form. An account that can read every
     company, every contract and the whole points economy is provisioned by
     hand, like the admin one. */
  const noSignup = isAdmin || isSales
  const demo = auth.mode === 'demo'
  /* Somebody who has asked their system not to animate things is not asking
     for seventeen seconds of drifting water behind a password field. CSS
     cannot stop a video from playing, so the element is simply not rendered
     and the stage keeps its poster. Read once: the door does not outlive a
     change to the setting. */
  const calmMotion = typeof window !== 'undefined'
    && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  const [signup, setSignup] = useState(false)
  /* WHO is registering. The public door serves both the people who use the app
     and the clinicians who work in it — asking here is what lets a therapist
     register at all without knowing a second URL, and what sends them to the
     workspace instead of the library afterwards. */
  const [kind, setKind] = useState<'b2c_user' | 'therapist'>('b2c_user')
  const asTherapist = isB2b || (mode === 'b2c' && signup && kind === 'therapist')
  const role: Role = isAdmin ? 'admin' : isSales ? 'sales' : isHr ? 'hr_admin' : asTherapist ? 'therapist' : 'b2c_user'
  const [email, setEmail] = useState(demo ? (isAdmin ? 'admin@goodloop.app' : isSales ? 'comercial@goodloop.app' : isHr ? 'camila@aurora.co' : isB2b ? 'helena@clinic.demo' : 'demo@goodloop.app') : '')
  const [password, setPassword] = useState(demo ? 'demo' : '')
  const [name, setName] = useState(demo && isB2b ? 'Dra. Helena Costa' : '')
  const [crp, setCrp] = useState(demo && isB2b ? 'CRP 04/45821' : '')
  const [companyCode, setCompanyCode] = useState('')
  /* Screen 1 of the onboarding (ONB-05): age and country, asked before the
     account exists. The 18+ gate (ONB-01, D-11) blocks an under-age person
     with no account and no data retained; the country sets the market
     (ONB-03/04) — crisis numbers, withdrawal period, governing annex — and an
     unsupported one is told so honestly (ONB-1.4). The optional consents
     that used to sit here were moved to screen 3 of the first run, where
     nothing is pre-ticked (LEG-04, MN-14); account and session data are
     processed on the contract and are not a consent at all. */
  const [resetSent, setResetSent] = useState(false)
  const [birthDate, setBirthDate] = useState('')
  /* Which recording of a protocol this person hears: the scripts address the
     listener, and Italian and Portuguese make that audible. Required for a
     listener account, because the very first session needs it. */
  const [addressedAs, setAddressedAs] = useState<'m' | 'f' | null>(null)
  const [country, setCountry] = useState('')
  const [team, setTeam] = useState('')
  const [promo, setPromo] = useState('')
  /* What the typed promo code is worth, asked while the person types:
     `checking` → a number (valid) or null (unknown). */
  const [promoPct, setPromoPct] = useState<number | null | 'checking'>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null); setBusy(true)
    try {
      if (signup && offersPromo && promo.trim()) {
        /* Asked again at submit, not trusted from the live check: an unknown
           code must be refused BEFORE the account exists, or the person is
           left signed in to an account with no profile. */
        const pct = await dp.checkPromoCode(promo).catch(() => null)
        if (pct == null) {
          setPromoPct(null)
          throw new Error(t('This promo code is not valid. Check it, or leave the field empty.'))
        }
      }
      if (signup && !isHr && normalizeCode(companyCode)) {
        /* Asked again at submit for the same reason the promo code is: the
           live check is a courtesy, and an address the company has not
           approved must be refused BEFORE the account exists. The database
           refuses it too — this is what turns that refusal into a sentence. */
        const status = await dp.checkCompanyEmail(normalizeCode(companyCode), email.trim()).catch(() => 'no-roster' as const)
        if (status === 'denied') {
          setRosterOk(false)
          throw new Error(t('This company only accepts addresses it has approved, and {email} is not one of them. Ask your HR contact to add it — or leave the code out and create your account on your own.', { email: email.trim() }))
        }
      }
      if (signup) {
        /* Recorded BEFORE the account call, so a sign-up that succeeds can
           never land on a library with nothing behind it. Measurement is no
           longer answered here: it is an optional consent on screen 3. */
        if (needsConsent) {
          stashSignupIntake({
            usage: true,
            measurement: false,
            companyCode: normalizeCode(companyCode) || null,
            addressedAs,
          })
        }
        await auth.signUp(email.trim(), password, role, {
          name: name.trim() || undefined,
          crp: crp.trim() || undefined,
          // uppercase: the company row IS the code, and "acme-2026-9c" is not
          // the same primary key as the one the admin console minted
          companyId: normalizeCode(companyCode) || undefined,
          team: team.trim() || undefined,
          promoCode: offersPromo ? normalizePromoCode(promo) || undefined : undefined,
          birthDate,
          country,
          locale,
          addressedAs: addressedAs ?? undefined,
        })
      } else {
        /* The role goes with it for DEMO mode only, where there is no profile
           to read it from: signing in at the clinic door is what makes a demo
           account a clinician. Supabase ignores it and asks the profile. */
        await auth.signIn(email.trim(), password, role)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const needsConsent = signup && !asTherapist && !isAdmin && !isHr
  /** The promo field is on the personal sign-up only — not the clinician, HR
      or admin doors. */
  const offersPromo = needsConsent

  useEffect(() => {
    const raw = promo.trim()
    if (!offersPromo || !raw || !isValidPromoCode(raw)) { setPromoPct(null); return }
    setPromoPct('checking')
    let alive = true
    const id = window.setTimeout(() => {
      dp.checkPromoCode(raw)
        .then((pct) => { if (alive) setPromoPct(pct) })
        .catch(() => { if (alive) setPromoPct(null) })
    }, 400)
    return () => { alive = false; window.clearTimeout(id) }
  }, [promo, offersPromo, dp])

  /**
   * The second gate: is THIS address allowed to use that company code?
   *
   * A company may keep a list of the addresses it approves — because a code
   * is one string shared with everybody, and a company that cannot take it
   * back from one person cannot take it back at all. The list is enforced in
   * the database; this asks the same question early, so a person reads why
   * the code did nothing while they are still looking at the form instead of
   * discovering it after the account exists.
   *
   * `null` means not asked (no code, no address, or still typing). A company
   * with no list answers 'no-roster', which is the behaviour every tenant
   * had before lists existed: the code alone.
   */
  const [rosterOk, setRosterOk] = useState<boolean | null>(null)
  useEffect(() => {
    const code = normalizeCode(companyCode)
    const addr = email.trim().toLowerCase()
    if (!signup || isHr || !code || !looksLikeCompanyCode(code) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
      setRosterOk(null)
      return
    }
    let alive = true
    const id = window.setTimeout(() => {
      dp.checkCompanyEmail(code, addr)
        .then((s) => { if (alive) setRosterOk(s !== 'denied') })
        .catch(() => { if (alive) setRosterOk(null) })
    }, 400)
    return () => { alive = false; window.clearTimeout(id) }
  }, [companyCode, email, signup, isHr, dp])

  const promoCheck = useMemo(() => {
    // nothing to say about the first couple of characters
    if (!offersPromo || promo.trim().length < 3) return null
    if (promoPct === 'checking') return { ok: false, text: t('Checking the code…') }
    if (typeof promoPct === 'number') return { ok: true, text: t('Promo code accepted — {pct}% off.', { pct: String(promoPct) }) }
    return { ok: false, text: t('This promo code is not valid. Check it, or leave the field empty.') }
  }, [offersPromo, promo, promoPct, t])
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
    /* The company approves addresses, and this one is not among them. Said
       before anything else about the code: the plan it opens is irrelevant
       while the door is shut. */
    if (rosterOk === false) {
      return {
        ok: false,
        text: t('This company only accepts addresses it has approved, and {email} is not one of them. Ask your HR contact to add it — or leave the code out and create your account on your own.', { email: email.trim() }),
      }
    }
    if (found) return { ok: true, text: `${found.companyName} · ${t(conventionLabel(found.type))}` }
    if (!looksLikeCompanyCode(raw)) {
      return { ok: false, text: t('A company code looks like ACME-2026-K7. Check it with whoever gave it to you.') }
    }
    return { ok: false, text: t('We do not know this code yet. You can create your account without it and add it later.') }
  }, [companyCode, email, rosterOk, t])

  /* The two gates of screen 1. An age below eighteen or a territory where
     Good Loop is not offered blocks the button — the message says which. */
  const age = birthDate ? ageAt(birthDate) : null
  const underAge = signup && age != null && age < 18
  const unsupported = signup && !!country && marketForCountry(country) == null
  const gateOk = !signup || (age != null && age >= 18 && !!country && marketForCountry(country) != null)

  const canSubmit =
    !!email && !!password && gateOk &&
    (!signup || !asTherapist || (!!name.trim() && !!crp.trim())) &&
    // an HR account with no company has no company panel to open
    (!signup || !isHr || looksLikeCompanyCode(companyCode)) &&
    // a code that was checked and is unknown blocks the button; one still
    // being checked does not — submit asks again
    (!offersPromo || !promo.trim() || promoPct !== null) &&
    // an address the company has not approved cannot carry its code
    rosterOk !== false &&
    // a listener account must say which recording it hears
    (!needsConsent || addressedAs !== null)

  return (
    /* The b2c door belongs to the Self Use surface, so it carries that
       surface's theme. Without this it stayed cream while everything behind
       it was dark, and opening the app meant a white screen handing over to a
       black one. The clinician, employer and admin doors are unchanged — their
       surfaces are still light. */
    <div className={`auth ${isB2b ? 'auth--b2b' : 'auth--b2c'}${isB2b || isAdmin || isHr || isSales ? '' : ' su-studio'}`}>
      {/* ---- the desktop half ------------------------------------------------

          A door the size of a phone, centred in a 27-inch monitor, is a form
          floating in an empty room. From 900px the screen becomes two: the
          brand's own signature on the left, at the size it was drawn to be
          seen at, and the form on the right at the width a form wants.

          It carries no words. Everything a person has to READ is in the card,
          in one column, so the eye never crosses the fold — and a panel with
          nothing to read is a panel with nothing to translate, nothing to
          keep in step with the legal copy, and nothing to get wrong. Below
          900px it is not rendered at all: the phone layout is untouched.

          It carries a muted loop of still water, encoded for the web from
          `videos/loop_login.mp4`: that master is 78 MB of 4K at 36 Mbit with
          an audio track nobody will hear, which is not a thing to put in
          front of somebody trying to sign in. `public/media/login-loop.mp4`
          is the same seventeen seconds at 1440px, no audio, 1.1 MB. */}
      <div className="auth__stage" aria-hidden="true">
        {/* The poster is a CSS background on the stage itself, so something
            is on screen before the first frame decodes, if the file never
            arrives, and when the video is not rendered at all. */}
        {!calmMotion && (
          <video
            className="auth__stage__video"
            src={`${import.meta.env.BASE_URL}media/login-loop.mp4`}
            poster={`${import.meta.env.BASE_URL}media/login-loop.jpg`}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            tabIndex={-1}
          />
        )}
        <div className="auth__stage__scrim" />
      </div>
      <div className="auth__card">
        {/* The b2c door is the dark Self Use ground; the clinician, employer
            and admin doors are light. Same logo, the colourway its ground asks
            for. */}
        <div className="auth__brand">
          <BrandLogo variant={isB2b || isAdmin || isHr || isSales || theme === 'light' ? 'green' : 'cream'} />
          {/* The language is the person's to choose, from the first screen.
              Not on the admin door: the console is pinned to Italian. */}
          {!isAdmin && !isSales && <LanguagePicker className="auth__lang" label={false} />}
        </div>
        <h1 className="auth__title">{isAdmin ? t('Administrator access') : isSales ? t('Commercial access') : isHr ? t('Employer access') : isB2b ? t('Clinician access') : t('Welcome')}</h1>
        {/* Only the sign-UP state says anything here. On the sign-in state the
            line under the title repeated what the title and the button had
            both already said — "Welcome / Sign in to continue / Sign in" is
            three ways of announcing a door somebody is already standing at. */}
        {signup && (
          <p className="auth__sub">{isHr ? t('Create the account for your company') : t('Create your account')}</p>
        )}

        <div className="auth__fields">
          <input className="auth__input" type="email" placeholder={t('Email')} autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit && !busy) void submit() }} />
          <input className="auth__input" type="password" placeholder={t('Password')}
            autoComplete={signup ? 'new-password' : 'current-password'}
            value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit && !busy) void submit() }} />

          {/* Which kind of account this will be. Two buttons rather than a
              second URL: a clinician who lands on the app's own door can
              register from here, and the gate takes them to the workspace. */}
          {/* Screen 1 — age and country, for every kind of account (D-11
              applies to everyone; a clinician has a market too). */}
          {signup && (
            <div className="auth__gate">
              <label className="auth__gatefield">
                <span>{m('ONB-1.1')}</span>
                <input className="auth__input" type="date" value={birthDate} max={new Date().toISOString().slice(0, 10)}
                  autoComplete="bday" onChange={(e) => setBirthDate(e.target.value)} />
              </label>
              {underAge && <p className="auth__code auth__code--block" role="alert">{m('ONB-1.3')}</p>}
              <label className="auth__gatefield">
                <span>{m('ONB-1.2')}</span>
                <select className="auth__input" value={country} autoComplete="country" onChange={(e) => setCountry(e.target.value)}>
                  <option value="">{t('Choose your country')}</option>
                  {SUPPORTED_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label[locale]}</option>)}
                  {OTHER_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label[locale]}</option>)}
                </select>
              </label>
              {unsupported && <p className="auth__code auth__code--block" role="alert">{m('ONB-1.4')}</p>}
            </div>
          )}

          {signup && mode === 'b2c' && (
            <div className="auth__kind" role="group" aria-label={t('What is this account for?')}>
              <button type="button" className={`auth__kindbtn${kind === 'b2c_user' ? ' is-on' : ''}`}
                aria-pressed={kind === 'b2c_user'} onClick={() => setKind('b2c_user')}>
                <b>{t('For me')}</b>
                <small>{t('Sessions to listen to on my own')}</small>
              </button>
              <button type="button" className={`auth__kindbtn${kind === 'therapist' ? ' is-on' : ''}`}
                aria-pressed={kind === 'therapist'} onClick={() => setKind('therapist')}>
                <b>{t('I am a therapist')}</b>
                <small>{t('I see people through Good Loop')}</small>
              </button>
            </div>
          )}

          {signup && asTherapist && <>
            <input className="auth__input" type="text" placeholder={t('Full name')}
              value={name} onChange={(e) => setName(e.target.value)} />
            <input className="auth__input" type="text" placeholder={t('CRP / CFP registration')}
              value={crp} onChange={(e) => setCrp(e.target.value)} />
          </>}
          {signup && isHr && (
            <input className="auth__input" type="text" placeholder={t('Company code (required)')}
              autoCapitalize="characters" spellCheck={false}
              value={companyCode} onChange={(e) => setCompanyCode(e.target.value)} />
          )}
          {signup && !asTherapist && !isHr && <>
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

            {/* The guided voice speaks TO the listener, and Italian and
                Portuguese make the listener's gender audible — "sei pronto"
                or "sei pronta". One recording cannot do both, so the app has
                to know before the first session. Asked as what it is: how the
                audio addresses you, not who you are. */}
            <div className="auth__addressed" role="group" aria-label={t('How the audio addresses you')}>
              <span className="auth__addressed__q">{t('How should the audio address you?')}</span>
              <div className="auth__kind">
                <button type="button" className={`auth__kindbtn${addressedAs === 'f' ? ' is-on' : ''}`}
                  aria-pressed={addressedAs === 'f'} onClick={() => setAddressedAs('f')}>
                  <b>{t('Feminine')}</b>
                  <small>{t('feminine form')}</small>
                </button>
                <button type="button" className={`auth__kindbtn${addressedAs === 'm' ? ' is-on' : ''}`}
                  aria-pressed={addressedAs === 'm'} onClick={() => setAddressedAs('m')}>
                  <b>{t('Masculine')}</b>
                  <small>{t('masculine form')}</small>
                </button>
              </div>
              <small className="auth__fine">{t('You can change this any time in Profile.')}</small>
            </div>
            {!demo && (
              <input className="auth__input" type="text" placeholder={t('Team (optional)')}
                value={team} onChange={(e) => setTeam(e.target.value)} />
            )}
            {offersPromo && <>
              <input className="auth__input" type="text" placeholder={t('Promo code (optional)')}
                autoCapitalize="characters" spellCheck={false}
                value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} />
              {promoCheck && (
                <p className={`auth__code${promoCheck.ok ? ' is-ok' : ''}`}>{promoCheck.text}</p>
              )}
            </>}
          </>}
        </div>

        {error && <div className="auth__error">{error}</div>}
        {resetSent && (
          <div className="auth__sent">
            {t('If that address has an account, a reset link is on its way. Check your inbox.')}
          </div>
        )}

        <button className="auth__btn" disabled={busy || !canSubmit} onClick={() => void submit()}>
          {busy ? t('Please wait…') : signup ? t('Create account') : t('Sign in')}
        </button>
        {/* The two ways out of this form, on one line under the button.
            They used to be stacked, each on its own full-width row, and the
            way to an ACCOUNT — the thing a first-time person is here for —
            was the lower of the two, written as a question ("New here?")
            that the person has to read past to find the verb. Two plain
            verbs, side by side. Forgetting a password is a sign-in problem
            only: on the sign-up form there is no password to have forgotten. */}
        {(!noSignup || (!signup && !demo)) && (
          <div className="auth__alt">
            {!signup && !demo && (
              <button type="button" className="auth__forgot" disabled={busy} onClick={() => void forgot()}>
                {t('Forgot your password?')}
              </button>
            )}
            {!noSignup && (
              <button type="button" className="auth__toggle" onClick={() => { setSignup((s) => !s); setError(null); setResetSent(false) }}>
                {signup ? t('Sign in') : t('Create an account')}
              </button>
            )}
          </div>
        )}

        {demo && <p className="auth__demo">{t('Demo mode — any email & password works. Tap {action}.', { action: signup ? t('Create account') : t('Sign in') })}</p>}
        {isB2b && !demo && <p className="auth__fine">{t('Clinician accounts start unverified — credentialing is reviewed before patient sessions.')}</p>}

        {/* The card's foot, one centred column below a hairline: Help now on
            its own line (on every screen, the door included — CRS-01), then
            the two secondary links side by side. They used to be three
            differently aligned rows — two links split across a ragged row
            with the pill, and a third centred under them. */}
        <div className="auth__foot">
          <HelpNowButton variant="inline" />
          <nav className="auth__links" aria-label={t('Links')}>
            <a className="auth__hub" href="#legal" target="_blank" rel="noreferrer">{t('Legal information')} ↗</a>
            <span className="auth__sep" aria-hidden="true">·</span>
            <a className="auth__hub" href="#hub">{t('All apps')} ↗</a>
          </nav>
        </div>
      </div>
    </div>
  )
}

/* ---- which account may stand where -------------------------------------

   Four surfaces, four roles, one each. The gate used to ask only whether
   somebody was signed in, so a patient account that opened `#admin` got the
   admin console: every panel drawn, the catalogue and the company list on
   screen, and only the database's own row policies deciding what it could
   change. Being unable to WRITE is not the same as not being let in.

   An account is not offered a choice of surface, either. It has exactly one,
   and landing on another means the door was wrong, not that permission is
   missing — so the gate sends it where it belongs instead of stopping it. */

const ROLE_FOR_SURFACE: Record<GateMode, Role> = {
  b2c: 'b2c_user',
  b2b: 'therapist',
  hr: 'hr_admin',
  admin: 'admin',
  sales: 'sales',
}

/** Where each role's own surface lives. The patient app owns the empty hash,
    which is what the app opens on. */
const HOME_FOR_ROLE: Record<Role, string> = {
  b2c_user: '',
  therapist: '#therapist',
  hr_admin: '#hr',
  admin: '#admin',
  sales: '#sales',
}

const SURFACE_NAME: Record<Role, string> = {
  b2c_user: 'Good Loop',
  therapist: 'Good Loop clinic',
  hr_admin: 'Good Loop for employers',
  admin: 'Good Loop admin',
  sales: 'Good Loop commerciale',
}

export type GateMode = 'b2c' | 'b2b' | 'admin' | 'hr' | 'sales'

/**
 * `allow` widens a surface beyond the one role its door implies, for the one
 * place that genuinely serves two: the Sound Studio is authoring, used by the
 * team and by the clinicians who compose a session in it. Everything else
 * takes the single role its door is for.
 */
export function AuthGate({ mode, allow, children }: { mode: GateMode; allow?: Role[]; children: ReactNode }) {
  const { ready, user, role, signOut } = useAuth()
  const { t } = useI18n()
  const theme = useSuTheme()
  const dark = mode === 'b2c'

  /* The account has a surface and it is not this one: go there. A person who
     followed an old link, or a bookmark from another role, should end up in
     their own app rather than reading about why they cannot be here. */
  /* One exception: somebody from the team walking a prospect through the
     product. Preview is per tab, only a console can turn it on, and the
     surface it opens runs on the demo fixtures rather than the live
     database — so this widens what those two roles may LOOK at, never what
     they may touch.

     The commercial role had to be added here. Without it "Fare una demo"
     opened, say, the patient app, the gate found a `sales` account standing
     on a `b2c_user` surface, called it misplaced and sent it home — so
     every demo button bounced straight back to the console it was pressed
     from, which is exactly what it looked like from the outside: nothing
     happening. */
  const allowed = allow ?? [ROLE_FOR_SURFACE[mode]]
  const inPreview = previewing() && (role === 'admin' || role === 'sales')
  const misplaced = ready && !!user && !!role && !allowed.includes(role) && !inPreview

  /* A flag left behind — an admin who signed out in this tab and somebody else
     signed in, or a flag set by hand — must not put anyone else on demo data
     without knowing it. Only an admin keeps it. */
  useEffect(() => {
    if (ready && role && role !== 'admin' && role !== 'sales' && previewing()) clearPreview()
  }, [ready, role])
  useEffect(() => {
    if (misplaced && role) window.location.hash = HOME_FOR_ROLE[role]
  }, [misplaced, role])

  if (!ready) {
    return (
      /* same ground as the door it precedes, or the wait is a white flash */
      <div className={`auth auth--loading${dark ? ' su-studio' : ''}`}>
        <div className="auth__spin" aria-label={t('Loading')} />
      </div>
    )
  }
  if (!user) return <AuthScreen mode={mode} />

  if (misplaced && role) {
    // the redirect above is already on its way; this is what is on screen for
    // the frame it takes, and what stays if the hash change is blocked
    return (
      <div className={`auth${dark ? ' su-studio' : ''}`}>
        <div className="auth__card">
          <div className="auth__brand"><BrandLogo variant={dark && theme === 'dark' ? 'cream' : 'green'} /></div>
          <h1 className="auth__title">{t('Taking you to your app')}</h1>
          <p className="auth__sub">
            {t('This account belongs to {surface}.', { surface: SURFACE_NAME[role] })}
          </p>
          <button className="auth__btn" onClick={() => { window.location.hash = HOME_FOR_ROLE[role] }}>
            {t('Continue')}
          </button>
          <button className="auth__toggle" onClick={() => void signOut()}>{t('Sign in with another account')}</button>
        </div>
      </div>
    )
  }

  /* Signed in, no profile row: nothing can be inferred about this account, so
     nothing is opened. It is a real state — a sign-up whose profile insert
     failed — and it needs saying out loud rather than looping on a redirect. */
  if (!role) {
    return (
      <div className={`auth${dark ? ' su-studio' : ''}`}>
        <div className="auth__card">
          <div className="auth__brand"><BrandLogo variant={dark && theme === 'dark' ? 'cream' : 'green'} /></div>
          <h1 className="auth__title">{t('This account is not set up yet')}</h1>
          <p className="auth__sub">
            {t('It has no profile, so it has no app to open. Ask the Good Loop team to finish setting it up.')}
          </p>
          {/* Not a dead end any more. The usual reason to land here is that
              the profile row arrived a moment after the gate looked for it —
              a reload asks again, and costs nothing when the answer is the
              same. Signing out stays, for the account that really has none. */}
          <button className="auth__btn" onClick={() => window.location.reload()}>{t('Try again')}</button>
          <button className="auth__toggle" onClick={() => void signOut()}>{t('Sign out')}</button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
