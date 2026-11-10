/* ============================================================================
   Good Loop — the two backgrounds, changeable without a deployment

   The landing page and the app stand on one photograph each. Those two
   pictures have now been changed three times by the founders, and every
   change so far has been a code edit, a build and a deploy for what is
   genuinely a choice of picture. So they live in `app_settings` under one
   key, the commercial console writes them, and every app picks them up on
   its next load.

   WHAT A SETTING CAN SAY. A URL for each of the two surfaces, and whether
   the brand's rings are drawn over each. Nothing else: the scrim, the
   fades, the layout and the type are the product's and are not an option,
   because a background anybody can change is useful and a design anybody
   can change is a design nobody owns.

   THE DEFAULTS ARE THE SHIPPED IMAGES. An unreachable row, a parse failure
   and a missing key all mean the same thing — the pictures that came with
   the build. A background is not a feature that can fail closed; a page
   with no background at all is broken in a way nobody would choose.

   THE CACHE EXISTS FOR THE FIRST PAINT, exactly as it does for the feature
   switches: the setting is read from the network once per load, and until
   that lands the previous answer from localStorage is used, so a changed
   background does not flash the old one and then swap.
   ============================================================================ */

import { getSupabaseClient, hasSupabaseEnv } from '../auth/supabaseClient'

export interface BackgroundSet {
  /** Behind the landing page, the three public pages and the door. */
  landing: string
  /** Behind the signed-in app — the library and the other destinations. */
  app: string
  /** Draw the halo of thin rings on the landing's focal point. */
  landingRings: boolean
  /** Draw the brand's filled rings in the corner of the app. */
  appRings: boolean
}

/**
 * What the build ships with.
 *
 * The rings are OFF. They were the background of both surfaces until these
 * two photographs arrived, and both of them already carry their own
 * structure — the landing is literally concentric ripples on water, and the
 * app is a person at the centre of the frame. Rings over either is the same
 * shape drawn twice. The console can switch them back on without a deploy,
 * which is the point of this file.
 */
export const DEFAULT_BACKGROUNDS: BackgroundSet = {
  landing: '/media/landing-back.jpg',
  app: '/media/app-back.jpg',
  landingRings: false,
  appRings: false,
}

const KEY = 'backgrounds'
const CACHE_KEY = 'gl.backgrounds'

let current: BackgroundSet = { ...DEFAULT_BACKGROUNDS }
const listeners = new Set<() => void>()

function sb() {
  if (!hasSupabaseEnv()) return null
  try {
    return getSupabaseClient(
      import.meta.env.VITE_SUPABASE_URL as string,
      import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    )
  } catch { return null }
}

/** Only the four fields, and only when they are the right shape. Anything
    else in the row is ignored rather than trusted. */
function normalize(v: unknown): Partial<BackgroundSet> {
  if (!v || typeof v !== 'object') return {}
  const o = v as Record<string, unknown>
  const out: Partial<BackgroundSet> = {}
  if (typeof o.landing === 'string' && o.landing.trim()) out.landing = o.landing.trim()
  if (typeof o.app === 'string' && o.app.trim()) out.app = o.app.trim()
  if (typeof o.landingRings === 'boolean') out.landingRings = o.landingRings
  if (typeof o.appRings === 'boolean') out.appRings = o.appRings
  return out
}

function apply(next: BackgroundSet): void {
  current = next
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)) } catch { /* private mode */ }
  for (const fn of listeners) fn()
}

function readCache(): BackgroundSet {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) return { ...DEFAULT_BACKGROUNDS, ...normalize(JSON.parse(raw)) }
  } catch { /* no storage, or nonsense in it */ }
  return { ...DEFAULT_BACKGROUNDS }
}

/** What is on screen now. Safe before the fetch lands. */
export function backgrounds(): BackgroundSet {
  return current
}

export function subscribeBackgrounds(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export async function refreshBackgrounds(): Promise<BackgroundSet> {
  const c = sb()
  if (!c) { apply(readCache()); return current }
  try {
    const { data, error } = await c.from('app_settings').select('value').eq('key', KEY).maybeSingle()
    /* A failure keeps whatever is on screen. A background is never worth
       taking a page down for. */
    if (error) return current
    apply({ ...DEFAULT_BACKGROUNDS, ...normalize(data?.value) })
  } catch { /* offline: the cache stands */ }
  return current
}

export async function saveBackgrounds(next: BackgroundSet): Promise<{ ok: true } | { ok: false; message: string }> {
  const c = sb()
  if (!c) {
    /* Demo mode: the choice lives in this browser, which is what every other
       setting does without a database behind it. */
    apply(next)
    return { ok: true }
  }
  try {
    const { error } = await c.from('app_settings')
      .upsert({ key: KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) return { ok: false, message: error.message }
    apply(next)
    return { ok: true }
  } catch (e) {
    return { ok: false, message: String((e as Error).message ?? e) }
  }
}

/** Read once at start-up, and follow a change made in another tab. */
export function initBackgrounds(): void {
  apply(readCache())
  void refreshBackgrounds()
  try {
    window.addEventListener('storage', (e) => {
      if (e.key === CACHE_KEY) apply(readCache())
    })
  } catch { /* no window: a test or a worker */ }
}
