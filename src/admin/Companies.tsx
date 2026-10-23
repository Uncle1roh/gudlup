/* ============================================================================
   Good Loop — companies (admin console)

   Creating a company creates the way INTO it. The row used to be minted with
   an id like `c-mf3x9k2`, and that id is the column an employee's profile
   points at — so the company code a person was asked for at registration was
   a timestamp in base 36 that nothing in the app could resolve or an HR admin
   could read down a phone line.

   The id is the CODE now, minted in the one canonical shape
   (`data/convention.ts`). One string does all three jobs: it identifies the
   company row, it is what HR registers with to open the company panel, and it
   is what an employee types to be linked to their employer.
   ============================================================================ */

import { useCallback, useEffect, useState } from 'react'
import { st } from '../sales/i18n'
import { useDataProvider } from '../data/provider'
import { useCompanies } from './hooks'
import { fmtDate } from '../b2b/data'
import { generateCompanyCode, looksLikeCompanyCode, normalizeCode } from '../data/convention'
import type { Company } from './types'
import type { AddonPlan } from '../gamification/company'

export function Companies({ actor }: { actor: string }) {
  const dp = useDataProvider()
  /* Issuing a therapist code for a tenant. HR can do this themselves in their
     own dashboard; this is here for the support call where they cannot. */
  const [codeFor, setCodeFor] = useState<string | null>(null)
  const [issued, setIssued] = useState<string | null>(null)
  async function issueTherapistCode(companyId: string) {
    setCodeFor(companyId); setIssued(null)
    try {
      const made = await dp.createCompanyTherapistCode(companyId, actor)
      setIssued(made.code)
      await dp.logAudit({ actor, action: 'therapist_code.issued', target: companyId, detail: made.code }).catch(() => undefined)
    } catch (e) {
      window.alert(st('Impossibile generare il codice: {err}', { err: (e as Error).message }))
      setCodeFor(null)
    }
  }
  const { data, loading, refetch } = useCompanies()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [seats, setSeats] = useState('100')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [made, setMade] = useState<Company | null>(null)
  const [copied, setCopied] = useState(false)

  /* ---- the plan, at the moment the company is created --------------------

     The multiplier is not a property of the company row: it comes from the
     add-on plan the company is subscribed to, and that lived on a second
     screen. So selling a Premium contract was "create the company here, then
     go to Piani e aziende and find it in the list" — two screens, and a
     company sitting on 1× in between because somebody was interrupted.

     The plan is chosen here, applied in the same action, and still editable
     on the plans screen afterwards. Nothing about the model changed; what
     changed is that the sale is one form. */
  const [plans, setPlans] = useState<AddonPlan[]>([])
  const [planId, setPlanId] = useState<string>('')
  const loadPlans = useCallback(() => {
    void dp.adminListPlans().then((rows) => setPlans(rows.filter((p) => p.active))).catch(() => setPlans([]))
  }, [dp])
  useEffect(loadPlans, [loadPlans])
  const chosenPlan = plans.find((p) => p.id === planId) ?? null

  /* Minted from the name as it is typed, and editable: two companies whose
     names start with the same word would otherwise be handed codes that differ
     only in a checksum pair, and the admin is the person who should decide. */
  const suggested = name.trim() ? generateCompanyCode(name) : ''
  const finalCode = normalizeCode(code || suggested)
  const codeTaken = (data ?? []).some((c) => c.id === finalCode)
  const codeBad = !!finalCode && !looksLikeCompanyCode(finalCode)

  async function create() {
    const n = name.trim()
    if (!n || !finalCode || codeTaken || codeBad) return
    const company: Company = {
      // the id IS the code: one string identifies the company, opens the
      // company panel for its HR admin, and links an employee's account
      id: finalCode,
      name: n,
      seats: Math.max(1, parseInt(seats, 10) || 0),
      activeUsers: 0,
      status: 'active',
      createdAt: Date.now(),
    }
    setBusy(true)
    await dp.saveCompany(company)
    await dp.logAudit({ actor, action: 'company.created', target: company.name, detail: `${company.id} · ${company.seats} postazioni` })
    /* The plan second, and never fatally: the company exists either way, and
       a subscription that did not take is fixable on the plans screen. A
       company that was not created because its plan failed is not. */
    if (planId) {
      try {
        await dp.adminSetCompanyPlan(company.id, planId)
        await dp.logAudit({ actor, action: 'addon.plan_set', target: company.id, detail: planId })
      } catch (e) {
        window.alert(st('Azienda creata, ma il piano non è stato applicato: {err}', { err: (e as Error).message })
          + String.fromCharCode(10) + st('Assegnalo da “Piani e moltiplicatori”.'))
      }
    }
    setBusy(false)
    setName(''); setSeats('100'); setCode(''); setPlanId(''); setAdding(false)
    setMade(company)
    refetch()
  }

  function copy(value: string) {
    navigator.clipboard?.writeText(value).then(
      () => { setCopied(true); window.setTimeout(() => setCopied(false), 1600) },
      () => { /* clipboard blocked — the code is selectable on screen */ },
    )
  }

  async function toggleStatus(c: Company) {
    const next: Company = { ...c, status: c.status === 'active' ? 'paused' : 'active' }
    await dp.saveCompany(next)
    await dp.logAudit({ actor, action: next.status === 'paused' ? 'company.paused' : 'company.resumed', target: c.name })
    refetch()
  }

  const companies = data ?? []

  return (
    <div className="adm-page">
      <header className="adm-page__head adm-page__head--row">
        <div>
          <h1 className="b2b-h1">{st('Aziende')}</h1>
          <p className="b2b-sub">Le aziende su cui la piattaforma è attivata. {companies.length} in totale.</p>
        </div>
        <button className="b2b-btn b2b-btn--primary" onClick={() => setAdding((v) => !v)}>{adding ? st('Annulla') : st('+ Nuova azienda')}</button>
      </header>

      {adding && (
        <>
          <div className="adm-addrow">
            <input className="b2b-input" placeholder={st('Nome azienda')} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <input
              className="b2b-input adm-addrow__code"
              placeholder={suggested || 'CODICE-2026-XX'}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <input className="b2b-input adm-addrow__seats" type="number" min={1} placeholder={st('Postazioni')} value={seats} onChange={(e) => setSeats(e.target.value)} />
            <select
              className="b2b-input adm-addrow__plan"
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              aria-label={st('Piano add-on')}
            >
              <option value="">{st('Nessun piano · 1×')}</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.name} · {p.multiplier}×</option>
              ))}
            </select>
            <button className="b2b-btn b2b-btn--primary" disabled={busy || !name.trim() || !finalCode || codeTaken || codeBad} onClick={create}>{st('Crea')}</button>
          </div>
          {chosenPlan && (
            <p className="b2b-sub">
              {st('Con {plan} i Loops dell’ascolto valgono {mult}× per chi è di questa azienda, finché l’abbonamento è attivo. Vale per le sessioni che finiscono da adesso: niente viene ricalcolato all’indietro.', { plan: chosenPlan.name, mult: chosenPlan.multiplier })}
            </p>
          )}
          <p className="b2b-sub">
            {st('Il codice azienda è anche l’accesso: con questo codice l’HR si registra su #hr e apre il pannello aziendale, e i dipendenti lo inseriscono alla registrazione per essere collegati.')}
            {finalCode && !codeTaken && !codeBad && <> {st('Sarà {code}.', { code: finalCode })}</>}
            {codeTaken && <span className="pe-err"> {st('{code} è già di un’altra azienda.', { code: finalCode })}</span>}
            {codeBad && <span className="pe-err"> {st('Forma non valida: serve NOME-ANNO-XX.')}</span>}
          </p>
        </>
      )}

      {made && (
        <div className="adm-made">
          <div>
            {st('{name} creata. Codice azienda:', { name: made.name })}{' '}
            <span className="adm-code">{made.id}</span>
          </div>
          <div className="adm-made__acts">
            <button className="b2b-btn b2b-btn--ghost" onClick={() => copy(made.id)}>{copied ? st('Copiato') : st('Copia')}</button>
            <button className="b2b-btn b2b-btn--ghost" onClick={() => setMade(null)}>{st('Chiudi')}</button>
          </div>
        </div>
      )}

      {loading && <p className="b2b-sub">{st('Caricamento…')}</p>}

      {!loading && (
        <div className="adm-table adm-table--companies">
          <div className="adm-tr adm-tr--head">
            <div>{st('Azienda')}</div><div>{st('Codice / accesso')}</div><div>{st('Postazioni usate')}</div><div>{st('Creata')}</div><div>{st('Stato')}</div><div className="adm-tr__right">{st('Azione')}</div>
          </div>
          {companies.map((c) => {
            const pct = c.seats ? Math.min(100, Math.round((c.activeUsers / c.seats) * 100)) : 0
            return (
              <div className="adm-tr" key={c.id}>
                <div><b>{c.name}</b></div>
                <div>
                  <button className="adm-code adm-code--btn" title={st('Copia il codice')} onClick={() => copy(c.id)}>{c.id}</button>
                </div>
                <div>
                  <div className="adm-seats">{c.activeUsers} / {c.seats}</div>
                  <div className="adm-bar"><span style={{ width: `${pct}%` }} /></div>
                </div>
                <div>{fmtDate(c.createdAt)}</div>
                <div>{c.status === 'active' ? <span className="adm-pill adm-pill--ok">{st('Attiva')}</span> : <span className="adm-pill adm-pill--warn">{st('In pausa')}</span>}</div>
                <div className="adm-tr__right">
                  {/* The company can issue these themselves; this is for the
                      support call where they cannot. */}
                  <button className="b2b-btn b2b-btn--ghost" onClick={() => void issueTherapistCode(c.id)}>
                    {codeFor === c.id && issued ? issued : 'Codice terapeuta'}
                  </button>
                  <button className="b2b-btn b2b-btn--ghost" onClick={() => toggleStatus(c)}>{c.status === 'active' ? 'Sospendi' : 'Riattiva'}</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
