/* ============================================================================
   The mood pill, and the calendar behind it

   WHAT MOVED HERE, and why. The mood calendar was the second card of "Minha
   jornada" — a whole screen, reached from the rail, whose other half was a
   weekly check-in and a monthly report. The POs took that screen out
   (2026-11-06) and asked for the calendar to live in a pill beside Loops:
   a pair of glasses, wearing the colour of today, that opens the month.

   It is a better home than the screen was. The calendar is a glance, not a
   destination — nobody opens an app to read a grid of squares — and the one
   thing it needed was to be visible from wherever you already are.

   ON THE COLOUR, because this is the third time it has come up. The mood
   COLOUR MECHANIC built in October — an engine, tinted glasses over the
   whole surface, a reveal animation, a chip that wore the result everywhere
   — was removed on the owner's call as too much for what the app is for,
   and that removal stands. What is here is not that: a fill for a calendar
   square and for one pill, computed in `data/measures.ts` from the two
   numbers the person moved, kept nowhere, and following nobody around the
   app. If a colour engine is ever asked for again, this is the line.
   ============================================================================ */

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import { GamDialog } from '../gamification/ui/Dialog'
import { Icon } from '../selfuse/icons'
import {
  dayKey, dayMood, energyLabel, entryColor, levelFromAxis, moodGradient,
  moodLabel, moodsOfDay, type MoodEntry,
} from '../data/measures'

/* The pill is drawn by the top bar, which every screen shares, and the
   readings live in the person's own state up in `SelfUseApp`. A context
   rather than six more props: the bar is on six screens and none of them
   has anything to do with the mood.

   `null` is "no provider" — the pill then draws nothing at all, which is
   the right answer on any surface that is not the person's own. */
const Ctx = createContext<MoodEntry[] | null>(null)

export function MoodProvider({ moods, children }: { moods: MoodEntry[]; children: ReactNode }) {
  return <Ctx.Provider value={moods}>{children}</Ctx.Provider>
}

export function MoodPill() {
  const { t, d } = useI18n()
  const moods = useContext(Ctx)
  const [open, setOpen] = useState(false)
  const today = dayKey(Date.now())
  const todays = useMemo(() => (moods ? moodsOfDay(moods, today) : []), [moods, today])
  if (!moods) return null

  /* Today's fill, or none. A pill with a colour on a day nobody has answered
     would be a reading the person did not give. */
  const fill = moodGradient(todays)
  const point = dayMood(todays)
  const words = point
    ? `${t(moodLabel(levelFromAxis(point.valence)))} · ${t(energyLabel(levelFromAxis(point.arousal)))}`
    : t('No reading yet today')

  return (
    <>
      <button
        type="button"
        className={`glass-btn gl-mood${fill ? ' is-set' : ''}`}
        style={fill ? { background: fill, borderColor: 'transparent' } : undefined}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        /* It is not "the mood calendar" any more (POs, 2026-11-06). The
           glasses say what they are for: the colour on them is the colour
           the day is being seen through. Hovering says it in words, and a
           screen reader gets the same sentence with the reading after it. */
        aria-label={`${t('This is how you see the world today')} — ${words}`}
        title={t('This is how you see the world today')}
      >
        <Icon name="glasses" size={20} />
      </button>

      {open && (
        <GamDialog labelledBy="gl-mood-title" onClose={() => setOpen(false)} className="gam-mood">
          <p className="eyebrow">{d(Date.now(), { day: 'numeric', month: 'long' })}</p>
          <h2 id="gl-mood-title" className="display gam-unlock__name">{t('This is how you have been seeing the world')}</h2>
          <MoodCalendar moods={moods} />
          <p className="call2-note">
            {moods.length
              ? t('Each square is how you answered at the end of a session. A day you answered twice wears both.')
              : t('Finish a session and tell us how you are: the day fills itself in.')}
          </p>
          <button className="btn btn--primary" onClick={() => setOpen(false)}>{t('OK')}</button>
        </GamDialog>
      )}
    </>
  )
}

/* ---------------------------------------------------------- the month --- */

/**
 * The month, a square a day, filled by the sliders at the end of a session.
 *
 * A day with two readings wears both, as bands in the order they happened
 * (POs, 2026-11-06). Averaging them into one colour was the other option and
 * it is the worse one: a morning that was heavy and an evening that was not
 * average to a flat nothing, and the thing worth seeing is that the day
 * changed.
 */
export function MoodCalendar({ moods }: { moods: MoodEntry[] }) {
  const { t, d: fmt } = useI18n()
  const [open, setOpen] = useState<string | null>(null)
  const now = new Date()
  const today = dayKey(now.getTime())

  /* WHICH MONTH IS ON SCREEN. It used to be this one, always — so a person
     who answered a few sessions in October and opened the glasses in
     November was shown an empty grid with every reading they had one screen
     to the left and no way to reach it. That was the "previous days have no
     colour" report: the squares were right, the month was wrong. */
  const [shown, setShown] = useState(() => ({ y: now.getFullYear(), m: now.getMonth() }))
  const step = (by: number) => setShown((s) => {
    const d = new Date(s.y, s.m + by, 1)
    return { y: d.getFullYear(), m: d.getMonth() }
  })

  /* How far back there is anything to see. An arrow that leads to an empty
     month is worse than no arrow. */
  const oldest = useMemo(() => {
    if (!moods.length) return { y: now.getFullYear(), m: now.getMonth() }
    const at = Math.min(...moods.map((x) => x.at))
    const d = new Date(at)
    return { y: d.getFullYear(), m: d.getMonth() }
  }, [moods, now])
  const asNum = (x: { y: number; m: number }) => x.y * 12 + x.m
  const canBack = asNum(shown) > asNum(oldest)
  const canFwd = asNum(shown) < now.getFullYear() * 12 + now.getMonth()

  const first = new Date(shown.y, shown.m, 1)
  const days = new Date(shown.y, shown.m + 1, 0).getDate()
  const pad = (first.getDay() + 6) % 7

  /* Both axes in words, never a score and never a judgement: the words are
     the ends of the two sliders the person moved. */
  const words = (m: MoodEntry) => {
    const mood = t(moodLabel(m.level))
    if (m.arousal === undefined) return mood
    return `${mood} · ${t(energyLabel(levelFromAxis(m.arousal)))}`
  }

  const openDay = open ? moodsOfDay(moods, open) : []

  return (
    <>
      <div className="cal__head">
        <button
          type="button"
          className="cal__nav"
          onClick={() => { setOpen(null); step(-1) }}
          disabled={!canBack}
          aria-label={t('Previous month')}
        >‹</button>
        <b className="cal__month">{fmt(first.getTime(), { month: 'long', year: 'numeric' })}</b>
        <button
          type="button"
          className="cal__nav"
          onClick={() => { setOpen(null); step(1) }}
          disabled={!canFwd}
          aria-label={t('Next month')}
        >›</button>
      </div>
      <div className="cal">
        {Array.from({ length: pad }, (_, i) => <span key={`p${i}`} className="cal__pad" />)}
        {Array.from({ length: days }, (_, i) => {
          const d = new Date(shown.y, shown.m, i + 1)
          const key = dayKey(d.getTime())
          const entries = moodsOfDay(moods, key)
          const fill = moodGradient(entries)
          return (
            <button
              key={i}
              type="button"
              className={`cal__day${fill ? ' cal__day--set' : ''}${key === today ? ' cal__day--today' : ''}`}
              style={fill ? { background: fill } : undefined}
              aria-current={key === today ? 'date' : undefined}
              onClick={() => entries.length && setOpen(key)}
              aria-label={entries.length ? `${i + 1} · ${entries.map(words).join(' / ')}` : `${i + 1}`}
            >
              <span className="cal__n">{i + 1}</span>
            </button>
          )
        })}
      </div>
      {openDay.length > 0 && (
        <ul className="cal__read fade-in">
          {openDay.map((m) => (
            <li key={m.at}>
              <i aria-hidden="true" style={{ background: entryColor(m) }} />
              <span>{new Date(m.at).toLocaleDateString()} · {words(m)}{m.note ? ` — ${m.note}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
