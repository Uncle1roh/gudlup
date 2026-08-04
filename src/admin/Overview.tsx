import { useProtocols, useCredentialRequests, useCompanies, useAdminUsers } from './hooks'

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
    { label: 'Protocolli attivi', value: enabledProtocols, of: protocols.data?.length, go: 'catalog' as const, hint: 'nel catalogo condiviso' },
    { label: 'Credenziali in attesa', value: pendingCreds, go: 'credentials' as const, hint: 'da verificare (entro 48h)', alert: pendingCreds > 0 },
    { label: 'Aziende attive', value: activeCompanies, of: companies.data?.length, go: 'companies' as const, hint: 'attivazioni aziendali' },
    { label: 'Utenti attivi', value: activeUsers, of: users.data?.length, go: 'users' as const, hint: 'su tutti i ruoli' },
  ]

  return (
    <div className="adm-page">
      <header className="adm-page__head">
        <h1 className="b2b-h1">Panoramica</h1>
        <p className="b2b-sub">Il back-office della piattaforma — catalogo, credenziali, aziende e utenti in un unico posto.</p>
      </header>

      <div className="adm-tiles">
        {tiles.map((t) => (
          <button key={t.label} className={`adm-tile ${t.alert ? 'is-alert' : ''}`} onClick={() => onGo(t.go)}>
            <div className="adm-tile__value">
              {t.value}
              {t.of != null && <span className="adm-tile__of"> / {t.of}</span>}
            </div>
            <div className="adm-tile__label">{t.label}</div>
            <div className="adm-tile__hint">{t.hint}</div>
          </button>
        ))}
      </div>

      <div className="adm-note">
        <b>Prossimo passo:</b> la pipeline di importazione dei contenuti vive dentro Catalogo protocolli — importa una specifica PDF/Excel,
        genera l’audio e pubblica una volta sola, così ogni azienda può usarlo.
      </div>
    </div>
  )
}
