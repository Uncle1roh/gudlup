/* The patient's scheduling journey (PO spec): "Schedule session" opens a
   popup with the company's available therapists; picking one shows that
   therapist's open time slots (weekly agenda expanded to concrete days,
   minus booked ones); picking a slot books it and confirms. The home card
   then shows the appointment, and from 5 minutes before the start an
   "Enter session" button connects into the ordinary session flow. */

import { useEffect, useMemo, useState } from 'react'
import { useDataProvider } from '../data/provider'
import { useI18n } from '../i18n'
import { expandOpenings, fmtDay, fmtTime, type Appointment, type TherapistListing } from '../data/scheduling'

interface ScheduleModalProps {
  onClose: () => void
  onBooked: (a: Appointment) => void
}

type Step = 'therapist' | 'slots' | 'done'

export function ScheduleModal({ onClose, onBooked }: ScheduleModalProps) {
  const dp = useDataProvider()
  const { t, locale } = useI18n()

  const [step, setStep] = useState<Step>('therapist')
  const [therapists, setTherapists] = useState<TherapistListing[] | null>(null)
  const [chosen, setChosen] = useState<TherapistListing | null>(null)
  const [openings, setOpenings] = useState<number[] | null>(null)
  const [booking, setBooking] = useState(false)
  const [booked, setBooked] = useState<Appointment | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void dp.listAvailableTherapists()
      .then((list) => { if (alive) setTherapists(list) })
      .catch((e) => { if (alive) setError((e as Error).message) })
    return () => { alive = false }
  }, [dp])

  async function pickTherapist(th: TherapistListing) {
    setChosen(th)
    setOpenings(null)
    setError(null)
    setStep('slots')
    try {
      const now = Date.now()
      const [slots, bookedTimes] = await Promise.all([
        dp.getTherapistAvailability(th.id),
        dp.listBookedTimes(th.id, now, now + 14 * 24 * 3600_000),
      ])
      setOpenings(expandOpenings(slots, bookedTimes, now))
    } catch (e) {
      setError((e as Error).message)
      setOpenings([])
    }
  }

  async function pickSlot(at: number) {
    if (!chosen || booking) return
    setBooking(true)
    setError(null)
    try {
      const a = await dp.bookAppointment(chosen.id, at)
      const withName = { ...a, therapistName: a.therapistName ?? chosen.name }
      setBooked(withName)
      setStep('done')
      onBooked(withName)
    } catch (e) {
      setError((e as Error).message)
      // refresh openings — the slot may have just been taken
      void pickTherapist(chosen)
    } finally {
      setBooking(false)
    }
  }

  /* group openings per day for a readable grid */
  const days = useMemo(() => {
    if (!openings) return null
    const map = new Map<string, number[]>()
    for (const at of openings) {
      const key = fmtDay(at, locale)
      map.set(key, [...(map.get(key) ?? []), at])
    }
    return [...map.entries()]
  }, [openings, locale])

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal sched" onClick={(e) => e.stopPropagation()}>
        <div className="sched__head">
          <strong>
            {step === 'therapist' && t('Choose a therapist')}
            {step === 'slots' && (chosen?.name ?? '')}
            {step === 'done' && t('Session booked')}
          </strong>
          <button className="sched__close" onClick={onClose} aria-label={t('Cancel')}>✕</button>
        </div>

        {error && <div className="sched__err">{error}</div>}

        {step === 'therapist' && (
          <div className="sched__list">
            {!therapists && <div className="muted small">{t('Loading…')}</div>}
            {therapists?.length === 0 && <div className="muted small">{t('No therapists are available yet — try again soon.')}</div>}
            {therapists?.map((th) => (
              <button key={th.id} className="sched__item" onClick={() => void pickTherapist(th)}>
                <span className="sched__avatar">
                  {th.avatarUrl ? <img src={th.avatarUrl} alt="" /> : '🩺'}
                </span>
                <span>{th.name}</span>
                <span className="sched__arrow">→</span>
              </button>
            ))}
          </div>
        )}

        {step === 'slots' && (
          <div className="sched__slots">
            <button className="sched__backlink" onClick={() => setStep('therapist')}>← {t('Choose a therapist')}</button>
            {!days && <div className="muted small">{t('Loading…')}</div>}
            {days?.length === 0 && <div className="muted small">{t('This therapist has no open times in the next two weeks.')}</div>}
            {days?.map(([day, ats]) => (
              <div key={day} className="sched__day">
                <div className="sched__dayname">{day}</div>
                <div className="sched__times">
                  {ats.map((at) => (
                    <button key={at} className="sched__time" disabled={booking} onClick={() => void pickSlot(at)}>
                      {fmtTime(at, locale)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {step === 'done' && booked && (
          <div className="sched__done">
            <div className="sched__check">✓</div>
            <p>
              {t('Your session with {name} is confirmed.', { name: booked.therapistName ?? '' })}
              <br />
              <strong>{fmtDay(booked.startsAtMs, locale)} · {fmtTime(booked.startsAtMs, locale)}</strong>
            </p>
            <p className="muted small">{t('When the time comes, an "Enter session" button appears on your home screen.')}</p>
            <button className="btn btn--primary" onClick={onClose}>{t('Done')}</button>
          </div>
        )}
      </div>
    </div>
  )
}
