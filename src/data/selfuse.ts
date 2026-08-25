/* ============================================================================
   Good Loop — the SELF USE catalog (19 sessions, 5 pathways, 8 quick moods)

   The Self Use app never shows a protocol code and never names a condition.
   It shows 19 SESSIONS with wellbeing names, grouped into 5 PATHWAYS, plus a
   quick-access grid keyed on how the person feels right now.

   Each Self Use session is BACKED by a catalog protocol — the same audio the
   therapist prescribes from their clinical vocabulary. The mapping lives here
   and nowhere else, so the two vocabularies can never drift:

     therapist sees   GL-STRESS 4.2 · Demand Management (clinical title)
     the person sees  Demand Management (Self Use name), 6 / 12 / 24 min

   Six protocols are CLINICAL ONLY (GL-ANX 1.2, 1.5 · GL-DEP 2.1, 2.2, 2.3,
   2.5). They are never in this list, never browsable and never prescribable
   as homework — they run only inside a live therapist-led session.
   ============================================================================ */

import type { Duration } from '../types/domain'

/** Filter themes on the "All Sessions" view. */
export type SelfUseTheme = 'focus' | 'calm' | 'energy' | 'balance' | 'growth'

export const SELF_USE_THEMES: { id: SelfUseTheme; label: string }[] = [
  { id: 'focus', label: 'Focus' },
  { id: 'calm', label: 'Calm' },
  { id: 'energy', label: 'Energy' },
  { id: 'balance', label: 'Balance' },
  { id: 'growth', label: 'Growth' },
]

/** The five editorial series the 19 sessions are grouped in. */
export type SelfUseSeries = 'focus-management' | 'calm-presence' | 'energy-recovery' | 'growth-resilience' | 'standalone'

export const SELF_USE_SERIES: { id: SelfUseSeries; label: string }[] = [
  { id: 'focus-management', label: 'Focus & Management' },
  { id: 'calm-presence', label: 'Calm & Presence' },
  { id: 'energy-recovery', label: 'Energy & Recovery' },
  { id: 'growth-resilience', label: 'Growth & Resilience' },
  { id: 'standalone', label: 'Standalone' },
]

export interface SelfUseSession {
  /** Stable slug — the app's own id for the session. Never shown. */
  slug: string
  /** The name a PERSON reads. Never clinical. */
  name: string
  /** One-line focus, shown on the browse card. */
  blurb: string
  /** Longer copy for the session detail screen. */
  about: string
  /** "What to expect" — non-clinical, three short lines. */
  expect: string[]
  series: SelfUseSeries
  theme: SelfUseTheme
  /** The catalog protocol that carries the audio. Never shown in Self Use. */
  protocolCode: string
  /** Which durations exist. All 19 carry the full set. */
  durations: Duration[]
}

export const DURATIONS: Duration[] = [6, 12, 24]

/** Quick / Standard / Deep — the label a person reads for each length. */
export function durationLabel(d: Duration): string {
  return d === 6 ? 'Quick' : d === 12 ? 'Standard' : 'Deep'
}
export function durationTag(d: Duration): string {
  return `${durationLabel(d)} ${d}m`
}

/* --------------------------------------------------------------------------
   The 19 sessions.
   -------------------------------------------------------------------------- */

export const SELF_USE_SESSIONS: SelfUseSession[] = [
  /* --- Focus & Management (GL-STRESS 4.1–4.5) --- */
  {
    slug: 'focus-clarity',
    name: 'Focus & Clarity',
    blurb: 'Sharpen attention and think clearly under pressure.',
    about:
      'A short reset for a scattered mind. It settles the body first, then narrows attention to one thing at a time, so you can go back to what you were doing without the noise.',
    expect: ['A few slow breaths to settle', 'Guided attention, one thing at a time', 'A clear, unhurried close'],
    series: 'focus-management',
    theme: 'focus',
    protocolCode: 'GL-STRESS 4.1',
    durations: DURATIONS,
  },
  {
    slug: 'demand-management',
    name: 'Demand Management',
    blurb: 'Reorganize competing tasks without feeling swamped.',
    about:
      'For the days when everything is urgent. It separates what is actually yours to carry from what only feels that way, and gives the pile an order you can work with.',
    expect: ['Naming what is on your plate', 'Letting the pile settle into an order', 'One next step, not ten'],
    series: 'focus-management',
    theme: 'focus',
    protocolCode: 'GL-STRESS 4.2',
    durations: DURATIONS,
  },
  {
    slug: 'personal-balance',
    name: 'Personal Balance',
    blurb: 'Find the line between what you give and what you keep.',
    about:
      'A session about proportion. It looks at where your time and energy actually go, and gently returns some of it to you.',
    expect: ['A slow body scan', 'Noticing where your energy goes', 'Reclaiming a little of it'],
    series: 'focus-management',
    theme: 'balance',
    protocolCode: 'GL-STRESS 4.3',
    durations: DURATIONS,
  },
  {
    slug: 'inner-strength',
    name: 'Inner Strength',
    blurb: 'Steady yourself when the demands keep coming.',
    about:
      'Built for stretches that do not let up. It works with steadiness rather than push — the kind of strength that lasts a whole week, not one afternoon.',
    expect: ['Grounding through the body', 'Working with steadiness, not push', 'A settled, durable close'],
    series: 'focus-management',
    theme: 'growth',
    protocolCode: 'GL-STRESS 4.4',
    durations: DURATIONS,
  },
  {
    slug: 'action-decision',
    name: 'Action & Decision',
    blurb: 'Move from turning it over to actually choosing.',
    about:
      'For when a decision has been going round for too long. It quiets the loop and makes room for a choice you can stand behind.',
    expect: ['Quieting the loop', 'Making room for one choice', 'Leaving with a first step'],
    series: 'focus-management',
    theme: 'focus',
    protocolCode: 'GL-STRESS 4.5',
    durations: DURATIONS,
  },

  /* --- Calm & Presence (GL-ANX 1.1, 1.3, 1.4) --- */
  {
    slug: 'calm-safety',
    name: 'Calm & Safety',
    blurb: 'Find calm before high-pressure situations.',
    about:
      'The one to reach for when the pressure is already here. It brings an activated body down to a slower, safer baseline.',
    expect: ['Slowing the breath', 'Settling an activated body', 'A steady, safe close'],
    series: 'calm-presence',
    theme: 'calm',
    protocolCode: 'GL-ANX 1.1',
    durations: DURATIONS,
  },
  {
    slug: 'breathing-presence',
    name: 'Breathing & Presence',
    blurb: 'Come back to the room and to your own breath.',
    about:
      'The simplest session in the library. Breath, body, room — nothing else asked of you.',
    expect: ['A guided breath pattern', 'Contact with the room around you', 'Nothing else asked of you'],
    series: 'calm-presence',
    theme: 'calm',
    protocolCode: 'GL-ANX 1.3',
    durations: DURATIONS,
  },
  {
    slug: 'confidence-moment',
    name: 'Confidence in the Moment',
    blurb: 'Walk into the next ten minutes as yourself.',
    about:
      'For just before something that matters. It puts the future back at a workable distance so you can be present for what is actually happening.',
    expect: ['Settling the anticipation', 'Returning to the present', 'Walking in as yourself'],
    series: 'calm-presence',
    theme: 'calm',
    protocolCode: 'GL-ANX 1.4',
    durations: DURATIONS,
  },

  /* --- Energy & Recovery (GL-BURN 3.1–3.5) --- */
  {
    slug: 'permission-pause',
    name: 'Permission to Pause',
    blurb: 'Stop, without having to earn it first.',
    about:
      'The first session of recovery. It does not ask you to do anything — its whole job is to let you stop.',
    expect: ['Permission to put it down', 'A long, unhurried settle', 'No task at the end'],
    series: 'energy-recovery',
    theme: 'energy',
    protocolCode: 'GL-BURN 3.1',
    durations: DURATIONS,
  },
  {
    slug: 'healthy-boundaries',
    name: 'Healthy Boundaries',
    blurb: 'Protect the time and energy that are yours.',
    about:
      'About the edges of your day. It rehearses the small, ordinary act of keeping something for yourself.',
    expect: ['Finding the edges of your day', 'Rehearsing keeping something back', 'A firmer, kinder close'],
    series: 'energy-recovery',
    theme: 'balance',
    protocolCode: 'GL-BURN 3.2',
    durations: DURATIONS,
  },
  {
    slug: 'energy-renewal',
    name: 'Energy Renewal',
    blurb: 'Rebuild after a long stretch of giving.',
    about:
      'For the part of recovery that comes after stopping. Quiet, restorative, and deliberately slow.',
    expect: ['A deeply slow pace', 'Restoration rather than effort', 'Warmth at the close'],
    series: 'energy-recovery',
    theme: 'energy',
    protocolCode: 'GL-BURN 3.3',
    durations: DURATIONS,
  },
  {
    slug: 'conscious-priorities',
    name: 'Conscious Priorities',
    blurb: 'Decide what deserves you, and what does not.',
    about:
      'A session about choosing. It sorts what actually matters from what is only loud.',
    expect: ['Sorting loud from important', 'Choosing on purpose', 'Leaving lighter'],
    series: 'energy-recovery',
    theme: 'balance',
    protocolCode: 'GL-BURN 3.4',
    durations: DURATIONS,
  },
  {
    slug: 'professional-authenticity',
    name: 'Professional Authenticity',
    blurb: 'Work in a way that still sounds like you.',
    about:
      'For when the role has drifted away from the person. It reconnects what you do with who you are.',
    expect: ['Reconnecting role and person', 'Naming what you want to keep', 'A grounded, honest close'],
    series: 'energy-recovery',
    theme: 'growth',
    protocolCode: 'GL-BURN 3.5',
    durations: DURATIONS,
  },

  /* --- Growth & Resilience (GL-RESIL 5.1–5.5) --- */
  {
    slug: 'flexibility-adaptation',
    name: 'Flexibility & Adaptation',
    blurb: 'Bend with what changes instead of bracing against it.',
    about:
      'For periods where the ground keeps moving. It practises adapting without losing your footing.',
    expect: ['Grounding first', 'Practising give rather than brace', 'A steady, mobile close'],
    series: 'growth-resilience',
    theme: 'growth',
    protocolCode: 'GL-RESIL 5.1',
    durations: DURATIONS,
  },
  {
    slug: 'overcoming-challenges',
    name: 'Overcoming Challenges',
    blurb: 'Meet a hard thing with more than dread.',
    about:
      'It takes something difficult that is coming and rehearses meeting it — not avoiding it, and not pretending it is small.',
    expect: ['Settling before the hard thing', 'Rehearsing meeting it', 'Leaving with your footing'],
    series: 'growth-resilience',
    theme: 'growth',
    protocolCode: 'GL-RESIL 5.2',
    durations: DURATIONS,
  },
  {
    slug: 'self-confidence',
    name: 'Self-Confidence & Efficacy',
    blurb: 'Remember what you are actually able to do.',
    about:
      'A session that works with evidence rather than encouragement — the things you have already handled.',
    expect: ['Recalling what you have handled', 'Letting it register in the body', 'A quietly confident close'],
    series: 'growth-resilience',
    theme: 'growth',
    protocolCode: 'GL-RESIL 5.3',
    durations: DURATIONS,
  },
  {
    slug: 'supportive-connections',
    name: 'Supportive Connections',
    blurb: 'Feel the people who are on your side.',
    about:
      'About not doing it alone. It brings the people who steady you back into the room.',
    expect: ['Bringing support to mind', 'Letting it be felt, not just thought', 'A warmer close'],
    series: 'growth-resilience',
    theme: 'calm',
    protocolCode: 'GL-RESIL 5.4',
    durations: DURATIONS,
  },
  {
    slug: 'vision-growth',
    name: 'Vision & Growth',
    blurb: 'Look further out than this week.',
    about:
      'The longest view in the library. It lifts your attention past the immediate and asks where you are actually going.',
    expect: ['Widening the view', 'Naming a direction', 'A clear, open close'],
    series: 'growth-resilience',
    theme: 'growth',
    protocolCode: 'GL-RESIL 5.5',
    durations: DURATIONS,
  },

  /* --- Standalone (GL-DEP 2.4) --- */
  {
    slug: 'vitality-motivation',
    name: 'Vitality & Motivation',
    blurb: 'A gentle way back into movement.',
    about:
      'For the flat days. It does not push — it makes a small amount of momentum available again.',
    expect: ['A soft, low-demand start', 'A little momentum, gently', 'No pressure at the end'],
    series: 'standalone',
    theme: 'energy',
    protocolCode: 'GL-DEP 2.4',
    durations: DURATIONS,
  },
]

/** The six protocols that may run ONLY in a live therapist-led session. */
export const CLINICAL_ONLY_CODES = [
  'GL-ANX 1.2',
  'GL-ANX 1.5',
  'GL-DEP 2.1',
  'GL-DEP 2.2',
  'GL-DEP 2.3',
  'GL-DEP 2.5',
] as const

export function isClinicalOnly(code: string): boolean {
  return (CLINICAL_ONLY_CODES as readonly string[]).includes(code)
}

/** The Self Use session backed by a protocol code, if the code is prescribable. */
export function sessionForProtocol(code: string): SelfUseSession | undefined {
  return SELF_USE_SESSIONS.find((s) => s.protocolCode === code)
}

export function sessionBySlug(slug: string): SelfUseSession | undefined {
  return SELF_USE_SESSIONS.find((s) => s.slug === slug)
}

/** The name to print for a protocol code on a PATIENT-facing surface. Falls
    back to the code only when nothing maps — which should never happen for
    prescribable material. */
export function selfUseName(code: string): string {
  return sessionForProtocol(code)?.name ?? code
}

/* --------------------------------------------------------------------------
   The five pathways.
   -------------------------------------------------------------------------- */

export type PathwayId =
  | 'focus-performance'
  | 'stress-management'
  | 'energy-recovery'
  | 'balance-boundaries'
  | 'growth-resilience'

export interface PathwayWeek {
  /** 1-based. */
  week: number
  /** The session this week is built around. */
  slug: string
  /** Default length for the week's sessions. */
  duration: Duration
  /** How many sessions the week asks for. */
  count: number
}

export interface Pathway {
  id: PathwayId
  name: string
  blurb: string
  /** e.g. "4 weeks" / "4–6 weeks" — the copy shown on the card. */
  lengthLabel: string
  /** e.g. "4–5" — sessions per week, as copy. */
  perWeekLabel: string
  /** Weeks used for progress arithmetic. */
  weeks: number
  /** Default session length for the pathway. */
  duration: Duration
  /** Longer description used on the pathway detail screen. */
  about: string
  plan: PathwayWeek[]
}

export const PATHWAYS: Pathway[] = [
  {
    id: 'focus-performance',
    name: 'Focus & Performance',
    blurb: 'For when your mind is scattered and you need clarity under pressure.',
    lengthLabel: '4 weeks',
    perWeekLabel: '4–5',
    weeks: 4,
    duration: 12,
    about:
      'Four weeks of attention work. It starts by settling the body, adds a way to order competing demands, and ends with deciding and acting rather than turning things over.',
    plan: [
      { week: 1, slug: 'focus-clarity', duration: 12, count: 5 },
      { week: 2, slug: 'calm-safety', duration: 12, count: 5 },
      { week: 3, slug: 'breathing-presence', duration: 12, count: 4 },
      { week: 4, slug: 'action-decision', duration: 12, count: 4 },
    ],
  },
  {
    id: 'stress-management',
    name: 'Stress Management',
    blurb: 'Regain calm, reorganize demands, and build healthy boundaries.',
    lengthLabel: '4–6 weeks',
    perWeekLabel: '4–5',
    weeks: 5,
    duration: 12,
    about:
      'A progressive journey to regain calm, reorganize demands, set healthy boundaries, and build lasting confidence.',
    plan: [
      { week: 1, slug: 'calm-safety', duration: 12, count: 5 },
      { week: 2, slug: 'demand-management', duration: 12, count: 5 },
      { week: 3, slug: 'healthy-boundaries', duration: 12, count: 4 },
      { week: 4, slug: 'personal-balance', duration: 12, count: 4 },
      { week: 5, slug: 'inner-strength', duration: 24, count: 4 },
    ],
  },
  {
    id: 'energy-recovery',
    name: 'Energy & Recovery',
    blurb: 'From exhaustion to renewed vitality. Permission to pause, then rebuild.',
    lengthLabel: '4–6 weeks',
    perWeekLabel: '3–4',
    weeks: 5,
    duration: 12,
    about:
      'Recovery in the order it actually happens: stopping first, then rebuilding. The early weeks ask very little of you on purpose.',
    plan: [
      { week: 1, slug: 'permission-pause', duration: 12, count: 3 },
      { week: 2, slug: 'energy-renewal', duration: 24, count: 3 },
      { week: 3, slug: 'healthy-boundaries', duration: 12, count: 4 },
      { week: 4, slug: 'conscious-priorities', duration: 12, count: 4 },
      { week: 5, slug: 'vitality-motivation', duration: 12, count: 4 },
    ],
  },
  {
    id: 'balance-boundaries',
    name: 'Balance & Boundaries',
    blurb: 'Protect your time, set limits, reconnect with what matters.',
    lengthLabel: '4 weeks',
    perWeekLabel: '4',
    weeks: 4,
    duration: 12,
    about:
      'Four weeks about edges: where your day ends, what you keep for yourself, and what you want your work to sound like.',
    plan: [
      { week: 1, slug: 'healthy-boundaries', duration: 12, count: 4 },
      { week: 2, slug: 'personal-balance', duration: 12, count: 4 },
      { week: 3, slug: 'conscious-priorities', duration: 12, count: 4 },
      { week: 4, slug: 'professional-authenticity', duration: 24, count: 4 },
    ],
  },
  {
    id: 'growth-resilience',
    name: 'Growth & Resilience',
    blurb: 'Long-term development: flexibility, strength, vision.',
    lengthLabel: '6 weeks',
    perWeekLabel: '3–5',
    weeks: 6,
    duration: 12,
    about:
      'The longest pathway, and the least urgent. It builds flexibility, then confidence, then a view further out than this week.',
    plan: [
      { week: 1, slug: 'flexibility-adaptation', duration: 12, count: 4 },
      { week: 2, slug: 'overcoming-challenges', duration: 12, count: 4 },
      { week: 3, slug: 'self-confidence', duration: 12, count: 4 },
      { week: 4, slug: 'supportive-connections', duration: 12, count: 3 },
      { week: 5, slug: 'inner-strength', duration: 24, count: 3 },
      { week: 6, slug: 'vision-growth', duration: 24, count: 3 },
    ],
  },
]

export function pathwayById(id: PathwayId | string | null | undefined): Pathway | undefined {
  return PATHWAYS.find((p) => p.id === id)
}

/** Total sessions a pathway asks for, across all weeks. */
export function pathwayTotal(p: Pathway): number {
  return p.plan.reduce((n, w) => n + w.count, 0)
}

/* --------------------------------------------------------------------------
   Onboarding Q1 → pathway, and the quick-access mood grid.
   -------------------------------------------------------------------------- */

export interface IntakeOption {
  id: string
  label: string
  icon: string
  pathway: PathwayId
}

/** ON-4 Q1. "I'm not sure yet" routes to Stress Management, the most universal
    starting point, and ON-5 says so. */
export const INTAKE_CHALLENGES: IntakeOption[] = [
  { id: 'concentration', label: 'Difficulty concentrating', icon: '🎯', pathway: 'focus-performance' },
  { id: 'overwhelmed', label: 'Feeling overwhelmed by demands', icon: '🌊', pathway: 'stress-management' },
  { id: 'drained', label: 'Low energy, feeling drained', icon: '🔋', pathway: 'energy-recovery' },
  { id: 'disconnect', label: 'Trouble disconnecting from work', icon: '🔌', pathway: 'balance-boundaries' },
  { id: 'grow', label: 'Want to grow and build resilience', icon: '🌱', pathway: 'growth-resilience' },
  { id: 'unsure', label: "I'm not sure yet", icon: '💭', pathway: 'stress-management' },
]

export const INTAKE_TIMES = [
  { id: 'morning', label: 'Morning' },
  { id: 'lunch', label: 'Lunch break' },
  { id: 'endday', label: 'End of workday' },
  { id: 'evening', label: 'Evening' },
] as const
export type IntakeTime = (typeof INTAKE_TIMES)[number]['id']

export const INTAKE_MATTERS = [
  { id: 'calmer', label: 'Feeling calmer' },
  { id: 'productive', label: 'Being more productive' },
  { id: 'energy', label: 'Recovering my energy' },
  { id: 'balance', label: 'Finding balance' },
] as const
export type IntakeMatter = (typeof INTAKE_MATTERS)[number]['id']

/** Home → Quick session. 8 cards, 2 columns × 4 rows. */
export interface MoodCard {
  id: string
  icon: string
  label: string
  /** The Self Use session this suggests. */
  slug: string
}

export const MOOD_CARDS: MoodCard[] = [
  { id: 'tense', icon: '😣', label: 'Tense, agitated', slug: 'calm-safety' },
  { id: 'racing', icon: '🌀', label: 'Mind racing', slug: 'focus-clarity' },
  { id: 'exhausted', icon: '🪫', label: 'Exhausted', slug: 'permission-pause' },
  { id: 'overwhelmed', icon: '📋', label: 'Overwhelmed by tasks', slug: 'demand-management' },
  { id: 'unmotivated', icon: '⬇️', label: 'Unmotivated', slug: 'vitality-motivation' },
  { id: 'nervous', icon: '⏰', label: 'Nervous before a meeting', slug: 'breathing-presence' },
  { id: 'disconnect', icon: '🔌', label: 'Need to disconnect', slug: 'personal-balance' },
  { id: 'stronger', icon: '💪', label: 'Want to feel stronger', slug: 'self-confidence' },
]
