/* The therapist's agenda (PO spec): inside their own area they mark the
   weekly hours they are available — exactly the hours patients see when
   booking — and see the appointments patients have made. The 5-minute
   pre-session notice lives in TherapistApp (banner above the roster). */

import { useEffect, useState } from 'react'
import { useDataProvider } from '../data/provider'
import { fmtDay, fmtTime, slotKey, type Appointment } from '../data/scheduling'

const WEEKDAYS = [
  { d: 1, label: 'Lun' }, { d: 2, label: 'Mar' }, { d: 3, label: 'Mer' },
  { d: 4, label: 'Gio' }, { d: 5, label: 'Ven' }, { d: 6, label: 'Sab' }, { d: 0, label: 'Dom' },
]
const HOURS = Array.from({ length: 13 }, (_, i) => `${String(7 + i).padStart(2, '0')}:00`) // 07:00–19:00

interface AgendaProps {
  onBack: () => void
}

export function Agenda({ onBack }: AgendaProps) {
  const dp = useDataProvider()
  const [slots, setSlots] = useState<Set<string>>(new Set())
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void Promise.all([dp.getMyAvailability(), dp.listMyAppointments()])
      .then(([avail, appts]) => {
        if (!alive) return
        setSlots(new Set(avail.map(slotKey)))
        setAppointments(appts)
        setLoaded(true)
      })
      .catch((e) => { if (alive) { setError((e as Error).message); setLoaded(true) } })
    return () => { alive = false }
  }, [dp])

  async function toggle(weekday: number, hhmm: string) {
    const key = `${weekday}|${hhmm}`
    const next = new Set(slots)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSlots(next)
    setSaving(true)
    setError(null)
    try {
      await dp.setMyAvailability([...next].map((k) => {
        const [d, h] = k.split('|')
        return { weekday: parseInt(d, 10), hhmm: h }
      }))
      setSavedAt(Date.now())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="b2b-screen agenda">
      <div className="b2b-screen__head">
        <button className="b2b-btn b2b-btn--ghost" onClick={onBack}>← Indietro</button>
        <h1 className="b2b-h1">La mia agenda</h1>
        <span className="b2b-sub">{saving ? 'Salvataggio…' : savedAt ? 'Salvato ✓' : ''}</span>
      </div>
      <p className="b2b-sub">
        Segna le ore in cui sei disponibile ogni settimana — sono esattamente gli orari che i pazienti possono prenotare.
        Le sedute prenotate compaiono qui sotto e non tornano più disponibili per altri.
      </p>
      {error && <div className="adm-plain__status adm-plain__status--err">{error}</div>}

      {loaded && (
        <div className="agenda__grid" role="grid">
          <div className="agenda__corner" />
          {WEEKDAYS.map((w) => <div key={w.d} className="agenda__col">{w.label}</div>)}
          {HOURS.map((h) => (
            <div key={h} className="agenda__row" style={{ display: 'contents' }}>
              <div className="agenda__hour">{h}</div>
              {WEEKDAYS.map((w) => {
                const on = slots.has(`${w.d}|${h}`)
                return (
                  <button
                    key={`${w.d}|${h}`}
                    className={`agenda__cell${on ? ' is-on' : ''}`}
                    onClick={() => void toggle(w.d, h)}
                    title={`${w.label} ${h}${on ? ' — disponibile' : ''}`}
                    aria-pressed={on}
                  />
                )
              })}
            </div>
          ))}
        </div>
      )}

      <h2 className="b2b-h2" style={{ marginTop: 26 }}>Prossime sedute ({appointments.length})</h2>
      {appointments.length === 0 && <p className="b2b-sub">Nessuna prenotazione — appena un paziente prenota una delle tue ore, comparirà qui.</p>}
      <div className="agenda__appts">
        {appointments.map((a) => (
          <div key={a.id} className="agenda__appt">
            <span className="agenda__appt-when">{fmtDay(a.startsAtMs)} · {fmtTime(a.startsAtMs)}</span>
            <span className="agenda__appt-who">{a.patientName}</span>
            <span className="b2b-sub">{a.durationMin} min</span>
          </div>
        ))}
      </div>
    </div>
  )
}
