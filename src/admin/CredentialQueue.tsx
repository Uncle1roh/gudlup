import { useState } from 'react'
import { useDataProvider } from '../data/provider'
import { useCredentialRequests } from './hooks'
import { fmtDateTime, relWhen } from '../b2b/data'
import type { CredentialDecision, CredentialRequest } from './types'

const STATUS_TAG: Record<CredentialRequest['status'], { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'adm-pill--warn' },
  approved: { label: 'Approved', cls: 'adm-pill--ok' },
  rejected: { label: 'Rejected', cls: 'adm-pill--bad' },
  more_info: { label: 'Info requested', cls: 'adm-pill--info' },
}

export function CredentialQueue({ actor }: { actor: string }) {
  const dp = useDataProvider()
  const { data, loading, refetch } = useCredentialRequests()
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  async function decide(r: CredentialRequest, decision: CredentialDecision) {
    const reason = reasons[r.id]?.trim() || undefined
    setBusy(r.id)
    try {
      await dp.decideCredential(r.id, decision, reason)
      await dp.logAudit({ actor, action: `credential.${decision}`, target: r.name, detail: r.crp + (reason ? ` — ${reason}` : '') })
      refetch()
    } catch (e) {
      window.alert(`Couldn't save the decision: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  const requests = data ?? []
  const pending = requests.filter((r) => r.status === 'pending')
  const decided = requests.filter((r) => r.status !== 'pending')

  return (
    <div className="adm-page">
      <header className="adm-page__head">
        <h1 className="b2b-h1">Credentialing</h1>
        <p className="b2b-sub">Review therapist CRP/CFP registrations. Target: decision within 48h. Access to patients is gated until approved.</p>
      </header>

      {loading && <p className="b2b-sub">Loading queue…</p>}

      {!loading && pending.length === 0 && <div className="adm-note">No pending credential reviews. 🎉</div>}

      {pending.map((r) => {
        const overdue = Date.now() - r.submittedAt > 48 * 3_600_000
        const reason = reasons[r.id] ?? ''
        return (
          <div className="adm-cred" key={r.id}>
            <div className="adm-cred__main">
              <div className="adm-cred__id">
                <span className="adm-avatarsm">🩺</span>
                <div>
                  <div className="adm-cred__name">{r.name}</div>
                  <div className="b2b-sub">{r.email} · <span className="adm-mono">{r.crp}</span></div>
                </div>
              </div>
              <div className={`adm-cred__when ${overdue ? 'is-overdue' : ''}`}>
                submitted {relWhen(r.submittedAt)}
                {overdue && <span className="adm-pill adm-pill--bad">SLA overdue</span>}
              </div>
            </div>
            <input
              className="b2b-input adm-cred__reason"
              placeholder="Reason (required to reject or request info)"
              value={reason}
              onChange={(e) => setReasons((m) => ({ ...m, [r.id]: e.target.value }))}
            />
            <div className="adm-cred__actions">
              <button className="b2b-btn b2b-btn--primary" disabled={busy === r.id} onClick={() => decide(r, 'approved')}>Approve</button>
              <button className="b2b-btn" disabled={busy === r.id || !reason.trim()} onClick={() => decide(r, 'more_info')}>Request info</button>
              <button className="b2b-btn b2b-btn--danger" disabled={busy === r.id || !reason.trim()} onClick={() => decide(r, 'rejected')}>Reject</button>
            </div>
          </div>
        )
      })}

      {decided.length > 0 && (
        <>
          <h2 className="adm-h2">Recently decided</h2>
          <div className="adm-table adm-table--cred">
            <div className="adm-tr adm-tr--head">
              <div>Name</div><div>CRP</div><div>Decision</div><div>When</div><div>Reason</div>
            </div>
            {decided.map((r) => (
              <div className="adm-tr" key={r.id}>
                <div>{r.name}</div>
                <div className="adm-mono">{r.crp}</div>
                <div><span className={`adm-pill ${STATUS_TAG[r.status].cls}`}>{STATUS_TAG[r.status].label}</span></div>
                <div>{r.decidedAt ? fmtDateTime(r.decidedAt) : '—'}</div>
                <div className="adm-muted">{r.reason ?? '—'}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
