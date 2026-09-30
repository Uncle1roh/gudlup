/* ============================================================================
   Good Loop — runtime TTS settings
   The ElevenLabs key/voice can come from THREE places, checked in this order:

     1. The SHARED key saved in the database (`app_settings`, admin-only).
        Typed once in the Voice engine panel and then present on every
        computer, every browser and every Vercel deployment — including the
        preview URLs, which is why the key used to have to be re-pasted
        constantly: localStorage is per ORIGIN, and each preview build is a
        different origin.
     2. In-app settings (this module, persisted in localStorage) — the local
        copy, which is also the cache of (1) and what the synchronous provider
        actually reads at call time.
   There is no build-time key: only a key typed in the app is ever used.

   Either way the key lives client-side, which is fine for the closed PO test;
   production moves the call behind a server proxy (Supabase Edge Function).
   The shared row is readable by ADMINS ONLY — see supabase/setup.sql.
   ============================================================================ */

import { getSupabaseClient, hasSupabaseEnv } from '../auth/supabaseClient'

const STORAGE_KEY = 'gl.tts.elevenlabs'
/** Row key in `app_settings` holding the shared ElevenLabs credentials. */
const SHARED_KEY = 'tts.elevenlabs'

export interface TtsSettings {
  apiKey: string
  /** Selected primary voice — empty falls back to the catalog default (Valeria). */
  voiceId: string
  /** Optional second voice (male archetype) — used for the [M] rows of the
      Deep double-induction. Absent → [M] rows render with the primary voice. */
  voiceIdSecondary?: string
  /** When this copy was written (epoch ms) — decides who wins against the
      shared row, so a key changed on another machine is not overwritten by an
      older local one. */
  savedAt?: number
  /** True when this local copy came from (or was pushed to) the shared row. */
  shared?: boolean
}

export function getTtsSettings(): TtsSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<TtsSettings>
    if (parsed && typeof parsed.apiKey === 'string' && parsed.apiKey.trim()) {
      const sec = typeof parsed.voiceIdSecondary === 'string' ? parsed.voiceIdSecondary.trim() : ''
      return {
        apiKey: parsed.apiKey.trim(),
        voiceId: (parsed.voiceId ?? '').trim(),
        voiceIdSecondary: sec || undefined,
        savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : undefined,
        shared: parsed.shared === true,
      }
    }
    return null
  } catch {
    return null
  }
}

export function saveTtsSettings(s: TtsSettings): void {
  try {
    const sec = s.voiceIdSecondary?.trim()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      apiKey: s.apiKey.trim(),
      voiceId: (s.voiceId ?? '').trim(),
      ...(sec ? { voiceIdSecondary: sec } : {}),
      savedAt: s.savedAt ?? Date.now(),
      ...(s.shared ? { shared: true } : {}),
    }))
  } catch { /* storage unavailable */ }
}

export function clearTtsSettings(): void {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* storage unavailable */ }
}

/** Where the active ElevenLabs credentials come from (for the settings UI). */
export function elevenLabsSource(): 'shared' | 'settings' | 'none' {
  const local = getTtsSettings()
  if (local) return local.shared ? 'shared' : 'settings'
  return 'none'
}

/* ------------------------------------------------- the shared (DB) copy --

   Everything below degrades to a no-op when the `app_settings` table is not
   there yet: the panel keeps working exactly as it did, on localStorage
   alone, and says so. Run supabase/3-shared-voice-key.sql to turn it on. */

function sb() {
  if (!hasSupabaseEnv()) return null
  return getSupabaseClient(import.meta.env.VITE_SUPABASE_URL as string, import.meta.env.VITE_SUPABASE_ANON_KEY as string)
}

interface SharedRow { apiKey: string; voiceId: string; voiceIdSecondary?: string }

export type SharedState = 'ok' | 'unavailable' | 'no-table' | 'forbidden'

export interface SharedResult {
  state: SharedState
  message?: string
  /** The server's own `updated_at` for the row just written. Used instead of
      the local clock: two operators rotating a key from two machines whose
      clocks disagree by a minute would otherwise let the older write win. */
  savedAt?: number
}

/** Read the shared credentials, or null when there are none / it is off. */
export async function loadSharedTtsSettings(): Promise<{ settings: TtsSettings | null; state: SharedState }> {
  const c = sb()
  if (!c) return { settings: null, state: 'unavailable' }
  try {
    const { data, error } = await c.from('app_settings').select('value, updated_at').eq('key', SHARED_KEY).maybeSingle()
    if (error) return { settings: null, state: /relation|does not exist|schema cache/i.test(error.message) ? 'no-table' : 'forbidden' }
    if (!data?.value) return { settings: null, state: 'ok' }
    const v = data.value as Partial<SharedRow>
    if (typeof v.apiKey !== 'string' || !v.apiKey.trim()) return { settings: null, state: 'ok' }
    return {
      settings: {
        apiKey: v.apiKey.trim(),
        voiceId: (v.voiceId ?? '').trim(),
        voiceIdSecondary: v.voiceIdSecondary?.trim() || undefined,
        savedAt: data.updated_at ? Date.parse(data.updated_at as string) : Date.now(),
        shared: true,
      },
      state: 'ok',
    }
  } catch {
    return { settings: null, state: 'unavailable' }
  }
}

/** Write the shared credentials. Only an admin may. */
export async function saveSharedTtsSettings(s: TtsSettings): Promise<SharedResult> {
  const c = sb()
  if (!c) return { state: 'unavailable', message: 'Nessuna connessione Supabase.' }
  const value: SharedRow = {
    apiKey: s.apiKey.trim(),
    voiceId: (s.voiceId ?? '').trim(),
    ...(s.voiceIdSecondary?.trim() ? { voiceIdSecondary: s.voiceIdSecondary.trim() } : {}),
  }
  try {
    const { data, error } = await c.from('app_settings')
      .upsert({ key: SHARED_KEY, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      .select('updated_at')
      .maybeSingle()
    if (error) {
      if (/relation|does not exist|schema cache/i.test(error.message)) return { state: 'no-table', message: error.message }
      return { state: 'forbidden', message: error.message }
    }
    return { state: 'ok', savedAt: data?.updated_at ? Date.parse(data.updated_at as string) : undefined }
  } catch (e) {
    return { state: 'unavailable', message: (e as Error).message }
  }
}

/** Remove the shared credentials (the local copy is cleared separately). */
export async function clearSharedTtsSettings(): Promise<SharedResult> {
  const c = sb()
  if (!c) return { state: 'unavailable' }
  try {
    const { error } = await c.from('app_settings').delete().eq('key', SHARED_KEY)
    if (error) return { state: /relation|does not exist|schema cache/i.test(error.message) ? 'no-table' : 'forbidden', message: error.message }
    return { state: 'ok' }
  } catch (e) {
    return { state: 'unavailable', message: (e as Error).message }
  }
}

/**
 * Bring this browser in line with the shared row.
 *
 * The shared copy wins when there is no local one, or when it is NEWER — an
 * admin who rotates the key on one machine must not have it silently reverted
 * by an older copy sitting in another browser's localStorage.
 */
export async function hydrateTtsSettings(): Promise<{ changed: boolean; state: SharedState; sharedAt?: number }> {
  const { settings: remote, state } = await loadSharedTtsSettings()
  if (!remote) return { changed: false, state }
  const local = getTtsSettings()
  const localAt = local?.savedAt ?? 0
  if (local && localAt >= (remote.savedAt ?? 0)) return { changed: false, state, sharedAt: remote.savedAt }
  saveTtsSettings(remote)
  return { changed: true, state, sharedAt: remote.savedAt }
}


/* The voice list itself is no longer stored here: it is synced from the
   ElevenLabs account and cached by tts/voiceSync.ts (key 'gl.tts.voices'). */


/* ---- spoken language of the voice lines --------------------------------
   The language a protocol is WRITTEN IN — deliberately NOT the UI locale. A
   therapist can browse the app in Portuguese and render a protocol authored in
   Italian; tying the two together would mislabel the text and reintroduce
   exactly the accent drift this setting exists to prevent.

   One place to change when a protocol moves to pt-BR (`VITE_TTS_LANG=pt-BR`),
   and `TtsOptions.lang` still overrides per call. When protocols become
   multi-language this should move onto the protocol record itself. */
export function ttsLanguage(): string {
  const env = (import.meta.env.VITE_TTS_LANG as string | undefined)?.trim()
  return env || 'it'
}

/* ---- the keys of OUR accounts ------------------------------------------
   The voice panel chooses an ElevenLabs ACCOUNT from a dropdown instead of
   taking a pasted key. The keys behind it live in the same admin-only table
   as the shared key (`app_settings`, row 'tts.elevenlabs.accounts'), keyed by
   the account id in tts/voiceAccounts.ts — never in the code or the bundle.
   A key is only ever stored against the account its fingerprint proves it
   belongs to. */
const ACCOUNTS_KEY = 'tts.elevenlabs.accounts'

/** Stored keys by account id, or {} when there are none / it is off. */
export async function loadAccountKeys(): Promise<Record<string, string>> {
  const c = sb()
  if (!c) return {}
  try {
    const { data, error } = await c.from('app_settings').select('value').eq('key', ACCOUNTS_KEY).maybeSingle()
    if (error || !data?.value) return {}
    const keys = (data.value as { keys?: Record<string, unknown> }).keys ?? {}
    const out: Record<string, string> = {}
    for (const [id, k] of Object.entries(keys)) if (typeof k === 'string' && k.trim()) out[id] = k.trim()
    return out
  } catch {
    return {}
  }
}

/** Store one account's key next to the others. Only an admin may. */
export async function saveAccountKey(accountId: string, apiKey: string): Promise<SharedResult> {
  const c = sb()
  if (!c) return { state: 'unavailable', message: 'Nessuna connessione Supabase.' }
  const keys = { ...(await loadAccountKeys()), [accountId]: apiKey.trim() }
  try {
    const { error } = await c.from('app_settings')
      .upsert({ key: ACCOUNTS_KEY, value: { keys }, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) {
      if (/relation|does not exist|schema cache/i.test(error.message)) return { state: 'no-table', message: error.message }
      return { state: 'forbidden', message: error.message }
    }
    return { state: 'ok' }
  } catch (e) {
    return { state: 'unavailable', message: (e as Error).message }
  }
}
