import { useState } from 'react'
import { tr } from '../i18n'
import { type Patient } from './data'
import { getProtocol } from '../data/protocols'
import type { SessionResult } from './MonitoredSession'

export interface DebriefData {
  observations: string
  nextGoal: string
  assignment: string
}

interface DebriefProps {
  patient: Patient
  result: SessionResult
  onGenerate: (d: DebriefData) => void
}

export function Debrief({ patient, result, onGenerate }: DebriefProps) {
  const proto = getProtocol(result.protocolCode)
  const [observations, setObservations] = useState(
    result.notes.length ? result.notes.map((n) => `• ${n.text}`).join('\n') : '',
  )
  const [nextGoal, setNextGoal] = useState('')
  const [assignment, setAssignment] = useState(patient.prescription ?? '')

  return (
    <div className="b2b-page">
      <div className="transition-head">
        <span className="transition-head__check">✓</span>
        <div>
          <h1 className="b2b-h1">{tr('Session complete')}</h1>
          <p className="b2b-sub">{proto?.title} · {result.completed ? tr('completed') : tr('ended early')} · reconnected to video</p>
        </div>
      </div>

      <div className="debrief-grid">
        <div>
          <section className="b2b-card">
            <h2 className="b2b-card__title">{tr('Debrief')}</h2>
            <ol className="debrief-steps">
              <li><b>{tr('1 · Open')}</b> — “How did you feel during the session?”</li>
              <li><b>{tr('2 · Observations')}</b> — share insights from your notes</li>
              <li><b>{tr('3 · Next step')}</b> — co-define the next goal</li>
            </ol>

            <label className="b2b-label">{tr('Observations (pre-filled from rapid notes)')}</label>
            <textarea className="b2b-textarea" rows={4} value={observations} onChange={(e) => setObservations(e.target.value)} />

            <label className="b2b-label">{tr('Next session goal')}</label>
            <input className="b2b-input" value={nextGoal} onChange={(e) => setNextGoal(e.target.value)} placeholder={tr('e.g. Consolidate sleep routine')} />

            <label className="b2b-label">{tr('Inter-session assignment (B2C)')}</label>
            <input className="b2b-input" value={assignment} onChange={(e) => setAssignment(e.target.value)} placeholder={tr('e.g. 3× GL-ANX Quick / week')} />
          </section>
        </div>

        <div>
          <section className="b2b-card b2b-card--accent">
            <h2 className="b2b-card__title">{tr('Instruments')}</h2>
            <p className="b2b-sub" style={{ marginBottom: 10 }}>{tr('Available to administer — your choice, no auto-prompts.')}</p>
            <ul className="instruments">
              <li><span className="inst-ok">{tr('✓ recorded')}</span> VAS pre/post (+{result.vasPost - result.vasPre})</li>
              <li><span className="inst-due">{tr('due')}</span> DASS-21 (T2) {patient.assessmentDue?.includes('T') ? '' : '— not yet due'}</li>
              <li><span className="inst-opt">{tr('optional')}</span> PSS-10 · BRS · CBI</li>
            </ul>
          </section>

          <button className="b2b-btn b2b-btn--primary b2b-btn--lg" onClick={() => onGenerate({ observations, nextGoal, assignment })}>
            {tr('Generate session report →')}
          </button>
          <p className="b2b-sub" style={{ marginTop: 8, textAlign: 'center' }}>{tr('Saves ~10 min of documentation.')}</p>
        </div>
      </div>
    </div>
  )
}
