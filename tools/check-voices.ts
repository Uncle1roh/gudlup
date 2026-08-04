/* Node proof for the ElevenLabs voice sync: calls the real /v1/voices with the
   configured key, runs the SAME mapping the app uses, and prints the catalog
   the app would build (archetype grouping + the resolved defaults).

   Run:  npx tsx tools/check-voices.ts [api-key]
   With no argument it reads VITE_ELEVENLABS_API_KEY from .env.local.

   Use this to answer "why can't the Studio see the PO's new voice?" in ten
   seconds: if a voice is absent here, the key belongs to another workspace. */

import { readFileSync } from 'node:fs'
import { ARCHETYPES, ARCHETYPE_OVERRIDES, inferArchetype, registerVoices, defaultPrimary, defaultSecondary, voicesByArchetype, type CatalogVoice } from '../src/tts/voiceCatalog'

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

interface ApiVoice { voice_id: string; name?: string; category?: string; labels?: Record<string, string> }

const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } })
if (!res.ok) {
  console.error(`FAIL: ElevenLabs ${res.status} — ${(await res.text()).slice(0, 200)}`)
  process.exit(1)
}

const body = (await res.json()) as { voices?: ApiVoice[] }
const raw = body.voices ?? []

const voices: CatalogVoice[] = raw.map((v) => {
  const labels = v.labels ?? {}
  const name = (v.name ?? v.voice_id).trim()
  const gender: 'F' | 'M' = /female|woman/i.test(labels.gender ?? '') ? 'F' : /male|man/i.test(labels.gender ?? '') ? 'M' : 'F'
  return {
    id: v.voice_id,
    name: name.split(/\s+[-–—]\s+/)[0].trim() || name,
    gender,
    archetype: ARCHETYPE_OVERRIDES[v.voice_id] ?? inferArchetype(name, labels, gender),
    category: v.category,
    language: labels.language,
  }
})
registerVoices(voices)

const own = voices.filter((v) => v.category !== 'premade')
console.log(`voices on this key : ${voices.length}  (${own.length} owned by the workspace, ${voices.length - own.length} stock)`)
console.log(`default [F] primary: ${defaultPrimary().name}  ${defaultPrimary().id}`)
console.log(`default [M] second : ${defaultSecondary().name}  ${defaultSecondary().id}`)
console.log()

for (const a of ARCHETYPES) {
  const list = voicesByArchetype(a.id)
  if (!list.length) continue
  console.log(`${a.label} (${list.length})`)
  for (const v of list) {
    const own = v.category !== 'premade' ? '*' : ' '
    console.log(`  ${own} ${v.name.padEnd(22)} ${v.gender}  ${v.id}  ${v.category ?? ''}${v.language ? ` · ${v.language}` : ''}`)
  }
}
console.log('\n* = this workspace\'s own voice (generated / cloned / library-added)')
