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
import type { ProtocolI18n, ProtocolText, TextLocale } from '../types/domain'
import { uploadProtocolCover } from './assets'
import { lintFields } from '../legal/lexicon'
import { emptyGate, gateComplete, GATE_QUESTIONS, TIERS, type ClaimsGate, type ContentTier } from '../legal/claims'

export interface ProtocolCardDraft {
  code: string
  /** Clinical title. Editable; never allowed to become empty. */
  title: string
  publicTitle: string
  publicBlurb: string
  /** The same three names in the other interface languages. */
  i18n: ProtocolI18n
  tags: string[]
  /** A real cover image. Empty = the generated artwork stands. */
  coverUrl: string
  /** The application tier and the four-question sign-off (ADM-02/03). */
  tier: ContentTier
  claimsGate: ClaimsGate
}

/* ---- the languages this card can write ---------------------------------

   The base fields above are written in whatever language the catalogue is
   authored in; these are the overlays a person reading the app in another one
   gets. English is on the list because the app offers it and a PO writing in
   Italian still has to be able to say what an English reader sees. */
export const CARD_LOCALES: { id: TextLocale; label: string }[] = [
  { id: 'it', label: 'Italiano' },
  { id: 'pt-BR', label: 'Português' },
  { id: 'en', label: 'English' },
]

export function cardDraftFrom(p: CatalogProtocol): ProtocolCardDraft {
  return {
    code: p.code,
    title: p.title,
    publicTitle: p.publicTitle ?? '',
    publicBlurb: p.publicBlurb ?? '',
    i18n: p.i18n ?? {},
    coverUrl: p.coverUrl ?? '',
    tags: tagsOf(p),
    tier: p.tier ?? 'green',
    claimsGate: p.claimsGate ?? emptyGate(),
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
    i18n: cleanI18n(draft.i18n),
    coverUrl: draft.coverUrl.trim() || undefined,
    tags: normalizeTags(draft.tags),
    tier: draft.tier,
    claimsGate: draft.claimsGate,
    updatedAt: Date.now(),
  }
}

/** Drop blank fields and then blank languages, so a language the PO opened
    and left empty is not stored as one that has a translation. */
function cleanI18n(src: ProtocolI18n): ProtocolI18n | undefined {
  const out: ProtocolI18n = {}
  for (const { id } of CARD_LOCALES) {
    const one = src[id]
    if (!one) continue
    const kept: ProtocolText = {}
    for (const key of ['title', 'publicTitle', 'publicBlurb'] as const) {
      const v = one[key]?.trim()
      if (v) kept[key] = v
    }
    // a clinical blurb is not edited here; carry through whatever was stored
    const blurb = one.blurb?.trim()
    if (blurb) kept.blurb = blurb
    if (Object.keys(kept).length) out[id] = kept
  }
  return Object.keys(out).length ? out : undefined
}

/** Whether this draft can be saved, and why not. */
export function cardDraftError(draft: ProtocolCardDraft): string | null {
  if (!draft.title.trim()) return 'Il titolo clinico non può restare vuoto.'
  return null
}

/** What the lexicon finds in the fields a person reads, as they are typed —
    shown live so a prohibited word is caught while it is being written, not
    when the row is enabled (ADM-01). */
export function cardLexiconHits(draft: ProtocolCardDraft) {
  return lintFields({
    'nome pubblico': draft.publicTitle,
    'descrizione pubblica': draft.publicBlurb,
    tag: draft.tags.map((id) => PROTOCOL_TAGS.find((t) => t.id === id)?.label ?? id),
    ...Object.fromEntries(Object.entries(draft.i18n).flatMap(([loc, txt]) => [
      [`nome pubblico (${loc})`, txt?.publicTitle],
      [`descrizione pubblica (${loc})`, txt?.publicBlurb],
    ])),
  })
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
  /* Which translation is open. Null = closed: a catalogue that only ever ships
     in one language should not have to look at an empty second set of fields
     every time somebody renames something. */
  const [lang, setLang] = useState<TextLocale | null>(null)
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

  /** Languages that already carry something — the chip says so, so a PO can
      see at a glance which ones are written without opening each. */
  const written = (loc: TextLocale) =>
    Boolean(draft.i18n[loc] && Object.values(draft.i18n[loc] as ProtocolText).some((v) => v?.trim()))

  const full = draft.tags.length >= MAX_TAGS
  const invalid = cardDraftError(draft)
  const lexHits = cardLexiconHits(draft)

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

      {/* ---- the other languages ---------------------------------------
          The app is read in three; the protocol used to be written in one, so
          a person who switched the interface got a translated app around an
          untranslated library. Each field here is an overlay on the one above
          it: leave it empty and that language shows the text above, field by
          field, so a half-finished translation is never a half-empty screen. */}
      <div className="pe-field">
        <span className="pe-label">Altre lingue <em>come si legge l’app in italiano, portoghese e inglese</em></span>
        <div className="pe-langs">
          {CARD_LOCALES.map((l) => (
            <button
              key={l.id}
              type="button"
              className={`pe-lang${lang === l.id ? ' is-on' : ''}${written(l.id) ? ' is-written' : ''}`}
              aria-pressed={lang === l.id}
              onClick={() => setLang(lang === l.id ? null : l.id)}
            >
              {l.label}{written(l.id) ? ' ·' : ''}
            </button>
          ))}
        </div>
      </div>

      {lang && (() => {
        const one = draft.i18n[lang] ?? {}
        return (
          <div className="pe-trans">
            <label className="pe-field">
              <span className="pe-label">Titolo clinico</span>
              <input
                className="b2b-input" value={one.title ?? ''} placeholder={draft.title || 'come sopra'}
                onChange={(e) => setText(lang, 'title', e.target.value)}
              />
            </label>
            <label className="pe-field">
              <span className="pe-label">Nome pubblico</span>
              <input
                className="b2b-input" value={one.publicTitle ?? ''} placeholder={draft.publicTitle || draft.title || 'come sopra'}
                onChange={(e) => setText(lang, 'publicTitle', e.target.value)}
              />
            </label>
            <label className="pe-field">
              <span className="pe-label">Descrizione pubblica</span>
              <input
                className="b2b-input" value={one.publicBlurb ?? ''} placeholder={draft.publicBlurb || 'come sopra'}
                onChange={(e) => setText(lang, 'publicBlurb', e.target.value)}
              />
            </label>
            <p className="b2b-sub">
              Vuoto = si mostra il testo qui sopra. Tradurre non tocca codice, famiglia, durate, audio né cartella
              clinica: cambia solo l’etichetta, come il nome pubblico.
            </p>
          </div>
        )
      })()}

      {/* ---- the lexicon, live ---------------------------------------------
          A condition name in a public label is a claim about the person
          (Lexicon_Avoid). Said here, while typing, in the language it was
          typed in — not at publish time. */}
      {lexHits.length > 0 && (
        <div className="adm-issues adm-issues--err">
          <b>Lessico non ammesso</b>
          <ul>
            {lexHits.map((h) => <li key={h.field}>{h.field}: {h.hits.map((x) => `“${x.term}”`).join(', ')}</li>)}
          </ul>
          <span className="pe-hint">Nomina il momento, non la condizione: “Venti minuti prima dell’imbarco”, non “Paura di volare”.</span>
        </div>
      )}

      {/* ---- the tier and the four-question sign-off ---------------------
          Recorded on the row (ADM-02, ADM-03). The row cannot be enabled
          without every answer “no”, a name and a date; red never reaches the
          self-guided library. */}
      <div className="pe-field">
        <span className="pe-label">Livello di applicazione <em>quanto la situazione è vicina a una diagnosi o a un percorso di cura</em></span>
        <div className="pe-row">
          {TIERS.map((tier) => (
            <label key={tier.id} className="pe-consent">
              <input type="radio" name="tier" checked={draft.tier === tier.id} onChange={() => set({ tier: tier.id })} />
              <span><b>{tier.label}</b> — {tier.hint}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="pe-field">
        <span className="pe-label">Revisione delle affermazioni <em>le quattro domande; ogni “sì” significa riformulare, spostare ai professionisti o non pubblicare</em></span>
        <div className="pe-consents">
          {GATE_QUESTIONS.map((q) => (
            <div key={q.id} className="pe-consent">
              <span><b>{q.label}.</b> {q.text}</span>
              <span className="pe-row">
                <label><input type="radio" name={`gate-${q.id}`} checked={draft.claimsGate.answers[q.id] === 'no'} onChange={() => set({ claimsGate: { ...draft.claimsGate, answers: { ...draft.claimsGate.answers, [q.id]: 'no' } } })} /> No</label>
                <label><input type="radio" name={`gate-${q.id}`} checked={draft.claimsGate.answers[q.id] === 'yes'} onChange={() => set({ claimsGate: { ...draft.claimsGate, answers: { ...draft.claimsGate.answers, [q.id]: 'yes' } } })} /> Sì</label>
              </span>
            </div>
          ))}
        </div>
        <div className="pe-row">
          <input className="b2b-input" placeholder="Approvato da (nome di chi ha l’autorità di fermare una pubblicazione)" value={draft.claimsGate.approvedBy}
            onChange={(e) => set({ claimsGate: { ...draft.claimsGate, approvedBy: e.target.value, approvedAt: e.target.value.trim() ? (draft.claimsGate.approvedAt ?? Date.now()) : null } })} />
          <input className="b2b-input" placeholder="Riferimento al fascicolo di sostegno, se si afferma un’efficienza" value={draft.claimsGate.substantiation ?? ''}
            onChange={(e) => set({ claimsGate: { ...draft.claimsGate, substantiation: e.target.value } })} />
        </div>
        <span className="pe-hint">
          {gateComplete(draft.claimsGate)
            ? `Firmata da ${draft.claimsGate.approvedBy} il ${new Date(draft.claimsGate.approvedAt ?? 0).toLocaleDateString('it-IT')}.`
            : 'Non ancora firmata: la riga non può essere pubblicata.'}
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
