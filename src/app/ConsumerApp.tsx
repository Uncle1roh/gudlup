import { useState } from 'react'
import { Onboarding } from './Onboarding'
import { AppShell } from './AppShell'

/** demoSeconds: number = override every session to N seconds (testing); null = full length. */
export function ConsumerApp() {
  const [phase, setPhase] = useState<'onboarding' | 'app'>('onboarding')
  const [demoSeconds, setDemoSeconds] = useState<number | null>(60)
  const toggleDemo = () => setDemoSeconds((s) => (s === null ? 60 : null))

  if (phase === 'app') {
    return <AppShell demoSeconds={demoSeconds} onDemoToggle={toggleDemo} />
  }
  return (
    <Onboarding
      demoSeconds={demoSeconds}
      onDemoToggle={toggleDemo}
      onComplete={() => setPhase('app')}
      onSkip={() => setPhase('app')}
    />
  )
}
