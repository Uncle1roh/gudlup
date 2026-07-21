import { useMemo, useState } from 'react'
import { tr } from '../i18n'
import { relWhen, type Patient } from './data'
import { usePatients, useSessionRequests } from '../data/hooks'
import { useDataProvider } from '../data/provider'
import { Loading } from '../components/Loading'

interface RosterProps {
  onOpenPatient: (id: string) => void
}

type SortKey = 'next' | 'last' | 'urgency' | 'az'
type Filter = 'all' | 'today' | 'assessment' | 'alerts' | 'inactive'

function TrendArrow({ trend }: { trend: Patient['vasTrend'] }) {
  const map = { up: ['↗', 'trend-up'], down: ['↘', 'trend-down'], stable: ['→', 'trend-flat'] } as const
  const [glyph, cls] = map[trend]
  return <span className={`trend ${cls}`} title={`VAS trend ${trend}`}>{glyph}</span>
}

function urgencyScore(p: Patient): number {
  let s = 0
  if (p.nextSessionAt && p.nextSessionAt - Date.now() < 4 * 3_600_000) s += 3
  if (p.assessmentDue && p.assessmentDue.includes('T')) s += 2
  if ((p.b2cInactiveDays ?? 0) > 7) s += 2
  if (p.unread > 0) s += 1
  if (p.vasTrend === 'down') s += 2
  return s
}

export function Roster({ onOpenPatient }: RosterProps) {
  const dp = useDataProvider()
  const { data: patients = [], loading, refetch } = usePatients()
  const { data: requests = [], refetch: refetchRequests } = useSessionRequests()
  const [accepting, setAccepting] = useState<string | null>(null)

  async function accept(id: string) {
    setAccepting(id)
    try {
      const patientId = await dp.acceptSessionRequest(id)
      refetch(); refetchRequests()
      onOpenPatient(patientId)
    } catch (e) {
      window.alert((e as Error).message)
      refetchRequests()
    } finally {
      setAccepting(null)
    }
  }
  const [creating, setCreating] = useState(false)

  async function newPatient() {
    const name = window.prompt('Patient name')?.trim()
    if (!name) return
    setCreating(true)
    try {
      const id = await dp.createPatient(name)
      refetch()
      onOpenPatient(id)
    } catch (e) {
      window.alert(`Couldn't create the patient: ${(e as Error).message}`)
    } finally {
      setCreating(false)
    }
  }
  const [sort, setSort] = useState<SortKey>('next')
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')

  const rows = useMemo(() => {
    let list = [...patients]
    if (q.trim()) list = list.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
    switch (filter) {
      case 'today':
        list = list.filter((p) => p.nextSessionAt && p.nextSessionAt - Date.now() < 24 * 3_600_000)
        break
      case 'assessment':
        list = list.filter((p) => p.assessmentDue && p.assessmentDue.includes('T'))
        break
      case 'alerts':
        list = list.filter((p) => urgencyScore(p) >= 3)
        break
      case 'inactive':
        list = list.filter((p) => (p.b2cInactiveDays ?? 0) > 7)
        break
    }
    list.sort((a, b) => {
      switch (sort) {
        case 'next':
          return (a.nextSessionAt ?? Infinity) - (b.nextSessionAt ?? Infinity)
        case 'last':
          return (b.lastSessionAt ?? 0) - (a.lastSessionAt ?? 0)
        case 'urgency':
          return urgencyScore(b) - urgencyScore(a)
        case 'az':
          return a.name.localeCompare(b.name)
      }
    })
    return list
  }, [patients, sort, filter, q])

  const FILTERS: [Filter, string][] = [
    ['all', 'All'],
    ['today', 'Session today'],
    ['assessment', 'Assessment due'],
    ['alerts', 'Active alerts'],
    ['inactive', 'Inactive >7d'],
  ]

  return (
    <div className="b2b-page">
      <div className="b2b-page__head">
        <div>
          <h1 className="b2b-h1">{tr('Your patients')}</h1>
          <p className="b2b-sub">{patients.length} active · sorted by {sort === 'az' ? 'name' : sort + ' session'}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input className="b2b-search" placeholder={tr('Search by name…')} value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="b2b-btn b2b-btn--primary" onClick={newPatient} disabled={creating}>
            {creating ? tr('Creating…') : tr('＋ New patient')}
          </button>
        </div>
      </div>

      {requests.length > 0 && (
        <section className="req-queue">
          <h2 className="req-queue__title">{tr('Session requests')} <span className="req-queue__count">{requests.length}</span></h2>
          <p className="b2b-sub" style={{ marginBottom: 10 }}>{tr('Employees asking for a session from the app. Accepting creates the linked patient record.')}</p>
          {requests.map((r) => (
            <div key={r.id} className="req-queue__row">
              <span className="req-queue__who">
                <strong>{r.requesterName}</strong>
                <span className="b2b-sub">{[r.company, r.requesterEmail, relWhen(r.createdAt)].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="b2b-sub req-queue__note">{r.note ?? '—'}</span>
              <button className="b2b-btn b2b-btn--primary" disabled={accepting === r.id} onClick={() => accept(r.id)}>
                {accepting === r.id ? tr('Accepting…') : tr('Accept')}
              </button>
            </div>
          ))}
        </section>
      )}

      <div className="b2b-filterbar">
        {FILTERS.map(([id, label]) => (
          <button key={id} className={`b2b-chip${filter === id ? ' is-on' : ''}`} onClick={() => setFilter(id)}>{label}</button>
        ))}
        <div className="b2b-sort">
          <span className="b2b-sub">{tr('Sort')}</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="next">{tr('Next session')}</option>
            <option value="last">{tr('Last session')}</option>
            <option value="urgency">{tr('Clinical urgency')}</option>
            <option value="az">A–Z</option>
          </select>
        </div>
      </div>

      <div className="roster">
        <div className="roster__head">
          <span>{tr('Patient')}</span><span>{tr('Last')}</span><span>{tr('Next')}</span><span>{tr('VAS')}</span><span>{tr('Flags')}</span><span></span>
        </div>
        {rows.map((p) => {
          const urgent = urgencyScore(p) >= 3
          return (
            <button key={p.id} className={`roster__row${urgent ? ' is-urgent' : ''}`} onClick={() => onOpenPatient(p.id)}>
              <span className="roster__name">
                <span className="roster__avatar">{p.sex === 'F' ? '🧑🏻' : '🧑🏽'}</span>
                <span>
                  <strong>{p.name}</strong>
                  <span className="b2b-sub">{p.age} · {p.reason}</span>
                </span>
              </span>
              <span className="b2b-sub">{p.lastSessionAt ? relWhen(p.lastSessionAt) : '—'}</span>
              <span className={p.nextSessionAt && p.nextSessionAt - Date.now() < 4 * 3_600_000 ? 'roster__next-soon' : ''}>
                {p.nextSessionAt ? relWhen(p.nextSessionAt) : '—'}
              </span>
              <span><TrendArrow trend={p.vasTrend} /></span>
              <span className="roster__flags">
                {p.assessmentDue?.includes('T') && <span className="flag flag--due" title={tr('Assessment due')}>⏱ {p.assessmentDue}</span>}
                {(p.b2cInactiveDays ?? 0) > 7 && <span className="flag flag--warn" title={tr('Inactive in B2C')}>💤 {p.b2cInactiveDays}d</span>}
                {p.unread > 0 && <span className="flag flag--msg" title={tr('Unread messages')}>✉ {p.unread}</span>}
              </span>
              <span className="roster__chev">›</span>
            </button>
          )
        })}
        {loading && <div style={{ padding: 20 }}><Loading label="Loading caseload…" /></div>}
        {!loading && rows.length === 0 && <p className="b2b-sub" style={{ padding: 20 }}>{tr('No patients match this filter.')}</p>}
      </div>
    </div>
  )
}
