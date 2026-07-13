import { useState } from 'react'
import { Welcome } from '../screens/Welcome'
import { MicroIntake } from '../screens/MicroIntake'
import { StereoCheck } from '../screens/StereoCheck'
import { ImmersivePlayer } from '../screens/ImmersivePlayer'
import { PostSession } from '../screens/PostSession'
import { pickFirstProtocol, versionLengthSeconds } from '../data/protocols'
import { useI18n } from '../i18n'
import type { MicroIntakeResult, MoodCheck, Protocol } from '../types/domain'

type Step = 'welcome' | 'intake' | 'stereo' | 'player' | 'post'

interface ActiveSession {
  protocol: Protocol
  totalSeconds: number
  audioUrl?: string
  isPlaceholder: boolean
  vasPre: MoodCheck
}

const FIRST_SESSION_DURATION = 6 // the WOW session is always Quick

interface OnboardingProps {
  demoSeconds: number | null
  onDemoToggle: () => void
  onComplete: () => void
  onSkip: () => void
}

export function Onboarding({ demoSeconds, onDemoToggle, onComplete, onSkip }: OnboardingProps) {
  const { t } = useI18n()
  const [step, setStep] = useState<Step>('welcome')
  const [intake, setIntake] = useState<MicroIntakeResult | null>(null)
  const [session, setSession] = useState<ActiveSession | null>(null)

  function handleIntakeDone(result: MicroIntakeResult) {
    setIntake(result)
    setStep('stereo')
  }

  function startSession() {
    if (!intake) return
    const protocol = pickFirstProtocol(intake.intent)
    const version = protocol.versions.find((v) => v.duration === FIRST_SESSION_DURATION)
    const audioUrl = version?.audioUrl?.['pt-BR']
    const fullLength = versionLengthSeconds(protocol, FIRST_SESSION_DURATION)
    setSession({
      protocol,
      totalSeconds: demoSeconds ?? fullLength,
      audioUrl,
      isPlaceholder: !audioUrl,
      vasPre: intake.mood,
    })
    setStep('player')
  }

  const showDevBar = step === 'welcome' || step === 'stereo'

  function renderStep() {
    switch (step) {
      case 'welcome':
        return <Welcome onContinue={() => setStep('intake')} />
      case 'intake':
        return <MicroIntake onDone={handleIntakeDone} />
      case 'stereo':
        return <StereoCheck onContinue={startSession} />
      case 'player':
        return session ? (
          <ImmersivePlayer
            protocol={session.protocol}
            totalSeconds={session.totalSeconds}
            audioUrl={session.audioUrl}
            isPlaceholderNote={session.isPlaceholder}
            onComplete={() => setStep('post')}
          />
        ) : null
      case 'post':
        return session ? (
          <PostSession vasPre={session.vasPre} onFinish={() => onComplete()} doneLabel="Continue to app" />
        ) : null
    }
  }

  return (
    <div className="app-frame">
      {showDevBar && (
        <div className="dev-bar">
          <button className="dev-toggle" onClick={onDemoToggle}>
            {demoSeconds === null ? t('full · 6 min') : t('demo · 1 min')}
          </button>
          <button className="dev-toggle" onClick={onSkip}>{t('skip →')}</button>
        </div>
      )}
      {renderStep()}
    </div>
  )
}
