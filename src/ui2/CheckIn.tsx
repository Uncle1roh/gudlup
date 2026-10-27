/* ============================================================================
   "Como você está agora?" — the check-in, as a popover

   A port of the <sc-if> block in HomeMood.dc.html: it hangs under the chip
   in the top bar, it is white whatever the mood is, and it closes on a word,
   on "Pular", on a click outside and on Esc.

   Two numbers and a word. Nothing is stored: the colour lives in
   MoodProvider for as long as the tab is open, and no row is written
   anywhere (brief §6).

   The grid is a button, so it is reachable without a pointer: the arrow keys
   walk it in steps of 0.1.
   ============================================================================ */

import { useEffect, useRef, type PointerEvent as RPointerEvent, type KeyboardEvent as RKeyboardEvent } from 'react'
import { useI18n } from '../i18n'
import { useMood } from '../mood/MoodProvider'
import { labelsFor, moodWord, roundAxis } from '../mood/moodColor'

export function CheckIn({ onClose }: { onClose(): void }) {
  const { t, locale } = useI18n()
  const mood = useMood()
  const box = useRef<HTMLDivElement | null>(null)

  /* The dot — and the four words beside it — follow the live point. */
  const point = mood.point
  const u = (point.valence + 1) / 2
  const w = (point.arousal + 1) / 2

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    /* `mousedown` on the document would also catch the click that OPENED
       this, so it is registered on the next frame. */
    const id = window.setTimeout(() => document.addEventListener('mousedown', onDown), 0)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [onClose])

  function moveTo(el: HTMLElement, clientX: number, clientY: number) {
    const r = el.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    const y = Math.min(1, Math.max(0, (clientY - r.top) / r.height))
    mood.preview({ valence: roundAxis(x * 2 - 1), arousal: roundAxis(1 - y * 2) })
  }

  const onPointerDown = (e: RPointerEvent<HTMLButtonElement>) => {
    /* Capture can throw on a synthetic event; the move still has to happen. */
    try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* no capture */ }
    moveTo(e.currentTarget, e.clientX, e.clientY)
  }
  const onPointerMove = (e: RPointerEvent<HTMLButtonElement>) => {
    if (e.buttons === 1) moveTo(e.currentTarget, e.clientX, e.clientY)
  }

  const onKeyDown = (e: RKeyboardEvent<HTMLButtonElement>) => {
    const step = 0.1
    const d: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step],
    }
    const m = d[e.key]
    if (!m) return
    e.preventDefault()
    mood.preview({ valence: roundAxis(point.valence + m[0]), arousal: roundAxis(point.arousal + m[1]) })
  }

  const words = labelsFor(point)

  return (
    <section
      ref={box}
      id="gl-checkin"
      aria-label={t('Emotional check-in')}
      style={{
        /* 380 is the width the mockup asks for; on a phone the screen is
           narrower than that, and a minimum wider than the viewport pushes
           the whole panel off the side. */
        position: 'absolute', top: 60, left: 0, right: 0, minWidth: 'min(380px, 100%)', maxWidth: '100%', zIndex: 20,
        borderRadius: 28, padding: 22, background: 'rgba(255,255,255,.94)', color: '#1F2B2A',
        boxShadow: '0 24px 60px rgba(0,0,0,.25)', display: 'flex', flexDirection: 'column', gap: 16,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <h2 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 500, fontSize: 20 }}>
          {t('How are you right now?')}
        </h2>
        <span style={{ fontSize: 12, color: '#55615F', whiteSpace: 'nowrap' }}>{t('about ten seconds')}</span>
      </div>

      <div style={{ display: 'flex', gap: 18, alignItems: 'stretch', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#55615F' }}>{t('agitated')}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: '#55615F', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
              {t('unpleasant')}
            </span>
            <button
              type="button"
              className="mood-grid"
              aria-label={t('Touch where you are: left (unpleasant) to right (pleasant), bottom (calm) to top (agitated)')}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onKeyDown={onKeyDown}
              style={{ width: 200, height: 200, borderRadius: 20, border: 'none', position: 'relative', cursor: 'crosshair', padding: 0, touchAction: 'none' }}
            >
              <span style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,.55)' }} />
              <span style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,.55)' }} />
              <span
                style={{
                  position: 'absolute', width: 26, height: 26, margin: '-13px 0 0 -13px', borderRadius: '50%',
                  background: mood.color.hex, border: '3px solid #FFFFFF', boxShadow: '0 2px 8px rgba(0,0,0,.35)',
                  left: `${(u * 100).toFixed(1)}%`, top: `${((1 - w) * 100).toFixed(1)}%`,
                }}
              />
            </button>
            <span style={{ fontSize: 12, color: '#55615F', writingMode: 'vertical-rl' }}>{t('pleasant')}</span>
          </div>
          <span style={{ fontSize: 12, color: '#55615F' }}>{t('calm')}</span>
        </div>

        <div style={{ flex: 1, minWidth: 130, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{t('Which word fits best?')}</span>
          {words.map((id) => {
            const on = mood.label === id
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                onClick={() => { mood.commit(point, id); onClose() }}
                style={{
                  height: 40, borderRadius: 999, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                  fontSize: 14, fontWeight: 500, border: '1px solid rgba(31,43,42,.18)',
                  background: on ? '#1F2B2A' : '#FFFFFF', color: on ? '#FAF8DF' : '#1F2B2A',
                }}
              >
                {moodWord(id, locale)}
              </button>
            )
          })}
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={() => { mood.skip(); onClose() }}
            style={{
              alignSelf: 'flex-start', background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer',
              color: '#55615F', fontFamily: "'DM Sans', sans-serif", fontSize: 13, textDecoration: 'underline',
            }}
          >
            {t('Skip')}
          </button>
        </div>
      </div>

      {/* Said once, where the question is asked: this goes nowhere. */}
      <p style={{ margin: 0, fontSize: 12, color: '#55615F' }}>
        {t('This stays on your screen. It is not saved and nobody else sees it.')}
      </p>
    </section>
  )
}

/** The pill in the top bar that opens the popover. */
export function MoodChip({ open, onToggle }: { open: boolean; onToggle(): void }) {
  const { t, locale } = useI18n()
  const mood = useMood()

  const text = mood.label
    ? t('Today you feel: {word}', { word: moodWord(mood.label, locale) })
    : mood.skipped
      ? t('Check-in done · tap to change')
      : t('How are you right now?')

  return (
    <button
      type="button"
      className="glass"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="gl-checkin"
      style={{
        flex: 1, minWidth: 0, height: 48, borderRadius: 999, display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 8px', cursor: 'pointer', color: 'var(--ink)', fontFamily: "'DM Sans', sans-serif",
        fontSize: 15, fontWeight: 500, textAlign: 'left',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 32, height: 32, flex: 'none', borderRadius: '50%', background: mood.color.hex,
          border: '2px solid var(--ink)', boxSizing: 'border-box', transition: 'background-color 1.5s ease',
        }}
      />
      <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ marginRight: 8 }}>
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  )
}
