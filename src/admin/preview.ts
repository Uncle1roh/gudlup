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
  DEMO_APPOINTMENT, DEMO_CHECKINS, DEMO_CLINICIAN, DEMO_PATHWAY, DEMO_PERSON, DEMO_SAVED,
  demoLogs, demoMoodPoints, demoNextSessionAt,
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

/* ---------------------------------------------- the hour they have booked ---

   THE SAME APPOINTMENT THE CLINICIAN'S ROSTER SHOWS. Her side of it is in
   the workspace fixtures and has been all along: "Mariana Alves · next
   session: today 14:00". Mariana's side of it was nowhere — her Terapia tab
   said "no session booked yet", under a card naming the clinician whose
   roster had her down for one. Two screens, one story, and they disagreed
   about the only fact they both print.

   It is written where a booking made in the demo would write it
   (`data/mock.ts`), in the same shape, so the screen cannot tell the seeded
   appointment from one the salesperson books in front of the prospect — and
   so cancelling it in the demo works like cancelling any other.

   WHAT IS DELIBERATELY NOT SEEDED is her acceptance of the clinician's
   informed-consent form. The tab is supposed to show that gate: a session
   is booked, and before the first one there is a document to read. That is
   the product, and it is worth a minute of anybody's demo. */
function seedTherapy(): void {
  const KEY_MINE = 'gl.mock.myappt'
  const KEY_ALL = 'gl.mock.thappts'
  try {
    if (localStorage.getItem(KEY_MINE)) return // a walkthrough in progress
    const startsAtMs = demoNextSessionAt()
    const appt = {
      id: 'ap-demo-1',
      therapistId: DEMO_CLINICIAN.id,
      therapistName: DEMO_CLINICIAN.name,
      patientName: DEMO_PERSON.name,
      profileId: 'me',
      startsAtMs,
      durationMin: DEMO_APPOINTMENT.minutes,
      status: 'booked' as const,
    }
    localStorage.setItem(KEY_MINE, JSON.stringify(appt))
    localStorage.setItem(KEY_ALL, JSON.stringify([appt]))
    /* The slot is taken, so the booking screen cannot offer it twice. */
    localStorage.setItem(`gl.mock.booked.${DEMO_CLINICIAN.id}`, JSON.stringify([startsAtMs]))
  } catch {
    /* private mode: the tab shows an unbooked relationship, which also demos */
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
  /* The booked hour belongs to the WORLD, not to one of its three doors:
     the clinician's roster prints it whichever surface a demo opens on. */
  seedTherapy()
  if (surface === 'app') seedSelfUse()
  if (surface === 'company') seedCompany()
  go(surface)
}

/* ---------------------------------------------- how a demo changes rooms ---

   A DEMO MOVES BY RELOADING, and until now it only said so.

   `window.location.href = '/#therapist'` looks like a navigation and is not
   one: when the path is the same and only the fragment differs, the browser
   changes the URL and leaves the document exactly where it was. Every
   module stays loaded, with everything it had decided.

   That is not a detail here, because three things are decided ONCE per
   document and all three are wrong for the room you have just walked into:

     · `data/provider.tsx` picks mock or Supabase when it mounts;
     · `data/mockLegal.ts` builds its store on first read, as whichever
       persona the hash named AT THAT MOMENT (`demo/world.ts`);
     · the surfaces read `previewing()` as they mount.

   So the demo opened on the app, and then the workspace was still Mariana —
   who has not accepted the Professional Terms, so the clinician's surface
   opened on a wall of them, and the dashboard after it on "Entendi, em nome
   de ...". Both of those gates were supposed to be answered already. Worse
   at the end: leaving the demo went back to the console the same way, so a
   salesperson who had just given one carried the MOCK provider into a
   console with no demo bar on it, where every company they saved went into
   memory and died with the tab.

   Setting the fragment does not reload; reloading the URL it leaves behind
   does. `replaceState` writes the address without a hashchange event — and
   without an entry in the history, so Back still goes where the person
   expects — and the reload that follows is a real one. */
function reloadAt(hash: string): void {
  const url = `${window.location.pathname}${hash}`
  try {
    window.history.replaceState(null, '', url)
  } catch {
    /* A browser that refuses replaceState still has to arrive: the hash
       assignment is the same address by a noisier route. */
    window.location.hash = hash
  }
  window.location.reload()
}

/** Move between surfaces without leaving preview. */
export function go(surface: PreviewSurface): void {
  const to = SURFACES.find((s) => s.id === surface)?.hash ?? ''
  resetDemoLegal()
  if (surface === 'app') { seedSelfUse(); seedTherapy() }
  if (surface === 'company') seedCompany()
  /* A full load, not just a hash change: each surface mounts its own data
     layer, and the provider is chosen when that mounts. */
  reloadAt(to)
}

/** Everything a walkthrough writes, in one list. */
function wipeDemoState(): void {
  try {
    localStorage.removeItem(`gl.selfuse.${PREVIEW_USER_ID}`)
    localStorage.removeItem(`gl.therapy.${PREVIEW_USER_ID}`)
    localStorage.removeItem(`gl.workspace.${PREVIEW_USER_ID}`)
    /* EVERYTHING THE MOCK PROVIDER KEEPS, by prefix rather than by name.
       The named list was the appointment, the avatar, the availability, the
       booked slots — and it was out of date the first time somebody added a
       screen that remembers something. `gl.mock.*` is the demo's own world
       by definition, and a demo starts clean. */
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('gl.mock.')) localStorage.removeItem(k)
    }
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

/** Leave preview and return to the console. Clears what the walkthrough wrote.

    A RELOAD, for the reason above and then some: the console the
    salesperson lands back on must be reading the real database again, and
    the provider only asks which one to be when it mounts. */
export function endPreview(): void {
  clearPreview()
  let back = '#admin'
  try { back = sessionStorage.getItem(FROM) || '#admin' } catch { /* keep the default */ }
  try { sessionStorage.removeItem(FROM) } catch { /* nothing stored */ }
  reloadAt(back)
}

/** Which console the walkthrough was started from — `#admin` or `#sales`.
    The preview bar asks, because the admin console is Italian by rule and
    the commercial one speaks the language of whoever is signed in. */
export function previewFrom(): string {
  try { return sessionStorage.getItem(FROM) || '#admin' } catch { return '#admin' }
}

/** Which surface the current hash is. */
export function currentSurface(hash = window.location.hash): PreviewSurface {
  if (hash === '#admin') return 'admin'
  if (hash === '#therapist' || hash === '#b2b' || hash === '#b2b-legacy') return 'therapist'
  if (hash === '#hr' || hash === '#employer' || hash === '#corporate') return 'company'
  return 'app'
}
