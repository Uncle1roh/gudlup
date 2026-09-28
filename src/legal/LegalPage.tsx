/* ============================================================================
   Good Loop — the legal information page (LEG-06, LEG-07, LEG-12, LEG-13)

   Reachable without login at #legal. Everything in full: the Terms (with the
   annex of the reader's market), the End-User Supplement, the Privacy
   Notice, the notices D-01 to D-17, the Professional Terms, the Intended
   Purpose Statement (D-02, verbatim — the document every other claim must
   obey), who the controller is and how to reach the DPO, and the version
   register with the dates each text was in force. Every in-product legal
   element links here (Tier E: pull only).

   A document is rendered as headings and short paragraphs at a reading
   measure — a wall of legal text protects nobody (D-01 drafting note).
   ============================================================================ */

import { useEffect, useMemo, useState } from 'react'
import { useI18n, LOCALES, type Locale } from '../i18n'
import { useDataProvider } from '../data/provider'
import { useLegal } from './LegalContext'
import { legalDoc, blocksFor, LEGAL_INDEX, privacySkeleton } from './corpus'
import { AUTHORITIES } from './market'
import type { Market } from './messages'
import { LEGAL_VERSION, type LegalDocId, type LegalDocText } from './types'
import type { LegalVersion } from './records'
import { HelpNowButton } from './HelpNow'
import { BrandLogo } from '../components/Brand'

/** The document a person opened from an in-app link: #legal/D-04 */
export function legalRouteDoc(hash: string): LegalDocId | null {
  const m = /^#legal\/([A-Za-z0-9-]+)/.exec(hash)
  return m ? (m[1] as LegalDocId) : null
}

export function LegalPage() {
  const { t, locale, setLocale } = useI18n()
  const legal = useLegal()
  const dp = useDataProvider()
  const [market, setMarket] = useState<Market>(legal.market)
  const [open, setOpen] = useState<LegalDocId | null>(() => legalRouteDoc(window.location.hash))
  const [versions, setVersions] = useState<LegalVersion[]>([])

  useEffect(() => { setMarket(legal.market) }, [legal.market])
  useEffect(() => {
    const onHash = () => setOpen(legalRouteDoc(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => {
    dp.listLegalVersions().then(setVersions).catch(() => setVersions([]))
  }, [dp])

  const docs = useMemo(() => {
    const out: { id: LegalDocId; group: string; doc: LegalDocText }[] = []
    for (const entry of LEGAL_INDEX) {
      // the crisis notice of the OTHER market is not this reader's
      if (entry.id === 'D-03-BR' && market !== 'BR') continue
      if (entry.id === 'D-03-EU' && market !== 'EU') continue
      const doc = entry.id === 'privacy' ? privacySkeleton(locale) : legalDoc(entry.id, locale)
      if (doc) out.push({ id: entry.id, group: entry.group, doc })
    }
    return out
  }, [locale, market])

  const current = open ? docs.find((d) => d.id === open) : null
  const authority = AUTHORITIES[market]

  function goTo(id: LegalDocId | null) {
    window.location.hash = id ? `#legal/${id}` : '#legal'
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="legal-page su-studio">
      <header className="legal-page__top">
        <a className="legal-page__brand" href="#app" aria-label="Good Loop"><BrandLogo /></a>
        <div className="legal-page__controls">
          <label className="legal-page__select">
            <span className="visually-hidden">{t('Language')}</span>
            <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
              {LOCALES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </label>
          <label className="legal-page__select">
            <span className="visually-hidden">{t('Where you live')}</span>
            <select value={market} onChange={(e) => setMarket(e.target.value as Market)}>
              <option value="EU">{t('Italy / European Union')}</option>
              <option value="BR">{t('Brazil')}</option>
            </select>
          </label>
          <HelpNowButton variant="inline" />
        </div>
      </header>

      <main className="legal-page__main">
        {current ? (
          <article className="legal-doc">
            <button type="button" className="su-back" onClick={() => goTo(null)}>‹ {t('All legal information')}</button>
            <LegalDocView doc={current.doc} market={market} version={LEGAL_VERSION} />
          </article>
        ) : (
          <>
            <h1 className="display su-h1">{t('Legal information')}</h1>
            <p className="lead legal-page__lead">{legal.m('LEG-P1')}</p>
            <p className="small muted legal-page__draft">
              {t('Version {v}. These texts are a working draft pending review by counsel in Brazil and Italy; the Portuguese and Italian versions will be the governing ones in their markets once reviewed.', { v: LEGAL_VERSION })}
            </p>

            <section className="legal-page__group">
              <h2 className="home__sect">{t('Terms and privacy')}</h2>
              <ul className="menu">
                {docs.filter((d) => d.group === 'terms').map((d) => (
                  <li key={d.id}><button type="button" className="menu__row" onClick={() => goTo(d.id)}><span>{d.doc.title}</span><span aria-hidden="true">›</span></button></li>
                ))}
              </ul>
            </section>

            <section className="legal-page__group">
              <h2 className="home__sect">{t('Notices')}</h2>
              <p className="small muted">{t('The notices form part of the Terms. The Intended Purpose Statement is the second one.')}</p>
              <ul className="menu">
                {docs.filter((d) => d.group === 'notices').map((d) => (
                  <li key={d.id}><button type="button" className="menu__row" onClick={() => goTo(d.id)}><span><span className="legal-page__ref">{d.id.replace(/-(BR|EU)$/, '')}</span>{d.doc.title}</span><span aria-hidden="true">›</span></button></li>
                ))}
              </ul>
            </section>

            <section className="legal-page__group">
              <h2 className="home__sect">{t('For professionals')}</h2>
              <ul className="menu">
                {docs.filter((d) => d.group === 'professional').map((d) => (
                  <li key={d.id}><button type="button" className="menu__row" onClick={() => goTo(d.id)}><span>{d.doc.title}</span><span aria-hidden="true">›</span></button></li>
                ))}
              </ul>
            </section>

            <section className="legal-page__group card legal-page__contacts">
              <h2 className="card__title">{t('Who to contact')}</h2>
              <p>{t('Controller: [full corporate name], [registered address]. Data protection officer: [email]. Brazil — encarregado pela proteção de dados: [name], [email]. Support and complaints: [email].')}</p>
              <p>
                {t('Supervisory authority')}: <a href={authority.dpa.url} target="_blank" rel="noreferrer">{authority.dpa.name}</a>
                {' · '}
                {t('Professional council')}: <a href={authority.council.url} target="_blank" rel="noreferrer">{authority.council.name}</a>
              </p>
              <p>
                {t('Consumer routes')}: {authority.consumer.map((c, i) => (
                  <span key={c.url}>{i > 0 ? ' · ' : ''}<a href={c.url} target="_blank" rel="noreferrer">{c.name}</a></span>
                ))}
              </p>
            </section>

            <section className="legal-page__group">
              <h2 className="home__sect">{t('Previous versions')}</h2>
              {versions.length === 0 ? (
                <p className="small muted">{t('No earlier version. Each version is listed here with the dates it was in force.')}</p>
              ) : (
                <ul className="legal-page__versions">
                  {versions.map((v) => (
                    <li key={v.id}>
                      <strong>{v.docId}</strong> · {v.version} · {v.locale} · {v.inForceFrom}{v.inForceTo ? ` → ${v.inForceTo}` : ` → ${t('in force')}`}
                      {v.changelog ? <span className="small muted"> — {v.changelog}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}

/** One document, rendered for reading. Also used one tap away from a notice
    inside the app, so it must not assume the legal page around it. */
export function LegalDocView({ doc, market, version }: { doc: LegalDocText; market: Market; version?: string }) {
  const { t } = useI18n()
  return (
    <div className="legal-text">
      <h1 className="legal-text__title display">{doc.title}</h1>
      {version ? <p className="small muted legal-text__version">{t('Version {v}', { v: version })}</p> : null}
      {blocksFor(doc, market).map((b, i) => {
        if (b.kind === 'h') return <h2 key={i} className="legal-text__h">{b.text}</h2>
        if (b.kind === 'li') return <p key={i} className="legal-text__li">{b.text}</p>
        return <p key={i}>{b.text}</p>
      })}
    </div>
  )
}

/** A notice opened inside the app: a sheet with the text and a way back. */
export function LegalSheet({ id, onClose }: { id: LegalDocId; onClose: () => void }) {
  const { t, locale } = useI18n()
  const { market } = useLegal()
  const doc = id === 'privacy' ? privacySkeleton(locale) : legalDoc(id, locale)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  if (!doc) return null
  return (
    <div className="sheet-scrim legal-scrim" role="dialog" aria-modal="true" aria-label={doc.title} onClick={onClose}>
      <div className="sheet legal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__grip" aria-hidden="true" />
        <div className="legal-sheet__scroll">
          <LegalDocView doc={doc} market={market} version={LEGAL_VERSION} />
          <p className="small muted"><a href={`#legal/${id}`} target="_blank" rel="noreferrer">{t('Open on the legal information page')} ↗</a></p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={onClose}>{t('Close')}</button>
      </div>
    </div>
  )
}
