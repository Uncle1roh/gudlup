/* ============================================================================
   Economia — le regole dei Punti e dei Loops

   docs/gamification/SPEC.md §2.2, §8. Le regole si modificano qui e valgono
   da subito per le sessioni registrate dopo; quelle già accreditate non si
   ricalcolano (i registri sono solo in aggiunta). Il calcolatore mostra cosa
   genera una sessione Standard completata, con e senza un moltiplicatore.

   Il ricalcolo delle classifiche geografiche e delle conquiste collettive
   gira da solo ogni 15 minuti dove il database ha pg_cron; qui si fa subito.
   ============================================================================ */

import { useEffect, useState } from 'react'
import { useDataProvider } from '../data/provider'
import { DEFAULT_ECONOMY, computeSessionCredit, displayLoops, type EconomySettings } from '../gamification/economy'
import { MIN_COHORT } from '../legal/market'

type NumKey = 'pointsPerMinute' | 'pointsPerCompletedSession' | 'dailyMinutesCap' | 'dailyCompletionBonusCap' | 'minContributionPoints' | 'geoMinActiveUsers' | 'hrMinCohort'

const FIELDS: { key: NumKey; label: string; min: number }[] = [
  { key: 'pointsPerMinute', label: 'Punti per minuto ascoltato', min: 0 },
  { key: 'pointsPerCompletedSession', label: 'Punti per sessione completata', min: 0 },
  { key: 'dailyMinutesCap', label: 'Minuti validi al giorno (ora di San Paolo)', min: 0 },
  { key: 'dailyCompletionBonusCap', label: 'Bonus di completamento al giorno', min: 0 },
  { key: 'minContributionPoints', label: 'Contributo minimo per una conquista collettiva (punti)', min: 0 },
  { key: 'geoMinActiveUsers', label: 'Persone attive perché una città entri in classifica', min: 1 },
  { key: 'hrMinCohort', label: 'Soglia minima per i dati alle aziende (SPN-02, almeno 25)', min: MIN_COHORT },
]

const fmtLoops = (centi: number) => (centi / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function Economy({ actor }: { actor: string }) {
  const dp = useDataProvider()
  const [cfg, setCfg] = useState<EconomySettings | null>(null)
  const [saved, setSaved] = useState<EconomySettings | null>(null)
  const [mult, setMult] = useState(1.5)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    dp.getEconomySettings().then((c) => { setCfg(c); setSaved(c) }).catch(() => { setCfg({ ...DEFAULT_ECONOMY }); setSaved({ ...DEFAULT_ECONOMY }) })
  }, [dp])

  async function save() {
    if (!cfg) return
    setBusy(true); setNote(null); setError(null)
    try {
      if (cfg.hrMinCohort < MIN_COHORT) throw new Error(`La soglia per le aziende non può scendere sotto ${MIN_COHORT} (SPN-02).`)
      await dp.saveEconomySettings(cfg)
      await dp.logAudit({ actor, action: 'gamification.economy_saved', target: 'economy_settings', detail: JSON.stringify(cfg) }).catch(() => undefined)
      setSaved(cfg)
      setNote('Regole salvate. Valgono per le sessioni registrate da adesso.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Salvataggio non riuscito.')
    } finally {
      setBusy(false)
    }
  }

  async function refresh() {
    setBusy(true); setNote(null); setError(null)
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

  if (!cfg) return <div className="adm-page"><p className="adm-muted">Caricamento…</p></div>
  const std = { kind: 'b2c' as const, durationMin: 12, listenedSec: 720, completed: true, sos: false, endedAt: 0 }
  const plain = computeSessionCredit(std, cfg, null, null)
  const boosted = computeSessionCredit(std, cfg, null, mult)
  const dirty = JSON.stringify(cfg) !== JSON.stringify(saved)

  return (
    <div className="adm-page">
      <header className="adm-page__head">
        <h1 className="b2b-h1">Economia</h1>
        <p className="b2b-sub">
          Punti e Loops si calcolano solo nel database, a ogni sessione registrata. I Punti non si mostrano mai alla
          persona: lei vede i suoi Loops. Le sessioni SOS non generano nulla; quelle già accreditate non cambiano.
        </p>
      </header>

      {error && <p className="adm-note adm-note--err">{error}</p>}
      {note && <p className="adm-note adm-note--ok">{note}</p>}

      <section className="adm-econ">
        <h2 className="adm-h2">Calcolatore</h2>
        <p className="adm-note">
          Una sessione Standard (12 min) completata genera <strong>{plain.points} punti</strong> e <strong>{fmtLoops(plain.baseCenti)} Loops</strong>;
          con un moltiplicatore di{' '}
          <select className="b2b-input adm-econ__mult" value={mult} onChange={(e) => setMult(Number(e.target.value))}>
            {[1, 1.25, 1.5, 2].map((m) => <option key={m} value={m}>{m.toLocaleString('it-IT')}×</option>)}
          </select>{' '}
          ne genera <strong>{fmtLoops(boosted.baseCenti + boosted.companyCenti)}</strong> ({fmtLoops(boosted.companyCenti)} pagati dall’azienda).
          I punti restano {boosted.points}: il moltiplicatore non tocca mai i Punti (GAM-R9).
        </p>
      </section>

      <section className="adm-econ">
        <h2 className="adm-h2">Regole</h2>
        <div className="card adm-partner-form">
          <div className="adm-partner-form__grid">
            {FIELDS.map((f) => (
              <label key={f.key}>
                <span className="b2b-label">{f.label}</span>
                <input className="b2b-input" type="number" min={f.min} step={1} value={cfg[f.key]}
                       onChange={(e) => setCfg({ ...cfg, [f.key]: Math.max(f.min, Math.round(Number(e.target.value) || 0)) })} />
              </label>
            ))}
            <label>
              <span className="b2b-label">Loops per punto</span>
              <input className="b2b-input" type="number" min={0} step={0.01} value={cfg.loopsPerPoint}
                     onChange={(e) => setCfg({ ...cfg, loopsPerPoint: Math.max(0, Number(e.target.value) || 0) })} />
            </label>
            <label>
              <span className="b2b-label">Scadenza dei Loops (mesi, vuoto = mai)</span>
              <input className="b2b-input" type="number" min={1} step={1} value={cfg.loopsExpiryMonths ?? ''}
                     onChange={(e) => setCfg({ ...cfg, loopsExpiryMonths: e.target.value === '' ? null : Math.max(1, Math.round(Number(e.target.value))) })} />
            </label>
            <label className="adm-partner-form__check">
              <input type="checkbox" checked={cfg.countClinicalSessions} onChange={(e) => setCfg({ ...cfg, countClinicalSessions: e.target.checked })} />
              <span>Contare anche le sessioni della console del terapeuta</span>
            </label>
          </div>
          <div className="adm-made__acts">
            <button className="b2b-btn b2b-btn--primary" disabled={busy || !dirty} onClick={() => void save()}>{busy ? '…' : 'Salva regole'}</button>
            {dirty && <button className="b2b-btn b2b-btn--ghost" disabled={busy} onClick={() => setCfg(saved)}>Annulla modifiche</button>}
          </div>
        </div>
      </section>

      <section className="adm-econ">
        <h2 className="adm-h2">Classifiche geografiche e conquiste collettive</h2>
        <p className="b2b-sub">
          Aggiorna le classifiche per città, stato e regione e assegna le conquiste collettive raggiunte. Dove il
          database ha pg_cron succede da solo ogni 15 minuti.
        </p>
        <button className="b2b-btn b2b-btn--primary" disabled={busy} onClick={() => void refresh()}>{busy ? '…' : 'Ricalcola ora'}</button>
      </section>
      <p className="adm-muted">Una sessione Standard senza moltiplicatore vale {displayLoops(plain.baseCenti)} Loops interi a schermo: la persona vede i Loops arrotondati per difetto.</p>
    </div>
  )
}
