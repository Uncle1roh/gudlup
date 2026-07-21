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
  /** Selected primary voice — empty falls back to the catalog default (Valeria). */
  voiceId: string
  /** Optional second voice (male archetype) — used for the [M] rows of the
      Deep double-induction. Absent → [M] rows render with the primary voice. */
  voiceIdSecondary?: string
}

export function getTtsSettings(): TtsSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<TtsSettings>
    if (parsed && typeof parsed.apiKey === 'string' && parsed.apiKey.trim()) {
      const sec = typeof parsed.voiceIdSecondary === 'string' ? parsed.voiceIdSecondary.trim() : ''
      return { apiKey: parsed.apiKey.trim(), voiceId: (parsed.voiceId ?? '').trim(), voiceIdSecondary: sec || undefined }
    }
    return null
  } catch {
    return null
  }
}

export function saveTtsSettings(s: TtsSettings): void {
  try {
    const sec = s.voiceIdSecondary?.trim()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ apiKey: s.apiKey.trim(), voiceId: (s.voiceId ?? '').trim(), ...(sec ? { voiceIdSecondary: sec } : {}) }))
  } catch { /* storage unavailable */ }
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


/* ---- voice roster (the PO-selected ElevenLabs voices, saved on Load voices) ---- */
const ROSTER_KEY = 'gl.tts.roster'
export interface RosterVoice { id: string; name: string }

export function getVoiceRoster(): RosterVoice[] {
  try {
    const raw = localStorage.getItem(ROSTER_KEY)
    const list = raw ? (JSON.parse(raw) as RosterVoice[]) : []
    return Array.isArray(list) ? list.filter((v) => v && typeof v.id === 'string' && typeof v.name === 'string') : []
  } catch { return [] }
}

export function saveVoiceRoster(list: RosterVoice[]): void {
  try { localStorage.setItem(ROSTER_KEY, JSON.stringify(list.slice(0, 30))) } catch { /* storage unavailable */ }
}
