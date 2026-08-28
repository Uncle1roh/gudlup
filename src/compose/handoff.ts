/* ============================================================================
   Good Loop — opening the Sound Studio with something in it

   The Composer, the protocol importer and the catalog all open the Studio
   seeded: set the hand-off, navigate to #studio, and the Studio picks it up.

   IT USED TO BE ONE-SHOT, AND THAT WAS THE BUG.

   `takeStudioSeed()` cleared the pending seed on the first read, and the
   Studio read it inside a `useMemo` — during render. Any second render of
   `StudioDesktop` therefore got nothing and fell back to `makeSeed()`, the
   demo bed. Which looks exactly like "my work was not saved":

   · The desktop gate re-renders on every resize event and unmounts
     `StudioDesktop` below 1024px. Cross that width once — dock the devtools,
     tile the window — and the session was gone. In production, not just dev.
   · React StrictMode double-invokes render in development, so the second
     invocation always saw null.
   · Any parent re-render or a Fast Refresh did the same.

   So the seed is no longer consumed by reading it. It survives in
   sessionStorage until it is explicitly released — which also means reloading
   the page inside the Studio brings the session back instead of the demo bed.
   Nothing here holds AudioBuffers, so it serialises cleanly.
   ============================================================================ */

import type { SeedTrack, StudioProject } from './types'
import type { Duration } from '../types/domain'

const KEY = 'gl.studio.handoff'

export interface StudioAttachTarget { code: string; duration: Duration }
export interface StudioSeed {
  tracks: SeedTrack[]
  name: string
  attach?: StudioAttachTarget
  /** Session fade in/out seconds — applied to the exported/attached mixdown. */
  fadeInSec?: number
  fadeOutSec?: number
  /** Hash route the Studio's back button returns to (e.g. '#admin'). */
  returnTo?: string
  /** Timeline length and master fader from a saved project. */
  lengthSec?: number
  masterGain?: number
}

export interface SeedExtras {
  returnTo?: string
  lengthSec?: number
  masterGain?: number
}

let pending: StudioSeed | null = null

function remember(seed: StudioSeed | null): void {
  pending = seed
  try {
    if (seed) sessionStorage.setItem(KEY, JSON.stringify(seed))
    else sessionStorage.removeItem(KEY)
  } catch {
    /* private mode, or a seed too large to store — the module variable still
       carries it for this page life, which is the behaviour we had before. */
  }
}

export function setStudioSeed(
  tracks: SeedTrack[],
  name: string,
  attach?: StudioAttachTarget,
  fades?: { fadeInSec?: number; fadeOutSec?: number },
  extras?: SeedExtras,
): void {
  remember({ tracks, name, attach, ...fades, ...extras })
}

/** Reopen a saved Studio session (the "edit protocol" path). */
export function setStudioProject(project: StudioProject, attach?: StudioAttachTarget, returnTo?: string): void {
  remember({
    tracks: project.tracks,
    name: project.name,
    attach,
    fadeInSec: project.fadeInSec,
    fadeOutSec: project.fadeOutSec,
    lengthSec: project.lengthSec,
    masterGain: project.masterGain,
    returnTo,
  })
}

/**
 * What the Studio should open with. Reading does NOT consume it.
 *
 * Safe to call during render, on every render, and after a reload — which is
 * the whole point. Call `releaseStudioSeed()` when the Studio is actually left.
 */
export function peekStudioSeed(): StudioSeed | null {
  if (pending) return pending
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StudioSeed
    if (!parsed || !Array.isArray(parsed.tracks)) return null
    pending = parsed
    return parsed
  } catch {
    return null
  }
}

/** Done with it — the Studio was left deliberately. */
export function releaseStudioSeed(): void {
  remember(null)
}
