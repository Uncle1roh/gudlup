/* ============================================================================
   Choosing a new password, after a reset link

   WHY THIS SCREEN DID NOT EXIST, and had to. The link in the mail carries a
   recovery token; Supabase's client consumes it and signs the person in. So
   the link "worked" — and dropped them on the library, signed in, with
   nowhere to set a password. The one screen that changes one lives in
   Profile and asks for the CURRENT password first, which is deliberate
   (anyone holding an unlocked phone could otherwise lock the owner out) and
   is exactly the thing somebody following a reset link does not have.

   Reported as "the link inside the email doesn't work". It worked. It led
   nowhere.

   This stands in front of every route while the recovery session is live,
   because that session is the one thing the person came here to spend, and
   any other screen is a way to lose it.
   ============================================================================ */

import { useState } from 'react'
import { useI18n } from '../i18n'
import { useAuth } from './auth'
import { authErrorKey } from './authError'

/** The same floor the sign-up form uses. */
const PASSWORD_MIN = 8

export function NewPassword() {
  const { t } = useI18n()
  const auth = useAuth()
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const tooShort = next.length > 0 && next.length < PASSWORD_MIN
  const mismatch = again.length > 0 && again !== next
  const ready = next.length >= PASSWORD_MIN && again === next

  async function save() {
    if (!ready) return
    setBusy(true); setError(null)
    try {
      await auth.completeRecovery(next)
      setDone(true)
    } catch (e) {
      setError(t(authErrorKey(e)))
    } finally {
      setBusy(false)
    }
  }

  /* Done, and deliberately NOT a redirect. The session is already the
     person's own, so the app behind this is theirs to open — but it is
     worth one sentence that the password is changed, or somebody closes the
     tab unsure whether it took. */
  if (done) {
    return (
      <div className="auth auth--b2c su-studio">
        <div className="auth__card">
          <h1 className="auth__title">{t('Your password is changed.')}</h1>
          <p className="auth__sub">{t('You are signed in. Use the new password next time.')}</p>
          <button
            className="auth__btn"
            onClick={() => { window.location.href = `${window.location.origin}${window.location.pathname}` }}
          >
            {t('Continue')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth auth--b2c su-studio">
      <div className="auth__card">
        <h1 className="auth__title">{t('Choose a new password')}</h1>
        <p className="auth__sub">{t('You opened a link from your email, so you do not need the old password.')}</p>

        <label className="auth__gatefield">
          <span>{t('New password')}</span>
          <input
            className="auth__input"
            type="password"
            autoComplete="new-password"
            autoFocus
            value={next}
            onChange={(e) => setNext(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && ready && !busy) void save() }}
          />
        </label>
        {tooShort && <p className="auth__hint">{t('A password needs at least {n} characters.', { n: PASSWORD_MIN })}</p>}

        <label className="auth__gatefield">
          <span>{t('Repeat the password')}</span>
          <input
            className="auth__input"
            type="password"
            autoComplete="new-password"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && ready && !busy) void save() }}
          />
        </label>
        {mismatch && <p className="auth__bad" role="alert">{t('The two passwords are not the same.')}</p>}

        {error && <p className="auth__bad" role="alert">{error}</p>}

        <button className="auth__btn" disabled={!ready || busy} onClick={() => void save()}>
          {busy ? t('Saving…') : t('Save the new password')}
        </button>
      </div>
    </div>
  )
}
