import { useState } from 'react'
import type { Patient, Goal } from './data'

interface Props {
  patient: Patient
  onCancel: () => void
  onSave: (patch: Partial<Patient>) => void | Promise<void>
}

const STATUSES: Goal['status'][] = ['in-progress', 'achieved', 'review']

function splitList(s: string): string[] {
  return s.split(',').map((x) => x.trim()).filter(Boolean)
}
function toLocalInput(ts?: number): string {
  if (!ts) return ''
  const d = new Date(ts - new Date().getTimezoneOffset() * 60000)
  return d.toISOString().slice(0, 16)
}

export function PatientEdit({ patient, onCancel, onSave }: Props) {
  const [name, setName] = useState(patient.name)
  const [age, setAge] = useState(String(patient.age))
  const [reason, setReason] = useState(patient.reason)
  const [conditions, setConditions] = useState(patient.conditions.join(', '))
  const [medications, setMedications] = useState(patient.medications.join(', '))
  const [prescription, setPrescription] = useState(patient.prescription ?? '')
  const [notes, setNotes] = useState(patient.clinicalNotes)
  const [goals, setGoals] = useState<Goal[]>(patient.goals.map((g) => ({ ...g })))
  const [next, setNext] = useState(toLocalInput(patient.nextSessionAt))
  const [busy, setBusy] = useState(false)

  function setGoal(i: number, patch: Partial<Goal>) {
    setGoals((gs) => gs.map((g, idx) => (idx === i ? { ...g, ...patch } : g)))
  }

  async function save() {
    setBusy(true)
    const patch: Partial<Patient> = {
      name: name.trim() || patient.name,
      age: Number(age) || patient.age,
      reason: reason.trim(),
      conditions: splitList(conditions),
      medications: splitList(medications),
      prescription: prescription.trim() || undefined,
      clinicalNotes: notes,
      goals: goals.filter((g) => g.text.trim()).map((g) => ({ text: g.text.trim(), status: g.status })),
      nextSessionAt: next ? new Date(next).getTime() : patient.nextSessionAt,
    }
    await onSave(patch)
    setBusy(false)
  }

  return (
    <div className="b2b-page">
      <button className="b2b-back" onClick={onCancel}>← Cancel</button>
      <h1 className="b2b-h1">Edit record — {patient.name}</h1>
      <p className="b2b-sub" style={{ marginBottom: 20 }}>Changes are saved to the patient's record.</p>

      <div className="pe-grid">
        <section className="b2b-card">
          <h2 className="b2b-card__title">Identity</h2>
          <label className="pe-field"><span className="pe-label">Name</span>
            <input className="b2b-input" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <div className="pe-row">
            <label className="pe-field"><span className="pe-label">Age</span>
              <input className="b2b-input" type="number" value={age} onChange={(e) => setAge(e.target.value)} /></label>
            <label className="pe-field pe-field--grow"><span className="pe-label">Reason for care</span>
              <input className="b2b-input" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          </div>
        </section>

        <section className="b2b-card">
          <h2 className="b2b-card__title">Clinical</h2>
          <label className="pe-field"><span className="pe-label">Conditions <em>comma-separated</em></span>
            <input className="b2b-input" value={conditions} onChange={(e) => setConditions(e.target.value)} /></label>
          <label className="pe-field"><span className="pe-label">Medications <em>comma-separated</em></span>
            <input className="b2b-input" value={medications} onChange={(e) => setMedications(e.target.value)} /></label>
          <label className="pe-field"><span className="pe-label">Prescription</span>
            <input className="b2b-input" value={prescription} onChange={(e) => setPrescription(e.target.value)} placeholder="e.g. 3× GL-ANX Quick / week" /></label>
        </section>

        <section className="b2b-card">
          <h2 className="b2b-card__title">Goals</h2>
          <ul className="pe-goals">
            {goals.map((g, i) => (
              <li key={i} className="pe-goal">
                <input className="b2b-input" value={g.text} placeholder="Goal" onChange={(e) => setGoal(i, { text: e.target.value })} />
                <select className="pe-select" value={g.status} onChange={(e) => setGoal(i, { status: e.target.value as Goal['status'] })}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace('-', ' ')}</option>)}
                </select>
                <button className="pe-del" onClick={() => setGoals((gs) => gs.filter((_, idx) => idx !== i))} aria-label="Remove goal">✕</button>
              </li>
            ))}
          </ul>
          <button className="pe-add" onClick={() => setGoals((gs) => [...gs, { text: '', status: 'in-progress' }])}>+ Add goal</button>
        </section>

        <section className="b2b-card">
          <h2 className="b2b-card__title">Next appointment</h2>
          <label className="pe-field"><span className="pe-label">Date &amp; time</span>
            <input className="b2b-input" type="datetime-local" value={next} onChange={(e) => setNext(e.target.value)} /></label>
        </section>

        <section className="b2b-card pe-card--wide">
          <h2 className="b2b-card__title">Clinical notes <span className="lock">🔒 therapist only</span></h2>
          <textarea className="pe-notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </section>
      </div>

      <div className="pe-actions">
        <button className="b2b-btn b2b-btn--ghost" onClick={onCancel}>Cancel</button>
        <button className="b2b-btn b2b-btn--primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</button>
      </div>
    </div>
  )
}
