import type { Protocol, SessionPhase, Intent, Duration } from '../types/domain'

/**
 * Standard 6-phase structure (FN-02). Fractions sum to 1.0 and scale to each
 * version's length. In real content the Quick (6 min) version compresses these
 * into 4 phases; for the player shell we run the same 6 conceptual phases.
 * The orb is shown only in Phase 2.
 */
export const STANDARD_PHASES: SessionPhase[] = [
  { id: 1, name: 'Intro + Validation', fraction: 0.11 },
  { id: 2, name: 'Breath + Body Scan', fraction: 0.16, showOrb: true },
  { id: 3, name: 'Exploration', fraction: 0.16 },
  { id: 4, name: 'Processing', fraction: 0.38 },
  { id: 5, name: 'Integration', fraction: 0.10 },
  { id: 6, name: 'Outro + Grounding', fraction: 0.09 },
]

/** Full catalog will hold 25 protocols × 3 versions. Seeded subset for Module 1. */
export const PROTOCOLS: Protocol[] = [
  {
    code: 'GL-ANX 1.1',
    family: 'GL-ANX',
    title: 'Calm and Inner Safety',
    blurb: 'Settle a racing mind and find a steady sense of safety.',
    phases: STANDARD_PHASES,
    versions: [
      { duration: 6 }, // audioUrl absent → placeholder bed for now
      { duration: 12 },
      { duration: 24 },
    ],
  },
  {
    code: 'GL-STRESS 4.1',
    family: 'GL-STRESS',
    title: 'Calm and Focus',
    blurb: 'Quiet a crowded mind and gather your attention.',
    phases: STANDARD_PHASES,
    versions: [{ duration: 6 }, { duration: 12 }, { duration: 24 }],
  },
  {
    code: 'GL-DEP 2.4',
    family: 'GL-DEP',
    title: 'Vital Energy and Motivation',
    blurb: 'Reconnect with a gentle sense of momentum and warmth.',
    phases: STANDARD_PHASES,
    versions: [{ duration: 6 }, { duration: 12 }, { duration: 24 }],
  },
  {
    code: 'GL-BURN 3.1',
    family: 'GL-BURN',
    title: 'Rest and Recovery',
    blurb: 'Step out of overdrive and let your system recover.',
    phases: STANDARD_PHASES,
    versions: [{ duration: 6 }, { duration: 12 }, { duration: 24 }],
  },
  {
    code: 'GL-RESIL 5.1',
    family: 'GL-RESIL',
    title: 'Steadiness and Strength',
    blurb: 'Build a calm, resilient baseline you can return to.',
    phases: STANDARD_PHASES,
    versions: [{ duration: 6 }, { duration: 12 }, { duration: 24 }],
  },
]

/**
 * Runtime protocol registry. Seeded from the static PROTOCOLS above, but the
 * admin catalog (and the import pipeline) can register additional protocols at
 * runtime so getProtocol() resolves them everywhere the app already calls it —
 * without making every call site async. This is the same module-singleton
 * pattern the mock store uses.
 */
const registry = new Map<string, Protocol>(PROTOCOLS.map((p) => [p.code, p]))

export function getProtocol(code: string): Protocol | undefined {
  return registry.get(code)
}

/** Add/replace one protocol in the runtime registry (e.g. a published import). */
export function registerProtocol(p: Protocol): void {
  registry.set(p.code, { ...p })
}

/** Bulk register (e.g. hydrating from the catalog on load). */
export function registerProtocols(list: Protocol[]): void {
  for (const p of list) registry.set(p.code, { ...p })
}

/** Everything currently resolvable (seed + registered). */
export function allProtocols(): Protocol[] {
  return [...registry.values()]
}

/**
 * First-session routing. The WOW session is always a calming Quick (6 min)
 * entry; the "looking for" answer nudges which protocol we open. This is a
 * deliberately simple map for the MVP — the full clinical wizard (08.2) routing
 * comes later once real protocols and assessment exist.
 */
export function pickFirstProtocol(intent: Intent): Protocol {
  const byIntent: Record<Intent, string> = {
    calm: 'GL-ANX 1.1',
    sleep: 'GL-ANX 1.1',
    focus: 'GL-STRESS 4.1',
    energy: 'GL-DEP 2.4',
  }
  return getProtocol(byIntent[intent]) ?? PROTOCOLS[0]
}

/** Length in seconds for a given protocol version (falls back to minutes×60). */
export function versionLengthSeconds(p: Protocol, duration: Duration): number {
  const v = p.versions.find((x) => x.duration === duration)
  return v?.lengthSeconds ?? duration * 60
}
