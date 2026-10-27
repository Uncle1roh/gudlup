/* ============================================================================
   The five themes, dressed

   The mockup's `I` (icon paths) and `T` (tints) tables, mapped onto the five
   themes the catalogue really has. Four land on their namesake; `balance`
   takes the pair left over from the mockup's "resilience", which is not a
   theme here. The mockup's "stress" pair is unused — "Menos estresse" is not
   a category of this library either.

   `P` is the mockup's list of background positions: one photograph, moved
   under each tile, which is how a shelf of different-looking covers comes
   out of a single image.
   ============================================================================ */

import type { SelfUseTheme } from '../data/selfuse'

export const THEME_ICON: Record<SelfUseTheme, string> = {
  calm: 'M3 12c3-4 6 4 9 0s6 4 9 0',
  focus: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  energy: 'M13 3L5 14h6l-1 7 8-11h-6z',
  growth: 'M12 21v-9M12 12c0-4 3-7 7-7 0 4-3 7-7 7zM12 15c0-3-2.5-5-6-5 0 3 2.5 5 6 5z',
  balance: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z',
}

export const THEME_TINT: Record<SelfUseTheme, string> = {
  calm: 'rgba(0,155,119,.42)',
  focus: 'rgba(36,101,171,.5)',
  energy: 'rgba(232,157,100,.45)',
  growth: 'rgba(122,198,155,.38)',
  balance: 'rgba(244,240,190,.22)',
}

export const TILE_POSITIONS = ['8% 30%', '30% 55%', '55% 40%', '70% 60%', '90% 30%', '45% 80%', '20% 70%']

export function tilePosition(i: number): string {
  return TILE_POSITIONS[i % TILE_POSITIONS.length]
}
