/* ElevenLabs text-to-speech. POSTs to the REST API and returns mp3 bytes, which
   the Studio decodes into a clip buffer. The multilingual model auto-detects
   pt-BR from the text, so no language flag is needed.

   SECURITY: the key is read from a VITE_ env var and therefore ships to the
   browser — fine for a closed test, NOT for production. Move this call behind a
   server proxy (e.g. a Supabase Edge Function) before any public release. */

import type { TtsProvider } from './types'

const ENDPOINT = 'https://api.elevenlabs.io/v1/text-to-speech'

export function createElevenLabsTts(apiKey: string, voiceId: string): TtsProvider {
  let audio: HTMLAudioElement | null = null

  async function fetchBytes(text: string): Promise<ArrayBuffer> {
    const res = await fetch(`${ENDPOINT}/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`ElevenLabs ${res.status}: ${detail.slice(0, 180)}`)
    }
    return res.arrayBuffer()
  }

  return {
    id: 'elevenlabs',
    label: 'ElevenLabs',
    canRender: true,
    async render(text: string) {
      return fetchBytes(text)
    },
    async speak(text: string) {
      const bytes = await fetchBytes(text)
      const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }))
      audio?.pause()
      audio = new Audio(url)
      audio.onended = () => URL.revokeObjectURL(url)
      await audio.play()
    },
    stop() {
      audio?.pause()
    },
  }
}
