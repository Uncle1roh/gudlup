import { useState } from 'react'
import { playEarTone } from '../lib/audio'
import { useI18n } from '../i18n'

interface StereoCheckProps {
  onContinue: () => void
}

/**
 * UC-B2C-07: confirm stereo before the first session. On B2C this is friendly
 * and non-blocking — mono still continues, with a recommendation (RN-AUDIO-02).
 */
export function StereoCheck({ onContinue }: StereoCheckProps) {
  const [warn, setWarn] = useState(false)
  const { t } = useI18n()

  return (
    <div className="screen screen--center">
      <div className="screen__body" style={{ justifyContent: 'center', gap: 26, maxWidth: 340 }}>
        <div className="stack-md">
          <span className="eyebrow">{t('Headphones')}</span>
          <h2 className="display">{t('Put on your headphones')}</h2>
          <p className="lead">
            {t('Good Loop uses sound that moves between your ears. Tap each side to check it reaches the right one.')}
          </p>
        </div>

        <div className="chip-row" style={{ width: '100%' }}>
          <button className="chip" onClick={() => playEarTone('left')}>
            <span className="chip__icon">◀</span>
            <span className="chip__label">{t('Left ear')}</span>
          </button>
          <button className="chip" onClick={() => playEarTone('right')}>
            <span className="chip__icon">▶</span>
            <span className="chip__label">{t('Right ear')}</span>
          </button>
        </div>

        {warn && (
          <p className="small muted fade-in">
            {t('For the full effect, wired headphones work best. You can continue either way.')}
          </p>
        )}
      </div>

      <div className="screen__footer btn-stack">
        <button className="btn btn--primary" onClick={onContinue}>
          {t('Sounds right — continue')}
        </button>
        <button
          className="btn btn--quiet"
          style={{ alignSelf: 'center' }}
          onClick={() => (warn ? onContinue() : setWarn(true))}
        >
          {t('I only hear one side')}
        </button>
      </div>
    </div>
  )
}
