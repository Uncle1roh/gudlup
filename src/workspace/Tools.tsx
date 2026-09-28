/* ============================================================================
   Therapist Workspace — Messages · Prescriptions · Reports · Performance · Settings

   Messages     TH-MSG    two columns, 48h SLA visible only to the therapist
   Prescriptions TH-RX    cross-patient, sorted lowest adherence first
   Reports      TH-REPORTS archive with re-sign and multi-select PDF export
   Performance  TH-PERF   the therapist's own figures, private to them
   Settings     TH-SETTINGS five sub-sections

   Two things worth naming:

   · The SLA indicator is a working tool, not a score. It is shown to the
     therapist and to nobody else — not the patient, not an administrator, not
     a corporate client — because it exists to help them not lose a message,
     and would become something else entirely if anyone else could see it.

   · The prescriptions view is sorted by adherence ascending on purpose. It
     answers "who needs attention on homework this week", which is the only
     reason to open a cross-patient list at all. A nudge is a gentle push
     notification, offered only below 70%, and disabled for 48 hours after it
     is sent so it cannot become pestering.
   ============================================================================ */

import { useMemo, useState, useEffect } from 'react'
import { useDataProvider } from '../data/provider'
import { CONSENT_TEMPLATE_ITEMS, consentTemplateComplete, type InformedConsentTemplate, type ProfessionalRecord } from '../legal/records'
import { REVERIFY_MONTHS } from '../legal/market'
import { useI18n } from '../i18n'
import { LanguagePicker } from '../components/LanguagePicker'
import { fmtDate, initials, versionShort } from './Patients'
import { buildBatchReportPdf, buildSessionReportPdf } from './sessionPdf'
import {
  NOTIFICATION_ROWS,
  type WorkspaceState,
  rxTarget,
} from './data'

interface ToolProps {
  state: WorkspaceState
  update: (fn: (s: WorkspaceState) => WorkspaceState) => void
  onOpenPatient: (id: string) => void
}

/**
 * The fixture messages a demo patient was seeded with, in the shared thread's
 * shape, so one list renders both. They are read-only history: everything
 * written from here on goes to the store.
 */
/* ---------------------------------------------------------------- TH-RX -- */

type RxFilter = 'all' | 'active' | 'completed'

/**
 * Everything the professional has selected for people to listen to between
 * sessions, by patient name. It used to sort by an adherence percentage and
 * offer a "nudge" below 70% — the list answering "who needs attention" was
 * the software ranking people on a metric it computed (M2R-17, MN-29).
 * What is left is a record: what was chosen, for whom, and how many times it
 * was listened to.
 */
export function Prescriptions({ state, onOpenPatient }: ToolProps) {
  const { t } = useI18n()
  const [filter, setFilter] = useState<RxFilter>('active')

  const rows = useMemo(() => {
    const all = state.patients.flatMap((p) => p.prescriptions.map((rx) => ({ rx, patient: p })))
    const filtered = all.filter(({ rx }) => {
      const done = rx.done >= rxTarget(rx)
      if (filter === 'completed') return done
      if (filter === 'active') return rx.toAt >= Date.now() || !done
      return true
    })
    return filtered.sort((x, y) => x.patient.name.localeCompare(y.patient.name))
  }, [state.patients, filter])

  return (
    <>
      <h1 className="w-h1">{t('Selected content')}</h1>
      <div className="w-filters">
        {(['all', 'active', 'completed'] as RxFilter[]).map((f) => (
          <button key={f} className="w-chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {t(f === 'all' ? 'All' : f === 'active' ? 'Active' : 'Completed')}
          </button>
        ))}
      </div>

      {!rows.length ? (
        <div className="w-empty"><p>{t('Nothing selected.')}</p></div>
      ) : (
        <table className="w-table">
          <thead>
            <tr>
              <th>{t('Patient')}</th><th>{t('Content')}</th><th>{t('Freq.')}</th><th>{t('Period')}</th><th>{t('Listened')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ rx, patient }) => (
              <tr key={rx.id} className="w-row" onClick={() => onOpenPatient(patient.id)}>
                <td>
                  <span className="w-idcell">
                    <span className="w-avatar" aria-hidden="true">{initials(patient.name)}</span>
                    {patient.name}
                  </span>
                </td>
                <td className="w-mono w-small">{rx.protocolCode} · {versionShort(rx.version)}</td>
                <td>{rx.perWeek}×/{t('week')}</td>
                <td className="w-small">{fmtDate(rx.fromAt)} – {fmtDate(rx.toAt)}</td>
                <td className="w-small">{t('{done} of {total} done', { done: rx.done, total: rxTarget(rx) })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}

/* ----------------------------------------------------------- TH-REPORTS -- */

export function ReportsArchive({ state, onOpen }: { state: WorkspaceState; onOpen: (patientId: string, sessionId: string) => void }) {
  const { t } = useI18n()
  const [patientId, setPatientId] = useState<string>('all')
  const [kind, setKind] = useState<'all' | 'gl' | 'video'>('all')
  const [selected, setSelected] = useState<string[]>([])

  const rows = state.patients
    .flatMap((p) => p.sessions.map((s) => ({ s, p })))
    .filter(({ s, p }) => (patientId === 'all' || p.id === patientId) && (kind === 'all' || (kind === 'gl' ? s.kind === 'gl-video' : s.kind === 'video')))
    .sort((a, b) => b.s.at - a.s.at)

  /**
   * A real multi-page PDF, generated here rather than printed.
   *
   * One file with continuous page numbering, a cover listing what it
   * contains, and the confidentiality footer on every page — a report that
   * gets separated from its cover must still say what it is.
   */
  function exportPdf(ids: string[]) {
    if (!ids.length) return
    const wanted = new Set(ids)
    const groups = state.patients
      .map((p) => ({ patient: p, rows: p.sessions.filter((s) => wanted.has(s.id)) }))
      .filter((g) => g.rows.length)
    if (!groups.length) return

    const stamp = new Date().toISOString().slice(0, 10)
    if (groups.length === 1 && groups[0].rows.length === 1) {
      const g = groups[0]
      const row = g.rows[0]
      buildSessionReportPdf({ patient: g.patient, account: state.account, rows: g.rows })
        .save(`good-loop-session-${slug(g.patient.name)}-${new Date(row.at).toISOString().slice(0, 10)}.pdf`)
      return
    }
    buildBatchReportPdf(state.account, groups).save(`good-loop-session-reports-${stamp}.pdf`)
  }

  return (
    <>
      <div className="w-pagehead">
        <h1 className="w-h1">{t('Reports')}</h1>
        <div className="w-inline">
          <button className="w-btn w-btn--ghost" disabled={!selected.length} onClick={() => exportPdf(selected)}>
            {t('Export selected as PDF')}
          </button>
          <button className="w-btn w-btn--ghost" onClick={() => exportPdf(rows.map((r) => r.s.id))}>{t('Export all as PDF')}</button>
        </div>
      </div>

      <div className="w-filters">
        <select className="w-input w-input--sm" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
          <option value="all">{t('All patients')}</option>
          {state.patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {(['all', 'gl', 'video'] as const).map((k) => (
          <button key={k} className="w-chip" aria-pressed={kind === k} onClick={() => setKind(k)}>
            {t(k === 'all' ? 'All' : k === 'gl' ? 'GL sessions' : 'Video only')}
          </button>
        ))}
      </div>

      {!rows.length ? (
        <div className="w-empty"><p>{t('No session reports yet.')}</p></div>
      ) : (
        <table className="w-table">
          <thead>
            <tr>
              <th />
              <th>{t('Date')}</th><th>{t('Patient')}</th><th>{t('Type')}</th><th>{t('Content')}</th><th>{t('Status')}</th><th>{t('Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, p }) => (
              <tr key={s.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.includes(s.id)}
                    onChange={() => setSelected((cur) => (cur.includes(s.id) ? cur.filter((x) => x !== s.id) : [...cur, s.id]))}
                    aria-label={t('Select report')}
                  />
                </td>
                <td>{fmtDate(s.at)}</td>
                <td>{p.name}</td>
                <td>{s.kind === 'gl-video' ? t('GL + Video') : t('Video only')}</td>
                <td className="w-mono w-small">{s.protocolCode ? `${s.protocolCode} ${versionShort(s.version)}` : '—'}</td>
                <td>{s.signedAt ? `${t('Signed')} ✓` : t('Draft')}</td>
                <td>
                  <button className="w-link" onClick={() => onOpen(p.id, s.id)}>{t('View')}</button>
                  {' · '}
                  <button className="w-link" onClick={() => exportPdf([s.id])}>PDF</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="w-note">
        {t('Re-opening and re-signing creates a new version; the previous one is preserved in the audit trail. Every PDF carries your licence signature, and an unsigned report is watermarked as a draft.')}
      </p>
    </>
  )
}


/* ---------------------------------------------------------- TH-SETTINGS -- */

type SettingsSection = 'profile' | 'availability' | 'consent' | 'notifications' | 'privacy'

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'availability', label: 'Availability' },
  { id: 'consent', label: 'Consent form' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'privacy', label: 'Privacy & security' },
]

const SPECIALIZATIONS = ['Anxiety', 'Depression', 'Stress', 'Burnout', 'Resilience', 'Sleep', 'Work-life balance', 'Trauma']

/* ---- joining a company's list -------------------------------------------

   A company decides which therapists its people may book, and a therapist
   joins that list by entering the code the company gave them. It is the
   therapist who acts: an employer cannot add a clinician to their own list,
   because a name typed by an employer is not a verified professional. */
function CompanyActivation() {
  const { t } = useI18n()
  const dp = useDataProvider()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function redeem() {
    const entered = code.trim()
    if (!entered) return
    setBusy(true); setMsg(null)
    try {
      const res = await dp.redeemCompanyTherapistCode(entered)
      if (res.ok) {
        setMsg({ ok: true, text: t('Done — you are on {company}\u2019s list. Their people can book you.', { company: res.companyId }) })
        setCode('')
      } else {
        setMsg({
          ok: false,
          text:
            res.reason === 'revoked' ? t('That code was revoked. Ask the company for a new one.')
            : res.reason === 'already-used' ? t('That code has already been used by someone else.')
            : res.reason === 'not-a-therapist' ? t('Only a verified clinician account can join a company list.')
            : t('That code does not exist. Check it and try again.'),
        })
      }
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-activation">
      <span className="w-field__label">{t('Join a company list')}</span>
      <p className="w-small">
        {t('Enter the activation code a company gave you. Their employees will be able to book you; the company never sees who books you or anything about the sessions.')}
      </p>
      <div className="w-inline">
        <input
          className="w-input"
          value={code}
          placeholder="ACME-TH-7K2Q"
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === 'Enter') void redeem() }}
        />
        <button className="w-btn w-btn--primary" disabled={busy || !code.trim()} onClick={() => void redeem()}>
          {busy ? t('Joining…') : t('Join')}
        </button>
      </div>
      {msg && <p className={msg.ok ? 'w-ok' : 'w-err'}>{msg.text}</p>}
    </div>
  )
}

export function WorkspaceSettings({
  state,
  update,
  onOpenAvailability,
}: {
  state: WorkspaceState
  update: ToolProps['update']
  onOpenAvailability: () => void
}) {
  const { t } = useI18n()
  const [section, setSection] = useState<SettingsSection>('profile')
  /* The demo caseload's seeded bio is an English fixture; shown in the
     interface language like the rest of the demo. A bio the therapist wrote
     is not a dictionary key and passes through unchanged. */
  const [bio, setBio] = useState(t(state.account.bio))
  const [email, setEmail] = useState(state.account.email)

  function setSpec(s: string) {
    update((w) => ({
      ...w,
      account: {
        ...w.account,
        specializations: w.account.specializations.includes(s)
          ? w.account.specializations.filter((x) => x !== s)
          : [...w.account.specializations, s],
      },
    }))
  }

  return (
    <>
      <h1 className="w-h1">{t('Settings')}</h1>
      <div className="w-settings">
        <nav className="w-subnav" role="tablist">
          {SECTIONS.map((s) => (
            <button key={s.id} role="tab" aria-selected={section === s.id} onClick={() => setSection(s.id)}>
              {t(s.label)}
            </button>
          ))}
        </nav>

        <div className="w-settings__body">
          {section === 'profile' && (
            <>
              <h2 className="w-h2">{t('Profile')}</h2>
              {/* The interface language is the person's choice, made here for
                  the workspace and kept app-wide (gl.locale). */}
              <div className="w-langrow">
                <LanguagePicker className="w-input w-input--sm" />
                <span className="w-small">{t('The workspace, your reports and their PDFs use this language.')}</span>
              </div>
              <CompanyActivation />
              <div className="w-form">
                <label className="w-field">
                  <span className="w-field__label">{t('Name')} <em>· {t('read-only after verification')}</em></span>
                  <input className="w-input" value={state.account.fullName} readOnly />
                </label>
                <label className="w-field">
                  <span className="w-field__label">{t('Registration')} <em>· {t('read-only')}</em></span>
                  <input className="w-input" value={state.account.licenceNumber} readOnly />
                  <ProfessionalStatusLine />
                </label>
                <label className="w-field w-field--wide">
                  <span className="w-field__label">{t('Email')} <em>· {t('editable with re-verification')}</em></span>
                  <input className="w-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </label>
                <label className="w-field w-field--wide">
                  <span className="w-field__label">{t('Bio / professional description')} <em>· {t('shown to patients during booking')}</em></span>
                  <textarea className="w-input" rows={4} value={bio} onChange={(e) => setBio(e.target.value)} />
                </label>
              </div>

              <div className="w-field__label">{t('Specializations')} <em>· {t('from a predefined list')}</em></div>
              <div className="w-filters">
                {SPECIALIZATIONS.map((s) => (
                  <button key={s} className="w-chip" aria-pressed={state.account.specializations.includes(s)} onClick={() => setSpec(s)}>
                    {t(s)}
                  </button>
                ))}
              </div>

              <div className="w-actions">
                <button
                  className="w-btn w-btn--primary"
                  onClick={() => update((w) => ({ ...w, account: { ...w.account, bio, email } }))}
                >
                  {t('Save changes')}
                </button>
              </div>
            </>
          )}

          {section === 'availability' && (
            <>
              <h2 className="w-h2">{t('Availability')}</h2>
              <p className="w-lead">{t('Weekly recurring slots, session length and buffer, plus calendar sync.')}</p>
              <dl className="w-summary">
                <div><dt>{t('Default session length')}</dt><dd>{state.settings.sessionMinutes} min</dd></div>
                <div><dt>{t('Buffer between sessions')}</dt><dd>{state.settings.bufferMinutes} min</dd></div>
                <div>
                  <dt>{t('Available days')}</dt>
                  <dd>{state.settings.availability.filter((d) => d.enabled).length}</dd>
                </div>
              </dl>
              <button className="w-btn w-btn--primary" onClick={onOpenAvailability}>{t('Edit availability')}</button>
            </>
          )}

          {section === 'notifications' && (
            <>
              <h2 className="w-h2">{t('Notifications')}</h2>
              <ul className="w-switches">
                {NOTIFICATION_ROWS.map((n) => (
                  <li key={n.key}>
                    <span>{t(n.label)}</span>
                    <button
                      className={`switch${state.settings.notifications[n.key] ? ' is-on' : ''}`}
                      role="switch"
                      aria-checked={Boolean(state.settings.notifications[n.key])}
                      aria-label={t(n.label)}
                      onClick={() =>
                        update((w) => ({
                          ...w,
                          settings: { ...w.settings, notifications: { ...w.settings.notifications, [n.key]: !w.settings.notifications[n.key] } },
                        }))
                      }
                    >
                      <span className="switch__knob" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {section === 'consent' && <ConsentTemplateEditor />}

          {section === 'privacy' && (
            <>
              <h2 className="w-h2">{t('Privacy & security')}</h2>
              {/* No toggle that does nothing: a security control the product
                  pretends to have is a misrepresentation (D-10 drafting note).
                  Multi-factor sign-in for professionals is enabled in the
                  authentication service (DAT-10); until it is, this says so. */}
              <p className="w-lead">
                {t('Encryption in transit and at rest, access limited to your own account, and every access logged — built so you can meet your own duty of confidentiality. Good Loop holds no certification or clearance for this and claims none: the duty is yours, and these are the tools for it.')}
              </p>
              <p className="w-small">{t('Two-factor sign-in for professional accounts is enabled by the Good Loop team in the authentication service; ask support if it is not yet active on yours.')}</p>

              <div className="w-field__label">{t('Active sessions')}</div>
              <ul className="w-reflist">
                <li><span>{t('This device')} · {navigator.platform || t('Desktop')}</span><em className="w-small">{t('current')}</em></li>
              </ul>

              <div className="w-actions w-actions--left">
                <button
                  className="w-btn w-btn--ghost"
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = 'good-loop-workspace-export.json'
                    a.click()
                    setTimeout(() => URL.revokeObjectURL(url), 1000)
                  }}
                >
                  {t('Export all my data')}
                </button>
                <DeletionRequestButton />
              </div>
              <p className="w-note">{t('Closing a professional account is a request we log and confirm within two working days, so that anyone you are working with gets an orderly handover first (Professional Terms P3.5).')}</p>
            </>
          )}
        </div>
      </div>
    </>
  )
}

/** A filename-safe form of a patient name. */
function slug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/* ----------------------------------------------------- the professional --

   The registration line as the patient sees it (PRF-1), with the date a
   reviewer last verified it and when the next check falls due (M2R-02). */
function ProfessionalStatusLine() {
  const { t, d } = useI18n()
  const dp = useDataProvider()
  const [rec, setRec] = useState<ProfessionalRecord | null>(null)
  useEffect(() => { dp.getMyProfessionalRecord().then(setRec).catch(() => setRec(null)) }, [dp])
  if (!rec) return null
  const due = rec.verifiedAt ? new Date(rec.verifiedAt) : null
  if (due) due.setMonth(due.getMonth() + REVERIFY_MONTHS)
  return (
    <span className="w-small">
      {rec.verifiedAt
        ? t('Verified {date} · next check by {due}', { date: d(rec.verifiedAt, { day: 'numeric', month: 'short', year: 'numeric' }), due: due ? d(due.getTime(), { day: 'numeric', month: 'short', year: 'numeric' }) : '' })
        : t('Verification pending')}
      {rec.insuranceExpiresAt ? ` · ${t('insurance to {date}', { date: rec.insuranceExpiresAt })}` : ''}
    </span>
  )
}

/**
 * The informed-consent form the professional writes and every person accepts
 * before their first session (M2R-06, P3.2). Eight items, all mandatory: the
 * form cannot be published with any of them empty. The platform gives the
 * mechanism; the content is the professional's.
 */
const TEMPLATE_LABELS: Record<(typeof CONSENT_TEMPLATE_ITEMS)[number], string> = {
  nature: 'The nature and purpose of the sessions',
  remote: 'Working at a distance, and what that means',
  medium: 'The limits of the medium and what happens if the connection fails',
  confidentiality: 'Confidentiality and its limits',
  records: 'How records are kept, where, for how long and who may access them',
  risk: 'What happens if the person is at risk',
  fees: 'Fees and cancellation',
  alternatives: 'The alternatives to working at a distance',
}

function ConsentTemplateEditor() {
  const { t, d } = useI18n()
  const dp = useDataProvider()
  const empty = () => Object.fromEntries(CONSENT_TEMPLATE_ITEMS.map((k) => [k, ''])) as InformedConsentTemplate['items']
  const [items, setItems] = useState<InformedConsentTemplate['items']>(empty)
  const [published, setPublished] = useState<InformedConsentTemplate | null>(null)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')

  useEffect(() => {
    dp.getMyProfessionalRecord().then((r) => {
      if (r.consentTemplate) { setPublished(r.consentTemplate); setItems({ ...empty(), ...r.consentTemplate.items }) }
    }).catch(() => undefined)
  }, [dp])

  const draft: InformedConsentTemplate = { version: (published?.version ?? 0) + 1, items, updatedAt: Date.now() }
  const complete = consentTemplateComplete(draft)

  async function publish() {
    if (!complete) return
    setState('saving')
    try {
      await dp.updateMyProfessionalRecord({ consentTemplate: draft })
      setPublished(draft)
      setState('saved')
    } catch {
      setState('failed')
    }
  }

  return (
    <>
      <h2 className="w-h2">{t('Informed consent form')}</h2>
      <p className="w-lead">{t('Your form, in your words. Every person accepts it before their first session with you, and a copy of what they accepted is kept. It cannot be published until all eight items are written (P3.2).')}</p>
      {published && (
        <p className="w-small">{t('Published version {v} · {date}', { v: String(published.version), date: d(published.updatedAt, { day: 'numeric', month: 'short', year: 'numeric' }) })}</p>
      )}
      <div className="w-form">
        {CONSENT_TEMPLATE_ITEMS.map((k) => (
          <label key={k} className="w-field w-field--wide">
            <span className="w-field__label">{t(TEMPLATE_LABELS[k])}</span>
            <textarea className="w-input" rows={3} value={items[k]} onChange={(e) => setItems({ ...items, [k]: e.target.value })} />
          </label>
        ))}
      </div>
      <div className="w-actions">
        <button className="w-btn w-btn--primary" disabled={!complete || state === 'saving'} onClick={() => void publish()}>
          {state === 'saving' ? t('Publishing…') : published ? t('Publish new version') : t('Publish')}
        </button>
        {!complete && <span className="w-small">{t('All eight items are required.')}</span>}
        {state === 'saved' && <span className="w-small">{t('Published.')}</span>}
        {state === 'failed' && <span className="w-small w-err">{t('Could not publish just now.')}</span>}
      </div>
    </>
  )
}

/** Closing a professional account is a logged request, not a button that
    deletes: the people they work with come first (P3.5, cl. 15.4). */
function DeletionRequestButton() {
  const { t } = useI18n()
  const dp = useDataProvider()
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  return (
    <button
      className="w-btn w-btn--danger"
      disabled={state === 'sending' || state === 'sent'}
      onClick={() => {
        setState('sending')
        dp.createDataRequest('deletion', 'professional account').then(() => setState('sent')).catch(() => setState('failed'))
      }}
    >
      {state === 'sent' ? t('Request logged') : state === 'failed' ? t('Try again') : t('Request account closure')}
    </button>
  )
}
