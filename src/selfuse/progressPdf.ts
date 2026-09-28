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

/** The interface's `t`, passed in: this module has no hook. Identity when
    omitted, so the English source still builds. */
export type Translate = (key: string, vars?: Record<string, string | number>) => string
const same: Translate = (k, v) => {
  if (!v) return k
  let out = k
  for (const [n, x] of Object.entries(v)) out = out.split(`{${n}}`).join(String(x))
  return out
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
  t?: Translate
}

export function buildMonthlyReportPdf({
  state,
  sessions,
  pathway,
  personName,
  month = Date.now(),
  t = same,
}: MonthlyOptions): PdfDoc {
  const start = new Date(new Date(month).getFullYear(), new Date(month).getMonth(), 1).getTime()
  const end = new Date(new Date(month).getFullYear(), new Date(month).getMonth() + 1, 1).getTime()
  const inMonth = <T extends { at: number }>(xs: T[]) => xs.filter((x) => x.at >= start && x.at < end)

  const logs = inMonth(state.logs)
  const checks = inMonth(state.glChecks)
  const moods = inMonth(state.moods)
  const label = monthName(month)

  const doc = new PdfDoc({
    title: `Good Loop — ${label}`,
    author: 'Good Loop',
    subject: t('Personal wellbeing summary'),
    footer: (page, total) => t('Your Good Loop summary  ·  {label}  ·  page {page} of {total}', { label, page, total }),
    header: header(t('Monthly summary')),
  })

  doc.heading(label, 20)
  doc.paragraph(personName, 12, 0.2, 'bold')
  doc.paragraph(t('Generated {date}', { date: fmtDate(Date.now()) }), 9.5, 0.45)
  doc.space(4)
  doc.note(
    t('This is your own record of what you did and how you rated your weeks. It is a wellbeing summary, not a clinical assessment, and no one else receives it.'),
  )

  /* ---- sessions ---- */
  doc.section(t('Sessions'))
  const minutes = logs.reduce((n, l) => n + l.duration, 0)
  doc.keyValue(t('Sessions completed'), String(logs.length))
  doc.keyValue(t('Total minutes'), String(minutes))
  doc.keyValue(t('Current streak'), t('{n} day(s)', { n: streakDays(state.logs) }))
  if (pathway) {
    doc.keyValue(t('Pathway'), t(pathway.name))
  }

  if (logs.length) {
    doc.space(4)
    const nameOf = new Map(sessions.map((s) => [s.slug, s.name]))
    doc.table(
      [
        { header: t('Date'), width: 1.2 },
        { header: t('Session'), width: 3 },
        { header: t('Length'), width: 1, align: 'right' },
      ],
      [...logs]
        .sort((a, b) => a.at - b.at)
        .map((l) => [fmtDate(l.at), t(nameOf.get(l.slug) ?? l.slug), `${l.duration} min`]),
    )
  } else {
    doc.paragraph(t('No sessions this month.'), 9.5, 0.45)
  }

  /* ---- weekly check-in ---- */
  doc.section(t('Weekly check-in'))
  if (!checks.length) {
    doc.paragraph(t('No check-in completed this month.'), 9.5, 0.45)
  } else {
    const latest = checks[checks.length - 1]
    const earlier = checks.length > 1 ? checks[0] : null
    doc.table(
      [
        { header: t('Dimension'), width: 2 },
        { header: t('Latest'), width: 1, align: 'right' },
        { header: t('Direction'), width: 1.6 },
      ],
      GL_CHECK_QUESTIONS.map((q) => {
        const cur = latest.scores[q.id as GlDimension]
        const before = earlier?.scores[q.id as GlDimension] ?? null
        const tr = trend(cur, before, 0.01, 1)
        return [t(q.label), `${cur} / 5`, tr ? t(tr.label) : '—']
      }),
    )
    const avg = glCheckAverage(latest)
    if (avg != null) doc.keyValue(t('Average'), `${avg} / 5`)
  }

  /* The WHO-5 section is gone: no validated instrument is scored back to a
     person in self-guided use (MN-05). */

  /* ---- mood ---- */
  doc.section(t('Daily mood'))
  if (!moods.length) {
    doc.paragraph(t('No mood entries this month.'), 9.5, 0.45)
  } else {
    const counts = new Map<number, number>()
    for (const m of moods) counts.set(m.level, (counts.get(m.level) ?? 0) + 1)
    doc.table(
      [
        { header: t('How the day felt'), width: 2 },
        { header: t('Days'), width: 1, align: 'right' },
      ],
      MOOD_LEVELS.map((l) => [t(l.label), String(counts.get(l.value) ?? 0)]),
    )
    doc.keyValue(t('Days recorded'), String(moods.length))
  }

  return doc
}

/* ------------------------------------------------------------- therapy --- */

export function buildTherapyReportPdf(link: TherapyLink, sessions: ResolvedSession[], personName: string, t: Translate = same): PdfDoc {
  const doc = new PdfDoc({
    title: `${t('Therapy summary')} — ${personName}`,
    author: 'Good Loop',
    subject: t('Therapy summary'),
    footer: (page, total) =>
      t('Therapy summary  ·  {person}  ·  {therapist}  ·  page {page} of {total}', { person: personName, therapist: link.therapist.name, page, total }),
    header: header(t('Therapy summary')),
  })

  const nameOf = new Map(sessions.map((s) => [s.slug, s.name]))

  doc.heading(t('Therapy summary'), 20)
  doc.paragraph(personName, 12, 0.2, 'bold')
  doc.paragraph(t('With {name} · generated {date}', { name: link.therapist.name, date: fmtDate(Date.now()) }), 9.5, 0.45)
  doc.space(4)
  doc.note(
    t('This summary is yours. The before-and-after check is your own, one tap either side of a session. The clinical scales were administered by your therapist - they are clinical measures and are best read together with them, not alone.'),
  )

  doc.section(t('Overview'))
  doc.keyValue(t('Therapist'), link.therapist.name)
  doc.keyValue(t('Sessions'), String(link.sessions.length))
  doc.keyValue(t('Weeks in therapy'), String(link.weeksInTherapy))
  if (link.nextSessionAt) doc.keyValue(t('Next session'), fmtDate(link.nextSessionAt))

  doc.section(t('Sessions'))
  if (!link.sessions.length) {
    doc.paragraph(t('No sessions recorded yet.'), 9.5, 0.45)
  } else {
    doc.table(
      [
        { header: t('Date'), width: 1.2 },
        { header: t('Session'), width: 2.6 },
        { header: t('Length'), width: 1, align: 'right' },
      ],
      [...link.sessions]
        .sort((a, b) => a.at - b.at)
        .map((s) => [
          fmtDate(s.at),
          s.slug ? t(nameOf.get(s.slug) ?? 'Session') : t('Video session'),
          `${s.minutes} min`,
        ]),
    )
  }

  doc.section(t('How you felt, before and after'))
  if (!link.vas.length) {
    doc.paragraph(t('Not recorded.'), 9.5, 0.45)
  } else {
    doc.table(
      [
        { header: t('Date'), width: 1.4 },
        { header: t('Before'), width: 1, align: 'right' },
        { header: t('After'), width: 1, align: 'right' },
        { header: t('Change'), width: 1, align: 'right' },
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
      t('One tap before each session and one after, on a five-point scale. A positive change means you finished the session feeling better than you started it. Your therapist sees the same figures.'),
      8.5,
      0.45,
    )
  }

  /* Questionnaire results appear here only because a therapist administers
     them and goes through them with the person. They are never shown beside a
     questionnaire at the moment it is answered — see `Assessment.tsx`. */
  doc.section(t('Clinical scales'))
  if (!link.scores.length) {
    doc.paragraph(t('None administered yet.'), 9.5, 0.45)
  } else {
    doc.table(
      [
        { header: t('Instrument'), width: 1.6 },
        { header: t('First'), width: 1, align: 'right' },
        { header: t('Latest'), width: 1, align: 'right' },
        { header: t('Measured'), width: 1.6 },
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
      t('Clinical scales are administered under your therapist’s supervision. A number on its own is not a diagnosis, and the change over time is what they look at with you.'),
      8.5,
      0.45,
    )
  }

  doc.section(t('Goals'))
  if (!link.goals.length) {
    doc.paragraph(t('No goals set.'), 9.5, 0.45)
  } else {
    doc.bullets(link.goals.map((g) => `${t(g.text)} — ${g.status === 'achieved' ? t('achieved') : t('in progress')}`))
  }

  return doc
}
