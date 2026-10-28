/* ============================================================================
   The check-in, as a popover

   It hangs under the chip in the top bar, it is white whatever the mood is,
   and it closes on a word, on "Pular", on a click outside and on Esc.

   What is INSIDE it is `ui2/MoodSliders.tsx` now — two sliders and a row of
   words — on every width. It used to be a two-axis pad on a desk and five
   faces on a phone, which is the same question with two different
   instruments and two different answers depending on the width of the
   window. Two sliders work in one hand and under a mouse, so there is one.

   Nothing is stored: the colour lives in MoodProvider for as long as the tab
   is open, and no row is written anywhere (brief §6). Choosing a word hands
   over to `ui2/MoodReveal.tsx`, which is what actually shows the colour.
   ============================================================================ */

import { useEffect, useRef } from 'react'
import { useI18n } from '../i18n'
import { useMood } from '../mood/MoodProvider'
import { moodWord } from '../mood/moodColor'
import { MoodSliders } from './MoodSliders'

export function CheckIn({ onClose }: { onClose(): void }) {
  const { t } = useI18n()
  const box = useRef<HTMLDivElement | null>(null)

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

  return (
    <section ref={box} id="gl-checkin" className="ck2" aria-label={t('Emotional check-in')}>
      <MoodSliders onClose={onClose} />
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
