import { useState } from 'react'
import { PRESETS, fmtDateTime, type Patient, type Therapist } from './data'
import { getProtocol } from '../data/protocols'
import type { SessionResult } from './ConsultationRoom'
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
  const preset = proto ? PRESETS[proto.family] : undefined
  const [notes, setNotes] = useState(debrief.observations)
  const [signed, setSigned] = useState(false)

  return (
    <div className="b2b-page">
      <h1 className="b2b-h1">Referto della seduta</h1>
      <p className="b2b-sub" style={{ marginBottom: 18 }}>Generato automaticamente. Rivedi, modifica se serve, poi firma.</p>

      <div className="report">
        <div className="report__row"><span>Paziente</span><b>{patient.name} · {patient.age}</b></div>
        <div className="report__row"><span>Data e ora</span><b>{fmtDateTime(result.endedAt)}</b></div>
        <div className="report__row"><span>Protocollo</span><b>{proto ? `${proto.code} — ${proto.title}` : 'Nessuno — solo colloquio'}</b></div>
        {preset && <div className="report__row"><span>Parametri</span><b>{preset.binaural} · respirazione {preset.breathing} · {preset.voice}</b></div>}
        <div className="report__row"><span>Durata</span><b>{mmss(Math.round((result.endedAt - result.startedAt) / 1000))} {result.audioPlayed ? (result.completed ? '(audio completato)' : '(audio interrotto)') : ''}</b></div>
        {/* 0 means the reading was never taken. Printing "0 → 0 (+0)" would
            read as a measured null effect, which is a different clinical
            claim from "we did not measure". */}
        {result.audioPlayed && (
          <div className="report__row">
            <span>VAS pre → post</span>
            {result.vasPre > 0 && result.vasPost > 0 ? (
              <b>{result.vasPre} → {result.vasPost} <span className="report__delta">({result.vasPost - result.vasPre >= 0 ? '+' : ''}{result.vasPost - result.vasPre})</span></b>
            ) : (
              <b className="report__none">non rilevato</b>
            )}
          </div>
        )}
        <div className="report__row"><span>Obiettivo</span><b>{result.goal || '—'}</b></div>
        {result.intervened && <div className="report__row"><span>Intervento</span><b className="report__flag">INTERVIENI usato durante la seduta</b></div>}

        <div className="report__block">
          <span>Note rapide (con orario)</span>
          {result.notes.length === 0 ? (
            <p className="b2b-sub">Nessuna nota registrata.</p>
          ) : (
            <ul className="report__notes">
              {result.notes.map((n, i) => (
                <li key={i}><code>{n.phase ? `P${n.phase} · ` : ''}{mmss(n.at)}</code> {n.text}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="report__block">
          <span>Osservazioni cliniche (modificabili)</span>
          <textarea className="b2b-textarea" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="report__row"><span>Obiettivo prossima seduta</span><b>{debrief.nextGoal || '—'}</b></div>
        <div className="report__row"><span>Compito nell’app</span><b>{debrief.assignment || '—'}</b></div>

        {/* signature */}
        <div className={`signature${signed ? ' is-signed' : ''}`}>
          {signed ? (
            <>
              <span className="signature__mark">✓ Firmato</span>
              <div>
                <b>{therapist.name}</b>
                <span className="b2b-sub">{therapist.crp} · {fmtDateTime(Date.now())}</span>
              </div>
            </>
          ) : (
            <button className="b2b-btn" onClick={() => setSigned(true)}>✍ Firma come {therapist.crp}</button>
          )}
        </div>
      </div>

      <div className="report__footer">
        <button className="b2b-btn b2b-btn--primary b2b-btn--lg" disabled={!signed} onClick={onConfirm}>
          {signed ? 'Conferma e salva il referto' : 'Firma per confermare'}
        </button>
      </div>
    </div>
  )
}
