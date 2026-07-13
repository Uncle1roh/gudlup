/* ============================================================================
   Good Loop — Protocol-document parser (pure, no React, no DOM)
   Parses a "Document 3 — Protocol for Developers" spec (the GL-ANX 1.1 format:
   invariant-parameter table, per-version timelines with Time|Ch|PAT|FN|Event
   rows, affirmation-loop lines, and the CSI affirmations database) into a
   structured ProtocolSpec — the audio configuration the renderer executes.

   Input is plain TEXT. It tolerates two shapes of the same document:
     • pipe-delimited tables (markdown/word export: "| 0:00 | SYS | 01 | … |")
     • line-based rows as extracted from a PDF ("0:00 SYS 01 FN-14,11,05 …")
   so the same parser serves .pdf (via pdfText.ts), .txt and .md uploads.

   Everything here is best-effort with explicit `issues` — a row the parser
   can't read becomes a warning, never a crash.
   ============================================================================ */

import type { Duration, ProtocolFamily, SessionPhase } from '../types/domain'

/* ------------------------------------------------------------------ types */

export interface SpecBinaural {
  band?: string // Alpha / Theta / …
  beatHz: number
  carrierHz: number
}

export interface SpecInvariants {
  binauralPrimary?: SpecBinaural
  binauralSecondary?: SpecBinaural
  breathingPattern?: string
  breathsPerMin?: number
  soundscape?: string
  musicBpm?: number
  dichoticIntervalSec?: number
  voicePrimary?: string
  voiceSecondary?: string
  binauralFadeInSec?: number
  binauralFadeOutSec?: number
}

export type SpecChannel = 'C' | 'L' | 'R' | 'L/R' | 'SYS' | ''

export interface SpecVoiceLine {
  /** Where the line sits in the stereo field. */
  channel: 'C' | 'L' | 'R'
  text: string
  whisper: boolean
}

export interface SpecEvent {
  timeSec: number
  channel: SpecChannel
  pattern?: string // PAT number as written, e.g. "02" or "04→06"
  /** Raw event text (kept for the review UI + renderer heuristics). */
  raw: string
  /** Spoken lines extracted from the quoted spans, with panning. */
  voice: SpecVoiceLine[]
}

/** "N affirmations CSI-a to CSI-b, interval I s, K cycles" inside a phase. */
export interface SpecLoop {
  fromCsi: number
  toCsi: number
  intervalSec: number
  cycles: number
}

export interface SpecPhase {
  id: number
  name: string
  startSec: number
  endSec: number
  loop?: SpecLoop
}

export interface SpecVersion {
  duration: Duration
  label: string // Quick / Standard / Deep (as written)
  phases: SpecPhase[]
  events: SpecEvent[]
}

export interface SpecAffirmation {
  id: string // CSI-01
  text: string
  keywords: string
  durationSec?: number
}

export interface ProtocolSpec {
  code: string
  family: ProtocolFamily
  title: string
  invariants: SpecInvariants
  versions: SpecVersion[]
  affirmations: SpecAffirmation[]
  issues: string[]
}

export interface SpecParseResult {
  spec?: ProtocolSpec
  error?: string
}

/* ------------------------------------------------------- normalization */

const FAMILIES: ProtocolFamily[] = ['GL-ANX', 'GL-DEP', 'GL-BURN', 'GL-STRESS', 'GL-RESIL']

/** Unify unicode variants so one set of regexes covers docx, md and PDF text. */
function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\*\*/g, '')
    .replace(/[\u2212\u2013\u2014]/g, '-') // − – — → -
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/\u2026/g, '…') // keep ellipsis (used in keywords) as-is
}

function toSec(t: string): number {
  const m = /(\d{1,2}):(\d{2})/.exec(t)
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0
}

/** Quoted spans: ‘…’ or '…' (typographic first — the docs use U+2018/2019). */
function quotedSpans(s: string): string[] {
  const out: string[] = []
  const re = /[\u2018']([^\u2019']{2,})[\u2019']/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) out.push(m[1].trim())
  return out
}

/** Does this text look like the protocol-document format at all? */
export function looksLikeProtocolDoc(text: string): boolean {
  const t = normalize(text)
  return /\bGL-[A-Z]+\s?\d+\.\d+\b/.test(t) && /TIMELINE|PHASE\s*\d+\s*:/i.test(t)
}

/* ------------------------------------------------------------- parsing */

interface Row { cols: string[]; raw: string }

/** Split a table row into columns: by pipes when present, else positional regex. */
function splitEventRow(line: string): Row | null {
  const raw = line.trim()
  if (!raw) return null
  if (raw.includes('|')) {
    const cols = raw.split('|').map((c) => c.trim())
    // drop leading/trailing empties produced by "| a | b |"
    while (cols.length && cols[0] === '') cols.shift()
    while (cols.length && cols[cols.length - 1] === '') cols.pop()
    if (!cols.length || !/^\d{1,2}:\d{2}/.test(cols[0])) return null
    return { cols, raw }
  }
  // PDF-extracted shape: "0:00 SYS 01 FN-14,11,05 Binaural Alpha 10 Hz …"
  const m = /^(\d{1,2}:\d{2}(?:\s*-\s*\d{1,2}:\d{2})?)\s+(SYS|L\/R|[CLR])?\s*(\d{1,2}(?:\s*(?:->|→)\s*\d{1,2})?(?:\s*lv\d)?)?\s*((?:FN-[\d,\s]+)*)\s*(.*)$/.exec(raw)
  if (!m) return null
  return { cols: [m[1], m[2] ?? '', m[3] ?? '', (m[4] ?? '').trim(), m[5] ?? ''], raw }
}

function parseChannel(c: string): SpecChannel {
  const v = c.trim().toUpperCase()
  if (v === 'SYS' || v === 'C' || v === 'L' || v === 'R') return v
  if (v === 'L/R' || v === 'LR' || v === 'L-R') return 'L/R'
  return ''
}

function extractVoice(channel: SpecChannel, raw: string): SpecVoiceLine[] {
  const voice: SpecVoiceLine[] = []
  if (channel === 'SYS' || !raw || /^\[/.test(raw)) return voice
  if (channel === 'L/R' && raw.includes('\u2502')) {
    // dual-voice row: "L …: ‘…’ │ R …: ‘…’"
    const [lPart, rPart] = raw.split('\u2502')
    for (const q of quotedSpans(lPart ?? '')) voice.push({ channel: 'L', text: q, whisper: /\(whisper\)/i.test(lPart ?? '') })
    for (const q of quotedSpans(rPart ?? '')) voice.push({ channel: 'R', text: q.replace(/^\(whisper\)\s*/i, ''), whisper: /\(whisper\)/i.test(rPart ?? '') })
  } else {
    const vc: 'C' | 'L' | 'R' = channel === 'L' || channel === 'R' ? channel : 'C'
    for (const q of quotedSpans(raw)) voice.push({ channel: vc, text: q, whisper: /\(whisper\)/i.test(raw) })
  }
  return voice
}

function parseEvent(row: Row): SpecEvent {
  const [time, ch = '', pat = '', , ...rest] = row.cols
  // event text is the last column; with the 5-column layout it's cols[4]
  const raw = (row.cols.length >= 5 ? row.cols.slice(4).join(' | ') : rest.join(' ')).trim()
  const channel = parseChannel(ch)
  return { timeSec: toSec(time), channel, pattern: pat || undefined, raw, voice: extractVoice(channel, raw) }
}

/** Lines that must never be merged into a wrapped event row: the loop tables
    (their quotes are already scheduled by the loop), pattern annotations, etc. */
function isNonContinuation(l: string): boolean {
  return /\[CSI-\d+\]/.test(l)
    || /^\|?\s*\d+\s*\|?\s+[LR]\b/.test(l)
    || /^\*?Active patterns/i.test(l)
    || /^(TRIPLE|Two parallel|Bilateral tone|Continuous whisper|PAT-)/i.test(l)
    || /^#|^Time\b|^\|?\s*Time\s*\|/i.test(l)
}

function parseLoop(line: string): SpecLoop | null {
  const m = /(\d+)\s+affirmations?\s+CSI-?0*(\d+)\s+to\s+(?:CSI-?)?0*(\d+)\s*,\s*interval\s+(\d+)\s*s/i.exec(line)
  if (!m) return null
  const cyc = /(\d+)\s*(?:cycles?|pass)/i.exec(line)
  return { fromCsi: Number(m[2]), toCsi: Number(m[3]), intervalSec: Number(m[4]), cycles: cyc ? Number(cyc[1]) : 1 }
}

function parseAffirmation(line: string): SpecAffirmation | null {
  const t = line.trim()
  if (!/^\|?\s*CSI-\d+/.test(t)) return null
  if (t.includes('|')) {
    const cols = t.split('|').map((c) => c.trim()).filter((c) => c !== '')
    if (cols.length < 2) return null
    const dur = cols[3] ? /(\d+(?:\.\d+)?)/.exec(cols[3]) : null
    return { id: cols[0], text: cols[1] ?? '', keywords: cols[2] ?? '', durationSec: dur ? Number(dur[1]) : undefined }
  }
  // PDF shape: "CSI-01 I am safe. I am protected. All is well. safe… protected… 3.5 s"
  const m = /^(CSI-\d+)\s+(.+[.!?])\s+(.+?…)\s+(\d+(?:\.\d+)?)\s*s?$/.exec(t)
  if (m) return { id: m[1], text: m[2], keywords: m[3], durationSec: Number(m[4]) }
  const loose = /^(CSI-\d+)\s+(.+)$/.exec(t)
  return loose ? { id: loose[1], text: loose[2], keywords: '' } : null
}

function parseInvariants(lines: string[], issues: string[]): SpecInvariants {
  const inv: SpecInvariants = {}
  const grab = (re: RegExp): RegExpExecArray | null => {
    for (const l of lines) { const m = re.exec(l); if (m) return m }
    return null
  }
  const bin = (label: string): SpecBinaural | undefined => {
    // find the labelled line first, then read the band/beat/carriers from it —
    // running one greedy regex over the whole line mis-splits digits in the
    // pipe-less (PDF-extracted) shape.
    const line = lines.find((l) => new RegExp(label, 'i').test(l))
    if (!line) return undefined
    const m = /(Alpha|Theta|Delta|Beta|SMR|Gamma)?\s*\b(\d+(?:\.\d+)?)\s*Hz\b[^\n]*?carrier\s*(\d+)\s*\/\s*(\d+)/i.exec(line)
    if (!m) return undefined
    const carrier = Number(m[3])
    const beat = Number(m[2])
    const derived = Number(m[4]) - carrier
    if (derived > 0 && Math.abs(derived - beat) > 0.51) issues.push(`${label}: beat ${beat} Hz disagrees with carriers ${m[3]}/${m[4]} — using ${beat} Hz.`)
    return { band: m[1], beatHz: beat, carrierHz: carrier }
  }
  inv.binauralPrimary = bin('Primary binaural')
  inv.binauralSecondary = bin('Secondary binaural')
  const br = grab(/Breathing pattern\s*\|?\s*([^|(]+?)\s*\((\d+)\s*breaths/i)
  if (br) { inv.breathingPattern = br[1].trim(); inv.breathsPerMin = Number(br[2]) }
  const stripFn = (v: string) => v.replace(/\s*FN-[\d]+(?:\s*[,+]\s*FN-[\d]+)*\s*$/i, '').trim()
  const sc = grab(/^\s*\|?\s*Soundscape\s*\|?\s*([^|]+)/im)
  if (sc) inv.soundscape = stripFn(sc[1])
  const bpm = grab(/Music BPM\s*\|?\s*(\d+)/i)
  if (bpm) inv.musicBpm = Number(bpm[1])
  const di = grab(/Dichotic interval\s*\|?\s*(\d+)/i)
  if (di) inv.dichoticIntervalSec = Number(di[1])
  const fi = grab(/Binaural fade-?in\s*\|?\s*(\d+)/i)
  if (fi) inv.binauralFadeInSec = Number(fi[1])
  const fo = grab(/Binaural fade-?out\s*\|?\s*(\d+)/i)
  if (fo) inv.binauralFadeOutSec = Number(fo[1])
  const vp = grab(/Primary voice\s*\|?\s*([^|]+)/i)
  if (vp) inv.voicePrimary = stripFn(vp[1])
  const vs = grab(/Secondary voice\s*\|?\s*([^|]+)/i)
  if (vs) inv.voiceSecondary = stripFn(vs[1])
  return inv
}

const VALID_DURATIONS: Duration[] = [6, 12, 24]

/** Parse the full document. Returns an error only when nothing usable exists. */
export function parseProtocolDoc(text: string): SpecParseResult {
  const t = normalize(text)
  const issues: string[] = []
  const lines = t.split('\n')

  const codeM = /\bGL-([A-Z]+)\s?(\d+\.\d+)\b/.exec(t)
  if (!codeM) return { error: 'No protocol code (like "GL-ANX 1.1") found — this doesn\'t look like a protocol document.' }
  const code = `GL-${codeM[1]} ${codeM[2]}`
  const famGuess = `GL-${codeM[1]}` as ProtocolFamily
  const family: ProtocolFamily = FAMILIES.includes(famGuess) ? famGuess : 'GL-ANX'
  if (!FAMILIES.includes(famGuess)) issues.push(`Unknown family "${famGuess}" — filed under GL-ANX; adjust in the catalog if needed.`)

  // Title: first non-empty line after the code line that isn't boilerplate.
  let title = ''
  const codeLineIdx = lines.findIndex((l) => l.includes(codeM[0]))
  for (let i = codeLineIdx + 1; i < Math.min(lines.length, codeLineIdx + 8); i++) {
    const l = lines[i].trim()
    if (!l) continue
    if (/^(Document|Versions?|References?|Patent)\b/i.test(l)) continue
    title = l
    break
  }
  if (!title) { title = code; issues.push('No title line found — using the code as the title.') }

  const invariants = parseInvariants(lines, issues)

  // Walk the document: version sections → phases → event rows / loops / CSI db.
  const versions: SpecVersion[] = []
  const affirmations: SpecAffirmation[] = []
  let cur: SpecVersion | null = null
  let curPhase: SpecPhase | null = null
  let lastEvent: SpecEvent | null = null
  let inAffDb = false

  for (const line of lines) {
    const l = line.trim()
    if (!l) continue

    const vm = /TIMELINE\s*-+\s*(\d+)\s*MIN/i.exec(l)
    if (vm) {
      const d = Number(vm[1])
      const lbl = /\(([^)]+)\)/.exec(l)?.[1] ?? ''
      if (!VALID_DURATIONS.includes(d as Duration)) {
        issues.push(`Timeline for ${d} min ignored — supported versions are 6/12/24 min.`)
        cur = null
      } else {
        cur = { duration: d as Duration, label: lbl, phases: [], events: [] }
        versions.push(cur)
      }
      curPhase = null
      inAffDb = false
      continue
    }

    if (/AFFIRMATIONS DATABASE/i.test(l)) { inAffDb = true; cur = null; curPhase = null; continue }
    if (/^\d+\.\s*AUDIO MAP/i.test(l) || /^7\./.test(l)) inAffDb = false

    if (inAffDb) {
      const a = parseAffirmation(l)
      if (a) affirmations.push(a)
      continue
    }

    const pm = /PHASE\s*(\d+)\s*:\s*([^()]+?)\s*\(\s*(\d{1,2}:\d{2})\s*-+\s*(\d{1,2}:\d{2})\s*\)/i.exec(l)
    if (pm && cur) {
      curPhase = { id: Number(pm[1]), name: pm[2].trim(), startSec: toSec(pm[3]), endSec: toSec(pm[4]) }
      cur.phases.push(curPhase)
      lastEvent = null
      continue
    }

    if (cur && curPhase) {
      const loop = parseLoop(l)
      if (loop) { curPhase.loop = loop; lastEvent = null; continue }
      const row = splitEventRow(l)
      if (row) {
        const ev = parseEvent(row)
        cur.events.push(ev)
        lastEvent = ev
        continue
      }
      // a loop line wrapped mid-way in the PDF: "… fade-out" / "2 s, 2 cycles."
      const cyc = curPhase.loop && /(\d+)\s*(?:cycles?|pass)/i.exec(l)
      if (cyc && curPhase.loop) { curPhase.loop.cycles = Number(cyc[1]); continue }
      // continuation of a wrapped event row (PDF extraction splits long rows)
      if (lastEvent && !isNonContinuation(l)) {
        lastEvent.raw = `${lastEvent.raw} ${l}`.trim()
        lastEvent.voice = extractVoice(lastEvent.channel, lastEvent.raw)
        continue
      }
      lastEvent = null
    }
  }

  if (!versions.length) return { error: `Found protocol ${code} but no timeline sections — nothing to import.` }
  for (const v of versions) {
    if (!v.phases.length) issues.push(`${v.duration}-min version has no phases parsed.`)
    const expected = v.duration * 60
    const last = v.phases[v.phases.length - 1]
    if (last && Math.abs(last.endSec - expected) > 60) issues.push(`${v.duration}-min version: last phase ends at ${Math.round(last.endSec / 60)} min — check the timeline.`)
  }
  if (!affirmations.length) issues.push('No CSI affirmations database found — affirmation loops will be silent unless texts are added.')

  return { spec: { code, family, title, invariants, versions, affirmations, issues } }
}

/* -------------------------------------------------- domain derivations */

/** Derive the domain SessionPhase[] (names + fractions) from the richest version. */
export function phasesFromSpec(spec: ProtocolSpec): SessionPhase[] {
  const v = [...spec.versions].sort((a, b) => b.phases.length - a.phases.length)[0]
  if (!v || !v.phases.length) return []
  const total = v.phases[v.phases.length - 1].endSec - v.phases[0].startSec || 1
  return v.phases.slice(0, 6).map((p, i) => ({
    id: (Math.min(6, Math.max(1, p.id || i + 1)) as SessionPhase['id']),
    name: p.name,
    fraction: Math.max(0.02, (p.endSec - p.startSec) / total),
    showOrb: /breath/i.test(p.name) || undefined,
  }))
}

/** All spoken lines of a version, in order (voice events + loop affirmations). */
export function voiceLinesForVersion(spec: ProtocolSpec, duration: Duration): { timeSec: number; line: SpecVoiceLine }[] {
  const v = spec.versions.find((x) => x.duration === duration)
  if (!v) return []
  const out: { timeSec: number; line: SpecVoiceLine }[] = []
  for (const e of v.events) for (const line of e.voice) out.push({ timeSec: e.timeSec, line })
  const byId = new Map(spec.affirmations.map((a) => [Number(a.id.replace(/\D/g, '')), a]))
  for (const p of v.phases) {
    if (!p.loop) continue
    const count = p.loop.toCsi - p.loop.fromCsi + 1
    for (let c = 0; c < p.loop.cycles; c++) {
      for (let i = 0; i < count; i++) {
        const t = p.startSec + (c * count + i) * p.loop.intervalSec
        if (t >= p.endSec) break
        const a = byId.get(p.loop.fromCsi + i)
        if (a) out.push({ timeSec: t, line: { channel: 'C', text: a.text, whisper: false } })
      }
    }
  }
  return out.sort((a, b) => a.timeSec - b.timeSec)
}
