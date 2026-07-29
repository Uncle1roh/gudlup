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

/** The full catalog: 25 protocols × 3 versions (titles per the B2C wizard
    spec). Published imports override these at runtime via the registry. */
export const PROTOCOLS: Protocol[] = [
  {
    code: 'GL-ANX 1.1',
    family: 'GL-ANX',
    title: 'Calm and Inner Security',
    blurb: 'Settle a racing mind and find a steady sense of safety.',
    phases: STANDARD_PHASES,
    versions: [{ duration: 6 }, { duration: 12 }, { duration: 24 }],
  },
  {
    code: 'GL-ANX 1.2',
    family: 'GL-ANX',
    title: 'Managing Anxious Emotions',
    blurb: 'Ride the emotional wave without being swept away.',
    phases: STANDARD_PHASES,
    versions: [{ duration: 6 }, { duration: 12 }, { duration: 24 }],
  },
  {
    code: 'GL-ANX 1.3',
    family: 'GL-ANX',
    title: 'Breathing and Grounding',
    blurb: 'Bring an activated body back to slow, steady ground.',
    phases: STANDARD_PHASES,
    versions: [{ duration: 6 }, { duration: 12 }, { duration: 24 }],
  },
  {
    code: 'GL-ANX 1.4',
    family: 'GL-ANX',
    title: 'Trust in the Present',
    blurb: 'Loosen worry about the future and return to now.',
    phases: STANDARD_PHASES,
    versions: [{ duration: 6 }, { duration: 12 }, { duration: 24 }],
  },
  {
    code: 'GL-ANX 1.5',
    family: 'GL-ANX',
    title: 'Release and Transformation',
    blurb: 'Set down the burden you have been carrying.',
    phases: STANDARD_PHASES,
    versions: [{ duration: 6 }, { duration: 12 }, { duration: 24 }],
  },
  {
    code: 'GL-DEP 2.1',
    family: 'GL-DEP',
    title: 'Inner Light and Hope',
    blurb: 'Let a first light back into the grey.',
    phases: STANDARD_PHASES,
    versions: [{ duration: 6 }, { duration: 12 }, { duration: 24 }],
  },
  {
    code: 'GL-DEP 2.2',
    family: 'GL-DEP',
    title: 'Personal Worth and Self-Esteem',
    blurb: 'Meet yourself with worth instead of criticism.',
    phases: STANDARD_PHASES,
    versions: [{ duration: 6 }, { duration: 12 }, { duration: 24 }],
  },
  {
    code: 'GL-DEP 2.3',
    family: 'GL-DEP',
    title: 'Connection and Belonging',
    blurb: 'Feel connected and part of something again.',
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
    code: 'GL-DEP 2.5',
    family: 'GL-DEP',
    title: 'Healing and Rebirth',
    blurb: 'Close a chapter with care and begin again.',
    phases: STANDARD_PHASES,
    versions: [{ duration: 6 }, { duration: 12 }, { duration: 24 }],
  },
  {
    code: 'GL-BURN 3.1',
    family: 'GL-BURN',
    title: 'Permission to Stop',
    blurb: 'Allow yourself to stop — you have given enough.',
    phases: STANDARD_PHASES,
    versions: [{ duration: 6 }, { duration: 12 }, { duration: 24 }],
  },
  {
    code: 'GL-BURN 3.2',
    family: 'GL-BURN',
    title: 'Boundaries and Personal Protection',
    blurb: 'Say no, protect your space, keep what is yours.',
    phases: STANDARD_PHASES,
    versions: [{ duration: 6 }, { duration: 12 }, { duration: 24 }],
  },
  {
    code: 'GL-BURN 3.3',
    family: 'GL-BURN',
    title: 'Regeneration and Energy Recovery',
    blurb: 'Recharge empty batteries, slowly and fully.',
    phases: STANDARD_PHASES,
    versions: [{ duration: 6 }, { duration: 12 }, { duration: 24 }],
  },
  {
    code: 'GL-BURN 3.4',
    family: 'GL-BURN',
    title: 'Redefining Priorities',
    blurb: 'Step off the treadmill and see what really matters.',
    phases: STANDARD_PHASES,
    versions: [{ duration: 6 }, { duration: 12 }, { duration: 24 }],
  },
  {
    code: 'GL-BURN 3.5',
    family: 'GL-BURN',
    title: 'Return to the Authentic Self',
    blurb: 'Come back to the person behind the autopilot.',
    phases: STANDARD_PHASES,
    versions: [{ duration: 6 }, { duration: 12 }, { duration: 24 }],
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
    code: 'GL-STRESS 4.2',
    family: 'GL-STRESS',
    title: 'Managing Workload',
    blurb: 'Untangle the overload, one thing at a time.',
    phases: STANDARD_PHASES,
    versions: [{ duration: 6 }, { duration: 12 }, { duration: 24 }],
  },
  {
    code: 'GL-STRESS 4.3',
    family: 'GL-STRESS',
    title: 'Work-Life Balance',
    blurb: 'Let work end where your life begins.',
    phases: STANDARD_PHASES,
    versions: [{ duration: 6 }, { duration: 12 }, { duration: 24 }],
  },
  {
    code: 'GL-STRESS 4.4',
    family: 'GL-STRESS',
    title: 'Inner Resources and Resilience',
    blurb: 'Find the reserves that keep you going, sustainably.',
    phases: STANDARD_PHASES,
    versions: [{ duration: 6 }, { duration: 12 }, { duration: 24 }],
  },
  {
    code: 'GL-STRESS 4.5',
    family: 'GL-STRESS',
    title: 'Mindful and Pragmatic Action',
    blurb: 'Move from stuck to one clear, doable step.',
    phases: STANDARD_PHASES,
    versions: [{ duration: 6 }, { duration: 12 }, { duration: 24 }],
  },
  {
    code: 'GL-RESIL 5.1',
    family: 'GL-RESIL',
    title: 'Flexibility and Adaptation',
    blurb: 'Bend with change without losing your footing.',
    phases: STANDARD_PHASES,
    versions: [{ duration: 6 }, { duration: 12 }, { duration: 24 }],
  },
  {
    code: 'GL-RESIL 5.2',
    family: 'GL-RESIL',
    title: 'Transforming Difficulties',
    blurb: 'Turn a hard blow into ground you can stand on.',
    phases: STANDARD_PHASES,
    versions: [{ duration: 6 }, { duration: 12 }, { duration: 24 }],
  },
  {
    code: 'GL-RESIL 5.3',
    family: 'GL-RESIL',
    title: 'Inner Strength and Self-Efficacy',
    blurb: 'Trust your own capability, tested and real.',
    phases: STANDARD_PHASES,
    versions: [{ duration: 6 }, { duration: 12 }, { duration: 24 }],
  },
  {
    code: 'GL-RESIL 5.4',
    family: 'GL-RESIL',
    title: 'Supportive Relationships',
    blurb: 'Weave the safety net of people around you.',
    phases: STANDARD_PHASES,
    versions: [{ duration: 6 }, { duration: 12 }, { duration: 24 }],
  },
  {
    code: 'GL-RESIL 5.5',
    family: 'GL-RESIL',
    title: 'Vision and Continuous Growth',
    blurb: 'Give your growth a direction and a purpose.',
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
