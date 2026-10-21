/* ============================================================================
   The one challenge card on Home — SPEC §5.5

   At most one, under the greeting: a company challenge first, then the one
   closest to completion, then the one ending soonest (PLAN A5). The end
   date is said in whole days, in a neutral tone — never a ticking clock.
   ============================================================================ */

import { useI18n } from '../i18n'
import { Badge } from '../gamification/ui/Badge'
import { displayLoops } from '../gamification/economy'
import { fmtMinutes } from '../gamification/achievements'
import { daysLeft, shareOf, type ChallengeView } from '../gamification/challenges'
import type { IconName } from './icons'

/** "3h 12min of 5h", "2 of 5 sessions", "60% of the company" — never points. */
export function challengeProgressText(t: ReturnType<typeof useI18n>['t'], c: ChallengeView): string {
  if (c.format === 'collective' && c.goalKind === 'share_reaching_min') {
    return t('{pct}% of the company · goal {goal}%', { pct: String(Math.floor(c.collectiveValue ?? 0)), goal: String(c.goalValue) })
  }
  const v = c.format === 'collective' ? c.collectiveValue ?? 0 : c.myProgress
  if (c.metric === 'minutes_listened') return t('{value} of {goal}', { value: fmtMinutes(v), goal: fmtMinutes(c.goalValue) })
  if (c.metric === 'pathway_completed') return t('{value} of {goal} pathways', { value: String(v), goal: String(c.goalValue) })
  return t('{value} of {goal} sessions', { value: String(v), goal: String(c.goalValue) })
}

export function challengeRewardText(t: ReturnType<typeof useI18n>['t'], c: ChallengeView): string | null {
  const parts: string[] = []
  if (c.rewardBonusLoopsCenti) parts.push(t('+{n} Loops', { n: String(displayLoops(c.rewardBonusLoopsCenti)) }))
  if (c.rewardBenefit) parts.push(c.rewardBenefit.title)
  return parts.length ? parts.join(' · ') : null
}

export function challengeEyebrow(t: ReturnType<typeof useI18n>['t'], c: ChallengeView, now: number): string {
  const owner = c.companyId ? t('Your company’s challenge') : t('Good Loop challenge')
  if (c.startsAt > now) return `${owner} · ${t('starts in {n} days', { n: String(daysLeft(c.startsAt, now)) })}`
  const n = daysLeft(c.endsAt, now)
  return `${owner} · ${n === 1 ? t('1 day to go') : t('{n} days to go', { n: String(n) })}`
}

export const asIcon = (s: string): IconName => s as IconName

export function ChallengeCard({ c, onOpen, now = Date.now() }: { c: ChallengeView; onOpen: () => void; now?: number }) {
  const { t } = useI18n()
  const share = shareOf(c)
  const reward = challengeRewardText(t, c)
  return (
    <button className={`card gam-challenge${c.companyId ? ' gam-challenge--company' : ''}`} onClick={onOpen}>
      <Badge icon={asIcon(c.badgeIcon)} tier={c.companyId ? 'empresa' : c.format === 'collective' ? 'coletiva' : 'broto'}
             shape={c.format === 'collective' ? 'hexagon' : 'circle'} size={56} />
      <span className="gam-challenge__body">
        <span className="eyebrow">{challengeEyebrow(t, c, now)}</span>
        <span className="gam-challenge__title">{c.title}</span>
        <span className="gam-bar" aria-hidden="true"><span style={{ width: `${share * 100}%` }} /></span>
        <span className="small">{challengeProgressText(t, c)}</span>
        {reward && <span className="small gam-challenge__reward">{reward}</span>}
      </span>
    </button>
  )
}
