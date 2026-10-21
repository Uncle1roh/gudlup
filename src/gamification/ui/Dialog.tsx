/* ============================================================================
   One dialog for every gamification popup — the unlock sheet, a benefit, an
   achievement's detail.

   On a phone it is the app's bottom sheet; from 900px wide it becomes a
   centred dialog with every corner rounded, a readable width and its own
   scroll, because a sheet pinned to the bottom of a desktop window reads as
   a cookie banner. Esc, the ✕, the scrim and the browser's back all close it.
   ============================================================================ */

import { useEffect, type ReactNode } from 'react'
import { useI18n } from '../../i18n'
import { Icon } from '../../selfuse/icons'
import { useBackLayer } from '../../selfuse/backStack'

export function GamDialog({
  labelledBy,
  onClose,
  children,
  className = '',
  ownBack = true,
}: {
  labelledBy: string
  onClose: () => void
  children: ReactNode
  className?: string
  /** False when the caller already registers the back gesture itself. */
  ownBack?: boolean
}) {
  const { t } = useI18n()
  useBackLayer(ownBack, onClose)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="sheet-scrim gam-scrim" role="dialog" aria-modal="true" aria-labelledby={labelledBy} onClick={onClose}>
      <div className={`sheet gam-dialog ${className}`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet__grip" aria-hidden="true" />
        <button type="button" className="gam-dialog__x" aria-label={t('Close')} onClick={onClose}>
          <Icon name="close" size={20} />
        </button>
        {children}
      </div>
    </div>
  )
}
