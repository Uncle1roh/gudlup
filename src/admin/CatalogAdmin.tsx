import { useState } from 'react'
import { useDataProvider } from '../data/provider'
import { useProtocols } from './hooks'
import { FAMILY_LABEL } from '../compose/types'
import { ImportProtocol } from './ImportProtocol'
import type { CatalogProtocol } from '../data/catalog'

function tenantsLabel(p: CatalogProtocol): string {
  return p.tenants === 'all' ? 'All companies' : `${p.tenants.length} compan${p.tenants.length === 1 ? 'y' : 'ies'}`
}

export function CatalogAdmin({ actor }: { actor: string }) {
  const dp = useDataProvider()
  const { data, loading, refetch } = useProtocols()
  const [view, setView] = useState<'list' | 'import'>('list')
  const [busyCode, setBusyCode] = useState<string | null>(null)

  async function toggle(p: CatalogProtocol) {
    setBusyCode(p.code)
    await dp.setProtocolEnabled(p.code, !p.enabled)
    await dp.logAudit({ actor, action: p.enabled ? 'protocol.disabled' : 'protocol.enabled', target: p.code })
    setBusyCode(null)
    refetch()
  }

  if (view === 'import') {
    return <ImportProtocol actor={actor} onBack={() => { setView('list'); refetch() }} />
  }

  const protocols = data ?? []

  return (
    <div className="adm-page">
      <header className="adm-page__head adm-page__head--row">
        <div>
          <h1 className="b2b-h1">Protocol catalog</h1>
          <p className="b2b-sub">The single shared catalog every company draws from. {protocols.length} protocol{protocols.length === 1 ? '' : 's'}.</p>
        </div>
        <button className="b2b-btn b2b-btn--primary" onClick={() => setView('import')}>
          + Import protocol (PDF / Excel)
        </button>
      </header>

      {loading && <p className="b2b-sub">Loading catalog…</p>}

      {!loading && (
        <div className="adm-table adm-table--catalog">
          <div className="adm-tr adm-tr--head">
            <div>Code</div><div>Title</div><div>Family</div><div>Audio</div><div>Availability</div><div>Source</div><div className="adm-tr__right">Status</div>
          </div>
          {protocols.map((p) => (
            <div className="adm-tr" key={p.code}>
              <div className="adm-mono">{p.code}</div>
              <div>{p.title}</div>
              <div>{FAMILY_LABEL[p.family]}</div>
              <div>
                {p.audioReady
                  ? <span className="adm-pill adm-pill--ok">Rendered</span>
                  : <span className="adm-pill adm-pill--warn">Placeholder</span>}
              </div>
              <div>{tenantsLabel(p)}</div>
              <div>{p.source === 'imported' ? <span className="adm-pill adm-pill--info">Imported</span> : <span className="adm-tag">Seed</span>}</div>
              <div className="adm-tr__right">
                <button
                  className={`adm-toggle ${p.enabled ? 'is-on' : ''}`}
                  disabled={busyCode === p.code}
                  onClick={() => toggle(p)}
                  title={p.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
                >
                  <span className="adm-toggle__knob" />
                  <span className="adm-toggle__txt">{p.enabled ? 'Enabled' : 'Disabled'}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
