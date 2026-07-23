/* Node proof for slice 3: asset pools + random draw + duck envelope + the
   pools-integrated Studio seed against the real GL-ANX 1.1 workbook. Run:
     node_modules/.bin/esbuild tools/test-plain-pools.ts --bundle --platform=node \
       --outfile=/tmp/tpp.cjs && node /tmp/tpp.cjs <file>
*/
import { readFileSync } from 'node:fs'
import { buildAssetPools, drawMusic, drawSoundscape, mulberry32, normalizeTags } from '../src/admin/assetPools'
import { buildDuckEnvelope, mergeWindows } from '../src/admin/renderPlain'
import { parsePlainTimeline } from '../src/admin/plainTimeline'
import { plainToStudioTracks } from '../src/admin/plainStudio'
import type { AudioAsset } from '../src/admin/assets'
import type { SampleParams } from '../src/studio/multitrack'

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else console.log(`ok  : ${msg}`)
}
const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps

/* ---- a fake library shaped like the real bucket layout ---- */
const A = (path: string, kind: AudioAsset['kind'], extra: Partial<AudioAsset> = {}): AudioAsset => ({
  path, name: path.split('/').pop()!, kind, publicUrl: `https://cdn.example/${path}`, ...extra,
})
const assets: AudioAsset[] = [
  A('assets/music/f1/dawn-pad.mp3', 'music', { phase: 'f1' }),
  A('assets/music/f1/mist.mp3', 'music', { phase: 'f1' }),
  A('assets/music/f3/lift.mp3', 'music', { phase: 'f3' }),
  A('assets/soundscape/lake/calm-01.mp3', 'soundscape', { texture: 'lake' }),
  A('assets/soundscape/lake/calm-02.mp3', 'soundscape', { texture: 'lake' }),
  A('assets/soundscape/wind/soft-01.mp3', 'soundscape', { texture: 'wind' }),
  A('assets/soundscape/fire/hearth.mp3', 'soundscape', { texture: 'fire' }),
  A('assets/soundscape/rain/steady.mp3', 'soundscape', { texture: 'rain' }),
  A('assets/heartbeat/hb-60bpm.mp3', 'heartbeat'),
]

async function main() {
  /* ---- tags ---- */
  assert(normalizeTags('lago calmo').includes('lake'), `"lago calmo" → lake`)
  assert(normalizeTags('vento leggero').includes('wind'), `"vento leggero" → wind`)
  assert(normalizeTags('heartbeat 60 BPM').includes('heartbeat'), `"heartbeat 60 BPM" → heartbeat`)
  assert(normalizeTags('pioggia').includes('rain') && normalizeTags('fuoco').includes('fire'), `pioggia/fuoco → rain/fire`)

  /* ---- pools + draws ---- */
  const pools = buildAssetPools(assets, [{ path: 'assets/soundscape/rain/steady.mp3', tags: ['temporale', 'fabbrica'] }])
  assert((pools.musicByPhase.f1 ?? []).length === 2 && (pools.musicByPhase.f3 ?? []).length === 1, `music pools f1×2, f3×1`)
  assert(pools.heartbeat.length === 1 && pools.soundscapes.length === 5, `1 heartbeat, 5 soundscapes`)

  const rnd = mulberry32(42)
  const lake = drawSoundscape(pools, 'lago calmo', rnd)!
  assert(lake.asset.texture === 'lake', `"lago calmo" draws a lake file (${lake.asset.name}; ${lake.how})`)
  const wind = drawSoundscape(pools, 'vento leggero', rnd)!
  assert(wind.asset.texture === 'wind', `"vento leggero" draws the wind file`)
  const hb = drawSoundscape(pools, 'heartbeat 60 BPM', rnd)!
  assert(hb.asset.kind === 'heartbeat', `heartbeat ambiente → heartbeat pool (Dec. H)`)
  const viaMeta = drawSoundscape(pools, 'fabbrica', rnd)!
  assert(viaMeta.asset.path.includes('rain/steady'), `asset_meta tag "fabbrica" reaches the rain file`)
  const m3 = drawMusic(pools, 3, rnd)!
  assert(m3.asset.phase === 'f3', `fase 3 draws from the f3 pool`)
  assert(drawMusic(pools, 5, rnd) === null, `empty f5 pool → null (silent + note)`)

  // reproducibility: same seed → same draw sequence
  const seq = (seed: number) => {
    const r = mulberry32(seed)
    return [drawSoundscape(pools, 'lago', r)!.asset.name, drawMusic(pools, 1, r)!.asset.name, drawSoundscape(pools, 'lago', r)!.asset.name].join('|')
  }
  assert(seq(7) === seq(7), `seeded draws are reproducible`)
  assert(seq(7) !== seq(8) || seq(9) !== seq(10), `different seeds vary`)

  /* ---- duck envelope ---- */
  const merged = mergeWindows([{ start: 10, end: 15 }, { start: 14, end: 20 }, { start: 30, end: 31 }])
  assert(merged.length === 2 && merged[0].end === 20, `overlapping voice windows merge (10–20, 30–31)`)
  const env = buildDuckEnvelope([{ start: 10, end: 20 }], -10, 720)
  const mul = Math.pow(10, -10 / 20)
  assert(close(env[0].mul, 1) && env[0].timeSec === 0, `envelope starts at 1`)
  const at = (t: number) => env.find((p) => close(p.timeSec, t))
  assert(close(at(10)!.mul, 1) && close(at(10.2)!.mul, mul), `attack: 1 → −10 dB over 10.0–10.2 s`)
  assert(close(at(20)!.mul, mul) && close(at(20.5)!.mul, 1), `release: −10 dB → 1 over 20.0–20.5 s`)

  /* ---- pools-integrated seed on the real workbook ---- */
  const buf = readFileSync(process.argv[2])
  const res = await parsePlainTimeline(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
  const t = res.timeline!
  const v = t.versions[0]
  const seed = plainToStudioTracks(t, v, { pools, seed: 1234 })

  const ss1 = seed.tracks.find((x) => x.name === 'SS-1 Lago')!
  assert(ss1.duck === 'soundscape', `SS-1 duck family = soundscape`)
  assert(ss1.clips.every((c) => (c.params as SampleParams).url.includes('soundscape/lake')), `SS-1 clips drew lake files`)
  const mus = seed.tracks.find((x) => x.name === 'MUS-1 Musica')!
  assert(mus.duck === 'music', `MUS-1 duck family = music`)
  const musUrls = mus.clips.map((c) => (c.params as SampleParams).url)
  assert(musUrls[0].includes('music/f1') && musUrls[2].includes('music/f3'), `MUS clips drew from their phase pools (F1, F3)`)
  assert(musUrls.filter((u) => u === '').length === 4, `phases without pool files (F2, F4–F6) stay silent — 4 empty`)
  const voiceLanes = seed.tracks.filter((x) => x.type === 'voice')
  assert(voiceLanes.every((x) => x.duck === undefined || x.duck === 'none'), `voice lanes never carry a duck family`)
  const sameSeed = plainToStudioTracks(t, v, { pools, seed: 1234 })
  const urls = (s: typeof seed) => s.tracks.flatMap((x) => x.clips.map((c) => (c.params as SampleParams).url ?? ''))
  assert(JSON.stringify(urls(seed)) === JSON.stringify(urls(sameSeed)), `same seed → identical draws across the whole session`)

  const drawNotes = seed.notes.filter((n) => /drew "/.test(n))
  console.log(`\nDraw notes (${drawNotes.length}):`)
  for (const n of drawNotes) console.log('  ·', n)

  if (process.exitCode) { console.error('\nTEST FAILED'); process.exit(1) }
  console.log('\nALL PASS')
}

void main()
