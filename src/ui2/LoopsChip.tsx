/* ============================================================================
   The Loops chip — what the person has earned, in the top bar.

   It briefly also carried the mood colour, which the check-in folded into
   it. The check-in is gone (see `ui2/Ground.tsx`), so this is a chip again.
   It stays one component rather than the two copies of the same markup it
   was before, because two copies is how they drifted.

   TAPPING IT SAYS WHAT A LOOP IS (POs, 2026-11-03). It was a number with a
   word beside it and no way to find out what the word meant: the one screen
   that explained it was two taps away, and nobody looking at the pill was
   on that screen. The text is `LOOPS_EXPLAINER`, the same constant the
   Loops screen prints as its subtitle — one definition, said in both places
   in the same words.
   ============================================================================ */

import { useState } from 'react'
import { useI18n } from '../i18n'
import { GamDialog } from '../gamification/ui/Dialog'
import { LOOPS_EXPLAINER, LOOPS_TITLE } from '../gamification/copy'

export function LoopsChip({ loops }: { loops: number | null }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  if (loops === null) return null
  return (
    <>
      <button
        type="button"
        className="glass-btn gl-loops"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        /* The number is the label; the dialog's own heading says what it is
           about, so the button does not have to repeat it. */
        aria-label={t('{n} Loops', { n: loops.toLocaleString() })}
      >
        {t('{n} Loops', { n: loops.toLocaleString() })}
      </button>

      {open && (
        <GamDialog labelledBy="gl-loops-title" onClose={() => setOpen(false)} className="gam-about">
          <p className="eyebrow">{t('{n} Loops', { n: loops.toLocaleString() })}</p>
          <h2 id="gl-loops-title" className="display gam-unlock__name">{t(LOOPS_TITLE)}</h2>
          <p className="gam-unlock__line">{t(LOOPS_EXPLAINER)}</p>
          <button className="btn btn--primary" onClick={() => setOpen(false)}>{t('OK')}</button>
        </GamDialog>
      )}
    </>
  )
}
