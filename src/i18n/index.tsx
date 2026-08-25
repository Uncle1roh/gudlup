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

export type Locale = 'en' | 'it' | 'pt-BR'

const STORAGE_KEY = 'gl.locale'
/* The Self Use dictionary is merged LAST, so where a string exists in both it
   is the Self Use wording that wins — that surface's copy was written against
   its own spec and reviewed as a unit. */
const DICTS: Partial<Record<Locale, Record<string, string>>> = { it: { ...IT, ...IT_SELF_USE }, 'pt-BR': PT }

/** Options shown in Profile → Language. */
export const LOCALES: { code: Locale; label: string }[] = [
  { code: 'pt-BR', label: 'Português' },
  { code: 'en', label: 'English' },
  { code: 'it', label: 'Italiano' },
]

function isLocale(v: unknown): v is Locale {
  return v === 'en' || v === 'it' || v === 'pt-BR'
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
    d: (ms, opts) => formatDate(locale, ms, opts),
  }), [locale])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n(): I18n {
  return useContext(Ctx)
}
