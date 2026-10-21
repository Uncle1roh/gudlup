/* ============================================================================
   The unlock sheet — SPEC §3.4

   A bottom sheet over Home on the NEXT time the app opens, never on the
   post-session screen (GAM-R6, RN-UX-03: that screen keeps its one metric
   and two actions). Several unlocks queue into one sheet with a pager.
   Closing it, either way, marks everything it showed as seen.
   ============================================================================ */

import { useState } from 'react'
import { useI18n } from '../i18n'
import { Badge } from '../gamification/ui/Badge'
import { GamDialog } from '../gamification/ui/Dialog'
import { copyFor } from '../gamification/copy'
import { displayLoops } from '../gamification/economy'
import type { AchievementView } from '../gamification/achievements'

export function UnlockSheet({
  queue,
  onSeeAll,
  onClose,
}: {
  queue: AchievementView[]
  /** "Ver minhas conquistas" */
  onSeeAll: () => void
  /** "Agora não", the scrim, or back */
  onClose: () => void
}) {
  const { t } = useI18n()
  const [i, setI] = useState(0)
  const a = queue[Math.min(i, queue.length - 1)]
  if (!a) return null
  const copy = copyFor(a.slug)
  const many = queue.length > 1

  return (
    <GamDialog labelledBy="gam-unlock-title" onClose={onClose} className="gam-unlock" ownBack={false}>
        <div className="gam-unlock__art" aria-hidden="true">
          <svg className="gam-unlock__orbits" viewBox="0 0 200 120" width="200" height="120">
            <ellipse cx="100" cy="60" rx="96" ry="34" transform="rotate(-12 100 60)" />
            <ellipse cx="100" cy="60" rx="96" ry="34" transform="rotate(12 100 60)" />
          </svg>
          <Badge icon={a.icon} tier={a.tier} shape={a.kind === 'individual' ? 'circle' : 'hexagon'} size={112} />
        </div>
        <p className="eyebrow">{t('Achievement unlocked')}</p>
        <h2 id="gam-unlock-title" className="display gam-unlock__name">{t(copy.name)}</h2>
        <p className="gam-unlock__line">{t(copy.unlocked)}</p>
        {a.bonusLoopsCenti > 0 && (
          <p className="gam-pill">{t('+{n} Loops bonus', { n: String(displayLoops(a.bonusLoopsCenti)) })}</p>
        )}
        {many && (
          <div className="gam-pager" role="group" aria-label={t('{i} of {n}', { i: String(i + 1), n: String(queue.length) })}>
            <button className="btn btn--quiet" disabled={i === 0} onClick={() => setI(i - 1)}>{t('Previous')}</button>
            <span className="small muted">{t('{i} of {n}', { i: String(i + 1), n: String(queue.length) })}</span>
            <button className="btn btn--quiet" disabled={i >= queue.length - 1} onClick={() => setI(i + 1)}>{t('Next')}</button>
          </div>
        )}
        <button className="btn btn--primary" onClick={onSeeAll}>{t('See my achievements')}</button>
        <button className="btn btn--ghost" onClick={onClose}>{t('Not now')}</button>
    </GamDialog>
  )
}
