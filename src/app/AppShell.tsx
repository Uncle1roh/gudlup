import { useCallback, useEffect, useState } from 'react'
import { HomeSession } from './HomeSession'
import { Progress } from './Progress'
import { Library } from './Library'
import { Profile } from './Profile'
import { SessionRunner } from './SessionRunner'
import { PatientCall } from './PatientCall'
import { Assessment } from './Assessment'
import type { Appointment } from '../data/scheduling'
import { SessionWizard } from '../screens/SessionWizard'
import type { WizardResult } from '../data/wizard'
import { useSessions } from '../data/hooks'
import { useDataProvider } from '../data/provider'
import { libraryEntries } from '../data/catalog'
import { pickFromLibrary, type LibraryTag } from '../data/library'
import type { Plan } from '../data/plan'
import { useI18n } from '../i18n'
import type { SessionRecord, Duration } from '../types/domain'

type Tab = 'session' | 'progress' | 'library' | 'profile'
interface Launch { protocolCode: string; duration: Duration; planItemId?: string }

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'session', icon: '🎧', label: 'Session' },
  { id: 'progress', icon: '📈', label: 'Progress' },
  { id: 'library', icon: '🗂️', label: 'Library' },
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
  const [pickError, setPickError] = useState<string | null>(null)

  /* The pathway comes from the therapist — the app reads it, never writes it. */
  const [plan, setPlan] = useState<Plan | null>(null)
  const loadPlan = useCallback(() => {
    void dp.getMyPlan().then(setPlan).catch(() => setPlan(null))
  }, [dp])
  useEffect(loadPlan, [loadPlan])

  async function finishSession(record: SessionRecord, planItemId?: string) {
    await dp.recordSession(record)
    // finishing a session OF THE PATHWAY ticks that item off; anything started
    // from the library is practice, and leaves the pathway where it was
    if (planItemId) {
      await dp.markPlanItemDone(planItemId).catch(() => { /* offline — the next load reconciles */ })
      loadPlan()
    }
    refetch()
    setLaunch(null)
    setTab('session')
  }

  /* "Scegli tu per me": the check-in routes into the LIBRARY. It picks a
     general wellbeing audio for right now — it does not build a pathway, and
     it never reaches clinical material. */
  async function pickFromCheckIn(r: WizardResult) {
    setWizard(false)
    try {
      const all = await dp.listProtocols()
      const chosen = pickFromLibrary(libraryEntries(all), r.cluster as LibraryTag, r.duration)
      if (!chosen) { setPickError(t('The library has no audio to suggest yet.')); setTab('library'); return }
      setPickError(null)
      setLaunch({ protocolCode: chosen.item.code, duration: chosen.item.versions[0]?.duration ?? r.duration })
    } catch {
      setPickError(t('Could not reach the library — pick an audio yourself.'))
      setTab('library')
    }
  }

  if (wizard) {
    return (
      <SessionWizard
        mode="library"
        onCancel={() => setWizard(false)}
        onDone={(r: WizardResult) => void pickFromCheckIn(r)}
      />
    )
  }

  if (launch) {
    return (
      <SessionRunner
        protocolCode={launch.protocolCode}
        duration={launch.duration}
        demoSeconds={demoSeconds}
        onDone={(rec) => void finishSession(rec, launch.planItemId)}
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
          // a therapist-led session is history; the pathway is ticked off only
          // by the sessions the person does on their own, in its order
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
        {tab === 'session' && (
          <HomeSession
            history={history}
            plan={plan}
            onStart={setLaunch}
            onJoin={setJoining}
            onLibrary={() => setTab('library')}
            onAssess={() => setAssessing(true)}
          />
        )}
        {tab === 'progress' && <Progress history={history} />}
        {tab === 'library' && (
          <>
            {pickError && <div className="toast">{pickError}</div>}
            <Library onStart={setLaunch} onChooseForMe={() => setWizard(true)} />
          </>
        )}
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
