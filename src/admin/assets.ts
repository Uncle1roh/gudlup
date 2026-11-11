/* ============================================================================
   Good Loop — Audio asset library (Supabase Storage, bucket `protocol-audio`)
   The PO's produced library lives under `assets/`:
     assets/music/f1 … f6          — curated music tracks per session phase
     assets/soundscape/<type>/…    — loop textures (wind, fire, rain, lake, …)
     assets/heartbeat/…            — heartbeat file(s), once the PO delivers
     assets/bowl/…                 — singing-bowl strike file(s), once delivered
   (soundscapes tolerate BOTH layouts: a folder per type, or flat files whose
   name starts with the type — `wind-01.mp3`. And between the last two folders
   the FILENAME decides — see `specialKind`: the live library has every bowl
   filed under `assets/heartbeat/`.)

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
  if (!hasSupabaseEnv()) throw new Error('La libreria audio richiede la configurazione Supabase (VITE_SUPABASE_URL / _ANON_KEY).')
  return getSupabaseClient(import.meta.env.VITE_SUPABASE_URL as string, import.meta.env.VITE_SUPABASE_ANON_KEY as string)
}

const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|flac|aac)$/i

interface Entry { name: string; id: string | null; metadata?: { size?: number } | null }

async function listDir(sb: SupabaseClient, prefix: string): Promise<Entry[]> {
  const { data, error } = await sb.storage.from(ASSET_BUCKET).list(prefix, { limit: 500, sortBy: { column: 'name', order: 'asc' } })
  if (error) throw new Error(`Impossibile elencare ${prefix}: ${error.message}`)
  return (data ?? []) as Entry[]
}

function publicUrl(sb: SupabaseClient, path: string): string {
  return sb.storage.from(ASSET_BUCKET).getPublicUrl(path).data.publicUrl
}

/**
 * Which of the two special layers a file under `assets/heartbeat` or
 * `assets/bowl` actually is.
 *
 * The folder is a filing convention, not a fact about the sound. In the live
 * PO library all eight singing bowls sit in `assets/heartbeat/` under names
 * that say exactly what they are (`bowl-…-singing-bowl-gong-….mp3`), and
 * `assets/bowl/` is empty. Trusting the folder alone therefore did two wrong
 * things at once: a clip asking for a campana tibetana found an EMPTY bowl
 * pool and stayed silent — "no tracks found from the pool" — while a heartbeat
 * clip could draw a gong. The NAME wins wherever it is unambiguous; the folder
 * decides everything else. Nothing has to be moved in storage.
 */
export function specialKind(name: string, folder: 'heartbeat' | 'bowl'): 'heartbeat' | 'bowl' {
  if (/campan|bowl|tibetan|gong|bong|bell|singing/i.test(name)) return 'bowl'
  if (/heart|batti|cuore|cora[cç]|pulse|\bbpm\b/i.test(name)) return 'heartbeat'
  return folder
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
  for (const folder of ['heartbeat', 'bowl'] as const) {
    try {
      const entries = await listDir(sb, `${ASSET_ROOT}/${folder}`)
      for (const e of entries) {
        if (e.id === null || !AUDIO_EXT.test(e.name)) continue
        const path = `${ASSET_ROOT}/${folder}/${e.name}`
        out.push({ path, name: e.name, kind: specialKind(e.name, folder), publicUrl: publicUrl(sb, path), sizeBytes: e.metadata?.size })
      }
    } catch { /* not delivered yet */ }
  }

  return out
}

/* ------------------------------------------------------- protocol covers --

   A real image per protocol, uploaded from the Scheda inside a protocol's
   Details. Generated artwork is the default and stays the fallback; this is
   what replaces it where a PO has chosen a photograph.

   Filed beside the audio library in the same bucket, under assets/covers/,
   keyed by the protocol code — so a re-upload REPLACES the cover rather than
   accumulating orphans nobody can find and nothing points at. */

const COVER_DIR = `${ASSET_ROOT}/covers`

/** What a browser can decode and a phone will not choke on. */
const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
/**
 * How big a cover may be.
 *
 * The widest box one image has to fill is the desktop hero at 858x380 CSS px,
 * so 1716x760 covers a 2x screen and there is no rendering reason to go past
 * roughly 2000px on the long edge. But a photographer hands over what a camera
 * produced, and refusing a 9 MB JPEG with "too big" makes the person shrink it
 * by hand before they can see whether it even suits the session. 12 MB takes
 * anything that is plausibly a chosen photograph and still refuses a RAW
 * export or a video someone dropped in by mistake.
 */
export const COVER_MAX_BYTES = 12 * 1024 * 1024

export function coverPathFor(code: string, fileName: string): string {
  const safe = code.replace(/[^A-Za-z0-9_-]+/g, '_')
  const ext = (/\.([a-z0-9]+)$/i.exec(fileName)?.[1] ?? 'jpg').toLowerCase()
  return `${COVER_DIR}/${safe}.${ext}`
}

/**
 * Upload a protocol cover and return its public URL.
 *
 * `upsert` is on so replacing a cover overwrites the same path — and the
 * returned URL carries a cache-busting stamp, because the CDN would otherwise
 * keep serving the old picture from the identical path for hours and the
 * upload would look as if it had silently failed.
 */
/**
 * Upload one of the two background pictures and return its public URL.
 *
 * The same bucket and the same rules as a protocol cover — it is the same
 * kind of thing, an image the console puts in front of people — under a
 * folder of its own so a background can never collide with a cover whose
 * code happens to be `landing`.
 */
/* ---- how big a background may actually travel -------------------------
   A cover is a thumbnail; a background is the whole screen, and the files
   that arrive here are what a camera or an image generator produced — three,
   six, ten megabytes of PNG. Two separate things go wrong with that:

     · the upload itself. A ten megabyte POST to São Paulo over an office
       connection takes long enough that the edge in front of Storage gives
       up and answers 520, which reaches the operator as "Caricamento non
       riuscito: http 520" — a number with nothing to do with what they did.
     · and then every visitor pays for it. This picture is the FIRST paint of
       the landing page, on whatever phone and whatever connection the person
       has. A ten megabyte background is a broken landing page for everyone.

   So the file is re-encoded here before it is sent, and the console's own
   advice ("circa 2000 px, sotto 400 KB") is simply carried out instead of
   printed and hoped for. */
const BG_MAX_EDGE = 2200
const BG_TARGET_BYTES = 480 * 1024
/** Tried in order: WebP where the browser can write it (roughly a third
    smaller at the same quality), JPEG where it cannot. */
const BG_ENCODINGS: { type: string; ext: string }[] = [
  { type: 'image/webp', ext: 'webp' },
  { type: 'image/jpeg', ext: 'jpg' },
]
const BG_QUALITIES = [0.86, 0.78, 0.7, 0.62]

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

export interface ShrunkImage {
  blob: Blob
  ext: string
  /** What to tell the operator happened to their file. */
  note: string
}

/**
 * Scale a background down to something a page can actually load.
 *
 * Returns the ORIGINAL untouched when it is already small enough, and also
 * when the browser cannot decode it — an AVIF on an older engine, a file that
 * is not really an image. Refusing to upload because the re-encode failed
 * would be a worse outcome than uploading what the person chose: the size
 * limit above still applies either way.
 */
export async function shrinkBackground(file: File): Promise<ShrunkImage> {
  const ext = (/\.([a-z0-9]+)$/i.exec(file.name)?.[1] ?? 'jpg').toLowerCase()
  const asIs: ShrunkImage = { blob: file, ext, note: '' }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return { ...asIs, note: 'Immagine caricata com’è: questo browser non è riuscito a rileggerla per ridurla.' }
  }
  const edge = Math.max(bitmap.width, bitmap.height)
  if (edge <= BG_MAX_EDGE && file.size <= BG_TARGET_BYTES) {
    bitmap.close?.()
    return asIs
  }
  const scale = Math.min(1, BG_MAX_EDGE / edge)
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')
  if (!g) { bitmap.close?.(); return asIs }
  g.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()

  /* Best quality that fits the budget, and if nothing fits, the smallest
     thing produced — still far better than the original. */
  let best: { blob: Blob; ext: string } | null = null
  for (const enc of BG_ENCODINGS) {
    for (const q of BG_QUALITIES) {
      const blob = await toBlob(canvas, enc.type, q)
      // a browser that cannot write WebP silently hands back a PNG instead
      if (!blob || blob.type !== enc.type) break
      if (!best || blob.size < best.blob.size) best = { blob, ext: enc.ext }
      if (blob.size <= BG_TARGET_BYTES) {
        return {
          blob, ext: enc.ext,
          note: `Ridotta a ${w}×${h}, ${(blob.size / 1024).toFixed(0)} KB (era ${(file.size / 1024 / 1024).toFixed(1)} MB).`,
        }
      }
    }
  }
  if (!best || best.blob.size >= file.size) return asIs
  return {
    blob: best.blob, ext: best.ext,
    note: `Ridotta a ${w}×${h}, ${(best.blob.size / 1024).toFixed(0)} KB (era ${(file.size / 1024 / 1024).toFixed(1)} MB).`,
  }
}

/**
 * Say what a Storage failure actually means.
 *
 * The two the Sfondi page produced both read as nonsense to the person who
 * pressed the button, and both have one concrete answer, so the answer is in
 * the message rather than in a developer's head.
 */
function explainUpload(message: string, status?: number): string {
  const m = message.toLowerCase()
  if (m.includes('row-level security') || m.includes('violates') || status === 403) {
    return 'Caricamento non riuscito: questo account non ha il permesso di scrivere in questa cartella. '
      + 'È un permesso del database, non un problema dell’immagine — va eseguito una volta sola: '
      + 'supabase/30-backgrounds-access.sql.'
  }
  if (status === 520 || status === 522 || status === 524 || m.includes('520') || m.includes('timeout') || m.includes('failed to fetch')) {
    return 'Caricamento non riuscito: il server ha chiuso la connessione prima della fine '
      + `(${status ?? 'timeout'}). Di solito è un file troppo pesante o una rete lenta: riprova, `
      + 'oppure esporta l’immagine più leggera (circa 2000 px sul lato lungo).'
  }
  return `Caricamento non riuscito: ${message}`
}

export async function uploadBackground(which: 'landing' | 'app', file: File): Promise<{ url: string; note: string }> {
  if (!COVER_TYPES.includes(file.type)) {
    throw new Error('Formato non supportato — usa JPG, PNG, WebP o AVIF.')
  }
  if (file.size > COVER_MAX_BYTES) {
    throw new Error(
      `Immagine troppo grande (${(file.size / 1024 / 1024).toFixed(1)} MB) — massimo ` +
      `${COVER_MAX_BYTES / 1024 / 1024} MB. Esporta a circa 2000 px sul lato lungo.`,
    )
  }
  const sb = client()
  const { blob, ext, note } = await shrinkBackground(file)
  const path = `backgrounds/${which}.${ext}`
  const { error } = await sb.storage.from(ASSET_BUCKET)
    .upload(path, blob, { upsert: true, contentType: blob.type || file.type, cacheControl: '3600' })
  if (error) {
    const status = (error as { statusCode?: string | number }).statusCode
    throw new Error(explainUpload(error.message, status === undefined ? undefined : Number(status)))
  }
  /* The stamp matters more here than anywhere: the same path is reused every
     time, and without it the CDN serves yesterday's picture for hours and
     the upload looks as if it did nothing. */
  return { url: `${publicUrl(sb, path)}?v=${Date.now()}`, note }
}

export async function uploadProtocolCover(code: string, file: File): Promise<string> {
  if (!COVER_TYPES.includes(file.type)) {
    throw new Error('Formato non supportato — usa JPG, PNG, WebP o AVIF.')
  }
  if (file.size > COVER_MAX_BYTES) {
    throw new Error(
      `Immagine troppo grande (${(file.size / 1024 / 1024).toFixed(1)} MB) — massimo ` +
      `${COVER_MAX_BYTES / 1024 / 1024} MB. Esporta a circa 1600 px sul lato lungo.`,
    )
  }
  const sb = client()
  const path = coverPathFor(code, file.name)
  const { error } = await sb.storage.from(ASSET_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' })
  if (error) throw new Error(`Caricamento non riuscito: ${error.message}`)
  return `${publicUrl(sb, path)}?v=${Date.now()}`
}

/** Remove a protocol's cover. The generated artwork takes over again. */
export async function deleteProtocolCover(code: string, url: string): Promise<void> {
  const sb = client()
  /* Derive the path from the URL rather than guessing the extension: the
     stored file may be a .png where the next upload was a .jpg. */
  const bare = url.split('?')[0]
  const at = bare.indexOf(`${COVER_DIR}/`)
  const path = at >= 0 ? bare.slice(at) : coverPathFor(code, 'x.jpg')
  await sb.storage.from(ASSET_BUCKET).remove([path])
}

/**
 * Every library file, grouped the way a picker lists them.
 *
 * This lives here rather than inside the Studio because the Studio's picker
 * used to build its own groups — music by phase, then soundscapes by texture —
 * and simply had no branch for the two PO deliverables. A heartbeat or a
 * singing bowl could be uploaded, previewed and mapped for the renderer, and
 * still be impossible to put on a clip, because the dropdown that chooses a
 * file never mentioned it. Deriving the groups from the asset KINDS means a
 * kind cannot be forgotten by omission again.
 */
export interface LibraryGroup {
  label: string
  items: AudioAsset[]
}

export function libraryGroups(assets: AudioAsset[]): LibraryGroup[] {
  const out: LibraryGroup[] = []

  for (const phase of PHASE_KEYS) {
    const items = assets.filter((a) => a.kind === 'music' && a.phase === phase)
    if (items.length) out.push({ label: `Music · ${phase.toUpperCase()}`, items })
  }
  const unphased = assets.filter((a) => a.kind === 'music' && !a.phase)
  if (unphased.length) out.push({ label: 'Music · senza prefisso di fase', items: unphased })

  for (const [texture, items] of groupSoundscapes(assets)) {
    out.push({ label: `Soundscape · ${texture}`, items })
  }

  const heartbeat = assets.filter((a) => a.kind === 'heartbeat')
  if (heartbeat.length) out.push({ label: 'Battito cardiaco', items: heartbeat })
  const bowl = assets.filter((a) => a.kind === 'bowl')
  if (bowl.length) out.push({ label: 'Campana tibetana', items: bowl })

  const other = assets.filter((a) => a.kind === 'other')
  if (other.length) out.push({ label: 'Altro', items: other })

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
