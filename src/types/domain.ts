/* ============================================================================
   Good Loop — Core domain model
   These types are the contract everything else builds on: the player consumes
   them, the (future) admin studio produces them, the catalog is a list of them.
   Keep this file framework-agnostic.
   ============================================================================ */

export type Language = 'pt-BR' | 'en' | 'de' | 'es' | 'it'

/** The 5 clinical families (each has 5 sub-protocols, x.1 .. x.5) plus GL-LIB,
    the non-clinical library: general wellbeing audios a person picks by
    themselves, named after a moment rather than a condition. GL-LIB entries
    never appear in a therapist's clinical pathway and carry no sub-protocol
    numbering — see src/data/library.ts. */
export type ProtocolFamily = 'GL-ANX' | 'GL-DEP' | 'GL-BURN' | 'GL-STRESS' | 'GL-RESIL' | 'GL-LIB'

/** Quick / Standard / Deep — the three version configs. */
export type Duration = 6 | 12 | 24

/** Fixed 6-phase therapeutic structure (FN-02). */
export type PhaseId = 1 | 2 | 3 | 4 | 5 | 6

export interface SessionPhase {
  id: PhaseId
  name: string
  /** Fraction of the total session length (0..1). The set must sum to ~1. */
  fraction: number
  /** The breathing orb is shown ONLY in Phase 2 per the UX spec. */
  showOrb?: boolean
}

export interface ProtocolVersion {
  duration: Duration
  /** Real length of the pre-rendered audio, in seconds. Defaults to duration*60. */
  lengthSeconds?: number
  /**
   * Path/URL to the pre-rendered audio per language (the MVP model — FN-21).
   * Optional in seed data because real voice assets don't exist yet; when a
   * URL is absent the player falls back to a synthesized placeholder bed.
   */
  audioUrl?: Partial<Record<Language, string>>
}

export interface Protocol {
  /** Human code, e.g. "GL-ANX 1.1". */
  code: string
  family: ProtocolFamily
  /** CLINICAL title, e.g. "Calm and Inner Safety". The therapist's and the
      admin's name for the material; it names a therapeutic intent. */
  title: string
  /** One-line clinical description. */
  blurb: string
  /**
   * NON-THERAPEUTIC name, shown to the person listening when it is set.
   * The clinical title says what the protocol treats; this one says what the
   * moment feels like ("Un respiro prima di dormire"), never a condition, a
   * diagnosis or a treatment. Setting it does NOT change the code, the family
   * or the pathway: it changes the label only, so the same material can be
   * offered without clinical vocabulary. Absent → the clinical title is used,
   * which is the behavior everything had before this field existed.
   */
  publicTitle?: string
  /** Non-therapeutic one-liner that goes with `publicTitle`. */
  publicBlurb?: string
  /**
   * Free-form catalog tags (ids from `src/data/tags.ts`). Editorial metadata
   * for finding and grouping published material — never a clinical claim and
   * never a routing decision on its own.
   */
  tags?: string[]
  /** The 6 phases; fractions scale to each version's length. */
  phases: SessionPhase[]
  versions: ProtocolVersion[]
}

/** The title to print where a PERSON reads it (player, home, history). */
export function patientTitle(p: Pick<Protocol, 'title' | 'publicTitle'>): string {
  const pub = p.publicTitle?.trim()
  return pub && pub.length ? pub : p.title
}

/** The blurb to print where a PERSON reads it. Falls back to the clinical one
    only when no public blurb was written — a public TITLE with no public blurb
    still shows the clinical blurb, so the pair is worth writing together. */
export function patientBlurb(p: Pick<Protocol, 'blurb' | 'publicBlurb'>): string {
  const pub = p.publicBlurb?.trim()
  return pub && pub.length ? pub : p.blurb
}

/* --- B2C onboarding ("micro-intake", UC-B2C-02) -------------------------- */

/** Q2 "What are you looking for?" */
export type Intent = 'calm' | 'energy' | 'focus' | 'sleep'

/** Coarse problem clusters from the fuller wizard (08.2) — used in later routing. */
export type ProblemCluster =
  | 'anxiety' | 'stress' | 'depression' | 'burnout' | 'resilience' | 'maintenance'

/**
 * A mood check-in. The user only ever sees an emoji (1..5); the 0..10 VAS is
 * derived and stored in the background (RN-UX-04 / RN-CLIN-03 — never shown as
 * a clinical number).
 */
export interface MoodCheck {
  emoji: number // 1..5
  vas: number // 0..10 (hidden)
  at: number // epoch ms
}

export interface MicroIntakeResult {
  mood: MoodCheck // Q1
  intent: Intent // Q2
  preferredDuration: Duration // Q3 (NOTE: the first session is always Quick/6)
  consentAt: number // LGPD consent timestamp (RN-LGPD-02)
}

/* --- Session telemetry (Clinical Event layer) ---------------------------- */

export interface SessionRecord {
  id: string
  protocolCode: string
  duration: Duration
  startedAt: number
  completedAt?: number
  vasPre?: MoodCheck
  vasPost?: MoodCheck
}

/** VAS delta = post - pre, the efficacy metric shown to the user. */
export function vasDelta(record: Pick<SessionRecord, 'vasPre' | 'vasPost'>): number | null {
  if (!record.vasPre || !record.vasPost) return null
  return Number((record.vasPost.vas - record.vasPre.vas).toFixed(1))
}
