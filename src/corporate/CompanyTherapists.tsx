/* ============================================================================
   Company panel — the therapists your people can book

   The list an employee sees IS this list. A therapist joins it by redeeming
   an activation code; HR never types a name, because a name typed by an
   employer is not a verified clinician — only a Good Loop credential review
   makes someone bookable, and this decides which of those a company offers.

   What is NOT here, and cannot be: which employee booked whom, how many
   sessions anyone had, or anything a therapist wrote. HR sees who is on the
   list and nothing behind it. That is not a UI choice — the data this screen
   receives has no such field.
   ============================================================================ */

import { useCallback, useEffect, useState } from 'react'
import { useI18n, fmtDate } from '../i18n'
import { useDataProvider, type CompanyTherapist, type TherapistActivationCode } from '../data/provider'

export function CompanyTherapists({ companyId, actor }: { companyId?: string; actor?: string }) {
  const { t } = useI18n()
  const dp = useDataProvider()
  const [people, setPeople] = useState<CompanyTherapist[] | null>(null)
  const [codes, setCodes] = useState<TherapistActivationCode[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(() => {
    void dp.listCompanyTherapists(companyId).then(setPeople).catch(() => setPeople([]))
    void dp.listCompanyTherapistCodes(companyId).then(setCodes).catch(() => setCodes([]))
  }, [dp, companyId])
  useEffect(load, [load])

  async function issue() {
    setBusy(true); setError(null)
    try {
      await dp.createCompanyTherapistCode(companyId, actor)
      load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function revoke(code: string) {
    if (!window.confirm(t('Revoke {code}? A therapist who has not used it yet will not be able to.', { code }))) return
    setBusy(true); setError(null)
    try { await dp.revokeCompanyTherapistCode(code); load() } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  async function remove(p: CompanyTherapist) {
    if (!window.confirm(t('Remove {name} from the list? Employees will no longer be able to book them. Their account and their current patients are untouched.', { name: p.name }))) return
    setBusy(true); setError(null)
    try { await dp.removeCompanyTherapist(p.id, companyId); load() } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  function copy(code: string) {
    void navigator.clipboard?.writeText(code).then(() => { setCopied(code); window.setTimeout(() => setCopied(null), 2000) })
  }

  const open = codes.filter((c) => !c.usedAt && !c.revokedAt)
  const spent = codes.filter((c) => c.usedAt || c.revokedAt)

  return (
    <section className="c-panel">
      <h2 className="c-h2">{t('Therapists')}</h2>
      <p className="c-small">
        {t('These are the professionals your people can book. A therapist joins by entering an activation code you give them — you never add someone by name, because only a Good Loop credential review makes a clinician bookable.')}
      </p>

      {error && <p className="c-err">{error}</p>}

      <div className="c-row c-row--between">
        <h3 className="c-h3">{t('Activation codes')}</h3>
        <button className="c-btn c-btn--primary" disabled={busy} onClick={() => void issue()}>{t('Generate a code')}</button>
      </div>

      {!open.length && <p className="c-small">{t('No unused codes. Generate one and send it to the therapist you want on your list.')}</p>}

      {open.length > 0 && (
        <ul className="c-codes">
          {open.map((c) => (
            <li key={c.code}>
              <code className="c-code">{c.code}</code>
              <span className="c-small">{t('created {date}', { date: fmtDate(c.createdAt) })}</span>
              <button className="c-link" onClick={() => copy(c.code)}>{copied === c.code ? t('Copied') : t('Copy')}</button>
              <button className="c-link c-link--danger" onClick={() => void revoke(c.code)}>{t('Revoke')}</button>
            </li>
          ))}
        </ul>
      )}

      {spent.length > 0 && (
        <details className="c-details">
          <summary className="c-small">{t('{n} used or revoked', { n: spent.length })}</summary>
          <ul className="c-codes c-codes--quiet">
            {spent.map((c) => (
              <li key={c.code}>
                <code className="c-code">{c.code}</code>
                <span className="c-small">
                  {c.revokedAt
                    ? t('revoked {date}', { date: fmtDate(c.revokedAt) })
                    : t('used by {name}', { name: c.usedByName ?? t('a therapist') })}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <h3 className="c-h3">{t('On your list')}</h3>
      {people === null && <p className="c-small">{t('Loading…')}</p>}
      {people !== null && !people.length && (
        <p className="c-small">{t('Nobody yet. A therapist appears here the moment they redeem one of your codes.')}</p>
      )}
      {people !== null && people.length > 0 && (
        <table className="c-table">
          <thead>
            <tr>
              <th>{t('Therapist')}</th>
              <th>{t('Licence')}</th>
              <th>{t('On the list since')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="c-mono">{p.crp}</td>
                <td>{fmtDate(p.addedAt)}</td>
                <td className="c-right">
                  <button className="c-link c-link--danger" disabled={busy} onClick={() => void remove(p)}>{t('Remove')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="c-note">
        {t('You cannot see which employee books which therapist, how many sessions anyone has had, or anything discussed in them. That information never reaches this dashboard.')}
      </p>
    </section>
  )
}
