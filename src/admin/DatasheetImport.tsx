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
      return `${msg} — the database is missing the new catalog columns. Run the updated supabase/setup.sql in the Supabase SQL editor (it adds protocols.datasheet and protocols.asset_map, and is safe to re-run), then press Publish again.`
    }
    if (/row-level security|RLS|permission|policy/i.test(msg)) {
      return `${msg} — the signed-in account isn't an admin for the catalog write policy. Sign in as admin@goodloop.app and retry.`
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
          stg === 'voice' ? `Synthesizing voice ${done}/${total}…`
            : stg === 'assets' ? `Loading assets ${done}/${total}…`
              : 'Mixing down…'),
      )
      const name = dsWavFileName(ds, renderDur, preview)
      downloadBlob(name, result.blob)
      setRenderNotes(result.notes)
      setRendered({ name, seconds: result.seconds, voice: `${result.voiceRendered}/${result.voiceLines} rows`, stems: result.stemsUsed, blob: result.blob, buffer: result.buffer, duration: renderDur, preview })
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
      const { url, protocol } = await attachRenderedAudio(dp, published.code, rendered.duration, rendered.buffer)
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
    setStudioSeed(seed.tracks, seed.name, { code: ds.code, duration: renderDur })
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
          <h1 className="b2b-h1">Render audio — {ds.code}</h1>
        </header>
        <div className="adm-note adm-note--ok">
          <b>{ds.code} published</b> with its full datasheet — already selectable in the clinician wizard.
          Renderer v3 mixes the mapped assets with the heartbeat, singing-bowl, binaural, bilateral and voice layers.
        </div>

        <div className="adm-spec__render">
          <div className="adm-spec__row">
            <span className="adm-spec__lbl">Version</span>
            <div className="adm-spec__chips">
              {ds.versions.map((v) => {
                const ready = timelineReady(ds, v.duration)
                return (
                  <button
                    key={v.duration}
                    className={`b2b-btn${renderDur === v.duration ? ' b2b-btn--primary' : ''}`}
                    disabled={!ready}
                    title={ready ? undefined : `Timeline_${v.duration}min is not compiled yet`}
                    onClick={() => setRenderDur(v.duration)}
                  >
                    {v.duration} min{v.label ? ` · ${v.label}` : ''}{ready ? '' : ' ⏳'}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="adm-spec__row">
            <span className="adm-spec__lbl">Assets</span>
            <div className="adm-spec__chips">
              <span className="adm-asset__meta">
                {assetMap
                  ? `music ${cov.music}/6 · soundscape ${cov.soundscape}/6${assetMap.heartbeat ? ' · heartbeat file' : ' · heartbeat synth'}${assetMap.bowl ? ' · bowl file' : ' · bowl synth'}`
                  : 'No asset mapping yet — everything renders on synth fallbacks. Map stems in the Asset Library, then re-open this import.'}
              </span>
            </div>
          </div>
          <div className="adm-spec__row">
            <span className="adm-spec__lbl">Length</span>
            <div className="adm-spec__chips">
              <button className={`b2b-btn${preview ? ' b2b-btn--primary' : ''}`} onClick={() => setPreview(true)}>90 s preview</button>
              <button className={`b2b-btn${!preview ? ' b2b-btn--primary' : ''}`} onClick={() => setPreview(false)}>Full session (~{Math.round(renderDur * 10.6)} MB WAV)</button>
            </div>
          </div>
          <div className="adm-spec__row">
            <span className="adm-spec__lbl">Voice</span>
            <div className="adm-spec__chips">
              <label className="adm-spec__check">
                <input type="checkbox" checked={withVoice && tts.canRender} disabled={!tts.canRender} onChange={(e) => setWithVoice(e.target.checked)} />
                Synthesize spoken rows ({tts.canRender ? `${tts.label}, italiano` : `${tts.label} is preview-only — paste your ElevenLabs keys below`})
              </label>
            </div>
          </div>
          <div className="adm-spec__row">
            <span className="adm-spec__lbl">Engine</span>
            <VoiceEnginePanel onChanged={() => { setTtsTick((n) => n + 1); setWithVoice(true) }} />
          </div>

          <div className="adm-cred__actions" style={{ marginTop: 14 }}>
            <button className="b2b-btn b2b-btn--primary b2b-btn--lg" disabled={busy} onClick={runRender}>
              {busy ? (progress ?? 'Rendering…') : '♪ Render WAV (v3)'}
            </button>
            <button className="b2b-btn" disabled={busy || !rendered} onClick={markReady} title="Sets audioReady on the catalog entry">
              ✓ Mark audio ready & finish
            </button>
            <button className="b2b-btn" disabled={busy} onClick={() => void editInStudio()} title="Open this version's layers as editable tracks">🎚 Edit in Studio</button>
            <button className="b2b-btn" disabled={busy} onClick={onDone}>Finish without audio</button>
          </div>

          {rendered && (
            <div className="adm-note adm-note--ok" style={{ marginTop: 12 }}>
              <b>{rendered.name}</b> downloaded — {fmtTime(rendered.seconds)} rendered, voice {rendered.voice}, real stems in {rendered.stems}/6 phases.
              {rendered.preview
                ? ' Preview renders are for checking only — render the full session to attach it to the catalog.'
                : hasSupabaseEnv()
                  ? ' Attach it below and this exact file becomes the session audio (192 kbps MP3 streaming copy).'
                  : ' Connect Supabase env to upload it to the catalog (mock mode keeps download-only).'}
            </div>
          )}
          {rendered && !rendered.preview && hasSupabaseEnv() && !attached && (
            <div className="adm-cred__actions" style={{ marginTop: 10 }}>
              <button className="b2b-btn b2b-btn--primary" disabled={uploading} onClick={uploadAndAttach}>
                {uploading ? 'Encoding & uploading…' : '⬆ Upload & attach to catalog (192k MP3)'}
              </button>
            </div>
          )}
          {attached && (
            <div className="adm-note adm-note--ok" style={{ marginTop: 10 }}>
              <b>Attached.</b> {published?.code} · {rendered?.duration} min now streams this file for employees and clinicians.
            </div>
          )}
          {renderError && <div className="adm-note adm-note--warn" style={{ marginTop: 12 }}>Render failed: {renderError}</div>}
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
          <h1 className="b2b-h1">Review protocol datasheet</h1>
          <p className="b2b-sub">From <code>{fileName}</code> — the canonical workbook, parsed sheet by sheet.</p>
        </div>
        <button className="b2b-btn" onClick={onCancel}>← Back</button>
      </header>

      <div className="adm-spec__card">
        <div className="adm-spec__id">
          <span className="adm-spec__code">{ds.code}</span>
          <input className="b2b-input adm-spec__title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        </div>
        <input className="b2b-input" value={blurb} onChange={(e) => setBlurb(e.target.value)} placeholder="Patient-facing one-liner (optional — a default is generated)" />

        <div className="adm-spec__facts">
          {ds.docVersion && <span>{ds.docVersion}</span>}
          {ds.refrain && <span>Refrain: “{ds.refrain}”</span>}
          {ds.versions[0] && <span>Binaural {ds.versions[0].binaural.beatHz} Hz ({ds.versions[0].binaural.carrierLowHz}/{ds.versions[0].binaural.carrierHighHz} Hz)</span>}
          {ds.versions.some((v) => v.heartbeat) && <span>Heartbeat 60 BPM ({ds.versions.filter((v) => v.heartbeat).map((v) => `${v.duration}m ${v.heartbeat!.gainDb} dB`).join(' · ')})</span>}
          {ds.versions.some((v) => v.bilateral) && <span>Bilateral {ds.versions.find((v) => v.bilateral)!.bilateral!.toneHz} Hz</span>}
          <span>{totalRows} timeline rows</span>
          <span>{ds.affirmations.length} affirmations (REC)</span>
          <span>{ds.musicMap.length} music-map phases</span>
          <span>{ds.layers.length} engine layers</span>
          {ds.defaultVoice && <span>Voices: {ds.defaultVoice}{ds.defaultVoiceM ? ` + ${ds.defaultVoiceM} [M]` : ''}</span>}
          {ds.phases.some((p) => p.binaural) && <span>Binaural curve: {[...new Set(ds.phases.filter((p) => p.binaural).map((p) => `F${p.id}→${p.binaural!.beatHz} Hz`))].join(' · ')}</span>}
          {ds.mix?.solfeggioHz && <span>Solfeggio {ds.mix.solfeggioHz} Hz</span>}
          {ds.mix?.beatType === 'isochronic' && <span>Isochronic tones</span>}
          {ds.breathing?.length ? <span>Breathing pacer: {ds.breathing.length} row(s)</span> : null}
          {ds.mix && <span>MIX overrides active</span>}
        </div>
        {ds.docSections && (
          <div className="adm-note" style={{ marginTop: 8 }}>
            📎 Documentary sections preserved: {Object.entries(ds.docSections).map(([k, v]) => `${k} (${v.length} rows)`).join(' · ')} — stored with the protocol for reference; not rendered as audio.
          </div>
        )}

        {ds.versions.map((v) => {
          const ph = ds.phases.filter((p) => p.duration === v.duration)
          const ready = timelineReady(ds, v.duration)
          return (
            <div key={v.duration} className="adm-spec__version">
              <div className="adm-spec__vhead">
                {v.duration} min{v.label ? ` — ${v.label}` : ''} · {ph.length} phases · loop {v.loopIntervalSec}s · fades {v.affFadeInSec}/{v.affFadeOutSec}s · REC ×{v.recSubset.length} · stacking {v.stacking}
                {v.bilateral ? ` · bilat ${v.bilateral.toneHz} Hz/${v.bilateral.everySec}s` : ''}
                {v.heartbeat ? ` · ♥ ${v.heartbeat.gainDb} dB` : ''}
                {' · '}
                {ready
                  ? <b>{ds.timelines[v.duration]!.length} timeline rows ✓</b>
                  : <b className="adm-spec__pending">timeline pending ⏳</b>}
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
            <div className="adm-spec__vhead">Music map (per phase)</div>
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
            <b>Validation</b>
            <ul className="adm-spec__issues">{ds.issues.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
        )}
      </div>

      <div className="adm-import__foot" style={{ marginTop: 14 }}>
        <button className="b2b-btn b2b-btn--primary b2b-btn--lg" disabled={busy} onClick={publish}>
          {busy ? 'Publishing…' : `Publish ${ds.code} to catalog →`}
        </button>
        {publishError && <div className="adm-note adm-note--warn" style={{ marginTop: 10 }}>Publish failed: {publishError}</div>}
        <p className="b2b-sub adm-import__hint">Publishing stores the full datasheet (and a derived spec for the existing surfaces); the next step renders the audio with Renderer v3.</p>
      </div>
    </div>
  )
}
