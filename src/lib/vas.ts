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

/** Map a 0..10 VAS back onto the 1..5 emoji bucket (history/trends keep using it). */
export function vasToEmoji(vas: number): number {
  const clamped = Math.min(10, Math.max(0, vas))
  return Math.min(5, Math.max(1, Math.round(clamped / 2.5) + 1))
}

/** The numeric scale is the source of truth now: the person answers 0..10 and
    the emoji bucket is derived, so older screens and trends keep working. */
export function makeMoodFromVas(vas: number): MoodCheck {
  const clamped = Math.min(10, Math.max(0, Math.round(vas)))
  return { emoji: vasToEmoji(clamped), vas: clamped, at: Date.now() }
}
