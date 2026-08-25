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

  // music/f1..f6 folders, plus flat files whose name carries the phase
  // ("f1_dawn.mp3", "F2-strings.mp3") directly under assets/music
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
  try {
    const flat = await listDir(sb, `${ASSET_ROOT}/music`)
    for (const e of flat) {
      if (e.id === null || !AUDIO_EXT.test(e.name)) continue // folders handled above
      const m = /^f([1-6])[-_. ]/i.exec(e.name)
      const path = `${ASSET_ROOT}/music/${e.name}`
      out.push({
        path, name: e.name, kind: 'music',
        phase: m ? (`f${m[1]}` as PhaseKey) : undefined, // unprefixed → listed under every phase's "Other" group
        publicUrl: publicUrl(sb, path), sizeBytes: e.metadata?.size,
      })
    }
  } catch { /* folder may not exist */ }

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

/* ============================================================ upload / delete

   Adding and removing library files from the console rather than from the
   Supabase dashboard. Two things make this more than a storage call:

   · A file's PATH is its classification. `assets/music/f4/x.mp3` IS a phase-4
     music track — there is no separate record saying so, which is why
     `listAssets()` can walk the bucket and classify everything it finds. So an
     upload has to build the path from a chosen target, not from wherever the
     file happened to come from, and the name has to be sanitised because it
     becomes part of a URL.

   · Deleting a file that a protocol's AssetMap still points at would leave the
     renderer resolving a path that 404s — silently, at render time, long after
     anyone connected the two. So a delete is not one operation: it removes the
     object, its `asset_meta` row, and every AssetMap reference to it.
   ---------------------------------------------------------------------------- */

/** Where an uploaded file should land. The path is derived from this. */
export type UploadTarget =
  | { kind: 'music'; phase: PhaseKey }
  | { kind: 'soundscape'; texture: string }
  | { kind: 'heartbeat' }
  | { kind: 'bowl' }

/** Bucket paths are URLs. Keep them boring: lowercase, ASCII, no spaces. */
export function sanitizeFileName(name: string): string {
  const dot = name.lastIndexOf('.')
  /* `dot > 0` treated a dotfile-style name (".mp3") as having no extension,
     so it sanitised to "mp3" — a file with no extension at all, which
     `listAssets()` filters out. The file would upload, vanish from the list,
     and be impossible to map or delete from the console. A missing STEM is
     the recoverable half; a missing extension is not. */
  const hasExt = dot > -1 && dot < name.length - 1
  const stem = (hasExt ? name.slice(0, dot) : name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const ext = (hasExt ? name.slice(dot + 1) : '').toLowerCase().replace(/[^a-z0-9]/g, '')
  return `${stem || 'audio'}${ext ? `.${ext}` : ''}`
}

/** A texture folder name: the same rules, since it is a path segment too. */
export function sanitizeTexture(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function targetPath(target: UploadTarget, fileName: string): string {
  const file = sanitizeFileName(fileName)
  switch (target.kind) {
    case 'music': return `${ASSET_ROOT}/music/${target.phase}/${file}`
    case 'soundscape': return `${ASSET_ROOT}/soundscape/${sanitizeTexture(target.texture) || 'other'}/${file}`
    default: return `${ASSET_ROOT}/${target.kind}/${file}`
  }
}

/** 100 MB is Supabase's default object ceiling; a library loop is a few MB. */
export const MAX_ASSET_BYTES = 100 * 1024 * 1024

export interface UploadCheck { ok: boolean; reason?: string }

/** What is wrong with this file, in words, before anything is uploaded. */
export function checkUpload(file: File): UploadCheck {
  if (!AUDIO_EXT.test(file.name)) {
    return { ok: false, reason: `«${file.name}» non è un file audio (mp3, wav, ogg, m4a, flac, aac).` }
  }
  if (file.size === 0) return { ok: false, reason: `«${file.name}» è vuoto.` }
  if (file.size > MAX_ASSET_BYTES) {
    return { ok: false, reason: `«${file.name}» supera i ${Math.round(MAX_ASSET_BYTES / (1024 * 1024))} MB.` }
  }
  return { ok: true }
}

export interface UploadResult { path: string; replaced: boolean }

/**
 * Put one file in the library.
 *
 * `upsert: false` on purpose: an accidental re-upload must not silently
 * replace a file other protocols are already mapped to. The caller decides,
 * and passes `replace` when it has asked.
 */
export async function uploadAsset(
  file: File,
  target: UploadTarget,
  opts: { replace?: boolean } = {},
): Promise<UploadResult> {
  const check = checkUpload(file)
  if (!check.ok) throw new Error(check.reason)

  const sb = client()
  const path = targetPath(target, file.name)

  if (!opts.replace) {
    const existing = await pathExists(sb, path)
    if (existing) {
      throw new Error(`Esiste già un file in ${path}. Rinominalo, oppure conferma la sostituzione.`)
    }
  }

  const { error } = await sb.storage.from(ASSET_BUCKET).upload(path, file, {
    upsert: Boolean(opts.replace),
    contentType: file.type || 'audio/mpeg',
    cacheControl: '3600',
  })
  if (error) throw new Error(`Caricamento fallito: ${error.message}`)

  // A replaced file keeps its path, so any cached decode of it is now stale.
  bufferCache.delete(path)
  return { path, replaced: Boolean(opts.replace) }
}

async function pathExists(sb: SupabaseClient, path: string): Promise<boolean> {
  const slash = path.lastIndexOf('/')
  const dir = path.slice(0, slash)
  const name = path.slice(slash + 1)
  try {
    const entries = await listDir(sb, dir)
    return entries.some((e) => e.name === name && e.id !== null)
  } catch {
    return false
  }
}

/** Remove the object itself. Reference cleanup is the caller's job — see
    `deleteAssetEverywhere` in the admin screen, which does both. */
export async function deleteAssetObject(path: string): Promise<void> {
  const sb = client()
  const { error } = await sb.storage.from(ASSET_BUCKET).remove([path])
  if (error) throw new Error(`Eliminazione fallita: ${error.message}`)
  bufferCache.delete(path)
}

/** Every phase slot in an AssetMap that points at `path`. */
export function assetMapReferences(map: AssetMap | undefined, path: string): string[] {
  if (!map) return []
  const hits: string[] = []
  for (const k of PHASE_KEYS) {
    if (map.music[k] === path) hits.push(`music ${k.toUpperCase()}`)
    if (map.soundscape[k] === path) hits.push(`soundscape ${k.toUpperCase()}`)
  }
  if (map.heartbeat === path) hits.push('heartbeat')
  if (map.bowl === path) hits.push('bowl')
  return hits
}

/** The same map with every reference to `path` removed. Returns the ORIGINAL
    object when nothing pointed at it, so a caller can skip a pointless write. */
export function withoutAsset(map: AssetMap | undefined, path: string): AssetMap | undefined {
  if (!map || !assetMapReferences(map, path).length) return map
  const music = { ...map.music }
  const soundscape = { ...map.soundscape }
  for (const k of PHASE_KEYS) {
    if (music[k] === path) delete music[k]
    if (soundscape[k] === path) delete soundscape[k]
  }
  return {
    music,
    soundscape,
    heartbeat: map.heartbeat === path ? undefined : map.heartbeat,
    bowl: map.bowl === path ? undefined : map.bowl,
  }
}
