/* The review + render half of the PLAIN Timeline import path. A parsed
   PlainTimeline is verified (identity, per-version phase map, tracks with
   clip counts per type, the affirmation database, every Rules-doc validation
   issue), seeded into the Sound Studio 1:1, rendered offline (the WAV IS the
   Studio mixdown — same clip renderer, same FX builder — plus the app-side
   §8.3 ducking and the random draws from the tag / phase pools), published
   to the shared catalog with the full timeline attached, and uploaded as the
   192 kbps streaming copy. */

import { useEffect, useMemo, useState } from 'react'
import { useDataProvider } from '../data/provider'
import { registerProtocol } from '../data/protocols'
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
import {
  PLAIN_TIPO_LABEL,
  secToMmss,
  type PlainTimeline,
  type PlainTipo,
  type PlainVersion,
} from './plainTimeline'

interface Props {
  timeline: PlainTimeline
  fileName: string
  actor: string
  onCancel: () => void
  onDone: () => void
}

const TIPO_ORDER: PlainTipo[] = ['voice', 'soundscape', 'music', 'binaural', 'bilateral', 'solfeggio']
const FAMILIES: ProtocolFamily[] = ['GL-ANX', 'GL-DEP', 'GL-BURN', 'GL-STRESS', 'GL-RESIL']

function tipoCounts(v: PlainVersion): { tipo: PlainTipo; n: number }[] {
  const map = new Map<PlainTipo, number>()
  for (const c of v.clips) map.set(c.tipo, (map.get(c.tipo) ?? 0) + 1)
  return TIPO_ORDER.filter((t) => map.has(t)).map((t) => ({ tipo: t, n: map.get(t)! }))
}

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

export function PlainImport({ timeline: t, fileName, actor, onCancel, onDone }: Props) {
  const dp = useDataProvider()
  const [ttsTick, setTtsTick] = useState(0)
  const tts = useMemo(() => getTtsProvider(), [ttsTick])

  const errors = t.issues.filter((i) => i.level === 'error')
  const warnings = t.issues.filter((i) => i.level === 'warning')
  const infos = t.issues.filter((i) => i.level === 'info')
  const totalClips = useMemo(() => t.versions.reduce((n, v) => n + v.clips.length, 0), [t])

  /* ---- asset pools for the random draw (loaded once; mock mode = none) ---- */
  const [pools, setPools] = useState<AssetPools | null>(null)
  const [poolsMsg, setPoolsMsg] = useState<string>(hasSupabaseEnv() ? 'Loading the asset library…' : 'No Supabase env — Music/Soundscape lanes stay silent (mock mode).')
  useEffect(() => {
    if (!hasSupabaseEnv()) return
    let alive = true
    void (async () => {
      try {
        const [assets, meta] = await Promise.all([listAssets(), loadAssetMeta()])
        if (!alive) return
        const p = buildAssetPools(assets, meta)
        setPools(p)
        const music = Object.values(p.musicByPhase).reduce((n, arr) => n + (arr?.length ?? 0), 0)
        setPoolsMsg(`Pools ready: ${music} music files across ${Object.keys(p.musicByPhase).length} phase pools · ${p.soundscapes.length} soundscapes / ${p.soundscapeByTag.size} tags · ${p.heartbeat.length} heartbeat.`)
      } catch (e) {
        if (alive) setPoolsMsg(`Asset library unreachable (${(e as Error).message}) — lanes will be silent.`)
      }
    })()
    return () => { alive = false }
  }, [])

  /* ---- Studio hand-off ---- */
  const [seedNotes, setSeedNotes] = useState<{ sheet: string; notes: string[] } | null>(null)
  const [seedError, setSeedError] = useState<string | null>(null)

  function openInStudio(v: PlainVersion) {
    try {
      const seed = plainToStudioTracks(t, v, { pools: pools ?? undefined })
      const dur = v.durationMin === 6 || v.durationMin === 12 || v.durationMin === 24 ? (v.durationMin as Duration) : undefined
      const attach = t.code && dur ? { code: t.code, duration: dur } : undefined
      setStudioSeed(seed.tracks, seed.name, attach)
      setSeedError(null)
      setSeedNotes({ sheet: v.sheet, notes: seed.notes })
      // Navigation is the user's second click (in the notes panel), so the
      // seeding decisions are readable before leaving this screen.
    } catch (e) {
      setSeedError((e as Error).message)
    }
  }

  /* ---- publish ---- */
  const [title, setTitle] = useState(t.title ?? t.code ?? '')
  const [blurb, setBlurb] = useState('')
  const [published, setPublished] = useState<CatalogProtocol | null>(null)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function explainSaveError(e: unknown): string {
    const msg = (e as Error)?.message ?? String(e)
    if (/plain|datasheet|asset_map|PGRST204|42703|column .* does not exist|schema cache/i.test(msg)) {
      return `${msg} — the database is missing the new catalog columns. Run the updated supabase/setup.sql (it adds protocols.plain and asset_meta, and is safe to re-run), then press Publish again.`
    }
    if (/row-level security|RLS|permission|policy/i.test(msg)) {
      return `${msg} — the signed-in account isn't an admin for the catalog write policy. Sign in as admin@goodloop.app and retry.`
    }
    return msg
  }

  async function publish() {
    if (!t.code) { setPublishError('The workbook has no GL-code (README) — publishing needs one.'); return }
    setBusy(true)
    setPublishError(null)
    try {
      const durations = t.versions
        .map((v) => v.durationMin)
        .filter((d): d is Duration => d === 6 || d === 12 || d === 24)
      const phasedVersion = t.versions.find((v) => v.phases.length === 6) ?? t.versions[0]
      const existing = (await dp.listProtocols().catch(() => [] as CatalogProtocol[])).find((p) => p.code === t.code)
      const proto: CatalogProtocol = {
        code: t.code,
        family: familyFromCode(t.code),
        title: title.trim() || t.code,
        blurb: blurb.trim() || `Imported PLAIN timeline — ${t.versions.map((v) => `${v.durationMin} min`).join(' / ')}.`,
        phases: phasesForCatalog(phasedVersion),
        versions: durations.length ? durations.map((d) => ({ duration: d })) : [{ duration: 12 }],
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
      await dp.saveProtocol(proto)
      registerProtocol(proto)
      await dp.logAudit({ actor, action: 'protocol.plain.imported', target: proto.code, detail: `${fileName} · ${t.versions.length} versions · ${totalClips} clips · ${t.affirmations.length} affirmations` })
        .catch(() => { /* the protocol IS saved — a failed audit write must not block */ })
      setPublished(proto)
    } catch (e) {
      setPublishError(explainSaveError(e))
    } finally {
      setBusy(false)
    }
  }

  /* ---- render ---- */
  const [renderSheet, setRenderSheet] = useState<string>(t.versions[0]?.sheet ?? '')
  const [preview, setPreview] = useState(true)
  const [withVoice, setWithVoice] = useState(tts.canRender)
  const [progress, setProgress] = useState<string | null>(null)
  const [renderNotes, setRenderNotes] = useState<string[]>([])
  const [renderError, setRenderError] = useState<string | null>(null)
  const [rendered, setRendered] = useState<{ name: string; seconds: number; voiceClips: number; blob: Blob; buffer: AudioBuffer; version: PlainVersion; preview: boolean } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [attached, setAttached] = useState<string | null>(null)

  async function runRender() {
    const v = t.versions.find((x) => x.sheet === renderSheet) ?? t.versions[0]
    if (!v) return
    setBusy(true)
    setRenderError(null)
    setRendered(null)
    setRenderNotes([])
    setAttached(null)
    try {
      const result = await renderPlainWav(t, v, {
        pools: pools ?? undefined,
        preview,
        withVoice: withVoice && tts.canRender,
        onProgress: setProgress,
      })
      setRenderNotes(result.notes)
      setRendered({
        name: plainWavFileName(t.code, v.sheet, preview),
        seconds: result.seconds,
        voiceClips: result.voiceClips,
        blob: result.blob,
        buffer: result.buffer,
        version: v,
        preview,
      })
    } catch (e) {
      setRenderError((e as Error).message)
    } finally {
      setProgress(null)
      setBusy(false)
    }
  }

  async function uploadAndAttach() {
    if (!rendered || !published || !t.code) return
    const dur = rendered.version.durationMin as Duration
    if (dur !== 6 && dur !== 12 && dur !== 24) { setRenderError(`${rendered.version.durationMin} min is not a catalog duration (6/12/24).`); return }
    if (rendered.preview) { setRenderError('Attach needs a FULL render — uncheck the 90 s preview and render again.'); return }
    setUploading(true)
    setRenderError(null)
    try {
      const { url } = await attachRenderedAudio(dp, t.code, dur, rendered.buffer)
      setAttached(url)
      await dp.logAudit({ actor, action: 'protocol.audio.attached', target: t.code, detail: `plain · ${dur} min · ${rendered.voiceClips} voice clips` }).catch(() => { /* non-blocking */ })
    } catch (e) {
      setRenderError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="adm-page">
      <header className="adm-page__head adm-page__head--row">
        <div>
          <h1 className="b2b-h1">PLAIN Timeline — review</h1>
          <p className="b2b-sub">
            From <code>{fileName}</code> — clip-level format (Rules doc): one row = one clip.{' '}
            {t.versions.length} version{t.versions.length === 1 ? '' : 's'}, {totalClips} clips, {t.affirmations.length} affirmations.
          </p>
        </div>
        <button className="b2b-btn b2b-btn--ghost" onClick={onCancel}>← Choose another file</button>
      </header>

      <div className="adm-spec__card">
        <div className="adm-spec__facts">
          {t.code && <span><b>{t.code}</b></span>}
          {t.title && <span>{t.title}</span>}
          {t.methodology && <span>{t.methodology}</span>}
          {t.source && <span>src: {t.source}</span>}
          <span>{poolsMsg}</span>
        </div>

        {t.versions.map((v) => {
          const counts = tipoCounts(v)
          return (
            <div key={v.sheet} className="adm-spec__version">
              <div className="adm-spec__vhead" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span>
                  Sheet “{v.sheet}” {v.versionKey ? `· ${v.versionKey.toUpperCase()}` : ''} · {v.durationMin} min ({secToMmss(v.durationS)})
                  {v.declaredTotal !== null && ` · declared ${v.declaredTotal} clips`}
                </span>
                <button
                  className="b2b-btn"
                  disabled={errors.length > 0}
                  title={errors.length ? 'Fix the errors below first' : 'Seed the Sound Studio: 1 Excel row = 1 clip'}
                  onClick={() => openInStudio(v)}
                >
                  Open in Sound Studio →
                </button>
              </div>

              <div className="adm-spec__phases" style={{ marginBottom: 8 }}>
                {v.phases.map((p) => (
                  <span key={p.fase} className="adm-spec__phase" title={p.label}>
                    F{p.fase} {secToMmss(p.startS)}–{secToMmss(p.endS)}
                  </span>
                ))}
              </div>

              <div className="adm-spec__facts" style={{ marginBottom: 8 }}>
                {counts.map(({ tipo, n }) => (
                  <span key={tipo}><b>{n}</b> {PLAIN_TIPO_LABEL[tipo]}</span>
                ))}
              </div>

              <div className="adm-spec__phases">
                {v.tracks.map((tr) => (
                  <span key={tr.name} className="adm-spec__phase" title={PLAIN_TIPO_LABEL[tr.tipo]}>
                    {tr.name} <span style={{ opacity: 0.6 }}>· {PLAIN_TIPO_LABEL[tr.tipo]} · {tr.clips} clip{tr.clips === 1 ? '' : 's'}</span>
                  </span>
                ))}
              </div>
            </div>
          )
        })}

        {t.affirmations.length > 0 && (
          <div className="adm-spec__version">
            <div className="adm-spec__vhead">Affirmations ({t.affirmations.length})</div>
            <div className="adm-spec__phases">
              {t.affirmations.map((a) => (
                <span key={a.id} className="adm-spec__phase" title={`${a.testo}${a.ecoKeyword ? ` · eco: ${a.ecoKeyword}` : ''}`}>
                  {a.id}
                  <span style={{ opacity: 0.6 }}>
                    {' '}· {[a.inQuick && 'Q', a.inStandard && 'S', a.inDeep && 'D'].filter(Boolean).join('·')}
                    {a.durataS !== null ? ` · ${a.durataS}s` : ''}
                    {a.bilateraleLato ? ` · ${a.bilateraleLato}` : ''}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {errors.length > 0 && (
          <div className="adm-issues adm-issues--err">
            {errors.map((i, k) => <span key={k}>{i.sheet ? `[${i.sheet}] ` : ''}{i.clipId ? `${i.clipId}: ` : ''}{i.message}</span>)}
          </div>
        )}
        {warnings.length > 0 && (
          <div className="adm-issues adm-issues--warn">
            {warnings.map((i, k) => <span key={k}>{i.sheet ? `[${i.sheet}] ` : ''}{i.clipId ? `${i.clipId}: ` : ''}{i.message}</span>)}
          </div>
        )}
        {infos.length > 0 && (
          <ul className="adm-spec__issues">
            {infos.map((i, k) => <li key={k}>{i.sheet ? `[${i.sheet}] ` : ''}{i.clipId ? `${i.clipId}: ` : ''}{i.message}</li>)}
          </ul>
        )}
        {errors.length === 0 && warnings.length === 0 && (
          <div className="adm-note adm-note--ok">
            <b>Workbook valid.</b> All clips parsed, every loop set resolved against the Affermazioni sheet,
            Binaural XOR Solfeggio respected, §8.0 phase windows clean.
          </div>
        )}
      </div>

      {seedError && <div className="adm-issues adm-issues--err" style={{ marginTop: 12 }}><span>{seedError}</span></div>}
      {seedNotes && (
        <div className="adm-note adm-note--ok" style={{ marginTop: 12 }}>
          <b>Studio project prepared from “{seedNotes.sheet}”</b> — 1 Excel row = 1 clip. Seeding decisions:
          <ul className="adm-spec__issues">
            {seedNotes.notes.map((n, k) => <li key={k}>{n}</li>)}
          </ul>
          <div className="adm-cred__actions" style={{ marginTop: 8 }}>
            <button className="b2b-btn b2b-btn--primary" onClick={() => { window.location.hash = '#studio' }}>Go to the Sound Studio →</button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------- publish */}
      <div className="adm-spec__card" style={{ marginTop: 16 }}>
        <div className="adm-spec__vhead">Publish to the catalog</div>
        <div className="adm-spec__row">
          <span className="adm-spec__lbl">Title</span>
          <input className="b2b-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="adm-spec__row">
          <span className="adm-spec__lbl">Blurb</span>
          <input className="b2b-input" placeholder="Patient-facing description" value={blurb} onChange={(e) => setBlurb(e.target.value)} />
        </div>
        {publishError && <div className="adm-issues adm-issues--err"><span>{publishError}</span></div>}
        {published
          ? <div className="adm-note adm-note--ok"><b>{published.code} published</b> with its full PLAIN timeline — selectable in the clinician wizard; re-renderable any time from the catalog data.</div>
          : (
            <div className="adm-cred__actions">
              <button className="b2b-btn b2b-btn--primary" disabled={busy || errors.length > 0 || !t.code} onClick={publish}>
                {busy ? 'Publishing…' : `Publish ${t.code ?? ''} →`}
              </button>
              {!t.code && <span className="b2b-sub">The README carries no GL-code — publishing needs one.</span>}
            </div>
          )}
      </div>

      {/* ----------------------------------------------------------- render */}
      <div className="adm-spec__card" style={{ marginTop: 16 }}>
        <div className="adm-spec__vhead">Render — the WAV is the Studio mixdown (draws + §8.3 ducking)</div>
        <div className="adm-spec__row">
          <span className="adm-spec__lbl">Version</span>
          <div className="adm-spec__chips">
            {t.versions.map((v) => (
              <button key={v.sheet} className={`b2b-btn${renderSheet === v.sheet ? ' b2b-btn--primary' : ''}`} onClick={() => setRenderSheet(v.sheet)}>
                {v.sheet} · {v.durationMin}m
              </button>
            ))}
          </div>
        </div>
        <div className="adm-spec__row">
          <span className="adm-spec__lbl">Options</span>
          <label className="adm-spec__check"><input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} /> 90 s preview</label>
          <label className="adm-spec__check" title={tts.canRender ? undefined : 'Set ElevenLabs keys below first'}>
            <input type="checkbox" checked={withVoice && tts.canRender} disabled={!tts.canRender} onChange={(e) => setWithVoice(e.target.checked)} /> Voice ({tts.label})
          </label>
        </div>
        <VoiceEnginePanel onChanged={() => { setTtsTick((n) => n + 1); setWithVoice(true) }} />
        {progress && <div className="adm-note">{progress}</div>}
        {renderError && <div className="adm-issues adm-issues--err"><span>{renderError}</span></div>}
        {rendered && (
          <div className="adm-note adm-note--ok">
            <b>{rendered.name}</b> — {secToMmss(rendered.seconds)}, {rendered.voiceClips} voice clips.
            <div className="adm-cred__actions" style={{ marginTop: 8 }}>
              <button className="b2b-btn" onClick={() => downloadBlob(rendered.name, rendered.blob)}>Download WAV</button>
              <button
                className="b2b-btn b2b-btn--primary"
                disabled={uploading || !published || rendered.preview}
                title={!published ? 'Publish first' : rendered.preview ? 'Attach needs a full render' : undefined}
                onClick={uploadAndAttach}
              >
                {uploading ? 'Uploading…' : 'Upload & attach (192 kbps MP3) →'}
              </button>
            </div>
            {attached && <div style={{ marginTop: 6 }}>Attached — this exact file now streams in the employee app and monitored sessions: <code style={{ wordBreak: 'break-all' }}>{attached}</code></div>}
          </div>
        )}
        {renderNotes.length > 0 && (
          <ul className="adm-spec__issues">
            {renderNotes.map((n, k) => <li key={k}>{n}</li>)}
          </ul>
        )}
        <div className="adm-cred__actions">
          <button className="b2b-btn b2b-btn--primary" disabled={busy || errors.length > 0} onClick={runRender}>
            {busy && progress ? 'Rendering…' : 'Render WAV →'}
          </button>
          {attached && <button className="b2b-btn" onClick={onDone}>Done — back to catalog</button>}
        </div>
      </div>

      <div className="adm-import__foot" style={{ marginTop: 16 }}>
        <p className="b2b-sub adm-import__hint">
          One source of truth: the render executes the SAME seeded project the Sound Studio opens (1 row = 1 clip, drawn
          files, per-clip dB + fades baked in) through the SAME mixdown path — plus the app-side ducking (Music −10 dB /
          Soundscape −6 dB under active voice; entrainment, voice and the heartbeat never duck). Every random draw is
          listed in the notes; a re-render draws fresh files by design.
        </p>
      </div>
    </div>
  )
}
