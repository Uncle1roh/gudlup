/* ============================================================================
   Good Loop — the PUBLIC CARD of a clinical protocol (admin)

   A clinical protocol has two names and they do different jobs:

     · the CLINICAL title ("Calm and Inner Security") names a therapeutic
       intent. It is the therapist's and the admin's name for the material, it
       stays on the catalog row, in the plan and in the clinical record, and it
       is never edited here.

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

import { useState } from 'react'
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

export interface ProtocolCardDraft {
  code: string
  /** Clinical title — shown for context, not editable here. */
  title: string
  publicTitle: string
  publicBlurb: string
  tags: string[]
}

export function cardDraftFrom(p: CatalogProtocol): ProtocolCardDraft {
  return {
    code: p.code,
    title: p.title,
    publicTitle: p.publicTitle ?? '',
    publicBlurb: p.publicBlurb ?? '',
    tags: tagsOf(p),
  }
}

/** Fold a card onto a catalog entry. Everything the import and the Studio own
    — the timelines, the sessions, the versions, the rendered audio — is
    carried through untouched: this editor owns naming and tags, nothing else. */
export function applyCardDraft(draft: ProtocolCardDraft, existing: CatalogProtocol): CatalogProtocol {
  const publicTitle = draft.publicTitle.trim()
  const publicBlurb = draft.publicBlurb.trim()
  return {
    ...existing,
    publicTitle: publicTitle || undefined,
    publicBlurb: publicBlurb || undefined,
    tags: normalizeTags(draft.tags),
    updatedAt: Date.now(),
  }
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
  const set = (p: Partial<ProtocolCardDraft>) => onChange({ ...draft, ...p })
  const full = draft.tags.length >= MAX_TAGS

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
        Il titolo clinico resta <b>{draft.title}</b> e non cambia. Il <b>nome pubblico</b> è quello che legge
        la persona: dice il momento, non il disturbo. Lasciandolo vuoto si continua a mostrare il titolo clinico.
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
        <button className="b2b-btn b2b-btn--primary" disabled={busy} onClick={onSave}>
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
