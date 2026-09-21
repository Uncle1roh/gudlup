/* ============================================================================
   A voice survives a change of ElevenLabs account

   Voice ids belong to the account that made them. Rotate the key and every id
   saved in a protocol points nowhere: the Studio said "non in questo account"
   on every clip and nothing would synthesize.

   The PO naming convention ("[ok] ASMR (M) - ITA") carries the identity that
   does survive — the archetype — so a saved id resolves to the same archetype
   in whichever account is connected now. This asserts that rule, including
   that the ORIGINAL id is never rewritten, so going back to the old key brings
   back the exact voice.

       npx esbuild tools/test-voice-remap.ts --bundle --platform=node \
         --format=esm --outfile=<tmp>/vr.mjs && node <tmp>/vr.mjs
   ============================================================================ */

/* localStorage stands in for the browser's — the ledger lives there. */
const store = new Map<string, string>()
;(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) },
}

import { knownVoice, registerVoices, resolveVoiceId, type CatalogVoice } from '../src/tts/voiceCatalog'

let pass = 0
const fails: string[] = []
function assert(cond: boolean, what: string): void {
  if (cond) { pass += 1; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

const v = (id: string, name: string, archetype: string, gender: 'F' | 'M'): CatalogVoice =>
  ({ id, name, archetype, gender, approved: true } as CatalogVoice)

/* ---------------------------------------------------- the original account */
console.log('\n--- the account the protocols were authored against ---')
const OLD = [
  v('old-maternal', 'Maternal', 'maternal', 'F'),
  v('old-paternal', 'Paternal', 'paternal', 'M'),
  v('old-asmr-m', 'ASMR (M)', 'whisper', 'M'),
  v('old-asmr-f', 'ASMR (F)', 'whisper', 'F'),
]
registerVoices(OLD)
assert(resolveVoiceId('old-asmr-m').voice?.id === 'old-asmr-m', 'an id from the connected account resolves to itself')
assert(!resolveVoiceId('old-asmr-m').remappedFrom, 'and is not reported as a remap')
assert(knownVoice('old-asmr-m')?.archetype === 'whisper', 'the ledger recorded what the voice IS')

/* ------------------------------------------------------- the key is rotated */
console.log('\n--- a new key: a different account, the same convention ---')
const NEW = [
  v('new-maternal', 'Maternal', 'maternal', 'F'),
  v('new-asmr-m', 'ASMR (M)', 'whisper', 'M'),
  v('new-wise', 'Wise', 'wise', 'F'),
]
registerVoices(NEW)

const asmr = resolveVoiceId('old-asmr-m')
assert(asmr.voice?.id === 'new-asmr-m', 'a saved whisper id is served by the whisper voice of the new account')
assert(asmr.remappedFrom?.name === 'ASMR (M)', 'and it says which voice it stood in for')

const asmrF = resolveVoiceId('old-asmr-f')
assert(asmrF.voice?.id === 'new-asmr-m', 'the F whisper falls back to the archetype when no F whisper exists')
assert(asmrF.remappedFrom?.name === 'ASMR (F)', 'still naming the voice it replaces')

assert(resolveVoiceId('old-maternal').voice?.id === 'new-maternal', 'maternal follows maternal')
assert(resolveVoiceId('old-paternal').voice === undefined, 'a paternal id finds NOTHING when the new account has no paternal voice')
assert(resolveVoiceId('old-paternal').remappedFrom === undefined, 'and is not passed off as a remap — the operator must choose')

assert(resolveVoiceId('never-seen-anywhere').voice === undefined, 'an id this browser never saw stays unresolved')
assert(resolveVoiceId(undefined).voice === undefined, 'no id, no voice')
assert(resolveVoiceId('').voice === undefined, 'an empty id means "the default", not a lookup')

/* ------------------------------------------------------- back to the old key */
console.log('\n--- the old key comes back ---')
registerVoices(OLD)
assert(resolveVoiceId('old-asmr-m').voice?.id === 'old-asmr-m', 'the exact voice is back — nothing was rewritten')
assert(!resolveVoiceId('old-asmr-m').remappedFrom, 'and it is no longer a stand-in')
assert(knownVoice('new-wise')?.archetype === 'wise', 'the ledger kept the other account too, so a second rotation still resolves')

/* --------------------------- a protocol from another machine entirely ----- */
console.log('\n--- an id this browser has never seen, but the clip says what it is ---')
// authored elsewhere, under an account never synced here: the archetype saved
// on the clip is the only thing that can answer, and it does
const elsewhere = resolveVoiceId('id-from-another-machine', { archetype: 'whisper', gender: 'M' })
assert(elsewhere.voice?.id === 'old-asmr-m', 'the archetype saved on the clip resolves it without the ledger')
assert(!!elsewhere.remappedFrom, 'and it is reported as a stand-in, not as the original')
assert(resolveVoiceId('id-from-another-machine', { archetype: 'ritual' }).voice === undefined,
  'an archetype this account does not carry still resolves to nothing')

console.log(`\n${pass} passed, ${fails.length} failed`)
if (fails.length) { for (const f of fails) console.log('  -', f); throw new Error('voice remap tests failed') }
