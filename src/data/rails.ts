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

import type { ResolvedSession } from './liveCatalog'
import { SELF_USE_THEMES, type SelfUseTheme } from './selfuse'

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
}

/** A rail with its sessions resolved — what the Home screen renders. */
export interface ResolvedRail {
  id: string
  title: string
  subtitle?: string
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

  const deep = all.filter((s) => s.durations.includes(24))
  if (deep.length) out.push({ id: 'deep', title: 'Longer sessions', subtitle: 'For when you will not be interrupted', items: deep })

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
    out.push({ id: rail.id, title: rail.title, subtitle: rail.subtitle || undefined, items })
  }
  return out.length ? out : defaultRails(all)
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
    slugs: r.items.map((s) => s.slug),
    enabled: true,
    position: i,
  }))
}
