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
import { setStudioSeed } from '../compose/handoff'
import { attachRenderedAudio } from './attachAudio'
import type { Duration, ProtocolFamily, SessionPhase } from '../types/domain'
import type { CatalogProtocol } from '../data/catalog'
import { listAssets } from './assets'
import { buildAssetPools, loadAssetMeta, type AssetPools } from './assetPools'
import { plainToStudioTracks } from './plainStudio'
import { plainWavFileName, renderPlainWav } from './renderPlain'
import { secToMmss, type PlainTimeline, type PlainVersion } from './plainTimeline'

interface Props {
  timeline: PlainTimeline
  fileName: string
  actor: string
  onCancel: () => void
  onDone: () => void
  /** Opens the catalog's Import Excel file dialog directly (no page). */
  onImportExcel?: () => void
  /** The catalog's hidden file input, mounted here so the dialog works
      while this screen is the one on display. */
  fileInput?: import('react').ReactNode
}

const FAMILIES: ProtocolFamily[] = ['GL-ANX', 'GL-DEP', 'GL-BURN', 'GL-STRESS', 'GL-RESIL']

function familyFromCode(code: string | null): ProtocolFamily {
  const fam = (code ?? '').split(/\s+/)[0] as ProtocolFamily
  return FAMILIES.includes(fam) ? fam : 'GL-ANX'
}

function phasesForCatalog(v: PlainVersion): SessionPhase[] {
  if (v.phases.length !== 6) return []
  return v.phases.map((p) => ({
    id: p.fase as SessionPhase['id'],
    name: p.label,
    fraction: Math.max(0.01, (p.endS - p.startS) / Math.max(1, v.durationS)),
    showOrb: p.fase === 2,
  }))
}

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function PlainImport({ timeline: t, fileName, actor, onCancel, onDone, onImportExcel, fileInput }: Props) {
  const dp = useDataProvider()
  const [ttsTick, setTtsTick] = useState(0)
  const tts = useMemo(() => getTtsProvider(), [ttsTick])

  const errors = t.issues.filter((i) => i.level === 'error')
  const nonErrors = t.issues.filter((i) => i.level !== 'error')

  /* one selected version (chips only when the workbook has several) */
  const [sheet, setSheet] = useState<string>(t.versions[0]?.sheet ?? '')
  const version = t.versions.find((v) => v.sheet === sheet) ?? t.versions[0]

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
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [notes, setNotes] = useState<string[]>([])

  /* ---- published state (auto-detected for catalog reopens) ---- */
  const [published, setPublished] = useState<CatalogProtocol | null>(null)
  const [live, setLive] = useState(false)
  useEffect(() => {
    if (!t.code) return
    let alive = true
    void dp.listProtocols()
      .then((ps) => {
        const existing = ps.find((p) => p.code === t.code)
        if (alive && existing?.plain) {
          setPublished(existing)
          setLive(existing.versions.some((v) => v.audioUrl?.['pt-BR']))
        }
      })
      .catch(() => undefined)
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.code])

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

  /* ---- actions ------------------------------------------------------- */

  function editInStudio() {
    if (!version) return
    try {
      const seed = plainToStudioTracks(t, version, { pools: pools ?? undefined })
      const dur = version.durationMin === 6 || version.durationMin === 12 || version.durationMin === 24 ? (version.durationMin as Duration) : undefined
      setStudioSeed(seed.tracks, seed.name, t.code && dur ? { code: t.code, duration: dur } : undefined, undefined, { returnTo: '#admin' })
      setNotes(seed.notes)
      window.location.hash = '#studio'
    } catch (e) {
      setError(explain(e))
    }
  }

  async function publishToCatalog(): Promise<CatalogProtocol> {
    if (!t.code) throw new Error('Il file non ha un codice GL (foglio README) — serve per pubblicare.')
    const durations = t.versions
      .map((v) => v.durationMin)
      .filter((d): d is Duration => d === 6 || d === 12 || d === 24)
    const phased = t.versions.find((v) => v.phases.length === 6) ?? t.versions[0]
    const existing = (await dp.listProtocols().catch(() => [] as CatalogProtocol[])).find((p) => p.code === t.code)
    const versions = (durations.length ? durations : [12 as Duration]).map((d) => {
      const prev = existing?.versions.find((v) => v.duration === d)
      return prev?.audioUrl ? { duration: d, audioUrl: prev.audioUrl } : { duration: d }
    })
    const proto: CatalogProtocol = {
      code: t.code,
      family: familyFromCode(t.code),
      title: (t.title ?? t.code).trim(),
      blurb: existing?.blurb ?? '',
      phases: phasesForCatalog(phased),
      versions,
      enabled: true,
      source: 'imported',
      tenants: 'all',
      audioReady: existing?.audioReady ?? false,
      spec: existing?.spec,
      datasheet: existing?.datasheet,
      plain: t,
      assetMap: existing?.assetMap,
      updatedAt: Date.now(),
    }
    // verified: a write rejected by RLS used to leave a protocol that looked
    // published until the next screen change
    const stored = await saveProtocolVerified(dp, proto)
    await dp.logAudit({ actor, action: 'protocol.plain.imported', target: proto.code, detail: fileName }).catch(() => undefined)
    setPublished(stored)
    return stored
  }

  /** Publish = the WHOLE pipeline: catalog entry → render (with voice) →
      upload & attach → live in the app. */
  async function publish() {
    if (!version) return
    setBusy(true)
    setError(null)
    setLive(false)
    try {
      setStatus('Pubblicazione nel catalogo…')
      const proto = await publishToCatalog()
      const dur = version.durationMin as Duration
      if (dur !== 6 && dur !== 12 && dur !== 24) throw new Error(`${version.durationMin} min non è una durata di catalogo (6/12/24).`)
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
      await attachRenderedAudio(dp, proto.code, dur, audioBuffer)
      await dp.logAudit({ actor, action: 'protocol.audio.attached', target: proto.code, detail: `plain · ${dur} min` }).catch(() => undefined)
      setLive(true)
      setStatus(`In linea — ${proto.code} ora viene riprodotto nell’app dei dipendenti e nelle sedute monitorate${mastered ? ` (file masterizzato "${mastered.name}")` : ''}.${persistenceNote() ?? ''}`)
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

  const disabled = busy || errors.length > 0 || poolsLoading

  return (
    <div className="adm-page adm-plain">
      <header className="adm-plain__head">
        <button className="b2b-btn b2b-btn--ghost" onClick={onCancel}>←</button>
        <div className="adm-plain__id">
          <span className="adm-plain__code">{t.code ?? fileName}</span>
          {t.title && <span className="adm-plain__title">{t.title}</span>}
          <span className="adm-plain__meta">
            {version ? `${version.durationMin} min (${secToMmss(version.durationS)}) · ${version.clips.length} clip` : ''}
            {live ? ' · in linea ✓' : published ? ' · pubblicato' : ''}
          </span>
        </div>
        {t.versions.length > 1 && (
          <div className="adm-plain__chips">
            {t.versions.map((v) => (
              <button key={v.sheet} className={`b2b-btn${sheet === v.sheet ? ' b2b-btn--primary' : ''}`} onClick={() => setSheet(v.sheet)}>
                {v.durationMin}m
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="adm-plain__actions adm-plain__actions--5">
        <button className="adm-plain__act" onClick={onImportExcel ?? onCancel} disabled={busy}>
          <span className="adm-plain__act-ico">⬆</span> Importa Excel
        </button>
        <button className="adm-plain__act" onClick={editInStudio} disabled={disabled} title={poolsLoading ? 'Caricamento della libreria sonora…' : undefined}>
          <span className="adm-plain__act-ico">🎚</span> Modifica nello Studio
        </button>
        <button className="adm-plain__act" onClick={() => void download()} disabled={disabled}>
          <span className="adm-plain__act-ico">⬇</span> Scarica
        </button>
        <button
          className={`adm-plain__act${mastered ? ' adm-plain__act--done' : ''}`}
          onClick={() => masteredRef.current?.click()}
          disabled={busy}
          title="Carica il WAV/MP3 masterizzato esternamente — Pubblica userà esattamente questo file"
        >
          <span className="adm-plain__act-ico">🎧</span> {mastered ? 'Masterizzato ✓' : 'Carica masterizzato'}
        </button>
        <button className="adm-plain__act adm-plain__act--primary" onClick={() => void publish()} disabled={disabled}>
          <span className="adm-plain__act-ico">🚀</span> Pubblica
        </button>
        <input ref={masteredRef} type="file" accept="audio/*,.wav,.mp3,.flac,.m4a" hidden onChange={(e) => void onMasteredFile(e.target.files?.[0])} />
        {fileInput}
      </div>
      {mastered && !live && (
        <div className="adm-plain__status">File masterizzato caricato: <b>{mastered.name}</b> ({secToMmss(Math.round(mastered.buffer.duration))}) — Pubblica userà questo file. <a href="#clear" onClick={(e) => { e.preventDefault(); setMastered(null) }}>Usa invece il render dell’app</a></div>
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
