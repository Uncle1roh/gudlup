/* ============================================================================
   Is a demo being given right now?

   This module exists to be imported from ANYWHERE without dragging anything
   behind it. It has no imports of its own, on purpose: `app/environment.ts`
   asks this question, and `admin/preview.ts` — where the answer used to live
   alone — pulls in the corporate dashboard's tenant table, which pulls in the
   company registry, which would make a cycle out of a boolean.

   The flag is in sessionStorage, so it belongs to ONE TAB: the salesperson's
   other tab, and every other person's browser, are unaffected, and closing
   the tab ends it. Turning it on is only reachable from a console
   (`admin/ConsoleShell.tsx`), which only an admin or a commercial account
   can open.
   ============================================================================ */

export const PREVIEW_KEY = 'gl.admin.preview'

/** The name of the company the salesperson is presenting to, typed before
    the demo starts. Same scope as the flag: one tab, gone when it closes. */
export const DEMO_COMPANY_KEY = 'gl.demo.company'

export function previewing(): boolean {
  try {
    return sessionStorage.getItem(PREVIEW_KEY) === 'on'
  } catch {
    return false // private mode: a demo simply never starts
  }
}

/**
 * The company the demo's person works for.
 *
 * A demo is worth more with the prospect's own name on the screen than with
 * an invented one, so the console asks for it before opening a surface and
 * every screen that prints a company name reads it from here. Empty — or
 * outside a demo — gives the invented one, because a dashboard headed by a
 * blank is worse than a dashboard headed by a stranger.
 */
export const DEMO_COMPANY_FALLBACK = 'Aurora Tech'

export function demoCompanyName(): string {
  if (!previewing()) return DEMO_COMPANY_FALLBACK
  try {
    const typed = (sessionStorage.getItem(DEMO_COMPANY_KEY) ?? '').trim()
    return typed || DEMO_COMPANY_FALLBACK
  } catch {
    return DEMO_COMPANY_FALLBACK
  }
}

export function setDemoCompanyName(name: string): void {
  try {
    const clean = name.trim()
    if (clean) sessionStorage.setItem(DEMO_COMPANY_KEY, clean)
    else sessionStorage.removeItem(DEMO_COMPANY_KEY)
  } catch {
    /* private mode: the demo runs with the invented name */
  }
}
