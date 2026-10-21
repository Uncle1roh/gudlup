/* ============================================================================
   Report — i numeri della gamification, per il team Good Loop

   docs/gamification/SPEC.md §8. Solo totali, mai una persona: Punti e Loops
   emessi per origine e per chi li paga, Loops riscattati, riscatti per
   beneficio, Loops emessi dal moltiplicatore per azienda e per mese (il CSV
   è la base della fattura all’azienda) e com’è andata ogni sfida.
   ============================================================================ */

import { useEffect, useState } from 'react'
import { useDataProvider, type GamificationReport } from '../data/provider'

const ENTRY_IT: Record<string, string> = {
  earn_listening: 'Ascolto', earn_company_multiplier: 'Moltiplicatore aziendale', achievement_bonus: 'Bonus conquiste',
  challenge_bonus: 'Bonus sfide', redemption: 'Riscatti', redemption_refund: 'Rimborsi', admin_adjustment: 'Rettifiche',
}
const loops = (centi: number) => (centi / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const day = (d: Date) => d.toISOString().slice(0, 10)

export function GamReports() {
  const dp = useDataProvider()
  const now = new Date()
  const [from, setFrom] = useState(day(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [to, setTo] = useState(day(now))
  const [r, setR] = useState<GamificationReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setR(null)
    dp.adminGamificationReport(from, to).then(setR).catch((e: Error) => setError(e.message))
  }, [dp, from, to])

  function downloadBilling() {
    if (!r) return
    const rows = [['azienda_id', 'azienda', 'mese', 'loops', 'persone'], ...r.multiplierByCompanyMonth.map((m) => [m.companyId, m.companyName, m.month, (m.loopsCenti / 100).toFixed(2), String(m.people)])]
    const csv = rows.map((row) => row.map((c) => /[",;\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `good-loop-moltiplicatore-${from}-${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const issued = r?.loopsBySource.filter((x) => x.centi > 0) ?? []
  const redeemed = r ? -r.loopsBySource.filter((x) => x.entryType === 'redemption').reduce((a, x) => a + x.centi, 0) : 0
  const refunded = r ? r.loopsBySource.filter((x) => x.entryType === 'redemption_refund').reduce((a, x) => a + x.centi, 0) : 0

  return (
    <div className="adm-page">
      <header className="adm-page__head">
        <h1 className="b2b-h1">Report</h1>
        <p className="b2b-sub">Totali soltanto. Nessuna riga riguarda una persona.</p>
        <div className="adm-spec__chips">
          <label>Dal <input className="b2b-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>al <input className="b2b-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
      </header>
      {error && <p className="adm-note adm-note--err">{error}</p>}
      {!r && !error && <p className="adm-muted">Caricamento…</p>}
      {r && (
        <>
          <div className="adm-kpis">
            <div><strong>{r.pointsIssued.toLocaleString('it-IT')}</strong><span>Punti emessi</span></div>
            <div><strong>{loops(issued.reduce((a, x) => a + x.centi, 0) - refunded)}</strong><span>Loops emessi</span></div>
            <div><strong>{loops(redeemed - refunded)}</strong><span>Loops riscattati (netti)</span></div>
            <div><strong>{loops(r.multiplierByCompanyMonth.reduce((a, m) => a + m.loopsCenti, 0))}</strong><span>Loops dal moltiplicatore</span></div>
          </div>

          <h2 className="adm-h2">Loops per origine</h2>
          <div className="adm-table adm-table--report2">
            <div className="adm-tr adm-tr--head"><div>Origine</div><div>Pagati da</div><div>Movimenti</div><div className="adm-tr__right">Loops</div></div>
            {r.loopsBySource.map((x) => (
              <div className="adm-tr" key={`${x.entryType}|${x.fundingSource}`}>
                <div>{ENTRY_IT[x.entryType] ?? x.entryType}</div><div>{x.fundingSource === 'company' ? 'Azienda' : 'Good Loop'}</div>
                <div>{x.entries}</div><div className="adm-tr__right">{loops(x.centi)}</div>
              </div>
            ))}
          </div>

          <div className="adm-page__head--row">
            <h2 className="adm-h2">Moltiplicatore per azienda e mese</h2>
            <button className="b2b-btn b2b-btn--ghost" disabled={!r.multiplierByCompanyMonth.length} onClick={downloadBilling}>Scarica CSV per la fattura</button>
          </div>
          <div className="adm-table adm-table--report2">
            <div className="adm-tr adm-tr--head"><div>Azienda</div><div>Mese</div><div>Persone</div><div className="adm-tr__right">Loops</div></div>
            {r.multiplierByCompanyMonth.map((m) => (
              <div className="adm-tr" key={`${m.companyId}|${m.month}`}><div>{m.companyName}</div><div>{m.month.slice(0, 7)}</div><div>{m.people}</div><div className="adm-tr__right">{loops(m.loopsCenti)}</div></div>
            ))}
            {!r.multiplierByCompanyMonth.length && <div className="adm-tr"><div className="adm-muted">Nessun moltiplicatore nel periodo.</div></div>}
          </div>

          <h2 className="adm-h2">Riscatti per beneficio</h2>
          <div className="adm-table adm-table--report2">
            <div className="adm-tr adm-tr--head"><div>Beneficio</div><div>Riscatti</div><div>Rimborsati</div><div className="adm-tr__right">Loops</div></div>
            {r.redemptionsByBenefit.map((b) => (
              <div className="adm-tr" key={b.benefitId}><div>{b.title}{b.companyId && <span className="adm-muted"> · {b.companyId}</span>}</div><div>{b.redemptions}</div><div>{b.refunded}</div><div className="adm-tr__right">{loops(b.loopsCenti)}</div></div>
            ))}
            {!r.redemptionsByBenefit.length && <div className="adm-tr"><div className="adm-muted">Nessun riscatto nel periodo.</div></div>}
          </div>

          <h2 className="adm-h2">Risultati delle sfide</h2>
          <div className="adm-table adm-table--report3">
            <div className="adm-tr adm-tr--head"><div>Sfida</div><div>Stato</div><div>Partecipano</div><div>Completato</div><div>Premiati</div><div className="adm-tr__right">Bonus</div></div>
            {r.challengeResults.map((c) => (
              <div className="adm-tr" key={c.id}><div>{c.title}{c.companyId && <span className="adm-muted"> · {c.companyId}</span>}</div><div>{c.status}</div><div>{c.participants}</div><div>{c.completed}</div><div>{c.rewarded}</div><div className="adm-tr__right">{loops(c.bonusCenti)}</div></div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
