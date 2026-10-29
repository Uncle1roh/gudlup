/* ============================================================================
   Light ground or dark, chosen by the person, kept on the device

   The surface was built on one darkened photograph and every colour in it
   was derived from that decision. This is the switch that makes the ground
   a setting instead: LIGHT by default — the sand the identity is drawn on —
   with the dark room one tap away for anyone who reads at night.

   Three things make it cheap. The ground is already four variables
   (`ui2/shell.css`), the ink is already eight (`ui2/Ground.tsx`), and the
   screens already read them by name. So this module does not know about a
   single screen: it writes `data-ground` on <html> and the two sets answer.

   It is deliberately NOT `selfuse/theme.ts`, which looks almost the same and
   is kept: that one is `gl.theme`/`data-su-theme`, it defaults to dark, it
   has an `auto` setting, and it dresses the OLD surfaces and the Studio. A
   person choosing a light library is not asking for a light Studio, and a
   default that disagreed with it would be a bug in one of the two.

   Applied at import, before React paints, so a reader who chose dark does
   not see the light ground flash first.
   ============================================================================ */

import { useSyncExternalStore } from 'react'

export type Ground = 'light' | 'dark'

const KEY = 'gl.ground'

/** The browser chrome around the page — the status bar on a phone. */
const BAR_COLOR: Record<Ground, string> = { light: '#F5EEE4', dark: '#0c2a22' }

export const GROUND_OPTIONS: { id: Ground; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
]

export function isGround(v: unknown): v is Ground {
  return v === 'light' || v === 'dark'
}

/** What is stored, or the default. Anything else stored is not honoured. */
export function readGround(): Ground {
  try {
    const v = localStorage.getItem(KEY)
    if (isGround(v)) return v
  } catch {
    /* private mode, or no storage at all: the default stands */
  }
  return 'light'
}

/**
 * Put the choice on the document.
 *
 * The attribute is written for BOTH grounds even though the stylesheet only
 * keys on `[data-ground='dark']` — light is the stylesheet's own ground, so
 * its absence already means light. Writing it anyway is for the person
 * reading the DOM to find out what the page thinks it is.
 */
export function applyGround(g: Ground): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-ground', g)
  /* The same <meta> `selfuse/theme.ts` writes. Whoever ran last wins, which
     is why `ui2/Ground.tsx` calls this again when the surface mounts. */
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', BAR_COLOR[g])
}

const listeners = new Set<() => void>()

export function setGround(g: Ground): void {
  try {
    localStorage.setItem(KEY, g)
  } catch {
    /* the page still changes; it just will not be there tomorrow */
  }
  applyGround(g)
  for (const fn of listeners) fn()
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** For the few things CSS cannot repaint — the logo is a PNG in two
    colourways, and no token fixes a cream mark on sand. */
export function useGround(): Ground {
  return useSyncExternalStore(subscribe, readGround, () => 'light')
}

/* Applied at import, before React paints anything. */
applyGround(readGround())
