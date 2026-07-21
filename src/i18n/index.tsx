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
import { PT } from './pt'

export type Locale = 'en' | 'it' | 'pt-BR'

const STORAGE_KEY = 'gl.locale'
const DICTS: Partial<Record<Locale, Record<string, string>>> = { it: IT, 'pt-BR': PT }

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
  return isLocale(env) ? env : 'it' // PO testing: the app opens in Italian unless overridden
}

/* ---------------------------------------------------------------------------
   Non-hook translate — for internal tools (admin, b2b, studio, tts) where
   wiring the hook through every helper is impractical. Reads the same
   dictionaries; kept in sync with the provider via `currentLocale`.
   Components using tr() re-render on their own state changes, which is enough
   for the back-office; the consumer app keeps using the reactive useI18n().
   --------------------------------------------------------------------------- */
let currentLocale: Locale = (() => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isLocale(saved)) return saved
  } catch { /* storage unavailable */ }
  return defaultLocale()
})()

export function tr(key: string, vars?: Record<string, string | number>): string {
  const dict = DICTS[currentLocale]
  return interpolate((dict && dict[key]) ?? key, vars)
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
}

/* Safe default so components outside the provider (if any) render English
   instead of crashing. */
const FALLBACK: I18n = { locale: 'en', setLocale: () => {}, t: interpolate }

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
    setLocaleState(l)
    currentLocale = l
    try { localStorage.setItem(STORAGE_KEY, l) } catch { /* storage unavailable */ }
  }

  useEffect(() => { currentLocale = locale }, [locale])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const value = useMemo<I18n>(() => ({
    locale,
    setLocale,
    t: (key, vars) => {
      const dict = DICTS[locale]
      return interpolate((dict && dict[key]) ?? key, vars)
    },
  }), [locale])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n(): I18n {
  return useContext(Ctx)
}
