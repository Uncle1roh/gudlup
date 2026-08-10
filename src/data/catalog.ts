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

import type { Protocol } from '../types/domain'
import type { ProtocolSpec } from '../admin/protocolDoc'
import type { Datasheet } from '../admin/datasheet'
import type { PlainTimeline } from '../admin/plainTimeline'
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
  /** PLAIN clip-level Timeline (the new recommended format) — the offline
      renderer re-executes this (with fresh or seeded draws). */
  plain?: PlainTimeline
  /** Admin's phase → storage-path asset assignments (Asset Library). */
  assetMap?: AssetMap
  /** The Sound Studio session for this protocol — every edit made in the
      multitrack (clips, levels, EQ, timbres, voices). Saving it is what makes
      "open in the Studio" resume the real work instead of re-deriving the bed
      from the Excel. */
  studio?: import('../compose/types').StudioProject
  /** Clinical pathway material or self-service library audio. Absent on rows
      written before the split — those are clinical. */
  audience?: Audience
  /** Browse metadata: only on `audience: 'library'` entries. */
  library?: LibraryMeta
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
