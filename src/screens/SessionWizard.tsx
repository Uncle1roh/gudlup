/* The B2C session wizard — 3–4 questions, per the PO spec:
   1 PINPOINT   how do you feel (7 options; "I'm tired" opens a dedicated
                clarification routing to Burnout / Depression / Stress)
   2 SCALE      1–10 intensity (skipped entirely for MAINTENANCE)
   3 CLARIFY    per-cluster options → PRIMARY protocol + ALTERNATIVE fallback
   4 DURATION   6 / 12 (standard) / 24 minutes
   MAINTENANCE skips 2 and 3 and goes straight to the duration. */

import { useState } from 'react'
import { useI18n } from '../i18n'
import {
  DURATIONS,
  MAINTENANCE_ROUTE,
  PINPOINT_OPTIONS,
  TIRED_OPTIONS,
  TIRED_QUESTION,
  clusterSpec,
  type ClarifyOption,
  type WizardCluster,
  type WizardResult,
} from '../data/wizard'
import type { Duration } from '../types/domain'

type Step = 'pinpoint' | 'tired' | 'scale' | 'clarify' | 'duration'

interface SessionWizardProps {
  onDone: (result: WizardResult) => void
  onCancel: () => void
}

export function SessionWizard({ onDone, onCancel }: SessionWizardProps) {
  const { t } = useI18n()
  const [step, setStep] = useState<Step>('pinpoint')
  const [cluster, setCluster] = useState<WizardCluster | null>(null)
  const [intensity, setIntensity] = useState<number | null>(null)
  const [choice, setChoice] = useState<ClarifyOption | null>(null)

  const totalSteps = cluster === 'maintenance' ? 2 : 4
  const stepIndex = step === 'pinpoint' || step === 'tired' ? 1 : step === 'scale' ? 2 : step === 'clarify' ? 3 : totalSteps

  function pickPinpoint(id: WizardCluster | 'tired') {
    if (id === 'tired') { setStep('tired'); return }
    setCluster(id)
    if (id === 'maintenance') {
      // no scale, no clarify — the spec defines the maintenance route directly
      setChoice(MAINTENANCE_ROUTE)
      setStep('duration')
    } else {
      setStep('scale')
    }
  }

  function pickTired(id: WizardCluster) {
    setCluster(id)
    setStep('scale')
  }

  function pickScale(n: number) {
    setIntensity(n)
    setStep('clarify')
  }

  function pickClarify(opt: ClarifyOption) {
    setChoice(opt)
    setStep('duration')
  }

  function pickDuration(duration: Duration) {
    if (!cluster || !choice) return
    onDone({
      cluster,
      intensity: cluster === 'maintenance' ? null : intensity,
      protocolCode: choice.primary.code,
      protocolTitle: choice.primary.title,
      alternativeCode: choice.alternative.code,
      alternativeTitle: choice.alternative.title,
      duration,
    })
  }

  function goBack() {
    switch (step) {
      case 'pinpoint': onCancel(); return
      case 'tired': setStep('pinpoint'); return
      case 'scale': setStep('pinpoint'); setCluster(null); return
      case 'clarify': setStep(cluster === 'maintenance' ? 'pinpoint' : 'scale'); return
      case 'duration':
        if (cluster === 'maintenance') { setStep('pinpoint'); setCluster(null); setChoice(null) }
        else { setStep('clarify'); setChoice(null) }
        return
    }
  }

  const spec = cluster ? clusterSpec(cluster) : null

  return (
    <div className="screen wizard">
      <header className="wizard__head">
        <button className="wizard__back" onClick={goBack} aria-label={t('Back')}>←</button>
        <div className="wizard__dots" aria-hidden="true">
          {Array.from({ length: totalSteps }, (_, i) => (
            <span key={i} className={`wizard__dot${i < stepIndex ? ' is-on' : ''}`} />
          ))}
        </div>
        <button className="wizard__skip" onClick={onCancel}>{t('Cancel')}</button>
      </header>

      {step === 'pinpoint' && (
        <div className="wizard__body">
          <h1 className="wizard__q">{t('How do you feel right now?')}</h1>
          <p className="wizard__sub">{t('Choose the item that best describes your situation.')}</p>
          <div className="wizard__opts">
            {PINPOINT_OPTIONS.map((o) => (
              <button key={o.id} className="wizard__opt" onClick={() => pickPinpoint(o.id)}>
                {t(o.label)}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'tired' && (
        <div className="wizard__body">
          <h1 className="wizard__q">{t(TIRED_QUESTION)}</h1>
          <div className="wizard__opts">
            {TIRED_OPTIONS.map((o) => (
              <button key={o.id} className="wizard__opt" onClick={() => pickTired(o.id)}>
                {t(o.label)}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'scale' && (
        <div className="wizard__body">
          <h1 className="wizard__q">{t('On a scale from 1 to 10, how strong is the feeling right now?')}</h1>
          <div className="wizard__scale">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                className={`wizard__num${intensity === n ? ' is-on' : ''}`}
                onClick={() => pickScale(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="wizard__sub wizard__scale-legend">
            <span>{t('mild')}</span>
            <span>{t('very strong')}</span>
          </p>
        </div>
      )}

      {step === 'clarify' && spec && (
        <div className="wizard__body">
          <h1 className="wizard__q">{t(spec.question)}</h1>
          <div className="wizard__opts">
            {spec.options.map((o) => (
              <button key={o.primary.code} className="wizard__opt" onClick={() => pickClarify(o)}>
                {t(o.label)}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'duration' && choice && (
        <div className="wizard__body">
          <h1 className="wizard__q">{t('How much time do you have right now?')}</h1>
          <p className="wizard__sub">{t(choice.primary.title)}</p>
          <div className="wizard__opts">
            {DURATIONS.map((d) => (
              <button key={d.duration} className={`wizard__opt wizard__opt--dur${d.standard ? ' is-std' : ''}`} onClick={() => pickDuration(d.duration)}>
                <span>{t(d.label)}</span>
                <span className="wizard__dur">{d.duration} {t('min')}{d.standard ? ` · ${t('recommended')}` : ''}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
