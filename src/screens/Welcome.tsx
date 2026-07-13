import { BreathingOrb } from '../components/BreathingOrb'
import { useI18n } from '../i18n'

interface WelcomeProps {
  onContinue: () => void
}

/** UC-B2C-01: minimal-friction entry. Auth is mocked for Module 1. */
export function Welcome({ onContinue }: WelcomeProps) {
  const { t } = useI18n()
  return (
    <div className="screen screen--center">
      <div className="screen__body" style={{ justifyContent: 'center', gap: 28 }}>
        <div className="brand">
          <BreathingOrb size={160} />
          <span className="wordmark">GOOD LOOP</span>
        </div>
        <div className="stack-md" style={{ maxWidth: 320 }}>
          <h1 className="display">{t('Where transformation becomes listening.')}</h1>
          <p className="lead">{t('A few minutes of guided sound to help your nervous system settle.')}</p>
        </div>
      </div>

      <div className="screen__footer btn-stack">
        <button className="btn btn--primary" onClick={onContinue}>{t('Continue with Apple')}</button>
        <button className="btn btn--ghost" onClick={onContinue}>{t('Continue with Google')}</button>
        <button className="btn btn--quiet" style={{ alignSelf: 'center' }} onClick={onContinue}>
          {t('Use email instead')}
        </button>
      </div>
    </div>
  )
}
