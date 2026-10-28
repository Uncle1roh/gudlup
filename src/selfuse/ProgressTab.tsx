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

   Conquistas (docs/gamification/SPEC.md §3.4) sits beside that summary as
   its own view, not inside it. It does not reopen the scoreboard: it shows
   time given and milestones that, once reached, stay reached — no streaks,
   no counts of what was missed, no points (PLAN A6), nothing ranked against
   anyone, and never a clinical value.

   On a desk the summary is the redesign's three-column grid (WJornada):
   the pathway's ring beside its weeks, then the check-in beside the care
   block, then the mood calendar beside the next milestone and the live
   challenge, then how the sessions felt. The care, the milestone and the
   challenge are the desk's extra — below 900px they are hidden and the phone
   keeps the person's own cards (Jornada mockup).
   ============================================================================ */

import { useEffect, useState } from 'react'
import { GlCheckWeek } from './Measures'
import { useI18n, fmtDate } from '../i18n'
import {
  dayKey,
  MOOD_LEVELS,
  type MoodEntry,
} from '../data/measures'
import { glCheckDue, type Launch, type SelfUseState } from '../data/selfUseStore'
import { type TherapyState } from './therapyStore'
import { Conquistas } from './Conquistas'
import { RankingsTab } from './Coletivas'
import { ChallengesTab } from './ChallengesTab'
import { ChallengeCard } from './ChallengeCard'
import { Icon } from './icons'
import { useDataProvider } from '../data/provider'
import { PathwayPanels, VasPanel, usePathwayView } from '../ui2/Journey'
import { TopBar, PageTitle } from '../ui2/TopBar'
import { Badge } from '../gamification/ui/Badge'
import { copyFor } from '../gamification/copy'
import { fmtMinutes, nextAchievement, type AchievementView } from '../gamification/achievements'
import { isLive, type ChallengeView, visibleChallenges } from '../gamification/challenges'
import type { Wallet } from '../gamification/economy'

export type ProgressView = 'summary' | 'achievements' | 'rankings' | 'challenges'

interface ProgressProps {
  /** First name, when the account gives one — the top bar prints it. */
  name: string | null
  /** The person belongs to a company, so an employer's challenge is theirs. */
  hasCompany: boolean
  state: SelfUseState
  therapy: TherapyState
  view: ProgressView
  onView: (v: ProgressView) => void
  /** "Iniciar sessão" from a challenge: back to the library. */
  onStartSession: () => void
  /** Start one session straight away — the pathway's next, from the ring. */
  onStartLaunch: (l: Launch) => void
  onGlCheck: () => void
  onMood: () => void
  onGoTherapist: () => void
  onExportSelfUse: () => void
  onExportTherapy: () => void
}

const VIEWS: { id: ProgressView; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'achievements', label: 'Achievements' },
  { id: 'rankings', label: 'Rankings' },
  { id: 'challenges', label: 'Challenges' },
]

export function ProgressTab(props: ProgressProps) {
  const { t } = useI18n()
  const { view, onView } = props
  const pw = usePathwayView(props.state.pathway)
  return (
    <>
      <TopBar name={props.name} />
      <PageTitle
        title={t('My journey')}
        note={pw ? `${t(pw.active.name)} · ${t('Week {n} of {total}', { n: pw.week, total: pw.active.weeks })}` : undefined}
      />
      {/* Four views, each its own kind of information: how the week felt,
          what stays (achievements), where you stand together (rankings),
          and the challenges — the company's, the live ones, the history. */}
      <div className="segmented gam-seg gam-seg--4" role="tablist" aria-label={t('Progress')}>
        {VIEWS.map((v) => (
          <button key={v.id} role="tab" aria-selected={view === v.id} aria-pressed={view === v.id} onClick={() => onView(v.id)}>{t(v.label)}</button>
        ))}
      </div>
      {view === 'achievements' && <Conquistas onGoRankings={() => onView('rankings')} />}
      {view === 'rankings' && <RankingsTab />}
      {view === 'challenges' && <ChallengesTab hasCompany={props.hasCompany} onStartSession={props.onStartSession} />}
      {view === 'summary' && <Summary {...props} />}
    </>
  )
}

function Summary({ hasCompany, state, therapy, onGlCheck, onMood, onExportSelfUse, onStartSession, onStartLaunch, onView }: ProgressProps) {
  const { t } = useI18n()
  const dp = useDataProvider()
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [next, setNext] = useState<AchievementView | null>(null)
  const [challenge, setChallenge] = useState<ChallengeView | null>(null)
  const pw = usePathwayView(state.pathway)

  useEffect(() => {
    let alive = true
    // Each block stays away if its read fails; the summary never waits on them.
    dp.getWallet().then((w) => { if (alive) setWallet(w) }).catch(() => {})
    dp.listMyAchievements().then((a) => { if (alive) setNext(nextAchievement(a)) }).catch(() => {})
    dp.listMyChallenges().then((list) => {
      if (!alive) return
      const live = visibleChallenges(list, hasCompany).filter((c) => isLive(c, Date.now()))
      setChallenge(live.find((c) => c.companyId) ?? live[0] ?? null)
    }).catch(() => {})
    return () => { alive = false }
  }, [dp])

  const last = state.glChecks[state.glChecks.length - 1] ?? null
  const prev = state.glChecks[state.glChecks.length - 2] ?? null
  const due = glCheckDue(state)
  const vas = therapy.link?.vas ?? []
  const felt = vas.length > 1

  /* Two columns that do not wait for each other. They used to be three
     rows of a 3-up grid, a wide block beside a narrow one, and a grid row
     is as tall as its tallest cell — so a short check-in next to a tall
     care block left a 170px hole under the check-in, and another under the
     calendar. Each column is its own stack now, so a block ends where its
     content ends. The desk's extras (care, milestone, challenge) still
     step out below 900px, which leaves the main column alone there. */
  const care = wallet && (
    <section className="glass jr2-card jr2-care" aria-label={t('Your care')}>
      <p className="eyebrow">{t('Your care')}</p>
      <p className="jr2-care__time">{t('You gave {time} to yourself this month', { time: fmtMinutes(wallet.minutesMonth) })}</p>
      <p className="jr2-care__loops"><Icon name="loop" size={22} /> {t('= {n} Loops', { n: String(wallet.loops) })}</p>
      <div className="jr2-spring" />
      <button type="button" className="glass-btn jr2-btn" onClick={onStartSession}>{t('Start a session')}</button>
    </section>
  )

  const milestone = next && (
    <button type="button" className="glass jr2-card gam-milestone" onClick={() => onView('achievements')}>
      <Badge icon={next.icon} tier={next.tier} shape="circle" size={48} locked />
      <span className="gam-milestone__body">
        <span className="eyebrow">{t('Next milestone of care')}</span>
        <span className="gam-milestone__name">{t(copyFor(next.slug).name)}</span>
        <span className="gam-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, ((next.value ?? 0) / next.threshold) * 100)}%` }} /></span>
      </span>
    </button>
  )

  const live = challenge && (
    <div className="jr2-cell"><ChallengeCard c={challenge} onOpen={() => onView('challenges')} /></div>
  )

  return (
    <>
      {pw && state.pathway && (
        <PathwayPanels pathway={state.pathway} active={pw.active} week={pw.week} onStart={onStartLaunch} />
      )}

      <div className="jr2-bento">
       <div className="jr2-bento__main">
        {/* How the week felt, set against the week before it. */}
        <section className="glass jr2-card">
          <h2 className="call2-pane__h">{t('Weekly check-in')}</h2>
          {last ? (
            <GlCheckWeek last={last} previous={prev} />
          ) : (
            <p className="call2-note">{t('No check-in yet.')}</p>
          )}
          {due && (
            <button type="button" className="call2-act jr2-act" onClick={onGlCheck}>{t('Complete your weekly check-in')}</button>
          )}
          {!due && last && <p className="call2-ok">{t('Done for this week.')}</p>}
        </section>

        {/* The one thing on this tab a person writes rather than is told.
            The same calendar as before — the month, a square a day. */}
        <section className="glass jr2-card">
          <h2 className="call2-pane__h">{t('Mood calendar')}</h2>
          <MoodCalendar moods={state.moods} />
          {!state.moods.length && (
            <p className="call2-note">{t('Track your daily mood — it takes 1 second.')}</p>
          )}
          <button type="button" className="glass-btn jr2-btn" onClick={onMood}>{t('How was your day?')}</button>
        </section>

        {felt && <VasPanel points={vas} />}
       </div>

       {(care || milestone || live) && (
         <aside className="jr2-bento__side prog-desk">
           {care}
           {milestone}
           {live}
         </aside>
       )}
      </div>

      {/* The WHO-5 monthly snapshot is gone from self-guided use: a validated
          instrument scored back to the person is a clinical measurement
          (MN-05; Part VII.2). The weekly check-in above is a plain
          self-report shown as the person's own history and nothing more. */}
      {state.logs.length > 0 && (
        <button type="button" className="glass-btn jr2-btn jr2-btn--loose" onClick={onExportSelfUse}>
          {t('View your {month} report', { month: fmtDate(Date.now(), { month: 'long' }) })}
        </button>
      )}
    </>
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
  const today = dayKey(now.getTime())

  return (
    <>
      <div className="cal">
        {Array.from({ length: pad }, (_, i) => <span key={`p${i}`} className="cal__pad" />)}
        {Array.from({ length: days }, (_, i) => {
          const d = new Date(now.getFullYear(), now.getMonth(), i + 1)
          const key = dayKey(d.getTime())
          const m = byDay.get(key)
          return (
            <button
              key={i}
              type="button"
              className={`cal__day${m ? ` cal__day--l${m.level}` : ''}${key === today ? ' cal__day--today' : ''}`}
              aria-current={key === today ? 'date' : undefined}
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
