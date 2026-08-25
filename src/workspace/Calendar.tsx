/* ============================================================================
   Therapist Workspace — Calendar (TH-CAL) and availability (TH-CAL-AVAIL)

   A week grid from 07:00 to 21:00 in 30-minute rows, with a right rail that
   answers the two questions a calendar screen is actually opened for: what is
   next, and what is waiting on me.

   Availability is a weekly recurring TEMPLATE, not a list of concrete slots.
   A day can hold several ranges (09–12 and 14–18 is the common shape), and the
   session length plus the buffer decide how the template expands into bookable
   openings. Connecting an external calendar blocks times from the other
   direction — events there make openings disappear here.
   ============================================================================ */

import { useMemo, useState } from 'react'
import { useI18n, fmtDate } from '../i18n'
import { fmtWhen, initials } from './Patients'
import type { AvailabilityDay, WorkspaceState } from './data'

const HOUR = 3_600_000
const DAY = 86_400_000
const START_HOUR = 7
const END_HOUR = 21

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKDAY_INDEX = [1, 2, 3, 4, 5, 6, 0] // grid order → JS getDay()

interface CalendarProps {
  state: WorkspaceState
  update: (fn: (s: WorkspaceState) => WorkspaceState) => void
  onOpenPatient: (id: string) => void
  onCall: (id: string) => void
}

export function Calendar({ state, update, onOpenPatient, onCall }: CalendarProps) {
  const { t } = useI18n()
  const [view, setView] = useState<'week' | 'day'>('week')
  const [offset, setOffset] = useState(0)
  const [availOpen, setAvailOpen] = useState(false)
  const [popover, setPopover] = useState<{ patientId: string; at: number } | null>(null)

  const now = Date.now()
  const monday = useMemo(() => {
    const d = new Date(now + offset * 7 * DAY)
    const back = (d.getDay() + 6) % 7
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - back).getTime()
  }, [now, offset])

  const days = (view === 'week' ? WEEKDAYS : [WEEKDAYS[(new Date(now).getDay() + 6) % 7]]).map((label, i) => ({
    label,
    date: new Date(monday + (view === 'week' ? i : (new Date(now).getDay() + 6) % 7) * DAY),
  }))

  const booked = state.patients
    .filter((p) => p.nextSessionAt)
    .map((p) => ({ patientId: p.id, name: p.name, at: p.nextSessionAt as number }))

  const upcoming = [...booked].filter((b) => b.at >= now).sort((a, b) => a.at - b.at).slice(0, 5)

  const rows: number[] = []
  for (let h = START_HOUR; h < END_HOUR; h += 1) rows.push(h)

  function isAvailable(date: Date, hour: number): boolean {
    const day = state.settings.availability.find((d) => d.weekday === date.getDay())
    if (!day?.enabled) return false
    return day.ranges.some((r) => {
      const from = Number(r.from.split(':')[0])
      const to = Number(r.to.split(':')[0])
      return hour >= from && hour < to
    })
  }

  const nowPct =
    (new Date(now).getHours() - START_HOUR + new Date(now).getMinutes() / 60) / (END_HOUR - START_HOUR)

  return (
    <>
      <div className="w-pagehead">
        <div className="w-pagehead__title">
          <h1 className="w-h1">{t('Calendar')}</h1>
          <div className="w-segmented">
            <button aria-pressed={view === 'week'} onClick={() => setView('week')}>{t('Week')}</button>
            <button aria-pressed={view === 'day'} onClick={() => setView('day')}>{t('Day')}</button>
          </div>
          <div className="w-navarrows">
            <button onClick={() => setOffset((o) => o - 1)} aria-label={t('Previous week')}>‹</button>
            <span className="w-small">
              {fmtDate(monday, { month: 'short', day: 'numeric' })} –{' '}
              {fmtDate(monday + 6 * DAY, { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <button onClick={() => setOffset((o) => o + 1)} aria-label={t('Next week')}>›</button>
          </div>
        </div>
        <button className="w-btn w-btn--ghost" onClick={() => setAvailOpen(true)}>{t('Manage availability')}</button>
      </div>

      <div className="w-callayout">
        <div className="w-grid">
          <div className="w-grid__head">
            <span />
            {days.map((d) => (
              <span key={d.label} className={d.date.toDateString() === new Date().toDateString() ? 'is-today' : ''}>
                <strong>{t(d.label)}</strong>
                <em>{d.date.getDate()}</em>
              </span>
            ))}
          </div>
          <div className="w-grid__body">
            {offset === 0 && nowPct >= 0 && nowPct <= 1 && (
              <div className="w-nowline" style={{ top: `${nowPct * 100}%` }} aria-hidden="true" />
            )}
            {rows.map((h) => (
              <div key={h} className="w-grid__row">
                <span className="w-grid__time">{String(h).padStart(2, '0')}:00</span>
                {days.map((d) => {
                  const cellStart = new Date(d.date.getFullYear(), d.date.getMonth(), d.date.getDate(), h).getTime()
                  const session = booked.find((b) => b.at >= cellStart && b.at < cellStart + HOUR)
                  const free = isAvailable(d.date, h)
                  return (
                    <span key={`${d.label}-${h}`} className={`w-cell${free ? ' is-free' : ''}`}>
                      {session && (
                        <button className="w-block" onClick={() => setPopover({ patientId: session.patientId, at: session.at })}>
                          <strong>{session.name}</strong>
                          <em>{fmtDate(session.at, { hour: '2-digit', minute: '2-digit' })}</em>
                        </button>
                      )}
                    </span>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        <aside className="w-rail">
          <section className="w-sidecard">
            <div className="w-field__label">{t('Upcoming')}</div>
            {!upcoming.length && <p className="w-small">{t('Nothing scheduled.')}</p>}
            <ul className="w-upcoming">
              {upcoming.map((u) => {
                const joinable = Math.abs(u.at - now) <= 15 * 60_000 || (u.at <= now && now < u.at + HOUR)
                return (
                  <li key={u.patientId}>
                    <span className="w-avatar" aria-hidden="true">{initials(u.name)}</span>
                    <span className="w-upcoming__body">
                      <strong>{u.name}</strong>
                      <em className="w-small">{fmtWhen(u.at)}</em>
                    </span>
                    <button className="w-btn w-btn--sm" disabled={!joinable} onClick={() => onCall(u.patientId)} aria-label={t('Start call')}>
                      📹
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="w-sidecard">
            <div className="w-field__label">
              {t('Booking Requests')} {state.requests.length > 0 && <span className="w-count">{state.requests.length}</span>}
            </div>
            {!state.requests.length && <p className="w-small">{t('No pending requests')}</p>}
            <ul className="w-requests">
              {state.requests.map((r) => (
                <li key={r.id}>
                  <strong>{r.patientName}</strong>
                  <span className="w-small">
                    {t('Requested')} {fmtDate(r.slotAt, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="w-small w-muted">{t('Sent')} {fmtDate(r.requestedAt, { month: 'short', day: 'numeric' })}</span>
                  <div className="w-inline">
                    <button
                      className="w-btn w-btn--sm w-btn--primary"
                      onClick={() =>
                        update((s) => ({
                          ...s,
                          requests: s.requests.filter((x) => x.id !== r.id),
                          patients: s.patients.map((p) => (p.id === r.patientId ? { ...p, nextSessionAt: r.slotAt } : p)),
                        }))
                      }
                    >
                      {t('Accept')}
                    </button>
                    <button
                      className="w-btn w-btn--sm"
                      onClick={() => update((s) => ({ ...s, requests: s.requests.filter((x) => x.id !== r.id) }))}
                    >
                      {t('Decline')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      {popover && (
        <div className="w-scrim" onClick={() => setPopover(null)} role="dialog" aria-modal="true">
          <div className="w-modal w-modal--sm" onClick={(e) => e.stopPropagation()}>
            <h2 className="w-h2">{state.patients.find((p) => p.id === popover.patientId)?.name}</h2>
            <p className="w-lead">{fmtWhen(popover.at)}</p>
            <div className="w-actions">
              <button className="w-link" onClick={() => { onOpenPatient(popover.patientId); setPopover(null) }}>
                {t('Open patient card')}
              </button>
              <button
                className="w-btn w-btn--ghost"
                onClick={() =>
                  update((s) => ({
                    ...s,
                    patients: s.patients.map((p) => (p.id === popover.patientId ? { ...p, nextSessionAt: undefined } : p)),
                  }))
                }
              >
                {t('Cancel session')}
              </button>
              <button
                className="w-btn w-btn--primary"
                disabled={Math.abs(popover.at - now) > 15 * 60_000 && !(popover.at <= now && now < popover.at + HOUR)}
                onClick={() => { onCall(popover.patientId); setPopover(null) }}
              >
                {t('Start call')}
              </button>
            </div>
          </div>
        </div>
      )}

      {availOpen && <AvailabilityModal state={state} update={update} onClose={() => setAvailOpen(false)} />}
    </>
  )
}

/* ------------------------------------------------------- TH-CAL-AVAIL --- */

export function AvailabilityModal({
  state,
  update,
  onClose,
}: {
  state: WorkspaceState
  update: CalendarProps['update']
  onClose: () => void
}) {
  const { t } = useI18n()
  const [days, setDays] = useState<AvailabilityDay[]>(state.settings.availability)
  const [minutes, setMinutes] = useState(state.settings.sessionMinutes)
  const [buffer, setBuffer] = useState(state.settings.bufferMinutes)
  const [sync, setSync] = useState(state.settings.calendarSync)

  function patchDay(weekday: number, fn: (d: AvailabilityDay) => AvailabilityDay) {
    setDays((list) => list.map((d) => (d.weekday === weekday ? fn(d) : d)))
  }

  return (
    <div className="w-scrim" onClick={onClose} role="dialog" aria-modal="true">
      <div className="w-modal w-modal--wide" onClick={(e) => e.stopPropagation()}>
        <h2 className="w-h2">{t('Set your availability')}</h2>
        <p className="w-lead">{t('Patients can request sessions during your available hours.')}</p>

        <ul className="w-availlist">
          {WEEKDAY_INDEX.map((weekday, i) => {
            const d = days.find((x) => x.weekday === weekday)
            if (!d) return null
            return (
              <li key={weekday}>
                <label className="w-availday">
                  <input
                    type="checkbox"
                    checked={d.enabled}
                    onChange={() => patchDay(weekday, (x) => ({ ...x, enabled: !x.enabled, ranges: x.enabled ? [] : [{ from: '09:00', to: '17:00' }] }))}
                  />
                  {t(WEEKDAYS[i])}
                </label>
                {!d.enabled ? (
                  <span className="w-small w-muted">{t('Unavailable')}</span>
                ) : (
                  <div className="w-ranges">
                    {d.ranges.map((r, ri) => (
                      <span key={ri} className="w-range">
                        <input
                          className="w-input w-input--sm"
                          type="time"
                          value={r.from}
                          onChange={(e) => patchDay(weekday, (x) => ({ ...x, ranges: x.ranges.map((y, yi) => (yi === ri ? { ...y, from: e.target.value } : y)) }))}
                        />
                        –
                        <input
                          className="w-input w-input--sm"
                          type="time"
                          value={r.to}
                          onChange={(e) => patchDay(weekday, (x) => ({ ...x, ranges: x.ranges.map((y, yi) => (yi === ri ? { ...y, to: e.target.value } : y)) }))}
                        />
                        {d.ranges.length > 1 && (
                          <button className="w-link" onClick={() => patchDay(weekday, (x) => ({ ...x, ranges: x.ranges.filter((_, yi) => yi !== ri) }))}>
                            {t('Remove')}
                          </button>
                        )}
                      </span>
                    ))}
                    <button className="w-link" onClick={() => patchDay(weekday, (x) => ({ ...x, ranges: [...x.ranges, { from: '14:00', to: '18:00' }] }))}>
                      + {t('Add slot')}
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        <div className="w-form">
          <label className="w-field">
            <span className="w-field__label">{t('Default session length')}</span>
            <select className="w-input" value={minutes} onChange={(e) => setMinutes(Number(e.target.value) as typeof minutes)}>
              {[45, 50, 60].map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          </label>
          <label className="w-field">
            <span className="w-field__label">{t('Buffer between sessions')}</span>
            <select className="w-input" value={buffer} onChange={(e) => setBuffer(Number(e.target.value) as typeof buffer)}>
              {[0, 10, 15, 30].map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          </label>
        </div>

        <div className="w-field__label">{t('Calendar sync')}</div>
        <div className="w-inline">
          <button
            className={`w-btn w-btn--ghost${sync.google ? ' is-on' : ''}`}
            onClick={() => setSync((s) => ({ ...s, google: !s.google }))}
          >
            {sync.google ? t('Google Calendar connected') : t('Connect Google Calendar')}
          </button>
          <button
            className={`w-btn w-btn--ghost${sync.outlook ? ' is-on' : ''}`}
            onClick={() => setSync((s) => ({ ...s, outlook: !s.outlook }))}
          >
            {sync.outlook ? t('Outlook connected') : t('Connect Microsoft Outlook')}
          </button>
        </div>
        <p className="w-note">{t('Events in a connected calendar automatically block those times.')}</p>

        <div className="w-actions">
          <button className="w-btn w-btn--ghost" onClick={onClose}>{t('Cancel')}</button>
          <button
            className="w-btn w-btn--primary"
            onClick={() => {
              update((s) => ({
                ...s,
                settings: { ...s.settings, availability: days, sessionMinutes: minutes, bufferMinutes: buffer, calendarSync: sync },
              }))
              onClose()
            }}
          >
            {t('Save')}
          </button>
        </div>
      </div>
    </div>
  )
}
