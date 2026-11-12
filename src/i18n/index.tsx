/* ============================================================================
   Good Loop — interface language (i18n)
   English source strings ARE the keys: t('Start session') looks the string up
   in the active locale's dictionary and falls back to the English key itself,
   so untranslated strings degrade gracefully instead of breaking.
   - Locale persists in localStorage ('gl.locale') and applies live, app-wide.
   - Default locale comes from VITE_DEFAULT_LOCALE ('en' | 'it' | 'pt-BR');
     set it to 'it' on the PO deployment so the app opens in Italian.
   - Interpolation: t('Week {n} of {total}', { n: 3, total: 12 }).
   ============================================================================ */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { IT } from './it'
import { IT_SELF_USE } from './it-selfuse'
import { PT } from './pt'
import { IT_LEGAL, PT_LEGAL } from './legal'
import { IT_WORKSPACE, PT_WORKSPACE } from './workspace'
import { IT_CORPORATE, PT_CORPORATE } from './corporate'
import { IT_SELFUSE_EXTRA, PT_SELFUSE_EXTRA } from './selfuse-extra'
import { IT_STUDIO, PT_STUDIO } from './studio'
import { IT_GAMIFICATION, PT_GAMIFICATION } from './gamification'
import { IT_UI2, PT_UI2 } from './ui2'
import { IT_PUBLIC, PT_PUBLIC } from './publicsite'

export type Locale = 'en' | 'it' | 'pt-BR'

const STORAGE_KEY = 'gl.locale'
/* The Self Use dictionary is merged LAST, so where a string exists in both it
   is the Self Use wording that wins — that surface's copy was written against
   its own spec and reviewed as a unit. */
/* The legal framework's strings are merged LAST (src/i18n/legal.ts): its
   wording of an existing key is the reviewed one. */
/* One dictionary per surface after that, so each surface's copy can be
   written and reviewed on its own without editing a shared file. */
const DICTS: Partial<Record<Locale, Record<string, string>>> = {
  it: { ...IT, ...IT_SELF_USE, ...IT_LEGAL, ...IT_WORKSPACE, ...IT_CORPORATE, ...IT_SELFUSE_EXTRA, ...IT_STUDIO, ...IT_GAMIFICATION, ...IT_UI2, ...IT_PUBLIC },
  'pt-BR': { ...PT, ...PT_LEGAL, ...PT_WORKSPACE, ...PT_CORPORATE, ...PT_SELFUSE_EXTRA, ...PT_STUDIO, ...PT_GAMIFICATION, ...PT_UI2, ...PT_PUBLIC },
}

/** Options shown in every language picker (Profile, the legal page, the
    company dashboard). English is withdrawn for now (owner, 2026-10-21): a
    person is offered sessions in their own language only, and none are
    voiced in English yet, so an English reader would open an empty library.
    The type keeps 'en' — English is still the source text of every string
    and the console still stores English protocol texts for later. Put it
    back here when English sessions are published. */
export const LOCALES: { code: Locale; label: string }[] = [
  { code: 'pt-BR', label: 'Português' },
  { code: 'it', label: 'Italiano' },
]

/** A locale a person may be in: one of the offered ones. A saved 'en' from
    before English was withdrawn falls back to the default. */
function isLocale(v: unknown): v is Locale {
  return LOCALES.some((l) => l.code === v)
}

function defaultLocale(): Locale {
  const env = (import.meta.env.VITE_DEFAULT_LOCALE as string | undefined)?.trim()
  // Italian is the product default (pilot direction); env still overrides.
  return isLocale(env) ? env : 'it'
}

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s
  let out = s
  for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v))
  return out
}

export interface I18n {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: string, vars?: Record<string, string | number>) => string
  /**
   * An OPERATOR-written label -- a library shelf's title -- in this language.
   *
   * Not for product copy: use `t()` there, so the string stays a key a
   * translator can find. See the note on `translateContent`.
   */
  tc: (text: string) => string
  /**
   * A date in the INTERFACE language.
   *
   * `toLocaleDateString(undefined, …)` reads the browser's locale, not the
   * app's. On an Italian deployment opened in a Brazilian browser that printed
   * "sáb., 29 de ago." underneath "Prossima seduta" — the one place a person
   * looks to know when their next appointment is, in a language the rest of
   * the screen is not written in. This takes the locale the app is actually
   * running in.
   */
  d: (ms: number, opts?: Intl.DateTimeFormatOptions) => string
}

/** The default shape: "29 ago" — enough to place a day, short enough for a
    list row on the narrowest phone. */
/* ----------------------------------------------------------------------------
   OPERATOR-WRITTEN content

   The strings above are the product's own: English source, one key, one
   reviewed translation per locale. The library shelves (`src/data/rails.ts`)
   are not -- an analyst names them in the console, which is pinned to
   Italian. `t()` cannot help there: it looks a string up as an ENGLISH key,
   and "Sei minuti" is not one, so the Portuguese app printed the Italian
   back unchanged.

   `tc()` is `t()` for that content, with one extra step: a reverse index over
   every dictionary VALUE, so an Italian (or Portuguese) title that matches a
   string the product already knows is resolved to its key first and then
   translated into the language being read. Text the dictionaries have never
   seen is left exactly as written -- a shelf called by a name only its author
   could have chosen is shown in that name, not in a guess.

   Built once, lazily: the dictionaries are large and most screens never ask.
   First key wins on a collision, which is why this is for short editorial
   labels and never for prose.
   -------------------------------------------------------------------------- */

let byTranslation: Map<string, string> | null = null

function sourceKeyOf(text: string): string | null {
  if (!byTranslation) {
    byTranslation = new Map()
    for (const dict of Object.values(DICTS)) {
      if (!dict) continue
      for (const [key, value] of Object.entries(dict)) {
        const v = value.trim()
        if (!v || byTranslation.has(v)) continue
        byTranslation.set(v, key)
      }
    }
  }
  return byTranslation.get(text.trim()) ?? null
}

/**
 * The English key an operator-written label resolves to, or null when the
 * dictionaries have never seen it.
 *
 * The console shows this: a shelf whose name resolves to a key will read in
 * every language, and one that does not will reach everyone as typed.
 */
export function contentKey(text: string): string | null {
  const raw = (text ?? '').trim()
  if (!raw) return null
  for (const dict of Object.values(DICTS)) if (dict && dict[raw]) return raw
  return sourceKeyOf(raw)
}

/**
 * An operator-written label in the given language.
 *
 * In order: the string as an English key, then the string as some locale's
 * translation (resolved to its key, then translated), then the string itself.
 */
export function translateContent(locale: Locale, text: string): string {
  const raw = (text ?? '').trim()
  if (!raw) return text
  const dict = DICTS[locale]
  if (dict && dict[raw]) return dict[raw]
  const key = sourceKeyOf(raw)
  if (!key) return text
  if (key === raw) return text
  return (dict && dict[key]) ?? key
}

const DATE_DEFAULT: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }

/**
 * The locale the app is currently running in, for code that has no hook.
 *
 * PDF builders and pure data modules format dates too, and they cannot call
 * `useI18n`. Threading a locale through every one of their signatures would
 * put the parameter in a dozen places that have nothing else to do with
 * language. The locale is genuinely process-global — one provider, one value,
 * persisted in one key — so it is read from here instead, and the provider
 * keeps it in step. It is seeded from storage at module load so a PDF built
 * before the provider mounts is still right.
 */
let current: Locale = (() => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isLocale(saved)) return saved
  } catch {
    /* storage unavailable */
  }
  return defaultLocale()
})()

export function currentLocale(): Locale {
  return current
}

/** `formatDate` for code outside React. Same rules, implicit locale. */
export function fmtDate(ms: number, opts?: Intl.DateTimeFormatOptions): string {
  return formatDate(current, ms, opts)
}

export function formatDate(locale: Locale, ms: number, opts?: Intl.DateTimeFormatOptions): string {
  try {
    return new Date(ms).toLocaleString(locale, opts ?? DATE_DEFAULT)
  } catch {
    // An unsupported option combination must not take a screen down with it.
    return new Date(ms).toLocaleDateString(locale)
  }
}

/* Safe default so components outside the provider (if any) render English
   instead of crashing. */
const FALLBACK: I18n = {
  locale: 'en',
  setLocale: () => {},
  t: interpolate,
  tc: (text) => translateContent('en', text),
  d: (ms, opts) => formatDate('en', ms, opts),
}

const Ctx = createContext<I18n>(FALLBACK)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (isLocale(saved)) return saved
    } catch { /* storage unavailable */ }
    return defaultLocale()
  })

  function setLocale(l: Locale) {
    if (!isLocale(l)) return
    current = l
    setLocaleState(l)
    try { localStorage.setItem(STORAGE_KEY, l) } catch { /* storage unavailable */ }
  }

  useEffect(() => {
    document.documentElement.lang = locale
    current = locale
  }, [locale])

  const value = useMemo<I18n>(() => ({
    locale,
    setLocale,
    t: (key, vars) => {
      const dict = DICTS[locale]
      return interpolate((dict && dict[key]) ?? key, vars)
    },
    tc: (text) => translateContent(locale, text),
    d: (ms, opts) => formatDate(locale, ms, opts),
  }), [locale])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/**
 * Pins everything below it to one language, whatever the person chose.
 *
 * The admin console is Italian, always: it is the team's working tool, and a
 * console that switched to Portuguese because the last surface previewed was
 * set to Portuguese would be a console nobody on the team can read. The
 * person's own choice is left untouched in storage, so the other surfaces
 * keep it.
 */
export function FixedLocale({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo<I18n>(() => ({
    locale,
    setLocale: () => { /* pinned */ },
    t: (key, vars) => {
      const dict = DICTS[locale]
      return interpolate((dict && dict[key]) ?? key, vars)
    },
    tc: (text) => translateContent(locale, text),
    d: (ms, opts) => formatDate(locale, ms, opts),
  }), [locale])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n(): I18n {
  return useContext(Ctx)
}
