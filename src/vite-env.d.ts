/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
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

/**
 * True in the bundle Capacitor wraps (VITE_TARGET=app), false on the web.
 *
 * A compile-time constant, not a runtime check: the branch the other target
 * does not use is dropped by the bundler instead of shipped and skipped.
 */
declare const __GL_APP__: boolean
