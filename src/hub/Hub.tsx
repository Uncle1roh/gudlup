/* ============================================================================
   Good Loop — demo hub (#hub)
   One launcher page linking every surface, each with a one-line description
   and its login hint, so testers (the POs) never need to know hash routes.
   Linked from the footer of every sign-in screen; fully localized.
   ============================================================================ */

import { useI18n } from '../i18n'

interface Surface {
  href: string
  icon: string
  title: string
  blurb: string
  /** Demo account email to sign in with (privileged surfaces only). */
  loginHint?: string
}

const SURFACES: Surface[] = [
  {
    href: '#', icon: '🎧', title: 'Employee app',
    blurb: 'Guided sound sessions, progress, quarterly check-in. Create your own account with any email and password.',
  },
  {
    href: '#therapist', icon: '🩺', title: 'Therapist app',
    blurb: 'Patient roster, live sessions, clinical reports. Sign up with name and CRP — new clinicians start as pending until approved in the admin console.',
  },
  {
    href: '#employer', icon: '📊', title: 'Employer dashboard',
    blurb: 'Aggregate NR-1 psychosocial report — anonymous by design.',
    loginHint: 'camila@aurora.co',
  },
  {
    href: '#admin', icon: '🛠', title: 'Admin console',
    blurb: 'Protocol catalog, companies, users, therapist credential approvals.',
    loginHint: 'admin@goodloop.app',
  },
  {
    href: '#studio', icon: '🎚', title: 'Sound Studio',
    blurb: 'Internal audio-authoring tool (in English).',
  },
]

export function Hub() {
  const { t } = useI18n()
  return (
    <div className="hub">
      <div className="hub__inner">
        <header className="hub__head">
          <div className="auth__brand">goodloop</div>
          <h1 className="hub__title">{t('One platform, four surfaces')}</h1>
          <p className="hub__sub">{t('Pick a surface to test. Each one has its own login.')}</p>
        </header>

        <div className="hub__grid">
          {SURFACES.map((s) => (
            <a key={s.href} className="hub__card" href={s.href}>
              <span className="hub__icon" aria-hidden="true">{s.icon}</span>
              <span className="hub__body">
                <span className="hub__cardtitle">{t(s.title)}</span>
                <span className="hub__blurb">{t(s.blurb)}</span>
                {s.loginHint && (
                  <span className="hub__hint">{t('Sign in as')} <b>{s.loginHint}</b></span>
                )}
              </span>
              <span className="hub__open">{t('Open')} →</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
