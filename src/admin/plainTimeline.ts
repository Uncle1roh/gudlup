/* ============================================================================
   Good Loop — PLAIN Timeline parser (.xlsx, clip-level protocol format)
   The NEW recommended import format ("Rules for Good Loop protocols", Dec.
   A–H, §5–§8): a workbook with a README sheet, one sheet per version (Quick /
   Standard / Deep) where ONE ROW = ONE CLIP on a named track, and an
   Affermazioni sheet with the looper texts (8 ⊂ 12 ⊂ 20 subsets).

   Six track types (final decision): Soundscape · Music · Binaural · Bilateral
   · Solfeggio · Voice. Voice absorbs dichotic / conscious confusion / echo-
   stacking / whisper / looper through parameters. Breathing pacer, MUSICA
   key/BPM metadata and synth beds do NOT exist in this format (Dec. A/G).

   `start_s`/`end_s` (numeric seconds) are authoritative; the human `m:ss`
   columns are only cross-checked. Banner rows, blank rows and the TOTALE
   CLIP / DURATA SESSIONE footer are skipped. Validation issues follow the
   Rules doc (§8.0 phase windows, Binaural XOR Solfeggio, crossfade only on
   Soundscape/Music, set ranges resolved against the Affermazioni sheet).

   This module only PARSES + VALIDATES. Studio seeding and rendering live in
   later slices (specStudio / renderer) so the legacy importers stay intact.
   ============================================================================ */

import type { WorkBook, WorkSheet } from 'xlsx'

/* SheetJS is lazy-loaded (same pattern as datasheet.ts) so it never weighs on
   the main bundle. */
type XlsxModule = typeof import('xlsx')
let xlsx: XlsxModule | null = null
async function loadXlsx(): Promise<XlsxModule> {
  if (!xlsx) xlsx = await import('xlsx')
  return xlsx
}

/* ------------------------------------------------------------------ types */

export type PlainTipo = 'soundscape' | 'music' | 'binaural' | 'bilateral' | 'solfeggio' | 'voice'

export const PLAIN_TIPO_LABEL: Record<PlainTipo, string> = {
  soundscape: 'Soundscape',
  music: 'Music',
  binaural: 'Binaural',
  bilateral: 'Bilateral',
  solfeggio: 'Solfeggio',
  voice: 'Voice',
}

export interface PlainSetRange {
  /** e.g. "CSI" from "CSI-01..12". */
  prefix: string
  from: number
  to: number
  /** Resolved affirmation IDs (in ordine_loop order when available). */
  ids: string[]
}

export interface PlainClip {
  /** Excel row (1-based) — for diagnostics only. */
  row: number
  clipId: string
  traccia: string
  tipo: PlainTipo
  /** Raw fase cell ("1", "1-2", "4"...). */
  faseRaw: string
  /** Parsed phase span. */
  faseFrom: number | null
  faseTo: number | null
  startS: number
  endS: number
  durataS: number
  /** dB RELATIVE to the guide voice (0 dB anchor, §8.1). null = archetype/app default. */
  volumeDb: number | null
  fadeInS: number
  fadeOutS: number
  /** Only meaningful on Soundscape/Music (Rules §7). */
  crossfadePrecS: number | null
  /* Soundscape */
  ambiente?: string
  /* Binaural */
  carrierLHz?: number
  carrierRHz?: number
  /** Derived: carrier_R − carrier_L (the beat IS their difference). */
  beatHz?: number
  /* Solfeggio */
  frequenzaHz?: number
  /* Bilateral */
  intervalloAlternanzaS?: number
  frequenzaBlipHz?: number
  panAmpiezza?: number
  /* Voice */
  archetipo?: string
  pan?: number
  riverberoPct?: number
  modalita?: 'normale' | 'sussurrato'
  velocitaWpm?: number
  tipoContenuto?: 'linea' | 'loop'
  testo?: string
  setAffermazioni?: string
  setRange?: PlainSetRange
  intervalloS?: number
  cicli?: number
  attenuazioneCicloDb?: number
  /** Reserved for non-uniform loops (explicit ID+offset list) — README §2. */
  sequenza?: string
  eco?: boolean
  ecoRitardoS?: number
  ecoVolumeDb?: number
  note?: string
}

export interface PlainAffirmation {
  id: string
  testo: string
  /** Raw set cell, e.g. "Quick-Std-Deep". */
  setRaw: string
  inQuick: boolean
  inStandard: boolean
  inDeep: boolean
  durataS: number | null
  tema?: string
  /* Kept beyond the Rules doc (flagged to POs as an info issue): */
  ordineLoop?: number
  bilateraleLato?: 'L' | 'R'
  ecoKeyword?: string
}

export interface PlainPhase {
  fase: number
  startS: number
  endS: number
  label: string
}

export interface PlainTrack {
  name: string
  tipo: PlainTipo
  clips: number
}

export type PlainVersionKey = 'quick' | 'standard' | 'deep'

export interface PlainVersion {
  sheet: string
  versionKey: PlainVersionKey | null
  /** Session length in seconds — declared footer if present, else max end_s. */
  durationS: number
  durationMin: number
  clips: PlainClip[]
  tracks: PlainTrack[]
  phases: PlainPhase[]
  declaredTotal: number | null
  declaredDurationS: number | null
}

export interface PlainIssue {
  level: 'error' | 'warning' | 'info'
  sheet?: string
  clipId?: string
  message: string
}

export interface PlainTimeline {
  /** "GL-ANX 1.1" */
  code: string | null
  title: string | null
  methodology?: string
  source?: string
  versions: PlainVersion[]
  affirmations: PlainAffirmation[]
  issues: PlainIssue[]
}

export interface PlainParseResult {
  timeline?: PlainTimeline
  error?: string
}

/* ------------------------------------------------------------ cell helpers */

function cellAt(ws: WorkSheet, r: number, c: number, X: XlsxModule): unknown {
  const cell = ws[X.utils.encode_cell({ r, c })]
  return cell ? cell.v : undefined
}

function str(v: unknown): string {
  if (v === undefined || v === null) return ''
  return String(v).trim()
}

function num(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).trim().replace(',', '.')
  const m = s.match(/-?\d+(?:\.\d+)?/)
  return m ? parseFloat(m[0]) : null
}

function boolish(v: unknown): boolean | null {
  const s = str(v).toLowerCase()
  if (!s) return null
  if (['on', 'si', 'sì', 'yes', 'true', '1', 'x'].includes(s)) return true
  if (['off', 'no', 'false', '0', '-'].includes(s)) return false
  return null
}

/** "1:45" / "11:58" → seconds; null when not parseable. */
function mmssToSec(v: unknown): number | null {
  const s = str(v)
  const m = s.match(/^(\d+):(\d{2})$/)
  if (!m) return null
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}

export function secToMmss(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/* --------------------------------------------------------------- detection */

/** All 36 canonical columns of the clip grid (header row match, any order). */
const CLIP_HEADER_REQUIRED = ['clip_id', 'traccia', 'tipo', 'start_s', 'end_s']

/** Find the header row (0-based) of a clip-grid sheet, or −1. */
function findClipHeaderRow(ws: WorkSheet, X: XlsxModule): number {
  const range = ws['!ref'] ? X.utils.decode_range(ws['!ref']) : null
  if (!range) return -1
  const maxScan = Math.min(range.e.r, 12)
  for (let r = 0; r <= maxScan; r++) {
    const seen = new Set<string>()
    for (let c = 0; c <= range.e.c; c++) seen.add(str(cellAt(ws, r, c, X)).toLowerCase())
    if (CLIP_HEADER_REQUIRED.every((h) => seen.has(h))) return r
  }
  return -1
}

/** Cheap detector for the import hub: does this workbook look like a PLAIN
    clip-level Timeline (vs. the legacy Scheda Dati / Scheda Unica)? */
export function looksLikePlainTimeline(wb: WorkBook, X: XlsxModule): boolean {
  return wb.SheetNames.some((n) => {
    const ws = wb.Sheets[n]
    return ws ? findClipHeaderRow(ws, X) >= 0 : false
  })
}

/* ------------------------------------------------------------------ README */

interface ReadmeMeta {
  code: string | null
  title: string | null
  methodology?: string
  source?: string
  phases: PlainPhase[]
}

function parseReadme(ws: WorkSheet | undefined, X: XlsxModule): ReadmeMeta {
  const meta: ReadmeMeta = { code: null, title: null, phases: [] }
  if (!ws || !ws['!ref']) return meta
  const range = X.utils.decode_range(ws['!ref'])
  for (let r = 0; r <= range.e.r; r++) {
    const a = str(cellAt(ws, r, 0, X))
    const b = str(cellAt(ws, r, 1, X))
    if (!a && !b) continue
    // "GOOD LOOP — GL-ANX 1.1"
    const code = a.match(/\b(GL-[A-Z]+\s*\d+(?:\.\d+)*)\b/)
    if (code && !meta.code) meta.code = code[1].replace(/\s+/g, ' ')
    if (!meta.title && r <= 4 && a && !/^good loop/i.test(a) && !/^target|^metodologia|^sorgente|^schema/i.test(a)) {
      // "Calma e Sicurezza Interiore — v2.0"
      meta.title = a.replace(/\s*[—-]\s*v[\d.]+\s*$/i, '').trim()
    }
    if (/^metodologia$/i.test(a) && b) meta.methodology = b
    if (/^sorgente$/i.test(a) && b) meta.source = b
    // "Fase 1 — 0:00 - 1:45" | "Intro + Validazione"
    const ph = a.match(/^Fase\s+(\d)\s*[—-]\s*(\d+:\d{2})\s*-\s*(\d+:\d{2})/i)
    if (ph) {
      const startS = mmssToSec(ph[2])
      const endS = mmssToSec(ph[3])
      if (startS !== null && endS !== null) {
        meta.phases.push({ fase: parseInt(ph[1], 10), startS, endS, label: b || `Fase ${ph[1]}` })
      }
    }
  }
  meta.phases.sort((x, y) => x.fase - y.fase)
  return meta
}

/* ------------------------------------------------------------ Affermazioni */

function findAffirmationSheet(wb: WorkBook): string | null {
  const byName = wb.SheetNames.find((n) => /affermazioni|affirmations/i.test(n))
  return byName ?? null
}

function parseAffirmations(ws: WorkSheet | undefined, X: XlsxModule, issues: PlainIssue[]): PlainAffirmation[] {
  const out: PlainAffirmation[] = []
  if (!ws || !ws['!ref']) return out
  const range = X.utils.decode_range(ws['!ref'])
  // find the header row (contains "ID" + "testo")
  let hdrRow = -1
  const col: Record<string, number> = {}
  for (let r = 0; r <= Math.min(range.e.r, 10); r++) {
    const cells: string[] = []
    for (let c = 0; c <= range.e.c; c++) cells.push(str(cellAt(ws, r, c, X)).toLowerCase())
    if (cells.includes('id') && cells.includes('testo')) {
      hdrRow = r
      cells.forEach((h, c) => { if (h) col[h] = c })
      break
    }
  }
  if (hdrRow < 0) {
    issues.push({ level: 'warning', sheet: 'Affermazioni', message: 'Affermazioni sheet found but no ID/testo header row — sheet skipped.' })
    return out
  }
  const extraCols = ['ordine_loop', 'bilaterale_lato', 'eco_keyword'].filter((k) => k in col)
  if (extraCols.length) {
    issues.push({ level: 'info', sheet: 'Affermazioni', message: `Columns beyond the Rules doc kept as agreed (flagged to POs): ${extraCols.join(', ')}.` })
  }
  for (let r = hdrRow + 1; r <= range.e.r; r++) {
    const id = str(cellAt(ws, r, col['id'], X))
    if (!id || !/^[A-Z]{2,4}-\d+$/i.test(id)) continue // notes / blank rows
    const setRaw = str(cellAt(ws, r, col['set'] ?? -1, X))
    const setLc = setRaw.toLowerCase()
    const lato = str(cellAt(ws, r, col['bilaterale_lato'] ?? -1, X)).toUpperCase()
    out.push({
      id: id.toUpperCase(),
      testo: str(cellAt(ws, r, col['testo'], X)),
      setRaw,
      inQuick: /quick/.test(setLc),
      inStandard: /std|standard/.test(setLc),
      inDeep: /deep/.test(setLc),
      durataS: num(cellAt(ws, r, col['durata_s'] ?? col['durata'] ?? -1, X)),
      tema: str(cellAt(ws, r, col['tema'] ?? -1, X)) || undefined,
      ordineLoop: num(cellAt(ws, r, col['ordine_loop'] ?? -1, X)) ?? undefined,
      bilateraleLato: lato === 'L' || lato === 'R' ? lato : undefined,
      ecoKeyword: str(cellAt(ws, r, col['eco_keyword'] ?? -1, X)) || undefined,
    })
  }
  return out
}

/* ------------------------------------------------------------- clip sheets */

const TIPO_MAP: Record<string, PlainTipo> = {
  soundscape: 'soundscape',
  music: 'music', musica: 'music',
  binaural: 'binaural', binaurale: 'binaural',
  bilateral: 'bilateral', bilaterale: 'bilateral',
  solfeggio: 'solfeggio',
  voice: 'voice', voce: 'voice',
}

function versionKeyFromSheet(name: string): PlainVersionKey | null {
  const n = name.toLowerCase()
  if (/quick|6\s*min/.test(n)) return 'quick'
  if (/standard|std|12\s*min/.test(n)) return 'standard'
  if (/deep|24\s*min/.test(n)) return 'deep'
  return null
}

function parseFase(raw: string): { from: number | null; to: number | null } {
  const m = raw.match(/^(\d)\s*(?:-\s*(\d))?$/)
  if (!m) return { from: null, to: null }
  const from = parseInt(m[1], 10)
  return { from, to: m[2] ? parseInt(m[2], 10) : from }
}

/** "CSI-01..12" / "CSI-01..08" → range. */
function parseSetRange(raw: string): Omit<PlainSetRange, 'ids'> | null {
  const m = raw.match(/^([A-Z]{2,4})-(\d+)\s*\.\.\s*(?:[A-Z]{2,4}-)?(\d+)$/i)
  if (!m) return null
  return { prefix: m[1].toUpperCase(), from: parseInt(m[2], 10), to: parseInt(m[3], 10) }
}

function parseClipSheet(
  sheetName: string,
  ws: WorkSheet,
  X: XlsxModule,
  issues: PlainIssue[],
): { clips: PlainClip[]; declaredTotal: number | null; declaredDurationS: number | null } | null {
  const hdrRow = findClipHeaderRow(ws, X)
  if (hdrRow < 0) return null
  const range = X.utils.decode_range(ws['!ref']!)
  const col: Record<string, number> = {}
  for (let c = 0; c <= range.e.c; c++) {
    const h = str(cellAt(ws, hdrRow, c, X)).toLowerCase()
    if (h) col[h] = c
  }
  const get = (r: number, key: string): unknown => (key in col ? cellAt(ws, r, col[key], X) : undefined)

  const clips: PlainClip[] = []
  let declaredTotal: number | null = null
  let declaredDurationS: number | null = null

  for (let r = hdrRow + 1; r <= range.e.r; r++) {
    const rawId = str(get(r, 'clip_id'))
    if (!rawId) continue
    // Footer rows: "TOTALE CLIP | 71", "DURATA SESSIONE | 12:00 (720 s)"
    if (/^totale/i.test(rawId)) { declaredTotal = num(get(r, 'traccia')); continue }
    if (/^durata/i.test(rawId)) {
      const cell = str(get(r, 'traccia'))
      declaredDurationS = num(cell.match(/\((\d+)\s*s\)/)?.[1]) ?? mmssToSec(cell.split(' ')[0])
      continue
    }
    const tipoRaw = str(get(r, 'tipo'))
    const tipo = TIPO_MAP[tipoRaw.toLowerCase()]
    if (!tipo) {
      if (tipoRaw) issues.push({ level: 'error', sheet: sheetName, clipId: rawId, message: `Row ${r + 1}: unknown tipo "${tipoRaw}" — clip skipped (valid: Soundscape, Music, Binaural, Bilateral, Solfeggio, Voice).` })
      continue
    }
    const startS = num(get(r, 'start_s'))
    const endS = num(get(r, 'end_s'))
    if (startS === null || endS === null) {
      issues.push({ level: 'error', sheet: sheetName, clipId: rawId, message: `Row ${r + 1}: missing numeric start_s/end_s — clip skipped (m:ss columns are human-readable only).` })
      continue
    }
    if (endS <= startS) {
      issues.push({ level: 'error', sheet: sheetName, clipId: rawId, message: `Row ${r + 1}: end_s (${endS}) ≤ start_s (${startS}) — clip skipped.` })
      continue
    }
    // m:ss cross-check (warning only)
    const startHuman = mmssToSec(get(r, 'start'))
    const endHuman = mmssToSec(get(r, 'end'))
    if (startHuman !== null && startHuman !== startS) issues.push({ level: 'warning', sheet: sheetName, clipId: rawId, message: `start "${str(get(r, 'start'))}" ≠ start_s ${startS} — using start_s.` })
    if (endHuman !== null && endHuman !== endS) issues.push({ level: 'warning', sheet: sheetName, clipId: rawId, message: `end "${str(get(r, 'end'))}" ≠ end_s ${endS} — using end_s.` })

    const faseRaw = str(get(r, 'fase'))
    const { from: faseFrom, to: faseTo } = parseFase(faseRaw)
    const modalitaRaw = str(get(r, 'modalita')).toLowerCase()
    const contRaw = str(get(r, 'tipo_contenuto')).toLowerCase()

    const clip: PlainClip = {
      row: r + 1,
      clipId: rawId,
      traccia: str(get(r, 'traccia')) || `${PLAIN_TIPO_LABEL[tipo]} 1`,
      tipo,
      faseRaw,
      faseFrom,
      faseTo,
      startS,
      endS,
      durataS: num(get(r, 'durata_s')) ?? endS - startS,
      volumeDb: num(get(r, 'volume_db')),
      fadeInS: num(get(r, 'fade_in_s')) ?? 0,
      fadeOutS: num(get(r, 'fade_out_s')) ?? 0,
      crossfadePrecS: num(get(r, 'crossfade_prec_s')),
      note: str(get(r, 'note')) || undefined,
    }

    if (tipo === 'soundscape') {
      clip.ambiente = str(get(r, 'ambiente')) || undefined
      if (!clip.ambiente) issues.push({ level: 'error', sheet: sheetName, clipId: rawId, message: `Soundscape clip without "ambiente" tag — the app cannot draw a file for it.` })
    }
    if (tipo === 'music') {
      if (faseFrom === null) issues.push({ level: 'error', sheet: sheetName, clipId: rawId, message: `Music clip without "fase" — the phase pool to draw from must be explicit (Rules §7.2).` })
    }
    if (tipo === 'binaural') {
      clip.carrierLHz = num(get(r, 'carrier_l_hz')) ?? undefined
      clip.carrierRHz = num(get(r, 'carrier_r_hz')) ?? undefined
      if (clip.carrierLHz === undefined || clip.carrierRHz === undefined) {
        issues.push({ level: 'error', sheet: sheetName, clipId: rawId, message: `Binaural clip missing carrier_L_hz/carrier_R_hz.` })
      } else {
        clip.beatHz = Math.round((clip.carrierRHz - clip.carrierLHz) * 100) / 100
        if (clip.beatHz === 0) issues.push({ level: 'warning', sheet: sheetName, clipId: rawId, message: `Binaural carriers are equal — beat is 0 Hz (did you mean a Solfeggio clip?).` })
      }
    }
    if (tipo === 'solfeggio') {
      clip.frequenzaHz = num(get(r, 'frequenza_hz')) ?? undefined
      if (clip.frequenzaHz === undefined) issues.push({ level: 'error', sheet: sheetName, clipId: rawId, message: `Solfeggio clip missing frequenza_hz.` })
    }
    if (tipo === 'bilateral') {
      clip.intervalloAlternanzaS = num(get(r, 'intervallo_alternanza_s')) ?? undefined
      clip.frequenzaBlipHz = num(get(r, 'frequenza_blip_hz')) ?? undefined
      clip.panAmpiezza = num(get(r, 'pan_ampiezza')) ?? undefined
      if (clip.intervalloAlternanzaS === undefined) issues.push({ level: 'error', sheet: sheetName, clipId: rawId, message: `Bilateral clip missing intervallo_alternanza_s (the central clinical dial).` })
      if (clip.frequenzaBlipHz === undefined) issues.push({ level: 'info', sheet: sheetName, clipId: rawId, message: `Bilateral clip without frequenza_blip_hz — app default (400 Hz) will be used.` })
      if (clip.panAmpiezza === undefined) issues.push({ level: 'info', sheet: sheetName, clipId: rawId, message: `Bilateral clip without pan_ampiezza — app default (100) will be used.` })
    }
    if (tipo === 'voice') {
      clip.archetipo = str(get(r, 'archetipo')) || undefined
      clip.pan = num(get(r, 'pan')) ?? undefined
      clip.riverberoPct = num(get(r, 'riverbero_pct')) ?? undefined
      clip.modalita = modalitaRaw === 'sussurrato' ? 'sussurrato' : modalitaRaw === 'normale' ? 'normale' : undefined
      if (modalitaRaw && !clip.modalita) issues.push({ level: 'warning', sheet: sheetName, clipId: rawId, message: `Unknown modalita "${modalitaRaw}" — treated as "normale".` })
      clip.velocitaWpm = num(get(r, 'velocita_wpm')) ?? undefined
      clip.tipoContenuto = contRaw === 'loop' ? 'loop' : contRaw === 'linea' ? 'linea' : undefined
      clip.testo = str(get(r, 'testo')) || undefined
      clip.setAffermazioni = str(get(r, 'set_affermazioni')) || undefined
      clip.intervalloS = num(get(r, 'intervallo_s')) ?? undefined
      clip.cicli = num(get(r, 'cicli')) ?? undefined
      clip.attenuazioneCicloDb = num(get(r, 'attenuazione_ciclo_db')) ?? undefined
      clip.sequenza = str(get(r, 'sequenza')) || undefined
      const eco = boolish(get(r, 'eco'))
      if (eco !== null) clip.eco = eco
      clip.ecoRitardoS = num(get(r, 'eco_ritardo_s')) ?? undefined
      clip.ecoVolumeDb = num(get(r, 'eco_volume_db')) ?? undefined

      if (!clip.archetipo) issues.push({ level: 'warning', sheet: sheetName, clipId: rawId, message: `Voice clip without archetipo — engine default voice will be used.` })
      if (clip.pan !== undefined && (clip.pan < -100 || clip.pan > 100)) issues.push({ level: 'error', sheet: sheetName, clipId: rawId, message: `pan ${clip.pan} out of range −100..+100.` })
      if (!clip.tipoContenuto) {
        issues.push({ level: 'error', sheet: sheetName, clipId: rawId, message: `Voice clip without tipo_contenuto (linea/loop).` })
      } else if (clip.tipoContenuto === 'linea' && !clip.testo) {
        issues.push({ level: 'error', sheet: sheetName, clipId: rawId, message: `tipo_contenuto=linea but "testo" is empty.` })
      } else if (clip.tipoContenuto === 'loop' && !clip.setAffermazioni && !clip.sequenza) {
        issues.push({ level: 'error', sheet: sheetName, clipId: rawId, message: `tipo_contenuto=loop but neither set_affermazioni nor sequenza is filled.` })
      }
      if (clip.eco && clip.ecoRitardoS === undefined) issues.push({ level: 'info', sheet: sheetName, clipId: rawId, message: `eco=on without eco_ritardo_s — app default (+2 s) will be used.` })
      if (clip.eco && clip.ecoVolumeDb === undefined) issues.push({ level: 'info', sheet: sheetName, clipId: rawId, message: `eco=on without eco_volume_db — app default (−8 dB) will be used.` })
    }

    if (clip.crossfadePrecS !== null && tipo !== 'soundscape' && tipo !== 'music') {
      issues.push({ level: 'warning', sheet: sheetName, clipId: rawId, message: `crossfade_prec_s is only defined for Soundscape/Music (Rules §7) — ignored on ${PLAIN_TIPO_LABEL[tipo]}; use fade_out/fade_in.` })
      clip.crossfadePrecS = null
    }
    if (clip.volumeDb === null && tipo !== 'voice') {
      issues.push({ level: 'info', sheet: sheetName, clipId: rawId, message: `No volume_db — the §8.4 default gain map value for ${PLAIN_TIPO_LABEL[tipo]} will be used.` })
    }

    clips.push(clip)
  }

  return { clips, declaredTotal, declaredDurationS }
}

/* --------------------------------------------------------------- validation */

function overlap(a: PlainClip, b: PlainClip): number {
  return Math.min(a.endS, b.endS) - Math.max(a.startS, b.startS)
}

function validateVersion(v: PlainVersion, affirmations: PlainAffirmation[], issues: PlainIssue[]) {
  const S = v.sheet

  // clip count vs declared footer
  if (v.declaredTotal !== null && v.declaredTotal !== v.clips.length) {
    issues.push({ level: 'warning', sheet: S, message: `Footer says TOTALE CLIP ${v.declaredTotal} but ${v.clips.length} clips parsed.` })
  }
  if (v.declaredDurationS !== null) {
    const maxEnd = Math.max(0, ...v.clips.map((c) => c.endS))
    if (maxEnd > v.declaredDurationS) issues.push({ level: 'warning', sheet: S, message: `Clips run to ${secToMmss(maxEnd)} but declared session length is ${secToMmss(v.declaredDurationS)}.` })
  }

  // one traccia = one tipo
  const trackTipo = new Map<string, PlainTipo>()
  for (const c of v.clips) {
    const prev = trackTipo.get(c.traccia)
    if (prev && prev !== c.tipo) issues.push({ level: 'error', sheet: S, clipId: c.clipId, message: `Track "${c.traccia}" mixes tipo ${PLAIN_TIPO_LABEL[prev]} and ${PLAIN_TIPO_LABEL[c.tipo]} — one track must have one type.` })
    else trackTipo.set(c.traccia, c.tipo)
  }

  // same-track overlaps (voice overlaps ACROSS tracks are the design; on the
  // SAME track they'd collide in the Studio)
  const byTrack = new Map<string, PlainClip[]>()
  for (const c of v.clips) {
    const arr = byTrack.get(c.traccia) ?? []
    arr.push(c)
    byTrack.set(c.traccia, arr)
  }
  for (const [name, arr] of byTrack) {
    const sorted = [...arr].sort((a, b) => a.startS - b.startS)
    for (let i = 1; i < sorted.length; i++) {
      const ov = overlap(sorted[i - 1], sorted[i])
      const xf = sorted[i].crossfadePrecS ?? 0
      if (ov > 0 && ov > xf + 0.01) {
        issues.push({ level: 'warning', sheet: S, clipId: sorted[i].clipId, message: `Overlaps ${sorted[i - 1].clipId} by ${ov.toFixed(1)} s on track "${name}" beyond its crossfade (${xf} s).` })
      }
    }
  }

  // Binaural XOR Solfeggio — never simultaneous (guardrail 5, binding)
  const binaurals = v.clips.filter((c) => c.tipo === 'binaural')
  const solfeggi = v.clips.filter((c) => c.tipo === 'solfeggio')
  for (const b of binaurals) for (const s of solfeggi) {
    const ov = overlap(b, s)
    if (ov > 0) issues.push({ level: 'error', sheet: S, clipId: b.clipId, message: `Binaural ${b.clipId} and Solfeggio ${s.clipId} overlap by ${ov.toFixed(1)} s — Binaural XOR Solfeggio is binding (§8.5 rule 5).` })
  }

  // §8.0 phase windows (warnings — the map is binding but POs may derogate
  // consciously, as README §3 does)
  const phaseAt = (sec: number): number | null => {
    const p = v.phases.find((ph) => sec >= ph.startS && sec < ph.endS)
    return p ? p.fase : null
  }
  if (v.phases.length === 6) {
    for (const c of binaurals) {
      const pFrom = phaseAt(c.startS)
      const pTo = phaseAt(Math.max(c.startS, c.endS - 1))
      for (let p = pFrom ?? 0; p <= (pTo ?? 0); p++) {
        if (p === 3 || p === 4) { issues.push({ level: 'warning', sheet: S, clipId: c.clipId, message: `Binaural active in phase ${p} — §8.0 prescribes phases 1–2 (+ optional return 5–6), absent in 3–4.` }); break }
      }
    }
    for (const c of solfeggi) {
      const pFrom = phaseAt(c.startS)
      if (pFrom !== null && pFrom === 4) issues.push({ level: 'warning', sheet: S, clipId: c.clipId, message: `Solfeggio active in phase 4 — §8.0 prescribes phases 5–6, absent in 4.` })
    }
    for (const c of v.clips.filter((x) => x.tipo === 'bilateral')) {
      const pFrom = phaseAt(c.startS)
      if (pFrom !== null && pFrom !== 4) issues.push({ level: 'info', sheet: S, clipId: c.clipId, message: `Bilateral starts in phase ${pFrom} — §8.0 places it in phase 4 (core).` })
    }
  }

  // loop set ranges resolved against Affermazioni (8 ⊂ 12 ⊂ 20)
  for (const c of v.clips) {
    if (c.tipo !== 'voice' || c.tipoContenuto !== 'loop' || !c.setAffermazioni) continue
    const rng = parseSetRange(c.setAffermazioni)
    if (!rng) {
      issues.push({ level: 'error', sheet: S, clipId: c.clipId, message: `Cannot parse set_affermazioni "${c.setAffermazioni}" (expected e.g. "CSI-01..12").` })
      continue
    }
    const ids: string[] = []
    const missing: string[] = []
    for (let n = rng.from; n <= rng.to; n++) {
      const id = `${rng.prefix}-${String(n).padStart(2, '0')}`
      if (affirmations.some((a) => a.id === id)) ids.push(id)
      else missing.push(id)
    }
    // ordine_loop ordering when available
    ids.sort((a, b) => {
      const oa = affirmations.find((x) => x.id === a)?.ordineLoop ?? Number.MAX_SAFE_INTEGER
      const ob = affirmations.find((x) => x.id === b)?.ordineLoop ?? Number.MAX_SAFE_INTEGER
      return oa - ob || a.localeCompare(b)
    })
    c.setRange = { ...rng, ids }
    if (missing.length) issues.push({ level: 'error', sheet: S, clipId: c.clipId, message: `set_affermazioni ${c.setAffermazioni}: missing in the Affermazioni sheet: ${missing.join(', ')}.` })
    if (c.intervalloS === undefined) issues.push({ level: 'info', sheet: S, clipId: c.clipId, message: `Loop clip without intervallo_s — app default will be used.` })
    // does the loop fit its window?
    if (c.intervalloS && ids.length) {
      const cycles = c.cicli ?? 1
      const needed = ids.length * c.intervalloS * cycles
      const window = c.endS - c.startS
      if (needed > window + 0.01) issues.push({ level: 'warning', sheet: S, clipId: c.clipId, message: `Loop needs ~${Math.round(needed)} s (${ids.length} × ${c.intervalloS} s × ${cycles} cicli) but the clip window is ${window} s.` })
    }
    if (c.sequenza) issues.push({ level: 'info', sheet: S, clipId: c.clipId, message: `"sequenza" present — non-uniform loops are accepted but expanded only at seeding (slice 2).` })
  }

  // retired concepts guard: nothing to do — Breathing/synth beds simply don't
  // exist in the 6-type vocabulary; heartbeat arrives as a Soundscape clip.
  const heartbeat = v.clips.find((c) => c.tipo === 'soundscape' && /heartbeat|battito/i.test(c.ambiente ?? ''))
  if (heartbeat) issues.push({ level: 'info', sheet: S, clipId: heartbeat.clipId, message: `Heartbeat modeled as Soundscape (Dec. H) — will draw from the "heartbeat" tag pool.` })
}

function derivePhases(clips: PlainClip[]): PlainPhase[] {
  // Fallback when the README has no phase map: infer boundaries from the fase
  // column (first start / last end per phase number).
  const acc = new Map<number, { start: number; end: number }>()
  for (const c of clips) {
    if (c.faseFrom === null) continue
    for (let p = c.faseFrom; p <= (c.faseTo ?? c.faseFrom); p++) {
      const cur = acc.get(p)
      if (!cur) acc.set(p, { start: c.startS, end: c.endS })
      else { cur.start = Math.min(cur.start, c.startS); cur.end = Math.max(cur.end, c.endS) }
    }
  }
  return [...acc.entries()].sort((a, b) => a[0] - b[0]).map(([fase, w]) => ({ fase, startS: w.start, endS: w.end, label: `Fase ${fase}` }))
}

/* ------------------------------------------------------------------- parse */

export async function parsePlainTimeline(bytes: ArrayBuffer): Promise<PlainParseResult> {
  const X = await loadXlsx()
  let wb: WorkBook
  try {
    wb = X.read(bytes, { type: 'array' })
  } catch (err) {
    return { error: `Not a readable workbook: ${(err as Error).message}` }
  }
  if (!looksLikePlainTimeline(wb, X)) return { error: 'No sheet with a clip grid (clip_id / traccia / tipo / start_s / end_s) found — not a PLAIN Timeline workbook.' }

  const issues: PlainIssue[] = []
  const readmeName = wb.SheetNames.find((n) => /readme|leggimi/i.test(n))
  const meta = parseReadme(readmeName ? wb.Sheets[readmeName] : undefined, X)
  if (!readmeName) issues.push({ level: 'info', message: 'No README sheet — code/title/phase map inferred from the clip sheets.' })

  const affName = findAffirmationSheet(wb)
  const affirmations = affName ? parseAffirmations(wb.Sheets[affName], X, issues) : []

  const versions: PlainVersion[] = []
  for (const name of wb.SheetNames) {
    if (name === readmeName || name === affName) continue
    const ws = wb.Sheets[name]
    if (!ws) continue
    const parsed = parseClipSheet(name, ws, X, issues)
    if (!parsed) continue
    const { clips, declaredTotal, declaredDurationS } = parsed
    if (!clips.length) { issues.push({ level: 'warning', sheet: name, message: 'Clip grid header found but no valid clip rows.' }); continue }

    const maxEnd = Math.max(...clips.map((c) => c.endS))
    const durationS = declaredDurationS ?? maxEnd
    const phasesFromReadme = meta.phases.length === 6 && Math.abs((meta.phases[5]?.endS ?? 0) - durationS) <= 90
    const phases = phasesFromReadme ? meta.phases : derivePhases(clips)
    if (!phasesFromReadme && meta.phases.length) issues.push({ level: 'info', sheet: name, message: 'README phase map does not match this sheet\'s length — phases derived from the fase column instead.' })

    const trackOrder: string[] = []
    const trackMap = new Map<string, PlainTrack>()
    for (const c of clips) {
      if (!trackMap.has(c.traccia)) { trackMap.set(c.traccia, { name: c.traccia, tipo: c.tipo, clips: 0 }); trackOrder.push(c.traccia) }
      trackMap.get(c.traccia)!.clips++
    }

    const v: PlainVersion = {
      sheet: name,
      versionKey: versionKeyFromSheet(name),
      durationS,
      durationMin: Math.round(durationS / 60),
      clips,
      tracks: trackOrder.map((t) => trackMap.get(t)!),
      phases,
      declaredTotal,
      declaredDurationS,
    }
    validateVersion(v, affirmations, issues)
    versions.push(v)
  }

  if (!versions.length) return { error: 'No usable version sheet found in the workbook.' }
  if (!affirmations.length && versions.some((v) => v.clips.some((c) => c.tipoContenuto === 'loop'))) {
    issues.push({ level: 'error', message: 'Loop clips reference affirmation sets but no Affermazioni sheet was found.' })
  }

  // subset sanity 8 ⊂ 12 ⊂ 20 (informative — the file may carry only one version)
  if (affirmations.length) {
    const q = affirmations.filter((a) => a.inQuick).length
    const s = affirmations.filter((a) => a.inStandard).length
    const d = affirmations.filter((a) => a.inDeep).length
    if (q && s && q > s) issues.push({ level: 'warning', sheet: 'Affermazioni', message: `Quick set (${q}) is larger than Standard (${s}) — expected 8 ⊂ 12 ⊂ 20.` })
    if (s && d && s > d) issues.push({ level: 'warning', sheet: 'Affermazioni', message: `Standard set (${s}) is larger than Deep (${d}) — expected 8 ⊂ 12 ⊂ 20.` })
  }

  return {
    timeline: {
      code: meta.code,
      title: meta.title,
      methodology: meta.methodology,
      source: meta.source,
      versions,
      affirmations,
      issues,
    },
  }
}

/* Quick probe used by the import hub to route .xlsx files: PLAIN first, then
   the legacy datasheet parser. Reads only sheet names + header rows. */
export async function probePlainTimeline(bytes: ArrayBuffer): Promise<boolean> {
  const X = await loadXlsx()
  try {
    const wb = X.read(bytes, { type: 'array', sheetRows: 14 })
    return looksLikePlainTimeline(wb, X)
  } catch {
    return false
  }
}
