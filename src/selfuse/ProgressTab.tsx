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

   On a desk the summary is a bento grid (docs/desktop-mockups, proposal C):
   the week beside your care, the mood calendar beside the next milestone and
   the live challenge. Those three are the desk's extra — below 1100px they
   are hidden and the phone keeps its two cards.
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
import { Journey } from '../ui2/Journey'
import { TopBar, PageTitle } from '../ui2/TopBar'
import { Badge } from '../gamification/ui/Badge'
import { copyFor } from '../gamification/copy'
import { fmtMinutes, nextAchievement, type AchievementView } from '../gamification/achievements'
import { isLive, type ChallengeView } from '../gamification/challenges'
import type { Wallet } from '../gamification/economy'

export type ProgressView = 'summary' | 'achievements' | 'rankings' | 'challenges'

interface ProgressProps {
  /** First name, when the account gives one — the top bar prints it. */
  name: string | null
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
  return (
    <>
      <TopBar name={props.name} />
      <PageTitle title={t('My journey')} />
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
      {view === 'challenges' && <ChallengesTab onStartSession={props.onStartSession} />}
      {view === 'summary' && <Summary {...props} />}
    </>
  )
}

function Summary({ state, therapy, onGlCheck, onMood, onExportSelfUse, onStartSession, onStartLaunch, onView }: ProgressProps) {
  const { t } = useI18n()
  const dp = useDataProvider()
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [next, setNext] = useState<AchievementView | null>(null)
  const [challenge, setChallenge] = useState<ChallengeView | null>(null)

  useEffect(() => {
    let alive = true
    // Each block stays away if its read fails; the summary never waits on them.
    dp.getWallet().then((w) => { if (alive) setWallet(w) }).catch(() => {})
    dp.listMyAchievements().then((a) => { if (alive) setNext(nextAchievement(a)) }).catch(() => {})
    dp.listMyChallenges().then((list) => {
      if (!alive) return
      const live = list.filter((c) => isLive(c, Date.now()))
      setChallenge(live.find((c) => c.companyId) ?? live[0] ?? null)
    }).catch(() => {})
    return () => { alive = false }
  }, [dp])

  const last = state.glChecks[state.glChecks.length - 1] ?? null
  const prev = state.glChecks[state.glChecks.length - 2] ?? null
  const blank = !state.glChecks.length && !state.moods.length

  return (
    <>
      {/* The mockup's four panels: the pathway ring, the twelve weeks, how
          the sessions felt, and the check-in. Each one stands only while the
          thing behind it exists. The app's own blocks follow below — they
          have no panel in the mockup and are not inventions to drop. */}
      <Journey
        pathway={state.pathway}
        therapy={therapy}
        glDue={glCheckDue(state)}
        onGlCheck={onGlCheck}
        onStart={onStartLaunch}
      />

      {/* The phone's empty state. On a desk each block of the grid carries
          its own instead — one empty card across the screen read as broken. */}
      {blank && (
        <div className="empty prog-phone">
          <p>{t('Nothing here yet.')}</p>
          <p className="small muted">
            {t('Your check-in and your mood calendar appear here once you start filling them in.')}
          </p>
          <button className="btn btn--primary" onClick={onGlCheck}>{t('Complete your weekly check-in')}</button>
        </div>
      )}

      <div className={`prog-bento${blank ? ' prog-desk' : ''}`}>
        {/* How the week felt, set against the week before it. */}
        <section className="card prog-b8">
          <h3 className="home__sect">{t('This week')}</h3>
          {last ? (
            <>
              <GlCheckWeek last={last} previous={prev} />
            </>
          ) : (
            <p className="small muted">{t('No check-in yet.')}</p>
          )}
          {glCheckDue(state) && (
            <button className="btn btn--primary" onClick={onGlCheck}>{t('Complete your weekly check-in')}</button>
          )}
        </section>

        {wallet && (
          <section className="gam-care prog-b4 prog-desk" aria-label={t('Your care')}>
            <p className="eyebrow">{t('Your care')}</p>
            <p className="gam-care__time">{t('You gave {time} to yourself this month', { time: fmtMinutes(wallet.minutesMonth) })}</p>
            <p className="gam-care__loops"><Icon name="loop" size={22} /> {t('= {n} Loops', { n: String(wallet.loops) })}</p>
            <button className="btn btn--ghost gam-care__start" onClick={onStartSession}>{t('Start a session')}</button>
          </section>
        )}

        {/* The one thing on this tab a person writes rather than is told. */}
        <section className="card prog-b6">
          <h3 className="home__sect">{t('Mood calendar')}</h3>
          {state.moods.length ? (
            <MoodCalendar moods={state.moods} />
          ) : (
            <p className="small muted">{t('Track your daily mood — it takes 1 second.')}</p>
          )}
          <button className="btn btn--ghost" onClick={onMood}>{t('How was your day?')}</button>
        </section>

        {(next || challenge) && (
          <div className="prog-b6 prog-col prog-desk">
            {next && (
              <button className="card gam-milestone" onClick={() => onView('achievements')}>
                <Badge icon={next.icon} tier={next.tier} shape="circle" size={48} locked />
                <span className="gam-milestone__body">
                  <span className="eyebrow">{t('Next milestone of care')}</span>
                  <span className="gam-milestone__name">{t(copyFor(next.slug).name)}</span>
                  <span className="gam-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, ((next.value ?? 0) / next.threshold) * 100)}%` }} /></span>
                </span>
              </button>
            )}
            {challenge && <ChallengeCard c={challenge} onOpen={() => onView('challenges')} />}
          </div>
        )}
      </div>

      {/* The WHO-5 monthly snapshot is gone from self-guided use: a validated
          instrument scored back to the person is a clinical measurement
          (MN-05; Part VII.2). The weekly check-in above is a plain
          self-report shown as the person's own history and nothing more. */}
      {state.logs.length > 0 && (
        <button className="btn btn--quiet" onClick={onExportSelfUse}>
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
