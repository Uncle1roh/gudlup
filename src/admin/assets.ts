/* ============================================================================
   Good Loop — Audio asset library (Supabase Storage, bucket `protocol-audio`)
   The PO's produced library lives under `assets/`:
     assets/music/f1 … f6          — curated music tracks per session phase
     assets/soundscape/<type>/…    — loop textures (wind, fire, rain, lake, …)
     assets/heartbeat/…            — heartbeat file(s), once the PO delivers
     assets/bowl/…                 — singing-bowl strike file(s), once delivered
   (soundscapes tolerate BOTH layouts: a folder per type, or flat files whose
   name starts with the type — `wind-01.mp3`.)

   This module lists and classifies those files, resolves public URLs, decodes
   them into AudioBuffers (cached — a phase-mapped stem is fetched once per
   session even across renders), and defines the per-protocol AssetMap the
   admin edits in the Asset Library screen and Renderer v3 consumes.
   ============================================================================ */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseClient, hasSupabaseEnv } from '../auth/supabaseClient'
import { SAMPLE_RATE } from '../studio/multitrack'

export const ASSET_BUCKET = 'protocol-audio'
export const ASSET_ROOT = 'assets'

export type AssetKind = 'music' | 'soundscape' | 'heartbeat' | 'bowl' | 'other'
export type PhaseKey = 'f1' | 'f2' | 'f3' | 'f4' | 'f5' | 'f6'
export const PHASE_KEYS: PhaseKey[] = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6']

export interface AudioAsset {
  /** Storage path within the bucket, e.g. `assets/music/f1/dawn-pad.mp3`. */
  path: string
  name: string
  kind: AssetKind
  /** Music: the phase folder it belongs to. */
  phase?: PhaseKey
  /** Soundscape: the texture type (wind, fire, rain, lake, …). */
  texture?: string
  publicUrl: string
  sizeBytes?: number
}

/** The admin's phase → asset assignment for ONE protocol; stored on the
    catalog entry and consumed by Renderer v3. Values are storage paths. */
export interface AssetMap {
  music: Partial<Record<PhaseKey, string>>
  soundscape: Partial<Record<PhaseKey, string>>
  heartbeat?: string
  bowl?: string
}

export function emptyAssetMap(): AssetMap {
  return { music: {}, soundscape: {} }
}

/** How many of the 6 phases have a music + soundscape assignment. */
export function assetMapCoverage(map: AssetMap | undefined): { music: number; soundscape: number } {
  if (!map) return { music: 0, soundscape: 0 }
  return {
    music: PHASE_KEYS.filter((k) => map.music[k]).length,
    soundscape: PHASE_KEYS.filter((k) => map.soundscape[k]).length,
  }
}

/* ------------------------------------------------------------- listing */

function client(): SupabaseClient {
  if (!hasSupabaseEnv()) throw new Error('The asset library needs the Supabase env (VITE_SUPABASE_URL / _ANON_KEY).')
  return getSupabaseClient(import.meta.env.VITE_SUPABASE_URL as string, import.meta.env.VITE_SUPABASE_ANON_KEY as string)
}

const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|flac|aac)$/i

interface Entry { name: string; id: string | null; metadata?: { size?: number } | null }

async function listDir(sb: SupabaseClient, prefix: string): Promise<Entry[]> {
  const { data, error } = await sb.storage.from(ASSET_BUCKET).list(prefix, { limit: 500, sortBy: { column: 'name', order: 'asc' } })
  if (error) throw new Error(`Could not list ${prefix}: ${error.message}`)
  return (data ?? []) as Entry[]
}

function publicUrl(sb: SupabaseClient, path: string): string {
  return sb.storage.from(ASSET_BUCKET).getPublicUrl(path).data.publicUrl
}

/** Texture name from a flat soundscape filename: "wind-01.mp3" → "wind". */
function textureFromName(name: string): string {
  return name.replace(AUDIO_EXT, '').split(/[-_.\d]/)[0].toLowerCase() || 'other'
}

/** List and classify the whole PO asset library. One walk, tolerant of
    missing folders (heartbeat/bowl may not exist until the PO delivers). */
export async function listAssets(): Promise<AudioAsset[]> {
  const sb = client()
  const out: AudioAsset[] = []

  // music/f1..f6
  for (const phase of PHASE_KEYS) {
    const prefix = `${ASSET_ROOT}/music/${phase}`
    let entries: Entry[] = []
    try { entries = await listDir(sb, prefix) } catch { continue }
    for (const e of entries) {
      if (e.id === null || !AUDIO_EXT.test(e.name)) continue
      const path = `${prefix}/${e.name}`
      out.push({ path, name: e.name, kind: 'music', phase, publicUrl: publicUrl(sb, path), sizeBytes: e.metadata?.size })
    }
  }

  // soundscape/<type>/* or soundscape/<type>-nn.mp3
  try {
    const top = await listDir(sb, `${ASSET_ROOT}/soundscape`)
    for (const e of top) {
      if (e.id === null) {
        const prefix = `${ASSET_ROOT}/soundscape/${e.name}`
        const files = await listDir(sb, prefix)
        for (const f of files) {
          if (f.id === null || !AUDIO_EXT.test(f.name)) continue
          const path = `${prefix}/${f.name}`
          out.push({ path, name: f.name, kind: 'soundscape', texture: e.name.toLowerCase(), publicUrl: publicUrl(sb, path), sizeBytes: f.metadata?.size })
        }
      } else if (AUDIO_EXT.test(e.name)) {
        const path = `${ASSET_ROOT}/soundscape/${e.name}`
        out.push({ path, name: e.name, kind: 'soundscape', texture: textureFromName(e.name), publicUrl: publicUrl(sb, path), sizeBytes: e.metadata?.size })
      }
    }
  } catch { /* folder may not exist */ }

  // heartbeat / bowl (PO deliverables — tolerate absence)
  for (const kind of ['heartbeat', 'bowl'] as const) {
    try {
      const entries = await listDir(sb, `${ASSET_ROOT}/${kind}`)
      for (const e of entries) {
        if (e.id === null || !AUDIO_EXT.test(e.name)) continue
        const path = `${ASSET_ROOT}/${kind}/${e.name}`
        out.push({ path, name: e.name, kind, publicUrl: publicUrl(sb, path), sizeBytes: e.metadata?.size })
      }
    } catch { /* not delivered yet */ }
  }

  return out
}

/** Group soundscape assets by texture for the browse UI. */
export function groupSoundscapes(assets: AudioAsset[]): Map<string, AudioAsset[]> {
  const map = new Map<string, AudioAsset[]>()
  for (const a of assets) {
    if (a.kind !== 'soundscape') continue
    const key = a.texture ?? 'other'
    const arr = map.get(key) ?? []
    arr.push(a)
    map.set(key, arr)
  }
  return new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])))
}

/* ---------------------------------------------------- fetch + decode */

const bufferCache = new Map<string, Promise<AudioBuffer>>()
let decoder: AudioContext | null = null

function getDecoder(): AudioContext {
  if (!decoder || decoder.state === 'closed') decoder = new AudioContext({ sampleRate: SAMPLE_RATE })
  return decoder
}

/** Fetch + decode a bucket asset to a 44.1 kHz AudioBuffer (cached by path). */
export function fetchAssetBuffer(path: string): Promise<AudioBuffer> {
  let p = bufferCache.get(path)
  if (!p) {
    p = (async () => {
      const url = publicUrl(client(), path)
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Fetch ${path}: HTTP ${res.status}`)
      const bytes = await res.arrayBuffer()
      return await getDecoder().decodeAudioData(bytes)
    })()
    p.catch(() => bufferCache.delete(path)) // don't cache failures
    bufferCache.set(path, p)
  }
  return p
}

/** Public URL for a bucket path (for sample clips in the Studio). */
export function assetPublicUrl(path: string): string {
  return publicUrl(client(), path)
}

/** Human file size. */
export function fmtBytes(n: number | undefined): string {
  if (!n) return ''
  if (n > 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.round(n / 1024)} KB`
}
