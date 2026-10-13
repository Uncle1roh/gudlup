/* ============================================================================
   Good Loop — library entry editor (admin)

   A library audio is described by the MOMENT it serves, and by nothing else:
   no code to choose, no family, no clinical wording. The code is derived from
   the title so nobody has to invent one, and the shelf, cover and check-in tags
   are what decide where it appears and when "scegli tu per me" can return it.

   The audio itself is produced in the Sound Studio and attached exactly like a
   protocol's — this screen owns the naming, not the sound.
   ============================================================================ */

import { useState } from 'react'
import { LIBRARY_CATEGORIES, LIBRARY_PHASES, LIBRARY_PREFIX, type LibraryCategory, type LibraryTag } from '../data/library'
import { OFFER_DEFAULT_CURRENCY, OFFER_DEFAULT_MINOR, type CatalogProtocol } from '../data/catalog'
import type { Duration } from '../types/domain'

/* The ids are machinery (they match the check-in's clusters and are stored
   on rows); the LABELS are what a PO reads, and they name a moment, never a
   condition — "ansia", "umore basso" and "esaurimento" are condition names
   in the claims lexicon (Lexicon_Avoid 1; Lexicon_Notes 9, 10). */
const TAGS: { id: LibraryTag; label: string }[] = [
  { id: 'anxiety', label: 'Prima di qualcosa di importante' },
  { id: 'stress', label: 'Giornata piena' },
  { id: 'depression', label: 'Quando manca la spinta' },
  { id: 'burnout', label: 'Dopo una settimana pesante' },
  { id: 'resilience', label: 'Per rafforzarsi' },
  { id: 'maintenance', label: 'Sto bene' },
]

const DURATIONS: Duration[] = [6, 12, 24]
const COVERS = ['🎧', '🛫', '💼', '🤝', '📚', '💬', '🫁', '🌳', '🌊', '☕', '🌇', '🧩', '🌙', '🌌', '🎯', '🌅', '🔋', '🌱', '🔥']

/** "20 minuti prima di un volo" → "GL-LIB 20-minuti-prima-di-un-volo". The
    code is machinery: it identifies the row and labels the session record, and
    is never shown to the person listening. */
export function slugFromTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // drop the accents NFD split off
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug || `audio-${Date.now().toString(36)}`
}

export interface LibraryDraft {
  code: string | null // null = new
  title: string
  blurb: string
  category: LibraryCategory
  emoji: string
  tags: LibraryTag[]
  duration: Duration
  /* --- the commercial offer ---------------------------------------------
     'none' is a real choice, not an absent value: it is how an offer is
     taken OFF a protocol that had one. */
  offerKind: 'none' | 'free' | 'reduced'
  /** Minor units — 10 = ten cents. Only read when offerKind is 'reduced'. */
  priceMinor: number
  currency: string
  /** 'YYYY-MM-DD' as the date inputs give them, or '' for open-ended. */
  offerFrom: string
  offerUntil: string
}

/** 'YYYY-MM-DD' → epoch ms. `end` takes the last instant of that day, so an
    offer that runs "until the 30th" includes the 30th. */
function dayToMs(d: string, end = false): number | undefined {
  if (!d) return undefined
  const ms = new Date(end ? `${d}T23:59:59.999` : `${d}T00:00:00`).getTime()
  return Number.isFinite(ms) ? ms : undefined
}

function msToDay(ms: number | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return ''
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function draftFrom(p: CatalogProtocol): LibraryDraft {
  return {
    code: p.code,
    title: p.title,
    blurb: p.blurb,
    category: p.library?.category ?? 'calm',
    emoji: p.library?.emoji ?? '🎧',
    tags: p.library?.tags ?? [],
    duration: p.versions[0]?.duration ?? 12,
    offerKind: p.offer?.kind ?? 'none',
    priceMinor: p.offer?.priceMinor ?? OFFER_DEFAULT_MINOR,
    currency: p.offer?.currency ?? OFFER_DEFAULT_CURRENCY,
    offerFrom: msToDay(p.offer?.from),
    offerUntil: msToDay(p.offer?.until),
  }
}

export const EMPTY_DRAFT: LibraryDraft = {
  code: null, title: '', blurb: '', category: 'before', emoji: '🎧', tags: [], duration: 12,
  offerKind: 'none', priceMinor: OFFER_DEFAULT_MINOR, currency: OFFER_DEFAULT_CURRENCY,
  offerFrom: '', offerUntil: '',
}

/** Fold a draft onto a catalog entry, preserving everything the Studio owns
    (the timeline, the saved session, the rendered audio) when editing. */
export function applyDraft(draft: LibraryDraft, existing?: CatalogProtocol): CatalogProtocol {
  const code = draft.code ?? `${LIBRARY_PREFIX} ${slugFromTitle(draft.title)}`
  return {
    ...(existing ?? {
      phases: LIBRARY_PHASES,
      enabled: true,
      source: 'imported' as const,
      tenants: 'all' as const,
      audioReady: false,
    }),
    code,
    family: 'GL-LIB',
    title: draft.title.trim(),
    blurb: draft.blurb.trim(),
    phases: existing?.phases?.length ? existing.phases : LIBRARY_PHASES,
    versions: existing?.versions?.length && existing.versions[0].duration === draft.duration
      ? existing.versions
      : [{ duration: draft.duration }],
    updatedAt: Date.now(),
    audience: 'library',
    library: { category: draft.category, emoji: draft.emoji, tags: draft.tags },
    offer: draft.offerKind === 'none' ? undefined : {
      kind: draft.offerKind,
      priceMinor: draft.offerKind === 'reduced' ? draft.priceMinor : undefined,
      currency: draft.offerKind === 'reduced' ? draft.currency : undefined,
      from: dayToMs(draft.offerFrom),
      until: dayToMs(draft.offerUntil, true),
    },
  } as CatalogProtocol
}

interface LibraryEditorProps {
  draft: LibraryDraft
  busy?: boolean
  onChange: (d: LibraryDraft) => void
  onSave: () => void
  onCancel: () => void
}

export function LibraryEditor({ draft, busy, onChange, onSave, onCancel }: LibraryEditorProps) {
  const [touched, setTouched] = useState(false)
  const set = (p: Partial<LibraryDraft>) => onChange({ ...draft, ...p })
  const codePreview = draft.code ?? `${LIBRARY_PREFIX} ${slugFromTitle(draft.title || 'nuovo-audio')}`
  const titleOk = draft.title.trim().length >= 3

  return (
    <section className="b2b-card b2b-card--wide">
      <h2 className="b2b-card__title">{draft.code ? 'Modifica audio di libreria' : 'Nuovo audio di libreria'}</h2>
      <p className="b2b-sub">
        Il titolo dice il <b>momento</b>, non il disturbo: «20 minuti prima di un volo», non «protocollo ansia».
        Questo catalogo è a uso libero e non è presentato come terapia.
      </p>

      <label className="pe-field">
        <span className="pe-label">Titolo <em>quello che legge la persona</em></span>
        <input
          className="b2b-input" value={draft.title} placeholder="es. Prepariamoci a una riunione difficile"
          onChange={(e) => { setTouched(true); set({ title: e.target.value }) }}
        />
      </label>
      {touched && !titleOk && <p className="adm-plain__status adm-plain__status--err">Serve un titolo.</p>}

      <label className="pe-field">
        <span className="pe-label">Una riga di descrizione</span>
        <input
          className="b2b-input" value={draft.blurb} placeholder="es. Dieci minuti per arrivarci con la testa sgombra."
          onChange={(e) => set({ blurb: e.target.value })}
        />
      </label>

      <div className="pe-row">
        <label className="pe-field">
          <span className="pe-label">Scaffale</span>
          <select className="b2b-input" value={draft.category} onChange={(e) => set({ category: e.target.value as LibraryCategory })}>
            {LIBRARY_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className="pe-field">
          <span className="pe-label">Durata</span>
          <select className="b2b-input" value={draft.duration} onChange={(e) => set({ duration: Number(e.target.value) as Duration })}>
            {DURATIONS.map((d) => <option key={d} value={d}>{d} min</option>)}
          </select>
        </label>
      </div>

      <span className="pe-label">Copertina</span>
      <div className="mt-seg mt-seg--wrap" style={{ marginBottom: 10 }}>
        {COVERS.map((e) => (
          <button key={e} className={draft.emoji === e ? 'is-on' : ''} onClick={() => set({ emoji: e })}>{e}</button>
        ))}
      </div>

      <span className="pe-label">Quando «scegli tu per me» può proporlo</span>
      <div className="mt-seg mt-seg--wrap">
        {TAGS.map((tg) => {
          const on = draft.tags.includes(tg.id)
          return (
            <button
              key={tg.id} className={on ? 'is-on' : ''}
              onClick={() => set({ tags: on ? draft.tags.filter((x) => x !== tg.id) : [...draft.tags, tg.id] })}
            >
              {tg.label}
            </button>
          )
        })}
      </div>
      <p className="b2b-sub" style={{ marginTop: 6 }}>
        Senza nessun tag l’audio resta sfogliabile, ma il check-in non lo propone mai.
      </p>

      <span className="pe-label">Offerta</span>
      <div className="mt-seg">
        {([['none', 'Nessuna'], ['free', 'Gratis'], ['reduced', 'Prezzo ridotto']] as const).map(([k, label]) => (
          <button key={k} className={draft.offerKind === k ? 'is-on' : ''} onClick={() => set({ offerKind: k })}>{label}</button>
        ))}
      </div>
      {draft.offerKind === 'reduced' && (
        <div className="pe-row" style={{ marginTop: 8 }}>
          <label className="pe-field">
            <span>Prezzo</span>
            <input
              type="number" min={0} step={1} value={draft.priceMinor}
              onChange={(e) => set({ priceMinor: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
            />
            <small className="b2b-sub">In centesimi. 10 = {(draft.priceMinor / 100).toFixed(2)} {draft.currency}</small>
          </label>
          <label className="pe-field">
            <span>Valuta</span>
            <input
              type="text" maxLength={3} value={draft.currency}
              onChange={(e) => set({ currency: e.target.value.toUpperCase().slice(0, 3) })}
            />
          </label>
        </div>
      )}
      {draft.offerKind !== 'none' && (
        <div className="pe-row" style={{ marginTop: 8 }}>
          <label className="pe-field">
            <span>Dal</span>
            <input type="date" value={draft.offerFrom} onChange={(e) => set({ offerFrom: e.target.value })} />
          </label>
          <label className="pe-field">
            <span>Al</span>
            <input type="date" value={draft.offerUntil} onChange={(e) => set({ offerUntil: e.target.value })} />
          </label>
        </div>
      )}
      <p className="b2b-sub" style={{ marginTop: 6 }}>
        {draft.offerKind === 'none'
          ? 'Nessuna offerta: l’audio resta nella libreria alle condizioni normali.'
          : 'Le date sono facoltative, ma una promozione che nessuno si ricorda di spegnere diventa un prezzo. Senza date l’offerta resta attiva finché non la togli qui.'}
        {' '}L’offerta vale solo per la libreria autoguidata: un protocollo clinico non entra in Mode 1 perché gli si mette un prezzo — va prima spostato in libreria, che è una decisione a sé.
      </p>
      {draft.offerKind !== 'none' && (
        <p className="b2b-sub" style={{ marginTop: 4 }}>
          Nota: l’app non incassa ancora nulla. Il flag marca l’intenzione e mostra l’etichetta; il pagamento vero è un lavoro a parte (su Android un acquisto digitale dentro l’app passa per Play Billing).
        </p>
      )}

      <div className="plan-head__cta" style={{ marginTop: 14 }}>
        <button className="b2b-btn b2b-btn--primary" disabled={!titleOk || busy} onClick={onSave}>
          {busy ? 'Salvataggio…' : draft.code ? 'Salva modifiche' : 'Crea in libreria'}
        </button>
        <button className="b2b-btn b2b-btn--ghost" onClick={onCancel}>Annulla</button>
        <span className="b2b-sub adm-mono" style={{ alignSelf: 'center' }}>{codePreview}</span>
      </div>
    </section>
  )
}
