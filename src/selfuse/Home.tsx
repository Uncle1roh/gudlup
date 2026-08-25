/* ============================================================================
   Self Use — Home (states A · B · C · D, plus the Quick Access sheet)

   Home is EXCLUSIVELY Self Use. Therapist Guided has its own tab, and nothing
   about therapy appears here.

   Three scrollable areas: the active pathway (~40%), quick access (~40%), and
   an Explore teaser (~20%). Deliberately absent: any measurement prompt.
   GL-Check, WHO-5 and Daily Mood live in Progress and in push notifications —
   opening the app must never feel like being assessed.

   Card states
     A  pathway active, today's session available
     B  today's session already done — "Great job today.", never a streak threat
     C  no active pathway — an invitation, not an error
     D  pathway completed — congratulations, then a next step
   ============================================================================ */

import { useState } from 'react'
import { useI18n } from '../i18n'
import { durationLabel } from '../data/selfuse'
import { useCatalog, findPathway, type ResolvedSession } from '../data/liveCatalog'
import { currentWeek, type PathwayState, type SelfUseLog } from '../data/selfUseStore'
import type { Duration } from '../types/domain'

export interface Launch {
  slug: string
  duration: Duration
  pathwayWeek?: number
}

interface HomeProps {
  name: string
  pathway: PathwayState | null
  logs: SelfUseLog[]
  /** Sessions logged since Monday — drives the weekly dots. */
  weekLogs: SelfUseLog[]
  hasNotifications: boolean
  onStart: (l: Launch) => void
  onExplore: () => void
  onAllSessions: () => void
  onHistory: () => void
  onNotifications: () => void
}

function greeting(now = new Date()): string {
  const h = now.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function longDate(now = new Date()): string {
  return now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

export function Home(props: HomeProps) {
  const { t } = useI18n()
  const catalog = useCatalog()
  const [sheet, setSheet] = useState<ResolvedSession | null>(null)

  /* Everything below reads the RESOLVED pathway, not the editorial one: a week
     whose protocol a PO disabled has already been dropped and the rest
     renumbered, so "today's session" is always something that can be started. */
  const pw = findPathway(catalog.pathways, props.pathway?.id)
  const week = pw ? currentWeek(props.pathway, pw) : 1
  const weekPlan = pw?.plan.find((w) => w.week === week)
  const todaySession = weekPlan ? catalog.sessions.find((x) => x.slug === weekPlan.slug) : undefined
  const doneThisWeek = props.pathway?.done[week] ?? 0
  const targetThisWeek = weekPlan?.count ?? 0
  const completedPathway = Boolean(props.pathway?.completedAt)
  const didSessionToday = props.weekLogs.some(
    (l) => new Date(l.at).toDateString() === new Date().toDateString(),
  )

  function launchFromSheet(d: Duration) {
    if (!sheet) return
    const s = sheet
    setSheet(null)
    props.onStart({ slug: s.slug, duration: d })
  }

  return (
    <div className="su-page home">
      <header className="home__head">
        <div>
          <h1 className="display su-greet">{t(greeting())}, {props.name}</h1>
          <p className="small muted">{longDate()}</p>
        </div>
        {props.hasNotifications && (
          <button className="home__bell" onClick={props.onNotifications} aria-label={t('Notifications')}>
            🔔
          </button>
        )}
      </header>

      {/* ---------------------------------------------------- Area 1 ------ */}
      {completedPathway && pw ? (
        <section className="card home__pathway home__pathway--done">
          <span className="eyebrow">{t('Pathway complete')}</span>
          <h2 className="home__pwname">{t("You've completed {name}!", { name: t(pw.name) })}</h2>
          <p className="small muted">{t('That is a real piece of work. What comes next is up to you.')}</p>
          <button className="btn btn--primary" onClick={props.onExplore}>{t('Start a new pathway')}</button>
          <button className="btn btn--quiet" onClick={props.onAllSessions}>{t('Continue with free sessions')}</button>
        </section>
      ) : pw && props.pathway && todaySession ? (
        <section className="card home__pathway">
          <div className="home__pwtop">
            <span className="eyebrow">{t('Your pathway')}</span>
            <span className="home__week">{t('Week {n} of {total}', { n: week, total: pw.weeks })}</span>
          </div>
          <h2 className="home__pwname">{t(pw.name)}</h2>
          <div className="home__bar" aria-hidden="true">
            <span style={{ width: `${Math.round((week - 1 + doneThisWeek / Math.max(1, targetThisWeek)) / pw.weeks * 100)}%` }} />
          </div>

          {didSessionToday ? (
            <>
              <div className="home__todaydone">
                <span className="home__check" aria-hidden="true">✓</span> {t('Completed')}
              </div>
              <p className="small muted">{t('Great job today.')}</p>
              <button
                className="btn btn--quiet"
                onClick={() => props.onStart({ slug: todaySession.slug, duration: weekPlan!.duration, pathwayWeek: week })}
              >
                {t('Do an extra session?')}
              </button>
            </>
          ) : (
            <>
              <div className="home__today">
                <span className="small muted">{t("Today's session")}</span>
                <strong>{t(todaySession.name)} · {t('{n} min', { n: weekPlan!.duration })}</strong>
              </div>
              <button
                className="btn btn--primary"
                onClick={() => props.onStart({ slug: todaySession.slug, duration: weekPlan!.duration, pathwayWeek: week })}
              >
                {t("Start Today's Session")}
              </button>
            </>
          )}

          <div className="home__dots" aria-label={t('{done} of {total} sessions this week', { done: doneThisWeek, total: targetThisWeek })}>
            {Array.from({ length: targetThisWeek }, (_, i) => (
              <span key={i} className={i < doneThisWeek ? 'is-on' : ''} />
            ))}
            <span className="small muted home__dotslabel">
              {t('{done} of {total} sessions this week', { done: doneThisWeek, total: targetThisWeek })}
            </span>
          </div>
        </section>
      ) : (
        <section className="card home__pathway home__pathway--empty">
          <h2 className="home__pwname">{t('Choose your pathway')}</h2>
          <p className="small muted">{t('Start a structured journey tailored to what you need most.')}</p>
          <button className="btn btn--primary" onClick={props.onExplore}>{t('Explore pathways')}</button>
        </section>
      )}

      {/* ---------------------------------------------------- Area 2 ------ */}
      <section className="home__quick">
        <h3 className="home__sect">{t('Quick session')}</h3>
        <p className="small muted">{t('How are you feeling right now?')}</p>
        <div className="mood-grid">
          {catalog.moodCards.map((c) => {
            const s = catalog.sessions.find((x) => x.slug === c.slug)
            if (!s) return null
            return (
              <button key={c.id} className="mood-card" onClick={() => setSheet(s)}>
                <span className="mood-card__icon" aria-hidden="true">{c.icon}</span>
                <span className="mood-card__label">{t(c.label)}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* ---------------------------------------------------- Area 3 ------ */}
      <section className="home__teaser">
        <div className="teaser-row">
          <button className="teaser" onClick={props.onExplore}>
            <strong>{t('All 5 pathways')}</strong>
            <span className="small muted">{t('Structured journeys')}</span>
          </button>
          <button className="teaser" onClick={props.onAllSessions}>
            <strong>{t('Full session library')}</strong>
            <span className="small muted">{t('{n} sessions', { n: catalog.browsable.length })}</span>
          </button>
          <button className="teaser" onClick={props.onHistory}>
            <strong>{t('Your session history')}</strong>
            <span className="small muted">{t('{n} completed', { n: props.logs.length })}</span>
          </button>
        </div>
      </section>

      {sheet && <QuickSheet session={sheet} onClose={() => setSheet(null)} onStart={launchFromSheet} onOther={props.onAllSessions} />}
    </div>
  )
}

/* ------------------------------------------------------------------------- */

/**
 * The half-sheet that a mood card opens. Quick (6 min) is pre-selected, so the
 * fast path is ZERO extra taps and the longer versions cost exactly one.
 */
function QuickSheet({
  session,
  onClose,
  onStart,
  onOther,
}: {
  session: ResolvedSession
  onClose: () => void
  onStart: (d: Duration) => void
  onOther: () => void
}) {
  const { t } = useI18n()
  /* Quick (6 min) is pre-selected where it exists. Where a PO published only
     the 12- or 24-minute workbook of this protocol, the shortest one that
     actually exists is selected instead — offering a length with no audio
     behind it would start a placeholder bed. */
  const [duration, setDuration] = useState<Duration>(
    session.durations.includes(6) ? 6 : (session.durations[0] ?? 6),
  )

  return (
    <div className="sheet-scrim" onClick={onClose} role="dialog" aria-modal="true">
      <div className="sheet fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__grip" aria-hidden="true" />
        <h3 className="display sheet__title">{t(session.name)}</h3>
        <p className="small muted">{t(session.blurb)}</p>

        <div className="sheet__label">{t('Duration')}</div>
        <div className="chip-row">
          {session.durations.map((d) => (
            <button key={d} className="chip" aria-pressed={duration === d} onClick={() => setDuration(d)}>
              <span className="chip__label">{t(durationLabel(d))}</span>
              <span className="chip__hint">{t('{n} min', { n: d })}</span>
            </button>
          ))}
        </div>

        <p className="small muted sheet__hint">{t('Put on headphones. Find a quiet spot.')}</p>

        <button className="btn btn--primary" onClick={() => onStart(duration)}>{t('Start session')}</button>
        <button className="btn btn--quiet" onClick={() => { onClose(); onOther() }}>
          {t('Choose a different session')}
        </button>
      </div>
    </div>
  )
}
