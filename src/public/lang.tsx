/* ============================================================================
   What language the public site is read in

   SEPARATE FROM THE APP'S, ON PURPOSE. The app offers Portuguese and
   Italian; English was withdrawn (owner, 2026-10-21) because no session is
   voiced in English and an English reader would open an empty library. A
   marketing page has no library to open, so v19's picker offers three — and
   the only way to have both answers at once is for the site to hold its own.

   Choosing Italian or Portuguese ALSO sets the app's locale, so a visitor
   who reads the site in Italian and then signs in is not greeted in
   Portuguese. Choosing English sets nothing: it stops at the site's edge,
   which is the whole point of the separation.

   Where the first answer comes from, in order: `?lang=` in the query (so a
   campaign link can open in its own language), then what this browser chose
   last (`gl_lang`, the key v19 used), then the app's own locale.
   ============================================================================ */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useI18n, type Locale } from '../i18n'
import { COPY, SITE_LANGS, type CopyKey, type SiteLang } from './copy'

const KEY = 'gl_lang'

function isSiteLang(v: unknown): v is SiteLang {
  return SITE_LANGS.some((l) => l.code === v)
}

/** The app's locale, read as a site language. */
function fromLocale(locale: Locale): SiteLang {
  return locale === 'it' ? 'it' : locale === 'en' ? 'en' : 'pt'
}

/** The app's locale for a site language, or null when there is none —
    which is English, and is why English never leaves this site. */
function toLocale(lang: SiteLang): Locale | null {
  return lang === 'it' ? 'it' : lang === 'pt' ? 'pt-BR' : null
}

function stored(): SiteLang | null {
  try {
    const v = localStorage.getItem(KEY)
    return isSiteLang(v) ? v : null
  } catch {
    return null
  }
}

function fromQuery(): SiteLang | null {
  try {
    const v = new URLSearchParams(window.location.search).get('lang')
    return isSiteLang(v) ? v : null
  } catch {
    return null
  }
}

export interface SiteI18n {
  lang: SiteLang
  setLang: (l: SiteLang) => void
  /** One slot of the POs' dictionary, as plain text. */
  s: (key: CopyKey) => string
  /** The same slot with its `<b>`, `<i>` and no-break spans rendered. */
  r: (key: CopyKey) => ReactNode
}

const Ctx = createContext<SiteI18n | null>(null)

export function SiteLangProvider({ children }: { children: ReactNode }) {
  const { locale, setLocale } = useI18n()
  const [lang, setLangState] = useState<SiteLang>(() => fromQuery() ?? stored() ?? fromLocale(locale))

  /* The document's own language attribute, which is what a screen reader
     and a browser's translate prompt both read. Put back on the way out:
     this is a public page's claim, not the app's. */
  useEffect(() => {
    const row = SITE_LANGS.find((l) => l.code === lang)
    if (!row) return
    const el = document.documentElement
    const was = el.lang
    el.lang = row.html
    return () => { el.lang = was }
  }, [lang])

  const setLang = useCallback((next: SiteLang) => {
    setLangState(next)
    try { localStorage.setItem(KEY, next) } catch { /* private window: the choice lasts the visit */ }
    const l = toLocale(next)
    if (l) setLocale(l)
  }, [setLocale])

  const value = useMemo<SiteI18n>(() => {
    const dict = COPY[lang]
    return {
      lang,
      setLang,
      s: (key: CopyKey) => dict[key],
      r: (key: CopyKey) => rich(dict[key]),
    }
  }, [lang, setLang])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSite(): SiteI18n {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSite outside SiteLangProvider')
  return v
}

/* ------------------------------------------------------------ the markup ---

   Three tags and no more: `<b>` for the brand inside a sentence, `<i
   class="pub-em">` in one headline, and one `<span
   style="white-space:nowrap">` holding «Bem‑estar» together in Portuguese.

   v19 did this with `innerHTML`. Here the strings are compiled into the
   bundle and could not come from anywhere else, but `dangerouslySetInnerHTML`
   is a door that stays open once it is opened — the next person to add a
   string from a CMS would find it already unlocked. This understands the
   three tags the POs used and drops anything else, so the door is never
   there to be found. */

const TAG = /<(b|i|span)\b[^>]*>([\s\S]*?)<\/\1>/g

export function rich(text: string): ReactNode {
  const out: ReactNode[] = []
  let at = 0
  let m: RegExpExecArray | null
  TAG.lastIndex = 0
  while ((m = TAG.exec(text))) {
    if (m.index > at) out.push(text.slice(at, m.index))
    const inner = m[2]
    const key = `${m.index}`
    if (m[1] === 'b') out.push(<b key={key}>{inner}</b>)
    else if (m[1] === 'i') out.push(<i key={key} className="pub-em">{inner}</i>)
    else out.push(<span key={key} className="glw-nowrap">{inner}</span>)
    at = m.index + m[0].length
  }
  if (at < text.length) out.push(text.slice(at))
  return out.length === 1 ? out[0] : out
}
