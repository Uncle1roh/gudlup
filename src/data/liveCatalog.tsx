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
import { nameLocales, patientTitle, patientBlurb, protocolBlurb, protocolTitle, type Duration, type Protocol } from '../types/domain'
import { useI18n, type Locale } from '../i18n'
import { variantKey, type Addressee, type VoiceLang } from '../tts/voiceLang'
import { tierChoice } from '../legal/claims'

/* ------------------------------------------------------------- audio ----- */

/**
 * The app's locale → the SPOKEN language a person may hear.
 *
 * The owner's rule (2026-10-21): a person linked to a language is offered
 * protocols in THAT language only, never another. English is not voiced yet,
 * so an English reader is offered nothing until it is — which replaces the
 * earlier decision that English readers hear Portuguese.
 */
export function audioLanguage(locale: Locale): VoiceLang | 'en' {
  return locale === 'it' ? 'it' : locale === 'en' ? 'en' : 'pt-BR'
}

/** Who is listening: their language and how they are addressed. A surface
    that is not one person's (the therapist workspace, the console) has no
    listener and sees every rendered duration. */
export interface Listener {
  locale: Locale
  to: Addressee
}

/** The one file a listener may hear for a version: their language AND their
    form. Nothing else — a man's recording never plays for a woman, a
    Portuguese one never for an Italian reader (owner's rule, 2026-10-21). */
export function listenerKey(l: Listener): string {
  return variantKey(audioLanguage(l.locale), l.to)
}

/**
 * The rendered audio for one version, for one listener — or nothing.
 *
 * Strict (owner's rule, 2026-10-21): the listener's language and form, and
 * no fallback to another language or the other form. With per-listener
 * durations (`playableDurations`) a person is never offered a version they
 * have no file for, so "nothing" here means the version cannot be played
 * for them, and the player says so rather than playing someone else's.
 */
export function audioUrlFor(
  p: Pick<Protocol, 'versions'> | undefined,
  duration: Duration,
  locale: Locale,
  to: Addressee = 'm',
): string | undefined {
  return audioPick(p, duration, locale, to)?.url
}

export interface AudioPick {
  url: string
  /** Always true: only the listener's own language and form is ever picked. */
  exact: true
  spokenLang: string
}

export function audioPick(
  p: Pick<Protocol, 'versions'> | undefined,
  duration: Duration,
  locale: Locale,
  to: Addressee = 'm',
): AudioPick | undefined {
  const version = p?.versions.find((v) => v.duration === duration)
  const urls = version?.audioUrl as Record<string, string | undefined> | undefined
  const url = urls?.[listenerKey({ locale, to })]
  return url ? { url, exact: true, spokenLang: audioLanguage(locale) } : undefined
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
export function playableDurations(p: CatalogProtocol | undefined, listener?: Listener | null): Duration[] {
  if (!p) return []
  const rendered = new Set<Duration>()
  const key = listener ? listenerKey(listener) : null
  for (const v of p.versions) {
    if (!CATALOG_DURATIONS.includes(v.duration)) continue
    const urls = (v.audioUrl ?? {}) as Record<string, string | undefined>
    /* For a person: only a file in their language and form makes a duration
       playable. For a surface with no listener: any file. */
    if (key ? Boolean(urls[key]) : Object.values(urls).some((u) => Boolean(u))) rendered.add(v.duration)
  }
  if (rendered.size) return CATALOG_DURATIONS.filter((d) => rendered.has(d))
  /* Files exist, just none in this person's language and form: nothing to offer. */
  if (key && p.versions.some((v) => v.audioUrl && Object.values(v.audioUrl).some((u) => Boolean(u)))) return []
  if (rendered.size) return CATALOG_DURATIONS.filter((d) => rendered.has(d))
  /* A preview reads the real catalogue now, so it tells the same truth a
     customer's app would: a length is offered when audio exists for it, and
     not because somebody is being shown around. */
  if (hasSupabaseEnv() || p.source !== 'seed') return []
  const declared = new Set<Duration>([
    ...p.versions.map((v) => v.duration).filter((d): d is Duration => CATALOG_DURATIONS.includes(d)),
    ...plainDurations(p),
  ])
  return CATALOG_DURATIONS.filter((d) => declared.has(d))
}

/** True when at least one duration has real rendered audio for this listener
    (or, with no listener, at all). */
export function hasRenderedAudio(p: CatalogProtocol | undefined, listener?: Listener | null): boolean {
  if (!p) return false
  return p.versions.some((v) => {
    const urls = (v.audioUrl ?? {}) as Record<string, string | undefined>
    return listener ? Boolean(urls[listenerKey(listener)]) : Object.values(urls).some((u) => Boolean(u))
  })
}

/** A protocol a person may never choose on their own: one of the six
    clinical-only codes, or any protocol the console labels "Clinico" (made to
    be used together with a professional). It is still played when a
    therapist prescribes it or leads it in a session — never picked from the
    library, search, shelves, pathways or mood cards (owner's rule,
    2026-10-21). */
export function isTherapistOnly(p: Pick<CatalogProtocol, 'code' | 'tier'> | undefined): boolean {
  if (!p) return false
  return isClinicalOnly(p.code) || tierChoice(p.tier) === 'amber'
}

/* ------------------------------------------------- resolved Self Use ----- */

export interface ResolvedSession extends SelfUseSession {
  /** A real cover image a PO uploaded, when there is one. Absent = the
      generated artwork. */
  coverUrl?: string
  /** True when the catalog carries this session's protocol and it is enabled. */
  available: boolean
  /** True when a PO has published rendered audio for at least one duration. */
  audioReady: boolean
  /** The catalog entry behind it, when there is one. */
  entry?: CatalogProtocol
  /** Set when this session came from the CATALOG rather than the spine. */
  fromCatalog?: boolean
  /** Clinical: playable only when a therapist prescribes or leads it. */
  therapistOnly?: boolean
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
/** The public NAME a PO has written for this language, if any — the base
    column when the language has nothing of its own. Empty string = none. */
/* Same chain as `patientTitle`: the reader's language, then (for English)
   Portuguese, then the base column. `||` rather than `??`: a language saved
   with an empty field has not named anything. */
function publicName(p: CatalogProtocol, locale: Locale): string {
  for (const l of nameLocales(locale)) {
    const v = p.i18n?.[l]?.publicTitle?.trim()
    if (v) return v
  }
  return (p.publicTitle ?? '').trim()
}
function publicLine(p: CatalogProtocol, locale: Locale): string {
  for (const l of nameLocales(locale)) {
    const v = p.i18n?.[l]?.publicBlurb?.trim()
    if (v) return v
  }
  return (p.publicBlurb ?? '').trim()
}

export function resolveSessions(catalog: CatalogProtocol[], locale: Locale, listener?: Listener | null): ResolvedSession[] {
  const byCode = new Map(catalog.map((p) => [p.code, p]))

  const spine: ResolvedSession[] = SELF_USE_SESSIONS.map((s) => {
    const entry = byCode.get(s.protocolCode)
    if (!entry || !entry.enabled) {
      return { ...s, available: false, audioReady: false, entry }
    }
    const durations = playableDurations(entry, listener)
    return {
      ...s,
      /* `therapistOnly` keeps this out of the library, the search, the
         shelves, the pathways and the mood cards (`browsableSessions`) —
         and leaves it PLAYABLE, which is what a prescription needs. The
         distinction matters: a clinical protocol is not unavailable, it is
         not self-service.

         The row's audience now counts as well as the tier and the six
         codes. The nineteen editorial sessions are matched to a catalogue
         row by code and used to skip the audience question entirely — the
         spine was written when the catalogue held nothing BUT clinical
         codes, and each editorial session named one as "the protocol that
         carries the audio". So GL-STRESS, GL-ANX, GL-BURN, GL-RESIL and
         GL-DEP material was listed under editorial names for people
         browsing alone, which is what the owner's rule of 2026-10-21 exists
         to prevent. Any of the nineteen comes back the moment its protocol
         says `audience: 'library'`. */
      therapistOnly: isTherapistOnly(entry) || audienceOf(entry) !== 'library',
      /* CLAUDE.md: a patient-facing screen prints patientTitle(). Where no PO
         has written a public name, that resolves to the clinical title — which
         is NOT what a person should read, so the editorial name stays instead.

         "Written" has to be asked of the LANGUAGE being read, not of the base
         field: a PO who names a protocol only in Italian has written a public
         name for an Italian reader, and asking the base column alone would
         drop them back to the English editorial one. */
      name: publicName(entry, locale) ? patientTitle(entry, locale) : s.name,
      blurb: publicLine(entry, locale) ? patientBlurb(entry, locale) : s.blurb,
      /* No fallback to the editorial durations. When the catalog has nothing
         rendered, the honest answer is that this session cannot be started —
         falling back to the spine's 6 / 12 / 24 offered THREE buttons that all
         led to the placeholder bed instead of one. */
      durations,
      available: durations.length > 0,
      audioReady: hasRenderedAudio(entry, listener),
      coverUrl: entry.coverUrl,
      entry,
    }
  })

  const covered = new Set(SELF_USE_SESSIONS.map((s) => s.protocolCode))
  const extra: ResolvedSession[] = catalog
    .filter((p) => p.enabled && audienceOf(p) === 'library' && !covered.has(p.code))
    .map((p) => ({
      slug: `catalog:${p.code}`,
      name: patientTitle(p, locale),
      blurb: patientBlurb(p, locale),
      about: patientBlurb(p, locale),
      expect: [],
      series: 'standalone' as const,
      theme: THEME_BY_LIBRARY_CATEGORY[p.library?.category ?? ''] ?? 'calm',
      protocolCode: p.code,
      durations: playableDurations(p, listener),
      available: true,
      audioReady: hasRenderedAudio(p, listener),
      coverUrl: p.coverUrl,
      entry: p,
      fromCatalog: true,
      therapistOnly: isTherapistOnly(p),
    }))
    .filter((s) => s.durations.length > 0)

  return [...spine, ...extra]
}

/** Only what a person may browse and start ON THEIR OWN right now: playable
    for them, and not a therapist-only protocol. */
export function browsableSessions(sessions: ResolvedSession[]): ResolvedSession[] {
  return sessions.filter((s) => s.available && s.durations.length > 0 && !s.therapistOnly)
}

/** What can be played at all (a prescription included), therapist-only or not. */
export function playableSessions(sessions: ResolvedSession[]): ResolvedSession[] {
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
      // the CLINICAL name, in the language the clinician is reading the app in
      title: protocolTitle(p, locale),
      family: p.family,
      blurb: protocolBlurb(p, locale),
      durations: playableDurations(p),
      clinicalOnly: isClinicalOnly(p.code),
      audioReady: hasRenderedAudio(p),
      patientName: nameOf.get(p.code) ?? patientTitle(p, locale),
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
  /* A therapist may prescribe a "Clinico" protocol — that is what it is for —
     so this reads what is PLAYABLE, not what a person may browse alone. */
  const playable = new Set(playableSessions(sessions).map((s) => s.protocolCode))
  return clinical.filter((c) => !c.clinicalOnly && playable.has(c.code))
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
export function useLiveCatalog(locale: Locale, listener: Listener | null = null): LiveCatalog {
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

  const sessions = useMemo(() => resolveSessions(all, locale, listener), [all, locale, listener?.locale, listener?.to])
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
/* The person surface tells the catalog who is listening, once it knows how
   they are addressed (AddressedAsGate makes that an answer before anything
   plays). Until then, and on surfaces that are not one person's, there is
   no listener and no per-person filter. */
const ListenerCtx = createContext<(to: Addressee | null) => void>(() => undefined)

/** Called by the Self Use surface with the person's form. */
export function useSetListener(): (to: Addressee | null) => void {
  return useContext(ListenerCtx)
}

export function LiveCatalogProvider({ children, value }: { children: ReactNode; value?: LiveCatalog }) {
  const { locale } = useI18n()
  const [to, setTo] = useState<Addressee | null>(null)
  const listener = useMemo(() => (to ? { locale, to } : null), [locale, to])
  const loaded = useLiveCatalog(locale, listener)
  // `value` lets a harness (or a storybook) render a screen against a KNOWN
  // catalog rather than waiting on a provider round-trip. Production never
  // passes it, so the loaded one is what every real surface sees.
  return (
    <ListenerCtx.Provider value={setTo}>
      <CatalogCtx.Provider value={value ?? loaded}>{children}</CatalogCtx.Provider>
    </ListenerCtx.Provider>
  )
}

/** Resolve a catalog synchronously — for harnesses and for server rendering,
    where there is no provider round-trip to wait on. */
export function resolveCatalog(all: CatalogProtocol[], locale: Locale, listener: Listener | null = null): LiveCatalog {
  const sessions = resolveSessions(all, locale, listener)
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
