import { useState } from 'react'
import { tr } from '../i18n'
import { PRESETS, fmtDateTime, type Patient, type Therapist } from './data'
import { getProtocol } from '../data/protocols'
import type { SessionResult } from './MonitoredSession'
import type { DebriefData } from './Debrief'

interface SessionReportProps {
  patient: Patient
  therapist: Therapist
  result: SessionResult
  debrief: DebriefData
  onConfirm: () => void
}

function mmss(s: number): string {
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
}

export function SessionReport({ patient, therapist, result, debrief, onConfirm }: SessionReportProps) {
  const proto = getProtocol(result.protocolCode)
  const preset = PRESETS[proto!.family]
  const [notes, setNotes] = useState(debrief.observations)
  const [signed, setSigned] = useState(false)

  return (
    <div className="b2b-page">
      <h1 className="b2b-h1">{tr('Session report')}</h1>
      <p className="b2b-sub" style={{ marginBottom: 18 }}>{tr('Auto-generated. Review, edit if needed, then sign.')}</p>

      <div className="report">
        <div className="report__row"><span>{tr('Patient')}</span><b>{patient.name} · {patient.age}</b></div>
        <div className="report__row"><span>{tr('Date / time')}</span><b>{fmtDateTime(result.endedAt)}</b></div>
        <div className="report__row"><span>{tr('Protocol')}</span><b>{proto?.code} — {proto?.title}</b></div>
        <div className="report__row"><span>{tr('Parameters')}</span><b>{preset.binaural} · breathing {preset.breathing} · {preset.voice}</b></div>
        <div className="report__row"><span>{tr('Duration')}</span><b>{mmss(Math.round((result.endedAt - result.startedAt) / 1000))} {result.completed ? tr('(completed)') : tr('(ended early)')}</b></div>
        <div className="report__row"><span>{tr('VAS pre → post')}</span><b>{result.vasPre} → {result.vasPost} <span className="report__delta">(+{result.vasPost - result.vasPre})</span></b></div>
        <div className="report__row"><span>{tr('Goal')}</span><b>{result.goal || '—'}</b></div>
        {result.intervened && <div className="report__row"><span>{tr('Intervention')}</span><b className="report__flag">{tr('INTERVENE used during session')}</b></div>}

        <div className="report__block">
          <span>{tr('Rapid notes (timestamped)')}</span>
          {result.notes.length === 0 ? (
            <p className="b2b-sub">{tr('No notes recorded.')}</p>
          ) : (
            <ul className="report__notes">
              {result.notes.map((n, i) => (
                <li key={i}><code>P{n.phase} · {mmss(n.at)}</code> {n.text}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="report__block">
          <span>{tr('Clinical observations (editable)')}</span>
          <textarea className="b2b-textarea" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="report__row"><span>{tr('Next session goal')}</span><b>{debrief.nextGoal || '—'}</b></div>
        <div className="report__row"><span>{tr('B2C assignment')}</span><b>{debrief.assignment || '—'}</b></div>

        {/* signature */}
        <div className={`signature${signed ? ' is-signed' : ''}`}>
          {signed ? (
            <>
              <span className="signature__mark">{tr('✓ Signed')}</span>
              <div>
                <b>{therapist.name}</b>
                <span className="b2b-sub">{therapist.crp} · {fmtDateTime(Date.now())}</span>
              </div>
            </>
          ) : (
            <button className="b2b-btn" onClick={() => setSigned(true)}>✍ Sign as {therapist.crp}</button>
          )}
        </div>
      </div>

      <div className="report__footer">
        <button className="b2b-btn b2b-btn--primary b2b-btn--lg" disabled={!signed} onClick={onConfirm}>
          {signed ? tr('Confirm & save report') : tr('Sign to confirm')}
        </button>
      </div>
    </div>
  )
}
