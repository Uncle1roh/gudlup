/* Azure Cognitive Services text-to-speech. POSTs SSML and returns mp3 bytes.
   Voices: pick a pt-BR neural voice, e.g. 'pt-BR-FranciscaNeural' (warm) or
   'pt-BR-AntonioNeural'. Same security caveat as ElevenLabs — the key ships to
   the browser, so this is for testing; proxy it server-side for production. */

import type { TtsProvider, TtsOptions } from './types'

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function createAzureTts(key: string, region: string, voice: string): TtsProvider {
  let audio: HTMLAudioElement | null = null
  const endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`

  function ssml(text: string, lang: string): string {
    return `<speak version="1.0" xml:lang="${lang}"><voice xml:lang="${lang}" name="${voice}">${escapeXml(text)}</voice></speak>`
  }

  async function fetchBytes(text: string, lang: string): Promise<ArrayBuffer> {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'goodloop-studio',
      },
      body: ssml(text, lang),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`Azure ${res.status}: ${detail.slice(0, 180)}`)
    }
    return res.arrayBuffer()
  }

  return {
    id: 'azure',
    label: 'Azure',
    canRender: true,
    async render(text: string, opts?: TtsOptions) {
      return fetchBytes(text, opts?.lang ?? 'pt-BR')
    },
    async speak(text: string, opts?: TtsOptions) {
      const bytes = await fetchBytes(text, opts?.lang ?? 'pt-BR')
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
