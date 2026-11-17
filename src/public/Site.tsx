/* ============================================================================
   The public site — the shell: a bar, a page, a footer

   `Good Loop Visual ID/Website goodloop_v19.html` drawn as React. The POs'
   file is a document of its own: six pages in one HTML, shown and hidden by
   a hash router of twenty lines, with every string in a dictionary at the
   foot and the language chosen in the bar. Everything here is that file —
   its markup, its classes (namespaced, see `site.css`), its words
   (`copy.ts`) and its order.

   WHAT CHANGED, AND WHY — the whole list, so the next diff against v20 is
   short.

   1 · ENTER GOES TO THE DOOR. v19 is a site that stands apart from the app
   and links out to it (`https://goodloop-two.vercel.app/`, target=_blank).
   This IS the app, so every "Entra / Entrar / Enter the platform" is the
   internal route `#entrar`. Nothing else about the door is touched.

   2 · THE PHOTOGRAPH IS THE APP'S. v19 carries its own background layer;
   this app has drawn one at the root since the landing was built
   (`components/ambient/`), it is the same picture under the same scrim, and
   the commercial console can change it. So that layer is dropped and this
   claims the stage instead.

   3 · ONE PAGE IS MOUNTED, NOT SIX. The hash picks a component rather than
   a `display: block`.

   4 · THE LANGUAGE IS ITS OWN (`lang.tsx`). Three on the site, two in the
   app, and the reason is written there.

   5 · THE TYPE IS SELF-HOSTED. `site.css` says why.

   NOTHING ON THIS SITE IS A CLINICAL CLAIM. The footer's disclaimer and the
   line under the evidence table are the two sentences that keep it that
   way, and they are rendered on every page and on the methodology page
   respectively. They are not decoration. CLAUDE.md, and the legal corpus.
   ============================================================================ */

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { BrandLogo } from '../components/Brand'
import {
  R_COMO,
  R_CONTATO,
  R_LANDING,
  R_LOGIN,
  R_METODO,
  R_MODULOS,
  R_SOBRE,
  navigate,
  useStageClaim,
  type Stage,
} from '../components/ambient/stage'
import { useBackgrounds } from '../app/backgrounds'
import { SITE_LANGS, type CopyKey, type SiteLang } from './copy'
import { SiteLangProvider, useSite } from './lang'
import { SiteHome } from './SiteHome'
import { SiteHow } from './SiteHow'
import { SiteMethod } from './SiteMethod'
import { SiteModules } from './SiteModules'
import { SiteAbout } from './SiteAbout'
import { SiteContact } from './SiteContact'
import './site.css'

/** The five in the bar, in v19's order. Contato is not one of them — it is
    reached from the footer and from the modules page, as in the file. */
const NAV: { stage: Stage; hash: string; key: CopyKey }[] = [
  { stage: 'landing', hash: R_LANDING, key: 'nav_home' },
  { stage: 'como', hash: R_COMO, key: 'nav_how' },
  { stage: 'metodo', hash: R_METODO, key: 'nav_method' },
  { stage: 'modulos', hash: R_MODULOS, key: 'nav_modes' },
  { stage: 'sobre', hash: R_SOBRE, key: 'nav_about' },
]

/** v19's own id for each page, because its stylesheet keys on them. */
const PAGE_ID: Partial<Record<Stage, string>> = {
  landing: 'page-home',
  como: 'page-how',
  metodo: 'page-methodology',
  modulos: 'page-modules',
  sobre: 'page-about',
  contato: 'page-contact',
}

/** The two addresses the site writes to. Support's changes with the
    language, exactly as v19 switches it; the commercial one does not. */
const MAIL_SUPPORT: Record<SiteLang, string> = {
  en: 'support@goodloop.com.br',
  it: 'supporto@goodloop.com.br',
  pt: 'suporte@goodloop.com.br',
}
export const MAIL_INFO = 'info@goodloop.com.br'

export function supportMail(lang: SiteLang): string {
  return MAIL_SUPPORT[lang]
}

/* Never a reload: `stage.ts` says why the empty hash is a `replaceState`
   and not a navigation. */
export const go = navigate

export function Site({ stage }: { stage: Stage }) {
  return (
    <SiteLangProvider>
      <SiteBody stage={stage} />
    </SiteLangProvider>
  )
}

function SiteBody({ stage }: { stage: Stage }) {
  const { s } = useSite()
  useStageClaim(stage)

  /* The window is the scroller while this is on screen, not `body`.
     `site.css` says why that has to be asked for. */
  useEffect(() => {
    const el = document.documentElement
    el.dataset.glSite = 'on'
    return () => { delete el.dataset.glSite }
  }, [])

  /* v19's `route()` ends with `window.scrollTo(0, 0)`. Without it, arriving
     at a short page from the foot of a long one opens it already scrolled
     past its own headline. */
  useEffect(() => { window.scrollTo(0, 0) }, [stage])

  /* `--bg` is the photograph, and the one place the site prints it as a
     frame rather than as a background is the methodology page. It is a
     setting the commercial console writes (`app/backgrounds.ts`), so it is
     read through the hook rather than written into the stylesheet — read
     as a plain call it was a snapshot of whatever the cache held at the
     first paint, and the frame stayed on the shipped picture while the
     window behind it moved to the new one. */
  const style = { '--bg': `url(${useBackgrounds().landing})` } as CSSProperties

  return (
    <div className="glw" style={style}>
      {/* Skip to content. It may NOT be left as a plain `href="#main"` the
          way v19 writes it: in this app the hash is the route, and `#main`
          is not one — the first keyboard user to press Enter on it would
          have been thrown out of the site and onto the sign-in screen. So
          it moves focus itself and leaves the URL alone. */}
      <a
        className="glw-skip"
        href="#main"
        onClick={(e) => {
          e.preventDefault()
          const el = document.getElementById('main')
          if (!el) return
          el.setAttribute('tabindex', '-1')
          el.focus()
          el.scrollIntoView()
        }}
      >
        {s('skip')}
      </a>
      <SiteHeader stage={stage} />

      <main id="main">
        {/* The id is v19's, not the stage's: `site.css` carries two dozen
            rules under `#page-methodology`, which is how the POs kept that
            one long page's furniture to itself. */}
        <div className="glw-page" id={PAGE_ID[stage] ?? 'page-home'}>
          {stage === 'landing' && <SiteHome />}
          {stage === 'como' && <SiteHow />}
          {stage === 'metodo' && <SiteMethod />}
          {stage === 'modulos' && <SiteModules />}
          {stage === 'sobre' && <SiteAbout />}
          {stage === 'contato' && <SiteContact />}
        </div>
      </main>

      <SiteFooter />
      <span className="glw-sr" aria-live="polite">{s(labelFor(stage))}</span>
    </div>
  )
}

/** What a screen reader is told the page changed to: a hash change moves no
    focus, so without this a keyboard user gets no announcement at all. */
function labelFor(stage: Stage): CopyKey {
  const hit = NAV.find((n) => n.stage === stage)
  if (hit) return hit.key
  return 'k_eyebrow'
}

/* ------------------------------------------------------------- the bar --- */

function SiteHeader({ stage }: { stage: Stage }) {
  const { s, lang, setLang } = useSite()
  const [menu, setMenu] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const langRef = useRef<HTMLDivElement | null>(null)

  /* v19: `hdr.classList.toggle('scrolled', window.scrollY > 8)`. Passive,
     because this runs on every scroll frame of a 4000px page. */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /* Escape closes both, and so does a tap outside the language menu. Wired
     only while something is open, so a closed bar costs no listeners. */
  useEffect(() => {
    if (!menu && !langOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenu(false); setLangOpen(false) } }
    const onDown = (e: PointerEvent) => {
      if (langRef.current?.contains(e.target as Node)) return
      setLangOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [menu, langOpen])

  /* A page change closes the sheet: on a phone it covers what was chosen. */
  useEffect(() => { setMenu(false); setLangOpen(false) }, [stage])

  const row = SITE_LANGS.find((l) => l.code === lang)

  return (
    <header className={scrolled ? 'glw-site glw-scrolled' : 'glw-site'}>
      <div className="glw-nav">
        <a
          className="glw-brand"
          href={window.location.pathname}
          aria-label={s('home_aria')}
          onClick={(e) => { e.preventDefault(); go(R_LANDING) }}
        >
          {/* The cream colourway: every page of this site stands on the dark
              ground, and the green mark on near-black is the one pairing
              `Brand.tsx` does not allow. */}
          <BrandLogo variant="cream" />
        </a>

        <nav className="glw-nav-links" aria-label={s('nav_home')}>
          {NAV.map((n) => (
            <a
              key={n.key}
              href={n.hash || window.location.pathname}
              className={stage === n.stage ? 'glw-active' : undefined}
              aria-current={stage === n.stage ? 'page' : undefined}
              onClick={(e) => { e.preventDefault(); go(n.hash) }}
            >
              {s(n.key)}
            </a>
          ))}
        </nav>

        <div className="glw-nav-right">
          <div className={langOpen ? 'glw-lang glw-open' : 'glw-lang'} ref={langRef}>
            <button
              className="glw-lang-btn"
              type="button"
              aria-haspopup="true"
              aria-expanded={langOpen}
              aria-label={s('lang_label')}
              onClick={(e) => { e.stopPropagation(); setLangOpen((o) => !o) }}
            >
              <Globe />
              <span className="glw-lang-code">{row?.abbr}</span>
              <Chevron />
            </button>
            <div className="glw-lang-menu" role="menu">
              {SITE_LANGS.map((l) => (
                <button
                  key={l.code}
                  className="glw-lang-opt"
                  type="button"
                  role="menuitemradio"
                  aria-checked={l.code === lang}
                  onClick={(e) => { e.stopPropagation(); setLang(l.code); setLangOpen(false) }}
                >
                  <span>{l.label}</span>
                  <span className="glw-lang-abbr">{l.abbr}</span>
                </button>
              ))}
            </div>
          </div>

          <a
            className="glw-btn glw-btn-accent glw-btn-sm"
            href={R_LOGIN}
            onClick={(e) => { e.preventDefault(); go(R_LOGIN) }}
          >
            {s('nav_enter')}
          </a>

          <button
            className="glw-menu-btn"
            type="button"
            aria-expanded={menu}
            aria-label={s('menu')}
            onClick={(e) => { e.stopPropagation(); setMenu((o) => !o) }}
          >
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </button>
        </div>
      </div>

      <nav className={menu ? 'glw-mobile-nav glw-open' : 'glw-mobile-nav'} aria-label={s('menu')}>
        {NAV.map((n) => (
          <a
            key={n.key}
            href={n.hash || window.location.pathname}
            className={stage === n.stage ? 'glw-active' : undefined}
            onClick={(e) => { e.preventDefault(); setMenu(false); go(n.hash) }}
          >
            {s(n.key)}
          </a>
        ))}
        <a href={R_LOGIN} onClick={(e) => { e.preventDefault(); setMenu(false); go(R_LOGIN) }}>
          {s('nav_enter')}
        </a>
      </nav>
    </header>
  )
}

function Globe() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.3 6.4-3.9 9c-2.6-2.6-3.9-5.6-3.9-9S9.4 5.6 12 3z" />
    </svg>
  )
}

function Chevron() {
  return (
    <svg className="glw-lang-chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

/* ---------------------------------------------------------- the footer --- */

function SiteFooter() {
  const { s, r } = useSite()
  return (
    <footer className="glw-site">
      <div className="glw-wrap">
        <div className="glw-fgrid">
          <div>
            <a
              className="glw-logo"
              href={window.location.pathname}
              aria-label={s('home_aria')}
              onClick={(e) => { e.preventDefault(); go(R_LANDING) }}
            >
              <BrandLogo variant="cream" />
            </a>
            <p className="glw-ftag">{s('f_tag')}</p>
            <p className="glw-fcontact">
              <span>{s('f_get')}</span>{' '}
              <a href={`mailto:${MAIL_INFO}`}>{MAIL_INFO}</a>
            </p>
          </div>
          <div>
            <h4>{s('f_platform')}</h4>
            <a href={R_COMO} onClick={(e) => { e.preventDefault(); go(R_COMO) }}>{s('nav_how')}</a>
            <a href={R_METODO} onClick={(e) => { e.preventDefault(); go(R_METODO) }}>{s('nav_method')}</a>
            <a href={R_MODULOS} onClick={(e) => { e.preventDefault(); go(R_MODULOS) }}>{s('nav_modes')}</a>
          </div>
          <div>
            <h4>{s('f_company')}</h4>
            <a href={R_SOBRE} onClick={(e) => { e.preventDefault(); go(R_SOBRE) }}>{s('nav_about')}</a>
            <a href={R_CONTATO} onClick={(e) => { e.preventDefault(); go(R_CONTATO) }}>{s('f_contact')}</a>
          </div>
        </div>
        {/* The disclaimer. Self-Guided Use is non-clinical content;
            Professionally Guided Use is a catalogue and a technology, and the
            licensed professional remains the sole treating party. This
            sentence is the registered corpus's, it is on every page of the
            site, and it is not shortened to fit. */}
        <p className="glw-disc">{r('f_disc')}</p>
        <p className="glw-fbottom">{r('f_copy')}</p>
      </div>
    </footer>
  )
}
