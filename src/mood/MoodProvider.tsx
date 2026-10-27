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

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
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
  /** The colour on screen right now — the live point while dragging. */
  color: MoodColor
  /** Follow the dot while it moves, without committing to it. */
  preview(mood: Mood | null): void
  /** Commit a point and a word. */
  commit(mood: Mood, label: string | null): void
  skip(): void
}

const Ctx = createContext<MoodState | null>(null)

export function MoodProvider({ children }: { children: ReactNode }) {
  const [mood, setMood] = useState<Mood | null>(null)
  const [label, setLabel] = useState<string | null>(null)
  const [skipped, setSkipped] = useState(false)
  const [live, setLive] = useState<Mood | null>(null)

  const color = useMemo(() => moodColor(live ?? mood ?? CENTRE), [live, mood])

  useEffect(() => {
    const root = document.documentElement
    const vars = moodVars(color)
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v)
    root.classList.add('gl2')
    root.dataset.moodSet = color.light ? 'light' : 'dark'
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
      color,
      preview: (m) => setLive(m),
      commit: (m, l) => {
        setMood(m)
        setLabel(l)
        setSkipped(false)
        setLive(null)
      },
      skip: () => {
        setSkipped(true)
        setLive(null)
      },
    }),
    [mood, label, skipped, color],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useMood(): MoodState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useMood outside MoodProvider')
  return v
}
