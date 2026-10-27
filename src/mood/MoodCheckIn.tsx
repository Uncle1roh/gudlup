/* ============================================================================
   The emotional check-in — about ten seconds

   Two steps, in this order, because the order is the point:

     1 · WHERE you are, on two axes. Valence left to right, arousal bottom to
         top (Russell's circumplex — the standard self-report shape). The
         background takes the colour as the finger moves, so the answer is
         visible before it is named.
     2 · WHAT it is called. Four words from the quadrant you touched, plus
         "Neutral" near the centre. THIS is the part with the evidence behind
         it: naming an emotion is what regulates it (Lieberman 2007), and it
         only works in the person's own language — which is why the words come
         from a per-locale table and not from the English-keyed dictionary.

   What this component never does: tell anyone what their colour means, draw
   a conclusion from it, or compare it to anybody else's. The colour mirrors
   a state; it does not treat one. (Copy rules: spec § "O que podemos
   afirmar" — never "a cor melhora o seu humor", never "cromoterapia".)

   Accessibility: the grid is a real control with arrow keys, the chosen word
   is always printed beside the colour, and the live region says where the
   point is as it moves. Colour is never the only carrier.
   ============================================================================ */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { labelsFor, moodColor, moodWord, roundAxis, type Mood } from './moodColor'
import { useMood, type MoodContextKind, type MoodEntry } from './MoodContext'

export interface MoodCheckInProps {
  context: MoodContextKind
  /** Ties a pre to its post. */
  sessionId?: string
  protocolCode?: string
  /** Called once the person has chosen a word or skipped. */
  onDone: (entry: MoodEntry) => void
  /** The way out without answering at all (the panel's close). */
  onDismiss?: () => void
  /** What the panel is for, above the grid. */
  title?: string
  /** Mood rows are not being stored — say so rather than implying they are. */
  notStored?: boolean
}

/** How long the confirmation stays up (spec: "cerca de 2 segundos"). */
const CONFIRM_MS = 2000

export function MoodCheckIn({
  context, sessionId, protocolCode, onDone, onDismiss, title, notStored,
}: MoodCheckInProps) {
  const { t, locale } = useI18n()
  const mood = useMood()
  const [point, setPoint] = useState<Mood>({ valence: 0, arousal: 0 })
  const [touched, setTouched] = useState(false)
  const [confirmed, setConfirmed] = useState<{ labelId: string | null; hex: string } | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const done = useRef(false)

  const colour = moodColor(point)

  /* The background follows the finger. Cleared on unmount so a panel that is
     closed without an answer does not leave the app wearing a preview. */
  useEffect(() => {
    if (touched) mood.preview(point)
  }, [point, touched]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => mood.preview(null), []) // eslint-disable-line react-hooks/exhaustive-deps

  const move = useCallback((clientX: number, clientY: number) => {
    const el = gridRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    const y = Math.min(1, Math.max(0, (clientY - r.top) / r.height))
    setPoint({ valence: roundAxis(x * 2 - 1), arousal: roundAxis(1 - y * 2) })
    setTouched(true)
  }, [])

  function nudge(dv: number, da: number) {
    setPoint((p) => ({ valence: roundAxis(p.valence + dv), arousal: roundAxis(p.arousal + da) }))
    setTouched(true)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const step = 0.1
    const by: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step],
    }
    const d = by[e.key]
    if (!d) return
    e.preventDefault()
    nudge(d[0], d[1])
  }

  function finish(labelId: string | null) {
    if (done.current) return
    done.current = true
    const entry: MoodEntry = {
      valence: point.valence,
      arousal: point.arousal,
      labelId,
      at: Date.now(),
      context,
      sessionId,
      protocolCode,
    }
    mood.remember(entry)
    setConfirmed({ labelId, hex: colour.hex })
    window.setTimeout(() => onDone(entry), CONFIRM_MS)
  }

  /* The confirmation: the colour and the word, for about two seconds. Both,
     always — a colour on its own says nothing to a person who cannot see it
     and nothing precise to anyone else. */
  if (confirmed) {
    return (
      <div className="mood-done" role="status">
        <span className="mood-done__swatch" style={{ background: confirmed.hex }} aria-hidden="true" />
        <p className="mood-done__line">
          {confirmed.labelId
            ? t('Today you feel: {word}', { word: moodWord(confirmed.labelId, locale) })
            : t('Noted. No word this time.')}
        </p>
      </div>
    )
  }

  const words = labelsFor(point)
  const u = (point.valence + 1) / 2
  const w = (point.arousal + 1) / 2

  return (
    <section className="mood-ci" aria-label={t('Emotional check-in')}>
      <header className="mood-ci__head">
        <h2 className="mood-ci__title">{title ?? t('How are you right now?')}</h2>
        <span className="mood-ci__hint">{t('about 10 seconds')}</span>
        {onDismiss && (
          <button className="mood-ci__close" onClick={onDismiss} aria-label={t('Close')}>×</button>
        )}
      </header>

      <div className="mood-ci__body">
        <div className="mood-ci__gridwrap">
          <span className="mood-ci__axis mood-ci__axis--top">{t('agitated')}</span>
          <div className="mood-ci__row">
            <span className="mood-ci__axis mood-ci__axis--left">{t('unpleasant')}</span>
            {/* A two-axis control: a slider role cannot describe two values,
                so it is an application region with arrow keys and a live
                description of where the point is. */}
            <div
              ref={gridRef}
              className="mood-ci__grid"
              role="application"
              tabIndex={0}
              aria-label={t('Where are you? Left is unpleasant, right is pleasant, down is calm, up is agitated. Use the arrow keys.')}
              onKeyDown={onKeyDown}
              onPointerDown={(e) => {
                /* Capture so a finger that leaves the square keeps dragging.
                   It throws for a pointer the element never saw — a stale id,
                   a synthetic event — and the point must still move, so the
                   capture is a nicety in a try and never the gate. */
                try { (e.target as HTMLElement).setPointerCapture?.(e.pointerId) } catch { /* no capture */ }
                move(e.clientX, e.clientY)
              }}
              onPointerMove={(e) => { if (e.buttons === 1) move(e.clientX, e.clientY) }}
            >
              <span className="mood-ci__cross mood-ci__cross--v" aria-hidden="true" />
              <span className="mood-ci__cross mood-ci__cross--h" aria-hidden="true" />
              <span
                className="mood-ci__dot"
                style={{ background: colour.hex, left: `${u * 100}%`, top: `${(1 - w) * 100}%` }}
                aria-hidden="true"
              />
            </div>
            <span className="mood-ci__axis mood-ci__axis--right">{t('pleasant')}</span>
          </div>
          <span className="mood-ci__axis mood-ci__axis--bottom">{t('calm')}</span>
        </div>

        <div className="mood-ci__words">
          <span className="mood-ci__q">{t('Which word fits best?')}</span>
          {words.map((id) => (
            <button key={id} className="mood-ci__word" onClick={() => finish(id)}>
              {moodWord(id, locale)}
            </button>
          ))}
          <button className="mood-ci__skip" onClick={() => finish(null)}>{t('Skip')}</button>
        </div>
      </div>

      {/* Not decoration: a person who cannot see the colour reads the point
          here, and it is what makes the grid usable from the keyboard. */}
      <p className="mood-ci__live" aria-live="polite">
        {t('{pleasantness}, {energy}', {
          pleasantness: point.valence >= 0 ? t('rather pleasant') : t('rather unpleasant'),
          energy: point.arousal >= 0 ? t('rather agitated') : t('rather calm'),
        })}
      </p>

      {notStored && (
        <p className="mood-ci__note">
          {t('This stays on your device: you have not switched on saving your wellbeing check-ins.')}
        </p>
      )}
    </section>
  )
}
