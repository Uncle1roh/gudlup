/* ============================================================================
   Good Loop — what publishing a PLAIN workbook writes to the catalog

   Lifted out of `PlainImport` so the rule can be executed and asserted rather
   than argued about. It is the one piece of logic that decides whether, after
   an import, the Studio can reopen that time signature — and it has to hold
   the hard rule from CLAUDE.md at the same time:

     publishing or editing ONE time signature must never disturb the others,
     their timeline, their Studio session or their attached audio.

   So: the incoming workbook's durations are MERGED into whatever the catalog
   already holds, each in its own slot, and every field that belongs to another
   duration is carried through untouched.
   ============================================================================ */

import {
  CATALOG_DURATIONS,
  catalogDuration,
  mergeVersions,
  narrowTimeline,
  timelinesByDuration,
  type CatalogProtocol,
} from '../data/catalog'
import type { Duration, ProtocolFamily, SessionPhase } from '../types/domain'
import type { PlainTimeline, PlainVersion } from './plainTimeline'

const FAMILIES: ProtocolFamily[] = ['GL-ANX', 'GL-DEP', 'GL-BURN', 'GL-STRESS', 'GL-RESIL']

export function familyFromCode(code: string | null): ProtocolFamily {
  const fam = (code ?? '').split(/\s+/)[0] as ProtocolFamily
  return FAMILIES.includes(fam) ? fam : 'GL-ANX'
}

export function phasesForCatalog(v: PlainVersion | undefined): SessionPhase[] {
  if (!v || v.phases.length !== 6) return []
  return v.phases.map((p) => ({
    id: p.fase as SessionPhase['id'],
    name: p.label,
    fraction: Math.max(0.01, (p.endS - p.startS) / Math.max(1, v.durationS)),
    showOrb: p.fase === 2,
  }))
}

export interface PublishInput {
  /** The workbook on screen. */
  timeline: PlainTimeline
  /** The catalog row as it stands, if the protocol is already known. */
  existing: CatalogProtocol | undefined
  /** The time signature the screen is working on, when one is selected. */
  selected?: Duration | null
  /**
   * Write the workbook WITHOUT activating the protocol.
   *
   * Attaching an imported Excel is not publishing it. A PO importing a file so
   * they can work on it in the Studio has rendered nothing yet, and a protocol
   * that goes live the moment a spreadsheet is read would put an unfinished
   * session in front of a person.
   */
  keepDraft?: boolean
  /**
   * File this workbook under the protocol that is already open, keeping ITS
   * code and title.
   *
   * A protocol is created by hand now — code, clinical title, public name,
   * tags — and then workbooks are imported into it. Letting the spreadsheet
   * rename the thing it was imported into undid that, and a workbook whose
   * README names a different protocol filed the timeline under a code nobody
   * asked for. The Excel supplies the TIMELINE; the protocol supplies its own
   * identity.
   */
  intoExisting?: boolean
  now?: number
}

/**
 * The catalog entry to write.
 *
 * Two invariants, both asserted in `tools/test-publish-plain.ts`:
 *
 * · Every duration the catalog already had still has its timeline afterwards,
 *   byte for byte, unless this workbook carries that duration too.
 * · Every duration this workbook carries can be read back with `plainFor`,
 *   which is what the Studio reopens through. A publish that cannot be
 *   reopened is the failure this whole file exists to make impossible.
 */
export function entryForPublish({ timeline: t, existing, selected, keepDraft, intoExisting, now = Date.now() }: PublishInput): CatalogProtocol {
  const code = intoExisting ? existing?.code ?? t.code : t.code
  if (!code) throw new Error('Il file non ha un codice GL (foglio README) — serve per pubblicare.')

  const phased = t.versions.find((v) => v.phases.length === 6) ?? t.versions[0]

  // every duration this workbook carries, each with its own slice of it
  const incoming: Partial<Record<Duration, PlainTimeline>> = {}
  for (const v of t.versions) {
    const d = catalogDuration(v.durationMin)
    if (d) incoming[d] = narrowTimeline(t, v)
  }
  const durations = CATALOG_DURATIONS.filter((d) => !!incoming[d])

  /* What was already published, then this workbook on top. `timelinesByDuration`
     also splits the legacy `plain` field, so a row written before per-duration
     storage existed is carried forward rather than lost on the next publish. */
  const plainByDuration = { ...timelinesByDuration(existing), ...incoming }

  const catalogPhases = phasesForCatalog(phased)

  return {
    ...(existing ?? {}),
    code,
    family: existing?.family ?? familyFromCode(code),
    title: intoExisting && existing?.title ? existing.title : (t.title ?? code).trim(),
    blurb: existing?.blurb ?? '',
    phases: catalogPhases.length ? catalogPhases : existing?.phases ?? [],
    versions: mergeVersions(existing?.versions, durations.length ? durations : [12]),
    enabled: keepDraft ? existing?.enabled ?? false : true,
    source: 'imported',
    tenants: existing?.tenants ?? 'all',
    audioReady: existing?.audioReady ?? false,
    spec: existing?.spec,
    datasheet: existing?.datasheet,
    /* Legacy mirror, kept only for readers that predate per-duration storage.
       `plainByDuration` is the authority and every reader in the app goes
       through `mergedPlain()` / `plainFor()`. */
    plain: incoming[selected ?? durations[0] ?? 12] ?? t,
    plainByDuration,
    assetMap: existing?.assetMap,
    updatedAt: now,
  }
}


/* ------------------------------------------------------------ Studio save */

export interface StudioSaveInput {
  code: string
  duration: Duration
  /** The catalog row as it stands, if the protocol is already known. */
  existing: CatalogProtocol | undefined
  /** The static seed for this code, when there is one. */
  base?: { family?: ProtocolFamily; title?: string; blurb?: string; phases?: SessionPhase[]; versions?: CatalogProtocol['versions'] }
  /** Used as the title when nothing else names the protocol. */
  projectName: string
  now?: number
}

/**
 * The catalog entry a Studio save writes.
 *
 * Saving a session is a valid way to START a protocol — the mix can be built
 * before the workbook is final — so this creates the row when it does not
 * exist. What it creates is a DRAFT:
 *
 * · `enabled: false` on a new protocol. Nothing has been published for it —
 *   no timeline, no rendered audio, nothing a person could be given — so it
 *   must not be switchable on. Publishing a duration from the workscreen is
 *   what activates it.
 * · An EXISTING protocol keeps whatever `enabled` state it already had.
 *   Saving a session must never take a live protocol off the air, and it must
 *   not silently re-activate one an admin deliberately switched off.
 *
 * Everything the Studio does not know about — the public name, the tags, the
 * audience, the other time signatures' timelines and sessions — is spread
 * through untouched.
 */
export function entryForStudioSave({ code, duration, existing, base, projectName, now = Date.now() }: StudioSaveInput): CatalogProtocol {
  const versions = existing?.versions?.length
    ? existing.versions
    : base?.versions?.length ? base.versions : []
  return {
    ...(existing ?? {}),
    code,
    family: existing?.family ?? base?.family ?? familyFromCode(code),
    title: existing?.title ?? base?.title ?? projectName,
    blurb: existing?.blurb ?? base?.blurb ?? '',
    phases: existing?.phases?.length ? existing.phases : base?.phases ?? [],
    // merge, never replace — a 24-minute save must not delete the 6- and
    // 12-minute versions or the audio already attached to them
    versions: mergeVersions(versions, [duration]),
    enabled: existing?.enabled ?? false,
    source: existing?.source ?? 'imported',
    tenants: existing?.tenants ?? 'all',
    audioReady: existing?.audioReady ?? false,
    updatedAt: now,
  }
}
