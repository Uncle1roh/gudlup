/* ============================================================================
   Good Loop — which environment is this?

   One question, asked from four places: the banner across the top, the
   feature switches, the seed and reset tooling, and anything that must
   refuse to run against production.

   It is answered by `VITE_APP_ENV`, set per deployment, and NOT inferred
   from the URL. Inference was the first design and it is wrong: a staging
   deployment reached through a preview URL, a production build opened on
   localhost to reproduce a bug, a custom domain pointed at the wrong
   project — every one of those guesses the answer, and the guess is silent.
   A deployment says what it is.

   THE DEFAULT IS THE DANGEROUS PART. An unset variable has to resolve to
   something, and the two candidates fail in opposite directions: default to
   production and a forgotten variable makes staging look like the real
   thing; default to staging and the real thing wears a STAGING banner in
   front of a client.

   The rule here: with no database configured it is `local` — that is a
   developer machine or a preview build with no secrets, and it is already
   running on mock data. With a database configured and no answer given, it
   is `unknown`, which wears a banner saying exactly that. An operator
   reading "ENVIRONMENT NOT DECLARED" goes and sets the variable; an
   operator reading nothing assumes production. The loud default is the
   safe one, and docs/ENVIRONMENTS.md says to set it.
   ============================================================================ */

import { hasSupabaseEnv } from '../auth/supabaseClient'

export type AppEnv = 'production' | 'staging' | 'demo' | 'local' | 'unknown'

/** The environments that are not production, in the order of how freely
    their data can be thrown away. */
export const NON_PRODUCTION: AppEnv[] = ['staging', 'demo', 'local', 'unknown']

function declared(): string {
  const raw = (import.meta.env?.VITE_APP_ENV ?? '') as string
  return raw.trim().toLowerCase()
}

let cached: AppEnv | null = null

export function appEnv(): AppEnv {
  if (cached) return cached
  const d = declared()
  if (d === 'production' || d === 'prod') cached = 'production'
  else if (d === 'staging' || d === 'stage') cached = 'staging'
  else if (d === 'demo') cached = 'demo'
  else if (d === 'local' || d === 'development' || d === 'dev') cached = 'local'
  else cached = hasSupabaseEnv() ? 'unknown' : 'local'
  return cached
}

/** Tests and the preview bar need to put it back. Nothing else should. */
export function resetAppEnvCache(): void {
  cached = null
}

export function isProduction(): boolean {
  return appEnv() === 'production'
}

/** Whether a destructive operation — a wipe, a reseed — may run here. */
export function mayDestroyData(): boolean {
  const e = appEnv()
  return e === 'staging' || e === 'demo' || e === 'local'
}

/** The word in the banner. English source strings; the banner translates. */
export function envLabel(e: AppEnv = appEnv()): string {
  switch (e) {
    case 'staging': return 'STAGING'
    case 'demo': return 'DEMO'
    case 'local': return 'LOCAL'
    case 'unknown': return 'ENVIRONMENT NOT DECLARED'
    case 'production': return 'PRODUCTION'
  }
}

/** The sentence under the word. */
export function envNote(e: AppEnv = appEnv()): string {
  switch (e) {
    case 'staging': return 'Test environment. Nothing here is real and everything can be wiped.'
    case 'demo': return 'Demonstration environment with fictional data. Not a real company.'
    case 'local': return 'No database connected — this is mock data that resets when the page reloads.'
    case 'unknown': return 'VITE_APP_ENV is not set on this deployment. Treat the data as real until someone says otherwise.'
    case 'production': return ''
  }
}

/** Production shows nothing: a banner that is always there is a banner
    nobody reads, and the one state that must be unmistakable is the one
    where the data is NOT real. */
export function showsBanner(e: AppEnv = appEnv()): boolean {
  return e !== 'production'
}

/** Which Supabase project this build points at, for the banner's tooltip and
    for the tooling's "you are about to change X" confirmations. Just the
    project ref, never the key. */
export function databaseRef(): string | null {
  const url = (import.meta.env?.VITE_SUPABASE_URL ?? '') as string
  if (!url) return null
  const m = url.match(/^https?:\/\/([a-z0-9]+)\./i)
  return m ? m[1] : url.replace(/^https?:\/\//, '').split('/')[0]
}
