/* ============================================================================
   Progress › Conquistas — SPEC §3.4

   Individual and collective, side by side as two chips; the one locked
   achievement the person is closest to, with how far along they are in
   time or sessions (never points — PLAN A6); and the badge grid, unlocked
   in their tier colours, locked greyed.

   Nothing here counts down, nothing can be lost, and nothing is ranked
   against anyone (GAM-R1). The collective side carries the city card and
   the rankings (Coletivas.tsx).
   ============================================================================ */

import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { useDataProvider } from '../data/provider'
import { Badge } from '../gamification/ui/Badge'
import { copyFor, progressKey } from '../gamification/copy'
import { fmtMinutes, nextAchievement, type AchievementView } from '../gamification/achievements'
import { displayLoops } from '../gamification/economy'
import { Coletivas } from './Coletivas'

const GRID_PREVIEW = 9

export function Conquistas() {
  const { t } = useI18n()
  const dp = useDataProvider()
  const [list, setList] = useState<AchievementView[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [kind, setKind] = useState<'individual' | 'collective'>('individual')
  const [all, setAll] = useState(false)

  useEffect(() => {
    let alive = true
    dp.listMyAchievements()
      .then((rows) => { if (alive) setList(rows) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [dp])

  if (failed) return <p className="small muted">{t('Your achievements could not be loaded right now.')}</p>
  if (!list) return <p className="small muted" aria-busy="true">{t('Loading…')}</p>

  const individual = list.filter((a) => a.kind === 'individual')
  const collective = list.filter((a) => a.kind === 'collective')
  const shown = kind === 'individual' ? individual : collective
  const unlockedCount = (xs: AchievementView[]) => xs.filter((a) => a.unlockedAt !== null).length
  const next = kind === 'individual' ? nextAchievement(list) : null
  const grid = all ? shown : shown.slice(0, GRID_PREVIEW)

  return (
    <div className="gam-conquistas">
      <div className="chip-row chip-row--start gam-chips" role="group" aria-label={t('Achievements')}>
        <button className="chip" aria-pressed={kind === 'individual'} onClick={() => { setKind('individual'); setAll(false) }}>
          {t('Individual · {n} of {total}', { n: String(unlockedCount(individual)), total: String(individual.length) })}
        </button>
        <button className="chip" aria-pressed={kind === 'collective'} onClick={() => { setKind('collective'); setAll(false) }}>
          {t('Collective · {n} of {total}', { n: String(unlockedCount(collective)), total: String(collective.length) })}
        </button>
      </div>

      {next && <NextCard a={next} />}

      {kind === 'collective' && (
        <>
          <p className="small muted">
            {t('Collective achievements happen when a city, a state, the whole country or your whole company take care of themselves together.')}
          </p>
          <Coletivas />
        </>
      )}

      <ul className="gam-grid">
        {grid.map((a) => {
          const locked = a.unlockedAt === null
          return (
            <li key={a.id} className={`gam-cell${locked ? ' gam-cell--locked' : ''}`}>
              <Badge icon={a.icon} tier={a.tier} shape={a.kind === 'individual' ? 'circle' : 'hexagon'} size={72} locked={locked} />
              <span className="gam-cell__name">{t(copyFor(a.slug).name)}</span>
              {locked && <span className="gam-cell__state">{t('Locked')}</span>}
            </li>
          )
        })}
      </ul>

      {shown.length > GRID_PREVIEW && (
        <button className="btn btn--quiet" onClick={() => setAll((x) => !x)}>
          {all ? t('Show fewer') : t('See all {n} achievements', { n: String(shown.length) })}
        </button>
      )}
    </div>
  )
}

/** "3h 40min of 5h · 80 min to go" — the closest locked achievement. */
function NextCard({ a }: { a: AchievementView }) {
  const { t } = useI18n()
  const value = a.value ?? 0
  const share = Math.max(0, Math.min(1, value / a.threshold))
  const keys = progressKey(a.metric)
  const isTime = a.metric === 'minutes_listened'
  const fmt = (n: number) => (isTime ? fmtMinutes(n) : String(n))
  const left = Math.max(0, a.threshold - value)
  return (
    <section className="card gam-next">
      <p className="eyebrow">{t('Next achievement')}</p>
      <div className="gam-next__row">
        <Badge icon={a.icon} tier={a.tier} shape="circle" size={64} locked />
        <div className="gam-next__body">
          <h3 className="gam-next__name">{t(copyFor(a.slug).name)}</h3>
          <p className="small muted">{t(copyFor(a.slug).rule)}</p>
        </div>
      </div>
      <div className="gam-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
        <span style={{ width: `${share * 100}%` }} />
      </div>
      <p className="small">
        {t(keys.of, { value: fmt(value), goal: fmt(a.threshold) })}
        {left > 0 && ` · ${t(keys.left, { left: fmt(left) })}`}
        {a.bonusLoopsCenti > 0 && ` · ${t('+{n} Loops bonus', { n: String(displayLoops(a.bonusLoopsCenti)) })}`}
      </p>
    </section>
  )
}
