/* ============================================================================
   Progress › Desafios — every challenge in one place

   The company's challenges first, under their own heading; then Good Loop's
   live ones; then the history — every challenge the person took part in,
   with how it went. "How it went" is told kindly: a challenge not finished
   is "you took part", never a failure (GAM-R1). Opening one shows the same
   detail as the card on Home.
   ============================================================================ */

import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { useDataProvider } from '../data/provider'
import { Badge } from '../gamification/ui/Badge'
import { displayLoops } from '../gamification/economy'
import { isLive, type ChallengeView } from '../gamification/challenges'
import { ChallengeCard, asIcon, challengeProgressText } from './ChallengeCard'
import { ChallengeDetail } from './ChallengeDetail'

export function ChallengesTab({ onStartSession }: { onStartSession: () => void }) {
  const { t, d } = useI18n()
  const dp = useDataProvider()
  const [list, setList] = useState<ChallengeView[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    dp.listMyChallenges().then((r) => { if (alive) setList(r) }).catch(() => { if (alive) setList([]) })
    return () => { alive = false }
  }, [dp])

  if (!list) return <p className="small muted" aria-busy="true">{t('Loading…')}</p>
  const now = Date.now()
  const opened = list.find((c) => c.id === open)
  if (opened) return <ChallengeDetail c={opened} onBack={() => setOpen(null)} onStart={onStartSession} now={now} />

  const upcoming = (c: ChallengeView) => c.startsAt > now && (c.status === 'scheduled' || c.status === 'active')
  const company = list.filter((c) => c.companyId && (isLive(c, now) || upcoming(c)))
  const publicLive = list.filter((c) => !c.companyId && (isLive(c, now) || upcoming(c)))
  const past = list.filter((c) => c.endsAt <= now || c.status === 'ended' || c.status === 'settled')
    .sort((a, b) => b.endsAt - a.endsAt)

  return (
    <div className="gam-stack">
      {company.length > 0 && (
        <section className="gam-section" aria-labelledby="gam-ch-company">
          <h2 id="gam-ch-company" className="home__sect">{t('From your company')}</h2>
          <ul className="gam-list">{company.map((c) => <li key={c.id}><ChallengeCard c={c} onOpen={() => setOpen(c.id)} now={now} /></li>)}</ul>
          <p className="small muted">{t('The company only sees the overall result. For identified benefits, you decide whether to share your name.')}</p>
        </section>
      )}

      <section className="gam-section" aria-labelledby="gam-ch-live">
        <h2 id="gam-ch-live" className="home__sect">{t('Active challenges')}</h2>
        {publicLive.length
          ? <ul className="gam-list">{publicLive.map((c) => <li key={c.id}><ChallengeCard c={c} onOpen={() => setOpen(c.id)} now={now} /></li>)}</ul>
          : <p className="small muted">{t('No Good Loop challenge right now. New ones appear here.')}</p>}
      </section>

      <section className="gam-section" aria-labelledby="gam-ch-past">
        <h2 id="gam-ch-past" className="home__sect">{t('History')}</h2>
        {past.length === 0 ? (
          <p className="small muted">{t('Challenges you take part in stay here when they end.')}</p>
        ) : (
          <ul className="gam-list">
            {past.map((c) => {
              const done = c.format === 'individual' ? c.myCompletedAt !== null : c.goalReachedAt !== null && c.myRewardedAt !== null
              return (
                <li key={c.id}>
                  <button className="card gam-history" onClick={() => setOpen(c.id)}>
                    <Badge icon={asIcon(c.badgeIcon)} tier={c.companyId ? 'empresa' : c.format === 'collective' ? 'coletiva' : 'broto'}
                           shape={c.format === 'collective' ? 'hexagon' : 'circle'} size={48} locked={!done} />
                    <span className="gam-history__body">
                      <span className="eyebrow">{c.companyId ? t('Your company’s challenge') : t('Good Loop challenge')} · {d(c.endsAt, { month: 'long', year: 'numeric' })}</span>
                      <span className="gam-history__title">{c.title}</span>
                      <span className="small">
                        {done
                          ? [t('Completed'), c.rewardBonusLoopsCenti ? t('+{n} Loops', { n: String(displayLoops(c.rewardBonusLoopsCenti)) }) : null, c.myBenefitGranted && c.rewardBenefit ? c.rewardBenefit.title : null].filter(Boolean).join(' · ')
                          : `${t('You took part')} · ${challengeProgressText(t, c)}`}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
