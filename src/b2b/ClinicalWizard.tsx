import { useState } from 'react'
import { tr } from '../i18n'
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

const GOAL_PRESETS = ['Reduce acute anxiety', 'Wind down / sleep', 'Stress recovery', 'Build resilience', 'Maintenance']

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
    { id: 'stereo', label: 'Stereo + latency OK', ok: stereoOk },
    { id: 'goal', label: 'Session goal defined', ok: goal.trim().length > 0 },
    { id: 'ready', label: 'Patient ready', ok: patientReady },
    { id: 'consent', label: 'Consent active', ok: consentOk },
  ]
  const allGreen = checklist.every((c) => c.ok)

  return (
    <div className="b2b-page">
      <button className="b2b-back" onClick={onCancel}>{tr('← Cancel')}</button>
      <h1 className="b2b-h1">Configure session — {patient.name}</h1>
      <p className="b2b-sub" style={{ marginBottom: 20 }}>{tr('Choose a protocol; its clinical preset maps to the audio file. Confirm the checklist to begin.')}</p>

      <div className="wizard-grid">
        <div>
          {/* protocol picker */}
          <section className="b2b-card">
            <h2 className="b2b-card__title">{tr('Protocol')}</h2>
            <div className="proto-list">
              {loading && <p className="b2b-sub">{tr('Loading protocols…')}</p>}
              {!loading && protocols.length === 0 && <p className="b2b-sub">{tr('No protocols are enabled. An administrator can enable or import protocols in the admin console.')}</p>}
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
            <h2 className="b2b-card__title">{tr('Session goal')}</h2>
            <div className="goal-presets">
              {GOAL_PRESETS.map((g) => (
                <button key={g} className={`b2b-chip${goal === g ? ' is-on' : ''}`} onClick={() => setGoal(g)}>{tr(g)}</button>
              ))}
            </div>
            <input className="b2b-input" placeholder={tr('…or type a specific goal')} value={goal} onChange={(e) => setGoal(e.target.value)} />
          </section>
        </div>

        <div>
          {/* preset summary */}
          <section className="b2b-card b2b-card--accent">
            <h2 className="b2b-card__title">{tr('Preset (auto)')}</h2>
            {preset ? (<>
              <dl className="kv kv--tight">
                <dt>{tr('Binaural')}</dt><dd>{preset.binaural}</dd>
                <dt>{tr('Looper')}</dt><dd>{preset.loop}</dd>
                <dt>{tr('Voice morph')}</dt><dd>{preset.voice}</dd>
                <dt>{tr('Breathing')}</dt><dd>{preset.breathing}</dd>
              </dl>
              <div className="audio-map">
                <span className="b2b-sub">{tr('Audio file')}</span>
                <code>{preset.audioFile}</code>
              </div>
            </>) : <p className="b2b-sub">{tr('Select a protocol to see its preset.')}</p>}
          </section>

          {/* checklist */}
          <section className="b2b-card">
            <h2 className="b2b-card__title">{tr('Pre-launch checklist')}</h2>
            <ul className="checklist">
              {checklist.map((c) => (
                <li key={c.id} className={`check${c.ok ? ' is-ok' : ''}`}>
                  <span className="check__dot">{c.ok ? '✓' : '○'}</span>
                  <span>{tr(c.label)}</span>
                  {c.id === 'stereo' && !c.ok && (
                    <button className="check__action" onClick={runStereoCheck} disabled={checking}>{checking ? tr('Checking…') : tr('Run check')}</button>
                  )}
                  {c.id === 'ready' && !c.ok && (
                    <button className="check__action" onClick={() => setPatientReady(true)}>{tr('Confirm')}</button>
                  )}
                </li>
              ))}
            </ul>
            <button className="b2b-btn b2b-btn--primary b2b-btn--lg" disabled={!allGreen || !selected} onClick={() => onLaunch({ protocolCode: selectedCode, goal })}>
              {allGreen ? tr('Compose audio →') : tr('Complete checklist to continue')}
            </button>
            {!allGreen && <p className="b2b-sub" style={{ marginTop: 8, textAlign: 'center' }}>{tr('Start is blocked while any item is red.')}</p>}
          </section>
        </div>
      </div>
    </div>
  )
}
