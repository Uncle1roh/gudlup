/* ============================================================================
   Good Loop — synthesized voice, kept

   Every ElevenLabs render costs credits, and until now every one of them was
   thrown away. The audio lived on the clip as an `AudioBuffer`, which cannot
   be serialised, so `toStudioProject()` dropped it: save the session, close
   the browser, reopen the protocol, and every line was unrendered again.
   Re-synthesizing a 24-minute protocol is dozens of calls for audio that was
   already paid for once.

   So a render is uploaded to Storage the moment it comes back, and the clip
   keeps the URL. Reopening fetches and decodes it — no provider call at all.

   CONTENT-ADDRESSED, on purpose.

   The path is a hash of everything that determines the audio: the voice, the
   language, the text, the speaking context and the re-roll seed. Two clips
   that would produce identical audio therefore share one object, so the same
   affirmation reused in another protocol — or by another PO, on another
   machine — costs nothing the second time. It also means `lookup()` can be
   asked BEFORE calling the provider, which is where most of the saving is.

   A re-roll passes a seed, so "↻ Re-synthesize" still reaches the provider and
   still gets a different take. Only an identical request is served from here.
   ============================================================================ */

import { getSupabaseClient, hasSupabaseEnv } from '../auth/supabaseClient'
import { ASSET_BUCKET } from '../admin/assets'

function client() {
  if (!hasSupabaseEnv()) return null
  return getSupabaseClient(
    import.meta.env.VITE_SUPABASE_URL as string,
    import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  )
}

/** Renders live apart from the PO library so nothing here shows up as an asset. */
const TTS_ROOT = 'tts'

export interface TtsKey {
  text: string
  voiceId: string
  lang: string
  /** Speaking-context fields the provider was given, if any. */
  context?: string
  /** Set only on a deliberate re-roll — a new seed is a new object. */
  seed?: number
}

/**
 * A stable path for one rendered line.
 *
 * SHA-256 over the request, which is what makes two identical requests share
 * an object. The voice id is kept in the path as well so the bucket can be
 * browsed and pruned by voice without opening every file.
 */
export async function ttsPath(key: TtsKey): Promise<string> {
  const payload = JSON.stringify({
    t: key.text.trim(),
    v: key.voiceId,
    l: key.lang,
    c: key.context ?? '',
    s: key.seed ?? 0,
  })
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  const voice = key.voiceId.replace(/[^A-Za-z0-9_-]/g, '') || 'voice'
  return `${TTS_ROOT}/${voice}/${hex.slice(0, 40)}.mp3`
}

export function ttsPublicUrl(path: string): string {
  const sb = client()
  if (!sb) throw new Error('Nessun database collegato.')
  return sb.storage.from(ASSET_BUCKET).getPublicUrl(path).data.publicUrl
}

/**
 * The bytes for a line already rendered, or null.
 *
 * Never throws. A cache that can take the Studio down is worse than no cache,
 * and every failure here has the same correct fallback: call the provider.
 */
export async function lookup(key: TtsKey): Promise<ArrayBuffer | null> {
  const sb = client()
  if (!sb) return null
  try {
    const path = await ttsPath(key)
    const { data, error } = await sb.storage.from(ASSET_BUCKET).download(path)
    if (error || !data) return null
    return await data.arrayBuffer()
  } catch {
    return null
  }
}

/**
 * Keep a render. Returns its path, or null when it could not be stored.
 *
 * Also non-throwing: failing to cache is a cost problem, not a correctness
 * one, and the clip plays from the buffer already in hand either way.
 */
export async function store(key: TtsKey, bytes: ArrayBuffer): Promise<string | null> {
  const sb = client()
  if (!sb) return null
  try {
    const path = await ttsPath(key)
    const { error } = await sb.storage.from(ASSET_BUCKET).upload(path, new Blob([bytes], { type: 'audio/mpeg' }), {
      upsert: true,
      contentType: 'audio/mpeg',
      cacheControl: '31536000',
    })
    if (error) return null
    return path
  } catch {
    return null
  }
}

/** Fetch a stored render back by the path a saved clip carries. */
export async function fetchStored(path: string): Promise<ArrayBuffer | null> {
  const sb = client()
  if (!sb) return null
  try {
    const { data, error } = await sb.storage.from(ASSET_BUCKET).download(path)
    if (error || !data) return null
    return await data.arrayBuffer()
  } catch {
    return null
  }
}
