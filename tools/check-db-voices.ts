/* Which voice ids does the DATABASE actually serve?

   Written for "I upgraded Supabase and now the voices are wrong listed". The
   voice CATALOG comes from ElevenLabs and is untouched by Supabase — but the
   published protocols stored in Supabase carry a voiceId per voice clip, and
   those rows were written by whatever the catalog was on the day they were
   published. A database that starts serving real rows again (an un-paused
   project) therefore starts serving OLD voice ids, and the Studio shows them.

   Read-only. Uses the anon key, so it sees exactly what the app's clients see.

   Run: npx esbuild tools/check-db-voices.ts --bundle --platform=node \
          --format=esm --outfile=<tmp>/cdv.mjs && node <tmp>/cdv.mjs <URL> <ANON_KEY> */

const url = process.argv[2]
const anon = process.argv[3]
if (!url || !anon) { console.error('usage: node cdv.mjs <SUPABASE_URL> <ANON_KEY>'); process.exit(1) }

const headers = { apikey: anon, Authorization: `Bearer ${anon}`, Accept: 'application/json' }

async function get(path: string): Promise<unknown> {
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${path}`, { headers })
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`)
  return res.json()
}

/** Every "voiceId": "..." anywhere in a row, however deep the jsonb goes. */
function harvest(node: unknown, into: Map<string, number>): void {
  if (Array.isArray(node)) { for (const n of node) harvest(n, into); return }
  if (!node || typeof node !== 'object') return
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if ((k === 'voiceId' || k === 'voice_id' || k === 'voiceIdSecondary') && typeof v === 'string' && v.trim()) {
      into.set(v, (into.get(v) ?? 0) + 1)
    } else harvest(v, into)
  }
}

/* the 11 the POs marked [ok] — read live so this cannot go stale */
const elevenKey = process.argv[4]
let live = new Map<string, string>()
if (elevenKey) {
  const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': elevenKey } })
  if (r.ok) {
    const body = (await r.json()) as { voices?: { voice_id: string; name?: string }[] }
    live = new Map((body.voices ?? []).map((v) => [v.voice_id, v.name ?? v.voice_id]))
  }
}

console.log('=== protocols table ===')
let rows: Record<string, unknown>[] = []
try {
  rows = (await get('protocols?select=code,title,source,audio_ready,updated_at,versions,spec')) as Record<string, unknown>[]
} catch (e) {
  console.error(String(e))
  process.exit(1)
}
console.log(`rows served to an anon client : ${rows.length}`)
console.log()

const global = new Map<string, number>()
for (const r of rows) {
  const found = new Map<string, number>()
  harvest(r.versions, found)
  harvest(r.spec, found)
  for (const [id, n] of found) global.set(id, (global.get(id) ?? 0) + n)
  const stamp = String(r.updated_at ?? '').slice(0, 10)
  console.log(`${String(r.code).padEnd(14)} ${stamp}  source=${String(r.source).padEnd(8)} audio_ready=${String(r.audio_ready).padEnd(5)} voices=${found.size}`)
}

console.log()
console.log('=== voice ids stored in those rows ===')
if (!global.size) {
  console.log('none — no voice id is persisted in the protocol rows at all')
} else {
  let stale = 0
  for (const [id, n] of [...global.entries()].sort((a, b) => b[1] - a[1])) {
    const known = live.size ? live.get(id) : undefined
    const mark = !live.size ? '?' : known ? 'LIVE' : 'GONE'
    if (live.size && !known) stale++
    console.log(`  ${mark.padEnd(5)} ${id}  ×${n}  ${known ?? ''}`)
  }
  if (live.size) {
    console.log()
    console.log(stale
      ? `⚠ ${stale} stored voice id(s) no longer exist in the ElevenLabs account — clips referencing them fall back to the default voice.`
      : 'every stored voice id still exists in the account')
  }
}
