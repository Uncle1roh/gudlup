/* ============================================================================
   Two token sets, and the rule that picks one

   The spec: "Texto sobre a cor: se L ≥ 0,65, texto escuro; caso contrário,
   texto claro." That is the rule, and it is implemented exactly.

   What the spec does not say, and what the brief demands (§6 Accessibility,
   4.5:1), is what happens at the boundary. A mood colour at L ≈ 0.65 is a
   mid-tone — #71979A — and a mid-tone carries NEITHER dark nor light text at
   4.5:1. Cream on it is 2.97:1. No choice of ink fixes that, because the
   problem is the ground.

   So the ground is not the raw colour. The app paints the mood colour and
   then a VEIL over it — white where the text is dark, near-black where the
   text is light. It is the same device the mockup already uses (its two
   radial gradients are white 28% and black 14%), made explicit and measured:

       dark text  → white at 20%     worst case over the whole gamut 5.52:1
       light text → #07100E at 34%   secondary text, at 90% alpha, 4.75:1

   Those two numbers are asserted over a 101 × 101 sweep of the grid in
   tools/test-mood-color.ts. Change a token here and the suite says what it
   cost.

   The colour a person sees is still their colour: the veil shifts it towards
   paper or towards night, it does not replace it. `--mood-bg` keeps the raw
   value for the swatches, which are decoration and carry no text.
   ============================================================================ */

import type { MoodColor } from './moodColor'

export interface TokenSet {
  /** Primary text, and the colour borders are tinted from. */
  ink: string
  /** Secondary text. Alpha is high on purpose — see the file header. */
  ink2: string
  link: string
  /** Card fill: translucent, blurred by the stylesheet. */
  glass: string
  /** Button fill. */
  btn: string
  line: string
  /** The one filled action, and the active nav item. */
  actBg: string
  actFg: string
  /** Laid over the mood colour to make the ground legible. */
  veil: string
}

export const LIGHT_TOKENS: TokenSet = {
  ink: '#1F2B2A',
  ink2: 'rgba(31, 43, 42, 0.9)',
  /* Darker than the mockup's #0B5E48, which falls to 3.9:1 on a warm amber
     ground — a link is body-sized text and has to clear 4.5 like any other.
     Still unmistakably the brand's green, two steps down. */
  link: '#08362A',
  glass: 'rgba(255, 255, 255, 0.38)',
  btn: 'rgba(255, 255, 255, 0.32)',
  line: 'rgba(31, 43, 42, 0.16)',
  actBg: '#1F2B2A',
  actFg: '#FAF8DF',
  veil: 'rgba(255, 255, 255, 0.2)',
}

export const DARK_TOKENS: TokenSet = {
  ink: '#FAF8DF',
  ink2: 'rgba(250, 248, 223, 0.9)',
  /* Lifted from the mockup's #D5F0E2 for the same reason, on terracotta. */
  link: '#F2FBF6',
  glass: 'rgba(10, 20, 25, 0.28)',
  btn: 'rgba(250, 248, 223, 0.12)',
  line: 'rgba(250, 248, 223, 0.24)',
  actBg: '#FAF8DF',
  actFg: '#0B2620',
  veil: 'rgba(7, 16, 14, 0.34)',
}

/** The spec's rule: L ≥ 0.65 → the dark-text set. */
export function tokensFor(color: Pick<MoodColor, 'light'>): TokenSet {
  return color.light ? LIGHT_TOKENS : DARK_TOKENS
}

/**
 * The custom properties the document carries.
 *
 * Namespaced `--mood-*` on purpose. They are written to `:root`, which the
 * whole product shares — and `--ink` and `--line` already mean something
 * there, to the employer console, the clinician workspace and the admin. The
 * stylesheet aliases these into the short names the brief asks for
 * (`--ink`, `--glass`, `--act-bg`…) INSIDE the Self Use subtree, where they
 * are the only palette; see `selfuse-mood.css`.
 *
 * Returned as a plain object: the provider writes them, and the change
 * animates because the stylesheet puts a 1.5 s transition on the properties
 * that use them.
 */
export function moodVars(color: MoodColor): Record<string, string> {
  const t = tokensFor(color)
  return {
    '--mood-bg': color.hex,
    '--mood-veil': t.veil,
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
