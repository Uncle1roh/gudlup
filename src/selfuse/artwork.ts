/* ============================================================================
   Self Use — cover artwork

   A browsable catalog needs covers, and there are none: no session has artwork
   commissioned yet, and a grid of grey rectangles is worse than a list. So each
   cover is GENERATED — deterministically, from the session's own slug — and is
   designed to be replaced the moment real art exists.

   Two constraints it has to respect at once:

   · The brand is green-forward and deliberately not multicoloured. A catalog
     that looks like a paint chart would fight the rest of the app. So the
     palette is keyed on the five THEMES, and every one of them is a tonal
     variation inside the brand range — deep forest through emerald, celadon,
     warm cream, sand and the single violet accent. Two sessions in the same
     theme are recognisably related without being identical.

   · A cover must be legible as a thumbnail. That means one large glyph, high
     contrast against its own ground, and no text — the title sits under the
     card, where it can wrap, rather than baked into a picture that cannot.

   `coverFor()` is pure and stable: the same slug always produces the same
   cover, so the catalog does not reshuffle its colours between renders.
   ============================================================================ */

import type { SelfUseTheme } from '../data/selfuse'

export interface Cover {
  /** Two gradient stops, dark to light. */
  from: string
  to: string
  /** Ink for the glyph and any overlay text. */
  ink: string
  /** A single large glyph. No text — titles live under the card. */
  glyph: string
  /** 0–360, used to rotate the gradient so a rail is not visually striped. */
  angle: number
}

/* Each theme gets a band of the brand palette rather than a single colour, so
   the sessions inside it read as a family without being interchangeable. */
const THEME_BANDS: Record<SelfUseTheme, { from: string; to: string; ink: string }[]> = {
  calm: [
    { from: '#0c2a22', to: '#1f6b57', ink: '#d8f0e4' },
    { from: '#12362c', to: '#2f8168', ink: '#e2f4ea' },
    { from: '#17423a', to: '#4aa183', ink: '#eaf7f0' },
  ],
  focus: [
    { from: '#0d2b34', to: '#1d6274', ink: '#dcf0f6' },
    { from: '#12353f', to: '#2a7489', ink: '#e4f3f8' },
    { from: '#173f47', to: '#3d8ba0', ink: '#ecf7fa' },
  ],
  energy: [
    { from: '#3a2411', to: '#a2612a', ink: '#fdefdf' },
    { from: '#42290f', to: '#b87338', ink: '#fdf1e4' },
    { from: '#4a3312', to: '#c98c46', ink: '#fef5ea' },
  ],
  balance: [
    { from: '#1d3324', to: '#5c8f5a', ink: '#e9f4e6' },
    { from: '#233a29', to: '#6ea36a', ink: '#eef7ec' },
    { from: '#2a4230', to: '#84b57e', ink: '#f3faf1' },
  ],
  growth: [
    { from: '#2b1e3a', to: '#6b4a86', ink: '#f0e8f7' },
    { from: '#33234a', to: '#7d589b', ink: '#f3ecf9' },
    { from: '#3a2a52', to: '#906aae', ink: '#f6f0fb' },
  ],
}

/* One glyph per session. Chosen for what the session DOES, not for decoration,
   and legible at 40px. A session the catalog does not know falls back to its
   theme's glyph rather than to a blank. */
const GLYPHS: Record<string, string> = {
  'focus-clarity': '◎',
  'demand-management': '▤',
  'personal-balance': '⇌',
  'inner-strength': '▲',
  'action-decision': '➔',
  'calm-safety': '◗',
  'breathing-presence': '◯',
  'confidence-moment': '◆',
  'permission-pause': '❙❙',
  'healthy-boundaries': '▭',
  'energy-renewal': '☀',
  'conscious-priorities': '☰',
  'professional-authenticity': '◈',
  'flexibility-adaptation': '∿',
  'overcoming-challenges': '⌃',
  'self-confidence': '★',
  'supportive-connections': '⌘',
  'vision-growth': '◇',
  'vitality-motivation': '✦',
}

const THEME_GLYPH: Record<SelfUseTheme, string> = {
  calm: '◯',
  focus: '◎',
  energy: '✦',
  balance: '⇌',
  growth: '◇',
}

/** A small, stable hash — same slug, same cover, every render. */
function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

export function coverFor(slug: string, theme: SelfUseTheme): Cover {
  const band = THEME_BANDS[theme] ?? THEME_BANDS.calm
  const n = hash(slug)
  const tone = band[n % band.length]
  return {
    ...tone,
    glyph: GLYPHS[slug] ?? THEME_GLYPH[theme] ?? '◯',
    // A spread of angles stops a whole rail from looking like one striped block.
    angle: 120 + (n % 5) * 24,
  }
}

/** The inline style a cover element needs. Kept here so a component never has
    to know how a cover is built. */
export function coverStyle(c: Cover): React.CSSProperties {
  return {
    background: `linear-gradient(${c.angle}deg, ${c.from}, ${c.to})`,
    color: c.ink,
  }
}
