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
    href: '#app', icon: '🎧', title: 'Self Use app',
    blurb: 'Onboarding, pathways, the 19 sessions, the immersive player, the Therapist tab, progress and check-ins. Create your own account with any email and password; enter ACME-2026 as a company code to unlock Professional Support, or NOVA-2026 for a Self-Use-only convention.',
  },
  {
    href: '#therapist', icon: '🩺', title: 'Therapist Workspace',
    blurb: 'Patient roster, patient card, calendar, the live session workspace with the three-tab panel and Good Loop treatment monitoring, session reports, prescriptions and the sandbox.',
  },
  {
    href: '#employer', icon: '📊', title: 'Corporate Dashboard',
    blurb: 'Setup wizard, adoption and wellbeing aggregates, reports, management and settings. Aggregates only, k-anonymous below five participants.',
    loginHint: 'camila@aurora.co',
  },
  {
    href: '#nr1', icon: '📋', title: 'NR-1 report',
    blurb: 'The regulatory psychosocial-risk report — a separate surface with its own vocabulary.',
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
  {
    href: '#b2c-legacy', icon: '🕰', title: 'Previous employee app',
    blurb: 'The surface that preceded the Self Use spec — kept reachable while the new one beds in.',
  },
  {
    href: '#b2b-legacy', icon: '🕰', title: 'Previous therapist console',
    blurb: 'The surface that preceded the Workspace spec.',
  },
]

export function Hub() {
  const { t } = useI18n()
  return (
    <div className="hub">
      <div className="hub__inner">
        <header className="hub__head">
          <div className="auth__brand">goodloop</div>
          <h1 className="hub__title">{t('One platform, every surface')}</h1>
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
