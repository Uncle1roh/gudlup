import { useMemo, useState } from 'react'
import { useDataProvider } from '../data/provider'
import { ASSESSMENT_QUESTIONS, LIKERT, buildResponse } from '../employer/assessment'
import { useI18n } from '../i18n'

/** The demo employee's team (in production this comes from HR provisioning). */
const DEMO_TEAM = 'Engineering'

export function Assessment({ onDone }: { onDone: (submitted: boolean) => void }) {
  const { t } = useI18n()
  const dp = useDataProvider()
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const answered = Object.keys(answers).length
  const total = ASSESSMENT_QUESTIONS.length
  const complete = answered === total
  const progress = useMemo(() => Math.round((answered / total) * 100), [answered, total])

  async function submit() {
    setBusy(true)
    // period left empty → stamped to the current cycle by the data layer
    await dp.submitPsychosocialAssessment(buildResponse(answers, DEMO_TEAM, ''))
    setBusy(false)
    setDone(true)
  }

  if (done) {
    return (
      <div className="screen assess">
        <div className="assess__done">
          <div className="assess__donemark">✓</div>
          <h1 className="display">{t('Thank you')}</h1>
          <p className="muted">{t("Your responses were added to your team's anonymous aggregate. Individual answers are never shown to your employer.")}</p>
          <button className="assess__cta" onClick={() => onDone(true)}>{t('Back to home')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="screen assess">
      <header className="assess__head">
        <button className="assess__close" onClick={() => onDone(false)}>✕</button>
        <div>
          <p className="muted small">{t('Quarterly check-in')}</p>
          <h1 className="display">{t("How's work been?")}</h1>
        </div>
      </header>

      <div className="assess__privacy">
        🔒 {t('Anonymous. Your employer only ever sees aggregated results — never your individual answers.')}
      </div>

      <div className="assess__prog"><div className="assess__prog__fill" style={{ width: `${progress}%` }} /></div>

      <div className="assess__list">
        {ASSESSMENT_QUESTIONS.map((q, i) => (
          <div className="assess__q" key={q.id}>
            <div className="assess__qtext"><span className="assess__qnum">{i + 1}</span>{t(q.text)}</div>
            <div className="assess__scale">
              {LIKERT.map((opt) => (
                <button
                  key={opt.value}
                  className={`assess__opt${answers[q.id] === opt.value ? ' is-on' : ''}`}
                  onClick={() => setAnswers((a) => ({ ...a, [q.id]: opt.value }))}
                  title={t(opt.label)}
                >
                  {opt.value}
                </button>
              ))}
            </div>
            <div className="assess__scalelabels"><span>{t('Strongly disagree')}</span><span>{t('Strongly agree')}</span></div>
          </div>
        ))}
      </div>

      <div className="assess__foot">
        <button className="assess__cta" disabled={!complete || busy} onClick={submit}>
          {busy ? t('Submitting…') : complete ? t('Submit check-in') : t('Answer all {total} · {answered}/{total} done', { total, answered })}
        </button>
      </div>
    </div>
  )
}
