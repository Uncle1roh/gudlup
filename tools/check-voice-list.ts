/* What the live ElevenLabs account actually exposes, and what the app's
   selection rule makes of it.

   Written for the report "all old ElevenLabs voices are back". The catalog is
   LIVE (voiceSync.ts): the picker is whatever /v1/voices returns, narrowed by
   selectCatalogVoices() to "My Voices" and then to the POs' "[ok]" marker. So
   the list can change with nothing changing in this repo — a plan upgrade
   restores voice slots, and voices the account had stopped exposing come back.

   This is a READ-ONLY listing call. It costs no characters and renders no
   audio. The key is passed as argv so it is never committed.

   Run: npx esbuild tools/check-voice-list.ts --bundle --platform=node \
          --format=esm --outfile=<tmp>/cvl.mjs && node <tmp>/cvl.mjs <API_KEY> */

import { selectCatalogVoices, isMyVoice, toCatalogVoice, type ApiVoice } from '../src/tts/voiceSync'

const key = process.argv[2]
if (!key) { console.error('usage: node cvl.mjs <ELEVENLABS_API_KEY>'); process.exit(1) }
const headers = { 'xi-api-key': key, Accept: 'application/json' }

const sub = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers })
  .then((r) => (r.ok ? r.json() : null))
  .catch(() => null) as { tier?: string; voice_slots_used?: number; voice_limit?: number; professional_voice_limit?: number } | null

const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers })
if (!res.ok) { console.error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`); process.exit(1) }
const all = ((await res.json()) as { voices?: ApiVoice[] }).voices ?? []

const mine = all.filter(isMyVoice)
const mapped = mine.map(toCatalogVoice)
const approved = mapped.filter((v) => v.approved)
const chosen = selectCatalogVoices(all)

console.log('=== account ===')
console.log(`tier                : ${sub?.tier ?? '—'}`)
console.log(`voice slots used    : ${sub?.voice_slots_used ?? '—'} / ${sub?.voice_limit ?? '—'}`)
console.log()
console.log('=== what /v1/voices returns ===')
console.log(`total voices        : ${all.length}`)
console.log(`  premade (stock)   : ${all.length - mine.length}   (always excluded)`)
console.log(`  "My Voices"       : ${mine.length}`)
console.log(`  carrying "[ok]"   : ${approved.length}`)
console.log()
console.log(`=== the picker shows ${chosen.length} voice(s) ===`)
console.log(approved.length
  ? '(the "[ok]" filter is ACTIVE — these are the marked ones)'
  : '(NO voice carries "[ok]", so the filter fell back to every "My Voice" — this is the fallback, not the selection)')
console.log()
for (const v of chosen) {
  console.log(`  ${v.approved ? '[ok]' : '    '} ${v.gender}  ${v.archetype.padEnd(9)}  ${v.name.padEnd(34)}  ${v.id}  ${v.category ?? ''}`)
}

const unmarked = mapped.filter((v) => !v.approved)
if (unmarked.length) {
  console.log()
  console.log(`=== ${unmarked.length} "My Voice(s)" WITHOUT "[ok]" (hidden while any [ok] exists) ===`)
  for (const v of unmarked) console.log(`       ${v.gender}  ${v.archetype.padEnd(9)}  ${v.name.padEnd(34)}  ${v.id}  ${v.category ?? ''}`)
}
