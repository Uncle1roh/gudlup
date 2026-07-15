/* ============================================================================
   Good Loop — Protocol Datasheet parser (.xlsx, GL-ANX 1.3 workbook format)
   The datasheet workbook is the canonical DATABASE of a protocol's audio
   configuration — successor to the prose "Protocol for Developers" document.
   Sheets: Protocollo · Invarianti · Versioni · Fasi · Timeline_6min/_12min/
   _24min · Affermazioni · MappaMusicale · BraniRiferimento · Asset ·
   LayerEngine. This module parses the workbook into a structured Datasheet,
   validates it (explicit `issues`, hard `error` only when nothing usable
   exists), and can derive a legacy ProtocolSpec so every existing surface
   (clinician wizard, Studio seeding, phase strips) keeps working unchanged.

   Timelines still marked "DA COMPILARE" import fine — the version is kept
   (phases + params) but flagged timeline-pending, and Renderer v3 refuses to
   render it until the rows exist.
   ============================================================================ */

import type { WorkBook, WorkSheet } from 'xlsx'
import type { Duration, ProtocolFamily } from '../types/domain'
import { echoKeywords, type ProtocolSpec, type SpecAffirmation, type SpecEvent, type SpecVersion, type SpecVoiceLine } from './protocolDoc'

/* SheetJS is ~400 KB minified — loaded on demand the first time a workbook is
   actually parsed, so it never weighs on the app's main bundle. */
type XlsxModule = typeof import('xlsx')
let xlsx: XlsxModule | null = null
async function loadXlsx(): Promise<XlsxModule> {
  if (!xlsx) xlsx = await import('xlsx')
  return xlsx
}

/* ------------------------------------------------------------------ types */

export type PhaseNo = 1 | 2 | 3 | 4 | 5 | 6

export interface DsBinaural {
  beatHz: number
  carrierLowHz: number
  carrierHighHz: number
  fadeInSec: number
  fadeOutSec: number
  /** 24-min Deep: transition to Theta in one phase only ("Theta 6 Hz solo F4"). */
  theta?: { beatHz: number; phase: PhaseNo }
}

export interface DsVersionParams {
  duration: Duration
  label: string // Quick / Standard / Deep
  purpose?: string
  loopIntervalSec: number
  affFadeInSec: number
  affFadeOutSec: number
  /** REC ids in this version's sub-set, e.g. ['REC-01','REC-02',…]. */
  recSubset: string[]
  stacking: 'none' | 'echo' | 'triple'
  bilateral?: { toneHz: number; everySec: number; blipMs: number }
  heartbeat?: { gainDb: number; fromPhase: PhaseNo; toPhase: PhaseNo }
  continuousWhisper?: { gainDb: number; phase: PhaseNo }
  dichotic?: { intervalSec: number; alternations: number; gainDb?: number; doubleInduction: boolean }
  bowlRaw?: string
  binaural: DsBinaural
}

export interface DsPhase {
  duration: Duration
  id: PhaseNo
  name: string
  startSec: number
  endSec: number
  notes: string
}

export type DsRowKind = 'VOCE' | 'LOOP' | 'ECO' | 'SUSSURRO' | 'SYS' | 'BOWL' | 'TRANS' | 'BILATERALE' | string

export interface DsTimelineRow {
  timeSec: number
  phase: PhaseNo
  channel: 'C' | 'L' | 'R' | 'SYS' | ''
  voice: 'F' | 'M' | ''
  kind: DsRowKind
  gainDb?: number
  delaySec?: number
  cycle?: number
  rec?: string
  text: string
}

export interface DsAffirmation {
  id: string // REC-01
  text: string
  construct: string
  durationSec?: number
  inVersion: Record<Duration, boolean>
  echoKeywords: string
}

export interface DsMusicPhase {
  phase: PhaseNo
  name: string
  /** Key progression within the phase, e.g. ['Am','Em']. */
  keys: string[]
  bpm: number
  arrangement: Partial<Record<Duration, string>>
  soundscape: string
}

export interface DsLayer {
  id: number
  description: string
  state: Partial<Record<Duration, string>>
  params: string
}

export interface DsAssetRow {
  file: string
  kind: string
  phases: string
  versions: string
  key?: string
  bpm?: number
  gainTrimDb?: number
  loop?: boolean
  storagePath?: string
  source?: string
  notes?: string
}

export interface Datasheet {
  code: string
  family: ProtocolFamily
  title: string
  titlePt?: string
  docVersion?: string
  refrain?: string
  anchor?: string
  /** Raw parameter → value rows of the Invarianti sheet (display + audit). */
  invariants: { param: string; value: string; rationale: string }[]
  versions: DsVersionParams[]
  phases: DsPhase[]
  /** Timeline rows per duration. A missing key = timeline not yet compiled. */
  timelines: Partial<Record<Duration, DsTimelineRow[]>>
  affirmations: DsAffirmation[]
  musicMap: DsMusicPhase[]
  layers: DsLayer[]
  assetRows: DsAssetRow[]
  issues: string[]
}

export interface DatasheetParseResult {
  datasheet?: Datasheet
  error?: string
}

/* ------------------------------------------------------------- helpers */

const FAMILIES: ProtocolFamily[] = ['GL-ANX', 'GL-DEP', 'GL-BURN', 'GL-STRESS', 'GL-RESIL']
const DURATIONS: Duration[] = [6, 12, 24]

/** Unify unicode so one regex set covers the workbook's typography. */
function norm(v: unknown): string {
  if (v == null) return ''
  return String(v)
    .replace(/[\u2212\u2013\u2014]/g, '-') // − – — → -
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .trim()
}

/** "m:ss" / "h:mm:ss" strings, Excel time fractions, or Date cells → seconds. */
function toSec(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Math.round(v * 86400) // Excel time fraction
  if (v instanceof Date) return v.getHours() * 3600 + v.getMinutes() * 60 + v.getSeconds()
  const s = norm(v)
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s)
  if (!m) return null
  return m[3] != null
    ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
    : Number(m[1]) * 60 + Number(m[2])
}

function num(v: unknown): number | undefined {
  if (v == null || v === '') return undefined
  const n = Number(norm(v).replace(',', '.').replace(/[^\d.+-]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

/** First number in a fragment, e.g. "12 s" → 12, "fade 8 s" → 8. */
function firstNum(s: string): number | undefined {
  const m = /(-?\d+(?:[.,]\d+)?)/.exec(s)
  return m ? Number(m[1].replace(',', '.')) : undefined
}

/** "−24 dB" (negative-signed) inside a fragment. */
function dbFrom(s: string): number | undefined {
  const m = /(-?\d+(?:[.,]\d+)?)\s*dB/i.exec(norm(s))
  return m ? Number(m[1].replace(',', '.')) : undefined
}

function rows(ws: WorkSheet | undefined): unknown[][] {
  if (!ws || !xlsx) return []
  return xlsx.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null })
}

function cell(r: unknown[], i: number): string {
  return norm(r[i])
}

const isX = (v: unknown) => /^x$/i.test(norm(v))

/** "{01,02,04}" / "{01..20}" → ['REC-01','REC-02',…]. */
function parseRecSubset(s: string): string[] {
  const inner = /\{([^}]*)\}/.exec(s)?.[1] ?? s
  const range = /0*(\d+)\s*\.\.\s*0*(\d+)/.exec(inner)
  const ids: number[] = []
  if (range) {
    for (let i = Number(range[1]); i <= Number(range[2]); i++) ids.push(i)
  } else {
    for (const m of inner.matchAll(/\d+/g)) ids.push(Number(m[0]))
  }
  return ids.map((n) => `REC-${String(n).padStart(2, '0')}`)
}

const clampPhase = (n: number): PhaseNo => Math.min(6, Math.max(1, Math.round(n))) as PhaseNo

/* ------------------------------------------------------------- parsing */

function parseProtocollo(wb: WorkBook, ds: Partial<Datasheet>, issues: string[]): void {
  const kv = new Map<string, string>()
  for (const r of rows(wb.Sheets['Protocollo']).slice(1)) {
    const k = cell(r, 0)
    if (k) kv.set(k.toLowerCase(), cell(r, 1))
  }
  const code = kv.get('codice') ?? ''
  const cm = /GL-([A-Z]+)\s?(\d+\.\d+)/.exec(code)
  if (cm) {
    ds.code = `GL-${cm[1]} ${cm[2]}`
    const fam = `GL-${cm[1]}` as ProtocolFamily
    ds.family = FAMILIES.includes(fam) ? fam : 'GL-ANX'
    if (!FAMILIES.includes(fam)) issues.push(`Unknown family "${fam}" — filed under GL-ANX.`)
  }
  ds.title = kv.get('titolo (it)') || kv.get('sottogruppo') || ds.code || ''
  const pt = kv.get('titolo (pt-br)') ?? ''
  ds.titlePt = /da tradurre|^-+$|^—+$/i.test(pt) || !pt ? undefined : pt
  ds.docVersion = kv.get('versione documento') || undefined
  ds.refrain = (kv.get('emotional refrain') ?? '').replace(/^["\u201c]|["\u201d]$/g, '') || undefined
  ds.anchor = kv.get('ancoraggio somatico') || undefined
}

function parseInvarianti(wb: WorkBook, ds: Partial<Datasheet>): void {
  ds.invariants = rows(wb.Sheets['Invarianti']).slice(1)
    .filter((r) => cell(r, 0))
    .map((r) => ({ param: cell(r, 0), value: cell(r, 1), rationale: cell(r, 2) }))
}

function invariantValue(ds: Partial<Datasheet>, re: RegExp): string {
  return ds.invariants?.find((i) => re.test(i.param))?.value ?? ''
}

function parseVersioni(wb: WorkBook, ds: Partial<Datasheet>, issues: string[]): void {
  const all = rows(wb.Sheets['Versioni'])
  if (all.length < 2) { issues.push('Versioni sheet is empty — using defaults for all version parameters.'); ds.versions = []; return }
  const head = all[0]
  // column per duration, detected from the header ("6 MIN (Quick)" …)
  const cols: { duration: Duration; col: number; label: string }[] = []
  for (let c = 1; c < head.length; c++) {
    const h = cell(head, c)
    const m = /(\d+)\s*MIN/i.exec(h)
    if (!m) continue
    const d = Number(m[1]) as Duration
    if (!DURATIONS.includes(d)) continue
    cols.push({ duration: d, col: c, label: /\(([^)]+)\)/.exec(h)?.[1] ?? '' })
  }
  const get = (param: RegExp, col: number): string => {
    const r = all.find((row) => param.test(cell(row, 0)))
    return r ? cell(r, col) : ''
  }
  // binaural invariants (Invarianti sheet): "8 Hz (portanti 198/206 Hz)"
  const binRaw = invariantValue(ds, /binaural/i)
  const binM = /(\d+(?:\.\d+)?)\s*Hz.*?(\d+)\s*\/\s*(\d+)/.exec(binRaw)
  const beatHz = binM ? Number(binM[1]) : 8
  const carLow = binM ? Number(binM[2]) : 198
  const carHigh = binM ? Number(binM[3]) : carLow + beatHz
  const bilInv = invariantValue(ds, /frequenza bilaterale/i) // "600 Hz sinusoidale, 100 ms"
  const bilHz = firstNum(bilInv) ?? 600
  const bilMs = Number(/(\d+)\s*ms/i.exec(bilInv)?.[1] ?? 100)

  ds.versions = cols.map(({ duration, col, label }) => {
    const stackRaw = get(/stacking/i, col)
    const stacking: DsVersionParams['stacking'] =
      /tripl|sussurro/i.test(stackRaw) ? 'triple' : /eco/i.test(stackRaw) ? 'echo' : 'none'
    const bilRaw = get(/bilaterale sincrono/i, col)
    const bilEvery = /s[ìi]/i.test(bilRaw) ? /ogni\s+(\d+(?:[.,]\d+)?)\s*s/i.exec(norm(bilRaw)) : null
    const hbRaw = get(/heartbeat/i, col)
    const hbDb = /s[ìi]/i.test(hbRaw) ? dbFrom(hbRaw) : undefined
    const hbPh = /F(\d)\s*-\s*F(\d)/i.exec(norm(hbRaw))
    const whRaw = get(/sussurro continuo/i, col)
    const whDb = /continuo/i.test(whRaw) ? dbFrom(whRaw) : undefined
    const whPh = /F(\d)/i.exec(norm(whRaw))
    const diRaw = norm(get(/intervallo dicotico/i, col))
    const diSec = firstNum(diRaw)
    const diAlt = /(\d+)\s*alternanze/i.exec(diRaw)
    const binVer = norm(get(/^binaural/i, col))
    const fadeIn = /fade\s*(\d+(?:[.,]\d+)?)\s*s/i.exec(binVer)
    const theta = /theta\s*(\d+(?:\.\d+)?)\s*hz[^F]*F(\d)/i.exec(binVer)
    const subsetRaw = get(/sub-?set rec/i, col)
    const recSubset = subsetRaw ? parseRecSubset(subsetRaw) : []
    if (!recSubset.length) issues.push(`${duration}-min: no REC sub-set parsed — the loop phase will use the timeline rows only.`)
    return {
      duration,
      label,
      purpose: get(/scopo/i, col) || undefined,
      loopIntervalSec: firstNum(get(/intervallo loop/i, col)) ?? (duration === 6 ? 12 : duration === 12 ? 20 : 24),
      affFadeInSec: firstNum(get(/fade-?in affermazione/i, col)) ?? (duration === 6 ? 1.0 : 1.5),
      affFadeOutSec: firstNum(get(/fade-?out/i, col)) ?? (duration === 6 ? 2.0 : duration === 12 ? 2.5 : 3.0),
      recSubset,
      stacking,
      bilateral: bilEvery ? { toneHz: bilHz, everySec: Number(bilEvery[1].replace(',', '.')), blipMs: bilMs } : undefined,
      heartbeat: hbDb != null ? { gainDb: hbDb, fromPhase: clampPhase(hbPh ? Number(hbPh[1]) : 2), toPhase: clampPhase(hbPh ? Number(hbPh[2]) : 4) } : undefined,
      continuousWhisper: whDb != null ? { gainDb: whDb, phase: clampPhase(whPh ? Number(whPh[1]) : 4) } : undefined,
      dichotic: diSec != null ? { intervalSec: diSec, alternations: diAlt ? Number(diAlt[1]) : 4, gainDb: dbFrom(diRaw), doubleInduction: /doppia induzione/i.test(diRaw) } : undefined,
      bowlRaw: get(/singing bowl/i, col) || undefined,
      binaural: {
        beatHz, carrierLowHz: carLow, carrierHighHz: carHigh,
        fadeInSec: fadeIn ? Number(fadeIn[1].replace(',', '.')) : 10,
        fadeOutSec: 15,
        theta: theta ? { beatHz: Number(theta[1]), phase: clampPhase(Number(theta[2])) } : undefined,
      },
    }
  })
}

function parseFasi(wb: WorkBook, ds: Partial<Datasheet>, issues: string[]): void {
  const out: DsPhase[] = []
  for (const r of rows(wb.Sheets['Fasi']).slice(1)) {
    const d = num(r[0])
    const id = num(r[1])
    const start = toSec(r[3])
    const end = toSec(r[4])
    if (d == null || id == null || start == null || end == null) continue
    if (!DURATIONS.includes(d as Duration)) { issues.push(`Fasi: version ${d} min ignored (supported: 6/12/24).`); continue }
    out.push({ duration: d as Duration, id: clampPhase(id), name: cell(r, 2), startSec: start, endSec: end, notes: cell(r, 5) })
  }
  ds.phases = out.sort((a, b) => a.duration - b.duration || a.startSec - b.startSec)
}

function parseTimeline(ws: WorkSheet | undefined, duration: Duration, issues: string[]): DsTimelineRow[] | null {
  const all = rows(ws).slice(1).filter((r) => r.some((c) => norm(c) !== ''))
  if (!all.length) return null
  // "DA COMPILARE" placeholder → timeline pending
  if (all.length <= 2 && all.every((r) => /da compilare/i.test(cell(r, 0)))) return null
  const out: DsTimelineRow[] = []
  for (const r of all) {
    const t = toSec(r[0])
    if (t == null) {
      if (cell(r, 0) && !/da compilare/i.test(cell(r, 0))) issues.push(`Timeline_${duration}min: row "${cell(r, 0).slice(0, 24)}…" has no readable time — skipped.`)
      continue
    }
    const chRaw = cell(r, 2).toUpperCase()
    const channel: DsTimelineRow['channel'] = chRaw === 'SYS' || chRaw === 'C' || chRaw === 'L' || chRaw === 'R' ? chRaw : ''
    const vRaw = cell(r, 3).toUpperCase()
    out.push({
      timeSec: t,
      phase: clampPhase(num(r[1]) ?? 1),
      channel,
      voice: vRaw === 'F' || vRaw === 'M' ? vRaw : '',
      kind: (cell(r, 4).toUpperCase() || (channel === 'SYS' ? 'SYS' : 'VOCE')) as DsRowKind,
      gainDb: num(r[5]),
      delaySec: num(r[6]),
      cycle: num(r[7]),
      rec: cell(r, 8) || undefined,
      text: cell(r, 9),
    })
  }
  return out.length ? out.sort((a, b) => a.timeSec - b.timeSec) : null
}

function parseAffermazioni(wb: WorkBook, ds: Partial<Datasheet>): void {
  const out: DsAffirmation[] = []
  for (const r of rows(wb.Sheets['Affermazioni']).slice(1)) {
    const id = cell(r, 0)
    if (!/^REC-\d+/i.test(id)) continue
    const text = cell(r, 1).replace(/^["\u201c]|["\u201d]$/g, '')
    const kw = cell(r, 7).replace(/\u2026/g, '…')
    out.push({
      id: id.toUpperCase(),
      text,
      construct: cell(r, 2),
      durationSec: num(r[3]),
      inVersion: { 6: isX(r[4]), 12: isX(r[5]), 24: isX(r[6]) },
      echoKeywords: kw || echoKeywords(text),
    })
  }
  ds.affirmations = out
}

function parseMappaMusicale(wb: WorkBook, ds: Partial<Datasheet>): void {
  const out: DsMusicPhase[] = []
  for (const r of rows(wb.Sheets['MappaMusicale']).slice(1)) {
    const f = cell(r, 0) // "1. Intro"
    const pm = /^(\d)/.exec(f)
    if (!pm) continue
    const keys = norm(r[1]).split(/->|→/).map((k) => k.trim()).filter(Boolean)
    out.push({
      phase: clampPhase(Number(pm[1])),
      name: f.replace(/^\d+\.\s*/, ''),
      keys: keys.length ? keys : ['Am'],
      bpm: num(r[2]) ?? 60,
      arrangement: { 6: cell(r, 3) || undefined, 12: cell(r, 4) || undefined, 24: cell(r, 5) || undefined },
      soundscape: cell(r, 6),
    })
  }
  ds.musicMap = out
}

function parseLayerEngine(wb: WorkBook, ds: Partial<Datasheet>): void {
  const out: DsLayer[] = []
  for (const r of rows(wb.Sheets['LayerEngine']).slice(1)) {
    const id = num(r[0])
    if (id == null) continue
    out.push({ id, description: cell(r, 1), state: { 6: cell(r, 2) || undefined, 12: cell(r, 3) || undefined, 24: cell(r, 4) || undefined }, params: cell(r, 5) })
  }
  ds.layers = out
}

function parseAssetSheet(wb: WorkBook, ds: Partial<Datasheet>): void {
  const out: DsAssetRow[] = []
  for (const r of rows(wb.Sheets['Asset']).slice(1)) {
    const file = cell(r, 0)
    if (!file || /^esempio/i.test(file)) continue
    out.push({
      file, kind: cell(r, 1), phases: cell(r, 2), versions: cell(r, 3),
      key: cell(r, 4) || undefined, bpm: num(r[5]), gainTrimDb: num(r[6]),
      loop: /s[ìi]/i.test(cell(r, 7)) || undefined,
      storagePath: cell(r, 8) || undefined, source: cell(r, 9) || undefined, notes: cell(r, 10) || undefined,
    })
  }
  ds.assetRows = out
}

const REQUIRED_SHEETS = ['Protocollo', 'Versioni', 'Fasi', 'Affermazioni', 'MappaMusicale']

/** Parse the workbook bytes. Returns an error only when nothing usable exists. */
export async function parseDatasheet(bytes: ArrayBuffer): Promise<DatasheetParseResult> {
  let wb: WorkBook
  try {
    const { read } = await loadXlsx()
    wb = read(bytes, { type: 'array', cellDates: true })
  } catch (e) {
    return { error: `Could not read the workbook: ${(e as Error).message}` }
  }
  const missing = REQUIRED_SHEETS.filter((s) => !wb.Sheets[s])
  if (missing.length) {
    return { error: `Not a Protocol Datasheet — missing sheet${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Expected the GL-ANX 1.3 workbook format (Protocollo, Invarianti, Versioni, Fasi, Timeline_*, Affermazioni, MappaMusicale, Asset, LayerEngine).` }
  }

  const issues: string[] = []
  const ds: Partial<Datasheet> = { issues }
  parseProtocollo(wb, ds, issues)
  if (!ds.code) return { error: 'No protocol code found in the Protocollo sheet (expected e.g. "GL-ANX 1.3").' }
  parseInvarianti(wb, ds)
  parseVersioni(wb, ds, issues)
  parseFasi(wb, ds, issues)
  parseAffermazioni(wb, ds)
  parseMappaMusicale(wb, ds)
  parseLayerEngine(wb, ds)
  parseAssetSheet(wb, ds)

  ds.timelines = {}
  for (const d of DURATIONS) {
    const tl = parseTimeline(wb.Sheets[`Timeline_${d}min`], d, issues)
    if (tl) ds.timelines[d] = tl
    else issues.push(`Timeline_${d}min is not compiled yet — the ${d}-min version imports with phases and parameters, but can't render until its timeline rows exist.`)
  }

  /* ---- validation ---- */
  const versions = ds.versions ?? []
  if (!versions.length) return { error: 'The Versioni sheet has no 6/12/24-minute columns — nothing to import.' }
  const phases = ds.phases ?? []
  const affById = new Map((ds.affirmations ?? []).map((a) => [a.id, a]))
  for (const v of versions) {
    const ph = phases.filter((p) => p.duration === v.duration)
    if (!ph.length) issues.push(`${v.duration}-min: no phases in the Fasi sheet.`)
    else {
      const last = ph[ph.length - 1]
      if (Math.abs(last.endSec - v.duration * 60) > 60) issues.push(`${v.duration}-min: last phase ends at ${Math.round(last.endSec / 60)} min — check the Fasi sheet.`)
    }
    for (const id of v.recSubset) {
      if (!affById.has(id)) issues.push(`${v.duration}-min sub-set references ${id}, which is not in the Affermazioni sheet.`)
    }
    const tl = ds.timelines?.[v.duration]
    if (tl) {
      for (const row of tl) {
        if (row.rec && !affById.has(row.rec.toUpperCase())) issues.push(`Timeline_${v.duration}min at ${fmtTime(row.timeSec)}: unknown ${row.rec}.`)
        if ((row.kind === 'VOCE' || row.kind === 'LOOP') && !row.text) issues.push(`Timeline_${v.duration}min at ${fmtTime(row.timeSec)}: ${row.kind} row without text.`)
      }
      const maxT = tl[tl.length - 1].timeSec
      if (Math.abs(maxT - v.duration * 60) > 90) issues.push(`Timeline_${v.duration}min ends at ${fmtTime(maxT)} — expected ~${v.duration}:00.`)
    }
  }
  if (!(ds.affirmations ?? []).length) issues.push('Affermazioni sheet is empty — affirmation loops will be silent.')
  if (!(ds.musicMap ?? []).length) issues.push('MappaMusicale is empty — music falls back to a neutral pad.')

  return { datasheet: ds as Datasheet }
}

export function fmtTime(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
}

/** True when this version has timeline rows and can be rendered. */
export function timelineReady(ds: Datasheet, duration: Duration): boolean {
  return Boolean(ds.timelines[duration]?.length)
}

/* ------------------------------------------- speakable-text extraction */

/** The spoken content of a timeline row: quoted spans if present, otherwise
    the text minus [stage directions] and LABEL: prefixes. */
export function speakableText(row: DsTimelineRow): string {
  const t = row.text
  const quoted = [...t.matchAll(/["\u201c]([^"\u201d]+)["\u201d]/g)].map((m) => m[1].trim())
  if (quoted.length) return quoted.join(' ')
  return t
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/^[A-ZÀ-Ú ]{3,}:\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/* ----------------------------------------- legacy ProtocolSpec bridge */

/** Derive the legacy ProtocolSpec so the clinician wizard, Studio seeding and
    phase strips keep working off the same catalog entry. */
export function datasheetToProtocolSpec(ds: Datasheet): ProtocolSpec {
  const versions: SpecVersion[] = ds.versions.map((v) => {
    const phases = ds.phases.filter((p) => p.duration === v.duration)
      .map((p) => ({ id: p.id, name: p.name, startSec: p.startSec, endSec: p.endSec }))
    const events: SpecEvent[] = (ds.timelines[v.duration] ?? []).map((row) => {
      const voice: SpecVoiceLine[] = []
      if ((row.kind === 'VOCE' || row.kind === 'LOOP' || row.kind === 'ECO' || row.kind === 'SUSSURRO') && row.channel !== 'SYS') {
        const text = speakableText(row)
        if (text) {
          voice.push({
            channel: row.channel === 'L' || row.channel === 'R' ? row.channel : 'C',
            text,
            whisper: row.kind === 'SUSSURRO',
            gainDb: row.gainDb ?? (row.kind === 'ECO' ? -8 : undefined),
            delaySec: row.delaySec ?? (row.kind === 'ECO' ? 2 : undefined),
            loop: row.kind === 'LOOP' || undefined,
          })
        }
      }
      return { timeSec: row.timeSec, channel: row.channel, raw: row.text, voice }
    })
    return { duration: v.duration, label: v.label, phases, events }
  })

  const affirmations: SpecAffirmation[] = ds.affirmations.map((a) => ({
    id: a.id, text: a.text, keywords: a.echoKeywords, durationSec: a.durationSec,
  }))

  const first = ds.versions[0]
  const scape = ds.invariants.find((i) => /soundscape/i.test(i.param))?.value
  return {
    code: ds.code,
    family: ds.family,
    title: ds.title,
    invariants: {
      binauralPrimary: first ? { band: 'Alpha-Theta', beatHz: first.binaural.beatHz, carrierHz: first.binaural.carrierLowHz } : undefined,
      binauralSecondary: first?.binaural.theta ? { band: 'Theta', beatHz: first.binaural.theta.beatHz, carrierHz: first.binaural.carrierLowHz } : undefined,
      soundscape: scape,
      musicBpm: ds.musicMap[0]?.bpm,
      dichoticIntervalSec: first?.dichotic?.intervalSec,
      voicePrimary: ds.invariants.find((i) => /voce primaria/i.test(i.param))?.value,
      voiceSecondary: ds.invariants.find((i) => /voce secondaria/i.test(i.param))?.value,
      binauralFadeInSec: first?.binaural.fadeInSec,
      binauralFadeOutSec: first?.binaural.fadeOutSec,
    },
    versions,
    affirmations,
    issues: [...ds.issues],
  }
}
