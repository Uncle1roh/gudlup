/* ============================================================================
   Legal text the console has rewritten

   The ~120 registered disclaimers live in `messages.ts`, compiled into the
   app: an ID, a tier, and the sentence in three languages. That is the right
   home for them — they are reviewed as a unit and shipped as a unit — and it
   is also why nobody outside this repository could fix a comma in one.

   This is the overlay that lets the console do it (POs, 2026-11-10). A row
   here replaces ONE message in ONE language, and nothing else: the ID, the
   tier, the market and the English fallback chain are all untouched, so an
   override can change what a sentence SAYS and can never change which
   sentence is shown where, or to whom.

   THE VERSION IS NOT OPTIONAL. The legal framework keeps a register of which
   text was in force when (LEG-07 / ADM-06), and a console that could rewrite
   a tier-A disclaimer without touching that register would make the register
   a record of something other than what people read. So an override carries
   the version it belongs to, saving writes a register row, and
   `legalTextVersion()` is what the app reports — not the constant.

   LOADED ONCE, read everywhere. `legalMsg` is a pure function called from
   dozens of screens and from code with no React context at all, so the
   overrides are a module-level map filled at start-up, exactly like the
   feature switches. Until the read lands the compiled text stands, which is
   the only safe default: a legal sentence that renders empty while a fetch
   is in flight is worse than one that is a version behind.
   ============================================================================ */

import { LEGAL_VERSION } from './types'
import type { Locale } from '../i18n'

/** One rewritten sentence: which message, which language, what it now says. */
export interface LegalTextOverride {
  /** A `LegalMessageId` — kept as a string so a row for an id this build no
      longer knows about is carried rather than crashing the map. */
  refId: string
  locale: Locale
  body: string
  /** The legal text version this wording belongs to. */
  version: string
  updatedAt: number
  updatedBy?: string
}

const byKey = new Map<string, string>()
let loadedVersion: string | null = null
let loaded = false

const keyOf = (refId: string, locale: Locale) => `${refId}|${locale}`

/** Replace the whole overlay — what a load or a save hands back. */
export function setLegalOverrides(rows: LegalTextOverride[]): void {
  byKey.clear()
  let newest: { at: number; version: string } | null = null
  for (const r of rows) {
    if (!r.refId || !r.body) continue
    byKey.set(keyOf(r.refId, r.locale), r.body)
    if (!newest || r.updatedAt > newest.at) newest = { at: r.updatedAt, version: r.version }
  }
  loadedVersion = newest?.version ?? null
  loaded = true
}

/** The rewritten sentence, or undefined to use the compiled one. */
export function legalOverride(refId: string, locale: Locale): string | undefined {
  return byKey.get(keyOf(refId, locale))
}

/** Has the overlay been fetched yet? Screens that want to say "showing the
    shipped text" can ask. */
export function legalOverridesLoaded(): boolean {
  return loaded
}

/**
 * The version of the legal text actually on screen.
 *
 * The constant in `types.ts` is what this build shipped with; once the
 * console has rewritten anything, the version in force is the one those
 * rewrites were saved under, and that is what the footer and the acceptance
 * record have to say.
 */
export function legalTextVersion(): string {
  return loadedVersion ?? LEGAL_VERSION
}
