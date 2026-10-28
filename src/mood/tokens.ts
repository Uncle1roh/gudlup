/* ============================================================================
   The two token sets

   Copied from the `theme` object in HomeMood.dc.html, unchanged. They are the
   two ways of writing on a surface: dark ink for a light ground, cream for a
   dark one.

   Which one applies USED to be decided by the mood: the page was painted the
   mood colour, and the OKLab lightness of that colour picked the ink. The page
   is a darkened photograph now (shell.css, "the ground"), the same one every
   day, so there is one ground and therefore one set. `LIGHT_TOKENS` stays
   written down because the ground is a decision that is still being made, not
   because anything reads it today.
   ============================================================================ */

import { type MoodColor } from './moodColor'

export interface Tokens {
  ink: string
  ink2: string
  link: string
  glass: string
  btn: string
  line: string
  actBg: string
  actFg: string
}

export const LIGHT_TOKENS: Tokens = {
  ink: '#1F2B2A',
  ink2: 'rgba(31,43,42,.78)',
  link: '#0B5E48',
  glass: 'rgba(255,255,255,.38)',
  btn: 'rgba(255,255,255,.32)',
  line: 'rgba(31,43,42,.16)',
  actBg: '#1F2B2A',
  actFg: '#FAF8DF',
}

export const DARK_TOKENS: Tokens = {
  ink: '#FAF8DF',
  ink2: 'rgba(250,248,223,.85)',
  link: '#D5F0E2',
  glass: 'rgba(10,20,25,.28)',
  btn: 'rgba(250,248,223,.12)',
  line: 'rgba(250,248,223,.24)',
  actBg: '#FAF8DF',
  actFg: '#0B2620',
}

/** What the shell wears. The ground is fixed, so this does not vary. */
export const GROUND_TOKENS: Tokens = DARK_TOKENS

export function tokensFor(color: MoodColor): Tokens {
  return color.light ? LIGHT_TOKENS : DARK_TOKENS
}

/**
 * The custom properties the shell reads.
 *
 * They are written under their own names — `--mood-*` — and aliased to the
 * short names inside the shell's own scope. The admin, the HR console and the
 * therapist's workspace all read `--ink` and `--line` from `:root`, and the
 * mood must not reach them.
 *
 * `--mood-bg` is still published, and still the colour of the day. Nothing in
 * the stylesheets paints with it any more: the mood is information, and the
 * surfaces that show it (the check-in dot, the chip, the faces) read
 * `color.hex` straight from the provider.
 */
export function moodVars(color: MoodColor): Record<string, string> {
  const t = GROUND_TOKENS
  return {
    '--mood-bg': color.hex,
    '--mood-ink': t.ink,
    '--mood-ink-2': t.ink2,
    '--mood-link': t.link,
    '--mood-glass': t.glass,
    '--mood-btn': t.btn,
    '--mood-line': t.line,
    '--mood-act-bg': t.actBg,
    '--mood-act-fg': t.actFg,
  }
}
