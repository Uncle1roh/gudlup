import { useState } from 'react'
import { EmojiScale } from '../components/EmojiScale'
import { makeMoodCheck } from '../lib/vas'
import { useI18n } from '../i18n'
import type { Intent, Duration, MicroIntakeResult } from '../types/domain'

interface MicroIntakeProps {
  onDone: (result: MicroIntakeResult) => void
}

const INTENTS: { id: Intent; icon: string; label: string }[] = [
  { id: 'calm', icon: '🌊', label: 'Calm' },
  { id: 'energy', icon: '⚡', label: 'Energy' },
  { id: 'focus', icon: '🎯', label: 'Focus' },
  { id: 'sleep', icon: '🌙', label: 'Sleep' },
]

const DURATIONS: Duration[] = [6, 12, 24]

/** UC-B2C-02: capture preference + baseline VAS without feeling clinical. */
export function MicroIntake({ onDone }: MicroIntakeProps) {
  const [step, setStep] = useState(0)
  const [emoji, setEmoji] = useState<number | null>(null)
  const [intent, setIntent] = useState<Intent | null>(null)
  const [duration, setDuration] = useState<Duration>(12)
  const [consent, setConsent] = useState(false)
  const { t } = useI18n()

  function pickMood(v: number) {
    setEmoji(v)
    setTimeout(() => setStep(1), 220)
  }
  function pickIntent(v: Intent) {
    setIntent(v)
    setTimeout(() => setStep(2), 220)
  }
  function finish() {
    if (emoji == null || intent == null || !consent) return
    onDone({
      mood: makeMoodCheck(emoji),
      intent,
      preferredDuration: duration,
      consentAt: Date.now(),
    })
  }

  return (
    <div className="screen">
      <div className="progress-dots" style={{ marginBottom: 30 }}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={i <= step ? 'is-on' : ''} />
        ))}
      </div>

      <div className="screen__body" style={{ justifyContent: 'flex-start' }}>
        {step === 0 && (
          <div className="fade-in stack-lg">
            <div>
              <div className="field-label">{t('How are you feeling right now?')}</div>
              <div className="field-sub">{t('Tap the face that fits.')}</div>
            </div>
            <EmojiScale value={emoji} onChange={pickMood} />
          </div>
        )}

        {step === 1 && (
          <div className="fade-in stack-lg">
            <div>
              <div className="field-label">{t('What are you looking for?')}</div>
              <div className="field-sub">{t("We'll tune the session to it.")}</div>
            </div>
            <div className="chip-grid">
              {INTENTS.map((it) => (
                <button
                  key={it.id}
                  className="chip"
                  aria-pressed={intent === it.id}
                  onClick={() => pickIntent(it.id)}
                >
                  <span className="chip__icon">{it.icon}</span>
                  <span className="chip__label">{t(it.label)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="fade-in stack-lg">
            <div>
              <div className="field-label">{t('How much time do you have?')}</div>
              <div className="field-sub">{t('Your first session is a 6-minute taster — you can choose longer ones later.')}</div>
            </div>
            <div className="chip-row">
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  className="chip"
                  aria-pressed={duration === d}
                  onClick={() => setDuration(d)}
                >
                  <span className="chip__label">{d}</span>
                  <span className="chip__hint">{t('min')}</span>
                </button>
              ))}
            </div>

            <div className="consent">
              <input
                id="consent"
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <label htmlFor="consent">
                {t('I agree to how my data is handled.')} <a href="#privacy" onClick={(e) => e.preventDefault()}>{t('Read the privacy terms')}</a>.
              </label>
            </div>
          </div>
        )}
      </div>

      {step === 2 && (
        <div className="screen__footer">
          <button className="btn btn--primary" disabled={!consent} onClick={finish}>
            {t('Start my first session')}
          </button>
        </div>
      )}
    </div>
  )
}
