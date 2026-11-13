/* ============================================================================
   Why a write was refused

   The console's screens write through PostgREST, which answers failures in
   error codes and in English sentences about policies. Those reached the
   person as nothing at all: a `await dp.save…()` with no catch around it
   threw into an unhandled rejection, the busy flag stayed set, and the button
   went dead with no word on screen. "I cannot create a company" had no
   visible cause anywhere.

   Three failures actually happen here, and they need three different acts
   from the person reading: the account may not write (call whoever owns the
   roles), the environment is behind on its migrations (call the developer),
   or the row is already there (change the field). Everything else is passed
   through as it came — a message nobody wrote for a human is still better
   than silence.
   ============================================================================ */

import { st } from '../sales/i18n'

/**
 * Why the database refused a write, in words the person at the screen can do
 * something about.
 *
 * PostgREST answers in codes and in English sentences about policies, and the
 * three that actually happen here have three different answers: the account
 * is not one that may create companies, the environment is behind on its
 * migrations, or the code is already somebody's. Anything else is passed
 * through as it came -- a message nobody wrote is still better than silence.
 */
export function explainWriteError(e: unknown): string {
  const err = (e ?? {}) as { code?: string; message?: string; details?: string }
  const code = err.code ?? ''
  const msg = err.message ?? String(e)
  if (code === '42501' || /row-level security|permission denied/i.test(msg)) {
    return st('Il database ha rifiutato la scrittura: questo account non ha il permesso di creare aziende. Serve un profilo con ruolo admin o sales.')
  }
  if (code === 'PGRST204' || /schema cache|column .* does not exist/i.test(msg)) {
    return st('Manca una colonna nella tabella «companies»: {err}. Su questo ambiente non \u00e8 stata eseguita una migrazione (16-sales-role.sql).', { err: msg })
  }
  if (code === '23505') return st('Esiste gi\u00e0 un\u2019azienda con questo codice.')
  if (!msg || msg === 'undefined') return st('Il database non ha accettato la scrittura e non ha detto perch\u00e9.')
  return st('Azienda non creata: {err}', { err: msg })
}
