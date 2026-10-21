/* ============================================================================
   Economia — i Loops, le classifiche, le conquiste collettive

   docs/gamification/SPEC.md §2, §4.4, §8. Per ora due cose: le regole in
   vigore, in sola lettura, e il ricalcolo delle classifiche geografiche con
   la valutazione delle conquiste collettive. Il ricalcolo gira da solo ogni
   15 minuti dove il database ha pg_cron; qui si fa a mano, subito.
   La modifica delle regole e il calcolatore arrivano con lo slice 7.
   ============================================================================ */

import { useEffect, useState } from 'react'
import { useDataProvider } from '../data/provider'
import { DEFAULT_ECONOMY, type EconomySettings } from '../gamification/economy'

export function Economy({ actor }: { actor: string }) {
  const dp = useDataProvider()
  const [cfg, setCfg] = useState<EconomySettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { dp.getEconomySettings().then(setCfg).catch(() => setCfg({ ...DEFAULT_ECONOMY })) }, [dp])

  async function refresh() {
    setBusy(true)
    setNote(null)
    setError(null)
    try {
      const n = await dp.adminRefreshGeo()
      setNote(n === 0 ? 'Classifiche aggiornate. Nessuna nuova conquista collettiva.' : `Classifiche aggiornate. ${n} conquiste collettive assegnate.`)
      await dp.logAudit({ actor, action: 'gamification.geo_refresh', target: 'geo_rollup', detail: `${n} assegnate` }).catch(() => undefined)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ricalcolo non riuscito.')
    } finally {
      setBusy(false)
    }
  }

  const rows: [string, string][] = cfg ? [
    ['Punti per minuto ascoltato', String(cfg.pointsPerMinute)],
    ['Punti per sessione completata', `+${cfg.pointsPerCompletedSession}`],
    ['Minuti validi al giorno', String(cfg.dailyMinutesCap)],
    ['Bonus di completamento al giorno', String(cfg.dailyCompletionBonusCap)],
    ['Loops per punto', String(cfg.loopsPerPoint)],
    ['Contributo minimo per una conquista collettiva', `${cfg.minContributionPoints} punti`],
    ['Sessioni cliniche (console del terapeuta)', cfg.countClinicalSessions ? 'contano' : 'non contano'],
    ['Scadenza dei Loops', cfg.loopsExpiryMonths === null ? 'nessuna' : `${cfg.loopsExpiryMonths} mesi`],
    ['Persone attive perché una città entri in classifica', String(cfg.geoMinActiveUsers)],
    ['Soglia minima per i dati alle aziende (SPN-02)', String(cfg.hrMinCohort)],
  ] : []

  return (
    <div className="adm-page">
      <header className="adm-page__head">
        <h1 className="b2b-h1">Economia</h1>
        <p className="b2b-sub">
          Punti e Loops si calcolano solo nel database, a ogni sessione registrata. I Punti
          non si mostrano mai alla persona: lei vede i suoi Loops.
        </p>
      </header>

      {error && <p className="adm-note adm-note--err">{error}</p>}
      {note && <p className="adm-note adm-note--ok">{note}</p>}

      <section className="adm-econ">
        <h2 className="adm-h2">Classifiche geografiche e conquiste collettive</h2>
        <p className="b2b-sub">
          Aggiorna le classifiche per città, stato e regione e assegna le conquiste collettive
          raggiunte. Dove il database ha pg_cron succede da solo ogni 15 minuti.
        </p>
        <button className="b2b-btn b2b-btn--primary" disabled={busy} onClick={() => void refresh()}>
          {busy ? '…' : 'Ricalcola ora'}
        </button>
      </section>

      <section className="adm-econ">
        <h2 className="adm-h2">Regole in vigore</h2>
        <div className="adm-table adm-table--economy">
          {rows.map(([k, v]) => (
            <div className="adm-tr" key={k}><div>{k}</div><div className="adm-tr__right">{v}</div></div>
          ))}
        </div>
      </section>
    </div>
  )
}
