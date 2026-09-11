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
  // 'gong' belongs here too: a gong strike is the same kind of accent, and
  // without it a clip asking for one was treated as a one-shot by the Studio
  // but still drawn from the general soundscape pool.
  [/\bcampan|bowl|tibetan|gong/i, 'bowl'],
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
  /**
   * Singing-bowl strikes.
   *
   * This pool did not exist. `listAssets` classified everything under
   * `assets/bowl/` as `kind: 'bowl'` and `buildAssetPools` then had no branch
   * for it, so every bowl file the POs delivered was dropped on the floor
   * between the two — visible in the Asset Library, absent from every draw.
   */
  bowl: AudioAsset[]
  /** GENERAL soundscapes only — specials excluded. Last-resort fallback draws. */
  soundscapes: AudioAsset[]
  /** paths of every special-layer file (bowl / heartbeat), wherever it is filed. */
  specialPaths: Set<string>
}

/** Layers a clip must ASK for by name — never handed out by a general draw. */
const SPECIAL_TAGS = ['heartbeat', 'bowl'] as const
type SpecialTag = (typeof SPECIAL_TAGS)[number]

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
  const pools: AssetPools = { musicByPhase: {}, soundscapeByTag: new Map(), heartbeat: [], bowl: [], soundscapes: [], specialPaths: new Set() }
  for (const a of assets) {
    if (a.kind === 'music' && a.phase) {
      const arr = pools.musicByPhase[a.phase] ?? []
      arr.push(a)
      pools.musicByPhase[a.phase] = arr
    } else if (a.kind === 'soundscape') {
      const tags = assetTags(a, meta)
      /* A singing bowl filed under `assets/soundscape/` is still a bowl: it is
         a struck accent, not a texture, and it must never turn up in a mix that
         asked for an ambiente. It joins its own special pool (so a clip that
         DOES ask for a campana finds it) and stays out of `soundscapes`, the
         last-resort pool a no-match ambiente falls back to. */
      const special = SPECIAL_TAGS.find((t) => tags.includes(t))
      if (special) {
        pools.specialPaths.add(a.path)
        pools[special].push(a)
      } else {
        pools.soundscapes.push(a)
      }
      for (const t of tags) {
        const arr = pools.soundscapeByTag.get(t) ?? []
        arr.push(a)
        pools.soundscapeByTag.set(t, arr)
      }
    } else if (a.kind === 'heartbeat' || a.kind === 'bowl') {
      pools.specialPaths.add(a.path)
      pools[a.kind].push(a)
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

/* ------------------------------------------------------- no-repeat ledger */

/* A protocol must never play the same music file twice while its phase pool
   still holds an unused one (PO decision): six clips drawing independently
   from a four-file pool used to land the same track three times. The ledger
   is the draw memory of ONE protocol — pass the same instance to every draw
   of a seed/render and the draws become sampling WITHOUT replacement, falling
   back to the least-used file (never the immediately previous one) once the
   pool is exhausted. Soundscapes share the mechanism but tolerate reuse: a
   tag pool is often a single file, and repeating a texture across phases is
   frequently the intent. */
export interface DrawLedger {
  /** asset path → how many clips of this protocol already drew it */
  counts: Map<string, number>
  /** pool key → the path the previous clip of that pool got */
  last: Map<string, string>
  /**
   * Paths this draw must NOT return while the pool holds anything else.
   *
   * This is what makes the Studio's 🎲 re-roll a re-roll. A count alone cannot
   * express it: the file a clip is playing right now is, by every other
   * measure, the least-used candidate for that clip, so the freshness rule
   * handed it straight back and the button looked dead.
   */
  avoid: Set<string>
}

export function newDrawLedger(): DrawLedger {
  return { counts: new Map(), last: new Map(), avoid: new Set() }
}

/** Draw from `cands` preferring files this protocol has not used yet; among
    equally-used files, never return the one the previous clip of the same pool
    got (unless it is the only candidate). `reused` = the pool was exhausted and
    a file had to come round again. */
function pickFresh(
  cands: AudioAsset[],
  rnd: () => number,
  ledger: DrawLedger | undefined,
  poolKey: string,
): { asset: AudioAsset; reused: boolean } {
  if (!ledger) return { asset: pick(cands, rnd), reused: false }
  // an explicit re-roll rules its own current files out — unless they are all
  // the pool has, in which case handing one back IS the honest answer
  const open = ledger.avoid.size ? cands.filter((a) => !ledger.avoid.has(a.path)) : cands
  const exhausted = open.length === 0
  const usable = exhausted ? cands : open
  let fewest = Infinity
  for (const a of usable) fewest = Math.min(fewest, ledger.counts.get(a.path) ?? 0)
  let tier = usable.filter((a) => (ledger.counts.get(a.path) ?? 0) === fewest)
  const prev = ledger.last.get(poolKey)
  if (tier.length > 1 && prev) {
    const noRepeat = tier.filter((a) => a.path !== prev)
    if (noRepeat.length) tier = noRepeat
  }
  const asset = pick(tier, rnd)
  ledger.counts.set(asset.path, (ledger.counts.get(asset.path) ?? 0) + 1)
  ledger.last.set(poolKey, asset.path)
  return { asset, reused: exhausted || fewest > 0 }
}

function poolNote(n: number, reused: boolean): string {
  return `${n} file${n === 1 ? '' : 's'}${reused ? ' — pool exhausted, file reused' : ''}`
}

export interface DrawResult { asset: AudioAsset; how: string }

/**
 * Everything eligible for a named special layer.
 *
 * A PO can reasonably file the heartbeat under `assets/heartbeat/` OR under
 * `assets/soundscape/heartbeat/`, and both readings of the folder convention
 * are defensible. The old code only looked in the first and returned null
 * rather than falling through, so a file sitting in plain sight in the second
 * produced a silent clip and a note saying the PO had not delivered it. Both
 * places count now; nothing has to be moved.
 */
function specialCandidates(pools: AssetPools, tag: SpecialTag): AudioAsset[] {
  const dedicated = tag === 'heartbeat' ? pools.heartbeat : pools.bowl
  const byTag = pools.soundscapeByTag.get(tag) ?? []
  const seen = new Set(dedicated.map((a) => a.path))
  return [...dedicated, ...byTag.filter((a) => !seen.has(a.path))]
}

/** Soundscape draw by `ambiente` tag. Best tag-overlap wins; ties draw at
    random, preferring files this protocol has not used yet (`ledger`).
    "heartbeat …" and "campana tibetana …" go to their own pools (Dec. H). */
export function drawSoundscape(pools: AssetPools, ambiente: string, rnd: () => number, ledger?: DrawLedger): DrawResult | null {
  const want = normalizeTags(ambiente)
  /* A special layer NEVER falls back to a general soundscape. A clip asking
     for a singing bowl used to score zero against the texture tags and then be
     handed a lake or a wind from the last-resort pool — the wrong sound,
     delivered silently, which is worse than the silence it replaced. */
  for (const tag of SPECIAL_TAGS) {
    if (!want.includes(tag)) continue
    const cands = specialCandidates(pools, tag)
    if (!cands.length) return null
    const d = pickFresh(cands, rnd, ledger, `ss:${tag}`)
    return { asset: d.asset, how: `${tag} pool (${poolNote(cands.length, d.reused)})` }
  }
  /* score every soundscape by tag overlap — specials excluded, we are past the
     only branch that may serve them */
  const scored = new Map<AudioAsset, number>()
  for (const t of want) {
    for (const a of pools.soundscapeByTag.get(t) ?? []) {
      if (pools.specialPaths.has(a.path)) continue
      scored.set(a, (scored.get(a) ?? 0) + 1)
    }
  }
  if (scored.size) {
    const best = Math.max(...scored.values())
    const cands = [...scored.entries()].filter(([, s]) => s === best).map(([a]) => a)
    const d = pickFresh(cands, rnd, ledger, `ss:${want.join('+')}`)
    return { asset: d.asset, how: `tag "${ambiente}" → ${poolNote(cands.length, d.reused)}` }
  }
  if (pools.soundscapes.length) {
    const d = pickFresh(pools.soundscapes, rnd, ledger, 'ss:*')
    return { asset: d.asset, how: `no tag match for "${ambiente}" — drawn from ALL soundscapes (${poolNote(pools.soundscapes.length, d.reused)})` }
  }
  return null
}

/** Music draw from the GLOBAL phase pool (fase 1–6). With a `ledger` the same
    file never comes back while the pool still has an unused one. */
export function drawMusic(pools: AssetPools, fase: number, rnd: () => number, ledger?: DrawLedger): DrawResult | null {
  const key = PHASE_KEYS[Math.min(5, Math.max(0, fase - 1))]
  const pool = pools.musicByPhase[key] ?? []
  if (!pool.length) return null
  const d = pickFresh(pool, rnd, ledger, `music:${key}`)
  return { asset: d.asset, how: `phase pool ${key} (${poolNote(pool.length, d.reused)})` }
}

/* ---- how long a file plays, without decoding it -------------------------

   Listing gives a byte count, not a duration, and this estimate decides HOW
   MANY songs a clip queues. Getting it wrong in the lenient direction is the
   bug the POs reported as "only one song": a music clip that thinks its single
   song is long enough stops drawing, and since a song never loops the rest of
   the phase falls silent.

   The direction that is safe is therefore the SHORT one — under-estimate, queue
   one song too many, and let the renderer cut what it does not need. So assume
   the HIGHEST bitrate a file plausibly carries: dividing by a big number yields
   a small duration. The library is ripped albums at 256–320 kbps, so the old
   192 assumption computed durations ~1.7× too LONG and starved the draw. A
   19 MB track came out at 13 minutes and "covered" a whole phase on its own.

   Uncompressed formats are not a bitrate guess at all — they are arithmetic,
   and guessing them as MP3 was off by a factor of three or more (a 48 MB WAV
   is ~4½ minutes, not the 15 the old code clamped it to). */
const ASSUMED_KBPS = 320
/** 44.1 kHz · 2 ch · 16-bit — the shape of everything in the PO library. */
const PCM_BYTES_PER_SEC = 44100 * 2 * 2
const FALLBACK_SONG_SEC = 120
/** Nothing in a music pool is a 20-second sting or a 15-minute set. */
const MIN_SONG_SEC = 20
const MAX_SONG_SEC = 900

export function estimateAssetSeconds(a: AudioAsset): number {
  if (!a.sizeBytes) return FALLBACK_SONG_SEC
  const ext = /\.([a-z0-9]+)$/i.exec(a.name)?.[1]?.toLowerCase() ?? ''
  let sec: number
  if (ext === 'wav' || ext === 'aif' || ext === 'aiff') sec = a.sizeBytes / PCM_BYTES_PER_SEC
  // FLAC/ALAC land around half of PCM; still arithmetic, not a bitrate guess
  else if (ext === 'flac' || ext === 'alac' || ext === 'm4a') sec = a.sizeBytes / (PCM_BYTES_PER_SEC * 0.6)
  else sec = (a.sizeBytes * 8) / (ASSUMED_KBPS * 1000)
  return Math.max(MIN_SONG_SEC, Math.min(MAX_SONG_SEC, sec))
}

/** Queue past the window before stopping. The estimate is a byte count, not a
    decode, so it is only ever approximately right — and the two errors are not
    symmetric. One song too many costs a fetch the renderer then cuts; one too
    few is audible silence in the middle of a phase. */
const OVERDRAW = 1.25

/**
 * Draw enough DIFFERENT songs to cover `seconds`, up to `max`.
 *
 * One song per music clip was the phase-4 bug: a clip longer than the song
 * looped it, and the POs heard the same track start again inside one clip.
 * The ledger keeps the picks distinct across the whole protocol, and the
 * renderer crossfades them in sequence and cuts the last at the clip end.
 */
export function drawMusicPlaylist(
  pools: AssetPools,
  fase: number,
  seconds: number,
  max: number,
  rnd: () => number,
  ledger?: DrawLedger,
): { assets: AudioAsset[]; how: string; estimatedSec: number; short: boolean } | null {
  const key = PHASE_KEYS[Math.min(5, Math.max(0, fase - 1))]
  const pool = pools.musicByPhase[key] ?? []
  if (!pool.length) return null
  const target = seconds * OVERDRAW
  // a re-roll excludes the songs this clip is already playing, so the number of
  // DIFFERENT files the queue can still hold is the open part of the pool
  const distinct = ledger?.avoid.size ? Math.max(1, pool.filter((a) => !ledger.avoid.has(a.path)).length) : pool.length
  const assets: AudioAsset[] = []
  let covered = 0
  while (covered < target && assets.length < max) {
    const d = pickFresh(pool, rnd, ledger, `music:${key}`)
    assets.push(d.asset)
    covered += estimateAssetSeconds(d.asset)
    // the pool has nothing new left: stop rather than queue the same file twice
    if (assets.length >= distinct) break
  }
  // "short" is measured against the REAL window, not the padded target
  const short = covered < seconds
  return {
    assets,
    how: `phase pool ${key} (${pool.length} file${pool.length === 1 ? '' : 's'}) — ${assets.length} brano/i per ~${Math.round(seconds)}s${short ? `, stimati solo ~${Math.round(covered)}s` : ''}`,
    estimatedSec: covered,
    short,
  }
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

/** Drop a file's tag row. Called when the file itself is deleted, so the table
    does not accumulate rows for paths that no longer exist. */
export async function deleteAssetMeta(path: string): Promise<void> {
  const { error } = await client().from('asset_meta').delete().eq('path', path)
  if (error) throw new Error(`Could not remove tags: ${error.message}`)
}
