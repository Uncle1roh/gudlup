/* ============================================================================
   Self Use — Profile (PRO-1 … PRO-5)

     PRO-1  main menu + Safety Gateway Level 1 footer (always present)
     PRO-2  Privacy & Data — consent toggles with their own timestamps
     PRO-3  Tutorial screens 1–4
     PRO-4  Tutorial screen 5 (only with a Professional Support convention)
     PRO-5  Delete account — type DELETE to arm the destructive button

   Also here, because they are menu leaves rather than screens of their own:
   Account settings, Notifications, Session preferences, Help, About.

   Every consent on PRO-2 is editable and each carries its own timestamp — the
   same per-item granularity ON-3 and ON-7 collected. Turning the aggregate
   consent off is not a downgrade and the copy never suggests it is.
   ============================================================================ */

import { useState } from 'react'
import { useI18n, LOCALES } from '../i18n'
import { SafetyLevel1 } from './Safety'
import { DURATIONS, INTAKE_TIMES, durationLabel } from '../data/selfuse'
import type { SelfUseState } from '../data/selfUseStore'
import type { Duration } from '../types/domain'
import type { Convention } from '../data/convention'

interface ProfileProps {
  name: string
  email: string
  convention: Convention | null
  hasTherapist: boolean
  state: SelfUseState
  update: (fn: (s: SelfUseState) => SelfUseState) => void
  onLogout: () => void
  onDeleteAccount: () => void
  onExport: () => void
}

type Page = 'menu' | 'account' | 'notifications' | 'prefs' | 'privacy' | 'tutorial' | 'help' | 'about' | 'delete'

export function ProfileTab(props: ProfileProps) {
  const { t } = useI18n()
  const [page, setPage] = useState<Page>('menu')

  if (page !== 'menu') {
    const back = () => setPage('menu')
    return (
      <div className="su-page">
        <button className="su-back" onClick={back}>‹ {t('Back')}</button>
        {page === 'account' && <AccountSettings {...props} />}
        {page === 'notifications' && <NotificationSettings {...props} />}
        {page === 'prefs' && <SessionPrefs {...props} />}
        {page === 'privacy' && <PrivacyData {...props} onDelete={() => setPage('delete')} />}
        {page === 'tutorial' && <Tutorial hasTherapistConvention={props.convention?.type === 'self-use-plus'} onDone={back} />}
        {page === 'help' && <Help />}
        {page === 'about' && <About />}
        {page === 'delete' && <DeleteAccount onCancel={back} onConfirm={props.onDeleteAccount} />}
      </div>
    )
  }

  const rows: { id: Page; label: string }[] = [
    { id: 'account', label: 'Account Settings' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'prefs', label: 'Session Preferences' },
    { id: 'privacy', label: 'Privacy & Data' },
    { id: 'tutorial', label: 'How Good Loop Works' },
    { id: 'help', label: 'Help & Support' },
    { id: 'about', label: 'About Good Loop' },
  ]

  return (
    <div className="su-page profile">
      <h1 className="display su-h1">{t('Profile')}</h1>
      <div className="profile__id">
        <span className="avatar avatar--lg" aria-hidden="true">
          {props.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')}
        </span>
        <div>
          <strong>{props.name}</strong>
          <div className="small muted">{props.email}</div>
        </div>
      </div>

      <ul className="menu">
        {rows.map((r) => (
          <li key={r.id}>
            <button className="menu__row" onClick={() => setPage(r.id)}>
              <span>{t(r.label)}</span>
              <span aria-hidden="true">›</span>
            </button>
          </li>
        ))}
      </ul>

      <button className="btn btn--ghost" onClick={props.onLogout}>{t('Log Out')}</button>

      <SafetyLevel1 />
    </div>
  )
}

/* ------------------------------------------------------------------------- */

function AccountSettings({ name, email, convention }: ProfileProps) {
  const { t, locale, setLocale } = useI18n()
  return (
    <>
      <h2 className="display su-h1">{t('Account Settings')}</h2>
      <Field label={t('Name')} value={name} />
      <Field label={t('Email')} value={email} />
      <Field label={t('Linked company')} value={convention?.companyName ?? t('Not linked')} locked />
      <label className="ob-field">
        <span className="ob-field__label">{t('Language')}</span>
        <select className="ob-input" value={locale} onChange={(e) => setLocale(e.target.value as typeof locale)}>
          {LOCALES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </label>
    </>
  )
}

function NotificationSettings({ state, update, hasTherapist }: ProfileProps) {
  const { t } = useI18n()
  const n = state.notifications
  const set = (patch: Partial<typeof n>) => update((s) => ({ ...s, notifications: { ...s.notifications, ...patch } }))

  return (
    <>
      <h2 className="display su-h1">{t('Notifications')}</h2>
      <Toggle label={t('Self Use reminders')} on={n.selfUseReminder} onToggle={() => set({ selfUseReminder: !n.selfUseReminder })} />
      {n.selfUseReminder && (
        <label className="ob-field">
          <span className="ob-field__label">{t('Reminder time')}</span>
          <select className="ob-input" value={n.selfUseReminderTime} onChange={(e) => set({ selfUseReminderTime: e.target.value as typeof n.selfUseReminderTime })}>
            {INTAKE_TIMES.map((o) => <option key={o.id} value={o.id}>{t(o.label)}</option>)}
          </select>
        </label>
      )}
      <Toggle label={t('Weekly check-in reminder')} on={n.glCheck} onToggle={() => set({ glCheck: !n.glCheck })} />
      <Toggle label={t('Monthly wellbeing reminder')} on={n.who5} onToggle={() => set({ who5: !n.who5 })} />
      <Toggle label={t('Motivational nudges')} on={n.nudges} onToggle={() => set({ nudges: !n.nudges })} />
      {hasTherapist && (
        <>
          <Toggle label={t('Therapist session reminders')} on={n.therapistSessions} onToggle={() => set({ therapistSessions: !n.therapistSessions })} />
          <Toggle label={t('Therapist messages')} on={n.therapistMessages} onToggle={() => set({ therapistMessages: !n.therapistMessages })} />
          <Toggle label={t('Prescription reminders')} on={n.prescriptions} onToggle={() => set({ prescriptions: !n.prescriptions })} />
        </>
      )}
      <p className="small muted">{t('Each setting is independent. Reminders never contain health information.')}</p>
    </>
  )
}

function SessionPrefs({ state, update }: ProfileProps) {
  const { t } = useI18n()
  const p = state.prefs
  const set = (patch: Partial<typeof p>) => update((s) => ({ ...s, prefs: { ...s.prefs, ...patch } }))

  return (
    <>
      <h2 className="display su-h1">{t('Session Preferences')}</h2>
      <div className="ob-field__label">{t('Default duration')}</div>
      <div className="chip-row">
        {DURATIONS.map((d: Duration) => (
          <button key={d} className="chip" aria-pressed={p.defaultDuration === d} onClick={() => set({ defaultDuration: d })}>
            <span className="chip__label">{t(durationLabel(d))}</span>
            <span className="chip__hint">{d} min</span>
          </button>
        ))}
      </div>

      <label className="ob-field">
        <span className="ob-field__label">{t('Preferred time')}</span>
        <select className="ob-input" value={p.preferredTime} onChange={(e) => set({ preferredTime: e.target.value as typeof p.preferredTime })}>
          {INTAKE_TIMES.map((o) => <option key={o.id} value={o.id}>{t(o.label)}</option>)}
        </select>
      </label>

      <label className="ob-field">
        <span className="ob-field__label">{t('Audio quality')}</span>
        <select className="ob-input" value={p.audioQuality} onChange={(e) => set({ audioQuality: e.target.value as 'standard' | 'high' })}>
          <option value="standard">{t('Standard')}</option>
          <option value="high">{t('High')}</option>
        </select>
      </label>
    </>
  )
}

/* -------------------------------------------------------------- PRO-2 ---- */

function PrivacyData({ state, update, hasTherapist, onExport, onDelete }: ProfileProps & { onDelete: () => void }) {
  const { t } = useI18n()
  const c = state.consents

  function stamp(field: 'aggregate' | 'notifications' | 'therapistBridge') {
    update((s) => {
      const on = !s.consents[field]
      const atField = `${field}At` as 'aggregateAt' | 'notificationsAt' | 'therapistBridgeAt'
      return { ...s, consents: { ...s.consents, [field]: on, [atField]: Date.now() } }
    })
  }

  const when = (ms: number | null) =>
    ms ? t('Updated {date}', { date: new Date(ms).toLocaleDateString() }) : t('Not set')

  return (
    <>
      <h2 className="display su-h1">{t('Privacy & Data')}</h2>
      <h3 className="home__sect">{t('Consents')}</h3>

      <div className="consent-row">
        <div className="consent-row__main">
          <div className="consent-row__text">
            <div className="consent-row__title">{t('App usage & session data')}</div>
            <span className="small muted">{when(c.usageAt)}</span>
          </div>
          <span className="badge badge--on">{t('REQUIRED')}</span>
        </div>
      </div>

      <Toggle
        label={t('Aggregate company reports')}
        hint={c.aggregate ? when(c.aggregateAt) : t('Off · never shared individually')}
        on={c.aggregate}
        onToggle={() => stamp('aggregate')}
      />
      <Toggle
        label={t('Push notifications & reminders')}
        hint={when(c.notificationsAt)}
        on={c.notifications}
        onToggle={() => stamp('notifications')}
      />
      {hasTherapist && (
        <Toggle
          label={t('Share Self Use data with therapist')}
          hint={t('Revocable anytime')}
          on={c.therapistBridge}
          onToggle={() => stamp('therapistBridge')}
        />
      )}

      <button className="btn btn--ghost" onClick={onExport}>{t('Export my data')}</button>
      <button className="btn btn--danger" onClick={onDelete}>{t('Delete my account')}</button>
    </>
  )
}

/* -------------------------------------------------------------- PRO-5 ---- */

function DeleteAccount({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const { t } = useI18n()
  const [typed, setTyped] = useState('')
  const armed = typed.trim().toUpperCase() === 'DELETE'

  return (
    <>
      <h2 className="display su-h1">{t('Delete your account?')}</h2>
      <p className="lead">
        {t('This permanently removes your account, sessions, and check-in history. This cannot be undone. Consider exporting your data first.')}
      </p>
      <label className="ob-field">
        <span className="ob-field__label">{t('Type DELETE to confirm')}</span>
        <input className="ob-input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="DELETE" autoCapitalize="characters" />
      </label>
      <button className="btn btn--danger" disabled={!armed} onClick={onConfirm}>{t('Delete account')}</button>
      <button className="btn btn--quiet" onClick={onCancel}>{t('Cancel')}</button>
    </>
  )
}

/* ------------------------------------------------------ PRO-3 / PRO-4 ---- */

const TUTORIAL = [
  {
    title: 'Why headphones matter',
    body: 'Good Loop uses stereo audio technology. Always use wired stereo headphones for the full experience.',
  },
  {
    title: 'What happens during a session',
    body: 'The screen goes dark by design. Close your eyes, listen, and let the audio do the work.',
  },
  {
    title: 'Your pathway',
    body: 'A pathway is a multi-week journey — the sessions build on each other. No pressure: go at your own speed.',
  },
  {
    title: 'Check-ins',
    body: 'Weekly and monthly check-ins live in the Progress tab. Less than a minute, and completely optional.',
  },
]

const TUTORIAL_THERAPIST = {
  title: 'Professional support',
  body: 'Connect with a therapist for guided sessions. They lead the experience while you listen. Your therapist can also prescribe sessions for you to do on your own.',
}

export function Tutorial({
  hasTherapistConvention,
  onDone,
}: {
  hasTherapistConvention: boolean
  onDone: () => void
}) {
  const { t } = useI18n()
  const screens = hasTherapistConvention ? [...TUTORIAL, TUTORIAL_THERAPIST] : TUTORIAL
  const [i, setI] = useState(0)
  const last = i === screens.length - 1

  return (
    <div className="tutorial">
      <button className="tutorial__skip" onClick={onDone}>{t('Skip')}</button>
      <div className="tutorial__art" aria-hidden="true"><span className="ob-art__glow" /></div>
      <h2 className="display su-h1">{t(screens[i].title)}</h2>
      <p className="lead">{t(screens[i].body)}</p>
      <div className="progress-dots">
        {screens.map((_, n) => <span key={n} className={n === i ? 'is-on' : ''} />)}
      </div>
      <button className="btn btn--primary" onClick={() => (last ? onDone() : setI(i + 1))}>
        {last ? t('Done') : t('Next')}
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------------- */

function Help() {
  const { t } = useI18n()
  return (
    <>
      <h2 className="display su-h1">{t('Help & Support')}</h2>
      <ul className="menu">
        <li><a className="menu__row" href="#faq"><span>{t('Frequently asked questions')}</span><span aria-hidden="true">›</span></a></li>
        <li><a className="menu__row" href="mailto:support@goodloop.health"><span>{t('Contact support')}</span><span aria-hidden="true">›</span></a></li>
        <li><a className="menu__row" href="mailto:support@goodloop.health?subject=Problem%20report"><span>{t('Report a problem')}</span><span aria-hidden="true">›</span></a></li>
      </ul>
    </>
  )
}

function About() {
  const { t } = useI18n()
  return (
    <>
      <h2 className="display su-h1">{t('About Good Loop')}</h2>
      <p className="small muted">{t('Version')} 1.0</p>
      <p className="lead">
        {t('Good Loop combines guided voice, stereo sound design and structured session phases into short audio practices you can fit into a working day.')}
      </p>
      <a href="https://goodloop.health">goodloop.health</a>
    </>
  )
}

function Field({ label, value, locked }: { label: string; value: string; locked?: boolean }) {
  return (
    <label className="ob-field">
      <span className="ob-field__label">{label}{locked && <em className="small muted"> · locked</em>}</span>
      <input className="ob-input" value={value} readOnly={locked} onChange={() => {}} />
    </label>
  )
}

function Toggle({ label, hint, on, onToggle }: { label: string; hint?: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="consent-row">
      <div className="consent-row__main">
        <div className="consent-row__text">
          <div className="consent-row__title">{label}</div>
          {hint && <span className="small muted">{hint}</span>}
        </div>
        <button className={`switch${on ? ' is-on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={onToggle}>
          <span className="switch__knob" />
        </button>
      </div>
    </div>
  )
}
