/* ============================================================================
   The ground the surface stands on

   WHAT THIS REPLACES. `src/mood/` — a colour engine, a two-axis check-in, two
   sliders, a pair of tinted glasses and a chip that wore the result. It was
   asked for, built, and then removed on the owner's call: "o app tem o
   propósito de ser algo simples, direto e para bem estar, essa mecânica é
   complexa demais para o que se propõe." Nothing of it is kept, because a
   half-removed feature is the one that comes back by accident.

   What the surface still needs from it is small and has nothing to do with
   mood: a class on <html> that the stylesheet keys off, and the ink tokens
   written as custom properties.

   WHY THE TOKENS ARE IN JAVASCRIPT AT ALL, still. They are namespaced
   `--mood-*` and set on the root element rather than declared in a `:root`
   block, because the admin console, the HR console and the therapist's
   workspace all read `--ink` and `--line` from `:root` — and this surface's
   cream-on-dark values must not reach them. Setting them from the component
   that owns the surface, and removing them when it unmounts, is what keeps
   that boundary. The names stay `--mood-*` so `shell.css` does not have to
   be rewritten for a rename; there is a note there pointing here.

   The ground itself — the photograph and the filter over it — is in
   `ui2/shell.css`, on four variables, and is documented in
   docs/BACKGROUNDS.md.
   ============================================================================ */

import { useEffect, type ReactNode } from 'react'

/** Cream on dark: the one way of writing on this surface. */
const TOKENS: Record<string, string> = {
  '--mood-ink': '#FAF8DF',
  '--mood-ink-2': 'rgba(250,248,223,.85)',
  '--mood-link': '#D5F0E2',
  '--mood-glass': 'rgba(10,20,25,.28)',
  '--mood-btn': 'rgba(250,248,223,.12)',
  '--mood-line': 'rgba(250,248,223,.24)',
  '--mood-act-bg': '#FAF8DF',
  '--mood-act-fg': '#0B2620',
}

export function GroundProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement
    for (const [k, v] of Object.entries(TOKENS)) root.style.setProperty(k, v)
    root.classList.add('gl2')
    /* One ground, so one set. `shell.css` still reads this attribute for the
       grain's opacity and a couple of shadow values. */
    root.dataset.moodSet = 'dark'
    return () => {
      for (const k of Object.keys(TOKENS)) root.style.removeProperty(k)
      root.classList.remove('gl2')
      delete root.dataset.moodSet
    }
  }, [])

  return <>{children}</>
}
