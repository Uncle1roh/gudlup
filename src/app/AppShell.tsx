import { useState } from 'react'
import { HomeSession } from './HomeSession'
import { Progress } from './Progress'
import { Explore } from './Explore'
import { Profile } from './Profile'
import { SessionRunner } from './SessionRunner'
import { PatientCall } from './PatientCall'
import { Assessment } from './Assessment'
import type { Appointment } from '../data/scheduling'
import { SessionWizard } from '../screens/SessionWizard'
import { advanceProgramAfter, startProgram } from '../data/program'
import type { WizardResult } from '../data/wizard'
import { useSessions } from '../data/hooks'
import { useDataProvider } from '../data/provider'
import { useI18n } from '../i18n'
import type { SessionRecord, Duration } from '../types/domain'

type Tab = 'session' | 'progress' | 'explore' | 'profile'
interface Launch { protocolCode: string; duration: Duration }

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'session', icon: '🎧', label: 'Session' },
  { id: 'progress', icon: '📈', label: 'Progress' },
  { id: 'explore', icon: '🧭', label: 'Explore' },
  { id: 'profile', icon: '🙂', label: 'Profile' },
]

interface AppShellProps {
  demoSeconds: number | null
  onDemoToggle: () => void
}

export function AppShell({ demoSeconds, onDemoToggle }: AppShellProps) {
  const { t } = useI18n()
  const dp = useDataProvider()
  const { data: history = [], refetch } = useSessions()
  const [tab, setTab] = useState<Tab>('session')
  const [launch, setLaunch] = useState<Launch | null>(null)
  const [joining, setJoining] = useState<Appointment | null>(null)
  const [wizard, setWizard] = useState(false)
  const [assessing, setAssessing] = useState(false)

  async function finishSession(record: SessionRecord) {
    await dp.recordSession(record)
    // the protocol project: finishing the program's current sub-protocol
    // advances it to the next one (1.1 → 1.2 → …)
    advanceProgramAfter(record.protocolCode)
    refetch()
    setLaunch(null)
    setTab('session')
  }

  if (wizard) {
    return (
      <SessionWizard
        onCancel={() => setWizard(false)}
        onDone={(r: WizardResult) => {
          // the ALTERNATIVE fallback ("if the primary does not resonate after
          // listening") is remembered and surfaced on the home screen after
          // the session
          try {
            localStorage.setItem('gl.wizard.last', JSON.stringify({
              primaryCode: r.protocolCode,
              alternativeCode: r.alternativeCode,
              alternativeTitle: r.alternativeTitle,
              intensity: r.intensity,
              cluster: r.cluster,
              at: Date.now(),
            }))
          } catch { /* private mode — fine */ }
          startProgram(r) // build the whole family pathway from the answers
          setWizard(false)
          setLaunch({ protocolCode: r.protocolCode, duration: r.duration })
        }}
      />
    )
  }

  if (launch) {
    return (
      <SessionRunner
        protocolCode={launch.protocolCode}
        duration={launch.duration}
        demoSeconds={demoSeconds}
        onDone={finishSession}
        onCancel={() => setLaunch(null)}
      />
    )
  }

  if (joining) {
    return (
      <PatientCall
        appointment={joining}
        demoSeconds={demoSeconds}
        onDone={async (record) => {
          // a therapist-led session is history, but it does not advance the
          // self-guided programme — that stays the person's own path
          if (record) {
            await dp.recordSession(record)
            refetch()
          }
          setJoining(null)
          setTab('session')
        }}
      />
    )
  }

  if (assessing) {
    return <Assessment onDone={() => setAssessing(false)} />
  }

  return (
    <div className="app-frame app-frame--tabs">
      <div className="tabview">
        {tab === 'session' && <HomeSession history={history} onStart={setLaunch} onJoin={setJoining} onWizard={() => setWizard(true)} onExplore={() => setTab('explore')} onAssess={() => setAssessing(true)} />}
        {tab === 'progress' && <Progress history={history} />}
        {tab === 'explore' && <Explore onStart={setLaunch} />}
        {tab === 'profile' && <Profile demoSeconds={demoSeconds} onDemoToggle={onDemoToggle} />}
      </div>

      <nav className="tabbar">
        {TABS.map((tb) => (
          <button key={tb.id} className={`tabbar__btn${tab === tb.id ? ' is-on' : ''}`} onClick={() => setTab(tb.id)}>
            <span className="tabbar__icon">{tb.icon}</span>
            <span className="tabbar__label">{t(tb.label)}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
