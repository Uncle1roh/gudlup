/* One question, asked once: is this the phone's layout?

   900px is the cut the brief sets, and every sheet in the redesign uses the
   same number. A hook rather than a media query because two of the screens
   swap a COMPONENT at that width, not a style — the mood grid becomes five
   faces, and CSS cannot do that. */

import { useEffect, useState } from 'react'

export const NARROW = 900

export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(`(max-width: ${NARROW - 1}px)`).matches,
  )

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${NARROW - 1}px)`)
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    on()
    return () => mq.removeEventListener('change', on)
  }, [])

  return narrow
}
