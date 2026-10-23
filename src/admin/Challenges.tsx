/* ============================================================================
   Sfide — le sfide pubbliche di Good Loop

   docs/gamification/SPEC.md §5.4. Una sfida è un evento a tempo, in due
   formati: individuale (ognuno raggiunge il proprio obiettivo) o collettiva
   di massa (tutti, in un ambito grande, verso un obiettivo comune). Gli
   ambiti sono nazionale, regione, stato, città — nient’altro: niente
   squadre, aree o gruppi piccoli, e il database li rifiuta comunque.

   Le regole fisse del riquadro bloccato non sono impostazioni: le
   garantisce lo schema. Qui si vedono prima di pubblicare, una per una.
   La console è in italiano; quello che la persona legge (titolo, descrizione,
   anteprima) è in portoghese.
   ============================================================================ */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { st } from '../sales/i18n'
import { useDataProvider, type ChallengeReach } from '../data/provider'
import { FixedLocale } from '../i18n'
import { ChallengeCard } from '../selfuse/ChallengeCard'
import { Badge } from '../gamification/ui/Badge'
import { REGION_NAMES, UF_NAMES, type Municipality } from '../gamification/geo'
import type { Benefit } from '../gamification/benefits'
import type { IconName } from '../selfuse/icons'
import {
  blankChallenge, checkRules, type Challenge, type ChallengeAdminRow, type ChallengeMetric, type ChallengeScope,
  type ChallengeStatus, type ChallengeView, type RuleId,
} from '../gamification/challenges'

const STATUS_IT: Record<ChallengeStatus, string> = {
  draft: 'Bozza', scheduled: 'Programmata', active: 'Attiva', ended: 'Conclusa', settled: 'Chiusa', cancelled: 'Annullata',
}
const METRIC_IT: Record<ChallengeMetric, string> = {
  minutes_listened: 'Minuti ascoltati', sessions_completed: 'Sessioni completate', deep_sessions_completed: 'Sessioni Deep completate',
  sessions_in_time_window: 'Sessioni in una fascia oraria', pathway_completed: 'Percorsi completati',
}
/* 'Stato (UF)' and not 'Stato': the word is also the column heading for a
   challenge's status, and one key cannot be two things in the dictionary. */
const SCOPE_IT: Record<ChallengeScope, string> = { national: 'Nazionale', region: 'Regione', state: 'Stato (UF)', city: 'Città', company: 'Azienda' }
const RULE_IT: Record<RuleId, string> = {
  R1: 'Nessuna sequenza di giorni: nessuno perde progressi',
  R2: 'Nessun obiettivo su autovalutazioni, punteggi o VAS',
  R3: 'Le sessioni SOS non contano mai',
  R4: 'Nessuna squadra o piccolo gruppo: nazionale, regione, stato o città',
  dates: 'La fine viene dopo l’inizio',
  reward: 'C’è un premio: Loops bonus e/o un beneficio esclusivo',
  goal: 'Obiettivo valido (e un minimo per persona, se collettiva)',
}
const ICONS: IconName[] = ['flag', 'moon', 'sun', 'clock', 'wave', 'leaf', 'heart', 'run', 'coffee', 'spark', 'calendar', 'headphones', 'pin', 'globe']
type Filter = 'all' | 'active' | 'scheduled' | 'draft' | 'ended'

const toInput = (ms: number) => {
  const d = new Date(ms - 3 * 3_600_000)                    // America/Sao_Paulo has no DST since 2019
  return d.toISOString().slice(0, 16)
}
const fromInput = (s: string) => Date.parse(`${s}:00-03:00`)

export function Challenges({ actor }: { actor: string }) {
  const dp = useDataProvider()
  const [rows, setRows] = useState<ChallengeAdminRow[]>([])
  const [benefits, setBenefits] = useState<Benefit[]>([])
  const [draft, setDraft] = useState<Challenge | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(() => {
    void Promise.all([dp.adminListChallenges(), dp.adminListBenefits()])
      .then(([c, b]) => { setRows(c); setBenefits(b) })
      .catch((e: Error) => setError(e.message))
  }, [dp])
  useEffect(() => { load() }, [load])

  const now = Date.now()
  const shown = rows
    .filter((r) => filter === 'all' || (filter === 'ended' ? ['ended', 'settled', 'cancelled'].includes(r.status) : r.status === filter))
    .filter((r) => !q.trim() || r.title.toLowerCase().includes(q.trim().toLowerCase()))
  const kpi = {
    active: rows.filter((r) => r.status === 'active').length,
    participants: rows.filter((r) => r.status === 'active').reduce((a, r) => a + r.participants, 0),
    completed: rows.reduce((a, r) => a + r.completed, 0),
    rewarded: rows.reduce((a, r) => a + r.rewarded, 0),
  }
  const benefitTitle = useMemo(() => new Map(benefits.map((b) => [b.id, b.title])), [benefits])

  async function act(r: ChallengeAdminRow, action: 'publish' | 'end' | 'cancel' | 'duplicate') {
    const ask: Record<string, string> = {
      end: st('Terminare «{title}» adesso? Si chiude e si assegnano i premi (con sorteggio, se previsto).', { title: r.title }),
      cancel: st('Annullare «{title}»? Nessun premio verrà assegnato da qui in avanti.', { title: r.title }),
    }
    if (ask[action] && !window.confirm(ask[action])) return
    setBusy(true); setError(null); setNote(null)
    try {
      await dp.adminChallengeAction(r.id, action)
      await dp.logAudit({ actor, action: `challenge.${action}`, target: r.title }).catch(() => undefined)
      setNote({ publish: 'Sfida pubblicata.', end: 'Sfida terminata e chiusa.', cancel: 'Sfida annullata.', duplicate: 'Copia creata come bozza.' }[action])
      load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (draft) {
    return (
      <Editor
        draft={draft}
        benefits={benefits}
        busy={busy}
        error={error}
        onChange={setDraft}
        onCancel={() => { setDraft(null); setError(null) }}
        onSave={async (c, then) => {
          setBusy(true); setError(null)
          try {
            const id = await dp.adminSaveChallenge(c)
            if (then !== 'draft') await dp.adminChallengeAction(id, then)
            await dp.logAudit({ actor, action: c.id ? 'challenge.updated' : 'challenge.created', target: c.title, detail: then }).catch(() => undefined)
            setNote(then === 'publish' ? st('Sfida pubblicata.') : then === 'schedule' ? st('Sfida programmata.') : st('Bozza salvata.'))
            setDraft(null)
            load()
          } catch (e) {
            setError((e as Error).message)
          } finally {
            setBusy(false)
          }
        }}
      />
    )
  }

  return (
    <div className="adm-page">
      <header className="adm-page__head adm-page__head--row">
        <div>
          <h1 className="b2b-h1">{st('Sfide Good Loop')}</h1>
          <p className="b2b-sub">{st('Eventi a tempo, individuali o collettivi di massa, per tutto il Brasile o per una regione, uno stato, una città.')}</p>
        </div>
        <button className="b2b-btn b2b-btn--primary" onClick={() => setDraft(blankChallenge(Date.now()))}>{st('+ Nuova sfida')}</button>
      </header>

      <div className="adm-kpis">
        <div><strong>{kpi.active}</strong><span>{st('Sfide attive')}</span></div>
        <div><strong>{kpi.participants}</strong><span>{st('Persone che partecipano')}</span></div>
        <div><strong>{kpi.completed}</strong><span>{st('Hanno completato')}</span></div>
        <div><strong>{kpi.rewarded}</strong><span>{st('Premi consegnati')}</span></div>
      </div>

      {error && <p className="adm-note adm-note--err">{error}</p>}
      {note && <p className="adm-note adm-note--ok">{note}</p>}

      <div className="adm-spec__chips" role="group" aria-label={st('Filtro')}>
        {([['all', 'Tutte'], ['active', 'Attive'], ['scheduled', 'Programmate'], ['draft', 'Bozze'], ['ended', 'Concluse']] as [Filter, string][]).map(([id, label]) => (
          <button key={id} className={`adm-tag${filter === id ? ' is-on' : ''}`} onClick={() => setFilter(id)}>{st(label)}</button>
        ))}
        <input className="b2b-input adm-challenges__search" type="search" placeholder={st('Cerca per nome')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="adm-table adm-table--challenges">
        <div className="adm-tr adm-tr--head">
          <div>{st('Sfida')}</div><div>{st('Periodo')}</div><div>{st('Formato / ambito')}</div><div>{st('Obiettivo')}</div><div>{st('Premio')}</div><div>{st('Partecipano / completato')}</div><div>{st('Stato')}</div><div className="adm-tr__right">{st('Azioni')}</div>
        </div>
        {shown.map((r) => (
          <div className={`adm-tr${['cancelled'].includes(r.status) ? ' is-inactive' : ''}`} key={r.id}>
            <div className="adm-challenge__name">
              <Badge icon={r.badgeIcon as IconName} tier={r.format === 'collective' ? 'coletiva' : 'broto'} shape={r.format === 'collective' ? 'hexagon' : 'circle'} size={32} />
              <strong>{r.title}</strong>
            </div>
            <div>{new Date(r.startsAt).toLocaleDateString('it-IT')} – {new Date(r.endsAt).toLocaleDateString('it-IT')}</div>
            <div>{r.format === 'individual' ? st('Individuale') : st('Collettiva')} · {st(SCOPE_IT[r.scope])}{r.scopeRef ? ` ${scopeLabel(r.scope, r.scopeRef)}` : ''}</div>
            <div>{METRIC_IT[r.metric]}: {r.goalValue}{r.perPersonMin ? ` (min. ${r.perPersonMin} a persona)` : ''}</div>
            <div>{[r.rewardBonusLoopsCenti ? `+${Math.floor(r.rewardBonusLoopsCenti / 100)} Loops` : null, r.rewardBenefitId ? benefitTitle.get(r.rewardBenefitId) ?? st('beneficio') : null].filter(Boolean).join(' · ')}</div>
            <div>{r.participants} / {r.completed}</div>
            <div><span className={`adm-pill ${r.status === 'active' ? 'adm-pill--ok' : 'adm-pill--warn'}`}>{st(STATUS_IT[r.status])}</span></div>
            <div className="adm-tr__right adm-benefit__acts">
              {['draft', 'scheduled'].includes(r.status) && <button className="b2b-btn b2b-btn--ghost" onClick={() => setDraft({ ...r })}>{st('Modifica')}</button>}
              {r.status === 'draft' && <button className="b2b-btn b2b-btn--primary" disabled={busy || r.startsAt >= r.endsAt} onClick={() => void act(r, 'publish')}>{st('Pubblica')}</button>}
              <button className="b2b-btn b2b-btn--ghost" disabled={busy} onClick={() => void act(r, 'duplicate')}>Duplica</button>
              {['scheduled', 'active'].includes(r.status) && r.endsAt > now && <button className="b2b-btn b2b-btn--ghost" disabled={busy} onClick={() => void act(r, 'end')}>Termina</button>}
              {['draft', 'scheduled', 'active'].includes(r.status) && <button className="b2b-btn b2b-btn--danger" disabled={busy} onClick={() => void act(r, 'cancel')}>{st('Annulla')}</button>}
            </div>
          </div>
        ))}
        {!shown.length && <div className="adm-tr"><div className="adm-muted">{st('Nessuna sfida.')}</div></div>}
      </div>

      <div className="adm-challenges__info">
        <section className="card">
          <h2 className="b2b-card__title">{st('Regole fisse in ogni sfida')}</h2>
          <LockedRules />
        </section>
        <section className="card">
          <h2 className="b2b-card__title">{st('Scorte dei premi')}</h2>
          <p className="adm-muted">
            {st('Un beneficio esclusivo con quantità limitata va a chi completa per primo, oppure si sorteggia alla chiusura tra chi ha completato. Alla persona non si mostra mai quante unità restano.')}
          </p>
        </section>
      </div>
    </div>
  )
}

function scopeLabel(scope: ChallengeScope, ref: string): string {
  if (scope === 'region') return REGION_NAMES[ref] ? `(${ref})` : ref
  if (scope === 'state') return UF_NAMES[ref] ?? ref
  return ref
}

function LockedRules() {
  return (
    <p className="adm-note adm-challenges__locked">
      Le sessioni SOS non contano mai · nessun obiettivo su autovalutazioni o VAS · nessuna sequenza di giorni ·
      nessuno perde progressi · nessuna squadra o gruppo piccolo.
    </p>
  )
}

const STEPS = ['Informazioni', 'Periodo', 'Formato e obiettivo', 'Premio', 'Comunicazione', 'Rivedi e pubblica']

function Editor({ draft, benefits, busy, error, onChange, onCancel, onSave }: {
  draft: Challenge; benefits: Benefit[]; busy: boolean; error: string | null
  onChange: (c: Challenge) => void; onCancel: () => void
  onSave: (c: Challenge, then: 'draft' | 'schedule' | 'publish') => void
}) {
  const dp = useDataProvider()
  const [step, setStep] = useState(0)
  const [reach, setReach] = useState<ChallengeReach | null>(null)
  const [cityQ, setCityQ] = useState('')
  const [cities, setCities] = useState<Municipality[]>([])
  const patch = (p: Partial<Challenge>) => onChange({ ...draft, ...p })
  const rules = checkRules(draft)
  const ok = rules.every((r) => r.ok) && draft.title.trim().length > 0
  const prizes = benefits.filter((b) => b.companyId === null && b.status !== 'archived')

  useEffect(() => {
    if (draft.scope !== 'national' && !draft.scopeRef) { setReach(null); return }
    let alive = true
    dp.adminChallengeReach(draft.scope, draft.scope === 'national' ? null : draft.scopeRef).then((r) => { if (alive) setReach(r) }).catch(() => setReach(null))
    return () => { alive = false }
  }, [dp, draft.scope, draft.scopeRef])

  useEffect(() => {
    if (cityQ.trim().length < 2) { setCities([]); return }
    let alive = true
    const tm = window.setTimeout(() => { dp.searchMunicipalities(cityQ).then((r) => { if (alive) setCities(r) }).catch(() => setCities([])) }, 200)
    return () => { alive = false; window.clearTimeout(tm) }
  }, [dp, cityQ])

  /* The Home card exactly as the person will see it — in their language. */
  const preview: ChallengeView = {
    id: 'preview', companyId: null, companyName: null, title: draft.title || st('Nome da sfida'), description: draft.description,
    badgeIcon: draft.badgeIcon, format: draft.format, scope: draft.scope, scopeRef: draft.scopeRef, metric: draft.metric,
    goalValue: draft.goalValue, goalKind: draft.goalKind, perPersonMin: draft.perPersonMin,
    windowStartHour: draft.windowStartHour, windowEndHour: draft.windowEndHour, startsAt: draft.startsAt, endsAt: draft.endsAt,
    status: 'active', rewardBonusLoopsCenti: draft.rewardBonusLoopsCenti,
    rewardBenefit: draft.rewardBenefitId ? { id: draft.rewardBenefitId, title: benefits.find((b) => b.id === draft.rewardBenefitId)?.title ?? '' } : null,
    myProgress: Math.round(draft.goalValue * 0.4), myCompletedAt: null, myRewardedAt: null, myBenefitGranted: false,
    collectiveValue: draft.format === 'collective' ? Math.round(draft.goalValue * 0.4) : null, participants: draft.format === 'collective' ? 0 : null, goalReachedAt: null,
  }

  return (
    <div className="adm-page">
      <header className="adm-page__head">
        <h1 className="b2b-h1">{draft.id ? st('Modifica sfida') : st('Nuova sfida')}</h1>
        <ol className="adm-stepper">
          {STEPS.map((s, i) => (
            <li key={s}><button className={`adm-tag${i === step ? ' is-on' : ''}`} onClick={() => setStep(i)}>{i + 1} · {s}</button></li>
          ))}
        </ol>
      </header>
      {error && <p className="adm-note adm-note--err">{error}</p>}

      <div className="adm-challenges__edit">
        <div className="card adm-partner-form">
          {step === 0 && (
            <div className="adm-partner-form__grid">
              <label className="adm-partner-form__wide"><span className="b2b-label">Nome (pt-BR, max 80) *</span>
                <input className="b2b-input" maxLength={80} value={draft.title} autoFocus onChange={(e) => patch({ title: e.target.value })} /></label>
              <label className="adm-partner-form__wide"><span className="b2b-label">Descrizione breve (pt-BR, una frase)</span>
                <input className="b2b-input" maxLength={280} value={draft.description ?? ''} onChange={(e) => patch({ description: e.target.value || null })} /></label>
              <fieldset className="adm-partner-form__wide adm-benefit__tags"><legend className="b2b-label">{st('Icona del badge')}</legend>
                <div className="adm-spec__chips">
                  {ICONS.map((i) => (
                    <button key={i} type="button" className={`adm-tag adm-icon-pick${draft.badgeIcon === i ? ' is-on' : ''}`} onClick={() => patch({ badgeIcon: i })} aria-label={i}>
                      <Badge icon={i} tier={draft.format === 'collective' ? 'coletiva' : 'broto'} shape={draft.format === 'collective' ? 'hexagon' : 'circle'} size={36} />
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          )}

          {step === 1 && (
            <div className="adm-partner-form__grid">
              <label><span className="b2b-label">{st('Inizio')}</span>
                <input className="b2b-input" type="datetime-local" value={toInput(draft.startsAt)} onChange={(e) => patch({ startsAt: fromInput(e.target.value) })} /></label>
              <label><span className="b2b-label">{st('Fine')}</span>
                <input className="b2b-input" type="datetime-local" value={toInput(draft.endsAt)} onChange={(e) => patch({ endsAt: fromInput(e.target.value) })} /></label>
              <p className="adm-muted adm-partner-form__wide">{st('Fuso orario: America/Sao_Paulo. Contano le sessioni che FINISCONO dentro il periodo.')}</p>
            </div>
          )}

          {step === 2 && (
            <div className="adm-partner-form__grid">
              <label><span className="b2b-label">{st('Formato')}</span>
                <select className="b2b-input" value={draft.format} onChange={(e) => patch({ format: e.target.value as Challenge['format'], perPersonMin: e.target.value === 'collective' ? draft.perPersonMin ?? 1 : null })}>
                  <option value="individual">{st('Individuale — ognuno il proprio obiettivo')}</option>
                  <option value="collective">{st('Collettiva di massa — un obiettivo comune')}</option>
                </select></label>
              <label><span className="b2b-label">{st('Ambito')}</span>
                <select className="b2b-input" value={draft.scope} onChange={(e) => patch({ scope: e.target.value as ChallengeScope, scopeRef: null })}>
                  {(['national', 'region', 'state', 'city'] as ChallengeScope[]).map((s) => <option key={s} value={s}>{st(SCOPE_IT[s])}</option>)}
                </select></label>
              {draft.scope === 'region' && (
                <label><span className="b2b-label">{st('Regione')}</span>
                  <select className="b2b-input" value={draft.scopeRef ?? ''} onChange={(e) => patch({ scopeRef: e.target.value || null })}>
                    <option value="">—</option>
                    {Object.keys(REGION_NAMES).map((r) => <option key={r} value={r}>{r}</option>)}
                  </select></label>
              )}
              {draft.scope === 'state' && (
                <label><span className="b2b-label">{st('Stato')}</span>
                  <select className="b2b-input" value={draft.scopeRef ?? ''} onChange={(e) => patch({ scopeRef: e.target.value || null })}>
                    <option value="">—</option>
                    {Object.entries(UF_NAMES).map(([uf, name]) => <option key={uf} value={uf}>{name}</option>)}
                  </select></label>
              )}
              {draft.scope === 'city' && (
                <label><span className="b2b-label">Città {draft.scopeRef && `(${draft.scopeRef})`}</span>
                  <input className="b2b-input" placeholder={st('Cerca per nome')} value={cityQ} onChange={(e) => setCityQ(e.target.value)} />
                  {cities.length > 0 && (
                    <select className="b2b-input" size={Math.min(6, cities.length)} onChange={(e) => { patch({ scopeRef: e.target.value }); setCityQ('') }}>
                      {cities.map((m) => <option key={m.ibgeCode} value={m.ibgeCode}>{m.name} · {m.uf}</option>)}
                    </select>
                  )}
                </label>
              )}
              {reach && (
                <p className={`adm-note ${reach.enough ? 'adm-note--ok' : 'adm-note--warn'} adm-partner-form__wide`}>
                  {reach.enough ? 'Popolazione attiva sufficiente.' : `Popolazione attiva insufficiente: servono almeno ${reach.threshold} persone attive nel mese.`}
                  {' '}Portata stimata: {reach.people.toLocaleString('it-IT')} persone · attive il mese scorso: {reach.activeLastMonth.toLocaleString('it-IT')}.
                </p>
              )}
              <label><span className="b2b-label">{st('Metrica')}</span>
                <select className="b2b-input" value={draft.metric} onChange={(e) => patch({ metric: e.target.value as ChallengeMetric, windowStartHour: e.target.value === 'sessions_in_time_window' ? 21 : null, windowEndHour: e.target.value === 'sessions_in_time_window' ? 24 : null })}>
                  {(Object.keys(METRIC_IT) as ChallengeMetric[]).map((m) => <option key={m} value={m}>{METRIC_IT[m]}</option>)}
                </select></label>
              <label><span className="b2b-label">Obiettivo {draft.metric === 'minutes_listened' ? '(minuti)' : ''}</span>
                <input className="b2b-input" type="number" min={1} value={draft.goalValue} onChange={(e) => patch({ goalValue: Math.max(1, Math.round(Number(e.target.value) || 1)) })} /></label>
              {draft.format === 'collective' && (
                <label><span className="b2b-label">{st('Minimo a persona per il premio')}</span>
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
            </div>
          )}

          {step === 3 && (
            <div className="adm-partner-form__grid">
              <label><span className="b2b-label">Loops bonus (mai moltiplicati)</span>
                <input className="b2b-input" type="number" min={0} value={Math.floor((draft.rewardBonusLoopsCenti ?? 0) / 100)} onChange={(e) => patch({ rewardBonusLoopsCenti: Math.max(0, Math.round(Number(e.target.value) || 0)) * 100 || null })} /></label>
              <label><span className="b2b-label">{st('Beneficio esclusivo')}</span>
                <select className="b2b-input" value={draft.rewardBenefitId ?? ''} onChange={(e) => patch({ rewardBenefitId: e.target.value || null })}>
                  <option value="">{st('— nessuno —')}</option>
                  {prizes.map((b) => <option key={b.id} value={b.id}>{b.title}{b.priceLoopsCenti === null ? st(' (solo sfida)') : ''}</option>)}
                </select></label>
              <label><span className="b2b-label">{st('Se le unità non bastano')}</span>
                <select className="b2b-input" value={draft.rewardRule} onChange={(e) => patch({ rewardRule: e.target.value as Challenge['rewardRule'] })}>
                  <option value="first_to_complete">{st('A chi completa per primo')}</option>
                  <option value="raffle">{st('Sorteggio alla chiusura')}</option>
                </select></label>
              <p className="adm-muted adm-partner-form__wide">{st('La quantità è quella del beneficio (Benefici › Quantità totale). Un beneficio «solo sfida» si collega a questa sfida al salvataggio.')}</p>
            </div>
          )}

          {step === 4 && (
            <label className="adm-partner-form__check">
              <input type="checkbox" checked={draft.announceInApp} onChange={(e) => patch({ announceInApp: e.target.checked })} />
              <span>{st('Annunciare nell’app — un messaggio gentile, una volta sola, mai notifiche ripetute.')}</span>
            </label>
          )}

          {step === 5 && (
            <>
              <ul className="adm-rules">
                {rules.map((r) => <li key={r.id} className={r.ok ? 'is-ok' : 'is-bad'}>{r.ok ? '✓' : '✗'} {st(RULE_IT[r.id])}</li>)}
              </ul>
              <div className="adm-made__acts">
                <button className="b2b-btn b2b-btn--ghost" disabled={busy || !draft.title.trim()} onClick={() => onSave(draft, 'draft')}>{st('Salva bozza')}</button>
                <button className="b2b-btn b2b-btn--ghost" disabled={busy || !ok || draft.startsAt <= Date.now()} onClick={() => onSave(draft, 'schedule')}>Programma</button>
                <button className="b2b-btn b2b-btn--primary" disabled={busy || !ok} onClick={() => onSave(draft, 'publish')}>{st('Pubblica ora')}</button>
              </div>
            </>
          )}

          <div className="adm-made__acts">
            {step > 0 && <button className="b2b-btn b2b-btn--ghost" onClick={() => setStep(step - 1)}>Indietro</button>}
            {step < STEPS.length - 1 && <button className="b2b-btn b2b-btn--primary" onClick={() => setStep(step + 1)}>Avanti</button>}
            <button className="b2b-btn b2b-btn--ghost" disabled={busy} onClick={onCancel}>{st('Chiudi senza salvare')}</button>
          </div>
        </div>

        <aside className="adm-challenges__side">
          <LockedRules />
          <p className="b2b-label">{st('Anteprima nella Home')}</p>
          <div className="su-studio adm-challenges__preview">
            <FixedLocale locale="pt-BR">
              <ChallengeCard c={preview} onOpen={() => undefined} />
            </FixedLocale>
          </div>
        </aside>
      </div>
    </div>
  )
}
