/* ============================================================================
   The colour the app is wearing

   One provider over the whole Self Use surface. It holds the latest check-in,
   turns it into a colour, and hands the token set down as CSS custom
   properties — so no component reads a colour and no screen has a palette of
   its own.

   Three things it deliberately does NOT do:

   · It does not decide anything about a person. The colour mirrors what they
     said about themselves ten seconds ago; nothing is inferred from it, and
     nothing is routed by it (MN-03/MN-19 — a wellbeing product that outputs
     a judgement about its user is a different class of thing).
   · It does not write without consent. See config.ts: mood may be health
     data, and until the consent text is settled an unconsented check-in
     colours the app for this session and is never stored.
   · It does not keep a history here. Rows live in `mood_checkins`; this holds
     the LAST one, which is all the background needs, mirrored per account in
     localStorage so the app opens in the right colour rather than flashing
     neutral first.
   ============================================================================ */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { moodColor, NEUTRAL, roundAxis, type Mood, type MoodColor } from './moodColor'
import { moodVars } from './tokens'
import { AB_PILOT_ENABLED } from './config'

export type MoodContextKind = 'pre_session' | 'post_session' | 'standalone'
export type MoodVariant = 'color' | 'no_color'

export interface MoodEntry extends Mood {
  /** The word they chose, or null when they skipped it. */
  labelId: string | null
  at: number
  context: MoodContextKind
  /** Ties a pre to its post. */
  sessionId?: string
  protocolCode?: string
}

export interface MoodApi {
  /** The last check-in, or null if there has not been one. */
  latest: MoodEntry | null
  /** The colour the app is wearing right now — the preview while a finger is
      on the grid, otherwise the latest check-in, otherwise neutral. */
  color: MoodColor
  /** Group B of the pilot sees a fixed neutral ground. */
  variant: MoodVariant
  /** Drive the background live while the point moves. null returns to rest. */
  preview: (m: Mood | null) => void
  /** Remember a finished check-in. Storage is the caller's business
      (SelfUseApp wires the data layer); this keeps the colour. */
  remember: (e: MoodEntry) => void
}

const Ctx = createContext<MoodApi | null>(null)

const KEY = 'gl.mood'
const VARIANT_KEY = 'gl.mood.variant'

function slot(userId?: string | null): string {
  return `${KEY}.${userId ?? 'anon'}`
}

export function readLastMood(userId?: string | null): MoodEntry | null {
  try {
    const raw = localStorage.getItem(slot(userId))
    if (!raw) return null
    const e = JSON.parse(raw) as MoodEntry
    if (typeof e?.valence !== 'number' || typeof e?.arousal !== 'number') return null
    return e
  } catch {
    return null
  }
}

function writeLastMood(userId: string | null | undefined, e: MoodEntry): void {
  try { localStorage.setItem(slot(userId), JSON.stringify(e)) } catch { /* private mode */ }
}

/** Drawn once per person and then kept, so a pilot's two groups stay two
    groups. With the pilot off, everybody is in `color` and nothing is drawn. */
export function readVariant(userId?: string | null): MoodVariant {
  if (!AB_PILOT_ENABLED) return 'color'
  const key = `${VARIANT_KEY}.${userId ?? 'anon'}`
  try {
    const saved = localStorage.getItem(key)
    if (saved === 'color' || saved === 'no_color') return saved
    const drawn: MoodVariant = Math.random() < 0.5 ? 'color' : 'no_color'
    localStorage.setItem(key, drawn)
    return drawn
  } catch {
    return 'color'
  }
}

export function MoodProvider({ userId, children }: { userId?: string | null; children: ReactNode }) {
  const [latest, setLatest] = useState<MoodEntry | null>(() => readLastMood(userId))
  const [live, setLive] = useState<Mood | null>(null)
  const variant = useMemo(() => readVariant(userId), [userId])

  /* A different account on the same device is a different colour. */
  useEffect(() => { setLatest(readLastMood(userId)); setLive(null) }, [userId])

  const remember = useCallback((e: MoodEntry) => {
    const clean: MoodEntry = { ...e, valence: roundAxis(e.valence), arousal: roundAxis(e.arousal) }
    setLatest(clean)
    setLive(null)
    writeLastMood(userId, clean)
  }, [userId])

  const color = useMemo(() => {
    if (variant === 'no_color') return NEUTRAL
    const source = live ?? latest
    return source ? moodColor(source) : NEUTRAL
  }, [live, latest, variant])

  /* The paint. On the document element rather than on a frame, because the
     Self Use surface renders several frames (the library, the player, a
     call) and the page behind them has to be the same colour as the app —
     a cream page around a terracotta app reads as a bug.

     Only `--mood-*` names are written here: `:root` is shared with the
     employer console, the clinician workspace and the admin, where `--ink`
     and `--line` already mean something else. `selfuse-mood.css` aliases
     these into the short names inside `.su-mood`. */
  useEffect(() => {
    const el = document.documentElement
    const vars = moodVars(color)
    for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v)
    el.classList.add('su-mood')
    el.dataset.moodSet = color.light ? 'light' : 'dark'
    return () => {
      for (const k of Object.keys(vars)) el.style.removeProperty(k)
      el.classList.remove('su-mood')
      delete el.dataset.moodSet
    }
  }, [color])

  const api = useMemo<MoodApi>(
    () => ({ latest, color, variant, preview: setLive, remember }),
    [latest, color, variant, remember],
  )

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useMood(): MoodApi {
  const api = useContext(Ctx)
  if (!api) throw new Error('useMood must be used inside <MoodProvider>')
  return api
}

/** The custom properties for a surface. Put on the element that carries
    `.su-mood`; everything under it reads the tokens and nothing else. */
export function useMoodVars(): Record<string, string> {
  const { color } = useMood()
  return useMemo(() => moodVars(color), [color])
}
