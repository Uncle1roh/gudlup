/* ============================================================================
   Good Loop — Voice engine panel (internal tool, English on purpose)
   Shows which TTS engine is ACTIVE right now and lets the operator paste the
   ElevenLabs key + voice id directly in the app (localStorage) — no .env file,
   no rebuild, works on any deployment. "Test voice" speaks a pt-BR line through
   the real provider and surfaces the exact error (401, bad voice id, quota…)
   instead of silently falling back to the robotic browser voice.
   ============================================================================ */

import { useState } from 'react'
import { getTtsProvider } from './index'
import { getTtsSettings, saveTtsSettings, clearTtsSettings, elevenLabsSource } from './settings'

const TEST_LINE = 'Você está em segurança. Respire fundo e solte.'

interface VoiceOption { id: string; name: string }

export function VoiceEnginePanel({ onChanged }: { onChanged?: () => void }) {
  const [apiKey, setApiKey] = useState(() => getTtsSettings()?.apiKey ?? '')
  const [voiceId, setVoiceId] = useState(() => getTtsSettings()?.voiceId ?? '')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [voices, setVoices] = useState<VoiceOption[] | null>(null)
  const [loadingVoices, setLoadingVoices] = useState(false)

  /** List every voice on the ElevenLabs account so the operator can pick one. */
  async function loadVoices() {
    setError(null); setStatus(null)
    const key = apiKey.trim() || getTtsSettings()?.apiKey || (import.meta.env.VITE_ELEVENLABS_API_KEY as string | undefined)
    if (!key) { setError('Paste the ElevenLabs API key first, then load the voices.'); return }
    setLoadingVoices(true)
    try {
      const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } })
      if (!res.ok) throw new Error(`ElevenLabs ${res.status} — ${res.status === 401 ? 'invalid API key' : await res.text()}`)
      const json = await res.json() as { voices?: { voice_id: string; name: string }[] }
      const list = (json.voices ?? []).map((v) => ({ id: v.voice_id, name: v.name }))
      if (!list.length) { setError('No voices on this account yet — add one in the ElevenLabs Voice Library.'); return }
      setVoices(list)
      if (!voiceId && list[0]) setVoiceId(list[0].id)
      setStatus(`${list.length} voices loaded — pick one, then Save keys.`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoadingVoices(false)
    }
  }

  const provider = getTtsProvider()
  const source = elevenLabsSource()
  const sourceNote = source === 'settings' ? 'keys saved in this browser'
    : source === 'env' ? 'keys from build env'
    : 'no ElevenLabs keys — using fallback'

  function save() {
    setError(null); setStatus(null)
    if (!apiKey.trim() || !voiceId.trim()) { setError('Both the API key and the Voice ID are needed.'); return }
    saveTtsSettings({ apiKey, voiceId })
    setStatus('Saved — ElevenLabs is now the active engine in this browser.')
    onChanged?.()
  }

  function clear() {
    clearTtsSettings()
    setApiKey(''); setVoiceId('')
    setError(null)
    setStatus('Cleared — falling back to env keys (if set) or the browser voice.')
    onChanged?.()
  }

  async function test() {
    setError(null); setStatus(null); setBusy(true)
    const p = getTtsProvider()
    try {
      await p.speak(TEST_LINE, { lang: 'pt-BR' })
      setStatus(`Spoken with: ${p.label}${p.canRender ? '' : ' — preview-only (robotic). Save ElevenLabs keys above for the real voice.'}`)
    } catch (e) {
      setError(`${p.label}: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="voice-panel">
      <div className="voice-panel__row">
        <span className={`voice-panel__badge${provider.canRender ? ' is-ok' : ''}`}>
          {provider.canRender ? '●' : '○'} Active engine: {provider.label}
        </span>
        <span className="voice-panel__src">{sourceNote}</span>
      </div>

      <div className="voice-panel__fields">
        <input
          className="voice-panel__input" type="password" placeholder="ElevenLabs API key"
          value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off"
        />
        {voices ? (
          <select className="voice-panel__input" value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
            {voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        ) : (
          <input
            className="voice-panel__input" type="text" placeholder="Voice ID (or use Load voices →)"
            value={voiceId} onChange={(e) => setVoiceId(e.target.value)} autoComplete="off"
          />
        )}
      </div>

      <div className="voice-panel__actions">
        <button className="voice-panel__btn voice-panel__btn--primary" onClick={save}>Save keys</button>
        <button className="voice-panel__btn" onClick={loadVoices} disabled={loadingVoices}>{loadingVoices ? 'Loading…' : '♪ Load voices'}</button>
        <button className="voice-panel__btn" onClick={test} disabled={busy}>{busy ? 'Speaking…' : '▶ Test voice'}</button>
        <button className="voice-panel__btn voice-panel__btn--quiet" onClick={clear}>Clear</button>
      </div>

      {status && <p className="voice-panel__ok">{status}</p>}
      {error && <p className="voice-panel__err">{error}</p>}
      <p className="voice-panel__fine">
        Keys saved here live only in this browser (localStorage) and take effect immediately —
        no rebuild or redeploy. Build-time env keys still work as the fallback.
      </p>
    </div>
  )
}
