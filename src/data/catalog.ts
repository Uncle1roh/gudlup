/* ============================================================================
   Good Loop — Protocol catalog (admin-managed view over the domain Protocol)
   The static PROTOCOLS array is the SEED; the catalog is what the admin panel
   manages and what the app resolves protocols from going forward. Each entry
   wraps a domain Protocol with the metadata the platform needs to publish it:
   whether it's enabled, where it came from (seed vs an imported document),
   which companies (tenants) may use it, and whether rendered audio exists yet.

   This is the seam the content-import pipeline (step 2) writes into: an imported
   PDF/Excel becomes a CatalogProtocol with source 'imported', audioReady false
   until generated, and tenants 'all' once published.
   ============================================================================ */

import type { Duration, Protocol, ProtocolVersion } from '../types/domain'
import type { ProtocolSpec } from '../admin/protocolDoc'
import type { Datasheet } from '../admin/datasheet'
import type { PlainTimeline, PlainVersion } from '../admin/plainTimeline'
import type { AssetMap } from '../admin/assets'
import { PROTOCOLS } from './protocols'
import { libraryProtocols, type LibraryMeta } from './library'

export type ProtocolSource = 'seed' | 'imported'

/** WHO an entry is for, and therefore how it may be named and offered.
    'clinical' — part of a therapist-authored pathway; keeps its GL code, family
      and clinical title, and is only ever reached through a plan or a session
      with the therapist.
    'library'  — a general wellbeing audio the person browses and picks alone.
      Named after the moment it serves, never after a condition or treatment.
    The two lists are never merged in a query: this field is the legal boundary
    between supervised material and self-service material. */
export type Audience = 'clinical' | 'library'

/** 'all' = available to every company; otherwise the list of company ids. */
export type TenantScope = 'all' | string[]

export interface CatalogProtocol extends Protocol {
  /** Disabled protocols are hidden from prescription but kept for history. */
  enabled: boolean
  /** How this protocol entered the catalog. */
  source: ProtocolSource
  /** Which companies can use it. Published protocols are 'all'. */
  tenants: TenantScope
  /** True once rendered audio exists; imported drafts start false. */
  audioReady: boolean
  /** Last edit (epoch ms). */
  updatedAt: number
  /** Full parsed audio configuration (protocol-document imports only). */
  spec?: ProtocolSpec
  /** Canonical datasheet workbook (xlsx imports) — Renderer v3 executes this. */
  datasheet?: Datasheet
  /**
   * LEGACY single PLAIN timeline: whatever was published LAST. Kept so rows
   * written before the per-duration split keep opening, and so an old client
   * reading this row still finds a timeline. `plainByDuration` is the
   * authority — read through `plainFor()` / `mergedPlain()`, never directly.
   */
  plain?: PlainTimeline
  /**
   * The PLAIN timeline of EACH time signature, kept apart.
   *
   * A protocol is one code and up to three durations (6 / 12 / 24 min), and
   * each one is a different workbook with different clips. Publishing the
   * 12-minute file used to overwrite `plain` and rebuild `versions` from that
   * one workbook, which silently deleted the 6- and 24-minute material — and
   * their attached audio with it. Each duration now has its own slot and
   * publishing one never touches the others.
   */
  plainByDuration?: Partial<Record<Duration, PlainTimeline>>
  /** Admin's phase → storage-path asset assignments (Asset Library). */
  assetMap?: AssetMap
  /**
   * LEGACY single Sound Studio session — the one saved LAST, for the same
   * backward-compatibility reason as `plain`. Read through `studioFor()`.
   */
  studio?: import('../compose/types').StudioProject
  /**
   * The saved Sound Studio session of EACH time signature — every edit made in
   * the multitrack (clips, levels, EQ, timbres, voices) for that duration.
   * Same reason as `plainByDuration`: editing the 24-minute mix must not
   * discard the 6-minute one.
   */
  studioByDuration?: Partial<Record<Duration, import('../compose/types').StudioProject>>
  /** Clinical pathway material or self-service library audio. Absent on rows
      written before the split — those are clinical. */
  audience?: Audience
  /** Browse metadata: only on `audience: 'library'` entries. */
  library?: LibraryMeta
  /**
   * A real cover image, when a PO has uploaded one.
   *
   * Absent means the generated artwork stands — which is the honest default
   * while nothing is commissioned, and the reason contrast on the browse
   * screens is only as good as a gradient can be. A photograph chosen for the
   * session beats a drawing generated from its slug, and this is where it
   * goes; nothing else about the card changes.
   */
  coverUrl?: string
}

/* ======================================================== time signatures ==

   Everything below keeps the three durations of one protocol apart. The rule
   the whole publish path now obeys:

     publishing (or editing) ONE time signature must leave the others exactly
     as they were — their timeline, their Studio session, their audio URL.

   Readers never touch `plain` / `studio` directly: `plainFor()` and
   `studioFor()` answer per duration and fall back to the legacy single fields,
   so rows written before this split behave as they always did. */

export const CATALOG_DURATIONS: Duration[] = [6, 12, 24]

/** A workbook's `durationMin` as a catalog duration, or null if it is not one
    of the three. (A 15-minute sheet is real material but has no catalog slot.) */
export function catalogDuration(min: number): Duration | null {
  return min === 6 || min === 12 || min === 24 ? min : null
}

/** One duration's slice of a multi-sheet workbook: the same timeline with only
    that version's sheet and only the issues that belong to it. Storing this per
    duration keeps each slot self-contained and avoids repeating other sheets. */
export function narrowTimeline(t: PlainTimeline, v: PlainVersion): PlainTimeline {
  return {
    ...t,
    versions: [v],
    issues: t.issues.filter((i) => !i.sheet || i.sheet === v.sheet),
  }
}

/** Every timeline this entry holds, keyed by duration. Legacy `plain` is split
    per sheet first, then the explicit per-duration slots win over it. */
export function timelinesByDuration(
  p: Pick<CatalogProtocol, 'plain' | 'plainByDuration'> | undefined,
): Partial<Record<Duration, PlainTimeline>> {
  const out: Partial<Record<Duration, PlainTimeline>> = {}
  if (p?.plain) {
    for (const v of p.plain.versions) {
      const d = catalogDuration(v.durationMin)
      if (d) out[d] = narrowTimeline(p.plain, v)
    }
  }
  for (const d of CATALOG_DURATIONS) {
    const stored = p?.plainByDuration?.[d]
    if (stored) out[d] = stored
  }
  return out
}

/** The PLAIN timeline for one time signature, or undefined if never published. */
export function plainFor(
  p: Pick<CatalogProtocol, 'plain' | 'plainByDuration'> | undefined,
  duration: Duration,
): PlainTimeline | undefined {
  return timelinesByDuration(p)[duration]
}

/**
 * What a time signature is, at a glance.
 *
 *   empty      nothing imported for it yet — no Excel has been uploaded
 *   saved      it has material and it is NOT on the air
 *   published  a person can play it: the protocol is enabled and this duration
 *              has a rendered file
 *
 * Every protocol has all three time signatures whether or not anything has
 * been imported for them, so the three are always shown and this says which is
 * which. Hiding the empty ones was what made a fresh protocol look like it had
 * no durations at all.
 *
 * Defined here rather than on either screen because the catalog row and the
 * protocol workscreen must never disagree about what a colour means.
 */
export type DurationState = 'empty' | 'saved' | 'published'

export function durationState(
  p: Pick<CatalogProtocol, 'plain' | 'plainByDuration' | 'studio' | 'studioByDuration' | 'versions' | 'enabled'> | undefined,
  duration: Duration,
): DurationState {
  if (!p) return 'empty'
  const version = p.versions.find((v) => v.duration === duration)
  const hasAudio = Boolean(version?.audioUrl && Object.values(version.audioUrl).some(Boolean))
  if (p.enabled && hasAudio) return 'published'
  return plainFor(p, duration) || studioFor(p, duration) ? 'saved' : 'empty'
}

/** The durations that actually have a timeline, ascending. */
export function plainDurations(
  p: Pick<CatalogProtocol, 'plain' | 'plainByDuration'> | undefined,
): Duration[] {
  const map = timelinesByDuration(p)
  return CATALOG_DURATIONS.filter((d) => !!map[d])
}

/**
 * ONE timeline carrying every published time signature — what the admin
 * workscreen opens, so its chips list 6 · 12 · 24 and each chip is that
 * duration's real material. Sheet names are made unique when two workbooks
 * happened to name their sheet the same thing, because the workscreen selects
 * a version by sheet name.
 */
export function mergedPlain(
  p: Pick<CatalogProtocol, 'plain' | 'plainByDuration'> | undefined,
): PlainTimeline | undefined {
  const map = timelinesByDuration(p)
  const durations = CATALOG_DURATIONS.filter((d) => !!map[d])
  if (!durations.length) return p?.plain
  const base = map[durations[0]] as PlainTimeline
  const seen = new Set<string>()
  const versions: PlainVersion[] = []
  const issues: PlainTimeline['issues'] = []
  for (const d of durations) {
    const t = map[d] as PlainTimeline
    const renamed = new Map<string, string>()
    for (const v of t.versions) {
      const sheet = seen.has(v.sheet) ? `${v.sheet} (${v.durationMin}m)` : v.sheet
      seen.add(sheet)
      if (sheet !== v.sheet) renamed.set(v.sheet, sheet)
      versions.push(sheet === v.sheet ? v : { ...v, sheet })
    }
    for (const i of t.issues) {
      const sheet = i.sheet ? renamed.get(i.sheet) : undefined
      issues.push(sheet ? { ...i, sheet } : i)
    }
  }
  return { ...base, versions, issues }
}

/** The saved Studio session for one time signature, falling back to the legacy
    single session ONLY when it is plausibly that duration's — a session saved
    before the split carries no duration, so it is offered to the duration that
    matches its length and to no other. */
export function studioFor(
  p: Pick<CatalogProtocol, 'studio' | 'studioByDuration'> | undefined,
  duration: Duration,
): import('../compose/types').StudioProject | undefined {
  const own = p?.studioByDuration?.[duration]
  if (own) return own
  const legacy = p?.studio
  if (!legacy) return undefined
  const len = legacy.lengthSec
  if (typeof len !== 'number' || !Number.isFinite(len)) return legacy
  const nearest = CATALOG_DURATIONS.reduce((best, d) =>
    Math.abs(d * 60 - len) < Math.abs(best * 60 - len) ? d : best, CATALOG_DURATIONS[0])
  return nearest === duration ? legacy : undefined
}

/**
 * Merge the version list: every duration already in the catalog SURVIVES, with
 * its `audioUrl` intact, and the incoming ones are added. This is the fix for
 * the overwrite — the old code rebuilt `versions` from the workbook being
 * published and dropped everything else.
 */
export function mergeVersions(
  existing: readonly ProtocolVersion[] | undefined,
  incoming: readonly Duration[],
): ProtocolVersion[] {
  const kept = new Map<Duration, ProtocolVersion>()
  for (const v of existing ?? []) kept.set(v.duration, v)
  for (const d of incoming) if (!kept.has(d)) kept.set(d, { duration: d })
  return CATALOG_DURATIONS.filter((d) => kept.has(d)).map((d) => kept.get(d) as ProtocolVersion)
}

/** The audience of an entry, tolerating rows written before the split. */
export function audienceOf(p: Pick<CatalogProtocol, 'audience' | 'family'>): Audience {
  return p.audience ?? (p.family === 'GL-LIB' ? 'library' : 'clinical')
}

/** Entries a person may browse and start on their own. */
export function libraryEntries(all: CatalogProtocol[]): CatalogProtocol[] {
  return all.filter((p) => p.enabled && audienceOf(p) === 'library')
}

/** Entries a therapist may put in a pathway. Never shown to a person browsing. */
export function clinicalEntries(all: CatalogProtocol[]): CatalogProtocol[] {
  return all.filter((p) => p.enabled && audienceOf(p) === 'clinical')
}

/** Lift the seeded domain protocols into catalog entries. */
export function seedCatalog(): CatalogProtocol[] {
  const now = Date.now()
  const clinical: CatalogProtocol[] = PROTOCOLS.map((p: Protocol) => ({
    ...p,
    enabled: true,
    source: 'seed',
    tenants: 'all',
    // No real voice assets exist yet (the player uses a synthesized bed), so
    // seed protocols are honestly marked not-yet-rendered.
    audioReady: false,
    updatedAt: now,
    audience: 'clinical',
  }))
  // the starter library: real titles, no rendered audio yet — the POs produce
  // each mixdown in the Studio and publish over these
  const library: CatalogProtocol[] = libraryProtocols().map((p) => ({
    ...p,
    enabled: true,
    source: 'seed',
    tenants: 'all',
    audioReady: false,
    updatedAt: now,
    audience: 'library',
  }))
  return [...clinical, ...library]
}

/** True when a catalog protocol is visible to a given company. */
export function protocolVisibleTo(p: CatalogProtocol, companyId: string | null): boolean {
  if (!p.enabled) return false
  if (p.tenants === 'all') return true
  return companyId != null && p.tenants.includes(companyId)
}
