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

import { slotKey, tenantFromConvention, FALLBACK_TENANT } from '../corporate/data'
import { resolveCompanyCode, DEMO_TENANT_CODE } from '../data/convention'
import { PREVIEW_KEY as KEY } from '../demo/flag'
import {
  DEMO_CHECKINS, DEMO_PATHWAY, DEMO_PERSON, DEMO_SAVED, demoLogs, demoMoodPoints,
} from '../demo/world'
import { moodEntryFrom } from '../data/measures'

import { DEMO_COMPANY_KEY } from '../demo/flag'
export { previewing, demoCompanyName, setDemoCompanyName } from '../demo/flag'
export { DEMO_COMPANY_KEY }

/** Set when preview created the company dashboard's local state itself. */
const SEEDED = 'gl.admin.preview.seeded-corporate'
/* The slot the DEMO tenant's dashboard lives in, not Acme's. The demo is one
   story: the person in the app works for this company, so the dashboard the
   walkthrough opens has to be this company's. */
const demoTenant = () => {
  const c = resolveCompanyCode(DEMO_TENANT_CODE)
  return c ? tenantFromConvention(c) : FALLBACK_TENANT
}
const CORPORATE_SLOT = slotKey(demoTenant())

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

/* The Self Use app keyed on preview, so a walkthrough never writes into the
   admin's own Self Use state — or, worse, into the id of whoever is signed in
   on a shared machine. */
export const PREVIEW_USER_ID = 'gl-preview'

/* ---------------------------------------------------------- the person ----

   WHO THE DEMO IS ABOUT. It used to be the salesperson: the app greeted
   "Boa tarde, Comercial" and the profile printed their own e-mail, because
   the seed set a few flags and nothing else. Now it writes Mariana Alves's
   month (`demo/world.ts`) — the same sixteen sessions the wallet is built
   from, her moods, her two check-ins, her pathway.

   THAT IS WHAT MAKES THE NUMBERS AGREE. The Loops pill read 542 while the
   profile read 78 minutes and Minha jornada said "no check-in yet": the
   ledger and the device state were two separate inventions. One list now.

   A walkthrough already in progress is left alone — the salesperson may
   have finished a session in front of the prospect, and re-seeding would
   wipe it mid-sentence. `endPreview` clears it. */
function seedSelfUse(): void {
  const key = `gl.selfuse.${PREVIEW_USER_ID}`
  try {
    if (localStorage.getItem(key)) return // a walkthrough in progress: leave it
    const now = Date.now()
    const day = 86_400_000
    const long = now - 120 * day
    localStorage.setItem(key, JSON.stringify({
      onboardedAt: long,
      tutorialSeenAt: long,
      stereoCheckedAt: now - 1 * day,
      /* The code that resolves to Self Use + Professional Support, so the
         Terapia and Acompanhamento tabs are open — which is the half the
         commercial team came to show. */
      companyCode: DEMO_TENANT_CODE,
      /* Answered, so a walkthrough opens on the library rather than on the
         "how should the audio address you" question. The setting itself is
         in Perfil → Preferências, which is where sales should show it. */
      addressedAs: DEMO_PERSON.addressedAs,
      consents: {
        termsAt: long, usageAt: long, measurementAt: long,
        aggregate: true, aggregateAt: long,
        notifications: true, notificationsAt: long,
        therapistBridge: true, therapistBridgeAt: long,
      },
      logs: demoLogs(now),
      moods: demoMoodPoints().map((m) =>
        moodEntryFrom({ valence: m.valence, arousal: m.arousal }, now - m.ago * day)),
      glChecks: DEMO_CHECKINS.map((c) => ({ at: now - c.ago * day, scores: c.scores })),
      pathway: {
        id: DEMO_PATHWAY.id,
        startedAt: now - DEMO_PATHWAY.startedAgo * day,
        done: DEMO_PATHWAY.done,
      },
      saved: DEMO_SAVED,
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

/* The legal store is the one piece of demo state that belongs to the DOOR
   rather than to the demo: the app is Mariana, the workspace is her
   clinician, the dashboard is her company's HR, and each of them has
   accepted different documents (`demo/world.ts`). Dropping it on every move
   makes the next surface rebuild it as the right person — which is what
   stops all three opening on a consent screen in front of a prospect. */
function resetDemoLegal(): void {
  try { localStorage.removeItem('gl.mock.legal') } catch { /* nothing stored */ }
}

/** Turn preview on and go to a surface.

    A DEMO STARTS CLEAN. Whatever a demo an hour ago left behind — a
    half-finished session, a benefit redeemed in front of another client, a
    company name from another pitch — is cleared here, because the one thing
    a salesperson cannot do is discover the state of the app while presenting
    it. Moving BETWEEN surfaces (`go`) keeps everything: there the state is
    the demo being given. */
export function openPreview(surface: PreviewSurface, from = window.location.hash || '#admin'): void {
  wipeDemoState()
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
  resetDemoLegal()
  if (surface === 'app') seedSelfUse()
  if (surface === 'company') seedCompany()
  /* A full load, not just a hash change: each surface mounts its own data
     layer, and the provider is chosen when that mounts. */
  window.location.href = `${window.location.pathname}${to}`
}

/** Everything a walkthrough writes, in one list. */
function wipeDemoState(): void {
  try {
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
  resetDemoLegal()
}

/** Drop the flag and everything a walkthrough wrote, without navigating. */
export function clearPreview(): void {
  try { sessionStorage.removeItem(KEY) } catch { /* nothing stored */ }
  try { sessionStorage.removeItem(DEMO_COMPANY_KEY) } catch { /* nothing stored */ }
  wipeDemoState()
}

/** Leave preview and return to the console. Clears what the walkthrough wrote. */
export function endPreview(): void {
  clearPreview()
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
