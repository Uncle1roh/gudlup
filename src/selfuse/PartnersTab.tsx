/* ============================================================================
   Self Use — Partner

   Offers from partner brands, as written in the admin console (Partner):
   the product, the discount, the code to quote and the link to redeem it.
   Shown to ADMIN accounts only for now — the shell decides; this screen
   renders whatever active offers it is handed.
   ============================================================================ */

import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { useDataProvider } from '../data/provider'
import { isHttpUrl, sortPartnerProducts, type PartnerProduct } from '../data/partners'

export function PartnersTab() {
  const { t } = useI18n()
  const dp = useDataProvider()
  const [items, setItems] = useState<PartnerProduct[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    dp.listPartnerProducts()
      // an admin can read the hidden ones too; this screen is what a person sees
      .then((list) => { if (alive) setItems(sortPartnerProducts(list.filter((p) => p.active))) })
      .catch(() => { if (alive) { setFailed(true); setItems([]) } })
    return () => { alive = false }
  }, [dp])

  function copy(code: string) {
    navigator.clipboard?.writeText(code).then(
      () => { setCopied(code); window.setTimeout(() => setCopied(null), 1600) },
      () => { /* clipboard blocked — the code is on screen to read */ },
    )
  }

  return (
    <div className="su-page partners">
      <h1 className="display su-h1">{t('Partners')}</h1>
      <p className="partners__lede">{t('Offers and discounts from Good Loop partners.')}</p>

      {items === null && <p className="partners__note">{t('Loading…')}</p>}
      {failed && <p className="partners__note">{t('The offers could not be loaded just now. Try again in a moment.')}</p>}
      {items && !failed && items.length === 0 && (
        <p className="partners__note">{t('No partner offers yet.')}</p>
      )}

      {items && items.length > 0 && (
        <div className="partners__grid">
          {items.map((p) => (
            <article key={p.id} className="card partner-card">
              {p.imageUrl && isHttpUrl(p.imageUrl) && (
                <img className="partner-card__img" src={p.imageUrl} alt="" loading="lazy" />
              )}
              <div className="partner-card__head">
                <span className="partner-card__brand">{p.partner}</span>
                {p.discount && <span className="partner-card__deal">{p.discount}</span>}
              </div>
              <h2 className="partner-card__title">{p.title}</h2>
              {p.description && <p className="partner-card__desc">{p.description}</p>}
              {(p.promoCode || p.url) && (
                <div className="partner-card__acts">
                  {p.promoCode && (
                    <button className="partner-card__code" onClick={() => copy(p.promoCode!)} title={t('Copy the code')}>
                      <span className="partner-card__code-lbl">{copied === p.promoCode ? t('Copied') : t('Code')}</span>
                      <b>{p.promoCode}</b>
                    </button>
                  )}
                  {p.url && isHttpUrl(p.url) && (
                    <a className="btn btn--primary partner-card__go" href={p.url} target="_blank" rel="noopener noreferrer">
                      {t('Go to the offer')} ↗
                    </a>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
