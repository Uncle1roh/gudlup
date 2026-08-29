/* ============================================================================
   Good Loop — the Excel `fx` column
   Until now the only effects an Excel could ask for were the two hard-wired
   voice columns: `eco` (+ eco_ritardo_s / eco_volume_db) and `riverbero_pct`.
   Everything else in the Studio's effect rack — Harmonizer, Saturation,
   Filter, and any non-default echo/reverb tuning — could only be dialled in by
   hand after the import, and was lost the moment the sheet was re-imported.

   ONE column now carries them all:

     fx
     ─────────────────────────────────────────────────────────────────────────
     eco                                     the effect at its defaults
     eco + riverbero                         two effects (also ";" or a comma)
     eco(ritardo=0.8, mix=35%)               parameters in brackets
     riverbero(coda=3.2s, mix=25%)
     coro(voci=4, apertura=28)
     filtro(modo=passa-basso, taglio=4kHz)

   Names and parameters are accepted in Italian and in English, because the
   POs write the sheets in Italian and the engine speaks English. Percentages,
   "s", "Hz"/"kHz", "on"/"off" and decimal commas all parse. Anything out of
   range is CLAMPED to what the effect actually accepts (never dropped
   silently) and anything unrecognised is reported as an import issue.

   `fx` is a statement about the TRACK, not about the single clip: effects in
   this engine live on the lane. Write it once on the track's first clip; if
   two clips of the same `traccia` disagree, the last one read wins and the
   import says so.
   ============================================================================ */

import { EFFECTS_META, defaultEffects, type EffectKind, type TrackEffect } from '../studio/effects'

export interface PlainFxSpec {
  kind: EffectKind
  /** Only the parameters the cell actually named — the rest keep defaults. */
  params: Record<string, number>
}

export interface PlainFxParse {
  fx: PlainFxSpec[]
  /** Human-readable complaints (unknown effect, unknown parameter, clamp). */
  problems: string[]
}

/* ------------------------------------------------------------------ names */

const norm = (s: string): string =>
  s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[\s_·.-]/g, '')

const KIND_ALIASES: Record<string, EffectKind> = {}
const alias = (kind: EffectKind, ...names: string[]) => { for (const n of names) KIND_ALIASES[norm(n)] = kind }
alias('echo', 'echo', 'eco', 'emotional echo', 'eco emotivo', 'eco emozionale', 'delay')
alias('reverb', 'reverb', 'riverbero', 'riverb', 'reverbero')
alias('harmonizer', 'harmonizer', 'armonizzatore', 'coro', 'coral', 'multiple voice', 'voci multiple')
alias('saturation', 'saturation', 'saturazione', 'warmth', 'calore', 'drive')
alias('filter', 'filter', 'filtro', 'eq')

/** Every effect name the `fx` column accepts, for error messages and docs. */
export const FX_NAMES: Record<EffectKind, string[]> = {
  echo: ['eco', 'echo'],
  reverb: ['riverbero', 'reverb'],
  harmonizer: ['coro', 'harmonizer', 'armonizzatore'],
  saturation: ['saturazione', 'saturation'],
  filter: ['filtro', 'filter'],
}

/* ------------------------------------------------------------- parameters */

/** Excel word → the engine's parameter key, per effect. */
const PARAM_ALIASES: Record<EffectKind, Record<string, string>> = {
  echo: {
    delay: 'delaySec', delaysec: 'delaySec', delays: 'delaySec', ritardo: 'delaySec', ritardos: 'delaySec',
    feedback: 'feedback', ripetizioni: 'feedback', repeats: 'feedback',
    tone: 'tone', tono: 'tone', calore: 'tone', warmth: 'tone', tonehz: 'tone',
    mix: 'mix', livello: 'mix', level: 'mix', quantita: 'mix',
  },
  reverb: {
    decay: 'decaySec', decaysec: 'decaySec', decays: 'decaySec', coda: 'decaySec', decadimento: 'decaySec',
    mix: 'mix', livello: 'mix', level: 'mix', quantita: 'mix',
  },
  harmonizer: {
    voices: 'voices', voci: 'voices',
    spread: 'spreadCents', spreadcents: 'spreadCents', apertura: 'spreadCents', cents: 'spreadCents', centesimi: 'spreadCents',
    octave: 'octave', ottava: 'octave',
    mix: 'mix', livello: 'mix', level: 'mix', quantita: 'mix',
  },
  saturation: {
    drive: 'drive', spinta: 'drive', gain: 'drive',
    mix: 'mix', livello: 'mix', level: 'mix', quantita: 'mix',
  },
  filter: {
    mode: 'mode', modo: 'mode', tipo: 'mode',
    cutoff: 'cutoff', taglio: 'cutoff', freq: 'cutoff', frequenza: 'cutoff', hz: 'cutoff',
  },
}

const META = new Map(EFFECTS_META.map((m) => [m.kind, m]))

/** "50%" → 0.5 · "2,5 s" → 2.5 · "4 kHz" → 4000 · "on" → 1 · "passa-alto" → 1 */
function parseValue(key: string, raw: string): number | null {
  const s = raw.trim()
  if (!s) return null
  const w = norm(s)
  if (key === 'mode') {
    if (/^(hp|high|highpass|passaalto|alto)$/.test(w)) return 1
    if (/^(lp|low|lowpass|passabasso|basso)$/.test(w)) return 0
  }
  if (/^(on|si|yes|true|attivo|acceso)$/.test(w)) return 1
  if (/^(off|no|false|spento)$/.test(w)) return 0
  const m = s.replace(',', '.').match(/-?\d+(?:\.\d+)?/)
  if (!m) return null
  let v = parseFloat(m[0])
  if (/khz/.test(w)) v *= 1000
  else if (s.includes('%')) v /= 100
  /* A mix written as a bare 30 means 30%, not 3000%: the sliders are 0..1 and
     the sheets already say "riverbero_pct" elsewhere, so the percent reading
     is the one the POs mean. */
  if ((key === 'mix' || key === 'feedback') && v > 1) v /= 100
  return Number.isFinite(v) ? v : null
}

/* ----------------------------------------------------------------- parsing */

/** Split on "+", ";", newlines and commas that are OUTSIDE brackets — the
    commas inside `eco(ritardo=0.8, mix=35%)` belong to the parameters. */
function splitEntries(raw: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of raw) {
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1)
    if (depth === 0 && (ch === '+' || ch === ';' || ch === ',' || ch === '\n')) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim()).filter(Boolean)
}

/** Read one `fx` cell. Never throws: whatever it could not read comes back in
    `problems` so the import can report it instead of guessing. */
export function parseFxCell(raw: string): PlainFxParse {
  const problems: string[] = []
  const fx: PlainFxSpec[] = []
  const cell = (raw ?? '').trim()
  if (!cell) return { fx, problems }
  /* "off" / "no" / "-" in the fx column means exactly that: no effects. */
  if (/^(off|no|none|nessuno|nessuna|-|0)$/i.test(cell)) return { fx, problems }

  for (const entry of splitEntries(cell)) {
    const m = entry.match(/^([^([]+)(?:[([]([^)\]]*)[)\]])?$/)
    if (!m) { problems.push(`"${entry}" non è leggibile (scrivi "eco" oppure "eco(ritardo=0.8, mix=35%)").`); continue }
    const kind = KIND_ALIASES[norm(m[1])]
    if (!kind) {
      problems.push(`effetto sconosciuto "${m[1].trim()}" — effetti disponibili: ${Object.values(FX_NAMES).map((n) => n[0]).join(', ')}.`)
      continue
    }
    const params: Record<string, number> = {}
    const meta = META.get(kind)
    for (const pair of (m[2] ?? '').split(',')) {
      const p = pair.trim()
      if (!p) continue
      const kv = p.match(/^([^=:]+)[=:](.*)$/)
      if (!kv) { problems.push(`${FX_NAMES[kind][0]}: "${p}" non è una coppia parametro=valore.`); continue }
      const key = PARAM_ALIASES[kind][norm(kv[1])]
      if (!key) {
        problems.push(`${FX_NAMES[kind][0]}: parametro sconosciuto "${kv[1].trim()}" — validi: ${[...new Set(Object.values(PARAM_ALIASES[kind]))].join(', ')}.`)
        continue
      }
      const v = parseValue(key, kv[2])
      if (v === null) { problems.push(`${FX_NAMES[kind][0]}: valore "${kv[2].trim()}" non numerico per ${key}.`); continue }
      const pm = meta?.params.find((x) => x.key === key)
      const clamped = pm ? Math.min(pm.max, Math.max(pm.min, v)) : v
      if (pm && clamped !== v) problems.push(`${FX_NAMES[kind][0]}: ${key} ${v} fuori scala (${pm.min}…${pm.max}) — portato a ${clamped}.`)
      params[key] = clamped
    }
    /* Same effect twice in one cell: merge, last value wins. */
    const already = fx.find((f) => f.kind === kind)
    if (already) Object.assign(already.params, params)
    else fx.push({ kind, params })
  }
  return { fx, problems }
}

/* ---------------------------------------------------------------- applying */

/** Turn the parsed specs into an enabled effect rack, on top of whatever the
    lane already carries (the legacy `eco` / `riverbero_pct` columns). */
export function applyFxSpecs(existing: TrackEffect[] | undefined, specs: PlainFxSpec[]): TrackEffect[] {
  const base = existing ?? defaultEffects()
  if (!specs.length) return base
  return base.map((e) => {
    const spec = specs.find((s) => s.kind === e.kind)
    return spec ? { ...e, enabled: true, params: { ...e.params, ...spec.params } } : e
  })
}

/** One line for the import notes: "Emotional Echo (Delay 0.80 s) · Reverb". */
export function describeFx(specs: PlainFxSpec[]): string {
  return specs.map((s) => {
    const meta = META.get(s.kind)
    const named = Object.entries(s.params).map(([k, v]) => {
      const pm = meta?.params.find((x) => x.key === k)
      return `${pm?.label ?? k} ${pm ? pm.fmt(v) : v}`
    })
    return `${meta?.label ?? s.kind}${named.length ? ` (${named.join(', ')})` : ''}`
  }).join(' · ')
}

/** Stable signature — two clips asking for the same rack agree. */
export function fxKey(specs: PlainFxSpec[] | undefined): string {
  if (!specs?.length) return ''
  return [...specs]
    .sort((a, b) => a.kind.localeCompare(b.kind))
    .map((s) => `${s.kind}:${Object.entries(s.params).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join(',')}`)
    .join('|')
}
