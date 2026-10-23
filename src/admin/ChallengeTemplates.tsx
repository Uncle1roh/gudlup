/* ============================================================================
   Modelli di sfida — the only words of a company challenge (SPN-06, PLAN A4)

   An HR team never writes a challenge's title or text: it picks one of these
   templates and sets the dates, the goal and the reward. So the templates are
   Good Loop's to write, here, in Portuguese as the employee reads them.
   Switching one off stops it being offered; challenges made from it stay.
   ============================================================================ */

import { useCallback, useEffect, useState } from 'react'
import { st } from '../sales/i18n'
import { useDataProvider } from '../data/provider'
import { FixedLocale } from '../i18n'
import { ChallengeCard } from '../selfuse/ChallengeCard'
import { Badge } from '../gamification/ui/Badge'
import { checkRules, type ChallengeMetric, type RuleId } from '../gamification/challenges'
import type { ChallengeTemplate } from '../gamification/company'
import type { IconName } from '../selfuse/icons'

const METRIC_IT: Record<ChallengeMetric, string> = {
  minutes_listened: 'Minuti ascoltati', sessions_completed: 'Sessioni completate', deep_sessions_completed: 'Sessioni Deep completate',
  sessions_in_time_window: 'Sessioni in una fascia oraria', pathway_completed: 'Percorsi completati',
}
/* The fixed rules of a company challenge. Held as keys and read through
   `st` at render time, not translated here: the console's language can be
   changed without reloading it. */
const RULE_IT: Record<RuleId, string> = {
  R1: 'Nessuna sequenza di giorni: nessuno perde progressi',
  R2: 'Nessun obiettivo su autovalutazioni, punteggi o VAS',
  R3: 'Le sessioni SOS non contano mai',
  R4: 'Tutta l’azienda: niente squadre o gruppi piccoli',
  dates: 'Una durata valida',
  reward: 'C’è un premio',
  goal: 'Obiettivo valido (e un minimo a persona, se collettiva)',
}
const ICONS: IconName[] = ['flag', 'moon', 'sun', 'clock', 'wave', 'leaf', 'heart', 'run', 'coffee', 'spark', 'calendar', 'headphones', 'building']
const DAY = 86_400_000

const BLANK: ChallengeTemplate = {
  slug: '', title: '', description: '', badgeIcon: 'flag', format: 'individual', metric: 'sessions_completed',
  goalValue: 3, goalKind: 'total', perPersonMin: null, windowStartHour: null, windowEndHour: null, defaultDays: 30, active: true,
}

export function ChallengeTemplates({ actor }: { actor: string }) {
  const dp = useDataProvider()
  const [rows, setRows] = useState<ChallengeTemplate[]>([])
  const [draft, setDraft] = useState<ChallengeTemplate | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const load = useCallback(() => { void dp.adminListChallengeTemplates().then(setRows).catch((e: Error) => setError(e.message)) }, [dp])
  useEffect(load, [load])

  const now = Date.now()
  const rules = draft ? checkRules({
    companyId: 'company', format: draft.format, scope: 'company', scopeRef: 'company', metric: draft.metric, goalValue: draft.goalValue,
    goalKind: draft.goalKind, perPersonMin: draft.perPersonMin, windowStartHour: draft.windowStartHour, windowEndHour: draft.windowEndHour,
    startsAt: now, endsAt: now + draft.defaultDays * DAY, rewardBonusLoopsCenti: 100, rewardBenefitId: null,
  }).filter((r) => r.id !== 'reward') : []
  const patch = (p: Partial<ChallengeTemplate>) => draft && setDraft({ ...draft, ...p })

  async function save(t: ChallengeTemplate) {
    setBusy(true); setError(null); setNote(null)
    try {
      if (!/^[a-z0-9_]+$/.test(t.slug)) throw new Error(st('Lo slug usa solo lettere minuscole, cifre e _.'))
      if (!t.title.trim() || !t.description.trim()) throw new Error(st('Servono un nome e un testo (in portoghese).'))
      await dp.adminSaveChallengeTemplate(t)
      await dp.logAudit({ actor, action: 'challenge_template.saved', target: t.slug, detail: t.active === false ? 'spento' : 'offerto' }).catch(() => undefined)
      setNote(st('Modello «{title}» salvato.', { title: t.title }))
      setDraft(null)
      load()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="adm-page">
      <header className="adm-page__head adm-page__head--row">
        <div>
          <h1 className="b2b-h1">{st('Modelli di sfida')}</h1>
          <p className="b2b-sub">{st('L’RH sceglie un modello e imposta date, obiettivo e premio; nome e testo restano questi. Sono in portoghese, come li legge il dipendente.')}</p>
        </div>
        {!draft && <button className="b2b-btn b2b-btn--primary" onClick={() => { setDraft({ ...BLANK }); setIsNew(true) }}>{st('+ Nuovo modello')}</button>}
      </header>
      {error && <p className="adm-note adm-note--err">{error}</p>}
      {note && <p className="adm-note adm-note--ok">{note}</p>}

      {draft && (
        <div className="adm-challenges__edit">
          <div className="card adm-partner-form">
            <div className="adm-partner-form__grid">
              <label><span className="b2b-label">{st('Slug *')}</span>
                <input className="b2b-input adm-mono" value={draft.slug} disabled={!isNew} onChange={(e) => patch({ slug: e.target.value.toLowerCase() })} /></label>
              <label><span className="b2b-label">Nome (pt-BR) *</span>
                <input className="b2b-input" maxLength={80} value={draft.title} onChange={(e) => patch({ title: e.target.value })} /></label>
              <label className="adm-partner-form__wide"><span className="b2b-label">Testo (pt-BR, una frase) *</span>
                <input className="b2b-input" maxLength={280} value={draft.description} onChange={(e) => patch({ description: e.target.value })} /></label>
              <label><span className="b2b-label">{st('Formato')}</span>
                <select className="b2b-input" value={draft.format} onChange={(e) => patch({ format: e.target.value as ChallengeTemplate['format'], goalKind: 'total', perPersonMin: e.target.value === 'collective' ? 1 : null })}>
                  <option value="individual">{st('Individuale')}</option><option value="collective">{st('Collettiva — tutta l’azienda')}</option>
                </select></label>
              {draft.format === 'collective' && (
                <label><span className="b2b-label">{st('Obiettivo letto come')}</span>
                  <select className="b2b-input" value={draft.goalKind} onChange={(e) => patch({ goalKind: e.target.value as ChallengeTemplate['goalKind'] })}>
                    <option value="total">{st('Totale comune')}</option><option value="share_reaching_min">{st('% dell’azienda che raggiunge il minimo')}</option>
                  </select></label>
              )}
              <label><span className="b2b-label">{st('Metrica')}</span>
                <select className="b2b-input" value={draft.metric} onChange={(e) => patch({ metric: e.target.value as ChallengeMetric, windowStartHour: e.target.value === 'sessions_in_time_window' ? 21 : null, windowEndHour: e.target.value === 'sessions_in_time_window' ? 24 : null })}>
                  {(Object.keys(METRIC_IT) as ChallengeMetric[]).map((m) => <option key={m} value={m}>{st(METRIC_IT[m])}</option>)}
                </select></label>
              <label><span className="b2b-label">Obiettivo proposto{draft.goalKind === 'share_reaching_min' ? ' (%)' : ''}</span>
                <input className="b2b-input" type="number" min={1} value={draft.goalValue} onChange={(e) => patch({ goalValue: Math.max(1, Math.round(Number(e.target.value) || 1)) })} /></label>
              {draft.format === 'collective' && (
                <label><span className="b2b-label">{st('Minimo a persona')}</span>
                  <input className="b2b-input" type="number" min={1} value={draft.perPersonMin ?? 1} onChange={(e) => patch({ perPersonMin: Math.max(1, Math.round(Number(e.target.value) || 1)) })} /></label>
              )}
              {draft.metric === 'sessions_in_time_window' && (
                <>
                  <label><span className="b2b-label">Dalle (ora)</span>
                    <input className="b2b-input" type="number" min={0} max={23} value={draft.windowStartHour ?? 0} onChange={(e) => patch({ windowStartHour: Math.max(0, Math.min(23, Math.round(Number(e.target.value)))) })} /></label>
                  <label><span className="b2b-label">Alle (ora)</span>
                    <input className="b2b-input" type="number" min={1} max={24} value={draft.windowEndHour ?? 24} onChange={(e) => patch({ windowEndHour: Math.max(1, Math.min(24, Math.round(Number(e.target.value)))) })} /></label>
                </>
              )}
              <label><span className="b2b-label">Durata proposta (giorni)</span>
                <input className="b2b-input" type="number" min={1} max={92} value={draft.defaultDays} onChange={(e) => patch({ defaultDays: Math.max(1, Math.min(92, Math.round(Number(e.target.value) || 30))) })} /></label>
              <label><span className="b2b-label">{st('Icona')}</span>
                <select className="b2b-input" value={draft.badgeIcon} onChange={(e) => patch({ badgeIcon: e.target.value })}>
                  {ICONS.map((i) => <option key={i} value={i}>{i}</option>)}
                </select></label>
              <label className="adm-partner-form__check">
                <input type="checkbox" checked={draft.active !== false} onChange={(e) => patch({ active: e.target.checked })} /><span>{st('Offerto alle aziende')}</span>
              </label>
            </div>
            <ul className="adm-rules">{rules.map((r) => <li key={r.id} className={r.ok ? 'is-ok' : 'is-bad'}>{r.ok ? '✓' : '✗'} {st(RULE_IT[r.id])}</li>)}</ul>
            <div className="adm-made__acts">
              <button className="b2b-btn b2b-btn--primary" disabled={busy || !rules.every((r) => r.ok)} onClick={() => void save(draft)}>{st('Salva modello')}</button>
              <button className="b2b-btn b2b-btn--ghost" disabled={busy} onClick={() => setDraft(null)}>{st('Annulla')}</button>
            </div>
          </div>
          <aside className="adm-challenges__side">
            <p className="b2b-label">{st('Anteprima nella Home del dipendente')}</p>
            <div className="su-studio adm-challenges__preview">
              <FixedLocale locale="pt-BR">
                <ChallengeCard onOpen={() => undefined} c={{
                  id: 'preview', companyId: 'company', companyName: null, title: draft.title || 'Nome do desafio', description: draft.description,
                  badgeIcon: draft.badgeIcon, format: draft.format, scope: 'company', scopeRef: 'company', metric: draft.metric, goalValue: draft.goalValue,
                  goalKind: draft.goalKind, perPersonMin: draft.perPersonMin, windowStartHour: draft.windowStartHour, windowEndHour: draft.windowEndHour,
                  startsAt: now, endsAt: now + draft.defaultDays * DAY, status: 'active', rewardBonusLoopsCenti: 2000, rewardBenefit: null,
                  myProgress: Math.round(draft.goalValue * 0.4), myCompletedAt: null, myRewardedAt: null, myBenefitGranted: false,
                  collectiveValue: draft.format === 'collective' ? Math.round(draft.goalValue * 0.4) : null, participants: null, goalReachedAt: null,
                }} />
              </FixedLocale>
            </div>
          </aside>
        </div>
      )}

      <div className="adm-table adm-table--templates">
        <div className="adm-tr adm-tr--head"><div>{st('Modello')}</div><div>{st('Formato')}</div><div>{st('Obiettivo')}</div><div>{st('Stato')}</div><div className="adm-tr__right" /></div>
        {rows.map((t) => (
          <div className={`adm-tr${t.active === false ? ' is-inactive' : ''}`} key={t.slug}>
            <div className="adm-challenge__name">
              <Badge icon={t.badgeIcon as IconName} tier={t.format === 'collective' ? 'empresa' : 'broto'} shape={t.format === 'collective' ? 'hexagon' : 'circle'} size={32} />
              <div><strong>{t.title}</strong><div className="adm-muted">{t.description}</div></div>
            </div>
            <div>{t.format === 'individual' ? st('Individuale') : st('Collettiva')}</div>
            <div>{st(METRIC_IT[t.metric])}: {t.goalValue}{t.goalKind === 'share_reaching_min' ? st('% con {n}+', { n: t.perPersonMin ?? 0 }) : ''} · {st('{n} gg', { n: t.defaultDays })}</div>
            <div>{t.active === false ? 'spento' : 'offerto'}</div>
            <div className="adm-tr__right"><button className="b2b-btn b2b-btn--ghost" onClick={() => { setDraft({ ...t }); setIsNew(false) }}>{st('Modifica')}</button></div>
          </div>
        ))}
      </div>
    </div>
  )
}
