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

import { useEffect, useState, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import { useLegal } from '../legal/LegalContext'
import { LibraryNotice } from '../legal/LibraryNotice'
import { PathwayFinder } from './PathwayFinder'
import { Icon } from './icons'
import { durationLabel, primaryBlock, weekCount, type PathwayId } from '../data/selfuse'
import { Home } from '../ui2/Home'
import { useDataProvider } from '../data/provider'
import type { ExploreRail } from '../data/rails'
import { coverFor, coverStyle } from './artwork'
import {
  useCatalog,
  findPathway,
  type LiveCatalog,
  type ResolvedPathway,
  type ResolvedSession,
} from '../data/liveCatalog'
import { currentWeek, type PathwayState, type Launch } from '../data/selfUseStore'
import { useBackLayer } from './backStack'

interface ExploreProps {
  /** First name, when the account gives one. Null says hello without it. */
  name: string | null
  pathway: PathwayState | null
  onStartPathway: (id: PathwayId) => void
  onStart: (l: Launch) => void
  /** What is typed in the top bar's search field. */
  query?: string
  onQuery?: (q: string) => void
  /** A sponsor pays for this account: the workplace note names the employer. */
  sponsored?: boolean
  /** Professionally guided use is offered on this plan (LIB-2 vs LIB-3). */
  professionalOffered?: boolean
  /** LIB-2/3 and PLY-4 lead here. */
  onFindProfessional: () => void
  /** Slugs on this person's own list, newest first. */
  saved?: string[]
  /** Slugs listened to before, newest first, already deduped. */
  recent?: string[]
  onToggleSave?: (slug: string) => void
  /** At most one challenge card, under the greeting (docs/gamification/SPEC.md §5.5). */
  topCard?: ReactNode
}

type View =
  | { kind: 'list' }
  | { kind: 'finder' }
  | { kind: 'pathway'; id: PathwayId }
  | { kind: 'weekly' }
  | { kind: 'session'; slug: string }

export function Explore({ name, pathway, onStartPathway, onStart, query = '', onQuery, sponsored = false, professionalOffered = false, onFindProfessional, saved = [], onToggleSave, recent = [], topCard }: ExploreProps) {
  const { t } = useI18n()
  const { m } = useLegal()
  const catalog = useCatalog()
  const dp = useDataProvider()
  const [view, setView] = useState<View>({ kind: 'list' })
  /* The shelf an admin arranged. Read once, and a failure is not an error
     here: no rails means the library's built-in rows, which is what this
     screen showed before anyone could arrange anything. */
  const [rails, setRails] = useState<ExploreRail[] | null>(null)
  /* The chart. Codes, ranked, from an aggregate that suppresses anything
     fewer than five people have finished — so an empty answer is the normal
     one on a young install, and the shelf just does not appear. */
  const [top, setTop] = useState<string[]>([])
  useEffect(() => {
    let alive = true
    void dp.listExploreRails()
      .then((rows) => { if (alive) setRails(rows) })
      .catch(() => { if (alive) setRails([]) })
    return () => { alive = false }
  }, [dp])
  useEffect(() => {
    let alive = true
    void dp.topSessions(10)
      .then((codes) => { if (alive) setTop(codes) })
      .catch(() => { if (alive) setTop([]) })
    return () => { alive = false }
  }, [dp])
  /* Every view here has the same ‹ Back: it returns to the library. */
  useBackLayer(view.kind !== 'list', () => setView({ kind: 'list' }))


  if (catalog.loading) {
    return <div className="su-page"><p className="small muted">{t('Loading…')}</p></div>
  }

  if (view.kind === 'finder') {
    return (
      <PathwayFinder
        onClose={() => setView({ kind: 'list' })}
        onChoose={(id) => setView({ kind: 'pathway', id })}
      />
    )
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

  /* The library, ported from HomeMood.dc.html. The two legal elements this
     screen owes are not in the mockup and are not optional, so they travel
     into it: the category notice under the top bar (MN-25) and the static
     link to a professional at the foot (LIB-2 / LIB-3). */
  return (
    <>
      <Home
        name={name}
        catalog={catalog}
        storedRails={rails}
        recent={recent}
        saved={saved}
        onToggleSave={onToggleSave}
        top={top}
        query={query}
        onQuery={(q) => onQuery?.(q)}
        onOpen={(slug) => setView({ kind: 'session', slug })}
        onStart={(slug, duration) => onStart({ slug, duration })}
        noticeSlot={
          <>
            <LibraryNotice sponsored={sponsored} />
            {topCard}
          </>
        }
        footSlot={
          <p className="legal-line legal-line--foot">
            <button type="button" className="legal-link" onClick={onFindProfessional}>
              {m(professionalOffered ? 'LIB-2' : 'LIB-3')}
            </button>
          </p>
        }
      />

      <button
        className="btn cat-rail__help"
        onClick={() => setView({ kind: 'finder' })}
        title={t('Help me choose')}
        aria-label={t('Help me choose')}
      >
        <Icon name="help" size={22} />
        <span className="cat-rail__help__label">{t('Help me choose')}</span>
      </button>
    </>
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

  /* A pathway gets the same screen a protocol does: the picture IS the page.
     It had a 140px glow above a column of text, which read as a settings page
     for the one screen where somebody decides to commit to six weeks.

     The picture it wears is its OWN first session's cover — the thing they
     will actually open on day one — rather than a new illustration nobody has
     drawn. Stable, because that session's cover is derived from its slug. */
  const lead = pathway.plan.length ? primaryBlock(pathway.plan[0]) : undefined
  const leadSession = lead ? catalog.sessions.find((x) => x.slug === lead.slug) : undefined
  const cover = leadSession
    ? coverFor(leadSession.slug, leadSession.theme, leadSession.coverUrl)
    : coverFor(pathway.id, 'calm')

  return (
    <div className="pw-full">
      <section className="sess-full sess-full--hero" style={coverStyle(cover)}>
        <div className="sess-full__scrim" aria-hidden="true" />

        <div className="sess-full__top">
          <button className="sess-full__back" onClick={onBack}>‹ {t('Back')}</button>
        </div>

        <div className="sess-full__body">
          {/* No week count here either: the week-by-week plan is below, where
              it is structure rather than a label to judge the journey by.
              (`lengthLabel` is untranslated English from the catalogue, so it
              was never a candidate — it reads "4 WEEKS" in an Italian app.) */}
          <p className="sess-full__eyebrow">
            {t('{per} sessions/wk', { per: pathway.perWeekLabel })}
          </p>
          <h1 className="display sess-full__title">{t(pathway.name)}</h1>
          <p className="sess-full__about">{t(pathway.about)}</p>
          {pathway.dropped > 0 && (
            <p className="sess-full__note">
              {t('{n} week(s) of this pathway are not available right now, so it is shorter than usual.', { n: pathway.dropped })}
            </p>
          )}

          {active ? (
            <button className="btn btn--light pw-full__cta" onClick={onOpenWeekly}>{t('Continue')}</button>
          ) : (
            <button className="btn btn--light pw-full__cta" onClick={onStartPathway}>{t('Start Pathway')}</button>
          )}
        </div>
      </section>

      <div className="su-page pw-full__plan">
        <h2 className="home__sect">{t('Week by week')}</h2>
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

  const cover = coverFor(session.slug, session.theme, session.coverUrl)

  /* The picture IS the screen.
     It used to be a 150px strip above a page of text, which spent the one
     image a session has on the least of its space and made the screen read
     like a form. Now the cover fills the view and everything a person needs
     to decide sits on it: back at the top, the name, what it is, what to
     expect, and the lengths that start it at the foot — where a thumb is.

     A scrim darkens the picture only where there is type on it, so a pale
     photograph still carries white text, and the middle stays the image. It
     grows rather than clips: on a short phone the words push the screen
     longer and the picture scrolls with them. */
  return (
    <div className="sess-full" style={coverStyle(cover)}>
      <div className="sess-full__scrim" aria-hidden="true" />

      <div className="sess-full__top">
        <button className="sess-full__back" onClick={onBack}>‹ {t('Back')}</button>
      </div>

      <div className="sess-full__body">
        {pathway && <p className="sess-full__eyebrow">{t('Part of pathway:')} {t(pathway.name)}</p>}
        <h1 className="display sess-full__title">{t(session.name)}</h1>
        <p className="sess-full__about">{t(session.about)}</p>

        {session.expect.length > 0 && (
          <ul className="sess-full__expect" aria-label={t('What to expect')}>
            {session.expect.map((e) => <li key={e}>{t(e)}</li>)}
          </ul>
        )}

        {!session.audioReady && (
          <p className="sess-full__note">
            {t('No recorded voice is published for this session yet — it plays an ambient bed.')}
          </p>
        )}

        {/* The length IS the start. Choosing one and then pressing a second
            button to confirm it added a step to the only decision left on this
            screen — and the person had already decided by tapping. */}
        <div className="sess-full__label">{t('Choose a length to begin')}</div>
        <div className="chip-row chip-row--start sess-full__lengths">
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
      </div>
    </div>
  )
}
