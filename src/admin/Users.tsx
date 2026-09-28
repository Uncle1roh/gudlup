import { useState } from 'react'
import { useDataProvider } from '../data/provider'
import { useAdminUsers, useCompanies } from './hooks'
import { ROLE_LABEL, type UserRole, type AdminUser } from './types'

const ROLES: UserRole[] = ['admin', 'therapist', 'hr_admin', 'b2c_user']

export function Users({ actor }: { actor: string }) {
  const dp = useDataProvider()
  const { data, loading, refetch } = useAdminUsers()
  const companies = useCompanies()
  const [busy, setBusy] = useState<string | null>(null)

  const companyName = (id?: string) => companies.data?.find((c) => c.id === id)?.name

  async function changeRole(u: AdminUser, role: UserRole) {
    if (role === u.role) return
    setBusy(u.id)
    await dp.setUserRole(u.id, role)
    await dp.logAudit({ actor, action: 'user.role_changed', target: u.email, detail: `${u.role} → ${role}` })
    setBusy(null)
    refetch()
  }

  /* ONB-02 / D-11: a person found to be under eighteen is suspended and
     their data deleted, except what the law requires; the action is logged
     and the safeguarding path is a matter for the team, not the console. */
  async function minorDetected(u: AdminUser) {
    if (!window.confirm(`Segnalare ${u.email} come minorenne?\n\nL'account viene sospeso e i dati personali cancellati, salvo quanto la legge impone di conservare. L'azione viene registrata.`)) return
    setBusy(u.id)
    try {
      await dp.setUserActive(u.id, false)
      await dp.adminDeleteProfile(u.id)
      await dp.logAudit({ actor, action: 'user.minor_detected', target: u.email, detail: 'sospeso e cancellato (D-11)' })
    } finally {
      setBusy(null)
      refetch()
    }
  }

  async function toggleActive(u: AdminUser) {
    setBusy(u.id)
    await dp.setUserActive(u.id, !u.active)
    await dp.logAudit({ actor, action: u.active ? 'user.deactivated' : 'user.activated', target: u.email })
    setBusy(null)
    refetch()
  }

  const users = data ?? []

  return (
    <div className="adm-page">
      <header className="adm-page__head">
        <h1 className="b2b-h1">Utenti e ruoli</h1>
        <p className="b2b-sub">Tutte le persone sulla piattaforma — clinici, referenti aziendali e dipendenti che usano l’app. {users.length} in totale.</p>
      </header>

      {loading && <p className="b2b-sub">Caricamento…</p>}

      {!loading && (
        <div className="adm-table adm-table--users">
          <div className="adm-tr adm-tr--head">
            <div>Nome</div><div>Email</div><div>Azienda</div><div>Ruolo</div><div className="adm-tr__right">Accesso</div>
          </div>
          {users.map((u) => (
            <div className={`adm-tr ${u.active ? '' : 'is-inactive'}`} key={u.id}>
              <div><b>{u.name}</b></div>
              <div className="adm-muted">{u.email}</div>
              <div>{companyName(u.companyId) ?? <span className="adm-muted">Piattaforma</span>}</div>
              <div>
                <select
                  className="adm-select"
                  value={u.role}
                  disabled={busy === u.id}
                  onChange={(e) => changeRole(u, e.target.value as UserRole)}
                >
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
              </div>
              <div className="adm-tr__right">
                <button
                  className={`b2b-btn ${u.active ? 'b2b-btn--ghost' : 'b2b-btn--primary'}`}
                  disabled={busy === u.id}
                  onClick={() => toggleActive(u)}
                >
                  {u.active ? 'Disattiva' : 'Attiva'}
                </button>
                {u.role === 'b2c_user' && (
                  <button className="b2b-btn b2b-btn--ghost" disabled={busy === u.id} title="Minorenne rilevato: sospendi e cancella (D-11)" onClick={() => void minorDetected(u)}>
                    Minorenne
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
