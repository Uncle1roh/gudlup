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
import { applyGround, useGround, type Ground } from './groundChoice'

/** Cream on dark, and slate on sand. Two sets of the same eight names, which
    is the whole of what a screen has to know about which ground it is on —
    `--warn`, `--ok` and the shadow follow `data-mood-set` in shell.css, and
    they already have both values there. */
const TOKENS: Record<Ground, Record<string, string>> = {
  dark: {
    '--mood-ink': '#FAF8DF',
    '--mood-ink-2': 'rgba(250,248,223,.85)',
    '--mood-link': '#D5F0E2',
    '--mood-glass': 'rgba(10,20,25,.28)',
    '--mood-btn': 'rgba(250,248,223,.12)',
    '--mood-line': 'rgba(250,248,223,.24)',
    '--mood-act-bg': '#FAF8DF',
    '--mood-act-fg': '#0B2620',
  },
  light: {
    '--mood-ink': '#142A33',
    '--mood-ink-2': 'rgba(20,42,51,.78)',
    '--mood-link': '#0B5E48',
    /* White panes rather than dark ones: over sand, a dark frost is a
       smudge. The blur and the saturation stay where they are (`.glass`). */
    '--mood-glass': 'rgba(255,255,255,.38)',
    '--mood-btn': 'rgba(255,255,255,.32)',
    '--mood-line': 'rgba(20,42,51,.16)',
    '--mood-act-bg': '#142A33',
    '--mood-act-fg': '#F5EEE4',
  },
}

export function GroundProvider({ children }: { children: ReactNode }) {
  const ground = useGround()

  useEffect(() => {
    const root = document.documentElement
    const set = TOKENS[ground]
    for (const [k, v] of Object.entries(set)) root.style.setProperty(k, v)
    root.classList.add('gl2')
    /* `shell.css` reads this for the grain, for `--warn` / `--ok` and for a
       couple of shadows. It follows the ground rather than being pinned. */
    root.dataset.moodSet = ground
    /* `selfuse/theme.ts` writes the same <meta name="theme-color"> at ITS
       import, and import order is not ours to pick. Saying it again here,
       after every module has loaded, is what settles the status bar. */
    applyGround(ground)
    return () => {
      for (const k of Object.keys(set)) root.style.removeProperty(k)
      root.classList.remove('gl2')
      delete root.dataset.moodSet
    }
  }, [ground])

  return <>{children}</>
}
