/* ============================================================================
   The colour of how you are

   A port of `renderVals()` in docs/ui-redesign/mockups/HomeMood.dc.html,
   line for line. The mockup is the specification, so the constants here are
   its constants and the arithmetic is its arithmetic — anything that reads
   differently is a bug in this file, not an improvement.

   Two numbers come in, both −1…1: valence (unpleasant → pleasant) and
   arousal (calm → agitated). One colour comes out.

   The walk: the four corner anchors are bilinearly mixed in OKLab to find
   the colour of the EDGE in this direction, then the result is mixed from
   the neutral centre outward by the distance from it, so the middle of the
   grid is always the same sand and the corners are always the four anchors.
   Chroma is capped at 0.15 — past that the surface stops being something a
   person can read text on.

   Nothing here touches the DOM, the network or storage: given the same two
   numbers it returns the same colour, which is what makes it testable
   (tools/test-mood-color.ts).
   ============================================================================ */

export interface Mood {
  /** −1 unpleasant … 1 pleasant. */
  valence: number
  /** −1 calm … 1 agitated. */
  arousal: number
}

type Lab = [L: number, a: number, b: number]

/** OKLCH [L, C, h°] → OKLab [L, a, b]. */
function toLab([L, C, h]: [number, number, number]): Lab {
  return [L, C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180)]
}

function mix(p: Lab, q: Lab, t: number): Lab {
  return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]
}

/**
 * The five fixed points of the grid.
 *
 *   q1  pleasant + agitated   warm amber
 *   q2  unpleasant + agitated terracotta
 *   q3  unpleasant + calm     slate blue
 *   q4  pleasant + calm       pale green
 *   n   the centre            the sand the app rests on when nobody has said
 *                             anything yet (#BEB6A9)
 */
export const ANCHORS: Record<'q1' | 'q2' | 'q3' | 'q4' | 'n', Lab> = {
  q1: toLab([0.86, 0.14, 85]),
  q2: toLab([0.58, 0.15, 35]),
  q3: toLab([0.45, 0.04, 255]),
  q4: toLab([0.86, 0.08, 180]),
  n: toLab([0.78, 0.02, 80]),
}

export const CHROMA_CAP = 0.15

/** At or above this lightness the surface carries dark text. */
export const LIGHT_THRESHOLD = 0.65

/** OKLab → sRGB hex, via linear sRGB. */
function labToHex([L, ca, cb]: Lab): string {
  const l_ = L + 0.3963377774 * ca + 0.2158037573 * cb
  const m_ = L - 0.1055613458 * ca - 0.0638541728 * cb
  const s_ = L - 0.0894841775 * ca - 1.291485548 * cb
  const l3 = l_ ** 3
  const m3 = m_ ** 3
  const s3 = s_ ** 3
  const lin = [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
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

export interface MoodColor {
  hex: string
  /** OKLab lightness, before the chroma cap (the cap does not move it). */
  L: number
  /** Chroma after the cap — never above CHROMA_CAP. */
  C: number
  /** true → the surface takes the dark-text token set. */
  light: boolean
}

export function moodColor({ valence, arousal }: Mood): MoodColor {
  const v = clampAxis(valence)
  const a = clampAxis(arousal)
  const u = (v + 1) / 2
  const w = (a + 1) / 2

  const edge = mix(mix(ANCHORS.q3, ANCHORS.q4, u), mix(ANCHORS.q2, ANCHORS.q1, u), w)
  const rr = Math.min(1, Math.hypot(v, a))

  const [L, ca0, cb0] = mix(ANCHORS.n, edge, rr)
  let ca = ca0
  let cb = cb0
  const C = Math.hypot(ca, cb)
  if (C > CHROMA_CAP) {
    ca *= CHROMA_CAP / C
    cb *= CHROMA_CAP / C
  }

  return { hex: labToHex([L, ca, cb]), L, C: Math.min(C, CHROMA_CAP), light: L >= LIGHT_THRESHOLD }
}

/** The grid cannot be left; a stray number from a pointer or a key is held. */
export function clampAxis(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(-1, n))
}

/** Two decimals, which is the resolution the grid is read at. */
export function roundAxis(n: number): number {
  return Math.round(clampAxis(n) * 100) / 100
}

/* ------------------------------------------------------------- the words --- */

/* A word is stored by id and printed in the reader's own language. Naming the
   feeling is the point of the step, and it only works in the language a
   person thinks in — so these do NOT go through the app's dictionary, where
   an untranslated key would fall back to English. */

export type Quadrant = 'q1' | 'q2' | 'q3' | 'q4'

export const NEUTRAL_LABEL = 'neutral'

/** Four per quadrant, in the mockup's order. */
export const QUADRANT_LABELS: Record<Quadrant, string[]> = {
  q1: ['joyful', 'enthusiastic', 'energised', 'inspired'],
  q2: ['anxious', 'tense', 'irritated', 'overwhelmed'],
  q3: ['sad', 'tired', 'discouraged', 'empty'],
  q4: ['calm', 'serene', 'relaxed', 'grateful'],
}

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

/** How far from the centre, capped at 1. */
export function distanceFromCentre({ valence, arousal }: Mood): number {
  return Math.min(1, Math.hypot(clampAxis(valence), clampAxis(arousal)))
}

/** The words to offer for a point, in order — the centre adds "Neutro(a)". */
export function labelsFor(mood: Mood): string[] {
  const q = QUADRANT_LABELS[quadrantOf(mood)]
  return distanceFromCentre(mood) < 0.25 ? [NEUTRAL_LABEL, ...q] : q
}

export function moodWord(id: string | null | undefined, locale: string): string {
  if (!id) return ''
  const table = MOOD_WORDS[locale] ?? MOOD_WORDS[locale.split('-')[0]] ?? MOOD_WORDS['pt-BR']
  return table[id] ?? ''
}

/* The five faces on the phone are five fixed points of this same grid, so the
   two instruments produce the same colour from the same engine (brief §6.3). */
export const FACE_POINTS: { id: string; mood: Mood }[] = [
  { id: 'very-bad', mood: { valence: -0.8, arousal: -0.4 } },
  { id: 'bad', mood: { valence: -0.5, arousal: -0.2 } },
  { id: 'neutral', mood: { valence: 0, arousal: 0 } },
  { id: 'good', mood: { valence: 0.5, arousal: -0.3 } },
  { id: 'very-good', mood: { valence: 0.8, arousal: 0.4 } },
]
