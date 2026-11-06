/* ============================================================================
   Which stage the background is standing on

   One component draws the background for seven places
   (`AmbientBackground`), and it is mounted once, at the app root, outside
   everything that routes — that is the whole point of it: a CSS transition
   only runs if the element survives the change, so the rings can travel
   from the landing to the library exactly because nothing in between
   unmounts them.

   The stage therefore cannot be a prop handed down from a screen. And it
   cannot be derived from the route at the root either, because the route
   does not say enough: the empty hash is the landing for a stranger and the
   library for somebody signed in, and `#` plus a destination inside the app
   is one hash with five destinations behind it.

   So it is CLAIMED instead. The screen that is on knows what it is: the
   public site claims its page, `SelfUseApp` claims `home` while the library
   is the open destination, and anything that claims nothing leaves the
   background off. The claims are a stack and the last one wins, which is
   what makes a route change safe in either order — React is free to mount
   the new screen before it unmounts the old one, and dropping a claim that
   is not on top changes nothing. `ui2/pageGround.ts` holds the window's
   photograph the same way, for the same reason.
   ============================================================================ */

import { useEffect } from 'react'
import { useSyncExternalStore } from 'react'

export type Stage = 'landing' | 'como' | 'empresas' | 'metodo' | 'login' | 'home' | 'off'

/** The stages that are the public site: dark palette, photograph and all. */
export const PUBLIC_STAGES: Stage[] = ['landing', 'como', 'empresas', 'metodo', 'login']

/* ---------------------------------------------------------------- routes ---
   The project's hashes carry no slash (`#admin`, `#legal`, `#studio`), so
   these follow it. The brief wrote them `#/como-funciona`; a leading slash
   is accepted and normalised away rather than supported as a second set of
   URLs, so a link copied from either place lands in the same place. */

export const R_LANDING = ''
export const R_LOGIN = '#entrar'
export const R_COMO = '#como-funciona'
export const R_EMPRESAS = '#para-empresas'
export const R_METODO = '#metodo'

/** The hash reduced to a bare name: no `#`, no leading slash, no query, and
    lower case. `'#/Metodo?lang=it'` and `'#metodo'` are one route. */
export function routeName(hash: string): string {
  return hash.replace(/^#\/?/, '').split('?')[0].trim().toLowerCase()
}

const PUBLIC_ROUTE: Record<string, Stage> = {
  '': 'landing',
  'entrar': 'login',
  'login': 'login',
  'como-funciona': 'como',
  'para-empresas': 'empresas',
  'metodo': 'metodo',
}

/**
 * The stage a hash asks for, or null when the hash belongs to the app, a
 * console or the legal page — none of which this background touches.
 *
 * The landing shares the empty hash with a signed-in person's library. Who
 * wins is decided where somebody knows whether anyone is signed in
 * (`public/PublicRoute.tsx`), never here.
 */
export function publicStage(hash: string): Stage | null {
  return PUBLIC_ROUTE[routeName(hash)] ?? null
}

/** The hash for a stage, for the links in the header. */
export const HASH_FOR_STAGE: Partial<Record<Stage, string>> = {
  landing: R_LANDING,
  login: R_LOGIN,
  como: R_COMO,
  empresas: R_EMPRESAS,
  metodo: R_METODO,
}

/* ------------------------------------------------------------ navigating ---

   Why this is not `window.location.href = pathname`.

   That is how the project has always gone back to the empty hash, and it is
   deliberate in `ToTheDoor`: dropping the fragment is a real navigation, the
   page LOADS, and each surface gets its own fresh data layer and gate.

   It is also fatal to this round. The rings travel from the person in the
   photograph out to the corner of the library over two seconds, and a page
   load throws away the element doing the travelling, the stage it was
   claimed on and the arrival flag with it. So the public site and the door
   move between their own routes without leaving the document: a real hash
   for a real route, and `replaceState` plus a hand-fired `hashchange` for
   the empty one, which no browser event covers.

   `App.tsx` listens for `hashchange` AND `popstate`, so the Back button
   lands in the same place by the same path. */

export function navigate(hash: string): void {
  if (hash) {
    /* A fragment change in the same document: the browser fires
       `hashchange` itself and the history entry is free. */
    window.location.hash = hash
    return
  }
  const bare = window.location.pathname + window.location.search
  window.history.pushState(null, '', bare)
  window.dispatchEvent(new Event('hashchange'))
}

/* ------------------------------------------------------------- the claims --- */

let claims: { id: number; stage: Stage }[] = []
let nextId = 0
let arrivedFlag = false

const listeners = new Set<() => void>()

function emit(): void {
  for (const fn of listeners) fn()
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

function top(): Stage {
  const t = claims[claims.length - 1]
  return t ? t.stage : 'off'
}

/**
 * Hold `stage` for as long as the calling screen is mounted.
 *
 * Null is a no-op, so a screen that is sometimes a stage and sometimes not —
 * the library is, the other four destinations are not — can call this
 * unconditionally rather than changing its hook count between renders.
 */
export function useStageClaim(stage: Stage | null): void {
  useEffect(() => {
    if (!stage) return
    const id = nextId += 1
    claims.push({ id, stage })
    emit()
    return () => {
      claims = claims.filter((c) => c.id !== id)
      emit()
    }
  }, [stage])
}

export function useStage(): Stage {
  return useSyncExternalStore(subscribe, top, top)
}

/* ------------------------------------------------------------ the arrival ---

   Set by the door when a sign-in succeeds, and read by the background and
   by the library. It is what tells the difference between landing on the
   library because you just signed in — the rings travel out from the
   person in the photograph, section 10.3 — and landing on it because you
   tapped Início, where they are simply already there. */

export function noteArrival(): void {
  if (arrivedFlag) return
  arrivedFlag = true
  emit()
}

export function clearArrival(): void {
  if (!arrivedFlag) return
  arrivedFlag = false
  emit()
}

/** Read outside React, and by anything that wants the answer at mount
    rather than as it changes. */
export function arrived(): boolean {
  return arrivedFlag
}

function arrivedSnapshot(): boolean {
  return arrivedFlag
}

export function useArrived(): boolean {
  return useSyncExternalStore(subscribe, arrivedSnapshot, arrivedSnapshot)
}
