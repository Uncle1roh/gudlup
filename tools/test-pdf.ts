/* Proof that the generated PDFs are real, readable files.

   A PDF writer that produces something Acrobat opens but Preview refuses — or
   that silently drops the last page because one xref offset is wrong — is
   worse than no exporter, because the failure shows up at the recipient. So
   this harness does not check the bytes we wrote; it PARSES them back with
   pdfjs-dist (already a dependency, used elsewhere for protocol imports) and
   reads the text out.

   What it asserts:
     · the file parses, and has the page count we intended
     · the text we wrote is actually extractable — headings, table cells, the
       footer — so wrapping and encoding did not eat it
     · a clinical report that is NOT signed says so
     · a corporate report below k=5 prints "Not enough data" rather than a
       number, and carries the required confidentiality footer on every page
     · characters outside WinAnsi (arrows, ≥, em-dashes) come out as their
       transliteration instead of vanishing

   Run: npx esbuild tools/test-pdf.ts --bundle --platform=node --format=cjs \
          --define:import.meta.env={} --outfile=<tmp>/pdf.cjs && node <tmp>/pdf.cjs */

import { PdfDoc, textWidth, toWinAnsi, wrap, ellipsize } from '../src/lib/pdf'
import { buildSessionReportPdf, buildBatchReportPdf } from '../src/workspace/sessionPdf'
import { buildCorporateReportPdf } from '../src/corporate/reportPdf'
import { demoWorkspace } from '../src/workspace/data'
import { buildAggregates, defaultState } from '../src/corporate/data'

let passed = 0
function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else { passed += 1; console.log(`ok  : ${msg}`) }
}

/* --------------------------------------------------------------- parse --- */

interface Parsed {
  pages: number
  /** All text, page by page. */
  text: string[]
  all: string
  /** Case-insensitive containment. Section labels are rendered uppercased, so
      a case-SENSITIVE absence check would pass for the wrong reason. */
  has: (needle: string) => boolean
}

async function parse(bytes: Uint8Array): Promise<Parsed> {
  // The legacy build is the one that runs under plain Node without a DOM.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({
    data: bytes,
    useSystemFonts: false,
    isEvalSupported: false,
    /* Errors only. This build of pdfjs ships Foxit .pfb rather than the
       Liberation .ttf its legacy loader looks for, so it warns once per font
       while still extracting the text correctly — noise, not a finding. */
    verbosity: 0,
  }).promise
  const text: string[] = []
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    text.push(
      content.items
        .map((it: unknown) => (it as { str?: string }).str ?? '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
  }
  await doc.destroy()
  const all = text.join('\n')
  const lower = all.toLowerCase()
  return { pages: doc.numPages, text, all, has: (n: string) => lower.includes(n.toLowerCase()) }
}

async function main() {
  /* ------------------------------------------------------- primitives --- */
  console.log('\n--- encoding and wrapping ---')

  assert(toWinAnsi('Hello').length === 5, 'plain ASCII survives encoding')
  assert(String.fromCharCode(...toWinAnsi('café')) === 'café', 'Latin-1 accents survive encoding')
  assert(String.fromCharCode(...toWinAnsi('≥5')) === '>=5', '≥ is transliterated rather than dropped')
  assert(String.fromCharCode(...toWinAnsi('a — b')) === 'a - b', 'em dash is transliterated')
  assert(String.fromCharCode(...toWinAnsi('a · b')) === 'a · b', 'the middle dot renders as itself — WinAnsi carries it')
  assert(String.fromCharCode(...toWinAnsi('up ↑')) === 'up ^', 'arrows are transliterated')
  assert(toWinAnsi('🙂').length === 0, 'an emoji is dropped, never rendered as a stray glyph')

  assert(textWidth('iii', 10) < textWidth('MMM', 10), 'widths are per-glyph, not per-character-count')
  assert(textWidth('', 10) === 0, 'empty text has no width')

  const lines = wrap('the quick brown fox jumps over the lazy dog', 80, 10)
  assert(lines.length > 1, 'long text wraps')
  assert(lines.every((l) => textWidth(l, 10) <= 80), 'no wrapped line exceeds the column width')

  const longWord = wrap('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 40, 10)
  assert(longWord.length > 1, 'a word wider than the column is split rather than overflowing')
  assert(longWord.every((l) => textWidth(l, 10) <= 40), 'each split chunk fits the column')

  assert(ellipsize('short', 200, 10) === 'short', 'text that fits is not ellipsized')
  assert(ellipsize('a very long cell value indeed', 40, 10).endsWith('...'), 'an over-long cell is ellipsized')

  /* ---------------------------------------------------- a basic document -- */
  console.log('\n--- a generated document parses ---')

  const basic = new PdfDoc({ title: 'Harness', footer: 'FOOTER-MARK' })
  basic.heading('HEADING-MARK')
  basic.paragraph('PARAGRAPH-MARK with some ordinary sentence text in it.')
  basic.keyValue('LABEL-MARK', 'VALUE-MARK')
  basic.table(
    [{ header: 'COLA', width: 1 }, { header: 'COLB', width: 1 }],
    [['CELL-ONE', 'CELL-TWO'], ['CELL-THREE', 'CELL-FOUR']],
  )
  basic.note('NOTE-MARK stays visible.')
  const basicParsed = await parse(basic.render())

  assert(basicParsed.pages === 1, 'a short document is one page')
  for (const mark of ['HEADING-MARK', 'PARAGRAPH-MARK', 'LABEL-MARK', 'VALUE-MARK', 'CELL-ONE', 'CELL-FOUR', 'NOTE-MARK', 'FOOTER-MARK']) {
    assert(basicParsed.all.includes(mark), `"${mark}" is extractable from the parsed file`)
  }
  assert(basicParsed.all.includes('COLA'), 'a table header is written')

  /* ------------------------------------------------------- pagination ---- */
  console.log('\n--- pagination ---')

  const long = new PdfDoc({ footer: 'PAGED' })
  for (let i = 0; i < 120; i += 1) long.keyValue(`Row ${i}`, `Value ${i}`)
  const longParsed = await parse(long.render())
  assert(longParsed.pages > 1, 'a long document breaks onto more pages')
  assert(longParsed.all.includes('Row 0'), 'the first row survives pagination')
  assert(longParsed.all.includes('Row 119'), 'the LAST row survives pagination — the xref offsets are right')
  assert(
    longParsed.text.every((t) => t.includes('PAGED')),
    'the footer is on every page, not just the first',
  )
  assert(longParsed.text[0].includes(`1 / ${longParsed.pages}`) || longParsed.text[0].includes('1 /'), 'the footer numbers the page')

  const repeated = new PdfDoc()
  repeated.table(
    [{ header: 'REPEATHDR', width: 1 }, { header: 'Value', width: 1 }],
    Array.from({ length: 90 }, (_, i) => [`item ${i}`, `${i}`]),
  )
  const repeatedParsed = await parse(repeated.render())
  assert(repeatedParsed.pages > 1, 'a long table spans pages')
  assert(
    repeatedParsed.text.every((t) => t.includes('REPEATHDR')),
    'the table header repeats on every page it continues onto',
  )

  /* --------------------------------------------------- session reports --- */
  console.log('\n--- therapist session report ---')

  const ws = demoWorkspace()
  const maria = ws.patients[0]
  const signed = maria.sessions.find((s) => s.signedAt)!
  const glSession = maria.sessions.find((s) => s.kind === 'gl-video')!
  const videoOnly = maria.sessions.find((s) => s.kind === 'video')!

  const one = await parse(buildSessionReportPdf({ patient: maria, account: ws.account, rows: [signed] }).render())
  assert(one.all.includes(maria.name), 'the report names the patient')
  assert(one.all.includes(ws.account.fullName), 'the report carries the signing professional')
  assert(one.all.includes(ws.account.licenceNumber.replace('CRP ', '')), 'the report carries the licence number')
  assert(one.has('Confidential clinical record'), 'the confidentiality footer is present')
  assert(!one.all.includes('DRAFT'), 'a signed report is not marked draft')

  const glParsed = await parse(buildSessionReportPdf({ patient: maria, account: ws.account, rows: [glSession] }).render())
  assert(glParsed.has('Phases completed'), 'a GL session reports its phases')
  assert(glParsed.all.includes(glSession.protocolCode ?? ''), 'a GL session names its protocol')

  const voParsed = await parse(buildSessionReportPdf({ patient: maria, account: ws.account, rows: [videoOnly] }).render())
  assert(!voParsed.has('Phases completed'), 'a video-only session omits the treatment rows entirely')
  assert(voParsed.has('Good Loop treatment'), 'a video-only session still states there was no treatment')

  const draftRow = { ...signed, signedAt: undefined, signatureVersion: 0 }
  const draftParsed = await parse(buildSessionReportPdf({ patient: maria, account: ws.account, rows: [draftRow] }).render())
  assert(draftParsed.all.includes('DRAFT'), 'an UNSIGNED report is watermarked as a draft')
  assert(draftParsed.all.includes('Not signed'), 'an unsigned report says so in the signature block')

  const noVas = { ...signed, vasPre: undefined, vasPost: undefined }
  const noVasParsed = await parse(buildSessionReportPdf({ patient: maria, account: ws.account, rows: [noVas] }).render())
  assert(noVasParsed.has('Not recorded'), 'a missing VAS is stated, not silently omitted')

  const batch = await parse(
    buildBatchReportPdf(ws.account, ws.patients.filter((p) => p.sessions.length).map((p) => ({ patient: p, rows: p.sessions }))).render(),
  )
  assert(batch.pages > 1, 'a batch export is multi-page')
  assert(batch.text[0].includes('Session reports'), 'the batch has a cover page')
  assert(batch.text[0].toLowerCase().includes('contents'), 'the cover lists what the file contains')
  assert(batch.all.includes('Maria Santos'), 'the batch contains its first patient')
  assert(
    batch.text.every((t) => t.includes('Confidential clinical records')),
    'every page of a batch carries the confidentiality footer',
  )

  /* ------------------------------------------------- corporate reports --- */
  console.log('\n--- corporate aggregate report ---')

  const corp = { ...defaultState(), setupDoneAt: Date.now() }
  const ALL_SECTIONS = [
    'Adoption overview', 'Engagement metrics', 'WHO-5 aggregate trend',
    'GL-Check dimensions', 'Mood overview', 'Benchmarking (if available)',
    'Professional support utilization',
  ]

  const big = await parse(
    buildCorporateReportPdf({
      state: corp,
      agg: buildAggregates(corp, 189),
      name: 'August 2026 — Monthly Report',
      periodFrom: Date.UTC(2026, 7, 1),
      periodTo: Date.UTC(2026, 7, 31),
      sections: ALL_SECTIONS,
    }).render(),
  )

  assert(big.all.includes(corp.profile.name), 'the report names the company')
  assert(
    big.text.every((t) => t.includes('Confidential') && t.includes('Good Loop Aggregate Wellbeing Report')),
    'the required confidentiality footer is on EVERY page',
  )
  assert(big.has('Adoption'), 'the adoption section is present')
  assert(big.has('WHO-5'), 'the WHO-5 section is present')
  assert(big.has('does not constitute a clinical assessment'), 'the WHO-5 interpretation note travels with the export')
  assert(big.has('Benchmarking'), 'the benchmarking section is present')
  assert(big.has('employees currently using professional support'), 'the professional-support integer is present')

  // The vocabulary rule holds on paper too.
  for (const term of ['at risk', 'diagnosis', 'pathological', 'red flag', 'alarming']) {
    assert(!big.all.toLowerCase().includes(term), `the export never says "${term}"`)
  }

  const small = await parse(
    buildCorporateReportPdf({
      state: corp,
      agg: buildAggregates(corp, 2),
      name: 'August 2026 — Monthly Report',
      periodFrom: Date.UTC(2026, 7, 1),
      periodTo: Date.UTC(2026, 7, 31),
      sections: ALL_SECTIONS,
    }).render(),
  )
  assert(small.has('Not enough data'), 'a below-threshold export SAYS "Not enough data"')
  assert(small.has('WHO-5'), 'the suppressed section is still present rather than omitted')
  assert(!/Company average\s+6[0-9]/.test(small.all), 'no WHO-5 average is printed below the threshold')

  const selfUseOnly = { ...corp, conventionType: 'self-use' as const }
  const noTherapy = await parse(
    buildCorporateReportPdf({
      state: selfUseOnly,
      agg: buildAggregates(selfUseOnly, 189),
      name: 'August 2026 — Monthly Report',
      periodFrom: Date.UTC(2026, 7, 1),
      periodTo: Date.UTC(2026, 7, 31),
      sections: ALL_SECTIONS,
    }).render(),
  )
  assert(
    !noTherapy.has('Professional support'),
    'a Self-Use-only convention has no professional-support section at all',
  )

  const partial = await parse(
    buildCorporateReportPdf({
      state: corp,
      agg: buildAggregates(corp, 189),
      name: 'Custom',
      periodFrom: Date.UTC(2026, 7, 1),
      periodTo: Date.UTC(2026, 7, 31),
      sections: ['Adoption overview'],
    }).render(),
  )
  assert(partial.has('Adoption'), 'a partial export includes the section that was chosen')
  assert(!partial.has('GL-Check dimensions'), 'a partial export omits sections that were not chosen')

  console.log(`\n${passed} assertions passed.`)
}

void main().catch((e) => {
  console.error('FAIL: harness threw —', e)
  process.exitCode = 1
})
