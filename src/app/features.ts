/* ============================================================================
   Good Loop — turning an area off without a deployment

   Three areas can be switched off while the app is running: the PLAYER (the
   session itself), BOOKING (asking a therapist for an appointment) and VIDEO
   (the call). They are the three that depend on something outside our code —
   audio files and a decoder, a therapist's calendar, a video provider — and
   the three where a failure is in front of a person rather than an operator.

   WHY THE DATABASE AND NOT AN ENVIRONMENT VARIABLE: an environment variable
   needs a redeploy, and a redeploy during an incident is three minutes of
   build plus the nerve to ship while something is already broken. The switch
   lives in `app_settings` under one key, an admin flips it in the console,
   and every app picks it up on its next load.

   THE DEFAULT IS ON. A switch that fails closed would take the product down
   whenever the database hiccups — which is exactly when it is least wanted.
   So an unreachable row, a parse failure, a missing table and a missing key
   all mean the same thing: everything is on. Turning something OFF is always
   a deliberate act that was written down somewhere.

   THE CACHE EXISTS FOR THE FIRST PAINT. The flags are read from the network
   once per load; until that lands, the previous answer from localStorage is
   used so a disabled area does not flash into view and then vanish. A fresh
   browser with no cache gets the default, which is on.

   VITE_FEATURES_OFF is the escape hatch for when the database itself is the
   thing that is broken: a comma-separated list baked into a build, which no
   admin toggle can override. It is for an emergency deploy, not for normal
   operation.
   ============================================================================ */

import { getSupabaseClient, hasSupabaseEnv } from '../auth/supabaseClient'

export type FeatureId = 'player' | 'booking' | 'video'

export const FEATURES: { id: FeatureId; label: string; what: string }[] = [
  { id: 'player', label: 'Player', what: 'Playing a session. Switching this off leaves the catalogue browsable and stops playback.' },
  { id: 'booking', label: 'Booking', what: 'Requesting and changing appointments with a therapist. Existing appointments stay visible.' },
  { id: 'video', label: 'Video call', what: 'The video session itself. The appointment stays; the Join button does not appear.' },
]

export type FeatureFlags = Record<FeatureId, boolean>

export const ALL_ON: FeatureFlags = { player: true, booking: true, video: true }

export const FLAGS_KEY = 'feature_flags'
const CACHE_KEY = 'gl.features'

/* ------------------------------------------------- the build-time hatch -- */

function forcedOff(): Set<FeatureId> {
  const raw = (import.meta.env?.VITE_FEATURES_OFF ?? '') as string
  const out = new Set<FeatureId>()
  for (const part of raw.split(',')) {
    const id = part.trim().toLowerCase()
    if (id === 'player' || id === 'booking' || id === 'video') out.add(id)
  }
  return out
}

/* ------------------------------------------------------------ the state -- */

let current: FeatureFlags = readCache()
const listeners = new Set<(f: FeatureFlags) => void>()

function readCache(): FeatureFlags {
  const base = { ...ALL_ON }
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) Object.assign(base, normalize(JSON.parse(raw)))
  } catch { /* a fresh or private browser starts with everything on */ }
  for (const id of forcedOff()) base[id] = false
  return base
}

function writeCache(f: FeatureFlags): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(f)) } catch { /* nothing depends on it */ }
}

/** Only the three known ids, only real booleans, and ONLY `false` counts as
    off — a null, a string or a missing key leaves the area on. */
export function normalize(raw: unknown): Partial<FeatureFlags> {
  const out: Partial<FeatureFlags> = {}
  if (!raw || typeof raw !== 'object') return out
  const o = raw as Record<string, unknown>
  for (const { id } of FEATURES) {
    if (o[id] === false) out[id] = false
    else if (o[id] === true) out[id] = true
  }
  return out
}

/** The flags as they stand right now. Synchronous, never throws. */
export function features(): FeatureFlags {
  return current
}

/** Is this area usable? The question every call site asks. */
export function featureOn(id: FeatureId): boolean {
  return current[id] !== false
}

/** Re-render when an admin flips a switch in another tab, or when the first
    network read lands. Returns the unsubscribe. */
export function onFeaturesChange(fn: (f: FeatureFlags) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

function apply(next: FeatureFlags): void {
  const changed = FEATURES.some(({ id }) => current[id] !== next[id])
  current = next
  writeCache(next)
  if (changed) for (const fn of [...listeners]) fn(next)
}

/* --------------------------------------------------------- the network -- */

function sb() {
  if (!hasSupabaseEnv()) return null
  try {
    return getSupabaseClient(
      import.meta.env.VITE_SUPABASE_URL as string,
      import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    )
  } catch { return null }
}

/**
 * Read the switches from the database and apply them.
 *
 * Every failure means "everything on": no connection, no table, no row, a
 * row that is not an object. The switch is for taking something down on
 * purpose, and a database that cannot be read is not a decision.
 */
export async function refreshFeatures(): Promise<FeatureFlags> {
  const c = sb()
  if (!c) { apply(readCacheDefaults()); return current }
  try {
    const { data, error } = await c.from('app_settings').select('value').eq('key', FLAGS_KEY).maybeSingle()
    if (error) return current            // keep what is on screen; do not take the product down
    const next = { ...ALL_ON, ...normalize(data?.value) }
    for (const id of forcedOff()) next[id] = false
    apply(next)
  } catch { /* offline: whatever was cached stands */ }
  return current
}

/** Everything on, minus the build-time hatch. Used when there is no
    database at all — the mock build, a preview with no secrets. */
function readCacheDefaults(): FeatureFlags {
  const base = { ...ALL_ON }
  for (const id of forcedOff()) base[id] = false
  return base
}

/** Write the switches. Admins only — RLS refuses anybody else. */
export async function saveFeatures(next: FeatureFlags): Promise<{ ok: true } | { ok: false; message: string }> {
  const c = sb()
  if (!c) return { ok: false, message: 'Nessuna connessione Supabase: gli interruttori vivono nel database.' }
  const value: FeatureFlags = {
    player: next.player !== false,
    booking: next.booking !== false,
    video: next.video !== false,
  }
  try {
    const { error } = await c.from('app_settings')
      .upsert({ key: FLAGS_KEY, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) {
      if (/relation|does not exist|schema cache/i.test(error.message)) {
        return { ok: false, message: 'La tabella app_settings non esiste ancora: esegui supabase/setup.sql.' }
      }
      return { ok: false, message: error.message }
    }
    apply({ ...value })
    return { ok: true }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

/** Called once at start-up, next to initVoiceSync. */
export function initFeatures(): void {
  void refreshFeatures()
  /* An admin flipping a switch in the console tab should take effect in the
     app tab beside it without a reload. */
  try {
    window.addEventListener('storage', (e) => {
      if (e.key === CACHE_KEY) apply(readCache())
    })
  } catch { /* no window: a test or a worker */ }
}
