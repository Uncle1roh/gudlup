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

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import { greeting } from '../selfuse/greeting'
import { useDataProvider } from '../data/provider'
import { resolveRails, type ExploreRail, type ResolvedRail } from '../data/rails'
import { SELF_USE_THEMES, durationLabel, type SelfUseTheme } from '../data/selfuse'
import type { Duration } from '../types/domain'
import type { LiveCatalog, ResolvedSession } from '../data/liveCatalog'
import { THEME_ICON, THEME_TINT, tilePosition } from './theme'
import { CheckIn, MoodChip } from './CheckIn'

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
  onStart(slug: string, duration: Duration): void
  /** The legal elements this screen owes (MN-25, LIB-2/3). Not in the mockup. */
  noticeSlot?: ReactNode
  footSlot?: ReactNode
}

export function Home({ name, catalog, storedRails, recent = [], saved = [], onToggleSave, top = [], query, onQuery, onOpen, onStart, noticeSlot, footSlot }: HomeProps) {
  const { t } = useI18n()
  const dp = useDataProvider()
  const [theme, setTheme] = useState<SelfUseTheme | 'all'>('all')
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [loops, setLoops] = useState<number | null>(null)

  /* The wallet the Loops pill shows. Read-only, the same call the Benefits
     screen makes; a failure leaves the pill out rather than showing a zero
     that is not the person's balance. */
  useEffect(() => {
    let alive = true
    void dp.getWallet()
      .then((w) => { if (alive) setLoops(w.loops) })
      .catch(() => { if (alive) setLoops(null) })
    return () => { alive = false }
  }, [dp])

  const all = catalog.browsable

  /* The billboard. Not the pathway's session of the day: the self-guided
     library leads with its own lowest-commitment start, so nothing on this
     screen is correlated with what a clinician set. */
  const featured = useMemo(
    () => all.find((s) => s.theme === 'calm' && s.durations.includes(6)) ?? all[0],
    [all],
  )

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
      {/* ------------------------------------------------------- top bar --- */}
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, position: 'relative', zIndex: 5 }}>
        <span className="gl-wordmark">goodloop</span>

        <div style={{ flex: '0 1 560px', display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
          <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, whiteSpace: 'nowrap' }}>
            {name ? `${t(greeting())}, ${name}` : t(greeting())}
          </span>
          <MoodChip open={checkInOpen} onToggle={() => setCheckInOpen((v) => !v)} />
          {checkInOpen && <CheckIn onClose={() => setCheckInOpen(false)} />}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {loops !== null && (
            <span className="glass-btn" style={{ height: 44, padding: '0 16px', borderRadius: 999, display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 600 }}>
              {t('{n} Loops', { n: loops.toLocaleString() })}
            </span>
          )}
          <span
            aria-hidden="true"
            style={{ width: 44, height: 44, borderRadius: '50%', background: '#E89D64', color: '#2a1608', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}
          >
            {initialsOf(name)}
          </span>
        </div>
      </header>

      {noticeSlot}

      {/* ----------------------------------------------------- billboard --- */}
      <section style={{ minHeight: 420, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, padding: '36px 8px 0' }}>
        {featured && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 600 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-2)' }}>
              <span aria-hidden="true" style={{ width: 28, height: 2, background: 'currentColor' }} />
              {t('A good place to start')}
            </span>

            <h1 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 400, fontSize: 76, lineHeight: 0.95, letterSpacing: '-0.03em' }}>
              {t(featured.name)}
            </h1>

            {/* The mockup's meta line, minus the protocol code and minus the
                voice: the self-guided catalogue does not carry one. */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 14, color: 'var(--ink-2)' }}>
              <span>{featured.durations.map((d) => `${t(durationLabel(d))} ${d} min`).join(' · ')}</span>
            </div>

            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.55, color: 'var(--ink-2)' }}>{t(featured.about || featured.blurb)}</p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 6 }}>
              <button
                type="button"
                onClick={() => onStart(featured.slug, shortestOf(featured))}
                style={{ height: 56, padding: '0 28px 0 10px', borderRadius: 999, background: 'var(--act-bg)', color: 'var(--act-fg)', display: 'flex', alignItems: 'center', gap: 14, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 16, fontFamily: "'DM Sans', sans-serif", transition: 'background-color 1.5s ease, color 1.5s ease' }}
              >
                <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: '50%', background: '#3DB189', color: '#06140f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor" /></svg>
                </span>
                {t('Play')} · {shortestOf(featured)}m
              </button>
              <button
                type="button"
                className="glass-btn"
                onClick={() => onOpen(featured.slug)}
                style={{ height: 56, padding: '0 24px', borderRadius: 999, display: 'flex', alignItems: 'center', fontWeight: 500, fontSize: 15, fontFamily: "'DM Sans', sans-serif" }}
              >
                {t('More')}
              </button>
            </div>
          </div>
        )}

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
              aria-selected={on}
              onClick={() => setTheme(c.id as SelfUseTheme | 'all')}
              style={{
                height: 42, padding: '0 18px', borderRadius: 999, cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 500,
                border: '1px solid var(--line)', WebkitBackdropFilter: 'blur(14px)', backdropFilter: 'blur(14px)',
                background: on ? 'var(--act-bg)' : 'var(--btn)', color: on ? 'var(--act-fg)' : 'var(--ink)',
                transition: 'background-color 1.5s ease, color 1.5s ease',
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
  /* A cover a PO uploaded wins; otherwise the shared photograph, moved. */
  const cover = session.coverUrl
    ? { backgroundImage: `url(${JSON.stringify(session.coverUrl)})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { backgroundPosition: tilePosition(index) }

  /* The tile is a wrapper rather than one big button: the save toggle is a
     control of its own, and a button inside a button is not markup a browser
     will keep. The tile's own button fills the wrapper underneath it. */
  return (
    <div style={{ flex: '0 0 300px', height: 170, position: 'relative', scrollSnapAlign: 'start' }}>
      <button
        type="button"
        className={session.coverUrl ? 'gl-tile' : 'gl-tile tile'}
        onClick={onOpen}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          borderRadius: 22, overflow: 'hidden', textAlign: 'left', padding: 0, cursor: 'pointer',
          color: '#FAF8DF', border: '1px solid rgba(250,248,223,.14)', ...cover,
        }}
      >
        <span aria-hidden="true" style={{ position: 'absolute', inset: 0, background: THEME_TINT[session.theme] }} />
        <span aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(4,14,11,0) 30%, rgba(4,14,11,.85) 100%)' }} />

        <span aria-hidden="true" style={{ position: 'absolute', left: 16, top: 14, width: 40, height: 40, borderRadius: 12, background: 'rgba(250,248,223,.16)', border: '1px solid rgba(250,248,223,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d={THEME_ICON[session.theme]} />
          </svg>
        </span>

        <span style={{ position: 'absolute', right: 14, top: 14, padding: '4px 10px', borderRadius: 999, background: 'rgba(6,20,15,.55)', fontSize: 12 }}>
          {t(durationLabel(shortestOf(session)))}
        </span>

        <span style={{ position: 'absolute', left: 16, right: 16, bottom: 14, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Where the mockup prints the protocol code, the theme goes. */}
          <span style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(250,248,223,.82)' }}>{label}</span>
          <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: 19, fontWeight: 500, lineHeight: 1.15 }}>{t(session.name)}</span>
        </span>
      </button>

      {onToggleSave && (
        <button
          type="button"
          className="gl-save"
          onClick={onToggleSave}
          aria-pressed={!!saved}
          aria-label={saved ? t('Remove from My List') : t('Add to My List')}
          style={{
            position: 'absolute', right: 14, bottom: 14, width: 34, height: 34, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            background: 'rgba(6,20,15,.55)', border: '1px solid rgba(250,248,223,.25)', color: '#FAF8DF',
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 4h12v16l-6-4-6 4z" />
          </svg>
        </button>
      )}
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
