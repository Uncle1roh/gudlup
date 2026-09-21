/* ============================================================================
   Admin — the rails on the Home screen

   A rail is a row in the library a person browses: a title, and the sessions
   in it. They were written in code, so the shelf could only be rearranged by
   a developer, and nobody outside the repo could even read what it was.

   This is that shelf, editable. Three rules it keeps:

   · WHAT IS THERE NOW IS THE STARTING POINT. An empty page would invite an
     operator to build a library from scratch and publish a worse one; the
     editor opens on the rails the app is serving today, whether those come
     from the database or from the code defaults.
   · NOTHING IS SAVED UNTIL SAVE. Reordering and renaming are cheap to try,
     and a half-finished shelf must never reach a person's Home screen.
   · THE SHELF IS WHAT THIS PAGE HOLDS. Saving replaces the whole set, so a
     rail deleted here is deleted there — and publishing an empty set means
     "go back to the built-in rails", not "show nothing".
   ============================================================================ */

import { useEffect, useMemo, useState } from 'react'
import { useDataProvider } from '../data/provider'
import { useLiveCatalog } from '../data/liveCatalog'
import { useI18n } from '../i18n'
import { newRail, railsFromDefaults, resolveRails, type ExploreRail } from '../data/rails'

export function ExploreRails({ actor }: { actor: string }) {
  const dp = useDataProvider()
  const { locale } = useI18n()
  const catalog = useLiveCatalog(locale)
  const sessions = catalog.browsable

  const [rails, setRails] = useState<ExploreRail[] | null>(null)
  const [stored, setStored] = useState<ExploreRail[]>([])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  /* Open on what the app is actually serving: the stored rails when there are
     any, otherwise the built-in ones written out as editable rows. */
  useEffect(() => {
    if (rails || !sessions.length) return
    let alive = true
    void dp.listExploreRails()
      .then((rows) => {
        if (!alive) return
        setStored(rows)
        setRails(rows.length ? rows : railsFromDefaults(sessions))
      })
      .catch(() => { if (alive) setRails(railsFromDefaults(sessions)) })
    return () => { alive = false }
  }, [dp, sessions, rails])

  const bySlug = useMemo(() => new Map(sessions.map((s) => [s.slug, s])), [sessions])
  const dirty = useMemo(() => JSON.stringify(rails ?? []) !== JSON.stringify(stored), [rails, stored])

  function patch(id: string, fn: (r: ExploreRail) => ExploreRail) {
    setRails((rs) => (rs ?? []).map((r) => (r.id === id ? fn(r) : r)))
  }
  function move(id: string, by: -1 | 1) {
    setRails((rs) => {
      const list = [...(rs ?? [])]
      const i = list.findIndex((r) => r.id === id)
      const j = i + by
      if (i < 0 || j < 0 || j >= list.length) return list
      ;[list[i], list[j]] = [list[j], list[i]]
      return list.map((r, k) => ({ ...r, position: k }))
    })
  }
  function toggleSlug(id: string, slug: string) {
    patch(id, (r) => ({
      ...r,
      slugs: r.slugs.includes(slug) ? r.slugs.filter((s) => s !== slug) : [...r.slugs, slug],
    }))
  }

  async function save() {
    if (!rails) return
    const named = rails.filter((r) => r.title.trim())
    const unnamed = rails.length - named.length
    setBusy(true); setError(null); setStatus(null)
    try {
      const ordered = named.map((r, i) => ({ ...r, title: r.title.trim(), position: i }))
      await dp.saveExploreRails(ordered)
      /* Read back: a write that row-level security refused must not look like
         a published shelf (the same rule the catalog publish follows). */
      const after = await dp.listExploreRails()
      setStored(after)
      setRails(after.length ? after : railsFromDefaults(sessions))
      await dp.logAudit({ actor, action: 'explore_rails.saved', detail: `${ordered.length} rail` }).catch(() => undefined)
      setStatus(
        ordered.length
          ? `Salvato: ${ordered.length} rail in linea${unnamed ? ` · ${unnamed} senza titolo, non salvat${unnamed === 1 ? 'a' : 'e'}` : ''}.`
          : 'Salvato: nessun rail definito, l’app torna agli scaffali predefiniti.',
      )
    } catch (e) {
      setError(`Non salvato: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  function revert() {
    setRails(stored.length ? stored : railsFromDefaults(sessions))
    setStatus(null); setError(null)
  }

  const preview = useMemo(() => resolveRails(rails, sessions), [rails, sessions])

  return (
    <div className="adm-page">
      <header className="adm-page__head">
        <h1 className="b2b-h1">Scaffali della libreria</h1>
        <p className="b2b-sub">
          Le righe che una persona vede nella Home dell’app: il titolo e le sessioni dentro.
          Nessuna modifica è in linea finché non premi Salva. Salvare senza nessun rail riporta l’app
          agli scaffali predefiniti (sei minuti, i temi, sessioni lunghe, novità).
        </p>
      </header>

      {!rails && <p className="b2b-sub">Caricamento degli scaffali…</p>}

      {rails && (
        <>
          <div className="adm-plain__actions">
            <button className="b2b-btn b2b-btn--primary" disabled={busy || !dirty} onClick={() => void save()}>
              {busy ? 'Salvataggio…' : 'Salva gli scaffali'}
            </button>
            <button className="b2b-btn" disabled={busy || !dirty} onClick={revert}>Annulla le modifiche</button>
            <button
              className="b2b-btn"
              disabled={busy}
              onClick={() => setRails([...(rails ?? []), newRail(rails?.length ?? 0)])}
            >
              ＋ Nuovo scaffale
            </button>
            <span className="b2b-sub">
              {stored.length ? `${stored.length} salvati` : 'nessuno salvato — l’app usa i predefiniti'}
              {dirty ? ' · modifiche non salvate' : ''}
            </span>
          </div>

          {status && <div className="adm-plain__status">{status}</div>}
          {error && <div className="adm-plain__status adm-plain__status--err">{error}</div>}

          {!rails.length && (
            <div className="adm-note">
              Nessuno scaffale. Salvando così, l’app mostra gli scaffali predefiniti.
            </div>
          )}

          <div className="adm-rails">
            {rails.map((r, i) => {
              const open = openId === r.id
              const chosen = r.slugs.map((s) => bySlug.get(s)).filter(Boolean)
              const missing = r.slugs.length - chosen.length
              return (
                <section key={r.id} className={`adm-rail${r.enabled ? '' : ' is-off'}`}>
                  <div className="adm-rail__head">
                    <input
                      className="b2b-input adm-rail__title"
                      value={r.title}
                      placeholder="Titolo dello scaffale — es. Sei minuti"
                      onChange={(e) => patch(r.id, (x) => ({ ...x, title: e.target.value }))}
                    />
                    <input
                      className="b2b-input"
                      value={r.subtitle ?? ''}
                      placeholder="Sottotitolo (facoltativo)"
                      onChange={(e) => patch(r.id, (x) => ({ ...x, subtitle: e.target.value }))}
                    />
                    <div className="adm-rail__acts">
                      <button className="b2b-btn" disabled={i === 0} onClick={() => move(r.id, -1)} title="Sposta su">↑</button>
                      <button className="b2b-btn" disabled={i === rails.length - 1} onClick={() => move(r.id, 1)} title="Sposta giù">↓</button>
                      <button
                        className={`adm-toggle ${r.enabled ? 'is-on' : ''}`}
                        onClick={() => patch(r.id, (x) => ({ ...x, enabled: !x.enabled }))}
                        title={r.enabled ? 'Visibile nell’app' : 'Nascosto'}
                      >
                        <span className="adm-toggle__knob" />
                        <span className="adm-toggle__txt">{r.enabled ? 'Visibile' : 'Nascosto'}</span>
                      </button>
                      <button
                        className="adm-del"
                        onClick={() => setRails((rs) => (rs ?? []).filter((x) => x.id !== r.id))}
                        title="Elimina lo scaffale"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <div className="adm-rail__body">
                    <span className="b2b-sub">
                      {chosen.length} session{chosen.length === 1 ? 'e' : 'i'}
                      {missing > 0 && ` · ${missing} non più nel catalogo (verranno ignorate)`}
                    </span>
                    <div className="adm-rail__chips">
                      {chosen.map((s) => (
                        <button
                          key={s!.slug}
                          className="adm-chip"
                          onClick={() => toggleSlug(r.id, s!.slug)}
                          title="Togli da questo scaffale"
                        >
                          {s!.name} ✕
                        </button>
                      ))}
                      {!chosen.length && <span className="adm-muted">Nessuna sessione — questo scaffale non verrà mostrato.</span>}
                    </div>
                    <button className="b2b-btn" onClick={() => setOpenId(open ? null : r.id)}>
                      {open ? 'Chiudi l’elenco' : 'Scegli le sessioni'}
                    </button>

                    {open && (
                      <div className="adm-rail__picker">
                        <input
                          className="b2b-input"
                          value={filter}
                          placeholder="Cerca una sessione…"
                          onChange={(e) => setFilter(e.target.value)}
                        />
                        <ul className="adm-rail__list">
                          {sessions
                            .filter((s) => !filter || s.name.toLowerCase().includes(filter.toLowerCase()))
                            .map((s) => (
                              <li key={s.slug}>
                                <label className="adm-rail__opt">
                                  <input
                                    type="checkbox"
                                    checked={r.slugs.includes(s.slug)}
                                    onChange={() => toggleSlug(r.id, s.slug)}
                                  />
                                  <span>{s.name}</span>
                                  <span className="adm-muted">
                                    {s.durations.join(' · ')} min{s.available ? '' : ' · non pubblicata'}
                                  </span>
                                </label>
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </section>
              )
            })}
          </div>

          {/* What the Home screen will actually render — including the rule
              that an empty rail is dropped rather than shown. */}
          <h2 className="adm-h2">Come apparirà</h2>
          <ol className="adm-rail__preview">
            {preview.map((r) => (
              <li key={r.id}>
                <b>{r.title}</b>
                {r.subtitle && <span className="adm-muted"> · {r.subtitle}</span>}
                <span className="adm-muted"> — {r.items.length} session{r.items.length === 1 ? 'e' : 'i'}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}
