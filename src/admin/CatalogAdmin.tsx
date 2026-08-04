import { useState } from 'react'
import { useDataProvider } from '../data/provider'
import { useProtocols } from './hooks'
import { FAMILY_LABEL } from '../compose/types'
import { useRef } from 'react'
import { PlainImport } from './PlainImport'
import { parsePlainTimeline, probePlainTimeline, type PlainTimeline } from './plainTimeline'
import type { CatalogProtocol } from '../data/catalog'

function tenantsLabel(p: CatalogProtocol): string {
  return p.tenants === 'all' ? 'Tutte le aziende' : `${p.tenants.length} aziend${p.tenants.length === 1 ? 'a' : 'e'}`
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
        throw new Error(`"${file.name}" non è un file PLAIN Timeline (intestazioni clip_id / traccia / tipo / start_s / end_s non trovate).`)
      }
      const res = await parsePlainTimeline(bytes)
      if (res.error || !res.timeline) throw new Error(res.error ?? 'Impossibile leggere il file Excel.')
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
    const ok = window.confirm(`Eliminare ${p.code} — "${p.title}" dal catalogo?\n\nIl protocollo viene rimosso per tutte le aziende. I file audio già renderizzati restano nello storage.`)
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
          <h1 className="b2b-h1">Catalogo protocolli</h1>
          <p className="b2b-sub">L’unico catalogo condiviso da cui attingono tutte le aziende. {protocols.length} protocoll{protocols.length === 1 ? 'o' : 'i'}.</p>
        </div>
        <button className="b2b-btn b2b-btn--primary" onClick={() => fileRef.current?.click()}>
          ⬆ Importa Excel
        </button>
        <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={(e) => void onImportFile(e.target.files?.[0])} />
        {importError && <span className="adm-plain__status adm-plain__status--err" style={{ marginLeft: 10 }}>{importError}</span>}
      </header>

      {loading && <p className="b2b-sub">Caricamento del catalogo…</p>}

      {!loading && (
        <div className="adm-table adm-table--catalog">
          <div className="adm-tr adm-tr--head">
            <div>Codice</div><div>Titolo</div><div>Famiglia</div><div>Audio</div><div>Disponibilità</div><div>Origine</div><div className="adm-tr__right">Stato</div>
          </div>
          {protocols.map((p) => (
            <div className={`adm-tr${p.plain ? ' adm-tr--click' : ''}`} key={p.code}
              onClick={p.plain ? () => setOpened(p) : undefined}
              title={p.plain ? 'Apri — revisione, Studio, render e collegamento (senza reimportare)' : undefined}
            >
              <div className="adm-mono">{p.code}</div>
              <div>{p.title}</div>
              <div>{FAMILY_LABEL[p.family]}</div>
              <div>
                {p.audioReady
                  ? <span className="adm-pill adm-pill--ok">Renderizzato</span>
                  : <span className="adm-pill adm-pill--warn">Provvisorio</span>}
              </div>
              <div>{tenantsLabel(p)}</div>
              <div>{p.source === 'imported' ? <span className="adm-pill adm-pill--info">Importato</span> : <span className="adm-tag">Di serie</span>}</div>
              <div className="adm-tr__right" onClick={(e) => e.stopPropagation()}>
                <button
                  className={`adm-toggle ${p.enabled ? 'is-on' : ''}`}
                  disabled={busyCode === p.code}
                  onClick={() => toggle(p)}
                  title={p.enabled ? 'Attivo — clicca per disattivare' : 'Disattivato — clicca per attivare'}
                >
                  <span className="adm-toggle__knob" />
                  <span className="adm-toggle__txt">{p.enabled ? 'Attivo' : 'Disattivato'}</span>
                </button>
                <button
                  className="adm-del"
                  disabled={busyCode === p.code}
                  onClick={() => void remove(p)}
                  title="Elimina dal catalogo"
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
