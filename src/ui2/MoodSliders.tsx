/* ============================================================================
   "Como você está agora?" — two sliders and a word

   WHAT THIS REPLACES. A two-axis pad: one square you touched somewhere, with
   the colour underneath it. It asked one question in two dimensions at once,
   which is a pointer instrument — on a phone it had to become five faces
   instead, so the same question had two different answers depending on the
   width of the screen.

   Two sliders ask the same two numbers as two questions, which is what they
   are. ENERGY on the left, MOOD on the right, each one its own vertical
   track, both working the same way on a desk and in one hand.

   They are the SAME two axes the colour engine has always taken
   (`mood/moodColor.ts`): energy is arousal, mood is valence, both −1…1. So
   high energy and pleasant still lands on the warm amber of q1, which is the
   example the gimmick is explained with — "if the user has high energy and is
   happy the colour should be yellow".

   Under them, the four words of whichever quadrant the two sliders point at,
   in a row. Choosing one commits, and the commit is what the reveal watches
   (`ui2/MoodReveal.tsx`): the colour is shown as a pair of glasses before it
   is anything else, because the whole idea is that this is what the person is
   looking through right now.

   Nothing is stored. The colour lives in MoodProvider for as long as the tab
   is open and no row is written anywhere (brief §6).
   ============================================================================ */

import { useRef, type PointerEvent as RPointerEvent, type KeyboardEvent as RKeyboardEvent } from 'react'
import { useI18n } from '../i18n'
import { useMood } from '../mood/MoodProvider'
import { labelsFor, moodColor, moodWord, roundAxis } from '../mood/moodColor'

/* The track is drawn in the colour the axis MEANS, not in a brand colour:
   energy runs from settled to lit, mood from heavy to bright. They are the
   two anchors of the engine's own grid, so the sliders and the resulting
   colour cannot drift apart. */
const ENERGY_TRACK = 'linear-gradient(180deg, #E8A24B 0%, #BEB6A9 50%, #6E8BA8 100%)'
const MOOD_TRACK = 'linear-gradient(180deg, #8FCBA8 0%, #BEB6A9 50%, #C0724A 100%)'

/** One vertical track, −1…1, top is the high end. */
function Slider({
  value, onChange, label, top, bottom, track,
}: {
  value: number
  onChange(v: number): void
  label: string
  top: string
  bottom: string
  track: string
}) {
  const el = useRef<HTMLButtonElement | null>(null)

  /* A plain `<input type=range>` rotated is still, in several browsers, a
     horizontal control wearing a transform: the pointer maths and the arrow
     keys both stay horizontal. Drawn here instead, so up is up everywhere. */
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

  /* 0 at the top, 1 at the bottom. */
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
        aria-valuetext={`${label}: ${Math.round(((value + 1) / 2) * 100)}%`}
        aria-orientation="vertical"
        style={{ backgroundImage: track }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onKeyDown={onKeyDown}
      >
        <span className="ms2-thumb" style={{ top: `${pos.toFixed(1)}%` }} aria-hidden="true" />
      </button>
      <span className="ms2-axis__end">{bottom}</span>
    </div>
  )
}

export function MoodSliders({ onClose }: { onClose(): void }) {
  const { t, locale } = useI18n()
  const mood = useMood()
  const point = mood.point
  const words = labelsFor(point)
  /* The swatch follows the sliders live, so the answer to "what colour am I"
     is visible before anything is chosen — the word only names it. */
  const live = moodColor(point)

  return (
    <div className="ms2">
      <div className="ms2__head">
        <h2 className="ms2__q">{t('How are you right now?')}</h2>
        <span className="ms2__time">{t('about ten seconds')}</span>
      </div>

      <div className="ms2__axes">
        <Slider
          label={t('Energy')}
          top={t('agitated')}
          bottom={t('calm')}
          track={ENERGY_TRACK}
          value={point.arousal}
          onChange={(v) => mood.preview({ valence: point.valence, arousal: v })}
        />
        {/* The colour the two sliders currently make, between them, where it
            reads as their result rather than as a third control. */}
        <span className="ms2__swatch" style={{ background: live.hex }} aria-hidden="true" />
        <Slider
          label={t('Mood')}
          top={t('pleasant')}
          bottom={t('unpleasant')}
          track={MOOD_TRACK}
          value={point.valence}
          onChange={(v) => mood.preview({ valence: v, arousal: point.arousal })}
        />
      </div>

      <span className="ms2__pick">{t('Which word fits best?')}</span>
      <div className="ms2__words">
        {words.map((id) => (
          <button
            key={id}
            type="button"
            className="ms2-word"
            aria-pressed={mood.label === id}
            onClick={() => { mood.commit(point, id); onClose() }}
          >
            {moodWord(id, locale)}
          </button>
        ))}
      </div>

      <div className="ms2__foot">
        <button type="button" className="ms2-skip" onClick={() => { mood.skip(); onClose() }}>{t('Skip')}</button>
        {/* Said once, where the question is asked: this goes nowhere. */}
        <p className="ms2__fine">{t('This stays on your screen. It is not saved and nobody else sees it.')}</p>
      </div>
    </div>
  )
}
