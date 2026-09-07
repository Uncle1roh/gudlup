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

import { useState } from 'react'
import { useI18n } from '../i18n'
import { durationLabel, primaryBlock, weekCount, type PathwayId } from '../data/selfuse'
import { Catalog } from './Catalog'
import { coverFor, coverStyle } from './artwork'
import {
  useCatalog,
  findPathway,
  type LiveCatalog,
  type ResolvedPathway,
  type ResolvedSession,
} from '../data/liveCatalog'
import { currentWeek, type PathwayState } from '../data/selfUseStore'
import type { Launch } from './Home'

interface ExploreProps {
  pathway: PathwayState | null
  completed: PathwayId[]
  onStartPathway: (id: PathwayId) => void
  onStart: (l: Launch) => void
}

type View =
  | { kind: 'list' }
  | { kind: 'pathway'; id: PathwayId }
  | { kind: 'weekly' }
  | { kind: 'session'; slug: string }

export function Explore({ pathway, completed, onStartPathway, onStart }: ExploreProps) {
  const { t } = useI18n()
  const catalog = useCatalog()
  const [view, setView] = useState<View>({ kind: 'list' })

  /* The catalog's hero leads with what the person is already doing, so the
     library opens on something relevant rather than on whatever sorts first. */
  const activePathway = pathway ? findPathway(catalog.pathways, pathway.id) : undefined
  const todayWeek =
    pathway && activePathway
      ? activePathway.plan.find((w) => w.week === currentWeek(pathway, activePathway))
      : undefined
  const todaySlug = todayWeek ? primaryBlock(todayWeek)?.slug : undefined

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
      <Catalog
        catalog={catalog}
        featuredSlug={todaySlug}
        onOpen={(slug) => setView({ kind: 'session', slug })}
        onQuickStart={(slug, duration) => onStart({ slug, duration })}
        topSlot={
          activePathway && pathway ? (
            <ContinuePathway
              pathway={activePathway}
              state={pathway}
              onContinue={() => setView({ kind: 'weekly' })}
            />
          ) : undefined
        }
        pathwaysSlot={
          <PathwayRail
            pathways={catalog.pathways}
            active={pathway?.id ?? null}
            completed={completed}
            onOpen={(id) => setView({ kind: 'pathway', id })}
          />
        }
      />
    </div>
  )
}

/* ------------------------------------------------- continue a pathway ----

   Above the rails, and only while one is running. It is the one thing on this
   screen a person did not have to choose — everything else is a library, this
   is where they already are. */
function ContinuePathway({
  pathway,
  state,
  onContinue,
}: {
  pathway: ResolvedPathway
  state: PathwayState
  onContinue: () => void
}) {
  const { t } = useI18n()
  const week = currentWeek(state, pathway)
  const plan = pathway.plan.find((w) => w.week === week)
  const done = state.done[week] ?? 0
  const target = plan ? weekCount(plan) : 0

  return (
    <button className="card pw-continue" onClick={onContinue}>
      <span className="eyebrow">{t('Your pathway')}</span>
      <strong className="pw-continue__name">{t(pathway.name)}</strong>
      <span className="small muted">
        {t('Week {n} of {total}', { n: week, total: pathway.weeks })}
        {target ? ` · ${t('{done} of {total} this week', { done, total: target })}` : ''}
      </span>
      <span className="pw-continue__bar" aria-hidden="true">
        <i style={{ width: `${Math.round((week - 1 + (target ? done / target : 0)) / pathway.weeks * 100)}%` }} />
      </span>
      <span className="pw-continue__go">{t('Continue')}</span>
    </button>
  )
}

/* ------------------------------------------------------- pathways rail ---

   A category among the categories. The tab that used to hold these is gone:
   a pathway is one more thing to browse, and putting it behind a mode switch
   made the library feel like two apps. Big buttons rather than cover cards,
   because a pathway is a commitment of weeks and should not look like a
   six-minute session. */
function PathwayRail({
  pathways,
  active,
  completed,
  onOpen,
}: {
  pathways: ResolvedPathway[]
  active: PathwayId | null
  completed: PathwayId[]
  onOpen: (id: PathwayId) => void
}) {
  const { t } = useI18n()
  if (!pathways.length) return null
  return (
    <section className="cat-rail pw-rail">
      <header className="cat-rail__head">
        <h3 className="cat__railtitle">{t('Pathways')}</h3>
        <span className="small muted">{t('Several weeks, one theme')}</span>
      </header>
      <div className="cat-rail__track pw-rail__track">
        {pathways.map((p) => (
          <button
            key={p.id}
            className={`pw-big${active === p.id ? ' is-active' : ''}`}
            onClick={() => onOpen(p.id)}
          >
            <span className="pw-big__name">{t(p.name)}</span>
            <span className="pw-big__meta">
              {t('{n} weeks', { n: p.weeks })}
              {active === p.id ? ` · ${t('In progress')}` : completed.includes(p.id) ? ` · ${t('Completed')}` : ''}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------- EXP-1 -----

   The pathway LIST is gone with its tab: `PathwayRail` above is what browsing
   pathways looks like now. `PathwayDetail` stays — it is what opening one
   shows. */

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
          const lead = primaryBlock(w)
          const s = lead ? catalog.sessions.find((x) => x.slug === lead.slug) : undefined
          const isOpen = open === w.week
          return (
            <div key={w.week} className={`week${isOpen ? ' is-open' : ''}`}>
              <button className="week__head" onClick={() => setOpen(isOpen ? null : w.week)}>
                <span>
                  {t('Week {n}', { n: w.week })} · {w.rotation ? t('Your own mix') : s ? t(s.name) : ''}
                </span>
                <span aria-hidden="true">{isOpen ? '⌄' : '›'}</span>
              </button>
              {isOpen && (
                <div className="week__body fade-in">
                  <p className="small muted">{t(w.focus)}</p>
                  <ul className="week__blocks">
                    {w.blocks.map((b, i) => {
                      const bs = catalog.sessions.find((x) => x.slug === b.slug)
                      return (
                        <li key={`${b.slug}-${b.duration}-${i}`}>
                          <strong>{bs ? t(bs.name) : b.slug}</strong>{' · '}
                          {t(durationLabel(b.duration))} ({b.duration} min) × {b.count}
                          {b.when && <em className="small muted"> — {t(b.when)}</em>}
                        </li>
                      )
                    })}
                  </ul>
                  {w.rotation && (
                    <p className="small muted">
                      {t('A consolidation week — repeat whichever of these worked best for you.')}
                    </p>
                  )}
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
  const lead = plan ? primaryBlock(plan) : undefined
  const session = lead ? catalog.sessions.find((x) => x.slug === lead.slug) : undefined
  const done = state.done[week] ?? 0
  const target = plan ? weekCount(plan) : 0
  const todayIdx = (new Date().getDay() + 6) % 7

  /* A week can mix lengths, so the day row shows WHICH session and how long
     rather than repeating one line. The blocks are laid out in order across
     the first `target` weekdays; the rest are rest. It is a schedule, not an
     obligation — a day that passed unused says nothing at all. */
  const slots = (plan?.blocks ?? []).flatMap((b) => Array.from({ length: b.count }, () => b))
  const rows = DAY_LABELS.map((label, i) => ({
    label,
    block: slots[i],
    isDone: i < done,
    isToday: i === todayIdx,
  }))

  return (
    <div className="su-page weekly">
      <button className="su-back" onClick={onBack}>‹ {t('Back')}</button>
      <span className="eyebrow">{t('Week {n} of {total}', { n: week, total: p.weeks })}</span>
      <h1 className="display su-h1">{t(p.name)}</h1>

      <h3 className="home__sect">{t('This week')}</h3>
      {plan && <p className="lead">{t(plan.focus)}</p>}
      {plan?.rotation && (
        <p className="small muted">
          {t('A consolidation week — repeat whichever of these worked best for you.')}
        </p>
      )}

      <ul className="daylist">
        {rows.map((r) => {
          const rs = r.block ? catalog.sessions.find((x) => x.slug === r.block.slug) : undefined
          return (
            <li key={r.label} className={`daylist__row${r.isToday ? ' is-today' : ''}`}>
              <span className="daylist__day">{t(r.label)}</span>
              <span className="daylist__what">
                {r.block
                  ? `${rs ? t(rs.name) : ''} · ${t(durationLabel(r.block.duration))} ${r.block.duration}m`
                  : '—'}
                {r.block?.when && <em className="small muted"> — {t(r.block.when)}</em>}
              </span>
              <span className="daylist__state">
                {r.isDone ? t('Done') : r.isToday && r.block ? t('TODAY') : r.block ? '' : t('Rest')}
              </span>
            </li>
          )
        })}
      </ul>

      {plan && session && lead && done < target && (
        <button
          className="btn btn--primary"
          onClick={() => onStart({ slug: (slots[done] ?? lead).slug, duration: (slots[done] ?? lead).duration, pathwayWeek: week })}
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
  const pathway = catalog.pathways.find((p) => p.plan.some((w) => w.blocks.some((b) => b.slug === session.slug)))

  const cover = coverFor(session.slug, session.theme)

  return (
    <div className="su-page sess-detail">
      <button className="su-back" onClick={onBack}>‹ {t('Back')}</button>
      <div className="sess-detail__cover" style={coverStyle(cover)} />
      <h1 className="display su-h1">{t(session.name)}</h1>
      <p className="lead">{t(session.about)}</p>
      {!session.audioReady && (
        <p className="small muted">
          {t('No recorded voice is published for this session yet — it plays an ambient bed.')}
        </p>
      )}
      {/* The length IS the start. Choosing one and then pressing a second
          button to confirm it added a step to the only decision left on this
          screen — and the person had already decided by tapping. */}
      <div className="sheet__label">{t('Choose a length to begin')}</div>
      <div className="chip-row chip-row--start">
        {session.durations.map((d) => (
          <button
            key={d}
            className="chip chip--start"
            onClick={() => onStart({ slug: session.slug, duration: d })}
          >
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

    </div>
  )
}
