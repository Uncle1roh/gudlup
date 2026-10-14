/* ============================================================================
   Good Loop — the DETAILS board of a protocol (admin)

   One protocol, one name. The board used to ask for two — a CLINICAL title
   for the therapist and the catalogue row, and a PUBLIC name for the person
   — in three languages each, which meant six fields before anything else and
   two names that could quietly disagree about what the same session is
   called. The POs asked for the single name they actually use, so the name
   written here is BOTH: `applyCardDraft` mirrors it onto `title`, and every
   reader of either field keeps working unchanged.

   What is left on the board, and nothing else:

     · the CODE, which identifies the material everywhere ("GL-ANX 1.1")
     · the NAME and the one-line description, per language
     · the COVER
     · the TAGS, as free words
     · CLINICO / NON CLINICO

   What is gone, deliberately: the claims gate, the lexicon linter and the
   tier rule. They sat between the console and publishing, and a vocabulary
   list cannot tell a claim from an ordinary Italian word — "recupero" is in
   Lexicon_Avoid as a care-pathway term and is also simply what a rest
   session is called, so the gate refused work that was never a claim. Naming
   stays an editorial judgement made by the people writing it. The stored
   `tier` and `claimsGate` columns are untouched: nothing written before this
   is lost, it is just no longer a gate.
   ============================================================================ */

import { useRef, useState } from 'react'
import { MAX_TAGS, normalizeTags, tagLabel, tagSlug, tagsOf } from '../data/tags'
import type { CatalogProtocol } from '../data/catalog'
import { nameLocales, type ProtocolI18n, type ProtocolText, type TextLocale } from '../types/domain'

import { uploadProtocolCover } from './assets'
import { emptyGate, TIERS, tierChoice, type ClaimsGate, type ContentTier } from '../legal/claims'

export interface ProtocolCardDraft {
  code: string
  /** The one name. Stored on `title` as well, so the catalogue row, the plan
      and the clinical record read the same words the person reads. */
  title: string
  publicTitle: string
  publicBlurb: string
  /** The same name and description in the other interface languages. */
  i18n: ProtocolI18n
  tags: string[]
  /** A real cover image. Empty = the generated artwork stands. */
  coverUrl: string
  /** Clinico / Non clinico. Editorial only — it routes nothing. */
  tier: ContentTier
  /** Carried through untouched; no longer edited here. */
  claimsGate: ClaimsGate
}

/* ---- the languages this card can write ---------------------------------

   The base field is written in whatever language the catalogue is authored
   in; these are the overlays a person reading the app in another one gets.
   English is on the list because the app offers it and a PO writing in
   Italian still has to be able to say what an English reader sees. */
export const CARD_LOCALES: { id: TextLocale; label: string }[] = [
  { id: 'it', label: 'Italiano' },
  { id: 'pt-BR', label: 'Português' },
  { id: 'en', label: 'English' },
]

/**
 * The card as the editor shows it.
 *
 * The ITALIAN name is the base column — the catalogue is authored in Italian
 * and the base is what every other language falls back to. A row written
 * before the board was simplified can carry a public name, a clinical title,
 * or both; the public one wins and the clinical one is the fallback, so a
 * protocol that only ever had a clinical title arrives here named rather than
 * blank. The first save makes the two equal.
 */
export function cardDraftFrom(p: CatalogProtocol): ProtocolCardDraft {
  const i18n: ProtocolI18n = {}
  for (const { id } of CARD_LOCALES) {
    const one = p.i18n?.[id]
    if (!one) continue
    const kept: ProtocolText = {}
    /* Italian is the BASE, not an overlay: its name is lifted into the base
       row below. Leaving a copy here would be two fields that can disagree
       about what an Italian reader sees, and the overlay wins. */
    if (id !== 'it') {
      const name = one.publicTitle?.trim() || one.title?.trim()
      if (name) kept.publicTitle = name
      const blurb = one.publicBlurb?.trim()
      if (blurb) kept.publicBlurb = blurb
    }
    /* The clinical blurb is not edited here; carry it through. */
    const clinical = one.blurb?.trim()
    if (clinical) kept.blurb = clinical
    if (Object.keys(kept).length) i18n[id] = kept
  }
  const it = p.i18n?.it
  return {
    code: p.code,
    title: p.title,
    publicTitle: it?.publicTitle?.trim() || p.publicTitle || p.title || '',
    publicBlurb: it?.publicBlurb?.trim() || p.publicBlurb || '',
    i18n,
    coverUrl: p.coverUrl ?? '',
    tags: tagsOf(p),
    tier: tierChoice(p.tier),
    claimsGate: p.claimsGate ?? emptyGate(),
  }
}

/** Fold a card onto a catalog entry. Everything the import and the Studio own
    — the timelines, the sessions, the versions, the rendered audio — is
    carried through untouched: this editor owns naming, the cover and tags. */
export function applyCardDraft(draft: ProtocolCardDraft, existing: CatalogProtocol): CatalogProtocol {
  const publicTitle = draft.publicTitle.trim()
  const publicBlurb = draft.publicBlurb.trim()
  return {
    ...existing,
    /* One name, written to both fields. A blank keeps the previous title
       rather than leaving the catalog row showing nothing but a code — the
       editor also refuses to save an empty name, so this is the second line
       of defence, not the first. */
    title: publicTitle || existing.title,
    publicTitle: publicTitle || undefined,
    publicBlurb: publicBlurb || undefined,
    i18n: cleanI18n(draft.i18n),
    coverUrl: draft.coverUrl.trim() || undefined,
    tags: normalizeTags(draft.tags),
    tier: tierChoice(draft.tier),
    claimsGate: draft.claimsGate,
    updatedAt: Date.now(),
  }
}

/** Drop blank fields and then blank languages, so a language the PO opened
    and left empty is not stored as one that has a translation. The name is
    written to `title` as well as `publicTitle` for the same reason the base
    is: a therapist reading the app in Portuguese sees the Portuguese name. */
export function cleanI18n(src: ProtocolI18n): ProtocolI18n | undefined {
  const out: ProtocolI18n = {}
  for (const { id } of CARD_LOCALES) {
    const one = src[id]
    if (!one) continue
    const kept: ProtocolText = {}
    if (id !== 'it') {
      const name = one.publicTitle?.trim()
      /* The name goes on `title` too: `protocolTitle` reads the overlay
         first, so a stale clinical title here is what a therapist reading
         the app in this language would see instead of the name. */
      if (name) { kept.publicTitle = name; kept.title = name }
      const blurb = one.publicBlurb?.trim()
      if (blurb) kept.publicBlurb = blurb
    }
    const clinical = one.blurb?.trim()
    if (clinical) kept.blurb = clinical
    if (Object.keys(kept).length) out[id] = kept
  }
  return Object.keys(out).length ? out : undefined
}

/**
 * The name a reader of `loc` actually sees for this draft — the same chain
 * `patientTitle` walks (the language, English → Portuguese, the Italian base,
 * the stored title), so the editor's "mancante" line tells the truth.
 */
export function shownName(draft: Pick<ProtocolCardDraft, 'title' | 'publicTitle' | 'i18n'>, loc: TextLocale): string {
  for (const l of nameLocales(loc)) {
    const v = l === 'it' ? draft.publicTitle.trim() : draft.i18n[l]?.publicTitle?.trim()
    if (v) return v
  }
  return draft.publicTitle.trim() || draft.i18n[loc]?.title?.trim() || draft.title.trim()
}

/** Whether this draft can be saved, and why not. */
export function cardDraftError(draft: ProtocolCardDraft): string | null {
  if (!draft.publicTitle.trim()) return 'Serve un nome — è quello che leggono la persona e il terapeuta.'
  return null
}

interface Props {
  draft: ProtocolCardDraft
  busy?: boolean
  /** Rendered inline inside the workscreen's Details rather than as a card. */
  inline?: boolean
  /** A protocol being created: the code is still being typed. */
  codeEditable?: boolean
  onChange: (d: ProtocolCardDraft) => void
  onSave: () => void
  onCancel?: () => void
}

export function ProtocolCardEditor({ draft, busy, inline, codeEditable, onChange, onSave, onCancel }: Props) {
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
  /** Write one field of one language. */
  const setText = (loc: TextLocale, key: keyof ProtocolText, value: string) =>
    set({ i18n: { ...draft.i18n, [loc]: { ...(draft.i18n[loc] ?? {}), [key]: value } } })

  const full = draft.tags.length >= MAX_TAGS
  const invalid = cardDraftError(draft)

  function addCustom() {
    const id = tagSlug(custom)
    setCustom('')
    if (!id || draft.tags.includes(id) || full) return
    set({ tags: [...draft.tags, id] })
  }

  const body = (
    <>
      {/* ---- the code ----------------------------------------------------
          Editable only while the protocol is being created: afterwards it is
          the key the workbooks, the storage paths and the audio all use. */}
      <label className="pe-field">
        <span className="pe-label">Codice <em>{codeEditable ? 'la forma è "GL-ANX 1.1"' : 'identifica il materiale ovunque'}</em></span>
        <input
          className="b2b-input adm-mono"
          value={draft.code}
          placeholder="GL-ANX 1.1"
          autoFocus={codeEditable}
          readOnly={!codeEditable}
          aria-readonly={!codeEditable}
          onChange={(e) => set({ code: e.target.value.toUpperCase() })}
        />
      </label>

      {/* ---- the name, per language --------------------------------------
          ONE name, read by the person and by the therapist, in THEIR
          language: "Stress 1" is not one string for everyone. All three are
          on screen at once — an empty one says so, and says what that reader
          sees instead — because a translation hidden behind a chip is a
          translation nobody notices is missing. Italian is the base: the
          other two fall back to it, and English falls back to Portuguese
          first (an English reader hears the Portuguese session). */}
      <div className="pe-field">
        <span className="pe-label">Nome e descrizione, per lingua <em>quello che leggono la persona e il terapeuta, nella lingua in cui usano l’app</em></span>
        <div className="pe-names">
          {CARD_LOCALES.map((l) => {
            const isBase = l.id === 'it'
            const title = isBase ? draft.publicTitle : draft.i18n[l.id]?.publicTitle ?? ''
            const blurb = isBase ? draft.publicBlurb : draft.i18n[l.id]?.publicBlurb ?? ''
            const shown = shownName(draft, l.id)
            return (
              <div key={l.id} className={`pe-names__row${title.trim() ? '' : ' is-empty'}`}>
                <span className="pe-names__lang">
                  {l.label}{isBase && <em> · predefinito</em>}
                </span>
                <input
                  className="b2b-input" value={title} aria-label={`Nome — ${l.label}`}
                  placeholder={isBase ? 'es. Un respiro prima di dormire' : `Nome in ${l.label}`}
                  onChange={(e) => (isBase ? set({ publicTitle: e.target.value }) : setText(l.id, 'publicTitle', e.target.value))}
                />
                <input
                  className="b2b-input" value={blurb} aria-label={`Descrizione — ${l.label}`}
                  placeholder={isBase ? 'es. Da far partire già a letto, luci spente.' : `Una riga in ${l.label}`}
                  onChange={(e) => (isBase ? set({ publicBlurb: e.target.value }) : setText(l.id, 'publicBlurb', e.target.value))}
                />
                <span className={`pe-names__state${title.trim() ? ' is-ok' : ''}`}>
                  {title.trim()
                    ? `✓ ${l.label}`
                    : `mancante in ${l.label} — chi usa l’app in ${l.label} legge «${shown || '—'}»`}
                </span>
              </div>
            )
          })}
        </div>
        {invalid && <span className="pe-err">{invalid}</span>}
        <span className="pe-hint">
          Rinominare cambia solo l’etichetta: codice, famiglia, durate, timeline, sessioni dello Studio e audio
          collegato restano esattamente com’erano.
        </span>
      </div>

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

      {/* ---- tags, as your own words -------------------------------------
          The curated vocabulary is gone: four groups of chips were a long
          read for a field that only has to make the material findable again.
          Whatever is on the row stays visible and removable. */}
      <div className="pe-field">
        <span className="pe-label">Tag <em>una parola vostra, per ritrovare il materiale</em></span>
        {draft.tags.length > 0 && (
          <div className="mt-seg mt-seg--wrap">
            {draft.tags.map((id) => (
              <button
                key={id}
                className="is-on"
                title={`Togli «${tagLabel(id)}»`}
                onClick={() => set({ tags: draft.tags.filter((x) => x !== id) })}
              >
                {tagLabel(id)} ✕
              </button>
            ))}
          </div>
        )}
        <div className="pe-row" style={{ marginTop: 6 }}>
          <input
            className="b2b-input" value={custom} placeholder="es. respiro-lento" disabled={full}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
          />
          <button className="b2b-btn" disabled={full || !tagSlug(custom)} onClick={addCustom}>Aggiungi</button>
        </div>
        <span className="pe-hint">
          {draft.tags.length}/{MAX_TAGS} tag. I tag servono a ritrovare il materiale nel catalogo — non decidono
          mai quale sessione parte, e non sono un’indicazione clinica.
        </span>
      </div>

      {/* ---- clinical or not ---------------------------------------------
          Two answers where there were three colours. It is a label on the
          row, read by the people working in the console; it blocks nothing. */}
      <div className="pe-field">
        <span className="pe-label">Tipo di contenuto</span>
        <div className="pe-row">
          {TIERS.map((tier) => (
            <label key={tier.id} className="pe-consent">
              <input
                type="radio" name={`tier-${draft.code || 'new'}`}
                checked={tierChoice(draft.tier) === tier.id}
                onChange={() => set({ tier: tier.id })}
              />
              <span><b>{tier.label}</b> — {tier.hint}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="plan-head__cta" style={{ marginTop: 14 }}>
        <button className="b2b-btn b2b-btn--primary" disabled={busy || !!invalid} onClick={onSave}>
          {busy ? 'Salvataggio…' : 'Salva scheda'}
        </button>
        {onCancel && <button className="b2b-btn b2b-btn--ghost" onClick={onCancel}>Annulla</button>}
      </div>
    </>
  )

  if (inline) return <div className="adm-plain__card">{body}</div>
  return (
    <section className="b2b-card b2b-card--wide">
      <h2 className="b2b-card__title">Dettagli</h2>
      {body}
    </section>
  )
}
