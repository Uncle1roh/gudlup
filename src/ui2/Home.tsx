/* ============================================================================
   Início — the library (a port of HomeMood.dc.html)

   Top bar, billboard, category chips, horizontal rails. The markup, the
   values and the order are the mockup's; what fills them is what the app
   already knows. Where the app knows nothing, the element is not drawn —
   never invented (brief §8).

   Three rules of the product that outrank the mockup, and why:

     · no clinical code anywhere. The mockup prints GL-CALM on the billboard
       and on every tile; a person using the self-guided layer never sees
       one. The tile carries its THEME instead.
     · the billboard is never a therapy audio, nor anything correlated with
       one. `catalog.browsable` already excludes therapist-only material,
       and the featured session is picked by the library's own rule rather
       than from the pathway a clinician set.
     · the chips are the five themes the catalogue has. Two of the mockup's
       seven ("Menos estresse", "Resiliência") are not themes here, and a
       chip that filters to nothing is a lie.
   ============================================================================ */

import { useMemo, useState, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import { resolveRails, type ExploreRail, type ResolvedRail } from '../data/rails'
import { SELF_USE_THEMES, type SelfUseTheme } from '../data/selfuse'
import type { Duration } from '../types/domain'
import type { LiveCatalog, ResolvedSession } from '../data/liveCatalog'
import { THEME_TINT, tilePosition } from './theme'
import { TopBar } from './TopBar'
import { useStageClaim } from '../components/ambient/stage'

interface HomeProps {
  name: string | null
  catalog: LiveCatalog
  storedRails: ExploreRail[] | null
  /** Slugs listened to before, newest first, already deduped. */
  recent?: string[]
  /** Slugs on this person's own list, newest first. */
  saved?: string[]
  onToggleSave?(slug: string): void
  /** Protocol CODES, most listened first, already k-suppressed server-side. */
  top?: string[]
  query: string
  onQuery(q: string): void
  onOpen(slug: string): void
  /** The legal elements this screen owes (MN-25, LIB-2/3). Not in the mockup. */
  noticeSlot?: ReactNode
  footSlot?: ReactNode
}

export function Home({ name, catalog, storedRails, recent = [], saved = [], onToggleSave, top = [], query, onQuery, onOpen, noticeSlot, footSlot }: HomeProps) {
  const { t } = useI18n()
  const [theme, setTheme] = useState<SelfUseTheme | 'all'>('all')

  /* THE LIBRARY IS A STAGE for the one background the product now has
     (`components/ambient/`): the brand's rings, large, in the corner, over
     the person's own choice of light or dark, with a fade at the foot of the
     window so a card is read against a colour.

     The claim is made HERE and not in `SelfUseApp` on purpose. This
     component is mounted exactly when the library is the screen somebody is
     looking at — not while a session is open over it (that screen carries
     the protocol's cover, `ui2/pageGround.ts`), not on the other four
     destinations, and not during the first run. Mounting is the condition,
     so there is no condition to keep in step. */
  useStageClaim('home')

  const all = catalog.browsable

  const rails = useMemo(() => resolveRails(storedRails, all), [storedRails, all])

  /* "Continuar ouvindo" is only honest where there is a history to build it
     from, and it carries no progress bar: nothing records a position to
     resume (brief §5.5). */
  const continueRail = useMemo<ResolvedRail | null>(() => {
    if (!recent.length) return null
    const bySlug = new Map(all.map((s) => [s.slug, s]))
    const items = recent.map((slug) => bySlug.get(slug)).filter((s): s is ResolvedSession => !!s)
    return items.length ? { id: 'again', title: 'Listen again', items } : null
  }, [recent, all])

  /* The one shelf the person built themselves. It rides above everything an
     admin arranged, and disappears when it is empty rather than standing
     there as a promise of nothing. */
  const myList = useMemo<ResolvedRail | null>(() => {
    if (!saved.length) return null
    const bySlug = new Map(all.map((s) => [s.slug, s]))
    const items = saved.map((slug) => bySlug.get(slug)).filter((s): s is ResolvedSession => !!s)
    return items.length ? { id: 'mine', title: 'My List', items } : null
  }, [saved, all])

  /* The chart arrives as protocol CODES, because that is what the sessions
     table records; the library is addressed by slug. Anything the catalogue
     cannot resolve is dropped rather than guessed at. */
  const topRail = useMemo<ResolvedRail | null>(() => {
    if (!top.length) return null
    const byCode = new Map(all.filter((s) => s.protocolCode).map((s) => [s.protocolCode, s]))
    const items = top.map((code) => byCode.get(code)).filter((s): s is ResolvedSession => !!s)
    return items.length ? { id: 'top', title: 'Top 10 most listened', items } : null
  }, [top, all])

  const shown = useMemo(() => {
    const base = [myList, continueRail, ...rails, topRail].filter((r): r is ResolvedRail => !!r)
    if (theme === 'all') return base
    return base
      .map((r) => ({ ...r, items: r.items.filter((s) => s.theme === theme) }))
      .filter((r) => r.items.length)
  }, [myList, continueRail, rails, topRail, theme])

  const searching = query.trim().length > 0
  const hits = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return all.filter((s) => `${t(s.name)} ${t(s.blurb)}`.toLowerCase().includes(q))
  }, [all, query, t])

  if (catalog.loading) return <p className="small muted">{t('Loading…')}</p>

  return (
    <>
      {/* ---------------------------------------------------- the ground ---
          Nothing is drawn here any more.

          There used to be two layers at the head of this fragment: a flat
          fill fixed to the window, and the app's mountain photograph, 760px
          tall, fading into it. Both are gone — the window is dressed by
          `components/ambient/AmbientBackground`, mounted once at the app
          root, which is also what dresses the landing page and the door. The
          shelves move up into the room the picture used to take.

          `.gl-homefill`, `.gl-homebg` and the `:has()` rule that pulled the
          column up under the Help now strip went with them (shell.css, "the
          Home ridge"). The photograph itself stays in `public/media/`: it is
          still the ground of the other four destinations. */}

      {/* ------------------------------------------------------- top bar --- */}
      {/* The same bar as every other screen of the surface, from the same
          component — this corner is where it was designed, and the deep
          screens copied it rather than keeping a second one of their own
          (see `ui2/TopBar.tsx`). `over` still marks this one out: the rings
          are behind it here, where the other screens have the app's own
          veiled photograph. */}
      <TopBar name={name} over />

      {/* What this place is, and what it is not. Two lines, deliberately
          unequal: the first is editorial and says what a person gets; the
          second is LIB-1 from the legal catalogue, smaller, and says what
          it is not a substitute for. They are one block — the column's own
          30px rhythm between them read as two unrelated sentences. */}
      <div className="gl-libhead">
        <p className="gl-libline">{t('Guided pauses for every moment of your day')}</p>
        {noticeSlot}
      </div>

      {/* THE BILLBOARD IS GONE (POs, 2026-11-06). It was 420px of one
          protocol — a 76px title, a blurb and a play button — chosen by the
          library itself as "a good place to start", and it pushed every
          shelf below the fold. A person opening this screen is choosing,
          and the thing that helps them choose is the shelves. What is left
          of that row is the search field, which is the other half of
          choosing.

          The pick is gone too, not hidden: `featured` named one protocol as
          the app's recommendation on a screen whose whole point is that
          nothing here is prescribed. */}
      <section style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'flex-end', gap: 24, padding: '20px 8px 0' }}>
        <label className="glass" style={{ flex: '0 1 440px', height: 60, borderRadius: 999, display: 'flex', alignItems: 'center', gap: 12, padding: '0 22px', alignSelf: 'flex-end', position: 'relative' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <span className="gl-sr">{t('Search sessions')}</span>
          <input
            className="gl-search"
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={t('Search sessions')}
            style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink)', fontFamily: "'DM Sans', sans-serif", fontSize: 16 }}
          />
        </label>
      </section>

      {/* --------------------------------------------------------- chips --- */}
      <div role="tablist" aria-label={t('Categories')} style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {([{ id: 'all' as const, label: 'All themes' }, ...SELF_USE_THEMES]).map((c) => {
          const on = theme === c.id
          return (
            <button
              key={c.id}
              role="tab"
              type="button"
              className="glass-btn"
              aria-selected={on}
              onClick={() => setTheme(c.id as SelfUseTheme | 'all')}
              style={{
                height: 42, padding: '0 18px', borderRadius: 999,
                fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 500,
              }}
            >
              {t(c.label)}
            </button>
          )
        })}
      </div>

      {/* --------------------------------------------------------- rails --- */}
      {searching ? (
        <Rail
          title={t('Results for “{q}”', { q: query.trim() })}
          items={hits}
          empty={t('Nothing with that name yet.')}
          onOpen={onOpen}
          saved={saved}
          onToggleSave={onToggleSave}
        />
      ) : (
        shown.map((r) => (
          <Rail
            key={r.id}
            title={t(r.title)}
            subtitle={r.subtitle ? t(r.subtitle) : undefined}
            items={r.items}
            onOpen={onOpen}
            saved={saved}
            onToggleSave={onToggleSave}
          />
        ))
      )}

      {footSlot}
    </>
  )
}

/* ---------------------------------------------------------------- rail --- */

function Rail({ title, subtitle, items, empty, onOpen, saved = [], onToggleSave }: {
  title: string
  subtitle?: string
  items: ResolvedSession[]
  empty?: string
  onOpen(slug: string): void
  saved?: string[]
  onToggleSave?(slug: string): void
}) {
  const { t } = useI18n()
  if (!items.length) return empty ? <p className="small muted">{empty}</p> : null

  return (
    <section aria-label={title} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 500, fontSize: 22 }}>
          {title}
          {subtitle && (
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 400, color: 'var(--ink-2)', marginLeft: 8 }}>
              {subtitle}
            </span>
          )}
        </h2>
      </div>
      <div className="rail" style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 10, scrollSnapType: 'x mandatory' }}>
        {items.map((s, i) => (
          <Tile
            key={s.slug}
            session={s}
            index={i}
            onOpen={() => onOpen(s.slug)}
            label={t(themeLabel(s.theme))}
            saved={saved.includes(s.slug)}
            onToggleSave={onToggleSave && (() => onToggleSave(s.slug))}
          />
        ))}
      </div>
    </section>
  )
}

function Tile({ session, index, onOpen, label, saved, onToggleSave }: {
  session: ResolvedSession
  index: number
  onOpen(): void
  label: string
  saved?: boolean
  onToggleSave?(): void
}) {
  const { t } = useI18n()
  const title = t(session.name)
  const mins = shortestOf(session)

  /* A cover a PO uploaded wins; otherwise the shared photograph, moved under
     each square — which is how a shelf of covers comes out of one image. */
  const fallback = session.coverUrl ? undefined : { backgroundPosition: tilePosition(index) }

  /* A square, and the words UNDER it rather than inside a box.
     The card is a wrapper, not one big button: the save toggle is a control
     of its own and a button inside a button is not markup a browser keeps.
     The tap target is the transparent button at the end, over the whole
     card, so the lines below the cover open the session too. */
  return (
    <div className="gl-card gl-tile" style={{ scrollSnapAlign: 'start' }}>
      <span className="gl-card__cover">
        {/* The picture and everything printed on it is one image to a screen
            reader — the save toggle is deliberately outside it, or `role=img`
            would hide a control inside its own subtree. */}
        <span
          className={session.coverUrl ? 'gl-card__art' : 'gl-card__art tile'}
          style={fallback}
          role="img"
          aria-label={title}
        >
          {session.coverUrl
            ? <img className="gl-card__img" src={session.coverUrl} alt="" />
            : <span aria-hidden="true" className="gl-card__tint" style={{ background: THEME_TINT[session.theme] }} />}
          <span aria-hidden="true" className="gl-card__shade" />

          <span aria-hidden="true" className="gl-card__seal">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="3">
              <circle cx="12" cy="12" r="8" />
            </svg>
            GOOD LOOP
          </span>

          {/* The same words as the line below the cover, printed large on the
              picture. Hidden from a screen reader rather than said twice. */}
          <span aria-hidden="true" className={onToggleSave ? 'gl-card__over is-narrow' : 'gl-card__over'}>
            {title}
          </span>
        </span>

        {onToggleSave && (
          <button
            type="button"
            className="gl-save"
            onClick={onToggleSave}
            aria-pressed={!!saved}
            aria-label={saved ? t('Remove from My List') : t('Add to My List')}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 4h12v16l-6-4-6 4z" />
            </svg>
          </button>
        )}
      </span>

      <span className="gl-card__name">{title}</span>
      {/* Where the mockup prints the protocol code, the theme goes. */}
      <span className="gl-card__meta">{label} · {mins} min</span>

      <button type="button" className="gl-card__hit" onClick={onOpen} aria-label={title} />
    </div>
  )
}

/* --------------------------------------------------------------- bits --- */

function shortestOf(s: ResolvedSession): Duration {
  return s.durations.includes(6) ? 6 : s.durations[0]
}

function themeLabel(id: SelfUseTheme): string {
  return SELF_USE_THEMES.find((th) => th.id === id)?.label ?? ''
}

/** Up to two letters from the name; nothing when there is no name. */
export function initialsOf(name: string | null): string {
  if (!name) return ''
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return ''
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}
