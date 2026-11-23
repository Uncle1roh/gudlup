/* ============================================================================
   Good Loop — voice sync

   Installs the voice list of the ONE account the engine speaks with
   (`ACTIVE_ACCOUNT_ID`, voiceAccounts.ts). Its 22 voices are written down, so
   this needs no network at all: the pickers are right on the first paint and
   an id is never read from a workspace nobody chose.

   It used to read /v1/voices for any key and install whatever came back —
   which is how a personal ElevenLabs workspace became the catalog, with names
   parsed out of its own conventions, while every id saved in a protocol
   pointed at a voice that account does not have. A key that is not the active
   account's now installs the ACTIVE catalog and says the key is wrong.

   Cached in localStorage so the app paints the list before any await.
   `selectCatalogVoices` / `toCatalogVoice` are still exported: the check
   tools read a live account with them, and `normalizeCached` repairs lists
   cached by the old path.
   ============================================================================ */

import { ACTIVE_ACCOUNT_ID, accountForKey, activeAccount } from './voiceAccounts'
import {
  accountCatalog,
  ARCHETYPE_OVERRIDES,
  inferArchetype,
  parseVoiceName,
  registerVoices,
  type CatalogVoice,
  type ElevenLabsLabels,
} from './voiceCatalog'
import { getTtsSettings } from './settings'

/* v2: lists cached before the account registry and the "MALE - RITUAL"
   parser hold every male voice as female and every name as "BRA"/"ITA" —
   they are dropped, not trusted. */
const CACHE_KEY = 'gl.tts.voices.v2'

interface Cache { at: number; voices: CatalogVoice[]; key?: string }

export interface SyncOutcome {
  voices: CatalogVoice[]
  at: number
  source: 'api' | 'cache' | 'none' | 'registry'
  error?: string
  /** Set when the key belongs to one of our accounts (voiceAccounts.ts). */
  account?: string
}

/** The key actually in force: the one typed in the app, and nothing else. */
export function activeApiKey(): string | undefined {
  return getTtsSettings()?.apiKey?.trim() || undefined
}

/**
 * Which key a cached list was read with — the last characters only, enough to
 * tell two keys apart. A list is an ACCOUNT's voices: shown under another key
 * it is simply the wrong list, which is what a fresh tab used to paint.
 */
function keyTag(key: string | undefined): string {
  return key ? key.slice(-8) : ''
}

/** The cached list, only when it was read with `key`. */
function readCache(key: string | undefined = activeApiKey()): Cache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as Cache
    if (!key || c?.key !== keyTag(key)) return null
    return Array.isArray(c?.voices) && c.voices.length ? { ...c, voices: c.voices.map(normalizeCached) } : null
  } catch {
    return null
  }
}

function writeCache(c: Cache): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)) } catch { /* private mode */ }
}

export function clearVoiceCache(): void {
  try { localStorage.removeItem(CACHE_KEY) } catch { /* private mode */ }
}

export interface ApiVoice {
  voice_id: string
  name?: string
  category?: string
  labels?: ElevenLabsLabels
}

/**
 * "My Voices" — what the ElevenLabs UI shows under that heading: the
 * workspace's own generated/cloned voices plus anything added from the Voice
 * Library. The 21 stock 'premade' voices are excluded: they are not the POs'
 * selection and drowned the real list 21-to-11 in every picker.
 */
export function isMyVoice(v: ApiVoice): boolean {
  return v.category !== 'premade'
}

/**
 * The catalog the app should show, from a raw /v1/voices payload:
 *   1. "My Voices" only — never the 21 stock premade voices.
 *   2. of those, only the ones the POs marked "[ok]" — their finished
 *      selection, not the library voices left over from experiments.
 * Each narrowing falls back to the wider set when it would empty the list, so
 * an account that does not follow the convention still gets pickers that work.
 */
export function selectCatalogVoices(all: ApiVoice[]): CatalogVoice[] {
  const mine = all.filter(isMyVoice)
  const mapped = (mine.length ? mine : all).map(toCatalogVoice)
  const approved = mapped.filter((v) => v.approved)
  return approved.length ? approved : mapped
}

export function toCatalogVoice(v: ApiVoice): CatalogVoice {
  const labels = v.labels ?? {}
  const raw = (v.name ?? v.voice_id).trim()
  // the POs' own convention ("[ok] ASMR (M) - ITA") wins: generated voices
  // carry no ElevenLabs labels at all, so inference has nothing to read
  const parsed = parseVoiceName(raw)
  const labelGender: 'F' | 'M' | undefined = /female|woman/i.test(labels.gender ?? '') ? 'F'
    : /male|man/i.test(labels.gender ?? '') ? 'M'
    : undefined
  const gender = parsed.gender ?? labelGender ?? 'F'
  const archetype = ARCHETYPE_OVERRIDES[v.voice_id]
    ?? parsed.archetype
    ?? inferArchetype(raw, labels, gender)
  return {
    id: v.voice_id,
    // library voices carry a marketing tail ("Borges - Slow, Calm and Confident")
    name: parsed.archetype ? parsed.name : raw.split(/\s+[-–—]\s+/)[0].trim() || raw,
    gender,
    archetype,
    category: v.category,
    /* The language comes from the NAME marker (ITA / BRA), never from the
       ElevenLabs label: generated voices carry no labels, and a library voice
       labelled "en" is an accent, not the language the POs voice it in. No
       marker = Italian, which is what every voice was before BRA existed. */
    language: parsed.language ?? 'it',
    approved: parsed.approved,
  }
}

/**
 * A voice as it was CACHED before the name's language marker was read.
 *
 * The cache holds the cleaned-up entry, not the raw ElevenLabs name, so an old
 * "BRA MATERNAL (F)" — which the previous parser could not read — sits there
 * under its raw name with an inferred archetype and no language. Re-reading
 * that name recovers all three; an entry whose name was already clean
 * ("Maternal") has nothing more to give and is Italian.
 */
function normalizeCached(v: CatalogVoice): CatalogVoice {
  if (v.language === 'it' || v.language === 'pt-BR') return v
  const parsed = parseVoiceName(v.name)
  return {
    ...v,
    name: parsed.archetype ? parsed.name : v.name,
    archetype: parsed.archetype ?? v.archetype,
    gender: parsed.gender ?? v.gender,
    language: parsed.language ?? 'it',
  }
}

/** Load whatever is cached into the live catalog. Call once at startup: it is
    synchronous, so the pickers are populated before any network round-trip. */
export function hydrateVoicesFromCache(): boolean {
  const c = readCache()
  if (!c) return false
  registerVoices(c.voices, c.at)
  return true
}

/**
 * Install the voices of the account the engine speaks with.
 *
 * @param apiKey check this key instead of the one in force (the panel, mid-change).
 * @param force kept for the panel's manual button; there is nothing to
 *        re-fetch any more, so it changes nothing.
 */
export async function syncVoices(opts: { apiKey?: string; force?: boolean } = {}): Promise<SyncOutcome> {
  const key = opts.apiKey?.trim() || activeApiKey()
  const cached = readCache(key)

  if (!key) {
    if (cached) registerVoices(cached.voices, cached.at)
    return { voices: cached?.voices ?? [], at: cached?.at ?? 0, source: cached ? 'cache' : 'none', error: 'Nessuna chiave ElevenLabs configurata.' }
  }
  const known = await accountForKey(key)
  if (!opts.apiKey && activeApiKey() !== key) {
    return { voices: [], at: 0, source: 'none', error: 'La chiave è cambiata durante l’aggiornamento.' }
  }
  /* THE account (voiceAccounts.ts): its voices are written down and are
     exactly what it holds — no network, no name parsing, nothing extra from
     the workspace. */
  if (known && known.id === ACTIVE_ACCOUNT_ID) {
    const voices = accountCatalog(known)
    const at = Date.now()
    registerVoices(voices, at)
    writeCache({ at, voices, key: keyTag(key) })
    return { voices, at, source: 'registry', account: known.label }
  }
  /* ANY OTHER KEY — a personal workspace, the legacy account — does NOT get
     to install its own voices. Reading the live list is how a stranger's
     workspace ended up in every picker, under names parsed out of whatever it
     happened to contain, while the ids in the protocols pointed nowhere.
     The active account's catalog is installed instead: the ids stay the ones
     the protocols were saved with, the key is reported as the wrong one, and
     a render fails loudly rather than speaking in a voice nobody chose. */
  const active = activeAccount()
  const voices = accountCatalog(active)
  const at = Date.now()
  registerVoices(voices, at)
  return {
    voices,
    at,
    source: 'registry',
    account: active.label,
    error: `La chiave in uso non è di ${active.label}${known ? ` (è di ${known.label})` : ''}: il motore deve parlare con ${active.label}.`,
  }
}

/* ---- who is this key, and how much quota is left? ----------------------
   Four separate incidents in this project traced back to a key pointing at a
   different ElevenLabs account than the one the person was looking at in the
   browser. Surfacing the account name and the remaining characters next to
   the key field turns that into a glance instead of an investigation. */
export interface AccountInfo {
  name: string
  tier: string
  charactersUsed: number
  charactersLimit: number
  charactersLeft: number
  voiceSlotsUsed?: number
}

export async function fetchAccountInfo(apiKey?: string): Promise<AccountInfo | null> {
  const key = apiKey?.trim() || activeApiKey()
  if (!key) return null
  const headers = { 'xi-api-key': key, Accept: 'application/json' }
  try {
    const [uRes, sRes] = await Promise.all([
      fetch('https://api.elevenlabs.io/v1/user', { headers }),
      fetch('https://api.elevenlabs.io/v1/user/subscription', { headers }),
    ])
    if (!sRes.ok) return null
    const sub = (await sRes.json()) as { tier?: string; character_count?: number; character_limit?: number; voice_slots_used?: number }
    const user = uRes.ok ? ((await uRes.json()) as { first_name?: string }) : {}
    const used = sub.character_count ?? 0
    const limit = sub.character_limit ?? 0
    return {
      name: user.first_name ?? '—',
      tier: sub.tier ?? '—',
      charactersUsed: used,
      charactersLimit: limit,
      charactersLeft: Math.max(0, limit - used),
      voiceSlotsUsed: sub.voice_slots_used,
    }
  } catch {
    return null
  }
}

/** Startup path: cache first (instant), then a background refresh. */
export function initVoiceSync(): void {
  hydrateVoicesFromCache()
  void syncVoices().catch(() => undefined)
}
