/* ============================================================================
   Where the person in the photograph is, once the browser has cropped it

   The landing and the door draw ten concentric rings around the seated
   figure in the waterfall photograph. The figure is at a fixed place in the
   IMAGE; `object-fit: cover` then scales and offsets that image to fill a
   window of any shape, so the figure is at a different place on every
   screen. This module is the arithmetic that turns the one into the other.

   It is deliberately pure and takes the image's own size as an argument
   rather than the constant 2061×2576 the file happens to be today: the POs
   may replace the photograph with a higher-resolution version of the same
   framing, and that must not be a code change. Callers read `naturalWidth`
   and `naturalHeight` off the loaded <img> and pass them in.
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

/** The seated person, as fractions of the photograph. */
export const HERO_FOCUS = { fx: 0.50, fy: 0.644 }

/** `object-position` on a desk: the figure sits high in a wide window. */
export const HERO_POS_DESKTOP = { x: 0.50, y: 0.388 }

/** …and on a phone, where the window is taller than the picture is wide. */
export const HERO_POS_MOBILE = { x: 0.30, y: 0.50 }

/** The width the ring radii were drawn against. `displayedWidth / this` is
    the factor every radius is multiplied by. */
export const HERO_BASE_WIDTH = 1440

/** The one breakpoint the public pages have. */
export const WIDE = 768

export function heroPos(vw: number): { x: number; y: number } {
  return vw >= WIDE ? HERO_POS_DESKTOP : HERO_POS_MOBILE
}
