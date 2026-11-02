/* ============================================================================
   "Como você está agora?" — two sliders

   The instrument at the two ends of a session (POs, 2026-11-02), in place of
   five emoji faces. ENERGY on the left, MOOD on the right, each one its own
   vertical track: two numbers asked as two questions, which is what they are.

   WHERE THIS COMES FROM. A two-slider check-in was built in October and taken
   out again with the rest of the mood board — a colour engine, a pair of
   tinted glasses, a reveal animation and four words per quadrant — because
   that whole mechanic was too much for what the app is for. The sliders come
   back WITHOUT any of it: no colour, no words, no provider, nothing that
   follows you around the app. Two tracks and a thumb, and the answer goes
   where the person can see it, which is their own calendar.

   Deliberately NOT an `<input type=range>` rotated: in several browsers that
   stays a horizontal control wearing a transform — the pointer maths and the
   arrow keys both keep thinking in x. Drawn here, so up is up everywhere.

   UNANSWERED IS A STATE. The question is optional (PLY-3), so a thumb resting
   at the middle must not read as "neutral, thanks for asking". Until the
   person touches a track there is no reading at all, and the thumb says so by
   being hollow.
   ============================================================================ */

import { useRef, type PointerEvent as RPointerEvent, type KeyboardEvent as RKeyboardEvent } from 'react'
import { useI18n } from '../i18n'
import { roundAxis, type MoodPoint } from '../data/measures'

/* The track is drawn in the colour the axis MEANS, not in a brand colour:
   energy runs from settled to lit, mood from heavy to bright. */
const ENERGY_TRACK = 'linear-gradient(180deg, #E8A24B 0%, #9aada5 50%, #6E8BA8 100%)'
const MOOD_TRACK = 'linear-gradient(180deg, #8FCBA8 0%, #9aada5 50%, #C0724A 100%)'

/** The centre, where a track starts before anybody has said anything. */
const CENTRE: MoodPoint = { valence: 0, arousal: 0 }

function Slider({ value, answered, onChange, label, top, bottom, track }: {
  value: number
  answered: boolean
  onChange(v: number): void
  label: string
  top: string
  bottom: string
  track: string
}) {
  const el = useRef<HTMLButtonElement | null>(null)

  function moveTo(clientY: number) {
    const node = el.current
    if (!node) return
    const r = node.getBoundingClientRect()
    const y = Math.min(1, Math.max(0, (clientY - r.top) / r.height))
    onChange(roundAxis(1 - y * 2))
  }

  const onPointerDown = (e: RPointerEvent<HTMLButtonElement>) => {
    try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* no capture */ }
    moveTo(e.clientY)
  }
  const onPointerMove = (e: RPointerEvent<HTMLButtonElement>) => {
    if (e.buttons === 1) moveTo(e.clientY)
  }
  const onKeyDown = (e: RKeyboardEvent<HTMLButtonElement>) => {
    const step = e.key === 'PageUp' || e.key === 'PageDown' ? 0.25 : 0.1
    const d: Record<string, number> = {
      ArrowUp: step, ArrowRight: step, PageUp: step,
      ArrowDown: -step, ArrowLeft: -step, PageDown: -step,
      Home: 2, End: -2,
    }
    const m = d[e.key]
    if (m === undefined) return
    e.preventDefault()
    onChange(roundAxis(Math.max(-1, Math.min(1, value + m))))
  }

  /* 0% at the top, 100% at the bottom. */
  const pos = (1 - (value + 1) / 2) * 100

  return (
    <div className="ms2-axis">
      <span className="ms2-axis__name">{label}</span>
      <span className="ms2-axis__end">{top}</span>
      <button
        ref={el}
        type="button"
        className="ms2-track"
        role="slider"
        aria-label={label}
        aria-valuemin={-100}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        aria-valuetext={answered ? `${Math.round(((value + 1) / 2) * 100)}%` : undefined}
        aria-orientation="vertical"
        style={{ backgroundImage: track }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onKeyDown={onKeyDown}
      >
        <span className={`ms2-thumb${answered ? ' is-set' : ''}`} style={{ top: `${pos.toFixed(1)}%` }} aria-hidden="true" />
      </button>
      <span className="ms2-axis__end">{bottom}</span>
    </div>
  )
}

/**
 * The pair. `value` is null until the person moves one of them; moving
 * either one creates the reading, with the untouched axis at its middle.
 */
export function MoodSliders({ value, onChange }: {
  value: MoodPoint | null
  onChange(next: MoodPoint): void
}) {
  const { t } = useI18n()
  const point = value ?? CENTRE
  const answered = value !== null

  return (
    <div className="ms2" role="group" aria-label={t('How are you right now?')}>
      <div className="ms2__axes">
        {/* The ends of each track are that scale's own extremes, in the words
            the rest of the app already uses for them: "Muito alta / Muito
            baixa" for energy (which agrees with the feminine *energia* in
            both Portuguese and Italian) and "agradável / desagradável" for
            mood (invariable in both, so nothing here has to know how the
            person is addressed). */}
        <Slider
          label={t('Energy')}
          top={t('Very high')}
          bottom={t('Very low')}
          track={ENERGY_TRACK}
          value={point.arousal}
          answered={answered}
          onChange={(v) => onChange({ valence: point.valence, arousal: v })}
        />
        <Slider
          label={t('Mood')}
          top={t('pleasant')}
          bottom={t('unpleasant')}
          track={MOOD_TRACK}
          value={point.valence}
          answered={answered}
          onChange={(v) => onChange({ valence: v, arousal: point.arousal })}
        />
      </div>
    </div>
  )
}
