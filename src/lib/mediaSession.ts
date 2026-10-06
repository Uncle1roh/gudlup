/* ============================================================================
   What the phone shows while a session plays

   The product is audio listened to with the eyes closed and, increasingly,
   with the screen off. The moment the screen locks, the only interface left
   is the lock screen: a title, and a pause button. Without this the lock
   screen says nothing, and the hardware pause on a pair of headphones does
   nothing either.

   `navigator.mediaSession` is a plain web API. It works in the Android
   WebView the app runs in, in Chrome and in Safari — so the lock-screen
   controls arrive on the WEBSITE too, not only in the app, and can be tested
   in a browser rather than only on a device.

   Inside the app it is the same calls against a NATIVE media session
   (`@capgo/capacitor-media-session`), which matters for more than the
   notification: that plugin runs an Android foreground service of type
   `mediaPlayback` for as long as a session is active, and a foreground
   service is the only thing that stops Android suspending the webview — and
   with it the audio — a few seconds after the screen goes dark.

   So this module is both the lock screen AND, on Android, the reason a
   twelve-minute session survives the screen locking at minute two.

   One interface, two implementations, chosen at runtime. The plugin is only
   reached inside `__GL_APP__`, so the website neither loads it nor grows by
   a byte for its existence.
   ============================================================================ */

export interface NowPlaying {
  /** The session's own name, as the person chose it. */
  title: string
  /** Who it is from. The brand, not the protocol code. */
  artist?: string
  /** Square cover, any size the platform can scale. */
  artworkUrl?: string
  /** Total length in seconds, for the scrubber the OS draws. */
  durationSec?: number
}

export interface TransportHandlers {
  onPlay: () => void
  onPause: () => void
  onStop: () => void
}

/* ---- which implementation -------------------------------------------- */

type NativePlugin = {
  setMetadata(o: { title?: string; artist?: string; album?: string; artwork?: { src: string; sizes?: string; type?: string }[] }): Promise<void>
  setPlaybackState(o: { playbackState: 'none' | 'paused' | 'playing' }): Promise<void>
  setActionHandler(o: { action: string }, h: ((d: { action: string; seekTime?: number | null }) => void) | null): Promise<void>
  setPositionState(o: { duration?: number; position?: number; playbackRate?: number }): Promise<void>
}

/** Resolved once, then cached. `null` means "web, or the plugin is absent". */
let nativePlugin: NativePlugin | null | undefined

function runningNative(): boolean {
  if (!__GL_APP__) return false
  try {
    const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    return !!cap?.isNativePlatform?.()
  } catch {
    return false
  }
}

/**
 * The native plugin, or null.
 *
 * Imported dynamically and only inside `__GL_APP__`, which the bundler
 * replaces with a literal: in the web build this whole function is dead code
 * and the import is never emitted.
 */
async function native(): Promise<NativePlugin | null> {
  if (!runningNative()) return null
  if (nativePlugin === undefined) {
    try {
      const mod = await import('@capgo/capacitor-media-session')
      nativePlugin = mod.MediaSession as unknown as NativePlugin
    } catch {
      nativePlugin = null // the plugin is not in this build; the web API stands
    }
  }
  return nativePlugin
}

/** Fire a native call and forget it: nothing on screen waits for the OS. */
function onNative(fn: (p: NativePlugin) => Promise<unknown>): boolean {
  if (!runningNative()) return false
  void native().then((p) => { if (p) void fn(p).catch(() => undefined) })
  return true
}

function session(): MediaSession | undefined {
  try {
    return typeof navigator !== 'undefined' && 'mediaSession' in navigator
      ? navigator.mediaSession
      : undefined
  } catch {
    return undefined // a sandboxed or very old webview
  }
}

/** Put the session on the lock screen. */
export function showNowPlaying(now: NowPlaying): void {
  if (onNative((p) => p.setMetadata({
    title: now.title,
    artist: now.artist ?? 'Good Loop',
    artwork: now.artworkUrl ? [{ src: now.artworkUrl, sizes: '512x512', type: 'image/png' }] : undefined,
  }))) {
    setPlaybackState('playing')
    return
  }
  const ms = session()
  if (!ms) return
  try {
    ms.metadata = new MediaMetadata({
      title: now.title,
      artist: now.artist ?? 'Good Loop',
      artwork: now.artworkUrl
        ? [{ src: now.artworkUrl, sizes: '512x512', type: 'image/png' }]
        : undefined,
    })
    ms.playbackState = 'playing'
  } catch {
    /* MediaMetadata is missing on some webviews; the controls below still
       work, and a nameless notification beats no notification. */
  }
}

/**
 * Route the OS transport back into the player.
 *
 * Only the actions this product HAS are claimed. Seek and track-skip are
 * deliberately left unhandled: a guided protocol is a sequence with a
 * clinical shape, and scrubbing into the middle of it is not a feature —
 * leaving them unset makes the platform hide those buttons rather than draw
 * controls that do nothing.
 */
export function bindTransport(h: TransportHandlers): void {
  if (onNative(async (p) => {
    await p.setActionHandler({ action: 'play' }, () => h.onPlay())
    await p.setActionHandler({ action: 'pause' }, () => h.onPause())
    await p.setActionHandler({ action: 'stop' }, () => h.onStop())
    /* Unset for the same reason as on the web: a guided protocol is not a
       track to scrub through. */
    for (const a of ['seekbackward', 'seekforward', 'seekto', 'previoustrack', 'nexttrack']) {
      await p.setActionHandler({ action: a }, null)
    }
  })) return
  const ms = session()
  if (!ms) return
  const set = (action: MediaSessionAction, fn: (() => void) | null) => {
    try { ms.setActionHandler(action, fn) } catch { /* unsupported action */ }
  }
  set('play', h.onPlay)
  set('pause', h.onPause)
  set('stop', h.onStop)
  set('seekbackward', null)
  set('seekforward', null)
  set('seekto', null)
  set('previoustrack', null)
  set('nexttrack', null)
}

/** Keep the lock screen honest about whether sound is coming out. */
export function setPlaybackState(state: 'playing' | 'paused'): void {
  if (onNative((p) => p.setPlaybackState({ playbackState: state }))) return
  const ms = session()
  if (!ms) return
  try { ms.playbackState = state } catch { /* fine */ }
}

/** How far through, so the OS can draw a progress bar that is not a lie. */
export function setPosition(elapsedSec: number, durationSec: number): void {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return
  if (onNative((p) => p.setPositionState({
    duration: durationSec,
    position: Math.max(0, Math.min(elapsedSec, durationSec)),
    playbackRate: 1,
  }))) return
  const ms = session()
  if (!ms || typeof ms.setPositionState !== 'function') return
  try {
    ms.setPositionState({
      duration: durationSec,
      position: Math.max(0, Math.min(elapsedSec, durationSec)),
      playbackRate: 1,
    })
  } catch {
    /* Safari throws when position > duration on a rounding edge. */
  }
}

/** The session is over: take it off the lock screen. */
export function clearNowPlaying(): void {
  if (onNative(async (p) => {
    await p.setPlaybackState({ playbackState: 'none' })
    for (const a of ['play', 'pause', 'stop']) await p.setActionHandler({ action: a }, null)
  })) return
  const ms = session()
  if (!ms) return
  try {
    ms.playbackState = 'none'
    ms.metadata = null
    for (const a of ['play', 'pause', 'stop'] as MediaSessionAction[]) {
      try { ms.setActionHandler(a, null) } catch { /* fine */ }
    }
  } catch {
    /* nothing to clear */
  }
}
