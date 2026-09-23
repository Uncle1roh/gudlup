import { useEffect, useState } from 'react'
import { BrandLogo } from '../components/Brand'
import { useAuth, SignOutButton } from '../auth/auth'
import { hydrateTtsSettings } from '../tts/settings'
import { AvatarUpload } from '../components/AvatarUpload'
import { Overview } from './Overview'
import { CatalogAdmin } from './CatalogAdmin'
import { AssetLibrary } from './AssetLibrary'
import { CredentialQueue } from './CredentialQueue'
import { ExploreRails } from './ExploreRails'
import { Companies } from './Companies'
import { Users } from './Users'
import { AuditLog } from './AuditLog'
import { SURFACES, openPreview } from './preview'

type Section = 'overview' | 'catalog' | 'rails' | 'assets' | 'credentials' | 'companies' | 'users' | 'audit'

const NAV: { id: Section; label: string; icon: string }[] = [
  { id: 'overview', label: 'Panoramica', icon: '▦' },
  { id: 'catalog', label: 'Catalogo protocolli', icon: '♪' },
  { id: 'rails', label: 'Scaffali della libreria', icon: '▤' },
  { id: 'assets', label: 'Libreria audio', icon: '♫' },
  { id: 'credentials', label: 'Credenziali', icon: '✓' },
  { id: 'companies', label: 'Aziende', icon: '◭' },
  { id: 'users', label: 'Utenti e ruoli', icon: '◑' },
  { id: 'audit', label: 'Registro attività', icon: '≣' },
]

export function AdminApp() {
  const { user } = useAuth()
  const actor = user?.email ?? 'admin@goodloop.app'
  const [section, setSection] = useState<Section>('overview')

  /* Pull the shared ElevenLabs key the moment the console opens.
     The Voice engine panel does this too, but it only MOUNTS when someone
     opens Dettagli — so an operator on a new machine who went straight to
     Pubblica was told there was no key while the key sat in the database
     unread. Publishing is the thing that needs it; the console is where
     publishing happens; so the console is where it is fetched. */
  useEffect(() => { void hydrateTtsSettings() }, [])

  return (
    <div className="adm">
      <aside className="adm-side">
        <div className="adm-brand">
          <BrandLogo variant="cream" />
          <span className="adm-brand__sub">admin</span>
        </div>
        <nav className="adm-nav">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`adm-nav__item ${section === n.id ? 'is-active' : ''}`}
              onClick={() => setSection(n.id)}
            >
              <span className="adm-nav__icon" aria-hidden="true">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>

        {/* Open the other apps from here.

            Sales has to show the whole product from one login, and three
            accounts is not a demo. Each of these opens that surface on the
            DEMO data — populated screens, and nothing real read or written.
            The bar at the top of the surface moves between them and gets
            back out. */}
        <div className="adm-open">
          <span className="adm-open__title">Apri un’altra app</span>
          <span className="adm-open__note">Anteprima con dati dimostrativi</span>
          <div className="adm-open__row">
            {SURFACES.filter((s) => s.id !== 'admin').map((s) => (
              <button key={s.id} className="adm-open__btn" onClick={() => openPreview(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="adm-side__foot">
          <div className="adm-who">
            <AvatarUpload size={30} fallback="⚙️" className="avatarup--bar" />
            <span className="adm-who__email">{actor}</span>
          </div>
          <SignOutButton className="b2b-btn b2b-btn--signout" />
        </div>
      </aside>

      <main className="adm-main">
        {section === 'overview' && <Overview onGo={setSection} />}
        {section === 'catalog' && <CatalogAdmin actor={actor} />}
        {section === 'rails' && <ExploreRails actor={actor} />}
        {section === 'assets' && <AssetLibrary actor={actor} />}
        {section === 'credentials' && <CredentialQueue actor={actor} />}
        {section === 'companies' && <Companies actor={actor} />}
        {section === 'users' && <Users actor={actor} />}
        {section === 'audit' && <AuditLog />}
      </main>
    </div>
  )
}
