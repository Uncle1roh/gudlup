/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_ELEVENLABS_API_KEY?: string
  readonly VITE_ELEVENLABS_VOICE_ID?: string
  readonly VITE_AZURE_TTS_KEY?: string
  readonly VITE_AZURE_TTS_REGION?: string
  readonly VITE_AZURE_TTS_VOICE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
