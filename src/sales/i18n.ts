/* ============================================================================
   The commercial console, in two languages

   These screens were born inside the admin console, which is Italian and only
   Italian by decision — one team, one language, no `t()` anywhere in it. The
   commercial team is not that team, so the console they took five of those
   screens into has to offer Portuguese.

   WHY THE KEY IS ITALIAN HERE, AND ENGLISH EVERYWHERE ELSE

   The project's rule is that the English source string IS the key. It holds
   wherever a screen was written in English and translated outwards. These
   screens were not: their copy was authored in Italian, read and approved in
   Italian, and some of it is legally shaped ("il codice azienda è anche
   l'accesso"). Re-authoring ~290 strings into English to serve as keys would
   mean inventing an English original that never existed, and every one of
   those inventions is a chance to drift the Italian that is already right.

   So the Italian string is the key and this is the one dictionary: Italian in,
   Portuguese out. In Italian `st()` returns the key, which IS the Italian —
   the same way `wt()` in the workspace falls back to its English key. There is
   no third language to keep in step, and the day one is needed the Italian
   keys are a complete, approved source to translate from.

   `st` over `useI18n().t` for the same reason `wt` exists: some of this runs
   outside React (a confirm(), a formatter), and a console with two ways of
   translating would use the wrong one half the time.
   ============================================================================ */

import { currentLocale } from '../i18n'
import { PT_SALES } from '../i18n/sales'

/**
 * Italian in, the interface language out.
 *
 * `vars` fills `{name}`-shaped holes, so a sentence stays one string in both
 * languages instead of being concatenated out of fragments that only line up
 * in one of them.
 */
export function st(key: string, vars?: Record<string, string | number>): string {
  let out = currentLocale() === 'pt-BR' ? (PT_SALES[key] ?? key) : key
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v))
  return out
}
