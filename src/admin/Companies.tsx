import { useState } from 'react'
import { useDataProvider } from '../data/provider'
import { useCompanies } from './hooks'
import { fmtDate } from '../b2b/data'
import type { Company } from './types'

export function Companies({ actor }: { actor: string }) {
  const dp = useDataProvider()
  const { data, loading, refetch } = useCompanies()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [seats, setSeats] = useState('100')
  const [busy, setBusy] = useState(false)

  async function create() {
    const n = name.trim()
    if (!n) return
    const company: Company = {
      id: `c-${Date.now().toString(36)}`,
      name: n,
      seats: Math.max(1, parseInt(seats, 10) || 0),
      activeUsers: 0,
      status: 'active',
      createdAt: Date.now(),
    }
    setBusy(true)
    await dp.saveCompany(company)
    await dp.logAudit({ actor, action: 'company.created', target: company.name, detail: `${company.seats} seats` })
    setBusy(false)
    setName(''); setSeats('100'); setAdding(false)
    refetch()
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
          <h1 className="b2b-h1">Companies</h1>
          <p className="b2b-sub">The corporate tenants the platform is rolled out to. {companies.length} total.</p>
        </div>
        <button className="b2b-btn b2b-btn--primary" onClick={() => setAdding((v) => !v)}>{adding ? 'Cancel' : '+ New company'}</button>
      </header>

      {adding && (
        <div className="adm-addrow">
          <input className="b2b-input" placeholder="Company name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <input className="b2b-input adm-addrow__seats" type="number" min={1} placeholder="Seats" value={seats} onChange={(e) => setSeats(e.target.value)} />
          <button className="b2b-btn b2b-btn--primary" disabled={busy || !name.trim()} onClick={create}>Create</button>
        </div>
      )}

      {loading && <p className="b2b-sub">Loading…</p>}

      {!loading && (
        <div className="adm-table adm-table--companies">
          <div className="adm-tr adm-tr--head">
            <div>Company</div><div>Seats used</div><div>Created</div><div>Status</div><div className="adm-tr__right">Action</div>
          </div>
          {companies.map((c) => {
            const pct = c.seats ? Math.min(100, Math.round((c.activeUsers / c.seats) * 100)) : 0
            return (
              <div className="adm-tr" key={c.id}>
                <div><b>{c.name}</b></div>
                <div>
                  <div className="adm-seats">{c.activeUsers} / {c.seats}</div>
                  <div className="adm-bar"><span style={{ width: `${pct}%` }} /></div>
                </div>
                <div>{fmtDate(c.createdAt)}</div>
                <div>{c.status === 'active' ? <span className="adm-pill adm-pill--ok">Active</span> : <span className="adm-pill adm-pill--warn">Paused</span>}</div>
                <div className="adm-tr__right">
                  <button className="b2b-btn b2b-btn--ghost" onClick={() => toggleStatus(c)}>{c.status === 'active' ? 'Pause' : 'Resume'}</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
