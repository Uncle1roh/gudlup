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

import { useCallback, useEffect, useRef, useState } from 'react'
import { getTtsProvider } from './index'
import {
  getTtsSettings, saveTtsSettings, elevenLabsSource,
  hydrateTtsSettings, saveSharedTtsSettings, loadAccountKeys, saveAccountKey, type SharedState,
} from './settings'
import { ARCHETYPES, defaultPrimary, defaultSecondary, resolveVoiceId, VOICE_CATALOG, voicesByArchetype, voiceLangOf } from './voiceCatalog'
import { fetchAccountInfo, syncVoices, type AccountInfo } from './voiceSync'
import { VOICE_ACCOUNTS, accountForKey } from './voiceAccounts'

const TEST_LINE = 'Você está em segurança. Respire fundo e solte.'
const TEST_LINE_M = 'La montagna è lì da sempre, sotto ogni tempesta.'

/**
 * A voice picker that never loses the operator's choice.
 *
 * `VOICE_CATALOG` is REPLACED by whatever the connected account returns, and
 * falls back to the seeded seventeen when a sync fails with no cache. So a
 * voice chosen from one account's list — or any voice at all, on a machine
 * whose sync just failed — was not in the list the select was rendering, the
 * select showed its first entry instead, and the next save wrote THAT over
 * everyone else's choice. That is the "standard voices keep changing".
 *
 * An id the catalog does not know is now rendered as its own option and kept.
 * It is labelled so the operator can see the difference between "Valeria" and
 * "an id this account cannot see", which is a real distinction: the second one
 * will fail at render time and should not look like a normal selection.
 */
function VoiceSelect({ value, onChange, allowDefault }: { value: string; onChange: (v: string) => void; allowDefault?: { label: string } }) {
  const res = resolveVoiceId(value)
  return (
    <select className="voice-panel__input" value={value} onChange={(e) => onChange(e.target.value)}>
      {allowDefault && <option value="">{allowDefault.label}</option>}
      {!res.voice && value && (
        <option value={value}>⚠ {value} — non in questo account</option>
      )}
      {res.remappedFrom && (
        <option value={value}>↪ {res.remappedFrom.name} (account precedente) → {res.voice?.name}</option>
      )}
      {/* Only the connected account's voices are in the catalog. Grouped by
          the language they speak: an Italian and a Portuguese "Maternal" are
          both in every account, and one flat list read as the same voice
          twice. */}
      {(['it', 'pt-BR'] as const).map((lang) => {
        const list = ARCHETYPES.flatMap((a) => voicesByArchetype(a.id, lang))
        return list.length ? (
          <optgroup key={lang} label={lang === 'it' ? 'Italiano (ITA)' : 'Português (BRA)'}>
            {list.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}{/\([FM]\)$/.test(v.name) ? '' : ` (${v.gender})`} · {voiceLangOf(v) === 'pt-BR' ? 'PT' : 'IT'}
              </option>
            ))}
          </optgroup>
        ) : null
      })}
    </select>
  )
}

export function VoiceEnginePanel({ onChanged }: { onChanged?: () => void }) {
  const [apiKey, setApiKey] = useState(() => getTtsSettings()?.apiKey ?? '')
  /* A STORED id wins over the catalog, always. Falling back to the default
     because the live list has not loaded yet — or failed — is what discarded
     the operator's choice on every visit. */
  const [voiceId, setVoiceId] = useState(() => getTtsSettings()?.voiceId || defaultPrimary().id)
  const [voiceIdM, setVoiceIdM] = useState(() => getTtsSettings()?.voiceIdSecondary || defaultSecondary().id)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /* bumped whenever the live catalog changes, so the pickers re-render */
  const [syncTick, setSyncTick] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [account, setAccount] = useState<AccountInfo | null>(null)
  /* whether the DATABASE copy of the key is usable — null until first read */
  const [shared, setShared] = useState<SharedState | null>(null)
  /* when the shared key was last changed. The POs rotate keys often, so the
     question "am I on the current one?" has to be answerable at a glance. */
  const [sharedAt, setSharedAt] = useState<number | null>(null)
  /* autosave bookkeeping: nothing is written before the shared row has been
     read, and an unchanged key must not trigger a voice re-sync */
  const [hydrated, setHydrated] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [savedNote, setSavedNote] = useState<string | null>(null)
  const lastSavedKey = useRef(getTtsSettings()?.apiKey ?? '')
  /* The account the key in force belongs to ('' = none; '?' = a key that is
     not one of ours), the keys the database holds for our accounts, and the
     account waiting for its key to be pasted — once. */
  const [accountId, setAccountId] = useState('')
  const [accountKeys, setAccountKeys] = useState<Record<string, string>>({})
  const [pasteFor, setPasteFor] = useState<string | null>(null)
  const [pasteValue, setPasteValue] = useState('')

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
    } else if (out.source === 'registry') {
      setStatus(`Account riconosciuto: ${out.account} — ${out.voices.length} voci (ITA + BRA) dall’elenco fisso.`)
    } else if (force) {
      setStatus(`${out.voices.length} voci sincronizzate dall’account ElevenLabs.`)
    }
    /* Deliberately NOT resetting a selection the synced list does not
       contain. The list is whatever this account exposes and it can be empty,
       stale or from a different workspace; substituting a default here threw
       away a deliberate choice and then saved the substitute. `VoiceSelect`
       shows an unknown id as itself, flagged. */
  }

  /* The shared key first, THEN the voices: a browser that has never seen the
     key (a new machine, a fresh preview URL, a cleared profile) picks it up
     from the database instead of asking the operator to paste it again. */
  useEffect(() => {
    let alive = true
    void (async () => {
      const { changed, state, sharedAt: at } = await hydrateTtsSettings()
      if (!alive) return
      setShared(state)
      if (at) setSharedAt(at)
      if (changed) {
        const s = getTtsSettings()
        if (s) {
          setApiKey(s.apiKey)
          if (s.voiceId) setVoiceId(s.voiceId)
          if (s.voiceIdSecondary) setVoiceIdM(s.voiceIdSecondary)
          setStatus('Chiave ElevenLabs recuperata dalle impostazioni condivise — non serve reinserirla.')
        }
      }
      await refreshVoices(false)
      const keys = await loadAccountKeys()
      const current = getTtsSettings()?.apiKey ?? ''
      const acct = await accountForKey(current)
      if (!alive) return
      setAccountKeys(keys)
      setAccountId(acct ? acct.id : current ? '?' : '')
      /* The key in force is one of ours and the database does not hold it
         under that account yet: store it now, so the dropdown can come back
         to it without anybody pasting it again. */
      if (acct && keys[acct.id] !== current.trim()) {
        const res = await saveAccountKey(acct.id, current)
        if (res.state === 'ok' && alive) setAccountKeys({ ...keys, [acct.id]: current.trim() })
      }
      if (alive) setHydrated(true)
    })()
    return () => { alive = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const provider = getTtsProvider()
  const source = elevenLabsSource()
  const sourceNote = source === 'shared'
    ? `chiave condivisa${sharedAt ? ` — aggiornata ${new Date(sharedAt).toLocaleString('it-IT')}` : ' — salvata nel database'}`
    : source === 'settings' ? 'chiave salvata solo in questo browser'
    : 'nessuna chiave ElevenLabs — voce di ripiego'
  /* Name the voice we are actually going to use. Printing "Valeria" for an id
     the account cannot see would be a comfortable lie about what will render. */
  const pRes = resolveVoiceId(voiceId)
  const mRes = resolveVoiceId(voiceIdM)
  const pName = pRes.voice?.name ?? voiceId
  const mName = mRes.voice?.name ?? voiceIdM
  /* A key change moves every id. The choice is kept as it was saved and served
     by the same archetype here, so the panel says which voice is speaking now
     instead of showing an id that belongs to an account nobody is using. */
  const remapped = [pRes, mRes].filter((r) => r.remappedFrom)

  /**
   * Write the settings down. Called by the Salva button AND by every change.
   *
   * `resync` is only true when the KEY changed: a different key is a different
   * workspace and its voice list has to be re-read, but re-syncing on every
   * dropdown change would hammer the API for nothing.
   */
  const persist = useCallback(async (
    next: { apiKey: string; voiceId: string; voiceIdSecondary?: string },
    opts: { resync?: boolean; loud?: boolean } = {},
  ) => {
    const payload = { ...next, savedAt: Date.now() }
    /* Local first, always. Whatever happens to the network, the operator's
       choice survives the next reload of this browser. */
    saveTtsSettings(payload)
    onChanged?.()
    if (opts.resync) void refreshVoices(true, payload.apiKey)

    const res = await saveSharedTtsSettings(payload)
    setShared(res.state)
    if (res.state === 'ok') {
      // the SERVER's timestamp, not this machine's clock — see SharedResult
      setSharedAt(res.savedAt ?? payload.savedAt)
      saveTtsSettings({ ...payload, shared: true, savedAt: res.savedAt ?? payload.savedAt })
      setSavedNote('Salvato per tutti')
      if (opts.loud) setStatus(`Salvato per tutti — vale su ogni computer. Voci: ${pName} + ${mName}.`)
    } else if (res.state === 'no-table') {
      setSavedNote('Salvato solo qui')
      if (opts.loud) setStatus('Salvato solo in questo browser. Per condividerlo esegui supabase/3-shared-voice-key.sql.')
    } else if (res.state === 'forbidden') {
      setSavedNote('Salvato solo qui')
      if (opts.loud) setStatus('Salvato solo in questo browser — il database ha rifiutato la scrittura (serve ruolo admin).')
    } else {
      setSavedNote('Salvato solo qui')
    }
    window.setTimeout(() => setSavedNote(null), 2600)
  }, [onChanged, pName, mName]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Save as soon as anything changes.
   *
   * Nothing was written until Salva was pressed — so choosing a voice and
   * walking away lost it, and the next load pulled the shared row back over
   * the top. On a shared machine that reads as "it keeps changing the key and
   * the standard voices by itself".
   *
   * Debounced, because the key is typed a character at a time and each
   * keystroke would otherwise be a database write. The guards matter as much
   * as the timer: nothing is written before hydration has finished (or a
   * half-loaded value would overwrite the shared one) and never with an empty
   * key (or clearing the field to retype would wipe it for everyone).
   */
  useEffect(() => {
    if (!hydrated || !dirty) return
    const key = apiKey.trim()
    if (!key) return
    const keyChanged = key !== lastSavedKey.current
    const id = window.setTimeout(() => {
      lastSavedKey.current = key
      setDirty(false)
      void persist({ apiKey: key, voiceId, voiceIdSecondary: voiceIdM || undefined }, { resync: keyChanged })
    }, keyChanged ? 900 : 250)
    return () => clearTimeout(id)
  }, [dirty, hydrated, apiKey, voiceId, voiceIdM, persist])

  /** Make an account the one in force: its key becomes the shared key, its
      22 voices the catalog, and the chosen voices move to their twins there. */
  async function switchTo(id: string, key: string) {
    setError(null); setStatus(null); setPasteFor(null); setPasteValue('')
    setAccountId(id)
    setApiKey(key)
    lastSavedKey.current = key
    await refreshVoices(true, key)
    const p = resolveVoiceId(voiceId).voice?.id ?? defaultPrimary().id
    const m = resolveVoiceId(voiceIdM).voice?.id ?? defaultSecondary().id
    setVoiceId(p)
    setVoiceIdM(m)
    setSyncTick((n) => n + 1)
    await persist({ apiKey: key, voiceId: p, voiceIdSecondary: m }, { loud: true })
  }

  async function chooseAccount(id: string) {
    const key = accountKeys[id]
    if (key) { await switchTo(id, key); return }
    // not stored yet: ask for it once, below the dropdown
    setPasteFor(id); setPasteValue(''); setError(null)
  }

  /** The one-time key: accepted only if its fingerprint IS that account. */
  async function submitPaste() {
    if (!pasteFor) return
    const key = pasteValue.trim()
    const acct = await accountForKey(key)
    const want = VOICE_ACCOUNTS.find((a) => a.id === pasteFor)
    if (!acct || acct.id !== pasteFor) {
      setError(`Questa chiave non appartiene a ${want?.label ?? 'questo account'}.`)
      return
    }
    const res = await saveAccountKey(acct.id, key)
    setAccountKeys((k) => ({ ...k, [acct.id]: key }))
    await switchTo(acct.id, key)
    /* Switching works either way; only remembering the key for everyone
       needs the database. Said, not hidden. */
    if (res.state !== 'ok') setStatus(`Account collegato in questo browser — la chiave non è stata salvata nel database (${res.state === 'forbidden' ? 'serve ruolo admin' : res.state === 'no-table' ? 'esegui supabase/3-shared-voice-key.sql' : 'nessuna connessione'}).`)
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
        <span className="voice-panel__src">
          {savedNote ? `✓ ${savedNote}` : dirty ? 'Salvataggio…' : sourceNote}
        </span>
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
        <select
          className="voice-panel__input"
          value={pasteFor ?? accountId}
          onChange={(e) => void chooseAccount(e.target.value)}
          aria-label="Account ElevenLabs"
        >
          {!accountId && !pasteFor && <option value="" disabled>Scegli l’account ElevenLabs…</option>}
          {accountId === '?' && <option value="?" disabled>Chiave attuale — non è un account Good Loop</option>}
          {VOICE_ACCOUNTS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <VoiceSelect key={`p-${syncTick}`} value={voiceId} onChange={(v) => { setVoiceId(v); setDirty(true) }} />
        <VoiceSelect key={`m-${syncTick}`} value={voiceIdM} onChange={(v) => { setVoiceIdM(v); setDirty(true) }} />
      </div>
      {pasteFor && (
        <div className="voice-panel__fields">
          <input
            className="voice-panel__input" type="password" autoComplete="off"
            placeholder={`Chiave di ${VOICE_ACCOUNTS.find((a) => a.id === pasteFor)?.label ?? ''} — solo la prima volta`}
            value={pasteValue}
            onChange={(e) => setPasteValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submitPaste() }}
          />
          <button className="voice-panel__btn voice-panel__btn--primary" onClick={() => void submitPaste()} disabled={!pasteValue.trim()}>Collega</button>
          <button className="voice-panel__btn voice-panel__btn--quiet" onClick={() => { setPasteFor(null); setError(null) }}>Annulla</button>
        </div>
      )}
      <p className="voice-panel__fine" style={{ marginTop: 2 }}>
        Il primo menu sceglie l’account ElevenLabs; gli altri due mostrano solo le sue {VOICE_CATALOG.length} voci.
        Voce principale: ogni battuta [F] o non marcata (predefinita {defaultPrimary().name}).
        Voce [M]: doppia induzione Deep (predefinita {defaultSecondary().name}).
        {syncing ? ' Caricamento delle voci…' : ''}
      </p>

      <div className="voice-panel__actions">
        <button className="voice-panel__btn" onClick={() => void test('primary')} disabled={busy}>{busy ? 'Riproduzione…' : '▶ Prova la voce'}</button>
        <button className="voice-panel__btn" onClick={() => void test('secondary')} disabled={busy} title="Riproduce una battuta italiana di doppia induzione con la voce [M]">▶ Prova [M]</button>
      </div>

      {remapped.length > 0 && (
        <p className="voice-panel__ok">
          {remapped.map((r) => `${r.remappedFrom?.name} → ${r.voice?.name}`).join(' · ')} — {remapped.length === 1 ? 'la voce scelta appartiene' : 'le voci scelte appartengono'} a un altro account
          ElevenLabs. Qui {remapped.length === 1 ? 'la sostituisce' : 'le sostituiscono'} lo stesso archetipo: la scelta resta com’era, e con la chiave di prima torna la voce di prima.
          Per fissare quella di adesso, riselezionala qui sopra.
        </p>
      )}
      {status && <p className="voice-panel__ok">{status}</p>}
      {error && <p className="voice-panel__err">{error}</p>}
      <p className="voice-panel__fine">
        Le modifiche si salvano da sole appena le fai — account e voci.{' '}
        {shared === 'no-table'
          ? 'La chiave resta solo in questo browser: la tabella app_settings non esiste ancora. Esegui supabase/3-shared-voice-key.sql per salvarla una volta sola e ritrovarla su ogni computer.'
          : shared === 'forbidden'
            ? 'La chiave resta solo in questo browser: questo account non può scrivere nelle impostazioni condivise (serve ruolo admin).'
            : 'La chiave viene salvata nel database (visibile ai soli admin) e riappare da sola su ogni computer e su ogni deploy. Una copia locale resta in questo browser per lavorare offline.'}
        {' '}Le chiavi degli account restano nel database (solo admin), mai nel codice.
      </p>
    </div>
  )
}
