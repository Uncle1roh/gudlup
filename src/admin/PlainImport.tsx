/* The review half of the PLAIN Timeline import path (slice 1 of the new
   clip-level format). A parsed PlainTimeline is shown for verification:
   identity, per-version summary (duration, phase map, tracks with clip counts
   per type), the resolved affirmation database, and every validation issue
   from the Rules doc grouped by severity. Studio seeding and rendering follow
   in the next slices — this screen is the go/no-go gate for the workbook. */

import { useMemo } from 'react'
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
  onCancel: () => void
}

const TIPO_ORDER: PlainTipo[] = ['voice', 'soundscape', 'music', 'binaural', 'bilateral', 'solfeggio']

function tipoCounts(v: PlainVersion): { tipo: PlainTipo; n: number }[] {
  const map = new Map<PlainTipo, number>()
  for (const c of v.clips) map.set(c.tipo, (map.get(c.tipo) ?? 0) + 1)
  return TIPO_ORDER.filter((t) => map.has(t)).map((t) => ({ tipo: t, n: map.get(t)! }))
}

export function PlainImport({ timeline: t, fileName, onCancel }: Props) {
  const errors = t.issues.filter((i) => i.level === 'error')
  const warnings = t.issues.filter((i) => i.level === 'warning')
  const infos = t.issues.filter((i) => i.level === 'info')
  const totalClips = useMemo(() => t.versions.reduce((n, v) => n + v.clips.length, 0), [t])

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
        </div>

        {t.versions.map((v) => {
          const counts = tipoCounts(v)
          return (
            <div key={v.sheet} className="adm-spec__version">
              <div className="adm-spec__vhead">
                Sheet “{v.sheet}” {v.versionKey ? `· ${v.versionKey.toUpperCase()}` : ''} · {v.durationMin} min ({secToMmss(v.durationS)})
                {v.declaredTotal !== null && ` · declared ${v.declaredTotal} clips`}
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

      <div className="adm-import__foot" style={{ marginTop: 16 }}>
        <p className="b2b-sub adm-import__hint">
          Next slices wire this format into the Sound Studio (1 row → 1 clip, archetype → catalog voice, eco → Emotional Echo,
          loop expansion) and the renderer (random draw from tag / phase pools). This screen is the validation gate.
        </p>
      </div>
    </div>
  )
}
