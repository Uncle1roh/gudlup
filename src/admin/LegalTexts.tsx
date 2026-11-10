/* ============================================================================
   Admin — Avvisi legali

   The ~120 registered disclaimers, editable in three languages, with the
   version register wired to the save button.

   WHY THIS SCREEN EXISTS. The sentences live in `legal/messages.ts`,
   compiled into the build, so until now a comma could only be fixed by
   somebody with the repository. The POs asked for a page to edit and review
   them (2026-11-10). "Conformità → Testi legali" is the version REGISTER —
   it records which text was in force when, and has nothing to edit.

   WHAT IT MAY AND MAY NOT TOUCH. The words of one message in one language,
   and nothing else. The id, the tier, the market and the fallback chain are
   the build's: an edit here changes what a sentence SAYS, never which
   sentence is shown, where, or to whom. Clearing a box puts the shipped
   sentence back rather than showing a blank disclaimer.

   THE VERSION IS THE PRICE OF SAVING. The legal framework keeps a register
   of what was in force when (LEG-07 / ADM-06), and a console that could
   rewrite a tier-A disclaimer without touching it would turn that register
   into a document about something other than what people read. So the save
   asks for a new version and a line of changelog, and writes the register
   row in the same call as the text (`saveLegalTexts`).

   The long documents — Terms, Privacy Notice — are NOT here. They are
   structured blocks with per-market variants, not free text, and editing
   them is a different screen; this page links out to them for review.
   ============================================================================ */

import { useEffect, useMemo, useState } from 'react'
import { useDataProvider } from '../data/provider'
import { useAuth } from '../auth/auth'
import { LEGAL_MESSAGES, type LegalMessage, type LegalMessageId } from '../legal/messages'
import { LEGAL_VERSION } from '../legal/types'
import { setLegalOverrides, type LegalTextOverride } from '../legal/overrides'
import type { Locale } from '../i18n'

const LOCALES: { id: Locale; label: string }[] = [
  { id: 'it', label: 'Italiano' },
  { id: 'pt-BR', label: 'Português' },
  { id: 'en', label: 'English' },
]

/** The id, grouped by the prefix it carries, which is where it is used. */
const GROUPS: { prefix: string; label: string }[] = [
  { prefix: 'WEB', label: 'Sito pubblico' },
  { prefix: 'ONB', label: 'Primo accesso e consensi' },
  { prefix: 'CRS', label: 'Crisi ed emergenze' },
  { prefix: 'LIB', label: 'Libreria' },
  { prefix: 'PLY', label: 'Riproduzione' },
  { prefix: 'SES', label: 'Sedute' },
  { prefix: 'PRF', label: 'Professionisti' },
  { prefix: 'SPN', label: 'Aziende' },
  { prefix: 'DAT', label: 'Dati' },
  { prefix: 'CHK', label: 'Pagamenti' },
  { prefix: 'NAV', label: 'Navigazione' },
  { prefix: 'LEG', label: 'Pagina legale' },
  { prefix: 'ADM', label: 'Console' },
  { prefix: 'MN', label: 'Note' },
]

function groupOf(id: string): string {
  const pre = id.split('-')[0].toUpperCase()
  return GROUPS.find((g) => g.prefix === pre)?.label ?? 'Altro'
}

/** What the build ships for this id in this language. */
function shipped(id: LegalMessageId, locale: Locale): string {
  const m = LEGAL_MESSAGES[id] as LegalMessage
  return (locale === 'en' ? m.en : m[locale]) || m.en
}

type Edits = Record<string, string>
const keyOf = (id: string, locale: Locale) => `${id}|${locale}`

export function LegalTexts() {
  const dp = useDataProvider()
  const { user } = useAuth()
  const [saved, setSaved] = useState<LegalTextOverride[]>([])
  const [edits, setEdits] = useState<Edits>({})
  const [query, setQuery] = useState('')
  const [onlyChanged, setOnlyChanged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState('')
  const [changelog, setChangelog] = useState('')

  useEffect(() => {
    let alive = true
    dp.listLegalTexts()
      .then((rows) => { if (alive) setSaved(rows) })
      .catch((e) => { if (alive) setError(String((e as Error).message ?? e)) })
    return () => { alive = false }
  }, [dp])

  /** The live value of a box: what is being typed, else what is stored, else
      the shipped sentence. */
  const current = (id: LegalMessageId, locale: Locale): string => {
    const k = keyOf(id, locale)
    if (k in edits) return edits[k]
    return saved.find((r) => r.refId === id && r.locale === locale)?.body ?? shipped(id, locale)
  }

  /** Is this box different from what the build ships? */
  const rewritten = (id: LegalMessageId, locale: Locale) => current(id, locale).trim() !== shipped(id, locale).trim()

  const ids = useMemo(() => (Object.keys(LEGAL_MESSAGES) as LegalMessageId[]).sort(), [])
  const shownIds = useMemo(() => {
    const q = query.trim().toLowerCase()
    return ids.filter((id) => {
      if (onlyChanged && !LOCALES.some((l) => rewritten(id, l.id))) return false
      if (!q) return true
      if (id.toLowerCase().includes(q)) return true
      return LOCALES.some((l) => current(id, l.id).toLowerCase().includes(q))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, query, onlyChanged, edits, saved])

  /* Every box that differs from the build — which is exactly what a save
     writes, and what the count on the button says. */
  const pending = useMemo(() => {
    const out: { refId: string; locale: Locale; body: string }[] = []
    for (const id of ids) {
      for (const l of LOCALES) {
        const k = keyOf(id, l.id)
        const stored = saved.find((r) => r.refId === id && r.locale === l.id)?.body
        const live = k in edits ? edits[k] : stored ?? shipped(id, l.id)
        const isShipped = live.trim() === shipped(id, l.id).trim()
        /* A box back at the shipped wording with a stored row behind it is a
           row to DELETE, so it is sent with an empty body. */
        if (isShipped && stored !== undefined) out.push({ refId: id, locale: l.id, body: '' })
        else if (!isShipped && live.trim() !== (stored ?? '').trim()) out.push({ refId: id, locale: l.id, body: live })
      }
    }
    return out
  }, [ids, edits, saved])

  const dirty = pending.length > 0

  async function save() {
    if (!dirty) return
    const v = version.trim()
    if (!v) { setError('Serve un numero di versione: il registro (LEG-07) deve dire quale testo è in vigore da oggi.'); return }
    if (v === LEGAL_VERSION && !saved.length) {
      setError(`«${v}» è la versione compilata nel build. Scegline una nuova — per esempio ${bump(LEGAL_VERSION)}.`)
      return
    }
    if (!changelog.trim()) { setError('Serve una riga di changelog: il registro dice COSA è cambiato, non solo quando.'); return }
    setBusy(true); setError(null); setStatus(null)
    try {
      const rows = await dp.saveLegalTexts({ rows: pending, version: v, changelog: changelog.trim() })
      setSaved(rows)
      setEdits({})
      /* The app reads this map, not our state: the change has to reach the
         screens in the other tab's sense too, so the overlay is replaced
         here and not only re-fetched on the next load. */
      setLegalOverrides(rows)
      await dp.logAudit({
        actor: user?.email ?? 'admin',
        action: 'legal.texts.saved',
        target: 'disclaimers',
        detail: `${pending.length} testi · versione ${v}`,
      }).catch(() => undefined)
      setChangelog('')
      setStatus(
        `Salvato: ${pending.length} ${pending.length === 1 ? 'testo' : 'testi'} in vigore da oggi come versione ${v}. ` +
        'Il registro in Conformità → Testi legali lo riporta, e chi apre l’app adesso legge questi testi.',
      )
    } catch (e) {
      setError(String((e as Error).message ?? e))
    } finally {
      setBusy(false)
    }
  }

  const changedCount = pending.length

  return (
    <div className="adm-page">
      <header className="adm-head">
        <h1 className="adm-h1">Avvisi legali</h1>
        <p className="b2b-sub">
          Le {ids.length} frasi registrate, nelle tre lingue. Si modificano le PAROLE: l’id, il tier, il mercato e
          la lingua di ripiego restano del build, quindi una modifica qui non sposta mai un avviso né cambia chi lo
          vede. Svuotare una casella rimette la frase pubblicata con l’app.
        </p>
      </header>

      <div className="adm-legal__bar">
        <input
          className="b2b-input" value={query} placeholder="Cerca per id o per testo — es. ONB-2.2, emergenze"
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="adm-legal__only">
          <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} />
          Solo i riscritti
        </label>
        <span className="b2b-sub">
          {changedCount ? `${changedCount} da salvare` : 'nessuna modifica'} · versione nel build: {LEGAL_VERSION}
        </span>
      </div>

      {error && <p className="adm-plain__status adm-plain__status--err">{error}</p>}
      {status && <p className="adm-plain__status">{status}</p>}

      <div className="adm-legal__list">
        {shownIds.map((id) => {
          const m = LEGAL_MESSAGES[id] as LegalMessage
          const touched = LOCALES.some((l) => rewritten(id, l.id))
          return (
            <section key={id} className={`adm-legal__msg${touched ? ' is-changed' : ''}`}>
              <header className="adm-legal__msghead">
                <code className="adm-legal__id">{id}</code>
                <span className="adm-legal__tier">tier {m.tier}</span>
                {m.market && <span className="adm-legal__market">solo {m.market}</span>}
                <span className="adm-legal__group">{groupOf(id)}</span>
                {touched && <span className="adm-legal__flag">● riscritto</span>}
              </header>
              {LOCALES.map((l) => {
                const value = current(id, l.id)
                const diff = rewritten(id, l.id)
                return (
                  <label key={l.id} className={`adm-legal__row${diff ? ' is-changed' : ''}`}>
                    <span className="adm-legal__lang">{l.label}</span>
                    <textarea
                      className="b2b-input adm-legal__text"
                      rows={Math.max(2, Math.ceil(value.length / 78))}
                      value={value}
                      onChange={(e) => setEdits((p) => ({ ...p, [keyOf(id, l.id)]: e.target.value }))}
                    />
                    {diff && (
                      <button
                        type="button"
                        className="b2b-btn b2b-btn--ghost adm-legal__revert"
                        onClick={() => setEdits((p) => ({ ...p, [keyOf(id, l.id)]: shipped(id, l.id) }))}
                        title="Rimette la frase pubblicata con l’app"
                      >↺ build</button>
                    )}
                  </label>
                )
              })}
            </section>
          )
        })}
        {!shownIds.length && <p className="b2b-sub">Nessun avviso corrisponde.</p>}
      </div>

      {/* ---- the save, with the register attached ------------------------- */}
      <div className={`adm-legal__save${dirty ? ' is-on' : ''}`}>
        <div className="adm-legal__savefields">
          <label className="pe-field">
            <span className="pe-label">Nuova versione <em>obbligatoria: il registro deve dire quale testo è in vigore</em></span>
            <input
              className="b2b-input" value={version} placeholder={bump(LEGAL_VERSION)}
              onChange={(e) => setVersion(e.target.value)}
            />
          </label>
          <label className="pe-field">
            <span className="pe-label">Changelog <em>cosa è cambiato, in una riga</em></span>
            <input
              className="b2b-input" value={changelog} placeholder="es. ONB-2.2 e ONB-3.5: il pulsante non è più l’azione"
              onChange={(e) => setChangelog(e.target.value)}
            />
          </label>
        </div>
        <button className="b2b-btn b2b-btn--primary" disabled={!dirty || busy} onClick={() => void save()}>
          {busy ? 'Salvataggio…' : `Salva ${changedCount || ''} e registra la versione`}
        </button>
      </div>
    </div>
  )
}

/** `0.5-draft` → `0.6-draft`; anything else gets a `-2` so the box is never
    empty and the operator can always overwrite it. */
function bump(v: string): string {
  const m = v.match(/^(\d+)\.(\d+)(.*)$/)
  if (!m) return `${v}-2`
  return `${m[1]}.${Number(m[2]) + 1}${m[3]}`
}
