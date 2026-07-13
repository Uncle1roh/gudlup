/* A tiny module-level hand-off so the Composer can open the Sound Studio seeded
   with exactly the bed it built. Set it, navigate to #studio, and the Studio
   takes it on mount (one-shot — cleared on read). */

import type { SeedTrack } from './types'

interface StudioSeed { tracks: SeedTrack[]; name: string }

let pending: StudioSeed | null = null

export function setStudioSeed(tracks: SeedTrack[], name: string): void {
  pending = { tracks, name }
}

export function takeStudioSeed(): StudioSeed | null {
  const out = pending
  pending = null
  return out
}
