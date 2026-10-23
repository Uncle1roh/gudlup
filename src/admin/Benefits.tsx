/* ============================================================================
   Benefici — il catalogo dei benefici che le persone scambiano con i Loops

   docs/gamification/SPEC.md §6, §8. Sostituisce «Partner»: le offerte di
   prima sono state copiate qui come bozze (PLAN A15), da completare con
   pilastro e prezzo prima di pubblicarle.

   Le regole che il database applica comunque, e che qui si vedono prima:
     - un beneficio Good Loop ha almeno un tag (§6.4);
     - nessun conto alla rovescia, nessun prezzo barrato, nessuna scarsità:
       le scorte servono a non promettere ciò che non c’è, non a mettere fretta;
     - i codici si caricano e si contano, ma non si leggono: li vede solo la
       persona a cui sono stati consegnati.
   ============================================================================ */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { st } from '../sales/i18n'
import { useDataProvider, type AdminRedemption } from '../data/provider'
import { PILLARS, type Benefit, type BenefitTag, type Delivery, type Pillar } from '../gamification/benefits'

const PILLAR_IT: Record<Pillar, string> = {
  sono: 'Sonno', mente: 'Mente', corpo: 'Corpo', movimento: 'Movimento', alimentacao: 'Alimentazione', pausas_lazer: 'Pause e tempo libero',
}
const DELIVERY_IT: Record<Delivery, string> = {
  code_pool: 'Codici unici (CSV)', static_code: 'Codice unico per tutti', link: 'Link', collective: 'Collettivo', identified: 'Riscatto identificato',
}
const STATUS_IT: Record<Benefit['status'], string> = { draft: 'bozza', active: 'attivo', paused: 'in pausa', archived: 'archiviato' }

function blank(): Benefit {
  return {
    id: '', companyId: null, title: '', description: null, careRationale: null, partnerName: null, pillar: 'mente',
    priceLoopsCenti: 5000, stockTotal: null, stockRemaining: null, perUserLimit: 1, validFrom: null, validTo: null,
    codeValidityDays: 30, deliveryType: 'static_code', staticCode: null, linkUrl: null, terms: null, imageAsset: null,
    status: 'draft', challengeExclusiveId: null, sortOrder: 0, tagIds: [],
  }
}
const toDate = (ms: number | null) => (ms === null ? '' : new Date(ms).toISOString().slice(0, 10))
const fromDate = (s: string) => (s ? Date.parse(`${s}T00:00:00-03:00`) : null)

export function Benefits({ actor }: { actor: string }) {
  const dp = useDataProvider()
  const [list, setList] = useState<Benefit[]>([])
  const [tags, setTags] = useState<BenefitTag[]>([])
  const [counts, setCounts] = useState<Record<string, { total: number; free: number }>>({})
  const [redemptions, setRedemptions] = useState<AdminRedemption[]>([])
  const [draft, setDraft] = useState<Benefit | null>(null)
  const [codesFor, setCodesFor] = useState<Benefit | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [view, setView] = useState<'catalog' | 'redemptions'>('catalog')

  const load = useCallback(() => {
    void Promise.all([dp.adminListBenefits(), dp.listBenefitTags(), dp.adminBenefitCodeCounts(), dp.adminListRedemptions()])
      .then(([b, t, c, r]) => { setList(b); setTags(t); setCounts(c); setRedemptions(r) })
      .catch((e: Error) => setError(e.message))
  }, [dp])
  useEffect(() => { load() }, [load])

  const tagLabel = useMemo(() => new Map(tags.map((t) => [t.id, t.label])), [tags])
  const goodloop = list.filter((b) => b.companyId === null)

  async function save(b: Benefit) {
    setBusy(true); setError(null); setNote(null)
    try {
      if (b.companyId === null && b.status !== 'draft' && b.tagIds.length === 0) throw new Error(st('Serve almeno un tag per pubblicare un beneficio Good Loop.'))
      const id = await dp.adminSaveBenefit(b)
      await dp.logAudit({ actor, action: b.id ? 'benefit.updated' : 'benefit.created', target: b.title, detail: STATUS_IT[b.status] }).catch(() => undefined)
      setNote(b.id ? 'Beneficio salvato.' : 'Beneficio creato.')
      setDraft(null)
      load()
      return id
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function refund(r: AdminRedemption) {
    if (!window.confirm(st('Rimborsare «{title}» a {who}?', { title: r.title, who: r.userLabel })
      + String.fromCharCode(10, 10)
      + st('I Loops tornano nel saldo della persona e l’unità torna disponibile. Un codice già mostrato non viene riassegnato.'))) return
    setBusy(true); setError(null)
    try {
      await dp.adminRefundRedemption(r.id)
      await dp.logAudit({ actor, action: 'benefit.refunded', target: r.title, detail: r.userLabel }).catch(() => undefined)
      setNote('Rimborso registrato.')
      load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="adm-page">
      <header className="adm-page__head adm-page__head--row">
        <div>
          <h1 className="b2b-h1">{st('Benefici')}</h1>
          <p className="b2b-sub">
            {st('Cura che torna alla persona, scambiata con i Loops. {n} benefici Good Loop, {active} attivi.', { n: goodloop.length, active: goodloop.filter((b) => b.status === 'active').length })}
          </p>
        </div>
        {!draft && view === 'catalog' && <button className="b2b-btn b2b-btn--primary" onClick={() => setDraft(blank())}>{st('+ Nuovo beneficio')}</button>}
      </header>

      <div className="adm-spec__chips" role="group" aria-label={st('Vista')}>
        <button className={`adm-tag${view === 'catalog' ? ' is-on' : ''}`} onClick={() => setView('catalog')}>{st('Catalogo')}</button>
        <button className={`adm-tag${view === 'redemptions' ? ' is-on' : ''}`} onClick={() => setView('redemptions')}>{st('Riscatti ({n})', { n: redemptions.length })}</button>
      </div>

      {error && <p className="adm-note adm-note--err">{error}</p>}
      {note && <p className="adm-note adm-note--ok">{note}</p>}

      {draft && <Editor draft={draft} tags={tags} busy={busy} onChange={setDraft} onSave={(b) => void save(b)} onCancel={() => setDraft(null)} />}
      {codesFor && <CodeUpload benefit={codesFor} onDone={(n) => { setCodesFor(null); if (n !== null) { setNote(st('{n} codici nuovi caricati.', { n })); load() } }} actor={actor} />}

      {view === 'catalog' && (
        <div className="adm-table adm-table--benefits">
          <div className="adm-tr adm-tr--head">
            <div>{st('Beneficio')}</div><div>{st('Pilastro')}</div><div>{st('Loops')}</div><div>{st('Consegna')}</div><div>{st('Tag')}</div><div>{st('Stato')}</div><div className="adm-tr__right">{st('Azioni')}</div>
          </div>
          {list.map((b) => (
            <div className={`adm-tr${b.status === 'archived' ? ' is-inactive' : ''}`} key={b.id}>
              <div><strong>{b.title}</strong>{b.partnerName && <div className="adm-muted">{b.partnerName}</div>}{b.companyId && <div className="adm-muted">{st('Azienda: {id}', { id: b.companyId })}</div>}</div>
              <div>{st(PILLAR_IT[b.pillar])}</div>
              <div>{b.priceLoopsCenti === null ? st('solo sfida') : Math.floor(b.priceLoopsCenti / 100)}</div>
              <div>
                {st(DELIVERY_IT[b.deliveryType])}
                {b.deliveryType === 'code_pool' && <div className="adm-muted">{st('{free} liberi di {total}', { free: counts[b.id]?.free ?? 0, total: counts[b.id]?.total ?? 0 })}</div>}
              </div>
              <div>{b.tagIds.map((id) => tagLabel.get(id)).filter(Boolean).join(', ') || <span className="pe-err">{st('nessun tag')}</span>}</div>
              <div><span className={`adm-pill ${b.status === 'active' ? 'adm-pill--ok' : 'adm-pill--warn'}`}>{st(STATUS_IT[b.status])}</span></div>
              <div className="adm-tr__right adm-benefit__acts">
                <button className="b2b-btn b2b-btn--ghost" onClick={() => setDraft({ ...b, tagIds: [...b.tagIds] })}>{st('Modifica')}</button>
                {b.deliveryType === 'code_pool' && <button className="b2b-btn b2b-btn--ghost" onClick={() => setCodesFor(b)}>{st('Codici')}</button>}
                {b.status === 'active' && <button className="b2b-btn b2b-btn--ghost" disabled={busy} onClick={() => void save({ ...b, status: 'paused' })}>Pausa</button>}
                {(b.status === 'paused' || b.status === 'draft') && <button className="b2b-btn b2b-btn--primary" disabled={busy} onClick={() => void save({ ...b, status: 'active' })}>{st('Pubblica')}</button>}
                {b.status !== 'archived' && <button className="b2b-btn b2b-btn--ghost" disabled={busy} onClick={() => void save({ ...b, status: 'archived' })}>{st('Archivia')}</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'redemptions' && (
        <div className="adm-table adm-table--redemptions">
          <div className="adm-tr adm-tr--head"><div>{st('Data')}</div><div>{st('Persona')}</div><div>{st('Beneficio')}</div><div>{st('Loops')}</div><div>{st('Stato')}</div><div className="adm-tr__right">{st('Azione')}</div></div>
          {redemptions.map((r) => (
            <div className={`adm-tr${r.status === 'refunded' ? ' is-inactive' : ''}`} key={r.id}>
              <div>{new Date(r.createdAt).toLocaleDateString('it-IT')}</div>
              <div>{r.userLabel}</div>
              <div>{r.title}</div>
              <div>{Math.floor(r.loopsSpentCenti / 100)}</div>
              <div>{r.status === 'refunded' ? 'rimborsato' : 'consegnato'}</div>
              <div className="adm-tr__right">
                {r.status === 'active' && <button className="b2b-btn b2b-btn--ghost" disabled={busy} onClick={() => void refund(r)}>{st('Rimborsa')}</button>}
              </div>
            </div>
          ))}
          {!redemptions.length && <div className="adm-tr"><div className="adm-muted">{st('Nessun riscatto ancora.')}</div></div>}
        </div>
      )}
    </div>
  )
}

function Editor({ draft, tags, busy, onChange, onSave, onCancel }: {
  draft: Benefit; tags: BenefitTag[]; busy: boolean
  onChange: (b: Benefit) => void; onSave: (b: Benefit) => void; onCancel: () => void
}) {
  const patch = (p: Partial<Benefit>) => onChange({ ...draft, ...p })
  const onlyChallenge = draft.priceLoopsCenti === null
  const needsTag = draft.companyId === null && draft.tagIds.length === 0
  const canSave = draft.title.trim().length > 0 && !(needsTag && draft.status !== 'draft')
    && (draft.deliveryType !== 'static_code' || !!draft.staticCode || draft.status === 'draft')
    && (draft.deliveryType !== 'link' || /^https?:\/\//i.test(draft.linkUrl ?? '') || draft.status === 'draft')
  const toggleTag = (id: string) => patch({ tagIds: draft.tagIds.includes(id) ? draft.tagIds.filter((x) => x !== id) : [...draft.tagIds, id] })

  return (
    <div className="card adm-partner-form">
      <h2 className="b2b-card__title">{draft.id ? st('Modifica beneficio') : st('Nuovo beneficio')}</h2>
      <div className="adm-partner-form__grid">
        <label>
          <span className="b2b-label">{st('Titolo *')}</span>
          <input className="b2b-input" value={draft.title} placeholder={st('Es. Aula experimental de ioga')} autoFocus onChange={(e) => patch({ title: e.target.value })} />
        </label>
        <label>
          <span className="b2b-label">{st('Partner')}</span>
          <input className="b2b-input" value={draft.partnerName ?? ''} placeholder="[PARCEIRO]" onChange={(e) => patch({ partnerName: e.target.value || null })} />
        </label>
        <label className="adm-partner-form__wide">
          <span className="b2b-label">{st('Perché si prende cura della persona (in portoghese, come la legge la persona)')}</span>
          <input className="b2b-input" value={draft.careRationale ?? ''} placeholder={st('Es. Respirar e mover o corpo no mesmo ritmo acalma por dentro.')} onChange={(e) => patch({ careRationale: e.target.value || null })} />
        </label>
        <label className="adm-partner-form__wide">
          <span className="b2b-label">{st('Descrizione')}</span>
          <textarea className="b2b-textarea" rows={3} value={draft.description ?? ''} onChange={(e) => patch({ description: e.target.value || null })} />
        </label>
        <label>
          <span className="b2b-label">{st('Pilastro')}</span>
          <select className="b2b-input" value={draft.pillar} onChange={(e) => patch({ pillar: e.target.value as Pillar })}>
            {PILLARS.map((p) => <option key={p.id} value={p.id}>{PILLAR_IT[p.id]}</option>)}
          </select>
        </label>
        <label>
          <span className="b2b-label">{st('Prezzo in Loops')}</span>
          <input className="b2b-input" type="number" min={0} step={1} disabled={onlyChallenge}
            value={onlyChallenge ? '' : Math.floor((draft.priceLoopsCenti ?? 0) / 100)}
            onChange={(e) => patch({ priceLoopsCenti: Math.max(0, Math.round(Number(e.target.value) || 0)) * 100 })} />
        </label>
        <label className="adm-partner-form__check">
          <input type="checkbox" checked={onlyChallenge} onChange={(e) => patch({ priceLoopsCenti: e.target.checked ? null : 5000 })} />
          <span>{st('Solo come premio di una sfida (lo collega la sfida)')}</span>
        </label>
        <label>
          <span className="b2b-label">{st('Consegna')}</span>
          <select className="b2b-input" value={draft.deliveryType} onChange={(e) => patch({ deliveryType: e.target.value as Delivery })}>
            {(Object.keys(DELIVERY_IT) as Delivery[]).map((d) => <option key={d} value={d}>{DELIVERY_IT[d]}</option>)}
          </select>
        </label>
        {draft.deliveryType === 'static_code' && (
          <label>
            <span className="b2b-label">{st('Codice')}</span>
            <input className="b2b-input adm-mono" value={draft.staticCode ?? ''} spellCheck={false} onChange={(e) => patch({ staticCode: e.target.value.trim() || null })} />
          </label>
        )}
        {(draft.deliveryType === 'link' || draft.deliveryType === 'static_code') && (
          <label>
            <span className="b2b-label">Link per usarlo{draft.deliveryType === 'link' ? ' *' : ''}</span>
            <input className="b2b-input" type="url" value={draft.linkUrl ?? ''} placeholder={st('https://…')} onChange={(e) => patch({ linkUrl: e.target.value.trim() || null })} />
          </label>
        )}
        <label>
          <span className="b2b-label">Quantità totale (vuoto = senza limite)</span>
          <input className="b2b-input" type="number" min={0} step={1} value={draft.stockTotal ?? ''}
            onChange={(e) => {
              const v = e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value)))
              const used = draft.stockTotal !== null && draft.stockRemaining !== null ? draft.stockTotal - draft.stockRemaining : 0
              patch({ stockTotal: v, stockRemaining: v === null ? null : Math.max(0, v - used) })
            }} />
        </label>
        <label>
          <span className="b2b-label">{st('Riscatti per persona')}</span>
          <input className="b2b-input" type="number" min={1} step={1} value={draft.perUserLimit} onChange={(e) => patch({ perUserLimit: Math.max(1, Math.round(Number(e.target.value) || 1)) })} />
        </label>
        <label>
          <span className="b2b-label">{st('Valido dal')}</span>
          <input className="b2b-input" type="date" value={toDate(draft.validFrom)} onChange={(e) => patch({ validFrom: fromDate(e.target.value) })} />
        </label>
        <label>
          <span className="b2b-label">{st('Valido fino al')}</span>
          <input className="b2b-input" type="date" value={toDate(draft.validTo)} onChange={(e) => patch({ validTo: fromDate(e.target.value) })} />
        </label>
        <label>
          <span className="b2b-label">{st('Giorni di validità del codice')}</span>
          <input className="b2b-input" type="number" min={1} step={1} value={draft.codeValidityDays ?? ''} onChange={(e) => patch({ codeValidityDays: e.target.value === '' ? null : Math.max(1, Math.round(Number(e.target.value))) })} />
        </label>
        <label className="adm-partner-form__wide">
          <span className="b2b-label">{st('Condizioni e come usarlo')}</span>
          <textarea className="b2b-textarea" rows={2} value={draft.terms ?? ''} onChange={(e) => patch({ terms: e.target.value || null })} />
        </label>
        <fieldset className="adm-partner-form__wide adm-benefit__tags">
          <legend className="b2b-label">{st('Tag')} {draft.companyId === null && '*'} {st('— almeno uno per un beneficio Good Loop')}</legend>
          {(['partner_segment', 'benefit_type'] as const).map((g) => (
            <div key={g} className="adm-spec__chips">
              <span className="adm-muted">{g === 'partner_segment' ? st('Segmento del partner') : st('Tipo di beneficio')}</span>
              {tags.filter((t) => t.group === g && t.active).map((t) => (
                <label key={t.id} className={`adm-tag${draft.tagIds.includes(t.id) ? ' is-on' : ''}`}>
                  <input type="checkbox" checked={draft.tagIds.includes(t.id)} onChange={() => toggleTag(t.id)} /> {t.label}
                </label>
              ))}
            </div>
          ))}
          {needsTag && <span className="pe-err">{st('Senza tag si può salvare solo come bozza.')}</span>}
        </fieldset>
        <label>
          <span className="b2b-label">{st('Stato')}</span>
          <select className="b2b-input" value={draft.status} onChange={(e) => patch({ status: e.target.value as Benefit['status'] })}>
            {(Object.keys(STATUS_IT) as Benefit['status'][]).map((s) => <option key={s} value={s}>{STATUS_IT[s]}</option>)}
          </select>
        </label>
      </div>
      <p className="adm-muted">{st('Nessun conto alla rovescia, nessun prezzo barrato, nessun «ultime unità»: l’app non li mostra e il testo non deve suggerirli.')}</p>
      <div className="adm-made__acts">
        <button className="b2b-btn b2b-btn--primary" disabled={!canSave || busy} onClick={() => onSave(draft)}>{busy ? st('Salvataggio…') : st('Salva')}</button>
        <button className="b2b-btn b2b-btn--ghost" disabled={busy} onClick={onCancel}>{st('Annulla')}</button>
      </div>
    </div>
  )
}

/** Codes from a CSV: one per line, the first column. Counted, never shown back. */
function CodeUpload({ benefit, onDone, actor }: { benefit: Benefit; onDone: (n: number | null) => void; actor: string }) {
  const dp = useDataProvider()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const codes = text.split(/\r?\n/).map((l) => l.split(/[;,\t]/)[0].trim().replace(/^"|"$/g, '')).filter((c) => c && !/^codice$|^code$/i.test(c))

  async function upload() {
    setBusy(true); setError(null)
    try {
      const n = await dp.adminUploadCodes(benefit.id, codes)
      await dp.logAudit({ actor, action: 'benefit.codes_uploaded', target: benefit.title, detail: `${n} nuovi` }).catch(() => undefined)
      onDone(n)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card adm-partner-form">
      <h2 className="b2b-card__title">{st('Codici per «{title}»', { title: benefit.title })}</h2>
      <p className="adm-muted">{st('Un codice per riga (o un CSV: conta la prima colonna). I doppioni si saltano. Dopo il caricamento i codici non si rileggono: li vedrà solo chi li riceve.')}</p>
      <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.text().then(setText) }} />
      <textarea className="b2b-textarea adm-mono" rows={6} value={text} onChange={(e) => setText(e.target.value)} />
      {error && <p className="adm-note adm-note--err">{error}</p>}
      <div className="adm-made__acts">
        <button className="b2b-btn b2b-btn--primary" disabled={!codes.length || busy} onClick={() => void upload()}>{busy ? st('Caricamento…') : st('Carica {n} codici', { n: codes.length })}</button>
        <button className="b2b-btn b2b-btn--ghost" disabled={busy} onClick={() => onDone(null)}>{st('Annulla')}</button>
      </div>
    </div>
  )
}
