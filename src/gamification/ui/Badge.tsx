/* ============================================================================
   One badge, drawn — SPEC §3.4 and the tier colours of §9.

   Individual achievements are circles, collective ones hexagons: the SHAPE
   differs, not only the colour, so the two read apart for anyone who does
   not see the colour. Each badge is an outer ring, an inner fill, two faint
   rotated ellipses (the crossing orbits of the logo) and a centred stroke
   icon from the app's own set. Locked is the same badge, greyed.

   The colours are the badge's artwork, fixed in both themes, so a Broto
   badge is the same object on the dark ground as on the light one.
   ============================================================================ */

import { Icon, type IconName } from '../../selfuse/icons'
import type { AchievementTier } from '../achievements'

/** fill / ring / icon */
export const TIER_COLOURS: Record<AchievementTier | 'locked', [string, string, string]> = {
  semente:  ['#E3EDC6', '#B7DBAD', '#2F5B3A'],
  broto:    ['#B7DBAD', '#7AC69B', '#1F4A33'],
  raiz:     ['#3DB189', '#7AC69B', '#0E3527'],
  copa:     ['#00785C', '#3DB189', '#FAF8DF'],
  coletiva: ['#533360', '#E89D64', '#F4F0BE'],
  nacional: ['#2465AB', '#F4F0BE', '#FFFFFF'],
  empresa:  ['#3B2A47', '#E89D64', '#F4F0BE'],
  locked:   ['#ECEADB', '#D9D6C3', '#8E8B7A'],
}

/** A regular hexagon, point up, inscribed in a circle of radius r at 50,50. */
function hexagon(r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2
    return `${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`
  }).join(' ')
}

export function Badge({
  icon,
  tier,
  shape,
  size = 72,
  locked = false,
  label,
}: {
  icon: IconName
  tier: AchievementTier
  shape: 'circle' | 'hexagon'
  size?: number
  locked?: boolean
  /** The achievement's name, for a screen reader. Omit when it is printed beside the badge. */
  label?: string
}) {
  const [fill, ring, ink] = TIER_COLOURS[locked ? 'locked' : tier]
  const outer = shape === 'circle'
    ? <circle cx="50" cy="50" r="46" fill={ring} />
    : <polygon points={hexagon(48)} fill={ring} />
  const inner = shape === 'circle'
    ? <circle cx="50" cy="50" r="39" fill={fill} />
    : <polygon points={hexagon(41)} fill={fill} />
  return (
    <svg
      className={`gam-badge${locked ? ' gam-badge--locked' : ''}`}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {outer}
      {inner}
      <g fill="none" stroke={ink} strokeWidth="1.2" opacity="0.22">
        <ellipse cx="50" cy="50" rx="31" ry="13" transform="rotate(-28 50 50)" />
        <ellipse cx="50" cy="50" rx="31" ry="13" transform="rotate(28 50 50)" />
      </g>
      <svg x="29" y="29" width="42" height="42" viewBox="0 0 24 24" style={{ color: ink }}>
        <Icon name={icon} size={24} />
      </svg>
    </svg>
  )
}
