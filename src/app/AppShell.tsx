import { useState } from 'react'
import { HomeSession } from './HomeSession'
import { Progress } from './Progress'
import { Explore } from './Explore'
import { Profile } from './Profile'
import { SessionRunner } from './SessionRunner'
import { Assessment } from './Assessment'
import { SessionComposer } from '../compose/SessionComposer'
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
  const [composing, setComposing] = useState(false)
  const [assessing, setAssessing] = useState(false)

  async function finishSession(record: SessionRecord) {
    await dp.recordSession(record)
    refetch()
    setLaunch(null)
    setTab('session')
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

  if (composing) {
    return (
      <SessionComposer
        context="b2c"
        onCancel={() => setComposing(false)}
        onUse={(r) => { setComposing(false); setLaunch({ protocolCode: r.protocolCode, duration: r.durationMin }) }}
      />
    )
  }

  if (assessing) {
    return <Assessment onDone={() => setAssessing(false)} />
  }

  return (
    <div className="app-frame app-frame--tabs">
      <div className="tabview">
        {tab === 'session' && <HomeSession history={history} onStart={setLaunch} onExplore={() => setTab('explore')} onCompose={() => setComposing(true)} onAssess={() => setAssessing(true)} />}
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
