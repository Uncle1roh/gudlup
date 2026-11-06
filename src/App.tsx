import { useEffect, useRef, useState } from 'react'
import { SoundStudio } from './studio/SoundStudio'
import { SelfUseApp } from './selfuse/SelfUseApp'
import { WorkspaceApp } from './workspace/WorkspaceApp'
import { CorporateApp } from './corporate/CorporateApp'
import { AdminApp } from './admin/AdminApp'
import { SalesApp } from './sales/SalesApp'
import { DataLayerProvider } from './data/provider'
import { AuthProvider } from './auth/auth'
import { AuthGate } from './auth/AuthScreen'
import { I18nProvider, FixedLocale, currentLocale } from './i18n'
import { Hub } from './hub/Hub'
import { initVoiceSync } from './tts/voiceSync'
import { ErrorBoundary } from './components/ErrorBoundary'
import { PreviewBar } from './admin/PreviewBar'
import { previewing } from './admin/preview'
import { LegalProvider } from './legal/LegalContext'
import { LegalPage } from './legal/LegalPage'
import { EnvBanner } from './app/EnvBanner'
import { appEnv, showsBanner, warnIfUndeclared, type Surface } from './app/environment'
import { initFeatures } from './app/features'
import { PublicRoute } from './public/PublicRoute'
import { AmbientBackground } from './components/ambient/AmbientBackground'
import { publicStage } from './components/ambient/stage'

/* Where the Sound Studio was opened from. Reached from the admin console it
   is part of the console's flow, so it stays in the console's language
   (Italian, pinned) and offers no language picker; reached from anywhere
   else — the therapist app, the hub, a bookmark — it follows the person's
   language and has the picker. Kept per tab so a reload of the Studio keeps
   the answer it had. */
const STUDIO_FROM_ADMIN = 'gl.studio.from-admin'
function noteStudioOrigin(prev: string, next: string): void {
  if (next !== '#studio') return
  try {
    if (prev === '#admin') sessionStorage.setItem(STUDIO_FROM_ADMIN, '1')
    else sessionStorage.removeItem(STUDIO_FROM_ADMIN)
  } catch { /* private mode: the Studio follows the person's language */ }
}
function studioFromAdmin(): boolean {
  try { return sessionStorage.getItem(STUDIO_FROM_ADMIN) === '1' } catch { return false }
}

export default function App() {
  const [route, setRoute] = useState(() => window.location.hash)
  const prevRoute = useRef(route)

  /* Voices come from the connected ElevenLabs account: the cache paints the
     pickers instantly, then a background refresh picks up anything the POs
     added since. */
  useEffect(() => { initVoiceSync() }, [])

  /* The feature switches, read once per load. Until the read lands the
     cached answer stands, so a disabled area does not flash into view and
     then disappear; with no cache at all everything is on, which is the
     only safe default for a kill switch. */
  useEffect(() => { initFeatures() }, [])

  useEffect(() => {
    const onHash = () => {
      const next = window.location.hash
      noteStudioOrigin(prevRoute.current, next)
      prevRoute.current = next
      setRoute(next)
    }
    window.addEventListener('hashchange', onHash)
    /* The landing lives at the EMPTY hash, which `navigate()` reaches with
       `pushState` — and no browser event covers a push. It fires
       `hashchange` by hand on the way there; Back and Forward across that
       same entry fire `popstate`, so both are heard here. The handler reads
       the live hash, so hearing it twice costs one identical setState. */
    window.addEventListener('popstate', onHash)
    return () => {
      window.removeEventListener('hashchange', onHash)
      window.removeEventListener('popstate', onHash)
    }
  }, [])

  /* Three surfaces built to the 2026-08 wireframe specs, and the three that
     preceded them. The new ones own the primary routes; the earlier screens
     stay reachable on explicit -legacy routes so nothing that worked before is
     lost while the specs bed in.

       #app / (default)  Self Use mobile app        46 screens
       #therapist        Therapist Workspace        28 screens
       #employer / #hr   Corporate Dashboard        19 screens
       #legal            Legal information page     (public, no login)

     Three surfaces are no longer routed, because the legal framework (Legal
     Framework/, v5 Path A) forbids what they do and a reachable screen is a
     shipped feature whatever the navigation says:
       #nr1              the employer psychosocial-risk report — D-09 / SPN-07:
                         Good Loop never assesses psychosocial risk, never
                         reports risk bands or category breakdowns to a sponsor
       #b2c-legacy       the previous consumer app — carried the psychosocial
                         questionnaire (MN-05) and a mood-routed home
       #b2b-legacy       the previous clinician console — pre-selected content
                         and generated a 12-week sequence (MN-27)
     Their folders stay on disk until they are deleted; nothing renders them. */
  const isWorkspace = route === '#therapist' || route === '#b2b' || route === '#b2b-legacy'
  const isAdmin = route === '#admin'
  /* The commercial console. Its own role and its own door, like the admin
     one — but NOT pinned to Italian with it. The admin console is Italian by
     decision, for one team; the commercial console took five of its screens
     to a different team, and those screens now read their words through
     `st()` (src/sales/i18n.ts), so the picker in its sidebar means
     something. */
  const isSales = route === '#sales'
  const isCorporate = route === '#employer' || route === '#hr' || route === '#corporate' || route === '#nr1'
  const isLegal = route === '#legal' || route.startsWith('#legal/')
  /* The public site's own five routes. Null everywhere else, which is every
     surface that existed before this round — none of them changes. In the
     phone build it is null always: the app ignores the hash and opens on the
     library, and `vite.config.ts` resolves the whole folder away. */
  const pubStage = __GL_APP__ ? null : publicStage(route)

  /* The console is pinned to Italian (FixedLocale); the page's lang attribute
     follows, so a screen reader reads it as Italian too. Anywhere else it is
     the person's own language again. */
  const pinnedIt = isAdmin || (route === '#studio' && studioFromAdmin())
  useEffect(() => {
    document.documentElement.lang = pinnedIt ? 'it' : currentLocale()
  }, [pinnedIt])

  function content() {
    /* ---- inside the app, there is one surface ---------------------------

       The downloadable app is the Self Use app: sessions to listen to. The
       console, the Studio, the workspace and the company dashboard are not
       compiled into it (vite.config.ts aliases them away), and the hash is
       ignored here so a stale deep link, a pasted URL or a restored tab
       cannot try to reach one. On the web this whole branch is dead code and
       is dropped at build time. */
    if (__GL_APP__) {
      /* The same providers the web b2c branch has, in the same order, and
         LegalProvider is not optional: without it `useLegal()` falls back to
         a stub whose `accept()` does nothing and whose `accepted()` is always
         false. The first run then accepts the terms, reaches its last card,
         calls onDone — and the shell sends it straight back, because the
         acceptance it is waiting for was never recorded. From the person's
         side the button simply stops working. */
      return (
        <AuthProvider>
          <DataLayerProvider>
            <LegalProvider>
              <AuthGate mode="b2c">
                <SelfUseApp />
              </AuthGate>
            </LegalProvider>
          </DataLayerProvider>
        </AuthProvider>
      )
    }

    // Demo hub: links every surface for testers. No gate — it's just links.
    if (route === '#hub') {
      return <Hub />
    }

    /* ---- the public site, and the one door --------------------------------

       The landing page, the three pages it leads to, and the sign-in page
       (`#entrar`). Four of the five are public to anybody; the fifth, the
       empty hash, is the landing for a stranger and the app for somebody
       signed in — `PublicRoute` is where that is settled, because it is the
       first component on this route that can ask.

       The gate is handed to it as `children` rather than rendered here: on
       `#entrar` it IS the page, and on the empty hash it is what a signed-in
       person gets instead of the landing. */
    if (pubStage) {
      return (
        <AuthProvider>
          <DataLayerProvider>
            <LegalProvider>
              <PublicRoute stage={pubStage}>
                <AuthGate mode="b2c">
                  <SelfUseApp />
                </AuthGate>
              </PublicRoute>
            </LegalProvider>
          </DataLayerProvider>
        </AuthProvider>
      )
    }

    /* The legal information page is public (LEG-06): no gate, no login. It
       still sits inside the data layer so the crisis numbers and the version
       register come from configuration rather than from the binary. */
    if (isLegal) {
      return (
        <AuthProvider>
          <DataLayerProvider>
            <LegalProvider>
              <LegalPage />
            </LegalProvider>
          </DataLayerProvider>
        </AuthProvider>
      )
    }

    /* The Sound Studio is the authoring tool: it publishes audio into the
       shared catalogue, so it is not a page to be stumbled into. It was
       ungated — the one surface anybody signed in could open and use. Two
       roles work in it: the team, and the clinicians who compose a session
       through the therapist app and hand it over here. */
    if (route === '#studio') {
      const fromAdmin = studioFromAdmin()
      const studio = (
        <AuthProvider>
          <DataLayerProvider>
            <LegalProvider>
              <AuthGate mode="b2b" allow={['admin', 'therapist']}>
                <SoundStudio languagePicker={!fromAdmin} />
              </AuthGate>
            </LegalProvider>
          </DataLayerProvider>
        </AuthProvider>
      )
      return fromAdmin ? <FixedLocale locale="it">{studio}</FixedLocale> : studio
    }

    /* The admin console — its own gate and role. Always Italian, whatever
       language the person chose elsewhere: the FixedLocale around it (below,
       with the error boundary) pins the sign-in door and the console alike. */
    if (isAdmin) {
      return (
        <AuthProvider>
          <DataLayerProvider>
            <LegalProvider>
              <AuthGate mode="admin">
                <AdminApp />
              </AuthGate>
            </LegalProvider>
          </DataLayerProvider>
        </AuthProvider>
      )
    }

    // The commercial console — companies, plans, campaigns, partners.
    if (isSales) {
      return (
        <AuthProvider>
          <DataLayerProvider>
            <LegalProvider>
              <AuthGate mode="sales">
                <SalesApp />
              </AuthGate>
            </LegalProvider>
          </DataLayerProvider>
        </AuthProvider>
      )
    }

    // The sponsor console — programme totals only, HR role.
    if (isCorporate) {
      return (
        <AuthProvider>
          <DataLayerProvider>
            <LegalProvider>
              <AuthGate mode="hr">
                <CorporateApp />
              </AuthGate>
            </LegalProvider>
          </DataLayerProvider>
        </AuthProvider>
      )
    }

    if (isWorkspace) {
      return (
        <AuthProvider>
          <DataLayerProvider>
            <LegalProvider>
              <AuthGate mode="b2b">
                <WorkspaceApp />
              </AuthGate>
            </LegalProvider>
          </DataLayerProvider>
        </AuthProvider>
      )
    }

    return (
      <AuthProvider>
        <DataLayerProvider>
          <LegalProvider>
            <AuthGate mode="b2c">
              <SelfUseApp />
            </AuthGate>
          </LegalProvider>
        </DataLayerProvider>
      </AuthProvider>
    )
  }

  /* Interface language wraps every surface so the Profile → Language choice
     applies live across B2C, therapist, employer, admin, and studio alike.

     The boundary sits INSIDE the i18n provider (so the fallback can be
     translated later) and is keyed on the route: navigating away from a broken
     screen clears the error by itself, instead of stranding the user on the
     fallback until they reload. */
  /* The preview bar sits ABOVE the surface, outside the error boundary: if a
     screen throws while sales is walking through it, the way out is still on
     screen. It renders only while an admin has preview on. */
  /* The preview bar sits ABOVE the surface, outside the error boundary: if a
     screen throws while sales is walking through it, the way out is still on
     screen. The shell is a column because #root centres its children in a ROW
     — without it the bar and the app end up side by side — and it publishes
     its own height as `--pvw-h`, which the four surface shells subtract from
     their 100dvh so nothing is pushed below the fold. */
  const bar = previewing() && route !== '#admin' && route !== '#sales'
  /* Every deployment that DECLARES itself as not production carries the
     banner, on every surface and every route — including the console,
     because the console is where the destructive buttons are. It is above
     the preview bar: which PLATFORM you are on outranks which surface you
     are previewing.

     A deployment that declared nothing is a different message with a
     different audience: it asks for a build variable to be set, so it goes
     to the surfaces whose people can set one, and never across the login
     page of the app. */
  const surface: Surface = isAdmin || isSales || route === '#studio' || isWorkspace || isCorporate ? 'team' : 'public'
  const banner = showsBanner(appEnv(), surface)
  useEffect(() => { warnIfUndeclared() }, [])
  const boundary = (
    <ErrorBoundary resetKey={route} label={route || '#home'}>
      {content()}
    </ErrorBoundary>
  )
  const body = isAdmin ? <FixedLocale locale="it">{boundary}</FixedLocale> : boundary
  /* The banner is chrome, so on the Italian-pinned console it is Italian too,
     and anywhere else it follows the surface under it. */
  const strip = isAdmin
    ? <FixedLocale locale="it"><EnvBanner surface={surface} /></FixedLocale>
    : <EnvBanner surface={surface} />
  /* ONE background, for the landing, the three public pages, the door and
     the library. Mounted here, outside everything that routes, because the
     rings travel between those places and a transition only runs on an
     element that lives through the change. On every other route it is
     `off` and draws nothing — the surface under it keeps the background it
     always had. It takes no props: the screen that is on claims its stage
     (`components/ambient/stage.ts`). */
  return (
    <I18nProvider>
      <AmbientBackground />
      {bar || banner ? (
        <div className={`pvw-shell${banner ? ' pvw-shell--env' : ''}${bar ? ' pvw-shell--bar' : ''}`}>
          {banner && strip}
          {/* The bar is the ADMIN's chrome, not the surface's: Italian like the
              rest of the console, while the surface under it follows the
              language being demonstrated. */}
          {bar && <FixedLocale locale="it"><PreviewBar /></FixedLocale>}
          <div className="pvw-shell__surface">{body}</div>
        </div>
      ) : body}
    </I18nProvider>
  )
}
