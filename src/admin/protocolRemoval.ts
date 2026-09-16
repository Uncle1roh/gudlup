/* ============================================================================
   Good Loop — taking material OUT of a protocol

   Three removals, from the smallest to the whole thing:

     removeDurationMaterial   one time signature's Excel and its Studio session
     clearAuthoredMaterial    every Excel, every Studio session, the asset map
     (deleteProtocolVerified) the protocol itself — see publish.ts

   The first two are pure: they return the entry to write and change nothing
   else. What they never touch is the protocol's identity (code, family, the
   clinical and public titles, tags, cover) and the audio already attached to a
   version — a person who is listening to a published session keeps hearing it
   until someone publishes a replacement or removes the protocol.

   Asserted in tools/test-protocol-removal.ts.
   ============================================================================ */

import {
  CATALOG_DURATIONS,
  studioFor,
  timelinesByDuration,
  type CatalogProtocol,
} from '../data/catalog'
import type { Duration } from '../types/domain'

/**
 * The entry with ONE time signature's authored material removed.
 *
 * The other two durations must come out exactly as they went in. That takes
 * care with rows written before per-duration storage, where one legacy `plain`
 * / `studio` field served several durations at once: those are spread into
 * per-duration slots first, so dropping one duration cannot drop its
 * neighbours with it.
 */
export function removeDurationMaterial(p: CatalogProtocol, duration: Duration, now = Date.now()): CatalogProtocol {
  /* timelines: every duration's slot, legacy split included, minus this one */
  const plains = timelinesByDuration(p)
  delete plains[duration]
  const plainByDuration = Object.keys(plains).length ? plains : undefined

  /* sessions: same rule, through `studioFor`, which is how the Studio reopens */
  const studios: NonNullable<CatalogProtocol['studioByDuration']> = {}
  for (const d of CATALOG_DURATIONS) {
    if (d === duration) continue
    const s = studioFor(p, d)
    if (s) studios[d] = s
  }
  const studioByDuration = Object.keys(studios).length ? studios : undefined

  return {
    ...p,
    /* The legacy single fields are retired for this row: everything they held
       for the durations that stay now lives in the per-duration slots above,
       and leaving them would bring the removed duration back through the
       legacy fallback. */
    plain: undefined,
    studio: undefined,
    plainByDuration,
    studioByDuration,
    updatedAt: now,
  }
}

/** The entry with every authored workbook, Studio session and the asset map
    removed. Identity and attached audio stay. */
export function clearAuthoredMaterial(p: CatalogProtocol, now = Date.now()): CatalogProtocol {
  return {
    ...p,
    plain: undefined,
    plainByDuration: undefined,
    studio: undefined,
    studioByDuration: undefined,
    datasheet: undefined,
    spec: undefined,
    assetMap: undefined,
    updatedAt: now,
  }
}

/** Whether a duration has anything a removal would take away. */
export function hasDurationMaterial(p: CatalogProtocol | null | undefined, duration: Duration): boolean {
  if (!p) return false
  return !!timelinesByDuration(p)[duration] || !!studioFor(p, duration)
}

/** Whether the protocol holds any authored material at all. */
export function hasAuthoredMaterial(p: CatalogProtocol | null | undefined): boolean {
  return !!(p && (p.plain || p.plainByDuration || p.studio || p.studioByDuration || p.datasheet || p.spec || p.assetMap))
}
