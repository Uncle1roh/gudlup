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
  const [rendered, setRendered] = useState<{ name: string; seconds: number; voice: string } | null>(null)

  const totalEvents = spec.versions.reduce((n, v) => n + v.events.length, 0)
  const totalVoice = spec.versions.reduce((n, v) => n + voiceLinesForVersion(spec, v.duration).length, 0)

  async function publish() {
    setBusy(true)
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
    setPublished(proto)
    setBusy(false)
    setStage('render')
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
        (stg, done, total) => setProgress(stg === 'voice' ? `Synthesizing voice ${done}/${total}…` : stg === 'bed' ? 'Rendering the sound bed…' : 'Mixing down…'),
      )
      const name = wavFileName(spec, renderDur, preview)
      downloadBlob(name, result.blob)
      setRenderNotes(result.notes)
      setRendered({ name, seconds: result.seconds, voice: `${result.voiceRendered}/${result.voiceLines} lines` })
      await dp.logAudit({ actor, action: 'protocol.audio.rendered', target: spec.code, detail: `${renderDur} min${preview ? ' (90s preview)' : ''} · voice ${result.voiceRendered}/${result.voiceLines}` })
    } catch (e) {
      setRenderError((e as Error).message)
    } finally {
      setProgress(null)
      setBusy(false)
    }
  }

  async function markReady() {
    if (!published) return
    setBusy(true)
    await dp.saveProtocol({ ...published, audioReady: true, updatedAt: Date.now() })
    await dp.logAudit({ actor, action: 'protocol.audio.ready', target: published.code, detail: 'audioReady = true' })
    setBusy(false)
    onDone()
  }

  /* ---------------------------------------------------------- render stage */
  if (stage === 'render') {
    return (
      <div className="adm-page">
        <header className="adm-page__head">
          <h1 className="b2b-h1">Render audio — {spec.code}</h1>
        </header>
        <div className="adm-note adm-note--ok">
          <b>{spec.code} published</b> to the catalog with its full audio configuration — already selectable in the clinician wizard.
          Now produce the audio file (44.1 kHz / 16-bit stereo WAV).
        </div>

        <div className="adm-spec__render">
          <div className="adm-spec__row">
            <span className="adm-spec__lbl">Version</span>
            <div className="adm-spec__chips">
              {spec.versions.map((v) => (
                <button key={v.duration} className={`b2b-btn${renderDur === v.duration ? ' b2b-btn--primary' : ''}`} onClick={() => setRenderDur(v.duration)}>
                  {v.duration} min{v.label ? ` · ${v.label}` : ''}
                </button>
              ))}
            </div>
          </div>
          <div className="adm-spec__row">
            <span className="adm-spec__lbl">Length</span>
            <div className="adm-spec__chips">
              <button className={`b2b-btn${preview ? ' b2b-btn--primary' : ''}`} onClick={() => setPreview(true)}>90 s preview</button>
              <button className={`b2b-btn${!preview ? ' b2b-btn--primary' : ''}`} onClick={() => setPreview(false)}>Full session (~{Math.round(renderDur * 10.6)} MB)</button>
            </div>
          </div>
          <div className="adm-spec__row">
            <span className="adm-spec__lbl">Voice</span>
            <div className="adm-spec__chips">
              <label className="adm-spec__check">
                <input type="checkbox" checked={withVoice && tts.canRender} disabled={!tts.canRender} onChange={(e) => setWithVoice(e.target.checked)} />
                Synthesize spoken lines ({tts.canRender ? `${tts.label}, pt-BR` : `${tts.label} is preview-only — paste your ElevenLabs keys below`})
              </label>
            </div>
          </div>
          <div className="adm-spec__row">
            <span className="adm-spec__lbl">Engine</span>
            <VoiceEnginePanel onChanged={() => { setTtsTick((n) => n + 1); setWithVoice(true) }} />
          </div>

          <div className="adm-cred__actions" style={{ marginTop: 14 }}>
            <button className="b2b-btn b2b-btn--primary b2b-btn--lg" disabled={busy} onClick={runRender}>
              {busy ? (progress ?? 'Rendering…') : '♪ Render WAV'}
            </button>
            <button className="b2b-btn" disabled={busy || !rendered} onClick={markReady} title="Sets audioReady on the catalog entry">
              ✓ Mark audio ready & finish
            </button>
            <button className="b2b-btn" disabled={busy} onClick={onDone}>Finish without audio</button>
          </div>

          {rendered && (
            <div className="adm-note adm-note--ok" style={{ marginTop: 12 }}>
              <b>{rendered.name}</b> downloaded — {mmss(rendered.seconds)} rendered, voice {rendered.voice}.
              Drop it into the protocol's version assets (or the audio library) and it becomes the session bed.
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
          <h1 className="b2b-h1">Review protocol document</h1>
          <p className="b2b-sub">From <code>{fileName}</code> — full audio configuration parsed.</p>
        </div>
        <button className="b2b-btn" onClick={onCancel}>← Back</button>
      </header>

      <div className="adm-spec__card">
        <div className="adm-spec__id">
          <span className="adm-spec__code">{spec.code}</span>
          <input className="b2b-input adm-spec__title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        </div>
        <input className="b2b-input" value={blurb} onChange={(e) => setBlurb(e.target.value)} placeholder="Patient-facing one-liner (optional — a default is generated)" />

        <div className="adm-spec__facts">
          {spec.invariants.binauralPrimary && <span>Binaural {spec.invariants.binauralPrimary.band ?? ''} {spec.invariants.binauralPrimary.beatHz} Hz (carrier {spec.invariants.binauralPrimary.carrierHz} Hz)</span>}
          {spec.invariants.binauralSecondary && <span>+ {spec.invariants.binauralSecondary.band ?? ''} {spec.invariants.binauralSecondary.beatHz} Hz</span>}
          {spec.invariants.breathingPattern && <span>Breathing: {spec.invariants.breathingPattern} ({spec.invariants.breathsPerMin ?? '—'}/min)</span>}
          {spec.invariants.soundscape && <span>Soundscape: {spec.invariants.soundscape}</span>}
          {spec.invariants.musicBpm != null && <span>Music {spec.invariants.musicBpm} bpm</span>}
          {spec.invariants.dichoticIntervalSec != null && <span>Dichotic {spec.invariants.dichoticIntervalSec} s</span>}
          <span>{totalEvents} timeline events</span>
          <span>{totalVoice} spoken lines</span>
          <span>{spec.affirmations.length} affirmations (CSI)</span>
        </div>

        {spec.versions.map((v) => (
          <div key={v.duration} className="adm-spec__version">
            <div className="adm-spec__vhead">{v.duration} min{v.label ? ` — ${v.label}` : ''} · {v.phases.length} phases · {v.events.length} events</div>
            <div className="adm-spec__phases">
              {v.phases.map((p) => (
                <span key={p.id} className="adm-spec__phase" title={`${mmss(p.startSec)}–${mmss(p.endSec)}${p.loop ? ` · loop CSI-${p.loop.fromCsi}–${p.loop.toCsi} every ${p.loop.intervalSec}s ×${p.loop.cycles}` : ''}`}>
                  {p.id}. {p.name}{p.loop ? ' ↻' : ''}
                </span>
              ))}
            </div>
          </div>
        ))}

        {spec.issues.length > 0 && (
          <div className="adm-note adm-note--warn" style={{ marginTop: 10 }}>
            <b>Parser warnings</b>
            <ul className="adm-spec__issues">{spec.issues.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
        )}
      </div>

      <div className="adm-import__foot" style={{ marginTop: 14 }}>
        <button className="b2b-btn b2b-btn--primary b2b-btn--lg" disabled={busy} onClick={publish}>
          {busy ? 'Publishing…' : `Publish ${spec.code} to catalog →`}
        </button>
        <p className="b2b-sub adm-import__hint">Publishing stores the full parsed configuration with the protocol; the next step renders the audio file from it.</p>
      </div>
    </div>
  )
}
