/* ============================================================================
   The Loops chip — what the person has earned, in the top bar.

   It briefly also carried the mood colour, which the check-in folded into
   it. The check-in is gone (see `ui2/Ground.tsx`), so this is a chip again.
   It stays one component rather than the two copies of the same markup it
   was before, because two copies is how they drifted.
   ============================================================================ */

import { useI18n } from '../i18n'

export function LoopsChip({ loops }: { loops: number | null }) {
  const { t } = useI18n()
  if (loops === null) return null
  return (
    <span className="glass-btn gl-loops">
      {t('{n} Loops', { n: loops.toLocaleString() })}
    </span>
  )
}
