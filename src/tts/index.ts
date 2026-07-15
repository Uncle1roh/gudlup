/* Picks the active TTS provider, highest-quality first:
     1. ElevenLabs — in-app settings (Voice engine panel, localStorage)
     2. ElevenLabs — env (VITE_ELEVENLABS_API_KEY + VITE_ELEVENLABS_VOICE_ID)
     3. Azure      — env (VITE_AZURE_TTS_KEY + REGION + VOICE)
     4. Browser    — no keys (preview only, can't render into files)
   Resolved at CALL time, so saving keys in the panel takes effect immediately.
   Nothing is created until called, and no network happens until the user hits
   Preview or Synthesize. See docs/TTS_SETUP.md. */

import type { TtsProvider } from './types'
import { createBrowserTts } from './browser'
import { createElevenLabsTts } from './elevenlabs'
import { createAzureTts } from './azure'
import { getTtsSettings } from './settings'

const env = import.meta.env

export function getTtsProvider(): TtsProvider {
  const saved = getTtsSettings()
  if (saved) return createElevenLabsTts(saved.apiKey, saved.voiceId, saved.voiceIdSecondary)

  const elKey = env.VITE_ELEVENLABS_API_KEY
  const elVoice = env.VITE_ELEVENLABS_VOICE_ID
  if (elKey && elVoice) return createElevenLabsTts(elKey, elVoice, env.VITE_ELEVENLABS_VOICE_ID_M as string | undefined)

  const azKey = env.VITE_AZURE_TTS_KEY
  const azRegion = env.VITE_AZURE_TTS_REGION
  const azVoice = env.VITE_AZURE_TTS_VOICE
  if (azKey && azRegion && azVoice) return createAzureTts(azKey, azRegion, azVoice)

  return createBrowserTts()
}

export type { TtsProvider, TtsOptions } from './types'
export { getTtsSettings, saveTtsSettings, clearTtsSettings, elevenLabsSource } from './settings'
