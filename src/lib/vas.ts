import type { MoodCheck } from '../types/domain'

/**
 * Five emoji faces. The user picks one; we never show the underlying number.
 * Order is low → high wellbeing (RN-UX-04: clinical data disguised as a
 * Daylio-style emotional check-in).
 */
export const MOOD_EMOJI = ['😣', '😕', '😐', '🙂', '😄'] as const

export const MOOD_LABELS_PT = ['Difícil', 'Baixo', 'Neutro', 'Bem', 'Ótimo'] as const

/** Map emoji index (1..5) → VAS 0..10. */
export function emojiToVas(emoji: number): number {
  const clamped = Math.min(5, Math.max(1, emoji))
  return Number((((clamped - 1) / 4) * 10).toFixed(1))
}

export function makeMoodCheck(emoji: number): MoodCheck {
  return { emoji, vas: emojiToVas(emoji), at: Date.now() }
}
