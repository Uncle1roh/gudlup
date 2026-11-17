/* ============================================================================
   One dialog for every gamification popup — the unlock sheet, a benefit, an
   achievement's detail, what a LOOP is, the mood calendar.

   On a phone it is the app's bottom sheet; from 900px wide it becomes a
   centred dialog with every corner rounded, a readable width and its own
   scroll, because a sheet pinned to the bottom of a desktop window reads as
   a cookie banner. Esc, the ✕, the scrim and the browser's back all close it.

   ---------------------------------------------------------------------------
   WHY IT IS A PORTAL

   Two of these open from the TOP BAR — the LOOPS chip and the glasses — and
   on a phone their OK button could not be tapped at all. The scrim is
   `position: fixed` with `z-index: 60`, and the bottom rail is fixed with
   `z-index: 40`, so on paper the dialog wins. It did not: `.gl-top--over`
   carries `z-index: 5`, which makes it a STACKING CONTEXT, and a z-index
   inside one is only meaningful against its siblings. The whole dialog
   therefore painted at the header's level 5 — underneath a rail at 40.

   Measured on a 390×844 phone: the OK button sat at y 784–837, the rail at
   770–832, and `elementFromPoint` at the centre of OK returned one of the
   rail's icons. The button was on screen, looked enabled, and belonged to
   something else.

   Raising the header's z-index would have fixed those two popups and left
   the trap in place for the next ancestor that gets a transform, a filter
   or a `will-change` — any of which makes a stacking context too. So the
   dialog is rendered OUT of wherever it was declared and into the surface
   root, as a sibling of the rail, where its z-index means what it says.

   NOT into `document.body`: the stylesheets scope these popups by descent
   (`.gl-root .cal__month`, `.su-studio .gam-dialog`), so a dialog hoisted
   clear of the surface root would come out unstyled. It goes to the nearest
   `.gl-root` / `.su-studio` — far enough to escape the stacking context,
   near enough to keep its clothes — and falls back to the body only where
   neither exists, which is no surface this ships with.
   ============================================================================ */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../../i18n'
import { Icon } from '../../selfuse/icons'
import { useBackLayer } from '../../selfuse/backStack'

/** The surfaces whose stylesheets reach these popups by descent. */
const SURFACE_ROOT = '.gl-root, .su-studio'

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

  /* WHERE THE DIALOG GOES. An empty anchor is rendered where the caller put
     this component, and the dialog is portalled into that anchor's own
     surface root — so a caller still writes `<GamDialog>` next to the button
     that opens it, and nothing has to know it will be mounted elsewhere.

     `useLayoutEffect`, not `useEffect`: it runs after the anchor is in the
     DOM and BEFORE the browser paints, so setting the host re-renders in the
     same frame. With a plain effect the first frame would have no dialog in
     it, and a popup that flickers is a popup people tap twice. */
  const anchor = useRef<HTMLSpanElement | null>(null)
  const [host, setHost] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const root = anchor.current?.closest(SURFACE_ROOT)
    setHost((root as HTMLElement | null) ?? document.body)
  }, [])

  /* With no DOM there is nowhere to portal TO: a server render, and the
     suite that renders this sheet to a string (`tools/test-gam-ui.ts`). The
     dialog is returned in place there, which is exactly what it did before
     — no stacking context to escape when there is no screen. */
  const inline = typeof document === 'undefined'

  const dialog = (
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

  if (inline) return dialog

  return (
    <>
      <span ref={anchor} hidden />
      {host ? createPortal(dialog, host) : null}
    </>
  )
}
