import { useState } from 'react'
import {
  JOURNEY_TOTAL_WEEKS,
  JOURNEY_SESSIONS_PER_WEEK,
} from '../data/seed'
import { getProtocol } from '../data/protocols'
import { useI18n, type I18n } from '../i18n'
import { vasDelta } from '../types/domain'
import type { SessionRecord } from '../types/domain'

interface ProgressProps {
  history: SessionRecord[]
}

function relDate(ts: number, t: I18n['t']): string {
  const days = Math.round((Date.now() - ts) / 86_400_000)
  if (days <= 0) return t('Today')
  if (days === 1) return t('Yesterday')
  if (days < 7) return t('{n} days ago', { n: days })
  const weeks = Math.round(days / 7)
  return weeks === 1 ? t('1 week ago') : t('{n} weeks ago', { n: weeks })
}

/** Tiny sparkline of post-session mood across recent sessions. */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const w = 300
  const h = 64
  const pad = 6
  const max = 10
  const step = (w - pad * 2) / (values.length - 1)
  const pts = values.map((v, i) => {
    const x = pad + i * step
    const y = pad + (1 - v / max) * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="spark" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts.join(' ')} fill="none" stroke="var(--aura)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => {
        const [x, y] = p.split(',')
        return <circle key={i} cx={x} cy={y} r={i === pts.length - 1 ? 4 : 2.5} fill="var(--aura)" />
      })}
    </svg>
  )
}

export function Progress({ history }: ProgressProps) {
  const { t } = useI18n()
  const [toast, setToast] = useState<string | null>(null)

  const recent = history.slice(-8)
  const postValues = recent.map((r) => r.vasPost?.vas ?? r.vasPre?.vas ?? 0)
  const deltas = history.map((r) => vasDelta(r)).filter((d): d is number => d != null)
  const avgGain = deltas.length ? (deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(1) : '—'

  const monthStart = Date.now() - 30 * 86_400_000
  const thisMonth = history.filter((r) => r.startedAt >= monthStart).length

  // journey position derives from the user's REAL history: weeks since their
  // first session (0 when they're just starting), capped to the program length
  const firstAt = history.length ? Math.min(...history.map((r) => r.startedAt)) : null
  const weeksDone = firstAt == null ? 0
    : Math.min(JOURNEY_TOTAL_WEEKS - 1, Math.floor((Date.now() - firstAt) / (7 * 86_400_000)))

  function flash(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 1800)
  }

  return (
    <div className="screen progress">
      <h1 className="display" style={{ marginBottom: 4 }}>{t('Your progress')}</h1>
      <p className="muted small" style={{ marginBottom: 22 }}>{t("A quiet record of how far you've come.")}</p>

      {/* 3-month journey */}
      <section className="card">
        <div className="card__head">
          <h2 className="card__title">{t('3-month journey')}</h2>
          <span className="muted small">{t('Week {n} of {total}', { n: weeksDone + 1, total: JOURNEY_TOTAL_WEEKS })}</span>
        </div>
        <div className="journey">
          {Array.from({ length: JOURNEY_TOTAL_WEEKS }, (_, i) => {
            const state = i < weeksDone ? 'done' : i === weeksDone ? 'now' : 'todo'
            return <span key={i} className={`journey__wk journey__wk--${state}`}>{i + 1}</span>
          })}
        </div>
        <p className="muted small" style={{ marginTop: 12 }}>
          {t('Building your practice — {n} sessions a week keeps you on track.', { n: JOURNEY_SESSIONS_PER_WEEK })}
        </p>
      </section>

      {/* mood trend */}
      <section className="card">
        <div className="card__head">
          <h2 className="card__title">{t('Mood trend')}</h2>
          <span className="muted small">{t('last {n} sessions', { n: recent.length })}</span>
        </div>
        <Sparkline values={postValues} />
      </section>

      {/* stats */}
      <div className="stat-row">
        <div className="stat">
          <span className="stat__num">{history.length}</span>
          <span className="stat__label">{t('sessions')}</span>
        </div>
        <div className="stat">
          <span className="stat__num">{thisMonth}</span>
          <span className="stat__label">{t('this month')}</span>
        </div>
        <div className="stat">
          <span className="stat__num">{avgGain === '—' ? '—' : `+${avgGain}`}</span>
          <span className="stat__label">{t('avg relaxation')}</span>
        </div>
      </div>

      {/* history */}
      <section className="card">
        <h2 className="card__title" style={{ marginBottom: 12 }}>{t('Recent sessions')}</h2>
        <ul className="history">
          {[...history].reverse().slice(0, 6).map((r) => {
            const p = getProtocol(r.protocolCode)
            const d = vasDelta(r)
            return (
              <li key={r.id} className="history__item">
                <div>
                  <div className="history__title">{p?.title ?? r.protocolCode}</div>
                  <div className="muted small">{relDate(r.startedAt, t)} · {r.duration} {t('min')}</div>
                </div>
                {d != null && <span className={`history__delta${d >= 0 ? '' : ' is-neg'}`}>{d >= 0 ? '+' : ''}{d.toFixed(1)}</span>}
              </li>
            )
          })}
        </ul>
      </section>

      <button className="btn btn--ghost" onClick={() => flash(t('Export started'))}>
        {t('Export my data (PDF)')}
      </button>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
