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

   What this is NOT: it does not keep audio alive in the background. On iOS
   that is `UIBackgroundModes: audio` in Info.plist; on Android it is a
   foreground service. This is the face of those; they are in docs/MOBILE.md.
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
  const ms = session()
  if (!ms) return
  try { ms.playbackState = state } catch { /* fine */ }
}

/** How far through, so the OS can draw a progress bar that is not a lie. */
export function setPosition(elapsedSec: number, durationSec: number): void {
  const ms = session()
  if (!ms || typeof ms.setPositionState !== 'function') return
  if (!Number.isFinite(durationSec) || durationSec <= 0) return
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
