import { useState } from 'react'
import { Onboarding } from './Onboarding'
import { AppShell } from './AppShell'
import { useAuth } from '../auth/auth'

/* The first-time experience (welcome → consent → wizard → stereo check → the
   first audio) runs ONCE per account. After it completes — or is skipped — the
   app opens straight on the home screen on every later login. */
const KEY = 'gl.onboarded'

function onboardingKey(userId?: string): string {
  return userId ? `${KEY}.${userId}` : KEY
}
function hasOnboarded(userId?: string): boolean {
  try {
    return localStorage.getItem(onboardingKey(userId)) === '1' || localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}
function markOnboarded(userId?: string): void {
  try {
    localStorage.setItem(onboardingKey(userId), '1')
    localStorage.setItem(KEY, '1')
  } catch { /* private mode — the intro simply shows again */ }
}

/** demoSeconds: number = override every session to N seconds (testing); null = full length. */
export function ConsumerApp() {
  const { user } = useAuth()
  const [phase, setPhase] = useState<'onboarding' | 'app'>(() => (hasOnboarded(user?.id) ? 'app' : 'onboarding'))
  const [demoSeconds, setDemoSeconds] = useState<number | null>(60)
  const toggleDemo = () => setDemoSeconds((s) => (s === null ? 60 : null))

  function enterApp() {
    markOnboarded(user?.id)
    setPhase('app')
  }

  if (phase === 'app') {
    return <AppShell demoSeconds={demoSeconds} onDemoToggle={toggleDemo} />
  }
  return (
    <Onboarding
      demoSeconds={demoSeconds}
      onDemoToggle={toggleDemo}
      onComplete={enterApp}
      onSkip={enterApp}
    />
  )
}
