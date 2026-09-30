/* ============================================================================
   Good Loop — Datasheet importer (admin console)
   The .xlsx half of the import pipeline: a parsed Protocol Datasheet workbook
   is reviewed (identity, invariants, per-version parameters + timeline status,
   phases, affirmations, music map, validation issues), published to the shared
   catalog (datasheet + derived legacy spec, so every existing surface keeps
   working), and rendered with Renderer v3 — real mapped assets, heartbeat and
   singing-bowl layers, per-version fades — then uploaded as the 192 kbps
   streaming copy.
   ============================================================================ */

import { useEffect, useMemo, useState } from 'react'
import { useDataProvider } from '../data/provider'
import { registerProtocol } from '../data/protocols'
import { getTtsProvider } from '../tts'
import { VoiceEnginePanel } from '../tts/VoiceEnginePanel'
import { hasSupabaseEnv } from '../auth/supabaseClient'
import { attachRenderedAudio } from './attachAudio'
import { datasheetToStudioTracks } from './specStudio'
import { setStudioSeed } from '../compose/handoff'
import type { Duration } from '../types/domain'
import type { CatalogProtocol } from '../data/catalog'
import { phasesFromSpec } from './protocolDoc'
import { assetMapCoverage, type AssetMap } from './assets'
import { datasheetToProtocolSpec, fmtTime, timelineReady, type Datasheet } from './datasheet'
import { dsWavFileName, renderDatasheetWav } from './renderDatasheet'

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

interface Props {
  datasheet: Datasheet
  fileName: string
  actor: string
  onCancel: () => void
  onDone: () => void
}

type Stage = 'review' | 'render'

export function DatasheetImport({ datasheet: ds, fileName, actor, onCancel, onDone }: Props) {
  const dp = useDataProvider()
  const [ttsTick, setTtsTick] = useState(0)
  const tts = useMemo(() => getTtsProvider(), [ttsTick])

  const [stage, setStage] = useState<Stage>('review')
  const [title, setTitle] = useState(ds.title)
  const [blurb, setBlurb] = useState('')
  const [busy, setBusy] = useState(false)
  const [published, setPublished] = useState<CatalogProtocol | null>(null)

  const readyDurations = ds.versions.map((v) => v.duration).filter((d) => timelineReady(ds, d))
  const [renderDur, setRenderDur] = useState<Duration>(readyDurations[0] ?? ds.versions[0]?.duration ?? 6)
  const [preview, setPreview] = useState(true)
  const [withVoice, setWithVoice] = useState(tts.canRender)
  const [progress, setProgress] = useState<string | null>(null)
  const [renderNotes, setRenderNotes] = useState<string[]>([])
  const [renderError, setRenderError] = useState<string | null>(null)
  const [rendered, setRendered] = useState<{ name: string; seconds: number; voice: string; stems: number; blob: Blob; buffer: AudioBuffer; duration: Duration; preview: boolean } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [attached, setAttached] = useState<string | null>(null)
  const [assetMap, setAssetMap] = useState<AssetMap | undefined>(undefined)

  // pick up an existing asset mapping if this code was already mapped
  useEffect(() => {
    void dp.listProtocols().then((ps) => {
      const existing = ps.find((p) => p.code === ds.code)
      if (existing?.assetMap) setAssetMap(existing.assetMap)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const spec = useMemo(() => datasheetToProtocolSpec(ds), [ds])
  const totalRows = Object.values(ds.timelines).reduce((n, tl) => n + (tl?.length ?? 0), 0)

  const [publishError, setPublishError] = useState<string | null>(null)

  /** Map raw provider errors to something the operator can act on. */
  function explainSaveError(e: unknown): string {
    const msg = (e as Error)?.message ?? String(e)
    if (/datasheet|asset_map|PGRST204|42703|column .* does not exist|schema cache/i.test(msg)) {
      return `${msg}: nel database mancano le nuove colonne del catalogo. Esegui il supabase/setup.sql aggiornato nell’editor SQL di Supabase (aggiunge protocols.datasheet e protocols.asset_map, si può rieseguire), poi premi di nuovo Pubblica.`
    }
    if (/row-level security|RLS|permission|policy/i.test(msg)) {
      return `${msg}: l’account connesso non è admin per la policy di scrittura del catalogo. Accedi come admin@goodloop.app e riprova.`
    }
    return msg
  }

  async function publish() {
    setBusy(true)
    setPublishError(null)
    try {
      // never clobber a mapping the Asset Library already saved for this code
      let mapToSave = assetMap
      try {
        const existing = (await dp.listProtocols()).find((p) => p.code === ds.code)
        if (!mapToSave && existing?.assetMap) { mapToSave = existing.assetMap; setAssetMap(existing.assetMap) }
      } catch { /* fall through with the in-memory value */ }
      const proto: CatalogProtocol = {
        code: ds.code,
        family: ds.family,
        title: title.trim() || ds.title,
        blurb: blurb.trim() || `Imported protocol datasheet — ${ds.versions.map((v) => `${v.duration} min`).join(' / ')}.`,
        phases: phasesFromSpec(spec),
        versions: ds.versions.map((v) => ({ duration: v.duration })),
        enabled: true,
        source: 'imported',
        tenants: 'all',
        audioReady: false,
        spec,
        datasheet: ds,
        assetMap: mapToSave,
        updatedAt: Date.now(),
      }
      await dp.saveProtocol(proto)
      registerProtocol(proto)
      await dp.logAudit({ actor, action: 'protocol.datasheet.imported', target: proto.code, detail: `${fileName} · ${ds.versions.length} versions · ${totalRows} timeline rows · ${ds.affirmations.length} affirmations` })
        .catch(() => { /* the protocol IS saved — a failed audit write must not block the flow */ })
      setPublished(proto)
      setStage('render')
    } catch (e) {
      setPublishError(explainSaveError(e))
    } finally {
      setBusy(false)
    }
  }

  async function runRender() {
    setBusy(true)
    setRenderError(null)
    setRendered(null)
    setRenderNotes([])
    try {
      // ALWAYS re-read the saved mapping right before rendering: the operator
      // typically publishes first, maps assets in the Asset Library, then
      // comes back here — the mount-time snapshot would render synth-only.
      let freshMap = assetMap
      try {
        const existing = (await dp.listProtocols()).find((p) => p.code === ds.code)
        if (existing?.assetMap) { freshMap = existing.assetMap; setAssetMap(existing.assetMap) }
      } catch { /* keep the in-memory map */ }
      const result = await renderDatasheetWav(
        ds,
        { duration: renderDur, withVoice: withVoice && tts.canRender, capSeconds: preview ? 90 : undefined, assetMap: freshMap },
        (stg, done, total) => setProgress(
          stg === 'voice' ? `Sintesi della voce ${done}/${total}…`
            : stg === 'assets' ? `Caricamento asset ${done}/${total}…`
              : 'Missaggio…'),
      )
      const name = dsWavFileName(ds, renderDur, preview)
      downloadBlob(name, result.blob)
      setRenderNotes(result.notes)
      setRendered({ name, seconds: result.seconds, voice: `${result.voiceRendered}/${result.voiceLines} righe`, stems: result.stemsUsed, blob: result.blob, buffer: result.buffer, duration: renderDur, preview })
      setAttached(null)
      await dp.logAudit({ actor, action: 'protocol.audio.rendered', target: ds.code, detail: `v3 · ${renderDur} min${preview ? ' (90s preview)' : ''} · voice ${result.voiceRendered}/${result.voiceLines} · stems ${result.stemsUsed}` })
    } catch (e) {
      setRenderError((e as Error).message)
    } finally {
      setProgress(null)
      setBusy(false)
    }
  }

  async function uploadAndAttach() {
    if (!rendered || !published || rendered.preview) return
    setUploading(true)
    setRenderError(null)
    try {
      const { url, protocol } = await attachRenderedAudio(dp, published.code, rendered.duration, rendered.buffer, 'it')
      await dp.logAudit({ actor, action: 'protocol.audio.attached', target: protocol.code, detail: `${rendered.duration} min · mp3 192k` })
      setPublished(protocol)
      setAttached(url)
    } catch (e) {
      setRenderError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  async function editInStudio() {
    // freshest mapping → real sample clips in the Studio
    let freshMap = assetMap
    try {
      const existing = (await dp.listProtocols()).find((p) => p.code === ds.code)
      if (existing?.assetMap) { freshMap = existing.assetMap; setAssetMap(existing.assetMap) }
    } catch { /* keep in-memory */ }
    const seed = datasheetToStudioTracks(ds, renderDur, freshMap)
    setStudioSeed(seed.tracks, seed.name, { code: ds.code, duration: renderDur }, { fadeInSec: ds.mix?.sessionFadeInSec ?? 2, fadeOutSec: ds.mix?.sessionFadeOutSec ?? 3 })
    window.location.hash = '#studio'
  }

  async function markReady() {
    if (!published) return
    setBusy(true)
    setRenderError(null)
    try {
      await dp.saveProtocol({ ...published, audioReady: true, updatedAt: Date.now() })
      await dp.logAudit({ actor, action: 'protocol.audio.ready', target: published.code, detail: 'audioReady = true' })
        .catch(() => { /* audit failure must not block */ })
      onDone()
    } catch (e) {
      setRenderError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const cov = assetMapCoverage(assetMap)

  /* ---------------------------------------------------------- render stage */
  if (stage === 'render') {
    return (
      <div className="adm-page">
        <header className="adm-page__head">
          <h1 className="b2b-h1">Render audio: {ds.code}</h1>
        </header>
        <div className="adm-note adm-note--ok">
          <b>{ds.code} pubblicato</b> con la scheda completa: già selezionabile nella procedura guidata del clinico.
          Il renderer v3 mixa gli asset mappati con i livelli battito cardiaco, campana tibetana, binaurale, bilaterale e voce.
        </div>

        <div className="adm-spec__render">
          <div className="adm-spec__row">
            <span className="adm-spec__lbl">Versione</span>
            <div className="adm-spec__chips">
              {ds.versions.map((v) => {
                const ready = timelineReady(ds, v.duration)
                return (
                  <button
                    key={v.duration}
                    className={`b2b-btn${renderDur === v.duration ? ' b2b-btn--primary' : ''}`}
                    disabled={!ready}
                    /* The old message named a `Timeline_12min` sheet, which the
                       unified workbook does not have — its TIMELINE sheet
                       carries a Versione column instead. Naming a sheet that
                       does not exist sent people looking for the wrong thing. */
                    title={ready
                      ? undefined
                      : `Nessuna riga da ${v.duration} min nel foglio TIMELINE (colonna Versione = ${v.duration}). Aggiungile al workbook e reimporta — le altre durate non vengono toccate.`}
                    onClick={() => setRenderDur(v.duration)}
                  >
                    {v.duration} min{v.label ? ` · ${v.label}` : ''}{ready ? '' : ' ⏳'}
                  </button>
                )
              })}
            </div>
          </div>
          {ds.versions.some((v) => !timelineReady(ds, v.duration)) && (
            <div className="adm-note" style={{ margin: '6px 0' }}>
              Durate senza righe nel foglio TIMELINE:{' '}
              <b>{ds.versions.filter((v) => !timelineReady(ds, v.duration)).map((v) => `${v.duration}m`).join(' · ')}</b>{' '}
              — la scheda le dichiara, ma il foglio TIMELINE non ha righe con quella Versione, quindi non c’è nulla da
              renderizzare. È una mancanza del workbook, non del protocollo: l’audio già collegato resta in linea.
            </div>
          )}
          <div className="adm-spec__row">
            <span className="adm-spec__lbl">Asset</span>
            <div className="adm-spec__chips">
              <span className="adm-asset__meta">
                {assetMap
                  ? `musica ${cov.music}/6 · soundscape ${cov.soundscape}/6${assetMap.heartbeat ? ' · battito da file' : ' · battito sintetizzato'}${assetMap.bowl ? ' · campana da file' : ' · campana sintetizzata'}`
                  : 'Nessuna mappatura degli asset: tutto viene renderizzato con i suoni sintetici di riserva. Mappa gli stem nella Libreria audio, poi riapri questa importazione.'}
              </span>
            </div>
          </div>
          <div className="adm-spec__row">
            <span className="adm-spec__lbl">Durata</span>
            <div className="adm-spec__chips">
              <button className={`b2b-btn${preview ? ' b2b-btn--primary' : ''}`} onClick={() => setPreview(true)}>Anteprima 90 s</button>
              <button className={`b2b-btn${!preview ? ' b2b-btn--primary' : ''}`} onClick={() => setPreview(false)}>Sessione completa (~{Math.round(renderDur * 10.6)} MB WAV)</button>
            </div>
          </div>
          <div className="adm-spec__row">
            <span className="adm-spec__lbl">Voce</span>
            <div className="adm-spec__chips">
              <label className="adm-spec__check">
                <input type="checkbox" checked={withVoice && tts.canRender} disabled={!tts.canRender} onChange={(e) => setWithVoice(e.target.checked)} />
                Sintetizza le righe parlate ({tts.canRender ? `${tts.label}, italiano` : `${tts.label} è solo anteprima: incolla qui sotto le chiavi ElevenLabs`})
              </label>
            </div>
          </div>
          <div className="adm-spec__row">
            <span className="adm-spec__lbl">Motore</span>
            <VoiceEnginePanel onChanged={() => { setTtsTick((n) => n + 1); setWithVoice(true) }} />
          </div>

          <div className="adm-cred__actions" style={{ marginTop: 14 }}>
            <button className="b2b-btn b2b-btn--primary b2b-btn--lg" disabled={busy} onClick={runRender}>
              {busy ? (progress ?? 'Render in corso…') : '♪ Render WAV (v3)'}
            </button>
            <button className="b2b-btn" disabled={busy || !rendered} onClick={markReady} title="Imposta audioReady sulla voce del catalogo">
              ✓ Segna l’audio come pronto e termina
            </button>
            <button className="b2b-btn" disabled={busy} onClick={() => void editInStudio()} title="Apri i livelli di questa versione come tracce modificabili">🎚 Modifica nello Studio</button>
            <button className="b2b-btn" disabled={busy} onClick={onDone}>Termina senza audio</button>
          </div>

          {rendered && (
            <div className="adm-note adm-note--ok" style={{ marginTop: 12 }}>
              <b>{rendered.name}</b> scaricato: {fmtTime(rendered.seconds)} renderizzati, voce {rendered.voice}, stem reali in {rendered.stems}/6 fasi.
              {rendered.preview
                ? ' I render di anteprima servono solo per il controllo: renderizza la sessione completa per collegarla al catalogo.'
                : hasSupabaseEnv()
                  ? ' Collegalo qui sotto e questo stesso file diventa l’audio della sessione (copia in streaming MP3 a 192 kbps).'
                  : ' Configura Supabase per caricarlo nel catalogo (in modalità demo è solo scaricabile).'}
            </div>
          )}
          {rendered && !rendered.preview && hasSupabaseEnv() && !attached && (
            <div className="adm-cred__actions" style={{ marginTop: 10 }}>
              <button className="b2b-btn b2b-btn--primary" disabled={uploading} onClick={uploadAndAttach}>
                {uploading ? 'Codifica e caricamento…' : '⬆ Carica e collega al catalogo (MP3 192k)'}
              </button>
            </div>
          )}
          {attached && (
            <div className="adm-note adm-note--ok" style={{ marginTop: 10 }}>
              <b>Collegato.</b> {published?.code} · {rendered?.duration} min ora riproduce questo file per le persone e per i clinici.
            </div>
          )}
          {renderError && <div className="adm-note adm-note--warn" style={{ marginTop: 12 }}>Render non riuscito: {renderError}</div>}
          {renderNotes.length > 0 && (
            <ul className="adm-spec__issues" style={{ marginTop: 10 }}>
              {renderNotes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}
        </div>
      </div>
    )
  }

  /* ---------------------------------------------------------- review stage */
  return (
    <div className="adm-page">
      <header className="adm-page__head adm-page__head--row">
        <div>
          <h1 className="b2b-h1">Revisione della scheda del protocollo</h1>
          <p className="b2b-sub">Da <code>{fileName}</code>: la cartella di lavoro canonica, letta foglio per foglio.</p>
        </div>
        <button className="b2b-btn" onClick={onCancel}>← Indietro</button>
      </header>

      <div className="adm-spec__card">
        <div className="adm-spec__id">
          <span className="adm-spec__code">{ds.code}</span>
          <input className="b2b-input adm-spec__title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titolo" />
        </div>
        <input className="b2b-input" value={blurb} onChange={(e) => setBlurb(e.target.value)} placeholder="Frase per la persona (facoltativa: altrimenti viene generata)" />

        <div className="adm-spec__facts">
          {ds.docVersion && <span>{ds.docVersion}</span>}
          {ds.refrain && <span>Ritornello: “{ds.refrain}”</span>}
          {ds.versions[0] && <span>Binaural {ds.versions[0].binaural.beatHz} Hz ({ds.versions[0].binaural.carrierLowHz}/{ds.versions[0].binaural.carrierHighHz} Hz)</span>}
          {ds.versions.some((v) => v.heartbeat) && <span>Battito 60 BPM ({ds.versions.filter((v) => v.heartbeat).map((v) => `${v.duration}m ${v.heartbeat!.gainDb} dB`).join(' · ')})</span>}
          {ds.versions.some((v) => v.bilateral) && <span>Bilateral {ds.versions.find((v) => v.bilateral)!.bilateral!.toneHz} Hz</span>}
          <span>{totalRows} righe di timeline</span>
          <span>{ds.affirmations.length} affermazioni (REC)</span>
          <span>{ds.musicMap.length} fasi della mappa musicale</span>
          <span>{ds.layers.length} livelli del motore</span>
          {ds.defaultVoice && <span>Voci: {ds.defaultVoice}{ds.defaultVoiceM ? ` + ${ds.defaultVoiceM} [M]` : ''}</span>}
          {ds.phases.some((p) => p.binaural) && <span>Curva binaurale: {[...new Set(ds.phases.filter((p) => p.binaural).map((p) => `F${p.id}→${p.binaural!.beatHz} Hz`))].join(' · ')}</span>}
          {ds.mix?.solfeggioHz && <span>Solfeggio {ds.mix.solfeggioHz} Hz</span>}
          {ds.mix?.beatType === 'isochronic' && <span>Toni isocronici</span>}
          {ds.breathing?.length ? <span>Guida al respiro: {ds.breathing.length} {ds.breathing.length === 1 ? 'riga' : 'righe'}</span> : null}
          {ds.mix && <span>Override MIX attivi</span>}
        </div>
        {ds.docSections && (
          <div className="adm-note" style={{ marginTop: 8 }}>
            📎 Sezioni documentali conservate: {Object.entries(ds.docSections).map(([k, v]) => `${k} (${v.length} righe)`).join(' · ')}: salvate con il protocollo come riferimento, non renderizzate come audio.
          </div>
        )}

        {ds.versions.map((v) => {
          const ph = ds.phases.filter((p) => p.duration === v.duration)
          const ready = timelineReady(ds, v.duration)
          return (
            <div key={v.duration} className="adm-spec__version">
              <div className="adm-spec__vhead">
                {v.duration} min{v.label ? ` — ${v.label}` : ''} · {ph.length} fasi · loop {v.loopIntervalSec}s · dissolvenze {v.affFadeInSec}/{v.affFadeOutSec}s · REC ×{v.recSubset.length} · stacking {v.stacking}
                {v.bilateral ? ` · bilat ${v.bilateral.toneHz} Hz/${v.bilateral.everySec}s` : ''}
                {v.heartbeat ? ` · ♥ ${v.heartbeat.gainDb} dB` : ''}
                {' · '}
                {ready
                  ? <b>{ds.timelines[v.duration]!.length} righe di timeline ✓</b>
                  : <b className="adm-spec__pending">timeline in attesa ⏳</b>}
              </div>
              <div className="adm-spec__phases">
                {ph.map((p) => (
                  <span key={p.id} className="adm-spec__phase" title={`${fmtTime(p.startSec)}–${fmtTime(p.endSec)}${p.notes ? ` · ${p.notes}` : ''}`}>
                    {p.id}. {p.name}
                  </span>
                ))}
              </div>
            </div>
          )
        })}

        {ds.musicMap.length > 0 && (
          <div className="adm-spec__version">
            <div className="adm-spec__vhead">Mappa musicale (per fase)</div>
            <div className="adm-spec__phases">
              {ds.musicMap.map((m) => (
                <span key={m.phase} className="adm-spec__phase" title={`${m.arrangement[24] ?? m.arrangement[12] ?? m.arrangement[6] ?? ''} · soundscape: ${m.soundscape}`}>
                  F{m.phase} {m.keys.join('→')} · {m.bpm} BPM
                </span>
              ))}
            </div>
          </div>
        )}

        {ds.issues.length > 0 && (
          <div className="adm-note adm-note--warn" style={{ marginTop: 10 }}>
            <b>Validazione</b>
            <ul className="adm-spec__issues">{ds.issues.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
        )}
      </div>

      <div className="adm-import__foot" style={{ marginTop: 14 }}>
        <button className="b2b-btn b2b-btn--primary b2b-btn--lg" disabled={busy} onClick={publish}>
          {busy ? 'Pubblicazione…' : `Pubblica ${ds.code} nel catalogo →`}
        </button>
        {publishError && <div className="adm-note adm-note--warn" style={{ marginTop: 10 }}>Pubblicazione non riuscita: {publishError}</div>}
        <p className="b2b-sub adm-import__hint">La pubblicazione salva la scheda completa (e una specifica derivata per le superfici esistenti); il passo successivo renderizza l’audio con il renderer v3.</p>
      </div>
    </div>
  )
}
