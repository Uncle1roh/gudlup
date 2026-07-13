import { useState } from 'react'
import { BreathingOrb } from '../components/BreathingOrb'
import { useDataProvider } from '../data/provider'
import { useMySessionRequest } from '../data/hooks'
import { greeting, lastSession, todayRecommendation } from '../data/seed'
import { getProtocol } from '../data/protocols'
import { useI18n } from '../i18n'
import type { SessionRecord, Duration } from '../types/domain'

interface HomeSessionProps {
  history: SessionRecord[]
  onStart: (launch: { protocolCode: string; duration: Duration }) => void
  onExplore: () => void
  onCompose: () => void
  onAssess: () => void
}

/** B9: one large CTA, one recommendation card, no catalog scrolling. */
export function HomeSession({ history, onStart, onExplore, onCompose, onAssess }: HomeSessionProps) {
  const { t } = useI18n()
  const dp = useDataProvider()
  const { data: myRequest, refetch: refetchRequest } = useMySessionRequest()
  const [requesting, setRequesting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  async function requestTherapist() {
    if (myRequest || requesting) return
    setRequesting(true)
    try {
      await dp.requestSession()
      refetchRequest()
      setToast(t('Request sent'))
      setTimeout(() => setToast(null), 2200)
    } catch (e) {
      setToast((e as Error).message)
      setTimeout(() => setToast(null), 6000)
    } finally {
      setRequesting(false)
    }
  }
  const last = lastSession(history)
  const lastProtocol = getProtocol(last.protocolCode)
  const rec = todayRecommendation()
  const recProtocol = getProtocol(rec.code)

  return (
    <div className="screen home">
      <header className="home__greet">
        <div>
          <p className="muted small">{t(greeting())}</p>
          <h1 className="display">{t('Ready when you are.')}</h1>
        </div>
        <BreathingOrb size={64} rings={false} />
      </header>

      <button className="start-cta" onClick={() => onStart(last)}>
        <span className="start-cta__label">{t('Start session')}</span>
        <span className="start-cta__sub">
          {lastProtocol ? t('Same as last time · {title} · {min} min', { title: lastProtocol.title, min: last.duration }) : t('Begin')}
        </span>
      </button>

      {recProtocol && (
        <button className="rec-card" onClick={() => onStart({ protocolCode: rec.code, duration: 6 })}>
          <span className="rec-card__eyebrow">{t('For you today')}</span>
          <span className="rec-card__title">{recProtocol.title}</span>
          <span className="rec-card__reason">{t(rec.reason)} · 6 {t('min')}</span>
        </button>
      )}

      <button className="compose-card" onClick={onCompose}>
        <span className="compose-card__icon">♪</span>
        <span className="compose-card__text">
          <strong>{t('Compose your own')}</strong>
          <span>{t('Pick a focus, soundscape & voice')}</span>
        </span>
        <span className="compose-card__arrow">→</span>
      </button>

      <button className="assess-card" onClick={requestTherapist} disabled={!!myRequest || requesting} style={myRequest ? { opacity: 0.75 } : undefined}>
        <span className="assess-card__icon">🩺</span>
        <span className="assess-card__text">
          <strong>{myRequest
            ? (myRequest.status === 'claimed'
              ? t('A therapist accepted your request')
              : t('Request sent — waiting for a therapist'))
            : t('Talk to a therapist')}</strong>
          <span>{myRequest
            ? (myRequest.status === 'claimed'
              ? t('They will schedule the session with you.')
              : t("You'll be contacted to schedule."))
            : t('Request a session — a clinician will pick it up.')}</span>
        </span>
        {!myRequest && <span className="assess-card__arrow">→</span>}
      </button>

      <button className="assess-card" onClick={onAssess}>
        <span className="assess-card__icon">🗒️</span>
        <span className="assess-card__text">
          <strong>{t('Your quarterly check-in is ready')}</strong>
          <span>{t('2 min · anonymous · helps your workplace improve')}</span>
        </span>
        <span className="assess-card__arrow">→</span>
      </button>

      <button className="btn btn--quiet" style={{ alignSelf: 'center', marginTop: 'auto' }} onClick={onExplore}>
        {t('Explore other sessions')}
      </button>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
