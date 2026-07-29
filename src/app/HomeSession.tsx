import { useState } from 'react'
import { BreathingOrb } from '../components/BreathingOrb'
import { useDataProvider } from '../data/provider'
import { useMySessionRequest } from '../data/hooks'
import { greeting, lastSession } from '../data/seed'
import { getProtocol } from '../data/protocols'
import { currentProgramStep, programComplete, switchProgramTo } from '../data/program'
import { useI18n } from '../i18n'
import type { SessionRecord, Duration } from '../types/domain'

interface HomeSessionProps {
  history: SessionRecord[]
  onStart: (launch: { protocolCode: string; duration: Duration }) => void
  onWizard: () => void
  onExplore: () => void
  onAssess: () => void
}

/** The wizard's remembered ALTERNATIVE — the spec's fallback "if the primary
    does not resonate after listening", surfaced as the recommendation card. */
function lastWizardAlternative(): { code: string; title: string; primaryCode: string } | null {
  try {
    const raw = localStorage.getItem('gl.wizard.last')
    if (!raw) return null
    const v = JSON.parse(raw) as { primaryCode?: string; alternativeCode?: string; alternativeTitle?: string }
    if (!v.alternativeCode) return null
    return { code: v.alternativeCode, title: v.alternativeTitle ?? v.alternativeCode, primaryCode: v.primaryCode ?? '' }
  } catch {
    return null
  }
}

/** B9: one large CTA — the protocol project when one is running (next
    sub-protocol of the family pathway), the 3–4 question wizard otherwise. */
export function HomeSession({ history, onStart, onWizard, onExplore, onAssess }: HomeSessionProps) {
  const { t } = useI18n()
  const dp = useDataProvider()
  const { data: myRequest, refetch: refetchRequest } = useMySessionRequest()
  const [requesting, setRequesting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  async function requestTherapist() {
    if (myRequest || requesting) return
    setRequesting(true)
    try {
      await dp.requestSession()
      refetchRequest()
      setToast(t('Request sent'))
      setTimeout(() => setToast(null), 2200)
    } catch (e) {
      setToast((e as Error).message)
      setTimeout(() => setToast(null), 6000)
    } finally {
      setRequesting(false)
    }
  }
  const last = lastSession(history)
  const lastProtocol = getProtocol(last.protocolCode)
  const step = currentProgramStep()
  const complete = programComplete()
  const wizardAlt = lastWizardAlternative()
  const altProtocol = wizardAlt && step && step.step === 1 ? getProtocol(wizardAlt.code) : null

  return (
    <div className="screen home">
      <header className="home__greet">
        <div>
          <p className="muted small">{t(greeting())}</p>
          <h1 className="display">{t('Ready when you are.')}</h1>
        </div>
        <BreathingOrb size={64} rings={false} />
      </header>

      {step ? (
        <button className="start-cta" onClick={() => onStart({ protocolCode: step.code, duration: step.duration })}>
          <span className="start-cta__label">{t('Continue your path')}</span>
          <span className="start-cta__sub">
            {step.protocol?.title ?? step.code} · {t('session {n} of {total}', { n: step.step, total: step.total })} · {step.duration} {t('min')}
          </span>
        </button>
      ) : (
        <button className="start-cta" onClick={onWizard}>
          <span className="start-cta__label">{t('Start session')}</span>
          <span className="start-cta__sub">{complete ? t('Path complete — check in to begin the next one') : t('A few quick questions find the right session for now')}</span>
        </button>
      )}

      {step && (
        <button className="rec-card" onClick={onWizard}>
          <span className="rec-card__eyebrow">{t('Feeling different?')}</span>
          <span className="rec-card__title">{t('Check in again')}</span>
          <span className="rec-card__reason">{t('A new check-in restarts your path from today’s answers')}</span>
        </button>
      )}

      {altProtocol && wizardAlt && (
        <button
          className="rec-card"
          onClick={() => {
            // the spec's fallback: the primary didn't resonate — the path
            // restarts from the ALTERNATIVE protocol
            switchProgramTo(altProtocol.code)
            onStart({ protocolCode: altProtocol.code, duration: step?.duration ?? 12 })
          }}
        >
          <span className="rec-card__eyebrow">{t('Didn’t resonate?')}</span>
          <span className="rec-card__title">{altProtocol.title}</span>
          <span className="rec-card__reason">{t('The alternative to your last choice')}</span>
        </button>
      )}

      {!step && lastProtocol && (
        <button className="rec-card" onClick={() => onStart(last)}>
          <span className="rec-card__eyebrow">{t('Repeat')}</span>
          <span className="rec-card__title">{lastProtocol.title}</span>
          <span className="rec-card__reason">{t('Same as last time')} · {last.duration} {t('min')}</span>
        </button>
      )}

      <button className="assess-card" onClick={requestTherapist} disabled={!!myRequest || requesting} style={myRequest ? { opacity: 0.75 } : undefined}>
        <span className="assess-card__icon">🩺</span>
        <span className="assess-card__text">
          <strong>{myRequest
            ? (myRequest.status === 'claimed'
              ? t('A therapist accepted your request')
              : t('Request sent — waiting for a therapist'))
            : t('Talk to a therapist')}</strong>
          <span>{myRequest
            ? (myRequest.status === 'claimed'
              ? t('They will schedule the session with you.')
              : t("You'll be contacted to schedule."))
            : t('Request a session — a clinician will pick it up.')}</span>
        </span>
        {!myRequest && <span className="assess-card__arrow">→</span>}
      </button>

      <button className="assess-card" onClick={onAssess}>
        <span className="assess-card__icon">🗒️</span>
        <span className="assess-card__text">
          <strong>{t('Your quarterly check-in is ready')}</strong>
          <span>{t('2 min · anonymous · helps your workplace improve')}</span>
        </span>
        <span className="assess-card__arrow">→</span>
      </button>

      <button className="btn btn--quiet" style={{ alignSelf: 'center', marginTop: 'auto' }} onClick={onExplore}>
        {t('Explore other sessions')}
      </button>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
