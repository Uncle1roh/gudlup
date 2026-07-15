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
import type { AssetMap } from '../admin/assets'
import { PROTOCOLS } from './protocols'

export type ProtocolSource = 'seed' | 'imported'

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
  /** Admin's phase → storage-path asset assignments (Asset Library). */
  assetMap?: AssetMap
}

/** Lift the seeded domain protocols into catalog entries. */
export function seedCatalog(): CatalogProtocol[] {
  const now = Date.now()
  return PROTOCOLS.map((p: Protocol) => ({
    ...p,
    enabled: true,
    source: 'seed',
    tenants: 'all',
    // No real voice assets exist yet (the player uses a synthesized bed), so
    // seed protocols are honestly marked not-yet-rendered.
    audioReady: false,
    updatedAt: now,
  }))
}

/** True when a catalog protocol is visible to a given company. */
export function protocolVisibleTo(p: CatalogProtocol, companyId: string | null): boolean {
  if (!p.enabled) return false
  if (p.tenants === 'all') return true
  return companyId != null && p.tenants.includes(companyId)
}
