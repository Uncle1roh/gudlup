/* Browser voice via the Web Speech API. Zero config — works with no keys — but
   it plays straight to the speakers and exposes no audio stream, so it can only
   PREVIEW. Rendering voice into a clip (to layer + export) needs an API key. */

import type { TtsProvider, TtsOptions } from './types'

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis?.getVoices() ?? []
  const l = lang.toLowerCase()
  return (
    voices.find((v) => v.lang?.toLowerCase() === l) ??
    voices.find((v) => v.lang?.toLowerCase().startsWith(l.slice(0, 2))) ??
    undefined
  )
}

export function createBrowserTts(): TtsProvider {
  return {
    id: 'browser',
    label: 'Browser voice (preview only)',
    canRender: false,
    async speak(text: string, opts?: TtsOptions) {
      const synth = window.speechSynthesis
      if (!synth) throw new Error('This browser has no speech synthesis.')
      synth.cancel()
      await new Promise<void>((resolve, reject) => {
        const u = new SpeechSynthesisUtterance(text)
        const lang = opts?.lang ?? 'pt-BR'
        u.lang = lang
        const v = pickVoice(lang)
        if (v) u.voice = v
        if (opts?.rate) u.rate = opts.rate
        if (opts?.pitch) u.pitch = opts.pitch
        u.onend = () => resolve()
        u.onerror = (e) => reject(new Error(`Speech failed: ${e.error}`))
        synth.speak(u)
      })
    },
    async render() {
      throw new Error('Browser voice can only preview. Set an ElevenLabs or Azure key to render and layer voice.')
    },
    stop() {
      window.speechSynthesis?.cancel()
    },
  }
}
