/* ============================================================================
   Good Loop — the PUBLIC CARD of a clinical protocol (admin)

   A clinical protocol has two names and they do different jobs:

     · the CLINICAL title ("Calm and Inner Security") names a therapeutic
       intent. It is the therapist's and the admin's name for the material and
       it is what appears on the catalog row, in the plan and in the clinical
       record. It is editable here so a catalogue imported from several
       workbooks can be brought to one house style without re-importing —
       renaming changes the LABEL only: the code, the family, the versions,
       the timelines, the Studio sessions and the rendered audio are all
       carried through untouched.

     · the PUBLIC title ("Un respiro prima di dormire") is what the PERSON
       reads in the player, on the home card and in their history. It names a
       moment, never a condition, a diagnosis or a treatment — the same
       register the library already uses (see data/library.ts).

   Writing a public title changes the LABEL and nothing else: the code, the
   family, the pathway, the audio and the clinical record are untouched, so a
   protocol can be offered without clinical vocabulary while remaining exactly
   the same material. Leaving it empty keeps the clinical title on screen,
   which is what every entry did before this card existed.

   Tags are the editorial layer on top: what the material is for, when it is
   used, how it is delivered. They filter lists; they never route a session.
   ============================================================================ */

import { useRef, useState } from 'react'
import {
  MAX_TAGS,
  PROTOCOL_TAGS,
  TAG_GROUPS,
  normalizeTags,
  tagLabel,
  tagSlug,
  tagsOf,
  type TagGroup,
} from '../data/tags'
import type { CatalogProtocol } from '../data/catalog'
import { uploadProtocolCover } from './assets'

export interface ProtocolCardDraft {
  code: string
  /** Clinical title. Editable; never allowed to become empty. */
  title: string
  publicTitle: string
  publicBlurb: string
  tags: string[]
  /** A real cover image. Empty = the generated artwork stands. */
  coverUrl: string
}

export function cardDraftFrom(p: CatalogProtocol): ProtocolCardDraft {
  return {
    code: p.code,
    title: p.title,
    publicTitle: p.publicTitle ?? '',
    publicBlurb: p.publicBlurb ?? '',
    coverUrl: p.coverUrl ?? '',
    tags: tagsOf(p),
  }
}

/** Fold a card onto a catalog entry. Everything the import and the Studio own
    — the timelines, the sessions, the versions, the rendered audio — is
    carried through untouched: this editor owns naming and tags, nothing else. */
export function applyCardDraft(draft: ProtocolCardDraft, existing: CatalogProtocol): CatalogProtocol {
  const publicTitle = draft.publicTitle.trim()
  const publicBlurb = draft.publicBlurb.trim()
  const title = draft.title.trim()
  return {
    ...existing,
    /* An empty clinical title would leave the catalog row, the plan and the
       clinical record showing nothing but a code, so a blank keeps the
       previous one rather than clearing it. The editor also refuses to save
       an empty field, so this is the second line of defence, not the first. */
    title: title || existing.title,
    publicTitle: publicTitle || undefined,
    publicBlurb: publicBlurb || undefined,
    coverUrl: draft.coverUrl.trim() || undefined,
    tags: normalizeTags(draft.tags),
    updatedAt: Date.now(),
  }
}

/** Whether this draft can be saved, and why not. */
export function cardDraftError(draft: ProtocolCardDraft): string | null {
  if (!draft.title.trim()) return 'Il titolo clinico non può restare vuoto.'
  return null
}

interface Props {
  draft: ProtocolCardDraft
  busy?: boolean
  /** Rendered inline inside the workscreen's Details rather than as a card. */
  inline?: boolean
  onChange: (d: ProtocolCardDraft) => void
  onSave: () => void
  onCancel?: () => void
}

export function ProtocolCardEditor({ draft, busy, inline, onChange, onSave, onCancel }: Props) {
  const [custom, setCustom] = useState('')
  const [uploading, setUploading] = useState(false)
  const [coverErr, setCoverErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (p: Partial<ProtocolCardDraft>) => onChange({ ...draft, ...p })

  /**
   * Upload the chosen file and put its URL on the draft.
   *
   * It uploads IMMEDIATELY rather than on Save. The file has to reach storage
   * to have a URL at all, and holding it until Save would mean either keeping
   * a File in component state across an unmount or writing a row that points
   * at nothing. Save then persists the URL like any other field — and removing
   * a cover only clears that field, leaving the file in place: an image the
   * POs uploaded is worth more than the bytes it costs, and deleting on Remove
   * would destroy it on a mis-tap with no undo.
   */
  async function pickCover(file?: File) {
    if (!file) return
    if (!draft.code.trim()) { setCoverErr('Salva prima il protocollo: la copertina è archiviata sotto il suo codice.'); return }
    setCoverErr(null)
    setUploading(true)
    try {
      set({ coverUrl: await uploadProtocolCover(draft.code, file) })
    } catch (e) {
      setCoverErr((e as Error).message)
    } finally {
      setUploading(false)
    }
  }
  const full = draft.tags.length >= MAX_TAGS
  const invalid = cardDraftError(draft)

  function toggle(id: string) {
    if (draft.tags.includes(id)) set({ tags: draft.tags.filter((x) => x !== id) })
    else if (!full) set({ tags: [...draft.tags, id] })
  }

  function addCustom() {
    const id = tagSlug(custom)
    setCustom('')
    if (!id || draft.tags.includes(id) || full) return
    set({ tags: [...draft.tags, id] })
  }

  /** Tags the POs invented that are not in the curated vocabulary — shown
      together so they stay visible (and removable) instead of disappearing. */
  const extra = draft.tags.filter((id) => !PROTOCOL_TAGS.some((t) => t.id === id))

  const body = (
    <>
      <p className="b2b-sub">
        Il <b>titolo clinico</b> è il nome del materiale per te e per il terapeuta: sta sulla riga del catalogo,
        nel percorso e nella cartella clinica. Il <b>nome pubblico</b> è quello che legge la persona: dice il
        momento, non il disturbo. Lasciandolo vuoto si continua a mostrare il titolo clinico.
      </p>

      <label className="pe-field">
        <span className="pe-label">Titolo clinico <em>il nome per te e per il terapeuta</em></span>
        <input
          className="b2b-input" value={draft.title} placeholder="es. Calma e sicurezza interiore"
          onChange={(e) => set({ title: e.target.value })}
        />
        {invalid && <span className="pe-err">{invalid}</span>}
      </label>

      <p className="b2b-sub">
        Rinominare cambia solo l’etichetta: codice, famiglia, durate, timeline, sessioni dello Studio e audio
        collegato restano esattamente com’erano.
      </p>

      <label className="pe-field">
        <span className="pe-label">Nome pubblico <em>quello che legge la persona</em></span>
        <input
          className="b2b-input" value={draft.publicTitle} placeholder="es. Un respiro prima di dormire"
          onChange={(e) => set({ publicTitle: e.target.value })}
        />
      </label>

      <label className="pe-field">
        <span className="pe-label">Una riga di descrizione pubblica</span>
        <input
          className="b2b-input" value={draft.publicBlurb} placeholder="es. Da far partire già a letto, luci spente."
          onChange={(e) => set({ publicBlurb: e.target.value })}
        />
      </label>

      {/* ---- the cover -------------------------------------------------
          The card art a person sees while browsing. Without one the app draws
          a scene from the session's own slug, which is honest about there
          being no commissioned art and is as much contrast as a gradient can
          give behind white type. A photograph chosen for the session is the
          fix people are actually asking for. */}
      <div className="pe-field">
        <span className="pe-label">Immagine di copertina <em>quella che si vede sfogliando</em></span>
        <div className="pe-cover">
          <div
            className="pe-cover__prev"
            style={draft.coverUrl ? { backgroundImage: `url("${draft.coverUrl}")` } : undefined}
            aria-hidden="true"
          >
            {!draft.coverUrl && <span>generata</span>}
          </div>
          <div className="pe-cover__side">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              hidden
              onChange={(e) => { void pickCover(e.target.files?.[0]); e.target.value = '' }}
            />
            <button className="b2b-btn" disabled={uploading || busy} onClick={() => fileRef.current?.click()}>
              {uploading ? 'Caricamento…' : draft.coverUrl ? 'Sostituisci' : 'Carica immagine'}
            </button>
            {draft.coverUrl && (
              <button className="b2b-btn b2b-btn--quiet" disabled={uploading || busy} onClick={() => set({ coverUrl: '' })}>
                Togli
              </button>
            )}
            <span className="pe-hint">
              JPG, PNG, WebP o AVIF · fino a 12 MB<br />
              <b>Consigliato: 1600 × 1200 px (4:3)</b>, soggetto al centro.<br />
              La stessa immagine riempie tre riquadri — la card verticale, la
              copertina larga e la striscia del dettaglio — e viene ritagliata
              dal centro: tieni il soggetto dentro il quadrato centrale.
            </span>
            {coverErr && <span className="pe-err">{coverErr}</span>}
          </div>
        </div>
      </div>

      {TAG_GROUPS.map((g: { id: TagGroup; label: string; hint: string }) => (
        <div key={g.id} style={{ marginTop: 10 }}>
          <span className="pe-label">{g.label} <em>{g.hint}</em></span>
          <div className="mt-seg mt-seg--wrap">
            {PROTOCOL_TAGS.filter((t) => t.group === g.id).map((t) => {
              const on = draft.tags.includes(t.id)
              return (
                <button
                  key={t.id} className={on ? 'is-on' : ''} disabled={!on && full}
                  onClick={() => toggle(t.id)}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      <div style={{ marginTop: 10 }}>
        <span className="pe-label">Altro <em>una parola vostra, se manca</em></span>
        <div className="mt-seg mt-seg--wrap">
          {extra.map((id) => (
            <button key={id} className="is-on" onClick={() => toggle(id)}>{tagLabel(id)}</button>
          ))}
        </div>
        <div className="pe-row" style={{ marginTop: 6 }}>
          <input
            className="b2b-input" value={custom} placeholder="es. respiro-lento" disabled={full}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
          />
          <button className="b2b-btn" disabled={full || !tagSlug(custom)} onClick={addCustom}>Aggiungi</button>
        </div>
      </div>

      <p className="b2b-sub" style={{ marginTop: 6 }}>
        {draft.tags.length}/{MAX_TAGS} tag. I tag servono a ritrovare il materiale nel catalogo — non decidono
        mai quale sessione parte, e non sono un’indicazione clinica.
      </p>

      <div className="plan-head__cta" style={{ marginTop: 14 }}>
        <button className="b2b-btn b2b-btn--primary" disabled={busy || !!invalid} onClick={onSave}>
          {busy ? 'Salvataggio…' : 'Salva scheda'}
        </button>
        {onCancel && <button className="b2b-btn b2b-btn--ghost" onClick={onCancel}>Annulla</button>}
        <span className="b2b-sub adm-mono" style={{ alignSelf: 'center' }}>{draft.code}</span>
      </div>
    </>
  )

  if (inline) return <div className="adm-plain__card">{body}</div>
  return (
    <section className="b2b-card b2b-card--wide">
      <h2 className="b2b-card__title">Scheda pubblica e tag</h2>
      {body}
    </section>
  )
}
