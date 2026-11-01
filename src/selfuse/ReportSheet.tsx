/* ============================================================================
   Self Use — reading your own report before you keep it

   "View your November report" used to BE the download: one tap and a PDF
   landed in the Downloads folder, unseen. A person who only wanted to look
   at what the month had been now had a file to find and delete, and the
   button had said "view".

   So the tap opens the document instead. The same PDF, built the same way
   and never sent anywhere — it is rendered from a blob in this tab — shown
   in a frame with a Download beside it. Keeping it is now a decision, and
   it is the person's.

   The browser is what draws the page: `<iframe>` with a blob URL is the one
   PDF viewer every platform already has. Where there is none (some
   in-app webviews on a phone), the frame shows nothing useful, so the
   Download stands on its own and the note under it says what to expect.
   ============================================================================ */

import { useEffect, useRef } from 'react'
import { useI18n } from '../i18n'
import type { PdfDoc } from '../lib/pdf'

export function ReportSheet({
  title,
  filename,
  build,
  onClose,
}: {
  title: string
  filename: string
  /** Called once, when the sheet opens. The document is built here rather
      than by the caller so a report that is never opened is never built. */
  build: () => PdfDoc
  onClose: () => void
}) {
  const { t } = useI18n()

  /* Built once for the life of the sheet, in a ref rather than a memo: the
     caller passes a closure over its own state, so a dependency on it would
     rebuild the document on every render and swap the frame's source under
     the reader for an identical one. An empty string is how a failed build
     travels — nothing sets state during a render. */
  const held = useRef<string | null>(null)
  if (held.current === null) {
    try { held.current = URL.createObjectURL(build().blob()) } catch { held.current = '' }
  }
  const url = held.current
  const failed = !url

  useEffect(() => () => { if (held.current) URL.revokeObjectURL(held.current) }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="sheet-scrim rep-scrim" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="sheet rep-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__grip" aria-hidden="true" />
        <h2 className="rep-sheet__h">{title}</h2>
        {failed ? (
          <p className="call2-note">{t('The report could not be prepared just now. Try again in a moment.')}</p>
        ) : (
          <iframe className="rep-sheet__view" src={url} title={title} />
        )}
        <p className="small muted">{t('Nothing has been saved to your device. Download it if you want to keep it.')}</p>
        <div className="rep-sheet__acts">
          {!failed && <a className="btn btn--primary" href={url} download={filename}>{t('Download')}</a>}
          <button type="button" className="btn btn--ghost" onClick={onClose}>{t('Close')}</button>
        </div>
      </div>
    </div>
  )
}
