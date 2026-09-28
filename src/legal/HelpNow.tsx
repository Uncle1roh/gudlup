/* ============================================================================
   Good Loop — Help now (CRS-01, CRS-02, D-03)

   The one persistent legal element of the product: a button in reach on
   every screen, opening an action-first sheet — tap-to-call numbers first,
   one line, then the full notice one tap away. It replaces the text banner
   of version 1: a person in crisis needs a number, not prose, and a notice
   repeated everywhere stops being read.

   It is never hidden and never more than one tap away (CRS-01). It is not
   triggered by anything about the person (MN-03): it is simply there.
   ============================================================================ */

import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { useLegal } from './LegalContext'
import { crisisNoticeId } from './types'
import { legalDoc, blocksFor } from './corpus'

/** Where the Help now button sits: over the tab bar in the person's app,
    inline in a top bar elsewhere. */
export function HelpNowButton({ variant = 'floating', className = '' }: { variant?: 'floating' | 'inline'; className?: string }) {
  const { m } = useLegal()
  const [open, setOpen] = useState(false)

  /* Escape closes the sheet; the button keeps focus so a keyboard user is
     back where they were. */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        type="button"
        className={`helpnow helpnow--${variant} ${className}`}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={m('NAV-1')}
      >
        <span className="helpnow__ring" aria-hidden="true" />
        <span className="helpnow__label">{m('NAV-1')}</span>
      </button>
      {open && <CrisisSheet onClose={() => setOpen(false)} />}
    </>
  )
}

/** The sheet: numbers first, one line, link to the full text. Nothing else
    (CRS-02). Each number is a tel: link with a spoken label (ACC-03). */
export function CrisisSheet({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const { m, crisis, market } = useLegal()
  const [full, setFull] = useState(false)
  const noticeId = crisisNoticeId(market)

  return (
    <div className="sheet-scrim helpnow-scrim" role="dialog" aria-modal="true" aria-label={m('NAV-1')} onClick={onClose}>
      <div className="sheet helpnow-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__grip" aria-hidden="true" />
        <ul className="helpnow-sheet__numbers">
          {crisis.map((r) => (
            <li key={r.id}>
              <a className="helpnow-sheet__call" href={`tel:${r.number}`} aria-label={`${r.label} ${r.number}`}>
                <span className="helpnow-sheet__num">{r.number}</span>
                <span className="helpnow-sheet__who">
                  {r.label}
                  {r.hours ? <span className="helpnow-sheet__hours"> · {r.hours}</span> : null}
                </span>
              </a>
            </li>
          ))}
        </ul>
        {/* the tail of NAV-2 / NAV-3: the numbers above are the head */}
        <p className="helpnow-sheet__line">
          {t('Or go to the nearest emergency department. Good Loop can’t respond to emergencies.')}
        </p>
        {!full ? (
          <button type="button" className="btn btn--quiet helpnow-sheet__more" onClick={() => setFull(true)}>
            {t('Read the full notice')}
          </button>
        ) : (
          <CrisisNoticeText id={noticeId} />
        )}
        <button type="button" className="btn btn--ghost" onClick={onClose}>{t('Close')}</button>
      </div>
    </div>
  )
}

function CrisisNoticeText({ id }: { id: string }) {
  const { locale } = useI18n()
  const { market } = useLegal()
  const doc = legalDoc(id, locale)
  if (!doc) return null
  return (
    <div className="legal-text legal-text--sheet">
      <h3 className="legal-text__title">{doc.title}</h3>
      {blocksFor(doc, market).map((b, i) => (
        b.kind === 'h' ? <h4 key={i}>{b.text}</h4> : <p key={i}>{b.text}</p>
      ))}
    </div>
  )
}
