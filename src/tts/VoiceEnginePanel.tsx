/* ============================================================================
   Good Loop — Voice engine panel (internal tool, English on purpose)
   Shows which TTS engine is ACTIVE right now and lets the operator paste the
   ElevenLabs key + voice ids directly in the app (localStorage) — no .env file,
   no rebuild, works on any deployment. Two voices:
     • Primary [F]  — the centre guide voice (required)
     • Secondary [M] — optional male archetype, used by the [M] rows of the
       Deep double-induction; when absent those rows fall back to the primary
       and the renderer notes it.
   "Test voice" speaks a line through the real provider and surfaces the exact
   error (401, bad voice id, quota…) instead of silently falling back to the
   robotic browser voice.
   ============================================================================ */

import { useState } from 'react'
import { tr } from '../i18n'
import { getTtsProvider } from './index'
import { getTtsSettings, saveTtsSettings, clearTtsSettings, elevenLabsSource, saveVoiceRoster } from './settings'

const TEST_LINE = 'Você está em segurança. Respire fundo e solte.'
const TEST_LINE_M = 'La montagna è lì da sempre, sotto ogni tempesta.'

interface VoiceOption { id: string; name: string }

export function VoiceEnginePanel({ onChanged }: { onChanged?: () => void }) {
  const [apiKey, setApiKey] = useState(() => getTtsSettings()?.apiKey ?? '')
  const [voiceId, setVoiceId] = useState(() => getTtsSettings()?.voiceId ?? '')
  const [voiceIdM, setVoiceIdM] = useState(() => getTtsSettings()?.voiceIdSecondary ?? '')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [voices, setVoices] = useState<VoiceOption[] | null>(null)
  const [loadingVoices, setLoadingVoices] = useState(false)

  /** List every voice on the ElevenLabs account so the operator can pick one. */
  async function loadVoices() {
    setError(null); setStatus(null)
    const key = apiKey.trim() || getTtsSettings()?.apiKey || (import.meta.env.VITE_ELEVENLABS_API_KEY as string | undefined)
    if (!key) { setError(tr('Paste the ElevenLabs API key first, then load the voices.')); return }
    setLoadingVoices(true)
    try {
      const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } })
      if (!res.ok) throw new Error(`ElevenLabs ${res.status} — ${res.status === 401 ? 'invalid API key' : await res.text()}`)
      const json = await res.json() as { voices?: { voice_id: string; name: string }[] }
      const list = (json.voices ?? []).map((v) => ({ id: v.voice_id, name: v.name }))
      if (!list.length) { setError(tr('No voices on this account yet — add one in the ElevenLabs Voice Library.')); return }
      setVoices(list)
      saveVoiceRoster(list) // the roster the Studio's per-clip voice picker offers
      if (!voiceId && list[0]) setVoiceId(list[0].id)
      setStatus(`${list.length} voices loaded (roster saved for the Studio's per-clip voice picker) — pick the primary [F] and optionally the secondary [M], then Save keys.`)
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
    if (!apiKey.trim() || !voiceId.trim()) { setError(tr('Both the API key and the primary Voice ID are needed (the [M] voice is optional).')); return }
    saveTtsSettings({ apiKey, voiceId, voiceIdSecondary: voiceIdM.trim() || undefined })
    setStatus(voiceIdM.trim()
      ? 'Saved — ElevenLabs active with primary [F] + secondary [M] voices.'
      : 'Saved — ElevenLabs active (primary voice only; [M] rows will use it too).')
    onChanged?.()
  }

  function clear() {
    clearTtsSettings()
    setApiKey(''); setVoiceId(''); setVoiceIdM('')
    setError(null)
    setStatus('Cleared — falling back to env keys (if set) or the browser voice.')
    onChanged?.()
  }

  async function test(which: 'primary' | 'secondary') {
    setError(null); setStatus(null); setBusy(true)
    const p = getTtsProvider()
    try {
      await p.speak(which === 'secondary' ? TEST_LINE_M : TEST_LINE, { lang: which === 'secondary' ? 'it' : 'pt-BR', voice: which })
      const fellBack = which === 'secondary' && !p.hasSecondaryVoice
      setStatus(`Spoken with: ${p.label}${which === 'secondary' ? ` — [M] voice${fellBack ? ' NOT set, primary used' : ''}` : ''}${p.canRender ? '' : ' — preview-only (robotic). Save ElevenLabs keys above for the real voice.'}`)
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
          {provider.canRender ? '●' : '○'} Active engine: {provider.label}{provider.hasSecondaryVoice ? ' · F+M' : ''}
        </span>
        <span className="voice-panel__src">{sourceNote}</span>
      </div>

      <div className="voice-panel__fields">
        <input
          className="voice-panel__input" type="password" placeholder={tr('ElevenLabs API key')}
          value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off"
        />
        {voices ? (
          <select className="voice-panel__input" value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
            {voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        ) : (
          <input
            className="voice-panel__input" type="text" placeholder={tr('Primary Voice ID [F] (or use Load voices →)')}
            value={voiceId} onChange={(e) => setVoiceId(e.target.value)} autoComplete="off"
          />
        )}
        {voices ? (
          <select className="voice-panel__input" value={voiceIdM} onChange={(e) => setVoiceIdM(e.target.value)}>
            <option value="">{tr('— no [M] voice (optional) —')}</option>
            {voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        ) : (
          <input
            className="voice-panel__input" type="text" placeholder={tr('Secondary Voice ID [M] — optional (Deep double-induction)')}
            value={voiceIdM} onChange={(e) => setVoiceIdM(e.target.value)} autoComplete="off"
          />
        )}
      </div>

      <div className="voice-panel__actions">
        <button className="voice-panel__btn voice-panel__btn--primary" onClick={save}>{tr('Save keys')}</button>
        <button className="voice-panel__btn" onClick={loadVoices} disabled={loadingVoices}>{loadingVoices ? tr('Loading…') : tr('♪ Load voices')}</button>
        <button className="voice-panel__btn" onClick={() => void test('primary')} disabled={busy}>{busy ? tr('Speaking…') : tr('▶ Test voice')}</button>
        <button className="voice-panel__btn" onClick={() => void test('secondary')} disabled={busy} title={tr('Speaks an Italian double-induction line with the [M] voice (falls back to primary if unset)')}>{tr('▶ Test M')}</button>
        <button className="voice-panel__btn voice-panel__btn--quiet" onClick={clear}>{tr('Clear')}</button>
      </div>

      {status && <p className="voice-panel__ok">{status}</p>}
      {error && <p className="voice-panel__err">{error}</p>}
      <p className="voice-panel__fine">
        {tr('Keys saved here live only in this browser (localStorage) and take effect immediately — no rebuild or redeploy. Build-time env keys still work as the fallback')}
        (<code>{tr('VITE_ELEVENLABS_VOICE_ID_M')}</code> {tr('for the optional [M] voice')}).
      </p>
    </div>
  )
}
