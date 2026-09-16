/* ============================================================================
   Self Use — the browser's back button

   The app's navigation is component state: a tab, a detail screen, a sheet, a
   player. None of it touched the browser's history, so from the browser's
   point of view the whole app was ONE page — and the back button, which on a
   phone is the gesture people reach for without thinking, left the app
   altogether, from any depth.

   The fix is not to turn every screen into a URL. It is a stack of LAYERS:
   a screen that has somewhere to go back to registers what its own ‹ Back
   button does, and the browser's back runs the top one. One layer per press,
   exactly like the button on screen.

   ── how the history is kept in step ───────────────────────────────────────

   Mirroring the depth of every screen into history entries sounds simpler and
   is not: `pushState` is synchronous, `history.back()` is not, and a screen
   that closes while another opens in the same render leaves the two racing.
   So there is exactly ONE extra history entry — a sentinel — and one rule:

       the sentinel exists while at least one layer is open.

   · The first layer to open pushes it.
   · The browser's back pops it; the top layer runs its back, and if anything
     is still open afterwards — that layer at a shallower depth, or the ones
     beneath it — the sentinel is put back.
   · The last layer to close through the APP's own button consumes it, so a
     back pressed at the root leaves the app on the first press, as it should.

   Leaving the app from the root is deliberate: that is what back means there.
   ============================================================================ */

import { useEffect, useRef } from 'react'

interface Layer {
  back: () => void
  /** Set when the browser, not the app, closed this layer — its sentinel is
      already gone and must not be consumed a second time. */
  poppedByBrowser: boolean
}

const layers: Layer[] = []
/** Pops this module caused itself, and must not treat as a back press. */
let ignore = 0

const SENTINEL = { glBack: true }

function isSentinel(state: unknown): boolean {
  return !!state && typeof state === 'object' && (state as { glBack?: boolean }).glBack === true
}

function pushSentinel() {
  try {
    window.history.pushState(SENTINEL, '')
  } catch {
    /* a sandboxed frame without history: back simply behaves natively */
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ignore > 0) {
      ignore--
      /* A layer may have opened in the same render that the previous one
         closed in; if so it needs a sentinel of its own. */
      if (layers.length && !isSentinel(window.history.state)) pushSentinel()
      return
    }
    const top = layers[layers.length - 1]
    if (!top) return // nothing open: the back leaves the app, natively
    top.poppedByBrowser = true
    top.back()
    /* After the screen has reacted. A back does not always CLOSE a layer —
       the therapist booking goes profile → list and stays open — and a layer
       still open, or others underneath one that closed, need the next press
       caught too. Either order of this and the layer's own cleanup ends in the
       same place: a sentinel exactly when something is still open. */
    window.setTimeout(() => {
      if (layers.includes(top)) top.poppedByBrowser = false
      if (layers.length && !isSentinel(window.history.state)) pushSentinel()
    }, 0)
  })
}

/**
 * Register what the on-screen back does, for as long as `active` is true.
 *
 * `onBack` is read at the moment of the press, so it can close over whatever
 * the screen currently shows. Order matters and takes care of itself: the
 * layer opened most recently is the one a back press reaches first, which is
 * the one the person is looking at.
 */
export function useBackLayer(active: boolean, onBack: () => void) {
  const backRef = useRef(onBack)
  backRef.current = onBack

  useEffect(() => {
    if (!active) return
    const layer: Layer = { back: () => backRef.current(), poppedByBrowser: false }
    layers.push(layer)
    // never two sentinels in a row: that would be a back press that does nothing
    if (layers.length === 1 && !isSentinel(window.history.state)) pushSentinel()

    return () => {
      const i = layers.indexOf(layer)
      if (i !== -1) layers.splice(i, 1)
      if (layers.length > 0 || layer.poppedByBrowser) return
      /* The last layer closed through the app. Consume the sentinel so the
         next back at the root leaves — but only if the browser is still ON it:
         after a link to another surface the current entry is that surface,
         and going back would undo the navigation the person just made. */
      if (isSentinel(window.history.state)) {
        ignore++
        window.history.back()
      }
    }
  }, [active])
}
