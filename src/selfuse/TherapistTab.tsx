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

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../i18n'
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

export function TherapistTab(props: TherapistTabProps) {
  const { t } = useI18n()
  const dp = useDataProvider()
  const catalog = useCatalog()
  const [view, setView] = useState<View>({ kind: 'root' })
  const { therapy, update } = props

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
            <strong>{new Date(r.slotMs).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</strong>
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
        {nextAt && (
          <div className="small muted">
            {t('Next session:')}{' '}
            {new Date(nextAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </div>
        )}
        <button className="btn btn--primary" disabled={!joinable} onClick={props.onJoinCall}>
          {t('Join Session')}
        </button>
        {!joinable && (
          <p className="small muted">
            {props.appointment
              ? t('Opens 15 minutes before your session starts.')
              : t('No session is scheduled yet.')}
          </p>
        )}
      </article>

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
              <span>{new Date(s.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
              <span>{name ? t(name) : t('Video session')}</span>
              <span className="small muted">{s.minutes}m</span>
              <span className="small muted">{s.notesShared ? t('Done') : ''}</span>
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

      <Messages state={therapy} update={update} />
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
            {new Date(times[0]).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
          <div className="slotday__row">
            {times.map((ms) => (
              <button key={ms} className="slot" aria-pressed={slot === ms} onClick={() => setSlot(ms)}>
                {new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
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

function Messages({ state, update }: { state: TherapyState; update: (fn: (s: TherapyState) => TherapyState) => void }) {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const msgs = state.link?.messages ?? []

  function send() {
    const body = text.trim()
    if (!body || !state.link) return
    update((s) =>
      s.link
        ? { ...s, link: { ...s.link, messages: [...s.link.messages, { id: `m-${Date.now()}`, from: 'patient', text: body, at: Date.now() }] } }
        : s,
    )
    setText('')
  }

  return (
    <>
      <h3 className="home__sect">{t('Messages')}</h3>
      <p className="small muted">🔒 {t('End-to-end encrypted')}</p>
      {!msgs.length && <p className="small muted">{t('No messages yet.')}</p>}
      <div className="msgs">
        {msgs.map((m) => (
          <div key={m.id} className={`msg msg--${m.from}`}>
            <p>{m.text}</p>
            <span className="small muted">{new Date(m.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
          </div>
        ))}
      </div>
      <div className="msgs__compose">
        <input className="ob-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Write a message…')} />
        <button className="btn btn--primary" onClick={send} disabled={!text.trim()}>{t('Send')}</button>
      </div>
    </>
  )
}
