import { useMemo, useState } from 'react'
import { useDataProvider } from '../data/provider'
import { fmtDateTime, type ClinicalNote } from './data'

interface Props {
  patientId: string
  notes: ClinicalNote[]
  /** Refetch the patient after a write. */
  onChanged: () => void
}

/**
 * The clinical diary: every note is its own dated entry, searchable, editable
 * and removable. Replaces the single free-text field — a therapist writes many
 * notes per patient over time and needs to find them again.
 */
export function PatientNotes({ patientId, notes, onChanged }: Props) {
  const dp = useDataProvider()
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [busy, setBusy] = useState(false)

  const found = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = [...notes].sort((a, b) => b.at - a.at)
    return q ? list.filter((n) => n.text.toLowerCase().includes(q)) : list
  }, [notes, query])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
      onChanged()
    } catch (e) {
      window.alert(`Impossibile salvare la nota: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  function add() {
    const text = draft.trim()
    if (!text) return
    void run(async () => {
      await dp.addPatientNote(patientId, text)
      setDraft('')
    })
  }

  function saveEdit(id: string) {
    const text = editText.trim()
    if (!text) return
    void run(async () => {
      await dp.updatePatientNote(patientId, id, text)
      setEditingId(null)
    })
  }

  function remove(n: ClinicalNote) {
    if (!window.confirm('Eliminare questa nota? L’operazione non è reversibile.')) return
    void run(() => dp.deletePatientNote(patientId, n.id))
  }

  return (
    <section className="b2b-card diary">
      <h2 className="b2b-card__title">
        Diario clinico <span className="lock">🔒 solo clinico</span>
        <span className="diary__count">{notes.length} not{notes.length !== 1 ? 'e' : 'a'}</span>
      </h2>

      <div className="diary__compose">
        <textarea
          className="b2b-textarea"
          rows={2}
          placeholder="Scrivi una nota…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) add() }}
        />
        <button className="b2b-btn b2b-btn--primary" disabled={busy || !draft.trim()} onClick={add}>Aggiungi nota</button>
      </div>

      <input
        className="b2b-input diary__search"
        placeholder="Cerca nelle note…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <ul className="diary__list">
        {found.length === 0 && (
          <li className="b2b-sub">{notes.length ? 'Nessuna nota corrisponde alla ricerca.' : 'Ancora nessuna nota.'}</li>
        )}
        {found.map((n) => (
          <li key={n.id} className="diary__item">
            <div className="diary__meta">
              <span className="diary__date">{fmtDateTime(n.at)}</span>
              {n.editedAt && <span className="diary__edited">modificata {fmtDateTime(n.editedAt)}</span>}
              <span className="diary__actions">
                {editingId === n.id ? (
                  <>
                    <button className="diary__act" disabled={busy} onClick={() => saveEdit(n.id)}>Salva</button>
                    <button className="diary__act" onClick={() => setEditingId(null)}>Annulla</button>
                  </>
                ) : (
                  <>
                    <button className="diary__act" onClick={() => { setEditingId(n.id); setEditText(n.text) }}>Modifica</button>
                    <button className="diary__act diary__act--del" onClick={() => remove(n)}>Elimina</button>
                  </>
                )}
              </span>
            </div>
            {editingId === n.id ? (
              <textarea className="b2b-textarea" rows={3} value={editText} onChange={(e) => setEditText(e.target.value)} />
            ) : (
              <p className="diary__text">{n.text}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
