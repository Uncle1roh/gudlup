/* ============================================================================
   Corporate Dashboard — the gamification add-on (docs/gamification/SPEC.md §7.2)

   Three destinations, shown only while the company has an active add-on:
     Desafios (Add-on)   company challenges, from approved templates only
     Benefícios (Add-on) the tag filter, the company's own benefits, and the
                         identified redemptions employees chose
     Plano               the plan, read-only

   What HR can never see here, by construction: a person (except an
   identified redemption the employee consented to), a balance, a
   redemption of a code, a breakdown by area, unit or team, or any figure
   from fewer than 25 people or that would let one be recovered by
   subtraction. The server returns those as nothing; this screen only says
   so. Company challenge copy comes from the template (SPN-06).
   ============================================================================ */

import { useCallback, useEffect, useState } from 'react'
import { useI18n, fmtDate } from '../i18n'
import { useDataProvider } from '../data/provider'
import { PILLARS, type Pillar } from '../gamification/benefits'
import { checkRules, type RuleId } from '../gamification/challenges'
import type {
  AddonDashboard, AddonInfo, ChallengeTemplate, CompanyBenefitRow, CompanyChallengeDraft, IdentifiedRedemption, TagFilterRow,
} from '../gamification/company'

const DAY = 86_400_000

export function PrivacyBanner() {
  const { t } = useI18n()
  return (
    <p className="c-note c-addon-banner" role="note">
      {t('You only see the company’s aggregate results. Names appear only when an employee chooses to identify themselves to redeem a benefit.')}
    </p>
  )
}

function Hidden({ k }: { k: number }) {
  const { t } = useI18n()
  return <span className="c-small" title={t('Hidden: fewer than {k} people, or it would reveal a group that small.', { k: String(k) })}>{t('—  fewer than {k} people', { k: String(k) })}</span>
}

/* ---------------------------------------------------------- Plano ------- */

export function AddonPlan({ addon }: { addon: AddonInfo }) {
  const { t } = useI18n()
  const yes = (b: boolean) => (b ? t('Included') : t('Not included'))
  return (
    <section className="c-panel">
      <h2 className="c-h2">{t('Plan')}</h2>
      <PrivacyBanner />
      <div className="c-card">
        <h3 className="c-h3">{addon.planName}</h3>
        <p className="c-lead">{t('Your people receive {x}× the Loops they earn by listening.', { x: addon.multiplier.toLocaleString('pt-BR') })}</p>
        <table className="c-table">
          <tbody>
            <tr><td>{t('Company challenges')}</td><td>{yes(addon.companyChallenges)}</td></tr>
            <tr><td>{t('Company benefits')}</td><td>{yes(addon.companyBenefits)}</td></tr>
            <tr><td>{t('Benefit tag filter')}</td><td>{yes(addon.tagFilter)}</td></tr>
            <tr><td>{t('Since')}</td><td>{fmtDate(addon.startsAt)}</td></tr>
            {addon.endsAt && <tr><td>{t('Until')}</td><td>{fmtDate(addon.endsAt)}</td></tr>}
          </tbody>
        </table>
        <p className="c-small">{t('The multiplier applies only to Loops from listening. It never changes rankings, achievements, challenge progress or bonuses.')}</p>
        <a className="c-btn c-btn--ghost" href="mailto:support@goodloop.health?subject=Upgrade%20add-on">{t('Talk to us about your plan')}</a>
      </div>
    </section>
  )
}

/* -------------------------------------------------- Desafios (Add-on) --- */

const RULE_TEXT: Record<RuleId, string> = {
  R1: 'No daily streaks — nobody loses progress',
  R2: 'No goals on self-assessments or VAS',
  R3: 'SOS sessions never count',
  R4: 'The whole company — no teams or small groups',
  dates: 'The end comes after the start',
  reward: 'There is a reward',
  goal: 'The goal is valid',
}

export function AddonChallenges({ addon }: { addon: AddonInfo }) {
  const { t } = useI18n()
  const dp = useDataProvider()
  const [dash, setDash] = useState<AddonDashboard | null>(null)
  const [templates, setTemplates] = useState<ChallengeTemplate[]>([])
  const [benefits, setBenefits] = useState<CompanyBenefitRow[]>([])
  const [draft, setDraft] = useState<CompanyChallengeDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    void Promise.all([dp.hrAddonDashboard(), dp.listChallengeTemplates(), addon.companyBenefits ? dp.hrListCompanyBenefits() : Promise.resolve([])])
      .then(([d, tp, b]) => { setDash(d); setTemplates(tp); setBenefits(b) })
      .catch((e: Error) => setError(e.message))
  }, [dp, addon.companyBenefits])
  useEffect(load, [load])

  async function act(id: string, action: 'publish' | 'end' | 'cancel') {
    if (action !== 'publish' && !window.confirm(action === 'end' ? t('End this challenge now? Rewards are settled.') : t('Cancel this challenge? No reward will be given from now on.'))) return
    setBusy(true); setError(null)
    try { await dp.hrCompanyChallengeAction(id, action); load() } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  async function save(publish: boolean) {
    if (!draft) return
    setBusy(true); setError(null)
    try {
      const id = await dp.hrSaveCompanyChallenge(draft)
      if (publish) await dp.hrCompanyChallengeAction(id, 'publish')
      setDraft(null)
      load()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  if (!addon.companyChallenges) {
    return <section className="c-panel"><h2 className="c-h2">{t('Challenges (Add-on)')}</h2><p className="c-small">{t('Company challenges are not included in your plan.')}</p></section>
  }

  const k = dash?.minCohort ?? 25
  const active = dash?.challenges.find((c) => c.status === 'active')
  const tpl = draft ? templates.find((x) => x.slug === draft.templateSlug) : undefined
  const rules = draft && tpl ? checkRules({
    companyId: 'company', format: tpl.format, scope: 'company', scopeRef: 'company', metric: tpl.metric, goalValue: draft.goalValue,
    goalKind: tpl.goalKind, perPersonMin: draft.perPersonMin, windowStartHour: tpl.windowStartHour, windowEndHour: tpl.windowEndHour,
    startsAt: draft.startsAt, endsAt: draft.endsAt, rewardBonusLoopsCenti: draft.rewardBonusLoopsCenti, rewardBenefitId: draft.rewardBenefitId,
  }) : []

  return (
    <section className="c-panel">
      <div className="c-row c-row--between">
        <h2 className="c-h2">{t('Challenges (Add-on)')}</h2>
        {!draft && <button className="c-btn c-btn--primary" onClick={() => setDraft({ id: '', templateSlug: templates[0]?.slug ?? '', goalValue: templates[0]?.goalValue ?? 3, perPersonMin: templates[0]?.perPersonMin ?? null, startsAt: Date.now(), endsAt: Date.now() + (templates[0]?.defaultDays ?? 30) * DAY, rewardBonusLoopsCenti: 2000, rewardBenefitId: null, rewardRule: 'first_to_complete' })}>{t('New challenge')}</button>}
      </div>
      <PrivacyBanner />
      {error && <p className="c-err">{error}</p>}

      {dash && (
        <div className="c-grid c-addon-kpis">
          <div className="c-card"><span className="c-kpi__label">{t('Active challenges')}</span><span className="c-kpi__value">{dash.activeChallenges}</span></div>
          <div className="c-card"><span className="c-kpi__label">{t('Challenge adhesion')}</span>
            <span className="c-kpi__value">{active?.adhesionPct != null ? `${active.adhesionPct}%` : <Hidden k={k} />}</span></div>
          <div className="c-card"><span className="c-kpi__label">{t('Loops from the multiplier this month')}</span>
            <span className="c-kpi__value">{dash.multiplierLoopsMonth != null ? dash.multiplierLoopsMonth.toLocaleString('pt-BR') : <Hidden k={k} />}</span></div>
          <div className="c-card"><span className="c-kpi__label">{t('Benefits redeemed this month')}</span>
            <span className="c-kpi__value">{dash.redemptionsMonth != null ? dash.redemptionsMonth : <Hidden k={k} />}</span></div>
        </div>
      )}

      {draft && (
        <div className="c-card c-form">
          <h3 className="c-h3">{t('New company challenge')}</h3>
          <p className="c-small">{t('Start from a template. Its name and text are what your people read — they are written by Good Loop, so every company challenge speaks the same careful language.')}</p>
          <div className="c-addon-templates">
            {templates.map((x) => (
              <button key={x.slug} className={`c-card c-addon-template${draft.templateSlug === x.slug ? ' is-on' : ''}`}
                      onClick={() => setDraft({ ...draft, templateSlug: x.slug, goalValue: x.goalValue, perPersonMin: x.perPersonMin, endsAt: draft.startsAt + x.defaultDays * DAY })}>
                <strong>{x.title}</strong>
                <span className="c-small">{x.description}</span>
                <span className="c-small">{x.format === 'collective' ? t('Collective · the whole company') : t('Individual')}</span>
              </button>
            ))}
          </div>
          <div className="c-twocol">
            <label className="c-field"><span className="c-field__label">{t('Starts')}</span>
              <input className="c-input" type="date" value={new Date(draft.startsAt).toISOString().slice(0, 10)} onChange={(e) => setDraft({ ...draft, startsAt: Date.parse(`${e.target.value}T00:00:00-03:00`) })} /></label>
            <label className="c-field"><span className="c-field__label">{t('Ends')}</span>
              <input className="c-input" type="date" value={new Date(draft.endsAt).toISOString().slice(0, 10)} onChange={(e) => setDraft({ ...draft, endsAt: Date.parse(`${e.target.value}T23:59:00-03:00`) })} /></label>
            <label className="c-field"><span className="c-field__label">{tpl?.goalKind === 'share_reaching_min' ? t('Goal: % of the company') : t('Goal')}</span>
              <input className="c-input" type="number" min={1} max={tpl?.goalKind === 'share_reaching_min' ? 100 : undefined} value={draft.goalValue} onChange={(e) => setDraft({ ...draft, goalValue: Math.max(1, Math.round(Number(e.target.value) || 1)) })} /></label>
            {tpl?.format === 'collective' && (
              <label className="c-field"><span className="c-field__label">{t('Sessions each person needs')}</span>
                <input className="c-input" type="number" min={1} value={draft.perPersonMin ?? 1} onChange={(e) => setDraft({ ...draft, perPersonMin: Math.max(1, Math.round(Number(e.target.value) || 1)) })} /></label>
            )}
            <label className="c-field"><span className="c-field__label">{t('Bonus Loops (paid by the company)')}</span>
              <input className="c-input" type="number" min={0} value={Math.floor((draft.rewardBonusLoopsCenti ?? 0) / 100)} onChange={(e) => setDraft({ ...draft, rewardBonusLoopsCenti: (Math.max(0, Math.round(Number(e.target.value) || 0)) * 100) || null })} /></label>
            {addon.companyBenefits && (
              <label className="c-field"><span className="c-field__label">{t('A company benefit as the reward')}</span>
                <select className="c-input" value={draft.rewardBenefitId ?? ''} onChange={(e) => setDraft({ ...draft, rewardBenefitId: e.target.value || null })}>
                  <option value="">{t('None')}</option>
                  {benefits.filter((b) => b.status !== 'archived').map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
                </select></label>
            )}
          </div>
          <div className="c-addon-check">
            <strong>{t('Good Loop check')}</strong>
            <ul>{rules.map((r) => <li key={r.id} className={r.ok ? 'is-ok' : 'is-bad'}>{r.ok ? '✓' : '✗'} {t(RULE_TEXT[r.id])}</li>)}</ul>
          </div>
          <div className="c-actions">
            <button className="c-btn c-btn--ghost" disabled={busy || !tpl} onClick={() => void save(false)}>{t('Save draft')}</button>
            <button className="c-btn c-btn--primary" disabled={busy || !tpl || !rules.every((r) => r.ok)} onClick={() => void save(true)}>{t('Publish')}</button>
            <button className="c-btn c-btn--ghost" disabled={busy} onClick={() => setDraft(null)}>{t('Cancel')}</button>
          </div>
        </div>
      )}

      {dash && dash.challenges.length === 0 && !draft && <p className="c-small">{t('No company challenge yet. Start one from a template.')}</p>}
      <div className="c-grid">
        {dash?.challenges.map((c) => (
          <div key={c.id} className="c-card c-addon-card">
            <div className="c-card__head"><strong>{c.title}</strong><span className="c-small">{t(c.status)}</span></div>
            <p className="c-small">{fmtDate(c.startsAt)} – {fmtDate(c.endsAt)}</p>
            <dl className="c-addon-figs">
              <dt>{t('Took part')}</dt><dd>{c.adhesionPct != null ? `${c.adhesionPct}%` : <Hidden k={k} />}</dd>
              <dt>{t('Completed')}</dt><dd>{c.completedPct != null ? `${c.completedPct}%` : <Hidden k={k} />}</dd>
              {c.goalKind === 'share_reaching_min' && <><dt>{t('Of the company at the goal')}</dt><dd>{c.collectivePct != null ? `${Math.floor(c.collectivePct)}% / ${c.goalValue}%` : <Hidden k={k} />}</dd></>}
            </dl>
            <div className="c-actions">
              {c.status === 'draft' && <button className="c-btn c-btn--primary" disabled={busy} onClick={() => void act(c.id, 'publish')}>{t('Publish')}</button>}
              {['scheduled', 'active'].includes(c.status) && <button className="c-btn c-btn--ghost" disabled={busy} onClick={() => void act(c.id, 'end')}>{t('End')}</button>}
              {['draft', 'scheduled', 'active'].includes(c.status) && <button className="c-link c-link--danger" disabled={busy} onClick={() => void act(c.id, 'cancel')}>{t('Cancel')}</button>}
            </div>
          </div>
        ))}
      </div>
      <p className="c-note">{t('Figures are the whole company’s. There is no breakdown by area, unit or team, and anything from fewer than {k} people is hidden.', { k: String(k) })}</p>
    </section>
  )
}

/* ------------------------------------------------- Benefícios (Add-on) --- */

type BenefitsView = 'open' | 'own' | 'identified'

export function AddonBenefits({ addon }: { addon: AddonInfo }) {
  const { t } = useI18n()
  const [view, setView] = useState<BenefitsView>(addon.tagFilter ? 'open' : 'own')
  return (
    <section className="c-panel">
      <h2 className="c-h2">{t('Benefits (Add-on)')}</h2>
      <PrivacyBanner />
      <div className="c-tabs" role="tablist">
        {addon.tagFilter && <button role="tab" aria-selected={view === 'open'} onClick={() => setView('open')}>{t('Open benefits')}</button>}
        {addon.companyBenefits && <button role="tab" aria-selected={view === 'own'} onClick={() => setView('own')}>{t('Company benefits')}</button>}
        {addon.companyBenefits && <button role="tab" aria-selected={view === 'identified'} onClick={() => setView('identified')}>{t('Identified redemptions')}</button>}
      </div>
      {view === 'open' && addon.tagFilter && <TagFilter />}
      {view === 'own' && addon.companyBenefits && <OwnBenefits />}
      {view === 'identified' && addon.companyBenefits && <Identified />}
    </section>
  )
}

function TagFilter() {
  const { t } = useI18n()
  const dp = useDataProvider()
  const [rows, setRows] = useState<TagFilterRow[] | null>(null)
  const [history, setHistory] = useState<{ label: string; disabledAt: number; enabledAt: number | null }[]>([])
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    void Promise.all([dp.hrListTagFilter(), dp.hrTagFilterHistory()]).then(([r, h]) => { setRows(r); setHistory(h) }).catch((e: Error) => setError(e.message))
  }, [dp])
  useEffect(load, [load])

  async function flip(r: TagFilterRow) {
    const off = !r.disabled
    if (off && !window.confirm(t('Your employees will stop seeing {n} benefits. Codes they already redeemed stay with them.', { n: String(r.affects) }))) return
    try { await dp.hrSetTagDisabled(r.id, off); load() } catch (e) { setError((e as Error).message) }
  }

  if (!rows) return <p className="c-small">{t('Loading…')}</p>
  return (
    <>
      <p className="c-small">{t('Every Good Loop benefit carries tags. Switch a tag off and every benefit carrying it disappears for your people — for example a food company switching off “Alimentos e bebidas” to avoid a conflict of interest.')}</p>
      {error && <p className="c-err">{error}</p>}
      {(['partner_segment', 'benefit_type'] as const).map((g) => (
        <div key={g}>
          <h3 className="c-h3">{g === 'partner_segment' ? t('Partner segment') : t('Benefit type')}</h3>
          <ul className="c-addon-tags">
            {rows.filter((r) => r.group === g).map((r) => (
              <li key={r.id}>
                <div>
                  <strong>{r.label}</strong>
                  <details><summary className="c-small">{t('affects {n} benefits', { n: String(r.affects) })}</summary>
                    <ul className="c-bullets">{r.benefits.map((b) => <li key={b} className="c-small">{b}</li>)}</ul></details>
                </div>
                <button className={`switch${r.disabled ? '' : ' is-on'}`} role="switch" aria-checked={!r.disabled} aria-label={r.label} onClick={() => void flip(r)}>
                  <span className="switch__knob" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {history.length > 0 && (
        <details className="c-details"><summary className="c-small">{t('History')}</summary>
          <ul className="c-bullets">{history.map((h, i) => (
            <li key={i} className="c-small">{t('{tag}: off on {from}', { tag: h.label, from: fmtDate(h.disabledAt) })}{h.enabledAt ? ` · ${t('on again {date}', { date: fmtDate(h.enabledAt) })}` : ''}</li>
          ))}</ul>
        </details>
      )}
    </>
  )
}

function blankOwn(): CompanyBenefitRow {
  return { id: '', title: '', description: null, careRationale: null, pillar: 'pausas_lazer', priceLoopsCenti: 5000, stockTotal: null, deliveryType: 'code_pool', status: 'draft', terms: null, codesFree: 0, codesTotal: 0 }
}

function OwnBenefits() {
  const { t } = useI18n()
  const dp = useDataProvider()
  const [rows, setRows] = useState<CompanyBenefitRow[] | null>(null)
  const [draft, setDraft] = useState<CompanyBenefitRow | null>(null)
  const [csv, setCsv] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => { void dp.hrListCompanyBenefits().then(setRows).catch((e: Error) => setError(e.message)) }, [dp])
  useEffect(load, [load])

  async function save() {
    if (!draft) return
    setBusy(true); setError(null)
    try {
      const id = await dp.hrSaveCompanyBenefit(draft)
      const codes = csv.split(/\r?\n/).map((l) => l.split(/[;,\t]/)[0].trim()).filter(Boolean)
      if (draft.deliveryType === 'code_pool' && codes.length) await dp.hrUploadCodes(id, codes)
      setDraft(null); setCsv(''); load()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const MODES: { id: CompanyBenefitRow['deliveryType']; label: string; note: string }[] = [
    { id: 'code_pool', label: 'Code / voucher', note: 'Upload a CSV of codes. You never learn who redeemed one.' },
    { id: 'collective', label: 'Collective', note: 'Delivered to the whole company — a company-wide breakfast, say. Nobody is identified.' },
    { id: 'identified', label: 'Identified redemption', note: 'For a day off or a physical item: the employee sees exactly what is shared (name and employee number) and must agree. You see only those redemptions.' },
  ]

  return (
    <>
      {error && <p className="c-err">{error}</p>}
      {!draft && <button className="c-btn c-btn--primary" onClick={() => setDraft(blankOwn())}>{t('New company benefit')}</button>}
      {draft && (
        <div className="c-card c-form">
          <div className="c-twocol">
            <label className="c-field"><span className="c-field__label">{t('Title')}</span>
              <input className="c-input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
            <label className="c-field"><span className="c-field__label">{t('Wellbeing pillar')}</span>
              <select className="c-input" value={draft.pillar} onChange={(e) => setDraft({ ...draft, pillar: e.target.value as Pillar })}>
                {PILLARS.map((p) => <option key={p.id} value={p.id}>{t(p.label)}</option>)}
              </select></label>
            <label className="c-field c-field--wide"><span className="c-field__label">{t('Why this takes care of your people')}</span>
              <input className="c-input" value={draft.careRationale ?? ''} onChange={(e) => setDraft({ ...draft, careRationale: e.target.value || null })} /></label>
            <label className="c-field c-field--wide"><span className="c-field__label">{t('Description')}</span>
              <input className="c-input" value={draft.description ?? ''} onChange={(e) => setDraft({ ...draft, description: e.target.value || null })} /></label>
            <label className="c-field"><span className="c-field__label">{t('Loop price')}</span>
              <input className="c-input" type="number" min={0} disabled={draft.priceLoopsCenti === null} value={draft.priceLoopsCenti === null ? '' : Math.floor(draft.priceLoopsCenti / 100)}
                     onChange={(e) => setDraft({ ...draft, priceLoopsCenti: Math.max(0, Math.round(Number(e.target.value) || 0)) * 100 })} /></label>
            <label className="c-field c-checks"><input type="checkbox" checked={draft.priceLoopsCenti === null} onChange={(e) => setDraft({ ...draft, priceLoopsCenti: e.target.checked ? null : 5000 })} />
              <span>{t('Only through a challenge')}</span></label>
            <label className="c-field"><span className="c-field__label">{t('Quantity (empty = no limit)')}</span>
              <input className="c-input" type="number" min={0} value={draft.stockTotal ?? ''} onChange={(e) => setDraft({ ...draft, stockTotal: e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))) })} /></label>
            <label className="c-field"><span className="c-field__label">{t('Status')}</span>
              <select className="c-input" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as CompanyBenefitRow['status'] })}>
                <option value="draft">{t('Draft')}</option><option value="active">{t('Active')}</option><option value="paused">{t('Paused')}</option><option value="archived">{t('Archived')}</option>
              </select></label>
          </div>
          <fieldset className="c-addon-modes"><legend className="c-field__label">{t('How it is delivered')}</legend>
            {MODES.map((m) => (
              <label key={m.id} className={`c-card c-addon-mode${draft.deliveryType === m.id ? ' is-on' : ''}`}>
                <input type="radio" name="delivery" checked={draft.deliveryType === m.id} onChange={() => setDraft({ ...draft, deliveryType: m.id })} />
                <span><strong>{t(m.label)}</strong><span className="c-small">{t(m.note)}</span></span>
              </label>
            ))}
          </fieldset>
          {draft.deliveryType === 'code_pool' && (
            <label className="c-field"><span className="c-field__label">{t('Codes (CSV, one per line)')}</span>
              <input type="file" accept=".csv,.txt" onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.text().then(setCsv) }} />
              <textarea className="c-input" rows={4} value={csv} onChange={(e) => setCsv(e.target.value)} /></label>
          )}
          <div className="c-actions">
            <button className="c-btn c-btn--primary" disabled={busy || !draft.title.trim()} onClick={() => void save()}>{t('Save')}</button>
            <button className="c-btn c-btn--ghost" disabled={busy} onClick={() => setDraft(null)}>{t('Cancel')}</button>
          </div>
        </div>
      )}
      {rows && rows.length > 0 && (
        <table className="c-table">
          <thead><tr><th>{t('Benefit')}</th><th>{t('Delivery')}</th><th>{t('Loops')}</th><th>{t('Codes left')}</th><th>{t('Status')}</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.title}</td>
                <td>{t(MODES.find((m) => m.id === r.deliveryType)?.label ?? r.deliveryType)}</td>
                <td>{r.priceLoopsCenti === null ? t('challenge only') : Math.floor(r.priceLoopsCenti / 100)}</td>
                <td>{r.deliveryType === 'code_pool' ? `${r.codesFree} / ${r.codesTotal}` : '—'}</td>
                <td>{t(r.status)}</td>
                <td className="c-right"><button className="c-link" onClick={() => setDraft({ ...r })}>{t('Edit')}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows && rows.length === 0 && !draft && <p className="c-small">{t('No company benefit yet.')}</p>}
    </>
  )
}

function Identified() {
  const { t } = useI18n()
  const dp = useDataProvider()
  const [rows, setRows] = useState<IdentifiedRedemption[] | null>(null)
  useEffect(() => { void dp.hrIdentifiedRedemptions().then(setRows).catch(() => setRows([])) }, [dp])
  if (!rows) return <p className="c-small">{t('Loading…')}</p>
  return (
    <>
      <p className="c-small">{t('Only identified benefits appear here, and only because the employee agreed to share these details to receive them. Codes and collective benefits are never shown with a name.')}</p>
      {rows.length === 0 ? <p className="c-small">{t('No identified redemption yet.')}</p> : (
        <table className="c-table">
          <thead><tr><th>{t('Benefit')}</th><th>{t('Name')}</th><th>{t('Employee number')}</th><th>{t('Agreed on')}</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}><td>{r.benefit}</td><td>{r.name}</td><td className="c-mono">{r.employeeNumber ?? '—'}</td><td>{fmtDate(r.consentedAt)}</td></tr>
          ))}</tbody>
        </table>
      )}
    </>
  )
}
