/* ============================================================================
   The check-in, in the top bar

   A swatch of the colour you are wearing, the word you chose for it, and a
   panel that opens underneath. It is the standalone check-in — the mood
   diary — and the only permanent way into it.

   It says what it is in words as well as in colour: "Hoje você se sente:
   Tenso(a)" rather than a coloured dot on its own.
   ============================================================================ */

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { moodWord } from './moodColor'
import { useMood } from './MoodContext'
import { MoodCheckIn } from './MoodCheckIn'
import { useMoodRecorder } from './useMoodRecorder'

export function MoodPill({ className }: { className?: string }) {
  const { t, locale } = useI18n()
  const { latest, color } = useMood()
  const { record, stores } = useMoodRecorder()
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  /* A popover closes on the next click outside it and on Escape. Without
     this it stayed open behind whatever the person opened next. */
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])

  const word = latest?.labelId ? moodWord(latest.labelId, locale) : ''
  const label = word
    ? t('Today you feel: {word}', { word })
    : latest
      ? t('Check-in done · tap to change')
      : t('How are you right now?')

  return (
    <div className={`mood-pill__wrap${className ? ` ${className}` : ''}`} ref={wrap}>
      <button
        className="mood-pill"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="mood-pill__swatch" style={{ background: color.hex }} aria-hidden="true" />
        <span className="mood-pill__label">{label}</span>
        <span className="mood-pill__caret" aria-hidden="true">⌄</span>
      </button>

      {open && (
        <div className="mood-pop" role="dialog" aria-modal="false">
          <MoodCheckIn
            context="standalone"
            notStored={!stores}
            onDismiss={() => setOpen(false)}
            onDone={(e) => { record(e); setOpen(false) }}
          />
        </div>
      )}
    </div>
  )
}
