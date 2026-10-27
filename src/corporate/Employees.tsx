/* ============================================================================
   Company panel — the addresses your code works for

   The company code answers WHICH company. It cannot answer WHO: it is one
   string, shared with everybody, and once it has been forwarded twice it
   belongs to whoever has it. Nor can it be taken back from one person — the
   employee who left on Friday knows exactly the same code as the one who
   starts on Monday, and rotating it makes the whole company re-register.

   So the list below is the second gate. The code says which company; this
   says who inside it. Both are checked in the DATABASE, at the moment an
   account is given a company — not here, because a check that lives in a
   browser is a suggestion.

   What is NOT here, and will not be: whether an address has an account, when
   it last opened the app, or anything it did there. HR writes this list and
   reads back exactly what it wrote. The only figure the panel adds is a
   COUNT of accounts holding the code without being on the list — the size of
   a leak, with nobody's name attached.
   ============================================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n, fmtDate } from '../i18n'
import { useDataProvider, type CompanyMember, type CompanyMemberDraft } from '../data/provider'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** What a pasted or uploaded list turned into, before anything is written. */
export interface ParsedList {
  rows: CompanyMemberDraft[]
  /** Lines that carried no usable address, kept verbatim so HR can see them. */
  rejected: string[]
}

/**
 * Read a pasted block or an uploaded file into rows.
 *
 * Accepts what an HR export actually looks like: one address per line, or
 * comma / semicolon / tab separated columns with or without a header row. A
 * header is recognised by its words (name, email, …) in either language and
 * decides the column order; without one, the address is simply whichever
 * column contains an "@", and the first other column is the name.
 */
export function parseMemberList(text: string): ParsedList {
  const rows: CompanyMemberDraft[] = []
  const rejected: string[] = []
  const seen = new Set<string>()
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

  let cols: { email: number; name: number; ref: number } | null = null
  const header = lines[0] ? splitRow(lines[0]) : []
  if (header.length > 1 && !header.some((c) => EMAIL_RE.test(c))) {
    const find = (words: string[]) => header.findIndex((c) => words.some((w) => c.toLowerCase().includes(w)))
    const email = find(['email', 'mail', 'e-mail'])
    if (email >= 0) {
      cols = {
        email,
        name: find(['name', 'nome', 'collaborat', 'dipendent', 'funcion']),
        ref: find(['ref', 'matricola', 'badge', 'matrícula', 'matricula', 'id']),
      }
      lines.shift()
    }
  }

  for (const line of lines) {
    const parts = splitRow(line)
    const email = (cols && cols.email < parts.length ? parts[cols.email] : parts.find((p) => EMAIL_RE.test(p)) ?? '')
      .trim().toLowerCase()
    if (!EMAIL_RE.test(email)) { rejected.push(line); continue }
    if (seen.has(email)) continue
    seen.add(email)
    /* A bare address on its own line under a header row still lands in the
       name column, and "name: maria@…" is not a name. Any candidate that is
       itself an address is dropped. */
    const candidate = cols && cols.name >= 0 ? parts[cols.name] : parts.find((p) => p !== email && !EMAIL_RE.test(p) && !/^\d+$/.test(p))
    const name = candidate && !EMAIL_RE.test(candidate.trim()) ? candidate : undefined
    const ref = cols && cols.ref >= 0 && parts[cols.ref] !== email ? parts[cols.ref] : undefined
    rows.push({ email, name: name?.trim() || undefined, employeeRef: ref?.trim() || undefined })
  }
  return { rows, rejected }
}

function splitRow(line: string): string[] {
  return line.split(/[,;\t]/).map((c) => c.trim().replace(/^"(.*)"$/, '$1'))
}

export function Employees({ companyId, licences }: { companyId?: string; licences: number }) {
  const { t } = useI18n()
  const dp = useDataProvider()
  const [rows, setRows] = useState<CompanyMember[] | null>(null)
  const [unlisted, setUnlisted] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  /* the add-one form */
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [ref, setRef] = useState('')

  /* the import */
  const [importing, setImporting] = useState(false)
  const [paste, setPaste] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    void dp.listCompanyMembers(companyId).then(setRows).catch(() => setRows([]))
    void dp.countUnlistedMembers(companyId).then(setUnlisted).catch(() => setUnlisted(0))
  }, [dp, companyId])
  useEffect(load, [load])

  async function run(job: () => Promise<unknown>) {
    setBusy(true); setError(null)
    try { await job(); load() } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const parsed = useMemo(() => (paste.trim() ? parseMemberList(paste) : null), [paste])
  const known = useMemo(() => new Set((rows ?? []).map((r) => r.email)), [rows])
  const fresh = parsed ? parsed.rows.filter((r) => !known.has(r.email)) : []
  const again = parsed ? parsed.rows.length - fresh.length : 0

  function addOne() {
    const addr = email.trim().toLowerCase()
    if (!EMAIL_RE.test(addr)) { setError(t('That does not look like an email address.')); return }
    void run(async () => {
      await dp.addCompanyMembers([{ email: addr, name: name.trim() || undefined, employeeRef: ref.trim() || undefined }], companyId)
      setName(''); setEmail(''); setRef('')
    })
  }

  function importList() {
    if (!parsed?.rows.length) return
    void run(async () => {
      await dp.addCompanyMembers(parsed.rows, companyId)
      setPaste(''); setImporting(false)
    })
  }

  function readFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => setPaste(String(reader.result ?? ''))
    reader.readAsText(file)
  }

  function toggle(m: CompanyMember) {
    if (m.enabled && !window.confirm(t('Turn off access for {email}? They keep their account and their own history, and lose everything the company convention opens — straight away.', { email: m.email }))) return
    void run(() => dp.setCompanyMemberAccess(m.email, !m.enabled, companyId))
  }

  function remove(m: CompanyMember) {
    if (!window.confirm(t('Take {email} off the list? Same effect as turning access off, and the line goes.', { email: m.email }))) return
    void run(() => dp.removeCompanyMember(m.email, companyId))
  }

  function revokeUnlisted() {
    if (!window.confirm(t('Accounts on your company code but not on this list: {n}. Disconnect all of them? They keep their accounts and lose the company convention.', { n: unlisted }))) return
    void run(async () => {
      const n = await dp.revokeUnlistedMembers(companyId)
      window.alert(t('Accounts no longer on your company code: {n}', { n }))
    })
  }

  const active = (rows ?? []).filter((r) => r.enabled)
  const off = (rows ?? []).filter((r) => !r.enabled)
  const shown = (rows ?? []).filter((r) => {
    const q = filter.trim().toLowerCase()
    if (!q) return true
    return r.email.includes(q) || (r.name ?? '').toLowerCase().includes(q) || (r.employeeRef ?? '').toLowerCase().includes(q)
  })

  return (
    <section className="c-panel">
      <h2 className="c-h2">{t('Approved addresses')}</h2>
      <p className="c-small">
        {t('Your company code says which company an account belongs to. This list says who inside it may use that code. With at least one address on the list, the code works for these people and nobody else — so a code that gets forwarded enrols no one, and somebody who leaves is cut off here, without reissuing the code to everyone.')}
      </p>

      {error && <p className="c-err">{error}</p>}

      {rows !== null && !rows.length && (
        <div className="c-alertbox">
          <strong>{t('The list is empty, so the code alone opens the app.')}</strong>
          <p className="c-small">
            {t('Anyone who knows your code can register against your licences today. Add the first address and that stops: from then on the code is checked against this list.')}
          </p>
        </div>
      )}

      {rows !== null && rows.length > 0 && (
        <div className="c-rosterbar">
          <span><strong>{active.length}</strong> {t('approved')}</span>
          {off.length > 0 && <span><strong>{off.length}</strong> {t('turned off')}</span>}
          <span className="c-small">{t('{n} licences in your convention', { n: licences })}</span>
          {active.length > licences && (
            <span className="c-small c-rosterbar__warn">{t('More approved addresses than licences — the ones over the limit will not be able to register.')}</span>
          )}
        </div>
      )}

      {/* ---- add one ------------------------------------------------------ */}
      <h3 className="c-h3">{t('Add an address')}</h3>
      <div className="c-inviterow">
        <input className="c-input" placeholder={t('Employee name')} value={name} onChange={(e) => setName(e.target.value)} />
        <input className="c-input" type="email" placeholder={t('Approved email address')} value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="c-input" placeholder={t('Your reference (optional)')} value={ref} onChange={(e) => setRef(e.target.value)} />
        <button className="c-btn c-btn--primary" disabled={busy || !email.trim()} onClick={addOne}>{t('Add to the list')}</button>
      </div>
      <p className="c-small">
        {t('It does not have to be a work address — approve whichever address the person will register with.')}
      </p>

      {/* ---- import ------------------------------------------------------- */}
      {!importing && (
        <p className="c-small">
          <button className="c-link" onClick={() => setImporting(true)}>{t('Import a list instead')}</button>
        </p>
      )}
      {importing && (
        <div className="c-import">
          <h3 className="c-h3">{t('Import a list')}</h3>
          <p className="c-small">
            {t('Paste one address per line, or a CSV with name and email columns. Addresses already on the list are updated and keep their current access — importing an old file never re-admits somebody you turned off.')}
          </p>
          <textarea
            className="c-input c-import__box"
            rows={6}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={'name,email\nMaria Rossi,maria.rossi@company.com'}
          />
          <div className="c-row c-row--between">
            <div className="c-row">
              <input
                ref={fileRef}
                className="c-hidden-input"
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = '' }}
              />
              <button className="c-btn c-btn--ghost" onClick={() => fileRef.current?.click()}>{t('Choose a CSV file')}</button>
              {parsed && (
                <span className="c-small">
                  {t('Addresses read: {n}', { n: parsed.rows.length })}
                  {again > 0 && ` · ${t('already on the list: {n}', { n: again })}`}
                  {parsed.rejected.length > 0 && ` · ${t('lines with no address: {n}', { n: parsed.rejected.length })}`}
                </span>
              )}
            </div>
            <div className="c-row">
              <button className="c-btn c-btn--ghost" onClick={() => { setImporting(false); setPaste('') }}>{t('Cancel')}</button>
              <button className="c-btn c-btn--primary" disabled={busy || !parsed?.rows.length} onClick={importList}>
                {t('Add these addresses ({n})', { n: parsed?.rows.length ?? 0 })}
              </button>
            </div>
          </div>
          {parsed && parsed.rejected.length > 0 && (
            <details className="c-details">
              <summary className="c-small">{t('Lines we could not read')}</summary>
              <ul className="c-codes c-codes--quiet">
                {parsed.rejected.slice(0, 20).map((l, i) => <li key={i}><span className="c-mono">{l}</span></li>)}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* ---- the list ----------------------------------------------------- */}
      {rows !== null && rows.length > 0 && (
        <>
          <div className="c-row c-row--between">
            <h3 className="c-h3">{t('On the list')}</h3>
            {rows.length > 8 && (
              <input className="c-input c-input--sm" placeholder={t('Search the list')} value={filter} onChange={(e) => setFilter(e.target.value)} />
            )}
          </div>
          <table className="c-table">
            <thead>
              <tr>
                <th>{t('Employee name')}</th>
                <th>{t('Approved email address')}</th>
                <th>{t('Reference')}</th>
                <th>{t('Access')}</th>
                <th>{t('Added')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.email} className={m.enabled ? undefined : 'is-off'}>
                  <td>{m.name ?? <span className="c-small">—</span>}</td>
                  <td className="c-mono">{m.email}</td>
                  <td className="c-small">{m.employeeRef ?? '—'}</td>
                  <td>
                    <span className={`c-status ${m.enabled ? 'c-status--active' : 'c-status--removed'}`}>
                      {m.enabled ? t('Enabled') : t('Turned off')}
                    </span>
                  </td>
                  <td className="c-small">{fmtDate(m.addedAt)}</td>
                  <td className="c-right">
                    <button className="c-link" disabled={busy} onClick={() => toggle(m)}>
                      {m.enabled ? t('Turn off') : t('Turn on')}
                    </button>
                    <button className="c-link c-link--danger" disabled={busy} onClick={() => remove(m)}>{t('Remove')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* ---- what a leaked code already cost ------------------------------ */}
      {unlisted > 0 && rows !== null && rows.length > 0 && (
        <div className="c-alertbox">
          <strong>{t('Accounts holding your code without being on this list: {n}', { n: unlisted })}</strong>
          <p className="c-small">
            {t('They registered before the list existed, or with a code somebody passed on. Adding addresses does not touch them — this does.')}
          </p>
          <button className="c-btn c-btn--ghost" disabled={busy} onClick={revokeUnlisted}>{t('Disconnect them')}</button>
        </div>
      )}

      <p className="c-note">
        {t('This list is yours: names and addresses you put here, and nothing else. It does not say whether someone created an account, whether they use the app, or anything they did in it — none of that reaches this dashboard.')}
      </p>
    </section>
  )
}
