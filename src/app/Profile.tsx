import { useState } from 'react'
import { SignOutButton } from '../auth/auth'
import { useI18n, LOCALES } from '../i18n'

interface ProfileProps {
  demoSeconds: number | null
  onDemoToggle: () => void
}

type Reminder = 'off' | 'daily' | 'weekly'
const REMINDER_LABEL: Record<Reminder, string> = { off: 'Off', daily: 'Daily', weekly: 'Weekly' }

export function Profile({ demoSeconds, onDemoToggle }: ProfileProps) {
  const [reminder, setReminder] = useState<Reminder>('daily')
  const [toast, setToast] = useState<string | null>(null)
  const { t, locale, setLocale } = useI18n()

  function flash(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 1800)
  }

  function confirmDelete() {
    if (window.confirm(t('Delete your account and all data? This cannot be undone.'))) {
      flash(t('Deletion requested'))
    }
  }

  return (
    <div className="screen profile">
      <h1 className="display" style={{ marginBottom: 18 }}>{t('Profile')}</h1>

      <div className="profile__id">
        <div className="profile__avatar">🙂</div>
        <div>
          <div className="history__title">{t('You')}</div>
          <div className="muted small">{t('Signed in with Apple')}</div>
        </div>
      </div>

      <section className="card">
        <h2 className="card__title" style={{ marginBottom: 12 }}>{t('Reminders')}</h2>
        <p className="muted small" style={{ marginBottom: 12 }}>{t('A gentle nudge — never a guilt trip, never a streak.')}</p>
        <div className="chip-row">
          {(['off', 'daily', 'weekly'] as Reminder[]).map((r) => (
            <button key={r} className="chip" aria-pressed={reminder === r} onClick={() => setReminder(r)}>
              <span className="chip__label">{t(REMINDER_LABEL[r])}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="card__title" style={{ marginBottom: 12 }}>{t('Language')}</h2>
        <div className="chip-row">
          {LOCALES.map((l) => (
            <button key={l.code} className="chip" aria-pressed={locale === l.code} onClick={() => setLocale(l.code)}>
              <span className="chip__label">{l.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="card__title" style={{ marginBottom: 6 }}>{t('Your data')}</h2>
        <p className="muted small" style={{ marginBottom: 14 }}>{t('Your health data is yours. Take it or remove it at any time.')}</p>
        <div className="btn-stack">
          <button className="btn btn--ghost" onClick={() => flash(t('Export started'))}>{t('Export my data (PDF)')}</button>
          <button className="btn btn--danger" onClick={confirmDelete}>{t('Delete account & all data')}</button>
        </div>
      </section>

      <SignOutButton className="btn btn--ghost" />

      <button className="dev-inline" onClick={onDemoToggle}>
        Dev · session length: {demoSeconds === null ? 'full' : '1 min demo'}
      </button>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
