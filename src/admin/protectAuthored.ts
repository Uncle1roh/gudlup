/* ============================================================================
   Good Loop — a save may replace a protocol, never quietly empty it

   Every catalog write is a FULL-ROW upsert: `saveProtocol` sends all twenty-odd
   columns, so any column missing from the object becomes `null` in the
   database. That is fine for a save that started from the stored row and
   changed one thing. It is a catastrophe for a save that started from a parsed
   document: a spec or datasheet import builds a `CatalogProtocol` from the
   file alone, and if that code already exists, the upsert lands on top of it
   with `studio_by_duration: null` — every saved Sound Studio session of that
   protocol, every rack setting, every voice variant, gone in one write that
   reported success.

   `preserveAuthored` is the floor under those writes. Anything an importer
   cannot possibly know about — the Studio sessions, the timelines, the asset
   map, the cover, the public names, the tags, the attached audio — is carried
   over from the stored row whenever the incoming object does not carry it
   itself. The import still wins on everything it DOES carry.

   WHAT THIS DELIBERATELY DOES NOT DO: stand in the way of a removal. Clearing
   material is a real operation (`clearAuthoredMaterial`,
   `removeDurationMaterial` in protocolRemoval.ts) and those paths save
   directly, not through here. The distinction is intent: a removal names the
   field it is emptying; an import simply never mentioned it.

   Asserted in tools/test-protect-authored.ts.
   ============================================================================ */

import type { CatalogProtocol } from '../data/catalog'
import type { ProtocolVersion } from '../types/domain'
import type { DataProvider } from '../data/provider'
import { saveProtocolVerified } from './publish'

/** The fields that hold work nobody can retype: months of Studio sessions,
    imported workbooks, uploaded covers, editorial naming, commercial terms. */
const AUTHORED_KEYS = [
  'plain', 'plainByDuration', 'plainImportedAt',
  'studio', 'studioByDuration',
  'assetMap', 'datasheet', 'spec',
  'coverUrl', 'publicTitle', 'publicBlurb', 'i18n',
  'offer', 'library', 'audience', 'tier', 'claimsGate',
] as const satisfies readonly (keyof CatalogProtocol)[]

/**
 * `incoming`, with everything it left unsaid filled in from `stored`.
 *
 * `stored` undefined (a protocol that does not exist yet) returns `incoming`
 * untouched — there is nothing to protect.
 */
export function preserveAuthored(
  stored: CatalogProtocol | undefined,
  incoming: CatalogProtocol,
): CatalogProtocol {
  if (!stored) return incoming
  const out: CatalogProtocol = { ...incoming }

  for (const k of AUTHORED_KEYS) {
    if (out[k] === undefined && stored[k] !== undefined) {
      ;(out as unknown as Record<string, unknown>)[k] = stored[k]
    }
  }

  /* Tags are an array, so "absent" is also "empty": an importer that knows no
     tags sends [], which would erase the editorial ones. */
  if (!out.tags?.length && stored.tags?.length) out.tags = stored.tags

  out.versions = mergeVersions(stored.versions, incoming.versions)
  return out
}

/**
 * The versions list, keeping the attached audio.
 *
 * A re-import rebuilds `versions` from the document — `[{duration: 6}, ...]`
 * — which drops `audioUrl` and `lengthSeconds` for durations that already had
 * a rendered, published file behind them. People listening to that file would
 * fall back to a synthesized bed, silently. So the incoming list decides WHICH
 * durations exist, and the stored list fills in what each one already had.
 */
function mergeVersions(
  stored: ProtocolVersion[] | undefined,
  incoming: ProtocolVersion[] | undefined,
): ProtocolVersion[] {
  if (!incoming?.length) return stored ?? []
  if (!stored?.length) return incoming
  return incoming.map((v) => {
    const was = stored.find((s) => s.duration === v.duration)
    if (!was) return v
    return {
      ...was,
      ...v,
      lengthSeconds: v.lengthSeconds ?? was.lengthSeconds,
      audioUrl: { ...(was.audioUrl ?? {}), ...(v.audioUrl ?? {}) },
    }
  })
}

/**
 * Save, having first read the row that is there and kept what the caller did
 * not mention.
 *
 * Use this for every write built from something other than the stored row: an
 * import, a parsed document, a draft held in component state since the page
 * loaded. The extra read is one row by primary key, which is what the save
 * already does to confirm itself.
 */
export async function saveProtocolMerged(dp: DataProvider, proto: CatalogProtocol): Promise<CatalogProtocol> {
  let stored: CatalogProtocol | undefined
  try {
    stored = await dp.findProtocol(proto.code)
  } catch {
    /* The row could not be read. Saving now would upsert the incoming object
       whole, which is the exact write this module exists to prevent, so the
       save does not happen and the message says why. */
    throw new Error(
      `Non riesco a rileggere ${proto.code} prima di salvarlo, e salvare senza averlo letto ` +
      `rischia di sovrascrivere le sessioni Studio già presenti. Riprova fra qualche secondo.`,
    )
  }
  return saveProtocolVerified(dp, preserveAuthored(stored, proto))
}
