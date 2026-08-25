import { useEffect, useState } from 'react'
import { SoundStudio } from './studio/SoundStudio'
import { ConsumerApp } from './app/ConsumerApp'
import { SelfUseApp } from './selfuse/SelfUseApp'
import { TherapistApp } from './b2b/TherapistApp'
import { WorkspaceApp } from './workspace/WorkspaceApp'
import { CorporateApp } from './corporate/CorporateApp'
import { AdminApp } from './admin/AdminApp'
import { EmployerApp } from './employer/EmployerApp'
import { DataLayerProvider } from './data/provider'
import { AuthProvider } from './auth/auth'
import { AuthGate } from './auth/AuthScreen'
import { I18nProvider } from './i18n'
import { Hub } from './hub/Hub'
import { initVoiceSync } from './tts/voiceSync'
import { ErrorBoundary } from './components/ErrorBoundary'

export default function App() {
  const [route, setRoute] = useState(() => window.location.hash)

  /* Voices come from the connected ElevenLabs account: the cache paints the
     pickers instantly, then a background refresh picks up anything the POs
     added since. */
  useEffect(() => { initVoiceSync() }, [])

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  /* Three surfaces built to the 2026-08 wireframe specs, and the three that
     preceded them. The new ones own the primary routes; the earlier screens
     stay reachable on explicit -legacy routes so nothing that worked before is
     lost while the specs bed in.

       #app / (default)  Self Use mobile app        46 screens
       #therapist        Therapist Workspace        28 screens
       #employer / #hr   Corporate Dashboard        19 screens
       #nr1              NR-1 psychosocial report   (regulatory, separate)
       #b2c-legacy · #b2b-legacy                    previous surfaces */
  const isLegacyB2c = route === '#b2c-legacy'
  const isWorkspace = route === '#therapist'
  const isLegacyB2b = route === '#b2b' || route === '#b2b-legacy'
  const isAdmin = route === '#admin'
  const isCorporate = route === '#employer' || route === '#hr' || route === '#corporate'
  const isNr1 = route === '#nr1'

  function content() {
    // Demo hub: links every surface for testers. No gate — it's just links.
    if (route === '#hub') {
      return <Hub />
    }

    // The Sound Studio is an internal authoring tool — left ungated.
    if (route === '#studio') {
      return (
        <AuthProvider>
          <DataLayerProvider>
            <SoundStudio />
          </DataLayerProvider>
        </AuthProvider>
      )
    }

    // The admin console — its own gate and role.
    if (isAdmin) {
      return (
        <AuthProvider>
          <DataLayerProvider>
            <AuthGate mode="admin">
              <AdminApp />
            </AuthGate>
          </DataLayerProvider>
        </AuthProvider>
      )
    }

    // The Corporate Dashboard — aggregates only, HR role.
    if (isCorporate) {
      return (
        <AuthProvider>
          <DataLayerProvider>
            <AuthGate mode="hr">
              <CorporateApp />
            </AuthGate>
          </DataLayerProvider>
        </AuthProvider>
      )
    }

    // The NR-1 psychosocial report keeps its own route: it is a regulatory
    // surface with a risk vocabulary the Corporate Dashboard is not allowed
    // to use, so the two must not be folded into one navigation.
    if (isNr1) {
      return (
        <AuthProvider>
          <DataLayerProvider>
            <AuthGate mode="hr">
              <EmployerApp />
            </AuthGate>
          </DataLayerProvider>
        </AuthProvider>
      )
    }

    if (isWorkspace || isLegacyB2b) {
      return (
        <AuthProvider>
          <DataLayerProvider>
            <AuthGate mode="b2b">
              {isWorkspace ? <WorkspaceApp /> : <TherapistApp />}
            </AuthGate>
          </DataLayerProvider>
        </AuthProvider>
      )
    }

    return (
      <AuthProvider>
        <DataLayerProvider>
          <AuthGate mode="b2c">
            {isLegacyB2c ? <ConsumerApp /> : <SelfUseApp />}
          </AuthGate>
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
  return (
    <I18nProvider>
      <ErrorBoundary resetKey={route} label={route || '#home'}>
        {content()}
      </ErrorBoundary>
    </I18nProvider>
  )
}
