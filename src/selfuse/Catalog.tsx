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

import { useMemo, useRef, useState } from 'react'
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

interface CatalogProps {
  catalog: LiveCatalog
  /** The slug of today's pathway session, when there is one. */
  featuredSlug?: string
  onOpen: (slug: string) => void
  /** Start immediately at this length, skipping the detail screen. */
  onQuickStart: (slug: string, duration: Duration) => void
}

interface Rail {
  id: string
  title: string
  subtitle?: string
  items: ResolvedSession[]
}

export function Catalog({ catalog, featuredSlug, onOpen, onQuickStart }: CatalogProps) {
  const { t } = useI18n()
  const [dur, setDur] = useState<Duration | 'all'>('all')
  const [theme, setTheme] = useState<SelfUseTheme | 'all'>('all')
  const filtering = dur !== 'all' || theme !== 'all'

  const all = catalog.browsable

  const filtered = useMemo(
    () =>
      all.filter(
        (s) => (dur === 'all' || s.durations.includes(dur)) && (theme === 'all' || s.theme === theme),
      ),
    [all, dur, theme],
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
      {!filtering && hero && (
        <Hero
          session={hero}
          isPathway={Boolean(featuredSlug) && hero.slug === featuredSlug}
          onOpen={() => onOpen(hero.slug)}
          onStart={(d) => onQuickStart(hero.slug, d)}
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

      {filtering ? (
        <>
          <div className="cat__resulthead">
            <h3 className="cat__railtitle">
              {t('{n} sessions', { n: filtered.length })}
            </h3>
            <button className="btn btn--quiet" onClick={() => { setDur('all'); setTheme('all') }}>
              {t('Clear filters')}
            </button>
          </div>
          {!filtered.length ? (
            <div className="empty">
              <p>{t('No sessions match.')}</p>
              <button className="btn btn--ghost" onClick={() => { setDur('all'); setTheme('all') }}>
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
        rails.map((rail) => <RailRow key={rail.id} rail={rail} onOpen={onOpen} />)
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- hero --- */

function Hero({
  session,
  isPathway,
  onOpen,
  onStart,
}: {
  session: ResolvedSession
  isPathway: boolean
  onOpen: () => void
  onStart: (d: Duration) => void
}) {
  const { t } = useI18n()
  const cover = coverFor(session.slug, session.theme)
  const shortest = session.durations.includes(6) ? 6 : session.durations[0]

  return (
    <section className="cat-hero" style={coverStyle(cover)}>
      <div className="cat-hero__body">
        <span className="cat-hero__eyebrow">
          {isPathway ? t('Today in your pathway') : t('A good place to start')}
        </span>
        <h2 className="cat-hero__title">{t(session.name)}</h2>
        <p className="cat-hero__blurb">{t(session.blurb)}</p>
        <div className="cat-hero__actions">
          <button className="btn btn--light" onClick={() => onStart(shortest)}>
            ▶ {t('Play')} · {shortest}m
          </button>
          <button className="btn btn--light btn--outline" onClick={onOpen}>{t('More')}</button>
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
  const cover = coverFor(session.slug, session.theme)

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
