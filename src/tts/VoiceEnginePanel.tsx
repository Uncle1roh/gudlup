/* ============================================================================
   Good Loop — Pannello motore vocale
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

import { useEffect, useState } from 'react'
import { getTtsProvider } from './index'
import { getTtsSettings, saveTtsSettings, clearTtsSettings, elevenLabsSource } from './settings'
import { ARCHETYPES, defaultPrimary, defaultSecondary, VOICE_CATALOG, voiceById, voicesByArchetype, voicesSyncedAt } from './voiceCatalog'
import { syncVoices } from './voiceSync'

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
  const [voiceId, setVoiceId] = useState(() => { const v = getTtsSettings()?.voiceId; return voiceById(v) ? v! : defaultPrimary().id })
  const [voiceIdM, setVoiceIdM] = useState(() => { const v = getTtsSettings()?.voiceIdSecondary; return voiceById(v) ? v! : defaultSecondary().id })
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /* bumped whenever the live catalog changes, so the pickers re-render */
  const [syncTick, setSyncTick] = useState(0)
  const [syncing, setSyncing] = useState(false)

  /** Pull the account's voices — the POs add one in ElevenLabs and it lands
      here, no code change. */
  async function refreshVoices(force: boolean, key?: string) {
    setSyncing(true)
    setError(null)
    const out = await syncVoices({ force, apiKey: key })
    setSyncing(false)
    setSyncTick((n) => n + 1)
    if (out.error) {
      setError(`Sincronizzazione voci: ${out.error}`)
    } else if (force) {
      setStatus(`${out.voices.length} voci sincronizzate dall’account ElevenLabs.`)
    }
    // a synced list may not contain the previously selected ids
    if (!voiceById(voiceId)) setVoiceId(defaultPrimary().id)
    if (!voiceById(voiceIdM)) setVoiceIdM(defaultSecondary().id)
  }

  useEffect(() => { void refreshVoices(false) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const syncedAt = voicesSyncedAt()
  const provider = getTtsProvider()
  const source = elevenLabsSource()
  const sourceNote = source === 'settings' ? 'chiave salvata in questo browser'
    : source === 'env' ? 'chiave dall’ambiente di build'
    : 'nessuna chiave ElevenLabs — voce di ripiego'
  const pName = voiceById(voiceId)?.name ?? defaultPrimary().name
  const mName = voiceById(voiceIdM)?.name ?? defaultSecondary().name

  function save() {
    setError(null); setStatus(null)
    if (!apiKey.trim()) { setError('Incolla la chiave API di ElevenLabs.'); return }
    saveTtsSettings({ apiKey, voiceId, voiceIdSecondary: voiceIdM || undefined })
    setStatus(`Salvato — ElevenLabs attivo con ${pName} (principale) + ${mName} (voce [M]).`)
    // a new key means a different workspace: re-read its voices immediately
    void refreshVoices(true, apiKey)
    onChanged?.()
  }

  function clear() {
    clearTtsSettings()
    setApiKey('')
    setVoiceId(defaultPrimary().id)
    setVoiceIdM(defaultSecondary().id)
    setError(null)
    setStatus('Cancellato — si torna alla chiave d’ambiente (se impostata) o alla voce del browser.')
    onChanged?.()
  }

  async function test(which: 'primary' | 'secondary') {
    setError(null); setStatus(null); setBusy(true)
    const p = getTtsProvider()
    try {
      await p.speak(which === 'secondary' ? TEST_LINE_M : TEST_LINE, { lang: which === 'secondary' ? 'it' : 'pt-BR', voice: which })
      setStatus(`Riprodotto con: ${p.label} — ${which === 'secondary' ? mName : pName}${p.canRender ? '' : ' — solo anteprima (voce robotica). Salva qui sopra la chiave ElevenLabs per la voce reale.'}`)
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
          {provider.canRender ? '●' : '○'} Motore attivo: {provider.label}{provider.canRender ? ` · ${pName} + ${mName}` : ''}
        </span>
        <span className="voice-panel__src">{sourceNote}</span>
      </div>

      <div className="voice-panel__fields">
        <input
          className="voice-panel__input" type="password" placeholder="Chiave API ElevenLabs"
          value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off"
        />
        <VoiceSelect key={`p-${syncTick}`} value={voiceId} onChange={setVoiceId} />
        <VoiceSelect key={`m-${syncTick}`} value={voiceIdM} onChange={setVoiceIdM} />
      </div>
      <p className="voice-panel__fine" style={{ marginTop: 2 }}>
        A sinistra: voce principale (ogni battuta [F] o non marcata — predefinita {defaultPrimary().name}).
        A destra: voce [M] (doppia induzione Deep — predefinita {defaultSecondary().name}).
        L’elenco arriva dall’account ElevenLabs collegato: {VOICE_CATALOG.length} voci
        {syncedAt ? ` · aggiornato ${new Date(syncedAt).toLocaleString('it-IT')}` : ' · non ancora sincronizzato'}.
        Le voci create dai PO compaiono qui da sole.
      </p>

      <div className="voice-panel__actions">
        <button className="voice-panel__btn voice-panel__btn--primary" onClick={save}>Salva</button>
        <button
          className="voice-panel__btn"
          onClick={() => void refreshVoices(true)}
          disabled={syncing}
          title="Rilegge l’elenco voci dall’account ElevenLabs collegato"
        >
          {syncing ? 'Sincronizzazione…' : '⟳ Aggiorna voci'}
        </button>
        <button className="voice-panel__btn" onClick={() => void test('primary')} disabled={busy}>{busy ? 'Riproduzione…' : '▶ Prova la voce'}</button>
        <button className="voice-panel__btn" onClick={() => void test('secondary')} disabled={busy} title="Riproduce una battuta italiana di doppia induzione con la voce [M]">▶ Prova [M]</button>
        <button className="voice-panel__btn voice-panel__btn--quiet" onClick={clear}>Cancella</button>
      </div>

      {status && <p className="voice-panel__ok">{status}</p>}
      {error && <p className="voice-panel__err">{error}</p>}
      <p className="voice-panel__fine">
        La chiave salvata qui resta solo in questo browser (localStorage) ed è attiva subito, senza ricompilare.
        Le chiavi impostate nell’ambiente di build restano come ripiego.
      </p>
    </div>
  )
}
