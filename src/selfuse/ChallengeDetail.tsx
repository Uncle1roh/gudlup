/* ============================================================================
   A challenge, opened — SPEC §5.5

   Status, dates, what it asks, how far along it is, how it works, what it
   gives. A collective shows the shared progress, the person's own part and
   how many take part — never anyone's name, never a ranking of people. A
   company's challenge shows the whole company's share only.

   "Sessões SOS não contam: use-as sempre que precisar." is in the checklist
   on every challenge, so nobody hesitates to use SOS because of a game.
   ============================================================================ */

import { useI18n } from '../i18n'
import { Icon } from './icons'
import { Badge } from '../gamification/ui/Badge'
import { fmtMinutes } from '../gamification/achievements'
import { shareOf, type ChallengeView } from '../gamification/challenges'
import { asIcon, challengeEyebrow, challengeProgressText, challengeRewardText } from './ChallengeCard'

export function ChallengeDetail({ c, onBack, onStart, now = Date.now() }: { c: ChallengeView; onBack: () => void; onStart: () => void; now?: number }) {
  const { t, d } = useI18n()
  const share = shareOf(c)
  const reward = challengeRewardText(t, c)
  const live = c.startsAt <= now && c.endsAt > now && (c.status === 'active' || c.status === 'scheduled')
  const status = c.startsAt > now ? t('Challenge scheduled') : live ? t('Challenge active') : t('Challenge ended')
  const done = c.format === 'individual' ? c.myCompletedAt !== null : c.goalReachedAt !== null
  const range = `${d(c.startsAt, { day: 'numeric', month: 'short' })} – ${d(c.endsAt, { day: 'numeric', month: 'short' })}`
  const R = 52
  const C = 2 * Math.PI * R

  return (
    <div className="su-page gam-detail">
      <button className="sess-full__back gam-detail__back" onClick={onBack}>‹ {t('Back')}</button>
      <div className="gam-detail__head">
        <Badge icon={asIcon(c.badgeIcon)} tier={c.companyId ? 'empresa' : c.format === 'collective' ? 'coletiva' : 'broto'}
               shape={c.format === 'collective' ? 'hexagon' : 'circle'} size={64} />
        <span className={`gam-chip${live ? ' gam-chip--live' : ''}`}>{status}</span>
        {c.companyId && c.companyName && <span className="gam-chip gam-chip--company">{c.companyName}</span>}
      </div>
      <p className="eyebrow">{challengeEyebrow(t, c, now)} · {range}</p>
      <h1 className="display su-h1">{c.title}</h1>
      {c.description && <p className="lead">{c.description}</p>}

      <section className="card gam-ring" aria-label={t('Progress')}>
        <svg viewBox="0 0 120 120" width="140" height="140" aria-hidden="true">
          <circle cx="60" cy="60" r={R} className="gam-ring__track" />
          <circle cx="60" cy="60" r={R} className="gam-ring__fill" strokeDasharray={`${C * share} ${C}`} transform="rotate(-90 60 60)" />
        </svg>
        <div className="gam-ring__text">
          {/* A company share goal reads as the company's own % ("41 %, goal 60 %");
              everything else as the share of the goal reached. */}
          <span className="gam-ring__pct">{Math.floor(c.goalKind === 'share_reaching_min' ? c.collectiveValue ?? 0 : share * 100)}%</span>
          <span className="small">{challengeProgressText(t, c)}</span>
          {c.format === 'collective' && (
            <>
              <span className="small">{t('Your part: {value}', {
                value: c.metric === 'minutes_listened'
                  ? fmtMinutes(c.myProgress)
                  : t('{value} of {goal} sessions', { value: String(c.myProgress), goal: String(c.perPersonMin ?? 1) }),
              })}</span>
              {c.participants !== null && <span className="small muted">{t('{n} people taking part', { n: c.participants.toLocaleString('pt-BR') })}</span>}
            </>
          )}
          {done && <span className="small gam-ring__done">{c.format === 'individual' ? t('You completed it.') : t('The goal was reached together.')}</span>}
        </div>
      </section>

      <section className="card">
        <h3 className="home__sect">{t('How it works')}</h3>
        <ul className="gam-checklist">
          <li><Icon name="check" size={18} /> {goalLine(t, c)}</li>
          <li><Icon name="check" size={18} /> {t('Sessions that end between {start} and {end} count.', { start: d(c.startsAt, { day: 'numeric', month: 'long' }), end: d(c.endsAt, { day: 'numeric', month: 'long' }) })}</li>
          {c.metric === 'sessions_in_time_window' && c.windowStartHour !== null && c.windowEndHour !== null && (
            <li><Icon name="check" size={18} /> {t('Sessions started between {a}h and {b}h.', { a: String(c.windowStartHour), b: String(c.windowEndHour) })}</li>
          )}
          <li><Icon name="check" size={18} /> {t('SOS sessions do not count: use them whenever you need.')}</li>
          <li><Icon name="check" size={18} /> {t('Nothing is lost: progress never goes back.')}</li>
        </ul>
        {c.companyId && <p className="small muted">{t('The company only sees the overall result. For identified benefits, you decide whether to share your name.')}</p>}
      </section>

      {reward && (
        <section className="card gam-reward">
          <p className="eyebrow">{t('Reward')}</p>
          <p className="gam-reward__text">{reward}</p>
          {c.rewardBenefit && c.myBenefitGranted && <p className="small">{t('Unlocked — find it in Benefits.')}</p>}
        </section>
      )}

      {live && (
        <div className="gam-sticky">
          <button className="btn btn--primary" onClick={onStart}>{t('Start a session')}</button>
        </div>
      )}
    </div>
  )
}

function goalLine(t: ReturnType<typeof useI18n>['t'], c: ChallengeView): string {
  const goal = c.metric === 'minutes_listened' ? fmtMinutes(c.goalValue) : String(c.goalValue)
  if (c.format === 'collective' && c.goalKind === 'share_reaching_min') {
    return t('{goal}% of the company complete {min} sessions each.', { goal: String(c.goalValue), min: String(c.perPersonMin ?? 1) })
  }
  const what = c.metric === 'minutes_listened' ? t('{goal} of listening', { goal })
    : c.metric === 'deep_sessions_completed' ? t('{goal} Deep sessions', { goal })
    : c.metric === 'pathway_completed' ? t('{goal} pathways finished', { goal })
    : t('{goal} completed sessions', { goal })
  if (c.format === 'collective') return t('Together: {what}. Your part counts from {min}.', { what, min: String(c.perPersonMin ?? 1) })
  return t('Your goal: {what}.', { what })
}
