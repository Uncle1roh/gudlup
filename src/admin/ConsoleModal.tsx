/* ============================================================================
   Making something new happens in a dialog

   Every "+ Nuovo …" in the commercial console used to do one of two things,
   and neither of them was the same as the other:

     · the small ones (a company, a promo code) unfolded a row of inputs
       ABOVE the table, which pushed the list down and gave a four-field form
       no room to be more than four fields;
     · the big ones (a campaign, a benefit, a template) REPLACED the list
       with a full-page editor, so the thing you were adding to disappeared
       while you added to it, and "back" was a button you had to find.

   One behaviour now: the list stays where it is and the form opens over it.
   That is the rule for every create in this console.

   What this gives, beyond consistency: a dialog can be as tall as it needs
   and scrolls inside itself, the list is still visible behind as the thing
   being added to, and Escape and the backdrop are both ways out — which a
   row of inputs never had.
   ============================================================================ */

import { useEffect, type ReactNode } from 'react'

export function ConsoleModal({
  title,
  /** A line under the title, when the form needs one. */
  note,
  onClose,
  /** Wider for the editors that carry a live preview beside the fields. */
  wide = false,
  children,
}: {
  title: string
  note?: string
  onClose: () => void
  wide?: boolean
  children: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    /* The page behind must not scroll while a dialog is open: two scrollbars
       and the wheel moving the wrong one is the usual result. */
    const was = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = was
    }
  }, [onClose])

  return (
    <div className="adm-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={onClose}>
      {/* mousedown on the card stops the backdrop handler, so a drag that
          starts inside the form and ends outside it does not close it */}
      <div className={`adm-modal__card${wide ? ' adm-modal__card--wide' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
        <header className="adm-modal__head">
          <div>
            <h2 className="adm-modal__title">{title}</h2>
            {note && <p className="adm-modal__note">{note}</p>}
          </div>
          <button className="adm-modal__x" onClick={onClose} aria-label="×">×</button>
        </header>
        <div className="adm-modal__body">{children}</div>
      </div>
    </div>
  )
}
