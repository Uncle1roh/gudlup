import { useEffect, useState } from 'react'
import { BreathingOrb } from '../components/BreathingOrb'
import { useDataProvider } from '../data/provider'
import { greeting, lastSession } from '../data/seed'
import { getProtocol } from '../data/protocols'
import { nextPlanItem, planComplete, planProgress, type Plan, type PlanItem } from '../data/plan'
import { isLibraryCode } from '../data/library'
import { ScheduleModal } from './ScheduleModal'
import { fmtDay, fmtTime, isUpcoming, joinWindowOpen, type Appointment } from '../data/scheduling'
import { useI18n, type Locale } from '../i18n'
import { patientTitle } from '../types/domain'
import type { SessionRecord, Duration } from '../types/domain'

interface HomeSessionProps {
  history: SessionRecord[]
  plan: Plan | null
  onStart: (launch: { protocolCode: string; duration: Duration; planItemId?: string }) => void
  /** Join the therapist's consultation room (a booked appointment). */
  onJoin: (appointment: Appointment) => void
  onLibrary: () => void
  onAssess: () => void
}

/** The name to show for something that was played. Library audio keeps its own
    consumer title. Pathway material shows its PUBLIC name when the catalog
    carries one and its clinical title otherwise — the code, the plan and the
    clinical record are unaffected either way, only the label changes. */
function titleOf(code: string, locale: Locale): string {
  const p = getProtocol(code)
  return p ? patientTitle(p, locale) : code
}

function PlanCta({ item, total, done, onStart }: { item: PlanItem; total: number; done: number; onStart: HomeSessionProps['onStart'] }) {
  const { t, locale } = useI18n()
  return (
    <>
      <button className="start-cta" onClick={() => onStart({ protocolCode: item.protocolCode, duration: item.duration, planItemId: item.id })}>
        <span className="start-cta__label">{t('Next session')}</span>
        <span className="start-cta__sub">
          {titleOf(item.protocolCode, locale)} · {t('week {n}', { n: item.week })} · {item.duration} {t('min')}
        </span>
      </button>
      <div className="plan-strip">
        <div className="plan-strip__bar"><div className="plan-strip__fill" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
        <span className="plan-strip__txt">{t('{done} of {total} sessions of your pathway', { done, total })}</span>
      </div>
      {item.note && (
        <div className="plan-note">
          <span className="plan-note__who">{t('From your therapist')}</span>
          <span>{item.note}</span>
        </div>
      )}
    </>
  )
}

/** One large CTA. With a pathway written by the therapist, it is that
    pathway's next session. Without one, the app does NOT invent a plan: it
    offers the library and the way to book a first session. */
export function HomeSession({ history, plan, onStart, onJoin, onLibrary, onAssess }: HomeSessionProps) {
  const { t, locale } = useI18n()
  const dp = useDataProvider()

  /* scheduling: the upcoming appointment + a minute tick so the "enter"
     window opens by itself */
  const [scheduling, setScheduling] = useState(false)
  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    const load = () => void dp.getMyAppointment().then((a) => { if (alive) setAppointment(a) }).catch(() => undefined)
    load()
    const id = window.setInterval(() => { setTick((n) => n + 1); load() }, 30_000)
    return () => { alive = false; window.clearInterval(id) }
  }, [dp])

  const last = lastSession(history)
  const lastKnown = history.length > 0 && !!getProtocol(last.protocolCode)
  const item = nextPlanItem(plan)
  const { done, total } = planProgress(plan)
  const finished = planComplete(plan)

  return (
    <div className="screen home">
      <header className="home__greet">
        <div>
          <p className="muted small">{t(greeting())}</p>
          <h1 className="display">{t('Ready when you are.')}</h1>
        </div>
        <BreathingOrb size={64} rings={false} />
      </header>

      {item && <PlanCta item={item} total={total} done={done} onStart={onStart} />}

      {finished && (
        <div className="plan-note">
          <span className="plan-note__who">{t('Pathway complete')}</span>
          <span>{t('You finished all {n} sessions. Book a session to review it together and set the next one.', { n: total })}</span>
        </div>
      )}

      {/* no pathway: the app never writes one by itself — that is the
          therapist's work, agreed in the first session */}
      {!plan && (
        <button className="start-cta" onClick={onLibrary}>
          <span className="start-cta__label">{t('Browse the library')}</span>
          <span className="start-cta__sub">{t('Audio sessions for a specific moment — pick one, or let us choose')}</span>
        </button>
      )}

      {/* directly under it: play the last session again */}
      {lastKnown && (
        <button className="rec-card rec-card--repeat" onClick={() => onStart(last)}>
          <span className="rec-card__eyebrow">{t('Repeat')}</span>
          <span className="rec-card__title">{titleOf(last.protocolCode, locale)}</span>
          <span className="rec-card__reason">
            {t('The session you did last time')} · {last.duration} {t('min')}
            {isLibraryCode(last.protocolCode) ? ` · ${t('from the library')}` : ''}
          </span>
        </button>
      )}

      {appointment && isUpcoming(appointment, Date.now()) ? (
        joinWindowOpen(appointment, Date.now()) ? (
          <button className="start-cta start-cta--join" onClick={() => onJoin(appointment)}>
            <span className="start-cta__label">{t('Enter session')}</span>
            <span className="start-cta__sub">{t('Your therapist is waiting — {name}', { name: appointment.therapistName ?? '' })}</span>
          </button>
        ) : (
          <div className="assess-card" style={{ cursor: 'default' }}>
            <span className="assess-card__icon">🩺</span>
            <span className="assess-card__text">
              <strong>{t('Session with {name}', { name: appointment.therapistName ?? '' })}</strong>
              <span>
                {fmtDay(appointment.startsAtMs, locale)} · {fmtTime(appointment.startsAtMs, locale)} — {t('the button to enter appears here at the time')}
                {'  '}
                <a href="#cancel" onClick={(e) => { e.preventDefault(); void dp.cancelAppointment(appointment.id).then(() => setAppointment(null)) }}>{t('Cancel booking')}</a>
              </span>
            </span>
          </div>
        )
      ) : (
        <button className="assess-card" onClick={() => setScheduling(true)}>
          <span className="assess-card__icon">🩺</span>
          <span className="assess-card__text">
            <strong>{plan ? t('Schedule a session') : t('Build your pathway with a therapist')}</strong>
            <span>{plan ? t('Pick a therapist and a time that works for you.') : t('In the first session your therapist writes the three-month pathway you will follow here.')}</span>
          </span>
          <span className="assess-card__arrow">→</span>
        </button>
      )}

      {scheduling && (
        <ScheduleModal
          onClose={() => setScheduling(false)}
          onBooked={(a) => setAppointment(a)}
        />
      )}

      <button className="assess-card" onClick={onAssess}>
        <span className="assess-card__icon">🗒️</span>
        <span className="assess-card__text">
          <strong>{t('Your quarterly check-in is ready')}</strong>
          <span>{t('2 min · anonymous · helps your workplace improve')}</span>
        </span>
        <span className="assess-card__arrow">→</span>
      </button>

      {plan && (
        <button className="btn btn--quiet" style={{ alignSelf: 'center', marginTop: 'auto' }} onClick={onLibrary}>
          {t('Browse the library')}
        </button>
      )}
    </div>
  )
}
