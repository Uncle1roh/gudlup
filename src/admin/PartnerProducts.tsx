/* ============================================================================
   Good Loop — partner products (admin console)

   The offers shown on the Partner tab of the person's app: a partner brand, a
   product, the discount on it and how to redeem it. An inactive offer stays
   here and disappears from the app. See PARTNER PRODUCTS in setup.sql.
   ============================================================================ */

import { useState } from 'react'
import { useDataProvider } from '../data/provider'
import { usePartnerProducts } from './hooks'
import { emptyPartnerProduct, isHttpUrl, sortPartnerProducts, type PartnerProduct } from '../data/partners'

export function PartnerProducts({ actor }: { actor: string }) {
  const dp = useDataProvider()
  const { data, loading, error: loadError, refetch } = usePartnerProducts()
  /* The offer being edited: a copy, so Annulla leaves the list untouched.
     An empty id is a new one. */
  const [draft, setDraft] = useState<PartnerProduct | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [armed, setArmed] = useState<string | null>(null)

  const products = sortPartnerProducts(data ?? [])

  const urlBad = !!draft && !isHttpUrl(draft.url)
  const imageBad = !!draft && !isHttpUrl(draft.imageUrl)
  const canSave = !!draft && !busy && !!draft.partner.trim() && !!draft.title.trim() && !urlBad && !imageBad

  function startNew() {
    const last = products[products.length - 1]
    setDraft({ ...emptyPartnerProduct(), position: last ? last.position + 1 : 0 })
    setError(null)
  }

  function patch(p: Partial<PartnerProduct>) {
    setDraft((d) => (d ? { ...d, ...p } : d))
  }

  async function save() {
    if (!draft || !canSave) return
    setBusy(true); setError(null)
    try {
      const isNew = !draft.id
      await dp.savePartnerProduct(draft)
      await dp.logAudit({
        actor,
        action: isNew ? 'partner_product.created' : 'partner_product.updated',
        target: `${draft.partner.trim()} · ${draft.title.trim()}`,
        detail: draft.discount?.trim() || undefined,
      }).catch(() => undefined)
      setDraft(null)
      refetch()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(p: PartnerProduct) {
    setBusy(true); setError(null)
    try {
      await dp.savePartnerProduct({ ...p, active: !p.active })
      await dp.logAudit({ actor, action: p.active ? 'partner_product.hidden' : 'partner_product.shown', target: `${p.partner} · ${p.title}` }).catch(() => undefined)
      refetch()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(p: PartnerProduct) {
    setBusy(true); setError(null)
    try {
      await dp.deletePartnerProduct(p.id)
      await dp.logAudit({ actor, action: 'partner_product.deleted', target: `${p.partner} · ${p.title}` }).catch(() => undefined)
      setArmed(null)
      if (draft?.id === p.id) setDraft(null)
      refetch()
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
          <h1 className="b2b-h1">Partner</h1>
          <p className="b2b-sub">
            Prodotti e sconti dei partner, mostrati nella scheda «Partner» dell’app. {products.length} in totale,{' '}
            {products.filter((p) => p.active).length} visibili.
          </p>
        </div>
        {!draft && <button className="b2b-btn b2b-btn--primary" onClick={startNew}>+ Nuova offerta</button>}
      </header>

      {draft && (
        <div className="card adm-partner-form">
          <h2 className="b2b-card__title">{draft.id ? 'Modifica offerta' : 'Nuova offerta'}</h2>
          <div className="adm-partner-form__grid">
            <label>
              <span className="b2b-label">Partner *</span>
              <input className="b2b-input" value={draft.partner} placeholder="Es. Studio Respiro" autoFocus
                onChange={(e) => patch({ partner: e.target.value })} />
            </label>
            <label>
              <span className="b2b-label">Prodotto / servizio *</span>
              <input className="b2b-input" value={draft.title} placeholder="Es. Abbonamento yoga mensile"
                onChange={(e) => patch({ title: e.target.value })} />
            </label>
            <label>
              <span className="b2b-label">Sconto o vantaggio</span>
              <input className="b2b-input" value={draft.discount ?? ''} placeholder="Es. -20% · 1 mese gratis"
                onChange={(e) => patch({ discount: e.target.value })} />
            </label>
            <label>
              <span className="b2b-label">Codice da usare presso il partner</span>
              <input className="b2b-input adm-mono" value={draft.promoCode ?? ''} placeholder="Es. GOODLOOP20" spellCheck={false}
                onChange={(e) => patch({ promoCode: e.target.value.toUpperCase() })} />
            </label>
            <label className="adm-partner-form__wide">
              <span className="b2b-label">Descrizione</span>
              <textarea className="b2b-textarea" rows={3} value={draft.description ?? ''}
                placeholder="Cosa include l’offerta, condizioni, scadenza…"
                onChange={(e) => patch({ description: e.target.value })} />
            </label>
            <label>
              <span className="b2b-label">Link per usufruirne</span>
              <input className="b2b-input" type="url" value={draft.url ?? ''} placeholder="https://…"
                onChange={(e) => patch({ url: e.target.value })} />
              {urlBad && <span className="pe-err">Serve un indirizzo che inizia con https:// (o http://).</span>}
            </label>
            <label>
              <span className="b2b-label">Immagine (URL)</span>
              <input className="b2b-input" type="url" value={draft.imageUrl ?? ''} placeholder="https://… (facoltativa)"
                onChange={(e) => patch({ imageUrl: e.target.value })} />
              {imageBad && <span className="pe-err">Serve un indirizzo che inizia con https:// (o http://).</span>}
            </label>
            <label>
              <span className="b2b-label">Ordine</span>
              <input className="b2b-input adm-addrow__pct" type="number" step={1} value={draft.position}
                onChange={(e) => patch({ position: Math.round(Number(e.target.value) || 0) })} />
            </label>
            <label className="adm-partner-form__check">
              <input type="checkbox" checked={draft.active} onChange={(e) => patch({ active: e.target.checked })} />
              <span>Visibile nell’app</span>
            </label>
          </div>
          <div className="adm-made__acts">
            <button className="b2b-btn b2b-btn--primary" disabled={!canSave} onClick={() => void save()}>
              {busy ? 'Salvataggio…' : draft.id ? 'Salva modifiche' : 'Crea offerta'}
            </button>
            <button className="b2b-btn b2b-btn--ghost" disabled={busy} onClick={() => setDraft(null)}>Annulla</button>
          </div>
        </div>
      )}

      {error && <p className="pe-err">{error}</p>}
      {loadError && <p className="pe-err">Impossibile caricare le offerte: {loadError.message} — esegui supabase/10-partner-products.sql.</p>}
      {loading && <p className="b2b-sub">Caricamento…</p>}

      {!loading && !loadError && (
        products.length === 0 ? (
          <p className="b2b-sub">Ancora nessuna offerta. «＋ Nuova offerta» per crearne una.</p>
        ) : (
          <div className="adm-table adm-table--partners">
            <div className="adm-tr adm-tr--head">
              <div>Partner</div><div>Prodotto</div><div>Vantaggio</div><div>Codice</div><div>Stato</div><div className="adm-tr__right">Azione</div>
            </div>
            {products.map((p) => (
              <div className={`adm-tr${p.active ? '' : ' is-inactive'}`} key={p.id}>
                <div><b>{p.partner}</b></div>
                <div>
                  {p.title}
                  {p.url && <div className="adm-muted adm-partner__link">{p.url}</div>}
                </div>
                <div>{p.discount || <span className="adm-muted">—</span>}</div>
                <div>{p.promoCode ? <span className="adm-mono">{p.promoCode}</span> : <span className="adm-muted">—</span>}</div>
                <div>
                  <button
                    className={`adm-pill adm-pill--btn ${p.active ? 'adm-pill--ok' : 'adm-pill--warn'}`}
                    disabled={busy}
                    onClick={() => void toggleActive(p)}
                    title={p.active ? 'Visibile nell’app — clic per nasconderla' : 'Nascosta — clic per mostrarla nell’app'}
                  >
                    {p.active ? 'Visibile' : 'Nascosta'}
                  </button>
                </div>
                <div className="adm-tr__right">
                  {armed === p.id ? (
                    <>
                      <button className="b2b-btn b2b-btn--danger" disabled={busy} onClick={() => void remove(p)}>Sì, elimina</button>
                      <button className="b2b-btn b2b-btn--ghost" disabled={busy} onClick={() => setArmed(null)}>Annulla</button>
                    </>
                  ) : (
                    <>
                      <button className="b2b-btn b2b-btn--ghost" disabled={busy} onClick={() => { setDraft({ ...p }); setError(null) }}>Modifica</button>
                      <button className="b2b-btn b2b-btn--ghost" disabled={busy} onClick={() => setArmed(p.id)}>Elimina</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
