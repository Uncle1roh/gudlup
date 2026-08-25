/* ============================================================================
   Therapist Workspace — session report PDF

   A signed session report is a clinical record. What that means for this file:

   · The SIGNATURE block is printed whether or not the report was signed, and
     an unsigned one says "DRAFT — NOT SIGNED" across the top. A draft that
     looks like a record is worse than no export at all.
   · Re-signing produces a new VERSION, and the version number is on the page.
     The audit trail is only meaningful if the paper says which version it is.
   · A video-only session omits the treatment rows entirely rather than
     printing them empty — "Phases completed: 0/6" would read as a failed
     treatment rather than as a session that never had one.
   · Every page carries the patient, the professional and their licence number,
     because pages get separated.
   ============================================================================ */

import { PdfDoc } from '../lib/pdf'
import { versionShort } from './Patients'
import type { SessionRow, TherapistAccount, WorkspacePatient } from './data'

function fmtDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function goalStatusLabel(s: SessionRow['goalStatus']): string {
  return s === 'partial' ? 'Partially addressed' : s === 'deferred' ? 'Deferred' : 'Addressed'
}

interface Options {
  patient: WorkspacePatient
  account: TherapistAccount
  rows: SessionRow[]
  /** Set for a batch export, so the cover says what the file contains. */
  batchTitle?: string
}

/** One report per session, in date order, each starting on its own page. */
export function buildSessionReportPdf({ patient, account, rows, batchTitle }: Options): PdfDoc {
  const doc = new PdfDoc({
    title: batchTitle ?? `Session report — ${patient.name}`,
    author: account.fullName,
    subject: 'Good Loop session report',
    footer: (page, total) =>
      `Confidential clinical record  ·  ${patient.name}  ·  ${account.fullName} (${account.licenceNumber})  ·  page ${page} of ${total}`,
    header: (d) => {
      d.drawText('Good Loop', d.margin, d.height - 30, 10, 'bold', 0.35)
      d.drawText(
        'Session report',
        d.width - d.margin - 62,
        d.height - 30,
        8.5,
        'regular',
        0.5,
      )
      d.drawLine(d.margin, d.height - 38, d.width - d.margin, d.height - 38, 0.85)
      d.cursor = d.height - 56
    },
  })

  const ordered = [...rows].sort((a, b) => a.at - b.at)
  ordered.forEach((row, i) => {
    if (i > 0) doc.pageBreak()
    appendReport(doc, patient, account, row)
  })

  return doc
}

/** A cross-patient batch: one cover page listing what follows, then each report. */
export function buildBatchReportPdf(
  account: TherapistAccount,
  groups: { patient: WorkspacePatient; rows: SessionRow[] }[],
): PdfDoc {
  const total = groups.reduce((n, g) => n + g.rows.length, 0)
  const doc = new PdfDoc({
    title: `Session reports — ${account.fullName}`,
    author: account.fullName,
    subject: 'Good Loop session reports',
    footer: (page, pages) =>
      `Confidential clinical records  ·  ${account.fullName} (${account.licenceNumber})  ·  page ${page} of ${pages}`,
    header: (d) => {
      d.drawText('Good Loop', d.margin, d.height - 30, 10, 'bold', 0.35)
      d.drawLine(d.margin, d.height - 38, d.width - d.margin, d.height - 38, 0.85)
      d.cursor = d.height - 56
    },
  })

  doc.heading('Session reports', 18)
  doc.paragraph(`${total} report${total === 1 ? '' : 's'} · exported ${fmtDateTime(Date.now())}`, 9.5, 0.45)
  doc.section('Contents')
  doc.table(
    [
      { header: 'Date', width: 1.1 },
      { header: 'Patient', width: 1.6 },
      { header: 'Type', width: 1.1 },
      { header: 'Protocol', width: 1.6 },
      { header: 'Status', width: 1 },
    ],
    groups.flatMap((g) =>
      [...g.rows]
        .sort((a, b) => a.at - b.at)
        .map((r) => [
          fmtDate(r.at),
          g.patient.name,
          r.kind === 'gl-video' ? 'GL + Video' : 'Video only',
          r.protocolCode ? `${r.protocolCode} ${versionShort(r.version)}` : '—',
          r.signedAt ? 'Signed' : 'Draft',
        ]),
    ),
  )
  doc.note(
    'Confidential. These are clinical records and are subject to professional confidentiality. ' +
      'They are not visible to any administrator or corporate client.',
  )

  /* Each report is written into the SHARED document rather than generated
     separately and concatenated, so page numbering runs continuously —
     which is what a stapled export needs. */
  for (const g of groups) {
    for (const row of [...g.rows].sort((a, b) => a.at - b.at)) {
      doc.pageBreak()
      appendReport(doc, g.patient, account, row)
    }
  }

  return doc
}

/** The body of one report, written into an existing document. */
function appendReport(
  doc: PdfDoc,
  patient: WorkspacePatient,
  account: TherapistAccount,
  row: SessionRow,
): void {
  if (!row.signedAt) {
    doc.note('DRAFT — NOT SIGNED. This report has not been confirmed and is not a completed clinical record.')
  }
  doc.heading(`${patient.name} · Session #${row.noteNumber}`, 16)
  doc.paragraph(fmtDateTime(row.at), 9.5, 0.45)

  doc.section('Session')
  doc.keyValue('Date & time', fmtDateTime(row.at))
  doc.keyValue('Call duration', `${row.minutes} min`)
  doc.keyValue('Good Loop treatment', row.kind === 'gl-video' ? 'Yes' : 'No')
  if (row.kind === 'gl-video') {
    if (row.protocolCode) doc.keyValue('Protocol', row.protocolCode)
    if (row.version) doc.keyValue('Version', `${versionShort(row.version)} (${row.version} min)`)
    doc.keyValue('Phases completed', `${row.phasesCompleted ?? 0} / 6`)
    doc.keyValue('Pauses', String(row.pauses ?? 0))
    doc.keyValue('Interventions', String(row.interventions ?? 0))
  }

  doc.section('VAS')
  if (row.vasPre != null || row.vasPost != null) {
    doc.keyValue('Pre-session', row.vasPre != null ? String(row.vasPre) : 'Not recorded')
    doc.keyValue('Post-session', row.vasPost != null ? String(row.vasPost) : 'Not recorded')
    if (row.vasPre != null && row.vasPost != null) {
      const delta = row.vasPost - row.vasPre
      doc.keyValue('Delta', `${delta > 0 ? '+' : ''}${delta}`)
    }
  } else {
    doc.paragraph('Not recorded.', 9.5, 0.45)
  }

  if (row.goal || row.nextGoal) {
    doc.section('Goals')
    if (row.goal) {
      doc.keyValue('Session goal', row.goal)
      doc.keyValue('Status', goalStatusLabel(row.goalStatus))
    }
    if (row.nextGoal) doc.keyValue('Goal for next session', row.nextGoal)
  }

  doc.section('Clinical note')
  doc.paragraph(row.note?.trim() || 'No note recorded.', 9.5, 0.15)

  doc.section('Signature')
  if (row.signedAt) {
    doc.paragraph(account.fullName, 10, 0.1, 'bold')
    doc.paragraph(
      `${account.licenceNumber}  ·  signed ${fmtDateTime(row.signedAt)}  ·  version ${row.signatureVersion}`,
      9,
      0.4,
    )
  } else {
    doc.paragraph('Not signed.', 9.5, 0.45)
  }
}
