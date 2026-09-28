/* The protocol-document half of the import pipeline: a parsed ProtocolSpec is
   reviewed (metadata + per-version phases + affirmations + parser warnings),
   published to the shared catalog (with the full spec attached and the runtime
   registry updated), and then rendered to a WAV — full session or 90 s preview,
   with the spoken lines synthesized when a render-capable TTS key is set. */

import { useMemo, useState } from 'react'
import { useDataProvider } from '../data/provider'
import { registerProtocol } from '../data/protocols'
import { getTtsProvider } from '../tts'
import { VoiceEnginePanel } from '../tts/VoiceEnginePanel'
import { hasSupabaseEnv } from '../auth/supabaseClient'
import { attachRenderedAudio } from './attachAudio'
import { specToStudioTracks } from './specStudio'
import { setStudioSeed } from '../compose/handoff'
import type { Duration } from '../types/domain'
import type { CatalogProtocol } from '../data/catalog'
import { phasesFromSpec, voiceLinesForVersion, type ProtocolSpec } from './protocolDoc'
import { renderSpecWav, wavFileName } from './renderProtocol'

function mmss(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
}

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

interface Props {
  spec: ProtocolSpec
  fileName: string
  actor: string
  onCancel: () => void
  onDone: () => void
}

type Stage = 'review' | 'render'

export function SpecImport({ spec, fileName, actor, onCancel, onDone }: Props) {
  const dp = useDataProvider()
  // re-resolved whenever the Voice engine panel saves/clears keys
  const [ttsTick, setTtsTick] = useState(0)
  const tts = useMemo(() => getTtsProvider(), [ttsTick])

  const [stage, setStage] = useState<Stage>('review')
  const [title, setTitle] = useState(spec.title)
  const [blurb, setBlurb] = useState('')
  const [busy, setBusy] = useState(false)
  const [published, setPublished] = useState<CatalogProtocol | null>(null)

  // render controls
  const [renderDur, setRenderDur] = useState<Duration>(spec.versions[0]?.duration ?? 6)
  const [preview, setPreview] = useState(true)
  const [withVoice, setWithVoice] = useState(tts.canRender)
  const [progress, setProgress] = useState<string | null>(null)
  const [renderNotes, setRenderNotes] = useState<string[]>([])
  const [renderError, setRenderError] = useState<string | null>(null)
  const [rendered, setRendered] = useState<{ name: string; seconds: number; voice: string; blob: Blob; buffer: AudioBuffer; duration: Duration; preview: boolean } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [attached, setAttached] = useState<string | null>(null)

  const totalEvents = spec.versions.reduce((n, v) => n + v.events.length, 0)
  const totalVoice = spec.versions.reduce((n, v) => n + voiceLinesForVersion(spec, v.duration).length, 0)

  const [publishError, setPublishError] = useState<string | null>(null)

  async function publish() {
    setBusy(true)
    setPublishError(null)
    try {
      const proto: CatalogProtocol = {
        code: spec.code,
        family: spec.family,
        title: title.trim() || spec.title,
        blurb: blurb.trim() || `Imported protocol — ${spec.versions.map((v) => `${v.duration} min`).join(' / ')}.`,
        phases: phasesFromSpec(spec),
        versions: spec.versions.map((v) => ({ duration: v.duration })),
        enabled: true,
        source: 'imported',
        tenants: 'all',
        audioReady: false,
        spec,
        updatedAt: Date.now(),
      }
      await dp.saveProtocol(proto)
      registerProtocol(proto)
      await dp.logAudit({ actor, action: 'protocol.imported', target: proto.code, detail: `spec doc · ${fileName} · ${spec.versions.length} versions, ${spec.affirmations.length} affirmations` })
        .catch(() => { /* the protocol IS saved — a failed audit write must not block the flow */ })
      setPublished(proto)
      setStage('render')
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e)
      setPublishError(/PGRST204|42703|column .* does not exist|schema cache/i.test(msg)
        ? `${msg}: lo schema del database è più vecchio dell’app. Esegui il supabase/setup.sql aggiornato nell’editor SQL di Supabase (si può rieseguire), poi pubblica di nuovo.`
        : msg)
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
      const result = await renderSpecWav(
        spec,
        { duration: renderDur, withVoice: withVoice && tts.canRender, capSeconds: preview ? 90 : undefined },
        (stg, done, total) => setProgress(stg === 'voice' ? `Sintesi della voce ${done}/${total}…` : stg === 'bed' ? 'Render del letto sonoro…' : 'Missaggio…'),
      )
      const name = wavFileName(spec, renderDur, preview)
      downloadBlob(name, result.blob)
      setRenderNotes(result.notes)
      setRendered({ name, seconds: result.seconds, voice: `${result.voiceRendered}/${result.voiceLines} battute`, blob: result.blob, buffer: result.buffer, duration: renderDur, preview })
      setAttached(null)
      await dp.logAudit({ actor, action: 'protocol.audio.rendered', target: spec.code, detail: `${renderDur} min${preview ? ' (90s preview)' : ''} · voice ${result.voiceRendered}/${result.voiceLines}` })
    } catch (e) {
      setRenderError((e as Error).message)
    } finally {
      setProgress(null)
      setBusy(false)
    }
  }

  /** Upload the rendered WAV to Supabase Storage and attach its URL to the
      catalog version — from then on the SAME file plays in the employee app
      and in the therapist's monitored sessions (both read version.audioUrl). */
  async function uploadAndAttach() {
    if (!rendered || !published || rendered.preview) return
    setUploading(true)
    setRenderError(null)
    try {
      const { url, protocol } = await attachRenderedAudio(dp, published.code, rendered.duration, rendered.buffer)
      await dp.logAudit({ actor, action: 'protocol.audio.attached', target: protocol.code, detail: `${rendered.duration} min · mp3` })
      setPublished(protocol)
      setAttached(url)
    } catch (e) {
      setRenderError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  /** Open this protocol version as editable tracks in the Sound Studio. */
  function editInStudio() {
    const seed = specToStudioTracks(spec, renderDur)
    setStudioSeed(seed.tracks, seed.name, { code: spec.code, duration: renderDur })
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

  /* ---------------------------------------------------------- render stage */
  if (stage === 'render') {
    return (
      <div className="adm-page">
        <header className="adm-page__head">
          <h1 className="b2b-h1">Render audio: {spec.code}</h1>
        </header>
        <div className="adm-note adm-note--ok">
          <b>{spec.code} pubblicato</b> nel catalogo con la configurazione audio completa: già selezionabile nella procedura guidata del clinico.
          Ora produci il file audio (WAV stereo 44,1 kHz / 16 bit).
        </div>

        <div className="adm-spec__render">
          <div className="adm-spec__row">
            <span className="adm-spec__lbl">Versione</span>
            <div className="adm-spec__chips">
              {spec.versions.map((v) => (
                <button key={v.duration} className={`b2b-btn${renderDur === v.duration ? ' b2b-btn--primary' : ''}`} onClick={() => setRenderDur(v.duration)}>
                  {v.duration} min{v.label ? ` · ${v.label}` : ''}
                </button>
              ))}
            </div>
          </div>
          <div className="adm-spec__row">
            <span className="adm-spec__lbl">Durata</span>
            <div className="adm-spec__chips">
              <button className={`b2b-btn${preview ? ' b2b-btn--primary' : ''}`} onClick={() => setPreview(true)}>Anteprima 90 s</button>
              <button className={`b2b-btn${!preview ? ' b2b-btn--primary' : ''}`} onClick={() => setPreview(false)}>Sessione completa (~{Math.round(renderDur * 10.6)} MB)</button>
            </div>
          </div>
          <div className="adm-spec__row">
            <span className="adm-spec__lbl">Voce</span>
            <div className="adm-spec__chips">
              <label className="adm-spec__check">
                <input type="checkbox" checked={withVoice && tts.canRender} disabled={!tts.canRender} onChange={(e) => setWithVoice(e.target.checked)} />
                Sintetizza le battute parlate ({tts.canRender ? `${tts.label}, pt-BR` : `${tts.label} è solo anteprima: incolla qui sotto le chiavi ElevenLabs`})
              </label>
            </div>
          </div>
          <div className="adm-spec__row">
            <span className="adm-spec__lbl">Motore</span>
            <VoiceEnginePanel onChanged={() => { setTtsTick((n) => n + 1); setWithVoice(true) }} />
          </div>

          <div className="adm-cred__actions" style={{ marginTop: 14 }}>
            <button className="b2b-btn b2b-btn--primary b2b-btn--lg" disabled={busy} onClick={runRender}>
              {busy ? (progress ?? 'Render in corso…') : '♪ Render WAV'}
            </button>
            <button className="b2b-btn" disabled={busy || !rendered} onClick={markReady} title="Imposta audioReady sulla voce del catalogo">
              ✓ Segna l’audio come pronto e termina
            </button>
            <button className="b2b-btn" disabled={busy} onClick={editInStudio} title="Apri ogni livello di questa versione come traccia modificabile">🎚 Modifica nello Studio</button>
            <button className="b2b-btn" disabled={busy} onClick={onDone}>Termina senza audio</button>
          </div>

          {rendered && (
            <div className="adm-note adm-note--ok" style={{ marginTop: 12 }}>
              <b>{rendered.name}</b> scaricato: {mmss(rendered.seconds)} renderizzati, voce {rendered.voice}.
              {rendered.preview
                ? ' I render di anteprima servono solo per il controllo: renderizza la sessione completa per collegarla al catalogo.'
                : hasSupabaseEnv()
                  ? ' Collegalo qui sotto e questo stesso file diventa l’audio della sessione nell’app e nelle sedute seguite.'
                  : ' Configura Supabase per caricarlo nel catalogo (in modalità demo è solo scaricabile).'}
            </div>
          )}
          {rendered && !rendered.preview && hasSupabaseEnv() && !attached && (
            <div className="adm-cred__actions" style={{ marginTop: 10 }}>
              <button className="b2b-btn b2b-btn--primary" disabled={uploading} onClick={uploadAndAttach}>
                {uploading ? 'Codifica e caricamento…' : '⬆ Carica e collega al catalogo'}
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
          <h1 className="b2b-h1">Revisione del documento del protocollo</h1>
          <p className="b2b-sub">Da <code>{fileName}</code>: configurazione audio completa letta.</p>
        </div>
        <button className="b2b-btn" onClick={onCancel}>← Indietro</button>
      </header>

      <div className="adm-spec__card">
        <div className="adm-spec__id">
          <span className="adm-spec__code">{spec.code}</span>
          <input className="b2b-input adm-spec__title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titolo" />
        </div>
        <input className="b2b-input" value={blurb} onChange={(e) => setBlurb(e.target.value)} placeholder="Frase per la persona (facoltativa: altrimenti viene generata)" />

        <div className="adm-spec__facts">
          {spec.invariants.binauralPrimary && <span>Binaural {spec.invariants.binauralPrimary.band ?? ''} {spec.invariants.binauralPrimary.beatHz} Hz (carrier {spec.invariants.binauralPrimary.carrierHz} Hz)</span>}
          {spec.invariants.binauralSecondary && <span>+ {spec.invariants.binauralSecondary.band ?? ''} {spec.invariants.binauralSecondary.beatHz} Hz</span>}
          {spec.invariants.breathingPattern && <span>Respiro: {spec.invariants.breathingPattern} ({spec.invariants.breathsPerMin ?? '—'}/min)</span>}
          {spec.invariants.soundscape && <span>Soundscape: {spec.invariants.soundscape}</span>}
          {spec.invariants.musicBpm != null && <span>Musica {spec.invariants.musicBpm} bpm</span>}
          {spec.invariants.dichoticIntervalSec != null && <span>Dicotico {spec.invariants.dichoticIntervalSec} s</span>}
          <span>{totalEvents} eventi di timeline</span>
          <span>{totalVoice} battute parlate</span>
          <span>{spec.affirmations.length} affermazioni (CSI)</span>
        </div>

        {spec.versions.map((v) => (
          <div key={v.duration} className="adm-spec__version">
            <div className="adm-spec__vhead">{v.duration} min{v.label ? ` — ${v.label}` : ''} · {v.phases.length} fasi · {v.events.length} eventi</div>
            <div className="adm-spec__phases">
              {v.phases.map((p) => (
                <span key={p.id} className="adm-spec__phase" title={`${mmss(p.startSec)}–${mmss(p.endSec)}${p.loop ? ` · loop CSI-${p.loop.fromCsi}–${p.loop.toCsi} ogni ${p.loop.intervalSec}s ×${p.loop.cycles}` : ''}`}>
                  {p.id}. {p.name}{p.loop ? ' ↻' : ''}
                </span>
              ))}
            </div>
          </div>
        ))}

        {spec.issues.length > 0 && (
          <div className="adm-note adm-note--warn" style={{ marginTop: 10 }}>
            <b>Avvisi del parser</b>
            <ul className="adm-spec__issues">{spec.issues.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
        )}
      </div>

      <div className="adm-import__foot" style={{ marginTop: 14 }}>
        <button className="b2b-btn b2b-btn--primary b2b-btn--lg" disabled={busy} onClick={publish}>
          {busy ? 'Pubblicazione…' : `Pubblica ${spec.code} nel catalogo →`}
        </button>
        {publishError && <div className="adm-note adm-note--warn" style={{ marginTop: 10 }}>Pubblicazione non riuscita: {publishError}</div>}
        <p className="b2b-sub adm-import__hint">La pubblicazione salva con il protocollo la configurazione completa letta; il passo successivo ne renderizza il file audio.</p>
      </div>
    </div>
  )
}
