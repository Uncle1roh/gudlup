/* ============================================================================
   Self Use — measurement flows (MSR-1 · MSR-2 · MSR-3)

     MSR-1  GL-Check     weekly, 5 dimensions, one per screen, 1–5, ~60–90s
     MSR-2  WHO-5        every 4 weeks, 5 standard items, 0–5, reported as %
     MSR-3  Daily Mood   one tap, 5 levels, optional note

   All three are reached from a push notification or from the Progress tab —
   NEVER from Home. Every one of them can be closed at any point, and closing
   is not a failure state.

   The completion screens show the number and a comparison arrow and stop
   there. No interpretation, no label, no "your score means…" — that boundary
   is the difference between a wellbeing product and a clinical one.
   ============================================================================ */

import { useState } from 'react'
import { useI18n } from '../i18n'
import {
  GL_CHECK_QUESTIONS,
  WHO5_ITEMS,
  WHO5_OPTIONS,
  WHO5_STEM,
  MOOD_LEVELS,
  MOOD_NOTE_MAX,
  who5Percent,
  trend,
  trendArrow,
  dayKey,
  type GlCheckEntry,
  type GlDimension,
  type Who5Entry,
  type MoodEntry,
  type MoodLevel,
} from '../data/measures'
import { Icon } from './icons'

/* ------------------------------------------------------------- MSR-1 ----- */

interface GlCheckProps {
  onDone: (e: GlCheckEntry) => void
  onClose: () => void
}

export function GlCheckFlow({ onDone, onClose }: GlCheckProps) {
  const { t } = useI18n()
  const [step, setStep] = useState(0)
  const [scores, setScores] = useState<Partial<Record<GlDimension, number>>>({})

  const q = GL_CHECK_QUESTIONS[step]
  const value = q ? scores[q.id] : undefined

  function next() {
    if (!q || value == null) return
    if (step < GL_CHECK_QUESTIONS.length - 1) { setStep(step + 1); return }
    /* The fifth answer IS the end. There used to be a "Thanks! Saved."
       screen after it, carrying a copy of the same five bars that the
       Progress tab already shows — a sixth screen to dismiss, telling a
       person who had just answered five questions that their five answers
       had been received. The flow closes, and the week is on Progress. */
    onDone({ at: Date.now(), scores: scores as Record<GlDimension, number> })
    onClose()
  }

  return (
    <div className="app-frame su-studio">
      <div className="screen msr">
        <div className="msr__top">
          <button className="msr__x" onClick={onClose} aria-label={t('Close')}><Icon name="close" size={17} /></button>
          <span className="msr__count">{t('{n} of {total}', { n: step + 1, total: GL_CHECK_QUESTIONS.length })}</span>
        </div>

        <div className="screen__body msr__body">
          <span className="eyebrow">{t('Weekly check-in')}</span>
          <h2 className="display msr__q">{t(q.question)}</h2>

          <div className="scale5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                className="scale5__btn"
                aria-pressed={value === n}
                onClick={() => setScores((s) => ({ ...s, [q.id]: n }))}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="scale5__ends">
            <span>{t(q.lowLabel)}</span>
            <span>{t(q.highLabel)}</span>
          </div>
        </div>

        <div className="screen__footer">
          <button className="btn btn--primary" disabled={value == null} onClick={next}>
            {step < GL_CHECK_QUESTIONS.length - 1 ? t('Next') : t('Finish')}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---- the week, read in one place ----------------------------------------

   Five dimensions, each answered 1 to 5. The old chart drew a bar filled to
   `value / 5` with a small arrow next to it, and nothing on screen said what
   a full bar meant or what the arrow was comparing against — so it looked
   like a progress bar towards something, which is exactly what it is not.

   What it is: where this week sits on a 1–5 scale, and where last week sat.
   So the track carries the scale itself (four hairlines, five slots), the
   fill is this week, and last week is a mark ON the same track. The number
   says the change in words rather than in a glyph: "4 · +1 vs. a semana
   passada". Nothing is interpreted, nothing is averaged into a verdict —
   that boundary is the difference between a wellbeing product and a
   clinical one, and it is why there is no "good"/"bad" anywhere here.
   ========================================================================= */

export function GlCheckWeek({ last, previous }: { last: GlCheckEntry; previous?: GlCheckEntry | null }) {
  const { t } = useI18n()
  /* 1 is the floor of the scale, not zero: a 1 is an answer, and drawing it
     as an empty track would read as "nothing recorded". */
  const pos = (v: number) => ((v - 1) / 4) * 100

  return (
    <div className="glweek">
      <p className="glweek__key small muted">
        {previous
          ? t('From 1 to 5. The line is last week.')
          : t('From 1 to 5. Next week you will see the change.')}
      </p>
      {GL_CHECK_QUESTIONS.map((d) => {
        const cur = last.scores[d.id]
        const before = previous?.scores[d.id]
        const delta = typeof before === 'number' ? cur - before : null
        return (
          <div key={d.id} className="glweek__row">
            <span className="glweek__label">{t(d.label)}</span>
            <span className="glweek__track" aria-hidden="true">
              <i /><i /><i />
              <span className="glweek__fill" style={{ width: `${pos(cur)}%` }} />
              {typeof before === 'number' && (
                <span className="glweek__was" style={{ left: `${pos(before)}%` }} />
              )}
            </span>
            <span className="glweek__val">
              {cur}
              {delta !== null && delta !== 0 && (
                <em className={delta > 0 ? 'is-up' : 'is-down'}>{delta > 0 ? `+${delta}` : delta}</em>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------- MSR-2 ----- */

interface Who5Props {
  previous: Who5Entry | null
  onDone: (e: Who5Entry) => void
  onClose: () => void
}

export function Who5Flow({ previous, onDone, onClose }: Who5Props) {
  const { t } = useI18n()
  const [step, setStep] = useState(0)
  const [items, setItems] = useState<number[]>(Array(WHO5_ITEMS.length).fill(-1))
  const [saved, setSaved] = useState<Who5Entry | null>(null)

  const value = items[step]

  function next() {
    if (value < 0) return
    if (step < WHO5_ITEMS.length - 1) { setStep(step + 1); return }
    const entry: Who5Entry = { at: Date.now(), items }
    setSaved(entry)
    onDone(entry)
  }

  if (saved) {
    const pct = who5Percent(saved)
    const before = who5Percent(previous)
    const tr = trend(pct, before, 1, 0)
    return (
      <MeasureDone title={t('Wellbeing snapshot saved.')} onClose={onClose}>
        <div className="metric">
          <div className="metric__value">{pct}%</div>
          <div className="metric__label">{t('Scale 0–100')}</div>
        </div>
        {tr && <p className="small muted">{t(tr.label)} {trendArrow(tr.direction)}</p>}
      </MeasureDone>
    )
  }

  return (
    <div className="app-frame su-studio">
      <div className="screen msr">
        <div className="msr__top">
          <button className="msr__x" onClick={onClose} aria-label={t('Close')}><Icon name="close" size={17} /></button>
          <span className="msr__count">{t('{n} of {total}', { n: step + 1, total: WHO5_ITEMS.length })}</span>
        </div>

        <div className="screen__body msr__body">
          <span className="eyebrow">{t('Monthly wellbeing')}</span>
          <p className="small muted">{t(WHO5_STEM)}</p>
          {/* WHO-5 items stay in English until validated translations exist. */}
          <h2 className="display msr__q" lang="en">{WHO5_ITEMS[step]}</h2>

          <div className="who5-opts">
            {WHO5_OPTIONS.map((o) => (
              <button
                key={o.value}
                className="who5-opt"
                aria-pressed={value === o.value}
                onClick={() => setItems((arr) => arr.map((v, i) => (i === step ? o.value : v)))}
              >
                <span>{t(o.label)}</span>
                <span className="who5-opt__n">{o.value}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="screen__footer">
          <button className="btn btn--primary" disabled={value < 0} onClick={next}>
            {step < WHO5_ITEMS.length - 1 ? t('Next') : t('Finish')}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- MSR-3 ----- */

interface MoodProps {
  /** Today's entry when one exists, so re-opening edits rather than duplicates. */
  today: MoodEntry | null
  onDone: (e: MoodEntry) => void
  onClose: () => void
  /** Inline in the Progress mood calendar (no full-screen chrome). */
  inline?: boolean
}

export function DailyMoodFlow({ today, onDone, onClose, inline }: MoodProps) {
  const { t } = useI18n()
  const [level, setLevel] = useState<MoodLevel | null>(today?.level ?? null)
  const [note, setNote] = useState(today?.note ?? '')

  function save(l: MoodLevel) {
    setLevel(l)
    // One tap IS the save; the note is a refinement people can add after.
    onDone({ at: Date.now(), day: dayKey(Date.now()), level: l, note: note.trim() || undefined })
  }

  const body = (
    <>
      <div className="mood-row">
        {MOOD_LEVELS.map((m) => (
          <button key={m.value} className="mood-opt" aria-pressed={level === m.value} onClick={() => save(m.value)}>
            <span className="mood-opt__icon" aria-hidden="true">{m.icon}</span>
            <span className="mood-opt__label">{t(m.label)}</span>
          </button>
        ))}
      </div>
      <textarea
        className="ob-input mood-note"
        placeholder={t('Add a note (optional)')}
        maxLength={MOOD_NOTE_MAX}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => level && onDone({ at: Date.now(), day: dayKey(Date.now()), level, note: note.trim() || undefined })}
      />
      <div className="small muted mood-note__count">{note.length}/{MOOD_NOTE_MAX}</div>
    </>
  )

  if (inline) return <div className="mood-inline">{body}</div>

  return (
    <div className="app-frame su-studio">
      <div className="screen msr">
        <div className="msr__top">
          <button className="msr__x" onClick={onClose} aria-label={t('Close')}><Icon name="close" size={17} /></button>
        </div>
        <div className="screen__body msr__body">
          <span className="eyebrow">{t('Mood calendar')}</span>
          <h2 className="display msr__q">{t('How was your day?')}</h2>
          {body}
        </div>
        <div className="screen__footer">
          <button className="btn btn--primary" disabled={!level} onClick={onClose}>{t('Save')}</button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------- */

function MeasureDone({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const { t } = useI18n()
  return (
    <div className="app-frame su-studio">
      <div className="screen screen--center fade-in">
        <div className="screen__body msr__done">
          <h2 className="display">{title}</h2>
          {children}
        </div>
        <div className="screen__footer">
          <button className="btn btn--primary" onClick={onClose}>{t('Done')}</button>
        </div>
      </div>
    </div>
  )
}
