/* Node proof for the ElevenLabs voice sync: calls the real /v1/voices with the
   configured key, runs the SAME mapping the app uses, and prints the catalog
   the app would build (archetype grouping + the resolved defaults).

   Run:  npx tsx tools/check-voices.ts [api-key]
   With no argument it reads VITE_ELEVENLABS_API_KEY from .env.local.

   Use this to answer "why can't the Studio see the PO's new voice?" in ten
   seconds: if a voice is absent here, the key belongs to another workspace. */

import { readFileSync } from 'node:fs'
import { ARCHETYPES, registerVoices, defaultPrimary, defaultSecondary, voicesByArchetype } from '../src/tts/voiceCatalog'
import { isMyVoice, selectCatalogVoices, type ApiVoice } from '../src/tts/voiceSync'

function keyFromEnvFile(): string | undefined {
  try {
    const txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    return /^VITE_ELEVENLABS_API_KEY=(.+)$/m.exec(txt)?.[1]?.trim().replace(/^"|"$/g, '')
  } catch {
    return undefined
  }
}

const key = process.argv[2] ?? keyFromEnvFile()
if (!key) {
  console.error('No API key. Pass one as an argument or set VITE_ELEVENLABS_API_KEY in .env.local.')
  process.exit(1)
}

const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } })
if (!res.ok) {
  console.error(`FAIL: ElevenLabs ${res.status} — ${(await res.text()).slice(0, 200)}`)
  process.exit(1)
}

const body = (await res.json()) as { voices?: ApiVoice[] }
const raw = body.voices ?? []
const mine = raw.filter(isMyVoice)
const voices = selectCatalogVoices(raw)
registerVoices(voices)

console.log(`on this key        : ${raw.length} voices — ${mine.length} in "My Voices", ${raw.length - mine.length} stock`)
console.log(`shown in the app   : ${voices.length} (PO-approved "[ok]" only)`)
console.log(`default [F] primary: ${defaultPrimary().name}  ${defaultPrimary().id}`)
console.log(`default [M] second : ${defaultSecondary().name}  ${defaultSecondary().id}`)
console.log()

for (const a of ARCHETYPES) {
  const list = voicesByArchetype(a.id)
  if (!list.length) {
    console.log(`${a.label} — EMPTY`)
    continue
  }
  console.log(`${a.label} (${list.length})`)
  for (const v of list) {
    console.log(`  ${v.approved ? '✓' : ' '} ${v.name.padEnd(20)} ${v.gender}  ${v.id}  ${v.category ?? ''}${v.language ? ` · ${v.language}` : ''}`)
  }
}
console.log('\n✓ = carries the POs\' [ok] approval marker')
