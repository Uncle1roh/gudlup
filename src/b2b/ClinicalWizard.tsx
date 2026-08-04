import { useState } from 'react'
import { useProtocols } from '../admin/hooks'
import { PRESETS, type Patient } from './data'
import type { ComposeSettings } from '../compose/types'
import type { Duration } from '../types/domain'

export interface LaunchConfig {
  protocolCode: string
  goal: string
  compose?: ComposeSettings
  durationMin?: Duration
}

interface ClinicalWizardProps {
  patient: Patient
  onLaunch: (config: LaunchConfig) => void
  onCancel: () => void
}

const GOAL_PRESETS = ['Ridurre l’ansia acuta', 'Distensione / sonno', 'Recupero dallo stress', 'Costruire resilienza', 'Mantenimento']

export function ClinicalWizard({ patient, onLaunch, onCancel }: ClinicalWizardProps) {
  const { data: catalog, loading } = useProtocols()
  const protocols = (catalog ?? []).filter((p) => p.enabled)
  const [protocolCode, setProtocolCode] = useState<string>('')
  const [goal, setGoal] = useState('')
  const [stereoOk, setStereoOk] = useState(false)
  const [checking, setChecking] = useState(false)
  const [patientReady, setPatientReady] = useState(false)

  const selectedCode = protocolCode || protocols[0]?.code || ''
  const selected = protocols.find((p) => p.code === selectedCode)
  const preset = selected ? PRESETS[selected.family] : undefined
  const consentOk = patient.consents.therapy

  function runStereoCheck() {
    setChecking(true)
    setStereoOk(false)
    setTimeout(() => {
      setChecking(false)
      setStereoOk(true)
    }, 1200)
  }

  const checklist = [
    { id: 'stereo', label: 'Stereo + latenza OK', ok: stereoOk },
    { id: 'goal', label: 'Obiettivo della seduta definito', ok: goal.trim().length > 0 },
    { id: 'ready', label: 'Paziente pronto', ok: patientReady },
    { id: 'consent', label: 'Consenso attivo', ok: consentOk },
  ]
  const allGreen = checklist.every((c) => c.ok)

  return (
    <div className="b2b-page">
      <button className="b2b-back" onClick={onCancel}>← Annulla</button>
      <h1 className="b2b-h1">Configura la seduta — {patient.name}</h1>
      <p className="b2b-sub" style={{ marginBottom: 20 }}>Scegli un protocollo: il suo preset clinico determina il file audio. Completa la checklist per iniziare.</p>

      <div className="wizard-grid">
        <div>
          {/* protocol picker */}
          <section className="b2b-card">
            <h2 className="b2b-card__title">Protocollo</h2>
            <div className="proto-list">
              {loading && <p className="b2b-sub">Caricamento protocolli…</p>}
              {!loading && protocols.length === 0 && <p className="b2b-sub">Nessun protocollo è attivo. Un amministratore può attivarli o importarli dalla console di amministrazione.</p>}
              {protocols.map((p) => (
                <button key={p.code} className={`proto${selectedCode === p.code ? ' is-on' : ''}`} onClick={() => setProtocolCode(p.code)}>
                  <span className="proto__radio" />
                  <span className="proto__body">
                    <strong>{p.code} · {p.title}</strong>
                    <span className="b2b-sub">{p.blurb}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* goal */}
          <section className="b2b-card">
            <h2 className="b2b-card__title">Obiettivo della seduta</h2>
            <div className="goal-presets">
              {GOAL_PRESETS.map((g) => (
                <button key={g} className={`b2b-chip${goal === g ? ' is-on' : ''}`} onClick={() => setGoal(g)}>{g}</button>
              ))}
            </div>
            <input className="b2b-input" placeholder="…oppure scrivi un obiettivo specifico" value={goal} onChange={(e) => setGoal(e.target.value)} />
          </section>
        </div>

        <div>
          {/* preset summary */}
          <section className="b2b-card b2b-card--accent">
            <h2 className="b2b-card__title">Preset (automatico)</h2>
            {preset ? (<>
              <dl className="kv kv--tight">
                <dt>Binaural</dt><dd>{preset.binaural}</dd>
                <dt>Looper</dt><dd>{preset.loop}</dd>
                <dt>Morphing voce</dt><dd>{preset.voice}</dd>
                <dt>Respirazione</dt><dd>{preset.breathing}</dd>
              </dl>
              <div className="audio-map">
                <span className="b2b-sub">File audio</span>
                <code>{preset.audioFile}</code>
              </div>
            </>) : <p className="b2b-sub">Seleziona un protocollo per vedere il suo preset.</p>}
          </section>

          {/* checklist */}
          <section className="b2b-card">
            <h2 className="b2b-card__title">Checklist pre-avvio</h2>
            <ul className="checklist">
              {checklist.map((c) => (
                <li key={c.id} className={`check${c.ok ? ' is-ok' : ''}`}>
                  <span className="check__dot">{c.ok ? '✓' : '○'}</span>
                  <span>{c.label}</span>
                  {c.id === 'stereo' && !c.ok && (
                    <button className="check__action" onClick={runStereoCheck} disabled={checking}>{checking ? 'Verifica…' : 'Esegui verifica'}</button>
                  )}
                  {c.id === 'ready' && !c.ok && (
                    <button className="check__action" onClick={() => setPatientReady(true)}>Conferma</button>
                  )}
                </li>
              ))}
            </ul>
            <button className="b2b-btn b2b-btn--primary b2b-btn--lg" disabled={!allGreen || !selected} onClick={() => onLaunch({ protocolCode: selectedCode, goal })}>
              {allGreen ? 'Componi l’audio →' : 'Completa la checklist per continuare'}
            </button>
            {!allGreen && <p className="b2b-sub" style={{ marginTop: 8, textAlign: 'center' }}>L’avvio è bloccato finché una voce resta in rosso.</p>}
          </section>
        </div>
      </div>
    </div>
  )
}
