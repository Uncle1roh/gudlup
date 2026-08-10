import { useState } from 'react'
import { useDataProvider } from '../data/provider'
import { useProtocols } from './hooks'
import { FAMILY_LABEL } from '../compose/types'
import { useRef } from 'react'
import { PlainImport } from './PlainImport'
import { setStudioProject, setStudioSeed } from '../compose/handoff'
import { plainToStudioTracks } from './plainStudio'
import { listAssets } from './assets'
import { buildAssetPools, loadAssetMeta, type AssetPools } from './assetPools'
import { hasSupabaseEnv } from '../auth/supabaseClient'
import { parsePlainTimeline, probePlainTimeline, type PlainTimeline } from './plainTimeline'
import { audienceOf, type CatalogProtocol } from '../data/catalog'
import { applyDraft, draftFrom, EMPTY_DRAFT, LibraryEditor, type LibraryDraft } from './LibraryEditor'
import { LIBRARY_CATEGORIES } from '../data/library'

function tenantsLabel(p: CatalogProtocol): string {
  return p.tenants === 'all' ? 'Tutte le aziende' : `${p.tenants.length} aziend${p.tenants.length === 1 ? 'a' : 'e'}`
}

/** Open a protocol in the Sound Studio. A saved Studio session is restored
    as-is; otherwise the PLAIN timeline is converted into one, so "edit" always
    lands on the real material instead of an empty project. */
async function openInStudio(p: CatalogProtocol): Promise<void> {
  const duration = (p.versions.find((v) => v.duration === 24) ?? p.versions[0])?.duration
  const attach = duration ? { code: p.code, duration } : undefined
  if (p.studio) {
    setStudioProject(p.studio, attach, '#admin')
    window.location.hash = '#studio'
    return
  }
  if (!p.plain) throw new Error(`"${p.code}" non ha né una sessione salvata né una timeline PLAIN da aprire.`)
  const version = p.plain.versions.find((v) => v.durationMin === duration) ?? p.plain.versions[0]
  if (!version) throw new Error(`"${p.code}" non ha versioni nella timeline.`)
  let pools: AssetPools | undefined
  try {
    if (hasSupabaseEnv()) {
      const [assets, meta] = await Promise.all([listAssets(), loadAssetMeta()])
      pools = buildAssetPools(assets, meta)
    }
  } catch { /* library unreachable — the seed just leaves sample clips undrawn */ }
  const seed = plainToStudioTracks(p.plain, version, { pools })
  setStudioSeed(seed.tracks, seed.name, attach, undefined, { returnTo: '#admin' })
  window.location.hash = '#studio'
}

export function CatalogAdmin({ actor }: { actor: string }) {
  const dp = useDataProvider()
  const { data, loading, refetch } = useProtocols()
  const [opened, setOpened] = useState<CatalogProtocol | null>(null)
  const [imported, setImported] = useState<{ timeline: PlainTimeline; fileName: string } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [busyCode, setBusyCode] = useState<string | null>(null)
  /* Clinical material and library audio are two different products with two
     different naming rules — the console keeps them on separate tabs so they
     can never be edited as if they were the same thing. */
  const [shelf, setShelf] = useState<'clinical' | 'library'>('clinical')
  const [draft, setDraft] = useState<LibraryDraft | null>(null)
  const [savingDraft, setSavingDraft] = useState(false)
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

  const all = data ?? []
  const protocols = all.filter((p) => audienceOf(p) === shelf)

  async function saveDraft() {
    if (!draft) return
    setSavingDraft(true)
    setImportError(null)
    try {
      const existing = draft.code ? all.find((p) => p.code === draft.code) : undefined
      const entry = applyDraft(draft, existing)
      await dp.saveProtocol(entry)
      await dp.logAudit({ actor, action: existing ? 'library.updated' : 'library.created', target: entry.code }).catch(() => undefined)
      setDraft(null)
      refetch()
    } catch (e) {
      setImportError((e as Error).message)
    } finally {
      setSavingDraft(false)
    }
  }

  return (
    <div className="adm-page">
      <header className="adm-page__head adm-page__head--row">
        <div>
          <h1 className="b2b-h1">Catalogo</h1>
          <p className="b2b-sub">
            {shelf === 'clinical'
              ? `Materiale clinico: entra solo nei percorsi scritti dai terapeuti. ${protocols.length} protocoll${protocols.length === 1 ? 'o' : 'i'}.`
              : `Libreria a uso libero: audio che le persone sfogliano e scelgono da sole, nominati per il momento che servono. ${protocols.length} audio.`}
          </p>
          <div className="mt-seg" style={{ marginTop: 8 }}>
            <button className={shelf === 'clinical' ? 'is-on' : ''} onClick={() => { setShelf('clinical'); setDraft(null) }}>Percorsi clinici</button>
            <button className={shelf === 'library' ? 'is-on' : ''} onClick={() => { setShelf('library'); setDraft(null) }}>Libreria</button>
          </div>
        </div>
        {shelf === 'clinical' ? (
          <button className="b2b-btn b2b-btn--primary" onClick={() => fileRef.current?.click()}>
            ⬆ Importa Excel
          </button>
        ) : (
          <button className="b2b-btn b2b-btn--primary" onClick={() => setDraft(EMPTY_DRAFT)}>
            ＋ Nuovo audio
          </button>
        )}
        <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={(e) => void onImportFile(e.target.files?.[0])} />
        {importError && <span className="adm-plain__status adm-plain__status--err" style={{ marginLeft: 10 }}>{importError}</span>}
      </header>

      {draft && (
        <LibraryEditor
          draft={draft}
          busy={savingDraft}
          onChange={setDraft}
          onSave={() => void saveDraft()}
          onCancel={() => setDraft(null)}
        />
      )}

      {loading && <p className="b2b-sub">Caricamento del catalogo…</p>}

      {!loading && shelf === 'library' && protocols.length === 0 && !draft && (
        <p className="b2b-sub">Ancora nessun audio in libreria. «＋ Nuovo audio» crea la scheda; l’audio si produce nello Studio e si collega come per i protocolli.</p>
      )}

      {!loading && (
        <div className="adm-table adm-table--catalog">
          <div className="adm-tr adm-tr--head">
            <div>Codice</div><div>Titolo</div><div>{shelf === 'library' ? 'Scaffale' : 'Famiglia'}</div><div>Audio</div><div>Disponibilità</div><div>Origine</div><div className="adm-tr__right">Stato</div>
          </div>
          {protocols.map((p) => (
            <div className={`adm-tr${p.plain ? ' adm-tr--click' : ''}`} key={p.code}
              onClick={p.plain ? () => setOpened(p) : undefined}
              title={p.plain ? 'Apri — revisione, Studio, render e collegamento (senza reimportare)' : undefined}
            >
              <div className="adm-mono">{p.code}</div>
              <div>{p.title}</div>
              <div>
                {shelf === 'library'
                  ? (LIBRARY_CATEGORIES.find((c) => c.id === p.library?.category)?.label ?? '—')
                  : FAMILY_LABEL[p.family]}
              </div>
              <div>
                {p.audioReady
                  ? <span className="adm-pill adm-pill--ok">Renderizzato</span>
                  : <span className="adm-pill adm-pill--warn">Provvisorio</span>}
              </div>
              <div>{tenantsLabel(p)}</div>
              <div>{p.source === 'imported' ? <span className="adm-pill adm-pill--info">Importato</span> : <span className="adm-tag">Di serie</span>}</div>
              <div className="adm-tr__right" onClick={(e) => e.stopPropagation()}>
                {shelf === 'library' && (
                  <button className="adm-editbtn" disabled={busyCode === p.code} onClick={() => setDraft(draftFrom(p))} title="Titolo, descrizione, scaffale, copertina">
                    ✎ Scheda
                  </button>
                )}
                <button
                  className="adm-editbtn"
                  disabled={busyCode === p.code}
                  onClick={() => void openInStudio(p).catch((e) => setImportError((e as Error).message))}
                  title={p.studio ? 'Apri nello Studio la sessione salvata' : 'Apri nello Studio dalla timeline del protocollo'}
                >
                  🎚 Modifica
                </button>
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
