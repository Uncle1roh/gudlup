import { useState } from 'react'
import { Roster } from './Roster'
import { PatientCard } from './PatientCard'
import { PatientEdit } from './PatientEdit'
import { ClinicalWizard, type LaunchConfig } from './ClinicalWizard'
import { MonitoredSession, type SessionResult } from './MonitoredSession'
import { Debrief, type DebriefData } from './Debrief'
import { SessionReport } from './SessionReport'
import { Credentialing } from './Credentialing'
import { SignOutButton } from '../auth/auth'
import { Loading } from '../components/Loading'
import { useDataProvider } from '../data/provider'
import { usePatient, useTherapist } from '../data/hooks'
import { getProtocol } from '../data/protocols'
import { SessionComposer } from '../compose/SessionComposer'
import type { B2bSession } from './data'

type Screen = 'roster' | 'card' | 'edit' | 'wizard' | 'compose' | 'session' | 'debrief' | 'report' | 'credentials'

const DEMO_SESSION_SECONDS = 96 // compress the 24-min Deep session for the demo

function buildB2bSession(result: SessionResult): B2bSession {
  return {
    id: `rep-${result.endedAt}`,
    date: result.endedAt,
    protocolCode: result.protocolCode,
    duration: Math.max(1, Math.round((result.endedAt - result.startedAt) / 60_000)),
    vasPre: result.vasPre,
    vasPost: result.vasPost,
    notes: result.notes,
  }
}

export function TherapistApp() {
  const dp = useDataProvider()
  const { data: therapist } = useTherapist()
  const [screen, setScreen] = useState<Screen>('roster')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { data: patient, refetch: refetchPatient } = usePatient(selectedId ?? '')
  const [config, setConfig] = useState<LaunchConfig | null>(null)
  const [result, setResult] = useState<SessionResult | null>(null)
  const [debrief, setDebrief] = useState<DebriefData | null>(null)
  const [fullLength, setFullLength] = useState(false)

  function reset() {
    setConfig(null)
    setResult(null)
    setDebrief(null)
    setSelectedId(null)
    setScreen('roster')
  }

  async function confirmReport() {
    if (selectedId && result) {
      await dp.recordB2bSession(selectedId, buildB2bSession(result))
    }
    reset()
  }

  // The monitored session takes over the full frame (no chrome).
  if (screen === 'session' && config) {
    if (!patient) return <Loading label="Connecting…" />
    return (
      <MonitoredSession
        patient={patient}
        config={config}
        demoSeconds={fullLength ? null : DEMO_SESSION_SECONDS}
        onEnd={(r) => {
          setResult(r)
          setScreen('debrief')
        }}
      />
    )
  }

  return (
    <div className="b2b-app">
      <header className="b2b-topbar">
        <div className="b2b-brand">
          <span className="b2b-brand__mark">◠◡</span>
          <span className="b2b-brand__name">goodloop <span className="b2b-brand__sub">clinic</span></span>
        </div>
        <div className="b2b-topbar__right">
          <button className="b2b-credchip" onClick={() => setScreen('credentials')}>
            <span className="b2b-credchip__badge">✓</span>
            {therapist?.name ?? '…'} · {therapist?.crp ?? ''}
          </button>
          <button className="b2b-demobtn" onClick={() => setFullLength((v) => !v)} title="Session length for the demo">
            {fullLength ? 'full 24 min' : 'demo ~90s'}
          </button>
          <span className="b2b-avatar">{therapist?.avatar ?? '👤'}</span>
          <SignOutButton className="b2b-demobtn" />
        </div>
      </header>

      <main className="b2b-main">
        {screen === 'roster' && <Roster onOpenPatient={(id) => { setSelectedId(id); setScreen('card') }} />}

        {screen === 'card' && (patient ? (
          <PatientCard patient={patient} onBack={() => setScreen('roster')} onEdit={() => setScreen('edit')} onStartSession={() => setScreen('wizard')} />
        ) : <Loading />)}

        {screen === 'edit' && (patient ? (
          <PatientEdit
            patient={patient}
            onCancel={() => setScreen('card')}
            onSave={async (patch) => { await dp.updatePatient(patient.id, patch); refetchPatient(); setScreen('card') }}
          />
        ) : <Loading />)}

        {screen === 'wizard' && (patient ? (
          <ClinicalWizard patient={patient} onCancel={() => setScreen('card')} onLaunch={(c) => { setConfig(c); setScreen('compose') }} />
        ) : <Loading />)}

        {screen === 'compose' && (patient && config ? (
          <SessionComposer
            context="b2b"
            patientName={patient.name}
            initialFamily={getProtocol(config.protocolCode)?.family ?? 'GL-ANX'}
            onCancel={() => setScreen('wizard')}
            onUse={(r) => { setConfig({ ...config, protocolCode: r.protocolCode, compose: r.settings, durationMin: r.durationMin }); setScreen('session') }}
          />
        ) : <Loading />)}

        {screen === 'debrief' && (patient && result ? (
          <Debrief patient={patient} result={result} onGenerate={(d) => { setDebrief(d); setScreen('report') }} />
        ) : <Loading />)}

        {screen === 'report' && (patient && therapist && result && debrief ? (
          <SessionReport patient={patient} therapist={therapist} result={result} debrief={debrief} onConfirm={confirmReport} />
        ) : <Loading />)}

        {screen === 'credentials' && <Credentialing onBack={() => setScreen('roster')} />}
      </main>
    </div>
  )
}
