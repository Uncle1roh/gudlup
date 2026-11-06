/* ============================================================================
   The icon, drawn large

   Good Loop's mark is a set of concentric rings. This is that mark used as
   the furniture of a page: eleven filled circles, lightest at the centre,
   with a drop shadow under each one so the stack reads as something with
   depth rather than a flat target. It is one SVG, always 3000x3000 in its
   own coordinates, scaled and moved by the layer above
   (`AmbientBackground`) — which is why nothing here knows about the
   viewport or the stage.

   TWO palettes. The dark one is moss on near-black, with a misty white
   centre and a faint column of light rising out of it; it dresses every
   public page and the Home screen of anyone who reads on the dark ground.
   The light one is cream falling to emerald and has no mist — over sand, a
   white glow is a smudge, the same reason the grain is dark-only
   (`ui2/shell.css`).

   The outline rings at the bottom of this file are a different object: ten
   thin circles drawn around the PERSON in the photograph, so they belong to
   the picture rather than to the page.
   ============================================================================ */

export type Palette = 'dark' | 'light'

/** Outer to inner. Eleven radii, eleven colours, in step. */
const RADII = [1500, 1180, 940, 760, 610, 480, 370, 280, 205, 140, 88]

const FILLS: Record<Palette, string[]> = {
  dark: ['#132E24', '#1B3E2F', '#24503A', '#2F6345', '#3F7650', '#58895F', '#7A9F78', '#A3BC9C', '#C9D7C0', '#DDE6D3', '#EEF2E8'],
  light: ['#F7F4DA', '#F1EFCE', '#E9ECC6', '#DDE7BF', '#CCDFB5', '#B6D5A8', '#9BC89A', '#7DB88B', '#5FA67D', '#00835F', '#00694F'],
}

const SHADOW: Record<Palette, { color: string; opacity: number }> = {
  dark: { color: '#04140E', opacity: 0.35 },
  light: { color: '#2F5A44', opacity: 0.13 },
}

const C = 1500

/**
 * The filled rings.
 *
 * `palette` suffixes every filter and gradient id, because both palettes can
 * be in the document at once during a cross-fade, and two filters sharing an
 * id are one filter — whichever parsed last, applied to both.
 */
export function FilledRings({ palette }: { palette: Palette }) {
  const sh = SHADOW[palette]
  const drop = `gl-ring-drop-${palette}`
  const mist = `gl-ring-mist-${palette}`
  const soft = `gl-ring-soft-${palette}`
  return (
    <svg
      className="amb-rings__svg"
      viewBox="0 0 3000 3000"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* One shadow for every circle. `userSpaceOnUse` with a region far
            wider than the shape, because the default -10%/+20% box clips a
            16-unit blur on a 1500-unit circle at the edges. */}
        <filter id={drop} filterUnits="userSpaceOnUse" x="-600" y="-600" width="4200" height="4200">
          <feDropShadow dx="0" dy="10" stdDeviation="16" floodColor={sh.color} floodOpacity={sh.opacity} />
        </filter>
        <filter id={soft} filterUnits="userSpaceOnUse" x="0" y="0" width="3000" height="3000">
          <feGaussianBlur stdDeviation="26" />
        </filter>
        {palette === 'dark' && (
          <radialGradient id={mist} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
            <stop offset="0.45" stopColor="#F4F6EE" stopOpacity="0.7" />
            <stop offset="1" stopColor="#F4F6EE" stopOpacity="0" />
          </radialGradient>
        )}
      </defs>

      {RADII.map((r, i) => (
        <circle key={r} cx={C} cy={C} r={r} fill={FILLS[palette][i]} filter={`url(#${drop})`} />
      ))}

      {palette === 'dark' ? (
        <>
          {/* The mist: a wide soft halo, a tight bloom inside it, a thin
              column of light rising above the centre, and the point itself. */}
          <circle cx={C} cy={C} r={150} fill={`url(#${mist})`} />
          <circle cx={C} cy={C} r={60} fill="#FFFFFF" opacity={0.8} filter={`url(#${soft})`} />
          <rect x={1493} y={1240} width={14} height={260} rx={7} fill="#FFFFFF" opacity={0.35} filter={`url(#${soft})`} />
          <circle cx={C} cy={C} r={16} fill="#FFFFFF" opacity={0.9} />
        </>
      ) : (
        <>
          <circle cx={C} cy={C} r={44} fill="#00835F" filter={`url(#${drop})`} />
          <circle cx={C} cy={C} r={22} fill="#F4F4EE" />
        </>
      )}
    </svg>
  )
}

/* ------------------------------------------------- the rings on the person ---

   Radii are in the photograph's own 1440-wide units and are multiplied by
   `k` — how wide the picture is actually drawn — so the halo stays the same
   size relative to the figure on every screen rather than the same size in
   pixels. */

const OUTLINE: { r: number; w: number; o: number }[] = [
  { r: 49, w: 2.60, o: 0.75 },
  { r: 98, w: 2.42, o: 0.68 },
  { r: 161, w: 2.24, o: 0.61 },
  { r: 238, w: 2.06, o: 0.54 },
  { r: 328, w: 1.88, o: 0.47 },
  { r: 433, w: 1.70, o: 0.40 },
  { r: 552, w: 1.52, o: 0.33 },
  { r: 685, w: 1.34, o: 0.26 },
  { r: 831, w: 1.16, o: 0.19 },
  { r: 992, w: 1.00, o: 0.12 },
]

export function OutlineRings({ x, y, k, breathing }: { x: number; y: number; k: number; breathing: boolean }) {
  return (
    <svg className="amb-outline__svg" aria-hidden="true" focusable="false">
      <g
        className={breathing ? 'amb-outline__g is-breathing' : 'amb-outline__g'}
        /* The breath has to grow from the FIGURE, not from the corner of the
           window, and `transform-origin` on an SVG group takes the group's
           own user units — which here are the window's pixels. */
        style={{ transformOrigin: `${x}px ${y}px` }}
      >
        {OUTLINE.map((o) => (
          <circle
            key={o.r}
            cx={x}
            cy={y}
            r={o.r * k}
            fill="none"
            stroke="#F4F0BE"
            strokeWidth={o.w}
            opacity={o.o}
          />
        ))}
      </g>
    </svg>
  )
}
