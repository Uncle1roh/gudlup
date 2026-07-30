import { useState } from 'react'
import { useDataProvider } from '../data/provider'
import { useProtocols } from './hooks'
import { FAMILY_LABEL } from '../compose/types'
import { useRef } from 'react'
import { PlainImport } from './PlainImport'
import { parsePlainTimeline, probePlainTimeline, type PlainTimeline } from './plainTimeline'
import type { CatalogProtocol } from '../data/catalog'

function tenantsLabel(p: CatalogProtocol): string {
  return p.tenants === 'all' ? 'All companies' : `${p.tenants.length} compan${p.tenants.length === 1 ? 'y' : 'ies'}`
}

export function CatalogAdmin({ actor }: { actor: string }) {
  const dp = useDataProvider()
  const { data, loading, refetch } = useProtocols()
  const [opened, setOpened] = useState<CatalogProtocol | null>(null)
  const [imported, setImported] = useState<{ timeline: PlainTimeline; fileName: string } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [busyCode, setBusyCode] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  /* Import Excel straight from the list: file dialog → parse → workscreen.
     (The old multi-format import page is gone — PO decision.) */
  async function onImportFile(file: File | undefined) {
    if (!file) return
    setImportError(null)
    try {
      const bytes = await file.arrayBuffer()
      if (!(await probePlainTimeline(bytes))) {
        throw new Error(`"${file.name}" is not a PLAIN Timeline workbook (clip_id / traccia / tipo / start_s / end_s headers not found).`)
      }
      const res = await parsePlainTimeline(bytes)
      if (res.error || !res.timeline) throw new Error(res.error ?? 'Could not parse the workbook.')
      setImported({ timeline: res.timeline, fileName: file.name })
    } catch (e) {
      setImportError((e as Error).message)
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function toggle(p: CatalogProtocol) {
    setBusyCode(p.code)
    await dp.setProtocolEnabled(p.code, !p.enabled)
    await dp.logAudit({ actor, action: p.enabled ? 'protocol.disabled' : 'protocol.enabled', target: p.code })
    setBusyCode(null)
    refetch()
  }

  async function remove(p: CatalogProtocol) {
    const ok = window.confirm(`Delete ${p.code} — "${p.title}" from the catalog?\n\nThis removes the protocol for every company. Rendered audio files in storage are kept.`)
    if (!ok) return
    setBusyCode(p.code)
    try {
      await dp.deleteProtocol(p.code)
      await dp.logAudit({ actor, action: 'protocol.deleted', target: p.code }).catch(() => { /* non-blocking */ })
    } finally {
      setBusyCode(null)
      refetch()
    }
  }

  /* A protocol imported in the PLAIN format reopens its full workscreen
     (review → Studio → render → attach) straight from the catalog row — the
     timeline lives on the catalog entry, no re-import needed. */
  if (imported) {
    return (
      <PlainImport
        timeline={imported.timeline}
        fileName={imported.fileName}
        actor={actor}
        onCancel={() => { setImported(null); refetch() }}
        onDone={() => { setImported(null); refetch() }}
        onImportExcel={() => fileRef.current?.click()}
        fileInput={<input ref={fileRef} type="file" accept=".xlsx" hidden onChange={(e) => void onImportFile(e.target.files?.[0])} />}
      />
    )
  }

  if (opened?.plain) {
    return (
      <PlainImport
        timeline={opened.plain}
        fileName={`catalog · ${opened.code}`}
        actor={actor}
        onCancel={() => { setOpened(null); refetch() }}
        onDone={() => { setOpened(null); refetch() }}
        onImportExcel={() => fileRef.current?.click()}
        fileInput={<input ref={fileRef} type="file" accept=".xlsx" hidden onChange={(e) => void onImportFile(e.target.files?.[0])} />}
      />
    )
  }

  const protocols = data ?? []

  return (
    <div className="adm-page">
      <header className="adm-page__head adm-page__head--row">
        <div>
          <h1 className="b2b-h1">Protocol catalog</h1>
          <p className="b2b-sub">The single shared catalog every company draws from. {protocols.length} protocol{protocols.length === 1 ? '' : 's'}.</p>
        </div>
        <button className="b2b-btn b2b-btn--primary" onClick={() => fileRef.current?.click()}>
          ⬆ Import Excel
        </button>
        <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={(e) => void onImportFile(e.target.files?.[0])} />
        {importError && <span className="adm-plain__status adm-plain__status--err" style={{ marginLeft: 10 }}>{importError}</span>}
      </header>

      {loading && <p className="b2b-sub">Loading catalog…</p>}

      {!loading && (
        <div className="adm-table adm-table--catalog">
          <div className="adm-tr adm-tr--head">
            <div>Code</div><div>Title</div><div>Family</div><div>Audio</div><div>Availability</div><div>Source</div><div className="adm-tr__right">Status</div>
          </div>
          {protocols.map((p) => (
            <div className={`adm-tr${p.plain ? ' adm-tr--click' : ''}`} key={p.code}
              onClick={p.plain ? () => setOpened(p) : undefined}
              title={p.plain ? 'Open — review, Studio, render & attach (no re-import)' : undefined}
            >
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
              <div className="adm-tr__right" onClick={(e) => e.stopPropagation()}>
                <button
                  className={`adm-toggle ${p.enabled ? 'is-on' : ''}`}
                  disabled={busyCode === p.code}
                  onClick={() => toggle(p)}
                  title={p.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
                >
                  <span className="adm-toggle__knob" />
                  <span className="adm-toggle__txt">{p.enabled ? 'Enabled' : 'Disabled'}</span>
                </button>
                <button
                  className="adm-del"
                  disabled={busyCode === p.code}
                  onClick={() => void remove(p)}
                  title="Delete from the catalog"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
