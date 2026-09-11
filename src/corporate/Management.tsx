/* ============================================================================
   Corporate Dashboard — Management (Users · Company Code · Licenses · Therapists)

   The Users tab is COUNTS ONLY. There is no employee list, no search, no
   drill-down, and no export of names — not because the UI hides them but
   because the aggregate the dashboard receives never contains them.

   "Aggregate consent given" is on this tab for a specific reason: it explains
   why wellbeing metrics can have fewer data points than the headcount. Without
   it, a suppressed chart looks like a bug rather than a person's choice.

   The Therapists tab is conditional on the convention and carries a permanent
   privacy box. HR sees a therapist's name, licence, specializations and status
   — and nothing about their patients, sessions, notes or performance. Removing
   a therapist severs the convention link only; their Good Loop account and
   their current patients' access through the grace period are untouched.
   ============================================================================ */

import { useState } from 'react'
import { useI18n, fmtDate } from '../i18n'
import { Sparkline } from './Charts'
import { graceEndsAt } from '../data/convention'
import {
  cellValue,
  daysUntil,
  generateCompanyCode,
  pct,
  utilisationHigh,
  RENEWAL_NOTICE_DAYS,
  type CorporateState,
  type TherapistRow,
} from './metrics'
import type { Aggregates } from './data'

export type MgmtTab = 'users' | 'code' | 'licenses' | 'therapists'

interface ManagementProps {
  state: CorporateState
  agg: Aggregates
  update: (fn: (s: CorporateState) => CorporateState) => void
}

export function Management({ state, agg, update }: ManagementProps) {
  const { t } = useI18n()
  const plus = state.conventionType === 'self-use-plus'
  const [tab, setTab] = useState<MgmtTab>('users')

  const tabs: { id: MgmtTab; label: string }[] = [
    { id: 'users', label: 'Users' },
    { id: 'code', label: 'Company Code' },
    { id: 'licenses', label: 'Licenses' },
    ...(plus ? [{ id: 'therapists' as const, label: 'Therapists' }] : []),
  ]

  return (
    <>
      <h1 className="c-h1">{t('Management')}</h1>
      <nav className="c-subtabs" role="tablist">
        {tabs.map((x) => (
          <button key={x.id} role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)}>
            {t(x.label)}
          </button>
        ))}
      </nav>

      {tab === 'users' && <UsersTab state={state} agg={agg} />}
      {tab === 'code' && <CodeTab state={state} agg={agg} update={update} />}
      {tab === 'licenses' && <LicensesTab state={state} agg={agg} />}
      {tab === 'therapists' && plus && <TherapistsTab state={state} update={update} />}
    </>
  )
}

/* --------------------------------------------------------------- users --- */

function UsersTab({ state, agg }: { state: CorporateState; agg: Aggregates }) {
  const { t } = useI18n()
  const k = agg.kpis
  const registered = cellValue(k.registered) ?? 0
  const active = cellValue(k.active7) ?? 0
  const inactive = Math.max(0, registered - active - 20)
  const days = daysUntil(state.conventionEnd)

  return (
    <>
      <p className="c-note">{t('This section shows aggregate counts only — never individual names or activity.')}</p>

      <div className="c-grid4">
        <Count label={t('Registered')} value={registered} sub={t('of {n} licenses', { n: state.licences })} />
        <Count label={t('Active (7-day)')} value={active} sub={t('{n}% of registered', { n: pct(active, registered) })} />
        <Count label={t('Inactive (30+ days)')} value={inactive} sub={t('{n}% of registered', { n: pct(inactive, registered) })} />
        <Count
          label={t('Aggregate consent')}
          value={state.consented}
          sub={t('{n}% opted in to sharing', { n: pct(state.consented, registered) })}
        />
      </div>

      <section className="c-card">
        <header className="c-card__head"><h2>{t('Convention status')}</h2></header>
        <dl className="c-summary">
          <div><dt>{t('Status')}</dt><dd><span className="c-dot" aria-hidden="true" /> {days > 0 ? t('Active') : t('Expired')}</dd></div>
          <div><dt>{t('Start date')}</dt><dd>{fmtDate(state.conventionStart, { month: 'short', day: 'numeric', year: 'numeric' })}</dd></div>
          <div><dt>{t('End date')}</dt><dd>{fmtDate(state.conventionEnd, { month: 'short', day: 'numeric', year: 'numeric' })}</dd></div>
          <div><dt>{t('Days remaining')}</dt><dd>{days}</dd></div>
          <div>
            <dt>{t('Grace period')}</dt>
            <dd className="c-small">
              {t('Employees retain access until {d}.', {
                d: fmtDate(graceEndsAt(state.conventionEnd), { month: 'long', day: 'numeric', year: 'numeric' }),
              })}
            </dd>
          </div>
        </dl>
        {days <= RENEWAL_NOTICE_DAYS && days > 0 && (
          <p className="c-alertbox">{t('Renewal approaching — contact your Good Loop representative.')}</p>
        )}
      </section>
    </>
  )
}

function Count({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <article className="c-card c-metric">
      <div className="c-kpi__label">{label}</div>
      <div className="c-kpi__value">{value.toLocaleString()}</div>
      <p className="c-small">{sub}</p>
    </article>
  )
}

/* ---------------------------------------------------------------- code --- */

function CodeTab({ state, agg, update }: ManagementProps) {
  const { t } = useI18n()
  const [confirm, setConfirm] = useState(false)
  const [copied, setCopied] = useState(false)
  const registered = cellValue(agg.kpis.registered) ?? 0

  function copy() {
    navigator.clipboard?.writeText(state.companyCode).then(
      () => { setCopied(true); window.setTimeout(() => setCopied(false), 1800) },
      () => { /* clipboard blocked — the code is selectable on screen */ },
    )
  }

  /* Rotation, not a new shape. Bolting a random two-digit tail onto a minted
     code produced a fourth thing nothing could resolve; the minter takes a
     rotation seed and returns a code of the SAME canonical shape, which is
     what has to be registered for the new one to open anything. */
  function regenerate() {
    update((s) => ({
      ...s,
      companyCode: generateCompanyCode(s.profile.name, new Date(s.conventionStart).getFullYear(), Date.now()),
    }))
    setConfirm(false)
  }

  function shareByEmail() {
    const subject = encodeURIComponent(`Your Good Loop access code — ${state.profile.name}`)
    const body = encodeURIComponent(
      [
        `Good Loop is now available to you through ${state.profile.name}.`,
        '',
        `Company code: ${state.companyCode}`,
        '',
        'Download the app, create your account, and enter this code during registration to link it to your company plan.',
      ].join('\n'),
    )
    window.location.href = `mailto:?subject=${subject}&body=${body}`
  }

  return (
    <>
      <section className="c-card">
        <div className="c-code">
          <span className="c-code__value">{state.companyCode}</span>
          <button className="c-btn c-btn--ghost" onClick={copy}>{copied ? t('Copied') : t('Copy')}</button>
        </div>
        <p className="c-small">
          {t('Shared with employees to link their Good Loop account to {company}.', { company: state.profile.name })}
        </p>
        <div className="c-actions c-actions--left">
          <button className="c-btn c-btn--ghost" onClick={() => setConfirm(true)}>{t('Regenerate code')}</button>
          <button className="c-btn c-btn--ghost" onClick={shareByEmail}>{t('Share via email')}</button>
        </div>
        <p className="c-note">
          {t('Regenerating deactivates the old code. Already-registered employees are unaffected.')}
        </p>
      </section>

      <section className="c-card">
        <header className="c-card__head"><h2>{t('Usage')}</h2></header>
        <p>{t('This code has been used by {n} employees', { n: registered })}</p>
        <Sparkline values={agg.engagement.registrationSeries.map((p) => p.value)} />
      </section>

      {confirm && (
        <div className="c-scrim" onClick={() => setConfirm(false)} role="dialog" aria-modal="true">
          <div className="c-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="c-h2">{t('Regenerate company code?')}</h2>
            <p className="c-lead">
              {t('The current code stops working immediately. Employees who already registered keep their access; anyone who has not yet registered will need the new code.')}
            </p>
            <div className="c-actions">
              <button className="c-btn c-btn--ghost" onClick={() => setConfirm(false)}>{t('Cancel')}</button>
              <button className="c-btn c-btn--primary" onClick={regenerate}>{t('Regenerate')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------------ licenses --- */

function LicensesTab({ state, agg }: { state: CorporateState; agg: Aggregates }) {
  const { t } = useI18n()
  const used = cellValue(agg.kpis.registered) ?? 0
  const total = state.licences
  const available = Math.max(0, total - used)
  const high = utilisationHigh(used, total)

  return (
    <>
      <div className="c-grid3">
        <Count label={t('Total')} value={total} sub="" />
        <Count label={t('Used')} value={used} sub={t('{n}%', { n: pct(used, total) })} />
        <Count label={t('Available')} value={available} sub="" />
      </div>

      <section className="c-card">
        <div className="c-usebar" aria-hidden="true"><span style={{ width: `${pct(used, total)}%` }} /></div>
        {high && (
          <>
            <p className="c-alertbox">
              {t('License utilization is high. Contact your Good Loop representative to expand your plan.')}
            </p>
            <a
              className="c-btn c-btn--primary"
              href={`mailto:sales@goodloop.health?subject=${encodeURIComponent(`Licence expansion — ${state.profile.name}`)}`}
            >
              {t('Contact Good Loop')}
            </a>
          </>
        )}
        <p className="c-note">{t('License count is set by the commercial agreement — not self-service.')}</p>
      </section>
    </>
  )
}

/* ---------------------------------------------------------- therapists --- */

const STATUS_LABEL: Record<TherapistRow['status'], string> = {
  active: 'Active',
  'pending-invitation': 'Pending invitation',
  'pending-verification': 'Pending verification',
  declined: 'Declined',
  removed: 'Removed',
}

function TherapistsTab({ state, update }: { state: CorporateState; update: ManagementProps['update'] }) {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [removing, setRemoving] = useState<TherapistRow | null>(null)

  function invite() {
    const addr = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) return
    if (state.therapists.some((x) => x.email === addr && x.status !== 'removed')) return
    update((s) => ({
      ...s,
      therapists: [
        ...s.therapists,
        { id: `th-${Date.now()}`, name: '', crp: '', specializations: [], status: 'pending-invitation', email: addr, invitedAt: Date.now() },
      ],
    }))
    setEmail('')
  }

  function setStatus(id: string, status: TherapistRow['status']) {
    update((s) => ({ ...s, therapists: s.therapists.map((x) => (x.id === id ? { ...x, status } : x)) }))
  }

  return (
    <>
      <section className="c-card">
        <header className="c-card__head">
          <h2>{t('Therapists in your convention')}</h2>
        </header>
        <div className="c-inviterow">
          <input
            className="c-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="therapist@email.com"
            onKeyDown={(e) => e.key === 'Enter' && invite()}
          />
          <button className="c-btn c-btn--primary" onClick={invite}>{t('Invite therapist')}</button>
        </div>

        {!state.therapists.length ? (
          <p className="c-small">{t('No therapists yet. Invite therapists to enable professional support.')}</p>
        ) : (
          <table className="c-table">
            <thead>
              <tr>
                <th>{t('Name')}</th><th>{t('License (CRP)')}</th><th>{t('Specializations')}</th><th>{t('Status')}</th><th>{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {state.therapists.map((th) => (
                <tr key={th.id}>
                  <td>{th.name || th.email}</td>
                  <td className="c-small">{th.crp || '—'}</td>
                  <td className="c-small">
                    {th.specializations.length ? th.specializations.map((s) => <span key={s} className="c-badge">{t(s)}</span>) : '—'}
                  </td>
                  <td><span className={`c-status c-status--${th.status}`}>{t(STATUS_LABEL[th.status])}</span></td>
                  <td className="c-small">
                    {th.status === 'active' && <button className="c-link" onClick={() => setRemoving(th)}>{t('Remove')}</button>}
                    {th.status === 'pending-invitation' && (
                      <>
                        <button className="c-link" onClick={() => setStatus(th.id, 'pending-invitation')}>{t('Resend')}</button>
                        {' · '}
                        <button className="c-link" onClick={() => update((s) => ({ ...s, therapists: s.therapists.filter((x) => x.id !== th.id) }))}>
                          {t('Cancel')}
                        </button>
                      </>
                    )}
                    {th.status === 'pending-verification' && '—'}
                    {(th.status === 'removed' || th.status === 'declined') && (
                      <button className="c-link" onClick={() => setStatus(th.id, 'pending-invitation')}>{t('Re-invite')}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Permanent — not dismissible. */}
      <p className="c-interpret">
        {t('For privacy reasons, you cannot see which employees are connected to which therapist, or any details about therapy sessions. The only information available is the total number of employees using professional support, shown on the Overview page.')}
      </p>

      <section className="c-card">
        <header className="c-card__head"><h2>{t('What you see, and what you do not')}</h2></header>
        <div className="c-twocol">
          <div>
            <div className="c-field__label">{t('HR sees')}</div>
            <ul className="c-bullets">
              <li>{t('Name')}</li>
              <li>{t('License number (CRP)')}</li>
              <li>{t('Specializations')}</li>
              <li>{t('Status (Active/Pending/Removed)')}</li>
            </ul>
          </div>
          <div>
            <div className="c-field__label">{t('HR does NOT see')}</div>
            <ul className="c-bullets">
              <li>{t('Patient count')}</li>
              <li>{t('Session count')}</li>
              <li>{t('VAS data, notes, reports')}</li>
              <li>{t('Performance metrics')}</li>
              <li>{t('Which employee is connected to which therapist')}</li>
            </ul>
          </div>
        </div>
      </section>

      {removing && (
        <div className="c-scrim" onClick={() => setRemoving(null)} role="dialog" aria-modal="true">
          <div className="c-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="c-h2">{t('Remove {name} from your convention?', { name: removing.name || removing.email || '' })}</h2>
            <p className="c-lead">
              {t('Current patients will retain their connection until the end of their current quarterly cycle.')}
            </p>
            <div className="c-actions">
              <button className="c-btn c-btn--ghost" onClick={() => setRemoving(null)}>{t('Cancel')}</button>
              <button className="c-btn c-btn--primary" onClick={() => { setStatus(removing.id, 'removed'); setRemoving(null) }}>
                {t('Remove')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
