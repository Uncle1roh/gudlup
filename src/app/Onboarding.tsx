import { useState } from 'react'
import { Welcome } from '../screens/Welcome'
import { SessionWizard } from '../screens/SessionWizard'
import { StereoCheck } from '../screens/StereoCheck'
import { ImmersivePlayer } from '../screens/ImmersivePlayer'
import { PostSession } from '../screens/PostSession'
import { getProtocol, versionLengthSeconds } from '../data/protocols'
import { useI18n } from '../i18n'
import type { WizardResult } from '../data/wizard'
import type { MoodCheck, Protocol } from '../types/domain'

type Step = 'welcome' | 'consent' | 'wizard' | 'stereo' | 'player' | 'post'

interface ActiveSession {
  protocol: Protocol
  totalSeconds: number
  audioUrl?: string
  isPlaceholder: boolean
  vasPre: MoodCheck
}

/** The wizard's 1–10 intensity doubles as the hidden pre-session VAS
    (RN-UX-04: derived, never shown as a clinical number). High intensity =
    low mood face. Maintenance (no scale) reads as feeling well. */
function moodFromIntensity(intensity: number | null): MoodCheck {
  const vas = intensity ?? 2
  const emoji = Math.max(1, Math.min(5, Math.round(5.5 - vas / 2)))
  return { emoji, vas, at: Date.now() }
}

interface OnboardingProps {
  demoSeconds: number | null
  onDemoToggle: () => void
  onComplete: () => void
  onSkip: () => void
}

export function Onboarding({ demoSeconds, onDemoToggle, onComplete, onSkip }: OnboardingProps) {
  const { t } = useI18n()
  const [step, setStep] = useState<Step>('welcome')
  const [consent, setConsent] = useState(false)
  const [wizardResult, setWizardResult] = useState<WizardResult | null>(null)
  const [session, setSession] = useState<ActiveSession | null>(null)

  function handleWizardDone(r: WizardResult) {
    setWizardResult(r)
    // remember the ALTERNATIVE for the "didn't resonate?" card on the home
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
    setStep('stereo')
  }

  function startSession() {
    if (!wizardResult) return
    const protocol = getProtocol(wizardResult.protocolCode) ?? getProtocol('GL-ANX 1.1')!
    const version = protocol.versions.find((v) => v.duration === wizardResult.duration)
    const audioUrl = version?.audioUrl?.['pt-BR']
    const fullLength = versionLengthSeconds(protocol, wizardResult.duration)
    setSession({
      protocol,
      totalSeconds: demoSeconds ?? fullLength,
      audioUrl,
      isPlaceholder: !audioUrl,
      vasPre: moodFromIntensity(wizardResult.intensity),
    })
    setStep('player')
  }

  const showDevBar = step === 'welcome' || step === 'consent' || step === 'stereo'

  function renderStep() {
    switch (step) {
      case 'welcome':
        return <Welcome onContinue={() => setStep('consent')} />
      case 'consent':
        // LGPD consent (RN-LGPD-02) — kept as its own explicit moment before
        // any personal question is asked
        return (
          <div className="screen wizard">
            <div className="wizard__body" style={{ marginTop: 40 }}>
              <h1 className="wizard__q">{t('Before we start')}</h1>
              <div className="consent">
                <input id="consent" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <label htmlFor="consent">
                  {t('I agree to how my data is handled.')} <a href="#privacy" onClick={(e) => e.preventDefault()}>{t('Read the privacy terms')}</a>.
                </label>
              </div>
              <button className="btn btn--primary" disabled={!consent} onClick={() => setStep('wizard')}>{t('Continue')}</button>
            </div>
          </div>
        )
      case 'wizard':
        return <SessionWizard onDone={handleWizardDone} onCancel={() => setStep('consent')} />
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
            {demoSeconds === null ? t('full session') : t('demo · 1 min')}
          </button>
          <button className="dev-toggle" onClick={onSkip}>{t('skip →')}</button>
        </div>
      )}
      {renderStep()}
    </div>
  )
}
