/* ============================================================================
   Piani e aziende — l’add-on venduto alle aziende

   docs/gamification/SPEC.md §7.1, §8. I piani (Essencial 1×, Plus 1,25×,
   Premium 1,5×, Max 2× — nomi e valori provvisori) e, per ogni azienda, il
   piano in vigore: assegnarlo, cambiarlo, terminarlo. Il moltiplicatore vale
   per le sessioni che FINISCONO mentre l’abbonamento è attivo e la persona è
   ancora dell’azienda, e solo per i Loops dell’ascolto.
   ============================================================================ */

import { useCallback, useEffect, useState } from 'react'
import { st } from '../sales/i18n'
import { useDataProvider } from '../data/provider'
import type { Company } from './types'
import type { AddonPlan, CompanySubscription } from '../gamification/company'

export function Plans({ actor }: { actor: string }) {
  const dp = useDataProvider()
  const [plans, setPlans] = useState<AddonPlan[]>([])
  const [subs, setSubs] = useState<CompanySubscription[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [draft, setDraft] = useState<AddonPlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(() => {
    void Promise.all([dp.adminListPlans(), dp.adminListSubscriptions(), dp.listCompanies()])
      .then(([p, s, c]) => { setPlans(p); setSubs(s); setCompanies(c) })
      .catch((e: Error) => setError(e.message))
  }, [dp])
  useEffect(load, [load])

  const current = (companyId: string) => subs.find((s) => s.companyId === companyId && s.status === 'active' && (s.endsAt === null || s.endsAt > Date.now()))

  async function setPlan(c: Company, planId: string | null) {
    const was = current(c.id)
    const label = planId ? plans.find((p) => p.id === planId)?.name : st('nessun piano')
    const from = was ? plans.find((p) => p.id === was.planId)?.name ?? was.planId : st('nessun piano')
    const ask = st('{company}: {from} → {to}?', { company: c.name, from, to: label ?? '' })
      + String.fromCharCode(10, 10) + st('Vale da adesso: le sessioni già accreditate non cambiano.')
    if (!window.confirm(ask)) return
    setBusy(true); setError(null); setNote(null)
    try {
      await dp.adminSetCompanyPlan(c.id, planId)
      await dp.logAudit({ actor, action: planId ? 'addon.plan_set' : 'addon.plan_ended', target: c.id, detail: planId ?? '' }).catch(() => undefined)
      setNote(`${c.name}: ${label}.`)
      load()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  async function savePlan(p: AddonPlan) {
    setBusy(true); setError(null)
    try {
      if (!/^[a-z0-9_]+$/.test(p.id)) throw new Error(st('L’id usa solo lettere minuscole, cifre e _.'))
      if (p.multiplier < 1 || p.multiplier > 5) throw new Error(st('Il moltiplicatore va da 1 a 5.'))
      await dp.adminSavePlan(p)
      await dp.logAudit({ actor, action: 'addon.plan_saved', target: p.id, detail: `${p.multiplier}×` }).catch(() => undefined)
      setDraft(null)
      load()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="adm-page">
      <header className="adm-page__head adm-page__head--row">
        <div>
          <h1 className="b2b-h1">{st('Piani e aziende')}</h1>
          <p className="b2b-sub">{st('Il moltiplicatore tocca solo i Loops dell’ascolto: mai i Punti, le classifiche, le conquiste, le sfide o i bonus.')}</p>
        </div>
        {!draft && <button className="b2b-btn b2b-btn--primary" onClick={() => setDraft({ id: '', name: '', multiplier: 1, companyChallenges: true, companyBenefits: true, tagFilter: true, active: true })}>{st('+ Nuovo piano')}</button>}
      </header>
      {error && <p className="adm-note adm-note--err">{error}</p>}
      {note && <p className="adm-note adm-note--ok">{note}</p>}

      {draft && (
        <div className="card adm-partner-form">
          <div className="adm-partner-form__grid">
            <label><span className="b2b-label">{st('Id *')}</span><input className="b2b-input adm-mono" value={draft.id} disabled={plans.some((p) => p.id === draft.id) && !!draft.name} onChange={(e) => setDraft({ ...draft, id: e.target.value.toLowerCase() })} /></label>
            <label><span className="b2b-label">{st('Nome *')}</span><input className="b2b-input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
            <label><span className="b2b-label">{st('Moltiplicatore')}</span><input className="b2b-input" type="number" min={1} max={5} step={0.05} value={draft.multiplier} onChange={(e) => setDraft({ ...draft, multiplier: Number(e.target.value) || 1 })} /></label>
            <label className="adm-partner-form__check"><input type="checkbox" checked={draft.companyChallenges} onChange={(e) => setDraft({ ...draft, companyChallenges: e.target.checked })} /><span>{st('Sfide aziendali')}</span></label>
            <label className="adm-partner-form__check"><input type="checkbox" checked={draft.companyBenefits} onChange={(e) => setDraft({ ...draft, companyBenefits: e.target.checked })} /><span>{st('Benefici aziendali')}</span></label>
            <label className="adm-partner-form__check"><input type="checkbox" checked={draft.tagFilter} onChange={(e) => setDraft({ ...draft, tagFilter: e.target.checked })} /><span>{st('Filtro dei tag')}</span></label>
            <label className="adm-partner-form__check"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /><span>{st('Vendibile')}</span></label>
          </div>
          <div className="adm-made__acts">
            <button className="b2b-btn b2b-btn--primary" disabled={busy || !draft.id || !draft.name.trim()} onClick={() => void savePlan(draft)}>{st('Salva')}</button>
            <button className="b2b-btn b2b-btn--ghost" disabled={busy} onClick={() => setDraft(null)}>{st('Annulla')}</button>
          </div>
        </div>
      )}

      <h2 className="adm-h2">{st('Piani')}</h2>
      <div className="adm-table adm-table--plans">
        <div className="adm-tr adm-tr--head"><div>{st('Piano')}</div><div>{st('Moltiplicatore')}</div><div>{st('Include')}</div><div>{st('Aziende')}</div><div className="adm-tr__right" /></div>
        {plans.map((p) => (
          <div className={`adm-tr${p.active ? '' : ' is-inactive'}`} key={p.id}>
            <div><strong>{p.name}</strong> <span className="adm-muted adm-mono">{p.id}</span></div>
            <div>{p.multiplier.toLocaleString('it-IT')}×</div>
            <div>{[p.companyChallenges && st('sfide'), p.companyBenefits && st('benefici'), p.tagFilter && st('filtro tag')].filter(Boolean).join(' · ') || '—'}</div>
            <div>{companies.filter((c) => current(c.id)?.planId === p.id).length}</div>
            <div className="adm-tr__right"><button className="b2b-btn b2b-btn--ghost" onClick={() => setDraft({ ...p })}>{st('Modifica')}</button></div>
          </div>
        ))}
      </div>

      <h2 className="adm-h2">{st('Aziende')}</h2>
      <div className="adm-table adm-table--plan-companies">
        <div className="adm-tr adm-tr--head"><div>{st('Azienda')}</div><div>{st('Piano in vigore')}</div><div>{st('Dal')}</div><div className="adm-tr__right">{st('Cambia')}</div></div>
        {companies.map((c) => {
          const s = current(c.id)
          return (
            <div className="adm-tr" key={c.id}>
              <div><strong>{c.name}</strong> <span className="adm-muted adm-mono">{c.id}</span></div>
              <div>{s ? `${plans.find((p) => p.id === s.planId)?.name ?? s.planId}` : <span className="adm-muted">{st('nessun add-on')}</span>}</div>
              <div>{s ? new Date(s.startsAt).toLocaleDateString('it-IT') : '—'}</div>
              <div className="adm-tr__right adm-benefit__acts">
                <select className="b2b-input" value="" disabled={busy} onChange={(e) => { if (e.target.value) void setPlan(c, e.target.value === '-' ? null : e.target.value) }}>
                  <option value="">{s ? st('Cambia piano…') : st('Assegna piano…')}</option>
                  {plans.filter((p) => p.active && p.id !== s?.planId).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.multiplier.toLocaleString('it-IT')}×)</option>)}
                  {s && <option value="-">{st('Termina l’add-on')}</option>}
                </select>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
