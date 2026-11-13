/* ============================================================================
   Good Loop — the logo

   Every surface used to draw its own idea of the brand: `◠◡` set in whatever
   font the machine had, the word "goodloop" in the display face, a gradient
   dot, the words "Good Loop" in the accent colour. Six approximations of a
   logo nobody had actually looked at, and none of them was the logo.

   This is the real one. `Good Loop Visual ID/` holds the masters; the files
   under `public/brand/` are those masters scaled for screen and nothing else —
   no recolour, no redraw, no reconstruction in SVG that would quietly become a
   second logo. Two colourways, and which one you want is decided by the ground
   it sits on, never by the surface it belongs to:

     green   #009b77 — on white, cream and any light panel
     cream   #f2eec4 — on the dark grounds (Self Use, the Studio, admin)

   Both files carry real transparency, so there is no white box to hide.
   ============================================================================ */

import type { ReactNode } from 'react'

export type BrandVariant = 'green' | 'cream'

/** The name, as it is written: one word, lowercase, always. */
export const BRAND = 'goodloop'

/**
 * A sentence with the name in it, with the name kept as the name.
 *
 * Two surfaces would otherwise re-case it: a label whose CSS sets everything
 * in capitals (`.eyebrow` and the rest of the uppercased furniture), and a
 * card that wants it bold. The dictionaries hold plain text — markup in a
 * translation is a thing a translator can break — so the sentence is split
 * on the word here and the word is given a span of its own.
 *
 * `className` is for a surface that wants more of it: the first-run cards
 * pass `frw__brandword`, which is the POs' bold.
 */
export function brandText(text: string, className?: string): ReactNode[] {
  return text.split(BRAND).flatMap((part, i) => (
    i === 0 ? [part] : [<span key={i} className={cx('gl-brandword', className)}>{BRAND}</span>, part]
  ))
}

const BASE = import.meta.env.BASE_URL

/* The shipped pixel sizes, handed to the browser as width/height so a logo
   cannot reflow the bar it sits in on the frame it arrives. CSS sets the
   height everywhere; the width follows from this ratio. */
const LOGO_W = 560
const LOGO_H = 156
const ICON_PX = 192

function cx(...parts: (string | undefined | false)[]): string {
  return parts.filter(Boolean).join(' ')
}

/**
 * The full lockup: mark + wordmark.
 *
 * This is the default. A surface that also names a sub-product ("admin",
 * "clinic", "studio") puts that word NEXT to this, rather than re-setting
 * "goodloop" in a local font beside a local mark.
 */
export function BrandLogo({ variant = 'green', className }: { variant?: BrandVariant; className?: string }) {
  return (
    <img
      className={cx('gl-logo', className)}
      src={`${BASE}brand/goodloop-logo-${variant}.png`}
      width={LOGO_W}
      height={LOGO_H}
      alt="goodloop"
      draggable={false}
    />
  )
}

/**
 * The mark alone, for the places too narrow for the wordmark.
 *
 * Decorative by default: wherever it stands in for the company name, the name
 * is already written next to it, and a screen reader saying "goodloop
 * goodloop" is worse than it saying nothing.
 */
export function BrandIcon({ variant = 'green', className, label }: { variant?: BrandVariant; className?: string; label?: string }) {
  return (
    <img
      className={cx('gl-icon', className)}
      src={`${BASE}brand/goodloop-icon-${variant}.png`}
      width={ICON_PX}
      height={ICON_PX}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      draggable={false}
    />
  )
}
