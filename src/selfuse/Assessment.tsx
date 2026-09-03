/* ============================================================================
   Self Use — completing an assessment

   The one place a patient answers a clinical instrument. Everything here
   follows from a single rule in the developer reference: the system
   ADMINISTERS, SCORES and STORES; it never interprets, and the person filling
   it in is never shown a result.

   So this screen has no score, no band, no colour, no "you are doing better
   than last month". It ends on an acknowledgement and a statement of who reads
   the answers. That is not caution for its own sake — an unaccompanied number
   from a depression scale is the difference between a wellbeing product and a
   diagnostic one, and only the therapist has the history to read it.

   Two smaller rules, both visible in the markup:
   · The item text stays in English (`lang="en"`) while the chrome around it is
     localized — per CLAUDE.md, until validated clinical translations exist. A
     translated DASS-21 is a different instrument.
   · Progress is saved after every answer. Twenty-one items is long enough that
     losing them would push people to rush a second attempt, and a rushed
     retake is worse data than a resumed one.
   ============================================================================ */

import { useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import {
  INSTRUMENTS,
  isComplete,
  optionsForItem,
  type AssessmentRecord,
  type Responses,
} from '../data/assessments'
import { responsesOf } from '../data/assessmentStore'

interface AssessmentProps {
  record: AssessmentRecord
  /** Who reads the answers, for the closing screen. */
  therapistName?: string
  onSaveProgress: (responses: Responses) => void
  onSubmit: (responses: Responses) => void
  onClose: () => void
}

export function Assessment({ record, therapistName, onSaveProgress, onSubmit, onClose }: AssessmentProps) {
  const { t } = useI18n()
  const instrument = record.instrumentId === 'VAS' ? null : INSTRUMENTS[record.instrumentId]
  const [responses, setResponses] = useState<Responses>(() => responsesOf(record))
  const [done, setDone] = useState(false)

  /* Resume where they stopped: the first unanswered item, not item one. */
  const [step, setStep] = useState(() => {
    if (!instrument) return 0
    const first = instrument.items.findIndex((i) => typeof responsesOf(record)[i.index] !== 'number')
    return first < 0 ? instrument.items.length - 1 : first
  })

  const answered = useMemo(
    () => (instrument ? instrument.items.filter((i) => typeof responses[i.index] === 'number').length : 0),
    [instrument, responses],
  )

  /* VAS never reaches this screen — it is recorded by the therapist from the
     patient's verbal answer, and there is no patient-facing VAS widget. */
  if (!instrument) {
    return (
      <div className="app-frame su-studio">
        <div className="screen msr">
          <div className="msr__top">
            <button className="msr__x" onClick={onClose} aria-label={t('Close')}>✕</button>
          </div>
          <div className="screen__body msr__body">
            <p className="lead">{t('This measure is recorded by your therapist during your session.')}</p>
          </div>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="app-frame su-studio">
        <div className="screen msr">
          <div className="screen__body msr__body msr__body--center">
            <div className="asmt-done" aria-hidden="true">✓</div>
            <h2 className="display">{t('Thank you')}</h2>
            <p className="lead">
              {therapistName
                ? t('Your answers have been sent to {name}.', { name: therapistName })
                : t('Your answers have been sent to your therapist.')}
            </p>
            <p className="small muted">
              {t('Questionnaires like this one are read alongside everything else your therapist knows about you. You will go through the results together.')}
            </p>
          </div>
          <div className="screen__footer">
            <button className="btn btn--primary" onClick={onClose}>{t('Done')}</button>
          </div>
        </div>
      </div>
    )
  }

  const item = instrument.items[step]
  const options = optionsForItem(instrument, item)
  const value = responses[item.index]
  const last = step === instrument.items.length - 1
  const complete = isComplete(instrument, responses)

  function choose(v: number) {
    const next = { ...responses, [item.index]: v }
    setResponses(next)
    onSaveProgress(next)
    if (!last) setStep(step + 1)
  }

  return (
    <div className="app-frame su-studio">
      <div className="screen msr">
        <div className="msr__top">
          <button className="msr__x" onClick={onClose} aria-label={t('Close')}>✕</button>
          <span className="msr__count">{t('{n} of {total}', { n: step + 1, total: instrument.items.length })}</span>
        </div>

        <div className="asmt-bar" aria-hidden="true">
          <span style={{ width: `${Math.round((answered / instrument.items.length) * 100)}%` }} />
        </div>

        <div className="screen__body msr__body">
          <span className="eyebrow">{instrument.name} · {t('{n} min', { n: instrument.minutes })}</span>
          <p className="small muted" lang="en">{instrument.stem}</p>

          <h2 className="display msr__q" lang="en">{item.text}</h2>

          <div className="who5-opts">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                className="who5-opt"
                aria-pressed={value === o.value}
                onClick={() => choose(o.value)}
              >
                <span className="who5-opt__n">{o.value}</span>
                <span lang="en">{o.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="screen__footer asmt-foot">
          <button className="btn btn--ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>
            {t('Back')}
          </button>
          {last ? (
            <button className="btn btn--primary" disabled={!complete} onClick={() => { onSubmit(responses); setDone(true) }}>
              {t('Send')}
            </button>
          ) : (
            <button className="btn btn--primary" disabled={typeof value !== 'number'} onClick={() => setStep(step + 1)}>
              {t('Next')}
            </button>
          )}
        </div>

        {last && !complete && (
          <p className="small muted asmt-missing">
            {t('{n} questions still to answer.', { n: instrument.items.length - answered })}
          </p>
        )}
      </div>
    </div>
  )
}
