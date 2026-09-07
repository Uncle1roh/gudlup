/* ============================================================================
   Self Use — cover artwork

   A browsable catalog needs covers, and none are commissioned. The first pass
   was a gradient with one unicode character dropped in the middle, which read
   exactly as what it was: an icon, not a picture. So each cover is now a small
   GENERATED SCENE — an SVG drawn from the session's own slug, layered ground,
   glow, horizon and motif — and is designed to be replaced the moment real art
   exists: delete the motif, hand `coverStyle` a URL.

   Three constraints it has to respect at once:

   · The surface is dark and spends its brightness on ONE thing per screen —
     the cream primary action. A cover may not compete with it. So each theme
     is a DUOTONE from the Studio redesign: a lit corner falling to near-black
     along the same 155deg light, one hue per theme, drawn in the light end of
     its own colour and never in the emerald reserved for data. Two sessions in
     the same theme are recognisably related without being identical.

   · A cover must be legible as a thumbnail AND as a 150px-tall banner: the
     card rail is 3:4 portrait and the session detail is a wide strip. Every
     scene is therefore composed CENTRED inside a square and sliced, so
     cropping in either direction never cuts the subject in half.

   · No text, ever. Titles sit under the card where they can wrap and be
     translated, not baked into a picture that can do neither.

   `coverFor()` is pure and stable: the same slug always produces the same
   cover, so the catalog does not reshuffle itself between renders. The SVG is
   built once per cover and cached — nineteen strings for the life of the tab.
   ============================================================================ */

import type { SelfUseTheme } from '../data/selfuse'

/** The ten scenes. Each is a shape language, not a picture of a thing: the
    catalog has to stay abstract enough that a session about boundaries and a
    session about priorities do not both become a photograph of a beach. */
export type Motif =
  | 'rings'    // concentric — attention narrowing to one point
  | 'horizon'  // a sun over layered ridges — the calm end of the range
  | 'waves'    // stacked swells — breath, flexibility, letting go
  | 'peaks'    // two summits — effort, endurance, the thing overcome
  | 'rays'     // a source radiating — energy, confidence, warmth
  | 'bloom'    // a leaf opening — growth and vitality
  | 'orbit'    // a body and its ring — relation, self and other
  | 'breath'   // nested ellipses around a still point
  | 'path'     // a line that winds and arrives — decision, action
  | 'steps'    // ascending blocks — order, priority, boundaries

export interface Cover {
  /** Two gradient stops, dark to light. */
  from: string
  to: string
  /** Ink for the drawn motif. */
  ink: string
  /** Which scene is drawn. */
  motif: Motif
  /** 0–360, used to rotate the ground so a rail is not visually striped. */
  angle: number
  /** Stable per-slug number — nudges the composition off dead centre. */
  seed: number
  /** A real photograph a PO uploaded. When present it IS the cover and the
      drawing below is not built. */
  imageUrl?: string
}

/* Each theme gets a band rather than a single colour, so the sessions inside
   it read as a family without being interchangeable.

   These are the DUOTONE pairs from the Studio redesign (direction 2a): a lit
   corner falling to near-black along 155deg, one hue per theme. They replaced
   a set mixed for cream paper, which glowed on the dark surface and pulled the
   eye away from the one cream action each screen is allowed. `ink` is the
   light end of the same hue — the motif is drawn in the cover's own colour,
   never in the emerald reserved for data. */
const THEME_BANDS: Record<SelfUseTheme, { from: string; to: string; ink: string }[]> = {
  calm: [
    { from: '#1b4a3e', to: '#08201b', ink: '#a7e8d0' },
    { from: '#12463a', to: '#071412', ink: '#9fe2c8' },
    { from: '#14483b', to: '#0a241e', ink: '#b3edd8' },
  ],
  focus: [
    { from: '#1b2c52', to: '#080f1a', ink: '#a8c4ee' },
    { from: '#17284b', to: '#070d18', ink: '#9dbce9' },
    { from: '#1f3159', to: '#0a1220', ink: '#b6cef2' },
  ],
  energy: [
    { from: '#4a3520', to: '#150d07', ink: '#f0cfa4' },
    { from: '#523a22', to: '#180f08', ink: '#f5d8b1' },
    { from: '#44301d', to: '#120b06', ink: '#eac79a' },
  ],
  balance: [
    { from: '#12463a', to: '#0a2420', ink: '#a7e8d0' },
    { from: '#164e40', to: '#0b2a24', ink: '#b0ecd6' },
    { from: '#0f3d33', to: '#081714', ink: '#9ce0c4' },
  ],
  growth: [
    { from: '#2b2452', to: '#0c0a18', ink: '#c4b4ee' },
    { from: '#3a2430', to: '#14080e', ink: '#eab4c6' },
    { from: '#312a5c', to: '#0e0b1c', ink: '#cebff2' },
  ],
}

/* One scene per session, chosen for what the session DOES. Nineteen sessions
   over ten scenes: the repeats never land in the same colour band, so no two
   covers in a rail look like the same picture twice. */
const MOTIFS: Record<string, Motif> = {
  'focus-clarity': 'rings',
  'demand-management': 'steps',
  'personal-balance': 'orbit',
  'inner-strength': 'peaks',
  'action-decision': 'path',
  'calm-safety': 'horizon',
  'breathing-presence': 'breath',
  'confidence-moment': 'rays',
  'permission-pause': 'waves',
  'healthy-boundaries': 'steps',
  'energy-renewal': 'rays',
  'conscious-priorities': 'rings',
  'professional-authenticity': 'orbit',
  'flexibility-adaptation': 'waves',
  'overcoming-challenges': 'peaks',
  'self-confidence': 'bloom',
  'supportive-connections': 'orbit',
  'vision-growth': 'horizon',
  'vitality-motivation': 'bloom',
}

/** A session the catalog does not know still gets a scene, not a blank. */
const THEME_MOTIF: Record<SelfUseTheme, Motif> = {
  calm: 'horizon',
  focus: 'rings',
  energy: 'rays',
  balance: 'orbit',
  growth: 'bloom',
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

export function coverFor(slug: string, theme: SelfUseTheme, imageUrl?: string): Cover {
  const band = THEME_BANDS[theme] ?? THEME_BANDS.calm
  const n = hash(slug)
  const tone = band[n % band.length]
  return {
    ...tone,
    motif: MOTIFS[slug] ?? THEME_MOTIF[theme] ?? 'horizon',
    /* 155deg is the canvas's light: a lit top-left corner falling to near-black.
       The small spread stops a whole rail reading as one striped block. */
    angle: 148 + (n % 5) * 7,
    seed: n,
    imageUrl: imageUrl || undefined,
  }
}

/* ---------------------------------------------------------------- drawing */

/* The scene is composed inside a 320×320 square and SLICED by the element it
   fills, so the same drawing serves a 3:4 card and a wide banner. Everything
   of interest therefore lives inside the middle band: nothing important above
   y=60 or below y=270, or the banner crop would behead it. */
const BOX = 320
const CX = 160
const CY = 165

/** CSS gradient angle → the two points SVG wants. */
function gradientLine(angle: number): string {
  const r = ((angle - 90) * Math.PI) / 180
  const dx = Math.cos(r) / 2
  const dy = Math.sin(r) / 2
  const f = (v: number) => v.toFixed(4)
  return `x1="${f(0.5 - dx)}" y1="${f(0.5 - dy)}" x2="${f(0.5 + dx)}" y2="${f(0.5 + dy)}"`
}

/** A ridge line across the box: one soft hill, drawn as a filled shape down to
    the bottom edge. Ridges are ink-free — they are the ground in shadow. */
function ridge(y: number, lift: number, opacity: number, shift: number): string {
  const a = -40 + shift
  const b = BOX + 40
  return `<path d="M${a} ${y} Q ${CX + shift} ${y - lift} ${b} ${y - lift * 0.35} L ${b} ${BOX + 40} L ${a} ${BOX + 40} Z" fill="#04120d" opacity="${opacity}"/>`
}

function disc(cx: number, cy: number, r: number, fill: string, opacity = 1): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="${opacity}"/>`
}

function ringPath(cx: number, cy: number, r: number, ink: string, opacity: number, width = 2): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${ink}" stroke-opacity="${opacity}" stroke-width="${width}"/>`
}

function scene(motif: Motif, ink: string, seed: number): string {
  // A small deterministic wobble so two covers with the same motif are not
  // pixel-identical compositions in two colours.
  const j = (n: number, span: number) => ((seed >> (n * 3)) % (span * 2 + 1)) - span

  switch (motif) {
    case 'rings': {
      let s = ''
      for (let i = 4; i >= 1; i -= 1) {
        s += ringPath(CX, CY, 26 + i * 26, ink, 0.10 + i * 0.05, i === 2 ? 3 : 1.5)
      }
      s += disc(CX, CY, 17, ink, 0.92)
      return s
    }

    case 'horizon': {
      const sunY = CY - 22 + j(1, 8)
      return (
        disc(CX + j(2, 14), sunY, 40, ink, 0.16) +
        disc(CX + j(2, 14), sunY, 27, ink, 0.9) +
        ridge(238, 46, 0.24, j(3, 24)) +
        ridge(268, 62, 0.34, -j(3, 24)) +
        ridge(298, 40, 0.46, j(4, 18))
      )
    }

    case 'waves': {
      let s = ''
      for (let i = 0; i < 5; i += 1) {
        const y = 108 + i * 26
        const amp = 15 + (i % 2) * 7
        s += `<path d="M-20 ${y} C 60 ${y - amp}, 110 ${y + amp}, 160 ${y} S 260 ${y - amp}, 340 ${y}" fill="none" stroke="${ink}" stroke-opacity="${(0.5 - i * 0.07).toFixed(2)}" stroke-width="${(3.2 - i * 0.4).toFixed(1)}" stroke-linecap="round"/>`
      }
      return s
    }

    case 'peaks': {
      const k = j(1, 12)
      return (
        disc(CX + 58, CY - 58, 20, ink, 0.85) +
        `<path d="M-20 300 L ${112 + k} 122 L 214 300 Z" fill="#04120d" opacity="0.34"/>` +
        `<path d="M96 300 L ${212 - k} 158 L 340 300 Z" fill="#04120d" opacity="0.24"/>` +
        `<path d="M-20 300 L ${112 + k} 122 L 214 300 Z" fill="${ink}" opacity="0.06"/>`
      )
    }

    case 'rays': {
      let s = ''
      const n = 14
      for (let i = 0; i < n; i += 1) {
        const a = (i / n) * Math.PI * 2
        const inner = 42
        const outer = i % 2 === 0 ? 118 : 88
        const x1 = CX + Math.cos(a) * inner
        const y1 = CY + Math.sin(a) * inner
        const x2 = CX + Math.cos(a) * outer
        const y2 = CY + Math.sin(a) * outer
        s += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${ink}" stroke-opacity="${i % 2 === 0 ? 0.34 : 0.2}" stroke-width="2.4" stroke-linecap="round"/>`
      }
      return s + disc(CX, CY, 44, ink, 0.14) + disc(CX, CY, 29, ink, 0.92)
    }

    case 'bloom': {
      const t = CY - 96
      const b = CY + 74
      return (
        `<path d="M${CX} ${t} C ${CX + 76} ${t + 52}, ${CX + 62} ${b - 40}, ${CX} ${b} C ${CX - 62} ${b - 40}, ${CX - 76} ${t + 52}, ${CX} ${t} Z" fill="${ink}" opacity="0.2"/>` +
        `<path d="M${CX} ${t} C ${CX + 76} ${t + 52}, ${CX + 62} ${b - 40}, ${CX} ${b}" fill="none" stroke="${ink}" stroke-opacity="0.75" stroke-width="2.4"/>` +
        `<path d="M${CX} ${t} C ${CX - 76} ${t + 52}, ${CX - 62} ${b - 40}, ${CX} ${b}" fill="none" stroke="${ink}" stroke-opacity="0.55" stroke-width="2.4"/>` +
        `<line x1="${CX}" y1="${t + 6}" x2="${CX}" y2="${b + 34}" stroke="${ink}" stroke-opacity="0.5" stroke-width="2"/>`
      )
    }

    case 'orbit': {
      const tilt = -22 + j(1, 10)
      return (
        `<g transform="rotate(${tilt} ${CX} ${CY})"><ellipse cx="${CX}" cy="${CY}" rx="118" ry="42" fill="none" stroke="${ink}" stroke-opacity="0.4" stroke-width="2"/>` +
        `<ellipse cx="${CX}" cy="${CY}" rx="82" ry="28" fill="none" stroke="${ink}" stroke-opacity="0.22" stroke-width="1.6"/>` +
        disc(CX + 118, CY, 9, ink, 0.85) + `</g>` +
        disc(CX, CY, 38, ink, 0.14) +
        disc(CX, CY, 25, ink, 0.9)
      )
    }

    case 'breath': {
      let s = ''
      for (let i = 4; i >= 1; i -= 1) {
        s += `<ellipse cx="${CX}" cy="${CY}" rx="${22 + i * 27}" ry="${18 + i * 22}" fill="none" stroke="${ink}" stroke-opacity="${(0.1 + i * 0.055).toFixed(2)}" stroke-width="${i === 2 ? 2.8 : 1.5}"/>`
      }
      return s + disc(CX, CY, 13, ink, 0.9)
    }

    case 'path': {
      const k = j(1, 14)
      const d = `M-10 268 C ${70 + k} 250, ${58 - k} 168, 150 152 S ${240 + k} 118, 330 68`
      return (
        `<path d="${d}" fill="none" stroke="${ink}" stroke-opacity="0.18" stroke-width="14" stroke-linecap="round"/>` +
        `<path d="${d}" fill="none" stroke="${ink}" stroke-opacity="0.8" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="1 11"/>` +
        disc(150, 152, 9, ink, 0.9) +
        disc(298, 82, 14, ink, 0.85)
      )
    }

    case 'steps': {
      let s = disc(CX + 82, CY - 74, 19, ink, 0.85)
      const heights = [58, 92, 130, 172]
      for (let i = 0; i < heights.length; i += 1) {
        const w = 40
        const x = 58 + i * 51
        const h = heights[i]
        s += `<rect x="${x}" y="${278 - h}" width="${w}" height="${h}" rx="10" fill="${ink}" opacity="${(0.22 + i * 0.16).toFixed(2)}"/>`
      }
      return s
    }
  }
}

/** The whole cover as an SVG document string. */
export function coverSvg(c: Cover): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOX} ${BOX}" preserveAspectRatio="xMidYMid slice">` +
    `<defs>` +
    `<linearGradient id="g" ${gradientLine(c.angle)}><stop offset="0" stop-color="${c.from}"/><stop offset="1" stop-color="${c.to}"/></linearGradient>` +
    // the glow is what stops the ground reading as flat colour behind the motif
    `<radialGradient id="h" cx="0.5" cy="0.44" r="0.62"><stop offset="0" stop-color="${c.ink}" stop-opacity="0.26"/><stop offset="1" stop-color="${c.ink}" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="v" cx="0.5" cy="0.5" r="0.75"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.34"/></radialGradient>` +
    `</defs>` +
    `<rect width="${BOX}" height="${BOX}" fill="url(#g)"/>` +
    `<rect width="${BOX}" height="${BOX}" fill="url(#h)"/>` +
    scene(c.motif, c.ink, c.seed) +
    `<rect width="${BOX}" height="${BOX}" fill="url(#v)"/>` +
    `</svg>`
  )
}

/* Nineteen covers, each rebuilt on every card render, is nineteen string
   builds per scroll frame for no reason. They never change, so they are built
   once and kept. */
const uriCache = new Map<string, string>()

export function coverDataUri(c: Cover): string {
  const key = `${c.motif}|${c.from}|${c.to}|${c.ink}|${c.angle}|${c.seed}`
  let uri = uriCache.get(key)
  if (!uri) {
    uri = `data:image/svg+xml,${encodeURIComponent(coverSvg(c))}`
    uriCache.set(key, uri)
  }
  return uri
}

/** The inline style a cover element needs. Kept here so a component never has
    to know how a cover is built — swapping in commissioned art means changing
    this one function. */
export function coverStyle(c: Cover): React.CSSProperties {
  /* A real image wins outright. The generated scene is the honest default
     while nothing is commissioned; it is not a layer to composite a
     photograph onto, and a duotone gradient behind white type is only ever as
     much contrast as a gradient can give. */
  return {
    backgroundImage: `url("${c.imageUrl ?? coverDataUri(c)}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    // kept so overlays drawn on top of a cover (durations, badges) stay legible
    backgroundColor: c.from,
    color: c.ink,
  }
}
