/* ============================================================================
   Self Use — Explore (EXP-1 … EXP-4 + session detail)

     EXP-1  Pathways view (default)   5 cards: Available / Active / Completed
     EXP-2  All Sessions view         19 sessions, duration + theme filters
     EXP-3  Pathway detail            illustration, description, week list
     EXP-4  Active pathway weekly     per-day status, CTA on today's session
            Session detail            durations, "what to expect", start

   Vocabulary rule for this whole file: pathway and session names only. No
   protocol code, no clinical family, no condition — the material behind a
   session has a clinical identity, and the person listening never sees it.
   ============================================================================ */

import { useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import {
  SELF_USE_THEMES,
  DURATIONS,
  durationLabel,
  durationTag,
  type PathwayId,
  type SelfUseTheme,
} from '../data/selfuse'
import {
  useCatalog,
  findPathway,
  type LiveCatalog,
  type ResolvedPathway,
  type ResolvedSession,
} from '../data/liveCatalog'
import { currentWeek, type PathwayState } from '../data/selfUseStore'
import type { Duration } from '../types/domain'
import type { Launch } from './Home'

interface ExploreProps {
  pathway: PathwayState | null
  completed: PathwayId[]
  /** Which segment to open on — Home's teasers deep-link into either. */
  initialTab?: 'pathways' | 'sessions'
  onStartPathway: (id: PathwayId) => void
  onStart: (l: Launch) => void
}

type View =
  | { kind: 'list' }
  | { kind: 'pathway'; id: PathwayId }
  | { kind: 'weekly' }
  | { kind: 'session'; slug: string }

export function Explore({ pathway, completed, initialTab = 'pathways', onStartPathway, onStart }: ExploreProps) {
  const { t } = useI18n()
  const catalog = useCatalog()
  const [tab, setTab] = useState<'pathways' | 'sessions'>(initialTab)
  const [view, setView] = useState<View>({ kind: 'list' })

  if (catalog.loading) {
    return <div className="su-page"><p className="small muted">{t('Loading…')}</p></div>
  }

  if (view.kind === 'pathway') {
    const p = findPathway(catalog.pathways, view.id)
    if (p) {
      return (
        <PathwayDetail
          pathway={p}
          catalog={catalog}
          active={pathway?.id === p.id ? pathway : null}
          onBack={() => setView({ kind: 'list' })}
          onStartPathway={() => { onStartPathway(p.id); setView({ kind: 'weekly' }) }}
          onOpenWeekly={() => setView({ kind: 'weekly' })}
        />
      )
    }
  }

  if (view.kind === 'weekly' && pathway) {
    return <WeeklyView state={pathway} catalog={catalog} onBack={() => setView({ kind: 'list' })} onStart={onStart} />
  }

  if (view.kind === 'session') {
    const s = catalog.sessions.find((x) => x.slug === view.slug)
    if (s) return <SessionDetail session={s} catalog={catalog} onBack={() => setView({ kind: 'list' })} onStart={onStart} />
  }

  return (
    <div className="su-page explore">
      <h1 className="display su-h1">{t('Explore')}</h1>

      <div className="segmented" role="tablist">
        <button role="tab" aria-selected={tab === 'pathways'} onClick={() => setTab('pathways')}>
          {t('Pathways')}
        </button>
        <button role="tab" aria-selected={tab === 'sessions'} onClick={() => setTab('sessions')}>
          {t('All Sessions')}
        </button>
      </div>

      {tab === 'pathways' ? (
        <PathwayList
          pathway={pathway}
          catalog={catalog}
          completed={completed}
          onOpen={(id) => setView({ kind: 'pathway', id })}
          onContinue={() => setView({ kind: 'weekly' })}
        />
      ) : (
        <SessionList catalog={catalog} onOpen={(slug) => setView({ kind: 'session', slug })} />
      )}
    </div>
  )
}

/* ------------------------------------------------------------- EXP-1 ----- */

function PathwayList({
  pathway,
  catalog,
  completed,
  onOpen,
  onContinue,
}: {
  pathway: PathwayState | null
  catalog: LiveCatalog
  completed: PathwayId[]
  onOpen: (id: PathwayId) => void
  onContinue: () => void
}) {
  const { t } = useI18n()
  return (
    <div className="pw-list">
      {catalog.pathways.map((p) => {
        const isActive = pathway?.id === p.id && !pathway.completedAt
        const isDone = completed.includes(p.id) || (pathway?.id === p.id && Boolean(pathway.completedAt))
        const week = isActive ? currentWeek(pathway, p) : 0
        return (
          <article key={p.id} className={`card pw-card${isActive ? ' is-active' : ''}`}>
            <button className="pw-card__head" onClick={() => onOpen(p.id)}>
              <span className="pw-card__name">{t(p.name)}</span>
              {isActive && <span className="badge badge--on">{t('ACTIVE')}</span>}
              {isDone && !isActive && <span className="badge">{t('COMPLETED')}</span>}
              <span className="pw-card__chev" aria-hidden="true">›</span>
            </button>
            <p className="small muted">{t(p.blurb)}</p>
            {isActive ? (
              <>
                <div className="pw-card__meta">{t('Week {n} of {total}', { n: week, total: p.weeks })}</div>
                <button className="btn btn--primary" onClick={onContinue}>{t('Continue')}</button>
              </>
            ) : (
              <>
                <div className="pw-card__meta">
                  {t(p.lengthLabel)} · {t('{per}/wk', { per: p.perWeekLabel })}
                </div>
                <button className="btn btn--ghost" onClick={() => onOpen(p.id)}>
                  {isDone ? t('Restart') : t('Start Pathway')}
                </button>
              </>
            )}
          </article>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------- EXP-2 ----- */

function SessionList({ catalog, onOpen }: { catalog: LiveCatalog; onOpen: (slug: string) => void }) {
  const { t } = useI18n()
  const [dur, setDur] = useState<Duration | 'all'>('all')
  const [theme, setTheme] = useState<SelfUseTheme | 'all'>('all')

  const list = useMemo(
    () =>
      catalog.browsable.filter(
        (s) => (dur === 'all' || s.durations.includes(dur)) && (theme === 'all' || s.theme === theme),
      ),
    [catalog.browsable, dur, theme],
  )

  const pathwayOf = (slug: string): ResolvedPathway | undefined =>
    catalog.pathways.find((p) => p.plan.some((w) => w.slug === slug))

  return (
    <div className="sess-list">
      <div className="filter-row" role="group" aria-label={t('Duration')}>
        <button className="filter-chip" aria-pressed={dur === 'all'} onClick={() => setDur('all')}>{t('All')}</button>
        {DURATIONS.map((d) => (
          <button key={d} className="filter-chip" aria-pressed={dur === d} onClick={() => setDur(d)}>
            {t(durationLabel(d))} {d}m
          </button>
        ))}
      </div>
      <div className="filter-row" role="group" aria-label={t('Theme')}>
        <button className="filter-chip" aria-pressed={theme === 'all'} onClick={() => setTheme('all')}>{t('All')}</button>
        {SELF_USE_THEMES.map((th) => (
          <button key={th.id} className="filter-chip" aria-pressed={theme === th.id} onClick={() => setTheme(th.id)}>
            {t(th.label)}
          </button>
        ))}
      </div>

      {!list.length && (
        <div className="empty">
          <p>{t('No sessions match.')}</p>
          <button className="btn btn--ghost" onClick={() => { setDur('all'); setTheme('all') }}>
            {t('Clear filters')}
          </button>
        </div>
      )}

      {list.map((s) => {
        const p = pathwayOf(s.slug)
        return (
          <button key={s.slug} className="card sess-card" onClick={() => onOpen(s.slug)}>
            <div className="sess-card__name">{t(s.name)}</div>
            <p className="small muted">{t(s.blurb)}</p>
            <div className="sess-card__tags">
              {s.durations.map((d) => (
                <span key={d} className="tag">{t(durationLabel(d))} {d}m</span>
              ))}
            </div>
            {p && <div className="small muted sess-card__part">{t('Part of:')} {t(p.name)}</div>}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------- EXP-3 ----- */

function PathwayDetail({
  pathway,
  catalog,
  active,
  onBack,
  onStartPathway,
  onOpenWeekly,
}: {
  pathway: ResolvedPathway
  catalog: LiveCatalog
  active: PathwayState | null
  onBack: () => void
  onStartPathway: () => void
  onOpenWeekly: () => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState<number | null>(1)

  return (
    <div className="su-page pw-detail">
      <button className="su-back" onClick={onBack}>‹ {t('Back')}</button>
      <div className="pw-detail__art" aria-hidden="true"><span className="ob-art__glow" /></div>

      <h1 className="display su-h1">{t(pathway.name)}</h1>
      <p className="small muted">
        {t(pathway.lengthLabel)} · {t('{per} sessions/wk', { per: pathway.perWeekLabel })}
      </p>
      <p className="lead pw-detail__about">{t(pathway.about)}</p>
      {pathway.dropped > 0 && (
        <p className="small muted">
          {t('{n} week(s) of this pathway are not available right now, so it is shorter than usual.', { n: pathway.dropped })}
        </p>
      )}

      {active ? (
        <button className="btn btn--primary" onClick={onOpenWeekly}>{t('Continue')}</button>
      ) : (
        <button className="btn btn--primary" onClick={onStartPathway}>{t('Start Pathway')}</button>
      )}

      <div className="weeks">
        {pathway.plan.map((w) => {
          const s = catalog.sessions.find((x) => x.slug === w.slug)
          const isOpen = open === w.week
          return (
            <div key={w.week} className={`week${isOpen ? ' is-open' : ''}`}>
              <button className="week__head" onClick={() => setOpen(isOpen ? null : w.week)}>
                <span>{t('Week {n}', { n: w.week })} · {s ? t(s.name) : ''}</span>
                <span aria-hidden="true">{isOpen ? '⌄' : '›'}</span>
              </button>
              {isOpen && s && (
                <div className="week__body fade-in">
                  <p className="small muted">{t(s.blurb)}</p>
                  <p className="small">
                    {t(durationLabel(w.duration))} ({t('{n} min', { n: w.duration })}) × {t('{n} sessions', { n: w.count })}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- EXP-4 ----- */

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function WeeklyView({
  state,
  catalog,
  onBack,
  onStart,
}: {
  state: PathwayState
  catalog: LiveCatalog
  onBack: () => void
  onStart: (l: Launch) => void
}) {
  const { t } = useI18n()
  const p = findPathway(catalog.pathways, state.id)
  if (!p) return null
  const week = currentWeek(state, p)
  const plan = p.plan.find((w) => w.week === week)
  const session = plan ? catalog.sessions.find((x) => x.slug === plan.slug) : undefined
  const done = state.done[week] ?? 0
  const target = plan?.count ?? 0
  const todayIdx = (new Date().getDay() + 6) % 7

  /* The week's sessions are spread across the first `target` weekdays, with the
     remaining days marked as rest. It is a schedule, not an obligation: a day
     that passed unused says nothing at all. */
  const rows = DAY_LABELS.map((label, i) => {
    const scheduled = i < target
    const isDone = scheduled && i < done
    const isToday = i === todayIdx
    return { label, scheduled, isDone, isToday }
  })

  return (
    <div className="su-page weekly">
      <button className="su-back" onClick={onBack}>‹ {t('Back')}</button>
      <span className="eyebrow">{t('Week {n} of {total}', { n: week, total: p.weeks })}</span>
      <h1 className="display su-h1">{t(p.name)}</h1>

      <h3 className="home__sect">{t('This week')}</h3>
      {session && <p className="lead">{t(session.name)}</p>}

      <ul className="daylist">
        {rows.map((r) => (
          <li key={r.label} className={`daylist__row${r.isToday ? ' is-today' : ''}`}>
            <span className="daylist__day">{t(r.label)}</span>
            <span className="daylist__what">
              {r.scheduled && plan ? `${t(durationLabel(plan.duration))} · ${plan.duration}m` : '—'}
            </span>
            <span className="daylist__state">
              {r.isDone ? t('Done') : r.isToday && r.scheduled ? t('TODAY') : r.scheduled ? '' : t('Rest')}
            </span>
          </li>
        ))}
      </ul>

      {plan && session && done < target && (
        <button
          className="btn btn--primary"
          onClick={() => onStart({ slug: session.slug, duration: plan.duration, pathwayWeek: week })}
        >
          {t('Start {day} session', { day: t(DAY_LABELS[todayIdx]) })}
        </button>
      )}
      {done >= target && (
        <p className="small muted">{t("This week's sessions are done. Anything more is a bonus.")}</p>
      )}
    </div>
  )
}

/* ---------------------------------------------------- session detail ----- */

function SessionDetail({
  session,
  catalog,
  onBack,
  onStart,
}: {
  session: ResolvedSession
  catalog: LiveCatalog
  onBack: () => void
  onStart: (l: Launch) => void
}) {
  const { t } = useI18n()
  const [duration, setDuration] = useState<Duration>(
    session.durations.includes(6) ? 6 : (session.durations[0] ?? 6),
  )
  const pathway = catalog.pathways.find((p) => p.plan.some((w) => w.slug === session.slug))

  return (
    <div className="su-page sess-detail">
      <button className="su-back" onClick={onBack}>‹ {t('Back')}</button>
      <h1 className="display su-h1">{t(session.name)}</h1>
      <p className="lead">{t(session.about)}</p>

      <div className="sheet__label">{t('Duration')}</div>
      <div className="chip-row">
        {session.durations.map((d) => (
          <button key={d} className="chip" aria-pressed={duration === d} onClick={() => setDuration(d)}>
            <span className="chip__label">{t(durationLabel(d))}</span>
            <span className="chip__hint">{t('{n} min', { n: d })}</span>
          </button>
        ))}
      </div>

      {pathway && <p className="small muted">{t('Part of pathway:')} {t(pathway.name)}</p>}

      {session.expect.length > 0 && (
        <>
          <h3 className="home__sect">{t('What to expect')}</h3>
          <ul className="expect">
            {session.expect.map((e) => <li key={e}>{t(e)}</li>)}
          </ul>
        </>
      )}

      <button className="btn btn--primary" onClick={() => onStart({ slug: session.slug, duration })}>
        {t('Start Session')} · {t(durationTag(duration))}
      </button>
    </div>
  )
}
