/* ============================================================================
   Good Loop — runtime TTS settings
   The ElevenLabs key/voice can come from TWO places, checked in this order:

     1. In-app settings (this module, persisted in localStorage) — set once in
        the Voice engine panel (Studio / PDF-to-audio screen). Works instantly,
        no rebuild, and works on Vercel deployments without a redeploy.
     2. Build-time env (`VITE_ELEVENLABS_API_KEY` + `VITE_ELEVENLABS_VOICE_ID`)
        — the .env.local / Vercel-env route.

   Either way the key lives client-side, which is fine for the closed PO test;
   production moves the call behind a server proxy (Supabase Edge Function).
   ============================================================================ */

const STORAGE_KEY = 'gl.tts.elevenlabs'

export interface TtsSettings {
  apiKey: string
  voiceId: string
}

export function getTtsSettings(): TtsSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<TtsSettings>
    if (parsed && typeof parsed.apiKey === 'string' && typeof parsed.voiceId === 'string'
        && parsed.apiKey.trim() && parsed.voiceId.trim()) {
      return { apiKey: parsed.apiKey.trim(), voiceId: parsed.voiceId.trim() }
    }
    return null
  } catch {
    return null
  }
}

export function saveTtsSettings(s: TtsSettings): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ apiKey: s.apiKey.trim(), voiceId: s.voiceId.trim() })) } catch { /* storage unavailable */ }
}

export function clearTtsSettings(): void {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* storage unavailable */ }
}

/** Where the active ElevenLabs credentials come from (for the settings UI). */
export function elevenLabsSource(): 'settings' | 'env' | 'none' {
  if (getTtsSettings()) return 'settings'
  const env = import.meta.env
  if (env.VITE_ELEVENLABS_API_KEY && env.VITE_ELEVENLABS_VOICE_ID) return 'env'
  return 'none'
}
