/* ============================================================================
   Self Use — night or day

   The surface was designed dark and stays dark by default: that is the
   product's own look, and changing it for everybody because some people find
   it heavy would trade one complaint for another. What was missing is the
   choice.

   It is one attribute on the document — `data-su-theme` — and a palette in
   selfuse-studio.css that answers to it. No component reads a colour, no
   screen renders differently, and there is no second stylesheet to keep in
   step: the same rules read the same token names, and the names point
   somewhere else.

   Three settings, not two. "Auto" follows the device, which is the honest
   default for anyone who has already told their phone what they prefer — but
   it is not what an app opens on unasked, so the stored default is `dark` and
   Auto is something a person chooses.

   Written to localStorage, applied at module load so the first paint is
   already right: a light-mode reader who saw the dark frame flash first would
   have been told the setting does not really work.
   ============================================================================ */

import { useSyncExternalStore } from 'react'

export type ThemeChoice = 'dark' | 'light' | 'auto'
/** What `auto` resolves to right now. */
export type Theme = 'dark' | 'light'

const KEY = 'gl.theme'

/** The browser chrome around the page — the status bar on a phone. It has to
    move with the app or the two disagree at the top of the screen. */
const BAR_COLOR: Record<Theme, string> = { dark: '#0c2a22', light: '#f8f7f0' }

export const THEME_OPTIONS: { id: ThemeChoice; label: string }[] = [
  { id: 'dark', label: 'Night' },
  { id: 'light', label: 'Day' },
  { id: 'auto', label: 'Automatic' },
]

function prefersLight(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches
  } catch {
    return false
  }
}

export function resolveTheme(choice: ThemeChoice): Theme {
  if (choice === 'auto') return prefersLight() ? 'light' : 'dark'
  return choice
}

export function readThemeChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'dark' || v === 'light' || v === 'auto') return v
  } catch {
    /* private mode: the default stands */
  }
  return 'dark'
}

/**
 * Put the choice on the document.
 *
 * Only `light` writes the attribute. Dark is the stylesheet's own ground, so
 * the absence of the attribute IS the dark theme — which means a page that
 * has not run this code yet still renders correctly instead of unstyled.
 */
export function applyTheme(choice: ThemeChoice): void {
  const theme = resolveTheme(choice)
  const el = document.documentElement
  if (theme === 'light') el.setAttribute('data-su-theme', 'light')
  else el.removeAttribute('data-su-theme')
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', BAR_COLOR[theme])
}

export function setThemeChoice(choice: ThemeChoice): void {
  try { localStorage.setItem(KEY, choice) } catch { /* private mode */ }
  applyTheme(choice)
  for (const fn of listeners) fn()
}

/* ---- for the few things CSS cannot repaint -----------------------------

   The logo is a PNG in two colourways, so the cream one on paper is a ghost
   and no token can fix it: the markup has to know which file to ask for. That
   is what this subscription is for, and it should stay the only reason to
   read the theme from a component. */

const listeners = new Set<() => void>()

/** The theme in force right now, `auto` already resolved. */
export function currentTheme(): Theme {
  return resolveTheme(readThemeChoice())
}

export function useSuTheme(): Theme {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => { listeners.delete(fn) } },
    currentTheme,
    () => 'dark',
  )
}

/* Applied at import, before React paints anything. */
applyTheme(readThemeChoice())

/* Auto has to keep following: a phone that switches to its night mode at
   sunset should take the app with it, without a reload. */
try {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (readThemeChoice() !== 'auto') return
    applyTheme('auto')
    for (const fn of listeners) fn()
  })
} catch {
  /* an engine without matchMedia listeners keeps whatever it started with */
}
