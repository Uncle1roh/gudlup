import { useState } from 'react'
import { useDataProvider } from '../data/provider'
import { credentialDocUrl } from '../b2b/credentials'
import { useCredentialRequests } from './hooks'
import { fmtDateTime, relWhen } from '../b2b/data'
import type { CredentialDecision, CredentialRequest } from './types'

const STATUS_TAG: Record<CredentialRequest['status'], { label: string; cls: string }> = {
  pending: { label: 'In attesa', cls: 'adm-pill--warn' },
  approved: { label: 'Approvata', cls: 'adm-pill--ok' },
  rejected: { label: 'Rifiutata', cls: 'adm-pill--bad' },
  more_info: { label: 'Info richieste', cls: 'adm-pill--info' },
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
      window.alert(`Impossibile salvare la decisione: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  /* A document is opened through a SIGNED URL minted on the click, not through
     a link sitting in the DOM: the bucket is private, the grant is a few
     minutes long, and a copied address stops working. */
  async function open(path: string) {
    const url = await credentialDocUrl(path)
    if (!url) { window.alert('Documento non disponibile — potrebbe essere stato rimosso.'); return }
    window.open(url, '_blank', 'noopener')
  }

  const requests = data ?? []
  const pending = requests.filter((r) => r.status === 'pending')
  const decided = requests.filter((r) => r.status !== 'pending')

  return (
    <div className="adm-page">
      <header className="adm-page__head">
        <h1 className="b2b-h1">Credenziali</h1>
        <p className="b2b-sub">Verifica le iscrizioni all’albo dei clinici. Obiettivo: decisione entro 48h. L’accesso ai pazienti resta bloccato fino all’approvazione.</p>
      </header>

      {loading && <p className="b2b-sub">Caricamento della coda…</p>}

      {!loading && pending.length === 0 && <div className="adm-note">Nessuna credenziale da verificare. 🎉</div>}

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
                inviata {relWhen(r.submittedAt)}
                {overdue && <span className="adm-pill adm-pill--bad">fuori tempo</span>}
              </div>
            </div>
            {/* What is actually being reviewed. Approving with nothing here is
                approving a number somebody typed about themselves, so the
                empty case says so rather than showing an empty row. */}
            <div className="adm-cred__docs">
              {r.documents.length === 0 ? (
                <span className="adm-cred__nodocs">⚠ Nessun documento allegato — chiedi l’iscrizione all’albo prima di approvare.</span>
              ) : (
                r.documents.map((d) => (
                  <button key={d.path} className="adm-doc" onClick={() => void open(d.path)} title="Apri il documento">
                    📄 {d.name} <em>{(d.sizeBytes / 1024).toFixed(0)} KB</em>
                  </button>
                ))
              )}
            </div>
            <input
              className="b2b-input adm-cred__reason"
              placeholder="Motivo (obbligatorio per rifiutare o chiedere informazioni)"
              value={reason}
              onChange={(e) => setReasons((m) => ({ ...m, [r.id]: e.target.value }))}
            />
            <div className="adm-cred__actions">
              <button className="b2b-btn b2b-btn--primary" disabled={busy === r.id} onClick={() => decide(r, 'approved')}>Approva</button>
              <button className="b2b-btn" disabled={busy === r.id || !reason.trim()} onClick={() => decide(r, 'more_info')}>Chiedi informazioni</button>
              <button className="b2b-btn b2b-btn--danger" disabled={busy === r.id || !reason.trim()} onClick={() => decide(r, 'rejected')}>Rifiuta</button>
            </div>
          </div>
        )
      })}

      {decided.length > 0 && (
        <>
          <h2 className="adm-h2">Decise di recente</h2>
          <div className="adm-table adm-table--cred">
            <div className="adm-tr adm-tr--head">
              <div>Nome</div><div>Albo</div><div>Decisione</div><div>Quando</div><div>Motivo</div>
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
