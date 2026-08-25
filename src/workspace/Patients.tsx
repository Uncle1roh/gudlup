/* ============================================================================
   Therapist Workspace — Patients (TH-PAT-LIST · TH-PAT-ADD · TH-PAT-CARD
                                   TH-PAT-ASSESS · TH-PAT-RX)

   The roster is the workspace home. It answers one question on sight — who am
   I seeing, and who needs attention — so the default sort is next session
   ascending with alert rows floated to the top, and "Start video call" is one
   click from the row.

   The patient card is a single-patient hub, and NO data about any other
   patient ever appears on it. That is not a layout preference: a therapist
   comparing two patients on screen is a confidentiality problem in a shared
   office, so the card carries one person and nothing else.

   Two modals with rules of their own:
   · Send assessment — self-report, completed by the patient IN THEIR APP, at
     their own pace. Never administered during a video call.
   · Create prescription — only the 19 Self Use protocols. The patient's
     journey (version, frequency, period) is already fixed by their pathway, so
     the therapist chooses the protocol and adds clinical notes; the patient
     sees a friendly session name and never a code.
   ============================================================================ */

import { useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import { getProtocol } from '../data/protocols'
import { useCatalog, type ClinicalEntry } from '../data/liveCatalog'
import {
  CLUSTER_LABEL,
  adherenceBand,
  adherencePct,
  assessmentDueLabel,
  codeExpired,
  generateConnectionCode,
  vasDirection,
  vasSeries,
  type WorkspacePatient,
  type WorkspaceState,
} from './data'
import type { Duration } from '../types/domain'

type Filter = 'all' | 'today' | 'assessment' | 'alerts' | 'inactive'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'today', label: "Today's sessions" },
  { id: 'assessment', label: 'Assessment due' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'inactive', label: 'Inactive' },
]

const DAY = 86_400_000

/* ------------------------------------------------------- TH-PAT-LIST ---- */

interface RosterProps {
  state: WorkspaceState
  update: (fn: (s: WorkspaceState) => WorkspaceState) => void
  onOpen: (id: string) => void
  onCall: (id: string) => void
}

export function Roster({ state, update, onOpen, onCall }: RosterProps) {
  const { t } = useI18n()
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<'next' | 'name' | 'last' | 'vas'>('next')
  const [addOpen, setAddOpen] = useState(false)
  const now = Date.now()

  const rows = useMemo(() => {
    const alerts = (p: WorkspacePatient) =>
      Boolean(assessmentDueLabel(p)) ||
      p.messages.some((m) => m.from === 'patient' && !m.read) ||
      (p.lastSessionAt != null && now - p.lastSessionAt > 30 * DAY)

    let list = state.patients
    if (filter === 'today') list = list.filter((p) => p.nextSessionAt && new Date(p.nextSessionAt).toDateString() === new Date().toDateString())
    if (filter === 'assessment') list = list.filter((p) => assessmentDueLabel(p))
    if (filter === 'alerts') list = list.filter(alerts)
    if (filter === 'inactive') list = list.filter((p) => !p.lastSessionAt || now - p.lastSessionAt > 30 * DAY)

    const sorted = [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'last') return (b.lastSessionAt ?? 0) - (a.lastSessionAt ?? 0)
      if (sort === 'vas') {
        const av = vasSeries(a).slice(-1)[0] ?? -Infinity
        const bv = vasSeries(b).slice(-1)[0] ?? -Infinity
        return bv - av
      }
      return (a.nextSessionAt ?? Infinity) - (b.nextSessionAt ?? Infinity)
    })
    // Alert rows float to the top of whatever ordering is in force.
    return [...sorted.filter(alerts), ...sorted.filter((p) => !alerts(p))]
  }, [state.patients, filter, sort, now])

  if (!state.patients.length) {
    return (
      <>
        <div className="w-pagehead">
          <h1 className="w-h1">{t('Patients')}</h1>
          <button className="w-btn w-btn--primary" onClick={() => setAddOpen(true)}>+ {t('Add patient')}</button>
        </div>
        <div className="w-empty">
          <h2>{t('No patients yet')}</h2>
          <p className="w-lead">
            {t("Generate a connection code and share it with a patient to get started. They'll enter the code in their Good Loop app to link with you.")}
          </p>
          <button className="w-btn w-btn--primary" onClick={() => setAddOpen(true)}>{t('Add patient')}</button>
        </div>
        {addOpen && <AddPatientModal state={state} update={update} onClose={() => setAddOpen(false)} />}
      </>
    )
  }

  return (
    <>
      <div className="w-pagehead">
        <div className="w-pagehead__title">
          <h1 className="w-h1">{t('Patients')}</h1>
          <span className="w-count">{t('{n} patients', { n: state.patients.length })}</span>
        </div>
        <button className="w-btn w-btn--primary" onClick={() => setAddOpen(true)}>+ {t('Add patient')}</button>
      </div>

      <div className="w-filters">
        {FILTERS.map((f) => (
          <button key={f.id} className="w-chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {t(f.label)}
          </button>
        ))}
      </div>

      <table className="w-table w-table--roster">
        <thead>
          <tr>
            <th><button className="w-sort" onClick={() => setSort('name')}>{t('Patient')}</button></th>
            <th><button className="w-sort" onClick={() => setSort('next')}>{t('Next session')}</button></th>
            <th><button className="w-sort" onClick={() => setSort('last')}>{t('Last session')}</button></th>
            <th><button className="w-sort" onClick={() => setSort('vas')}>{t('VAS trend')}</button></th>
            <th>{t('Alerts')}</th>
            <th>{t('Actions')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const due = assessmentDueLabel(p)
            const unread = p.messages.filter((m) => m.from === 'patient' && !m.read).length
            const inactive = !p.lastSessionAt || now - p.lastSessionAt > 30 * DAY
            const inSession = p.nextSessionAt != null && Math.abs(now - p.nextSessionAt) < 15 * 60_000
            return (
              <tr key={p.id} className="w-row" onClick={() => onOpen(p.id)}>
                <td>
                  <span className="w-idcell">
                    <span className="w-avatar" aria-hidden="true">{initials(p.name)}</span>
                    <span>{p.name}</span>
                  </span>
                </td>
                <td>
                  {inSession ? (
                    <strong className="w-now">{t('In session now')}</strong>
                  ) : p.nextSessionAt ? (
                    fmtWhen(p.nextSessionAt)
                  ) : (
                    <span className="w-muted">{t('Not scheduled')}</span>
                  )}
                </td>
                <td className="w-muted">{p.lastSessionAt ? fmtDate(p.lastSessionAt) : t('Never')}</td>
                <td><VasCell patient={p} /></td>
                <td className="w-alertcell">
                  {due && <span title={t('Assessment due')}>🔔</span>}
                  {inactive && <span title={t('Inactive')}>▲</span>}
                  {unread > 0 && <span title={t('Unread message')}>💬</span>}
                  {!due && !inactive && !unread && <span className="w-muted">—</span>}
                </td>
                <td>
                  <button
                    className="w-btn w-btn--sm"
                    onClick={(e) => { e.stopPropagation(); onCall(p.id) }}
                    aria-label={t('Start video call with {name}', { name: p.name })}
                  >
                    📹
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="w-small">{t('Showing {n} of {total}', { n: rows.length, total: state.patients.length })}</p>

      {addOpen && <AddPatientModal state={state} update={update} onClose={() => setAddOpen(false)} />}
    </>
  )
}

function VasCell({ patient }: { patient: WorkspacePatient }) {
  const s = vasSeries(patient, 5)
  const dir = vasDirection(patient)
  if (!s.length) return <span className="w-muted">—</span>
  const max = Math.max(...s, 1)
  const pts = s.map((v, i) => `${(i / Math.max(1, s.length - 1)) * 46},${18 - (v / max) * 16}`).join(' ')
  return (
    <span className="w-vas">
      <svg viewBox="0 0 46 20" aria-hidden="true"><polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
      <span>{dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→'}</span>
    </span>
  )
}

/* -------------------------------------------------------- TH-PAT-ADD ---- */

export function AddPatientModal({
  state,
  update,
  onClose,
}: {
  state: WorkspaceState
  update: RosterProps['update']
  onClose: () => void
}) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

  /* One active code per therapist: opening this modal without a live code
     issues a new one, and issuing invalidates any previous unused code. */
  const code = useMemo(() => {
    if (state.connectionCode && !codeExpired(state.connectionCode)) return state.connectionCode
    const fresh = { code: generateConnectionCode(), issuedAt: Date.now() }
    update((s) => ({ ...s, connectionCode: fresh }))
    return fresh
  }, [state.connectionCode, update])

  const hoursLeft = Math.max(0, Math.round((code.issuedAt + 72 * 3_600_000 - Date.now()) / 3_600_000))

  return (
    <div className="w-scrim" onClick={onClose} role="dialog" aria-modal="true">
      <div className="w-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="w-h2">{t('Add patient')}</h2>
        <p className="w-lead">
          {t('A single-use connection code will be generated. Share it with the patient, who will enter it in their Good Loop app within 72 hours.')}
        </p>

        <div className="w-code">
          <span className="w-code__value">{code.code}</span>
          <button
            className="w-btn w-btn--ghost"
            onClick={() =>
              navigator.clipboard?.writeText(code.code).then(
                () => { setCopied(true); window.setTimeout(() => setCopied(false), 1800) },
                () => { /* clipboard blocked — the code is on screen */ },
              )
            }
          >
            {copied ? t('Copied') : t('Copy code')}
          </button>
        </div>
        <p className="w-small">{t('This code expires in {n} hours.', { n: hoursLeft })}</p>

        <div className="w-steps">
          <div className="w-field__label">{t('How it works')}</div>
          <ol>
            <li>{t('Share this code with your patient (verbally or via secure message)')}</li>
            <li>{t('Patient opens the app → Therapist tab → enters the code')}</li>
            <li>{t('Patient accepts data-sharing consent')}</li>
            <li>{t('Patient appears in your Patient list')}</li>
          </ol>
        </div>

        <p className="w-note">
          {t('A patient already linked to another professional cannot connect with a second one.')}
        </p>

        <div className="w-actions">
          <button className="w-btn w-btn--primary" onClick={onClose}>{t('Done')}</button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------- TH-PAT-CARD ---- */

interface CardProps {
  patient: WorkspacePatient
  update: RosterProps['update']
  onCall: () => void
  onMessage: () => void
  onOpenReport: (sessionId: string) => void
}

const SECTIONS = ['history', 'assessments', 'selfuse', 'prescriptions', 'notes', 'goals'] as const
type Section = (typeof SECTIONS)[number]

export function PatientCard({ patient, update, onCall, onMessage, onOpenReport }: CardProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState<Record<Section, boolean>>({
    history: true, assessments: true, selfuse: false, prescriptions: true, notes: true, goals: false,
  })
  const [assessOpen, setAssessOpen] = useState(false)
  const [rxOpen, setRxOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [noteSearch, setNoteSearch] = useState('')
  const [showAllNotes, setShowAllNotes] = useState(false)
  const [newGoal, setNewGoal] = useState('')

  const toggle = (s: Section) => setOpen((o) => ({ ...o, [s]: !o[s] }))
  const due = assessmentDueLabel(patient)
  const unread = patient.messages.filter((m) => m.from === 'patient' && !m.read).length
  const rxAvg = patient.prescriptions.length
    ? Math.round(patient.prescriptions.reduce((n, r) => n + adherencePct(r), 0) / patient.prescriptions.length)
    : null

  const notes = patient.notes
    .filter((n) => !noteSearch || n.text.toLowerCase().includes(noteSearch.toLowerCase()) || n.tag.toLowerCase().includes(noteSearch.toLowerCase()))
    .sort((a, b) => b.at - a.at)

  function patchPatient(fn: (p: WorkspacePatient) => WorkspacePatient) {
    update((s) => ({ ...s, patients: s.patients.map((p) => (p.id === patient.id ? fn(p) : p)) }))
  }

  return (
    <div className="w-card2col">
      <div className="w-col-main">
        <header className="w-pathead">
          <span className="w-avatar w-avatar--lg" aria-hidden="true">{initials(patient.name)}</span>
          <div>
            <h1 className="w-h1">{patient.name}</h1>
            <div className="w-pathead__meta">
              <span className={`w-status w-status--${patient.status}`}>
                {patient.status === 'active' ? t('Active') : patient.status === 'new' ? t('New') : t('Inactive 30+ days')}
              </span>
              <span>{t('Member since')} {new Date(patient.memberSince).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
              {patient.company && <span>{t('Company')} · {patient.company}</span>}
              <span>{t('Linked')} {new Date(patient.linkedAt).toLocaleDateString()}</span>
            </div>
          </div>
        </header>

        <Section title={t('Session History')} count={patient.sessions.length} open={open.history} onToggle={() => toggle('history')}>
          {!patient.sessions.length ? (
            <p className="w-small">{t('No sessions yet. Start your first video call.')}</p>
          ) : (
            <table className="w-table">
              <thead>
                <tr><th>{t('Date')}</th><th>{t('Type')}</th><th>{t('Protocol')}</th><th>{t('Dur.')}</th><th>{t('Notes')}</th><th>{t('Report')}</th></tr>
              </thead>
              <tbody>
                {[...patient.sessions].sort((a, b) => b.at - a.at).map((s) => (
                  <tr key={s.id}>
                    <td>{fmtDate(s.at)}</td>
                    <td>{s.kind === 'gl-video' ? t('GL + Video') : t('Video only')}</td>
                    <td className="w-mono w-small">{s.protocolCode ? `${s.protocolCode} ${versionShort(s.version)}` : '—'}</td>
                    <td>{s.minutes} min</td>
                    <td className="w-small w-truncate">{s.note}</td>
                    <td><button className="w-link" onClick={() => onOpenReport(s.id)}>{t('View')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section
          title={t('Assessments')}
          badge={due ?? undefined}
          open={open.assessments}
          onToggle={() => toggle('assessments')}
        >
          {!patient.assessments.length ? (
            <p className="w-small">{t('No assessments sent yet.')}</p>
          ) : (
            <AssessmentBlock patient={patient} />
          )}
          <button className="w-btn w-btn--ghost" onClick={() => setAssessOpen(true)}>{t('Send assessment')}</button>
          <p className="w-note">
            {t('Assessments are self-report, completed in the app — never administered during a call.')}
          </p>
        </Section>

        <Section
          title={t('Self Use Activity')}
          badge={patient.bridged ? t('Bridged') : t('Not bridged')}
          open={open.selfuse}
          onToggle={() => toggle('selfuse')}
        >
          {!patient.bridged ? (
            <p className="w-small">{t('The patient has not consented to share Self Use data.')}</p>
          ) : !patient.bridgedSessions.length ? (
            <p className="w-small">{t('No Self Use sessions recorded between appointments.')}</p>
          ) : (
            <table className="w-table">
              <thead><tr><th>{t('Date')}</th><th>{t('Protocol')}</th><th>{t('Duration')}</th><th>{t('Completed')}</th></tr></thead>
              <tbody>
                {patient.bridgedSessions.map((b, i) => (
                  <tr key={i}>
                    <td>{fmtDate(b.at)}</td>
                    <td className="w-mono w-small">{b.protocolCode}</td>
                    <td>{b.minutes} min</td>
                    <td>{b.completed ? '✓' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="w-note">{t('Read-only. Consent is managed by the patient and can be revoked at any time.')}</p>
        </Section>

        <Section
          title={t('Active Prescriptions')}
          count={patient.prescriptions.length}
          open={open.prescriptions}
          onToggle={() => toggle('prescriptions')}
        >
          {!patient.prescriptions.length ? (
            <p className="w-small">{t('No active prescriptions.')}</p>
          ) : (
            <table className="w-table">
              <thead>
                <tr><th>{t('Prescription')}</th><th>{t('Frequency')}</th><th>{t('Assigned')}</th><th>{t('Adherence')}</th><th>{t('Status')}</th></tr>
              </thead>
              <tbody>
                {patient.prescriptions.map((rx) => {
                  const a = adherencePct(rx)
                  return (
                    <tr key={rx.id}>
                      <td className="w-mono w-small">{rx.protocolCode} {versionShort(rx.version)}</td>
                      <td>{t('{n}× this week', { n: rx.perWeek })}</td>
                      <td className="w-small">{fmtDate(rx.fromAt)}</td>
                      <td>
                        <span className={`w-adh w-adh--${adherenceBand(a)}`}>
                          <span style={{ width: `${a}%` }} />
                        </span>
                        <span className="w-small"> {a}%</span>
                      </td>
                      <td className="w-small">{a >= 100 ? t('Completed') : t('In progress')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          <button className="w-btn w-btn--ghost" onClick={() => setRxOpen(true)}>{t('New prescription')}</button>
        </Section>

        <Section
          title={t('Clinical Notes')}
          badge={t('Therapist only · E2E encrypted')}
          count={patient.notes.length}
          open={open.notes}
          onToggle={() => toggle('notes')}
        >
          <div className="w-noteshead">
            <input className="w-input w-input--sm" value={noteSearch} onChange={(e) => setNoteSearch(e.target.value)} placeholder={t('Search notes…')} />
          </div>
          <div className="w-notecompose">
            <textarea
              className="w-input"
              rows={3}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder={t('New note…')}
            />
            <button
              className="w-btn w-btn--primary"
              disabled={!noteDraft.trim()}
              onClick={() => {
                patchPatient((p) => ({
                  ...p,
                  notes: [...p.notes, { id: `n-${Date.now()}`, at: Date.now(), tag: 'General', text: noteDraft.trim() }],
                }))
                setNoteDraft('')
              }}
            >
              {t('Save note')}
            </button>
          </div>
          <ul className="w-notes">
            {(showAllNotes ? notes : notes.slice(0, 3)).map((n) => (
              <li key={n.id}>
                <div className="w-notes__meta">
                  <span>{new Date(n.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  <span className="w-tag">{n.tag}</span>
                  {n.time && <span className="w-small">{n.time}</span>}
                </div>
                <p>{n.text}</p>
              </li>
            ))}
          </ul>
          {notes.length > 3 && (
            <button className="w-link" onClick={() => setShowAllNotes((v) => !v)}>
              {showAllNotes ? t('Show fewer') : t('Show all {n} notes', { n: notes.length })}
            </button>
          )}
        </Section>

        <Section title={t('Goals')} count={patient.goals.length} open={open.goals} onToggle={() => toggle('goals')}>
          {!patient.goals.length && <p className="w-small">{t('No therapy goals set.')}</p>}
          <ul className="w-goals">
            {patient.goals.map((g) => (
              <li key={g.id}>
                <span>{g.text}</span>
                <select
                  className="w-input w-input--sm"
                  value={g.status}
                  onChange={(e) =>
                    patchPatient((p) => ({
                      ...p,
                      goals: p.goals.map((x) => (x.id === g.id ? { ...x, status: e.target.value as typeof g.status } : x)),
                    }))
                  }
                >
                  <option value="in-progress">{t('In progress')}</option>
                  <option value="achieved">{t('Achieved')}</option>
                  <option value="revisit">{t('To revisit')}</option>
                </select>
              </li>
            ))}
          </ul>
          <div className="w-inline">
            <input className="w-input" value={newGoal} onChange={(e) => setNewGoal(e.target.value)} placeholder={t('Add goal…')} />
            <button
              className="w-btn w-btn--ghost"
              disabled={!newGoal.trim()}
              onClick={() => {
                patchPatient((p) => ({
                  ...p,
                  goals: [...p.goals, { id: `g-${Date.now()}`, text: newGoal.trim(), status: 'in-progress', createdAt: Date.now() }],
                }))
                setNewGoal('')
              }}
            >
              {t('Add goal')}
            </button>
          </div>
        </Section>
      </div>

      <aside className="w-col-side">
        <div className="w-sticky">
          <button className="w-btn w-btn--primary w-btn--block w-btn--lg" onClick={onCall}>📹 {t('Start Video Call')}</button>
          <button className="w-btn w-btn--ghost w-btn--block" onClick={onMessage}>{t('Send message')}</button>
          <button className="w-btn w-btn--ghost w-btn--block" onClick={() => setRxOpen(true)}>{t('New prescription')}</button>

          <div className="w-sidecard">
            <div className="w-field__label">{t('Next session')}</div>
            <strong>{patient.nextSessionAt ? fmtWhen(patient.nextSessionAt) : t('Not scheduled')}</strong>
          </div>
          <div className="w-sidecard">
            <div className="w-field__label">{t('VAS summary')}</div>
            <VasSummary patient={patient} />
          </div>
          <div className="w-sidecard">
            <div className="w-field__label">{t('Prescription adherence')}</div>
            <strong>{rxAvg == null ? '—' : `${rxAvg}%`}</strong>
          </div>
          <div className="w-sidecard">
            <div className="w-field__label">{t('Unread messages')}</div>
            <strong>{unread}</strong>
            {unread > 0 && <button className="w-link" onClick={onMessage}>{t('View')}</button>}
          </div>
        </div>
      </aside>

      {assessOpen && (
        <AssessmentModal
          patient={patient}
          onClose={() => setAssessOpen(false)}
          onSend={(instrument) => {
            patchPatient((p) => ({ ...p, assessmentDue: instrument }))
            setAssessOpen(false)
          }}
        />
      )}
      {rxOpen && (
        <PrescriptionModal
          patient={patient}
          onClose={() => setRxOpen(false)}
          onAssign={(rx) => {
            patchPatient((p) => ({ ...p, prescriptions: [...p.prescriptions, rx] }))
            setRxOpen(false)
          }}
        />
      )}
    </div>
  )
}

function VasSummary({ patient }: { patient: WorkspacePatient }) {
  const { t } = useI18n()
  const withVas = patient.sessions.filter((s) => s.vasPre != null && s.vasPost != null)
  if (!withVas.length) return <span className="w-muted">{t('Not recorded')}</span>
  const pre = withVas.reduce((n, s) => n + (s.vasPre as number), 0) / withVas.length
  const post = withVas.reduce((n, s) => n + (s.vasPost as number), 0) / withVas.length
  return (
    <strong>
      {pre.toFixed(1)} → {post.toFixed(1)}
    </strong>
  )
}

function AssessmentBlock({ patient }: { patient: WorkspacePatient }) {
  const { t } = useI18n()
  const byInstrument = new Map<string, typeof patient.assessments>()
  for (const a of patient.assessments) byInstrument.set(a.instrument, [...(byInstrument.get(a.instrument) ?? []), a])

  return (
    <div className="w-assess">
      {[...byInstrument.entries()].map(([instrument, points]) => {
        const sorted = [...points].sort((a, b) => a.at - b.at)
        const last = sorted[sorted.length - 1]
        const prev = sorted[sorted.length - 2]
        return (
          <div key={instrument} className="w-assess__row">
            <div className="w-assess__name">{instrument}</div>
            <div className="w-assess__vals">
              {last.values.map((v) => {
                const before = prev?.values.find((x) => x.label === v.label)?.value
                const pctChange = before != null && before !== 0 ? Math.round(((v.value - before) / before) * 100) : null
                const better = pctChange != null && pctChange < 0
                return (
                  <span key={v.label} className={`w-assess__val${pctChange == null ? '' : better ? ' is-down' : ' is-up'}`}>
                    <em>{v.label}</em>
                    <strong>{v.value}</strong>
                    {pctChange != null && <span className="w-small">{pctChange > 0 ? '+' : '−'}{Math.abs(pctChange)}%</span>}
                  </span>
                )
              })}
            </div>
            <div className="w-small w-assess__time">
              {sorted.map((p, i) => (
                <span key={p.at}>{i > 0 && ' → '}{fmtDate(p.at)}</span>
              ))}
            </div>
          </div>
        )
      })}
      <p className="w-note">{t('Numbers and trends only — never a diagnostic label.')}</p>
    </div>
  )
}

/* ----------------------------------------------------- TH-PAT-ASSESS ---- */

const INSTRUMENTS = ['DASS-21', 'PSS-10', 'BRS', 'CBI'] as const

function AssessmentModal({
  patient,
  onClose,
  onSend,
}: {
  patient: WorkspacePatient
  onClose: () => void
  onSend: (instrument: string) => void
}) {
  const { t } = useI18n()
  const recommended = assessmentDueLabel(patient) ? 'DASS-21' : null
  const [instrument, setInstrument] = useState<string>(recommended ?? 'DASS-21')

  return (
    <div className="w-scrim" onClick={onClose} role="dialog" aria-modal="true">
      <div className="w-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="w-h2">{t('Send assessment to {name}', { name: patient.name })}</h2>

        <label className="w-field">
          <span className="w-field__label">{t('Instrument')}</span>
          <select className="w-input" value={instrument} onChange={(e) => setInstrument(e.target.value)}>
            {INSTRUMENTS.map((i) => (
              <option key={i} value={i}>{i}{i === recommended ? ` — ${t('Recommended')}` : ''}</option>
            ))}
          </select>
        </label>

        <p className="w-lead">
          {t('The patient will receive a notification and can complete the questionnaire in their app at their own pace (typically 5–7 minutes).')}
        </p>

        <div className="w-actions">
          <button className="w-link" onClick={onClose}>{t('Remind me in 1 week')}</button>
          <button className="w-btn w-btn--ghost" onClick={onClose}>{t('Cancel')}</button>
          <button className="w-btn w-btn--primary" onClick={() => onSend(instrument)}>{t('Send')}</button>
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------- TH-PAT-RX ---- */

function PrescriptionModal({
  patient,
  onClose,
  onAssign,
}: {
  patient: WorkspacePatient
  onClose: () => void
  onAssign: (rx: WorkspacePatient['prescriptions'][number]) => void
}) {
  const { t } = useI18n()
  const catalog = useCatalog()
  /* The live catalog decides what may be prescribed: an ENABLED protocol that
     maps to a Self Use session a person can actually open on their own. A
     protocol a PO disabled this morning is not in this list, and neither are
     the six clinical-only ones. */
  const options = catalog.prescribable
  const [code, setCode] = useState('')
  const selected = options.find((o) => o.code === code) ?? options[0]
  const [version, setVersion] = useState<Duration | null>(null)
  const [perWeek, setPerWeek] = useState(3)
  const [weeks, setWeeks] = useState(1)
  const [note, setNote] = useState('')

  /* Only the time signatures this protocol actually publishes are offered —
     prescribing a 24-minute version that was never rendered would send the
     person to a placeholder bed. */
  const versions = selected?.durations ?? []
  const chosenVersion: Duration = version && versions.includes(version) ? version : (versions[1] ?? versions[0] ?? 12)

  const grouped = useMemo(() => {
    const m = new Map<string, ClinicalEntry[]>()
    for (const p of options) m.set(p.family, [...(m.get(p.family) ?? []), p])
    return [...m.entries()]
  }, [options])

  if (!options.length) {
    return (
      <div className="w-scrim" onClick={onClose} role="dialog" aria-modal="true">
        <div className="w-modal" onClick={(e) => e.stopPropagation()}>
          <h2 className="w-h2">{t('Nothing to prescribe yet')}</h2>
          <p className="w-lead">
            {t('No Self Use protocol is published and enabled right now, so there is no homework to assign.')}
          </p>
          <div className="w-actions"><button className="w-btn w-btn--primary" onClick={onClose}>{t('Close')}</button></div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-scrim" onClick={onClose} role="dialog" aria-modal="true">
      <div className="w-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="w-h2">{t('New prescription for {name}', { name: patient.name })}</h2>

        <label className="w-field">
          <span className="w-field__label">
            {t('Protocol')} <em>· {t('19 Self Use protocols, grouped by cluster')}</em>
          </span>
          <select className="w-input" value={selected?.code ?? ''} onChange={(e) => { setCode(e.target.value); setVersion(null) }}>
            {grouped.map(([family, list]) => (
              <optgroup key={family} label={t(CLUSTER_LABEL[family] ?? family)}>
                {list.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.code} · {p.title}{p.audioReady ? '' : ` — ${t('audio not rendered yet')}`}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <div className="w-form">
          <label className="w-field">
            <span className="w-field__label">{t('Version')}</span>
            <select className="w-input" value={chosenVersion} onChange={(e) => setVersion(Number(e.target.value) as Duration)}>
              {versions.map((d) => (
                <option key={d} value={d}>
                  {t(d === 6 ? 'Quick' : d === 12 ? 'Standard' : 'Deep')} ({d} min)
                </option>
              ))}
            </select>
          </label>
          <label className="w-field">
            <span className="w-field__label">{t('Frequency')}</span>
            <select className="w-input" value={perWeek} onChange={(e) => setPerWeek(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{t('{n}× per week', { n })}</option>)}
            </select>
          </label>
          <label className="w-field">
            <span className="w-field__label">{t('Duration')}</span>
            <select className="w-input" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
              <option value={1}>{t('This week')}</option>
              <option value={2}>{t('2 weeks')}</option>
              <option value={4}>{t('4 weeks')}</option>
              <option value={0}>{t('Until next session')}</option>
            </select>
          </label>
        </div>

        <label className="w-field">
          <span className="w-field__label">{t('Clinical notes')} <em>· {t('therapist only')}</em></span>
          <textarea className="w-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        <p className="w-note">
          {t('Patient will see:')} “{t('Recommended by your therapist: {name}', { name: selected?.patientName ?? '' })}”
        </p>
        {selected && !selected.audioReady && (
          <p className="w-warnbox">
            {t('This protocol has no rendered audio yet. The patient will hear the placeholder bed until a mixdown is published.')}
          </p>
        )}

        <div className="w-actions">
          <button className="w-btn w-btn--ghost" onClick={onClose}>{t('Cancel')}</button>
          <button
            className="w-btn w-btn--primary"
            onClick={() =>
              onAssign({
                id: `rx-${Date.now()}`,
                patientId: patient.id,
                protocolCode: selected?.code ?? '',
                version: chosenVersion,
                perWeek,
                fromAt: Date.now(),
                toAt: Date.now() + (weeks || 1) * 7 * DAY,
                done: 0,
                clinicalNote: note.trim() || undefined,
              })
            }
          >
            {t('Assign')}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ helpers --- */

function Section({
  title,
  count,
  badge,
  open,
  onToggle,
  children,
}: {
  title: string
  count?: number
  badge?: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <section className="w-section">
      <button className="w-section__head" onClick={onToggle} aria-expanded={open}>
        <span className="w-section__title">{title}</span>
        {count != null && <span className="w-count">{count}</span>}
        {badge && <span className="w-tag">{badge}</span>}
        <span className="w-section__chev" aria-hidden="true">{open ? '⌄' : '›'}</span>
      </button>
      {open && <div className="w-section__body">{children}</div>}
    </section>
  )
}

export function initials(name: string): string {
  return name
    .replace(/^Dra?\.?\s+/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

export function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function fmtWhen(ms: number): string {
  const d = new Date(ms)
  const today = new Date()
  const isToday = d.toDateString() === today.toDateString()
  const isTomorrow = new Date(today.getTime() + DAY).toDateString() === d.toDateString()
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  if (isToday) return `Today · ${time}`
  if (isTomorrow) return `Tomorrow · ${time}`
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${time}`
}

export function versionShort(d?: Duration): string {
  return d === 6 ? 'Quick' : d === 12 ? 'Std' : d === 24 ? 'Deep' : ''
}

export { getProtocol }
