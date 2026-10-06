import type { CapacitorConfig } from '@capacitor/cli'

/* ============================================================================
   The downloadable app

   Capacitor wraps `dist-app` — the Self Use app, built from the same `src` as
   the website with the desktop surfaces resolved away (see vite.config.ts).
   There is no second codebase: `npm run build:app` then `npx cap sync`.

   Nothing in this file affects the web build. It is read by the Capacitor
   CLI and by nothing else.
   ============================================================================ */

const config: CapacitorConfig = {
  /* Reverse-DNS, and it is permanent: the store listing, the signing
     certificates and every installed copy are keyed to it. Change it before
     the first upload or not at all. */
  appId: 'health.goodloop.app',
  appName: 'Good Loop',
  webDir: 'dist-app',

  /* The sessions are audio people listen to with their eyes closed, often
     with the screen off. The webview must not be torn down while that is
     happening — the native audio plugin owns playback, but the page behind
     it has to survive to drive the phases. */
  ios: {
    contentInset: 'always',
    /* The guided voice is the product; the device's silent switch must not
       mute it, the way it would mute a notification sound. */
    limitsNavigationsToAppBoundDomains: true,
  },
  android: {
    /* Stop the webview from being destroyed on rotation and on the
       back-to-foreground path, which would restart a session mid-play. */
    captureInput: true,
  },

  server: {
    /* Local files, not a hosted URL. A phone on a train still has its
       sessions; a webview pointed at the website would not.

       For development against a laptop, uncomment and set your LAN address:
         url: 'http://192.168.1.x:5173',
         cleartext: true,
       and remember to remove it before any build that leaves your desk. */
    androidScheme: 'https',
  },
}

export default config
