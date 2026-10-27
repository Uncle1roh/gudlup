/* ============================================================================
   Terapia — a port of WTerapia.dc.html

   Three columns on a desk, one on a phone: the next session, what is booked
   and what has happened, and a way to book another. Everything on this
   screen is the person's own; the line under the title says so, because an
   employer paying for the benefit is the first thing anyone wonders about.

   The mockup's third column offers a choice of three psychologists. A person
   here has ONE — a link to a professional, made with a code or through the
   directory — so that column names theirs, and the static line to find a
   different one (SET-8) stays underneath, where it already was.
   ============================================================================ */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import { useLegal } from '../legal/LegalContext'
import { useDataProvider } from '../data/provider'
import { expandOpenings, joinWindowOpen, type Appointment, type WeeklySlot } from '../data/scheduling'
import type { TherapyLink } from '../selfuse/therapyStore'
import { TopBar, PageTitle } from './TopBar'
import { initialsOf } from './Home'

interface TherapyProps {
  name: string | null
  link: TherapyLink
  appointment: Appointment | null
  /** Blocks entering the room until the professional's consent is accepted. */
  consentGate: boolean
  onReadConsent(): void
  onEnterRoom(): void
  onFindAnother(): void
  onBooked(): void
  /** Questionnaires and anything else this screen still owes. */
  extraSlot?: React.ReactNode
}

export function Therapy({
  name, link, appointment, consentGate,
  onReadConsent, onEnterRoom, onFindAnother, onBooked, extraSlot,
}: TherapyProps) {
  const { t, d } = useI18n()
  const { m } = useLegal()
  const joinable = appointment ? joinWindowOpen(appointment, Date.now()) : false

  return (
    <>
      <TopBar name={name} />
      <PageTitle title={t('Therapy')} note={t('Confidential: your company does not see your sessions or what you talk about.')} />

      <section className="g3">
        <NextSession
          link={link}
          appointment={appointment}
          joinable={joinable}
          consentGate={consentGate}
          onReadConsent={onReadConsent}
          onEnterRoom={onEnterRoom}
        />
        <Diary link={link} />
        <Booking link={link} onBooked={onBooked} />
      </section>

      {extraSlot}

      <p className="legal-line legal-line--foot">
        <button type="button" className="legal-link" onClick={onFindAnother}>{m('SET-8')}</button>
      </p>

      {/* The date is printed once, where it belongs, rather than repeated in
          each column — `d` is the app's own formatter, so it follows the
          reader's locale and not this file. */}
      <span className="gl-sr">{d(Date.now(), { dateStyle: 'full' })}</span>
    </>
  )
}

/* ------------------------------------------------------- next session --- */

function NextSession({ link, appointment, joinable, consentGate, onReadConsent, onEnterRoom }: {
  link: TherapyLink
  appointment: Appointment | null
  joinable: boolean
  consentGate: boolean
  onReadConsent(): void
  onEnterRoom(): void
}) {
  const { t, d } = useI18n()
  const { m } = useLegal()
  const at = appointment?.startsAtMs ?? link.nextSessionAt ?? null

  return (
    <article className="glass" style={{ borderRadius: 28, padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <span style={{ fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--link)' }}>
        {t('Next session')}
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span
          aria-hidden="true"
          style={{ width: 60, height: 60, flex: 'none', borderRadius: '50%', background: '#7AC69B', color: '#06140f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Outfit, sans-serif', fontSize: 20 }}
        >
          {initialsOf(link.therapist.name)}
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22 }}>{link.therapist.name}</span>
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
            {t(link.therapist.role)}{link.therapist.registration ? ` · ${link.therapist.registration}` : ''}
          </span>
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <Fact label={t('Next session:')} value={at ? d(at, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : t('No session is scheduled yet.')} />
        <Fact label={t('Duration')} value={t('{n} min', { n: appointment?.durationMin ?? 50 })} />
      </div>

      <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-2)' }}>
        <span aria-hidden="true" style={{ color: '#F2C29A', display: 'flex' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
            <rect x="3" y="14" width="4" height="6" rx="1.5" />
            <rect x="17" y="14" width="4" height="6" rx="1.5" />
          </svg>
        </span>
        {t('Stereo headphones are required for this session')}
      </span>

      {consentGate && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderRadius: 16, padding: '12px 14px', background: 'var(--inset)' }}>
          <p style={{ margin: 0, fontSize: 13 }}>{m('CNS-1', { name: link.therapist.name })}</p>
          <button type="button" className="glass-btn" style={{ height: 40, borderRadius: 999, fontSize: 14 }} onClick={onReadConsent}>
            {t('Read and accept the consent form')}
          </button>
        </div>
      )}

      <div style={{ flex: 1 }} />

      <button
        type="button"
        disabled={!joinable || consentGate}
        onClick={onEnterRoom}
        style={{
          height: 56, borderRadius: 999, background: 'var(--act-bg)', color: 'var(--act-fg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, border: 'none',
          fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 16,
          cursor: joinable && !consentGate ? 'pointer' : 'not-allowed',
          opacity: joinable && !consentGate ? 1 : 0.45,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="6" width="12" height="12" rx="3" />
          <path d="M15 10l6-3v10l-6-3z" />
        </svg>
        {t('Join Session')}
      </button>

      {!joinable && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-2)', textAlign: 'center' }}>
          {at ? t('Opens 15 minutes before your session starts.') : t('Your therapist will propose a time.')}
        </p>
      )}
    </article>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ borderRadius: 16, padding: '12px 14px', background: 'var(--inset)' }}>
      <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 500 }}>{value}</div>
    </div>
  )
}

/* --------------------------------------------- booked, and what passed --- */

function Diary({ link }: { link: TherapyLink }) {
  const { t, d } = useI18n()
  const dp = useDataProvider()
  const [booked, setBooked] = useState<Appointment[]>([])

  useEffect(() => {
    let alive = true
    void dp.listMyAppointments()
      .then((rows) => { if (alive) setBooked(rows.filter((a) => a.status === 'booked' && a.startsAtMs > Date.now())) })
      .catch(() => { if (alive) setBooked([]) })
    return () => { alive = false }
  }, [dp])

  /* A session and the two numbers around it, when both were answered. The
     VAS is 1–5 here, not the 1–10 the mockup's example prints. */
  const history = useMemo(() => {
    const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString()
    return [...link.sessions]
      .sort((a, b) => b.at - a.at)
      .slice(0, 6)
      .map((s) => ({ ...s, vas: link.vas.find((v) => sameDay(v.at, s.at)) ?? null }))
  }, [link])

  return (
    <article className="glass" style={{ borderRadius: 28, padding: 22, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <h2 style={{ margin: '0 0 6px', fontFamily: 'Outfit, sans-serif', fontWeight: 500, fontSize: 20 }}>{t('Booked')}</h2>

      {booked.length === 0 && <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)' }}>{t('Nothing booked yet.')}</p>}

      {booked.map((a) => (
        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 60, borderBottom: '1px solid var(--hair)' }}>
          <span style={{ width: 44, textAlign: 'center', lineHeight: 1.1 }}>
            <span style={{ display: 'block', fontFamily: 'Outfit, sans-serif', fontSize: 22 }}>{d(a.startsAtMs, { day: 'numeric' })}</span>
            <span style={{ fontSize: 11, color: 'var(--ink-2)' }}>{d(a.startsAtMs, { month: 'short' })}</span>
          </span>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ fontSize: 15 }}>{a.therapistName ?? link.therapist.name}</span>
            <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{d(a.startsAtMs, { weekday: 'long', hour: 'numeric', minute: '2-digit' })}</span>
          </span>
          <span style={{ fontSize: 12, color: 'var(--link)' }}>{t('Confirmed')}</span>
        </div>
      ))}

      <h2 style={{ margin: '18px 0 6px', fontFamily: 'Outfit, sans-serif', fontWeight: 500, fontSize: 20 }}>{t('Session history')}</h2>

      {history.length === 0 && <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)' }}>{t('Your sessions together will be listed here.')}</p>}

      {history.map((s) => (
        <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, minHeight: 36, alignItems: 'center' }}>
          <span style={{ color: 'var(--ink-2)' }}>
            {d(s.at, { day: 'numeric', month: 'short' })} · {t('{n} min', { n: s.minutes })}
          </span>
          {s.vas && <span style={{ color: 'var(--link)', whiteSpace: 'nowrap' }}>{t('before {a} → after {b}', { a: s.vas.pre, b: s.vas.post })}</span>}
        </div>
      ))}
    </article>
  )
}

/* ------------------------------------------------------------ booking --- */

function Booking({ link, onBooked }: { link: TherapyLink; onBooked(): void }) {
  const { t, d } = useI18n()
  const dp = useDataProvider()
  const [openings, setOpenings] = useState<number[] | null>(null)
  const [day, setDay] = useState<string | null>(null)
  const [slot, setSlot] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    let alive = true
    setOpenings(null)
    void (async () => {
      try {
        const now = Date.now()
        const [slots, taken] = await Promise.all([
          dp.getTherapistAvailability(link.therapist.id) as Promise<WeeklySlot[]>,
          dp.listBookedTimes(link.therapist.id, now, now + 21 * 86_400_000),
        ])
        if (alive) setOpenings(expandOpenings(slots, taken, now, 21))
      } catch {
        if (alive) { setOpenings([]); setError(t('Could not load available times.')) }
      }
    })()
    return () => { alive = false }
  }, [dp, link.therapist.id, t])

  useEffect(load, [load])

  /* Grouped by calendar day, which is how the grid reads it. */
  const byDay = useMemo(() => {
    const map = new Map<string, number[]>()
    for (const ms of openings ?? []) {
      const key = new Date(ms).toDateString()
      map.set(key, [...(map.get(key) ?? []), ms])
    }
    return map
  }, [openings])

  const days = [...byDay.keys()].slice(0, 5)
  const chosenDay = day && byDay.has(day) ? day : days[0] ?? null
  const times = chosenDay ? (byDay.get(chosenDay) ?? []).slice(0, 6) : []

  async function book() {
    if (slot == null) return
    setBusy(true)
    setError(null)
    try {
      await dp.bookAppointment(link.therapist.id, slot)
      setSlot(null)
      onBooked()
      load()
    } catch {
      setError(t('That time was just taken. Please choose another.'))
      setSlot(null)
      load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="glass" style={{ borderRadius: 28, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 500, fontSize: 20 }}>{t('Book a session')}</h2>

      {/* One professional, named — not a choice of three. Changing who you
          see is a decision of its own, and it has its own door below. */}
      <div style={{ borderRadius: 18, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--inset)', border: '1px solid var(--act-bg)' }}>
        <span aria-hidden="true" style={{ width: 40, height: 40, flex: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Outfit, sans-serif', background: '#7AC69B', color: '#06140f' }}>
          {initialsOf(link.therapist.name)}
        </span>
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{link.therapist.name}</span>
          <span style={{ fontSize: 12, opacity: 0.85 }}>{t(link.therapist.role)}</span>
        </span>
      </div>

      {openings === null && <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)' }}>{t('Loading…')}</p>}

      {openings !== null && days.length === 0 && (
        <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)' }}>{t('No free times in the next three weeks. Try again later.')}</p>
      )}

      {days.length > 0 && (
        <>
          <div role="radiogroup" aria-label={t('Day')} style={{ display: 'grid', gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, gap: 6 }}>
            {days.map((key) => {
              const ms = (byDay.get(key) ?? [])[0]
              const on = key === chosenDay
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => { setDay(key); setSlot(null) }}
                  style={{
                    borderRadius: 14, padding: '8px 4px', cursor: 'pointer', textAlign: 'center',
                    fontFamily: "'DM Sans', sans-serif", color: 'var(--ink)',
                    background: 'var(--inset)', border: `1px solid ${on ? 'var(--act-bg)' : 'var(--line)'}`,
                  }}
                >
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-2)' }}>{d(ms, { weekday: 'short' })}</span>
                  <span style={{ display: 'block', fontFamily: 'Outfit, sans-serif', fontSize: 18 }}>{d(ms, { day: 'numeric' })}</span>
                </button>
              )
            })}
          </div>

          <div role="radiogroup" aria-label={t('Time')} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {times.map((ms) => {
              const on = slot === ms
              return (
                <button
                  key={ms}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setSlot(ms)}
                  style={{
                    height: 44, borderRadius: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontSize: 14,
                    background: on ? '#3DB189' : 'var(--inset)', color: on ? '#06140f' : 'var(--ink)',
                    border: `1px solid ${on ? 'transparent' : 'var(--line)'}`,
                  }}
                >
                  {d(ms, { hour: 'numeric', minute: '2-digit' })}
                </button>
              )
            })}
          </div>
        </>
      )}

      {error && <p style={{ margin: 0, fontSize: 13, color: '#F2C29A' }}>{error}</p>}

      <div style={{ flex: 1 }} />

      <button
        type="button"
        disabled={slot == null || busy}
        onClick={() => void book()}
        style={{
          height: 56, borderRadius: 999, background: 'var(--act-bg)', color: 'var(--act-fg)', border: 'none',
          fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 16,
          cursor: slot == null || busy ? 'not-allowed' : 'pointer', opacity: slot == null || busy ? 0.45 : 1,
        }}
      >
        {slot == null ? t('Pick a time above') : t('Confirm')}
      </button>
    </article>
  )
}
