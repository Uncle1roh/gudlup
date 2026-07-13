import { useNr1Report } from './hooks'
import { splitTotal, pct, type BandSplit, type Nr1Report } from './types'
import { Loading } from '../components/Loading'
import { useI18n } from '../i18n'

function BandBar({ split, small }: { split: BandSplit; small?: boolean }) {
  const total = splitTotal(split)
  const seg = (n: number) => (total > 0 ? (n / total) * 100 : 0)
  return (
    <div className={`emp-bar ${small ? 'emp-bar--sm' : ''}`}>
      <span className="emp-seg emp-seg--low" style={{ width: `${seg(split.low)}%` }} />
      <span className="emp-seg emp-seg--mod" style={{ width: `${seg(split.moderate)}%` }} />
      <span className="emp-seg emp-seg--high" style={{ width: `${seg(split.high)}%` }} />
    </div>
  )
}

function TrendChart({ report, t }: { report: Nr1Report; t: (k: string, v?: Record<string, string | number>) => string }) {
  const pts = report.trend
  const max = Math.max(10, ...pts.map((p) => p.highPct))
  const W = 460, H = 150, pad = 28
  const x = (i: number) => pad + (i * (W - pad * 2)) / Math.max(1, pts.length - 1)
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2)
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.highPct).toFixed(1)}`).join(' ')
  return (
    <svg className="emp-trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('High-risk trend')}>
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} className="emp-trend__axis" />
      <path d={line} className="emp-trend__line" fill="none" />
      {pts.map((p, i) => (
        <g key={p.period}>
          <circle cx={x(i)} cy={y(p.highPct)} r={4} className="emp-trend__dot" />
          <text x={x(i)} y={y(p.highPct) - 10} className="emp-trend__val" textAnchor="middle">{p.highPct}%</text>
          <text x={x(i)} y={H - pad + 16} className="emp-trend__lbl" textAnchor="middle">{p.period}</text>
        </g>
      ))}
    </svg>
  )
}

export function Nr1Dashboard() {
  const { t } = useI18n()
  const { data: r, loading, error } = useNr1Report()

  if (loading) return <div className="emp-main"><Loading label={'Loading aggregate report…'} /></div>
  if (error || !r) return (
    <div className="emp-main">
      <p className="b2b-sub">{t("Couldn't load the report.")}</p>
      {error && <p className="b2b-sub" style={{ marginTop: 8, color: '#b3402a' }}>{String((error as Error).message ?? error)}</p>}
    </div>
  )

  const responseRate = pct(r.respondents, r.eligible)
  const overallTotal = splitTotal(r.overall)
  const sortedDims = [...r.dimensions].sort((a, b) => pct(b.split.high, splitTotal(b.split)) - pct(a.split.high, splitTotal(a.split)))

  return (
    <div className="emp-main">
      <div className="emp-page">
        <header className="emp-head">
          <div>
            <h1 className="b2b-h1">{t('Psychosocial risk — {company}', { company: r.company })}</h1>
            <p className="b2b-sub">{t('NR-1 aggregate report · {period}', { period: r.period })}</p>
          </div>
          <div className="emp-legend">
            <span><i className="emp-dot emp-dot--low" /> {t('Low')}</span>
            <span><i className="emp-dot emp-dot--mod" /> {t('Moderate')}</span>
            <span><i className="emp-dot emp-dot--high" /> {t('High')}</span>
          </div>
        </header>

        <div className="emp-privacy">
          <span className="emp-privacy__icon" aria-hidden="true">🔒</span>
          <div>
            <b>{t('Anonymous by design.')}</b> {t('Only employees who consented to aggregate reporting are included, and no individual data is ever shown. Any group smaller than {n} people is hidden to protect anonymity (LGPD · NR-1).', { n: r.minCellSize })}
          </div>
        </div>

        {/* participation + overall */}
        <div className="emp-row">
          <section className="emp-card emp-card--stat">
            <div className="emp-stat__value">{responseRate}%</div>
            <div className="emp-stat__label">{t('Participation')}</div>
            <div className="emp-stat__hint">{t('{r} of {e} eligible employees responded', { r: r.respondents, e: r.eligible })}</div>
          </section>
          <section className="emp-card emp-card--overall">
            <h2 className="emp-card__title">{t('Overall psychosocial risk')}</h2>
            <BandBar split={r.overall} />
            <div className="emp-overall__nums">
              <span><b>{pct(r.overall.low, overallTotal)}%</b> {t('low')}</span>
              <span><b>{pct(r.overall.moderate, overallTotal)}%</b> {t('moderate')}</span>
              <span className="is-high"><b>{pct(r.overall.high, overallTotal)}%</b> {t('high')}</span>
            </div>
          </section>
        </div>

        {/* dimensions */}
        <section className="emp-card">
          <h2 className="emp-card__title">{t('Risk by dimension')}</h2>
          <p className="b2b-sub" style={{ marginTop: -4, marginBottom: 14 }}>{t('Sorted by share at high risk — the factors to prioritise for action.')}</p>
          <div className="emp-dims">
            {sortedDims.map((d) => {
              const dimTotal = splitTotal(d.split)
              return (
                <div className="emp-dim" key={d.key}>
                  <div className="emp-dim__meta">
                    <div className="emp-dim__label">{t(d.label)}</div>
                    <div className="emp-dim__about">{t(d.about)}</div>
                  </div>
                  <BandBar split={d.split} />
                  <div className="emp-dim__high">{t('{n}% high', { n: pct(d.split.high, dimTotal) })}</div>
                </div>
              )
            })}
          </div>
        </section>

        {/* outcomes */}
        <section className="emp-card">
          <h2 className="emp-card__title">{t('Outcome indicators')}</h2>
          <div className="emp-outcomes">
            {r.outcomes.map((o) => {
              const improving = o.deltaPct < 0
              return (
                <div className="emp-outcome" key={o.key}>
                  <div className="emp-outcome__val">{o.elevatedPct}%</div>
                  <div className="emp-outcome__label">{t(o.label)}<span className="emp-outcome__sub"> {t('elevated')}</span></div>
                  <div className={`emp-delta ${improving ? 'is-good' : 'is-bad'}`}>
                    {improving ? '▼' : '▲'} {t('{n} pts vs last cycle', { n: Math.abs(o.deltaPct) })}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* trend */}
        <section className="emp-card">
          <h2 className="emp-card__title">{t('High-risk trend')}</h2>
          <p className="b2b-sub" style={{ marginTop: -4, marginBottom: 6 }}>{t('Share of respondents at high overall risk, by assessment cycle.')}</p>
          <TrendChart report={r} t={t} />
        </section>

        {/* teams */}
        <section className="emp-card">
          <h2 className="emp-card__title">{t('By team')}</h2>
          <div className="emp-teams">
            <div className="emp-team emp-team--head">
              <div>{t('Team')}</div><div>{t('Respondents')}</div><div>{t('Risk distribution')}</div><div className="emp-tr__right">{t('High')}</div>
            </div>
            {r.teams.map((tm) => (
              <div className="emp-team" key={tm.team}>
                <div><b>{tm.team}</b></div>
                <div>{tm.respondents}</div>
                {tm.suppressed || !tm.split ? (
                  <div className="emp-suppressed">{t('Hidden — group under {n}', { n: r.minCellSize })} 🔒</div>
                ) : (
                  <BandBar split={tm.split} small />
                )}
                <div className="emp-tr__right">{tm.suppressed || !tm.split ? '—' : `${pct(tm.split.high, splitTotal(tm.split))}%`}</div>
              </div>
            ))}
          </div>
        </section>

        <p className="emp-foot">
          {t('This is a risk-management aid for NR-1 psychosocial risk, not a clinical or individual diagnosis. Figures are anonymised aggregates from consenting employees. Report generated {date}.', { date: new Date(r.generatedAt).toLocaleDateString('pt-BR') })}
        </p>
      </div>
    </div>
  )
}
