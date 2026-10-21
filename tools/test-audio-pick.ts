/* What each person may hear and choose — the owner's rules of 2026-10-21:

   1. A person linked to a language is offered protocols in THAT language
      only, never another (English included: not voiced yet, so nothing).
   2. A man's recording never plays for a woman, nor a woman's for a man.
   3. A clinical protocol ("Clinico" in the console, or one of the six
      clinical-only codes) is never chosen by the person on their own; it is
      played only when a therapist prescribes or leads it.

   Run: npm test -- audio-pick                                              */

import { audioPick, browsableSessions, playableDurations, playableSessions, prescribableEntries, resolveClinical, resolveSessions } from '../src/data/liveCatalog'
import { SELF_USE_SESSIONS, CLINICAL_ONLY_CODES } from '../src/data/selfuse'
import type { CatalogProtocol } from '../src/data/catalog'

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else console.log(`ok  : ${msg}`)
}

/* ---- 1 + 2: the one file a listener may hear ---------------------------- */
const P = (urls: Record<string, string>) => ({ versions: [{ duration: 12 as const, audioUrl: urls }] }) as never
assert(audioPick(P({ 'pt-BR:f': 'pt-f' }), 12, 'it', 'f') === undefined, 'Italian woman, only Portuguese exists: nothing — never another language')
assert(audioPick(P({ it: 'it-m' }), 12, 'it', 'f') === undefined, 'Italian woman, only the Italian male file: nothing — never the other form')
assert(audioPick(P({ 'it:f': 'it-f' }), 12, 'it', 'm') === undefined, 'Italian man, only the female file: nothing')
assert(audioPick(P({ it: 'it-m', 'it:f': 'it-f' }), 12, 'it', 'f')?.url === 'it-f', 'Italian woman: the Italian female file')
assert(audioPick(P({ 'pt-BR': 'pt-m', 'pt-BR:f': 'pt-f' }), 12, 'pt-BR', 'm')?.url === 'pt-m', 'Brazilian man: the Portuguese male file')
assert(audioPick(P({ 'pt-BR': 'pt-m', 'pt-BR:f': 'pt-f' }), 12, 'en', 'f') === undefined, 'English reader: nothing until English is voiced')

/* ---- durations per listener ---------------------------------------------- */
const proto = (code: string, files: Record<number, Record<string, string>>, extra: Partial<CatalogProtocol> = {}): CatalogProtocol => ({
  code, family: 'X', title: code, phases: [], enabled: true, source: 'imported', tenants: 'all', audioReady: true, updatedAt: 0,
  versions: Object.entries(files).map(([d, audioUrl]) => ({ duration: Number(d), audioUrl })) as never,
  ...extra,
}) as CatalogProtocol
{
  const p = proto('D', { 6: { it: 'a', 'it:f': 'b' }, 12: { 'pt-BR:f': 'c' }, 24: { it: 'd' } })
  assert(playableDurations(p, { locale: 'it', to: 'f' }).join() === '6', 'Italian woman sees 6 only: 12 is Portuguese, 24 is male')
  assert(playableDurations(p, { locale: 'it', to: 'm' }).join() === '6,24', 'Italian man sees 6 and 24')
  assert(playableDurations(p, { locale: 'pt-BR', to: 'f' }).join() === '12', 'Brazilian woman sees 12 only')
  assert(playableDurations(p, { locale: 'pt-BR', to: 'm' }).length === 0, 'Brazilian man: nothing to offer')
  assert(playableDurations(p).join() === '6,12,24', 'a surface with no listener (the therapist workspace) sees every rendered duration')
}

/* ---- 3: clinical is never chosen alone --------------------------------------- */
{
  const spine = SELF_USE_SESSIONS.slice(0, 3).map((s) => s.protocolCode)
  const files = { 12: { 'pt-BR:f': 'x', 'pt-BR': 'y' } }
  const catalog = [
    proto(spine[0], files, { tier: 'green' }),
    proto(spine[1], files, { tier: 'amber' }),                  // labelled "Clinico" in the console
    proto(spine[2], files),
    proto(CLINICAL_ONLY_CODES[0], files, { audience: 'clinical' } as never),
  ]
  const sessions = resolveSessions(catalog, 'pt-BR', { locale: 'pt-BR', to: 'f' })
  const browse = browsableSessions(sessions).map((s) => s.protocolCode)
  assert(browse.includes(spine[0]) && browse.includes(spine[2]), 'non-clinical sessions are in the library')
  assert(!browse.includes(spine[1]), 'a "Clinico" protocol is NOT in the library, search, shelves or pathways')
  assert(!browse.includes(CLINICAL_ONLY_CODES[0]), 'a clinical-only protocol is not in the library')
  assert(playableSessions(sessions).some((s) => s.protocolCode === spine[1]), '…but it can still be played when a therapist prescribes it')
  const clinical = resolveClinical(catalog, 'pt-BR', sessions)
  const rx = prescribableEntries(clinical, sessions).map((c) => c.code)
  assert(rx.includes(spine[1]), 'a therapist can prescribe a "Clinico" protocol as homework')
  assert(!rx.includes(CLINICAL_ONLY_CODES[0]), 'the six clinical-only stay inside a led session, never homework')
}

console.log(process.exitCode ? '\nFAILED' : '\ndone.')
