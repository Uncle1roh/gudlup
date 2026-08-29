/* The PLAIN protocol workscreen — deliberately minimal (PO feedback):
   after the catalog list, the admin sees ONE line of identity and FOUR
   actions — Import Excel · Edit in Studio · Publish · Download — nothing
   else. Publish is the whole pipeline in one press (catalog entry with the
   full timeline → offline render with voice → 192 kbps upload → live in the
   employee app and monitored sessions). Download renders the same WAV
   locally. Everything technical (validation issues, seeding decisions,
   render notes, the voice-engine key) lives behind a collapsed "Details". */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useDataProvider } from '../data/provider'
import { persistenceNote, saveProtocolVerified } from './publish'
import { getTtsProvider } from '../tts'
import { VoiceEnginePanel } from '../tts/VoiceEnginePanel'
import { hasSupabaseEnv } from '../auth/supabaseClient'
import { setStudioSeed, setStudioProject } from '../compose/handoff'
import { attachRenderedAudio } from './attachAudio'
import type { Duration } from '../types/domain'
import {
  CATALOG_DURATIONS,
  durationState,
  catalogDuration,
  plainDurations,
  plainFor,
  studioFor,
  timelinesByDuration,
  type CatalogProtocol,
  type DurationState,
} from '../data/catalog'
import { entryForPublish } from './publishPlain'
import { ProtocolCardEditor, cardDraftFrom, applyCardDraft, type ProtocolCardDraft } from './ProtocolCard'
import { listAssets } from './assets'
import { buildAssetPools, loadAssetMeta, type AssetPools } from './assetPools'
import { plainToStudioTracks } from './plainStudio'
import { plainWavFileName, renderPlainWav } from './renderPlain'
import { secToMmss, type PlainTimeline } from './plainTimeline'

interface Props {
  timeline: PlainTimeline
  /** Time signature to land on (a duration pill was clicked in the catalog).
      Falls back to the timeline's first version. */
  initialDuration?: Duration
  fileName: string
  actor: string
  onCancel: () => void
  onDone: () => void
  /** Opens the catalog's Import Excel file dialog for the SELECTED duration.
      The screen knows which time signature is being worked on; the file does
      not, and asking the spreadsheet was what produced the conflict. */
  onImportExcel?: (duration: Duration) => void
  /** The catalog's hidden file input, mounted here so the dialog works
      while this screen is the one on display. */
  fileInput?: import('react').ReactNode
  /** A refusal from the catalog's importer — most often "this Excel belongs to
      another protocol". It was set on the list screen while THIS screen was
      the one on display, so the import simply appeared to do nothing. */
  notice?: string | null
  onDismissNotice?: () => void
}

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function PlainImport({ timeline: t, initialDuration, fileName, actor, onCancel, onDone, onImportExcel, fileInput, notice, onDismissNotice }: Props) {
  const dp = useDataProvider()
  const [ttsTick, setTtsTick] = useState(0)
  const tts = useMemo(() => getTtsProvider(), [ttsTick])

  const errors = t.issues.filter((i) => i.level === 'error')
  const nonErrors = t.issues.filter((i) => i.level !== 'error')

  /* one selected version — the TIME SIGNATURE being worked on. Chips appear
     whenever the workbook (or the catalog entry it reopens) carries more than
     one, and every action below applies to this one alone. */
  /* The screen is on a TIME SIGNATURE, not on a sheet.
     A protocol always has 6, 12 and 24 — whether or not an Excel has been
     imported for them — so an empty one has to be selectable: choosing it is
     how you say which duration the file you are about to import belongs to.
     Keying the selection to a sheet meant a duration with no sheet could not
     be pointed at, which is why importing the second workbook was guesswork. */
  const [picked, setPicked] = useState<Duration>(
    initialDuration ?? (catalogDuration(t.versions[0]?.durationMin ?? 12) ?? 12),
  )
  const version = t.versions.find((v) => catalogDuration(v.durationMin) === picked)
  const versionDuration = version ? catalogDuration(version.durationMin) : picked

  /* ---- asset pools (draw happens at seed/render — gate until ready) ---- */
  const [pools, setPools] = useState<AssetPools | null>(null)
  const [poolsState, setPoolsState] = useState<'loading' | 'ready' | 'failed' | 'mock'>(hasSupabaseEnv() ? 'loading' : 'mock')
  const [poolsTick, setPoolsTick] = useState(0)
  useEffect(() => {
    if (!hasSupabaseEnv()) return
    let alive = true
    setPoolsState('loading')
    void (async () => {
      try {
        const [assets, meta] = await Promise.all([listAssets(), loadAssetMeta()])
        if (!alive) return
        setPools(buildAssetPools(assets, meta))
        setPoolsState('ready')
      } catch {
        if (alive) setPoolsState('failed')
      }
    })()
    return () => { alive = false }
  }, [poolsTick])
  const poolsLoading = poolsState === 'loading'

  /* ---- status line (single, replaces all the old cards) ---- */
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /* Open by default when there is no timeline: the Scheda is the only thing
     on this screen that can still be edited, and leaving it folded away under
     a toggle is what made the protocol look like it had nothing to offer. */
  const [detailsOpen, setDetailsOpen] = useState(t.versions.length === 0)
  const [notes, setNotes] = useState<string[]>([])

  /* ---- published state (auto-detected for catalog reopens) ----
     Tracked PER TIME SIGNATURE: "in linea" means this duration's audio is
     attached, not that some other duration's is. */
  const [published, setPublished] = useState<CatalogProtocol | null>(null)
  useEffect(() => {
    if (!t.code) return
    let alive = true
    void dp.listProtocols()
      .then((ps) => {
        const existing = ps.find((p) => p.code === t.code)
        if (alive && existing) setPublished(existing)
      })
      .catch(() => undefined)
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.code])

  /** Durations of this protocol that already stream audio. */
  const liveDurations = useMemo(() => {
    const set = new Set<Duration>()
    for (const v of published?.versions ?? []) if (v.audioUrl?.['pt-BR']) set.add(v.duration)
    return set
  }, [published])
  const live = versionDuration != null && liveDurations.has(versionDuration)
  const publishedDurations = useMemo(
    () => (published ? new Set(Object.keys(timelinesByDuration(published)).map(Number) as Duration[]) : new Set<Duration>()),
    [published],
  )

  /**
   * EVERY time signature this protocol has, not only the ones with a timeline.
   *
   * The chips used to be built from the workbook alone and only appeared when
   * it carried more than one version. So a protocol whose 6-minute PLAIN sheet
   * had been imported showed a single chip — or none — with no hint that 12 and
   * 24 existed at all, and the screen read as though the protocol were
   * six-minute-only. The catalog knows better: it lists the versions, and the
   * ones without a sheet are shown as unavailable rather than hidden.
   */
  const sheetByDuration = useMemo(() => {
    const m = new Map<Duration, string>()
    for (const v of t.versions) {
      const d = catalogDuration(v.durationMin)
      if (d != null && !m.has(d)) m.set(d, v.sheet)
    }
    return m
  }, [t])

  /**
   * What each time signature is, for the chips.
   *
   * The catalog is asked first — it knows what has been saved and what is on
   * the air — and the workbook on screen counts as saved for whatever it
   * carries, so a file just imported turns its chip red before anything has
   * been written anywhere.
   */
  function stateOf(d: Duration): DurationState {
    const stored = published ? durationState(published, d) : 'empty'
    if (stored !== 'empty') return stored
    return sheetByDuration.has(d) ? 'saved' : 'empty'
  }

  function explain(e: unknown): string {
    const msg = (e as Error)?.message ?? String(e)
    if (/plain|datasheet|asset_map|PGRST204|42703|column .* does not exist|schema cache/i.test(msg)) {
      return `${msg} — esegui la versione aggiornata di supabase/setup.sql e riprova.`
    }
    if (/row-level security|RLS|permission|policy/i.test(msg)) {
      return `${msg} — accedi come amministratore del catalogo (admin@goodloop.app).`
    }
    return msg
  }

  /* ---- externally-mastered file (PO workflow: download WAV → masterize
     outside → upload the mastered version → Publish ships THAT file) ---- */
  const [mastered, setMastered] = useState<{ name: string; buffer: AudioBuffer } | null>(null)
  const masteredRef = useRef<HTMLInputElement>(null)

  async function onMasteredFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const bytes = await file.arrayBuffer()
      const ctx = new AudioContext()
      try {
        const buffer = await ctx.decodeAudioData(bytes)
        if (version && Math.abs(buffer.duration - version.durationS) > 20) {
          setStatus(`Nota: "${file.name}" dura ${secToMmss(Math.round(buffer.duration))} — la versione del protocollo dura ${secToMmss(version.durationS)}.`)
        } else {
          setStatus(null)
        }
        setMastered({ name: file.name, buffer })
      } finally {
        await ctx.close().catch(() => undefined)
      }
    } catch (e) {
      setError(`Impossibile leggere "${file.name}" come audio: ${(e as Error).message}`)
    } finally {
      setBusy(false)
      if (masteredRef.current) masteredRef.current.value = ''
    }
  }

  /* ---- public card (non-therapeutic name + tags) ---- */
  const [card, setCard] = useState<ProtocolCardDraft | null>(null)
  const [savingCard, setSavingCard] = useState(false)
  useEffect(() => { if (published && !card) setCard(cardDraftFrom(published)) }, [published]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveCard() {
    if (!card || !published) return
    setSavingCard(true)
    setError(null)
    try {
      const stored = await saveProtocolVerified(dp, applyCardDraft(card, published))
      setPublished(stored)
      setCard(cardDraftFrom(stored))
      await dp.logAudit({ actor, action: 'protocol.card.updated', target: stored.code, detail: stored.publicTitle ?? '(nessun nome pubblico)' }).catch(() => undefined)
      setStatus('Scheda pubblica salvata.')
    } catch (e) {
      setError(explain(e))
    } finally {
      setSavingCard(false)
    }
  }

  /* ---- actions ------------------------------------------------------- */

  /**
   * Attach this workbook to the protocol WITHOUT publishing it.
   *
   * The timeline used to reach the catalog only through Publish, so a PO who
   * imported an Excel, went to the Studio and saved found the session stored
   * against a protocol that had no workbook — and had to import the same file
   * again later. The import IS the work; it belongs to the protocol from the
   * moment it is read.
   *
   * The protocol stays a draft: `keepDraft` leaves `enabled` alone rather than
   * switching it on, because nothing has been rendered yet. Publishing is
   * still what puts a time signature on the air.
   */
  async function attachTimeline(): Promise<CatalogProtocol | null> {
    if (!t.code) return null
    try {
      const existing = (await dp.listProtocols().catch(() => [] as CatalogProtocol[])).find((p) => p.code === t.code)
      const proto = entryForPublish({ timeline: t, existing, selected: versionDuration, keepDraft: true, intoExisting: true })
      const stored = await saveProtocolVerified(dp, proto)
      setPublished(stored)
      return stored
    } catch (e) {
      setError(explain(e))
      return null
    }
  }

  async function editInStudio() {
    if (!version) return
    try {
      const dur = version.durationMin === 6 || version.durationMin === 12 || version.durationMin === 24 ? (version.durationMin as Duration) : undefined
      const attach = t.code && dur ? { code: t.code, duration: dur } : undefined

      /* The workbook goes onto the protocol before the Studio opens, so the
         session about to be saved has something to belong to. */
      const stored = hasTimeline ? await attachTimeline() : null

      /* A session already saved for THIS time signature wins over a fresh seed
         from the workbook. Reseeding would silently discard hand edits — and
         re-draw every random asset, so the mix would not even be the same one
         the PO left. Only a duration with nothing saved is seeded. */
      const saved = dur ? studioFor(stored ?? published ?? undefined, dur) : undefined
      if (saved) {
        setStudioProject(saved, attach, '#admin')
        window.location.hash = '#studio'
        return
      }

      const seed = plainToStudioTracks(t, version, { pools: pools ?? undefined })
      setStudioSeed(seed.tracks, seed.name, attach, undefined, { returnTo: '#admin' })
      setNotes(seed.notes)
      window.location.hash = '#studio'
    } catch (e) {
      setError(explain(e))
    }
  }

  /**
   * Write the catalog entry for the workbook on screen WITHOUT disturbing the
   * other time signatures.
   *
   * The same protocol ships as a 6-, a 12- and a 24-minute session, and each
   * one is its own workbook. This used to rebuild `versions` from the workbook
   * being published and replace `plain` with it, so publishing the 12-minute
   * file deleted the 6- and 24-minute rows — and the audio already attached to
   * them. Now: the incoming durations are MERGED into whatever the catalog
   * already has, and each duration's timeline lands in its own slot.
   */
  async function publishToCatalog(): Promise<CatalogProtocol> {
    const existing = (await dp.listProtocols().catch(() => [] as CatalogProtocol[])).find((p) => p.code === t.code)
    /* The merge rule lives in `publishPlain.ts` so it can be executed against
       assertions rather than argued about — including the one that matters
       here: every duration written can be read back with `plainFor`, which is
       what the Studio reopens through. */
    const proto = entryForPublish({ timeline: t, existing, selected: versionDuration })
    const durations = plainDurations(proto)
    // verified: a write rejected by RLS used to leave a protocol that looked
    // published until the next screen change
    const stored = await saveProtocolVerified(dp, proto)

    /* A publish that cannot be reopened is the failure this screen exists to
       prevent, so it is checked against what came BACK from the catalog rather
       than against what we sent. */
    const unreadable = (versionDuration != null ? [versionDuration] : durations).filter((d) => !plainFor(stored, d))
    if (unreadable.length) {
      throw new Error(
        `Salvato, ma ${unreadable.map((d) => `${d}m`).join(' · ')} non si rilegge dal catalogo — ` +
        'la colonna plain_by_duration non è aggiornata: esegui di nuovo supabase/setup.sql e ripubblica.',
      )
    }

    await dp.logAudit({
      actor,
      action: 'protocol.plain.imported',
      target: proto.code,
      detail: `${fileName} · ${durations.length ? durations.map((d) => `${d}m`).join('+') : 'nessuna durata di catalogo'}`,
    }).catch(() => undefined)
    setPublished(stored)
    return stored
  }

  /** Publish = the WHOLE pipeline for the SELECTED time signature: catalog
      entry → render (with voice) → upload & attach → live in the app. The other
      durations of this protocol are left exactly as they are. */
  async function publish() {
    if (!version) return
    setBusy(true)
    setError(null)
    try {
      setStatus('Pubblicazione nel catalogo…')
      const proto = await publishToCatalog()
      const dur = versionDuration
      if (dur == null) throw new Error(`${version.durationMin} min non è una durata di catalogo (6/12/24).`)
      let audioBuffer: AudioBuffer
      if (mastered) {
        // the externally-mastered upload IS the published audio
        setStatus(`Uso il file masterizzato "${mastered.name}"…`)
        audioBuffer = mastered.buffer
      } else {
        if (!tts.canRender) {
          setDetailsOpen(true)
          throw new Error('Il motore vocale non ha una chiave — imposta la chiave ElevenLabs in Dettagli e premi di nuovo Pubblica (oppure carica un file masterizzato).')
        }
        const result = await renderPlainWav(t, version, {
          pools: pools ?? undefined,
          withVoice: true,
          onProgress: setStatus,
        })
        setNotes(result.notes)
        audioBuffer = result.buffer
      }
      setStatus('Caricamento della copia per lo streaming…')
      const attached = await attachRenderedAudio(dp, proto.code, dur, audioBuffer)
      setPublished(attached.protocol)
      await dp.logAudit({ actor, action: 'protocol.audio.attached', target: proto.code, detail: `plain · ${dur} min` }).catch(() => undefined)
      const others = [...liveDurations].filter((d) => d !== dur).sort((a, b) => a - b)
      setStatus(
        `In linea — ${proto.code} · ${dur} min ora viene riprodotto nell’app dei dipendenti e nelle sedute monitorate${mastered ? ` (file masterizzato "${mastered.name}")` : ''}.` +
        (others.length ? ` Le versioni da ${others.map((d) => `${d}`).join(' e ')} min restano invariate.` : '') +
        (persistenceNote() ?? ''),
      )
    } catch (e) {
      setStatus(null)
      setError(explain(e))
    } finally {
      setBusy(false)
    }
  }

  /** Download = the same full render, saved locally as WAV. */
  async function download() {
    if (!version) return
    setBusy(true)
    setError(null)
    try {
      const result = await renderPlainWav(t, version, {
        pools: pools ?? undefined,
        withVoice: tts.canRender,
        onProgress: setStatus,
      })
      setNotes(result.notes)
      if (!tts.canRender) setStatus('Renderizzato SENZA voce (nessuna chiave del motore vocale — vedi Dettagli).')
      else setStatus(null)
      downloadBlob(plainWavFileName(t.code, version.sheet), result.blob)
    } catch (e) {
      setStatus(null)
      setError(explain(e))
    } finally {
      setBusy(false)
    }
  }

  /*
   * The four actions operate on the SELECTED time signature, so they are gated
   * on that one having material — not on the workbook carrying something,
   * anything, somewhere.
   *
   * That was the conflicting message: with the 6-minute file imported and the
   * 12-minute chip selected, the buttons lit up because a timeline existed,
   * while everything they would act on was empty.
   */
  const hasTimeline = !!version
  const disabled = busy || !hasTimeline || errors.length > 0 || poolsLoading
  const noTimelineWhy = hasTimeline
    ? undefined
    : `Nessun Excel importato per la versione da ${picked} minuti — usa Importa Excel.`

  return (
    <div className="adm-page adm-plain">
      <header className="adm-plain__head">
        <button className="b2b-btn b2b-btn--ghost" onClick={onCancel}>←</button>
        <div className="adm-plain__id">
          <span className="adm-plain__code">{t.code ?? fileName}</span>
          {t.title && <span className="adm-plain__title">{t.title}</span>}
          {published?.publicTitle && <span className="adm-plain__title">· «{published.publicTitle}»</span>}
          <span className="adm-plain__meta">
            {version ? `${version.durationMin} min (${secToMmss(version.durationS)}) · ${version.clips.length} clip` : ''}
            {live ? ' · in linea ✓' : versionDuration != null && publishedDurations.has(versionDuration) ? ' · pubblicato' : ''}
          </span>
        </div>
        {/* One chip per TIME SIGNATURE, and ALWAYS all three. A protocol ships
            as a 6-, a 12- and a 24-minute session whether or not an Excel has
            arrived for each, so all three are here from the start:

              grey   nothing imported yet — pick it, then Importa Excel
              red    saved, not on the air
              green  published; a person can play it

            Every action on this screen applies to the selected one alone, and
            an EMPTY signature is selectable on purpose: choosing it is how you
            say which duration the file you are about to import belongs to. */}
        <div className="adm-plain__chips">
          {CATALOG_DURATIONS.map((d) => {
            const st = stateOf(d)
            const on = picked === d
            return (
              <button
                key={d}
                className={`b2b-btn${on ? ' b2b-btn--primary' : ''} adm-plain__chip--${st === 'published' ? 'live' : st}`}
                onClick={() => { setPicked(d); onDismissNotice?.() }}
                title={
                  st === 'published'
                    ? `${d} min — pubblicato, in ascolto`
                    : st === 'saved'
                      ? `${d} min — salvato, non ancora pubblicato`
                      : `${d} min — nessun Excel importato. Selezionalo e usa Importa Excel.`
                }
              >
                {d}m
              </button>
            )
          })}
        </div>
      </header>

      <div className="adm-plain__actions adm-plain__actions--5">
        <button
          className="adm-plain__act"
          onClick={() => (onImportExcel ? onImportExcel(picked) : onCancel())}
          disabled={busy}
          title={`Importa il file Excel della versione da ${picked} minuti`}
        >
          <span className="adm-plain__act-ico">⬆</span> Importa Excel · {picked}m
        </button>
        <button className="adm-plain__act" onClick={() => void editInStudio()} disabled={disabled} title={noTimelineWhy ?? (poolsLoading ? 'Caricamento della libreria sonora…' : undefined)}>
          <span className="adm-plain__act-ico">🎚</span> Modifica nello Studio
        </button>
        <button className="adm-plain__act" onClick={() => void download()} disabled={disabled} title={noTimelineWhy}>
          <span className="adm-plain__act-ico">⬇</span> Scarica
        </button>
        <button
          className={`adm-plain__act${mastered ? ' adm-plain__act--done' : ''}`}
          onClick={() => masteredRef.current?.click()}
          disabled={disabled}
          data-why={noTimelineWhy}
          title="Carica il WAV/MP3 masterizzato esternamente — Pubblica userà esattamente questo file"
        >
          <span className="adm-plain__act-ico">🎧</span> {mastered ? 'Masterizzato ✓' : 'Carica masterizzato'}
        </button>
        <button className="adm-plain__act adm-plain__act--primary" onClick={() => void publish()} disabled={disabled} title={noTimelineWhy}>
          <span className="adm-plain__act-ico">🚀</span> Pubblica
        </button>
        <input ref={masteredRef} type="file" accept="audio/*,.wav,.mp3,.flac,.m4a" hidden onChange={(e) => void onMasteredFile(e.target.files?.[0])} />
        {fileInput}
      </div>
      {notice && (
        <div className="adm-plain__status adm-plain__status--err">
          {notice}
          {onDismissNotice && (
            <> <a href="#dismiss" onClick={(e) => { e.preventDefault(); onDismissNotice() }}>Chiudi</a></>
          )}
        </div>
      )}

      {mastered && !live && (
        <div className="adm-plain__status">File masterizzato caricato: <b>{mastered.name}</b> ({secToMmss(Math.round(mastered.buffer.duration))}) — Pubblica userà questo file. <a href="#clear" onClick={(e) => { e.preventDefault(); setMastered(null) }}>Usa invece il render dell’app</a></div>
      )}

      {!hasTimeline && (
        <div className="adm-plain__status">
          Nessun Excel importato per la versione da <b>{picked} minuti</b>. Usa <b>Importa Excel · {picked}m</b> per
          caricarlo — le altre durate non vengono toccate.
        </div>
      )}

      {poolsLoading && <div className="adm-plain__status">Caricamento della libreria sonora…</div>}
      {poolsState === 'failed' && (
        <div className="adm-plain__status adm-plain__status--err">
          Libreria sonora irraggiungibile — le clip risulterebbero mute. <button className="b2b-btn" onClick={() => setPoolsTick((n) => n + 1)}>Riprova</button>
        </div>
      )}
      {status && <div className="adm-plain__status">{status}</div>}
      {error && <div className="adm-plain__status adm-plain__status--err">{error}</div>}
      {errors.length > 0 && (
        <div className="adm-plain__status adm-plain__status--err">
          Il file ha {errors.length} error{errors.length === 1 ? 'e' : 'i'} — correggi l’Excel e importa di nuovo.
          <ul className="adm-spec__issues">
            {errors.map((i, k) => <li key={k}>{i.sheet ? `[${i.sheet}] ` : ''}{i.clipId ? `${i.clipId}: ` : ''}{i.message}</li>)}
          </ul>
        </div>
      )}

      <div className="adm-plain__details">
        <button className="adm-plain__toggle" onClick={() => setDetailsOpen((o) => !o)}>
          {detailsOpen ? '▾' : '▸'} Dettagli
        </button>
        {detailsOpen && (
          <div className="adm-plain__detailbody">
            {card && published ? (
              <ProtocolCardEditor
                draft={card}
                busy={savingCard}
                inline
                onChange={setCard}
                onSave={() => void saveCard()}
              />
            ) : (
              <p className="b2b-sub">Nome pubblico e tag si impostano dopo la prima pubblicazione.</p>
            )}
            <VoiceEnginePanel onChanged={() => setTtsTick((n) => n + 1)} />
            {nonErrors.length > 0 && (
              <ul className="adm-spec__issues">
                {nonErrors.map((i, k) => <li key={k}>{i.sheet ? `[${i.sheet}] ` : ''}{i.clipId ? `${i.clipId}: ` : ''}{i.message}</li>)}
              </ul>
            )}
            {notes.length > 0 && (
              <ul className="adm-spec__issues">
                {notes.map((n, k) => <li key={k}>{n}</li>)}
              </ul>
            )}
            {live && <button className="b2b-btn" onClick={onDone}>Torna al catalogo</button>}
          </div>
        )}
      </div>
    </div>
  )
}
