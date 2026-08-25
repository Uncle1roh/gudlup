/* ============================================================================
   Good Loop — a minimal PDF writer

   Both surfaces need a REAL file: a therapist's signed session report is a
   clinical record that gets filed and emailed, and a corporate aggregate
   report is a document an HR team forwards. `window.print()` produces neither
   — it produces a dialog, and whatever comes out of it carries the browser's
   own header, the page's own colours, and no guarantee at all about what the
   recipient receives.

   Why write one instead of adding a library: these are TEXT documents — headed
   sections, key/value rows, tables and rules. jsPDF is ~350 kB for that, and
   this is ~400 lines with no supply-chain surface, deterministic output, and
   the two things the specs actually demand: an exact footer on every page, and
   text that wraps where a reader expects rather than where a guess puts it.

   Scope, stated plainly: PDF 1.4, the two standard Helvetica faces, WinAnsi
   encoding, vector rules and filled rectangles. No images, no embedded fonts,
   no Unicode beyond Latin-1 (characters outside it are transliterated, so a
   protocol name never renders as a row of blanks).
   ============================================================================ */

/* ------------------------------------------------------------- metrics --- */

/*
 * Adobe's published Helvetica widths, in 1/1000 em, for WinAnsi codes 32–255.
 * Wrapping needs REAL widths: estimating from character count breaks a line
 * of "Illinois" in a completely different place from "MMMMMMMM", and a
 * clinical report with text running off the page edge is not a record.
 */
const HELVETICA: number[] = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 350,
  556, 350, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 350, 611, 350,
  350, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 350, 500, 667,
  278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 552,
  400, 549, 333, 333, 333, 576, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611,
  667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278,
  722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611,
  556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278,
  556, 556, 584, 584, 584, 584, 584, 549, 611, 556, 556, 556, 556, 500, 556, 500,
]

const HELVETICA_BOLD: number[] = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584, 350,
  556, 350, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333, 1000, 350, 611, 350,
  350, 278, 278, 500, 500, 350, 556, 1000, 333, 1000, 556, 333, 944, 350, 500, 667,
  278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 552,
  400, 549, 333, 333, 333, 576, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611,
  722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278,
  722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611,
  556, 556, 556, 556, 556, 556, 889, 556, 556, 556, 556, 556, 278, 278, 278, 278,
  611, 611, 611, 611, 611, 611, 611, 549, 611, 611, 611, 611, 611, 556, 611, 556,
]

/* Characters this product uses that WinAnsi has no code for. Rendering them as
   blanks would silently corrupt a clinical record, so each one becomes the
   nearest thing a reader would accept. */
const TRANSLITERATE: Record<string, string> = {
  '≥': '>=', '≤': '<=', '≠': '!=', '×': 'x', '→': '->', '←': '<-',
  '↑': '^', '↓': 'v', '⌄': 'v', '›': '>', '‹': '<', '✓': 'v', '✕': 'x', '✗': 'x',
  'Δ': 'D', '─': '-', '—': '-', '–': '-', '…': '...',
  '“': '"', '”': '"', '‘': "'", '’': "'", ' ': ' ',
  '①': '1.', '②': '2.', '③': '3.', '⏸': '||', '⏹': '[]', '🔴': '(!)',
}

/** WinAnsi (cp1252) codes for the characters Latin-1 does not place directly. */
const WINANSI_HIGH: Record<string, number> = {
  '€': 128, '‚': 130, 'ƒ': 131, '„': 132, '†': 134, '‡': 135, 'ˆ': 136,
  '‰': 137, 'Š': 138, 'Œ': 140, 'Ž': 142, '•': 149, '™': 153, 'š': 154,
  'œ': 156, 'ž': 158, 'Ÿ': 159,
}

/** One character → its WinAnsi byte, or null when it has none. */
function winAnsiByte(ch: string): number | null {
  const code = ch.charCodeAt(0)
  if (code >= 32 && code <= 126) return code
  if (code >= 160 && code <= 255) return code
  const high = WINANSI_HIGH[ch]
  return high ?? null
}

/** Text reduced to bytes this encoding can carry, transliterating the rest. */
export function toWinAnsi(text: string): number[] {
  const out: number[] = []
  for (const ch of text) {
    const direct = winAnsiByte(ch)
    if (direct != null) { out.push(direct); continue }
    const alt = TRANSLITERATE[ch]
    if (alt) { for (const a of alt) { const b = winAnsiByte(a); if (b != null) out.push(b) } continue }
    // Anything still unknown (an emoji, a CJK glyph) is dropped rather than
    // rendered as a random glyph from the font's own table.
  }
  return out
}

export type Font = 'regular' | 'bold'

/** Width of `text` at `size` points, in points. */
export function textWidth(text: string, size: number, font: Font = 'regular'): number {
  const table = font === 'bold' ? HELVETICA_BOLD : HELVETICA
  let total = 0
  for (const byte of toWinAnsi(text)) {
    total += table[byte - 32] ?? 500
  }
  return (total * size) / 1000
}

/** Break `text` into lines no wider than `maxWidth`. Long words are split. */
export function wrap(text: string, maxWidth: number, size: number, font: Font = 'regular'): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) { lines.push(''); continue }
    let line = ''
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word
      if (textWidth(candidate, size, font) <= maxWidth) { line = candidate; continue }
      if (line) lines.push(line)
      // A single word wider than the column (a long URL, a code) is cut rather
      // than allowed to run past the margin.
      if (textWidth(word, size, font) > maxWidth) {
        let chunk = ''
        for (const ch of word) {
          if (textWidth(chunk + ch, size, font) > maxWidth) { lines.push(chunk); chunk = ch }
          else chunk += ch
        }
        line = chunk
      } else {
        line = word
      }
    }
    lines.push(line)
  }
  return lines
}

/** Shorten to fit, with an ellipsis. Used for table cells. */
export function ellipsize(text: string, maxWidth: number, size: number, font: Font = 'regular'): string {
  if (textWidth(text, size, font) <= maxWidth) return text
  let out = ''
  for (const ch of text) {
    if (textWidth(`${out}${ch}...`, size, font) > maxWidth) break
    out += ch
  }
  return `${out}...`
}

/* -------------------------------------------------------------- writer --- */

/** A PDF string literal: the three characters the syntax reserves are escaped. */
function pdfString(text: string): string {
  let out = ''
  for (const byte of toWinAnsi(text)) {
    const ch = String.fromCharCode(byte)
    if (ch === '(' || ch === ')' || ch === '\\') out += `\\${ch}`
    else if (byte < 32 || byte > 126) out += `\\${byte.toString(8).padStart(3, '0')}`
    else out += ch
  }
  return `(${out})`
}

export interface PageSetup {
  /** Points. A4 by default; Letter is [612, 792]. */
  width?: number
  height?: number
  margin?: number
  /** Drawn at the top of every page. */
  header?: (p: PdfDoc, pageNumber: number) => void
  /** Drawn at the foot of every page. Receives the total once known. */
  footer?: string | ((pageNumber: number, total: number) => string)
  title?: string
  author?: string
  subject?: string
}

const A4 = { width: 595.28, height: 841.89 }

export interface TableColumn {
  header: string
  /** Share of the available width. Normalised across the set. */
  width: number
  align?: 'left' | 'right'
}

/**
 * A document being built. Content is written top-down; the cursor advances and
 * a new page is started automatically when the next block would not fit.
 */
export class PdfDoc {
  readonly width: number
  readonly height: number
  readonly margin: number
  private pages: string[] = []
  private current: string[] = []
  private y: number
  private setup: PageSetup
  private pageNumber = 0
  private footerSlots: { page: number; index: number }[] = []

  constructor(setup: PageSetup = {}) {
    this.setup = setup
    this.width = setup.width ?? A4.width
    this.height = setup.height ?? A4.height
    this.margin = setup.margin ?? 48
    this.y = this.height - this.margin
    this.newPage()
  }

  /** Usable width between the margins. */
  get contentWidth(): number { return this.width - this.margin * 2 }
  /** Current vertical cursor, in PDF coordinates (origin bottom-left). */
  get cursor(): number { return this.y }
  set cursor(v: number) { this.y = v }

  private newPage(): void {
    if (this.current.length) this.pages.push(this.current.join('\n'))
    this.current = []
    this.pageNumber += 1
    this.y = this.height - this.margin
    this.setup.header?.(this, this.pageNumber)
    if (this.setup.footer) {
      // The total page count is unknown until the document ends, so the footer
      // is a placeholder that `render()` fills in.
      this.footerSlots.push({ page: this.pageNumber, index: this.current.length })
      this.current.push('')
    }
  }

  /** Start a new page unless this one is still empty. */
  pageBreak(): void {
    if (this.y < this.height - this.margin - 1) this.newPage()
  }

  /** Ensure `needed` points remain; otherwise break. */
  private ensure(needed: number): void {
    if (this.y - needed < this.margin + 28) this.newPage()
  }

  /** Move the cursor down. */
  space(points: number): void {
    this.y -= points
  }

  /** One line of text at an absolute position. The low-level primitive. */
  drawText(text: string, x: number, y: number, size: number, font: Font = 'regular', grey = 0): void {
    const f = font === 'bold' ? '/F2' : '/F1'
    this.current.push(
      `BT ${f} ${size} Tf ${grey} g 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm ${pdfString(text)} Tj ET`,
    )
  }

  drawLine(x1: number, y1: number, x2: number, y2: number, grey = 0.8, lineWidth = 0.6): void {
    this.current.push(
      `${grey} G ${lineWidth} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`,
    )
  }

  drawRect(x: number, y: number, w: number, h: number, grey = 0.92): void {
    this.current.push(`${grey} g ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`)
  }

  /* ------------------------------------------------------------ blocks --- */

  heading(text: string, size = 15): void {
    this.ensure(size + 12)
    this.y -= size
    this.drawText(text, this.margin, this.y, size, 'bold')
    this.y -= 8
  }

  /** A small uppercase section label with a rule under it. */
  section(text: string): void {
    this.ensure(26)
    this.y -= 12
    this.drawText(text.toUpperCase(), this.margin, this.y, 8.5, 'bold', 0.4)
    this.y -= 5
    this.drawLine(this.margin, this.y, this.width - this.margin, this.y, 0.85)
    this.y -= 10
  }

  paragraph(text: string, size = 9.5, grey = 0.15, font: Font = 'regular'): void {
    const leading = size * 1.45
    for (const line of wrap(text, this.contentWidth, size, font)) {
      this.ensure(leading)
      this.y -= leading
      if (line) this.drawText(line, this.margin, this.y, size, font, grey)
    }
    this.y -= 3
  }

  bullets(items: string[], size = 9.5): void {
    const leading = size * 1.45
    for (const item of items) {
      const lines = wrap(item, this.contentWidth - 14, size)
      lines.forEach((line, i) => {
        this.ensure(leading)
        this.y -= leading
        if (i === 0) this.drawText('-', this.margin, this.y, size, 'regular', 0.45)
        this.drawText(line, this.margin + 14, this.y, size, 'regular', 0.15)
      })
    }
    this.y -= 3
  }

  /** A label/value row: label left in grey, value right in bold. */
  keyValue(label: string, value: string, size = 9.5): void {
    const leading = size * 1.7
    this.ensure(leading)
    this.y -= leading
    this.drawText(label, this.margin, this.y, size, 'regular', 0.42)
    const w = textWidth(value, size, 'bold')
    this.drawText(
      ellipsize(value, this.contentWidth * 0.6, size, 'bold'),
      this.width - this.margin - Math.min(w, this.contentWidth * 0.6),
      this.y,
      size,
      'bold',
    )
    this.drawLine(this.margin, this.y - 5, this.width - this.margin, this.y - 5, 0.9, 0.4)
    this.y -= 4
  }

  rule(): void {
    this.ensure(10)
    this.y -= 6
    this.drawLine(this.margin, this.y, this.width - this.margin, this.y, 0.85)
    this.y -= 6
  }

  /**
   * A table. Rows wrap within their column and the header repeats on every
   * page — a clinical archive split across pages with an orphaned body is
   * unreadable, and the reader should never have to page back for a column
   * name.
   */
  table(columns: TableColumn[], rows: string[][], size = 9): void {
    const totalShare = columns.reduce((n, c) => n + c.width, 0) || 1
    const widths = columns.map((c) => (c.width / totalShare) * this.contentWidth)
    const pad = 6
    const leading = size * 1.4

    const drawHeader = () => {
      this.ensure(leading + 10)
      this.y -= leading
      let x = this.margin
      columns.forEach((c, i) => {
        const text = ellipsize(c.header.toUpperCase(), widths[i] - pad, size - 1, 'bold')
        const tx = c.align === 'right' ? x + widths[i] - pad - textWidth(text, size - 1, 'bold') : x
        this.drawText(text, tx, this.y, size - 1, 'bold', 0.42)
        x += widths[i]
      })
      this.y -= 4
      this.drawLine(this.margin, this.y, this.width - this.margin, this.y, 0.7)
      this.y -= 4
    }

    drawHeader()

    for (const row of rows) {
      const cells = row.map((cell, i) => wrap(cell ?? '', widths[i] - pad, size))
      const lineCount = Math.max(1, ...cells.map((c) => c.length))
      const needed = lineCount * leading + 6
      if (this.y - needed < this.margin + 28) {
        this.newPage()
        drawHeader()
      }
      const top = this.y
      let x = this.margin
      cells.forEach((lines, i) => {
        lines.forEach((line, li) => {
          const ly = top - (li + 1) * leading
          const tx = columns[i].align === 'right' ? x + widths[i] - pad - textWidth(line, size) : x
          this.drawText(line, tx, ly, size, 'regular', 0.15)
        })
        x += widths[i]
      })
      this.y = top - lineCount * leading - 5
      this.drawLine(this.margin, this.y + 1, this.width - this.margin, this.y + 1, 0.92, 0.4)
    }
    this.y -= 4
  }

  /** A boxed note — used for the interpretation and privacy statements that
      the specs require to be present and impossible to miss. */
  note(text: string, size = 8.5): void {
    const lines = wrap(text, this.contentWidth - 20, size)
    const height = lines.length * size * 1.45 + 14
    this.ensure(height + 6)
    const top = this.y
    this.drawRect(this.margin, top - height, this.contentWidth, height, 0.94)
    lines.forEach((line, i) => {
      this.drawText(line, this.margin + 10, top - 14 - i * size * 1.45, size, 'regular', 0.25)
    })
    this.y = top - height - 8
  }

  /* ------------------------------------------------------------ output --- */

  /** Serialise to PDF bytes. */
  render(): Uint8Array {
    if (this.current.length) this.pages.push(this.current.join('\n'))
    this.current = []

    const total = this.pages.length
    if (this.setup.footer) {
      // Fill in each page's footer now that the total is known.
      const pageArrays = this.pages.map((p) => p.split('\n'))
      this.footerSlots.forEach((slot) => {
        const text =
          typeof this.setup.footer === 'function'
            ? this.setup.footer(slot.page, total)
            : `${this.setup.footer}  ·  ${slot.page} / ${total}`
        const size = 7.5
        const y = this.margin - 16
        pageArrays[slot.page - 1][slot.index] =
          `BT /F1 ${size} Tf 0.45 g 1 0 0 1 ${this.margin.toFixed(2)} ${y.toFixed(2)} Tm ${pdfString(text)} Tj ET`
      })
      this.pages = pageArrays.map((a) => a.join('\n'))
    }

    const objects: string[] = []
    const add = (body: string): number => { objects.push(body); return objects.length }

    const catalogId = 1
    const pagesId = 2
    objects.push('') // 1 catalog, filled below
    objects.push('') // 2 pages, filled below

    const fontRegular = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
    const fontBold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')

    const pageIds: number[] = []
    for (const content of this.pages) {
      const streamId = add(`<< /Length ${toWinAnsi(content).length} >>\nstream\n${content}\nendstream`)
      const pageId = add(
        `<< /Type /Page /Parent ${pagesId} 0 R ` +
          `/MediaBox [0 0 ${this.width.toFixed(2)} ${this.height.toFixed(2)}] ` +
          `/Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> ` +
          `/Contents ${streamId} 0 R >>`,
      )
      pageIds.push(pageId)
    }

    const meta: string[] = []
    if (this.setup.title) meta.push(`/Title ${pdfString(this.setup.title)}`)
    if (this.setup.author) meta.push(`/Author ${pdfString(this.setup.author)}`)
    if (this.setup.subject) meta.push(`/Subject ${pdfString(this.setup.subject)}`)
    meta.push('/Producer (Good Loop)')
    const infoId = add(`<< ${meta.join(' ')} >>`)

    objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`
    objects[pagesId - 1] =
      `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`

    /* Assemble, tracking the byte offset of every object — the xref table is a
       list of absolute offsets and a wrong one makes the file unopenable. */
    let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
    const offsets: number[] = []
    objects.forEach((body, i) => {
      offsets.push(byteLength(out))
      out += `${i + 1} 0 obj\n${body}\nendobj\n`
    })

    const xrefOffset = byteLength(out)
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`
    out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\n`
    out += `startxref\n${xrefOffset}\n%%EOF\n`

    return latin1Bytes(out)
  }

  blob(): Blob {
    // A fresh ArrayBuffer keeps TypeScript's Blob typing happy across the
    // ArrayBuffer / SharedArrayBuffer split without copying twice.
    const bytes = this.render()
    return new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' })
  }

  /** Hand the finished file to the browser as a download. */
  save(filename: string): void {
    try {
      const url = URL.createObjectURL(this.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`
      a.rel = 'noopener'
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
    } catch {
      /* download blocked — the caller keeps the on-screen version */
    }
  }
}

/** Byte length of a latin1 string — every char is exactly one byte. */
function byteLength(s: string): number {
  return s.length
}

function latin1Bytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i) & 0xff
  return out
}
