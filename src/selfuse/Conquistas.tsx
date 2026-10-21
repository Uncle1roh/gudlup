/* ============================================================================
   Progress › Conquistas — SPEC §3.4

   Individual and collective, side by side as two chips; the one locked
   achievement the person is closest to; and the badge grid, unlocked in
   their tier colours, locked greyed. Every badge opens its detail: what it
   asks, where the person stands (time or sessions — never points, PLAN A6),
   and for a collective one, the person's own part and how far their city,
   state, region, country or company is toward it.

   Nothing here counts down, nothing can be lost, and nothing is ranked
   against anyone (GAM-R1). The rankings themselves live in their own tab.
   ============================================================================ */

import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { useDataProvider } from '../data/provider'
import { Badge } from '../gamification/ui/Badge'
import { GamDialog } from '../gamification/ui/Dialog'
import { copyFor, progressKey, TIER_LABEL } from '../gamification/copy'
import { fmtMinutes, nextAchievement, type AchievementView, type CollectiveProgress } from '../gamification/achievements'
import { displayLoops } from '../gamification/economy'
import { REGION_NAMES, UF_NAMES } from '../gamification/geo'

const GRID_PREVIEW = 9

export function Conquistas({ onGoRankings }: { onGoRankings: () => void }) {
  const { t } = useI18n()
  const dp = useDataProvider()
  const [list, setList] = useState<AchievementView[] | null>(null)
  const [collective, setCollective] = useState<CollectiveProgress[]>([])
  const [failed, setFailed] = useState(false)
  const [kind, setKind] = useState<'individual' | 'collective'>('individual')
  const [all, setAll] = useState(false)
  const [open, setOpen] = useState<AchievementView | null>(null)

  useEffect(() => {
    let alive = true
    dp.listMyAchievements()
      .then((rows) => { if (alive) setList(rows) })
      .catch(() => { if (alive) setFailed(true) })
    dp.getMyCollectiveProgress()
      .then((rows) => { if (alive) setCollective(rows) })
      .catch(() => { /* the detail then shows no part */ })
    return () => { alive = false }
  }, [dp])

  if (failed) return <p className="small muted">{t('Your achievements could not be loaded right now.')}</p>
  if (!list) return <p className="small muted" aria-busy="true">{t('Loading…')}</p>

  const individual = list.filter((a) => a.kind === 'individual')
  const coll = list.filter((a) => a.kind === 'collective')
  const shown = kind === 'individual' ? individual : coll
  const unlockedCount = (xs: AchievementView[]) => xs.filter((a) => a.unlockedAt !== null).length
  const next = kind === 'individual' ? nextAchievement(list) : null
  const grid = all ? shown : shown.slice(0, GRID_PREVIEW)
  const takingPart = collective.some((c) => c.unit !== 'company' && c.canTakePart)

  return (
    <div className="gam-stack">
      <div className="chip-row chip-row--start gam-chips" role="group" aria-label={t('Achievements')}>
        <button className="chip" aria-pressed={kind === 'individual'} onClick={() => { setKind('individual'); setAll(false) }}>
          {t('Individual · {n} of {total}', { n: String(unlockedCount(individual)), total: String(individual.length) })}
        </button>
        <button className="chip" aria-pressed={kind === 'collective'} onClick={() => { setKind('collective'); setAll(false) }}>
          {t('Collective · {n} of {total}', { n: String(unlockedCount(coll)), total: String(coll.length) })}
        </button>
      </div>

      {next && (
        <button className="card gam-next" onClick={() => setOpen(next)}>
          <span className="eyebrow">{t('Next achievement')}</span>
          <span className="gam-next__row">
            <Badge icon={next.icon} tier={next.tier} shape="circle" size={64} locked />
            <span className="gam-next__body">
              <span className="gam-next__name">{t(copyFor(next.slug).name)}</span>
              <span className="small muted">{t(copyFor(next.slug).rule)}</span>
            </span>
          </span>
          <ProgressLine a={next} />
        </button>
      )}

      {kind === 'collective' && (
        <section className="card gam-note">
          <p className="small">{t('Collective achievements happen when a city, a state, the whole country or your whole company take care of themselves together.')}</p>
          {!takingPart && (
            <>
              <p className="small muted">{t('To count toward your city, state and region, take part in the rankings.')}</p>
              <button className="btn btn--ghost gam-inline-btn" onClick={onGoRankings}>{t('Go to Rankings')}</button>
            </>
          )}
        </section>
      )}

      <ul className="gam-grid">
        {grid.map((a) => {
          const locked = a.unlockedAt === null
          return (
            <li key={a.id}>
              <button className={`gam-cell${locked ? ' gam-cell--locked' : ''}`} onClick={() => setOpen(a)} aria-haspopup="dialog">
                <Badge icon={a.icon} tier={a.tier} shape={a.kind === 'individual' ? 'circle' : 'hexagon'} size={72} locked={locked} />
                <span className="gam-cell__name">{t(copyFor(a.slug).name)}</span>
                <span className="gam-cell__state">{locked ? t('Locked') : t('Unlocked')}</span>
              </button>
            </li>
          )
        })}
      </ul>

      {shown.length > GRID_PREVIEW && (
        <button className="btn btn--quiet" onClick={() => setAll((x) => !x)}>
          {all ? t('Show fewer') : t('See all {n} achievements', { n: String(shown.length) })}
        </button>
      )}

      {open && <AchievementSheet a={open} part={collective.find((c) => c.slug === open.slug) ?? null} onClose={() => setOpen(null)} onGoRankings={() => { setOpen(null); onGoRankings() }} />}
    </div>
  )
}

/** "3h 40min of 5h · 80 min to go" — an individual achievement's progress. */
function ProgressLine({ a }: { a: AchievementView }) {
  const { t } = useI18n()
  const value = a.value ?? 0
  const share = Math.max(0, Math.min(1, value / a.threshold))
  const keys = progressKey(a.metric)
  const isTime = a.metric === 'minutes_listened'
  const fmt = (n: number) => (isTime ? fmtMinutes(n) : String(n))
  const left = Math.max(0, a.threshold - value)
  return (
    <span className="gam-progress">
      <span className="gam-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
        <span style={{ width: `${share * 100}%` }} />
      </span>
      <span className="small">
        {t(keys.of, { value: fmt(Math.min(value, a.threshold)), goal: fmt(a.threshold) })}
        {left > 0 && ` · ${t(keys.left, { left: fmt(left) })}`}
      </span>
    </span>
  )
}

function unitLabel(t: ReturnType<typeof useI18n>['t'], p: CollectiveProgress): string {
  if (p.unit === 'city') return p.unitName ? t('Your city: {name}', { name: p.unitName }) : t('Your city')
  if (p.unit === 'state') return t('Your state: {name}', { name: UF_NAMES[p.unitRef ?? ''] ?? p.unitRef ?? '—' })
  if (p.unit === 'region') return t('Your region: {name}', { name: t(REGION_NAMES[p.unitRef ?? ''] ?? p.unitRef ?? '—') })
  if (p.unit === 'national') return t('All of Brazil')
  return p.unitName ? t('Your company: {name}', { name: p.unitName }) : t('Your company')
}

function AchievementSheet({ a, part, onClose, onGoRankings }: { a: AchievementView; part: CollectiveProgress | null; onClose: () => void; onGoRankings: () => void }) {
  const { t, d } = useI18n()
  const copy = copyFor(a.slug)
  const locked = a.unlockedAt === null
  const kindLabel = a.kind === 'individual' ? t('Individual achievement') : t('Collective achievement')
  return (
    <GamDialog labelledBy="gam-ach-title" onClose={onClose} className="gam-ach">
      <div className="gam-ach__head">
        <Badge icon={a.icon} tier={a.tier} shape={a.kind === 'individual' ? 'circle' : 'hexagon'} size={104} locked={locked} />
        <p className="eyebrow">{a.kind === 'individual' ? `${kindLabel} · ${t(TIER_LABEL[a.tier] ?? a.tier)}` : kindLabel}</p>
        <h2 id="gam-ach-title" className="display gam-ach__name">{t(copy.name)}</h2>
        <p className="gam-ach__rule">{t(copy.rule)}</p>
      </div>

      <div className="gam-ach__status">
        {locked
          ? <span className="gam-chip gam-chip--muted">{t('Locked')}</span>
          : <span className="gam-chip gam-chip--done">{t('Unlocked on {date}', { date: d(a.unlockedAt!, { day: 'numeric', month: 'long', year: 'numeric' }) })}</span>}
        {a.bonusLoopsCenti > 0 && <span className="gam-pill">{t('+{n} Loops bonus', { n: String(displayLoops(a.bonusLoopsCenti)) })}</span>}
      </div>

      {!locked && <p className="gam-ach__line">{t(copy.unlocked)}</p>}
      {a.kind === 'individual' && locked && <ProgressLine a={a} />}

      {a.kind === 'collective' && (
        <div className="gam-ach__collective">
          {part ? (
            <>
              <div className="gam-ach__block">
                <p className="gam-ach__label">{unitLabel(t, part)}</p>
                {part.unitShare !== null ? (
                  <span className="gam-progress">
                    <span className="gam-bar gam-bar--violet"><span style={{ width: `${part.unitShare * 100}%` }} /></span>
                    <span className="small">{t('{pct}% of the goal', { pct: String(Math.floor(part.unitShare * 100)) })}</span>
                  </span>
                ) : (
                  <p className="small muted">{t('Its progress appears once enough people take part.')}</p>
                )}
              </div>
              <div className="gam-ach__block">
                <p className="gam-ach__label">{t('Your part')}</p>
                {part.canTakePart ? (
                  <>
                    <p className="gam-ach__mine">{a.period === 'lifetime' ? t('{time} since you joined', { time: fmtMinutes(part.myMinutes) }) : t('{time} this month', { time: fmtMinutes(part.myMinutes) })}</p>
                    <p className="small muted">
                      {part.myMinutes >= part.neededMinutes
                        ? t('Your part already counts: when the goal is reached, this achievement is yours too.')
                        : t('Your part counts from about {n} minutes in the period.', { n: String(part.neededMinutes) })}
                    </p>
                  </>
                ) : part.unit === 'company' ? (
                  <p className="small muted">{t('This one belongs to companies with the Good Loop add-on.')}</p>
                ) : (
                  <>
                    <p className="small muted">{t('To count toward your city, state and region, take part in the rankings.')}</p>
                    <button className="btn btn--ghost gam-inline-btn" onClick={onGoRankings}>{t('Go to Rankings')}</button>
                  </>
                )}
              </div>
            </>
          ) : (
            <p className="small muted">{t('Its progress appears once enough people take part.')}</p>
          )}
        </div>
      )}
      <p className="small muted gam-ach__foot">{t('Achievements are permanent: once unlocked, they stay yours.')}</p>
    </GamDialog>
  )
}

