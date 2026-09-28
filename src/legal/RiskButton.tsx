/* ============================================================================
   Good Loop — the risk button in the professional's session room
   (CRS-08, PRO-1, Professional Terms P3.4)

   One tap opens: the escalation steps, the emergency numbers for the market,
   and an action record that is written into the session notes with a
   timestamp. The steps below are the skeleton of the written escalation
   procedure the deliverable asks Good Loop to adopt (D-03 operational
   counterpart); the clinical lead owns its final wording. The professional's
   own judgement and duties prevail over anything here (P3.4).
   ============================================================================ */

import { useState } from 'react'
import { useI18n } from '../i18n'
import { useLegal } from './LegalContext'

export function RiskButton({ onRecord }: { onRecord: (text: string) => void }) {
  const { t } = useI18n()
  const { m, crisis } = useLegal()
  const [open, setOpen] = useState(false)
  const [action, setAction] = useState('')

  return (
    <>
      <button type="button" className="w-btn w-btn--sm w-riskbtn" onClick={() => setOpen(true)}>
        ⚠ {m('PRO-1')}
      </button>
      {open && (
        <div className="w-scrim" role="dialog" aria-modal="true" aria-label={m('PRO-1')} onClick={() => setOpen(false)}>
          <div className="w-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="w-h2">{m('PRO-1')}</h2>
            <ol className="w-risksteps">
              <li>{t('Stay on the call. Do not leave the person alone on the line.')}</li>
              <li>{t('Confirm where they are right now — the address they gave in the lobby, or ask again.')}</li>
              <li>{t('If there is a serious and imminent risk, call the emergency services for their location and stay connected until help arrives.')}</li>
              <li>{t('Involve a trusted person nearby where the person agrees, or where their safety requires it.')}</li>
              <li>{t('Record what you observed and what you did, below. It goes into your session notes with the time.')}</li>
            </ol>
            <div className="w-field__label">{t('Emergency numbers')}</div>
            <ul className="w-reflist">
              {crisis.map((r) => (
                <li key={r.id}>
                  <span>{t(r.label)}{r.hours ? ` · ${r.hours}` : ''}</span>
                  <strong><a href={`tel:${r.number}`}>{r.number}</a></strong>
                </li>
              ))}
            </ul>
            <label className="w-field w-field--wide">
              <span className="w-field__label">{t('Action record')}</span>
              <textarea className="w-input" rows={3} value={action} onChange={(e) => setAction(e.target.value)} placeholder={t('What you observed, what you did, who was contacted…')} />
            </label>
            <div className="w-actions">
              <button className="w-btn w-btn--ghost" onClick={() => setOpen(false)}>{t('Close')}</button>
              <button className="w-btn w-btn--primary" disabled={!action.trim()} onClick={() => { onRecord(`[${m('PRO-1')}] ${action.trim()}`); setAction(''); setOpen(false) }}>
                {t('Save to notes')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
