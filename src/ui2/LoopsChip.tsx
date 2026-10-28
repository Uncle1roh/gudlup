/* ============================================================================
   The Loops chip

   Two jobs, and the second one is new. It shows what the person has earned,
   and it is where the mood colour LIVES once the check-in has run: the
   reveal folds its glasses into this pill (`ui2/MoodReveal.tsx`) and the
   pill keeps the colour.

   Which is why it is one component rather than the two copies of the same
   markup it used to be, in `ui2/Home.tsx` and `ui2/TopBar.tsx`. The reveal
   needs to know where to fly, and a chip that is drawn twice has two
   answers; whichever one is mounted registers itself here.
   ============================================================================ */

import { useEffect, useRef } from 'react'
import { useI18n } from '../i18n'
import { useMood } from '../mood/MoodProvider'

export function LoopsChip({ loops }: { loops: number | null }) {
  const { t } = useI18n()
  const mood = useMood()
  const el = useRef<HTMLSpanElement | null>(null)

  /* The getter, not the rect: the chip moves with the layout — the header
     reflows at 900px, the page scrolls — and the reveal needs where it is
     at the moment it flies, not where it was when it mounted. */
  useEffect(() => {
    mood.setChipRect(() => el.current?.getBoundingClientRect() ?? null)
    return () => mood.setChipRect(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loops === null) return null

  /* `light` is the engine's own answer to "can this carry dark text"
     (mood/tokens.ts uses the same number), so the chip never has to guess. */
  const tone = mood.chipTone
  return (
    <span
      ref={el}
      className={`glass-btn gl-loops${tone ? ' is-mood' : ''}`}
      style={tone ? { background: tone.hex, color: tone.light ? '#1F2B2A' : '#FAF8DF', borderColor: 'transparent' } : undefined}
      title={tone ? t('The colour of your check-in.') : undefined}
    >
      {t('{n} Loops', { n: loops.toLocaleString() })}
    </span>
  )
}
