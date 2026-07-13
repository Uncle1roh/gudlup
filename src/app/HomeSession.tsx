import { BreathingOrb } from '../components/BreathingOrb'
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
    </div>
  )
}
