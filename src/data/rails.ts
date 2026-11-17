/* ============================================================================
   Good Loop — the rails on the Home screen

   A rail is a row in the library: a title, and the sessions in it. Until now
   they were written in code — six minutes, one per theme, longer sessions,
   new in the library — so changing the shelf meant a deploy, and nobody
   outside the repo could see what the shelf even was.

   Now they are rows an admin edits. The code list stays as the DEFAULT: an
   install with no stored rails, a database that has not run the migration,
   and a build with no backend all keep exactly the library they have today.
   Publishing an empty set is not a way to end up with a blank Home — an
   empty set means "use the default", and a rail whose sessions have all gone
   is dropped rather than rendered empty.
   ============================================================================ */

import { translateContent, type Locale } from '../i18n'
import type { ResolvedSession } from './liveCatalog'
import { SELF_USE_THEMES, type SelfUseTheme } from './selfuse'

/* ---------------------------------------------------------------- language

   A SHELF NAME IS WRITTEN, NOT TRANSLATED. The names this file ships —
   "Six minutes", "Calm", "New in the library" — are English keys, so the
   product dictionaries carry them and a Brazilian reader gets Portuguese.
   That worked, and it worked ONLY for those: a shelf an operator invents
   ("Pausas para a tarde", "Campanha de novembro") is a string no dictionary
   has ever seen, so the console could only warn that every language would
   read it exactly as typed. Which is why the editor appeared to "stop being
   able to translate" the moment somebody made a new shelf — there was
   nothing to look it up in.

   So a rail now CARRIES its own translations, the way a protocol carries
   `publicTitle` per language. `title` stays the source string, and `i18n`
   holds what a person wrote for each language. Nothing written for a
   language still falls back to the dictionary, so the built-in shelves are
   unchanged and no existing row has to be migrated. */

/** What one language reads on a shelf. Both fields optional: a translated
    title with no translated subtitle is a perfectly normal state. */
export interface RailText {
  title?: string
  subtitle?: string
}

export type RailI18n = Partial<Record<Locale, RailText>>

/** A shelf's name in one language: what somebody wrote for it, else what the
    dictionaries know, else the string as typed. */
export function railTitle(r: { title: string; i18n?: RailI18n }, locale: Locale): string {
  const own = r.i18n?.[locale]?.title?.trim()
  return own || translateContent(locale, r.title)
}

/** The same for the second line, which may be absent altogether. */
export function railSubtitle(r: { subtitle?: string; i18n?: RailI18n }, locale: Locale): string | undefined {
  const own = r.i18n?.[locale]?.subtitle?.trim()
  if (own) return own
  const raw = r.subtitle?.trim()
  return raw ? translateContent(locale, raw) : undefined
}

export interface ExploreRail {
  /** Stable id: what the admin edits, and what an order is stored against. */
  id: string
  /** Shown to the person, as written. See the note on language below. */
  title: string
  subtitle?: string
  /** Session slugs, in the order they should appear. */
  slugs: string[]
  enabled: boolean
  /** Ascending. The admin's drag order, persisted. */
  position: number
  /** What each language reads, where somebody has written it. */
  i18n?: RailI18n
}

/** A rail with its sessions resolved — what the Home screen renders. */
export interface ResolvedRail {
  id: string
  title: string
  subtitle?: string
  /** Carried through, because the screen is what picks the language. */
  i18n?: RailI18n
  items: ResolvedSession[]
}

/**
 * The rails the app has always had, derived from the library itself.
 *
 * Still the answer when nobody has defined any: these need no maintenance and
 * follow the catalog as it grows, which is the right default for a tenant who
 * has never opened the admin console.
 */
export function defaultRails(all: ResolvedSession[]): ResolvedRail[] {
  if (!all.length) return []
  const out: ResolvedRail[] = []

  const quick = all.filter((s) => s.durations.includes(6))
  if (quick.length) out.push({ id: 'quick', title: 'Six minutes', subtitle: 'When that is all you have', items: quick })

  for (const th of SELF_USE_THEMES) {
    const items = all.filter((s) => s.theme === (th.id as SelfUseTheme))
    if (items.length) out.push({ id: th.id, title: th.label, items })
  }

  /* No "Longer sessions" rail. It selected every session that OFFERS 24
     minutes, and almost all of them also offer 6 and 12 — so the shelf
     promising long sessions was full of six-minute ones. A duration is a
     choice made when you open a session, not a category of session, and the
     duration chips above already filter by it honestly. */

  const fresh = all.filter((s) => s.fromCatalog)
  if (fresh.length) out.push({ id: 'new', title: 'New in the library', items: fresh })

  return out
}

/**
 * What the Home screen shows: the stored rails when there are any, otherwise
 * the defaults.
 *
 * A slug that no longer resolves — unpublished, disabled, renamed — is
 * skipped, and a rail left with nothing in it is not rendered. A shelf that
 * promises a row and delivers an empty one is worse than one row fewer.
 */
export function resolveRails(stored: ExploreRail[] | null | undefined, all: ResolvedSession[]): ResolvedRail[] {
  if (!stored || !stored.length) return defaultRails(all)
  const bySlug = new Map(all.map((s) => [s.slug, s]))
  const out: ResolvedRail[] = []
  for (const rail of [...stored].sort((a, b) => a.position - b.position)) {
    if (!rail.enabled) continue
    const items = rail.slugs.map((slug) => bySlug.get(slug)).filter((s): s is ResolvedSession => !!s)
    if (!items.length) continue
    out.push({ id: rail.id, title: rail.title, subtitle: rail.subtitle || undefined, i18n: rail.i18n, items })
  }
  return out.length ? out : defaultRails(all)
}

/**
 * One language's text on a rail, set or cleared.
 *
 * Cleared means REMOVED, not an empty string: an empty override would be
 * indistinguishable from a deliberate blank title, and would also make the
 * editor's unsaved-changes check fire on a field somebody typed into and
 * emptied again. Empty locales and an empty map are pruned for the same
 * reason — what is stored is exactly what somebody wrote.
 */
export function withRailText(
  r: ExploreRail,
  locale: Locale,
  field: keyof RailText,
  value: string,
): ExploreRail {
  const next: RailI18n = { ...(r.i18n ?? {}) }
  const entry: RailText = { ...(next[locale] ?? {}) }
  const v = value.trim()
  if (v) entry[field] = value
  else delete entry[field]
  if (entry.title === undefined && entry.subtitle === undefined) delete next[locale]
  else next[locale] = entry
  const empty = Object.keys(next).length === 0
  const out: ExploreRail = { ...r }
  if (empty) delete out.i18n
  else out.i18n = next
  return out
}

/** A blank rail, ready to be named. */
export function newRail(position: number): ExploreRail {
  return {
    id: `rail-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title: '',
    slugs: [],
    enabled: true,
    position,
  }
}

/** The stored shape of the rails the app ships with, so the editor can start
    from what people are seeing rather than from an empty page. */
export function railsFromDefaults(all: ResolvedSession[]): ExploreRail[] {
  return defaultRails(all).map((r, i) => ({
    id: r.id,
    title: r.title,
    subtitle: r.subtitle,
    /* No `i18n`: these names ARE dictionary keys, and writing the current
       Italian into the row would freeze today's wording into the data. */
    slugs: r.items.map((s) => s.slug),
    enabled: true,
    position: i,
  }))
}
