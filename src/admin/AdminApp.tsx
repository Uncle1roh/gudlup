import { useState } from 'react'
import { tr } from '../i18n'
import { useAuth, SignOutButton } from '../auth/auth'
import { Overview } from './Overview'
import { CatalogAdmin } from './CatalogAdmin'
import { AssetLibrary } from './AssetLibrary'
import { CredentialQueue } from './CredentialQueue'
import { Companies } from './Companies'
import { Users } from './Users'
import { AuditLog } from './AuditLog'

type Section = 'overview' | 'catalog' | 'assets' | 'credentials' | 'companies' | 'users' | 'audit'

const NAV: { id: Section; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '▦' },
  { id: 'catalog', label: 'Protocol catalog', icon: '♪' },
  { id: 'assets', label: 'Asset library', icon: '♫' },
  { id: 'credentials', label: 'Credentialing', icon: '✓' },
  { id: 'companies', label: 'Companies', icon: '◭' },
  { id: 'users', label: 'Users & roles', icon: '◑' },
  { id: 'audit', label: 'Audit log', icon: '≣' },
]

export function AdminApp() {
  const { user } = useAuth()
  const actor = user?.email ?? 'admin@goodloop.app'
  const [section, setSection] = useState<Section>('overview')

  return (
    <div className="adm">
      <aside className="adm-side">
        <div className="adm-brand">
          <span className="adm-brand__mark">◠◡</span>
          <span className="adm-brand__name">goodloop <span className="adm-brand__sub">{tr('admin')}</span></span>
        </div>
        <nav className="adm-nav">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`adm-nav__item ${section === n.id ? 'is-active' : ''}`}
              onClick={() => setSection(n.id)}
            >
              <span className="adm-nav__icon" aria-hidden="true">{n.icon}</span>
              {tr(n.label)}
            </button>
          ))}
        </nav>
        <div className="adm-side__foot">
          <div className="adm-who">
            <span className="adm-who__dot" aria-hidden="true" />
            <span className="adm-who__email">{actor}</span>
          </div>
          <SignOutButton className="b2b-btn b2b-btn--ghost" />
        </div>
      </aside>

      <main className="adm-main">
        {section === 'overview' && <Overview onGo={setSection} />}
        {section === 'catalog' && <CatalogAdmin actor={actor} />}
        {section === 'assets' && <AssetLibrary actor={actor} />}
        {section === 'credentials' && <CredentialQueue actor={actor} />}
        {section === 'companies' && <Companies actor={actor} />}
        {section === 'users' && <Users actor={actor} />}
        {section === 'audit' && <AuditLog />}
      </main>
    </div>
  )
}
