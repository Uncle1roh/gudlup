/* ============================================================================
   Traguardi — le conquiste, individuali e collettive

   docs/gamification/SPEC.md §3, §8. Si modificano soglia, bonus e stato;
   lo slug, la metrica e l’ambito no: sono il contratto con il database, che
   rifiuta metriche su punteggi o VAS e ambiti di squadra. Una conquista,
   una volta sbloccata, resta della persona anche se qui la si spegne.
   Nomi e frasi sono in src/gamification/copy.ts (pt-BR in i18n).
   ============================================================================ */

import { useCallback, useEffect, useState } from 'react'
import { useDataProvider } from '../data/provider'
import { Badge } from '../gamification/ui/Badge'
import { copyFor } from '../gamification/copy'
import { PT_GAMIFICATION } from '../i18n/gamification'
import type { AchievementDef } from '../gamification/achievements'

type Row = AchievementDef & { id: string }

const UNIT: Record<string, string> = { minutes_listened: 'minuti', distinct_weeks: 'settimane', durations_completed: 'durate' }

export function Achievements({ actor }: { actor: string }) {
  const dp = useDataProvider()
  const [rows, setRows] = useState<Row[]>([])
  const [edits, setEdits] = useState<Record<string, Row>>({})
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => { void dp.adminListAchievementDefs().then(setRows).catch((e: Error) => setError(e.message)) }, [dp])
  useEffect(load, [load])

  async function save(r: Row) {
    setBusy(true); setError(null); setNote(null)
    try {
      await dp.adminSaveAchievementDef(r)
      await dp.logAudit({ actor, action: 'achievement.updated', target: r.slug, detail: `soglia ${r.threshold}, bonus ${r.bonusLoopsCenti / 100}, ${r.active ? 'attiva' : 'spenta'}` }).catch(() => undefined)
      setEdits((e) => { const n = { ...e }; delete n[r.id]; return n })
      setNote(`«${PT_GAMIFICATION[copyFor(r.slug).name] ?? r.slug}» salvata.`)
      load()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  async function evaluate() {
    setBusy(true); setError(null); setNote(null)
    try {
      const n = await dp.adminEvaluateAchievements()
      setNote(n ? `${n} nuove conquiste assegnate.` : 'Nessuna nuova conquista.')
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const groups: [string, Row[]][] = [['Individuali', rows.filter((r) => r.kind === 'individual')], ['Collettive', rows.filter((r) => r.kind === 'collective')]]

  return (
    <div className="adm-page">
      <header className="adm-page__head adm-page__head--row">
        <div>
          <h1 className="b2b-h1">Traguardi</h1>
          <p className="b2b-sub">Permanenti e una volta sola: nessuno perde una conquista. Il bonus si paga una volta, da Good Loop, mai moltiplicato.</p>
        </div>
        <button className="b2b-btn b2b-btn--ghost" disabled={busy} onClick={() => void evaluate()}>Rivaluta tutti</button>
      </header>
      {error && <p className="adm-note adm-note--err">{error}</p>}
      {note && <p className="adm-note adm-note--ok">{note}</p>}

      {groups.map(([title, list]) => (
        <section key={title}>
          <h2 className="adm-h2">{title}</h2>
          <div className="adm-table adm-table--achievements">
            <div className="adm-tr adm-tr--head"><div /><div>Conquista</div><div>Metrica</div><div>Soglia</div><div>Bonus (Loops)</div><div>Attiva</div><div className="adm-tr__right" /></div>
            {list.map((r0) => {
              const r = edits[r0.id] ?? r0
              const dirty = !!edits[r0.id]
              const set = (p: Partial<Row>) => setEdits((e) => ({ ...e, [r0.id]: { ...r, ...p } }))
              return (
                <div className={`adm-tr${r.active ? '' : ' is-inactive'}`} key={r0.id}>
                  <div><Badge icon={r.icon} tier={r.tier} shape={r.kind === 'individual' ? 'circle' : 'hexagon'} size={36} locked={!r.active} /></div>
                  <div><strong>{PT_GAMIFICATION[copyFor(r.slug).name] ?? r.slug}</strong><div className="adm-muted adm-mono">{r.slug} · {r.tier}</div></div>
                  <div className="adm-mono">{r.metric}{UNIT[r.metric] ? ` (${UNIT[r.metric]})` : ''}</div>
                  <div><input className="b2b-input" type="number" min={1} value={r.threshold} onChange={(e) => set({ threshold: Math.max(1, Number(e.target.value) || 1) })} /></div>
                  <div><input className="b2b-input" type="number" min={0} value={Math.floor(r.bonusLoopsCenti / 100)} onChange={(e) => set({ bonusLoopsCenti: Math.max(0, Math.round(Number(e.target.value) || 0)) * 100 })} /></div>
                  <div><input type="checkbox" checked={r.active} onChange={(e) => set({ active: e.target.checked })} aria-label="Attiva" /></div>
                  <div className="adm-tr__right">{dirty && <button className="b2b-btn b2b-btn--primary" disabled={busy} onClick={() => void save(r)}>Salva</button>}</div>
                </div>
              )
            })}
          </div>
        </section>
      ))}
      <p className="adm-muted">«Conhecer-se» e «Jornada completa» sono spente: l’app non ha ancora un’autovalutazione iniziale non clinica né una jornada di 12 settimane (PLAN A9, A14).</p>
    </div>
  )
}
