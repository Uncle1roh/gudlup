/* ============================================================================
   Good Loop — Core domain model
   These types are the contract everything else builds on: the player consumes
   them, the (future) admin studio produces them, the catalog is a list of them.
   Keep this file framework-agnostic.
   ============================================================================ */

export type Language = 'pt-BR' | 'en' | 'de' | 'es' | 'it'

/** The 5 clinical families. Each has 5 sub-protocols (x.1 .. x.5). */
export type ProtocolFamily = 'GL-ANX' | 'GL-DEP' | 'GL-BURN' | 'GL-STRESS' | 'GL-RESIL'

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
  /** Patient-facing title, e.g. "Calm and Inner Safety". */
  title: string
  /** One-line patient-facing description. */
  blurb: string
  /** The 6 phases; fractions scale to each version's length. */
  phases: SessionPhase[]
  versions: ProtocolVersion[]
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
