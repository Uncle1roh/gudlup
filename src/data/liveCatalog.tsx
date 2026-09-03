/* ============================================================================
   Good Loop — the LIVE catalog, resolved for every surface

   `src/data/selfuse.ts` is the EDITORIAL SPINE: which 19 sessions exist, what
   they are called in the wellbeing register, which pathway week they belong
   to, what "what to expect" says. That is a product decision and it lives in
   code.

   What a PO publishes from the admin console is different, and it must win:

     · `publicTitle` / `publicBlurb` — the non-therapeutic name a PERSON reads.
       CLAUDE.md is binding: patient-facing screens print `patientTitle()`.
       Where a PO has written one, it replaces the editorial name.
     · which DURATIONS exist. Publishing the 12-minute workbook of a protocol
       and nothing else means that protocol has one time signature, and the app
       must offer one — not three, two of which would fall back to a
       placeholder bed and sound wrong.
     · whether the entry is ENABLED at all. A disabled protocol disappears from
       browsing, from prescription and from the pathway that referenced it.
     · the rendered AUDIO, per duration and per language.

   So the resolver below takes the spine and lays the catalog over it. Nothing
   here invents material: a session exists only if its protocol is in the
   catalog and enabled, and it offers only the durations the catalog carries.

   It also picks up material the spine never knew about — a library audio a PO
   published this morning appears in Explore → All Sessions without a code
   change, because the resolver reads the catalog rather than a list.
   ============================================================================ */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useDataProvider } from './provider'
import { hasSupabaseEnv } from '../auth/supabaseClient'
import { syncProtocols } from './protocols'
import {
  CATALOG_DURATIONS,
  audienceOf,
  plainDurations,
  type CatalogProtocol,
} from './catalog'
import {
  SELF_USE_SESSIONS,
  PATHWAYS,
  MOOD_CARDS,
  isClinicalOnly,
  type Pathway,
  type PathwayId,
  type SelfUseSession,
  type SelfUseTheme,
} from './selfuse'
import { patientTitle, patientBlurb, type Duration, type Language, type Protocol } from '../types/domain'
import { useI18n, type Locale } from '../i18n'

/* ------------------------------------------------------------- audio ----- */

/** The app's locale → the audio language key on a protocol version. */
export function audioLanguage(locale: Locale): Language {
  return locale === 'it' ? 'it' : locale === 'en' ? 'en' : 'pt-BR'
}

/**
 * The rendered audio for one version, in the best language available.
 *
 * The fallback chain is deliberate rather than alphabetical: the person's own
 * language first, then Portuguese (the pilot language, where the recorded
 * voice exists first), then English, then whatever else was rendered. A voice
 * in the wrong language is still a guided session; silence is not, and the
 * synthesized placeholder bed is the honest last resort.
 */
export function audioUrlFor(
  p: Pick<Protocol, 'versions'> | undefined,
  duration: Duration,
  locale: Locale,
): string | undefined {
  const version = p?.versions.find((v) => v.duration === duration)
  const urls = version?.audioUrl
  if (!urls) return undefined
  const want = audioLanguage(locale)
  const order: Language[] = [want, 'pt-BR', 'en', 'it', 'es', 'de']
  for (const lang of order) {
    const url = urls[lang]
    if (url) return url
  }
  const first = Object.values(urls).find(Boolean)
  return first
}

/**
 * Durations a person can actually play, ascending.
 *
 * The rule is the rendered FILE, not the timeline. This used to count
 * `plainDurations` too — what a protocol has been AUTHORED for — so a workbook
 * imported for 24 minutes and never published put a 24-minute button in front
 * of a person, and pressing it played the synthesized placeholder bed: no
 * voice, no protocol, twenty-four minutes of it. On a clinical mitigation tool
 * that is worse than the session being absent. It matches `durationState()` in
 * data/catalog.ts, which has always said a duration is PUBLISHED only when the
 * protocol is enabled and that duration has a file.
 *
 * The MOCK catalog is the exception, and deliberately so. It is the static
 * demo material — nineteen sessions with no audio anywhere, by definition —
 * and holding it to the file rule would empty the app on every developer
 * machine to enforce a rule about PO material. It keeps its declared durations
 * and is marked as playing an ambient bed.
 *
 * The test for "mock" is the ABSENCE OF A BACKEND, not `source === 'seed'`.
 * That was the first version and it was wrong in a way that reached people:
 * `protocols.source` defaults to `'seed'` in the schema and `mapCatalog`
 * coerces anything that is not `'imported'` to `'seed'`, so a real row written
 * by any path that did not set the column explicitly claimed the demo
 * exemption — and offered 6 / 12 / 24 buttons with no file behind any of them.
 */
export function playableDurations(p: CatalogProtocol | undefined): Duration[] {
  if (!p) return []
  const rendered = new Set<Duration>()
  for (const v of p.versions) {
    if (!CATALOG_DURATIONS.includes(v.duration)) continue
    if (v.audioUrl && Object.values(v.audioUrl).some((u) => Boolean(u))) rendered.add(v.duration)
  }
  if (rendered.size) return CATALOG_DURATIONS.filter((d) => rendered.has(d))
  if (hasSupabaseEnv() || p.source !== 'seed') return []
  const declared = new Set<Duration>([
    ...p.versions.map((v) => v.duration).filter((d): d is Duration => CATALOG_DURATIONS.includes(d)),
    ...plainDurations(p),
  ])
  return CATALOG_DURATIONS.filter((d) => declared.has(d))
}

/** True when at least one duration has real rendered audio. */
export function hasRenderedAudio(p: CatalogProtocol | undefined, locale: Locale): boolean {
  if (!p) return false
  return playableDurations(p).some((d) => Boolean(audioUrlFor(p, d, locale)))
}

/* ------------------------------------------------- resolved Self Use ----- */

export interface ResolvedSession extends SelfUseSession {
  /** True when the catalog carries this session's protocol and it is enabled. */
  available: boolean
  /** True when a PO has published rendered audio for at least one duration. */
  audioReady: boolean
  /** The catalog entry behind it, when there is one. */
  entry?: CatalogProtocol
  /** Set when this session came from the CATALOG rather than the spine. */
  fromCatalog?: boolean
}

const THEME_BY_LIBRARY_CATEGORY: Record<string, SelfUseTheme> = {
  before: 'calm',
  calm: 'calm',
  reset: 'balance',
  sleep: 'calm',
  focus: 'focus',
  energy: 'energy',
}

/**
 * The 19 editorial sessions, resolved against the catalog, plus every enabled
 * LIBRARY entry the catalog carries that the spine does not already cover.
 *
 * Order matters for the browse screen: the spine first, in its editorial
 * order, then newly published library material after it. A PO publishing an
 * audio should see it appear without it reshuffling the list a person already
 * knows.
 */
export function resolveSessions(catalog: CatalogProtocol[], locale: Locale): ResolvedSession[] {
  const byCode = new Map(catalog.map((p) => [p.code, p]))

  const spine: ResolvedSession[] = SELF_USE_SESSIONS.map((s) => {
    const entry = byCode.get(s.protocolCode)
    if (!entry || !entry.enabled) {
      return { ...s, available: false, audioReady: false, entry }
    }
    const durations = playableDurations(entry)
    return {
      ...s,
      // CLAUDE.md: a patient-facing screen prints patientTitle(). Where no PO
      // has written a public name, that resolves to the clinical title — which
      // is NOT what a person should read, so the editorial name stays instead.
      name: entry.publicTitle?.trim() ? patientTitle(entry) : s.name,
      blurb: entry.publicBlurb?.trim() ? patientBlurb(entry) : s.blurb,
      /* No fallback to the editorial durations. When the catalog has nothing
         rendered, the honest answer is that this session cannot be started —
         falling back to the spine's 6 / 12 / 24 offered THREE buttons that all
         led to the placeholder bed instead of one. */
      durations,
      available: durations.length > 0,
      audioReady: hasRenderedAudio(entry, locale),
      entry,
    }
  })

  const covered = new Set(SELF_USE_SESSIONS.map((s) => s.protocolCode))
  const extra: ResolvedSession[] = catalog
    .filter((p) => p.enabled && audienceOf(p) === 'library' && !covered.has(p.code))
    .map((p) => ({
      slug: `catalog:${p.code}`,
      name: patientTitle(p),
      blurb: patientBlurb(p),
      about: patientBlurb(p),
      expect: [],
      series: 'standalone' as const,
      theme: THEME_BY_LIBRARY_CATEGORY[p.library?.category ?? ''] ?? 'calm',
      protocolCode: p.code,
      durations: playableDurations(p),
      available: true,
      audioReady: hasRenderedAudio(p, locale),
      entry: p,
      fromCatalog: true,
    }))
    .filter((s) => s.durations.length > 0)

  return [...spine, ...extra]
}

/** Only what a person may browse and start right now. */
export function browsableSessions(sessions: ResolvedSession[]): ResolvedSession[] {
  return sessions.filter((s) => s.available && s.durations.length > 0)
}

export function findSession(sessions: ResolvedSession[], slug: string): ResolvedSession | undefined {
  return sessions.find((s) => s.slug === slug)
}

/**
 * A pathway with its unavailable weeks removed and the rest renumbered.
 *
 * A pathway names sessions by slug, and a PO can disable the protocol behind
 * one of them at any time. Leaving a dead week in place would strand anyone
 * standing on it — "Start Today's Session" with nothing to start. Dropping the
 * week and closing the gap keeps the pathway walkable, and `dropped` says what
 * was removed so a screen can be honest about a shortened journey rather than
 * silently pretending the pathway was always this long.
 */
export interface ResolvedPathway extends Pathway {
  dropped: number
}

export function resolvePathway(p: Pathway, sessions: ResolvedSession[]): ResolvedPathway {
  const ok = new Set(browsableSessions(sessions).map((s) => s.slug))
  const byslug = new Map(sessions.map((s) => [s.slug, s]))

  /* A week is dropped only when NOTHING in it survives. A week that asks
     for four Standard sessions plus one Quick rescue is still a usable
     week when only the rescue's protocol was disabled. */
  const kept = p.plan
    .map((w) => ({
      ...w,
      blocks: w.blocks
        .filter((b) => ok.has(b.slug))
        .map((b) => {
          // A block asking for a duration the catalog no longer publishes
          // falls back to the nearest one that exists, not to a bed.
          const durations = byslug.get(b.slug)?.durations ?? []
          return durations.includes(b.duration)
            ? b
            : { ...b, duration: nearestDuration(durations, b.duration) }
        }),
    }))
    .filter((w) => w.blocks.length > 0)

  const plan = kept.map((w, i) => ({ ...w, week: i + 1 }))
  return { ...p, plan, weeks: plan.length, dropped: p.plan.length - plan.length }
}

function nearestDuration(available: Duration[], want: Duration): Duration {
  if (!available.length) return want
  return available.reduce((best, d) => (Math.abs(d - want) < Math.abs(best - want) ? d : best), available[0])
}

export function resolvePathways(sessions: ResolvedSession[]): ResolvedPathway[] {
  return PATHWAYS.map((p) => resolvePathway(p, sessions)).filter((p) => p.plan.length > 0)
}

/** The quick-access grid, with cards whose session is gone removed. */
export function resolveMoodCards(sessions: ResolvedSession[]) {
  const ok = new Set(browsableSessions(sessions).map((s) => s.slug))
  return MOOD_CARDS.filter((c) => ok.has(c.slug))
}

/* --------------------------------------------------- resolved clinical --- */

export interface ClinicalEntry {
  code: string
  family: string
  /** The CLINICAL title — therapist-facing only. */
  title: string
  blurb: string
  durations: Duration[]
  clinicalOnly: boolean
  audioReady: boolean
  /** The name the PATIENT will see when this is prescribed. */
  patientName: string
  entry: CatalogProtocol
}

/**
 * Every enabled clinical protocol, for the therapist's protocol wizard.
 * Includes the six clinical-only ones — they are usable INSIDE a live session;
 * what they may never be is homework, which `prescribableEntries` enforces.
 */
export function resolveClinical(catalog: CatalogProtocol[], locale: Locale, sessions: ResolvedSession[]): ClinicalEntry[] {
  const nameOf = new Map(sessions.map((s) => [s.protocolCode, s.name]))
  return catalog
    .filter((p) => p.enabled && audienceOf(p) === 'clinical')
    .map((p) => ({
      code: p.code,
      family: p.family,
      title: p.title,
      blurb: p.blurb,
      durations: playableDurations(p),
      clinicalOnly: isClinicalOnly(p.code),
      audioReady: hasRenderedAudio(p, locale),
      patientName: nameOf.get(p.code) ?? patientTitle(p),
      entry: p,
    }))
    .sort((a, b) => a.code.localeCompare(b.code))
}

/**
 * What a therapist may prescribe as HOMEWORK: an enabled protocol that maps to
 * a Self Use session a person can actually open on their own. The six
 * clinical-only protocols are excluded here — and only here — so the rule
 * cannot be bypassed by a caller that forgets it.
 */
export function prescribableEntries(clinical: ClinicalEntry[], sessions: ResolvedSession[]): ClinicalEntry[] {
  const browsable = new Set(browsableSessions(sessions).map((s) => s.protocolCode))
  return clinical.filter((c) => !c.clinicalOnly && browsable.has(c.code))
}

/* --------------------------------------------------------------- hook ---- */

export interface LiveCatalog {
  loading: boolean
  error: Error | null
  /** Everything the catalog holds, enabled or not. */
  all: CatalogProtocol[]
  sessions: ResolvedSession[]
  browsable: ResolvedSession[]
  pathways: ResolvedPathway[]
  moodCards: ReturnType<typeof resolveMoodCards>
  clinical: ClinicalEntry[]
  prescribable: ClinicalEntry[]
  refetch: () => void
}

/**
 * Load the catalog once per surface and resolve it.
 *
 * It also re-registers the protocols in the runtime registry: `getProtocol()`
 * is what the player resolves phases and audio through, so a protocol
 * published while the app is open plays correctly on the next session without
 * a reload.
 */
export function useLiveCatalog(locale: Locale): LiveCatalog {
  const dp = useDataProvider()
  const [all, setAll] = useState<CatalogProtocol[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    dp.listProtocols()
      .then((list) => {
        if (!active) return
        setAll(list)
        /* The catalog REPLACES the registry rather than adding to it. A
           protocol that was deleted or disabled has to stop resolving, or it
           keeps playing from a static seed nobody can see or edit. */
        syncProtocols(list.filter((p) => p.enabled))
        setError(null)
      })
      .catch((e: Error) => { if (active) setError(e) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [dp, tick])

  const sessions = useMemo(() => resolveSessions(all, locale), [all, locale])
  const browsable = useMemo(() => browsableSessions(sessions), [sessions])
  const pathways = useMemo(() => resolvePathways(sessions), [sessions])
  const moodCards = useMemo(() => resolveMoodCards(sessions), [sessions])
  const clinical = useMemo(() => resolveClinical(all, locale, sessions), [all, locale, sessions])
  const prescribable = useMemo(() => prescribableEntries(clinical, sessions), [clinical, sessions])

  return {
    loading, error, all, sessions, browsable, pathways, moodCards, clinical, prescribable,
    refetch: () => setTick((n) => n + 1),
  }
}

/** The pathway a resolved catalog offers under an id, if it still exists. */
export function findPathway(pathways: ResolvedPathway[], id: PathwayId | null | undefined) {
  return pathways.find((p) => p.id === id)
}

/* ------------------------------------------------------------ context ---- */

/**
 * One resolved catalog per surface, shared by every screen inside it.
 *
 * A context rather than props because the resolution has to be consistent
 * ACROSS screens within one render: Home, Explore and the player must agree on
 * which durations a session offers, and threading the same object through five
 * levels invites one of them being handed a stale copy.
 */
const CatalogCtx = createContext<LiveCatalog | null>(null)

export function LiveCatalogProvider({ children, value }: { children: ReactNode; value?: LiveCatalog }) {
  const { locale } = useI18n()
  const loaded = useLiveCatalog(locale)
  // `value` lets a harness (or a storybook) render a screen against a KNOWN
  // catalog rather than waiting on a provider round-trip. Production never
  // passes it, so the loaded one is what every real surface sees.
  return <CatalogCtx.Provider value={value ?? loaded}>{children}</CatalogCtx.Provider>
}

/** Resolve a catalog synchronously — for harnesses and for server rendering,
    where there is no provider round-trip to wait on. */
export function resolveCatalog(all: CatalogProtocol[], locale: Locale): LiveCatalog {
  const sessions = resolveSessions(all, locale)
  const clinical = resolveClinical(all, locale, sessions)
  return {
    loading: false,
    error: null,
    all,
    sessions,
    browsable: browsableSessions(sessions),
    pathways: resolvePathways(sessions),
    moodCards: resolveMoodCards(sessions),
    clinical,
    prescribable: prescribableEntries(clinical, sessions),
    refetch: () => {},
  }
}

/** The resolved catalog. Falls back to an empty one outside the provider so a
    screen rendered in isolation (a test, a storybook) degrades rather than
    throws — it simply has nothing to offer, which is a real state anyway. */
export function useCatalog(): LiveCatalog {
  const ctx = useContext(CatalogCtx)
  if (ctx) return ctx
  return EMPTY_CATALOG
}

const EMPTY_SESSIONS = resolveSessions([], 'en')
const EMPTY_CATALOG: LiveCatalog = {
  loading: false,
  error: null,
  all: [],
  sessions: EMPTY_SESSIONS,
  browsable: [],
  pathways: [],
  moodCards: [],
  clinical: [],
  prescribable: [],
  refetch: () => {},
}
