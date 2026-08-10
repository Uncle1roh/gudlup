/* Node proof for the Aug. 2026 PO bug round (no workbook needed — the timeline
   is built in code):
     §1 whisper speed: loop AND ostinato rows carry velocita_wpm; a sussurrato
        row without the column gets the whisper baseline, not ×1.00
     §2 the ostinato tail really SLOWS DOWN (speed divided, not multiplied) and
        its fragment window is wide enough to hold a whispered fragment
     §3 music never repeats while its phase pool still has an unused file;
        when the pool is exhausted the reuse is least-used and never immediate
   Run:
     node_modules/.bin/esbuild tools/test-whisper-draws.ts --bundle --platform=node \
       --outfile=$TEMP/twd.cjs && node $TEMP/twd.cjs
*/
import { buildAssetPools, drawMusic, mulberry32, newDrawLedger } from '../src/admin/assetPools'
import { plainToStudioTracks } from '../src/admin/plainStudio'
import type { AudioAsset } from '../src/admin/assets'
import type { PlainAffirmation, PlainClip, PlainTimeline, PlainVersion } from '../src/admin/plainTimeline'
import type { SampleParams, VoiceParams } from '../src/studio/multitrack'

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else console.log(`ok  : ${msg}`)
}
const close = (a: number, b: number, eps = 0.005) => Math.abs(a - b) <= eps

/* ------------------------------------------------------------ fixtures ---- */

const clip = (c: Partial<PlainClip> & Pick<PlainClip, 'clipId' | 'traccia' | 'tipo' | 'startS' | 'endS'>): PlainClip => ({
  faseRaw: '1', faseFrom: 1, faseTo: 1, durataS: c.endS - c.startS,
  volumeDb: null, volumeLufs: -16, fadeInS: 0, fadeOutS: 0, crossfadePrecS: null,
  ...c,
})

const aff = (id: string, testo: string): PlainAffirmation => ({
  id, testo, setRaw: 'Deep', inQuick: false, inStandard: false, inDeep: true, refrain: id.startsWith('REF'), durataS: null,
})

function timeline(clips: PlainClip[], affirmations: PlainAffirmation[]): { t: PlainTimeline; v: PlainVersion } {
  const v: PlainVersion = {
    sheet: 'Deep', versionKey: 'deep', levelMode: 'lufs', durationS: 600, durationMin: 10,
    clips, tracks: [], phases: [], declaredTotal: null, declaredDurationS: null,
  }
  return { t: { code: 'GL-TST 1.0', title: 'Test', versions: [v], affirmations, issues: [] }, v }
}

const voiceParams = (c: { params: unknown }): VoiceParams => c.params as VoiceParams

/* ---------------------------------------------------- §1 + §2 whisper speed */

function whisperSpeed(): void {
  const clips: PlainClip[] = [
    // spoken line WITH the column — the mapping that already worked
    clip({ clipId: 'VOX-1', traccia: 'VOX-1 Guida', tipo: 'voice', startS: 0, endS: 20, tipoContenuto: 'linea', testo: 'Respira.', velocitaWpm: 104 }),
    // whispered LOOP without the column — used to be dropped entirely
    clip({ clipId: 'VOX-2', traccia: 'VOX-2 Sussurro', tipo: 'voice', startS: 0, endS: 300, tipoContenuto: 'loop', modalita: 'sussurrato', setAffermazioni: 'CSI-01..02', intervalloS: 20, cicli: 1 }),
    // whispered LOOP with the column — must win over the baseline
    clip({ clipId: 'VOX-3', traccia: 'VOX-3 Sussurro wpm', tipo: 'voice', startS: 0, endS: 300, tipoContenuto: 'loop', modalita: 'sussurrato', setAffermazioni: 'CSI-01..02', intervalloS: 20, cicli: 1, velocitaWpm: 91 }),
    // whisper-ostinato: single REF, sussurrato loop
    clip({ clipId: 'VOX-4', traccia: 'VOX-4 Ostinato', tipo: 'voice', startS: 0, endS: 600, tipoContenuto: 'loop', modalita: 'sussurrato', setAffermazioni: 'REF-01' }),
  ]
  clips[1].setRange = { from: 1, to: 2, ids: ['CSI-01', 'CSI-02'] } as PlainClip['setRange']
  clips[2].setRange = { from: 1, to: 2, ids: ['CSI-01', 'CSI-02'] } as PlainClip['setRange']
  clips[3].setRange = { from: 1, to: 1, ids: ['REF-01'] } as PlainClip['setRange']

  const { t, v } = timeline(clips, [
    aff('CSI-01', 'Sono al sicuro.'),
    aff('CSI-02', 'Sono in pace.'),
    aff('REF-01', 'sono al sicuro... in pace... protetto... calmo'),
  ])
  const seed = plainToStudioTracks(t, v)
  const lane = (frag: string) => seed.tracks.find((x) => x.name.includes(frag))!

  const spoken = voiceParams(lane('VOX-1').clips[0])
  assert(close(spoken.speed ?? 1, 0.8), `linea 104 wpm → ×0.80 — got ×${(spoken.speed ?? 1).toFixed(2)}`)

  const loopNoWpm = voiceParams(lane('VOX-2').clips[0])
  assert(close(loopNoWpm.speed ?? 1, 0.846), `sussurrato loop without velocita_wpm → ×0.85 whisper baseline (was ×1.00) — got ×${(loopNoWpm.speed ?? 1).toFixed(3)}`)

  const loopWpm = voiceParams(lane('VOX-3').clips[0])
  assert(close(loopWpm.speed ?? 1, 0.7), `sussurrato loop with 91 wpm → ×0.70 (sheet wins over the baseline) — got ×${(loopWpm.speed ?? 1).toFixed(2)}`)

  /* ostinato: base + tail */
  const ost = lane('Ostinato')
  const sorted = [...ost.clips].sort((a, b) => a.startSec - b.startSec)
  assert(sorted.length > 0, `ostinato lane expanded (${sorted.length} fragment clips)`)
  const head = voiceParams(sorted[0])
  const tail = sorted.filter((c) => c.startSec >= 600 - 90).map(voiceParams)
  assert(close(head.speed ?? 1, 0.846), `ostinato fragments carry the whisper baseline ×0.85 — got ×${(head.speed ?? 1).toFixed(3)}`)
  assert(tail.length > 0 && tail.every((p) => (p.speed ?? 1) < (head.speed ?? 1)), `the tail SLOWS DOWN (×${(tail[0].speed ?? 1).toFixed(3)} < ×${(head.speed ?? 1).toFixed(3)}) — it used to keep the same rate and only widen the window`)
  assert(sorted.every((c) => c.durationSec >= 4.5), `fragment window ≥4.5 s — a whispered fragment is no longer cut at 3 s`)
  assert(sorted.every((c) => c.startSec + c.durationSec <= 600 - 0.4), `no fragment crosses the window end`)
}

/* ------------------------------------------------------------- §3 no repeat */

const A = (path: string, phase: AudioAsset['phase']): AudioAsset => ({
  path, name: path.split('/').pop()!, kind: 'music', phase, publicUrl: `https://cdn.example/${path}`,
})

function noRepeat(): void {
  const pools = buildAssetPools([
    A('assets/music/f1/a.mp3', 'f1'),
    A('assets/music/f1/b.mp3', 'f1'),
    A('assets/music/f1/c.mp3', 'f1'),
  ])

  // without a ledger the old behaviour is intact (independent draws)
  const plain = mulberry32(3)
  const loose = [0, 1, 2, 3].map(() => drawMusic(pools, 1, plain)!.asset.name)
  assert(loose.length === 4, `unledgered draws still work (${loose.join(', ')})`)

  // with a ledger: the 3-file pool is exhausted before anything comes back
  const rnd = mulberry32(3)
  const ledger = newDrawLedger()
  const drawn = [0, 1, 2, 3, 4, 5].map(() => drawMusic(pools, 1, rnd, ledger)!)
  const first3 = drawn.slice(0, 3).map((d) => d.asset.name)
  assert(new Set(first3).size === 3, `the first 3 draws use all 3 files, none twice — got ${first3.join(', ')}`)
  assert(drawn.slice(0, 3).every((d) => !/reused/.test(d.how)), `no "reused" note while the pool still had unused files`)
  assert(/reused/.test(drawn[3].how), `draw 4 reports the pool exhausted`)
  const names = drawn.map((d) => d.asset.name)
  assert(names.every((n, i) => i === 0 || n !== names[i - 1]), `never the same file twice in a row — ${names.join(' → ')}`)
  const counts = new Map<string, number>()
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1)
  assert([...counts.values()].every((c) => c === 2), `6 draws over 3 files spread evenly (2 each) — ${[...counts].map(([k, c]) => `${k}×${c}`).join(', ')}`)

  /* end to end: a protocol whose F1 lane has 3 music clips draws 3 files */
  const clips: PlainClip[] = [0, 1, 2].map((i) => clip({
    clipId: `MUS-${i}`, traccia: 'MUS-1 Musica', tipo: 'music', startS: i * 60, endS: (i + 1) * 60,
  }))
  const { t, v } = timeline(clips, [])
  const seed = plainToStudioTracks(t, v, { pools, seed: 99 })
  const urls = seed.tracks[0].clips.map((c) => (c.params as SampleParams).url)
  assert(new Set(urls).size === 3, `a 3-clip music lane drew 3 DIFFERENT files — got ${urls.map((u) => u.split('/').pop()).join(', ')}`)
}

whisperSpeed()
noRepeat()

if (process.exitCode) { console.error('\nTEST FAILED'); process.exit(1) }
console.log('\nALL PASS')
