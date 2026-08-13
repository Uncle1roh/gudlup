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
  /** Explicit provider voice id (from the roster) — overrides `voice`. */
  voiceId?: string
  /** The lines immediately before/after this one in the protocol. A protocol is
      rendered as one API request PER LINE, so without them every line is
      generated in isolation: prosody restarts each time, and a two-word
      fragment carries too little evidence for the engine to place the language
      ("pace" alone is also an English word, and was read as one). Providers
      that support request stitching pass these as conditioning context. */
  previousText?: string
  nextText?: string
  /** Force a specific sampling seed. Omitted → the provider derives one
      deterministically from the request, so the same line in the same context
      always renders identically and a re-rendered session is reproducible.
      Pass a fresh value to deliberately ask for a DIFFERENT take. */
  seed?: number
}

/** Where one line landed inside a joined render. */
export interface TtsSpan {
  startSec: number
  endSec: number
}

export interface TtsJoinedRender {
  /** Encoded audio of every line spoken as ONE utterance. */
  bytes: ArrayBuffer
  /** One span per input line, in the order given, covering the whole audio
      between neighbours so nothing is lost when the caller cuts it apart. */
  spans: TtsSpan[]
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
  /** true when renderJoined() is available on this provider + model */
  canRenderJoined?: boolean
  /** speak the text aloud for a quick audition */
  speak(text: string, opts?: TtsOptions): Promise<void>
  /** return encoded audio bytes (mp3/wav) — throws on preview-only providers */
  render(text: string, opts?: TtsOptions): Promise<ArrayBuffer>
  /**
   * Speak SEVERAL lines as one utterance and report where each landed, so the
   * caller can cut them back apart.
   *
   * This is the only thing that makes one-word lines reliable. A single word
   * carries no language: "pace" is Italian and English, "calma" is Italian,
   * Portuguese and Spanish. Asked for alone it was placed in the wrong language
   * on every model tried, INCLUDING turbo_v2_5 and flash_v2_5 with an explicit
   * language_code — 0 of 3 takes correct. Asked for inside an Italian sentence,
   * the same model gets it right every time (p=0.96–0.98). So the fix is not a
   * setting, it is refusing to ask for one word on its own.
   */
  renderJoined?(texts: string[], opts?: TtsOptions): Promise<TtsJoinedRender>
  /** stop any in-progress playback */
  stop(): void
}
