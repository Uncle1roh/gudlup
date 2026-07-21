/* ============================================================================
   Good Loop — Session Composer model
   The "easy mode" that sits in front of the Sound Studio: pick a few presets
   (family, length, soundscape, brainwave, voice) and the engine builds the same
   layered bed the Studio uses — preview it, export it, or open it in the Studio
   to fine-tune. The SeedTrack shape is shared so the Studio can adopt it 1:1.
   ============================================================================ */

import type { Duration, ProtocolFamily } from '../types/domain'
import type { TrackType, ClipParams } from '../studio/multitrack'

export type Length = 'quick' | 'standard' | 'deep'
export const LENGTH_MIN: Record<Length, Duration> = { quick: 6, standard: 12, deep: 24 }

export type Soundscape = 'lake' | 'air' | 'deep'
export type Brainwave = 'delta' | 'theta' | 'alpha' | 'smr'

export interface ComposeSettings {
  family: ProtocolFamily
  length: Length
  soundscape: Soundscape
  brainwave: Brainwave
  voiceOn: boolean
  affirmation: string
  intensity: number // 0..1 — overall presence of the active layers
}

export interface SeedClip { startSec: number; durationSec: number; params: ClipParams; text?: string }
export interface SeedTrack {
  type: TrackType
  name: string
  volume: number
  /** Whole-track stereo position (L/C/R) — used by the dichotic voice tracks. */
  channel?: 'L' | 'C' | 'R'
  /** Pre-enabled effect chain (e.g. harmonizer on a CORO track). */
  effects?: import('../studio/effects').TrackEffect[]
  clips: SeedClip[]
}

/** Patient-facing labels for the five families. */
export const FAMILY_LABEL: Record<ProtocolFamily, string> = {
  'GL-ANX': 'Anxiety',
  'GL-DEP': 'Depression',
  'GL-BURN': 'Burnout',
  'GL-STRESS': 'Stress',
  'GL-RESIL': 'Resilience',
}

/** Brainwave target → (carrier, beat) in Hz, with a short rationale label. */
export const BRAINWAVE: Record<Brainwave, { label: string; note: string; carrierHz: number; beatHz: number }> = {
  delta: { label: 'Delta', note: 'deep rest / sleep', carrierHz: 150, beatHz: 2.5 },
  theta: { label: 'Theta', note: 'calm / letting go', carrierHz: 180, beatHz: 6 },
  alpha: { label: 'Alpha', note: 'relaxed focus', carrierHz: 200, beatHz: 10 },
  smr: { label: 'SMR', note: 'steady & resilient', carrierHz: 210, beatHz: 12 },
}

/** A sensible default brainwave per family (the user can override). */
export const FAMILY_DEFAULT_WAVE: Record<ProtocolFamily, Brainwave> = {
  'GL-ANX': 'theta',
  'GL-DEP': 'alpha',
  'GL-BURN': 'alpha',
  'GL-STRESS': 'theta',
  'GL-RESIL': 'smr',
}

export const SOUNDSCAPE_LABEL: Record<Soundscape, string> = {
  lake: 'Lake', air: 'Air', deep: 'Deep',
}

/** A short, on-brand default affirmation per family (pt-BR). */
export const FAMILY_AFFIRMATION: Record<ProtocolFamily, string> = {
  'GL-ANX': 'Você está em segurança. Respire fundo e solte.',
  'GL-DEP': 'Cada pequeno passo conta. Você merece cuidado.',
  'GL-BURN': 'Você pode descansar. O mundo espera por você.',
  'GL-STRESS': 'Este momento é seu. Solte o que pesa.',
  'GL-RESIL': 'Você é mais forte do que imagina.',
}
