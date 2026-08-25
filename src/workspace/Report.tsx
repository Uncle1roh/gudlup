/* ============================================================================
   Therapist Workspace — Session Report (TH-REPORT) and Post-Session (TH-POSTSESS)

   The report is auto-generated when the call ends and every field is editable
   before signing. It works for BOTH kinds of session: a video-only session
   simply omits the treatment rows rather than showing them empty.

   The signature is the point of the screen. It records full name, professional
   licence number and a timestamp; after signing the report is read-only. It
   can be re-opened and re-signed, and that creates a NEW VERSION — the earlier
   one is preserved in the audit trail and never overwritten, which is what
   makes the signature worth anything.

   Post-session offers four cards and all four are optional. A therapist who
   wants to sign and leave should be able to, so "Return to Patients" is always
   available and nothing blocks on being dismissed.
   ============================================================================ */

import { useState } from 'react'
import { useI18n, fmtDate } from '../i18n'
import { fmtClock } from './LiveSession'
import { versionShort } from './Patients'
import { adherencePct, assessmentDueLabel, type SessionRow, type TherapistAccount, type WorkspacePatient } from './data'
import { buildSessionReportPdf } from './sessionPdf'

interface ReportProps {
  patient: WorkspacePatient
  account: TherapistAccount
  row: SessionRow
  quickNotes?: { at: number; phase: number; text: string }[]
  onSave: (row: SessionRow) => void
  onBack: () => void
}

export function SessionReport({ patient, account, row, quickNotes = [], onSave, onBack }: ReportProps) {
  const { t } = useI18n()
  const [draft, setDraft] = useState<SessionRow>(row)
  const [signed, setSigned] = useState(Boolean(row.signedAt))
  const [post, setPost] = useState(false)

  const readOnly = signed
  const set = (patch: Partial<SessionRow>) => setDraft({ ...draft, ...patch })

  if (post) {
    return <PostSession patient={patient} row={draft} onDone={onBack} />
  }

  const delta = draft.vasPre != null && draft.vasPost != null ? draft.vasPost - draft.vasPre : null

  return (
    <div className="w-report">
      <div className="w-pagehead">
        <div>
          <h1 className="w-h1">{t('Session Report')}</h1>
          <p className="w-small">{patient.name} · {t('Session #{n}', { n: draft.noteNumber })}</p>
        </div>
        <span className={`w-status ${signed ? 'w-status--active' : 'w-status--new'}`}>
          {signed ? `${t('Signed')} ✓` : t('Draft — awaiting signature')}
        </span>
      </div>

      <section className="w-section w-section--open">
        <div className="w-section__body">
          <dl className="w-summary">
            <div>
              <dt>{t('Date & time')}</dt>
              <dd>{fmtDate(draft.at, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</dd>
            </div>
            <div><dt>{t('Call duration')}</dt><dd>{draft.minutes} min</dd></div>
            <div><dt>{t('Good Loop treatment')}</dt><dd>{draft.kind === 'gl-video' ? `${t('Yes')} · ${draft.protocolCode}` : t('No')}</dd></div>
            {draft.kind === 'gl-video' && (
              <>
                <div><dt>{t('Version · played')}</dt><dd>{versionShort(draft.version)} · {fmtClock((draft.version ?? 0) * 60)}</dd></div>
                <div><dt>{t('Phases completed')}</dt><dd>{draft.phasesCompleted ?? 0} / 6</dd></div>
                <div><dt>{t('Pauses')}</dt><dd>{draft.pauses ?? 0}</dd></div>
                <div><dt>{t('Interventions')}</dt><dd>{draft.interventions ?? 0}</dd></div>
              </>
            )}
          </dl>
        </div>
      </section>

      <section className="w-section w-section--open">
        <div className="w-section__head w-section__head--static">
          <span className="w-section__title">{t('Clinical note')}</span>
          <span className="w-tag">{t('Session #{n}', { n: draft.noteNumber })}</span>
          <span className="w-small">{t('single entry · editable')}</span>
        </div>
        <div className="w-section__body">
          <textarea
            className="w-input w-notearea"
            value={draft.note}
            readOnly={readOnly}
            onChange={(e) => set({ note: e.target.value })}
          />
          {quickNotes.length > 0 && (
            <ul className="w-quicknotes">
              {quickNotes.map((q, i) => (
                <li key={i}>
                  <span className="w-mono w-small">{fmtClock((q.at - quickNotes[0].at) / 1000)} P{q.phase}</span> — {q.text}
                </li>
              ))}
            </ul>
          )}
          <p className="w-note">
            {t('This note is saved to the patient’s unified, searchable notes list, tagged “Session #{n}”.', { n: draft.noteNumber })}
          </p>
        </div>
      </section>

      <section className="w-section w-section--open">
        <div className="w-section__body w-form">
          <label className="w-field">
            <span className="w-field__label">{t('VAS pre')}</span>
            <input
              className="w-input" type="number" min={1} max={10}
              value={draft.vasPre ?? ''} readOnly={readOnly}
              onChange={(e) => set({ vasPre: e.target.value ? Number(e.target.value) : undefined })}
            />
          </label>
          <label className="w-field">
            <span className="w-field__label">{t('VAS post')} {delta != null && <em>· Δ {delta > 0 ? '+' : '−'}{Math.abs(delta)}</em>}</span>
            <input
              className="w-input" type="number" min={1} max={10}
              value={draft.vasPost ?? ''} readOnly={readOnly}
              onChange={(e) => set({ vasPost: e.target.value ? Number(e.target.value) : undefined })}
            />
          </label>
          <label className="w-field w-field--wide">
            <span className="w-field__label">{t('Session goal')}</span>
            <input className="w-input" value={draft.goal ?? ''} readOnly={readOnly} onChange={(e) => set({ goal: e.target.value })} />
          </label>
          <label className="w-field">
            <span className="w-field__label">{t('Goal status')}</span>
            <select
              className="w-input"
              value={draft.goalStatus ?? 'addressed'}
              disabled={readOnly}
              onChange={(e) => set({ goalStatus: e.target.value as SessionRow['goalStatus'] })}
            >
              <option value="addressed">{t('Addressed')}</option>
              <option value="partial">{t('Partially addressed')}</option>
              <option value="deferred">{t('Deferred')}</option>
            </select>
          </label>
          <label className="w-field w-field--wide">
            <span className="w-field__label">{t('Goal for next session')}</span>
            <input className="w-input" value={draft.nextGoal ?? ''} readOnly={readOnly} onChange={(e) => set({ nextGoal: e.target.value })} />
          </label>
        </div>
      </section>

      <section className="w-section w-section--open">
        <div className="w-section__body">
          <div className="w-field__label">{t('Digital signature')}</div>
          <div className="w-signature">
            <strong>{account.fullName}</strong>
            <span className="w-small">
              {account.licenceNumber} ·{' '}
              {draft.signedAt
                ? new Date(draft.signedAt).toLocaleString()
                : t('timestamp on signing')}
            </span>
            {draft.signatureVersion > 1 && (
              <span className="w-small">{t('Version {n} — earlier versions preserved in the audit trail.', { n: draft.signatureVersion })}</span>
            )}
          </div>

          <div className="w-actions">
            <button
              className="w-btn w-btn--ghost"
              onClick={() =>
                buildSessionReportPdf({ patient, account, rows: [draft] }).save(
                  `good-loop-session-${draft.noteNumber}-${new Date(draft.at).toISOString().slice(0, 10)}.pdf`,
                )
              }
            >
              {t('Download PDF')}
            </button>
            {signed ? (
              <>
                <button className="w-btn w-btn--ghost" onClick={() => setSigned(false)}>{t('Re-open and edit')}</button>
                <button className="w-btn w-btn--primary" onClick={() => setPost(true)}>{t('Continue')}</button>
              </>
            ) : (
              <>
                <button className="w-btn w-btn--ghost" onClick={onBack}>{t('Continue editing')}</button>
                <button
                  className="w-btn w-btn--primary"
                  onClick={() => {
                    const next = { ...draft, signedAt: Date.now(), signatureVersion: draft.signatureVersion + 1 }
                    setDraft(next)
                    setSigned(true)
                    onSave(next)
                    setPost(true)
                  }}
                >
                  {t('Confirm & Sign')}
                </button>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

/* ---------------------------------------------------------- TH-POSTSESS -- */

function PostSession({
  patient,
  row,
  onDone,
}: {
  patient: WorkspacePatient
  row: SessionRow
  onDone: () => void
}) {
  const { t } = useI18n()
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({})
  const suggested = row.at + 7 * 86_400_000
  const due = assessmentDueLabel(patient)
  const rx = patient.prescriptions[0]

  const dismiss = (k: string) => setDismissed((d) => ({ ...d, [k]: true }))

  return (
    <div className="w-report">
      <div className="w-pagehead">
        <div>
          <h1 className="w-h1">{t('Report signed')} ✓</h1>
          <p className="w-lead">{t("What's next for {name}?", { name: patient.name.split(' ')[0] })}</p>
        </div>
      </div>

      <div className="w-postgrid">
        {!dismissed.schedule && (
          <article className="w-postcard">
            <h3>{t('Schedule next session')}</h3>
            <p className="w-small">{t('Suggested from recurring pattern + your availability.')}</p>
            <button className="w-btn w-btn--primary" onClick={() => dismiss('schedule')}>
              {t('Confirm {date}', { date: fmtDate(suggested, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) })}
            </button>
            <button className="w-link" onClick={() => dismiss('schedule')}>{t('Choose different time')}</button>
            <p className="w-note">{t('Adds to your connected calendar.')}</p>
          </article>
        )}

        {!dismissed.rx && (
          <article className="w-postcard">
            <h3>{t('Inter-session homework')}</h3>
            <p className="w-small">
              {rx
                ? t('Current: {code} — {n}% adherence.', { code: `${rx.protocolCode} ${versionShort(rx.version)}`, n: adherencePct(rx) })
                : t('No prescription assigned yet.')}
            </p>
            <button className="w-btn w-btn--ghost" onClick={() => dismiss('rx')}>{t('Assign prescription')}</button>
            <button className="w-link" onClick={() => dismiss('rx')}>{t('No homework needed')}</button>
          </article>
        )}

        {!dismissed.assessment && (
          <article className="w-postcard">
            <h3>{t('Assessment')} {due && <span className="w-tag">{due}</span>}</h3>
            <p className="w-small">
              {due ? t('System proposes DASS-21 is due this week.') : t('Nothing due right now.')}
            </p>
            <button className="w-btn w-btn--ghost" onClick={() => dismiss('assessment')}>{t('Send DASS-21 to patient')}</button>
            <button className="w-link" onClick={() => dismiss('assessment')}>{t('Remind me in 1 week')}</button>
          </article>
        )}

        {!dismissed.continuity && (
          <article className="w-postcard">
            <h3>{t('Continuity report ready')}</h3>
            <p className="w-small">
              {t('Auto-generated summary of this session — loads in Pre-Session Preparation before the next appointment.')}
            </p>
            <button className="w-link" onClick={() => dismiss('continuity')}>{t('View')}</button>
          </article>
        )}
      </div>

      <p className="w-note">{t('All of these are optional.')}</p>
      <button className="w-btn w-btn--ghost" onClick={onDone}>{t('Return to Patients')}</button>
    </div>
  )
}
