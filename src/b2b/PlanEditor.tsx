/* ============================================================================
   Good Loop — the three-month pathway, written by the therapist

   The app no longer composes a pathway from a questionnaire. This is where the
   real one is written, normally in the first session: week by week, which
   session and how long, with an optional line addressed to the patient. It is
   what the person's home screen then follows, one session at a time.

   Only clinical catalog entries can be put in a pathway — the self-service
   library is deliberately not offered here.
   ============================================================================ */

import { useEffect, useMemo, useState } from 'react'
import { useDataProvider } from '../data/provider'
import { useProtocols } from '../admin/hooks'
import { clinicalEntries } from '../data/catalog'
import { byWeek, repositioned, skeletonPlan, PLAN_WEEKS, type Plan, type PlanItem } from '../data/plan'
import type { Duration } from '../types/domain'

const DURATIONS: Duration[] = [6, 12, 24]

function fmtDone(ms: number): string {
  return new Date(ms).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
}

export function PlanEditor({ patientId, patientName }: { patientId: string; patientName: string }) {
  const dp = useDataProvider()
  const { data: catalog = [] } = useProtocols()
  const clinical = useMemo(() => clinicalEntries(catalog), [catalog])

  const [plan, setPlan] = useState<Plan | null>(null)
  const [items, setItems] = useState<PlanItem[]>([])
  const [title, setTitle] = useState('')
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let alive = true
    void dp.getPlan(patientId).then((p) => {
      if (!alive) return
      setPlan(p)
      setItems(p?.items ?? [])
      setTitle(p?.title ?? '')
      setDirty(false)
    }).catch(() => undefined)
    return () => { alive = false }
  }, [dp, patientId])

  function patch(id: string, p: Partial<PlanItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...p } : i)))
    setDirty(true)
  }

  function addAfter(index: number) {
    const base = items[index]
    const item: PlanItem = {
      id: `new-${Date.now()}`,
      position: index + 1,
      protocolCode: base?.protocolCode ?? clinical[0]?.code ?? 'GL-ANX 1.1',
      duration: base?.duration ?? 12,
      week: base?.week ?? 1,
    }
    setItems((prev) => repositioned([...prev.slice(0, index + 1), item, ...prev.slice(index + 1)]))
    setDirty(true)
  }

  function remove(id: string) {
    setItems((prev) => repositioned(prev.filter((i) => i.id !== id)))
    setDirty(true)
  }

  function move(index: number, by: -1 | 1) {
    const to = index + by
    if (to < 0 || to >= items.length) return
    const next = [...items]
    const [it] = next.splice(index, 1)
    next.splice(to, 0, it)
    setItems(repositioned(next))
    setDirty(true)
  }

  function startSkeleton() {
    const entry = clinical[0]?.code ?? 'GL-ANX 1.1'
    setItems(skeletonPlan(entry, 12))
    setDirty(true)
    setMsg(`Bozza di ${PLAN_WEEKS} settimane: una sessione a settimana su ${entry}. Cambia protocolli, durate e note — è il tuo percorso, non quello dell’app.`)
  }

  async function save() {
    setBusy(true)
    setMsg(null)
    try {
      await dp.savePlan(patientId, items, title.trim() || undefined)
      const fresh = await dp.getPlan(patientId)
      setPlan(fresh)
      setItems(fresh?.items ?? [])
      setDirty(false)
      setMsg(`Percorso salvato — ${patientName.split(' ')[0]} vedrà la prossima sessione nella sua app.`)
    } catch (e) {
      setMsg(`Salvataggio non riuscito: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const done = items.filter((i) => i.doneAt).length
  const weeks = byWeek({ patientId, items, updatedAt: 0 })

  return (
    <section className="b2b-card b2b-card--wide">
      <div className="plan-head">
        <div>
          <h2 className="b2b-card__title">Percorso di tre mesi</h2>
          <p className="b2b-sub">
            {items.length
              ? `${items.length} session${items.length === 1 ? 'e' : 'i'} · ${done} completate · ${weeks.length} settiman${weeks.length === 1 ? 'a' : 'e'}`
              : 'Nessun percorso ancora. Lo scrivi tu — l’app non ne genera uno.'}
          </p>
        </div>
        <div className="plan-head__cta">
          {!open && <button className="b2b-btn b2b-btn--ghost" onClick={() => setOpen(true)}>{items.length ? 'Modifica percorso' : 'Scrivi il percorso'}</button>}
          {open && dirty && <button className="b2b-btn b2b-btn--primary" disabled={busy} onClick={() => void save()}>{busy ? 'Salvataggio…' : 'Salva percorso'}</button>}
          {open && <button className="b2b-btn b2b-btn--ghost" onClick={() => { setOpen(false); setItems(plan?.items ?? []); setTitle(plan?.title ?? ''); setDirty(false) }}>Chiudi</button>}
        </div>
      </div>

      {msg && <p className="adm-plain__status">{msg}</p>}

      {!open && items.length > 0 && (
        <ul className="plan-preview">
          {weeks.slice(0, 4).map((w) => (
            <li key={w.week}>
              <strong>Sett. {w.week}</strong>
              <span>{w.items.map((i) => `${catalog.find((c) => c.code === i.protocolCode)?.title ?? i.protocolCode} · ${i.duration}′`).join(' · ')}</span>
            </li>
          ))}
          {weeks.length > 4 && <li className="b2b-sub">…e altre {weeks.length - 4} settimane</li>}
        </ul>
      )}

      {open && (
        <>
          <label className="pe-field">
            <span className="pe-label">Titolo del percorso <em>solo per te</em></span>
            <input className="b2b-input" value={title} placeholder="es. Percorso di tre mesi — ansia" onChange={(e) => { setTitle(e.target.value); setDirty(true) }} />
          </label>

          {items.length === 0 && (
            <div className="plan-empty">
              <p className="b2b-sub">Parti da una bozza di {PLAN_WEEKS} settimane e modificala, oppure aggiungi le sessioni una a una.</p>
              <button className="b2b-btn b2b-btn--ghost" onClick={startSkeleton}>Bozza di {PLAN_WEEKS} settimane</button>
              <button className="b2b-btn b2b-btn--ghost" onClick={() => addAfter(-1)}>+ Sessione</button>
            </div>
          )}

          {items.length > 0 && (
            <div className="plan-rows">
              {items.map((i, n) => (
                <div className={`plan-row${i.doneAt ? ' is-done' : ''}`} key={i.id}>
                  <div className="plan-row__week">
                    <span className="pe-label">Sett.</span>
                    <input
                      className="b2b-input plan-row__weeknum"
                      type="number" min={1} max={52} value={i.week}
                      onChange={(e) => patch(i.id, { week: Math.max(1, Number(e.target.value) || 1) })}
                    />
                  </div>
                  <select className="b2b-input" value={i.protocolCode} onChange={(e) => patch(i.id, { protocolCode: e.target.value })}>
                    {clinical.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.title}</option>)}
                    {!clinical.some((c) => c.code === i.protocolCode) && <option value={i.protocolCode}>{i.protocolCode}</option>}
                  </select>
                  <select className="b2b-input plan-row__dur" value={i.duration} onChange={(e) => patch(i.id, { duration: Number(e.target.value) as Duration })}>
                    {DURATIONS.map((d) => <option key={d} value={d}>{d} min</option>)}
                  </select>
                  <input
                    className="b2b-input"
                    value={i.note ?? ''}
                    placeholder="Nota per il paziente (facoltativa)"
                    onChange={(e) => patch(i.id, { note: e.target.value || undefined })}
                  />
                  <div className="plan-row__ops">
                    {i.doneAt
                      ? <span className="adm-pill adm-pill--ok" title="Completata dal paziente">✓ {fmtDone(i.doneAt)}</span>
                      : <span className="b2b-sub">—</span>}
                    <button className="adm-editbtn" title="Su" onClick={() => move(n, -1)} disabled={n === 0}>↑</button>
                    <button className="adm-editbtn" title="Giù" onClick={() => move(n, 1)} disabled={n === items.length - 1}>↓</button>
                    <button className="adm-editbtn" title="Aggiungi sotto" onClick={() => addAfter(n)}>＋</button>
                    <button className="adm-del" title="Rimuovi" onClick={() => remove(i.id)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="b2b-sub" style={{ marginTop: 10 }}>
            Il paziente vede una sessione alla volta, nell’ordine qui sopra, con la tua nota.
            Gli audio della libreria (uso libero) non entrano nel percorso: restano una scelta del paziente e ti arrivano comunque nello storico.
          </p>
        </>
      )}
    </section>
  )
}
