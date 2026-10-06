import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

/* ============================================================================
   Two targets, one source tree.

     vite build             →  the web app, exactly as it has always been built.
     vite build --mode app  →  the bundle Capacitor wraps: Self Use only.

   The app build is not a fork and not a branch. It is this same `src` with
   the desktop-only surfaces resolved away, so there is one place to fix a
   bug and no second copy of the product drifting behind the first.

   Vite's own `--mode` carries it, so no cross-platform env-var helper and no
   new dependency. The default path is deliberately untouched: in every mode
   but `app` the plugin below does nothing, `base` stays '/', the output stays
   `dist`, and `npm run build` produces the same bytes it did before.
   That is the only way "we have a mobile app" and "we did not compromise the
   web app" can both be true.
   ============================================================================ */

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

/** Exactly as App.tsx imports them. These do not go in the phone binary. */
const DESKTOP_ONLY = new Set([
  './studio/SoundStudio',
  './admin/AdminApp',
  './workspace/WorkspaceApp',
  './corporate/CorporateApp',
  './hub/Hub',
  './admin/PreviewBar',
])

/**
 * Resolve the desktop-only surfaces to a stub, for the app build only.
 *
 * A resolver rather than an alias: alias entries match by prefix or by a
 * regex over part of the specifier, and a partial match leaves the "./"
 * in front of an absolute path — which resolves to nothing, slowly.
 */
function desktopOnlyStub(active: boolean): Plugin {
  const stub = here('./src/app-target/desktopOnly.tsx')
  return {
    name: 'gl-desktop-only-stub',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!active || !importer) return null
      return DESKTOP_ONLY.has(source) ? stub : null
    },
  }
}

export default defineConfig(({ mode }) => {
  const isApp = mode === 'app' || process.env.VITE_TARGET === 'app'
  return {
    plugins: [react(), desktopOnlyStub(isApp)],
    /* The app is loaded from the device's own filesystem, so asset URLs have
       to be relative: an absolute "/assets/…" resolves to the root of the
       webview's origin and finds nothing. */
    base: isApp ? './' : '/',
    define: {
      /* A compile-time constant, so the branch the other target does not use
         is dropped by the bundler rather than shipped and skipped. */
      __GL_APP__: JSON.stringify(isApp),
    },
    build: {
      outDir: isApp ? 'dist-app' : 'dist',
      /* The phone build has no Studio and no console in it, so the oversized
         chunk the web build warns about is not there to warn about. */
      chunkSizeWarningLimit: isApp ? 900 : 500,
    },
    server: {
      host: true, // expose on the LAN so you can test on a real phone
      port: 5173,
    },
  }
})
