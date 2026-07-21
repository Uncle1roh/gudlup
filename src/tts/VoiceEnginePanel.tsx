/* ============================================================================
   Good Loop — Voice engine panel (internal tool, English on purpose)
   Shows which TTS engine is ACTIVE and lets the operator paste the ElevenLabs
   API key. Voice IDs are GONE from every screen: the PO-approved voice
   catalog (9 archetypes, all ids baked in) supplies every option by name.
     • Primary voice — defaults to Valeria (F · Maternal), the standard voice.
     • Secondary [M] — defaults to Marco Trox (M · Paternal), the Deep
       double-induction voice.
   Both selectable from the full catalog, grouped by archetype. "Test voice" /
   "Test M" speak through the real provider and surface the exact error
   (401, quota…) instead of silently falling back to the robotic browser voice.
   ============================================================================ */

import { useState } from 'react'
import { getTtsProvider } from './index'
import { getTtsSettings, saveTtsSettings, clearTtsSettings, elevenLabsSource } from './settings'
import { ARCHETYPES, DEFAULT_PRIMARY, DEFAULT_SECONDARY, VOICE_CATALOG, voiceById, voicesByArchetype } from './voiceCatalog'

const TEST_LINE = 'Você está em segurança. Respire fundo e solte.'
const TEST_LINE_M = 'La montagna è lì da sempre, sotto ogni tempesta.'

function VoiceSelect({ value, onChange, allowDefault }: { value: string; onChange: (v: string) => void; allowDefault?: { label: string } }) {
  return (
    <select className="voice-panel__input" value={value} onChange={(e) => onChange(e.target.value)}>
      {allowDefault && <option value="">{allowDefault.label}</option>}
      {ARCHETYPES.map((a) => {
        const list = voicesByArchetype(a.id)
        return list.length ? (
          <optgroup key={a.id} label={`${a.icon} ${a.label}`}>
            {list.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.gender})</option>)}
          </optgroup>
        ) : null
      })}
    </select>
  )
}

export function VoiceEnginePanel({ onChanged }: { onChanged?: () => void }) {
  const [apiKey, setApiKey] = useState(() => getTtsSettings()?.apiKey ?? '')
  const [voiceId, setVoiceId] = useState(() => { const v = getTtsSettings()?.voiceId; return voiceById(v) ? v! : DEFAULT_PRIMARY.id })
  const [voiceIdM, setVoiceIdM] = useState(() => { const v = getTtsSettings()?.voiceIdSecondary; return voiceById(v) ? v! : DEFAULT_SECONDARY.id })
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const provider = getTtsProvider()
  const source = elevenLabsSource()
  const sourceNote = source === 'settings' ? 'key saved in this browser'
    : source === 'env' ? 'key from build env'
    : 'no ElevenLabs key — using fallback'
  const pName = voiceById(voiceId)?.name ?? DEFAULT_PRIMARY.name
  const mName = voiceById(voiceIdM)?.name ?? DEFAULT_SECONDARY.name

  function save() {
    setError(null); setStatus(null)
    if (!apiKey.trim()) { setError('Paste the ElevenLabs API key — the voices are already built in.'); return }
    saveTtsSettings({ apiKey, voiceId, voiceIdSecondary: voiceIdM || undefined })
    setStatus(`Saved — ElevenLabs active with ${pName} (primary) + ${mName} ([M] voice).`)
    onChanged?.()
  }

  function clear() {
    clearTtsSettings()
    setApiKey('')
    setVoiceId(DEFAULT_PRIMARY.id)
    setVoiceIdM(DEFAULT_SECONDARY.id)
    setError(null)
    setStatus('Cleared — falling back to the env key (if set) or the browser voice.')
    onChanged?.()
  }

  async function test(which: 'primary' | 'secondary') {
    setError(null); setStatus(null); setBusy(true)
    const p = getTtsProvider()
    try {
      await p.speak(which === 'secondary' ? TEST_LINE_M : TEST_LINE, { lang: which === 'secondary' ? 'it' : 'pt-BR', voice: which })
      setStatus(`Spoken with: ${p.label} — ${which === 'secondary' ? mName : pName}${p.canRender ? '' : ' — preview-only (robotic). Save the ElevenLabs key above for the real voice.'}`)
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
          {provider.canRender ? '●' : '○'} Active engine: {provider.label}{provider.canRender ? ` · ${pName} + ${mName}` : ''}
        </span>
        <span className="voice-panel__src">{sourceNote}</span>
      </div>

      <div className="voice-panel__fields">
        <input
          className="voice-panel__input" type="password" placeholder="ElevenLabs API key"
          value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off"
        />
        <VoiceSelect value={voiceId} onChange={setVoiceId} />
        <VoiceSelect value={voiceIdM} onChange={setVoiceIdM} />
      </div>
      <p className="voice-panel__fine" style={{ marginTop: 2 }}>
        Left: primary voice (every [F]/unmarked line — default {DEFAULT_PRIMARY.name}, Maternal).
        Right: [M] voice (Deep double-induction — default {DEFAULT_SECONDARY.name}, Paternal).
        All {VOICE_CATALOG.length} PO-approved voices are built in — no IDs to paste.
      </p>

      <div className="voice-panel__actions">
        <button className="voice-panel__btn voice-panel__btn--primary" onClick={save}>Save</button>
        <button className="voice-panel__btn" onClick={() => void test('primary')} disabled={busy}>{busy ? 'Speaking…' : '▶ Test voice'}</button>
        <button className="voice-panel__btn" onClick={() => void test('secondary')} disabled={busy} title="Speaks an Italian double-induction line with the [M] voice">▶ Test M</button>
        <button className="voice-panel__btn voice-panel__btn--quiet" onClick={clear}>Clear</button>
      </div>

      {status && <p className="voice-panel__ok">{status}</p>}
      {error && <p className="voice-panel__err">{error}</p>}
      <p className="voice-panel__fine">
        The key saved here lives only in this browser (localStorage) and takes effect immediately — no rebuild.
        Build-time env keys still work as the fallback.
      </p>
    </div>
  )
}
