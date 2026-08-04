import { useEffect, useState } from 'react'
import { Roster } from './Roster'
import { PatientCard } from './PatientCard'
import { PatientEdit } from './PatientEdit'
import { ClinicalWizard, type LaunchConfig } from './ClinicalWizard'
import { ConsultationRoom, type SessionResult } from './ConsultationRoom'
import { Debrief, type DebriefData } from './Debrief'
import { SessionReport } from './SessionReport'
import { Credentialing } from './Credentialing'
import { SignOutButton } from '../auth/auth'
import { Loading } from '../components/Loading'
import { useDataProvider } from '../data/provider'
import { usePatient, useTherapist } from '../data/hooks'
import { getProtocol } from '../data/protocols'
import { SessionComposer } from '../compose/SessionComposer'
import { AvatarUpload } from '../components/AvatarUpload'
import { Agenda } from './Agenda'
import { joinWindowOpen, fmtTime, type Appointment } from '../data/scheduling'
import type { B2bSession } from './data'

type Screen = 'agenda' | 'roster' | 'card' | 'edit' | 'wizard' | 'compose' | 'session' | 'debrief' | 'report' | 'credentials'

const DEMO_SESSION_SECONDS = 96 // compress the 24-min Deep session for the demo

function buildB2bSession(result: SessionResult): B2bSession {
  return {
    id: `rep-${result.endedAt}`,
    date: result.endedAt,
    // talk-only consultations are still logged, with no protocol attached
    protocolCode: result.protocolCode,
    duration: Math.max(1, Math.round((result.endedAt - result.startedAt) / 60_000)),
    vasPre: result.vasPre,
    vasPost: result.vasPost,
    notes: result.notes,
  }
}

export function TherapistApp() {
  const dp = useDataProvider()
  const { data: therapist, loading: thLoading, error: thError, refetch: refetchTherapist } = useTherapist()
  const [screen, setScreen] = useState<Screen>('roster')

  /* 5-minute pre-session notice (PO spec): poll upcoming appointments and
     surface a banner above the roster when one is about to start. */
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [, setClock] = useState(0)
  useEffect(() => {
    let alive = true
    const load = () => void dp.listMyAppointments().then((a) => { if (alive) setAppointments(a) }).catch(() => undefined)
    load()
    const id = window.setInterval(() => { setClock((n) => n + 1); load() }, 30_000)
    return () => { alive = false; window.clearInterval(id) }
  }, [dp])
  const dueNow = appointments.find((a) => joinWindowOpen(a, Date.now()))

  async function startScheduledSession(a: Appointment) {
    try {
      const patientId = await dp.patientForAppointment(a)
      setSelectedId(patientId)
      setRoomId(a.id) // the appointment id IS the call room both devices join
      setScreen('card') // the ordinary session flow prevails from the card
    } catch { /* patient lookup failed — the roster is still usable */ }
  }

  /** The room both peers join. A booked appointment gives a shared id; an
      ad-hoc consultation falls back to a patient-scoped one (no second device
      can guess it, so that path stays demo-only). */
  function roomForPatient(patientId: string, name: string): string {
    const appt = appointments.find((a) => a.patientName === name)
    return appt?.id ?? `patient-${patientId}`
  }
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [roomId, setRoomId] = useState<string | null>(null)
  const { data: patient, refetch: refetchPatient } = usePatient(selectedId ?? '')
  const [config, setConfig] = useState<LaunchConfig | null>(null)
  const [result, setResult] = useState<SessionResult | null>(null)
  const [debrief, setDebrief] = useState<DebriefData | null>(null)
  const [fullLength, setFullLength] = useState(true)  // real duration by default; demo compress is opt-in

  function reset() {
    setConfig(null)
    setResult(null)
    setDebrief(null)
    setSelectedId(null)
    setRoomId(null)
    setScreen('roster')
  }

  async function confirmReport() {
    try {
      if (selectedId && result) {
        await dp.recordB2bSession(selectedId, buildB2bSession(result))
      }
      reset()
    } catch (e) {
      window.alert(`Impossibile salvare il referto: ${(e as Error).message}`)
    }
  }

  // ---- credential gate: the clinical app opens only for APPROVED clinicians.
  if (thLoading && !therapist) {
    return <div className="b2b-app"><div className="b2b-gate"><Loading label="Caricamento del tuo account…" /></div></div>
  }
  if (thError) {
    return (
      <div className="b2b-app"><div className="b2b-gate">
        <div className="b2b-gate__card">
          <h1 className="b2b-h1">Account non clinico</h1>
          <p className="b2b-sub">Questo accesso non è registrato come clinico. Esci e crea un account clinico (nome + numero di albo) dalla schermata di accesso.</p>
          <SignOutButton className="b2b-btn b2b-btn--primary" />
        </div>
      </div></div>
    )
  }
  if (therapist && therapist.status !== 'approved') {
    return (
      <div className="b2b-app"><div className="b2b-gate">
        <div className="b2b-gate__card">
          <span className="b2b-gate__badge">⏳</span>
          <h1 className="b2b-h1">Credenziali in verifica</h1>
          <p className="b2b-sub">
            {therapist.name} · {therapist.crp}<br />
            La tua registrazione è stata ricevuta. Un amministratore verifica e approva le credenziali cliniche prima
            di abilitare l’accesso ai pazienti — entrerai appena sarà approvata.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="b2b-btn" onClick={refetchTherapist}>Controlla di nuovo</button>
            <SignOutButton className="b2b-btn" />
          </div>
        </div>
      </div></div>
    )
  }

  // The consultation room takes over the full frame (no chrome). It opens
  // without a protocol — one is chosen from the in-call library, if at all.
  if (screen === 'session') {
    if (!patient) return <Loading label="Connessione…" />
    return (
      <ConsultationRoom
        patient={patient}
        config={config}
        roomId={roomId ?? roomForPatient(patient.id, patient.name)}
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
          <button className="b2b-demobtn" onClick={() => setScreen('agenda')}>🗓 Agenda</button>
          <button className="b2b-credchip" onClick={() => setScreen('credentials')}>
            <span className="b2b-credchip__badge">✓</span>
            {therapist?.name ?? '…'} · {therapist?.crp ?? ''}
          </button>
          <button className="b2b-demobtn" onClick={() => setFullLength((v) => !v)} title="Durata della seduta per la demo">
            {fullLength ? '24 min completi' : 'demo ~90s'}
          </button>
          <AvatarUpload size={34} fallback={therapist?.avatar ?? '👤'} className="avatarup--bar" />
          <SignOutButton className="b2b-demobtn" />
        </div>
      </header>

      <main className="b2b-main">
        {dueNow && (
          <div className="b2b-duebar">
            <span>
              <b>Seduta con {dueNow.patientName}</b> alle {fmtTime(dueNow.startsAtMs)} — il paziente vede ora il suo
              pulsante &ldquo;Entra nella sessione&rdquo;.
            </span>
            <button className="b2b-btn b2b-btn--primary" onClick={() => void startScheduledSession(dueNow)}>
              Avvia la seduta →
            </button>
          </div>
        )}
        {screen === 'agenda' && <Agenda onBack={() => setScreen('roster')} />}
        {screen === 'roster' && <Roster onOpenPatient={(id) => { setSelectedId(id); setScreen('card') }} />}

        {screen === 'card' && (patient ? (
          <PatientCard
            patient={patient}
            onBack={() => setScreen('roster')}
            onEdit={() => setScreen('edit')}
            onOpenConsultation={() => { setConfig(null); setScreen('session') }}
            onPlanSession={() => setScreen('wizard')}
            onRefetch={refetchPatient}
          />
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
