/* ============================================================================
   Come funziona — three steps, a look at the app, and the six phases

   v19's `#page-how`. The six phases are the real protocol structure (see
   docs/PROTOCOL_CATALOG.md) named for a stranger rather than clinically,
   and the mark beside each one fills in as the session goes: one ring lit
   for the first two, two for the middle pair, all three for the last. It is
   the brand's own mark used as a progress indicator, and it is the only
   thing on the whole site that encodes anything about the product.

   The last line says what none of it replaces. That sentence is not
   decoration and is not optional — it is the same one the library carries
   under its own heading.
   ============================================================================ */

import { useEffect, useRef } from 'react'
import { useSite } from './lang'
import type { CopyKey } from './copy'

/* The app's own home screen, looping. 800×802, so the square the stylesheet
   asks for is the file's own shape and nothing is cropped. */
const SHOT_POSTER = '/media/app-home.jpg'
const SHOT_VIDEO = '/media/app-home.mp4'

const STEPS: { h: CopyKey; t: CopyKey }[] = [
  { h: 'w1h', t: 'w1t' },
  { h: 'w2h', t: 'w2t' },
  { h: 'w3h', t: 'w3t' },
]

/** Name, one line, and how many of the three rings are lit. */
const PHASES: { h: CopyKey; t: CopyKey; lit: number }[] = [
  { h: 'ph1h', t: 'ph1t', lit: 1 },
  { h: 'ph2h', t: 'ph2t', lit: 1 },
  { h: 'ph3h', t: 'ph3t', lit: 2 },
  { h: 'ph4h', t: 'ph4t', lit: 2 },
  { h: 'ph5h', t: 'ph5t', lit: 3 },
  { h: 'ph6h', t: 'ph6t', lit: 3 },
]

/** The mark at 44px, outer `lit` rings at full strength and the rest at a
    third. Decorative: the phase is named in words beside it. */
function PhaseMark({ lit }: { lit: number }) {
  const op = (i: number) => (i < lit ? 1 : 0.3)
  return (
    <svg className="pub-phase__mark" viewBox="0 0 44 44" aria-hidden="true" focusable="false">
      <circle cx="22" cy="22" r="20" fill="none" stroke="#1FBF94" strokeWidth="1.6" opacity={op(0)} />
      <circle cx="22" cy="22" r="14" fill="none" stroke="#1FBF94" strokeWidth="1.6" opacity={op(1)} />
      <circle cx="22" cy="22" r="8" fill="none" stroke="#1FBF94" strokeWidth="1.6" opacity={op(2)} />
      <circle cx="22" cy="22" r="3" fill="#F4F0BE" />
    </svg>
  )
}

export function SiteHow() {
  const { s } = useSite()
  const video = useRef<HTMLVideoElement | null>(null)

  /* v19 stops the loop for anybody who asked their system for less motion.
     A poster frame is left on screen, so the card still says what it says. */
  useEffect(() => {
    const el = video.current
    if (!el) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      el.removeAttribute('autoplay')
      el.pause()
    }
  }, [])

  return (
    <section className="glw-section glw-tight">
      <div className="glw-wrap">
        <div>
          <span className="glw-eyebrow">{s('w_eyebrow')}</span>
          <h1 className="glw-h1">{s('w_h1')}</h1>
          <p className="glw-sub">{s('w_sub')}</p>
        </div>

        <div className="glw-wf-cards">
          {STEPS.map((st, i) => (
            <section className="glw-wf-card" key={st.h}>
              <span className="glw-no" aria-hidden="true">{i + 1}</span>
              <h2>{s(st.h)}</h2>
              <p>{s(st.t)}</p>
            </section>
          ))}
        </div>

        <div className="glw-shot glw-how-shot">
          <video
            ref={video}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            poster={SHOT_POSTER}
            src={SHOT_VIDEO}
            role="img"
            aria-label={s('shot_alt')}
          />
        </div>

        <h2 className="glw-phases-title">{s('w_phases')}</h2>
        <ol className="pub-phases" style={{ listStyle: 'none', marginLeft: 0, padding: 0 }}>
          {PHASES.map((p) => (
            <li className="pub-phase" key={p.h}>
              <PhaseMark lit={p.lit} />
              <h3 className="pub-phase__h">{s(p.h)}</h3>
              <p className="pub-phase__t">{s(p.t)}</p>
            </li>
          ))}
        </ol>
        <p className="pub-note">{s('w_note')}</p>
        {/* What none of this replaces. */}
        <p className="pub-fine">{s('w_fine')}</p>
      </div>
    </section>
  )
}
