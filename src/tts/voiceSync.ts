/* ============================================================================
   Good Loop — voice sync

   Pulls the voice list straight from the connected ElevenLabs account, so a
   voice the POs create in their workspace appears in every picker on the next
   load. No code change, no redeploy, no voice ids to copy by hand.

   Cached in localStorage: the app renders the last known list instantly and
   refreshes in the background. Fetch failures are non-fatal — the cache (or
   the seed) stays in place.
   ============================================================================ */

import {
  ARCHETYPE_OVERRIDES,
  inferArchetype,
  registerVoices,
  type CatalogVoice,
  type ElevenLabsLabels,
} from './voiceCatalog'
import { getTtsSettings } from './settings'

const CACHE_KEY = 'gl.tts.voices'
const ENDPOINT = 'https://api.elevenlabs.io/v1/voices'
/** Refresh in the background when the cache is older than this. */
const STALE_MS = 10 * 60_000

interface Cache { at: number; voices: CatalogVoice[] }

export interface SyncOutcome {
  voices: CatalogVoice[]
  at: number
  source: 'api' | 'cache' | 'none'
  error?: string
}

/** The key actually in force: in-app settings beat the build-time env. */
export function activeApiKey(): string | undefined {
  const saved = getTtsSettings()?.apiKey?.trim()
  if (saved) return saved
  const env = (import.meta.env.VITE_ELEVENLABS_API_KEY as string | undefined)?.trim()
  return env || undefined
}

function readCache(): Cache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as Cache
    return Array.isArray(c?.voices) && c.voices.length ? c : null
  } catch {
    return null
  }
}

function writeCache(c: Cache): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)) } catch { /* private mode */ }
}

export function clearVoiceCache(): void {
  try { localStorage.removeItem(CACHE_KEY) } catch { /* private mode */ }
}

interface ApiVoice {
  voice_id: string
  name?: string
  category?: string
  labels?: ElevenLabsLabels
}

function toCatalogVoice(v: ApiVoice): CatalogVoice {
  const labels = v.labels ?? {}
  const name = (v.name ?? v.voice_id).trim()
  const gender: 'F' | 'M' = /female|woman/i.test(labels.gender ?? '') ? 'F'
    : /male|man/i.test(labels.gender ?? '') ? 'M'
    : 'F'
  return {
    id: v.voice_id,
    // ElevenLabs names carry a marketing tail ("Sarah - Mature, Reassuring")
    name: name.split(/\s+[-–—]\s+/)[0].trim() || name,
    gender,
    archetype: ARCHETYPE_OVERRIDES[v.voice_id] ?? inferArchetype(name, labels, gender),
    category: v.category,
    language: labels.language,
  }
}

/** Load whatever is cached into the live catalog. Call once at startup: it is
    synchronous, so the pickers are populated before any network round-trip. */
export function hydrateVoicesFromCache(): boolean {
  const c = readCache()
  if (!c) return false
  registerVoices(c.voices, c.at)
  return true
}

/**
 * Fetch the account's voices and install them.
 * @param force ignore the staleness window (the panel's manual button).
 */
export async function syncVoices(opts: { apiKey?: string; force?: boolean } = {}): Promise<SyncOutcome> {
  const key = opts.apiKey?.trim() || activeApiKey()
  const cached = readCache()

  if (!key) {
    if (cached) registerVoices(cached.voices, cached.at)
    return { voices: cached?.voices ?? [], at: cached?.at ?? 0, source: cached ? 'cache' : 'none', error: 'Nessuna chiave ElevenLabs configurata.' }
  }
  if (!opts.force && cached && Date.now() - cached.at < STALE_MS) {
    registerVoices(cached.voices, cached.at)
    return { voices: cached.voices, at: cached.at, source: 'cache' }
  }

  try {
    const res = await fetch(ENDPOINT, { headers: { 'xi-api-key': key, Accept: 'application/json' } })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`ElevenLabs ${res.status}: ${detail.slice(0, 160)}`)
    }
    const body = (await res.json()) as { voices?: ApiVoice[] }
    const voices = (body.voices ?? []).map(toCatalogVoice)
    if (!voices.length) throw new Error('L’account non espone alcuna voce.')
    const at = Date.now()
    registerVoices(voices, at)
    writeCache({ at, voices })
    return { voices, at, source: 'api' }
  } catch (e) {
    if (cached) registerVoices(cached.voices, cached.at)
    return {
      voices: cached?.voices ?? [],
      at: cached?.at ?? 0,
      source: cached ? 'cache' : 'none',
      error: (e as Error).message,
    }
  }
}

/** Startup path: cache first (instant), then a background refresh. */
export function initVoiceSync(): void {
  hydrateVoicesFromCache()
  void syncVoices().catch(() => undefined)
}
