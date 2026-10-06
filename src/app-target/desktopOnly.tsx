/* ============================================================================
   The surfaces that do not ship inside the mobile app

   The Studio, the admin console, the therapist workspace and the company
   dashboard are desktop tools — the workspace refuses under 1024px by its own
   choice, and nobody masters a protocol on a phone. In the app build these
   modules are aliased to this file (see vite.config.ts, VITE_TARGET=app), so
   none of their code is in the binary.

   That is worth more than the megabytes. An app that CAN open an admin
   console is a finding in store review and a liability on a lost phone; one
   where the console is not compiled in cannot be talked into showing it.

   Nothing here is reachable in the app anyway: App.tsx ignores the hash in
   app mode and renders Self Use. This exists so the imports resolve, and as
   the honest answer if a route ever did get through.
   ============================================================================ */

export function NotInApp() {
  return (
    <div className="app-frame su-studio">
      <div className="su-page">
        <h1 className="display su-h1">Disponibile sul web</h1>
        <p className="lead">
          Questa parte di Good Loop — lo Studio, la console, lo spazio del terapeuta —
          si usa dal browser su un computer. L’app contiene le sessioni da ascoltare.
        </p>
      </div>
    </div>
  )
}

/* The names App.tsx imports, all pointing at the same honest page. */
export const SoundStudio = NotInApp
export const AdminApp = NotInApp
export const WorkspaceApp = NotInApp
export const CorporateApp = NotInApp
export const Hub = NotInApp
export const PreviewBar = NotInApp
