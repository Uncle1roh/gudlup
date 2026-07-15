/* ============================================================================
   Good Loop — Asset Library (admin console)
   Browses the PO's produced audio library in the `protocol-audio` bucket
   (music by phase F1–F6, soundscape loop textures by type, plus heartbeat /
   singing-bowl once the PO delivers them), previews any file in place, and
   lets the admin assign which asset serves each protocol phase. The
   assignment (AssetMap) is saved on the catalog entry and is exactly what
   Renderer v3 mixes — unmapped phases fall back to the synth layers.
   ============================================================================ */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useDataProvider } from '../data/provider'
import { hasSupabaseEnv } from '../auth/supabaseClient'
import type { CatalogProtocol } from '../data/catalog'
import {
  assetMapCoverage, emptyAssetMap, fmtBytes, groupSoundscapes, listAssets,
  PHASE_KEYS, type AssetMap, type AudioAsset, type PhaseKey,
} from './assets'

type Tab = 'music' | 'soundscape' | 'special'

const PHASE_LABEL: Record<PhaseKey, string> = {
  f1: 'F1 · Intro', f2: 'F2 · Breathing', f3: 'F3 · Centering',
  f4: 'F4 · Affirmation loop', f5: 'F5 · Integration', f6: 'F6 · Outro',
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
    else { setError('The asset library reads Supabase Storage — mock mode has no bucket. Set VITE_SUPABASE_URL / _ANON_KEY.'); setAssets([]) }
    void dp.listProtocols().then((ps) => {
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

  const assetRow = (a: AudioAsset) => (
    <div key={a.path} className="adm-asset">
      <button className={`adm-asset__play${playing === a.path ? ' is-on' : ''}`} onClick={() => toggle(a)} title={playing === a.path ? 'Stop' : 'Preview'}>
        {playing === a.path ? '■' : '▶'}
      </button>
      <span className="adm-asset__name" title={a.path}>{a.name}</span>
      <span className="adm-asset__meta">{fmtBytes(a.sizeBytes)}</span>
    </div>
  )

  return (
    <div className="adm-page">
      <header className="adm-page__head adm-page__head--row">
        <div>
          <h1 className="b2b-h1">Asset Library</h1>
          <p className="b2b-sub">The PO's produced audio in <code>protocol-audio/assets</code> — preview anything, then map which asset serves each protocol phase. Renderer v3 mixes exactly this mapping.</p>
        </div>
        <button className="b2b-btn" onClick={() => void refresh()} disabled={assets === null}>↻ Refresh</button>
      </header>

      {error && <div className="adm-note adm-note--warn">{error}</div>}
      {assets === null && <div className="adm-note">Listing the bucket…</div>}

      {assets !== null && (
        <>
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
                    {list.length === 0 && <div className="adm-asset__empty">No tracks in assets/music/{k}.</div>}
                    {list.map(assetRow)}
                  </div>
                )
              })}
            </div>
          )}

          {tab === 'soundscape' && (
            <div className="adm-asset__groups">
              {scapes.size === 0 && <div className="adm-asset__empty">No soundscape textures found under assets/soundscape.</div>}
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
                <div className="adm-asset__ghead">Heartbeat & singing bowl</div>
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
            <div className="adm-asset__ghead" style={{ marginBottom: 8 }}>Phase → asset mapping</div>
            {protocols.length === 0 ? (
              <div className="adm-asset__empty">No mappable protocols yet — import a datasheet or protocol document first.</div>
            ) : (
              <>
                <div className="adm-spec__row">
                  <span className="adm-spec__lbl">Protocol</span>
                  <select className="b2b-input adm-asset__sel" value={selCode} onChange={(e) => setSelCode(e.target.value)}>
                    {protocols.map((p) => <option key={p.code} value={p.code}>{p.code} — {p.title}</option>)}
                  </select>
                  <span className="adm-asset__meta">music {cov.music}/6 · soundscape {cov.soundscape}/6</span>
                </div>

                <div className="adm-asset__grid">
                  <div className="adm-asset__gridhead">Phase</div>
                  <div className="adm-asset__gridhead">Music stem</div>
                  <div className="adm-asset__gridhead">Soundscape texture</div>
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
                  <span className="adm-spec__lbl">Heartbeat file</span>
                  <select className="b2b-input adm-asset__sel" value={draft.heartbeat ?? ''} onChange={(e) => setSpecial('heartbeat', e.target.value)}>
                    <option value="">— synth provisional (60 BPM) —</option>
                    {assets.filter((a) => a.kind === 'heartbeat').map((a) => <option key={a.path} value={a.path}>{a.name}</option>)}
                  </select>
                </div>
                <div className="adm-spec__row">
                  <span className="adm-spec__lbl">Singing bowl file</span>
                  <select className="b2b-input adm-asset__sel" value={draft.bowl ?? ''} onChange={(e) => setSpecial('bowl', e.target.value)}>
                    <option value="">— synth provisional strike —</option>
                    {assets.filter((a) => a.kind === 'bowl').map((a) => <option key={a.path} value={a.path}>{a.name}</option>)}
                  </select>
                </div>

                <div className="adm-cred__actions" style={{ marginTop: 12 }}>
                  <button className="b2b-btn b2b-btn--primary" disabled={!dirty || saving || !selected} onClick={() => void save()}>
                    {saving ? 'Saving…' : `Save mapping for ${selCode}`}
                  </button>
                  {saved && <span className="adm-asset__meta">✓ Saved — the next render of {selCode} uses these assets.</span>}
                </div>
              </>
            )}
          </div>
        </>
      )}
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
