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

import { useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import { fmtDate, initials, versionShort } from './Patients'
import { buildBatchReportPdf, buildSessionReportPdf } from './sessionPdf'
import {
  useMessages,
  threadFor,
  unreadFor,
  markRead,
  send as postMessage,
  type ChatMessage,
} from '../data/messageStore'
import {
  NOTIFICATION_ROWS,
  threadIdFor as threadId,
  adherenceBand,
  adherencePct,
  performance,
  slaBand,
  type MessageTemplate,
  type WorkspaceState,
} from './data'

interface ToolProps {
  state: WorkspaceState
  update: (fn: (s: WorkspaceState) => WorkspaceState) => void
  onOpenPatient: (id: string) => void
}

const HOUR = 3_600_000

/**
 * The fixture messages a demo patient was seeded with, in the shared thread's
 * shape, so one list renders both. They are read-only history: everything
 * written from here on goes to the store.
 */
function fixtureRows(p: { id: string; bridged: boolean; messages: { id: string; from: 'patient' | 'therapist'; text: string; at: number; read: boolean }[] }): ChatMessage[] {
  return p.messages.map((m) => ({
    id: `fx-${m.id}`,
    patientId: threadId(p),
    from: m.from,
    text: m.text,
    at: m.at,
    readByPatient: true,
    readByTherapist: m.read,
  }))
}

/* --------------------------------------------------------------- TH-MSG -- */

export function Messages({ state, update, onOpenPatient, initialPatientId }: ToolProps & { initialPatientId?: string }) {
  const { t, d } = useI18n()
  const { rows, update: updateMessages } = useMessages()

  /* A conversation counts as existing if EITHER side has written — the store
     or the seeded fixtures. Filtering on the fixtures alone hid every patient
     who had only ever written from their own app. */
  const withMessages = state.patients.filter((p) => p.messages.length || threadFor(rows, threadId(p)).length)
  const [selected, setSelected] = useState<string | null>(initialPatientId ?? withMessages[0]?.id ?? null)
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState('')
  const [templatesOpen, setTemplatesOpen] = useState(false)

  /** One patient's whole conversation: seeded history plus the live thread. */
  function conversation(p: (typeof state.patients)[number]): ChatMessage[] {
    return [...fixtureRows(p), ...threadFor(rows, threadId(p))].sort((a, b) => a.at - b.at)
  }

  function lastAt(p: (typeof state.patients)[number]): number {
    const conv = conversation(p)
    return conv[conv.length - 1]?.at ?? 0
  }

  const list = withMessages
    .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => lastAt(b) - lastAt(a))

  const patient = state.patients.find((p) => p.id === selected)
  const thread = patient ? conversation(patient) : []

  function send() {
    const text = draft.trim()
    if (!text || !patient) return
    /* Both ends read this store. Writing into the workspace's own state was
       what made the therapist's replies invisible to the patient. */
    updateMessages((rs) => markRead(postMessage(rs, threadId(patient), 'therapist', text), threadId(patient), 'therapist'))
    update((s) => ({
      ...s,
      patients: s.patients.map((p) => (p.id === patient.id ? { ...p, messages: p.messages.map((m) => ({ ...m, read: true })) } : p)),
    }))
    setDraft('')
  }

  function openThread(id: string) {
    setSelected(id)
    const p = state.patients.find((x) => x.id === id)
    if (p) updateMessages((rs) => markRead(rs, threadId(p), 'therapist'))
    update((s) => ({
      ...s,
      patients: s.patients.map((x) => (x.id === id ? { ...x, messages: x.messages.map((m) => ({ ...m, read: true })) } : x)),
    }))
  }

  if (!withMessages.length) {
    return (
      <>
        <h1 className="w-h1">{t('Messages')}</h1>
        <div className="w-empty"><p>{t('No conversations yet.')}</p></div>
      </>
    )
  }

  return (
    <>
      <h1 className="w-h1">{t('Messages')}</h1>
      <div className="w-msglayout">
        <div className="w-msglist">
          <input className="w-input w-input--sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Search messages…')} />
          <ul>
            {list.map((p) => {
              const conv = conversation(p)
              const last = conv[conv.length - 1]
              const unread =
                p.messages.some((m) => m.from === 'patient' && !m.read) ||
                unreadFor(rows, threadId(p), 'therapist') > 0
              const sla = slaBand(p)
              return (
                <li key={p.id}>
                  <button
                    className={`w-msgrow${selected === p.id ? ' is-on' : ''}${unread ? ' is-unread' : ''}`}
                    onClick={() => openThread(p.id)}
                  >
                    <span className="w-avatar" aria-hidden="true">{initials(p.name)}</span>
                    <span className="w-msgrow__body">
                      <strong>{p.name}</strong>
                      <em className="w-small">{last?.text ?? ''}</em>
                    </span>
                    <span className="w-msgrow__meta">
                      <span className="w-small">{last ? rel(last.at, t) : ''}</span>
                      {sla !== 'none' && <span className={`w-sla w-sla--${sla}`} title={t('Awaiting your reply')} />}
                      {unread && <span className="w-unreaddot" aria-hidden="true" />}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {patient && (
          <div className="w-thread">
            <header className="w-thread__head">
              <strong>{patient.name}</strong>
              <button className="w-link" onClick={() => onOpenPatient(patient.id)}>{t('View patient card')}</button>
            </header>
            <div className="w-thread__body">
              {!thread.length && <p className="w-small">{t('No messages yet.')}</p>}
              {thread.map((m) => (
                <div key={m.id} className={`w-bubble w-bubble--${m.from}`}>
                  <p>{m.text}</p>
                  <span className="w-small">
                    {d(m.at, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
            <div className="w-thread__compose">
              <button className="w-btn w-btn--ghost" onClick={() => setTemplatesOpen((v) => !v)}>{t('Templates')}</button>
              <input className="w-input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t('Write a message…')} onKeyDown={(e) => e.key === 'Enter' && send()} maxLength={2000} />
              <button className="w-btn w-btn--primary" disabled={!draft.trim()} onClick={send}>{t('Send')}</button>
            </div>
            {templatesOpen && (
              <ul className="w-templates">
                {state.settings.templates.map((tpl) => (
                  <li key={tpl.id}>
                    <button onClick={() => { setDraft(tpl.text); setTemplatesOpen(false) }}>{tpl.text}</button>
                  </li>
                ))}
              </ul>
            )}
            {/* The encryption claim that used to sit here was not true of this
                build, and a privacy promise the product does not keep is worse
                than no promise. What IS true is who can see the SLA. */}
            <p className="w-note">
              {t('The 48-hour SLA indicator is visible to you only — never to the patient or an administrator.')}
            </p>
          </div>
        )}
      </div>
    </>
  )
}

/* "5m ago" was hard-coded English on an Italian-default interface. */
function rel(at: number, t: (k: string, v?: Record<string, string | number>) => string): string {
  const diff = Date.now() - at
  if (diff < HOUR) return t('{n}m ago', { n: Math.max(1, Math.round(diff / 60_000)) })
  if (diff < 24 * HOUR) return t('{n}h ago', { n: Math.round(diff / HOUR) })
  return t('{n}d ago', { n: Math.round(diff / (24 * HOUR)) })
}

/* ---------------------------------------------------------------- TH-RX -- */

type RxFilter = 'all' | 'active' | 'completed' | 'low'

export function Prescriptions({ state, update, onOpenPatient }: ToolProps) {
  const { t } = useI18n()
  const [filter, setFilter] = useState<RxFilter>('active')

  const rows = useMemo(() => {
    const all = state.patients.flatMap((p) => p.prescriptions.map((rx) => ({ rx, patient: p })))
    const filtered = all.filter(({ rx }) => {
      const a = adherencePct(rx)
      if (filter === 'completed') return a >= 100
      if (filter === 'low') return a < 70
      if (filter === 'active') return rx.toAt >= Date.now() || a < 100
      return true
    })
    // Lowest adherence first — the list answers "who needs attention".
    return filtered.sort((x, y) => adherencePct(x.rx) - adherencePct(y.rx))
  }, [state.patients, filter])

  function nudge(patientId: string, rxId: string) {
    update((s) => ({
      ...s,
      patients: s.patients.map((p) =>
        p.id === patientId ? { ...p, prescriptions: p.prescriptions.map((r) => (r.id === rxId ? { ...r, nudgedAt: Date.now() } : r)) } : p,
      ),
    }))
  }

  return (
    <>
      <h1 className="w-h1">{t('Prescriptions')}</h1>
      <div className="w-filters">
        {(['all', 'active', 'completed', 'low'] as RxFilter[]).map((f) => (
          <button key={f} className="w-chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {t(f === 'all' ? 'All' : f === 'active' ? 'Active' : f === 'completed' ? 'Completed' : 'Low adherence')}
          </button>
        ))}
      </div>

      {!rows.length ? (
        <div className="w-empty"><p>{t('No active prescriptions.')}</p></div>
      ) : (
        <table className="w-table">
          <thead>
            <tr>
              <th>{t('Patient')}</th><th>{t('Prescription')}</th><th>{t('Freq.')}</th><th>{t('Period')}</th><th>{t('Adherence')}</th><th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ rx, patient }) => {
              const a = adherencePct(rx)
              const nudgeBlocked = rx.nudgedAt != null && Date.now() - rx.nudgedAt < 48 * HOUR
              return (
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
                  <td>
                    <span className={`w-adh w-adh--${adherenceBand(a)}`}><span style={{ width: `${a}%` }} /></span>
                    <span className="w-small"> {a}%</span>
                  </td>
                  <td>
                    {a < 70 && (
                      <button
                        className="w-btn w-btn--sm"
                        disabled={nudgeBlocked}
                        onClick={(e) => { e.stopPropagation(); nudge(patient.id, rx.id) }}
                      >
                        {nudgeBlocked ? `${t('Sent')} ✓` : t('Nudge')}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <p className="w-note">
        {t('A nudge sends a gentle push notification and is disabled for 48 hours afterwards.')}
      </p>
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
              <th>{t('Date')}</th><th>{t('Patient')}</th><th>{t('Type')}</th><th>{t('Protocol')}</th><th>{t('Status')}</th><th>{t('Actions')}</th>
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

/* -------------------------------------------------------------- TH-PERF -- */

export function Performance({ state }: { state: WorkspaceState }) {
  const { t } = useI18n()
  const [period, setPeriod] = useState<'week' | 'month' | 'quarter'>('month')
  const cards = performance(state, period)

  return (
    <>
      <div className="w-pagehead">
        <h1 className="w-h1">{t('Performance')}</h1>
        <div className="w-segmented">
          {(['week', 'month', 'quarter'] as const).map((p) => (
            <button key={p} aria-pressed={period === p} onClick={() => setPeriod(p)}>
              {t(p === 'week' ? 'This week' : p === 'month' ? 'This month' : 'This quarter')}
            </button>
          ))}
        </div>
      </div>

      <p className="w-note">{t('Private to you · a corporate client sees only aggregate counts, never per-therapist figures.')}</p>

      <div className="w-perfgrid">
        {cards.map((c) => (
          <article key={c.label} className="w-perfcard">
            <div className="w-field__label">{t(c.label)}</div>
            <div className="w-perfcard__value">
              {c.value}{c.unit && <em> {c.unit}</em>}
            </div>
            <div className="w-small">{t(c.sub)}</div>
            <Spark values={c.series} />
            <div className="w-perfcard__trend">{c.trend}</div>
          </article>
        ))}
      </div>
    </>
  )
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const max = Math.max(...values, 1)
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${20 - (v / max) * 18}`).join(' ')
  return (
    <svg className="w-spark" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

/* ---------------------------------------------------------- TH-SETTINGS -- */

type SettingsSection = 'profile' | 'availability' | 'notifications' | 'templates' | 'privacy'

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'availability', label: 'Availability' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'templates', label: 'Message templates' },
  { id: 'privacy', label: 'Privacy & security' },
]

const SPECIALIZATIONS = ['Anxiety', 'Depression', 'Stress', 'Burnout', 'Resilience', 'Sleep', 'Work-life balance', 'Trauma']

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
  const [bio, setBio] = useState(state.account.bio)
  const [email, setEmail] = useState(state.account.email)
  const [newTemplate, setNewTemplate] = useState('')

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
              <div className="w-form">
                <label className="w-field">
                  <span className="w-field__label">{t('Name')} <em>· {t('read-only after verification')}</em></span>
                  <input className="w-input" value={state.account.fullName} readOnly />
                </label>
                <label className="w-field">
                  <span className="w-field__label">{t('License number')} <em>· {t('read-only')}</em></span>
                  <input className="w-input" value={state.account.licenceNumber} readOnly />
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

          {section === 'templates' && (
            <>
              <h2 className="w-h2">{t('Message templates')}</h2>
              <ul className="w-templatelist">
                {state.settings.templates.map((tpl) => (
                  <li key={tpl.id}>
                    <textarea
                      className="w-input"
                      rows={2}
                      value={tpl.text}
                      onChange={(e) =>
                        update((w) => ({
                          ...w,
                          settings: {
                            ...w.settings,
                            templates: w.settings.templates.map((x) => (x.id === tpl.id ? { ...x, text: e.target.value } : x)),
                          },
                        }))
                      }
                    />
                    {/* Built-in templates can be edited but not deleted — the
                        list must never be empty when a therapist needs it. */}
                    {!tpl.builtIn && (
                      <button
                        className="w-link"
                        onClick={() =>
                          update((w) => ({ ...w, settings: { ...w.settings, templates: w.settings.templates.filter((x) => x.id !== tpl.id) } }))
                        }
                      >
                        {t('Delete')}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <div className="w-inline">
                <input className="w-input" value={newTemplate} onChange={(e) => setNewTemplate(e.target.value)} placeholder={t('New template…')} />
                <button
                  className="w-btn w-btn--ghost"
                  disabled={!newTemplate.trim()}
                  onClick={() => {
                    const tpl: MessageTemplate = { id: `tpl-${Date.now()}`, text: newTemplate.trim(), builtIn: false }
                    update((w) => ({ ...w, settings: { ...w.settings, templates: [...w.settings.templates, tpl] } }))
                    setNewTemplate('')
                  }}
                >
                  {t('Add template')}
                </button>
              </div>
            </>
          )}

          {section === 'privacy' && (
            <>
              <h2 className="w-h2">{t('Privacy & security')}</h2>
              <ul className="w-switches">
                <li>
                  <span>{t('Two-factor authentication')}</span>
                  <button
                    className={`switch${state.settings.twoFactor ? ' is-on' : ''}`}
                    role="switch"
                    aria-checked={state.settings.twoFactor}
                    aria-label={t('Two-factor authentication')}
                    onClick={() => update((w) => ({ ...w, settings: { ...w.settings, twoFactor: !w.settings.twoFactor } }))}
                  >
                    <span className="switch__knob" />
                  </button>
                </li>
              </ul>

              <div className="w-field__label">{t('Active sessions')}</div>
              <ul className="w-reflist">
                <li><span>{t('This device')} · {navigator.platform || 'Desktop'}</span><em className="w-small">{t('current')}</em></li>
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
                <button className="w-btn w-btn--danger">{t('Delete account')}</button>
              </div>
              <p className="w-note">{t('Account deletion has a 30-day grace period.')}</p>
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
