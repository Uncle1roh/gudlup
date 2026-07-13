/* ============================================================================
   Good Loop — Protocol import parser (pure, no React)
   Turns a structured protocol spec into ready-to-publish catalog drafts.

   Two formats, no runtime dependency:
     • CSV / TSV — one protocol per row. The 6-phase structure is fixed
       (FN-02), so a row only needs code + family + title (+ optional blurb,
       durations, and audio hints). Ideal for the clinical team authoring in
       a spreadsheet, and for bulk imports.
     • JSON — a single Protocol object or an array, for full control incl.
       custom phases.

   The original PDF/Excel can be attached alongside as the human source of
   record; parsing reads the structured file.
   ============================================================================ */

import type { ProtocolFamily, Duration, SessionPhase } from '../types/domain'
import type { CatalogProtocol } from '../data/catalog'
import { STANDARD_PHASES } from '../data/protocols'
import { FAMILY_LABEL, type ComposeSettings } from '../compose/types'

const FAMILIES: ProtocolFamily[] = ['GL-ANX', 'GL-DEP', 'GL-BURN', 'GL-STRESS', 'GL-RESIL']
const DURATIONS: Duration[] = [6, 12, 24]

export interface ParsedDraft {
  protocol: CatalogProtocol
  /** Audio hints captured from the spec, used to seed the Composer when rendering. */
  compose: Partial<ComposeSettings>
  /** Non-blocking warnings + blocking errors (see `ok`). */
  issues: string[]
  /** False when a blocking error means the row can't be published. */
  ok: boolean
  sourceRow?: number
}

export interface ParseResult {
  drafts: ParsedDraft[]
  /** Set when the whole file couldn't be read (bad JSON, empty, unknown type). */
  error?: string
}

/* ---- family / duration normalisation ------------------------------------ */
function normalizeFamily(raw: string): ProtocolFamily | null {
  const v = raw.trim()
  const up = v.toUpperCase().replace(/\s+/g, '')
  const byCode = FAMILIES.find((f) => f.replace(/\s+/g, '') === up || f.replace('GL-', '') === up)
  if (byCode) return byCode
  const byLabel = FAMILIES.find((f) => FAMILY_LABEL[f].toLowerCase() === v.toLowerCase())
  return byLabel ?? null
}

function parseDurations(raw: string | undefined): { durations: Duration[]; issues: string[] } {
  const issues: string[] = []
  if (!raw || !raw.trim()) return { durations: [...DURATIONS], issues }
  const parts = raw.split(/[|;,\s]+/).map((s) => s.trim()).filter(Boolean)
  const out: Duration[] = []
  for (const p of parts) {
    const n = Number(p)
    if (DURATIONS.includes(n as Duration)) out.push(n as Duration)
    else issues.push(`ignored duration "${p}" (allowed: 6, 12, 24)`)
  }
  if (out.length === 0) {
    issues.push('no valid durations — defaulted to 6/12/24')
    return { durations: [...DURATIONS], issues }
  }
  return { durations: [...new Set(out)].sort((a, b) => a - b) as Duration[], issues }
}

/* ---- build a draft from normalized fields -------------------------------- */
function buildDraft(
  fields: { code?: string; family?: string; title?: string; blurb?: string; durations?: string; brainwave?: string; soundscape?: string; breathing?: string; affirmation?: string },
  phases: SessionPhase[],
  sourceRow: number | undefined,
): ParsedDraft {
  const issues: string[] = []
  const code = (fields.code ?? '').trim()
  const title = (fields.title ?? '').trim()
  const familyRaw = (fields.family ?? '').trim()

  if (!code) issues.push('ERROR: missing code')
  if (!title) issues.push('ERROR: missing title')
  const family = normalizeFamily(familyRaw)
  if (!family) issues.push(`ERROR: unknown family "${familyRaw}" (use GL-ANX/GL-DEP/GL-BURN/GL-STRESS/GL-RESIL or Anxiety/Depression/Burnout/Stress/Resilience)`)

  const { durations, issues: dIssues } = parseDurations(fields.durations)
  issues.push(...dIssues)

  // phase sanity (fixed 6-phase model; warn if fractions drift)
  const sum = phases.reduce((a, p) => a + p.fraction, 0)
  if (Math.abs(sum - 1) > 0.02) issues.push(`phase fractions sum to ${sum.toFixed(2)} (expected ~1.00)`)

  const compose: Partial<ComposeSettings> = {}
  if (fields.affirmation?.trim()) compose.affirmation = fields.affirmation.trim()
  const wave = (fields.brainwave ?? '').trim().toLowerCase()
  if (wave === 'delta' || wave === 'theta' || wave === 'alpha' || wave === 'smr') compose.brainwave = wave
  else if (wave) issues.push(`ignored brainwave "${fields.brainwave}" (allowed: delta/theta/alpha/smr)`)
  const scape = (fields.soundscape ?? '').trim().toLowerCase()
  if (scape === 'lake' || scape === 'air' || scape === 'deep') compose.soundscape = scape
  else if (scape) issues.push(`ignored soundscape "${fields.soundscape}" (allowed: lake/air/deep)`)

  const protocol: CatalogProtocol = {
    code: code || `IMPORT-${sourceRow ?? 0}`,
    family: family ?? 'GL-ANX',
    title: title || '(untitled)',
    blurb: (fields.blurb ?? '').trim(),
    phases,
    versions: durations.map((d) => ({ duration: d })),
    enabled: true,
    source: 'imported',
    tenants: 'all',
    audioReady: false,
    updatedAt: Date.now(),
  }

  const ok = !issues.some((i) => i.startsWith('ERROR'))
  return { protocol, compose, issues, ok, sourceRow }
}

/* ---- CSV / TSV ----------------------------------------------------------- */
/** Minimal RFC-4180-ish parser: quotes, escaped "" quotes, CRLF, chosen delim. */
function splitDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === delim) {
      row.push(field); field = ''
    } else if (c === '\n') {
      row.push(field); field = ''; rows.push(row); row = []
    } else if (c === '\r') {
      // swallow — handled by the \n branch
    } else field += c
  }
  row.push(field)
  rows.push(row)
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

const HEADER_ALIASES: Record<string, string> = {
  code: 'code', protocol: 'code', 'protocol code': 'code',
  family: 'family', cluster: 'family',
  title: 'title', name: 'title',
  blurb: 'blurb', description: 'blurb', desc: 'blurb',
  durations: 'durations', duration: 'durations', versions: 'durations', lengths: 'durations',
  brainwave: 'brainwave', wave: 'brainwave', binaural: 'brainwave',
  soundscape: 'soundscape', scape: 'soundscape',
  breathing: 'breathing', breath: 'breathing',
  affirmation: 'affirmation', voice: 'affirmation', line: 'affirmation',
}

function parseCsv(text: string, delim: string): ParseResult {
  const grid = splitDelimited(text, delim)
  if (grid.length < 2) return { drafts: [], error: 'The file needs a header row and at least one protocol row.' }
  const header = grid[0].map((h) => HEADER_ALIASES[h.trim().toLowerCase()] ?? h.trim().toLowerCase())
  const idx = (key: string) => header.indexOf(key)
  if (idx('code') === -1 || idx('family') === -1 || idx('title') === -1) {
    return { drafts: [], error: 'CSV needs at least "code", "family" and "title" columns.' }
  }
  const cell = (r: string[], key: string) => { const i = idx(key); return i === -1 ? undefined : r[i] }
  const drafts = grid.slice(1).map((r, n) =>
    buildDraft(
      {
        code: cell(r, 'code'), family: cell(r, 'family'), title: cell(r, 'title'), blurb: cell(r, 'blurb'),
        durations: cell(r, 'durations'), brainwave: cell(r, 'brainwave'), soundscape: cell(r, 'soundscape'),
        breathing: cell(r, 'breathing'), affirmation: cell(r, 'affirmation'),
      },
      STANDARD_PHASES,
      n + 2, // 1-based + header
    ),
  )
  return { drafts }
}

/* ---- JSON ---------------------------------------------------------------- */
function coercePhases(raw: unknown): SessionPhase[] {
  if (!Array.isArray(raw) || raw.length === 0) return STANDARD_PHASES
  const out: SessionPhase[] = []
  raw.forEach((p, i) => {
    const o = p as Record<string, unknown>
    out.push({
      id: (typeof o.id === 'number' ? o.id : i + 1) as SessionPhase['id'],
      name: String(o.name ?? `Phase ${i + 1}`),
      fraction: typeof o.fraction === 'number' ? o.fraction : 1 / raw.length,
      ...(o.showOrb ? { showOrb: true } : {}),
    })
  })
  return out
}

function parseJson(text: string): ParseResult {
  let data: unknown
  try { data = JSON.parse(text) } catch { return { drafts: [], error: 'That JSON did not parse. Check for a trailing comma or missing quote.' } }
  const list = Array.isArray(data) ? data : [data]
  if (list.length === 0) return { drafts: [], error: 'The JSON contained no protocols.' }
  const drafts = list.map((raw, n) => {
    const o = (raw ?? {}) as Record<string, unknown>
    const phases = coercePhases(o.phases)
    const durations = Array.isArray(o.versions)
      ? (o.versions as Array<Record<string, unknown>>).map((v) => v.duration).filter(Boolean).join('|')
      : undefined
    const c = (o.compose ?? {}) as Record<string, unknown>
    return buildDraft(
      {
        code: o.code as string, family: o.family as string, title: o.title as string, blurb: o.blurb as string,
        durations, brainwave: c.brainwave as string, soundscape: c.soundscape as string, affirmation: c.affirmation as string,
      },
      phases,
      n + 1,
    )
  })
  return { drafts }
}

/* ---- dispatch ------------------------------------------------------------ */
export function parseImport(filename: string, text: string): ParseResult {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'json') return parseJson(text)
  if (ext === 'tsv') return parseCsv(text, '\t')
  if (ext === 'csv') return parseCsv(text, ',')
  // Unknown/binary (pdf, xlsx): can't parse structure here.
  return { drafts: [], error: `Can't read a "${ext || 'binary'}" file for structure. Attach it as the source document, and upload a CSV or JSON to import.` }
}

/** True when the file type carries structured data we can parse. */
export function isParseable(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return ext === 'csv' || ext === 'tsv' || ext === 'json'
}

/** A ready-to-fill CSV template for download. */
export function csvTemplate(): string {
  return [
    'code,family,title,blurb,durations,brainwave,soundscape,affirmation',
    'GL-ANX 1.2,GL-ANX,Grounded Calm,"Ease a racing mind and feel your feet on the ground.",6|12|24,theta,lake,"Você está em segurança. Respire fundo e solte."',
    'GL-RESIL 5.2,Resilience,Steady Strength,Return to a calm and resilient baseline.,12|24,smr,deep,"Você é mais forte do que imagina."',
  ].join('\n')
}
