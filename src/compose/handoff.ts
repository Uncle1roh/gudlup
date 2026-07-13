/* A tiny module-level hand-off so the Composer and the protocol importer can
   open the Sound Studio seeded with exactly the bed they built. Set it,
   navigate to #studio, and the Studio takes it on mount (one-shot). When the
   seed comes from a catalog protocol, `attach` lets the Studio re-attach its
   edited mixdown to that protocol version. */

import type { SeedTrack } from './types'
import type { Duration } from '../types/domain'

export interface StudioAttachTarget { code: string; duration: Duration }
export interface StudioSeed { tracks: SeedTrack[]; name: string; attach?: StudioAttachTarget }

let pending: StudioSeed | null = null

export function setStudioSeed(tracks: SeedTrack[], name: string, attach?: StudioAttachTarget): void {
  pending = { tracks, name, attach }
}

export function takeStudioSeed(): StudioSeed | null {
  const out = pending
  pending = null
  return out
}
