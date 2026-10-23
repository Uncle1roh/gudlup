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
import { useI18n } from '../i18n'
import { st } from '../sales/i18n'
import { BrandLogo } from '../components/Brand'
import { SignOutButton } from '../auth/auth'
import { AvatarUpload } from '../components/AvatarUpload'
import { HelpNowButton } from '../legal/HelpNow'
import { LanguagePicker } from '../components/LanguagePicker'
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
  /** Whether this console lets its people choose the language.

      The admin console does not and will not: it is pinned to Italian by
      decision, and none of its screens has a `t()` in it. The commercial
      console does — it took five of those screens with it, and the people
      using them are not the people who wrote them. */
  language = false,
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
  language?: boolean
  children: ReactNode
}) {
  /* Subscribing to the interface language is what makes the picker work.

     The screens in here read their words through `st()`, which asks
     `currentLocale()` at call time and is not a hook — so nothing re-renders
     when the language changes, and the console sat in Italian with the
     picker showing Português. This hook subscribes the shell, and the `key`
     below remounts the section under it, which is the only way to reach a
     tree of components that do not use the hook themselves.

     Remounting discards a half-filled form. That is the right trade for a
     deliberate change of language, and the wrong one for anything else,
     which is why the key is the locale and nothing else. */
  const { locale } = useI18n()

  /* The chrome follows the console, not the person.

     `st()` asks `currentLocale()`, which is a module value the I18nProvider
     sets — and `FixedLocale`, which pins the admin console to Italian, only
     changes the React context. So an admin whose own language is Portuguese
     would have got a Portuguese sidebar around an Italian console. The
     console that offers a language is the one whose chrome is translated;
     the other keeps the Italian its screens are written in. */
  const ct = language ? st : (k: string) => k
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
          <nav className="adm-nav" aria-label={ct('Sezioni della console')}>
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
            <span className="adm-open__title">{ct('Apri un’altra app')}</span>
            <span className="adm-open__note">{ct('Anteprima con dati dimostrativi')}</span>
            <div className="adm-open__row">
              {SURFACES.filter((s) => preview.includes(s.id)).map((s) => (
                <button key={s.id} className="adm-open__btn" onClick={() => openPreview(s.id)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="adm-side__foot">
            {language && <LanguagePicker className="adm-lang" label={false} />}
            <HelpNowButton variant="inline" />
            <a className="adm-open__note" href="#legal" target="_blank" rel="noreferrer">{ct('Informazioni legali ↗')}</a>
            <div className="adm-who">
              <AvatarUpload size={30} fallback="⚙️" className="avatarup--bar" />
              <span className="adm-who__email">{actor}</span>
            </div>
            <SignOutButton className="b2b-btn b2b-btn--signout" />
          </div>
        </div>
      </aside>

      <main className="adm-main">
        <p className="adm-small-note">{ct('La console è pensata per lo schermo di un computer: qui funziona tutto, ma le tabelle scorrono di lato.')}</p>
        <div key={locale} className="adm-main__in">{children}</div>
      </main>
    </div>
  )
}
