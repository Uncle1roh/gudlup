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

export interface DsMix {
  musicDb?: number
  soundscapeDb?: number
  binauralDb?: number
  solfeggioHz?: number
  solfeggioDb?: number
  /** The doc's raw percentage ("al 15%") — the Studio track volume uses it. */
  solfeggioPct?: number
  beatType?: 'binaural' | 'isochronic'
  phaseCrossfadeSec?: number
  sessionFadeInSec?: number
  sessionFadeOutSec?: number
  echoLoopDelaySec?: number
  echoLoopGainDb?: number
  echoDichoticDelaySec?: number
  echoDichoticGainDb?: number
  whisperGainDb?: number
  bilateralVolPct?: number
  bilateralBlipMs?: number
}

export interface DsBreathing {
  duration: Duration
  phase: PhaseNo
  pattern: string
  cycles: number
  guided: boolean
  notes: string
}

export interface DsPhase {
  duration: Duration
  id: PhaseNo
  name: string
  startSec: number
  endSec: number
  notes: string
  /** Per-phase binaural override, e.g. "Theta 7 Hz (rampa 90 s)". Empty =
      the protocol base. Parsed: beat Hz + optional ramp seconds. */
  binaural?: { beatHz: number; rampSec: number; raw: string }
}

export type DsRowKind = 'VOCE' | 'LOOP' | 'ECO' | 'SUSSURRO' | 'SYS' | 'BOWL' | 'TRANS' | 'BILATERALE' | string

export interface DsTimelineRow {
  timeSec: number
  phase: PhaseNo
  channel: 'C' | 'L' | 'R' | 'SYS' | ''
  /** Numeric pan −1..+1 when the Canale cell is e.g. "L25"/"R40" (25%/40%). */
  pan?: number
  /** Row effect: CORO (harmonized chorus) or ECO (extra delayed copy). */
  effect?: 'CORO' | 'ECO'
  /** Voice speed multiplier for this row (0.7–1.4, pitch-preserving). */
  speed?: number
  voice: 'F' | 'M' | ''
  /** Free-text voice from the single-tab format: a catalog voice NAME
      ("Valeria"), an archetype word ("Sussurrata"), or F/M. Resolved against
      the PO catalog at render time; unresolved → protocol default. */
  voiceName?: string
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
  /** Optional per-affirmation voice (single-tab format). */
  voiceName?: string
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
  /** Protocol default voices from the single-tab PROTOCOLLO block ("Voce
      predefinita" / "Voce [M] predefinita") — names or archetypes. */
  defaultVoice?: string
  defaultVoiceM?: string
  /** ### MIX — per-protocol engine offsets/timings (all optional). */
  mix?: DsMix
  /** ### RESPIRAZIONE — guided breathing pacer rows. */
  breathing?: DsBreathing[]
  /** ### TECNICHE / ### NOTE — documentary sections preserved verbatim. */
  docSections?: Record<string, string[][]>
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
    const binRaw2 = cell(r, 6)
    const binM2 = binRaw2 ? /(\d+(?:[.,]\d+)?)\s*hz/i.exec(binRaw2) : null
    const rampM2 = binRaw2 ? /ramp\w*\s*(\d+)\s*s/i.exec(binRaw2) : null
    out.push({
      duration: d as Duration, id: clampPhase(id), name: cell(r, 2), startSec: start, endSec: end, notes: cell(r, 5),
      binaural: binM2 ? { beatHz: parseFloat(binM2[1].replace(',', '.')), rampSec: rampM2 ? +rampM2[1] : 120, raw: binRaw2 } : undefined,
    })
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
    // stub/noise rows (only Versione+Tempo filled) are skipped, not flagged
    if (!chRaw && !cell(r, 4) && !cell(r, 8) && !cell(r, 9)) continue
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

/* ------------------------------------------- SINGLE-TAB (Scheda Unica) */
/* One sheet, sections marked by a `### NAME` row in column A:
   ### PROTOCOLLO · ### PARAMETRI · ### VERSIONI · ### FASI · ### TIMELINE ·
   ### AFFERMAZIONI · ### MUSICA
   Each section then has its own header row + data rows. The TIMELINE section
   is unified (a Versione column instead of three sheets), carries NO Fase
   column (derived from the FASI windows by time), and its Voce column takes a
   catalog voice NAME, an archetype word, or F/M. */

interface SingleTabSections { [name: string]: unknown[][] }

function splitSingleTab(ws: WorkSheet): SingleTabSections | null {
  if (!xlsx) return null
  const all = xlsx.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null })
  const out: SingleTabSections = {}
  let current: string | null = null
  let found = false
  for (const r of all) {
    const a = norm(r[0])
    const m = /^###\s*([A-ZÀ-Ú ]+)/i.exec(a)
    if (m) {
      current = m[1].trim().toUpperCase()
      out[current] = []
      found = true
      continue
    }
    if (!current) continue
    if (a.startsWith('//')) continue // comment rows ('//' only — '#7' is a technique id)
    if (r.every((c) => norm(c) === '')) continue
    out[current].push(r)
  }
  return found ? out : null
}

/** Find the single-tab sheet of a workbook (any sheet containing ### markers). */
function findSingleTab(wb: WorkBook): SingleTabSections | null {
  for (const name of wb.SheetNames) {
    const secs = splitSingleTab(wb.Sheets[name])
    if (secs) return secs
  }
  return null
}

const VOICE_TOKEN = /^[FM]$/i

const numOf = (v: string | undefined): number | undefined => {
  if (!v) return undefined
  const m = /-?\d+(?:[.,]\d+)?/.exec(v)
  return m ? parseFloat(m[0].replace(',', '.')) : undefined
}

function parseMixSection(rows: unknown[][], ds: Partial<Datasheet>): void {
  const mix: DsMix = {}
  for (const r of rows) {
    const k = norm(r[0]).toLowerCase()
    const v = norm(r[1])
    if (!k || /^parametro$/.test(k)) continue
    if (/^musica/.test(k)) mix.musicDb = numOf(v)
    else if (/^soundscape/.test(k)) mix.soundscapeDb = numOf(v)
    else if (/^binaural.*(db|volume)|^volume binaural/.test(k)) mix.binauralDb = numOf(v)
    else if (/solfeggio/.test(k)) {
      mix.solfeggioHz = numOf(v)
      const pm = /(\d+(?:[.,]\d+)?)\s*%/.exec(v)
      const dbm = /(-\d+(?:[.,]\d+)?)\s*db/i.exec(v)
      if (pm) mix.solfeggioPct = parseFloat(pm[1].replace(',', '.'))
      if (dbm) mix.solfeggioDb = parseFloat(dbm[1].replace(',', '.'))
      else if (pm) mix.solfeggioDb = Math.round(20 * Math.log10(Math.max(0.01, parseFloat(pm[1].replace(',', '.')) / 100)))
    }
    else if (/tipo battiment|battimento/.test(k)) mix.beatType = /isocron/i.test(v) ? 'isochronic' : 'binaural'
    else if (/crossfade/.test(k)) mix.phaseCrossfadeSec = numOf(v)
    else if (/fade.*sessione.*in|fade[- ]?in sessione/.test(k)) mix.sessionFadeInSec = numOf(v)
    else if (/fade.*sessione.*out|fade[- ]?out sessione/.test(k)) mix.sessionFadeOutSec = numOf(v)
    else if (/eco loop/.test(k)) {
      const d = /(\d+(?:[.,]\d+)?)\s*s/.exec(v); const g = /(-\d+(?:[.,]\d+)?)\s*db/i.exec(v)
      if (d) mix.echoLoopDelaySec = parseFloat(d[1].replace(',', '.'))
      if (g) mix.echoLoopGainDb = parseFloat(g[1].replace(',', '.'))
    }
    else if (/eco dicotic/.test(k)) {
      const d = /(\d+(?:[.,]\d+)?)\s*s/.exec(v); const g = /(-\d+(?:[.,]\d+)?)\s*db/i.exec(v)
      if (d) mix.echoDichoticDelaySec = parseFloat(d[1].replace(',', '.'))
      if (g) mix.echoDichoticGainDb = parseFloat(g[1].replace(',', '.'))
    }
    else if (/sussurro/.test(k)) mix.whisperGainDb = numOf(v)
    else if (/volume bilateral/.test(k)) mix.bilateralVolPct = numOf(v)
    else if (/blip|impulso bilateral|durata bilateral/.test(k)) mix.bilateralBlipMs = numOf(v)
  }
  if (Object.keys(mix).length) ds.mix = mix
}

function parseRespirazione(rows: unknown[][], ds: Partial<Datasheet>): void {
  const out: DsBreathing[] = []
  for (const r of rows) {
    const dur = num(r[0])
    if (dur == null || !DURATIONS.includes(dur as Duration)) continue
    const ph = num(r[1])
    out.push({
      duration: dur as Duration,
      phase: (Math.min(6, Math.max(1, ph ?? 2)) as PhaseNo),
      pattern: cell(r, 2),
      cycles: num(r[3]) ?? 2,
      guided: !/^no/i.test(cell(r, 4)),
      notes: cell(r, 5),
    })
  }
  if (out.length) ds.breathing = out
}

function parseUnifiedTimelines(rows: unknown[][], ds: Partial<Datasheet>, issues: string[]): void {
  // Columns are mapped BY HEADER NAME (order-independent, new columns optional):
  // Versione · Tempo · Canale · Voce · Tipo · Gain dB · Ritardo s · Ciclo ·
  // REC · Testo · Effetto · Velocità
  ds.timelines = {}
  const byDur: Partial<Record<Duration, DsTimelineRow[]>> = {}
  const fasi = ds.phases ?? []
  const phaseAt = (dur: Duration, sec: number): PhaseNo => {
    const ph = fasi.filter((p) => p.duration === dur)
    const hit = ph.find((p) => sec >= p.startSec && sec < p.endSec)
    return hit ? hit.id : ph.length && sec >= ph[ph.length - 1].endSec ? ph[ph.length - 1].id : 1
  }
  const hdr = (rows[0] ?? []).map((c) => norm(c).toLowerCase())
  const col = (rx: RegExp, fallback: number) => {
    const i = hdr.findIndex((h) => rx.test(h))
    return i >= 0 ? i : fallback
  }
  const iVer = col(/versione/, 0), iTem = col(/tempo/, 1), iCan = col(/canale/, 2), iVoc = col(/^voce/, 3)
  const iTip = col(/tipo/, 4), iGai = col(/gain/, 5), iRit = col(/ritardo/, 6), iCic = col(/ciclo/, 7)
  const iRec = col(/rec/, 8), iTxt = col(/testo/, 9), iEff = col(/effetto/, -1), iVel = col(/velocit/, -1)
  for (const r of rows.slice(1)) {
    const dur = num(r[iVer])
    const t = toSec(r[iTem])
    if (dur == null || t == null || !DURATIONS.includes(dur as Duration)) continue
    const d = dur as Duration
    const chRaw = cell(r, iCan).toUpperCase()
    // C/L/R/SYS or numeric pans like "L25" / "R40" (percent off-center)
    const panM = /^([LR])\s*(\d{1,3})$/.exec(chRaw)
    const channel: DsTimelineRow['channel'] =
      chRaw === 'SYS' || chRaw === 'C' || chRaw === 'L' || chRaw === 'R' ? chRaw : panM ? (panM[1] as 'L' | 'R') : ''
    const pan = panM ? (panM[1] === 'L' ? -1 : 1) * Math.min(100, +panM[2]) / 100 : undefined
    if (!chRaw && !cell(r, iTip) && !cell(r, iRec) && !cell(r, iTxt)) continue // stub rows
    const vRaw = cell(r, iVoc)
    const voiceName = vRaw && !VOICE_TOKEN.test(vRaw) ? vRaw : undefined
    const voice: DsTimelineRow['voice'] = VOICE_TOKEN.test(vRaw) ? (vRaw.toUpperCase() as 'F' | 'M') : ''
    const effRaw = iEff >= 0 ? cell(r, iEff).toUpperCase() : ''
    ;(byDur[d] ??= []).push({
      timeSec: t,
      phase: phaseAt(d, t),
      channel,
      pan,
      voice,
      voiceName,
      kind: (cell(r, iTip).toUpperCase() || (channel === 'SYS' ? 'SYS' : 'VOCE')) as DsRowKind,
      gainDb: num(r[iGai]),
      delaySec: num(r[iRit]),
      cycle: num(r[iCic]),
      rec: cell(r, iRec) ? cell(r, iRec).toUpperCase() : undefined,
      text: cell(r, iTxt),
      effect: effRaw === 'CORO' || effRaw === 'ECO' ? effRaw : undefined,
      speed: iVel >= 0 ? num(r[iVel]) : undefined,
    })
  }
  for (const d of DURATIONS) {
    const list = byDur[d]
    if (list?.length) ds.timelines[d] = list.sort((a, b) => a.timeSec - b.timeSec)
    else issues.push(`TIMELINE has no ${d}-min rows — that version imports but can't render until they exist.`)
  }
}

function parseUnifiedAffirmations(rows: unknown[][], ds: Partial<Datasheet>): void {
  // header: REC | Testo | Costrutto | Durata s | Versioni | Voce | Eco
  const out: DsAffirmation[] = []
  for (const r of rows.slice(1)) {
    const id = cell(r, 0)
    if (!/^REC-\d+/i.test(id)) continue
    const text = cell(r, 1).replace(/^["\u201c]|["\u201d]$/g, '')
    const vers = cell(r, 4)
    const inV = (d: Duration) => new RegExp(`(^|[,\\s])${d}([,\\s]|$)`).test(vers) || /tutt|all/i.test(vers)
    const vRaw = cell(r, 5)
    out.push({
      id: id.toUpperCase(),
      text,
      construct: cell(r, 2),
      durationSec: num(r[3]),
      inVersion: { 6: inV(6), 12: inV(12), 24: inV(24) },
      echoKeywords: cell(r, 6) || echoKeywords(text),
      voiceName: vRaw || undefined,
    })
  }
  ds.affirmations = out
}

/** Parse the single-tab format into the same Datasheet structure. */
function parseSingleTabSections(secs: SingleTabSections): DatasheetParseResult {
  const issues: string[] = []
  const ds: Partial<Datasheet> = { issues }
  const wrap = (rows: unknown[][] | undefined): WorkSheet | undefined =>
    rows && xlsx ? xlsx.utils.aoa_to_sheet(rows as unknown[][]) : undefined
  const fakeWb = (name: string, rows: unknown[][] | undefined): WorkBook =>
    ({ SheetNames: [name], Sheets: { [name]: wrap(rows ?? []) } }) as unknown as WorkBook

  // PROTOCOLLO: key/value (no header requirement — tolerate one)
  const proto = (secs['PROTOCOLLO'] ?? []).filter((r) => !/^campo$/i.test(norm(r[0])))
  parseProtocollo(fakeWb('Protocollo', [['Campo', 'Valore'], ...proto]), ds, issues)
  if (!ds.code) return { error: 'No protocol code in the ### PROTOCOLLO block (expected e.g. "GL-ANX 1.6").' }
  const kv = new Map(proto.map((r) => [norm(r[0]).toLowerCase(), norm(r[1])]))
  ds.defaultVoice = kv.get('voce predefinita') || undefined
  ds.defaultVoiceM = kv.get('voce [m] predefinita') || kv.get('voce m predefinita') || undefined

  const params = secs['PARAMETRI'] ?? secs['INVARIANTI'] ?? []
  parseInvarianti(fakeWb('Invarianti', [['Parametro', 'Valore', 'Razionale'], ...params.filter((r) => !/^parametro$/i.test(norm(r[0])))]), ds)
  parseVersioni(fakeWb('Versioni', secs['VERSIONI'] ?? []), ds, issues)
  parseFasi(fakeWb('Fasi', secs['FASI'] ?? []), ds, issues)
  parseMixSection(secs['MIX'] ?? [], ds)
  parseRespirazione((secs['RESPIRAZIONE'] ?? []).filter((r) => !/^versione$/i.test(norm(r[0]))), ds)
  parseUnifiedTimelines(secs['TIMELINE'] ?? [], ds, issues)
  parseUnifiedAffirmations(secs['AFFERMAZIONI'] ?? [], ds)
  // documentary sections preserved verbatim for the admin review
  const docs: Record<string, string[][]> = {}
  for (const name of ['TECNICHE', 'NOTE', 'NOTE CLINICHE']) {
    if (secs[name]?.length) docs[name] = secs[name].map((r) => r.map((c) => norm(c)))
  }
  if (Object.keys(docs).length) ds.docSections = docs
  parseMappaMusicale(fakeWb('MappaMusicale', secs['MUSICA'] ?? secs['MAPPAMUSICALE'] ?? []), ds)
  parseLayerEngine(fakeWb('LayerEngine', []), ds)
  parseAssetSheet(fakeWb('Asset', []), ds)

  return finishValidation(ds as Datasheet, issues)
}

/** Parse the workbook bytes. Returns an error only when nothing usable exists. */
export async function parseDatasheet(bytes: ArrayBuffer): Promise<DatasheetParseResult> {
  let wb: WorkBook
  try {
    const { read } = await loadXlsx()
    wb = read(bytes, { type: 'array', cellDates: true })
  } catch (e) {
    return { error: `Could not read the workbook: ${(e as Error).message}` }
  }
  // SINGLE-TAB format first: any sheet with `### SECTION` markers
  const singleTab = findSingleTab(wb)
  if (singleTab) return parseSingleTabSections(singleTab)

  const missing = REQUIRED_SHEETS.filter((s) => !wb.Sheets[s])
  if (missing.length) {
    return { error: `Not a Protocol Datasheet — missing sheet${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Expected either the multi-sheet workbook (Protocollo, Invarianti, Versioni, Fasi, Timeline_*, Affermazioni, MappaMusicale) or the single-tab "Scheda Unica" format with ### section markers.` }
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

  return finishValidation(ds as Datasheet, issues)
}

/** Shared validation for both workbook formats. */
function finishValidation(ds: Datasheet, issues: string[]): DatasheetParseResult {
  const versions = ds.versions ?? []
  if (!versions.length) return { error: 'The VERSIONI section has no 6/12/24-minute columns — nothing to import.' }
  const phases = ds.phases ?? []
  const affById = new Map((ds.affirmations ?? []).map((a) => [a.id, a]))
  for (const v of versions) {
    const ph = phases.filter((p) => p.duration === v.duration)
    if (!ph.length) issues.push(`${v.duration}-min: no phases in the FASI section.`)
    else {
      const last = ph[ph.length - 1]
      if (Math.abs(last.endSec - v.duration * 60) > 60) issues.push(`${v.duration}-min: last phase ends at ${Math.round(last.endSec / 60)} min — check the FASI section.`)
    }
    for (const id of v.recSubset) {
      if (!affById.has(id)) issues.push(`${v.duration}-min sub-set references ${id}, which is not in AFFERMAZIONI.`)
    }
    const tl = ds.timelines?.[v.duration]
    if (tl) {
      for (const row of tl) {
        if (row.rec && !affById.has(row.rec.toUpperCase())) issues.push(`Timeline ${v.duration}min at ${fmtTime(row.timeSec)}: unknown ${row.rec}.`)
        if ((row.kind === 'VOCE' || row.kind === 'LOOP') && !row.text) issues.push(`Timeline ${v.duration}min at ${fmtTime(row.timeSec)}: ${row.kind} row without text.`)
      }
      const maxT = tl[tl.length - 1].timeSec
      if (Math.abs(maxT - v.duration * 60) > 90) issues.push(`Timeline ${v.duration}min ends at ${fmtTime(maxT)} — expected ~${v.duration}:00.`)
    }
  }
  if (!(ds.affirmations ?? []).length) issues.push('AFFERMAZIONI is empty — affirmation loops will be silent.')
  if (!(ds.musicMap ?? []).length) issues.push('MUSICA section is empty — fine: it is metadata only; the sound comes from the Asset Library f1–f6 mapping.')
  return { datasheet: ds }
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
