import { useState } from 'react'
import { BreathingOrb } from '../components/BreathingOrb'
import { MoodScale } from '../components/MoodScale'
import { makeMoodFromVas } from '../lib/vas'
import { useI18n } from '../i18n'
import type { MoodCheck } from '../types/domain'

interface PostSessionProps {
  vasPre: MoodCheck
  onFinish: (post: MoodCheck | null) => void
  doneLabel?: string
}

/**
 * UC-B2C-10: gratify without breaking the relaxation state. One metric (VAS
 * delta), at most two CTAs, no dashboard here. The post-mood is collected with
 * the same disguised emoji scale.
 */
export function PostSession({ vasPre, onFinish, doneLabel = 'Done' }: PostSessionProps) {
  const { t } = useI18n()
  const [postVas, setPostVas] = useState<number | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  function reveal(v: number) {
    setPostVas(v)
    setTimeout(() => setRevealed(true), 260)
  }

  const post: MoodCheck | null = postVas != null ? makeMoodFromVas(postVas) : null
  const delta = post ? Number((post.vas - vasPre.vas).toFixed(1)) : 0
  const sign = delta >= 0 ? '+' : ''

  function flash(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 1800)
  }

  if (!revealed) {
    return (
      <div className="screen screen--center">
        <div className="screen__body" style={{ justifyContent: 'center', gap: 30, maxWidth: 320 }}>
          <h2 className="display">{t('Well done.')}</h2>
          <p className="lead">{t('How do you feel now, compared to before?')}</p>
          <MoodScale value={postVas} onChange={reveal} reference={vasPre.vas} referenceLabel="before" />
          <p className="muted small">{t('Your answer before the session was {v}.', { v: Math.round(vasPre.vas) })}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="screen screen--center">
      <div className="screen__body" style={{ justifyContent: 'center', gap: 28 }}>
        <div className="fade-in">
          <BreathingOrb size={150} breathing={false} />
        </div>
        <div className="metric fade-in delay-1">
          <div className="metric__value">{sign}{Math.abs(Math.round(delta))}</div>
          <div className="metric__label">
            {Math.round(vasPre.vas)} → {post ? Math.round(post.vas) : '—'} · {delta >= 0 ? t('better than before') : t('change noted')}
          </div>
        </div>
      </div>

      <div className="screen__footer btn-stack fade-in delay-2">
        <button className="btn btn--primary" onClick={() => flash(t('Reminder set'))}>
          {t('Schedule next session')}
        </button>
        <button className="btn btn--ghost" onClick={() => flash(t('Note saved'))}>
          {t('Save a note')}
        </button>
        <button className="btn btn--quiet" style={{ alignSelf: 'center' }} onClick={() => onFinish(post)}>
          {t(doneLabel)}
        </button>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
