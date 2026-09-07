/* ============================================================================
   Self Use - Progress

   Two cards. How the week felt, and the mood calendar.

   It used to be two segmented views of thirteen sections between them - Self
   Use progress on one side, Therapist Guided on the other, with weekly session
   counts, WHO-5 percentages, streaks, minutes, pathway bars, prescription
   adherence, therapy goals. All of it true, none of it something a person
   opens this tab to find out. Counting someone's sessions back at them turns
   a wellbeing tool into a scoreboard, and a scoreboard is the one thing a
   person under strain does not need handed to them. The clinical side of that
   material belongs to the clinician, who has a workspace of their own for it.

   What is left is the two things that are about the person rather than about
   their compliance: what they reported this week against last, and the mood
   calendar they fill in themselves.

   Two rules the copy here still follows without exception: nothing guilts,
   and no number is ever given a clinical reading.
   ============================================================================ */

import { useState } from 'react'
import { useI18n, fmtDate } from '../i18n'
import {
  GL_CHECK_QUESTIONS,
  glCheckAverage,
  trend,
  trendArrow,
  dayKey,
  MOOD_LEVELS,
  type MoodEntry,
} from '../data/measures'
import { glCheckDue, who5Due, type SelfUseState } from '../data/selfUseStore'
import { type TherapyState } from './therapyStore'

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

export function ProgressTab({ state, onGlCheck, onWho5, onMood, onExportSelfUse }: ProgressProps) {
  const { t } = useI18n()

  const last = state.glChecks[state.glChecks.length - 1] ?? null
  const prev = state.glChecks[state.glChecks.length - 2] ?? null

  if (!state.glChecks.length && !state.moods.length) {
    return (
      <div className="su-page progress">
        <h1 className="display su-h1">{t('Progress')}</h1>
        <div className="empty">
          <p>{t('Nothing here yet.')}</p>
          <p className="small muted">
            {t('Your check-in and your mood calendar appear here once you start filling them in.')}
          </p>
          <button className="btn btn--primary" onClick={onGlCheck}>{t('Complete your weekly check-in')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="su-page progress">
      <h1 className="display su-h1">{t('Progress')}</h1>

      {/* How the week felt, set against the week before it. */}
      <section className="card">
        <h3 className="home__sect">{t('This week')}</h3>
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

      {/* The one thing on this tab a person writes rather than is told. */}
      <section className="card">
        <h3 className="home__sect">{t('Mood calendar')}</h3>
        {state.moods.length ? (
          <MoodCalendar moods={state.moods} />
        ) : (
          <p className="small muted">{t('Track your daily mood — it takes 1 second.')}</p>
        )}
        <button className="btn btn--ghost" onClick={onMood}>{t('How was your day?')}</button>
      </section>

      {/* The two routes the removed cards were the only way to reach. They are
          actions, not readings: no score is shown, and neither is offered
          unless it is actually due or actually has something to report. */}
      {who5Due(state) && (
        <button className="btn btn--quiet" onClick={onWho5}>{t('Take the monthly snapshot')}</button>
      )}
      {state.logs.length > 0 && (
        <button className="btn btn--quiet" onClick={onExportSelfUse}>
          {t('View your {month} report', { month: fmtDate(Date.now(), { month: 'long' }) })}
        </button>
      )}
    </div>
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
