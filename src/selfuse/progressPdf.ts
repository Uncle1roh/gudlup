/* ============================================================================
   Self Use — the person's own reports

   Two documents, and the difference between them matters:

   · The MONTHLY REPORT is what the person did on their own. Sessions,
     check-ins, mood. It is theirs, it is not clinical, and it says so.
   · The THERAPY REPORT is what happened under a clinician. It carries the
     session VAS — which the person taps themselves, one before and one after —
     and the clinical scale scores, which a therapist administers. It states
     plainly which is which, and that reading a scale is a conversation to have
     with the therapist rather than something to do alone with a PDF.

   Neither carries an interpretation. A number and a direction is the whole of
   what this product says about a person's wellbeing, on screen and on paper.
   ============================================================================ */

import { fmtDate as localeDate } from '../i18n'
import { PdfDoc } from '../lib/pdf'
import {
  GL_CHECK_QUESTIONS,
  MOOD_LEVELS,
  glCheckAverage,
  trend,
  who5Percent,
  type GlDimension,
} from '../data/measures'
import { streakDays, type SelfUseState } from '../data/selfUseStore'
import type { ResolvedPathway, ResolvedSession } from '../data/liveCatalog'
import type { TherapyLink } from './therapyStore'

function fmtDate(ms: number): string {
  return localeDate(ms, { year: 'numeric', month: 'short', day: 'numeric' })
}

function monthName(ms: number): string {
  return localeDate(ms, { month: 'long', year: 'numeric' })
}

function header(name: string) {
  return (d: PdfDoc) => {
    d.drawText('Good Loop', d.margin, d.height - 30, 10, 'bold', 0.35)
    d.drawText(name, d.width - d.margin - 150, d.height - 30, 8.5, 'regular', 0.5)
    d.drawLine(d.margin, d.height - 38, d.width - d.margin, d.height - 38, 0.85)
    d.cursor = d.height - 56
  }
}

/* ------------------------------------------------------------- monthly --- */

interface MonthlyOptions {
  state: SelfUseState
  sessions: ResolvedSession[]
  pathway?: ResolvedPathway
  personName: string
  /** Any timestamp inside the month to report on. */
  month?: number
}

export function buildMonthlyReportPdf({
  state,
  sessions,
  pathway,
  personName,
  month = Date.now(),
}: MonthlyOptions): PdfDoc {
  const start = new Date(new Date(month).getFullYear(), new Date(month).getMonth(), 1).getTime()
  const end = new Date(new Date(month).getFullYear(), new Date(month).getMonth() + 1, 1).getTime()
  const inMonth = <T extends { at: number }>(xs: T[]) => xs.filter((x) => x.at >= start && x.at < end)

  const logs = inMonth(state.logs)
  const checks = inMonth(state.glChecks)
  const who5 = inMonth(state.who5)
  const moods = inMonth(state.moods)
  const label = monthName(month)

  const doc = new PdfDoc({
    title: `Good Loop — ${label}`,
    author: 'Good Loop',
    subject: 'Personal wellbeing summary',
    footer: (page, total) => `Your Good Loop summary  ·  ${label}  ·  page ${page} of ${total}`,
    header: header('Monthly summary'),
  })

  doc.heading(label, 20)
  doc.paragraph(personName, 12, 0.2, 'bold')
  doc.paragraph(`Generated ${fmtDate(Date.now())}`, 9.5, 0.45)
  doc.space(4)
  doc.note(
    'This is your own record of what you did and how you rated your weeks. It is a wellbeing ' +
      'summary, not a clinical assessment, and no one else receives it.',
  )

  /* ---- sessions ---- */
  doc.section('Sessions')
  const minutes = logs.reduce((n, l) => n + l.duration, 0)
  doc.keyValue('Sessions completed', String(logs.length))
  doc.keyValue('Total minutes', String(minutes))
  doc.keyValue('Current streak', `${streakDays(state.logs)} day(s)`)
  if (pathway) {
    doc.keyValue('Pathway', pathway.name)
  }

  if (logs.length) {
    doc.space(4)
    const nameOf = new Map(sessions.map((s) => [s.slug, s.name]))
    doc.table(
      [
        { header: 'Date', width: 1.2 },
        { header: 'Session', width: 3 },
        { header: 'Length', width: 1, align: 'right' },
      ],
      [...logs]
        .sort((a, b) => a.at - b.at)
        .map((l) => [fmtDate(l.at), nameOf.get(l.slug) ?? l.slug, `${l.duration} min`]),
    )
  } else {
    doc.paragraph('No sessions this month.', 9.5, 0.45)
  }

  /* ---- weekly check-in ---- */
  doc.section('Weekly check-in')
  if (!checks.length) {
    doc.paragraph('No check-in completed this month.', 9.5, 0.45)
  } else {
    const latest = checks[checks.length - 1]
    const earlier = checks.length > 1 ? checks[0] : null
    doc.table(
      [
        { header: 'Dimension', width: 2 },
        { header: 'Latest', width: 1, align: 'right' },
        { header: 'Direction', width: 1.6 },
      ],
      GL_CHECK_QUESTIONS.map((q) => {
        const cur = latest.scores[q.id as GlDimension]
        const before = earlier?.scores[q.id as GlDimension] ?? null
        const tr = trend(cur, before, 0.01, 1)
        return [q.label, `${cur} / 5`, tr ? tr.label : '—']
      }),
    )
    const avg = glCheckAverage(latest)
    if (avg != null) doc.keyValue('Average', `${avg} / 5`)
  }

  /* ---- monthly wellbeing ---- */
  doc.section('Monthly wellbeing (WHO-5)')
  const latestWho = who5[who5.length - 1] ?? state.who5[state.who5.length - 1] ?? null
  const pctNow = who5Percent(latestWho)
  if (pctNow == null) {
    doc.paragraph('No wellbeing snapshot recorded.', 9.5, 0.45)
  } else {
    const prev = state.who5[state.who5.length - 2] ?? null
    const tr = trend(pctNow, who5Percent(prev), 1, 0)
    doc.keyValue('Score', `${pctNow}%`)
    if (tr) doc.keyValue('Versus previous', tr.label)
    doc.paragraph(
      'The WHO-5 is a short, general wellbeing questionnaire reported on a 0-100 scale. ' +
        'Higher is better perceived wellbeing. It is descriptive and is not a diagnosis.',
      8.5,
      0.45,
    )
  }

  /* ---- mood ---- */
  doc.section('Daily mood')
  if (!moods.length) {
    doc.paragraph('No mood entries this month.', 9.5, 0.45)
  } else {
    const counts = new Map<number, number>()
    for (const m of moods) counts.set(m.level, (counts.get(m.level) ?? 0) + 1)
    doc.table(
      [
        { header: 'How the day felt', width: 2 },
        { header: 'Days', width: 1, align: 'right' },
      ],
      MOOD_LEVELS.map((l) => [l.label, String(counts.get(l.value) ?? 0)]),
    )
    doc.keyValue('Days recorded', String(moods.length))
  }

  return doc
}

/* ------------------------------------------------------------- therapy --- */

export function buildTherapyReportPdf(link: TherapyLink, sessions: ResolvedSession[], personName: string): PdfDoc {
  const doc = new PdfDoc({
    title: `Therapy summary — ${personName}`,
    author: 'Good Loop',
    subject: 'Therapy summary',
    footer: (page, total) =>
      `Therapy summary  ·  ${personName}  ·  ${link.therapist.name}  ·  page ${page} of ${total}`,
    header: header('Therapy summary'),
  })

  const nameOf = new Map(sessions.map((s) => [s.slug, s.name]))

  doc.heading('Therapy summary', 20)
  doc.paragraph(personName, 12, 0.2, 'bold')
  doc.paragraph(`With ${link.therapist.name} · generated ${fmtDate(Date.now())}`, 9.5, 0.45)
  doc.space(4)
  doc.note(
    'This summary is yours. The before-and-after check is your own, one tap either side of a ' +
      'session. The clinical scales were administered by your therapist - they are clinical ' +
      'measures and are best read together with them, not alone.',
  )

  doc.section('Overview')
  doc.keyValue('Therapist', link.therapist.name)
  doc.keyValue('Sessions', String(link.sessions.length))
  doc.keyValue('Weeks in therapy', String(link.weeksInTherapy))
  if (link.nextSessionAt) doc.keyValue('Next session', fmtDate(link.nextSessionAt))

  doc.section('Sessions')
  if (!link.sessions.length) {
    doc.paragraph('No sessions recorded yet.', 9.5, 0.45)
  } else {
    doc.table(
      [
        { header: 'Date', width: 1.2 },
        { header: 'Session', width: 2.6 },
        { header: 'Length', width: 1, align: 'right' },
      ],
      [...link.sessions]
        .sort((a, b) => a.at - b.at)
        .map((s) => [
          fmtDate(s.at),
          s.slug ? (nameOf.get(s.slug) ?? 'Session') : 'Video session',
          `${s.minutes} min`,
        ]),
    )
  }

  doc.section('How you felt, before and after')
  if (!link.vas.length) {
    doc.paragraph('Not recorded.', 9.5, 0.45)
  } else {
    doc.table(
      [
        { header: 'Date', width: 1.4 },
        { header: 'Before', width: 1, align: 'right' },
        { header: 'After', width: 1, align: 'right' },
        { header: 'Change', width: 1, align: 'right' },
      ],
      link.vas.map((v) => {
        const delta = v.post - v.pre
        return [fmtDate(v.at), String(v.pre), String(v.post), `${delta > 0 ? '+' : ''}${delta}`]
      }),
    )
    /* The old wording said these were taken verbally by the therapist and
       never collected through the app. They are one tap in the app now, before
       and after each session, so the sentence describing them changed too. */
    doc.paragraph(
      'One tap before each session and one after, on a five-point scale. ' +
        'A positive change means you finished the session feeling better than you started it. ' +
        'Your therapist sees the same figures.',
      8.5,
      0.45,
    )
  }

  /* Questionnaire results appear here only because a therapist administers
     them and goes through them with the person. They are never shown beside a
     questionnaire at the moment it is answered — see `Assessment.tsx`. */
  doc.section('Clinical scales')
  if (!link.scores.length) {
    doc.paragraph('None administered yet.', 9.5, 0.45)
  } else {
    doc.table(
      [
        { header: 'Instrument', width: 1.6 },
        { header: 'First', width: 1, align: 'right' },
        { header: 'Latest', width: 1, align: 'right' },
        { header: 'Measured', width: 1.6 },
      ],
      link.scores.map((s) => {
        const first = s.points[0]
        const last = s.points[s.points.length - 1]
        return [
          s.label,
          first ? String(first.value) : '—',
          last ? String(last.value) : '—',
          last ? fmtDate(last.at) : '—',
        ]
      }),
    )
    doc.paragraph(
      'Clinical scales are administered under your therapist’s supervision. A number on its own ' +
        'is not a diagnosis, and the change over time is what they look at with you.',
      8.5,
      0.45,
    )
  }

  doc.section('Goals')
  if (!link.goals.length) {
    doc.paragraph('No goals set.', 9.5, 0.45)
  } else {
    doc.bullets(link.goals.map((g) => `${g.text} — ${g.status === 'achieved' ? 'achieved' : 'in progress'}`))
  }

  return doc
}
