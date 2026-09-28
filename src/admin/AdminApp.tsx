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
import { PromoCodes } from './PromoCodes'
import { PartnerProducts } from './PartnerProducts'
import { Users } from './Users'
import { AuditLog } from './AuditLog'
import { Compliance } from './Compliance'
import { HelpNowButton } from '../legal/HelpNow'
import { SURFACES, openPreview } from './preview'

type Section = 'overview' | 'catalog' | 'rails' | 'assets' | 'credentials' | 'companies' | 'promo' | 'partners' | 'users' | 'compliance' | 'audit'

const NAV: { id: Section; label: string; icon: string }[] = [
  { id: 'overview', label: 'Panoramica', icon: '▦' },
  { id: 'catalog', label: 'Catalogo contenuti', icon: '♪' },
  { id: 'rails', label: 'Scaffali della libreria', icon: '▤' },
  { id: 'assets', label: 'Libreria audio', icon: '♫' },
  { id: 'credentials', label: 'Credenziali', icon: '✓' },
  { id: 'companies', label: 'Aziende', icon: '◭' },
  { id: 'promo', label: 'Codici promo', icon: '%' },
  { id: 'partners', label: 'Partner', icon: '❖' },
  { id: 'users', label: 'Utenti e ruoli', icon: '◑' },
  { id: 'compliance', label: 'Conformità', icon: '§' },
  { id: 'audit', label: 'Registro attività', icon: '≣' },
]

export function AdminApp() {
  const { user } = useAuth()
  const actor = user?.email ?? 'admin@goodloop.app'
  const [section, setSection] = useState<Section>('overview')
  /* On a phone the sidebar folds into a bar at the top: the menu opens over
     the page and closes again once a section is picked. On a desktop the
     toggle is hidden and the sidebar is always open. */
  const [navOpen, setNavOpen] = useState(false)
  const current = NAV.find((n) => n.id === section)
  function pick(id: Section) {
    setSection(id)
    setNavOpen(false)
    window.scrollTo({ top: 0 })
  }

  /* Pull the shared ElevenLabs key the moment the console opens.
     The Voice engine panel does this too, but it only MOUNTS when someone
     opens Dettagli — so an operator on a new machine who went straight to
     Pubblica was told there was no key while the key sat in the database
     unread. Publishing is the thing that needs it; the console is where
     publishing happens; so the console is where it is fetched. */
  useEffect(() => { void hydrateTtsSettings() }, [])

  return (
    <div className="adm">
      <aside className={`adm-side${navOpen ? ' is-open' : ''}`}>
        <div className="adm-brand">
          <BrandLogo variant="cream" />
          <span className="adm-brand__sub">admin</span>
          <button
            className="adm-menu"
            aria-expanded={navOpen}
            aria-controls="adm-drawer"
            onClick={() => setNavOpen((v) => !v)}
          >
            <span className="adm-menu__label">{current?.label ?? 'Menu'}</span>
            <span aria-hidden="true">{navOpen ? '✕' : '☰'}</span>
          </button>
        </div>
        <div className="adm-drawer" id="adm-drawer">
        <nav className="adm-nav" aria-label="Sezioni della console">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`adm-nav__item ${section === n.id ? 'is-active' : ''}`}
              aria-current={section === n.id ? 'page' : undefined}
              onClick={() => pick(n.id)}
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
          <HelpNowButton variant="inline" />
          <a className="adm-open__note" href="#legal" target="_blank" rel="noreferrer">Informazioni legali ↗</a>
          <div className="adm-who">
            <AvatarUpload size={30} fallback="⚙️" className="avatarup--bar" />
            <span className="adm-who__email">{actor}</span>
          </div>
          <SignOutButton className="b2b-btn b2b-btn--signout" />
        </div>
        </div>
      </aside>

      <main className="adm-main">
        <p className="adm-small-note">La console è pensata per lo schermo di un computer: qui funziona tutto, ma le tabelle scorrono di lato.</p>
        {section === 'overview' && <Overview onGo={pick} />}
        {section === 'catalog' && <CatalogAdmin actor={actor} />}
        {section === 'rails' && <ExploreRails actor={actor} />}
        {section === 'assets' && <AssetLibrary actor={actor} />}
        {section === 'credentials' && <CredentialQueue actor={actor} />}
        {section === 'companies' && <Companies actor={actor} />}
        {section === 'promo' && <PromoCodes actor={actor} />}
        {section === 'partners' && <PartnerProducts actor={actor} />}
        {section === 'users' && <Users actor={actor} />}
        {section === 'compliance' && <Compliance actor={actor} />}
        {section === 'audit' && <AuditLog />}
      </main>
    </div>
  )
}
