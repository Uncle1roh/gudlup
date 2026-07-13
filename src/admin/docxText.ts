/* ============================================================================
   Good Loop — DOCX text extraction (browser-native, no dependencies)
   A .docx is a zip; the body lives in word/document.xml. We read the zip's
   central directory ourselves, inflate document.xml with the browser's
   DecompressionStream, and rebuild plain text:

     • table rows come out as "0:00 | C | 02 | FN-08 | 'Stop. You are safe.'"
       (cells joined with pipes) — exactly the column-faithful shape
       protocolDoc.ts parses best, with none of the PDF layout ambiguity
     • ordinary paragraphs come out as lines

   This makes the ORIGINAL protocol document (.docx) the most reliable import
   format — PDF stays supported, but its text layer varies by exporter.
   ============================================================================ */

const EOCD_SIG = 0x06054b50
const CDIR_SIG = 0x02014b50
const LOCAL_SIG = 0x04034b50

interface ZipEntry { name: string; method: number; compSize: number; localOffset: number }

function readEntries(buf: ArrayBuffer): ZipEntry[] {
  const view = new DataView(buf)
  // find End Of Central Directory (scan back over the optional zip comment)
  let eocd = -1
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 22 - 65535); i--) {
    if (view.getUint32(i, true) === EOCD_SIG) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('Not a valid .docx (zip directory not found).')
  const count = view.getUint16(eocd + 10, true)
  let p = view.getUint32(eocd + 16, true)
  const entries: ZipEntry[] = []
  const dec = new TextDecoder()
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== CDIR_SIG) break
    const method = view.getUint16(p + 10, true)
    const compSize = view.getUint32(p + 20, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const localOffset = view.getUint32(p + 42, true)
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen))
    entries.push({ name, method, compSize, localOffset })
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

async function readEntryText(buf: ArrayBuffer, e: ZipEntry): Promise<string> {
  const view = new DataView(buf)
  if (view.getUint32(e.localOffset, true) !== LOCAL_SIG) throw new Error('Corrupt .docx entry.')
  const nameLen = view.getUint16(e.localOffset + 26, true)
  const extraLen = view.getUint16(e.localOffset + 28, true)
  const start = e.localOffset + 30 + nameLen + extraLen
  const bytes = new Uint8Array(buf, start, e.compSize)
  if (e.method === 0) return new TextDecoder().decode(bytes) // stored
  if (e.method !== 8) throw new Error(`Unsupported .docx compression (method ${e.method}).`)
  const ds = new DecompressionStream('deflate-raw')
  const stream = new Blob([bytes]).stream().pipeThrough(ds)
  return new Response(stream).text()
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
}

/** Text of one XML fragment: w:t contents, tabs/breaks as spaces. */
function fragmentText(xml: string): string {
  const parts: string[] = []
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/?>|<w:br\b[^>]*\/?>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) parts.push(m[1] !== undefined ? decodeEntities(m[1]) : ' ')
  return parts.join('').replace(/\s+/g, ' ').trim()
}

/** document.xml → plain text: table rows piped, paragraphs as lines. */
export function documentXmlToText(xml: string): string {
  const lines: string[] = []
  const block = /<w:tr\b[\s\S]*?<\/w:tr>|<w:p\b[\s\S]*?<\/w:p>|<w:p\/>/g
  let m: RegExpExecArray | null
  while ((m = block.exec(xml))) {
    const chunk = m[0]
    if (chunk.startsWith('<w:tr')) {
      const cells = [...chunk.matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)]
        .map((c) => fragmentText(c[0]))
      const line = cells.join(' | ').trim()
      if (line.replace(/[|\s]/g, '').length) lines.push(line)
    } else {
      const t = fragmentText(chunk)
      if (t) lines.push(t)
    }
  }
  return lines.join('\n')
}

/** Extract the readable text of an uploaded .docx protocol document. */
export async function extractDocxText(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const entries = readEntries(buf)
  const doc = entries.find((e) => e.name === 'word/document.xml')
  if (!doc) throw new Error('No word/document.xml inside this .docx.')
  const xml = await readEntryText(buf, doc)
  return documentXmlToText(xml)
}
