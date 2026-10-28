/* ============================================================================
   "É assim que você está vendo o mundo" — the reveal

   The check-in ends in a claim, not a swatch: the colour the two sliders
   produced is the colour of the lenses you are wearing right now. So the
   commit opens a pair of glasses in that colour, says so, and then folds
   itself into the Loops chip — which keeps the colour from then on.

   WHY IT FOLDS INTO THE CHIP rather than fading out. The chip is where the
   colour lives for the rest of the session, and a panel that vanishes leaves
   the person to notice that on their own. Flying it to the place it will
   live answers "where did that go" before it is asked.

   The flight is a FLIP: the panel is laid out centred, its rect is measured,
   the chip's rect is read from the provider (the chip registers a getter —
   it moves with the layout, so a position captured earlier would be stale),
   and the panel is transformed from one to the other in a single transition.
   No layout is animated, so it stays on the compositor.

   Reduced motion gets the same three beats with no travel: the panel appears,
   holds, and the chip takes the colour. The information is in the words and
   the colour, never in the movement.
   ============================================================================ */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { useMood } from '../mood/MoodProvider'

/** How long the glasses are held before they fly, and how long the flight is. */
const HOLD_MS = 1500
const FLY_MS = 620

function prefersReducedMotion(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

/**
 * A pair of glasses, lenses tinted with the colour.
 *
 * Drawn rather than an asset: the lens colour is the whole point, so it has
 * to be a value this component is handed, and the frame has to read on both
 * a light and a dark lens without a second file.
 */
function Glasses({ colour }: { colour: string }) {
  return (
    <svg className="mr2__glasses" viewBox="0 0 240 110" role="img" aria-hidden="true">
      <defs>
        {/* The lens is the mood colour, brighter at the top-left where the
            light is on every other surface here. */}
        <radialGradient id="mr2-lens" cx="36%" cy="30%" r="78%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="45%" stopColor={colour} stopOpacity="0.92" />
          <stop offset="100%" stopColor={colour} stopOpacity="1" />
        </radialGradient>
      </defs>
      {/* bridge and temples, behind the lenses */}
      <path
        d="M96 46c8-6 40-6 48 0M24 40 8 28M216 40l16-12"
        fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round"
      />
      {[62, 178].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="56" r="38" fill="url(#mr2-lens)" />
          <circle cx={cx} cy="56" r="38" fill="none" stroke="currentColor" strokeWidth="7" />
        </g>
      ))}
    </svg>
  )
}

export function MoodReveal() {
  const { t } = useI18n()
  const mood = useMood()
  const panel = useRef<HTMLDivElement | null>(null)
  const [flying, setFlying] = useState(false)
  const colour = mood.reveal?.hex ?? null

  /* The flight, as a transform measured at the moment it starts. */
  useLayoutEffect(() => {
    if (!colour) { setFlying(false); return }
    const reduced = prefersReducedMotion()
    const hold = window.setTimeout(() => {
      const node = panel.current
      const to = mood.chipRect()
      if (node && to && !reduced) {
        const from = node.getBoundingClientRect()
        const dx = (to.left + to.width / 2) - (from.left + from.width / 2)
        const dy = (to.top + to.height / 2) - (from.top + from.height / 2)
        /* Scaled to the chip's width, not to nothing: it becomes the chip
           rather than disappearing on the way to it. */
        const scale = Math.max(0.06, to.width / Math.max(1, from.width))
        node.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`
        node.style.opacity = '0'
      }
      setFlying(true)
    }, HOLD_MS)
    const done = window.setTimeout(() => mood.endReveal(), HOLD_MS + (reduced ? 160 : FLY_MS))
    return () => { window.clearTimeout(hold); window.clearTimeout(done) }
    /* `mood` is rebuilt every render; the reveal is keyed on the colour. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colour])

  /* A reveal that is interrupted — the tab is hidden, the person navigates —
     must not leave the chip without its colour. */
  useEffect(() => {
    if (!colour) return
    const onHide = () => { if (document.hidden) mood.endReveal() }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colour])

  if (!colour) return null

  return (
    <div className="mr2-scrim" role="status" aria-live="polite">
      <div
        ref={panel}
        className={`mr2${flying ? ' is-flying' : ''}`}
        style={{ ['--mr2-colour' as string]: colour, transitionDuration: `${FLY_MS}ms` }}
      >
        <Glasses colour={colour} />
        <p className="mr2__line">{t('This is how you are seeing the world right now.')}</p>
      </div>
    </div>
  )
}
