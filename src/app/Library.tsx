/* ============================================================================
   Good Loop — the LIBRARY screen (browse and choose on your own)

   A shelf per moment, cards you scroll sideways: the person looks for the audio
   that fits what is about to happen ("20 minuti prima di un volo"), the way you
   look for something to watch. Nothing here is named after a condition, carries
   a protocol code or is presented as treatment — the clinical material is only
   reachable through the pathway a therapist wrote.

   The one shortcut is "Scegli tu per me": the same three-question check-in as
   before, except it now answers with a library audio instead of composing a
   pathway. Every session started here is still recorded and still reaches the
   person's therapist, with the same before/after check.
   ============================================================================ */

import { useMemo, useState } from 'react'
import { useProtocols } from '../admin/hooks'
import { libraryEntries } from '../data/catalog'
import { LIBRARY_CATEGORIES, type LibraryCategory } from '../data/library'
import { versionLengthSeconds } from '../data/protocols'
import { useI18n } from '../i18n'
import type { CatalogProtocol } from '../data/catalog'
import type { Duration } from '../types/domain'

interface LibraryProps {
  onStart: (launch: { protocolCode: string; duration: Duration }) => void
  /** Open the check-in that picks an audio for the person. */
  onChooseForMe: () => void
}

/** Minutes as the person reads them — the real rendered length when there is
    one, the nominal version length otherwise. */
function minutesOf(p: CatalogProtocol): number {
  const v = p.versions[0]
  if (!v) return 0
  return Math.max(1, Math.round(versionLengthSeconds(p, v.duration) / 60))
}

function firstDuration(p: CatalogProtocol): Duration {
  return p.versions[0]?.duration ?? 12
}

function Card({ p, onStart }: { p: CatalogProtocol; onStart: LibraryProps['onStart'] }) {
  const { t } = useI18n()
  return (
    <button className="libcard" onClick={() => onStart({ protocolCode: p.code, duration: firstDuration(p) })}>
      <span className="libcard__cover" aria-hidden="true">{p.library?.emoji ?? '🎧'}</span>
      <span className="libcard__title">{p.title}</span>
      <span className="libcard__blurb">{p.blurb}</span>
      <span className="libcard__meta">{minutesOf(p)} {t('min')}</span>
    </button>
  )
}

export function Library({ onStart, onChooseForMe }: LibraryProps) {
  const { t } = useI18n()
  const { data: all = [], loading } = useProtocols()
  const [query, setQuery] = useState('')

  const items = useMemo(() => libraryEntries(all), [all])
  const found = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    return items.filter((p) => `${p.title} ${p.blurb}`.toLowerCase().includes(q))
  }, [items, query])

  const shelves: { id: LibraryCategory; label: string; blurb: string; items: CatalogProtocol[] }[] =
    LIBRARY_CATEGORIES.map((c) => ({
      ...c,
      items: items
        .filter((p) => p.library?.category === c.id)
        .sort((a, b) => (a.library?.order ?? 99) - (b.library?.order ?? 99)),
    })).filter((s) => s.items.length > 0)

  return (
    <div className="screen library">
      <header className="library__head">
        <h1 className="display" style={{ marginBottom: 4 }}>{t('Library')}</h1>
        <p className="muted small">{t('Audio sessions to use on your own, whenever they help.')}</p>
      </header>

      <button className="start-cta start-cta--pick" onClick={onChooseForMe}>
        <span className="start-cta__label">{t('Choose one for me')}</span>
        <span className="start-cta__sub">{t('Three questions and we pick the audio for right now')}</span>
      </button>

      <input
        className="library__search"
        type="search"
        value={query}
        placeholder={t('Search — a flight, a meeting, the night…')}
        onChange={(e) => setQuery(e.target.value)}
      />

      {loading && <p className="muted small">{t('Loading…')}</p>}

      {found ? (
        <section className="shelf">
          <h2 className="shelf__title">{t('{n} results', { n: found.length })}</h2>
          <div className="shelf__grid">
            {found.map((p) => <Card key={p.code} p={p} onStart={onStart} />)}
          </div>
          {found.length === 0 && <p className="muted small">{t('Nothing with that name yet.')}</p>}
        </section>
      ) : (
        shelves.map((s) => (
          <section className="shelf" key={s.id}>
            <h2 className="shelf__title">{t(s.label)}</h2>
            <p className="shelf__sub">{t(s.blurb)}</p>
            <div className="shelf__row">
              {s.items.map((p) => <Card key={p.code} p={p} onStart={onStart} />)}
            </div>
          </section>
        ))
      )}

      {!loading && !items.length && (
        <p className="muted small">{t('The library is being prepared — your therapist’s pathway is on the home screen.')}</p>
      )}

      {/* the legal line: what this catalog is, and what it is not */}
      <p className="library__legal">
        {t('These audio sessions support general wellbeing. They are not a treatment and do not replace care from a health professional. If you are following a pathway, you will find it on the home screen.')}
      </p>
    </div>
  )
}
