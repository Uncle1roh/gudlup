/* ============================================================================
   Good Loop — PDF text extraction (browser, lazy)
   Extracts plain text from an uploaded PDF using pdf.js. Loaded with dynamic
   import so the (large) pdf.js bundle is fetched only when someone actually
   drops a PDF in the import wizard — the main app bundle is unaffected.

   Reconstruction: pdf.js returns positioned text items; we group items into
   lines by their Y coordinate (per page) and join with spaces, so a table row
   comes out as one line ("0:00 SYS 01 FN-14,11,05 Binaural Alpha 10 Hz …")
   that protocolDoc.ts knows how to read.
   ============================================================================ */

export interface PositionedItem {
  str: string
  transform: number[]
}

/** Group positioned text items into reading-order lines (pure; unit-testable). */
export function linesFromItems(items: PositionedItem[]): string[] {
  const rows = new Map<number, { x: number; str: string }[]>()
  for (const it of items) {
    if (!it.str || !it.transform) continue
    const y = Math.round(it.transform[5])
    const x = it.transform[4]
    let row = rows.get(y)
    // tolerate small baseline jitter (±2 units) by snapping to a neighbour
    if (!row) {
      for (const dy of [-2, -1, 1, 2]) {
        const near = rows.get(y + dy)
        if (near) { row = near; break }
      }
    }
    if (!row) { row = []; rows.set(y, row) }
    row.push({ x, str: it.str })
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0]) // top of page first
    .map(([, its]) => its.sort((a, b) => a.x - b.x).map((i) => i.str).join(' ').replace(/\s{2,}/g, ' ').trim())
    .filter((l) => l.length > 0)
}

/** Extract the full text of a PDF file, page by page, line-reconstructed. */
export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const data = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data }).promise
  const pages: string[] = []
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const content = await page.getTextContent()
      pages.push(linesFromItems(content.items as unknown as PositionedItem[]).join('\n'))
    }
  } finally {
    await doc.destroy()
  }
  return pages.join('\n')
}
