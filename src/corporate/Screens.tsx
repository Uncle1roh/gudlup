/* ============================================================================
   Corporate Dashboard — Overview · Engagement · Wellbeing · Reports

   Every number on these four screens goes through `cellValue()`. If fewer than
   five people contributed, the card prints "Not enough data yet" and hides its
   trend indicator — because a trend computed from four people is a trend about
   four identifiable people.

   Wellbeing is the most sensitive screen and gets three extra constraints:
   · The WHO-5 interpretation note is permanent and not dismissible.
   · No colour coding. There is no green zone and no red zone, and the general
     population band is drawn in neutral grey as reference, not as a target.
   · GL-Check dimensions get numbers and arrows and nothing else — no label
     that reads a dimension as good or bad.

   Benchmarking compares ADOPTION and EFFICACY only, never risk, and is framed
   informationally: no ranking, no percentile, no "you're behind".
   ============================================================================ */

import { useState } from 'react'
import { useI18n } from '../i18n'
import { BarList, Donut, GroupedBars, LineChart, NotEnoughData, PairedBars, StackedArea } from './Charts'
import { cellValue, movement, movementText, suppressed } from './metrics'
import type { Aggregates } from './data'
import type { CorporateState, ReportRow } from './metrics'
import { buildCorporateReportPdf } from './reportPdf'

/* `data.ts` owns the concrete aggregate shape; the screens only read it. */
type A = Aggregates

const PRIVACY_FOOTER =
  'All data shown is anonymized and aggregated · metrics require at least 5 participants (N≥5)'

export function PrivacyFooter() {
  const { t } = useI18n()
  return <p className="c-footer">{t(PRIVACY_FOOTER)}</p>
}

/* ------------------------------------------------------------ Overview --- */

interface OverviewProps {
  admin: string
  agg: A
  state: CorporateState
  onOpenReports: () => void
  onOpenManagement: () => void
}

export function Overview({ admin, agg, state, onOpenReports, onOpenManagement }: OverviewProps) {
  const { t } = useI18n()
  const k = agg.kpis

  const registered = cellValue(k.registered)
  const active = cellValue(k.active7)
  const sessions = cellValue(k.sessions)
  const who5 = cellValue(k.who5Avg)
  const glCheck = cellValue(k.glCheckAvg)

  return (
    <>
      <div className="c-pagehead">
        <div>
          <h1 className="c-h1">{t('Overview')}</h1>
          <p className="c-lead">{t('Good morning, {name}', { name: admin })}</p>
        </div>
      </div>

      <div className="c-kpis">
        <Kpi
          label={t('Registered')}
          value={registered}
          sub={t('of {n} licenses', { n: k.licences })}
          trend={registered != null ? t('+{n} this month', { n: k.registeredDelta }) : null}
        />
        <Kpi
          label={t('Active')}
          value={active}
          sub={active != null ? t('{n}% weekly active', { n: cellValue(k.weeklyActivePct) ?? 0 }) : ''}
          trend={movementText(movement(active, k.previous.active7, 1, 0), '', t('last month'))}
        />
        <Kpi
          label={t('Sessions')}
          value={sessions}
          sub={t('avg {n} per user/week', { n: cellValue(k.sessionsPerUserWeek) ?? '—' })}
          trend={movementText(movement(sessions, k.previous.sessions, 5, 0), '', t('last month'))}
        />
        <Kpi
          label={t('WHO-5 Avg')}
          value={who5}
          sub={t('Scale: 0–100')}
          trend={movementText(movement(who5, k.previous.who5Avg, 1, 0), '', t('last month'))}
        />
        <Kpi
          label={t('GL-Check Avg')}
          value={glCheck}
          sub={t('5 dimensions · scale 1–5')}
          trend={movementText(movement(glCheck, k.previous.glCheckAvg, 0.05, 1), '', t('last month'))}
        />
      </div>

      <div className="c-grid2">
        <section className="c-card">
          <header className="c-card__head">
            <h2>{t('Registration & Activation')}</h2>
            <span className="c-small">{t('Cumulative · last 12 weeks')}</span>
          </header>
          {suppressed(k.registered) ? (
            <NotEnoughData />
          ) : (
            <>
              <LineChart
                series={[
                  { name: 'Registered', points: agg.engagement.registrationSeries },
                  { name: 'Active 7d', points: agg.engagement.activeSeries },
                ]}
                yLabel="count"
                xLabel="weeks"
              />
              <p className="c-small">
                {t('Registered: {r} of {l} ({p}%) · Active 7d: {a}', {
                  r: registered ?? 0,
                  l: k.licences,
                  p: Math.round(((registered ?? 0) / k.licences) * 100),
                  a: active ?? 0,
                })}
              </p>
            </>
          )}
        </section>

        <section className="c-card">
          <header className="c-card__head">
            <h2>{t('Session Volume')}</h2>
            <span className="c-small">{t('By duration · last 12 weeks')}</span>
          </header>
          {suppressed(k.sessions) ? (
            <NotEnoughData />
          ) : (
            <>
              <GroupedBars
                data={agg.engagement.sessionsByWeek.map((w) => ({ label: w.label, values: [w.quick, w.standard, w.deep] }))}
                seriesNames={['Quick', 'Standard', 'Deep']}
                yLabel="sessions"
                xLabel="weeks"
              />
              <p className="c-small">
                {t('{n} sessions this month', { n: sessions ?? 0 })} ·{' '}
                {agg.engagement.durationSplit.map((d) => `${t(d.label)} ${d.pct}%`).join(' · ')}
              </p>
            </>
          )}
        </section>
      </div>

      {agg.professionalSupport && (
        <section className="c-card c-support">
          <header className="c-card__head">
            <h2>🔒 {t('Professional Support')}</h2>
          </header>
          <div className="c-support__num">{agg.professionalSupport.employees}</div>
          <p className="c-support__label">{t('employees currently using professional support sessions')}</p>
          <p className="c-note">
            {t('This number is anonymized — no individual details are available. Never broken down.')}
          </p>
        </section>
      )}

      <section className="c-card">
        <header className="c-card__head"><h2>{t('Notifications')}</h2></header>
        {!agg.alerts.length && <p className="c-small">{t('Nothing needs your attention right now.')}</p>}
        <ul className="c-alerts">
          {agg.alerts.map((a) => (
            <li key={a.id}>
              <span className="c-alerts__icon" aria-hidden="true">
                {a.kind === 'report' ? '📄' : a.kind === 'renewal' ? '📅' : a.kind === 'licences' ? '👥' : '✓'}
              </span>
              <span className="c-alerts__text">{a.text}</span>
              <span className="c-small">{relative(a.at)}</span>
              {a.action && (
                <button className="c-link" onClick={a.kind === 'report' ? onOpenReports : onOpenManagement}>
                  {t(a.action)}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {state.setupDoneAt && registered === null && (
        <section className="c-card">
          <h2>{t('Share your company code')}</h2>
          <div className="c-code"><span className="c-code__value">{state.companyCode}</span></div>
        </section>
      )}

      <PrivacyFooter />
    </>
  )
}

function Kpi({ label, value, sub, trend }: { label: string; value: number | null; sub: string; trend: string | null }) {
  const { t } = useI18n()
  return (
    <article className="c-kpi">
      <div className="c-kpi__label">{label}</div>
      {value == null ? (
        <div className="c-kpi__none">{t('Not enough data yet')}</div>
      ) : (
        <>
          <div className="c-kpi__value">{typeof value === 'number' ? value.toLocaleString() : value}</div>
          <div className="c-small">{sub}</div>
          {trend && <div className="c-kpi__trend">{trend}</div>}
        </>
      )}
    </article>
  )
}

function relative(at: number): string {
  const diff = Date.now() - at
  const h = Math.round(diff / 3_600_000)
  if (h < 1) return 'now'
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

/* ---------------------------------------------------------- Engagement --- */

export function Engagement({ agg }: { agg: A }) {
  const { t } = useI18n()
  const e = agg.engagement
  const k = agg.kpis
  const registered = cellValue(k.registered)

  if (registered == null) {
    return (
      <>
        <h1 className="c-h1">{t('Engagement')}</h1>
        <NotEnoughData note={t('No session data yet. Engagement metrics will appear after employees start using the app.')} />
        <PrivacyFooter />
      </>
    )
  }

  return (
    <>
      <h1 className="c-h1">{t('Engagement')}</h1>

      <h2 className="c-sect">{t('Adoption')}</h2>
      <section className="c-card">
        <header className="c-card__head">
          <h2>{t('Registration Over Time')}</h2>
          <span className="c-small">{t('Cumulative vs license capacity')}</span>
        </header>
        <LineChart
          series={[{ name: 'Registered', points: e.registrationSeries }]}
          yLabel="count"
          xLabel="months"
          reference={{ value: k.licences, label: t('Total licenses ({n})', { n: k.licences }) }}
        />
        <p className="c-small">
          {t('Registered: {r} of {l} licenses ({p}%)', {
            r: registered,
            l: k.licences,
            p: Math.round((registered / k.licences) * 100),
          })}
        </p>
      </section>

      <div className="c-grid3">
        <MetricCard label={t('Activation Rate')} value={cellValue(k.activationPct)} unit="%" def={t('Registered who completed ≥1 session')} />
        <MetricCard label={t('Weekly Active Rate')} value={cellValue(k.weeklyActivePct)} unit="%" def={t('Of registered, active in last 7 days')} />
        <MetricCard label={t('Retention (30-day)')} value={cellValue(k.retention30)} unit="%" def={t('Of activated, still active after 30 days')} />
      </div>

      <h2 className="c-sect">{t('Usage Patterns')}</h2>
      <div className="c-grid2">
        <section className="c-card">
          <header className="c-card__head"><h2>{t('Sessions per Week')}</h2></header>
          <GroupedBars
            data={e.sessionsByWeek.map((w) => ({ label: w.label, values: [w.quick + w.standard + w.deep] }))}
            seriesNames={['Total sessions']}
            yLabel="total sessions"
            xLabel="weeks"
          />
        </section>
        <section className="c-card">
          <header className="c-card__head">
            <h2>{t('Session Frequency')}</h2>
            <span className="c-small">{t('How frequently active employees use Good Loop')}</span>
          </header>
          <BarList rows={e.frequency.map((f) => ({ label: f.label, value: f.pct }))} />
        </section>
      </div>

      <section className="c-card">
        <header className="c-card__head"><h2>{t('Duration Preferences')}</h2></header>
        <Donut slices={e.durationSplit} />
      </section>

      <h2 className="c-sect">{t('Pathway Popularity')}</h2>
      <section className="c-card">
        <header className="c-card__head">
          <span className="c-small">{t('What do our employees need most? — ranked by adoption')}</span>
        </header>
        <BarList
          rows={e.pathways.map((p) => ({
            label: p.name,
            value: p.pct,
            note: p.n < 5 ? t('Not enough data') : `${p.pct}%`,
          }))}
        />
        <p className="c-note">
          {t('User-friendly pathway names only — never protocol codes. Pathways with fewer than 5 users show "Not enough data".')}
        </p>
      </section>

      <PrivacyFooter />
    </>
  )
}

function MetricCard({ label, value, unit, def }: { label: string; value: number | null; unit: string; def: string }) {
  const { t } = useI18n()
  return (
    <article className="c-card c-metric">
      <div className="c-kpi__label">{label}</div>
      {value == null ? <div className="c-kpi__none">{t('Not enough data')}</div> : <div className="c-kpi__value">{value}{unit}</div>}
      <p className="c-small">{def}</p>
    </article>
  )
}

/* ----------------------------------------------------------- Wellbeing --- */

const WHO5_NOTE =
  'The WHO-5 measures general subjective wellbeing on a 0–100 scale. This chart shows the company-wide average over time. Higher scores indicate better perceived wellbeing. This is a descriptive indicator — it does not constitute a clinical assessment.'

export function Wellbeing({ agg }: { agg: A }) {
  const { t } = useI18n()
  const w = agg.wellbeing
  const who5 = cellValue(w.who5Current)
  const who5Trend = movement(who5, w.who5Previous, 1, 0)

  return (
    <>
      <h1 className="c-h1">{t('Wellbeing')}</h1>

      <h2 className="c-sect">{t('WHO-5 Aggregate Trend')}</h2>
      <section className="c-card">
        <header className="c-card__head">
          <h2>{t('Company Average Over Time')}</h2>
          <span className="c-small">{t('Measured every 4 weeks · scale 0–100')}</span>
        </header>
        {who5 == null ? (
          <NotEnoughData note={t('Not enough data — WHO-5 trends require at least 5 participants')} />
        ) : (
          <>
            <div className="c-current">
              <span className="c-small">{t('Company average')}</span>
              <strong>{who5}</strong>
              {who5Trend && <span className="c-kpi__trend">{t(who5Trend.label)}</span>}
            </div>
            <LineChart
              series={[{ name: 'WHO-5', points: w.who5Series }]}
              yLabel="WHO-5 (0–100)"
              xLabel="months"
              max={100}
              band={{ ...w.who5Reference, label: t('general population range') }}
            />
          </>
        )}
        {/* Permanent, not dismissible. */}
        <p className="c-interpret">{t(WHO5_NOTE)}</p>
      </section>

      <h2 className="c-sect">{t('GL-Check Dimensions')}</h2>
      <section className="c-card">
        <header className="c-card__head">
          <h2>{t('Current vs Previous Period')}</h2>
          <span className="c-small">{t('Weekly check-in · scale 1–5')}</span>
        </header>
        <PairedBars
          rows={w.dimensions.map((d) => ({ label: d.label, current: cellValue(d.current), previous: d.previous }))}
        />
        <div className="c-dimgrid">
          {w.dimensions.map((d) => {
            const cur = cellValue(d.current)
            const m = movement(cur, d.previous, 0.05, 1)
            return (
              <article key={d.key} className="c-dim">
                <div className="c-kpi__label">{t(d.label)}</div>
                {cur == null ? (
                  <div className="c-kpi__none">{t('Not enough data')}</div>
                ) : (
                  <>
                    <div className="c-kpi__value">{cur}</div>
                    {m && (
                      <>
                        <div className="c-kpi__trend">{t(m.label)}</div>
                        <div className="c-small">
                          {m.direction === 'flat'
                            ? t('No change')
                            : `${m.delta > 0 ? '+' : '−'}${Math.abs(m.delta)} ${t('vs previous')}`}
                        </div>
                      </>
                    )}
                  </>
                )}
              </article>
            )
          })}
        </div>
      </section>

      <h2 className="c-sect">{t('Mood Overview')}</h2>
      <section className="c-card">
        <header className="c-card__head">
          <h2>{t('Daily mood check-in — response distribution')}</h2>
        </header>
        {w.moodRespondents < 5 || !w.moodCurrent ? (
          <NotEnoughData />
        ) : (
          <>
            <StackedArea data={w.moodSeries} yLabel="% of responses" xLabel="weeks" />
            <p className="c-small">
              {t('This month:')} {t('Positive')} {w.moodCurrent.positive}% · {t('Neutral')} {w.moodCurrent.neutral}% ·{' '}
              {t('Negative')} {w.moodCurrent.negative}%
            </p>
            <p className="c-note">
              {t('Based on {r} responses from {e} employees. Mood is opt-in.', {
                r: w.moodResponses,
                e: w.moodRespondents,
              })}
            </p>
          </>
        )}
      </section>

      <h2 className="c-sect">{t('Benchmarking')}</h2>
      <section className="c-card">
        <header className="c-card__head">
          <span className="c-small">{t('How your program compares to the anonymous industry average')}</span>
        </header>
        <table className="c-table">
          <thead>
            <tr><th>{t('Metric')}</th><th>{t('Company')}</th><th>{t('Industry')}</th></tr>
          </thead>
          <tbody>
            {w.benchmark.map((b) => (
              <tr key={b.metric}>
                <td>{t(b.metric)}</td>
                <td>{b.company}{b.unit}</td>
                <td>{b.industry == null ? t('Industry benchmark not yet available.') : `${b.industry}${b.unit}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="c-note">
          {t('Industry average aggregated across all Good Loop companies. Adoption & efficacy only — never risk levels. Purely informational.')}
        </p>
      </section>

      <PrivacyFooter />
    </>
  )
}

/* ------------------------------------------------------------- Reports --- */

const REPORT_SECTIONS = [
  'Adoption overview',
  'Engagement metrics',
  'WHO-5 aggregate trend',
  'GL-Check dimensions',
  'Mood overview',
  'Benchmarking (if available)',
  'Professional support utilization',
] as const

interface ReportsProps {
  state: CorporateState
  agg: A
  onGenerate: (r: ReportRow) => void
  onView: (r: ReportRow) => void
}

export function Reports({ state, agg, onGenerate, onView }: ReportsProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)

  /* Generating the file is what "Download" means. The sections stored on the
     row decide what it contains, and every one of them re-applies the N>=5
     rule as it is written — suppression travels with the document. */
  function download(r: ReportRow) {
    buildCorporateReportPdf({
      state,
      agg,
      name: r.name,
      periodFrom: r.periodFrom,
      periodTo: r.periodTo,
      sections: r.sections ?? [...REPORT_SECTIONS],
    }).save(`good-loop-${slugify(state.profile.name)}-${slugify(r.name)}.pdf`)
    onView(r)
  }

  const sorted = [...state.reports].sort((a, b) => b.generatedAt - a.generatedAt)
  const latestMonthly = sorted.find((r) => r.name.includes('Monthly'))
  const latestQuarterly = sorted.find((r) => r.name.includes('Quarterly'))

  return (
    <>
      <div className="c-pagehead">
        <h1 className="c-h1">{t('Reports')}</h1>
        <button className="c-btn c-btn--primary" onClick={() => setOpen(true)}>{t('Generate report')}</button>
      </div>

      <h2 className="c-sect">{t('Latest Auto-Generated')}</h2>
      <div className="c-grid2">
        {[latestMonthly, latestQuarterly].map((r, i) =>
          r ? (
            <article key={r.id} className="c-card c-reportcard">
              <div className="c-reportcard__top">
                <strong>{r.name}</strong>
                {!r.viewed && <span className="c-badge c-badge--new">{t('NEW')}</span>}
              </div>
              <span className="c-small">
                {t('Generated {d}', { d: new Date(r.generatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) })}
              </span>
              <button className="c-btn c-btn--ghost" onClick={() => download(r)}>{t('Download PDF')}</button>
            </article>
          ) : (
            <article key={`empty-${i}`} className="c-card">
              <p className="c-small">{t('No reports yet. First monthly report auto-generated at end of this month.')}</p>
            </article>
          ),
        )}
      </div>

      <h2 className="c-sect">{t('Report Archive')}</h2>
      <section className="c-card">
        {!sorted.length ? (
          <p className="c-small">{t('No reports yet. First monthly report auto-generated at end of this month.')}</p>
        ) : (
          <table className="c-table">
            <thead>
              <tr>
                <th>{t('Report')}</th><th>{t('Type')}</th><th>{t('Period')}</th><th>{t('Generated')}</th><th>{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.kind === 'auto' ? t('Auto') : t('On-demand')}</td>
                  <td className="c-small">
                    {new Date(r.periodFrom).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} –{' '}
                    {new Date(r.periodTo).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </td>
                  <td className="c-small">{new Date(r.generatedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  <td><button className="c-link" onClick={() => download(r)}>{t('Download')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="c-note">
          {t('PDF footer: "Confidential — {company} — Good Loop Aggregate Wellbeing Report — Generated [date]". No individual data can be reverse-engineered.', { company: state.profile.name })}
        </p>
      </section>

      {open && <GeneratorModal state={state} agg={agg} onClose={() => setOpen(false)} onGenerate={onGenerate} />}
    </>
  )
}

function GeneratorModal({
  state,
  agg,
  onClose,
  onGenerate,
}: {
  state: CorporateState
  agg: A
  onClose: () => void
  onGenerate: (r: ReportRow) => void
}) {
  const { t } = useI18n()
  const now = new Date()
  const [kind, setKind] = useState<'Monthly' | 'Quarterly' | 'Custom'>('Monthly')
  const [from, setFrom] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10))
  const [to, setTo] = useState(now.toISOString().slice(0, 10))
  const [sections, setSections] = useState<string[]>(() =>
    REPORT_SECTIONS.filter((s) => s !== 'Professional support utilization' || state.conventionType === 'self-use-plus'),
  )
  const [busy, setBusy] = useState(false)

  const available = REPORT_SECTIONS.filter(
    (s) => s !== 'Professional support utilization' || state.conventionType === 'self-use-plus',
  )

  function generate() {
    setBusy(true)
    const row: ReportRow = {
      id: `r-${Date.now()}`,
      name:
        kind === 'Custom'
          ? `Custom — ${new Date(from).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
          : `${new Date(from).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} — ${kind} Report`,
      kind: 'on-demand',
      periodFrom: new Date(from).getTime(),
      periodTo: new Date(to).getTime(),
      generatedAt: Date.now(),
      viewed: true,
      // Stored so re-downloading the archived row reproduces the same file
      // rather than quietly widening it to every section.
      sections,
    }
    buildCorporateReportPdf({
      state,
      agg,
      name: row.name,
      periodFrom: row.periodFrom,
      periodTo: row.periodTo,
      sections,
    }).save(`good-loop-${slugify(state.profile.name)}-${slugify(row.name)}.pdf`)
    onGenerate(row)
    setBusy(false)
    onClose()
  }

  return (
    <div className="c-scrim" onClick={onClose} role="dialog" aria-modal="true">
      <div className="c-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="c-h2">{t('Generate report')}</h2>

        <div className="c-field__label">{t('Report type')}</div>
        <div className="c-segmented">
          {(['Monthly', 'Quarterly', 'Custom'] as const).map((k) => (
            <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{t(k)}</button>
          ))}
        </div>

        <div className="c-form">
          <label className="c-field">
            <span className="c-field__label">{t('From')}</span>
            <input className="c-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="c-field">
            <span className="c-field__label">{t('To')}</span>
            <input className="c-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>

        <div className="c-field__label">{t('Sections to include')}</div>
        <ul className="c-checks">
          {available.map((s) => (
            <li key={s}>
              <label>
                <input
                  type="checkbox"
                  checked={sections.includes(s)}
                  onChange={() =>
                    setSections((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))
                  }
                />
                {t(s)}
              </label>
            </li>
          ))}
        </ul>

        <p className="c-note">{t('Any section below N≥5 shows "Not enough data" in the export.')}</p>

        <div className="c-actions">
          <button className="c-btn c-btn--ghost" onClick={onClose}>{t('Cancel')}</button>
          <button className="c-btn c-btn--primary" disabled={busy || !sections.length} onClick={generate}>
            {busy ? t('Generating…') : t('Generate PDF')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** A filename-safe form of a company or report name. */
function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
