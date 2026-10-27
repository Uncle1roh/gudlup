/* ============================================================================
   The colour of a feeling — docs/ui-redesign/checkin-emocional-spec.docx

   Two numbers come in: valence (−1 unpleasant → +1 pleasant) and arousal
   (−1 calm → +1 agitated). One colour comes out. The spec's three principles,
   all from the research it cites, are the whole design:

     pleasantness → LIGHTNESS      a better state is a lighter colour
     arousal      → CHROMA + WARMTH  agitated runs warm and saturated,
                                     calm runs cool
     a mirror, damped               chroma is CAPPED at 0.15, because a
                                     saturated colour raises arousal: an
                                     anxious person sees a muted terracotta,
                                     never a vivid red

   Mixing happens in OKLab, not RGB and not HSL, so a blend between two
   anchors stays perceptual and never passes through a dirty grey. The five
   anchors are the spec's, in OKLCH, and the function below is its
   `moodColor(v, a)` line for line.

   No dependency. culori would do this, and this is thirty lines; the repo
   carries seven runtime dependencies and this is not the eighth.

   Everything here is PURE. No React, no DOM, no storage: the provider owns
   the state, the stylesheet owns the paint, and this file can be unit-tested
   on its own (tools/test-mood-color.ts).
   ============================================================================ */

/** OKLCH, as the spec writes it: [lightness 0…1, chroma, hue degrees]. */
export type Oklch = readonly [number, number, number]
/** OKLab: [L, a, b]. What we interpolate in. */
export type Oklab = readonly [number, number, number]

/** The five reference colours (spec § Regras da cor). */
export const ANCHORS = {
  /** pleasant + agitated — luminous amber. #FBC959 */
  q1: [0.86, 0.14, 85] as Oklch,
  /** unpleasant + agitated — muted terracotta. #C25237 */
  q2: [0.58, 0.15, 35] as Oklch,
  /** unpleasant + calm — dark blue-grey. #46576C */
  q3: [0.45, 0.04, 255] as Oklch,
  /** pleasant + calm — pale sea green. #95E3D3 */
  q4: [0.86, 0.08, 180] as Oklch,
  /** the centre — warm grey. #BEB6A9 */
  n: [0.78, 0.02, 80] as Oklch,
} as const

/** The spec's ceiling on saturation. A mirror, not an amplifier. */
export const CHROMA_CAP = 0.15

/** Above this lightness the text on the colour is dark; below it, light. */
export const LIGHT_THRESHOLD = 0.65

export function oklchToOklab([L, C, h]: Oklch): Oklab {
  const rad = (h * Math.PI) / 180
  return [L, C * Math.cos(rad), C * Math.sin(rad)]
}

export function oklabToOklch([L, a, b]: Oklab): Oklch {
  const C = Math.hypot(a, b)
  let h = (Math.atan2(b, a) * 180) / Math.PI
  if (h < 0) h += 360
  return [L, C, h]
}

/** Linear blend of two OKLab colours. `t` 0 → p, 1 → q. */
export function mixOklab(p: Oklab, q: Oklab, t: number): Oklab {
  return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]
}

/** Pull a colour back inside the chroma ceiling, keeping its hue. */
export function capChroma(c: Oklab, cap = CHROMA_CAP): Oklab {
  const [L, a, b] = c
  const C = Math.hypot(a, b)
  if (C <= cap || C === 0) return c
  const k = cap / C
  return [L, a * k, b * k]
}

/** OKLab → sRGB hex. Out-of-gamut channels are clipped, as browsers do. */
export function oklabToHex([L, a, b]: Oklab): string {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b
  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ]
  return (
    '#' +
    lin
      .map((x) => {
        const c = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(x, 0), 1 / 2.4) - 0.055
        return Math.round(Math.min(1, Math.max(0, c)) * 255)
          .toString(16)
          .padStart(2, '0')
      })
      .join('')
  )
}

/** The string stored in `mood_checkins.color_oklch`, 3 decimals of L and C. */
export function oklchString(c: Oklab): string {
  const [L, C, h] = oklabToOklch(c)
  return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${h.toFixed(1)})`
}

export interface Mood {
  /** −1 … +1, two decimals. */
  valence: number
  /** −1 … +1, two decimals. */
  arousal: number
}

export interface MoodColor {
  /** What the app paints. */
  hex: string
  /** What the row records. */
  oklch: string
  /** OKLab, for anything that needs to go on mixing (the player's half-chroma). */
  lab: Oklab
  /** L ≥ 0.65: the colour carries dark text. */
  light: boolean
}

/** Clamp to the grid and to two decimals, which is the stored precision. */
export function roundAxis(n: number): number {
  return Math.round(Math.min(1, Math.max(-1, n)) * 100) / 100
}

/**
 * The spec's algorithm, unchanged:
 *   1 · mix the calm edge and the active edge by u (how pleasant),
 *   2 · mix those two by w (how agitated) — that is the edge colour,
 *   3 * walk from the neutral centre towards it by r (distance from centre),
 *   4 · cap the chroma.
 */
export function moodLab({ valence, arousal }: Mood): Oklab {
  const v = Math.min(1, Math.max(-1, valence))
  const a = Math.min(1, Math.max(-1, arousal))
  const u = (v + 1) / 2
  const w = (a + 1) / 2
  const calm = mixOklab(oklchToOklab(ANCHORS.q3), oklchToOklab(ANCHORS.q4), u)
  const active = mixOklab(oklchToOklab(ANCHORS.q2), oklchToOklab(ANCHORS.q1), u)
  const edge = mixOklab(calm, active, w)
  const r = Math.min(1, Math.hypot(v, a))
  return capChroma(mixOklab(oklchToOklab(ANCHORS.n), edge, r))
}

export function moodColor(mood: Mood): MoodColor {
  const lab = moodLab(mood)
  return { hex: oklabToHex(lab), oklch: oklchString(lab), lab, light: lab[0] >= LIGHT_THRESHOLD }
}

/** The same colour with half the saturation: what plays behind a session. */
export function dampen(lab: Oklab, factor = 0.5): Oklab {
  return [lab[0], lab[1] * factor, lab[2] * factor]
}

/** The neutral centre — what the app wears before anyone has checked in. */
export const NEUTRAL: MoodColor = moodColor({ valence: 0, arousal: 0 })

/* ------------------------------------------------------------- words -----

   The four words of the quadrant you touched, plus "Neutral" near the centre.
   They are the point of the whole exercise: naming the feeling is the part
   with strong evidence behind it (Lieberman 2007), and the colour is only
   what makes the state visible.

   Always in the reader's own language — the spec is explicit that naming an
   emotion in a second language does not produce the effect — so these are
   stored per locale here rather than run through the English-keyed t().
   Stored as ids so the row keeps a stable `label_id` whatever the locale. */

export type Quadrant = 'q1' | 'q2' | 'q3' | 'q4'

export const NEUTRAL_LABEL = 'neutral'

export const QUADRANT_LABELS: Record<Quadrant, string[]> = {
  q1: ['joyful', 'enthusiastic', 'energised', 'inspired'],
  q2: ['anxious', 'tense', 'irritated', 'overwhelmed'],
  q3: ['sad', 'tired', 'discouraged', 'empty'],
  q4: ['calm', 'serene', 'relaxed', 'grateful'],
}

/** label id → the word, per locale (spec § Palavras por quadrante). */
export const MOOD_WORDS: Record<string, Record<string, string>> = {
  'pt-BR': {
    neutral: 'Neutro(a)',
    joyful: 'Alegre', enthusiastic: 'Entusiasmado(a)', energised: 'Energizado(a)', inspired: 'Inspirado(a)',
    anxious: 'Ansioso(a)', tense: 'Tenso(a)', irritated: 'Irritado(a)', overwhelmed: 'Sobrecarregado(a)',
    sad: 'Triste', tired: 'Cansado(a)', discouraged: 'Desanimado(a)', empty: 'Vazio(a)',
    calm: 'Calmo(a)', serene: 'Sereno(a)', relaxed: 'Relaxado(a)', grateful: 'Grato(a)',
  },
  it: {
    neutral: 'Neutro/a',
    joyful: 'Gioioso/a', enthusiastic: 'Entusiasta', energised: 'Energico/a', inspired: 'Ispirato/a',
    anxious: 'Ansioso/a', tense: 'Teso/a', irritated: 'Irritato/a', overwhelmed: 'Sopraffatto/a',
    sad: 'Triste', tired: 'Stanco/a', discouraged: 'Scoraggiato/a', empty: 'Vuoto/a',
    calm: 'Calmo/a', serene: 'Sereno/a', relaxed: 'Rilassato/a', grateful: 'Grato/a',
  },
}

export function quadrantOf({ valence, arousal }: Mood): Quadrant {
  if (valence >= 0) return arousal >= 0 ? 'q1' : 'q4'
  return arousal >= 0 ? 'q2' : 'q3'
}

/** How far from the centre. Under 0.25 the centre word is offered too. */
export function distanceFromCentre({ valence, arousal }: Mood): number {
  return Math.min(1, Math.hypot(valence, arousal))
}

/** The label ids to offer for a point, in order. */
export function labelsFor(mood: Mood): string[] {
  const q = QUADRANT_LABELS[quadrantOf(mood)]
  return distanceFromCentre(mood) < 0.25 ? [NEUTRAL_LABEL, ...q] : q
}

/** The word itself, in the reader's language. Unknown locale → pt-BR. */
export function moodWord(id: string | null, locale: string): string {
  if (!id) return ''
  const table = MOOD_WORDS[locale] ?? MOOD_WORDS[locale.split('-')[0]] ?? MOOD_WORDS['pt-BR']
  return table[id] ?? ''
}
