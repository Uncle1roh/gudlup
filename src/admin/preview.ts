/* ============================================================================
   Preview — an admin walking through the other apps

   Sales has to be able to show the whole product from one login: the app a
   person listens in, the clinician's workspace, the company dashboard. Three
   accounts and three sign-ins is not a demo, it is an apology.

   So an admin can open any surface from the admin console. What they see there
   is the DEMO DATA — the same in-memory fixtures the app runs on with no
   backend configured — and not the live database. That is the whole design,
   for two reasons:

     · Nothing can be scrambled. Every write in preview lands in the mock
       provider's memory and is gone on reload. No real patient, clinician,
       company or appointment is touched, because the real data layer is not
       connected while preview is on.

     · Nobody's record is read. An admin opening the workspace against live
       data would be reading somebody's clinical notes to demonstrate a
       layout. Being able to is not the same as being allowed to; the mock
       removes the question.

   The flag lives in sessionStorage, so it belongs to ONE TAB: the admin's
   other tab, and every other person's browser, are unaffected, and closing
   the tab ends it. Nothing here does anything at all unless the signed-in
   account is an admin — `previewing()` is checked against the real role
   everywhere it matters.
   ============================================================================ */

export type PreviewSurface = 'app' | 'therapist' | 'company' | 'admin'

const KEY = 'gl.admin.preview'
/** Set when preview created the company dashboard's local state itself. */
import { FALLBACK_TENANT, slotKey } from '../corporate/data'

const SEEDED = 'gl.admin.preview.seeded-corporate'
const CORPORATE_SLOT = slotKey(FALLBACK_TENANT)

/** Where each surface lives, and what to call it in the bar. */
export const SURFACES: { id: PreviewSurface; hash: string; label: string }[] = [
  { id: 'admin', hash: '#admin', label: 'Admin' },
  /* Named for WHO is on the other side, not for what the codebase calls
     the folder. "App" and "Azienda" told a salesperson nothing about which
     of three products they were about to show. */
  { id: 'app', hash: '', label: 'Utente' },
  { id: 'therapist', hash: '#therapist', label: 'Terapeuta' },
  { id: 'company', hash: '#hr', label: 'Impresa' },
]

/* The Sound Studio is deliberately NOT here. An admin already reaches it
   normally, and it is the one surface that writes audio into real storage
   while its protocol rows would be going to the mock — a publish from inside
   a preview would leave a file with no record pointing at it. It is shown on
   real data or not at all. */

export function previewing(): boolean {
  try {
    return sessionStorage.getItem(KEY) === 'on'
  } catch {
    return false // private mode: preview simply never turns on
  }
}

/* The Self Use app keyed on preview, so a walkthrough never writes into the
   admin's own Self Use state — or, worse, into the id of whoever is signed in
   on a shared machine. */
export const PREVIEW_USER_ID = 'gl-preview'

/** The state the app needs to open on the library rather than on the wizard. */
function seedSelfUse(): void {
  const key = `gl.selfuse.${PREVIEW_USER_ID}`
  try {
    if (localStorage.getItem(key)) return // a walkthrough in progress: leave it
    const day = 86_400_000
    localStorage.setItem(key, JSON.stringify({
      version: 4,
      onboardedAt: Date.now() - 30 * day,
      tutorialSeenAt: Date.now() - 30 * day,
      stereoCheckedAt: Date.now() - 30 * day,
      /* The code that resolves to Self Use + Professional Support, so the
         Terapeuta tab is open — which is the half sales came to show. */
      companyCode: 'DEMO-2026-GL',
      /* Answered, so a walkthrough opens on the library rather than on the
         "how should the audio address you" question. The setting itself is
         in Profilo → Preferenze, which is where sales should show it. */
      addressedAs: 'f',
      consents: { termsAt: Date.now() - 30 * day, usageAt: Date.now() - 30 * day, measurementAt: Date.now() - 30 * day },
    }))
  } catch {
    /* private mode: the walkthrough starts at the wizard, which still demos */
  }
}

/* The company dashboard opens on a five-step setup wizard until somebody has
   finished it. That is right for a real tenant and wrong for a walkthrough,
   which came to see the figures — so the preview starts past it. Cleared on
   exit with everything else. */
function seedCompany(): void {
  try {
    /* The dashboard keeps one slot per tenant (corporate/data.ts slotKey);
       the preview's company is the demo tenant, Acme. */
    if (localStorage.getItem(CORPORATE_SLOT)) return
    localStorage.setItem(CORPORATE_SLOT, JSON.stringify({ setupDoneAt: Date.now() - 86_400_000 }))
    /* Marked as ours. The dashboard's state is shared with a real HR account
       signing in on this same browser, so leaving preview removes it only if
       preview is what created it. */
    localStorage.setItem(SEEDED, '1')
  } catch {
    /* private mode: the walkthrough starts at the wizard, which still demos */
  }
}

/** Where the walkthrough was started from, so it can be ended there.
    It used to be `#admin` always — which bounced a commercial account off
    the admin door and back to its own console by accident rather than by
    design. */
const FROM = 'gl.admin.preview.from'

/** Turn preview on and go to a surface. */
export function openPreview(surface: PreviewSurface, from = window.location.hash || '#admin'): void {
  try {
    sessionStorage.setItem(KEY, 'on')
    sessionStorage.setItem(FROM, from)
  } catch {
    /* nothing to do: without storage the gate below will not let us through */
  }
  if (surface === 'app') seedSelfUse()
  if (surface === 'company') seedCompany()
  go(surface)
}

/** Move between surfaces without leaving preview. */
export function go(surface: PreviewSurface): void {
  const to = SURFACES.find((s) => s.id === surface)?.hash ?? ''
  if (surface === 'app') seedSelfUse()
  if (surface === 'company') seedCompany()
  /* A full load, not just a hash change: each surface mounts its own data
     layer, and the provider is chosen when that mounts. */
  window.location.href = `${window.location.pathname}${to}`
}

/** Drop the flag and everything a walkthrough wrote, without navigating. */
export function clearPreview(): void {
  try {
    sessionStorage.removeItem(KEY)
    localStorage.removeItem(`gl.selfuse.${PREVIEW_USER_ID}`)
    localStorage.removeItem(`gl.therapy.${PREVIEW_USER_ID}`)
    localStorage.removeItem(`gl.workspace.${PREVIEW_USER_ID}`)
    if (localStorage.getItem(SEEDED)) {
      localStorage.removeItem(CORPORATE_SLOT)
      localStorage.removeItem(SEEDED)
    }
  } catch {
    /* nothing stored, nothing to clear */
  }
}

/** Leave preview and return to the console. Clears what the walkthrough wrote. */
export function endPreview(): void {
  try {
    sessionStorage.removeItem(KEY)
    localStorage.removeItem(`gl.selfuse.${PREVIEW_USER_ID}`)
    localStorage.removeItem(`gl.therapy.${PREVIEW_USER_ID}`)
    localStorage.removeItem(`gl.workspace.${PREVIEW_USER_ID}`)
    if (localStorage.getItem(SEEDED)) {
      localStorage.removeItem(CORPORATE_SLOT)
      localStorage.removeItem(SEEDED)
    }
  } catch {
    /* nothing stored, nothing to clear */
  }
  let back = '#admin'
  try { back = sessionStorage.getItem(FROM) || '#admin' } catch { /* keep the default */ }
  try { sessionStorage.removeItem(FROM) } catch { /* nothing stored */ }
  window.location.href = `${window.location.pathname}${back}`
}

/** Which surface the current hash is. */
export function currentSurface(hash = window.location.hash): PreviewSurface {
  if (hash === '#admin') return 'admin'
  if (hash === '#therapist' || hash === '#b2b' || hash === '#b2b-legacy') return 'therapist'
  if (hash === '#hr' || hash === '#employer' || hash === '#corporate') return 'company'
  return 'app'
}
