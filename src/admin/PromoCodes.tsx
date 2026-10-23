/* ============================================================================
   Good Loop — promo codes (admin console)

   A code and the discount it carries. A person types the code at
   registration; the account keeps the code and its percentage from then on.
   Deleting a code stops new sign-ups using it and changes nothing for the
   accounts that already did — see the PROMO CODES block in setup.sql.
   ============================================================================ */

import { useState } from 'react'
import { st } from '../sales/i18n'
import { useDataProvider } from '../data/provider'
import { usePromoCodes } from './hooks'
import { fmtDate } from '../b2b/data'
import { generatePromoCode, isValidDiscount, isValidPromoCode, normalizePromoCode } from '../data/promo'

export function PromoCodes({ actor }: { actor: string }) {
  const dp = useDataProvider()
  const { data, loading, error: loadError, refetch } = usePromoCodes()
  const [adding, setAdding] = useState(false)
  const [code, setCode] = useState('')
  const [pct, setPct] = useState('10')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [armed, setArmed] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const codes = data ?? []
  const finalCode = normalizePromoCode(code)
  const pctNum = Number(pct)
  const codeTaken = codes.some((c) => c.code === finalCode)
  const codeBad = !!finalCode && !isValidPromoCode(finalCode)
  const pctBad = pct !== '' && !isValidDiscount(pctNum)
  const canCreate = !busy && !!finalCode && !codeTaken && !codeBad && isValidDiscount(pctNum)

  async function create() {
    if (!canCreate) return
    setBusy(true); setError(null)
    try {
      await dp.createPromoCode(finalCode, pctNum, actor)
      await dp.logAudit({ actor, action: 'promo_code.created', target: finalCode, detail: `${pctNum}%` }).catch(() => undefined)
      setCode(''); setPct('10'); setAdding(false)
      refetch()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(c: string) {
    setBusy(true); setError(null)
    try {
      await dp.deletePromoCode(c)
      await dp.logAudit({ actor, action: 'promo_code.deleted', target: c }).catch(() => undefined)
      setArmed(null)
      refetch()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function copy(value: string) {
    navigator.clipboard?.writeText(value).then(
      () => { setCopied(value); window.setTimeout(() => setCopied(null), 1600) },
      () => { /* clipboard blocked — the code is selectable on screen */ },
    )
  }

  return (
    <div className="adm-page">
      <header className="adm-page__head adm-page__head--row">
        <div>
          <h1 className="b2b-h1">{st('Codici promo')}</h1>
          <p className="b2b-sub">
            {st('Codici da inserire alla registrazione, ciascuno con la sua percentuale di sconto. {n} in totale.', { n: codes.length })}
          </p>
        </div>
        <button className="b2b-btn b2b-btn--primary" onClick={() => { setAdding((v) => !v); setError(null) }}>
          {adding ? st('Annulla') : st('+ Nuovo codice')}
        </button>
      </header>

      {adding && (
        <>
          <div className="adm-addrow">
            <input
              className="b2b-input adm-addrow__code"
              placeholder="ES. BENVENUTO10"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              autoFocus
            />
            <button className="b2b-btn b2b-btn--ghost" onClick={() => setCode(generatePromoCode())}>{st('Genera')}</button>
            <input
              className="b2b-input adm-addrow__pct"
              type="number" min={1} max={100} step={1}
              placeholder={st('Sconto %')}
              value={pct}
              onChange={(e) => setPct(e.target.value)}
            />
            <button className="b2b-btn b2b-btn--primary" disabled={!canCreate} onClick={() => void create()}>{st('Crea')}</button>
          </div>
          <p className="b2b-sub">
            {st('Da 3 a 32 caratteri: lettere, numeri e trattini. Sconto da 1 a 100%.')}
            {finalCode && !codeTaken && !codeBad && isValidDiscount(pctNum) && <> {st('Sarà {code} · {pct}%.', { code: finalCode, pct: pctNum })}</>}
            {codeTaken && <span className="pe-err">{st('{code} esiste già.', { code: finalCode })}</span>}
            {codeBad && <span className="pe-err">{st('Forma non valida.')}</span>}
            {pctBad && <span className="pe-err">{st('Lo sconto è un numero intero da 1 a 100.')}</span>}
          </p>
        </>
      )}

      {error && <p className="pe-err">{error}</p>}
      {loadError && <p className="pe-err">{st('Impossibile caricare i codici: {err} — esegui supabase/9-promo-codes.sql.', { err: loadError.message })}</p>}
      {loading && <p className="b2b-sub">{st('Caricamento…')}</p>}

      {!loading && !loadError && (
        codes.length === 0 ? (
          <p className="b2b-sub">{st('Ancora nessun codice. «＋ Nuovo codice» per crearne uno.')}</p>
        ) : (
          <div className="adm-table adm-table--promo">
            <div className="adm-tr adm-tr--head">
              <div>{st('Codice')}</div><div>{st('Sconto')}</div><div>{st('Utilizzi')}</div><div>{st('Creato')}</div><div className="adm-tr__right">{st('Azione')}</div>
            </div>
            {codes.map((c) => (
              <div className="adm-tr" key={c.code}>
                <div>
                  <button className="adm-code adm-code--btn" title={st('Copia il codice')} onClick={() => copy(c.code)}>
                    {copied === c.code ? st('Copiato') : c.code}
                  </button>
                </div>
                <div><b>{c.discountPct}%</b></div>
                <div>{c.uses}</div>
                <div className="adm-muted">{fmtDate(c.createdAt)}{c.createdBy ? ` · ${c.createdBy}` : ''}</div>
                <div className="adm-tr__right">
                  {armed === c.code ? (
                    <>
                      <button className="b2b-btn b2b-btn--danger" disabled={busy} onClick={() => void remove(c.code)}>{st('Sì, elimina')}</button>
                      <button className="b2b-btn b2b-btn--ghost" disabled={busy} onClick={() => setArmed(null)}>{st('Annulla')}</button>
                    </>
                  ) : (
                    <button
                      className="b2b-btn b2b-btn--ghost"
                      title={c.uses ? st('{n} account lo hanno usato: mantengono lo sconto', { n: c.uses }) : undefined}
                      onClick={() => setArmed(c.code)}
                    >
                      {st('Elimina')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}
      <p className="b2b-sub" style={{ marginTop: 12 }}>
        {st('Eliminare un codice impedisce nuove registrazioni con quel codice; gli account già registrati mantengono lo sconto.')}
      </p>
    </div>
  )
}
