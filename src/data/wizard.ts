/* ============================================================================
   Good Loop — B2C session wizard (3–4 questions), routing data
   Verbatim from the PO spec:
     Q1 PINPOINT  — how do you feel (7 options → cluster; "tired" clarifies)
     Q2 SCALE     — 1–10 intensity (skipped for MAINTENANCE)
     Q3 CLARIFY   — per-cluster options, each routing to a PRIMARY protocol
                    with an ALTERNATIVE fallback "if the primary does not
                    resonate after listening"
     Q4 DURATION  — 6 / 12 (standard) / 24 minutes
   Pure data + resolvers, node-testable; the screen renders from this.
   ============================================================================ */

import type { Duration, ProtocolFamily } from '../types/domain'

export type WizardCluster = 'anxiety' | 'stress' | 'depression' | 'burnout' | 'resilience' | 'maintenance'

export interface PinpointOption {
  id: WizardCluster | 'tired'
  /** The feeling words, verbatim from the spec. */
  label: string
}

export const PINPOINT_OPTIONS: PinpointOption[] = [
  { id: 'anxiety', label: 'Anxious, worried, agitated, nervous, in panic, shortness of breath, heart racing' },
  { id: 'stress', label: 'Tense, under pressure, overloaded, overwhelmed, stuck, too many things' },
  { id: 'depression', label: 'Sad, down, empty, hopeless, lonely, unmotivated, worthless' },
  { id: 'burnout', label: 'Exhausted, burned out, drained, batteries empty, can\u2019t cope with work or caregiving' },
  { id: 'resilience', label: 'Resistant to change, going through a hard time, unsure of my abilities, want to grow' },
  { id: 'tired', label: 'I\u2019m tired' },
  { id: 'maintenance', label: 'Calm, at peace, doing well, want to maintain my wellbeing' },
]

/** The dedicated clarification when the person chooses "I'm tired". */
export const TIRED_QUESTION = 'Is your tiredness from too much work or caregiving, a general drop in vitality, or pressure you keep pushing through?'
export const TIRED_OPTIONS: { id: WizardCluster; label: string }[] = [
  { id: 'burnout', label: 'From too much work or caregiving for others' },
  { id: 'depression', label: 'A general drop in vitality and motivation' },
  { id: 'stress', label: 'I feel under pressure and drained but still pushing through' },
]

export interface ClarifyOption {
  label: string
  primary: { code: string; title: string }
  alternative: { code: string; title: string }
}

export interface ClusterSpec {
  cluster: WizardCluster
  question: string
  options: ClarifyOption[]
}

const P = (code: string, title: string) => ({ code, title })

export const CLUSTER_SPECS: ClusterSpec[] = [
  {
    cluster: 'anxiety',
    question: 'What best describes how you feel right now?',
    options: [
      { label: 'I feel my body activated: short breath, racing heart, physical tension', primary: P('GL-ANX 1.3', 'Breathing and Grounding'), alternative: P('GL-ANX 1.1', 'Calm and Inner Security') },
      { label: 'A diffuse agitation, constant alarm, I cannot calm down', primary: P('GL-ANX 1.1', 'Calm and Inner Security'), alternative: P('GL-ANX 1.3', 'Breathing and Grounding') },
      { label: 'I am overwhelmed by emotions, I cannot manage the emotional wave', primary: P('GL-ANX 1.2', 'Managing Anxious Emotions'), alternative: P('GL-ANX 1.5', 'Release and Transformation') },
      { label: 'I am worried about the future, unsure about what will happen', primary: P('GL-ANX 1.4', 'Trust in the Present'), alternative: P('GL-ANX 1.1', 'Calm and Inner Security') },
      { label: 'I carry a burden, I want to let something go', primary: P('GL-ANX 1.5', 'Release and Transformation'), alternative: P('GL-ANX 1.2', 'Managing Anxious Emotions') },
    ],
  },
  {
    cluster: 'stress',
    question: 'What is the main source of your stress right now?',
    options: [
      { label: 'Mental tension, I cannot focus, my mind is crowded', primary: P('GL-STRESS 4.1', 'Calm and Focus'), alternative: P('GL-STRESS 4.2', 'Managing Workload') },
      { label: 'Too many things to do, I feel overloaded and overwhelmed', primary: P('GL-STRESS 4.2', 'Managing Workload'), alternative: P('GL-STRESS 4.5', 'Mindful and Pragmatic Action') },
      { label: 'Work invades everything, I cannot switch off', primary: P('GL-STRESS 4.3', 'Work-Life Balance'), alternative: P('GL-STRESS 4.2', 'Managing Workload') },
      { label: 'I am drained by stress but I must keep going', primary: P('GL-STRESS 4.4', 'Inner Resources and Resilience'), alternative: P('GL-STRESS 4.3', 'Work-Life Balance') },
      { label: 'I know what I need to do but I am stuck, I procrastinate', primary: P('GL-STRESS 4.5', 'Mindful and Pragmatic Action'), alternative: P('GL-STRESS 4.2', 'Managing Workload') },
    ],
  },
  {
    cluster: 'depression',
    question: 'What do you feel most strongly during this period?',
    options: [
      { label: 'Sadness, low mood, everything grey, little hope', primary: P('GL-DEP 2.1', 'Inner Light and Hope'), alternative: P('GL-DEP 2.4', 'Vital Energy and Motivation') },
      { label: 'I feel inadequate, worthless, I criticize myself constantly', primary: P('GL-DEP 2.2', 'Personal Worth and Self-Esteem'), alternative: P('GL-DEP 2.1', 'Inner Light and Hope') },
      { label: 'I feel alone, isolated, disconnected from others', primary: P('GL-DEP 2.3', 'Connection and Belonging'), alternative: P('GL-DEP 2.2', 'Personal Worth and Self-Esteem') },
      { label: 'Nothing interests me, I lack energy and motivation to do anything', primary: P('GL-DEP 2.4', 'Vital Energy and Motivation'), alternative: P('GL-DEP 2.1', 'Inner Light and Hope') },
      { label: 'I am wounded, I want to close a chapter and start again', primary: P('GL-DEP 2.5', 'Healing and Rebirth'), alternative: P('GL-DEP 2.1', 'Inner Light and Hope') },
    ],
  },
  {
    cluster: 'burnout',
    question: 'Which of the following best reflects your situation?',
    options: [
      { label: 'I am exhausted, I have nothing left to give, I need to stop', primary: P('GL-BURN 3.1', 'Permission to Stop'), alternative: P('GL-BURN 3.3', 'Regeneration and Energy Recovery') },
      { label: 'I cannot say no, I take everything on myself, I am invaded by others', primary: P('GL-BURN 3.2', 'Boundaries and Personal Protection'), alternative: P('GL-BURN 3.1', 'Permission to Stop') },
      { label: 'Batteries empty, I need to recharge and recover energy', primary: P('GL-BURN 3.3', 'Regeneration and Energy Recovery'), alternative: P('GL-BURN 3.1', 'Permission to Stop') },
      { label: 'I am running senselessly, I have lost sight of what really matters', primary: P('GL-BURN 3.4', 'Redefining Priorities'), alternative: P('GL-BURN 3.5', 'Return to the Authentic Self') },
      { label: 'I no longer recognize myself, I live on autopilot, I have lost myself', primary: P('GL-BURN 3.5', 'Return to the Authentic Self'), alternative: P('GL-BURN 3.4', 'Redefining Priorities') },
    ],
  },
  {
    cluster: 'resilience',
    question: 'What are you trying to develop?',
    options: [
      { label: 'I struggle with changes, I get destabilized easily', primary: P('GL-RESIL 5.1', 'Flexibility and Adaptation'), alternative: P('GL-RESIL 5.2', 'Transforming Difficulties') },
      { label: 'I am going through a hard blow, a very difficult period', primary: P('GL-RESIL 5.2', 'Transforming Difficulties'), alternative: P('GL-RESIL 5.3', 'Inner Strength and Self-Efficacy') },
      { label: 'I doubt my abilities, I do not feel up to it', primary: P('GL-RESIL 5.3', 'Inner Strength and Self-Efficacy'), alternative: P('GL-DEP 2.2', 'Personal Worth and Self-Esteem') },
      { label: 'I feel without a safety net, I need support and connections', primary: P('GL-RESIL 5.4', 'Supportive Relationships'), alternative: P('GL-DEP 2.3', 'Connection and Belonging') },
      { label: 'I want to grow, give a direction and a purpose to my life', primary: P('GL-RESIL 5.5', 'Vision and Continuous Growth'), alternative: P('GL-RESIL 5.3', 'Inner Strength and Self-Efficacy') },
    ],
  },
]

/** MAINTENANCE has no clarify table in the spec: the person is well and wants
    to keep it that way — skip the scale, skip the clarify, recommend the
    growth/wellbeing protocol. (Assumption flagged to the POs: the spec
    defines no maintenance protocol; GL-RESIL 5.5 is the closest fit.) */
export const MAINTENANCE_ROUTE: ClarifyOption = {
  label: 'Maintain my wellbeing',
  primary: P('GL-RESIL 5.5', 'Vision and Continuous Growth'),
  alternative: P('GL-RESIL 5.3', 'Inner Strength and Self-Efficacy'),
}

export const DURATIONS: { duration: Duration; label: string; standard?: boolean }[] = [
  { duration: 6, label: 'Quick session' },
  { duration: 12, label: 'Standard session', standard: true },
  { duration: 24, label: 'Deep session' },
]

export function clusterSpec(cluster: WizardCluster): ClusterSpec | null {
  return CLUSTER_SPECS.find((c) => c.cluster === cluster) ?? null
}

export function familyOfCode(code: string): ProtocolFamily {
  return code.split(/\s+/)[0] as ProtocolFamily
}

export interface WizardResult {
  cluster: WizardCluster
  /** 1–10; null for MAINTENANCE (the scale question is skipped). */
  intensity: number | null
  protocolCode: string
  protocolTitle: string
  alternativeCode: string
  alternativeTitle: string
  duration: Duration
}
