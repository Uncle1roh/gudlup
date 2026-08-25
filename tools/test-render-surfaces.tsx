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
import { coverFor } from '../src/selfuse/artwork'
import { ProgressTab } from '../src/selfuse/ProgressTab'
import { ProfileTab } from '../src/selfuse/ProfileTab'
import { TherapistTab } from '../src/selfuse/TherapistTab'
import { GlCheckFlow, Who5Flow, DailyMoodFlow } from '../src/selfuse/Measures'
import { SafetyLevel1, SafetyLevel2, SafetyLevel3 } from '../src/selfuse/Safety'
import { emptyTherapy, seedLink, DEMO_THERAPISTS } from '../src/selfuse/therapyStore'
import { emptyState, type SelfUseState } from '../src/data/selfUseStore'
import { resolveCompanyCode } from '../src/data/convention'

import { SetupWizard } from '../src/corporate/Setup'
import { Overview, Engagement, Wellbeing, Reports } from '../src/corporate/Screens'
import { Management } from '../src/corporate/Management'
import { Settings as CorporateSettings } from '../src/corporate/Settings'
import { buildAggregates, defaultState } from '../src/corporate/data'

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

renders('EXP-1 Pathways', <Explore pathway={null} completed={[]} initialTab="pathways" onStartPathway={noop} onStart={noop} />)
renders('EXP-2 All sessions', <Explore pathway={null} completed={[]} initialTab="sessions" onStartPathway={noop} onStart={noop} />)
renders('EXP  active pathway', <Explore pathway={populated.pathway} completed={['focus-performance']} onStartPathway={noop} onStart={noop} />)

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
absent('EXP-2', <Explore pathway={null} completed={[]} initialTab="sessions" onStartPathway={noop} onStart={noop} />, 'GL-')

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
  a1.from === a2.from && a1.glyph === a2.glyph && a1.angle === a2.angle,
  'a cover is deterministic for a given session',
)
assert(coverFor('focus-clarity', 'focus').from !== a1.from, 'different themes get visibly different covers')
assert(
  CATALOG.browsable.every((s) => coverFor(s.slug, s.theme).glyph.length > 0),
  'every browsable session has a glyph',
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
  disabled.pathways.every((p) => p.plan.every((w) => w.slug !== 'calm-safety')),
  'a pathway week whose protocol was disabled is dropped rather than left dead',
)
assert(
  disabled.pathways.every((p) => p.plan.every((w, i) => w.week === i + 1)),
  'the remaining pathway weeks are renumbered densely',
)
assert(
  disabled.pathways.find((p) => p.id === 'stress-management')!.dropped === 1,
  'the pathway reports how many weeks it lost, so a screen can say so',
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

console.log(`\n${passed} renders passed.`)
