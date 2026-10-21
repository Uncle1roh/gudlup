/* ============================================================================
   Tag — la tassonomia dei benefici

   docs/gamification/SPEC.md §6.4, §8. Due gruppi: il segmento del partner e
   il tipo di beneficio. Ogni beneficio Good Loop ne porta almeno uno, e sono
   i tag che un’azienda con l’add-on può spegnere per i propri dipendenti
   (per esempio un’azienda alimentare che spegne «Alimentos e bebidas» per
   conflitto di interessi). Le etichette sono in portoghese: è così che le
   legge la persona e l’RH.
   ============================================================================ */

import { useCallback, useEffect, useState } from 'react'
import { useDataProvider } from '../data/provider'
import type { Benefit, BenefitTag, TagGroup } from '../gamification/benefits'

const GROUP_IT: Record<TagGroup, string> = { partner_segment: 'Segmento del partner', benefit_type: 'Tipo di beneficio' }

export function Tags({ actor }: { actor: string }) {
  const dp = useDataProvider()
  const [tags, setTags] = useState<BenefitTag[]>([])
  const [benefits, setBenefits] = useState<Benefit[]>([])
  const [draft, setDraft] = useState<BenefitTag | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    void Promise.all([dp.listBenefitTags(), dp.adminListBenefits()])
      .then(([t, b]) => { setTags(t); setBenefits(b) })
      .catch((e: Error) => setError(e.message))
  }, [dp])
  useEffect(() => { load() }, [load])

  async function save(t: BenefitTag) {
    setBusy(true); setError(null)
    try {
      if (!/^[a-z0-9_]+$/.test(t.slug)) throw new Error('Lo slug usa solo lettere minuscole, cifre e _.')
      await dp.adminSaveTag(t)
      await dp.logAudit({ actor, action: t.id ? 'benefit_tag.updated' : 'benefit_tag.created', target: t.slug }).catch(() => undefined)
      setDraft(null)
      load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const uses = (id: string) => benefits.filter((b) => b.tagIds.includes(id) && b.status !== 'archived').length

  return (
    <div className="adm-page">
      <header className="adm-page__head adm-page__head--row">
        <div>
          <h1 className="b2b-h1">Tag</h1>
          <p className="b2b-sub">I tag dei benefici. Le aziende con l’add-on possono spegnerli per i propri dipendenti; i codici già riscattati restano visibili.</p>
        </div>
        {!draft && <button className="b2b-btn b2b-btn--primary" onClick={() => setDraft({ id: '', slug: '', label: '', group: 'partner_segment', description: null, active: true })}>+ Nuovo tag</button>}
      </header>
      {error && <p className="adm-note adm-note--err">{error}</p>}

      {draft && (
        <div className="card adm-partner-form">
          <div className="adm-partner-form__grid">
            <label><span className="b2b-label">Etichetta (pt-BR) *</span>
              <input className="b2b-input" value={draft.label} autoFocus onChange={(e) => setDraft({ ...draft, label: e.target.value })} /></label>
            <label><span className="b2b-label">Slug *</span>
              <input className="b2b-input adm-mono" value={draft.slug} disabled={!!draft.id} onChange={(e) => setDraft({ ...draft, slug: e.target.value.toLowerCase() })} /></label>
            <label><span className="b2b-label">Gruppo</span>
              <select className="b2b-input" value={draft.group} onChange={(e) => setDraft({ ...draft, group: e.target.value as TagGroup })}>
                {(Object.keys(GROUP_IT) as TagGroup[]).map((g) => <option key={g} value={g}>{GROUP_IT[g]}</option>)}
              </select></label>
            <label className="adm-partner-form__check">
              <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /><span>Attivo</span></label>
          </div>
          <div className="adm-made__acts">
            <button className="b2b-btn b2b-btn--primary" disabled={busy || !draft.label.trim() || !draft.slug} onClick={() => void save(draft)}>Salva</button>
            <button className="b2b-btn b2b-btn--ghost" disabled={busy} onClick={() => setDraft(null)}>Annulla</button>
          </div>
        </div>
      )}

      {(Object.keys(GROUP_IT) as TagGroup[]).map((g) => (
        <section key={g}>
          <h2 className="adm-h2">{GROUP_IT[g]}</h2>
          <div className="adm-table adm-table--tags">
            <div className="adm-tr adm-tr--head"><div>Etichetta</div><div>Slug</div><div>Benefici</div><div>Stato</div><div className="adm-tr__right">Azione</div></div>
            {tags.filter((t) => t.group === g).map((t) => (
              <div className={`adm-tr${t.active ? '' : ' is-inactive'}`} key={t.id}>
                <div>{t.label}</div>
                <div className="adm-mono">{t.slug}</div>
                <div>{uses(t.id)}</div>
                <div>{t.active ? 'attivo' : 'spento'}</div>
                <div className="adm-tr__right"><button className="b2b-btn b2b-btn--ghost" onClick={() => setDraft({ ...t })}>Modifica</button></div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
