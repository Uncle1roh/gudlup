/* ============================================================================
   Good Loop — companies (admin console)

   Creating a company creates the way INTO it. The row used to be minted with
   an id like `c-mf3x9k2`, and that id is the column an employee's profile
   points at — so the company code a person was asked for at registration was
   a timestamp in base 36 that nothing in the app could resolve or an HR admin
   could read down a phone line.

   The id is the CODE now, minted in the one canonical shape
   (`data/convention.ts`). One string does all three jobs: it identifies the
   company row, it is what HR registers with to open the company panel, and it
   is what an employee types to be linked to their employer.
   ============================================================================ */

import { useState } from 'react'
import { useDataProvider } from '../data/provider'
import { useCompanies } from './hooks'
import { fmtDate } from '../b2b/data'
import { generateCompanyCode, looksLikeCompanyCode, normalizeCode } from '../data/convention'
import type { Company } from './types'

export function Companies({ actor }: { actor: string }) {
  const dp = useDataProvider()
  const { data, loading, refetch } = useCompanies()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [seats, setSeats] = useState('100')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [made, setMade] = useState<Company | null>(null)
  const [copied, setCopied] = useState(false)

  /* Minted from the name as it is typed, and editable: two companies whose
     names start with the same word would otherwise be handed codes that differ
     only in a checksum pair, and the admin is the person who should decide. */
  const suggested = name.trim() ? generateCompanyCode(name) : ''
  const finalCode = normalizeCode(code || suggested)
  const codeTaken = (data ?? []).some((c) => c.id === finalCode)
  const codeBad = !!finalCode && !looksLikeCompanyCode(finalCode)

  async function create() {
    const n = name.trim()
    if (!n || !finalCode || codeTaken || codeBad) return
    const company: Company = {
      // the id IS the code: one string identifies the company, opens the
      // company panel for its HR admin, and links an employee's account
      id: finalCode,
      name: n,
      seats: Math.max(1, parseInt(seats, 10) || 0),
      activeUsers: 0,
      status: 'active',
      createdAt: Date.now(),
    }
    setBusy(true)
    await dp.saveCompany(company)
    await dp.logAudit({ actor, action: 'company.created', target: company.name, detail: `${company.id} · ${company.seats} postazioni` })
    setBusy(false)
    setName(''); setSeats('100'); setCode(''); setAdding(false)
    setMade(company)
    refetch()
  }

  function copy(value: string) {
    navigator.clipboard?.writeText(value).then(
      () => { setCopied(true); window.setTimeout(() => setCopied(false), 1600) },
      () => { /* clipboard blocked — the code is selectable on screen */ },
    )
  }

  async function toggleStatus(c: Company) {
    const next: Company = { ...c, status: c.status === 'active' ? 'paused' : 'active' }
    await dp.saveCompany(next)
    await dp.logAudit({ actor, action: next.status === 'paused' ? 'company.paused' : 'company.resumed', target: c.name })
    refetch()
  }

  const companies = data ?? []

  return (
    <div className="adm-page">
      <header className="adm-page__head adm-page__head--row">
        <div>
          <h1 className="b2b-h1">Aziende</h1>
          <p className="b2b-sub">Le aziende su cui la piattaforma è attivata. {companies.length} in totale.</p>
        </div>
        <button className="b2b-btn b2b-btn--primary" onClick={() => setAdding((v) => !v)}>{adding ? 'Annulla' : '+ Nuova azienda'}</button>
      </header>

      {adding && (
        <>
          <div className="adm-addrow">
            <input className="b2b-input" placeholder="Nome azienda" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <input
              className="b2b-input adm-addrow__code"
              placeholder={suggested || 'CODICE-2026-XX'}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <input className="b2b-input adm-addrow__seats" type="number" min={1} placeholder="Postazioni" value={seats} onChange={(e) => setSeats(e.target.value)} />
            <button className="b2b-btn b2b-btn--primary" disabled={busy || !name.trim() || !finalCode || codeTaken || codeBad} onClick={create}>Crea</button>
          </div>
          <p className="b2b-sub">
            Il <b>codice azienda</b> è anche l’accesso: con questo codice l’HR si registra su <code>#hr</code> e apre
            il pannello aziendale, e i dipendenti lo inseriscono alla registrazione per essere collegati.
            {finalCode && !codeTaken && !codeBad && <> Sarà <b>{finalCode}</b>.</>}
            {codeTaken && <span className="pe-err"> {finalCode} è già di un’altra azienda.</span>}
            {codeBad && <span className="pe-err"> Forma non valida: serve NOME-ANNO-XX.</span>}
          </p>
        </>
      )}

      {made && (
        <div className="adm-made">
          <div>
            <b>{made.name}</b> creata. Codice azienda:{' '}
            <span className="adm-code">{made.id}</span>
          </div>
          <div className="adm-made__acts">
            <button className="b2b-btn b2b-btn--ghost" onClick={() => copy(made.id)}>{copied ? 'Copiato' : 'Copia'}</button>
            <button className="b2b-btn b2b-btn--ghost" onClick={() => setMade(null)}>Chiudi</button>
          </div>
        </div>
      )}

      {loading && <p className="b2b-sub">Caricamento…</p>}

      {!loading && (
        <div className="adm-table adm-table--companies">
          <div className="adm-tr adm-tr--head">
            <div>Azienda</div><div>Codice / accesso</div><div>Postazioni usate</div><div>Creata</div><div>Stato</div><div className="adm-tr__right">Azione</div>
          </div>
          {companies.map((c) => {
            const pct = c.seats ? Math.min(100, Math.round((c.activeUsers / c.seats) * 100)) : 0
            return (
              <div className="adm-tr" key={c.id}>
                <div><b>{c.name}</b></div>
                <div>
                  <button className="adm-code adm-code--btn" title="Copia il codice" onClick={() => copy(c.id)}>{c.id}</button>
                </div>
                <div>
                  <div className="adm-seats">{c.activeUsers} / {c.seats}</div>
                  <div className="adm-bar"><span style={{ width: `${pct}%` }} /></div>
                </div>
                <div>{fmtDate(c.createdAt)}</div>
                <div>{c.status === 'active' ? <span className="adm-pill adm-pill--ok">Attiva</span> : <span className="adm-pill adm-pill--warn">In pausa</span>}</div>
                <div className="adm-tr__right">
                  <button className="b2b-btn b2b-btn--ghost" onClick={() => toggleStatus(c)}>{c.status === 'active' ? 'Sospendi' : 'Riattiva'}</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
