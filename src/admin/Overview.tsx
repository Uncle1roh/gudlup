import { useProtocols, useCredentialRequests, useCompanies, useAdminUsers } from './hooks'
import { tr } from '../i18n'

type Section = 'overview' | 'catalog' | 'credentials' | 'companies' | 'users' | 'audit'

export function Overview({ onGo }: { onGo: (s: Section) => void }) {
  const protocols = useProtocols()
  const creds = useCredentialRequests()
  const companies = useCompanies()
  const users = useAdminUsers()

  const pendingCreds = (creds.data ?? []).filter((r) => r.status === 'pending').length
  const enabledProtocols = (protocols.data ?? []).filter((p) => p.enabled).length
  const activeCompanies = (companies.data ?? []).filter((c) => c.status === 'active').length
  const activeUsers = (users.data ?? []).filter((u) => u.active).length

  const tiles = [
    { label: 'Protocols enabled', value: enabledProtocols, of: protocols.data?.length, go: 'catalog' as const, hint: 'in the shared catalog' },
    { label: 'Pending credentials', value: pendingCreds, go: 'credentials' as const, hint: 'awaiting review (48h SLA)', alert: pendingCreds > 0 },
    { label: 'Active companies', value: activeCompanies, of: companies.data?.length, go: 'companies' as const, hint: 'corporate rollouts' },
    { label: 'Active users', value: activeUsers, of: users.data?.length, go: 'users' as const, hint: 'across all roles' },
  ]

  return (
    <div className="adm-page">
      <header className="adm-page__head">
        <h1 className="b2b-h1">{tr('Overview')}</h1>
        <p className="b2b-sub">{tr('The platform back-office — catalog, credentialing, tenants and users in one place.')}</p>
      </header>

      <div className="adm-tiles">
        {tiles.map((t) => (
          <button key={tr(t.label)} className={`adm-tile ${t.alert ? 'is-alert' : ''}`} onClick={() => onGo(t.go)}>
            <div className="adm-tile__value">
              {t.value}
              {t.of != null && <span className="adm-tile__of"> / {t.of}</span>}
            </div>
            <div className="adm-tile__label">{tr(t.label)}</div>
            <div className="adm-tile__hint">{tr(t.hint)}</div>
          </button>
        ))}
      </div>

      <div className="adm-note">
        <b>{tr('Next up (step 2):')}</b> the content-import pipeline lives inside Protocol catalog — import a PDF/Excel spec,
        generate the audio, and publish once so every company can use it.
      </div>
    </div>
  )
}
