/* ============================================================================
   Self Use — the session catalog (Explore → All Sessions)

   The wireframe drew this as a vertical list of text cards. Browsing 19+
   sessions that way is a chore: everything looks the same, nothing invites a
   choice, and the only way to see what exists is to scroll past all of it.

   So it is built the way a streaming catalog is built instead:

     · a HERO for the one thing the person is most likely to want next —
       today's pathway session, or the shortest calm session if there is no
       pathway,
     · horizontal RAILS grouped by intent, each scrolling independently, so the
       whole library is visible in a few thumb-flicks rather than a long scroll,
     · covers with real visual identity (see artwork.ts) so a session becomes
       recognisable rather than a line of text.

   The filters stay, and they change the MODE: with a filter on, rails collapse
   into a single grid of results, because rails of one item each are useless.
   That is the same thing a streaming app does when you search.

   Rails are ordered by what a person is most likely to want, not by the order
   the catalog happens to return: what they are already doing, then short
   sessions (the ones people actually fit into a day), then by theme.
   ============================================================================ */

import { Fragment, useMemo, useRef, useState, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import {
  SELF_USE_THEMES,
  DURATIONS,
  durationLabel,
  type SelfUseTheme,
} from '../data/selfuse'
import type { LiveCatalog, ResolvedSession } from '../data/liveCatalog'
import { coverFor, coverStyle } from './artwork'
import type { Duration } from '../types/domain'
import { Icon } from './icons'

interface CatalogProps {
  catalog: LiveCatalog
  /** The slug of today's pathway session, when there is one. */
  featuredSlug?: string
  onOpen: (slug: string) => void
  /** Start immediately at this length, skipping the detail screen. */
  onQuickStart: (slug: string, duration: Duration) => void
  /** The running pathway this session belongs to, when there is one. It is
      shown INSIDE the hero rather than as a second card above it. */
  heroPathway?: { name: string; week: number; weeks: number; done: number; target: number }
  onOpenPathway?: () => void
  /** The MOOD rail — "how are you feeling right now?" — rendered above the
      categories. It is a different way in: you say how you feel and the app
      picks, rather than browsing by theme. Nothing else on this screen
      replaces it, which is why it survived the old Home. */
  moodsSlot?: ReactNode
  /** The PATHWAYS rail, rendered among the categories. A pathway is one more
      thing to browse, not a separate mode with its own tab. */
  pathwaysSlot?: ReactNode
  /** What was typed in the search field in the top bar. A non-empty query
      narrows this screen exactly the way a category does — same results grid,
      same "clear" — because to a person searching and filtering are one act,
      and giving them two different-looking answers would say otherwise. */
  query?: string
  onClearQuery?: () => void
}

interface Rail {
  id: string
  title: string
  subtitle?: string
  items: ResolvedSession[]
}

export function Catalog({
  catalog,
  featuredSlug,
  onOpen,
  onQuickStart,
  heroPathway,
  onOpenPathway,
  moodsSlot,
  pathwaysSlot,
  query = '',
  onClearQuery,
}: CatalogProps) {
  const { t } = useI18n()
  const [dur, setDur] = useState<Duration | 'all'>('all')
  const [theme, setTheme] = useState<SelfUseTheme | 'all'>('all')
  /* Pathways are a category, so choosing them narrows the screen the way any
     other category does — everything else steps aside rather than the person
     scrolling past it. */
  const [onlyPathways, setOnlyPathways] = useState(false)
  const q = query.trim().toLowerCase()
  const filtering = dur !== 'all' || theme !== 'all' || q !== ''

  const all = catalog.browsable

  const filtered = useMemo(
    () =>
      all.filter((s) => {
        if (dur !== 'all' && !s.durations.includes(dur)) return false
        if (theme !== 'all' && s.theme !== theme) return false
        if (!q) return true
        /* The name a person reads, what it is for, and its category — never
           the protocol code. A code is a clinical identifier and must not be
           a way a person finds anything, or typing one would confirm it
           exists and what it treats.

           Matched through `t()`, against the words actually on the cards: the
           library is browsed in Italian or Portuguese, and searching the
           English source strings meant typing what you could see found
           nothing. */
        return [s.name, s.blurb, s.theme].some((f) => t(f ?? '').toLowerCase().includes(q))
      }),
    [all, dur, theme, q, t],
  )

  const hero = useMemo(() => {
    if (featuredSlug) {
      const found = all.find((s) => s.slug === featuredSlug)
      if (found) return found
    }
    // No pathway running: lead with the shortest calm session, which is the
    // lowest-commitment thing in the library and the safest first tap.
    return all.find((s) => s.theme === 'calm' && s.durations.includes(6)) ?? all[0]
  }, [all, featuredSlug])

  const rails = useMemo<Rail[]>(() => {
    if (!all.length) return []
    const byTheme = (th: SelfUseTheme) => all.filter((s) => s.theme === th)
    const out: Rail[] = []

    const quick = all.filter((s) => s.durations.includes(6))
    if (quick.length) {
      out.push({
        id: 'quick',
        title: 'Six minutes',
        subtitle: 'When that is all you have',
        items: quick,
      })
    }

    for (const th of SELF_USE_THEMES) {
      const items = byTheme(th.id)
      if (items.length) out.push({ id: th.id, title: th.label, items })
    }

    const deep = all.filter((s) => s.durations.includes(24))
    if (deep.length) {
      out.push({
        id: 'deep',
        title: 'Longer sessions',
        subtitle: 'For when you will not be interrupted',
        items: deep,
      })
    }

    // Newly published library material, if the catalog carries any.
    const fresh = all.filter((s) => s.fromCatalog)
    if (fresh.length) out.push({ id: 'new', title: 'New in the library', items: fresh })

    return out
  }, [all])

  if (!all.length) {
    return (
      <div className="empty">
        <p>{t('The library is being prepared.')}</p>
        <p className="small muted">{t('Sessions appear here as soon as they are published.')}</p>
      </div>
    )
  }

  return (
    <div className="cat">
      {/* The same choices twice, placed differently: a scrolling chip row on a
          phone, a standing list down the side on a desktop. One state behind
          both, so a category chosen in either place is the category the rails
          answer to.

          It sits OUTSIDE the body box below, and outside the pathways branch:
          a filter is changed from here, so the column cannot be part of what
          applying a filter replaces. */}
      <nav className="cat__side" aria-label={t('Categories')}>
        <button
          className="cat__sideitem"
          aria-pressed={!filtering && !onlyPathways}
          onClick={() => { setDur('all'); setTheme('all'); setOnlyPathways(false) }}
        >
          {t('All themes')}
        </button>
        <button
          className="cat__sideitem"
          aria-pressed={onlyPathways}
          onClick={() => { setDur('all'); setTheme('all'); setOnlyPathways((v) => !v) }}
        >
          {t('Pathways')}
        </button>
        {SELF_USE_THEMES.map((th) => (
          <button
            key={th.id}
            className="cat__sideitem"
            aria-pressed={theme === th.id}
            onClick={() => { setOnlyPathways(false); setTheme(theme === th.id ? 'all' : th.id) }}
          >
            {t(th.label)}
          </button>
        ))}
        <span className="cat__sidesep" aria-hidden="true" />
        {DURATIONS.map((d) => (
          <button
            key={d}
            className="cat__sideitem"
            aria-pressed={dur === d}
            onClick={() => { setOnlyPathways(false); setDur(dur === d ? 'all' : d) }}
          >
            {t(durationLabel(d))} · {d}m
          </button>
        ))}
      </nav>

      {/* Everything the column is NOT: one box, so the column can be as tall as
          it likes without pushing the results down the page. As a bare row of
          grid items the first thing here shared a row with the column and
          inherited its height — with a filter on, that put a 400px hole between
          the "N sessions" heading and the cards. */}
      <div className="cat__body">
        {onlyPathways ? (
          pathwaysSlot
        ) : (
          <>
        {!filtering && hero && (
          <Hero
            session={hero}
            pathway={featuredSlug && hero.slug === featuredSlug ? heroPathway : undefined}
            onOpen={() => onOpen(hero.slug)}
            onStart={(d) => onQuickStart(hero.slug, d)}
            onOpenPathway={onOpenPathway}
          />
        )}

        <div className="cat__filters">
          <div className="filter-row" role="group" aria-label={t('Duration')}>
            <button className="filter-chip" aria-pressed={dur === 'all'} onClick={() => setDur('all')}>
              {t('Any length')}
            </button>
            {DURATIONS.map((d) => (
              <button key={d} className="filter-chip" aria-pressed={dur === d} onClick={() => setDur(d)}>
                {t(durationLabel(d))} {d}m
              </button>
            ))}
          </div>
          <div className="filter-row" role="group" aria-label={t('Theme')}>
            <button className="filter-chip" aria-pressed={theme === 'all'} onClick={() => setTheme('all')}>
              {t('All themes')}
            </button>
            {SELF_USE_THEMES.map((th) => (
              <button key={th.id} className="filter-chip" aria-pressed={theme === th.id} onClick={() => setTheme(th.id)}>
                {t(th.label)}
              </button>
            ))}
          </div>
        </div>

        {!filtering && pathwaysSlot}

        {/* Fewer than two rails (a small catalogue, an early tenant) would never
            reach the insertion point above, so the moods rail goes last. */}
        {!filtering && rails.length < 2 && moodsSlot}

        {filtering ? (
          <>
            <div className="cat__resulthead">
              <h3 className="cat__railtitle">
                {t('{n} sessions', { n: filtered.length })}
              </h3>
              <button
                className="btn btn--quiet"
                onClick={() => { setDur('all'); setTheme('all'); onClearQuery?.() }}
              >
                {t('Clear filters')}
              </button>
            </div>
            {!filtered.length ? (
              <div className="empty">
                <p>{q ? t('Nothing matches "{q}".', { q: query.trim() }) : t('No sessions match.')}</p>
                <button
                  className="btn btn--ghost"
                  onClick={() => { setDur('all'); setTheme('all'); onClearQuery?.() }}
                >
                  {t('Clear filters')}
                </button>
              </div>
            ) : (
              <div className="cat__grid">
                {filtered.map((s) => (
                  <CoverCard key={s.slug} session={s} onOpen={() => onOpen(s.slug)} />
                ))}
              </div>
            )}
          </>
        ) : (
          /* The moods rail is the FOURTH thing on the page, not the first.
             Opening on "how are you feeling right now?" asks a person to report
             on themselves before they have been shown anything — the rail is
             useful once you are already browsing and nothing has caught you,
             which is where it now sits: pathways, two rails, then the moods. */
          rails.map((rail, i) => (
            <Fragment key={rail.id}>
              <RailRow rail={rail} onOpen={onOpen} />
              {i === 1 && moodsSlot}
            </Fragment>
          ))
        )}
          </>
        )}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- hero --- */

/**
 * The one card at the top of the library.
 *
 * There used to be two when a pathway was running: a plain progress card, and
 * this one underneath it with the cover art. Two cards about the same thing,
 * and the good-looking one did not say what it was part of. The pathway's
 * state and the way into it live in here now, and the card above is gone.
 */
function Hero({
  session,
  pathway,
  onOpen,
  onStart,
  onOpenPathway,
}: {
  session: ResolvedSession
  /** Set when this is today's session in a running pathway. */
  pathway?: { name: string; week: number; weeks: number; done: number; target: number }
  onOpen: () => void
  onStart: (d: Duration) => void
  onOpenPathway?: () => void
}) {
  const { t } = useI18n()
  const cover = coverFor(session.slug, session.theme, session.coverUrl)
  const shortest = session.durations.includes(6) ? 6 : session.durations[0]
  const progress = pathway
    ? Math.round(((pathway.week - 1 + (pathway.target ? pathway.done / pathway.target : 0)) / pathway.weeks) * 100)
    : 0

  return (
    <section className="cat-hero" style={coverStyle(cover)}>
      <div className="cat-hero__body">
        <span className="cat-hero__eyebrow">
          {pathway ? t('Today in your pathway') : t('A good place to start')}
        </span>
        <h2 className="cat-hero__title">{t(session.name)}</h2>
        {pathway ? (
          <>
            <p className="cat-hero__blurb">
              {t(pathway.name)} · {t('Week {n} of {total}', { n: pathway.week, total: pathway.weeks })}
              {pathway.target ? ` · ${t('{done} of {total} this week', { done: pathway.done, total: pathway.target })}` : ''}
            </p>
            <span className="cat-hero__bar" aria-hidden="true"><i style={{ width: `${progress}%` }} /></span>
          </>
        ) : (
          <p className="cat-hero__blurb">{t(session.blurb)}</p>
        )}
        <div className="cat-hero__actions">
          <button className="btn btn--light" onClick={() => onStart(shortest)}>
            <Icon name="play" size={17} /> {t('Play')} · {shortest}m
          </button>
          {pathway && onOpenPathway ? (
            <button className="btn btn--light btn--outline" onClick={onOpenPathway}>{t('See pathway')}</button>
          ) : (
            <button className="btn btn--light btn--outline" onClick={onOpen}>{t('More')}</button>
          )}
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------- rail --- */

function RailRow({ rail, onOpen }: { rail: Rail; onOpen: (slug: string) => void }) {
  const { t } = useI18n()
  const track = useRef<HTMLDivElement>(null)

  /* Arrows appear on pointer devices only — a touch screen already has the
     gesture, and an arrow over a card would just eat a tap target. */
  function nudge(dir: -1 | 1) {
    const el = track.current
    if (!el) return
    el.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.8), behavior: 'smooth' })
  }

  return (
    <section className="cat-rail">
      <header className="cat-rail__head">
        <div>
          <h3 className="cat__railtitle">{t(rail.title)}</h3>
          {rail.subtitle && <p className="small muted">{t(rail.subtitle)}</p>}
        </div>
        <div className="cat-rail__arrows">
          <button onClick={() => nudge(-1)} aria-label={t('Scroll left')}>‹</button>
          <button onClick={() => nudge(1)} aria-label={t('Scroll right')}>›</button>
        </div>
      </header>
      <div className="cat-rail__track" ref={track}>
        {rail.items.map((s) => (
          <CoverCard key={s.slug} session={s} onOpen={() => onOpen(s.slug)} />
        ))}
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------- card --- */

export function CoverCard({ session, onOpen }: { session: ResolvedSession; onOpen: () => void }) {
  const { t } = useI18n()
  const cover = coverFor(session.slug, session.theme, session.coverUrl)

  return (
    <button className="cat-card" onClick={onOpen}>
      <span className="cat-card__cover" style={coverStyle(cover)}>
        <span className="cat-card__lengths">
          {session.durations.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </span>
        {/* Only the seeded demo catalog can reach this: a published session
            always has the file its duration promises. */}
        {!session.audioReady && <span className="cat-card__soon">{t('Ambient bed')}</span>}
      </span>
      <span className="cat-card__title">{t(session.name)}</span>
      <span className="cat-card__blurb">{t(session.blurb)}</span>
    </button>
  )
}
