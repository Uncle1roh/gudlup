/* ============================================================================
   Therapist Workspace — translation for code that has no hook

   Helpers that format a cell (`fmtWhen`, `versionShort`) and the PDF builder
   run outside React, so they cannot call `useI18n`. They read the interface
   locale the same way `fmtDate` does (`currentLocale()`), and look the English
   key up in the workspace dictionary. Every key used through `wt` therefore
   lives in src/i18n/workspace.ts.
   ============================================================================ */

import { currentLocale } from '../i18n'
import { IT_WORKSPACE, PT_WORKSPACE } from '../i18n/workspace'

export function wt(key: string, vars?: Record<string, string | number>): string {
  const locale = currentLocale()
  const dict = locale === 'it' ? IT_WORKSPACE : locale === 'pt-BR' ? PT_WORKSPACE : null
  let out = (dict && dict[key]) ?? key
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v))
  return out
}

/** The DISPLAY name of a note tag. The stored tag stays English ("General",
    "Session #8") — it is also the key the session report files its note
    under — and is translated only where it is printed. */
export function noteTagLabel(tag: string): string {
  const m = /^Session #(\d+)$/.exec(tag)
  if (m) return wt('Session #{n}', { n: m[1] })
  return tag === 'General' ? wt('General') : tag
}
