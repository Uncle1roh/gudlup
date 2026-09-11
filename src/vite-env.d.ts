/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_ELEVENLABS_API_KEY?: string
  readonly VITE_ELEVENLABS_VOICE_ID?: string
  readonly VITE_ELEVENLABS_VOICE_ID_M?: string
  /** Spoken language of the protocol voice lines (BCP-47). See tts/settings.ts. */
  readonly VITE_TTS_LANG?: string
  readonly VITE_AZURE_TTS_KEY?: string
  readonly VITE_AZURE_TTS_REGION?: string
  readonly VITE_AZURE_TTS_VOICE?: string
  /** JSON array of Convention — the company codes this deployment registers.
      See data/convention.ts, "how a code comes to exist". */
  readonly VITE_COMPANY_CONVENTIONS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
