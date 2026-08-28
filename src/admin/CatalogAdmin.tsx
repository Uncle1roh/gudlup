import { useEffect, useMemo, useState } from 'react'
import { useDataProvider } from '../data/provider'
import { useProtocols } from './hooks'
import { FAMILY_LABEL } from '../compose/types'
import { useRef } from 'react'
import { PlainImport } from './PlainImport'
import { DatasheetImport } from './DatasheetImport'
import { SpecImport } from './SpecImport'
import { parsePlainTimeline, probePlainTimeline, type PlainTimeline } from './plainTimeline'
import { audienceOf, durationState, mergedPlain, plainDurations, studioFor, type CatalogProtocol } from '../data/catalog'
import { applyDraft, draftFrom, EMPTY_DRAFT, LibraryEditor, type LibraryDraft } from './LibraryEditor'
import { ProtocolCardEditor, applyCardDraft, cardDraftError, type ProtocolCardDraft } from './ProtocolCard'
import { entryForPublish, familyFromCode } from './publishPlain'
import { saveProtocolVerified } from './publish'
import { takeReturnToProtocol } from './workscreenReturn'
import { LIBRARY_CATEGORIES } from '../data/library'
import { DURATION_TAG_IDS, durationTagLabel, filterByTags, tagLabel, tagsInUse, tagsOf } from '../data/tags'
import { CATALOG_DURATIONS } from '../data/catalog'
import type { Duration } from '../types/domain'

function tenantsLabel(p: CatalogProtocol): string {
  return p.tenants === 'all' ? 'Tutte le aziende' : `${p.tenants.length} aziend${p.tenants.length === 1 ? 'a' : 'e'}`
}

/**
 * A protocol that exists only because a Studio session was saved onto it, or
 * because "Crea nuovo" gave it a name.
 *
 * Nothing about it is publishable yet: no timeline, no rendered audio, nothing
 * a person could be given. It sits in the catalog as a DRAFT so it can be
 * found and worked on again, and it stays inactive until a duration is
 * published from its workscreen.
 */
function isDraft(p: CatalogProtocol): boolean {
  if (p.enabled) return false
  const hasAudio = p.versions.some((v) => v.audioUrl?.['pt-BR'])
  return !hasAudio && !mergedPlain(p) && !p.datasheet && !p.spec
}

/** What material the catalog holds for a protocol, in one short phrase. */
function materialLabel(p: CatalogProtocol): string {
  const bits: string[] = []
  const durs = plainDurations(p)
  if (durs.length) bits.push(`PLAIN ${durs.map((d) => `${d}m`).join('+')}`)
  else if (p.plain) bits.push('PLAIN (legacy)')
  if (p.datasheet) bits.push('Scheda dati')
  if (p.spec) bits.push('Documento')
  const studio = CATALOG_DURATIONS.filter((d) => studioFor(p, d))
  if (studio.length) bits.push(`Studio ${studio.map((d) => `${d}m`).join('+')}`)
  return bits.length ? bits.join(' · ') : 'nessun workbook'
}

const EMPTY_CARD: ProtocolCardDraft = { code: '', title: '', publicTitle: '', publicBlurb: '', tags: [] }

/** A GL code, the way the workbooks write it: "GL-ANX 1.1". */
const CODE_SHAPE = /^GL-[A-Z]{2,8}\s+\d+\.\d+$/

export function newProtocolError(draft: ProtocolCardDraft, taken: string[]): string | null {
  const code = draft.code.trim().toUpperCase()
  if (!code) return 'Serve un codice, per esempio "GL-ANX 1.1".'
  if (!CODE_SHAPE.test(code)) return `"${draft.code}" non è un codice valido — la forma è "GL-ANX 1.1".`
  if (taken.includes(code)) return `${code} esiste già nel catalogo.`
  return cardDraftError(draft)
}

/**
 * The catalog entry "Crea nuovo" writes.
 *
 * Empty on purpose: no versions, no workbook, no audio. It exists so the
 * protocol has a name and a home before any material arrives, and it is a
 * draft for the same reason a Studio save is — nothing has been published, so
 * there is nothing to give anyone yet.
 */
export function newProtocolEntry(draft: ProtocolCardDraft, now = Date.now()): CatalogProtocol {
  const code = draft.code.trim().toUpperCase()
  return {
    code,
    family: familyFromCode(code),
    title: draft.title.trim(),
    blurb: '',
    phases: [],
    versions: [],
    enabled: false,
    source: 'imported',
    tenants: 'all',
    audioReady: false,
    audience: 'clinical',
    publicTitle: draft.publicTitle.trim() || undefined,
    publicBlurb: draft.publicBlurb.trim() || undefined,
    tags: draft.tags,
    updatedAt: now,
  }
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
  /* Coming back from the Studio lands on the PROTOCOL, not on the list. The
     Studio leaves a note saying which one and which time signature; this reads
     it once, as soon as the catalog has the rows to find it in. */
  const [returning, setReturning] = useState(() => takeReturnToProtocol())
  useEffect(() => {
    if (!returning || !data) return
    const found = data.find((p) => p.code === returning.code)
    setReturning(null)
    if (!found) return
    setOpenAt(returning.duration ?? null)
    setOpened(found)
  }, [returning, data])

  /** The "Crea nuovo" dialog: the Scheda, filled in before anything exists. */
  const [creating, setCreating] = useState<ProtocolCardDraft | null>(null)
  const [savingNew, setSavingNew] = useState(false)
  /** The time signature the open file dialog is importing for. */
  const [importFor, setImportFor] = useState<Duration | null>(null)
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

      /*
       * Importing from INSIDE a protocol files the workbook under that
       * protocol, for the time signature that was selected.
       *
       * It used to replace the whole screen with the imported workbook — which
       * carries its own code and title — so importing the 12-minute file while
       * looking at GL-ANX 1.1 showed a different protocol's identity, lost the
       * 6-minute version from view, and reported a conflict. The screen knows
       * which protocol and which duration; the spreadsheet does not need to.
       */
      if (opened) {
        const proto = entryForPublish({
          timeline: res.timeline,
          existing: opened,
          selected: importFor ?? openAt ?? undefined,
          keepDraft: true,
          intoExisting: true,
        })
        const stored = await saveProtocolVerified(dp, proto)
        await dp.logAudit({
          actor, action: 'protocol.plain.imported', target: stored.code,
          detail: `${file.name} · ${importFor ?? openAt ?? '?'}m`,
        }).catch(() => undefined)
        setOpenAt(importFor ?? openAt ?? null)
        setOpened(stored)
        refetch()
        return
      }

      setImported({ timeline: res.timeline, fileName: file.name })
    } catch (e) {
      setImportError((e as Error).message)
    } finally {
      setImportFor(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  /** Create the protocol and go straight to its workscreen — that is where
      the Excel is imported and everything else happens. */
  async function createProtocol() {
    if (!creating) return
    const err = newProtocolError(creating, all.map((p) => p.code))
    if (err) { setImportError(err); return }
    setSavingNew(true)
    setImportError(null)
    try {
      const entry = newProtocolEntry(creating)
      const stored = await saveProtocolVerified(dp, entry)
      await dp.logAudit({ actor, action: 'protocol.created', target: entry.code, detail: entry.title }).catch(() => undefined)
      setCreating(null)
      refetch()
      setOpenAt(null)
      setOpened(stored)
    } catch (e) {
      setImportError((e as Error).message)
    } finally {
      setSavingNew(false)
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
        onImportExcel={(d) => { setImportFor(d); fileRef.current?.click() }}
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
        onImportExcel={(d) => { setImportFor(d); fileRef.current?.click() }}
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
          /* Creating a protocol starts with naming it, not with a spreadsheet.
             Importa Excel moved onto the workscreen, where the time signature
             being imported is already chosen — importing from here meant the
             file had to tell us which protocol it belonged to, and a file that
             names the wrong one is a bad way to find that out. */
          <button className="b2b-btn b2b-btn--primary" onClick={() => setCreating(EMPTY_CARD)}>
            ＋ Crea nuovo
          </button>
        ) : (
          <button className="b2b-btn b2b-btn--primary" onClick={() => setDraft(EMPTY_DRAFT)}>
            ＋ Nuovo audio
          </button>
        )}
        <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={(e) => void onImportFile(e.target.files?.[0])} />
        {creating && (
          <div className="adm-scrim" onClick={() => setCreating(null)} role="dialog" aria-modal="true">
            <div className="adm-dialog" onClick={(e) => e.stopPropagation()}>
              <h2 className="b2b-h2">Nuovo protocollo</h2>
              <label className="pe-field">
                <span className="pe-label">Codice <em>la forma è "GL-ANX 1.1"</em></span>
                <input
                  className="b2b-input adm-mono"
                  value={creating.code}
                  placeholder="GL-ANX 1.1"
                  autoFocus
                  onChange={(e) => setCreating({ ...creating, code: e.target.value.toUpperCase() })}
                />
              </label>
              <ProtocolCardEditor
                draft={creating}
                inline
                busy={savingNew}
                onChange={setCreating}
                onSave={() => void createProtocol()}
              />
              {newProtocolError(creating, all.map((x) => x.code)) && (
                <p className="pe-err">{newProtocolError(creating, all.map((x) => x.code))}</p>
              )}
              <div className="adm-dialog__actions">
                <button className="b2b-btn" disabled={savingNew} onClick={() => setCreating(null)}>Annulla</button>
                <button
                  className="b2b-btn b2b-btn--primary"
                  disabled={savingNew || !!newProtocolError(creating, all.map((x) => x.code))}
                  onClick={() => void createProtocol()}
                >
                  {savingNew ? 'Creazione…' : 'Crea'}
                </button>
              </div>
            </div>
          </div>
        )}
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
              {/* One pill per TIME SIGNATURE, and ALWAYS all three. Grey = no
                  Excel imported for it, red = saved but not on the air, green =
                  a person can play it. Showing only the durations a protocol
                  happened to declare meant a new protocol showed none at all. */}
              <div className="adm-durs" onClick={(e) => e.stopPropagation()}>
                {CATALOG_DURATIONS.map((d) => {
                  const st = durationState(p, d)
                  return (
                    <button
                      key={d}
                      className={`adm-pill adm-pill--btn ${st === 'published' ? 'adm-pill--live' : st === 'saved' ? 'adm-pill--saved' : 'adm-pill--idle'}`}
                      title={
                        st === 'published'
                          ? `${d} min — pubblicato, in ascolto`
                          : st === 'saved'
                            ? `${d} min — salvato, non ancora pubblicato · apri questa versione`
                            : `${d} min — nessun Excel importato · apri per caricarlo`
                      }
                      onClick={() => { setOpenAt(d); setOpened(p) }}
                    >
                      {d}m
                    </button>
                  )
                })}
              </div>
              <div>{tenantsLabel(p)}</div>
              <div>
                {isDraft(p)
                  ? <span className="adm-pill adm-pill--warn">Bozza</span>
                  : p.source === 'imported'
                    ? <span className="adm-pill adm-pill--info">Importato</span>
                    : <span className="adm-tag">Di serie</span>}
                {/* WHICH workbook is behind the row. A protocol can play
                    perfectly from an attached mixdown while carrying no PLAIN
                    timeline at all, and until this line existed the only way to
                    find that out was to open it and read an error. */}
                <div className="adm-tag">{materialLabel(p)}</div>
              </div>
              <div className="adm-tr__right" onClick={(e) => e.stopPropagation()}>
                {/* Scheda and Modifica used to live here. Both are on the
                    protocol's own workscreen now, which is one click away and
                    is where everything else about the protocol already is.
                    Two ways in meant deciding, on the list, which of them a
                    row wanted — and the list is not where that is known. A
                    library entry keeps its editor: it has no workscreen. */}
                {shelf === 'library' && (
                  <button className="adm-editbtn" disabled={busyCode === p.code} onClick={() => setDraft(draftFrom(p))} title="Titolo, descrizione, scaffale, copertina">
                    ✎ Scheda
                  </button>
                )}
                {/* A draft cannot be switched on: there is nothing behind it to
                    give anyone. Publishing a duration is what activates it, and
                    the toggle says so instead of failing silently. */}
                <button
                  className={`adm-toggle ${p.enabled ? 'is-on' : ''}`}
                  disabled={busyCode === p.code || isDraft(p)}
                  onClick={() => toggle(p)}
                  title={isDraft(p)
                    ? 'Bozza — pubblica una durata dalla schermata del protocollo per attivarlo'
                    : p.enabled ? 'Attivo — clicca per disattivare' : 'Disattivato — clicca per attivare'}
                >
                  <span className="adm-toggle__knob" />
                  <span className="adm-toggle__txt">{isDraft(p) ? 'Bozza' : p.enabled ? 'Attivo' : 'Disattivato'}</span>
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
