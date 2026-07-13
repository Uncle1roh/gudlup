import { useState } from 'react'
import { getProtocol } from '../data/protocols'
import { useI18n } from '../i18n'
import type { Duration } from '../types/domain'

interface ExploreProps {
  onStart: (launch: { protocolCode: string; duration: Duration }) => void
}

type Feel = 'anxiety' | 'stress' | 'low-energy' | 'insomnia'

const FEELINGS: { id: Feel; icon: string; label: string; code: string }[] = [
  { id: 'anxiety', icon: '🌊', label: 'Anxious', code: 'GL-ANX 1.1' },
  { id: 'stress', icon: '🎯', label: 'Stressed', code: 'GL-STRESS 4.1' },
  { id: 'low-energy', icon: '⚡', label: 'Low energy', code: 'GL-DEP 2.4' },
  { id: 'insomnia', icon: '🌙', label: "Can't sleep", code: 'GL-ANX 1.1' },
]

const DURATIONS: Duration[] = [6, 12, 24]

/** B9 "Explore": guided filters, not a catalog. Max 2 taps to a session. */
export function Explore({ onStart }: ExploreProps) {
  const [feel, setFeel] = useState<Feel | null>(null)
  const [duration, setDuration] = useState<Duration>(12)
  const { t } = useI18n()

  const match = feel ? FEELINGS.find((f) => f.id === feel) : null
  const protocol = match ? getProtocol(match.code) : null

  return (
    <div className="screen explore">
      <h1 className="display" style={{ marginBottom: 4 }}>{t('Explore')}</h1>
      <p className="muted small" style={{ marginBottom: 22 }}>{t('Find a session in two taps.')}</p>

      <div className="field-label" style={{ fontSize: 16 }}>{t('How do you feel?')}</div>
      <div className="chip-grid" style={{ marginTop: 12 }}>
        {FEELINGS.map((f) => (
          <button key={f.id} className="chip" aria-pressed={feel === f.id} onClick={() => setFeel(f.id)}>
            <span className="chip__icon">{f.icon}</span>
            <span className="chip__label">{t(f.label)}</span>
          </button>
        ))}
      </div>

      <div className="field-label" style={{ fontSize: 16, marginTop: 26 }}>{t('How long?')}</div>
      <div className="chip-row" style={{ marginTop: 12 }}>
        {DURATIONS.map((d) => (
          <button key={d} className="chip" aria-pressed={duration === d} onClick={() => setDuration(d)}>
            <span className="chip__label">{d}</span>
            <span className="chip__hint">{t('min')}</span>
          </button>
        ))}
      </div>

      {protocol && (
        <div className="explore-result fade-in">
          <div>
            <div className="rec-card__eyebrow">{t('Suggested')}</div>
            <div className="history__title" style={{ fontSize: 18 }}>{protocol.title}</div>
            <div className="muted small">{protocol.blurb}</div>
          </div>
          <button className="btn btn--primary" style={{ marginTop: 14 }} onClick={() => onStart({ protocolCode: protocol.code, duration })}>
            {t('Start · {n} min', { n: duration })}
          </button>
        </div>
      )}
    </div>
  )
}
