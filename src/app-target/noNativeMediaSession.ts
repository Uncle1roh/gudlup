/* The native media-session plugin, as the WEB build sees it: absent.

   On the website `runningNative()` is false and nothing here is ever called
   — but a dynamic import is still a module, and without this the plugin's
   web implementation would be emitted as two chunks and deployed to every
   visitor who can never use them. vite.config.ts resolves the package here
   in every build but the app's. */
export const MediaSession = null
