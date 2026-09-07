/* Render smoke test for the three wireframe surfaces.

   `tsc` proves the types line up and `vite build` proves the bundle links, but
   neither one ever CALLS a component. This does: it server-renders each screen
   to a string, so a bad hook order, a null dereference in a selector or a
   template that reads a field that is not there fails here rather than in
   front of a PO.

   Each surface is rendered in the states that matter — the empty one a new
   account actually sees, and the populated one the demo data produces — since
   most render crashes live in the empty case.

   Run: npx esbuild tools/test-render-surfaces.tsx --bundle --platform=node \
          --format=esm --jsx=automatic --outfile=<tmp>/render.mjs \
        && node <tmp>/render.mjs                                             */

import { renderToString } from 'react-dom/server'
import type { ReactElement } from 'react'

import { I18nProvider } from '../src/i18n'
import { DataLayerProvider } from '../src/data/provider'
import { LiveCatalogProvider, resolveCatalog } from '../src/data/liveCatalog'
import { seedCatalog } from '../src/data/catalog'
import { Onboarding } from '../src/selfuse/Onboarding'
import { Home } from '../src/selfuse/Home'
import { Explore } from '../src/selfuse/Explore'
import { Catalog } from '../src/selfuse/Catalog'
import { coverFor, coverSvg } from '../src/selfuse/artwork'
import { ProgressTab, GuidedProgress } from '../src/selfuse/ProgressTab'
import { ProfileTab } from '../src/selfuse/ProfileTab'
import { TherapistTab } from '../src/selfuse/TherapistTab'
import { GlCheckFlow, Who5Flow, DailyMoodFlow } from '../src/selfuse/Measures'
import { SafetyLevel1, SafetyLevel2, SafetyLevel3 } from '../src/selfuse/Safety'
import { emptyTherapy, seedLink, DEMO_THERAPISTS, vasDelta, VAS_DELTA_RANGE } from '../src/selfuse/therapyStore'
import { Assessment } from '../src/selfuse/Assessment'
import { SessionFlow } from '../src/selfuse/Session'
import { send as sendAssessment, complete as completeAssessment } from '../src/data/assessmentStore'
import { DASS21, BRS, type Responses } from '../src/data/assessments'
import { emptyState, type SelfUseState } from '../src/data/selfUseStore'
import { resolveCompanyCode } from '../src/data/convention'

import { SetupWizard } from '../src/corporate/Setup'
import { Overview, Engagement, Wellbeing, Reports } from '../src/corporate/Screens'
import { Management } from '../src/corporate/Management'
import { Settings as CorporateSettings } from '../src/corporate/Settings'
import { buildAggregates, defaultState } from '../src/corporate/data'

import { PlainImport } from '../src/admin/PlainImport'
import { TherapistOnboarding } from '../src/workspace/Onboarding'
import { Roster, PatientCard } from '../src/workspace/Patients'
import { Calendar } from '../src/workspace/Calendar'
import { LiveSession } from '../src/workspace/LiveSession'
import { SessionReport } from '../src/workspace/Report'
import { Messages, Prescriptions, ReportsArchive, Performance, WorkspaceSettings } from '../src/workspace/Tools'
import { demoWorkspace, emptyWorkspace } from '../src/workspace/data'

/* Server rendering touches localStorage through the stores, and Node has none.
   A tiny in-memory shim is enough — the point of this harness is the render,
   not the persistence, and the stores are already written to survive a
   storage that refuses to answer. */
const mem = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v) },
  removeItem: (k: string) => { mem.delete(k) },
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size },
} as Storage
/* Node supplies its own `navigator`; the workspace settings screen reads
   `navigator.platform`, which is undefined there and already falls back. */

/* Screens now read the live catalog and the data provider. Rendering them
   inside both providers is what production does, and passing a RESOLVED
   catalog rather than waiting on a round-trip means the assertions below run
   against real material instead of a loading state. */
const CATALOG = resolveCatalog(seedCatalog(), 'en')
const EMPTY = resolveCatalog([], 'en')

function shell(el: ReactElement): ReactElement {
  return (
    <I18nProvider>
      <DataLayerProvider>
        <LiveCatalogProvider value={CATALOG}>{el}</LiveCatalogProvider>
      </DataLayerProvider>
    </I18nProvider>
  )
}

let passed = 0
function renders(name: string, el: ReactElement) {
  try {
    const html = renderToString(shell(el))
    if (!html || html.length < 20) {
      console.error(`FAIL: ${name} rendered almost nothing (${html.length} chars)`)
      process.exitCode = 1
      return
    }
    passed += 1
    console.log(`ok  : ${name} (${html.length} chars)`)
  } catch (e) {
    console.error(`FAIL: ${name} — ${(e as Error).message}`)
    process.exitCode = 1
  }
}

/** Assert a rendered surface does NOT contain a string. */
function absent(name: string, el: ReactElement, needle: string) {
  try {
    const html = renderToString(shell(el))
    if (html.includes(needle)) {
      console.error(`FAIL: ${name} leaked "${needle}"`)
      process.exitCode = 1
      return
    }
    passed += 1
    console.log(`ok  : ${name} never prints "${needle}"`)
  } catch (e) {
    console.error(`FAIL: ${name} — ${(e as Error).message}`)
    process.exitCode = 1
  }
}

const noop = () => {}

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else { passed += 1; console.log(`ok  : ${msg}`) }
}

/* ------------------------------------------------------------- Self Use -- */
console.log('\n--- Self Use ---')

renders('ON-1…7 Onboarding', <Onboarding onComplete={noop} />)

const fresh = emptyState()
const populated: SelfUseState = {
  ...fresh,
  onboardedAt: Date.now(),
  companyCode: 'ACME-2026',
  pathway: { id: 'stress-management', startedAt: Date.now(), done: { 1: 2 } },
  logs: [
    { at: Date.now() - 86_400_000, slug: 'calm-safety', duration: 12, pathwayWeek: 1 },
    { at: Date.now(), slug: 'demand-management', duration: 6, pathwayWeek: 1 },
  ],
  glChecks: [
    { at: Date.now() - 8 * 86_400_000, scores: { energy: 3, focus: 3, sleep: 3, balance: 3, motivation: 3 } },
    { at: Date.now(), scores: { energy: 4, focus: 3, sleep: 2, balance: 3, motivation: 4 } },
  ],
  who5: [{ at: Date.now() - 30 * 86_400_000, items: [3, 3, 3, 3, 3] }, { at: Date.now(), items: [4, 3, 4, 3, 4] }],
  moods: [{ at: Date.now(), day: '2026-08-25', level: 4 }],
  consents: { ...fresh.consents, usageAt: Date.now(), measurementAt: Date.now() },
}

const homeProps = {
  name: 'Sofia', logs: [], weekLogs: [], hasNotifications: false,
  onStart: noop, onExplore: noop, onAllSessions: noop, onHistory: noop, onNotifications: noop,
}
renders('HOME · C  no pathway', <Home {...homeProps} pathway={null} />)
renders('HOME · A  pathway active', <Home {...homeProps} pathway={populated.pathway} logs={populated.logs} weekLogs={[]} />)
renders('HOME · B  done today', <Home {...homeProps} pathway={populated.pathway} logs={populated.logs} weekLogs={populated.logs} />)
renders('HOME · D  pathway complete', <Home {...homeProps} pathway={{ ...populated.pathway!, completedAt: Date.now() }} />)

/* Explore IS the home screen now — one library holding the rails, the
   pathways rail and the continue card. The `initialTab` prop went with the
   tab it selected; it lingered here for a while because tools/ is outside the
   tsconfig include and never type-checked. */
renders('HOME · library, no pathway', <Explore pathway={null} completed={[]} onStartPathway={noop} onStart={noop} />)
renders('HOME · library, pathway running', <Explore pathway={populated.pathway} completed={['focus-performance']} onStartPathway={noop} onStart={noop} />)

const homeHtml = renderToString(shell(<Explore pathway={null} completed={[]} onStartPathway={noop} onStart={noop} />))
/* Asserted on the class, not the copy: this renders in the default locale
   and "Pathways" is "Percorsi" there. */
assert(homeHtml.includes('pw-rail'), 'the library carries a Pathways rail')
assert(homeHtml.includes('pw-big'), 'and the pathways are big buttons, not cover cards')
assert(!homeHtml.includes('role="tablist"'), 'and there is no tab bar to switch modes with')
const homeRunning = renderToString(
  shell(<Explore pathway={populated.pathway} completed={[]} onStartPathway={noop} onStart={noop} />),
)
assert(homeRunning.includes('pw-continue'), 'a running pathway puts its continue card above the rails')
assert(!homeHtml.includes('pw-continue'), 'and there is no continue card when nothing is running')

/* The catalog replaced the wireframe's vertical list. It has to render its
   hero, its rails and its cards — and still work with nothing published. */
renders('CATALOG rails', <Catalog catalog={CATALOG} onOpen={noop} onQuickStart={noop} />)
renders('CATALOG with a pathway hero', <Catalog catalog={CATALOG} featuredSlug="calm-safety" onOpen={noop} onQuickStart={noop} />)
renders('CATALOG empty library', <Catalog catalog={EMPTY} onOpen={noop} onQuickStart={noop} />)

const progressProps = {
  therapy: emptyTherapy(),
  onGlCheck: noop, onWho5: noop, onMood: noop, onGoTherapist: noop,
  onExportSelfUse: noop, onExportTherapy: noop,
}
renders('PRG-1 Self Use, empty', <ProgressTab {...progressProps} state={fresh} />)
renders('PRG-1 Self Use, populated', <ProgressTab {...progressProps} state={populated} />)
renders('PRG-2 Therapist Guided', <ProgressTab {...progressProps} state={populated} therapy={{ link: seedLink(DEMO_THERAPISTS[0]), request: null }} />)

const profileProps = {
  name: 'Sofia Marchetti', email: 'sofia.m@company.com',
  convention: resolveCompanyCode('ACME-2026'), hasTherapist: false,
  update: noop, onLogout: noop, onDeleteAccount: noop, onExport: noop,
}
renders('PRO-1 Profile', <ProfileTab {...profileProps} state={populated} />)
renders('PRO-1 Profile, no company', <ProfileTab {...profileProps} convention={null} state={fresh} />)

const therapistProps = {
  update: noop, appointment: null, onAppointmentChanged: noop,
  onGoSelfUse: noop, onStartPrescription: noop, onJoinCall: noop,
}
renders('THR · B  no convention', <TherapistTab {...therapistProps} hasConvention={false} therapy={emptyTherapy()} />)
renders('THR · A  no therapist', <TherapistTab {...therapistProps} hasConvention therapy={emptyTherapy()} />)
renders('THR · A2 pending', <TherapistTab {...therapistProps} hasConvention therapy={{ link: null, request: { therapistId: 'th-silva', therapistName: 'Dr. Ana Silva', therapistRole: 'Clinical Psychologist', slotMs: Date.now() + 86_400_000, sentAt: Date.now() } }} />)
/* --- the session VAS -------------------------------------------------------
   Confirmed spec: one tap before every session and one after, both mandatory.
   The pre screen is where the first tap lives, and "Begin Session" does not
   open until it is made. */
const vasSession = CATALOG.sessions[0]
renders('SES-1 pre-session', <SessionFlow session={vasSession} duration={12} needsStereoCheck={false} onStereoChecked={noop} onDone={noop} onCancel={noop} onNeedSupport={noop} />)
const preHtml = renderToString(shell(<SessionFlow session={vasSession} duration={12} needsStereoCheck={false} onStereoChecked={noop} onDone={noop} onCancel={noop} onNeedSupport={noop} />))
assert(preHtml.includes('vas-row'), 'the pre-session screen asks for a VAS reading')
assert((preHtml.match(/class="vas-opt"/g) ?? []).length === 5, 'five anchors, one tap')
assert(preHtml.includes('disabled=""'), 'and the Begin button is closed until one is tapped')
assert(
  !/VAS|1–5|scale/i.test(preHtml.replace(/<[^>]+>/g, ' ')),
  'the person is never shown the instrument name or its numbers — only faces',
)
assert(!/>[1-5]</.test(preHtml.replace(/<span aria-hidden="true">[^<]*<\/span>/g, '')), 'no numeric value is printed beside a face')

/* --- the assessment runner -------------------------------------------------
   The one screen where a patient answers a clinical instrument. Two things
   must hold on it: the item text is the published English, and the person is
   never shown a score. */
const sent = sendAssessment([], 'me', 'DASS21', 'T0', 'Dr. Ana Silva', 1_700_000_000_000)
const asmtRecord = sent[0]
renders('ASMT · DASS-21 first item', <Assessment record={asmtRecord} onSaveProgress={noop} onSubmit={noop} onClose={noop} />)

const asmtHtml = renderToString(shell(<Assessment record={asmtRecord} therapistName="Dr. Ana Silva" onSaveProgress={noop} onSubmit={noop} onClose={noop} />))
assert(asmtHtml.includes('I found it hard to wind down'), 'the runner prints the published item text')
assert(asmtHtml.includes('lang="en"'), 'and marks it English, since a translated DASS-21 is a different instrument')
/* The chrome is localized — Italian by default — so the counter is asserted
   on its numbers, not on English copy. */
const counter = (h: string) => h.match(/class="msr__count">([^<]*)</)?.[1] ?? ''
assert(/1\D+21/.test(counter(asmtHtml)), 'it says how far through 21 items you are')
assert(
  !/mild|moderate|severe|cut-?off|diagnos/i.test(asmtHtml.replace(/<[^>]+>/g, ' ')),
  'the runner shows no severity language',
)

/* A half-finished record resumes at the first unanswered item, not at item 1. */
const partway = { ...asmtRecord, responses: [1, 2, 3, 4].map((i) => ({ itemIndex: i, value: 1 })), status: 'in_progress' as const }
const resumedHtml = renderToString(shell(<Assessment record={partway} onSaveProgress={noop} onSubmit={noop} onClose={noop} />))
assert(/5\D+21/.test(counter(resumedHtml)), 'resuming lands on the first unanswered item')

/* A COMPLETED record must still render without ever printing its score — the
   number belongs on the therapist's side, beside the history that reads it. */
const brsAnswers: Responses = {}
for (const i of BRS.items) brsAnswers[i.index] = 5
const brsSent = sendAssessment([], 'me', 'BRS', 'T0', 'th', 1_700_000_000_000)
const brsDone = completeAssessment(brsSent, brsSent[0].id, brsAnswers, 1_700_000_000_000)[0]
const doneHtml = renderToString(shell(<Assessment record={brsDone} therapistName="Dr. Ana Silva" onSaveProgress={noop} onSubmit={noop} onClose={noop} />))
assert(brsDone.scores?.kind === 'BRS' && brsDone.scores.mean === 3, 'all-Agree on the BRS is 3, not 5 — reverse scoring is live in the store')
/* A score readout always carries its range. None of the four appear on the
   patient's side at all — that is the whole rule, in one assertion. */
assert(
  !/0–42|0–40|1–5|0–100/.test(doneHtml.replace(/<[^>]+>/g, ' ')),
  'and the patient screen prints no score range, so no score',
)

/* VAS has no patient-facing widget. Handed one anyway, the runner says who
   records it rather than inventing a scale. */
const vasHtml = renderToString(shell(<Assessment record={{ ...asmtRecord, instrumentId: 'VAS' }} onSaveProgress={noop} onSubmit={noop} onClose={noop} />))
assert(/terapeut|therapist/i.test(vasHtml), 'a VAS record shows who records it, never a scale the patient taps')
assert(!vasHtml.includes('who5-opt'), 'and offers no options')

const asmtItems = DASS21.items.length
assert(asmtItems === 21, 'the runner is walking all 21 DASS-21 items')

/* --- the protocol workscreen opens for EVERY protocol ----------------------
   A protocol with no PLAIN timeline used to divert the row to a card editor,
   so the five actions — the only place Importa Excel lives — were unreachable
   for exactly the protocols that had nothing imported yet. */
const emptyPlain = { code: 'GL-ANX 1.1', title: 'Safety and Calm', versions: [], affirmations: [], issues: [] }
const wsHtml = renderToString(
  shell(
    <PlainImport
      timeline={emptyPlain}
      fileName="catalog · GL-ANX 1.1"
      actor="admin"
      onCancel={noop}
      onDone={noop}
    />,
  ),
)
assert(wsHtml.includes('Importa Excel'), 'the workscreen opens with no timeline at all')
/* One button per action; `adm-plain__actions` is the div around them and
   `adm-plain__act-ico` the glyph inside each, so the count is taken from the
   button tags themselves. */
const actButtons = wsHtml.match(/<button[^>]*class="adm-plain__act[^>]*>/g) ?? []
assert(actButtons.length === 5, 'and shows all five actions')
assert(wsHtml.includes('Modifica nello Studio') && wsHtml.includes('Pubblica'), 'Studio and Pubblica among them')
assert(wsHtml.includes('GL-ANX 1.1'), 'headed by the protocol it belongs to')

/* With no Excel for this duration, what stays open is what does not need one.
   Counting disabled buttons hid WHICH — so each is named. */
const actionState = (label: string): 'open' | 'closed' | 'absent' => {
  const parts = wsHtml.split('<button').slice(1).map((p) => `<button${p.split('</button>')[0]}`)
  /* Matched on the VISIBLE label, with the tags stripped. Searching the raw
     HTML matched a `title` attribute instead — the upload button's tooltip
     mentions Pubblica — and the answer was about the wrong button. */
  const btn = parts.find((p) => p.replace(/<[^>]*>/g, ' ').includes(label))
  if (!btn) return 'absent'
  return btn.includes('disabled') ? 'closed' : 'open'
}
assert(actionState('Modifica nello Studio') === 'closed', 'the Studio needs a timeline to open')
assert(actionState('Scarica') === 'closed', 'and a render needs one to render from')
assert(actionState('Pubblica') === 'closed', 'and Pubblica is closed while there is neither sheet nor file')
assert(actionState('Importa Excel') === 'open', 'importing a sheet is always available')
/* The audio and the Excel are separate material: a finished file can be
   attached to a time signature that has no workbook, which is how a demo
   protocol is made. Requiring a sheet to accept a file was a rule this screen
   enforced and the data model never had. */
assert(actionState('Carica audio') === 'open', 'and so is uploading a finished audio')
assert(!actButtons[0].includes('disabled'), 'Importa Excel stays open — it is the way out')
assert(/Nessun Excel importato/.test(wsHtml), 'and the screen says why, in the open rather than in a tooltip')
assert(/Importa Excel/.test(wsHtml), 'naming the action that fixes it')

/* --- every time signature is visible, even the ones with no sheet ---------
   A protocol whose 6-minute PLAIN sheet was imported showed one chip, or none,
   with nothing to say that 12 and 24 existed — the screen read as though the
   protocol were six-minute-only. */
function plainWith(durations: number[]) {
  return {
    code: 'GL-ANX 1.1',
    title: 'Safety and Calm',
    affirmations: [],
    issues: [],
    versions: durations.map((d) => ({
      sheet: `S${d}`, durationMin: d, durationS: d * 60, clips: [], phases: [], levelMode: 'absolute' as const,
    })),
  }
}

const oneSheet = renderToString(
  shell(<PlainImport timeline={plainWith([6])} fileName="catalog · GL-ANX 1.1" actor="admin" onCancel={noop} onDone={noop} />),
)
/* With nothing published yet the catalog knows of no other durations, so a
   single chip row is correct — the point is what happens when it DOES. */
const chipText = (h: string) => h.replace(/<!--[^>]*-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

/* All three time signatures are ALWAYS offered, whether or not an Excel has
   arrived for them: a protocol ships as a 6-, a 12- and a 24-minute session,
   and an empty one has to be selectable because choosing it is how you say
   which duration the file you are about to import belongs to. */
const lone = chipText(oneSheet)
assert(/6m/.test(lone) && /12m/.test(lone) && /24m/.test(lone), 'all three chips are there with only one sheet imported')
assert(/adm-plain__chip--saved/.test(oneSheet), 'the one that has material is marked saved')
assert((oneSheet.match(/adm-plain__chip--empty/g) ?? []).length === 2, 'and the two with nothing in them are marked empty')

const twoSheets = renderToString(
  shell(<PlainImport timeline={plainWith([6, 24])} fileName="catalog · GL-ANX 1.1" actor="admin" onCancel={noop} onDone={noop} />),
)
assert(/6m/.test(chipText(twoSheets)) && /24m/.test(chipText(twoSheets)), 'two sheets give two selectable chips')
const chipTags = twoSheets.match(/<button[^>]*b2b-btn[^>]*>/g) ?? []
assert(chipTags.length >= 2, 'and they are real buttons')

/* A duration the workbook does not cover is shown disabled with a reason,
   never hidden. */
const gapHtml = renderToString(
  shell(<PlainImport timeline={plainWith([6, 12])} fileName="catalog · GL-ANX 1.1" actor="admin" onCancel={noop} onDone={noop} />),
)
assert(/6m/.test(chipText(gapHtml)) && /12m/.test(chipText(gapHtml)), 'the durations the workbook carries are all offered')
assert((gapHtml.match(/adm-plain__chip--saved/g) ?? []).length === 2, 'two sheets means two saved chips')
assert((gapHtml.match(/adm-plain__chip--empty/g) ?? []).length === 1, 'and the untouched one stays empty')

/* --- one VAS scale, one direction -----------------------------------------
   The therapy link used to seed VAS on a 0-10 distress scale while the
   confirmed instrument is 1-5 the other way up. One measure, two scales, two
   directions. */
const seeded = seedLink(DEMO_THERAPISTS[0])
assert(
  seeded.vas.every((v) => v.pre >= 1 && v.pre <= 5 && v.post >= 1 && v.post <= 5),
  'every seeded VAS reading sits on the confirmed 1-5 scale',
)
assert(
  seeded.vas.every((v) => vasDelta(v) === v.post - v.pre),
  'and improvement is post minus pre, the same direction the session records use',
)
assert(VAS_DELTA_RANGE === 4, 'a 1-5 delta spans 4, which is what a chart of it must be scaled to')

/* The Progress tab told the person the VAS was never collected in the app.
   It is, now: one tap either side of every session. */
const progHtml = renderToString(
  shell(<GuidedProgress {...progressProps} state={populated} therapy={{ link: seeded, request: null }} />),
)
const progText = progHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
assert(!/mai raccolt|never collected/i.test(progText), 'the Progress tab no longer denies collecting the VAS in the app')
assert(/prima e dopo|before and after/i.test(progText), 'and says what the check actually is')

/* --- the Therapist tab, reviewed as a page ---------------------------------
   Three defects it used to ship with, each asserted against here. */
const linked = { link: seedLink(DEMO_THERAPISTS[0]), request: null }
const thrHtml = renderToString(shell(<TherapistTab {...therapistProps} hasConvention therapy={linked} />))
const thrText = thrHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

/* 1. The card printed a date for the next session and, two lines below it,
      "No session is scheduled yet." Both cannot be true. */
assert(
  !(thrText.includes('Prossima seduta') && thrText.includes('Nessuna seduta in programma')),
  'the next-session card never prints a date and "nothing is scheduled" at once',
)

/* 2. Dates came from the BROWSER locale, so an Italian interface printed
      "sáb., 29 de ago." Every date on the page is now in the interface
      language: Italian short months have no "de" and no trailing dot. */
assert(!/\bde (jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b/.test(thrText), 'no Portuguese date survives on an Italian page')
assert(!/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun),/.test(thrText), 'and no English one either')

/* 3. The session-history column said "Done", which reads as "you attended".
      It is the notes-sharing flag. */
assert(thrText.includes('Note condivise'), 'the history column says what it actually means')

/* The messages section no longer claims an encryption this build does not do,
   and says who reads it and how fast instead. */
assert(!/end-to-end|cifratura/i.test(thrText), 'no encryption is promised that the product does not provide')
assert(/tra una seduta e/i.test(thrText), 'the thread says when a therapist actually reads it')

/* A thread the patient can write into exists on the page. */
assert(thrHtml.includes('msgs__compose'), 'the patient can write a message')

renders('THR · C  active therapy', <TherapistTab {...therapistProps} hasConvention therapy={{ link: seedLink(DEMO_THERAPISTS[0]), request: null }} />)

renders('MSR-1 GL-Check', <GlCheckFlow previous={null} onDone={noop} onClose={noop} />)
renders('MSR-2 WHO-5', <Who5Flow previous={null} onDone={noop} onClose={noop} />)
renders('MSR-3 Daily Mood', <DailyMoodFlow today={null} onDone={noop} onClose={noop} />)

renders('SAFE-1 footer', <SafetyLevel1 />)
renders('SAFE-2 modal', <SafetyLevel2 eap={resolveCompanyCode('ACME-2026')?.eap ?? null} onClose={noop} />)
renders('SAFE-3 modal', <SafetyLevel3 eap={null} onClose={noop} />)

/* A person must never meet a protocol code on their own screens. */
absent('THR · C', <TherapistTab {...therapistProps} hasConvention therapy={{ link: seedLink(DEMO_THERAPISTS[0]), request: null }} />, 'GL-ANX')
absent('PRG-2', <ProgressTab {...progressProps} state={populated} therapy={{ link: seedLink(DEMO_THERAPISTS[0]), request: null }} />, 'GL-STRESS')
absent('HOME library', <Explore pathway={null} completed={[]} onStartPathway={noop} onStart={noop} />, 'GL-')

/* ------------------------------------------------- Corporate Dashboard -- */
console.log('\n--- Corporate Dashboard ---')

const corp = { ...defaultState(), setupDoneAt: Date.now() }
const aggBig = buildAggregates(corp, 189)
const aggSmall = buildAggregates(corp, 2)

renders('CORP-SETUP wizard', <SetupWizard state={defaultState()} onDone={noop} />)
renders('CORP-SETUP wizard, Self Use only', <SetupWizard state={{ ...defaultState(), conventionType: 'self-use' }} onDone={noop} />)
renders('CORP-OVERVIEW', <Overview admin="Maria" agg={aggBig} state={corp} onOpenReports={noop} onOpenManagement={noop} />)
renders('CORP-OVERVIEW, below k', <Overview admin="Maria" agg={aggSmall} state={corp} onOpenReports={noop} onOpenManagement={noop} />)
renders('CORP-ENGAGEMENT', <Engagement agg={aggBig} />)
renders('CORP-WELLBEING', <Wellbeing agg={aggBig} />)
renders('CORP-WELLBEING, below k', <Wellbeing agg={aggSmall} />)
renders('CORP-REPORTS, empty', <Reports state={corp} onGenerate={noop} onView={noop} />)
renders('CORP-MGMT', <Management state={corp} agg={aggBig} update={noop} />)
renders('CORP-MGMT, Self Use only', <Management state={{ ...corp, conventionType: 'self-use' }} agg={aggBig} update={noop} />)
renders('CORP-SETTINGS', <CorporateSettings state={corp} registered={218} update={noop} />)

/* The two claims the dashboard makes about itself, checked against the render. */
absent('CORP-WELLBEING', <Wellbeing agg={aggBig} />, 'at risk')
absent('CORP-OVERVIEW', <Overview admin="Maria" agg={aggBig} state={corp} onOpenReports={noop} onOpenManagement={noop} />, 'diagnosis')
renders('CORP below k says so', <Wellbeing agg={aggSmall} />)

/* --------------------------------------------- Therapist Workspace ------ */
console.log('\n--- Therapist Workspace ---')

const ws = demoWorkspace()
const wsEmpty = emptyWorkspace()
const maria = ws.patients[0]

renders('TH-ON-1 Registration', <TherapistOnboarding account={wsEmpty.account} onSubmit={noop} onSign={noop} onFinish={noop} />)
renders('TH-ON-2 Pending', <TherapistOnboarding account={{ ...wsEmpty.account, submittedAt: Date.now() }} onSubmit={noop} onSign={noop} onFinish={noop} />)
renders('TH-ON-2 Rejected', <TherapistOnboarding account={{ ...wsEmpty.account, submittedAt: Date.now(), verification: 'rejected', verificationReason: 'Certificate unreadable' }} onSubmit={noop} onSign={noop} onFinish={noop} />)
renders('TH-ON-2 Docs needed', <TherapistOnboarding account={{ ...wsEmpty.account, submittedAt: Date.now(), verification: 'docs-needed' }} onSubmit={noop} onSign={noop} onFinish={noop} />)
renders('TH-ON-3 Terms', <TherapistOnboarding account={{ ...ws.account, termsSignedAt: null }} onSubmit={noop} onSign={noop} onFinish={noop} />)
renders('TH-ON-4 Sandbox intro', <TherapistOnboarding account={ws.account} onSubmit={noop} onSign={noop} onFinish={noop} />)

renders('TH-PAT-LIST roster', <Roster state={ws} update={noop} onOpen={noop} onCall={noop} />)
renders('TH-PAT-LIST empty', <Roster state={wsEmpty} update={noop} onOpen={noop} onCall={noop} />)
renders('TH-PAT-CARD', <PatientCard patient={maria} update={noop} onCall={noop} onMessage={noop} onOpenReport={noop} />)
renders('TH-PAT-CARD, not bridged', <PatientCard patient={{ ...maria, bridged: false, sessions: [], notes: [], goals: [], prescriptions: [], assessments: [] }} update={noop} onCall={noop} onMessage={noop} onOpenReport={noop} />)

renders('TH-CAL', <Calendar state={ws} update={noop} onOpenPatient={noop} onCall={noop} />)
renders('TH-CALL-WAIT', <LiveSession patient={maria} roomId={null} onEnd={noop} onExit={noop} />)
renders('TH-SANDBOX', <LiveSession patient={maria} sandbox onEnd={noop} onExit={noop} />)
renders('TH-REPORT', <SessionReport patient={maria} account={ws.account} row={maria.sessions[0]} onSave={noop} onBack={noop} />)
renders('TH-REPORT video-only', <SessionReport patient={maria} account={ws.account} row={maria.sessions[1]} onSave={noop} onBack={noop} />)

renders('TH-MSG', <Messages state={ws} update={noop} onOpenPatient={noop} />)
renders('TH-MSG empty', <Messages state={wsEmpty} update={noop} onOpenPatient={noop} />)
renders('TH-RX', <Prescriptions state={ws} update={noop} onOpenPatient={noop} />)
renders('TH-RX empty', <Prescriptions state={wsEmpty} update={noop} onOpenPatient={noop} />)
renders('TH-REPORTS', <ReportsArchive state={ws} onOpen={noop} />)
renders('TH-REPORTS empty', <ReportsArchive state={wsEmpty} onOpen={noop} />)
renders('TH-PERF', <Performance state={ws} />)
renders('TH-PERF, no sessions', <Performance state={wsEmpty} />)
renders('TH-SETTINGS', <WorkspaceSettings state={ws} update={noop} onOpenAvailability={noop} />)

/* ------------------------------------------- the catalog reached the UI --- */
console.log('\n--- the weekly dots ---')

/* The caption used to live INSIDE .home__dots, where `> span` styled it as a
   9px circle: the text spilled out below the row and the caption itself drew
   as an extra dot. Asserting on the structure keeps the two apart. */
const weekHtml = renderToString(
  shell(<Home {...homeProps} pathway={populated.pathway} logs={populated.logs} weekLogs={[]} />),
)
const dotsBlock = /<div[^>]*class="home__dots"[^>]*>([\s\S]*?)<\/div>/.exec(weekHtml)
assert(dotsBlock != null, 'the weekly dots row renders')
assert(
  // Strip the tags before looking for text: `span` is itself letters, so a
  // naive search finds the markup rather than the caption.
  dotsBlock != null && dotsBlock[1].replace(/<[^>]*>/g, '').trim() === '',
  'the dots row contains ONLY dots — no caption text inside it',
)
assert(
  dotsBlock != null && (dotsBlock[1].match(/<span/g) ?? []).length === 5,
  'week 1 of Stress Management draws exactly its five dots, not six',
)
assert(weekHtml.includes('home__week-progress'), 'the caption sits beside the dots, not inside them')
// The label is localized (the product default is Italian), so assert on the
// numbers it carries rather than on English wording.
assert(/<div class="home__dots"[^>]*aria-label="2 [^"]*5 /.test(weekHtml), 'the dots carry the count for a screen reader')

console.log('\n--- the catalog view ---')

const catalogHtml = renderToString(shell(<Catalog catalog={CATALOG} onOpen={noop} onQuickStart={noop} />))
assert(catalogHtml.includes('cat-rail__track'), 'the catalog renders horizontal rails')
assert(catalogHtml.includes('cat-card__cover'), 'the catalog renders cover cards')
assert(catalogHtml.includes('cat-hero'), 'the catalog leads with a hero')
assert((catalogHtml.match(/cat-rail__track/g) ?? []).length >= 5, 'there are at least five rails to browse')
assert(!catalogHtml.includes('GL-'), 'no protocol code appears on a cover card')

/* Covers must be stable: a catalog that reshuffles its colours between renders
   makes a session unrecognisable, which is the whole point of having art. */
const a1 = coverFor('calm-safety', 'calm')
const a2 = coverFor('calm-safety', 'calm')
assert(
  a1.from === a2.from && a1.motif === a2.motif && a1.angle === a2.angle,
  'a cover is deterministic for a given session',
)
assert(coverFor('focus-clarity', 'focus').from !== a1.from, 'different themes get visibly different covers')
/* Covers are drawn scenes now, not a character in a gradient. The scene has to
   exist for every session the catalog will show, and it has to be a real SVG:
   an empty string would render as a flat colour and look deliberate. */
assert(
  CATALOG.browsable.every((s) => coverSvg(coverFor(s.slug, s.theme)).startsWith('<svg')),
  'every browsable session has a drawn cover',
)
assert(
  CATALOG.browsable.every((s) => coverSvg(coverFor(s.slug, s.theme)).includes('preserveAspectRatio="xMidYMid slice"')),
  'and it is composed to survive both the 3:4 card and the wide banner crop',
)
assert(
  new Set(CATALOG.browsable.map((s) => coverFor(s.slug, s.theme).motif)).size >= 6,
  'the rail does not repeat one composition over and over',
)

console.log('\n--- the resolved catalog reached the screens ---')

assert(CATALOG.browsable.length >= 19, 'the seeded catalog resolves at least the 19 Self Use sessions')
assert(CATALOG.pathways.length === 5, 'all five pathways survive resolution against the seeded catalog')
assert(CATALOG.prescribable.length === 19, 'exactly 19 protocols resolve as prescribable')
assert(
  CATALOG.clinical.every((c) => c.durations.length > 0),
  'every clinical entry offers at least one published time signature',
)
assert(
  CATALOG.browsable.every((s) => s.durations.length > 0),
  'nothing browsable is offered without a duration behind it',
)
assert(
  CATALOG.browsable.some((s) => s.fromCatalog),
  'library material published to the catalog appears without a code change',
)

/* A protocol a PO disables must vanish from browsing AND from prescription. */
const disabled = resolveCatalog(
  seedCatalog().map((p) => (p.code === 'GL-ANX 1.1' ? { ...p, enabled: false } : p)),
  'en',
)
assert(
  !disabled.browsable.some((s) => s.protocolCode === 'GL-ANX 1.1'),
  'disabling a protocol removes its session from browsing',
)
assert(
  !disabled.prescribable.some((c) => c.code === 'GL-ANX 1.1'),
  'disabling a protocol removes it from what may be prescribed',
)
assert(
  disabled.pathways.every((p) => p.plan.every((w) => w.blocks.every((b) => b.slug !== 'calm-safety'))),
  'no surviving week still asks for the disabled session',
)
assert(
  disabled.pathways.every((p) => p.plan.every((w) => w.blocks.length > 0)),
  'a week is never left with nothing in it',
)
assert(
  disabled.pathways.every((p) => p.plan.every((w, i) => w.week === i + 1)),
  'the remaining pathway weeks are renumbered densely',
)
/* Focus & Performance week 2 is calm-safety twice over, so it loses the whole
   week. Stress Management uses calm-safety for ONE block of its consolidation
   week, so that week survives with the block removed — which is the point of
   modelling a week as blocks rather than as a single session and a count. */
assert(
  disabled.pathways.find((p) => p.id === 'focus-performance')!.dropped === 1,
  'a week whose every block used the disabled session is dropped, and the pathway says so',
)
assert(
  disabled.pathways.find((p) => p.id === 'stress-management')!.dropped === 0,
  'a week that used it for only one of several blocks keeps the week and drops the block',
)
const consolidation = disabled.pathways.find((p) => p.id === 'stress-management')!.plan.find((w) => w.rotation)!
assert(
  consolidation.blocks.length > 0 && consolidation.blocks.every((b) => b.slug !== 'calm-safety'),
  'that week is shorter but still usable',
)

/* Publishing only one time signature must offer only that one. */
const oneVersion = resolveCatalog(
  seedCatalog().map((p) => (p.code === 'GL-STRESS 4.1' ? { ...p, versions: [{ duration: 12 as const }] } : p)),
  'en',
)
const focus = oneVersion.browsable.find((s) => s.protocolCode === 'GL-STRESS 4.1')!
assert(
  focus.durations.length === 1 && focus.durations[0] === 12,
  'a protocol published in one time signature offers exactly that one',
)

/* --- a duration is only offered when the FILE for it exists -------------

   Reported after two protocols were enabled with a 24-minute workbook and no
   rendered audio: the app offered a 24-minute session that did not exist, and
   playing it gave twenty-four minutes of synthesized bed. Two faults stacked —
   the timeline counted as if it were audio, and when nothing counted at all
   the resolver fell back to the editorial 6/12/24, offering three. */
const MP3 = 'https://example.test/a.mp3'
const imported = (over: Partial<import('../src/data/catalog').CatalogProtocol>) =>
  seedCatalog().map((p) => (p.code === 'GL-ANX 1.1'
    ? { ...p, source: 'imported' as const, versions: [], plainByDuration: undefined, ...over }
    : p))

const authoredOnly = resolveCatalog(
  imported({ versions: [{ duration: 24 as const }] }),
  'en',
)
assert(
  !authoredOnly.browsable.some((s) => s.protocolCode === 'GL-ANX 1.1'),
  'an imported protocol with a timeline and no rendered file is not offered at all',
)
assert(
  !authoredOnly.sessions.find((s) => s.protocolCode === 'GL-ANX 1.1')?.durations.length,
  'and it does not fall back to the editorial 6 / 12 / 24',
)

const partly = resolveCatalog(
  imported({ versions: [{ duration: 6 as const, audioUrl: { 'pt-BR': MP3 } }, { duration: 24 as const }] }),
  'en',
)
const anx = partly.browsable.find((s) => s.protocolCode === 'GL-ANX 1.1')!
assert(
  anx.durations.length === 1 && anx.durations[0] === 6,
  'publishing 6 and authoring 24 offers 6 only — never the one without a file',
)

/* The seeded demo catalog has no audio anywhere and must stay browsable: the
   rule is about PO material, and setup.sql deletes seed rows from a real DB. */
assert(
  CATALOG.browsable.length >= 19,
  'the seed catalog is exempt — a developer machine still shows all 19 sessions',
)
assert(
  CATALOG.browsable.every((s) => !s.audioReady),
  'and every seeded session is marked as playing an ambient bed',
)

console.log(`\n${passed} renders passed.`)
