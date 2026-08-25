/* ============================================================================
   Corporate Dashboard — Settings (5 sub-sections)

     Company Profile   name & country locked at provisioning; the rest editable
     EAP Contact       the same form as setup, plus the employee-app preview
     Admin Management  Owner + Admins; the Owner can never be removed here
     Notifications     five email switches
     Data & Privacy    information only — it states the architecture, and the
                       consent figure that explains gaps in wellbeing metrics

   Two structural rules:
   · There is always at least one Owner. The remove control is not rendered for
     the Owner row at all, rather than rendered-and-disabled, because an Owner
     transfer is a support operation and offering the button implies otherwise.
   · Data & Privacy has no controls. It is not a settings page pretending to be
     one — the guarantees it lists are properties of the platform, and an HR
     admin cannot switch them off.
   ============================================================================ */

import { useState } from 'react'
import { useI18n } from '../i18n'
import { EapForm } from './Setup'
import { pct, type AdminRow, type CorporateState } from './metrics'
import type { EapContact } from '../data/convention'

export type SettingsSection = 'profile' | 'eap' | 'admins' | 'notifications' | 'privacy'

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: 'profile', label: 'Company Profile' },
  { id: 'eap', label: 'EAP Contact' },
  { id: 'admins', label: 'Admin Management' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'privacy', label: 'Data & Privacy' },
]

const INDUSTRIES = ['Technology', 'Finance', 'Healthcare', 'Manufacturing', 'Retail', 'Education', 'Public sector', 'Other']
const SIZES = ['1–50', '51–200', '201–500', '501–1000', '1001–5000', '5000+']

interface SettingsProps {
  state: CorporateState
  registered: number
  update: (fn: (s: CorporateState) => CorporateState) => void
}

export function Settings({ state, registered, update }: SettingsProps) {
  const { t } = useI18n()
  const [section, setSection] = useState<SettingsSection>('profile')

  return (
    <>
      <h1 className="c-h1">{t('Settings')}</h1>
      <div className="c-settings">
        <nav className="c-subnav" role="tablist">
          {SECTIONS.map((s) => (
            <button key={s.id} role="tab" aria-selected={section === s.id} onClick={() => setSection(s.id)}>
              {t(s.label)}
            </button>
          ))}
        </nav>
        <div className="c-settings__body">
          {section === 'profile' && <Profile state={state} update={update} />}
          {section === 'eap' && <Eap state={state} update={update} />}
          {section === 'admins' && <Admins state={state} update={update} />}
          {section === 'notifications' && <Notifications state={state} update={update} />}
          {section === 'privacy' && <Privacy state={state} registered={registered} />}
        </div>
      </div>
    </>
  )
}

/* ------------------------------------------------------------- profile --- */

function Profile({ state, update }: { state: CorporateState; update: SettingsProps['update'] }) {
  const { t } = useI18n()
  const [form, setForm] = useState(state.profile)
  const [saved, setSaved] = useState(false)
  const set = (patch: Partial<typeof form>) => { setForm({ ...form, ...patch }); setSaved(false) }

  return (
    <>
      <h2 className="c-h2">{t('Company Profile')}</h2>
      <div className="c-form">
        <label className="c-field">
          <span className="c-field__label">{t('Company name')} <em className="c-locked">· {t('locked')}</em></span>
          <input className="c-input" value={form.name} readOnly />
        </label>
        <label className="c-field">
          <span className="c-field__label">{t('Country')} <em className="c-locked">· {t('locked')}</em></span>
          <input className="c-input" value={form.country} readOnly />
        </label>
        <label className="c-field">
          <span className="c-field__label">{t('Industry')}</span>
          <select className="c-input" value={form.industry} onChange={(e) => set({ industry: e.target.value })}>
            {INDUSTRIES.map((i) => <option key={i} value={i}>{t(i)}</option>)}
          </select>
        </label>
        <label className="c-field">
          <span className="c-field__label">{t('Company size')}</span>
          <select className="c-input" value={form.size} onChange={(e) => set({ size: e.target.value })}>
            {SIZES.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </label>
        <label className="c-field">
          <span className="c-field__label">{t('Primary contact name')}</span>
          <input className="c-input" value={form.contactName} onChange={(e) => set({ contactName: e.target.value })} />
        </label>
        <label className="c-field">
          <span className="c-field__label">{t('Primary contact email')}</span>
          <input className="c-input" type="email" value={form.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} />
        </label>
        <label className="c-field">
          <span className="c-field__label">{t('Primary contact phone')}</span>
          <input className="c-input" value={form.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} />
        </label>
      </div>
      <div className="c-actions c-actions--left">
        <button className="c-btn c-btn--primary" onClick={() => { update((s) => ({ ...s, profile: form })); setSaved(true) }}>
          {t('Save changes')}
        </button>
        {saved && <span className="c-small">{t('Saved')}</span>}
      </div>
    </>
  )
}

/* ----------------------------------------------------------------- eap --- */

function Eap({ state, update }: { state: CorporateState; update: SettingsProps['update'] }) {
  const { t } = useI18n()
  const [eap, setEap] = useState<EapContact>(
    state.eap ?? { provider: '', phone: '', email: '', website: '', info: '' },
  )
  const [saved, setSaved] = useState(false)

  return (
    <>
      <h2 className="c-h2">{t('EAP Contact')}</h2>
      <p className="c-lead">{t("Same form as setup — fully editable. Feeds the employee app's Safety Gateway.")}</p>
      <EapForm value={eap} onChange={(v) => { setEap(v); setSaved(false) }} />
      <div className="c-preview">
        <div className="c-preview__label">{t('App preview')}</div>
        <div className="c-preview__card">
          <strong>{eap.provider || t('EAP provider name')}</strong>
          <span>{[eap.phone, eap.info].filter(Boolean).join(' · ') || t('Phone · availability')}</span>
        </div>
      </div>
      <div className="c-actions c-actions--left">
        <button
          className="c-btn c-btn--primary"
          onClick={() => {
            update((s) => ({ ...s, eap: eap.provider.trim() && eap.phone.trim() ? eap : null }))
            setSaved(true)
          }}
        >
          {t('Save changes')}
        </button>
        {saved && <span className="c-small">{t('Saved')}</span>}
      </div>
    </>
  )
}

/* -------------------------------------------------------------- admins --- */

function Admins({ state, update }: { state: CorporateState; update: SettingsProps['update'] }) {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [removing, setRemoving] = useState<AdminRow | null>(null)

  function invite() {
    const addr = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) return
    if (state.admins.some((a) => a.email === addr)) return
    update((s) => ({
      ...s,
      admins: [...s.admins, { id: `ad-${Date.now()}`, name: addr.split('@')[0], email: addr, role: 'admin', addedAt: Date.now() }],
    }))
    setEmail('')
  }

  return (
    <>
      <h2 className="c-h2">{t('Admin Management')}</h2>
      <p className="c-lead">{t('Manage who has access to this Corporate Dashboard.')}</p>

      <div className="c-inviterow">
        <input
          className="c-input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="colleague@company.com"
          onKeyDown={(e) => e.key === 'Enter' && invite()}
        />
        <button className="c-btn c-btn--primary" onClick={invite}>{t('Invite admin')}</button>
      </div>

      <table className="c-table">
        <thead>
          <tr><th>{t('Name')}</th><th>{t('Email')}</th><th>{t('Role')}</th><th>{t('Added')}</th><th>{t('Actions')}</th></tr>
        </thead>
        <tbody>
          {state.admins.map((a) => (
            <tr key={a.id}>
              <td>{a.name}</td>
              <td className="c-small">{a.email}</td>
              <td>{a.role === 'owner' ? t('Owner') : t('Admin')}</td>
              <td className="c-small">{new Date(a.addedAt).toLocaleDateString()}</td>
              <td>
                {/* No control at all for the Owner — an Owner transfer is a
                    support operation, and a disabled button would suggest
                    otherwise. */}
                {a.role === 'admin' ? <button className="c-link" onClick={() => setRemoving(a)}>{t('Remove')}</button> : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="c-twocol">
        <div>
          <div className="c-field__label">{t('Owner')}</div>
          <p className="c-small">
            {t('Full access. Cannot be removed (transferred only by Good Loop support). Can invite and remove admins.')}
          </p>
        </div>
        <div>
          <div className="c-field__label">{t('Admin')}</div>
          <p className="c-small">
            {t('Full dashboard access. Can view all data, generate reports, manage codes and therapists. Cannot remove the Owner or other admins.')}
          </p>
        </div>
      </div>

      <p className="c-note">
        {t('Minimum 1 Owner always exists. Removing an admin revokes access immediately. All admin actions are logged.')}
      </p>

      {removing && (
        <div className="c-scrim" onClick={() => setRemoving(null)} role="dialog" aria-modal="true">
          <div className="c-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="c-h2">{t('Remove {name}?', { name: removing.name })}</h2>
            <p className="c-lead">{t('Their access to this dashboard is revoked immediately.')}</p>
            <div className="c-actions">
              <button className="c-btn c-btn--ghost" onClick={() => setRemoving(null)}>{t('Cancel')}</button>
              <button
                className="c-btn c-btn--primary"
                onClick={() => {
                  update((s) => ({ ...s, admins: s.admins.filter((x) => x.id !== removing.id) }))
                  setRemoving(null)
                }}
              >
                {t('Remove')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------- notifications --- */

const NOTIFS: { key: keyof CorporateState['notifications']; label: string }[] = [
  { key: 'monthlyReport', label: 'Monthly report ready' },
  { key: 'quarterlyReport', label: 'Quarterly report ready' },
  { key: 'renewalReminder', label: 'Convention renewal reminder (60 days)' },
  { key: 'licenceAlert', label: 'License utilization alert (>80%)' },
  { key: 'therapistStatus', label: 'Therapist invitation status change' },
]

function Notifications({ state, update }: { state: CorporateState; update: SettingsProps['update'] }) {
  const { t } = useI18n()
  return (
    <>
      <h2 className="c-h2">{t('Notifications')}</h2>
      <ul className="c-switches">
        {NOTIFS.map((n) => (
          <li key={n.key}>
            <span>{t(n.label)}</span>
            <button
              className={`switch${state.notifications[n.key] ? ' is-on' : ''}`}
              role="switch"
              aria-checked={state.notifications[n.key]}
              aria-label={t(n.label)}
              onClick={() => update((s) => ({ ...s, notifications: { ...s.notifications, [n.key]: !s.notifications[n.key] } }))}
            >
              <span className="switch__knob" />
            </button>
          </li>
        ))}
      </ul>
      <p className="c-note">{t('All via email.')}</p>
    </>
  )
}

/* ------------------------------------------------------------- privacy --- */

function Privacy({ state, registered }: { state: CorporateState; registered: number }) {
  const { t } = useI18n()
  return (
    <>
      <h2 className="c-h2">{t('Data & Privacy')}</h2>
      <h3 className="c-sect">{t('How employee data is protected')}</h3>
      <ul className="c-bullets">
        <li>{t('Individual employee data is never visible in this dashboard.')}</li>
        <li>{t('All metrics require a minimum of 5 responses to be displayed.')}</li>
        <li>{t('Employees can opt out of anonymous data sharing with zero consequences.')}</li>
        <li>{t('Therapy sessions are fully confidential — only an anonymous count is shown.')}</li>
      </ul>

      <section className="c-card">
        <header className="c-card__head"><h2>{t('Consent overview')}</h2></header>
        <div className="c-kpi__value">
          {t('{n} of {r} employees ({p}%)', { n: state.consented, r: registered, p: pct(state.consented, registered) })}
        </div>
        <p className="c-small">
          {t('opted into anonymous data sharing — affects wellbeing metric completeness.')}
        </p>
      </section>

      <div className="c-actions c-actions--left">
        <a className="c-link" href="#data-retention">{t('Data retention policy')}</a>
        <a className="c-link" href="#compliance">{t('GDPR / LGPD compliance')}</a>
      </div>
    </>
  )
}
