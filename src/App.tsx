import { useEffect, useState } from 'react'
import { SoundStudio } from './studio/SoundStudio'
import { ConsumerApp } from './app/ConsumerApp'
import { TherapistApp } from './b2b/TherapistApp'
import { AdminApp } from './admin/AdminApp'
import { EmployerApp } from './employer/EmployerApp'
import { DataLayerProvider } from './data/provider'
import { AuthProvider } from './auth/auth'
import { AuthGate } from './auth/AuthScreen'
import { I18nProvider } from './i18n'
import { Hub } from './hub/Hub'

export default function App() {
  const [route, setRoute] = useState(() => window.location.hash)
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const isB2b = route === '#therapist' || route === '#b2b'
  const isAdmin = route === '#admin'
  const isEmployer = route === '#employer' || route === '#hr'

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

    // The employer (HR) NR-1 dashboard — its own gate and role.
    if (isEmployer) {
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

    return (
      <AuthProvider>
        <DataLayerProvider>
          <AuthGate mode={isB2b ? 'b2b' : 'b2c'}>
            {isB2b ? <TherapistApp /> : <ConsumerApp />}
          </AuthGate>
        </DataLayerProvider>
      </AuthProvider>
    )
  }

  // Interface language wraps every surface so the Profile → Language choice
  // applies live across B2C, therapist, employer, admin, and studio alike.
  return <I18nProvider>{content()}</I18nProvider>
}
