/* ============================================================================
   The colour, held for as long as the tab is open

   Deliberately not persisted. No localStorage, no database, no profile
   column: the mood lives in React state and is gone on reload, which is what
   the brief asks for and also the most honest thing a first slice can
   promise. Nothing here writes anywhere.

   The provider puts `--mood-*` custom properties on <html> and adds the
   `gl2` class. The properties are namespaced because the admin console, the
   HR console and the therapist's workspace all read `--ink` and `--line`
   from `:root` — the mood belongs to one surface, not to the whole app.
   ============================================================================ */

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { moodColor, type Mood, type MoodColor } from './moodColor'
import { moodVars } from './tokens'

const CENTRE: Mood = { valence: 0, arousal: 0 }

interface MoodState {
  /** Where the person put the dot, or null before any check-in. */
  mood: Mood | null
  /** The word they chose, by id. */
  label: string | null
  /** They opened the check-in and said "Pular". */
  skipped: boolean
  /** Where the dot is right now: the live point while dragging, else the
      committed one, else the centre. The WORDS come from here too — reading
      them off the committed point meant a drag changed the colour and left
      the four words behind in the quadrant you started in. */
  point: Mood
  /** The colour on screen right now — the live point while dragging. */
  color: MoodColor
  /** Follow the dot while it moves, without committing to it. */
  preview(mood: Mood | null): void
  /** Commit a point and a word. */
  commit(mood: Mood, label: string | null): void
  skip(): void

  /* ---- the reveal ----
     Committing a word does not just set a colour, it SHOWS one: a pair of
     glasses in that colour, "this is how you see the world", and then the
     panel folds itself into the Loops chip, which keeps the colour. The
     provider owns the handover because the three parts live in three
     different components — the check-in commits, the overlay animates, the
     chip is somewhere else in the tree entirely. */

  /** A commit the overlay has not shown yet. Cleared by `endReveal`. */
  reveal: MoodColor | null
  /** The overlay has finished; the chip keeps the colour from here. */
  endReveal(): void
  /** The colour the Loops chip wears, or null before any check-in. The whole
      colour, not its hex: the chip needs `light` to know which ink reads on
      it, and a hex alone would have it guessing. */
  chipTone: MoodColor | null
  /** The chip tells the provider where it is, so the reveal knows where to
      fold into. A function rather than a rect: the chip moves with the
      layout, and the overlay needs its position at the moment it flies. */
  setChipRect(get: (() => DOMRect | null) | null): void
  chipRect(): DOMRect | null
}

const Ctx = createContext<MoodState | null>(null)

export function MoodProvider({ children }: { children: ReactNode }) {
  const [mood, setMood] = useState<Mood | null>(null)
  const [label, setLabel] = useState<string | null>(null)
  const [skipped, setSkipped] = useState(false)
  const [live, setLive] = useState<Mood | null>(null)
  const [reveal, setReveal] = useState<MoodColor | null>(null)
  /** Set only when the reveal has run: the chip takes the colour at the end
      of the flight, not at the moment of the tap, or it would already be
      wearing the colour the glasses are flying towards. */
  const [chipTone, setChipTone] = useState<MoodColor | null>(null)
  const chipRectRef = useRef<(() => DOMRect | null) | null>(null)

  const point = live ?? mood ?? CENTRE
  const color = useMemo(() => moodColor(point), [point])

  useEffect(() => {
    const root = document.documentElement
    const vars = moodVars(color)
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v)
    root.classList.add('gl2')
    /* The ground is one darkened photograph now, not the mood colour, so the
       set it asks for does not change with the day (shell.css, "the ground"). */
    root.dataset.moodSet = 'dark'
    return () => {
      for (const k of Object.keys(vars)) root.style.removeProperty(k)
      root.classList.remove('gl2')
      delete root.dataset.moodSet
    }
  }, [color])

  const value = useMemo<MoodState>(
    () => ({
      mood,
      label,
      skipped,
      point,
      color,
      preview: (m) => setLive(m),
      commit: (m, l) => {
        setMood(m)
        setLabel(l)
        setSkipped(false)
        setLive(null)
        setReveal(moodColor(m))
      },
      skip: () => {
        setSkipped(true)
        setLive(null)
      },
      reveal,
      endReveal: () => {
        setChipTone(reveal)
        setReveal(null)
      },
      chipTone,
      setChipRect: (get) => { chipRectRef.current = get },
      chipRect: () => chipRectRef.current?.() ?? null,
    }),
    [mood, label, skipped, point, color, reveal, chipTone],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useMood(): MoodState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useMood outside MoodProvider')
  return v
}

/** Which token set the ground is wearing. The shell reads it for the brand
    colourway and nothing else; the ground is a dark photograph on every
    screen that has a provider, and green on the light surfaces that do not. */
export function useMoodSet(): 'light' | 'dark' {
  return useContext(Ctx) ? 'dark' : 'light'
}
