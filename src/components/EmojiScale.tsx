import { MOOD_EMOJI } from '../lib/vas'
import { useI18n } from '../i18n'

interface EmojiScaleProps {
  value: number | null // 1..5
  onChange: (v: number) => void
  dark?: boolean
}

/** Five emoji faces. The user never sees the underlying 0..10 VAS. */
export function EmojiScale({ value, onChange, dark = false }: EmojiScaleProps) {
  const { t } = useI18n()
  return (
    <div className={`emoji-scale${dark ? ' emoji-scale--dark' : ''}`} role="radiogroup" aria-label={t('How are you feeling?')}>
      {MOOD_EMOJI.map((emoji, i) => {
        const v = i + 1
        const selected = value === v
        return (
          <button
            key={v}
            className="emoji-btn"
            role="radio"
            aria-checked={selected}
            aria-pressed={selected}
            aria-label={t('Mood {v} of 5', { v })}
            onClick={() => onChange(v)}
          >
            {emoji}
          </button>
        )
      })}
    </div>
  )
}
