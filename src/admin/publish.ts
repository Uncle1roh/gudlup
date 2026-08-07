/* ============================================================================
   Good Loop — protocol persistence helpers

   Saving a protocol used to be fire-and-forget: the catalog write was issued,
   the runtime registry was updated, and the screen showed the protocol as
   published. If the write never landed — the common case being an account that
   is not a catalog admin, which row-level security rejects — nothing said so,
   and the protocol simply vanished on the next screen change.

   saveProtocolVerified() reads the protocol back after writing and fails loudly
   when it is not there.
   ============================================================================ */

import { registerProtocol } from '../data/protocols'
import { hasSupabaseEnv } from '../auth/supabaseClient'
import type { CatalogProtocol } from '../data/catalog'
import type { DataProvider } from '../data/provider'

/** Warning to append to any "saved" message when the catalog is the in-memory
    demo store: the write is real, but only until the page is reloaded. */
export function persistenceNote(): string | null {
  return hasSupabaseEnv()
    ? null
    : ' ⚠ Nessun database collegato: il catalogo vive in memoria e si azzera al ricaricamento della pagina.'
}

/** Human-readable cause for a save that did not stick. */
export function explainSaveFailure(msg: string): string {
  if (/row-level security|RLS|permission|policy|42501/i.test(msg)) {
    return 'Il catalogo accetta scritture solo da un account amministratore. Esci e accedi come admin, poi ripubblica.'
  }
  if (/schema cache|column .* does not exist|PGRST204|42703/i.test(msg)) {
    return 'Lo schema del database è più vecchio dell’app — esegui di nuovo supabase/setup.sql, poi riprova.'
  }
  return msg
}

/**
 * Write a protocol to the catalog and CONFIRM it is readable back.
 * Returns the stored protocol. Throws with an explanation when the write did
 * not persist, so the UI can never show a phantom "published".
 */
export async function saveProtocolVerified(dp: DataProvider, proto: CatalogProtocol): Promise<CatalogProtocol> {
  try {
    await dp.saveProtocol(proto)
  } catch (e) {
    throw new Error(explainSaveFailure((e as Error).message))
  }
  let stored: CatalogProtocol | undefined
  try {
    stored = (await dp.listProtocols()).find((p) => p.code === proto.code)
  } catch (e) {
    throw new Error(`Salvato, ma la rilettura del catalogo è fallita: ${(e as Error).message}`)
  }
  if (!stored) {
    throw new Error(
      `"${proto.code}" non risulta nel catalogo dopo il salvataggio. ` +
      explainSaveFailure('row-level security'),
    )
  }
  registerProtocol(stored)
  return stored
}
