import { useI18n } from '../i18n'

interface MoodScaleProps {
  /** 0..10, or null when unanswered. */
  value: number | null
  onChange: (v: number) => void
  /** The earlier answer, kept visible so "now" is chosen against "before". */
  reference?: number | null
  referenceLabel?: string
  dark?: boolean
}

const STEPS = Array.from({ length: 11 }, (_, i) => i)

/**
 * The 0–10 check-in. Replaces the emoji faces: the person answers with a
 * number, and after the session the same scale reappears with their previous
 * answer still marked, so "how do you feel now" is answered against "before"
 * rather than from memory.
 */
export function MoodScale({ value, onChange, reference = null, referenceLabel = 'before', dark = false }: MoodScaleProps) {
  const { t } = useI18n()
  return (
    <div className={`mood-scale${dark ? ' mood-scale--dark' : ''}`}>
      <div className="mood-scale__row" role="radiogroup" aria-label={t('How are you feeling, from 0 to 10?')}>
        {STEPS.map((v) => {
          const selected = value === v
          const isRef = reference === v
          return (
            <button
              key={v}
              className={`mood-step${selected ? ' is-on' : ''}${isRef ? ' is-ref' : ''}`}
              role="radio"
              aria-checked={selected}
              aria-label={t('{v} of 10', { v })}
              onClick={() => onChange(v)}
            >
              <span className="mood-step__num">{v}</span>
              {isRef && <span className="mood-step__ref">{t(referenceLabel)}</span>}
            </button>
          )
        })}
      </div>
      <div className="mood-scale__anchors">
        <span>{t('Not well at all')}</span>
        <span>{t('Very well')}</span>
      </div>
    </div>
  )
}
