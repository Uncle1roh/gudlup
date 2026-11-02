/* ============================================================================
   The top bar every screen of the surface shares

   ONE bar, not two. The library had its own header — the mark, the day, and
   "Bom dia, Marina" under it — while every other screen had this one, which
   put the date on the left and the person's name on the RIGHT, beside the
   Loops pill. So the one personal line on the screen moved from corner to
   corner as you changed tab, and on the deep screens it read as a label on
   the pill rather than as a greeting.

   The library's corner won, because it is the one a person opens the app on:
   the mark, the day, and the greeting with their name, in that order, down
   the left. The Loops pill keeps the right.

   The mockup set the wordmark above the date on the deep screens, and the
   port did too — but the rail already carries the mark, two centimetres to
   the left of it. Below 900px the rail becomes the tab bar at the foot of
   the screen and its square is hidden (shell.css, "the phone"), which is why
   `.gl-phonemark` is here: on a phone this is the top left corner.
   ============================================================================ */

import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { useDataProvider } from '../data/provider'
import { BrandIcon } from '../components/Brand'
import { greeting } from '../selfuse/greeting'
import { LoopsChip } from './LoopsChip'
import { useBrandVariant } from './Shell'

export function TopBar({ name, over }: {
  name: string | null
  /** The library draws a picture behind its first screenful; the bar has to
      stand above it rather than under it. */
  over?: boolean
}) {
  const { t, d } = useI18n()
  const dp = useDataProvider()
  const [loops, setLoops] = useState<number | null>(null)
  const variant = useBrandVariant()

  /* Read-only, and a failure leaves the pill out rather than showing a zero
     that is not the person's balance. */
  useEffect(() => {
    let alive = true
    void dp.getWallet()
      .then((w) => { if (alive) setLoops(w.loops) })
      .catch(() => { if (alive) setLoops(null) })
    return () => { alive = false }
  }, [dp])

  return (
    <header className={`gl-top${over ? ' gl-top--over' : ''}`}>
      <span className="gl-top__who">
        <span className="gl-phonemark glass" aria-hidden="true"><BrandIcon variant={variant} /></span>
        <span className="gl-top__lines">
          <span className="gl-top__day">
            {d(Date.now(), { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
          {/* `anywhere` in the stylesheet, because a name is whatever a person
              typed: one unbroken word longer than a phone is still their name,
              and it folds rather than running off the side of the screen. */}
          <span className="gl-top__hello">
            {name ? `${t(greeting())}, ${name}` : t(greeting())}
          </span>
        </span>
      </span>

      {/* No initials disc. It named the person whose name is printed three
          centimetres to the left of it, and it was not a button. */}
      <LoopsChip loops={loops} />
    </header>
  )
}

/** The screen title and its one line under it, as the deep mockups set it. */
export function PageTitle({ title, note }: { title: string; note?: string }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '28px 8px 0' }}>
      <h1 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 400, fontSize: 48, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
        {title}
      </h1>
      {note && <p style={{ margin: 0, fontSize: 16, color: 'var(--ink-2)' }}>{note}</p>}
    </section>
  )
}
