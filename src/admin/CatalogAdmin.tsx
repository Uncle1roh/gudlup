import { useMemo, useState } from 'react'
import { useDataProvider } from '../data/provider'
import { useProtocols } from './hooks'
import { FAMILY_LABEL } from '../compose/types'
import { useRef } from 'react'
import { PlainImport } from './PlainImport'
import { DatasheetImport } from './DatasheetImport'
import { SpecImport } from './SpecImport'
import { setStudioProject, setStudioSeed } from '../compose/handoff'
import { plainToStudioTracks } from './plainStudio'
import { listAssets } from './assets'
import { buildAssetPools, loadAssetMeta, type AssetPools } from './assetPools'
import { hasSupabaseEnv } from '../auth/supabaseClient'
import { parsePlainTimeline, probePlainTimeline, type PlainTimeline } from './plainTimeline'
import { audienceOf, mergedPlain, plainDurations, plainFor, studioFor, type CatalogProtocol } from '../data/catalog'
import { applyDraft, draftFrom, EMPTY_DRAFT, LibraryEditor, type LibraryDraft } from './LibraryEditor'
import { ProtocolCardEditor, applyCardDraft, cardDraftFrom, type ProtocolCardDraft } from './ProtocolCard'
import { LIBRARY_CATEGORIES } from '../data/library'
import { DURATION_TAG_IDS, durationTagLabel, filterByTags, tagLabel, tagsInUse, tagsOf } from '../data/tags'
import { CATALOG_DURATIONS } from '../data/catalog'
import type { Duration } from '../types/domain'

function tenantsLabel(p: CatalogProtocol): string {
  return p.tenants === 'all' ? 'Tutte le aziende' : `${p.tenants.length} aziend${p.tenants.length === 1 ? 'a' : 'e'}`
}

/** Open ONE time signature of a protocol in the Sound Studio. A saved Studio
    session for that duration is restored as-is; otherwise that duration's PLAIN
    timeline is converted into one, so "edit" always lands on the real material
    instead of an empty project — and never on another duration's mix. */
async function openInStudio(p: CatalogProtocol, want?: Duration): Promise<void> {
  const duration = (want != null && p.versions.some((v) => v.duration === want) ? want : undefined)
    ?? (p.versions.find((v) => v.duration === 24) ?? p.versions[0])?.duration
  const attach = duration ? { code: p.code, duration } : undefined
  const saved = duration ? studioFor(p, duration) : undefined
  if (saved) {
    setStudioProject(saved, attach, '#admin')
    window.location.hash = '#studio'
    return
  }
  const timeline = (duration ? plainFor(p, duration) : undefined) ?? mergedPlain(p)
  if (!timeline) throw new Error(`"${p.code}" non ha né una sessione salvata né una timeline PLAIN da aprire.`)
  const version = timeline.versions.find((v) => v.durationMin === duration) ?? timeline.versions[0]
  if (!version) throw new Error(`"${p.code}" non ha versioni nella timeline.`)
  let pools: AssetPools | undefined
  try {
    if (hasSupabaseEnv()) {
      const [assets, meta] = await Promise.all([listAssets(), loadAssetMeta()])
      pools = buildAssetPools(assets, meta)
    }
  } catch { /* library unreachable — the seed just leaves sample clips undrawn */ }
  const seed = plainToStudioTracks(timeline, version, { pools })
  setStudioSeed(seed.tracks, seed.name, attach, undefined, { returnTo: '#admin' })
  window.location.hash = '#studio'
}

/**
 * The workscreen's stand-in for a protocol that has no timeline yet.
 *
 * It carries the identity — code and title — and no versions, which is exactly
 * what the screen needs to render its header and disable the four actions that
 * operate on a timeline while leaving Importa Excel open.
 */
/** What material the catalog holds for a protocol, in one short phrase. */
function materialLabel(p: CatalogProtocol): string {
  const bits: string[] = []
  const durs = plainDurations(p)
  if (durs.length) bits.push(`PLAIN ${durs.map((d) => `${d}m`).join('+')}`)
  else if (p.plain) bits.push('PLAIN (legacy)')
  if (p.datasheet) bits.push('Scheda dati')
  if (p.spec) bits.push('Documento')
  return bits.length ? bits.join(' · ') : 'nessun workbook'
}

function emptyTimeline(p: CatalogProtocol): PlainTimeline {
  return { code: p.code, title: p.title, versions: [], affirmations: [], issues: [] }
}

export function CatalogAdmin({ actor }: { actor: string }) {
  const dp = useDataProvider()
  const { data, loading, refetch } = useProtocols()
  const [opened, setOpened] = useState<CatalogProtocol | null>(null)
  /* which TIME SIGNATURE the workscreen should land on (a duration pill was
     clicked); null = its first version */
  const [openAt, setOpenAt] = useState<Duration | null>(null)
  const [imported, setImported] = useState<{ timeline: PlainTimeline; fileName: string } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [busyCode, setBusyCode] = useState<string | null>(null)
  /* Clinical material and library audio are two different products with two
     different naming rules — the console keeps them on separate tabs so they
     can never be edited as if they were the same thing. */
  const [shelf, setShelf] = useState<'clinical' | 'library'>('clinical')
  const [draft, setDraft] = useState<LibraryDraft | null>(null)
  const [savingDraft, setSavingDraft] = useState(false)
  /* the public card (non-therapeutic name + tags) of a clinical protocol */
  const [card, setCard] = useState<ProtocolCardDraft | null>(null)
  const [savingCard, setSavingCard] = useState(false)
  /* tag filter — real tags and the three time signatures in one row of chips */
  const [picked, setPicked] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const all = data ?? []
  /* The workscreen opens ONE timeline carrying every published time signature,
     so its chips are 6 · 12 · 24 and each one is that duration's own material.
     Memoized: PlainImport takes the timeline as a prop. */
  const openedPlain = useMemo(() => (opened ? mergedPlain(opened) : undefined), [opened])
  const filterChips = useMemo(() => tagsInUse(all.filter((p) => audienceOf(p) === shelf)), [data, shelf]) // eslint-disable-line react-hooks/exhaustive-deps

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

  /* A protocol reopens the workscreen for the material it ACTUALLY carries.
     The catalog only ever knew how to reopen a PLAIN timeline, so a protocol
     imported from a datasheet (Scheda Dati) or a spec document had no way back
     in at all: it rendered, its audio attached, it played correctly in the app
     — and the row said no Excel had been uploaded, because no PLAIN workbook
     ever had been. Nothing was wrong with the protocol; the catalog was asking
     the wrong question about it. */
  if (opened?.datasheet && !openedPlain) {
    return (
      <DatasheetImport
        datasheet={opened.datasheet}
        fileName={`catalog · ${opened.code}`}
        actor={actor}
        onCancel={() => { setOpened(null); setOpenAt(null); refetch() }}
        onDone={() => { setOpened(null); setOpenAt(null); refetch() }}
      />
    )
  }

  if (opened?.spec && !openedPlain) {
    return (
      <SpecImport
        spec={opened.spec}
        fileName={`catalog · ${opened.code}`}
        actor={actor}
        onCancel={() => { setOpened(null); setOpenAt(null); refetch() }}
        onDone={() => { setOpened(null); setOpenAt(null); refetch() }}
      />
    )
  }

  /* Nothing stored at all: the PLAIN workscreen opens empty rather than the row
     doing nothing. That screen is where Importa Excel lives, so diverting
     someone elsewhere left the import button unreachable for exactly the
     protocols that needed it. */
  if (opened) {
    return (
      <PlainImport
        timeline={openedPlain ?? emptyTimeline(opened)}
        initialDuration={openAt ?? undefined}
        fileName={`catalog · ${opened.code}`}
        actor={actor}
        onCancel={() => { setOpened(null); setOpenAt(null); refetch() }}
        onDone={() => { setOpened(null); setOpenAt(null); refetch() }}
        onImportExcel={() => fileRef.current?.click()}
        fileInput={<input ref={fileRef} type="file" accept=".xlsx" hidden onChange={(e) => void onImportFile(e.target.files?.[0])} />}
      />
    )
  }

  const protocols = filterByTags(all.filter((p) => audienceOf(p) === shelf), picked)

  async function saveCard() {
    if (!card) return
    const existing = all.find((p) => p.code === card.code)
    if (!existing) return
    setSavingCard(true)
    setImportError(null)
    try {
      const entry = applyCardDraft(card, existing)
      await dp.saveProtocol(entry)
      await dp.logAudit({ actor, action: 'protocol.card.updated', target: entry.code, detail: entry.publicTitle ?? '(nessun nome pubblico)' }).catch(() => undefined)
      setCard(null)
      refetch()
    } catch (e) {
      setImportError((e as Error).message)
    } finally {
      setSavingCard(false)
    }
  }

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
            <button className={shelf === 'clinical' ? 'is-on' : ''} onClick={() => { setShelf('clinical'); setDraft(null); setCard(null); setPicked([]) }}>Percorsi clinici</button>
            <button className={shelf === 'library' ? 'is-on' : ''} onClick={() => { setShelf('library'); setDraft(null); setCard(null); setPicked([]) }}>Libreria</button>
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

      {/* Tag filter — the curated words actually in use, plus the three time
          signatures. Selecting several narrows (AND). */}
      {!loading && (filterChips.length > 0 || picked.length > 0) && (
        <div className="mt-seg mt-seg--wrap" style={{ marginBottom: 12 }}>
          {CATALOG_DURATIONS.map((d) => {
            const id = DURATION_TAG_IDS[d]
            const on = picked.includes(id)
            return (
              <button key={id} className={on ? 'is-on' : ''}
                onClick={() => setPicked(on ? picked.filter((x) => x !== id) : [...picked, id])}>
                {durationTagLabel(d)}
              </button>
            )
          })}
          {filterChips.map(({ id, count }) => {
            const on = picked.includes(id)
            return (
              <button key={id} className={on ? 'is-on' : ''}
                onClick={() => setPicked(on ? picked.filter((x) => x !== id) : [...picked, id])}>
                {tagLabel(id)} <span className="adm-tag">{count}</span>
              </button>
            )
          })}
          {picked.length > 0 && <button onClick={() => setPicked([])}>✕ Azzera</button>}
        </div>
      )}

      {draft && (
        <LibraryEditor
          draft={draft}
          busy={savingDraft}
          onChange={setDraft}
          onSave={() => void saveDraft()}
          onCancel={() => setDraft(null)}
        />
      )}

      {card && (
        <ProtocolCardEditor
          draft={card}
          busy={savingCard}
          onChange={setCard}
          onSave={() => void saveCard()}
          onCancel={() => setCard(null)}
        />
      )}

      {loading && <p className="b2b-sub">Caricamento del catalogo…</p>}

      {!loading && shelf === 'library' && protocols.length === 0 && !draft && (
        <p className="b2b-sub">Ancora nessun audio in libreria. «＋ Nuovo audio» crea la scheda; l’audio si produce nello Studio e si collega come per i protocolli.</p>
      )}

      {!loading && (
        <div className="adm-table adm-table--catalog">
          <div className="adm-tr adm-tr--head">
            <div>Codice</div><div>Titolo</div><div>{shelf === 'library' ? 'Scaffale' : 'Famiglia'}</div><div>Durate</div><div>Disponibilità</div><div>Origine</div><div className="adm-tr__right">Stato</div>
          </div>
          {protocols.map((p) => {
            const openable = !!mergedPlain(p)
            /* A datasheet or a spec is material the workscreen can reopen just
               as well as a PLAIN timeline — it is a different workbook, not an
               absent one. */
            const reopenable = openable || !!p.datasheet || !!p.spec
            const withTimeline = new Set(plainDurations(p))
            const withAudio = new Set(p.versions.filter((v) => v.audioUrl?.['pt-BR']).map((v) => v.duration))
            const tags = tagsOf(p)
            return (
            <div className="adm-tr adm-tr--click" key={p.code}
              onClick={() => {
                /* The library shelf keeps its own editor — those entries are
                   editorial, not clinical timelines. Everything else opens the
                   workscreen, with or without a timeline. */
                if (shelf === 'library') { setDraft(draftFrom(p)); return }
                setOpenAt(null)
                setOpened(p)
              }}
              title={reopenable
                ? 'Apri — revisione, Studio, render e collegamento (senza reimportare)'
                : 'Apri — nessun materiale ancora importato: da qui puoi caricare il file Excel o modificare la scheda.'}
            >
              <div className="adm-mono">{p.code}</div>
              <div>
                {p.title}
                {p.publicTitle && <div className="adm-muted">«{p.publicTitle}»</div>}
                {tags.length > 0 && (
                  <div className="adm-tag">{tags.map((id) => tagLabel(id)).join(' · ')}</div>
                )}
              </div>
              <div>
                {shelf === 'library'
                  ? (LIBRARY_CATEGORIES.find((c) => c.id === p.library?.category)?.label ?? '—')
                  : FAMILY_LABEL[p.family]}
              </div>
              {/* One pill per TIME SIGNATURE: green = audio in linea, amber =
                  timeline pubblicata senza audio, grey = non pubblicata. */}
              <div className="adm-durs" onClick={(e) => e.stopPropagation()}>
                {CATALOG_DURATIONS.filter((d) => p.versions.some((v) => v.duration === d) || withTimeline.has(d)).map((d) => (
                  <button
                    key={d}
                    className={`adm-pill adm-pill--btn ${withAudio.has(d) ? 'adm-pill--ok' : withTimeline.has(d) ? 'adm-pill--warn' : 'adm-pill--idle'}`}
                    title={
                      withAudio.has(d)
                        ? `${d} min — audio in linea · apri questa versione`
                        : withTimeline.has(d)
                          ? `${d} min — timeline pubblicata, audio non collegato · apri questa versione`
                          : reopenable
                            ? `${d} min — nessuna timeline PLAIN: apre la scheda dati importata`
                            : `${d} min — nessuna timeline pubblicata: importa il file Excel di questa durata`
                    }
                    /* Openable when this duration has a PLAIN timeline, or when
                       the protocol carries a datasheet/spec the workscreen can
                       reopen. A pill only stays dead when there is genuinely
                       nothing behind it — and then it says so. */
                    disabled={!withTimeline.has(d) && !reopenable}
                    onClick={() => { setOpenAt(d); setOpened(p) }}
                  >
                    {d}m
                  </button>
                ))}
                {!p.versions.length && !withTimeline.size && <span className="adm-tag">—</span>}
              </div>
              <div>{tenantsLabel(p)}</div>
              <div>
                {p.source === 'imported' ? <span className="adm-pill adm-pill--info">Importato</span> : <span className="adm-tag">Di serie</span>}
                {/* WHICH workbook is behind the row. A protocol can play
                    perfectly from an attached mixdown while carrying no PLAIN
                    timeline at all, and until this line existed the only way to
                    find that out was to open it and read an error. */}
                <div className="adm-tag">{materialLabel(p)}</div>
              </div>
              <div className="adm-tr__right" onClick={(e) => e.stopPropagation()}>
                {shelf === 'library' ? (
                  <button className="adm-editbtn" disabled={busyCode === p.code} onClick={() => setDraft(draftFrom(p))} title="Titolo, descrizione, scaffale, copertina">
                    ✎ Scheda
                  </button>
                ) : (
                  <button className="adm-editbtn" disabled={busyCode === p.code} onClick={() => setCard(cardDraftFrom(p))} title="Nome pubblico (non terapeutico) e tag — il titolo clinico non cambia">
                    ✎ Scheda
                  </button>
                )}
                <button
                  className="adm-editbtn"
                  disabled={busyCode === p.code}
                  onClick={() => void openInStudio(p).catch((e) => setImportError((e as Error).message))}
                  title={studioFor(p, 24) || studioFor(p, 12) || studioFor(p, 6) ? 'Apri nello Studio la sessione salvata' : 'Apri nello Studio dalla timeline del protocollo'}
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
            )
          })}
        </div>
      )}
    </div>
  )
}
