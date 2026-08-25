/* ============================================================================
   Good Loop — Asset Library (admin console)
   Browses the PO's produced audio library in the `protocol-audio` bucket
   (music by phase F1–F6, soundscape loop textures by type, plus heartbeat /
   singing-bowl once the PO delivers them), previews any file in place, and
   lets the admin assign which asset serves each protocol phase. The
   assignment (AssetMap) is saved on the catalog entry and is exactly what
   Renderer v3 mixes — unmapped phases fall back to the synth layers.

   Files are added and removed from here too. A delete is deliberately not a
   single storage call: a file's PATH is its classification, and a protocol's
   AssetMap points at that path, so removing the object alone would leave the
   renderer resolving a 404 silently, at render time, long after anyone
   connected the two. Deleting therefore removes the object, its `asset_meta`
   tag row, and every AssetMap reference to it — and says up front which
   protocols it is about to touch.
   ============================================================================ */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useDataProvider } from '../data/provider'
import { hasSupabaseEnv } from '../auth/supabaseClient'
import type { CatalogProtocol } from '../data/catalog'
import {
  assetMapCoverage, assetMapReferences, checkUpload, deleteAssetObject, emptyAssetMap,
  fmtBytes, groupSoundscapes, listAssets, targetPath, uploadAsset, withoutAsset,
  PHASE_KEYS, type AssetMap, type AudioAsset, type PhaseKey, type UploadTarget,
} from './assets'
import { deleteAssetMeta, loadAssetMeta, saveAssetTags } from './assetPools'

type Tab = 'music' | 'soundscape' | 'special'

const PHASE_LABEL: Record<PhaseKey, string> = {
  f1: 'F1 · Intro', f2: 'F2 · Respiro', f3: 'F3 · Centratura',
  f4: 'F4 · Loop affermazioni', f5: 'F5 · Integrazione', f6: 'F6 · Chiusura',
}

export function AssetLibrary({ actor }: { actor: string }) {
  const dp = useDataProvider()
  const [assets, setAssets] = useState<AudioAsset[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('music')

  // preview: one shared <audio> element so only one file plays at a time
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)

  // phase-mapping panel
  const [protocols, setProtocols] = useState<CatalogProtocol[]>([])
  const [selCode, setSelCode] = useState<string>('')

  /* Add / remove. `allProtocols` is every catalog entry, not just the
     mappable ones below — a delete has to scrub references wherever they
     are, and an entry without a datasheet can still carry an AssetMap. */
  const [allProtocols, setAllProtocols] = useState<CatalogProtocol[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadNote, setUploadNote] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<AudioAsset | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [draft, setDraft] = useState<AssetMap>(emptyAssetMap())
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function refresh() {
    setError(null)
    setAssets(null)
    try {
      setAssets(await listAssets())
    } catch (e) {
      setError((e as Error).message)
      setAssets([])
    }
  }

  useEffect(() => {
    if (hasSupabaseEnv()) void refresh()
    else { setError('La libreria audio legge da Supabase Storage — in modalità mock non esiste alcun bucket. Imposta VITE_SUPABASE_URL / _ANON_KEY.'); setAssets([]) }
    void dp.listProtocols().then((ps) => {
      setAllProtocols(ps)
      const mappable = ps.filter((p) => p.datasheet || p.spec)
      setProtocols(mappable)
      if (mappable.length) setSelCode((c) => c || mappable[0].code)
    })
    return () => { audioRef.current?.pause() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const p = protocols.find((x) => x.code === selCode)
    setDraft(p?.assetMap ? { music: { ...p.assetMap.music }, soundscape: { ...p.assetMap.soundscape }, heartbeat: p.assetMap.heartbeat, bowl: p.assetMap.bowl } : emptyAssetMap())
    setDirty(false)
    setSaved(false)
  }, [selCode, protocols])

  function toggle(a: AudioAsset) {
    let el = audioRef.current
    if (!el) { el = new Audio(); audioRef.current = el; el.onended = () => setPlaying(null) }
    if (playing === a.path) {
      el.pause()
      setPlaying(null)
      return
    }
    el.src = a.publicUrl
    void el.play().catch((e) => setError(`Playback failed: ${(e as Error).message}`))
    setPlaying(a.path)
  }

  const music = useMemo(() => (assets ?? []).filter((a) => a.kind === 'music'), [assets])
  const scapes = useMemo(() => groupSoundscapes(assets ?? []), [assets])
  const special = useMemo(() => (assets ?? []).filter((a) => a.kind === 'heartbeat' || a.kind === 'bowl'), [assets])
  const musicByPhase = useMemo(() => {
    const m = new Map<PhaseKey, AudioAsset[]>()
    for (const k of PHASE_KEYS) m.set(k, music.filter((a) => a.phase === k))
    return m
  }, [music])

  function setMusic(k: PhaseKey, path: string) {
    setDraft((d) => ({ ...d, music: { ...d.music, [k]: path || undefined } }))
    setDirty(true); setSaved(false)
  }
  function setScape(k: PhaseKey, path: string) {
    setDraft((d) => ({ ...d, soundscape: { ...d.soundscape, [k]: path || undefined } }))
    setDirty(true); setSaved(false)
  }
  function setSpecial(kind: 'heartbeat' | 'bowl', path: string) {
    setDraft((d) => ({ ...d, [kind]: path || undefined }))
    setDirty(true); setSaved(false)
  }

  async function save() {
    const p = protocols.find((x) => x.code === selCode)
    if (!p) return
    setSaving(true)
    setError(null)
    try {
      const next: CatalogProtocol = { ...p, assetMap: draft, updatedAt: Date.now() }
      await dp.saveProtocol(next)
      const cov = assetMapCoverage(draft)
      await dp.logAudit({ actor, action: 'protocol.assets.mapped', target: p.code, detail: `music ${cov.music}/6 · soundscape ${cov.soundscape}/6${draft.heartbeat ? ' · heartbeat' : ''}${draft.bowl ? ' · bowl' : ''}` })
      setProtocols((ps) => ps.map((x) => (x.code === p.code ? next : x)))
      setDirty(false)
      setSaved(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const selected = protocols.find((x) => x.code === selCode)
  const cov = assetMapCoverage(draft)

  /* PLAIN random-draw tags (asset_meta): extra tags per file beyond the
     folder/filename ones. Edited inline on soundscape rows. */
  const [metaTags, setMetaTags] = useState<Record<string, string>>({})
  const [tagBusy, setTagBusy] = useState<string | null>(null)
  const [tagErr, setTagErr] = useState<string | null>(null)
  useEffect(() => {
    if (!hasSupabaseEnv()) return
    void loadAssetMeta().then((rows) => setMetaTags(Object.fromEntries(rows.map((r) => [r.path, r.tags.join(', ')]))))
  }, [])
  async function commitTags(path: string) {
    setTagBusy(path)
    setTagErr(null)
    try {
      await saveAssetTags(path, (metaTags[path] ?? '').split(',').map((x) => x.trim()).filter(Boolean))
    } catch (e) {
      setTagErr((e as Error).message)
    } finally {
      setTagBusy(null)
    }
  }

  /* ---------------------------------------------------------- upload --- */

  async function doUpload(files: FileList | null, target: UploadTarget) {
    if (!files || !files.length) return
    setUploading(true)
    setError(null)
    setUploadNote(null)
    const done: string[] = []
    const failed: string[] = []
    try {
      for (const file of Array.from(files)) {
        const check = checkUpload(file)
        if (!check.ok) { failed.push(check.reason as string); continue }
        const path = targetPath(target, file.name)
        try {
          await uploadAsset(file, target)
          done.push(path)
        } catch (e) {
          /* The common failure is "a file with that name is already there".
             Replacing silently would swap the audio under every protocol
             mapped to that path, so it is offered, never assumed. */
          const message = (e as Error).message
          if (/Esiste già/.test(message) && window.confirm(`${message}\n\nSostituire il file esistente?`)) {
            await uploadAsset(file, target, { replace: true })
            done.push(`${path} (sostituito)`)
          } else {
            failed.push(message)
          }
        }
      }
      if (done.length) {
        await dp.logAudit({
          actor, action: 'asset.uploaded', target: done[0],
          detail: done.length > 1 ? `${done.length} file` : done[0],
        }).catch(() => { /* the upload happened; the log is not worth failing on */ })
        await refresh()
      }
      setUploadNote(
        [done.length ? `${done.length} file caricati.` : '', ...failed].filter(Boolean).join(' · ') || null,
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  /* ---------------------------------------------------------- delete --- */

  /** Which protocols point at this file, and where. */
  function referencesTo(path: string): { code: string; where: string[] }[] {
    return allProtocols
      .map((p) => ({ code: p.code, where: assetMapReferences(p.assetMap, path) }))
      .filter((r) => r.where.length > 0)
  }

  /**
   * Remove the object, its tag row, and every AssetMap that points at it.
   *
   * Order matters: the references go first. If the storage delete succeeds
   * and a later write fails, a protocol is left pointing at a file that is
   * gone — the exact silent breakage this is here to prevent. Clearing the
   * references first means the worst case is an orphaned file, which is
   * visible in the list and harmless.
   */
  async function doDelete(a: AudioAsset) {
    setDeleting(true)
    setError(null)
    try {
      const refs = referencesTo(a.path)
      for (const ref of refs) {
        const p = allProtocols.find((x) => x.code === ref.code)
        if (!p) continue
        const next: CatalogProtocol = { ...p, assetMap: withoutAsset(p.assetMap, a.path), updatedAt: Date.now() }
        await dp.saveProtocol(next)
        setAllProtocols((ps) => ps.map((x) => (x.code === next.code ? next : x)))
        setProtocols((ps) => ps.map((x) => (x.code === next.code ? next : x)))
        if (next.code === selCode) setDraft(next.assetMap ?? emptyAssetMap())
      }

      await deleteAssetMeta(a.path).catch(() => { /* no tag row is fine */ })
      await deleteAssetObject(a.path)

      await dp.logAudit({
        actor, action: 'asset.deleted', target: a.path,
        detail: refs.length ? `riferimenti rimossi: ${refs.map((r) => r.code).join(', ')}` : 'nessun riferimento',
      }).catch(() => { /* the delete happened */ })

      setMetaTags((m) => { const next = { ...m }; delete next[a.path]; return next })
      setConfirmDelete(null)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDeleting(false)
    }
  }

  const assetRow = (a: AudioAsset) => (
    <div key={a.path} className="adm-asset">
      <button className={`adm-asset__play${playing === a.path ? ' is-on' : ''}`} onClick={() => toggle(a)} title={playing === a.path ? 'Ferma' : 'Ascolta'}>
        {playing === a.path ? '■' : '▶'}
      </button>
      <span className="adm-asset__name" title={a.path}>{a.name}</span>
      {a.kind === 'soundscape' && (
        <input
          className="b2b-input adm-asset__tags"
          placeholder="tag aggiuntivi per il sorteggio (lago, fabbrica…)"
          title="Tag PLAIN per il sorteggio casuale di questo file — cartella e nome file contano già; qui aggiungi sinonimi e ambienti extra. Salvati all’uscita dal campo."
          value={metaTags[a.path] ?? ''}
          disabled={tagBusy === a.path}
          onChange={(e) => setMetaTags((m) => ({ ...m, [a.path]: e.target.value }))}
          onBlur={() => void commitTags(a.path)}
        />
      )}
      <span className="adm-asset__meta">{fmtBytes(a.sizeBytes)}</span>
      <button
        className="adm-asset__del"
        title="Elimina dalla libreria"
        aria-label={`Elimina ${a.name}`}
        onClick={() => setConfirmDelete(a)}
      >
        ✕
      </button>
    </div>
  )

  return (
    <div className="adm-page">
      <header className="adm-page__head adm-page__head--row">
        <div>
          <h1 className="b2b-h1">Libreria audio</h1>
          <p className="b2b-sub">L’audio prodotto in <code>protocol-audio/assets</code> — ascolta qualsiasi file, poi assegna quale asset serve ciascuna fase del protocollo. Il renderer v3 miscela esattamente questa mappatura.</p>
        </div>
        <button className="b2b-btn" onClick={() => void refresh()} disabled={assets === null}>↻ Refresh</button>
      </header>

      {error && <div className="adm-note adm-note--warn">{error}</div>}
      {tagErr && <div className="adm-note adm-note--warn">Tags: {tagErr} — run the updated supabase/setup.sql (adds asset_meta) if the table is missing.</div>}
      {assets === null && <div className="adm-note">Lettura del bucket…</div>}

      {assets !== null && (
        <>
          <UploadPanel
            tab={tab}
            busy={uploading}
            note={uploadNote}
            textures={[...groupSoundscapes(assets ?? []).keys()]}
            onUpload={(files, target) => void doUpload(files, target)}
          />

          <div className="adm-spec__chips" style={{ marginBottom: 12 }}>
            <button className={`b2b-btn${tab === 'music' ? ' b2b-btn--primary' : ''}`} onClick={() => setTab('music')}>♪ Music by phase ({music.length})</button>
            <button className={`b2b-btn${tab === 'soundscape' ? ' b2b-btn--primary' : ''}`} onClick={() => setTab('soundscape')}>🌊 Soundscapes ({(assets ?? []).filter((a) => a.kind === 'soundscape').length})</button>
            <button className={`b2b-btn${tab === 'special' ? ' b2b-btn--primary' : ''}`} onClick={() => setTab('special')}>♥ Heartbeat & bowl ({special.length})</button>
          </div>

          {tab === 'music' && (
            <div className="adm-asset__groups">
              {PHASE_KEYS.map((k) => {
                const list = musicByPhase.get(k) ?? []
                return (
                  <div key={k} className="adm-asset__group">
                    <div className="adm-asset__ghead">{PHASE_LABEL[k]} <span className="adm-asset__count">{list.length}</span></div>
                    {list.length === 0 && <div className="adm-asset__empty">No tracks in assets/music/{k} (or flat files named {k}_*.mp3).</div>}
                    {list.map(assetRow)}
                  </div>
                )
              })}
              {music.some((a) => !a.phase) && (
                <div className="adm-asset__group">
                  <div className="adm-asset__ghead">Senza prefisso di fase <span className="adm-asset__count">{music.filter((a) => !a.phase).length}</span></div>
                  <div className="adm-asset__empty">File in assets/music senza cartella o prefisso f1–f6 — selezionabili per qualsiasi fase qui sotto.</div>
                  {music.filter((a) => !a.phase).map(assetRow)}
                </div>
              )}
            </div>
          )}

          {tab === 'soundscape' && (
            <div className="adm-asset__groups">
              {scapes.size === 0 && <div className="adm-asset__empty">Nessuna texture di paesaggio sonoro trovata in assets/soundscape.</div>}
              {[...scapes.entries()].map(([texture, list]) => (
                <div key={texture} className="adm-asset__group">
                  <div className="adm-asset__ghead">{texture} <span className="adm-asset__count">{list.length}</span></div>
                  {list.map(assetRow)}
                </div>
              ))}
            </div>
          )}

          {tab === 'special' && (
            <div className="adm-asset__groups">
              <div className="adm-asset__group">
                <div className="adm-asset__ghead">Battito cardiaco e campana tibetana</div>
                {special.length === 0 && (
                  <div className="adm-asset__empty">
                    Nothing under assets/heartbeat or assets/bowl yet — these are PO deliverables. Until a file is mapped,
                    Renderer v3 uses the synth provisional (60 BPM lub-dub · inharmonic bowl strike).
                  </div>
                )}
                {special.map(assetRow)}
              </div>
            </div>
          )}

          {/* -------- phase mapping -------- */}
          <div className="adm-asset__mapper">
            <div className="adm-asset__ghead" style={{ marginBottom: 8 }}>Mappatura fase → asset</div>
            {protocols.length === 0 ? (
              <div className="adm-asset__empty">Nessun protocollo mappabile — importa prima un protocollo.</div>
            ) : (
              <>
                <div className="adm-spec__row">
                  <span className="adm-spec__lbl">Protocollo</span>
                  <select className="b2b-input adm-asset__sel" value={selCode} onChange={(e) => setSelCode(e.target.value)}>
                    {protocols.map((p) => <option key={p.code} value={p.code}>{p.code} — {p.title}</option>)}
                  </select>
                  <span className="adm-asset__meta">music {cov.music}/6 · soundscape {cov.soundscape}/6</span>
                </div>

                <div className="adm-asset__grid">
                  <div className="adm-asset__gridhead">Fase</div>
                  <div className="adm-asset__gridhead">Stem musicale</div>
                  <div className="adm-asset__gridhead">Texture paesaggio sonoro</div>
                  {PHASE_KEYS.map((k) => (
                    <PhaseMapRow
                      key={k}
                      label={PHASE_LABEL[k]}
                      music={musicByPhase.get(k) ?? []}
                      allMusic={music}
                      scapes={assets.filter((a) => a.kind === 'soundscape')}
                      musicValue={draft.music[k] ?? ''}
                      scapeValue={draft.soundscape[k] ?? ''}
                      onMusic={(v) => setMusic(k, v)}
                      onScape={(v) => setScape(k, v)}
                    />
                  ))}
                </div>

                <div className="adm-spec__row" style={{ marginTop: 8 }}>
                  <span className="adm-spec__lbl">File battito cardiaco</span>
                  <select className="b2b-input adm-asset__sel" value={draft.heartbeat ?? ''} onChange={(e) => setSpecial('heartbeat', e.target.value)}>
                    <option value="">— synth provisional (60 BPM) —</option>
                    {assets.filter((a) => a.kind === 'heartbeat').map((a) => <option key={a.path} value={a.path}>{a.name}</option>)}
                  </select>
                </div>
                <div className="adm-spec__row">
                  <span className="adm-spec__lbl">File campana tibetana</span>
                  <select className="b2b-input adm-asset__sel" value={draft.bowl ?? ''} onChange={(e) => setSpecial('bowl', e.target.value)}>
                    <option value="">— synth provisional strike —</option>
                    {assets.filter((a) => a.kind === 'bowl').map((a) => <option key={a.path} value={a.path}>{a.name}</option>)}
                  </select>
                </div>

                <div className="adm-cred__actions" style={{ marginTop: 12 }}>
                  <button className="b2b-btn b2b-btn--primary" disabled={!dirty || saving || !selected} onClick={() => void save()}>
                    {saving ? 'Salvataggio…' : `Salva la mappatura per ${selCode}`}
                  </button>
                  {saved && <span className="adm-asset__meta">✓ Saved — the next render of {selCode} uses these assets.</span>}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {confirmDelete && (
        <DeleteAssetDialog
          asset={confirmDelete}
          references={referencesTo(confirmDelete.path)}
          busy={deleting}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void doDelete(confirmDelete)}
        />
      )}
    </div>
  )
}

/* ============================================================== upload ==== */

/**
 * Where a file goes is decided here, not by the file. The bucket path IS the
 * classification — `assets/music/f4/x.mp3` is a phase-4 music track, and
 * nothing else records that — so the target is chosen explicitly and the
 * resulting path is shown before anything is sent.
 */
function UploadPanel({
  tab,
  busy,
  note,
  textures,
  onUpload,
}: {
  tab: Tab
  busy: boolean
  note: string | null
  textures: string[]
  onUpload: (files: FileList | null, target: UploadTarget) => void
}) {
  const [phase, setPhase] = useState<PhaseKey>('f1')
  const [texture, setTexture] = useState<string>(textures[0] ?? 'wind')
  const [newTexture, setNewTexture] = useState('')
  const [special, setSpecial] = useState<'heartbeat' | 'bowl'>('heartbeat')
  const input = useRef<HTMLInputElement | null>(null)

  const target: UploadTarget =
    tab === 'music'
      ? { kind: 'music', phase }
      : tab === 'soundscape'
        ? { kind: 'soundscape', texture: newTexture.trim() || texture }
        : { kind: special }

  const preview = targetPath(target, 'nome-file.mp3')

  return (
    <section className="adm-upload">
      <div className="adm-upload__row">
        <span className="adm-spec__lbl">Aggiungi file</span>

        {tab === 'music' && (
          <select className="b2b-input adm-asset__sel" value={phase} onChange={(e) => setPhase(e.target.value as PhaseKey)}>
            {PHASE_KEYS.map((k) => <option key={k} value={k}>{PHASE_LABEL[k]}</option>)}
          </select>
        )}

        {tab === 'soundscape' && (
          <>
            <select
              className="b2b-input adm-asset__sel"
              value={texture}
              disabled={!!newTexture.trim()}
              onChange={(e) => setTexture(e.target.value)}
            >
              {textures.length === 0 && <option value="wind">wind</option>}
              {textures.map((tx) => <option key={tx} value={tx}>{tx}</option>)}
            </select>
            <input
              className="b2b-input"
              style={{ maxWidth: 180 }}
              placeholder="…o una nuova texture"
              value={newTexture}
              onChange={(e) => setNewTexture(e.target.value)}
            />
          </>
        )}

        {tab === 'special' && (
          <select className="b2b-input adm-asset__sel" value={special} onChange={(e) => setSpecial(e.target.value as 'heartbeat' | 'bowl')}>
            <option value="heartbeat">Battito cardiaco</option>
            <option value="bowl">Campana tibetana</option>
          </select>
        )}

        <input
          ref={input}
          type="file"
          accept=".mp3,.wav,.ogg,.m4a,.flac,.aac,audio/*"
          multiple
          hidden
          onChange={(e) => { onUpload(e.target.files, target); e.target.value = '' }}
        />
        <button className="b2b-btn b2b-btn--primary" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Caricamento…' : '⬆ Carica file'}
        </button>
      </div>

      <p className="b2b-sub">
        Finisce in <code>{preview}</code>. Il nome viene ripulito (minuscole, senza spazi né accenti) perché
        diventa parte dell’URL. Più file insieme sono ammessi.
      </p>
      {note && <div className="adm-note">{note}</div>}
    </section>
  )
}

/* ============================================================== delete ==== */

/**
 * A delete says what it is about to break before it breaks it. If a protocol's
 * AssetMap points at this file, that mapping is cleared as part of the same
 * action — leaving it would make the renderer resolve a missing path silently,
 * at render time, with nothing on screen connecting the two events.
 */
function DeleteAssetDialog({
  asset,
  references,
  busy,
  onCancel,
  onConfirm,
}: {
  asset: AudioAsset
  references: { code: string; where: string[] }[]
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="adm-scrim" onClick={onCancel} role="dialog" aria-modal="true">
      <div className="adm-dialog" onClick={(e) => e.stopPropagation()}>
        <h2 className="b2b-card__title">Eliminare «{asset.name}»?</h2>
        <p className="b2b-sub adm-mono">{asset.path}</p>

        {references.length === 0 ? (
          <p className="b2b-sub">Nessun protocollo usa questo file. L’eliminazione è definitiva.</p>
        ) : (
          <>
            <div className="adm-note adm-note--warn">
              {references.length === 1 ? 'Un protocollo usa' : `${references.length} protocolli usano`} questo file.
              La mappatura verrà rimossa e quelle fasi torneranno ai livelli sintetizzati finché non assegni
              un altro file.
            </div>
            <ul className="adm-reflist">
              {references.map((r) => (
                <li key={r.code}>
                  <span className="adm-mono">{r.code}</span> — {r.where.join(', ')}
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="adm-cred__actions" style={{ marginTop: 14 }}>
          <button className="b2b-btn b2b-btn--ghost" disabled={busy} onClick={onCancel}>Annulla</button>
          <button className="b2b-btn b2b-btn--danger" disabled={busy} onClick={onConfirm}>
            {busy ? 'Eliminazione…' : 'Elimina definitivamente'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PhaseMapRow(props: {
  label: string
  music: AudioAsset[]
  allMusic: AudioAsset[]
  scapes: AudioAsset[]
  musicValue: string
  scapeValue: string
  onMusic: (v: string) => void
  onScape: (v: string) => void
}) {
  const { label, music, allMusic, scapes, musicValue, scapeValue, onMusic, onScape } = props
  // this phase's folder first; other phases' tracks still selectable below
  const others = allMusic.filter((a) => !music.includes(a))
  return (
    <>
      <div className="adm-asset__gridlbl">{label}</div>
      <select className="b2b-input adm-asset__sel" value={musicValue} onChange={(e) => onMusic(e.target.value)}>
        <option value="">— synth pad fallback —</option>
        {music.length > 0 && (
          <optgroup label="This phase's folder">
            {music.map((a) => <option key={a.path} value={a.path}>{a.name}</option>)}
          </optgroup>
        )}
        {others.length > 0 && (
          <optgroup label="Other phases">
            {others.map((a) => <option key={a.path} value={a.path}>{a.phase?.toUpperCase()} · {a.name}</option>)}
          </optgroup>
        )}
      </select>
      <select className="b2b-input adm-asset__sel" value={scapeValue} onChange={(e) => onScape(e.target.value)}>
        <option value="">— synth texture fallback —</option>
        {scapes.map((a) => <option key={a.path} value={a.path}>{a.texture} · {a.name}</option>)}
      </select>
    </>
  )
}
