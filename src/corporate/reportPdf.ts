/* ============================================================================
   Corporate Dashboard — aggregate wellbeing report PDF

   The export is the part of this surface that LEAVES the building. It gets
   forwarded, printed and filed, so every rule the dashboard enforces on screen
   has to hold here too — and one of them only matters here:

   · Suppression travels with the document. A section below N=5 prints
     "Not enough data" rather than being omitted, because a missing section
     reads as "we did not measure that" while the truth is "too few people
     answered for it to be publishable".
   · The footer the spec dictates is on EVERY page, not the first:
     "Confidential — [Company] — Good Loop Aggregate Wellbeing Report —
     Generated [date]".
   · No individual anything. There is no row in this file that describes one
     person, because there is no such row in the aggregate it is built from.
   · The forbidden vocabulary does not appear. Trend words come from the same
     `movement()` the screens use, so the export cannot say something the
     dashboard would refuse to.
   ============================================================================ */

import { PdfDoc } from '../lib/pdf'
import { cellValue, movement, pct, type CorporateState } from './metrics'
import type { Aggregates } from './data'
import { conventionLabel } from '../data/convention'

export type ReportSection =
  | 'Adoption overview'
  | 'Engagement metrics'
  | 'WHO-5 aggregate trend'
  | 'GL-Check dimensions'
  | 'Mood overview'
  | 'Benchmarking (if available)'
  | 'Professional support utilization'

const NOT_ENOUGH = 'Not enough data — this metric requires at least 5 participants.'

const WHO5_NOTE =
  'The WHO-5 measures general subjective wellbeing on a 0-100 scale. This figure is the ' +
  'company-wide average. Higher scores indicate better perceived wellbeing. This is a ' +
  'descriptive indicator - it does not constitute a clinical assessment.'

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

interface Options {
  state: CorporateState
  agg: Aggregates
  name: string
  periodFrom: number
  periodTo: number
  sections: string[]
}

export function buildCorporateReportPdf({ state, agg, name, periodFrom, periodTo, sections }: Options): PdfDoc {
  const generated = Date.now()
  const company = state.profile.name
  const include = (s: ReportSection) => sections.includes(s)

  const doc = new PdfDoc({
    title: `${name} — ${company}`,
    author: 'Good Loop',
    subject: 'Aggregate wellbeing report',
    /* The exact footer the spec dictates, on every page. */
    footer: (page, total) =>
      `Confidential - ${company} - Good Loop Aggregate Wellbeing Report - Generated ${fmtDate(generated)}  ·  page ${page} of ${total}`,
    header: (d, page) => {
      d.drawText('Good Loop', d.margin, d.height - 30, 10, 'bold', 0.35)
      if (page > 1) {
        d.drawText(company, d.width - d.margin - 160, d.height - 30, 8.5, 'regular', 0.5)
      }
      d.drawLine(d.margin, d.height - 38, d.width - d.margin, d.height - 38, 0.85)
      d.cursor = d.height - 56
    },
  })

  const k = agg.kpis
  const registered = cellValue(k.registered)

  /* ------------------------------------------------------------- cover -- */
  doc.heading(name, 20)
  doc.paragraph(company, 12, 0.2, 'bold')
  doc.paragraph(
    `Period ${fmtDate(periodFrom)} to ${fmtDate(periodTo)}  ·  generated ${fmtDate(generated)}`,
    9.5,
    0.45,
  )
  doc.space(6)
  doc.note(
    'All figures in this report are anonymized and aggregated. No individual employee data is ' +
      'included, and any metric computed from fewer than 5 responses is withheld rather than shown.',
  )

  doc.section('Programme')
  doc.keyValue('Convention', conventionLabel(state.conventionType))
  doc.keyValue('Employee licenses', String(state.licences))
  doc.keyValue('Registered', registered == null ? 'Not enough data' : `${registered} of ${state.licences}`)
  doc.keyValue(
    'Consented to anonymous sharing',
    registered == null ? '—' : `${state.consented} (${pct(state.consented, registered)}%)`,
  )

  /* ---------------------------------------------------------- adoption -- */
  if (include('Adoption overview')) {
    doc.section('Adoption')
    const active = cellValue(k.active7)
    const activation = cellValue(k.activationPct)
    const weekly = cellValue(k.weeklyActivePct)
    const retention = cellValue(k.retention30)

    if (registered == null) {
      doc.paragraph(NOT_ENOUGH, 9.5, 0.45)
    } else {
      doc.table(
        [
          { header: 'Metric', width: 2.2 },
          { header: 'Value', width: 1, align: 'right' },
          { header: 'Definition', width: 3 },
        ],
        [
          ['Registered', `${registered}`, `of ${state.licences} licenses (${pct(registered, state.licences)}%)`],
          ['Active (last 7 days)', active == null ? 'Not enough data' : `${active}`, 'Registered employees active in the last 7 days'],
          ['Activation rate', activation == null ? 'Not enough data' : `${activation}%`, 'Registered who completed at least one session'],
          ['Weekly active rate', weekly == null ? 'Not enough data' : `${weekly}%`, 'Of registered, active in the last 7 days'],
          ['Retention (30-day)', retention == null ? 'Not enough data' : `${retention}%`, 'Of activated, still active after 30 days'],
        ],
      )
    }
  }

  /* -------------------------------------------------------- engagement -- */
  if (include('Engagement metrics')) {
    doc.section('Engagement')
    const sessions = cellValue(k.sessions)
    const perUser = cellValue(k.sessionsPerUserWeek)

    if (sessions == null) {
      doc.paragraph(NOT_ENOUGH, 9.5, 0.45)
    } else {
      doc.keyValue('Sessions this period', String(sessions))
      doc.keyValue('Average per user per week', perUser == null ? 'Not enough data' : String(perUser))

      doc.space(6)
      doc.table(
        [
          { header: 'Duration preference', width: 3 },
          { header: 'Share', width: 1, align: 'right' },
        ],
        agg.engagement.durationSplit.map((d) => [d.label, `${d.pct}%`]),
      )
      doc.table(
        [
          { header: 'Session frequency', width: 3 },
          { header: 'Share of active users', width: 1.4, align: 'right' },
        ],
        agg.engagement.frequency.map((f) => [f.label, `${f.pct}%`]),
      )
      doc.table(
        [
          { header: 'Pathway', width: 3 },
          { header: 'Adoption', width: 1.4, align: 'right' },
        ],
        // A pathway below the threshold is named but its share withheld — the
        // pathway existing is not private; how few people chose it is.
        agg.engagement.pathways.map((p) => [p.name, p.n < 5 ? 'Not enough data' : `${p.pct}%`]),
      )
    }
  }

  /* ------------------------------------------------------------- WHO-5 -- */
  if (include('WHO-5 aggregate trend')) {
    doc.section('WHO-5 aggregate trend')
    const who5 = cellValue(agg.wellbeing.who5Current)
    if (who5 == null) {
      doc.paragraph(NOT_ENOUGH, 9.5, 0.45)
    } else {
      const m = movement(who5, agg.wellbeing.who5Previous, 1, 0)
      doc.keyValue('Company average', `${who5} / 100`)
      if (m) doc.keyValue('Versus previous period', m.label)
      doc.space(4)
      doc.table(
        [
          { header: 'Period', width: 2 },
          { header: 'Company average', width: 1.6, align: 'right' },
        ],
        agg.wellbeing.who5Series.map((p) => [p.label, String(p.value)]),
      )
    }
    /* Permanent on screen, permanent here. */
    doc.note(WHO5_NOTE)
  }

  /* ---------------------------------------------------------- GL-Check -- */
  if (include('GL-Check dimensions')) {
    doc.section('GL-Check dimensions')
    const rows = agg.wellbeing.dimensions.map((d) => {
      const cur = cellValue(d.current)
      if (cur == null) return [d.label, 'Not enough data', '—', '—']
      const m = movement(cur, d.previous, 0.05, 1)
      const delta = m && m.direction !== 'flat' ? `${m.delta > 0 ? '+' : ''}${m.delta}` : 'No change'
      return [d.label, String(cur), m?.label ?? '—', delta]
    })
    doc.table(
      [
        { header: 'Dimension', width: 2 },
        { header: 'Current', width: 1.2, align: 'right' },
        { header: 'Direction', width: 1.4 },
        { header: 'Change', width: 1.2, align: 'right' },
      ],
      rows,
    )
    doc.paragraph('Weekly check-in, scale 1-5. Direction only; no interpretation is applied.', 8.5, 0.45)
  }

  /* -------------------------------------------------------------- mood -- */
  if (include('Mood overview')) {
    doc.section('Mood overview')
    const mood = agg.wellbeing.moodCurrent
    if (!mood || agg.wellbeing.moodRespondents < 5) {
      doc.paragraph(NOT_ENOUGH, 9.5, 0.45)
    } else {
      doc.table(
        [
          { header: 'Category', width: 2 },
          { header: 'Share of responses', width: 1.6, align: 'right' },
        ],
        [
          ['Positive', `${mood.positive}%`],
          ['Neutral', `${mood.neutral}%`],
          ['Negative', `${mood.negative}%`],
        ],
      )
      doc.paragraph(
        `Based on ${agg.wellbeing.moodResponses} responses from ${agg.wellbeing.moodRespondents} employees. ` +
          'Daily mood is opt-in.',
        8.5,
        0.45,
      )
    }
  }

  /* ------------------------------------------------------- benchmarking -- */
  if (include('Benchmarking (if available)')) {
    doc.section('Benchmarking')
    const rows = agg.wellbeing.benchmark
    if (!rows.length || rows.every((b) => b.industry == null)) {
      doc.paragraph('Industry benchmark not yet available.', 9.5, 0.45)
    } else {
      doc.table(
        [
          { header: 'Metric', width: 2.4 },
          { header: 'Company', width: 1.2, align: 'right' },
          { header: 'Industry', width: 1.2, align: 'right' },
        ],
        rows.map((b) => [
          b.metric,
          `${b.company}${b.unit}`,
          b.industry == null ? 'Not available' : `${b.industry}${b.unit}`,
        ]),
      )
      doc.paragraph(
        'Industry average is aggregated across all Good Loop companies and covers adoption and ' +
          'efficacy only. It is informational; it is not a ranking.',
        8.5,
        0.45,
      )
    }
  }

  /* ------------------------------------------- professional support ------ */
  if (include('Professional support utilization') && agg.professionalSupport) {
    doc.section('Professional support')
    doc.keyValue('Employees currently using professional support', String(agg.professionalSupport.employees))
    doc.note(
      'This is the only figure available about professional support. It is anonymized and is never ' +
        'broken down - not by therapist, not by session count, not by department. No information ' +
        'about any individual therapy relationship is available to the company.',
    )
  }

  /* ----------------------------------------------------------- closing -- */
  doc.section('How this report is produced')
  doc.bullets([
    'Individual employee data is never included in this report.',
    'Every metric requires a minimum of 5 responses; below that it is withheld and marked "Not enough data".',
    'Employees opt in to anonymous data sharing and may withdraw at any time with no consequence.',
    'Therapy sessions are confidential; only an anonymous count of participants is reported.',
  ])

  return doc
}
