/* ============================================================================
   Self Use — the Therapist tab (THR states, the booking flow, the videocall)

   The tab is ALWAYS visible, for every user. What changes is what is inside it:

     State B   the company has no Professional Support convention (or the
               person uses the app individually) — informative only, no booking
     State A   convention present, no therapist linked — find one, or enter a
               connection code
     State A2  a slot has been requested, waiting for the therapist to confirm
     State C   linked and active — sessions, prescriptions, history, messages

   Two vocabulary rules hold everywhere below:
   · Session names are the Self Use ones. A protocol code never appears.
   · Prescriptions are the therapist's clinical decision, shown here as plain
     recommendations. Completing one counts toward THERAPY progress, never
     toward the Self Use pathway.
   ============================================================================ */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n, fmtDate } from '../i18n'
import { useDataProvider } from '../data/provider'
import {
  expandOpenings,
  joinWindowOpen,
  type Appointment,
  type TherapistListing,
  type WeeklySlot,
} from '../data/scheduling'
import { durationLabel } from '../data/selfuse'
import { useCatalog } from '../data/liveCatalog'
import {
  DEMO_THERAPISTS,
  checkConnectionCode,
  seedLink,
  adherence,
  profileFor,
  type TherapistProfile,
  type TherapyState,
  type PatientIntake,
} from './therapyStore'
import type { Launch } from './Home'
import { Assessment } from './Assessment'
import {
  useAssessments,
  pendingFor,
  completedFor,
  saveProgress,
  send as sendAssessment,
  complete as completeRecord,
  minutesFor,
  SELF_USE_PATIENT_ID,
} from '../data/assessmentStore'
import { INSTRUMENTS } from '../data/assessments'
import {
  useMessages,
  threadFor,
  unreadFor,
  markRead,
  seedThread,
  send as sendMessage,
  MAX_LENGTH,
} from '../data/messageStore'

interface TherapistTabProps {
  hasConvention: boolean
  therapy: TherapyState
  update: (fn: (s: TherapyState) => TherapyState) => void
  /** The real booked appointment, when there is one. */
  appointment: Appointment | null
  onAppointmentChanged: () => void
  onGoSelfUse: () => void
  onStartPrescription: (l: Launch, prescriptionId: string) => void
  onJoinCall: () => void
}

type View =
  | { kind: 'root' }
  | { kind: 'list' }
  | { kind: 'profile'; id: string }
  | { kind: 'code' }
  | { kind: 'onb'; step: 1 | 2 | 3; therapist: TherapistProfile }
  | { kind: 'assessment'; id: string }

export function TherapistTab(props: TherapistTabProps) {
  const { t, d } = useI18n()
  const dp = useDataProvider()
  const catalog = useCatalog()
  const [view, setView] = useState<View>({ kind: 'root' })
  const { therapy, update } = props
  const { rows, update: updateAssessments } = useAssessments()
  const { update: updateMessages } = useMessages()
  const pending = pendingFor(rows, SELF_USE_PATIENT_ID)
  const finished = completedFor(rows, SELF_USE_PATIENT_ID)

  /* ---------------------------------------------------- booking flow ----- */

  if (view.kind === 'list') {
    return <TherapistList onBack={() => setView({ kind: 'root' })} onOpen={(id) => setView({ kind: 'profile', id })} />
  }

  if (view.kind === 'profile') {
    return (
      <TherapistProfileScreen
        therapistId={view.id}
        onBack={() => setView({ kind: 'list' })}
        onBooked={(th, slotMs) => {
          update((s) => ({
            ...s,
            request: { therapistId: th.id, therapistName: th.name, therapistRole: th.role, slotMs, sentAt: Date.now() },
          }))
          props.onAppointmentChanged()
          setView({ kind: 'root' })
        }}
      />
    )
  }

  if (view.kind === 'assessment') {
    const record = rows.find((r) => r.id === view.id)
    if (record) {
      return (
        <Assessment
          record={record}
          therapistName={therapy.link?.therapist.name}
          onSaveProgress={(res) => updateAssessments((rs) => saveProgress(rs, record.id, res))}
          onSubmit={(res) => updateAssessments((rs) => completeRecord(rs, record.id, res))}
          onClose={() => setView({ kind: 'root' })}
        />
      )
    }
  }

  if (view.kind === 'code') {
    return (
      <ConnectionCodeScreen
        onBack={() => setView({ kind: 'root' })}
        onConnected={(th) => setView({ kind: 'onb', step: 1, therapist: th })}
      />
    )
  }

  if (view.kind === 'onb') {
    return (
      <PatientOnboarding
        step={view.step}
        therapist={view.therapist}
        onBack={() => (view.step === 1 ? setView({ kind: 'code' }) : setView({ kind: 'onb', step: (view.step - 1) as 1 | 2, therapist: view.therapist }))}
        onStep={(s) => setView({ kind: 'onb', step: s, therapist: view.therapist })}
        onFinish={(intake) => {
          update(() => ({ request: null, link: { ...seedLink(view.therapist), intake } }))
          /* T0 is days 1–2 of the journey, and linking IS day 1. The schedule
             proposes it; a therapist taking someone on has confirmed it by
             taking them on, so it arrives as a real request rather than a
             suggestion nobody ever acts on. */
          updateAssessments((rs) =>
            pendingFor(rs, SELF_USE_PATIENT_ID).some((r) => r.instrumentId === 'DASS21')
              ? rs
              : sendAssessment(rs, SELF_USE_PATIENT_ID, 'DASS21', 'T0', view.therapist.name),
          )
          /* The therapist writes first, as they would in life. `seedThread`
             runs only on an empty thread, so this can never land on top of a
             real conversation. */
          updateMessages((rs) =>
            seedThread(
              rs,
              SELF_USE_PATIENT_ID,
              'Welcome. Write to me here between our sessions whenever something is worth saying.',
              Date.now(),
            ),
          )
          setView({ kind: 'root' })
        }}
      />
    )
  }

  /* --------------------------------------------------------- State B ----- */
  if (!props.hasConvention) {
    return (
      <div className="su-page thr-info">
        <h1 className="display su-h1">{t('Therapist')}</h1>
        <div className="thr-art" aria-hidden="true"><span className="ob-art__glow" /></div>
        <h2 className="thr-info__h">{t('Professional support')}</h2>
        <p className="lead">
          {t("Good Loop also offers guided sessions with licensed professionals, available through your company's extended plan.")}
        </p>
        <p className="lead">{t('In the meantime, your Self Use sessions are always here for you.')}</p>
        <button className="btn btn--primary" onClick={props.onGoSelfUse}>{t('Go to Self Use')}</button>
        <p className="small muted">{t('Questions? Contact your HR team or our support.')}</p>
      </div>
    )
  }

  /* -------------------------------------------------------- State A2 ----- */
  if (therapy.request && !therapy.link) {
    /* Confirmed by the therapist means an APPOINTMENT exists for the slot;
       until then this stays a pending request. */
    const r = therapy.request
    return (
      <div className="su-page">
        <h1 className="display su-h1">{t('Therapist')}</h1>
        <article className="card thr-pending">
          <span className="badge">{t('Request pending')}</span>
          <div className="thr-card__id">
            <span className="avatar" aria-hidden="true">{initials(r.therapistName)}</span>
            <div>
              <strong>{r.therapistName}</strong>
              <div className="small muted">{t(r.therapistRole)}</div>
            </div>
          </div>
          <div className="thr-pending__slot">
            <span className="small muted">{t('Requested')}</span>
            <strong>{d(r.slotMs, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</strong>
          </div>
          <p className="small muted">{t('Waiting for confirmation')}</p>
          <button
            className="btn btn--quiet"
            onClick={() => {
              if (props.appointment) void dp.cancelAppointment(props.appointment.id).catch(() => {})
              update((s) => ({ ...s, request: null }))
              props.onAppointmentChanged()
            }}
          >
            {t('Cancel request')}
          </button>
        </article>
        <p className="small muted">{t("You'll receive a notification when your therapist confirms.")}</p>
      </div>
    )
  }

  /* --------------------------------------------------------- State A ----- */
  if (!therapy.link) {
    return (
      <div className="su-page thr-info">
        <h1 className="display su-h1">{t('Therapist')}</h1>
        <div className="thr-art" aria-hidden="true"><span className="ob-art__glow" /></div>
        <h2 className="thr-info__h">{t('Professional support, when you need it')}</h2>
        <p className="lead">{t('Connect with a licensed professional for guided sessions tailored to your needs.')}</p>
        <button className="btn btn--primary" onClick={() => setView({ kind: 'list' })}>{t('Find a therapist')}</button>
        <div className="ob-or"><span>{t('or')}</span></div>
        <p className="small muted">{t('Have a connection code?')}</p>
        <button className="btn btn--ghost" onClick={() => setView({ kind: 'code' })}>{t('Enter code')}</button>
      </div>
    )
  }

  /* --------------------------------------------------------- State C ----- */
  const link = therapy.link
  /* The join window is computed from the REAL appointment, not from the
     link's remembered time — a rescheduled session must move the button. */
  const nextAt = props.appointment?.startsAtMs ?? link.nextSessionAt
  const joinable = props.appointment ? joinWindowOpen(props.appointment, Date.now()) : false

  return (
    <div className="su-page thr-active">
      <h1 className="display su-h1">{t('Therapist')}</h1>

      <article className="card thr-hero">
        <div className="thr-card__id">
          <span className="avatar" aria-hidden="true">{initials(link.therapist.name)}</span>
          <div>
            <strong>{link.therapist.name}</strong>
            <div className="small muted">{t(link.therapist.role)}</div>
          </div>
        </div>
        {nextAt ? (
          <div className="small muted">
            {t('Next session:')}{' '}
            {d(nextAt, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </div>
        ) : (
          <div className="small muted">{t('No session is scheduled yet.')}</div>
        )}
        <button className="btn btn--primary" disabled={!joinable} onClick={props.onJoinCall}>
          {t('Join Session')}
        </button>
        {/* The line under the button explains the DISABLED button, so it has to
            agree with the line above it. It used to say "no session is
            scheduled yet" whenever there was no confirmed appointment — printed
            directly beneath a date, which is the one place a person looks to
            find out when they are next seen. */}
        {!joinable && (
          <p className="small muted">
            {nextAt
              ? t('Opens 15 minutes before your session starts.')
              : t('Your therapist will propose a time.')}
          </p>
        )}
      </article>

      {(pending.length > 0 || finished.length > 0) && (
        <>
          <h3 className="home__sect">{t('Questionnaires')}</h3>
          {pending.map((r) => {
            const inst = r.instrumentId === 'VAS' ? null : INSTRUMENTS[r.instrumentId]
            const answered = r.responses.length
            return (
              <article key={r.id} className="card asmt-card">
                <div className="rx-card__top">
                  <strong>{inst ? inst.name : 'VAS'}</strong>
                  <span className="small muted">{t('{n} min', { n: minutesFor(r.instrumentId) })}</span>
                </div>
                <p className="small muted">
                  {t('{name} asked you to fill this in. Take it when you have a quiet few minutes.', {
                    name: therapy.link?.therapist.name ?? t('Your therapist'),
                  })}
                </p>
                <button className="btn btn--primary" onClick={() => setView({ kind: 'assessment', id: r.id })}>
                  {answered > 0 ? t('Resume') : t('Start')}
                </button>
              </article>
            )
          })}
          {/* Completed ones show the DATE and nothing else. The score is on the
              therapist's side, where the history that gives it meaning is. */}
          {finished.length > 0 && (
            <ul className="chron">
              {finished.map((r) => (
                <li key={r.id} className="chron__row">
                  <span>{d(r.completedAt ?? r.administeredAt)}</span>
                  <span>{r.instrumentId === 'VAS' ? 'VAS' : INSTRUMENTS[r.instrumentId].name}</span>
                  <span className="small muted">{t('Sent')}</span>
                  <span />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <h3 className="home__sect">{t('Prescriptions')}</h3>
      {!link.prescriptions.length && <p className="small muted">{t('No prescriptions yet.')}</p>}
      {link.prescriptions.map((rx) => {
        const s = catalog.sessions.find((x) => x.slug === rx.slug)
        if (!s) return null
        return (
          <article key={rx.id} className="card rx-card">
            <div className="rx-card__top">
              <strong>{t('{n}× {name} this week', { n: rx.perWeek, name: t(s.name) })}</strong>
              <span className="small muted">({t(durationLabel(rx.duration))} {rx.duration}m)</span>
            </div>
            <div className="rx-card__bar" aria-hidden="true"><span style={{ width: `${adherence(rx)}%` }} /></div>
            <div className="small muted">{t('{done} of {total} done', { done: rx.done, total: rx.perWeek })}</div>
            {rx.done < rx.perWeek && (
              <button
                className="btn btn--ghost"
                onClick={() => props.onStartPrescription({ slug: rx.slug, duration: rx.duration }, rx.id)}
              >
                {t('Start session')}
              </button>
            )}
          </article>
        )
      })}

      <h3 className="home__sect">{t('Session history')}</h3>
      <ul className="chron">
        {link.sessions.map((s) => {
          const name = s.slug ? catalog.sessions.find((x) => x.slug === s.slug)?.name : undefined
          return (
            <li key={s.id} className="chron__row">
              <span>{d(s.at)}</span>
              <span>{name ? t(name) : t('Video session')}</span>
              <span className="small muted">{s.minutes}m</span>
              {/* This column was labelled "Done", which read as "you attended".
                  It is the notes-sharing flag: whether your therapist wrote up
                  the session for you to see. Two different facts. */}
              <span className="small muted">{s.notesShared ? t('Notes shared') : ''}</span>
            </li>
          )
        })}
      </ul>

      <h3 className="home__sect">{t('Therapy goals')}</h3>
      <ul className="goals">
        {link.goals.map((g) => (
          <li key={g.id}>
            <span className={`goal-dot goal-dot--${g.status}`} aria-hidden="true" />
            {t(g.text)}
            <span className="small muted"> · {g.status === 'achieved' ? t('Achieved') : t('In progress')}</span>
          </li>
        ))}
      </ul>

      <Messages patientId={SELF_USE_PATIENT_ID} therapistName={link.therapist.name} />
    </div>
  )
}

/* ------------------------------------------------------------------------- */

function initials(name: string): string {
  return name
    .replace(/^Dr\.?\s+/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

/* --------------------------------------------------- list + booking ------ */

/**
 * The therapists a person may book, from the DATA LAYER.
 *
 * `listAvailableTherapists()` returns the approved professionals of the same
 * company (falling back to all approved in the pilot), so this list is the
 * convention's actual roster rather than a fixture. The bio and specialties
 * are layered on by `profileFor` until they live on the therapist record.
 */
function TherapistList({ onBack, onOpen }: { onBack: () => void; onOpen: (id: string) => void }) {
  const { t } = useI18n()
  const dp = useDataProvider()
  const [listings, setListings] = useState<TherapistListing[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    dp.listAvailableTherapists()
      .then((l) => { if (active) setListings(l) })
      .catch(() => { if (active) { setError(true); setListings([]) } })
    return () => { active = false }
  }, [dp])

  return (
    <div className="su-page">
      <button className="su-back" onClick={onBack}>‹ {t('Back')}</button>
      <h1 className="display su-h1">{t('Find a Therapist')}</h1>
      <p className="small muted">{t('Professionals available through your company')}</p>

      {listings === null && <p className="small muted">{t('Loading…')}</p>}
      {error && <p className="small muted">{t('Could not load the list. Please try again.')}</p>}
      {listings !== null && !listings.length && !error && (
        <div className="empty">
          <p>{t('No therapist is available through your company yet.')}</p>
          <p className="small muted">{t('Your HR team can invite professionals to your convention.')}</p>
        </div>
      )}

      <div className="thr-list">
        {(listings ?? []).map((l) => {
          const th = profileFor(l)
          return (
            <article key={l.id} className="card thr-card">
              <div className="thr-card__id">
                {l.avatarUrl
                  ? <img className="avatar" src={l.avatarUrl} alt="" />
                  : <span className="avatar" aria-hidden="true">{initials(th.name)}</span>}
                <div>
                  <strong>{th.name}</strong>
                  <div className="small muted">{t(th.role)}</div>
                  {th.specialties.length > 0 && (
                    <div className="small muted">{th.specialties.map((x) => t(x)).join(' · ')}</div>
                  )}
                </div>
              </div>
              <button className="btn btn--ghost" onClick={() => onOpen(l.id)}>{t('View Profile')}</button>
            </article>
          )
        })}
      </div>
    </div>
  )
}

/**
 * One therapist, their real openings, and a booking that actually books.
 *
 * The slots come from the therapist's weekly availability template expanded
 * against the times already taken — so two people cannot be shown the same
 * opening and both take it. `bookAppointment` still rejects a slot that was
 * claimed in the meantime, and that rejection is reported rather than
 * swallowed: the person needs to pick again, not wonder.
 */
function TherapistProfileScreen({
  therapistId,
  onBack,
  onBooked,
}: {
  therapistId: string
  onBack: () => void
  onBooked: (t: TherapistProfile, slotMs: number) => void
}) {
  const { t } = useI18n()
  const dp = useDataProvider()
  const [therapist, setTherapist] = useState<TherapistProfile | null>(null)
  const [openings, setOpenings] = useState<number[] | null>(null)
  const [slot, setSlot] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    let active = true
    setOpenings(null)
    void (async () => {
      try {
        const listings = await dp.listAvailableTherapists()
        const listing = listings.find((l) => l.id === therapistId)
        if (!active) return
        setTherapist(profileFor(listing ?? { id: therapistId, name: therapistId }))

        const now = Date.now()
        const [slots, booked] = await Promise.all([
          dp.getTherapistAvailability(therapistId) as Promise<WeeklySlot[]>,
          dp.listBookedTimes(therapistId, now, now + 21 * 86_400_000),
        ])
        if (!active) return
        setOpenings(expandOpenings(slots, booked, now, 21))
      } catch {
        if (active) { setOpenings([]); setError(t('Could not load available times.')) }
      }
    })()
    return () => { active = false }
  }, [dp, therapistId, t])

  useEffect(load, [load])

  async function book() {
    if (slot == null || !therapist) return
    setBusy(true)
    setError(null)
    try {
      await dp.bookAppointment(therapistId, slot)
      onBooked(therapist, slot)
    } catch {
      // Almost always "someone took it first". Reload so the grid is honest.
      setError(t('That time was just taken. Please choose another.'))
      setSlot(null)
      load()
    } finally {
      setBusy(false)
    }
  }

  /* Group the flat opening list by calendar day for the grid. */
  const byDay = new Map<string, number[]>()
  for (const ms of openings ?? []) {
    const d = new Date(ms)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    byDay.set(key, [...(byDay.get(key) ?? []), ms])
  }

  return (
    <div className="su-page">
      <button className="su-back" onClick={onBack}>‹ {t('Back')}</button>

      {therapist && (
        <>
          <div className="thr-card__id thr-card__id--lg">
            <span className="avatar avatar--lg" aria-hidden="true">{initials(therapist.name)}</span>
            <div>
              <h1 className="display su-h1">{therapist.name}</h1>
              <div className="small muted">
                {t(therapist.role)}{therapist.registration ? ` · ${therapist.registration}` : ''}
              </div>
            </div>
          </div>
          {therapist.bio && <p className="lead">{t(therapist.bio)}</p>}
          {therapist.areas.length > 0 && (
            <p className="small"><strong>{t('Areas:')}</strong> {therapist.areas.map((a) => t(a)).join(' · ')}</p>
          )}
          {therapist.languages.length > 0 && (
            <p className="small"><strong>{t('Languages:')}</strong> {therapist.languages.map((l) => t(l)).join(', ')}</p>
          )}
        </>
      )}

      <h3 className="home__sect">{t('Available slots')}</h3>
      {openings === null && <p className="small muted">{t('Loading…')}</p>}
      {openings !== null && !openings.length && (
        <p className="small muted">{t('No free times in the next three weeks. Try again later.')}</p>
      )}

      {[...byDay.entries()].map(([key, times]) => (
        <div key={key} className="slotday">
          <div className="small muted">
            {fmtDate(times[0], { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
          <div className="slotday__row">
            {times.map((ms) => (
              <button key={ms} className="slot" aria-pressed={slot === ms} onClick={() => setSlot(ms)}>
                {fmtDate(ms, { hour: '2-digit', minute: '2-digit' })}
              </button>
            ))}
          </div>
        </div>
      ))}

      {error && <p className="ob-error">{error}</p>}

      <button className="btn btn--primary" disabled={slot == null || busy} onClick={() => void book()}>
        {busy ? t('Requesting…') : t('Request Session')}
      </button>
      <p className="small muted">
        {t('Booking shares only your name, the slot and your company. No health data is sent.')}
      </p>
    </div>
  )
}

/* ------------------------------------------------------- connection code -- */

function ConnectionCodeScreen({
  onBack,
  onConnected,
}: {
  onBack: () => void
  onConnected: (t: TherapistProfile) => void
}) {
  const { t } = useI18n()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit() {
    const res = checkConnectionCode(code, DEMO_THERAPISTS)
    if (!res.ok || !res.therapist) {
      setError(res.reason === 'expired'
        ? t('This code has expired. Ask your therapist for a new one.')
        : t('This code is not valid.'))
      return
    }
    setError(null)
    onConnected(res.therapist)
  }

  return (
    <div className="su-page">
      <button className="su-back" onClick={onBack}>‹ {t('Back')}</button>
      <h1 className="display su-h1">{t('Enter your connection code')}</h1>
      <p className="lead">{t('Your therapist will give you a unique code to connect your accounts.')}</p>
      <input
        className={`ob-input ob-input--code${error ? ' is-error' : ''}`}
        value={code}
        onChange={(e) => { setCode(e.target.value); setError(null) }}
        placeholder="GL-0000-XXXX"
        autoCapitalize="characters"
        spellCheck={false}
      />
      {error && <p className="ob-error">{error}</p>}
      <button className="btn btn--primary" onClick={submit}>{t('Connect')}</button>
    </div>
  )
}

/* ------------------------------------------------ patient onboarding ----- */

function PatientOnboarding({
  step,
  therapist,
  onBack,
  onStep,
  onFinish,
}: {
  step: 1 | 2 | 3
  therapist: TherapistProfile
  onBack: () => void
  onStep: (s: 1 | 2 | 3) => void
  onFinish: (i: PatientIntake) => void
}) {
  const { t } = useI18n()
  const [reason, setReason] = useState('')
  const [conditions, setConditions] = useState('')
  const [medications, setMedications] = useState('')
  const [clinical, setClinical] = useState(false)
  const [notes, setNotes] = useState(false)
  const [bridge, setBridge] = useState(false)

  if (step === 1) {
    return (
      <div className="su-page">
        <button className="su-back" onClick={onBack}>‹ {t('Back')}</button>
        <span className="eyebrow">{t('Step 1 of 3')}</span>
        <h1 className="display su-h1">{t('About you')}</h1>
        <label className="ob-field">
          <span className="ob-field__label">{t('Reason for consultation')}</span>
          <textarea
            className="ob-input"
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('Tell your therapist what brings you here…')}
          />
        </label>
        <label className="ob-field">
          <span className="ob-field__label">{t('Active conditions')} <em className="small muted">{t('Optional')}</em></span>
          <textarea className="ob-input" rows={2} value={conditions} onChange={(e) => setConditions(e.target.value)} />
        </label>
        <label className="ob-field">
          <span className="ob-field__label">{t('Current medications')} <em className="small muted">{t('Optional')}</em></span>
          <textarea className="ob-input" rows={2} value={medications} onChange={(e) => setMedications(e.target.value)} />
        </label>
        <button className="btn btn--primary" disabled={!reason.trim()} onClick={() => onStep(2)}>{t('Continue')}</button>
      </div>
    )
  }

  if (step === 2) {
    return (
      <div className="su-page">
        <button className="su-back" onClick={onBack}>‹ {t('Back')}</button>
        <span className="eyebrow">{t('Step 2 of 3')}</span>
        <h1 className="display su-h1">{t('Consent')}</h1>

        <ToggleRow
          title={t('Clinical data processing')}
          tag={t('REQUIRED')}
          on={clinical}
          onToggle={() => setClinical((v) => !v)}
        />
        <ToggleRow
          title={t('Session notes')}
          tag={t('REQUIRED')}
          on={notes}
          onToggle={() => setNotes((v) => !v)}
        />
        <ToggleRow
          title={t('Share Self Use history with therapist')}
          body={t('Share your Self Use history and check-ins. You can revoke this at any time.')}
          tag={t('OPTIONAL · DEFAULT OFF')}
          on={bridge}
          onToggle={() => setBridge((v) => !v)}
        />

        <button className="btn btn--primary" disabled={!clinical || !notes} onClick={() => onStep(3)}>
          {t('Continue')}
        </button>
      </div>
    )
  }

  const now = Date.now()
  return (
    <div className="su-page">
      <span className="eyebrow">{t('Step 3 of 3')}</span>
      <h1 className="display su-h1">{t("You're all set.")}</h1>
      <p className="lead">{t('Connected with {name}.', { name: therapist.name })}</p>
      <p className="small muted">{t('First session: To be scheduled')}</p>
      <button
        className="btn btn--primary"
        onClick={() =>
          onFinish({
            reason,
            conditions,
            medications,
            clinicalConsentAt: now,
            notesConsentAt: now,
            bridge,
            bridgeAt: bridge ? now : null,
          })
        }
      >
        {t('Done')}
      </button>
    </div>
  )
}

function ToggleRow({
  title,
  body,
  tag,
  on,
  onToggle,
}: {
  title: string
  body?: string
  tag: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <div className="consent-row">
      <div className="consent-row__main">
        <div className="consent-row__text">
          <div className="consent-row__title">{title}</div>
          {body && <p className="small muted">{body}</p>}
          <span className="consent-row__tag">{tag}</span>
        </div>
        <button className={`switch${on ? ' is-on' : ''}`} role="switch" aria-checked={on} aria-label={title} onClick={onToggle}>
          <span className="switch__knob" />
        </button>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- messages -- */

/**
 * The patient's half of one thread.
 *
 * It reads and writes `messageStore`, which the therapist's desktop also reads
 * and writes. Before that, this component wrote into the therapy link and the
 * workspace wrote into its own state: two chats that each looked like they
 * worked and never met.
 *
 * Deliberately NOT here: a delivery receipt, a typing indicator, or "seen".
 * This is not an instant messenger — a therapist answers between appointments,
 * and a read receipt on a message about a bad week creates an expectation of
 * an immediate reply that nobody has promised.
 */
function Messages({ patientId, therapistName }: { patientId: string; therapistName: string }) {
  const { t, d } = useI18n()
  const { rows, update } = useMessages()
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement | null>(null)

  const msgs = threadFor(rows, patientId)
  const unread = unreadFor(rows, patientId, 'patient')

  /* Opening the tab IS reading them. */
  useEffect(() => {
    if (unread > 0) update((rs) => markRead(rs, patientId, 'patient'))
  }, [unread, patientId, update])

  /* A thread opens on its newest message, not its oldest — a conversation is
     read from the bottom. */
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [msgs.length])

  function submit() {
    const body = text.trim()
    if (!body) return
    update((rs) => sendMessage(rs, patientId, 'patient', body))
    setText('')
  }

  const over = text.length > MAX_LENGTH - 100

  return (
    <>
      <h3 className="home__sect">{t('Messages')}</h3>
      <p className="small muted">
        {t('Your therapist reads these between sessions. For anything urgent, use the emergency numbers in your profile.')}
      </p>

      {!msgs.length ? (
        <p className="small muted msgs__empty">
          {t('No messages yet. Write to {name} whenever something is worth saying between sessions.', { name: therapistName })}
        </p>
      ) : (
        <div className="msgs" role="log" aria-label={t('Messages')}>
          {msgs.map((m) => (
            <div key={m.id} className={`msg msg--${m.from}`}>
              <p>{m.text}</p>
              <span className="small muted msg__at">
                {d(m.at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}

      <div className="msgs__compose">
        <input
          className="ob-input"
          value={text}
          maxLength={MAX_LENGTH}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
          }}
          placeholder={t('Write a message…')}
          aria-label={t('Write a message…')}
        />
        <button className="btn btn--primary" onClick={submit} disabled={!text.trim()}>{t('Send')}</button>
      </div>
      {over && (
        <p className="small muted msgs__count">
          {t('{n} characters left', { n: MAX_LENGTH - text.length })}
        </p>
      )}
    </>
  )
}
