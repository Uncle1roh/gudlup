/* ============================================================================
   Where the person in the photograph is, once the browser has cropped it

   The landing and the door draw ten concentric rings around the seated
   figure in the landing photograph. The figure is at a fixed place in the
   IMAGE; `object-fit: cover` then scales and offsets that image to fill a
   window of any shape, so the figure is at a different place on every
   screen. This module is the arithmetic that turns the one into the other.

   It is deliberately pure and takes the image's own size as an argument
   rather than the constant the file happens to be today: the POs may
   replace the photograph with a higher-resolution version of the same
   framing, and that must not be a code change. Callers read `naturalWidth`
   and `naturalHeight` off the loaded <img> and pass them in.

   WHAT IS STILL ABOUT ONE PARTICULAR PICTURE is `HERO_FOCUS` and `heroPos`
   below, and those two moved when the POs sent v19.5: the landing's
   photograph went from a tall waterfall at night, figure right of centre,
   to a wide sea at first light, figure a little right of centre and low in
   the frame. A new photograph from the commercial console is still worth
   looking at on a narrow screen, which is what `heroPos` exists for.
   ============================================================================ */

export interface CoverPoint {
  /** Where the focal point lands, in CSS pixels from the left of the window. */
  x: number
  /** …and from the top. */
  y: number
  /** How wide the image is drawn, after `cover` scaling. The ring radii are
      multiples of this, so they grow and shrink with the picture. */
  displayedWidth: number
}

/**
 * The on-screen position of a point in an image painted with
 * `object-fit: cover` and `object-position: posX posY`.
 *
 * @param vw,vh   the box the image fills (the viewport)
 * @param iw,ih   the image's natural size
 * @param posX,posY  `object-position`, as fractions (0.5 = centre)
 * @param fx,fy   the point of interest, as fractions of the image
 */
export function coverPoint(
  vw: number,
  vh: number,
  iw: number,
  ih: number,
  posX: number,
  posY: number,
  fx: number,
  fy: number,
): CoverPoint {
  /* `cover` picks whichever scale makes the image reach BOTH edges; the
     excess on the other axis is what `object-position` slides around. */
  const s = Math.max(vw / iw, vh / ih)
  const dw = iw * s
  const dh = ih * s
  return {
    x: fx * dw - (dw - vw) * posX,
    y: fy * dh - (dh - vh) * posY,
    displayedWidth: dw,
  }
}

/**
 * The seated person — head and shoulders — as fractions of the photograph.
 *
 * It moved with the picture: v25 replaced the man at the sea with the woman
 * at the fireplace, and the two figures do not sit in the same place. These
 * are measured off the file now in `public/media/landing-back.jpg`
 * (1671×941): the headphones are a little left of centre and high, where
 * the man's head was right of centre and low.
 *
 * Only the halo of rings reads it, and `landingRings` is false by default
 * (`src/app/backgrounds.ts`), so nothing draws against it until the console
 * turns the rings on — which is also when it is worth checking by eye.
 */
export const HERO_FOCUS = { fx: 0.44, fy: 0.24 }

/**
 * `object-position` on a desk: the middle of the picture, which is what
 * v19.5 asks for (`background-position:50% 50%`) and what the wide
 * photograph wants — at every desktop shape the crop is vertical only, and
 * the figure sits low and right where the hero's type is not.
 */
export const HERO_POS_DESKTOP = { x: 0.50, y: 0.50 }

/**
 * …and on a phone, where the window is taller than the picture is wide and
 * the crop is the other way about: a 16:9 photograph in a 390px window
 * shows about a quarter of its width, and centring that quarter puts the
 * listener's shoulder against the right edge.
 *
 * 0.67 is v25's framing (`background-position:67% 50%` in the owner's HTML,
 * where the portrait crop is horizontal only): the figure sits centre-left
 * and the fire keeps a corner at the right edge, which 0.58 — the figure's
 * own middle, and what this held before — cropped away. The number is here
 * and nowhere else because the rings are placed against it; a media query
 * that moved the picture without moving them would leave the rings on the
 * wrong part of the photograph.
 */
export const HERO_POS_MOBILE = { x: 0.67, y: 0.50 }

/** The width the ring radii were drawn against. `displayedWidth / this` is
    the factor every radius is multiplied by. */
export const HERO_BASE_WIDTH = 1440

/** The one breakpoint the public pages have. */
export const WIDE = 768

export function heroPos(vw: number): { x: number; y: number } {
  return vw >= WIDE ? HERO_POS_DESKTOP : HERO_POS_MOBILE
}
