/* ============================================================================
   The chrome both consoles wear

   There are two of them now — the admin console (the catalogue, the audio,
   the credentials, the switches: the PRODUCT) and the commercial one (the
   companies, the plans, the campaigns, the partners: the BUSINESS). They are
   the same object: a dark rail of sections on the left, one section in the
   main column, a way into the demo surfaces, and a foot with who you are.

   This is that object. It is here, and not duplicated into a second file,
   because the alternative was two copies of the same sidebar drifting apart
   over the next six months — a menu button fixed in one of them, a sign-out
   moved in the other.

   What the consoles keep for themselves is only their list of sections and
   what each one renders.
   ============================================================================ */

import { type ReactNode } from 'react'
import { BrandLogo } from '../components/Brand'
import { SignOutButton } from '../auth/auth'
import { AvatarUpload } from '../components/AvatarUpload'
import { HelpNowButton } from '../legal/HelpNow'
import { SURFACES, openPreview, type PreviewSurface } from './preview'

export interface ConsoleNavItem<Id extends string> {
  id: Id
  label: string
  icon: string
}

export function ConsoleShell<Id extends string>({
  /** The word next to the logo: which console this is. */
  subtitle,
  nav,
  section,
  onPick,
  actor,
  /** Which demo surfaces this console may open. The commercial console is
      not offered the admin one: the whole point of the split is that the
      catalogue and the switches are not its business. */
  preview,
  navOpen,
  setNavOpen,
  children,
}: {
  subtitle: string
  nav: ConsoleNavItem<Id>[]
  section: Id
  onPick: (id: Id) => void
  actor: string
  preview: PreviewSurface[]
  navOpen: boolean
  setNavOpen: (open: boolean) => void
  children: ReactNode
}) {
  const current = nav.find((n) => n.id === section)

  return (
    <div className="adm">
      <aside className={`adm-side${navOpen ? ' is-open' : ''}`}>
        <div className="adm-brand">
          <BrandLogo variant="cream" />
          <span className="adm-brand__sub">{subtitle}</span>
          {/* On a phone the sidebar folds into a bar at the top: the menu
              opens over the page and closes once a section is picked. On a
              desktop the toggle is hidden and the sidebar is always open. */}
          <button
            className="adm-menu"
            aria-expanded={navOpen}
            aria-controls="adm-drawer"
            onClick={() => setNavOpen(!navOpen)}
          >
            <span className="adm-menu__label">{current?.label ?? 'Menu'}</span>
            <span aria-hidden="true">{navOpen ? '✕' : '☰'}</span>
          </button>
        </div>
        <div className="adm-drawer" id="adm-drawer">
          <nav className="adm-nav" aria-label="Sezioni della console">
            {nav.map((n) => (
              <button
                key={n.id}
                className={`adm-nav__item ${section === n.id ? 'is-active' : ''}`}
                aria-current={section === n.id ? 'page' : undefined}
                onClick={() => onPick(n.id)}
              >
                <span className="adm-nav__icon" aria-hidden="true">{n.icon}</span>
                {n.label}
              </button>
            ))}
          </nav>

          {/* Open the other apps from here.

              Showing the whole product from one login is what this is for,
              and three accounts is not a demo. Each of these opens that
              surface on the DEMO data — populated screens, and nothing real
              read or written. The bar at the top of the surface moves
              between them and gets back out. */}
          <div className="adm-open">
            <span className="adm-open__title">Apri un’altra app</span>
            <span className="adm-open__note">Anteprima con dati dimostrativi</span>
            <div className="adm-open__row">
              {SURFACES.filter((s) => preview.includes(s.id)).map((s) => (
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
        {children}
      </main>
    </div>
  )
}
