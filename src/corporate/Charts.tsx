/* ============================================================================
   Corporate Dashboard — charts

   Deliberately plain SVG rather than a charting library: the whole surface is
   four chart shapes, and a dependency would cost more than it saves.

   Rules the wireframe sets that are enforced here, not left to the caller:
   · Every chart is LABELLED — axis captions and a legend, always. A chart that
     cannot be read without its caption is not a chart.
   · Series are distinguished by FILL PATTERN as well as tone (solid, hatched,
     dotted), so nothing depends on colour perception. There are no red/green
     zones anywhere; a wellbeing chart must not tell someone their company is
     in the red.
   · A chart with too few contributors is never drawn — the caller passes
     `suppressed` and gets the "Not enough data yet" panel instead, because an
     empty axis reads as "no risk found", which is a different claim.
   ============================================================================ */

import { useId } from 'react'
import { useI18n } from '../i18n'
import type { SeriesPoint } from './metrics'

const W = 640
const H = 220
const PAD = { top: 12, right: 14, bottom: 26, left: 38 }

function plot() {
  return { x: PAD.left, y: PAD.top, w: W - PAD.left - PAD.right, h: H - PAD.top - PAD.bottom }
}

export function NotEnoughData({ note }: { note?: string }) {
  const { t } = useI18n()
  return (
    <div className="c-nodata">
      <strong>{t('Not enough data yet')}</strong>
      <span className="small">{note ?? t('Metrics require at least 5 participants.')}</span>
    </div>
  )
}

/* ------------------------------------------------------------ patterns --- */

/** Hatch + dot fills, defined once per chart instance so ids never collide. */
function Patterns({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={`${id}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="var(--c-fill-2)" />
        <line x1="0" y1="0" x2="0" y2="6" stroke="var(--c-ink)" strokeWidth="2" opacity="0.5" />
      </pattern>
      <pattern id={`${id}-dots`} width="6" height="6" patternUnits="userSpaceOnUse">
        <rect width="6" height="6" fill="var(--c-fill-3)" />
        <circle cx="2" cy="2" r="1.3" fill="var(--c-ink)" opacity="0.45" />
      </pattern>
    </defs>
  )
}

export function Legend({ items }: { items: { label: string; kind: 'solid' | 'hatch' | 'dots' | 'line' | 'dash' }[] }) {
  const { t } = useI18n()
  return (
    <ul className="c-legend">
      {items.map((i) => (
        <li key={i.label}>
          <span className={`c-swatch c-swatch--${i.kind}`} aria-hidden="true" />
          {t(i.label)}
        </li>
      ))}
    </ul>
  )
}

/* ---------------------------------------------------------- line chart --- */

interface LineChartProps {
  series: { name: string; points: SeriesPoint[]; dashed?: boolean }[]
  yLabel: string
  xLabel: string
  /** Optional horizontal reference (e.g. licence capacity). */
  reference?: { value: number; label: string }
  /** Optional shaded band (e.g. WHO-5 general population range). */
  band?: { low: number; high: number; label: string }
  max?: number
}

export function LineChart({ series, yLabel, xLabel, reference, band, max }: LineChartProps) {
  const { t } = useI18n()
  const id = useId().replace(/:/g, '')
  const p = plot()
  const all = series.flatMap((s) => s.points.map((pt) => pt.value))
  const computed = Math.max(reference?.value ?? 0, band?.high ?? 0, ...all) * 1.08
  const top = max ?? (computed > 0 ? computed : 1)
  const count = Math.max(1, series[0]?.points.length ?? 1)

  const xAt = (i: number) => p.x + (count === 1 ? p.w / 2 : (i / (count - 1)) * p.w)
  const yAt = (v: number) => p.y + p.h - (Math.max(0, v) / top) * p.h

  return (
    <div className="c-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${t(yLabel)} ${t(xLabel)}`} preserveAspectRatio="none">
        <Patterns id={id} />
        {band && (
          <rect
            x={p.x}
            y={yAt(band.high)}
            width={p.w}
            height={Math.max(0, yAt(band.low) - yAt(band.high))}
            fill="var(--c-band)"
          />
        )}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={p.x} x2={p.x + p.w} y1={p.y + p.h * f} y2={p.y + p.h * f} stroke="var(--c-grid)" strokeWidth="1" />
        ))}
        {reference && (
          <line
            x1={p.x}
            x2={p.x + p.w}
            y1={yAt(reference.value)}
            y2={yAt(reference.value)}
            stroke="var(--c-ink)"
            strokeWidth="1.4"
            strokeDasharray="6 4"
          />
        )}
        {series.map((s, si) => (
          <polyline
            key={s.name}
            points={s.points.map((pt, i) => `${xAt(i)},${yAt(pt.value)}`).join(' ')}
            fill="none"
            stroke="var(--c-ink)"
            strokeWidth={si === 0 ? 2.4 : 1.8}
            strokeDasharray={s.dashed || si > 0 ? '5 4' : undefined}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        <line x1={p.x} x2={p.x + p.w} y1={p.y + p.h} y2={p.y + p.h} stroke="var(--c-axis)" strokeWidth="1.4" />
        <line x1={p.x} x2={p.x} y1={p.y} y2={p.y + p.h} stroke="var(--c-axis)" strokeWidth="1.4" />
        <text x={4} y={p.y + 8} className="c-axislabel">{Math.round(top)}</text>
        <text x={4} y={p.y + p.h} className="c-axislabel">0</text>
        {series[0]?.points.map((pt, i) =>
          i % Math.ceil(count / 6) === 0 ? (
            <text key={pt.label} x={xAt(i)} y={H - 8} className="c-axislabel" textAnchor="middle">
              {pt.label}
            </text>
          ) : null,
        )}
      </svg>
      <div className="c-axes">
        <span>{t(yLabel)} ↑</span>
        <span>{t(xLabel)} →</span>
        {reference && <span>{t(reference.label)}</span>}
        {band && <span>{t(band.label)}</span>}
      </div>
    </div>
  )
}

/* --------------------------------------------------- grouped bar chart --- */

interface GroupedBarsProps {
  data: { label: string; values: number[] }[]
  seriesNames: string[]
  yLabel: string
  xLabel: string
}

export function GroupedBars({ data, seriesNames, yLabel, xLabel }: GroupedBarsProps) {
  const { t } = useI18n()
  const id = useId().replace(/:/g, '')
  const p = plot()
  const top = Math.max(1, ...data.flatMap((d) => d.values)) * 1.1
  const groupW = p.w / Math.max(1, data.length)
  const barW = Math.max(2, (groupW - 6) / seriesNames.length)
  const fills = [`var(--c-fill-1)`, `url(#${id}-hatch)`, `url(#${id}-dots)`]

  return (
    <div className="c-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${t(yLabel)} ${t(xLabel)}`} preserveAspectRatio="none">
        <Patterns id={id} />
        {[0, 0.5, 1].map((f) => (
          <line key={f} x1={p.x} x2={p.x + p.w} y1={p.y + p.h * f} y2={p.y + p.h * f} stroke="var(--c-grid)" strokeWidth="1" />
        ))}
        {data.map((d, gi) =>
          d.values.map((v, si) => {
            const h = (v / top) * p.h
            return (
              <rect
                key={`${d.label}-${si}`}
                x={p.x + gi * groupW + 3 + si * barW}
                y={p.y + p.h - h}
                width={barW - 1}
                height={h}
                fill={fills[si % fills.length]}
                stroke="var(--c-ink)"
                strokeWidth="0.8"
              />
            )
          }),
        )}
        <line x1={p.x} x2={p.x + p.w} y1={p.y + p.h} y2={p.y + p.h} stroke="var(--c-axis)" strokeWidth="1.4" />
        <line x1={p.x} x2={p.x} y1={p.y} y2={p.y + p.h} stroke="var(--c-axis)" strokeWidth="1.4" />
        <text x={4} y={p.y + 8} className="c-axislabel">{Math.round(top)}</text>
        {data.map((d, gi) =>
          gi % Math.ceil(data.length / 6) === 0 ? (
            <text key={d.label} x={p.x + gi * groupW + groupW / 2} y={H - 8} className="c-axislabel" textAnchor="middle">
              {d.label}
            </text>
          ) : null,
        )}
      </svg>
      <Legend items={seriesNames.map((n, i) => ({ label: n, kind: (['solid', 'hatch', 'dots'] as const)[i % 3] }))} />
      <div className="c-axes">
        <span>{t(yLabel)} ↑</span>
        <span>{t(xLabel)} →</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------- horizontal bar list --- */

export function BarList({
  rows,
  unit = '%',
}: {
  rows: { label: string; value: number; note?: string }[]
  unit?: string
}) {
  const { t } = useI18n()
  const top = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className="c-barlist">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="c-barlist__label">{t(r.label)}</span>
          <span className="c-barlist__track" aria-hidden="true">
            <span style={{ width: `${(r.value / top) * 100}%` }} />
          </span>
          <span className="c-barlist__val">{r.note ?? `${r.value}${unit}`}</span>
        </li>
      ))}
    </ul>
  )
}

/* ------------------------------------------------------- paired 1–5 bars -- */

export function PairedBars({
  rows,
  max = 5,
}: {
  rows: { label: string; current: number | null; previous: number | null }[]
  max?: number
}) {
  const { t } = useI18n()
  return (
    <div className="c-paired">
      {rows.map((r) => (
        <div key={r.label} className="c-paired__row">
          <span className="c-paired__label">{t(r.label)}</span>
          <span className="c-paired__bars">
            <span className="c-paired__cur" style={{ width: `${((r.current ?? 0) / max) * 100}%` }} />
            <span className="c-paired__prev" style={{ width: `${((r.previous ?? 0) / max) * 100}%` }} />
          </span>
          <span className="c-paired__val">{r.current ?? '—'}</span>
        </div>
      ))}
      <Legend items={[{ label: 'Current', kind: 'solid' }, { label: 'Previous', kind: 'hatch' }]} />
    </div>
  )
}

/* ------------------------------------------------------- stacked areas --- */

export function StackedArea({
  data,
  yLabel,
  xLabel,
}: {
  data: { label: string; positive: number; neutral: number; negative: number }[]
  yLabel: string
  xLabel: string
}) {
  const { t } = useI18n()
  const id = useId().replace(/:/g, '')
  const p = plot()
  const count = Math.max(1, data.length)
  const xAt = (i: number) => p.x + (count === 1 ? p.w / 2 : (i / (count - 1)) * p.w)
  const yAt = (v: number) => p.y + p.h - (v / 100) * p.h

  const bandPath = (from: (d: (typeof data)[number]) => number, to: (d: (typeof data)[number]) => number) => {
    const up = data.map((d, i) => `${xAt(i)},${yAt(to(d))}`).join(' L ')
    const down = [...data].reverse().map((d, i) => `${xAt(count - 1 - i)},${yAt(from(d))}`).join(' L ')
    return `M ${up} L ${down} Z`
  }

  return (
    <div className="c-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${t(yLabel)} ${t(xLabel)}`} preserveAspectRatio="none">
        <Patterns id={id} />
        <path d={bandPath(() => 0, (d) => d.negative)} fill={`url(#${id}-dots)`} stroke="var(--c-ink)" strokeWidth="0.7" />
        <path d={bandPath((d) => d.negative, (d) => d.negative + d.neutral)} fill={`url(#${id}-hatch)`} stroke="var(--c-ink)" strokeWidth="0.7" />
        <path d={bandPath((d) => d.negative + d.neutral, () => 100)} fill="var(--c-fill-1)" stroke="var(--c-ink)" strokeWidth="0.7" />
        <line x1={p.x} x2={p.x + p.w} y1={p.y + p.h} y2={p.y + p.h} stroke="var(--c-axis)" strokeWidth="1.4" />
        <line x1={p.x} x2={p.x} y1={p.y} y2={p.y + p.h} stroke="var(--c-axis)" strokeWidth="1.4" />
        <text x={4} y={p.y + 8} className="c-axislabel">100</text>
        <text x={4} y={p.y + p.h} className="c-axislabel">0</text>
        {data.map((d, i) =>
          i % 2 === 0 ? (
            <text key={d.label} x={xAt(i)} y={H - 8} className="c-axislabel" textAnchor="middle">{d.label}</text>
          ) : null,
        )}
      </svg>
      <Legend items={[{ label: 'Positive', kind: 'solid' }, { label: 'Neutral', kind: 'hatch' }, { label: 'Negative', kind: 'dots' }]} />
      <div className="c-axes">
        <span>{t(yLabel)} ↑</span>
        <span>{t(xLabel)} →</span>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------- donut ------- */

export function Donut({ slices }: { slices: { label: string; pct: number }[] }) {
  const { t } = useI18n()
  const id = useId().replace(/:/g, '')
  const r = 54
  const c = 2 * Math.PI * r
  let offset = 0
  const fills = ['var(--c-fill-1)', `url(#${id}-hatch)`, `url(#${id}-dots)`]

  return (
    <div className="c-donut">
      <svg viewBox="0 0 140 140" role="img" aria-label={t('Duration preferences')}>
        <Patterns id={id} />
        <g transform="translate(70,70) rotate(-90)">
          {slices.map((s, i) => {
            const len = (s.pct / 100) * c
            const el = (
              <circle
                key={s.label}
                r={r}
                fill="none"
                stroke={fills[i % fills.length]}
                strokeWidth="26"
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
              />
            )
            offset += len
            return el
          })}
        </g>
      </svg>
      <ul className="c-legend c-legend--stack">
        {slices.map((s, i) => (
          <li key={s.label}>
            <span className={`c-swatch c-swatch--${(['solid', 'hatch', 'dots'] as const)[i % 3]}`} aria-hidden="true" />
            {t(s.label)} · {s.pct}%
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Tiny inline trend line for the company-code usage readout. */
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const max = Math.max(...values, 1)
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${24 - (v / max) * 22}`).join(' ')
  return (
    <svg className="c-spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}
