import { useState } from 'react'
import type { Patient, Goal } from './data'

interface Props {
  patient: Patient
  onCancel: () => void
  onSave: (patch: Partial<Patient>) => void | Promise<void>
}

const STATUSES: Goal['status'][] = ['in-progress', 'achieved', 'review']
const GOAL_STATUS_LABEL: Record<Goal['status'], string> = { 'in-progress': 'in corso', achieved: 'raggiunto', review: 'da rivedere' }

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
  const [consents, setConsents] = useState({ ...patient.consents })
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
      consents,
      goals: goals.filter((g) => g.text.trim()).map((g) => ({ text: g.text.trim(), status: g.status })),
      nextSessionAt: next ? new Date(next).getTime() : patient.nextSessionAt,
    }
    await onSave(patch)
    setBusy(false)
  }

  return (
    <div className="b2b-page">
      <button className="b2b-back" onClick={onCancel}>← Annulla</button>
      <h1 className="b2b-h1">Modifica scheda — {patient.name}</h1>
      <p className="b2b-sub" style={{ marginBottom: 20 }}>Le modifiche vengono salvate nella scheda del paziente.</p>

      <div className="pe-grid">
        <section className="b2b-card">
          <h2 className="b2b-card__title">Anagrafica</h2>
          <label className="pe-field"><span className="pe-label">Nome</span>
            <input className="b2b-input" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <div className="pe-row">
            <label className="pe-field"><span className="pe-label">Età</span>
              <input className="b2b-input" type="number" value={age} onChange={(e) => setAge(e.target.value)} /></label>
            <label className="pe-field pe-field--grow"><span className="pe-label">Motivo della presa in carico</span>
              <input className="b2b-input" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          </div>
        </section>

        <section className="b2b-card">
          <h2 className="b2b-card__title">Dati clinici</h2>
          <label className="pe-field"><span className="pe-label">Condizioni <em>separate da virgola</em></span>
            <input className="b2b-input" value={conditions} onChange={(e) => setConditions(e.target.value)} /></label>
          <label className="pe-field"><span className="pe-label">Farmaci <em>separati da virgola</em></span>
            <input className="b2b-input" value={medications} onChange={(e) => setMedications(e.target.value)} /></label>
          <label className="pe-field"><span className="pe-label">Prescrizione</span>
            <input className="b2b-input" value={prescription} onChange={(e) => setPrescription(e.target.value)} placeholder="es. 3× GL-ANX Quick / settimana" /></label>
        </section>

        <section className="b2b-card">
          <h2 className="b2b-card__title">Obiettivi</h2>
          <ul className="pe-goals">
            {goals.map((g, i) => (
              <li key={i} className="pe-goal">
                <input className="b2b-input" value={g.text} placeholder="Obiettivo" onChange={(e) => setGoal(i, { text: e.target.value })} />
                <select className="pe-select" value={g.status} onChange={(e) => setGoal(i, { status: e.target.value as Goal['status'] })}>
                  {STATUSES.map((s) => <option key={s} value={s}>{GOAL_STATUS_LABEL[s]}</option>)}
                </select>
                <button className="pe-del" onClick={() => setGoals((gs) => gs.filter((_, idx) => idx !== i))} aria-label="Rimuovi obiettivo">✕</button>
              </li>
            ))}
          </ul>
          <button className="pe-add" onClick={() => setGoals((gs) => [...gs, { text: '', status: 'in-progress' }])}>+ Aggiungi obiettivo</button>
        </section>

        <section className="b2b-card">
          <h2 className="b2b-card__title">Prossimo appuntamento</h2>
          <label className="pe-field"><span className="pe-label">Data e ora</span>
            <input className="b2b-input" type="datetime-local" value={next} onChange={(e) => setNext(e.target.value)} /></label>
        </section>

        <section className="b2b-card">
          <h2 className="b2b-card__title">Consensi (LGPD)</h2>
          <p className="b2b-sub" style={{ marginBottom: 10 }}>
            Registrati con il paziente. “Condivisione” apre alla tua vista lo storico delle sue sessioni in autonomia:
            se lo revochi, sparisce subito.
          </p>
          <ul className="pe-consents">
            {([
              ['therapy', 'Trattamento — sessioni monitorate'],
              ['sharing', 'Condivisione — pratica in autonomia visibile al clinico'],
              ['aggregates', 'Dati aggregati — statistiche aziendali anonime'],
            ] as const).map(([key, label]) => (
              <li key={key}>
                <label className="pe-consent">
                  <input
                    type="checkbox"
                    checked={consents[key]}
                    onChange={(e) => setConsents((c) => ({ ...c, [key]: e.target.checked }))}
                  />
                  <span>{label}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>

        <section className="b2b-card pe-card--wide">
          <h2 className="b2b-card__title">Note cliniche <span className="lock">🔒 solo clinico</span></h2>
          <p className="b2b-sub">Le note vivono nel diario clinico della scheda paziente — una voce datata e ricercabile per ogni nota.</p>
        </section>
      </div>

      <div className="pe-actions">
        <button className="b2b-btn b2b-btn--ghost" onClick={onCancel}>Annulla</button>
        <button className="b2b-btn b2b-btn--primary" disabled={busy} onClick={save}>{busy ? 'Salvataggio…' : 'Salva le modifiche'}</button>
      </div>
    </div>
  )
}
