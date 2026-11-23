/* The two Good Loop ElevenLabs accounts (src/tts/voiceAccounts.ts): the
   registry is complete and unambiguous, a saved id follows its twin into the
   account connected now, and the POs' "BRA - MALE - RITUAL" names parse.

   Run: npx esbuild tools/test-voice-accounts.ts --bundle --platform=node \
          --format=cjs --define:import.meta.env='{}' --outfile=<tmp>/tva.cjs && node <tmp>/tva.cjs
   No key appears here: the fingerprint is checked on the SHA-256 test vector. */

import {
  ACTIVE_ACCOUNT_ID, VOICE_ACCOUNTS, activeAccount, keyFingerprint, registrySlot, selectableAccounts,
} from '../src/tts/voiceAccounts'
import {
  accountCatalog, registerVoices, resolveVoiceId, parseVoiceName,
  defaultPrimary, defaultSecondary, counterpartVoice, voiceLangOf, VOICE_CATALOG,
} from '../src/tts/voiceCatalog'
import { syncVoices } from '../src/tts/voiceSync'

let pass = 0
let fail = 0
function ok(cond: unknown, label: string): void {
  if (cond) { pass++; console.log(`ok  : ${label}`) } else { fail++; console.log(`FAIL: ${label}`) }
}

async function main(): Promise<void> {
  // fingerprint = first 24 hex of SHA-256; FIPS 180-2 vector for "abc"
  ok((await keyFingerprint('abc')) === 'ba7816bf8f01cfea414140de', 'fingerprint is SHA-256, first 24 hex')
  ok((await keyFingerprint('  abc ')) === 'ba7816bf8f01cfea414140de', 'a key pasted with spaces is the same key')

  const [mattia, giovanni] = VOICE_ACCOUNTS

  /* ONE account speaks. The engine was found on a personal ElevenLabs
     workspace, so this is a constant in the code, not a preference. */
  ok(ACTIVE_ACCOUNT_ID === 'giovanni', 'the active account is Giovanni')
  ok(activeAccount().label === 'goodloop — Giovanni Bartegno', `activeAccount() = ${activeAccount().label}`)
  ok(activeAccount() === giovanni && !giovanni.legacy, 'the active account is not legacy')
  ok(mattia.legacy === true, 'Mattia is legacy: in the registry, never connected')
  const sel = selectableAccounts()
  ok(sel.length === 1 && sel[0] === giovanni, `the panel may offer exactly one account (${sel.map((a) => a.id).join(', ')})`)

  /* Before any sync the catalog IS the seed, and a render would use it: its
     ids have to be the active account's, not the legacy one's. */
  ok(VOICE_CATALOG.length === 2 && VOICE_CATALOG.every((v) => giovanni.voices.some((w) => w.id === v.id)),
    'the bootstrap catalog is the active account’s own voices')
  ok(defaultPrimary().id === 'D0zGXCB1jW8c5sN9iDPp' && defaultSecondary().id === '5QUQJ5kO3rFLoQn19xKw',
    'the defaults before the first sync are Giovanni ITA maternal + paternal')

  for (const a of VOICE_ACCOUNTS) {
    const cat = accountCatalog(a)
    ok(cat.length === 22, `${a.id}: 22 voices`)
    ok(new Set(cat.map((v) => v.id)).size === 22, `${a.id}: no id twice`)
    const slots = new Set(cat.map((v) => `${voiceLangOf(v)}|${v.gender}|${v.archetype}`))
    ok(slots.size === 22, `${a.id}: every slot (language · gender · archetype) is filled once`)
    ok(cat.filter((v) => voiceLangOf(v) === 'it').length === 11 && cat.filter((v) => voiceLangOf(v) === 'pt-BR').length === 11, `${a.id}: 11 ITA + 11 BRA`)
    ok(cat.filter((v) => v.gender === 'F').length === 6, `${a.id}: the 6 female voices are female (maternal, ASMR, child × 2 languages)`)
    ok(new Set(cat.map((v) => `${v.name}|${voiceLangOf(v)}`)).size === 22, `${a.id}: no two voices share a name in one language`)
  }
  ok(!mattia.voices.some((v) => giovanni.voices.some((w) => w.id === v.id)), 'the two accounts share no id')

  // Giovanni connected: every Mattia id resolves to its exact twin
  registerVoices(accountCatalog(giovanni))
  let twins = 0
  for (const v of mattia.voices) {
    const r = resolveVoiceId(v.id)
    const want = giovanni.voices.find((w) => w.language === v.language && w.gender === v.gender && w.archetype === v.archetype)
    if (r.voice?.id === want?.id && r.remappedFrom) twins++
  }
  ok(twins === 22, `all 22 Mattia ids follow to Giovanni's twin (${twins}/22)`)
  ok(resolveVoiceId('D0zGXCB1jW8c5sN9iDPp').voice?.id === 'D0zGXCB1jW8c5sN9iDPp', 'a connected id resolves to itself')
  ok(registrySlot('aYBXyupCnZqrSVuPsR5i')?.archetype === 'maternal', 'registrySlot reads an id of either account')

  // defaults within a language, on the connected account
  ok(defaultPrimary('it').id === 'D0zGXCB1jW8c5sN9iDPp', 'default primary IT = Giovanni ITA maternal')
  ok(defaultPrimary('pt-BR').id === 'SFRn2I758mcELCWQJNVP', 'default primary PT = Giovanni BRA maternal')
  ok(defaultSecondary('it').id === '5QUQJ5kO3rFLoQn19xKw', 'default secondary IT = Giovanni ITA paternal')
  ok(defaultSecondary('pt-BR').id === '4Krxg1yOB5BADklSoABl', 'default secondary PT = Giovanni BRA paternal')
  ok(counterpartVoice({ archetype: 'whisper', gender: 'M' }, 'pt-BR').id === 'AxeDqIUOBuQ4iIK8Y7vx', 'the Portuguese counterpart of ASMR (M) is BRA ASMR (M)')

  // Mattia connected: the other way round
  registerVoices(accountCatalog(mattia))
  ok(resolveVoiceId('h0DmKj0V07XbagTwk7R7').voice?.id === 'smo2FZxpDzhClRoz96Ai', 'a Giovanni id follows back to Mattia')

  // the POs' names, for accounts not in the registry
  const r = parseVoiceName('BRA - MALE - RITUAL')
  ok(r.language === 'pt-BR' && r.gender === 'M' && r.archetype === 'ritual' && r.name === 'Ritual (M)', `"BRA - MALE - RITUAL" → ${JSON.stringify(r)}`)
  const f = parseVoiceName('ITA - FEMALE - MATERNAL ')
  ok(f.language === 'it' && f.gender === 'F' && f.archetype === 'maternal', '"ITA - FEMALE - MATERNAL " parses (trailing space)')
  const mn = parseVoiceName('ITA - MALE - MENTOR')
  ok(mn.archetype === 'wise' && mn.gender === 'M', 'MENTOR is the wise archetype')
  const asmr = parseVoiceName('BRA - FEMALE - ASMR')
  ok(asmr.archetype === 'whisper' && asmr.gender === 'F' && asmr.name === 'ASMR (F)', 'ASMR (F)')
  const old = parseVoiceName('[ok] MATERNAL - ITA')
  ok(old.approved && old.archetype === 'maternal' && old.language === 'it' && old.name === 'Maternal', 'the older "[ok] MATERNAL - ITA" form still parses')
  const oldM = parseVoiceName('[ok] ASMR (M) - ITA')
  ok(oldM.archetype === 'whisper' && oldM.gender === 'M', 'the older "ASMR (M) - ITA" form still parses')

  /* A key that is not the active account's installs the ACTIVE catalog and is
     reported as wrong — it does NOT get to put its own workspace's voices in
     the pickers, which is what left the engine on a personal account. No
     network: nothing here reads /v1/voices any more. */
  const store = new Map<string, string>()
  ;(globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
  }
  ;(globalThis as unknown as { fetch: unknown }).fetch = () => {
    throw new Error('syncVoices must not call the network')
  }
  const out = await syncVoices({ apiKey: 'a-key-of-somebody-else' })
  ok(out.source === 'registry' && out.account === activeAccount().label, 'a foreign key gets the active account’s voices')
  ok(!!out.error && out.error.includes('Giovanni Bartegno'), `and is reported as the wrong key: ${out.error ?? '(no error)'}`)
  ok(VOICE_CATALOG.length === 22 && VOICE_CATALOG.every((v) => giovanni.voices.some((w) => w.id === v.id)),
    'no voice of another workspace enters the catalog')

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
}

void main()
