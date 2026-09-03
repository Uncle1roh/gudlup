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
import {
  getTtsSettings, saveTtsSettings, clearTtsSettings, elevenLabsSource,
  hydrateTtsSettings, saveSharedTtsSettings, clearSharedTtsSettings, type SharedState,
} from './settings'
import { ARCHETYPES, defaultPrimary, defaultSecondary, VOICE_CATALOG, voiceById, voicesByArchetype, voicesSyncedAt } from './voiceCatalog'
import { fetchAccountInfo, syncVoices, type AccountInfo } from './voiceSync'

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
  const [account, setAccount] = useState<AccountInfo | null>(null)
  /* whether the DATABASE copy of the key is usable — null until first read */
  const [shared, setShared] = useState<SharedState | null>(null)

  /** Pull the account's voices — the POs add one in ElevenLabs and it lands
      here, no code change. */
  async function refreshVoices(force: boolean, key?: string) {
    setSyncing(true)
    setError(null)
    const out = await syncVoices({ force, apiKey: key })
    void fetchAccountInfo(key).then(setAccount)
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

  /* The shared key first, THEN the voices: a browser that has never seen the
     key (a new machine, a fresh preview URL, a cleared profile) picks it up
     from the database instead of asking the operator to paste it again. */
  useEffect(() => {
    let alive = true
    void (async () => {
      const { changed, state } = await hydrateTtsSettings()
      if (!alive) return
      setShared(state)
      if (changed) {
        const s = getTtsSettings()
        if (s) {
          setApiKey(s.apiKey)
          if (voiceById(s.voiceId)) setVoiceId(s.voiceId)
          if (voiceById(s.voiceIdSecondary)) setVoiceIdM(s.voiceIdSecondary as string)
          setStatus('Chiave ElevenLabs recuperata dalle impostazioni condivise — non serve reinserirla.')
        }
      }
      await refreshVoices(false)
    })()
    return () => { alive = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const syncedAt = voicesSyncedAt()
  const provider = getTtsProvider()
  const source = elevenLabsSource()
  const sourceNote = source === 'shared' ? 'chiave condivisa — salvata nel database'
    : source === 'settings' ? 'chiave salvata solo in questo browser'
    : source === 'env' ? 'chiave dall’ambiente di build'
    : 'nessuna chiave ElevenLabs — voce di ripiego'
  const pName = voiceById(voiceId)?.name ?? defaultPrimary().name
  const mName = voiceById(voiceIdM)?.name ?? defaultSecondary().name

  async function save() {
    setError(null); setStatus(null)
    if (!apiKey.trim()) { setError('Incolla la chiave API di ElevenLabs.'); return }
    const next = { apiKey, voiceId, voiceIdSecondary: voiceIdM || undefined, savedAt: Date.now() }
    saveTtsSettings(next)
    setStatus(`Salvato — ElevenLabs attivo con ${pName} (principale) + ${mName} (voce [M]).`)
    // a new key means a different workspace: re-read its voices immediately
    void refreshVoices(true, apiKey)
    onChanged?.()

    /* Push it to the shared row so the NEXT browser does not have to be told
       again. A failure here never loses the key — the local copy is already
       written — it only means this machine keeps it to itself. */
    const res = await saveSharedTtsSettings(next)
    setShared(res.state)
    if (res.state === 'ok') {
      saveTtsSettings({ ...next, shared: true })
      setStatus(`Salvato per tutti — la chiave è nel database e vale su ogni computer. Voci: ${pName} + ${mName}.`)
    } else if (res.state === 'no-table') {
      setStatus(`Salvato solo in questo browser. Per condividerla su ogni computer esegui supabase/3-shared-voice-key.sql. Voci: ${pName} + ${mName}.`)
    } else if (res.state === 'forbidden') {
      setStatus(`Salvato solo in questo browser — il database ha rifiutato la scrittura (serve un account con ruolo admin). Voci: ${pName} + ${mName}.`)
    }
  }

  async function clear() {
    clearTtsSettings()
    setApiKey('')
    setVoiceId(defaultPrimary().id)
    setVoiceIdM(defaultSecondary().id)
    setError(null)
    setStatus('Cancellato — si torna alla chiave d’ambiente (se impostata) o alla voce del browser.')
    onChanged?.()
    /* The shared row goes too: leaving it would silently restore the key on
       the next load, which is not what "Cancella" can be allowed to mean. */
    const res = await clearSharedTtsSettings()
    if (res.state === 'ok') setStatus('Cancellato ovunque — rimossa anche la chiave condivisa nel database.')
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

      {/* which ElevenLabs account this key really is, and what is left on it —
          a mismatch here is what "voice not found" and "no credits" both mean */}
      {account && (
        <div className={`voice-panel__acct${account.charactersLeft < 2000 ? ' is-low' : ''}`}>
          Account <b>{account.name}</b> · piano {account.tier} ·{' '}
          <b>{account.charactersLeft.toLocaleString('it-IT')}</b> caratteri residui
          {account.charactersLimit > 0 && ` su ${account.charactersLimit.toLocaleString('it-IT')}`}
          {account.voiceSlotsUsed !== undefined && ` · ${account.voiceSlotsUsed} voci create`}
          {account.charactersLeft < 2000 && ' — credito quasi esaurito'}
        </div>
      )}

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
        <button className="voice-panel__btn voice-panel__btn--primary" onClick={() => void save()}>Salva</button>
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
        <button className="voice-panel__btn voice-panel__btn--quiet" onClick={() => void clear()}>Cancella</button>
      </div>

      {status && <p className="voice-panel__ok">{status}</p>}
      {error && <p className="voice-panel__err">{error}</p>}
      <p className="voice-panel__fine">
        {shared === 'no-table'
          ? 'La chiave resta solo in questo browser: la tabella app_settings non esiste ancora. Esegui supabase/3-shared-voice-key.sql per salvarla una volta sola e ritrovarla su ogni computer.'
          : shared === 'forbidden'
            ? 'La chiave resta solo in questo browser: questo account non può scrivere nelle impostazioni condivise (serve ruolo admin).'
            : 'La chiave viene salvata nel database (visibile ai soli admin) e riappare da sola su ogni computer e su ogni deploy. Una copia locale resta in questo browser per lavorare offline.'}
        {' '}Le chiavi impostate nell’ambiente di build restano come ripiego.
      </p>
    </div>
  )
}
