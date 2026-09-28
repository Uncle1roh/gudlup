/* ============================================================================
   Good Loop — the library's one legal element (M1-01, M1-05, M1-13, D-17)

   On the first visit: the category note (Tier C, ≤ 30 words) — CAT-2 for a
   sponsored person, who is also told their employer cannot see what they
   use; CAT-1 otherwise. This library is made for the working day, so the
   workplace note is the one that fits it. Once dismissed, the persistent
   one-liner (LIB-1, Tier B, ≤ 12 words) takes its place, with D-04 one tap
   away. Never both at once: at most one legal element on any screen (MN-25).

   The trigger is the first visit to this place on this device — the same for
   everyone. Nothing about the person decides it (rule 1: static means static).
   ============================================================================ */

import { useState } from 'react'
import { useI18n } from '../i18n'
import { useLegal } from './LegalContext'
import { LegalSheet } from './LegalPage'

const KEY = 'gl.legal.firstvisit.library.v1'
function seen(): boolean {
  try { return localStorage.getItem(KEY) === '1' } catch { return true }
}
function markSeen(): void {
  try { localStorage.setItem(KEY, '1') } catch { /* storage unavailable */ }
}

export function LibraryNotice({ sponsored }: { sponsored: boolean }) {
  const { t } = useI18n()
  const { m } = useLegal()
  const [first, setFirst] = useState(() => !seen())
  const [sheet, setSheet] = useState(false)

  if (first) {
    return (
      <div className="legal-note" role="note">
        <p className="legal-note__text">{m(sponsored ? 'CAT-2' : 'CAT-1')}</p>
        <button type="button" className="legal-note__ok" onClick={() => { markSeen(); setFirst(false) }}>{t('OK')}</button>
      </div>
    )
  }
  return (
    <p className="legal-line">
      <span>{m('LIB-1')}</span>
      <button type="button" className="legal-line__link" onClick={() => setSheet(true)}>{t('Learn more')}</button>
      {sheet && <LegalSheet id="D-04" onClose={() => setSheet(false)} />}
    </p>
  )
}
