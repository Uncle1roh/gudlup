/* Which recording plays, and what the person is told before it does.

   The fallback order is the product's decision (docs/PLAIN_LANGUAGES.md §5:
   nobody loses a session that exists in only one language; English readers
   hear Portuguese until English is voiced). What this proves is the NOTICE:
   a language fallback is announced as a language fallback, a form fallback
   as a form fallback, and an exact match says nothing. The pre-session
   screen used to announce every fallback as masculine/feminine.

   Run: npm test -- audio-pick                                              */

import { audioPick } from '../src/data/liveCatalog'

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else console.log(`ok  : ${msg}`)
}

const P = (urls: Record<string, string>) => ({ versions: [{ duration: 12 as const, audioUrl: urls }] }) as never
const readLang = (l: string) => (l === 'it' ? 'it' : l === 'en' ? 'en' : 'pt-BR')
/** What Session.tsx shows: [language notice, form notice] */
function notices(urls: Record<string, string>, locale: 'it' | 'pt-BR' | 'en', to: 'm' | 'f') {
  const p = audioPick(P(urls), 12, locale, to)!
  return { lang: p.spokenLang && p.spokenLang !== readLang(locale) ? p.spokenLang : null, form: !p.formMatch, url: p.url }
}

let n = notices({ 'pt-BR:f': 'pt-f' }, 'it', 'f')
assert(n.lang === 'pt-BR' && !n.form, 'Italian woman, only the Portuguese female file: told it is in Portuguese — not told about "pronto"')
n = notices({ 'pt-BR': 'pt-m' }, 'it', 'm')
assert(n.lang === 'pt-BR' && !n.form, 'Italian man, only Portuguese male: language notice only')
n = notices({ it: 'it-m' }, 'it', 'f')
assert(n.lang === null && n.form && n.url === 'it-m', 'Italian woman, only the Italian male file: form notice only')
n = notices({ 'pt-BR': 'pt-m' }, 'it', 'f')
assert(n.lang === 'pt-BR' && n.form, 'Italian woman, only Portuguese male: both notices')
n = notices({ 'pt-BR': 'pt-m', 'pt-BR:f': 'pt-f' }, 'en', 'f')
assert(n.lang === 'pt-BR' && !n.form && n.url === 'pt-f', 'English reader: hears Portuguese in her form, and is told it is Portuguese')
n = notices({ 'pt-BR:f': 'pt-f', it: 'it-m' }, 'pt-BR', 'f')
assert(n.lang === null && !n.form && n.url === 'pt-f', 'Brazilian woman, her file exists: no notice')
n = notices({ it: 'it-m', 'pt-BR': 'pt-m' }, 'pt-BR', 'f')
assert(n.url === 'pt-m' && n.lang === null && n.form, 'her language in the other form beats the other language in her form')
assert(audioPick(P({}), 12, 'it', 'f') === undefined, 'no file at all: nothing to pick (the player says it plays an ambient bed)')

console.log(process.exitCode ? '\nFAILED' : '\ndone.')
