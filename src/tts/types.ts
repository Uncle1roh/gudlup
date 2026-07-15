/* ============================================================================
   Good Loop — Text-to-speech provider contract
   One small interface so the Studio (and later the batch voice renderer) don't
   care which engine is behind it. Two capabilities:
     - speak()  : audition the text aloud (every provider supports this)
     - render() : return encoded audio BYTES so the voice can be decoded into a
                  clip buffer, layered, and exported (API providers only)
   The browser SpeechSynthesis provider is preview-only (no byte stream), so it's
   a zero-config way to hear a line, but rendering into the mix needs a real key.
   ============================================================================ */

export interface TtsOptions {
  lang?: string // BCP-47, e.g. 'pt-BR'
  rate?: number // 0.5..2 relative speed (provider-dependent)
  pitch?: number // 0..2 (provider-dependent)
  /** Which configured voice to speak with. 'secondary' = the male archetype
      (Deep double-induction). Providers without a secondary voice fall back
      to the primary — check `hasSecondaryVoice` to know which will happen. */
  voice?: 'primary' | 'secondary'
}

export interface TtsProvider {
  /** stable id: 'elevenlabs' | 'azure' | 'browser' */
  id: string
  /** human label for the UI */
  label: string
  /** true when render() returns audio bytes that can be layered + exported */
  canRender: boolean
  /** true when a distinct secondary (male) voice is configured */
  hasSecondaryVoice?: boolean
  /** speak the text aloud for a quick audition */
  speak(text: string, opts?: TtsOptions): Promise<void>
  /** return encoded audio bytes (mp3/wav) — throws on preview-only providers */
  render(text: string, opts?: TtsOptions): Promise<ArrayBuffer>
  /** stop any in-progress playback */
  stop(): void
}
