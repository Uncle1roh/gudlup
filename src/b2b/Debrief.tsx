import { useState } from 'react'
import { type Patient } from './data'
import { getProtocol } from '../data/protocols'
import type { SessionResult } from './ConsultationRoom'

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
          <h1 className="b2b-h1">Consulenza conclusa</h1>
          <p className="b2b-sub">
            {result.audioPlayed
              ? `${proto?.title ?? result.protocolCode} · ${result.completed ? 'completata' : 'terminata in anticipo'}`
              : 'Solo colloquio — nessun protocollo riprodotto'}
          </p>
        </div>
      </div>

      <div className="debrief-grid">
        <div>
          <section className="b2b-card">
            <h2 className="b2b-card__title">Debriefing</h2>
            <ol className="debrief-steps">
              <li><b>1 · Apertura</b> — “Come ti sei sentito durante la seduta?”</li>
              <li><b>2 · Osservazioni</b> — condividi ciò che hai annotato</li>
              <li><b>3 · Prossimo passo</b> — definite insieme il prossimo obiettivo</li>
            </ol>

            <label className="b2b-label">Osservazioni (precompilate dalle note rapide)</label>
            <textarea className="b2b-textarea" rows={4} value={observations} onChange={(e) => setObservations(e.target.value)} />

            <label className="b2b-label">Obiettivo della prossima seduta</label>
            <input className="b2b-input" value={nextGoal} onChange={(e) => setNextGoal(e.target.value)} placeholder="es. Consolidare la routine del sonno" />

            <label className="b2b-label">Compito fra le sedute (app)</label>
            <input className="b2b-input" value={assignment} onChange={(e) => setAssignment(e.target.value)} placeholder="es. 3× GL-ANX Quick / settimana" />
          </section>
        </div>

        <div>
          <section className="b2b-card b2b-card--accent">
            <h2 className="b2b-card__title">Strumenti</h2>
            <p className="b2b-sub" style={{ marginBottom: 10 }}>Disponibili da somministrare — a tua scelta, nessun automatismo.</p>
            <ul className="instruments">
              {result.audioPlayed
                ? <li><span className="inst-ok">✓ registrato</span> VAS pre/post (+{result.vasPost - result.vasPre})</li>
                : <li><span className="inst-opt">n/d</span> VAS pre/post — nessuna sessione audio</li>}
              <li><span className="inst-due">previsto</span> DASS-21 (T2) {patient.assessmentDue?.includes('T') ? '' : '— non ancora previsto'}</li>
              <li><span className="inst-opt">facoltativi</span> PSS-10 · BRS · CBI</li>
            </ul>
          </section>

          <button className="b2b-btn b2b-btn--primary b2b-btn--lg" onClick={() => onGenerate({ observations, nextGoal, assignment })}>
            Genera il referto della seduta →
          </button>
          <p className="b2b-sub" style={{ marginTop: 8, textAlign: 'center' }}>Fa risparmiare ~10 minuti di documentazione.</p>
        </div>
      </div>
    </div>
  )
}
