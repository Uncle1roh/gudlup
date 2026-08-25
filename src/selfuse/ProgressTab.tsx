/* ============================================================================
   Self Use — Progress (PRG-1 · PRG-2 · PRG-3)

   Two segmented views, and they NEVER mix. Self Use progress is what the
   person did on their own; Therapist Guided progress is what happened under a
   clinician. A prescription completed at home counts in the second, not the
   first — the therapist prescribed it, so it belongs to the therapy.

   Self Use view, seven sections:
     1 Weekly summary   4 Mood calendar     7 Monthly report
     2 GL-Check trend   5 Usage stats
     3 WHO-5 trend      6 Pathway progress

   Therapist Guided view, six:
     1 Therapy overview       4 Prescription adherence
     2 Session chronology     5 Therapy goals
     3 Clinical assessments   6 Export

   Two rules the copy here follows without exception: a streak of zero never
   guilts ("Start a new session", not "you broke your streak"), and no number
   is ever given a clinical reading.
   ============================================================================ */

import { useState } from 'react'
import { useI18n } from '../i18n'
import {
  GL_CHECK_QUESTIONS,
  glCheckAverage,
  who5Percent,
  trend,
  trendArrow,
  trendDeltaLabel,
  dayKey,
  MOOD_LEVELS,
  type MoodEntry,
} from '../data/measures'
import { durationLabel, weekCount } from '../data/selfuse'
import { useCatalog, findPathway } from '../data/liveCatalog'
import {
  currentWeek,
  pathwayDone,
  sessionsThisWeek,
  streakDays,
  glCheckDue,
  who5Due,
  type SelfUseState,
} from '../data/selfUseStore'
import { adherence, type TherapyState } from './therapyStore'

interface ProgressProps {
  state: SelfUseState
  therapy: TherapyState
  onGlCheck: () => void
  onWho5: () => void
  onMood: () => void
  onGoTherapist: () => void
  onExportSelfUse: () => void
  onExportTherapy: () => void
}

export function ProgressTab(props: ProgressProps) {
  const { t } = useI18n()
  const [tab, setTab] = useState<'self' | 'guided'>('self')

  return (
    <div className="su-page progress">
      <h1 className="display su-h1">{t('Progress')}</h1>
      <div className="segmented" role="tablist">
        <button role="tab" aria-selected={tab === 'self'} onClick={() => setTab('self')}>{t('Self Use')}</button>
        <button role="tab" aria-selected={tab === 'guided'} onClick={() => setTab('guided')}>{t('Therapist Guided')}</button>
      </div>
      {tab === 'self' ? <SelfUseProgress {...props} /> : <GuidedProgress {...props} />}
    </div>
  )
}

/* -------------------------------------------------------------- PRG-1 ---- */

function SelfUseProgress({ state, onGlCheck, onWho5, onMood, onExportSelfUse }: ProgressProps) {
  const { t } = useI18n()
  const catalog = useCatalog()

  const week = sessionsThisWeek(state.logs)
  const minutes = week.reduce((n, l) => n + l.duration, 0)
  const pw = findPathway(catalog.pathways, state.pathway?.id)
  const planWeek = pw?.plan.find((w) => w.week === currentWeek(state.pathway, pw))
  const target = planWeek ? weekCount(planWeek) : 5

  const last = state.glChecks[state.glChecks.length - 1] ?? null
  const prev = state.glChecks[state.glChecks.length - 2] ?? null

  const whoNow = who5Percent(state.who5[state.who5.length - 1] ?? null)
  const whoPrev = who5Percent(state.who5[state.who5.length - 2] ?? null)
  const whoTrend = trend(whoNow, whoPrev, 1, 0)

  const totalMinutes = state.logs.reduce((n, l) => n + l.duration, 0)
  const streak = streakDays(state.logs)

  if (!state.logs.length && !state.glChecks.length && !state.who5.length && !state.moods.length) {
    return (
      <div className="empty">
        <p>{t('Complete your first session.')}</p>
        <p className="small muted">{t('Your weekly summary and check-in trends appear here once you begin.')}</p>
      </div>
    )
  }

  return (
    <>
      {/* 1 — weekly summary */}
      <section className="card">
        <h3 className="home__sect">{t('This week')}</h3>
        <div className="metric metric--inline">
          <span className="metric__value">{week.length} {t('of')} {target}</span>
          <span className="metric__label">{t('sessions · {n} min', { n: minutes })}</span>
        </div>
        <div
          className="home__dots"
          role="img"
          aria-label={t('{done} of {total} sessions this week', { done: week.length, total: target })}
        >
          {Array.from({ length: target }, (_, i) => (
            <span key={i} className={i < week.length ? 'is-on' : ''} />
          ))}
        </div>
      </section>

      {/* 2 — GL-Check */}
      <section className="card">
        <h3 className="home__sect">{t('Your weekly check-in')}</h3>
        {last ? (
          <>
            <p className="small muted">{t('This week vs. last')}</p>
            <div className="msr-bars">
              {GL_CHECK_QUESTIONS.map((d) => {
                const cur = last.scores[d.id]
                const before = prev?.scores[d.id] ?? null
                const tr = trend(cur, before, 0.01, 1)
                return (
                  <div key={d.id} className="msr-bar">
                    <span className="msr-bar__label">{t(d.label)}</span>
                    <span className="msr-bar__track" aria-hidden="true"><span style={{ width: `${(cur / 5) * 100}%` }} /></span>
                    <span className="msr-bar__val">{cur}{tr && ` ${trendArrow(tr.direction)}`}</span>
                  </div>
                )
              })}
            </div>
            <p className="small muted">
              {t('Average')} {glCheckAverage(last)} · {t('scale 1–5')}
            </p>
          </>
        ) : (
          <p className="small muted">{t('No check-in yet.')}</p>
        )}
        {glCheckDue(state) && (
          <button className="btn btn--primary" onClick={onGlCheck}>{t('Complete your weekly check-in')}</button>
        )}
      </section>

      {/* 3 — WHO-5 */}
      <section className="card">
        <h3 className="home__sect">{t('Monthly wellbeing')}</h3>
        {whoNow != null ? (
          <>
            <div className="metric metric--inline">
              <span className="metric__value">{whoNow}%</span>
              <span className="metric__label">{t('Scale 0–100')}</span>
            </div>
            {whoTrend && <p className="small muted">{t(whoTrend.label)} {trendArrow(whoTrend.direction)}</p>}
            <Sparkline values={state.who5.map((e) => who5Percent(e) ?? 0)} max={100} />
          </>
        ) : (
          <p className="small muted">{t('No wellbeing snapshot yet.')}</p>
        )}
        {who5Due(state) && <button className="btn btn--ghost" onClick={onWho5}>{t('Take the monthly snapshot')}</button>}
      </section>

      {/* 4 — mood calendar */}
      <section className="card">
        <h3 className="home__sect">{t('Mood calendar')}</h3>
        {state.moods.length ? (
          <MoodCalendar moods={state.moods} />
        ) : (
          <p className="small muted">{t('Track your daily mood — it takes 1 second.')}</p>
        )}
        <button className="btn btn--ghost" onClick={onMood}>{t('How was your day?')}</button>
      </section>

      {/* 5 — usage stats */}
      <section className="card">
        <h3 className="home__sect">{t('Your practice')}</h3>
        <div className="statgrid">
          <div><strong>{streak}</strong><span className="small muted">{t('day streak')}</span></div>
          <div><strong>{totalMinutes}</strong><span className="small muted">{t('minutes total')}</span></div>
          <div><strong>{state.logs.length}</strong><span className="small muted">{t('sessions completed')}</span></div>
        </div>
        {streak === 0 && <p className="small muted">{t('Start a new session.')}</p>}
      </section>

      {/* 6 — pathway progress */}
      <section className="card">
        <h3 className="home__sect">{t('Pathway progress')}</h3>
        {pw && state.pathway ? (
          <>
            <strong>{t(pw.name)}</strong>
            <p className="small muted">
              {t('Week {n} of {total}', { n: currentWeek(state.pathway, pw), total: pw.weeks })} · {t('{n} sessions done', { n: pathwayDone(state.pathway) })}
            </p>
            <div className="home__bar" aria-hidden="true">
              <span style={{ width: `${Math.round((currentWeek(state.pathway, pw) / pw.weeks) * 100)}%` }} />
            </div>
          </>
        ) : (
          <p className="small muted">{t('No active pathway.')}</p>
        )}
        {state.completedPathways.length > 0 && (
          <ul className="small muted">
            {state.completedPathways.map((c) => {
              const p = findPathway(catalog.pathways, c.id)
              return p ? <li key={c.id}>{t(p.name)} · {new Date(c.at).toLocaleDateString()}</li> : null
            })}
          </ul>
        )}
      </section>

      {/* 7 — monthly report */}
      <section className="card">
        <h3 className="home__sect">{t('Monthly report')}</h3>
        <p className="small muted">{t('A summary of your sessions and check-ins for this month.')}</p>
        <button className="btn btn--ghost" onClick={onExportSelfUse}>
          {t('View your {month} report', { month: new Date().toLocaleDateString(undefined, { month: 'long' }) })}
        </button>
      </section>
    </>
  )
}

/* ------------------------------------------------------ PRG-2 / PRG-3 ---- */

function GuidedProgress({ therapy, onGoTherapist, onExportTherapy }: ProgressProps) {
  const { t } = useI18n()
  const catalog = useCatalog()
  const link = therapy.link

  if (!link) {
    return (
      <div className="empty">
        <h3>{t('No guided sessions yet')}</h3>
        <p className="small muted">{t('Connect with a therapist to see your guided session progress here.')}</p>
        <button className="btn btn--primary" onClick={onGoTherapist}>{t('Go to Therapist tab')}</button>
      </div>
    )
  }

  const lastVas = link.vas[link.vas.length - 1]

  return (
    <>
      <section className="card">
        <h3 className="home__sect">{t('Therapy overview')}</h3>
        <strong>{link.therapist.name}</strong>
        <div className="statgrid">
          <div><strong>{link.sessions.length}</strong><span className="small muted">{t('sessions')}</span></div>
          <div><strong>{link.weeksInTherapy}</strong><span className="small muted">{t('weeks in therapy')}</span></div>
          <div>
            <strong>
              {link.nextSessionAt
                ? new Date(link.nextSessionAt).toLocaleDateString(undefined, { weekday: 'short' }) +
                  ' ' +
                  new Date(link.nextSessionAt).toLocaleTimeString(undefined, { hour: 'numeric' })
                : '—'}
            </strong>
            <span className="small muted">{t('next session')}</span>
          </div>
        </div>
      </section>

      <section className="card">
        <h3 className="home__sect">{t('Session chronology')}</h3>
        <ul className="chron">
          {link.sessions.map((s) => {
            const name = s.slug ? catalog.sessions.find((x) => x.slug === s.slug)?.name : undefined
            return (
              <li key={s.id} className="chron__row">
                <span>{new Date(s.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                <span>{name ? t(name) : t('Video session')}</span>
                <span className="small muted">{s.minutes} min</span>
                <span className="small muted">{s.notesShared ? t('notes shared') : ''}</span>
              </li>
            )
          })}
        </ul>
        <p className="small muted">
          {t('VAS pre/post scores are recorded by your therapist from their desktop — never collected via your app.')}
        </p>
      </section>

      <section className="card">
        <h3 className="home__sect">{t('Clinical assessment trends')}</h3>
        {lastVas && (
          <p className="small">
            {t('Latest VAS')} · {lastVas.pre} → {lastVas.post}
          </p>
        )}
        <Sparkline values={link.vas.map((v) => v.pre - v.post)} max={10} />
        <ul className="scorelist">
          {link.scores.map((s) => {
            const first = s.points[0]?.value
            const last = s.points[s.points.length - 1]?.value
            const tr = trend(last ?? null, first ?? null, 0.01, 1)
            return (
              <li key={s.label}>
                <span>{s.label}</span>
                <strong>{last}</strong>
                {tr && <span className="small muted"> {trendDeltaLabel(tr)}</span>}
              </li>
            )
          })}
        </ul>
        <p className="small muted">
          {t('Clinical scales are used in Therapist Guided only, administered under therapist supervision.')}
        </p>
      </section>

      <section className="card">
        <h3 className="home__sect">{t('Prescription adherence')}</h3>
        {link.prescriptions.map((rx) => {
          const s = catalog.sessions.find((x) => x.slug === rx.slug)
          return (
            <div key={rx.id} className="rx-line">
              <span>{s ? t(s.name) : rx.slug} · {t(durationLabel(rx.duration))}</span>
              <span className="rx-card__bar" aria-hidden="true"><span style={{ width: `${adherence(rx)}%` }} /></span>
              <span className="small muted">{adherence(rx)}%</span>
            </div>
          )
        })}
      </section>

      <section className="card">
        <h3 className="home__sect">{t('Therapy goals')}</h3>
        <ul className="goals">
          {link.goals.map((g) => (
            <li key={g.id}>
              <span className={`goal-dot goal-dot--${g.status}`} aria-hidden="true" />
              {t(g.text)}
              <span className="small muted"> · {g.status === 'achieved' ? t('Achieved') : t('In progress')}</span>
            </li>
          ))}
        </ul>
        <p className="small muted">{t('Goals are set with your therapist and are read-only here.')}</p>
      </section>

      <section className="card">
        <button className="btn btn--ghost" onClick={onExportTherapy}>{t('Export therapy report')}</button>
      </section>
    </>
  )
}

/* ------------------------------------------------------------ helpers ---- */

function Sparkline({ values, max }: { values: number[]; max: number }) {
  if (values.length < 2) return null
  const w = 240
  const h = 54
  const step = w / (values.length - 1)
  const pts = values
    .map((v, i) => `${(i * step).toFixed(1)},${(h - Math.max(0, Math.min(1, v / max)) * h).toFixed(1)}`)
    .join(' ')
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-hidden="true" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function MoodCalendar({ moods }: { moods: MoodEntry[] }) {
  const { t } = useI18n()
  const [open, setOpen] = useState<MoodEntry | null>(null)
  const byDay = new Map(moods.map((m) => [m.day, m]))
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const pad = (first.getDay() + 6) % 7

  return (
    <>
      <div className="cal">
        {Array.from({ length: pad }, (_, i) => <span key={`p${i}`} className="cal__pad" />)}
        {Array.from({ length: days }, (_, i) => {
          const d = new Date(now.getFullYear(), now.getMonth(), i + 1)
          const m = byDay.get(dayKey(d.getTime()))
          return (
            <button
              key={i}
              className={`cal__day${m ? ` cal__day--l${m.level}` : ''}`}
              onClick={() => m && setOpen(m)}
              aria-label={`${i + 1}`}
            >
              {i + 1}
            </button>
          )
        })}
      </div>
      {open && (
        <p className="small muted fade-in">
          {new Date(open.at).toLocaleDateString()} ·{' '}
          {t(MOOD_LEVELS.find((l) => l.value === open.level)?.label ?? '')}
          {open.note ? ` — ${open.note}` : ''}
        </p>
      )}
    </>
  )
}
