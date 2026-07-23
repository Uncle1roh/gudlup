/* ============================================================================
   Good Loop — asset pools + random draw (PLAIN format, Rules doc §7.1–7.2)
   The PLAIN clips never name files: a Soundscape clip carries an `ambiente`
   TAG and a Music clip carries its `fase` — the app draws a random file from
   the matching pool at seed/render time.

   Pools ("sensible migration" from the current library layout — no files
   move):
     · Music phase pools  = the existing GLOBAL `assets/music/f1…f6` folders.
     · Soundscape tag pools = the existing `assets/soundscape/<texture>`
       folders (+ filename tokens), matched to the Italian `ambiente` text
       through a synonym dictionary (it/en/pt) — "lago calmo" → lake,
       "vento leggero" → wind …
     · Heartbeat = `assets/heartbeat/*` (Dec. H: ambiente "heartbeat 60 BPM"
       draws here; the Renderer-v3 synth provisional remains the fallback).
   POs can extend tags per file without moving anything via the `asset_meta`
   table (path → extra tags), edited in the Asset Library.

   Draws use a seeded RNG (mulberry32): a render draws fresh by default but
   can be reproduced exactly by fixing the seed — every draw is reported.
   ============================================================================ */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseClient, hasSupabaseEnv } from '../auth/supabaseClient'
import { PHASE_KEYS, type AudioAsset, type PhaseKey } from './assets'

/* ------------------------------------------------------------- tag language */

/** ambiente words → canonical pool tokens (it / en / pt, singular stems). */
const TAG_SYNONYMS: [RegExp, string][] = [
  [/\blag[oh]?|lake|lagoa\b/i, 'lake'],
  [/\bacqua|water|água|agua\b/i, 'water'],
  [/\bvent[oi]|wind|air|aria|brezza|breeze\b/i, 'wind'],
  [/\bfuoco|fire|fogo|camino|fiamm/i, 'fire'],
  [/\bpioggi|rain|chuva|temporal/i, 'rain'],
  [/\bforest|bosco|floresta|selva|wood/i, 'forest'],
  [/\buccell|bird|pássar|passar|cinguett/i, 'birds'],
  [/\bruscell|stream|creek|riacho|torrent/i, 'stream'],
  [/\bond[ae]|wave|mar[e]?\b|ocean|sea\b/i, 'waves'],
  [/\bbibliotec|library|quiet room/i, 'library'],
  [/\bnott[e]|night|noite/i, 'night'],
  [/\bnev[e]|snow|inverno|winter/i, 'snow'],
  [/\bheartbeat|battito|cuore|coração|coracao|bpm/i, 'heartbeat'],
  [/\bcampan|bowl|tibetan/i, 'bowl'],
]

/** Normalize free text ("lago calmo") into canonical pool tokens (['lake']). */
export function normalizeTags(text: string | undefined): string[] {
  if (!text) return []
  const out = new Set<string>()
  for (const [rx, tag] of TAG_SYNONYMS) if (rx.test(text)) out.add(tag)
  // keep unmapped words too (a PO tag like "fabbrica" still matches a file
  // tagged "fabbrica" in asset_meta even without a dictionary entry)
  for (const w of text.toLowerCase().split(/[^a-zà-ú0-9]+/)) {
    if (w.length >= 3 && !/^(calm|legger|leve|soft|dolce|the|del|con)/.test(w)) out.add(w)
  }
  return [...out]
}

/* ------------------------------------------------------------------ pools */

export interface AssetMetaRow { path: string; tags: string[] }

export interface AssetPools {
  musicByPhase: Partial<Record<PhaseKey, AudioAsset[]>>
  /** canonical tag → assets. An asset appears under every tag it carries. */
  soundscapeByTag: Map<string, AudioAsset[]>
  heartbeat: AudioAsset[]
  /** all soundscapes, for last-resort fallback draws. */
  soundscapes: AudioAsset[]
}

/** Tags an asset answers to: its texture folder + filename tokens + meta. */
function assetTags(a: AudioAsset, meta: Map<string, string[]>): string[] {
  const own = new Set<string>()
  if (a.texture) for (const t of normalizeTags(a.texture)) own.add(t)
  for (const t of normalizeTags(a.name.replace(/\.[a-z0-9]+$/i, ''))) own.add(t)
  for (const t of meta.get(a.path) ?? []) for (const n of normalizeTags(t)) own.add(n)
  return [...own]
}

export function buildAssetPools(assets: AudioAsset[], metaRows: AssetMetaRow[] = []): AssetPools {
  const meta = new Map(metaRows.map((r) => [r.path, r.tags]))
  const pools: AssetPools = { musicByPhase: {}, soundscapeByTag: new Map(), heartbeat: [], soundscapes: [] }
  for (const a of assets) {
    if (a.kind === 'music' && a.phase) {
      const arr = pools.musicByPhase[a.phase] ?? []
      arr.push(a)
      pools.musicByPhase[a.phase] = arr
    } else if (a.kind === 'soundscape') {
      pools.soundscapes.push(a)
      for (const t of assetTags(a, meta)) {
        const arr = pools.soundscapeByTag.get(t) ?? []
        arr.push(a)
        pools.soundscapeByTag.set(t, arr)
      }
    } else if (a.kind === 'heartbeat') {
      pools.heartbeat.push(a)
    }
  }
  return pools
}

/* ------------------------------------------------------------------- draw */

/** Deterministic RNG — fix the seed to reproduce a render's draws exactly. */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(arr: T[], rnd: () => number): T {
  return arr[Math.min(arr.length - 1, Math.floor(rnd() * arr.length))]
}

export interface DrawResult { asset: AudioAsset; how: string }

/** Soundscape draw by `ambiente` tag. Best tag-overlap wins; ties draw at
    random. "heartbeat …" goes to the heartbeat pool (Dec. H). */
export function drawSoundscape(pools: AssetPools, ambiente: string, rnd: () => number): DrawResult | null {
  const want = normalizeTags(ambiente)
  if (want.includes('heartbeat')) {
    if (!pools.heartbeat.length) return null
    return { asset: pick(pools.heartbeat, rnd), how: `heartbeat pool (${pools.heartbeat.length} file${pools.heartbeat.length === 1 ? '' : 's'})` }
  }
  // score every soundscape by tag overlap
  const scored = new Map<AudioAsset, number>()
  for (const t of want) {
    for (const a of pools.soundscapeByTag.get(t) ?? []) scored.set(a, (scored.get(a) ?? 0) + 1)
  }
  if (scored.size) {
    const best = Math.max(...scored.values())
    const cands = [...scored.entries()].filter(([, s]) => s === best).map(([a]) => a)
    return { asset: pick(cands, rnd), how: `tag "${ambiente}" → ${cands.length} candidate${cands.length === 1 ? '' : 's'}` }
  }
  if (pools.soundscapes.length) {
    return { asset: pick(pools.soundscapes, rnd), how: `no tag match for "${ambiente}" — drawn from ALL soundscapes` }
  }
  return null
}

/** Music draw from the GLOBAL phase pool (fase 1–6). */
export function drawMusic(pools: AssetPools, fase: number, rnd: () => number): DrawResult | null {
  const key = PHASE_KEYS[Math.min(5, Math.max(0, fase - 1))]
  const pool = pools.musicByPhase[key] ?? []
  if (!pool.length) return null
  return { asset: pick(pool, rnd), how: `phase pool ${key} (${pool.length} file${pool.length === 1 ? '' : 's'})` }
}

/* ------------------------------------------------ asset_meta (Supabase) */

function client(): SupabaseClient {
  if (!hasSupabaseEnv()) throw new Error('Asset tags need the Supabase env.')
  return getSupabaseClient(import.meta.env.VITE_SUPABASE_URL as string, import.meta.env.VITE_SUPABASE_ANON_KEY as string)
}

/** PO tag overrides/extensions per file. Tolerates a missing table (older DB
    — run setup.sql) by returning an empty list. */
export async function loadAssetMeta(): Promise<AssetMetaRow[]> {
  try {
    const { data, error } = await client().from('asset_meta').select('path, tags')
    if (error) return []
    return (data ?? []).map((r: { path: string; tags: string[] | null }) => ({ path: r.path, tags: r.tags ?? [] }))
  } catch {
    return []
  }
}

export async function saveAssetTags(path: string, tags: string[]): Promise<void> {
  const { error } = await client().from('asset_meta').upsert({ path, tags }, { onConflict: 'path' })
  if (error) throw new Error(`Could not save tags: ${error.message}`)
}
